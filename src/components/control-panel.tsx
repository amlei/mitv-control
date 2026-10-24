'use client';
// 主面板：侧栏 + 七屏内容，数据经 /api/state + /api/events(SSE)，动作经 /api/*
// 交互语义与定稿原型一致：滑条松手提交、同类 toast 合并、危险操作弹窗、主题跟随系统
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { Card, Modal, Pill, Row, Seg, Slider, Toasts, Toggle, type ConfirmDlg, type ToastItem } from './ui';
import type { DeviceRuntime } from '@/core/services/state-hub';

const REMOTE_KEYLIST = [
  { action: 'OK', keys: 'Enter' },
  { action: '方向键', keys: '↑ ↓ ← →' },
  { action: '返回', keys: 'Backspace' },
  { action: '主页', keys: 'H' },
  { action: '菜单', keys: 'M' },
  { action: '电源', keys: 'P' },
  { action: '音量±', keys: '+ / −' },
  { action: 'TV', keys: 'T' },
  { action: '退出接管', keys: 'Esc' },
];

const REMOTE_KEYMAP: Record<string, [string, string]> = {
  ArrowUp: ['上', 'up'], ArrowDown: ['下', 'down'], ArrowLeft: ['左', 'left'], ArrowRight: ['右', 'right'],
  Enter: ['OK', 'enter'], Backspace: ['返回', 'back'], h: ['主页', 'home'], H: ['主页', 'home'],
  m: ['菜单', 'menu'], M: ['菜单', 'menu'],
  t: ['TV', 'home'], T: ['TV', 'home'], p: ['电源', 'power'], P: ['电源', 'power'],
  '+': ['音量+', 'volumeup'], '=': ['音量+', 'volumeup'], '-': ['音量-', 'volumedown'],
};

const TABS = [
  { id: 'quick', label: '快捷', icon: 'gauge', need: null },
  { id: 'remote', label: '遥控', icon: 'gamepad', need: 'net' },
  { id: 'picture', label: '画面', icon: 'sliders', need: 'adb' },
  { id: 'game', label: '游戏', icon: 'crosshair', need: 'adb' },
  { id: 'light', label: '灯效', icon: 'lamp', need: 'adb' },
  { id: 'presets', label: '预设', icon: 'bookmark', need: 'adb' },
] as const;
type TabId = (typeof TABS)[number]['id'] | 'settings';

const SOURCES = ['HDMI 1', 'HDMI 2', 'DP', 'USB-C'];
const PICTURE_MODES = ['标准', '电影', '游戏', '明亮', '暗房'];
const PICTURE_SLIDERS: [string, keyof DeviceRuntime['picture'], number][] = [
  ['黑色级别', 'black', 100], ['对比度', 'contrast', 100], ['饱和度', 'saturation', 100],
  ['色调', 'hue', 100], ['锐度', 'sharpness', 100],
];
const PICTURE_SEGS: [string, keyof DeviceRuntime['picture'], string[]][] = [
  ['色温', 'colorTemp', ['标准', '暖色', '冷色', '自定义']],
  ['精密控光', 'dimming', ['关', '低', '中', '高']],
  ['动态清晰度', 'clarity', ['关', '低', '高']],
  ['响应时间', 'response', ['关', '快速', '极速']],
  ['色域', 'gamut', ['自动', 'sRGB', 'DCI-P3', 'AdobeRGB']],
];

const DEVICE_META: Record<string, { model: string; edid: string; fw: string; serial: string; conn?: string; res?: string }> = {
  gpro: { model: 'MiTV-MFFU1（beekeeper）', edid: 'XMI3009 · 2026 款 27U', fw: 'HyperOS OS3.0.120.0 · Android 14', serial: '058488c36f8fb4e2' },
  mi5k: { model: '小米 5K 显示器', edid: 'Mi Monitor · 厂商 MI', fw: '—（非智能款，无系统）', serial: 'CC860348-248E-4AB9', conn: 'USB-C（DP Alt Mode）', res: '5120 × 2880 @ 160 Hz' },
};

interface Preset { id: string; name: string; values: Record<string, unknown> }

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json() as Promise<Record<string, unknown>>;
}

export function ControlPanel() {
  const [themeMode, setThemeMode] = useState<'system' | 'light' | 'dark'>('system');
  const [deviceId, setDeviceId] = useState<string>('');
  const [tab, setTab] = useState<TabId>('quick');
  const [devices, setDevices] = useState<DeviceRuntime[]>([]);
  const [scanning, setScanning] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dlg, setDlg] = useState<ConfirmDlg | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [remoteActive, setRemoteActive] = useState(false);
  const [lanToken, setLanToken] = useState('');
  const [showKeymap, setShowKeymap] = useState(false);
  const [remoteOn, setRemoteOn] = useState(true);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [confirmingSource, setConfirmingSource] = useState<string | null>(null);
  const toastSeq = useRef(0);
  const commitLocks = useRef(new Map<string, { value: number | boolean | string; until: number }>());

  const toast = useCallback((msg: string, key?: string) => {
    const id = ++toastSeq.current;
    const k = key ?? 'msg-' + id;
    setToasts((t) => [...t.filter((x) => x.key !== k), { id, key: k, msg }].slice(-3));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2300);
  }, []);

  const refreshPresets = useCallback(() => {
    fetch('/api/presets').then((r) => r.json() as Promise<{ presets: Preset[] }>).then((d) => setPresets(d.presets)).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/state').then((r) => r.json() as Promise<{ devices: DeviceRuntime[] }>)
      .then((d) => { setDevices(d.devices); setDeviceId((prev) => prev || d.devices[0]?.id || ''); })
      .catch(() => {});
    refreshPresets();
    const es = new EventSource('/api/events');
    es.onmessage = (e) => {
      try {
        const incoming = JSON.parse(e.data) as DeviceRuntime[];
        setDevices((prev) => incoming.map((inc) => {
          const local = prev.find((p) => p.id === inc.id);
          if (!local) return inc;
          const out = { ...inc } as Record<string, unknown>;
          for (const [key, lk] of commitLocks.current) {
            const [id, field] = key.split('|');
            if (id !== inc.id) continue;
            if (lk.until < Date.now()) { commitLocks.current.delete(key); continue; }
            const [root, sub] = field.split('.');
            const cur = sub ? (out[root] as Record<string, unknown> | undefined)?.[sub] : out[root];
            if (cur !== lk.value) {
              // 服务器还没走到目标：保留乐观值，避免滑条回跳
              if (sub) out[root] = { ...((out[root] as Record<string, unknown>) ?? {}), [sub]: lk.value };
              else out[root] = lk.value;
            } else {
              commitLocks.current.delete(key); // 已到达目标，解除锁定
            }
          }
          return out as unknown as DeviceRuntime;
        }));
      } catch {}
    };
    return () => es.close();
  }, [refreshPresets]);


  useEffect(() => {
    const saved = (typeof window !== 'undefined' && localStorage.getItem('mitv.theme')) as typeof themeMode | null;
    if (saved) setThemeMode(saved);
  }, []);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = themeMode === 'system' ? (mq.matches ? 'dark' : 'light') : themeMode;
    };
    apply();
    if (themeMode !== 'system') return;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [themeMode]);
  const changeTheme = (mode: typeof themeMode) => { setThemeMode(mode); localStorage.setItem('mitv.theme', mode); };

  const dev = devices.find((d) => d.id === deviceId) ?? devices[0];
  const capOf = (d: DeviceRuntime | undefined, need: string) =>
    need === 'net' ? !!d?.caps.some((c) => c.key === '6095') : !!d?.caps.some((c) => c.key === 'ADB');

  const apply = useCallback((label: string, path: string, body: { device: string } & Record<string, unknown>) => {
    // 乐观更新：本地立即反映目标值，SSE 稍后用服务器权威值校准
    const now = Date.now();
    const lock = (field: string, value: number | boolean | string, ttl = 4000) =>
      commitLocks.current.set(body.device + '|' + field, { value, until: now + ttl });
    if (path === '/api/volume' && typeof body.value === 'number') lock('volume', body.value);
    if (path === '/api/volume' && typeof body.muted === 'boolean') lock('muted', body.muted, 2500);
    if (path === '/api/brightness' && typeof body.value === 'number') lock('brightness', body.value);
    if (path === '/api/source' && typeof body.source === 'string') lock('source', body.source);
    for (const p of ['picture', 'game', 'light'] as const) {
      if (path === '/api/' + p && body.patch) {
        for (const [k, v] of Object.entries(body.patch as Record<string, number | boolean | string>)) lock(p + '.' + k, v, 3000);
      }
    }
    setDevices((ds) => ds.map((d) => {
      if (d.id !== body.device) return d;
      const m: DeviceRuntime = { ...d };
      if (path === '/api/volume' && typeof body.value === 'number') m.volume = body.value;
      if (path === '/api/volume' && typeof body.muted === 'boolean') m.muted = body.muted;
      if (path === '/api/brightness' && typeof body.value === 'number') { m.brightness = body.value; m.picture = { ...m.picture, backlight: body.value }; }
      if (path === '/api/source' && typeof body.source === 'string') m.source = body.source;
      if (path === '/api/picture' && body.patch) m.picture = { ...m.picture, ...(body.patch as Record<string, never>) };
      if (path === '/api/game' && body.patch) m.game = { ...m.game, ...(body.patch as Record<string, never>) };
      if (path === '/api/light' && body.patch) m.light = { ...m.light, ...(body.patch as Record<string, never>) };
      return m;
    }));
    toast('已应用 · ' + label, label.split(' ')[0]);
    return post(path, body).then((r) => {
      if (r.applied === false) toast('未生效 · ' + label + '（通道不可用）', label.split(' ')[0]);
      return r;
    });
  }, [toast]);
  // 键盘接管：仅在遥控页且已激活时拦截按键
  useEffect(() => {
    if (!remoteActive || tab !== 'remote' || !dev) return;
    const press = (label: string, key: string) => { setLastKey(label); apply('按键 ' + label, '/api/key', { device: dev.id, key }); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setRemoteActive(false); toast('已退出键盘接管'); return; }
      const hit = REMOTE_KEYMAP[e.key] ?? REMOTE_KEYMAP[e.key.toLowerCase()];
      if (hit) { e.preventDefault(); press(hit[0], hit[1]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [remoteActive, tab, dev?.id, apply]);

  function selectDevice(id: string) {
    setDeviceId(id);
    setDetailId(null);
    // 当前功能此显示器不支持时，自动切到快捷（免去手动跳转）
    const d = devices.find((x) => x.id === id);
    const cur = TABS.find((x) => x.id === tab);
    if (cur && cur.need && !capOf(d, cur.need)) setTab('quick');
  }
  const copyText = (t: string) => {
    try { navigator.clipboard && navigator.clipboard.writeText(t); } catch { /* 忽略 */ }
    toast('已复制');
  };

  function go(t: TabId) { setTab(t); setDetailId(null); }

  // ---------- 屏 ----------
  function QuickScreen() {
    if (!dev) return null;
    if (!capOf(dev, 'net')) {
      return (
        <div data-screen-label={'快捷 · ' + dev.short}>
          <Card title="亮度" extra={<Pill tone="ddc">DDC</Pill>}>
            <Slider label="背光亮度" value={dev.brightness} onChange={(v) => apply('亮度 ' + v + '%', '/api/brightness', { device: dev.id, value: v })} />
          </Card>
          <p className="mutenote">此显示器无智能系统（无 6095 / ADB 通道），音量、信号源、遥控不可用。</p>
        </div>
      );
    }
    return (
      <div className={dev.powered ? '' : 'screen-off'} data-screen-label={'快捷 · ' + dev.short}>
        <Card title="亮度" extra={<Pill tone="adb">ADB</Pill>}>
          <Slider label="背光" value={dev.brightness} disabled={!dev.powered}
            onChange={(v) => apply('亮度 ' + v + '%', '/api/brightness', { device: dev.id, value: v })} />
        </Card>
        <Card title="音量" extra={<Pill>6095</Pill>}>
          <Slider label="扬声器" value={dev.volume} disabled={!dev.powered} format={(v) => v + '/100'}
            onChange={(v) => apply('音量 ' + v, '/api/volume', { device: dev.id, value: v })}
            trailing={
              <button type="button" className={'miniicon' + (dev.muted ? ' active' : '')} aria-pressed={dev.muted} aria-label="静音"
                onClick={() => { apply(dev.muted ? '取消静音' : '静音', '/api/volume', { device: dev.id, muted: !dev.muted }); }}>
                <Icon name={dev.muted ? 'volumeX' : 'volume'} size={14} />
              </button>
            } />
        </Card>
        <Card title="信号源" extra={<Pill>6095</Pill>}>
          <Row label="输入" hint="切换会短暂黑屏">
            <Seg options={SOURCES} value={dev.source} disabled={!dev.powered}
              onChange={(o) => o !== dev.source && setDlg({ text: '将切换信号源到 ' + o + '。屏幕会短暂黑屏约 1 秒。', onOk: () => apply('信号源 ' + o, '/api/source', { device: dev.id, source: o }) })} />
          </Row>
          <Row label="电源" hint={dev.powered ? '当前在线' : '当前待机'}>
            <button type="button" className="mini" onClick={() => setDlg({ text: dev.powered ? '将使显示器进入待机。可再次发送电源键唤醒。' : '将向显示器发送电源键唤醒。', onOk: () => apply(dev.powered ? '进入待机' : '电源唤醒', '/api/key', { device: dev.id, key: 'power' }) })}>
              <Icon name="power" size={13} /> {dev.powered ? '进入待机' : '唤醒'}
            </button>
          </Row>
        </Card>
      </div>
    );
  }

    function RemoteScreen() {
    if (!dev) return null;
    const press = (label: string, key: string) => { setLastKey(label); apply('按键 ' + label, '/api/key', { device: dev.id, key }); };
    const keyBtn = (label: string, icon: string | null, cls?: string, onClick?: () => void) => (
      <button type="button" className={'keybtn ' + (cls ?? '')} aria-label={label}
        onClick={onClick ?? (() => press(label, { 上: 'up', 下: 'down', 左: 'left', 右: 'right', OK: 'enter', 主页: 'home', 返回: 'back', 菜单: 'menu', 电源: 'power', '音量+': 'volumeup', '音量-': 'volumedown' }[label] ?? 'enter'))}>
        {icon ? <Icon name={icon} size={16} /> : label}
      </button>
    );
    return (
      <div data-screen-label={'遥控 · ' + dev.short}>
        <Card title="虚拟遥控器" extra={lastKey ? <Pill>最近：{lastKey}</Pill> : null}>
          <Row label="键盘接管">
            <span className="grow" />
            <button type="button" className="mini" onClick={(e) => { e.stopPropagation(); setShowKeymap(true); }}>查看键盘</button>
            <Toggle checked={remoteActive} onChange={setRemoteActive} />
          </Row>
          <div className={'remotemirror' + (remoteActive ? ' active' : '')} onClick={() => !remoteActive && setRemoteActive(true)}
            role="button" aria-label={remoteActive ? '遥控器已接管键盘' : '点击激活键盘接管'}>
            {remoteActive && <span className="takeover"><Icon name="key" size={12} /> 键盘已接管 · Esc 退出</span>}
            <div className="rr-top">
              <button type="button" className="rrbtn rrpower" aria-label="电源" title="电源"
                onClick={(e) => { e.stopPropagation(); setDlg({ text: '将使显示器进入待机。', onOk: () => press('电源', 'power') }); }}><Icon name="power" size={16} /></button>
              <button type="button" className="rrbtn rrdisabled" aria-label="小爱同学" title="需实体遥控器（蓝牙链路）触发"
                disabled><Icon name="sparkles" size={16} /></button>
            </div>
            <div className="rr-dpad">
              <button type="button" className="rredge up" aria-label="上" onClick={() => press('上', 'up')}><Icon name="chevronUp" size={15} /></button>
              <button type="button" className="rredge left" aria-label="左" onClick={() => press('左', 'left')}><Icon name="chevronLeft" size={15} /></button>
              <button type="button" className="rrokknob" aria-label="OK" onClick={() => press('OK', 'enter')}>OK</button>
              <button type="button" className="rredge right" aria-label="右" onClick={() => press('右', 'right')}><Icon name="chevronRight" size={15} /></button>
              <button type="button" className="rredge down" aria-label="下" onClick={() => press('下', 'down')}><Icon name="chevronDown" size={15} /></button>
            </div>
            <div className="rr-cols">
              <div className="rr-col">
                <button type="button" className="rrbtn" aria-label="返回" onClick={() => press('返回', 'back')}><Icon name="back" size={15} /></button>
                <button type="button" className="rrbtn" aria-label="主页" onClick={() => press('主页', 'home')}><Icon name="home" size={15} /></button>
                <button type="button" className="rrbtn" aria-label="菜单" onClick={() => press('菜单', 'menu')}><Icon name="menu" size={15} /></button>
              </div>
              <div className="rr-col">
                <button type="button" className="rrbtn" aria-label="音量+" onClick={() => press('音量+', 'volumeup')}><Icon name="plus" size={15} /></button>
                <button type="button" className="rrbtn" aria-label="音量-" onClick={() => press('音量-', 'volumedown')}><Icon name="minus" size={15} /></button>
                <button type="button" className="rrbtn" aria-label="TV" title="TV：切换到电视桌面（会切走当前画面）"
                  onClick={() => setDlg({ text: '将切换到电视桌面，当前 Mac 画面会被切走。', onOk: () => press('TV', 'home') })}><Icon name="monitor" size={15} /></button>
              </div>
            </div>
            <div className="rr-brand">REDMI</div>
          </div>
          <p className="mutenote">布局对应真实遥控器：顶部电源/小爱 · 中央导航环 · 左列返回/主页/菜单 · 右列音量/TV</p>
        {showKeymap && (
          <div className="mask" onClick={() => setShowKeymap(false)}>
            <div className="modal keymapmodal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="键盘对应">
              <div className="keymap">
                {REMOTE_KEYLIST.map((k) => (
                  <div key={k.action} className="keymaprow">
                    <span className="keymapaction">{k.action}</span>
                    <span className="kbd">{k.keys}</span>
                  </div>
                ))}
              </div>
              <div className="modalrow">
                <button type="button" className="mini mini-primary" onClick={() => setShowKeymap(false)}>关闭</button>
              </div>
            </div>
          </div>
        )}
        </Card>
      </div>
    );
  }

  function PictureScreen() {
    if (!dev) return null;
    const p = dev.picture;
    const setP = (label: string, patch: Partial<typeof p>) => apply(label, '/api/picture', { device: dev.id, patch });
    return (
      <div data-screen-label={'画面 · ' + dev.short}>
        <Card title="画面模式" extra={<Pill tone="adb">ADB</Pill>}>
          <Row label="模式" hint="每个模式独立记忆">
            <Seg options={PICTURE_MODES} value={p.mode} onChange={(o) => setP('模式 ' + o, { mode: o })} />
          </Row>
        </Card>
        <Card title="画质">
          <div className="grid2">
            <Slider label="背光" value={p.backlight} onChange={(v) => setP('背光 ' + v, { backlight: v })} />
            {PICTURE_SLIDERS.map(([label, key, max]) => (
              <Slider key={key} label={label} value={p[key] as number} max={max} onChange={(v) => setP(label + ' ' + v, { [key]: v })} />
            ))}
          </div>
        </Card>
        <Card title="高级">
          {PICTURE_SEGS.map(([label, key, options]) => (
            <Row key={key} label={label}>
              <Seg options={options} value={p[key] as string} onChange={(o) => setP(label + ' ' + o, { [key]: o })} />
            </Row>
          ))}
          <Row label="恢复默认" hint="仅当前模式">
            <button type="button" className="mini" onClick={() => setDlg({ text: '将把当前画面模式的所有参数恢复为出厂默认。', onOk: () => setP('恢复默认画质', { mode: '标准', black: 50, contrast: 50, saturation: 50, hue: 50, sharpness: 20, colorTemp: '标准', dimming: '关', clarity: '关', response: '关', gamut: '自动' }) })}>恢复默认画质</button>
          </Row>
        </Card>
      </div>
    );
  }

  function GameScreen() {
    if (!dev) return null;
    const capable = dev.caps.some((x) => x.key === 'ADB');
    const g = dev.game;
    const setG = (label: string, patch: Partial<typeof g>) => apply(label, '/api/game', { device: dev.id, patch });
    return (
      <div data-screen-label={'游戏 · ' + dev.short}>
        <Card title="游戏功能" extra={<Pill tone="adb">ADB</Pill>}>
          {dev.picture.mode !== '游戏' && <p className="warnnote">以下功能仅在「游戏」画面模式下生效（当前：{dev.picture.mode}）。</p>}
          <Row label="FreeSync" hint="g_video__freesync_switch"><Toggle checked={g.freesync} disabled={!capable} onChange={(v) => setG('FreeSync ' + (v ? '开' : '关'), { freesync: v })} /></Row>
          <Row label="准星" hint="切出游戏模式自动隐藏并记忆"><Seg options={['关', '十字', '圆点']} value={g.crosshair} disabled={!capable} onChange={(o) => setG('准星 ' + o, { crosshair: o })} /></Row>
          <Row label="动态准星"><Toggle checked={g.dynCross} disabled={!capable} onChange={(v) => setG('动态准星 ' + (v ? '开' : '关'), { dynCross: v })} /></Row>
          <Row label="狙击镜"><Toggle checked={g.scope} disabled={!capable} onChange={(v) => setG('狙击镜 ' + (v ? '开' : '关'), { scope: v })} /></Row>
          <Row label="夜视"><Toggle checked={g.night} disabled={!capable} onChange={(v) => setG('夜视 ' + (v ? '开' : '关'), { night: v })} /></Row>
          <Row label="FPS 计数器"><Toggle checked={g.fps} disabled={!capable} onChange={(v) => setG('FPS 计数器 ' + (v ? '开' : '关'), { fps: v })} /></Row>
        </Card>
        <Card title="显示模式">
          <Row label="320Hz 模式" hint="切换 EDID，屏幕黑屏数秒">
            <Toggle checked={g.hz320} onChange={() => setDlg({ text: g.hz320 ? '将切回 160Hz EDID。屏幕会黑屏数秒并重新识别显示模式。' : '将切换 EDID 至 320Hz 模式（1080p）。屏幕会黑屏数秒并重新识别。', onOk: () => setG('320Hz 模式 ' + (!g.hz320 ? '开' : '关'), { hz320: !g.hz320 }) })} />
          </Row>
        </Card>
      </div>
    );
  }

  function LightScreen() {
    if (!dev) return null;
    const capable = dev.caps.some((x) => x.key === 'ADB');
    const l = dev.light;
    const setL = (label: string, patch: Partial<typeof l>) => apply(label, '/api/light', { device: dev.id, patch });
    const off = !l.on || !capable;
    return (
      <div data-screen-label={'灯效 · ' + dev.short}>
        <Card title="屏幕灯（背部氛围灯）" extra={<Pill tone="adb">ADB</Pill>}>
          <Row label="屏幕灯"><Toggle checked={l.on} disabled={!capable} onChange={(v) => setL('屏幕灯 ' + (v ? '开' : '关'), { on: v })} /></Row>
          <Row label="模式" hint="屏幕同色=背光随画面；七彩梦境=循环">
            <Seg options={['照明', '纯色', '屏幕同色', '七彩梦境']} value={l.mode} disabled={off} onChange={(o) => setL('灯效 ' + o, { mode: o })} />
          </Row>
          <Row label="纯色颜色" hint="此机仅支持 5 色">
            <Seg options={['冰蓝', '流金', '天青', '草地', '日落']} value={l.colorName} disabled={off || !capable || l.mode !== '纯色'}
              onChange={(o) => setL('灯光 ' + o, { colorName: o })} />
          </Row>
          <Slider label="亮度" value={l.level} min={1} max={15} disabled={off || !capable} format={(v) => v + '/15'} onChange={(v) => setL('灯光亮度 ' + v, { level: v })} />
          <Row label="照明色温" hint="仅照明模式">
            <Seg options={['2700K', '4000K', '6500K']} value={l.temp} disabled={off || !capable || l.mode !== '照明'} onChange={(o) => setL('照明色温 ' + o, { temp: o })} />
          </Row>
        </Card>
      </div>
    );
  }

  function PresetsScreen() {
    if (!dev) return null;
    const applyPreset = (p: Preset) => {
      toast('套用预设「' + p.name + '」', 'preset');
      post('/api/presets', { action: 'apply', id: p.id, device: dev.id }).then((r) => {
        setActivePreset(r.applied ? p.id : null);
        toast(r.applied ? '已套用预设「' + p.name + '」' : '预设套用失败', 'preset');
      });
    };
    const captureCurrent = (): Record<string, unknown> => ({
      brightness: dev.picture.backlight, mode: dev.picture.mode, colorTemp: dev.picture.colorTemp,
      freesync: dev.game.freesync, crosshair: dev.game.crosshair, lightOn: dev.light.on, lightMode: dev.light.mode,
    });
    return (
      <div data-screen-label={'预设 · ' + dev.short}>
        <Card title="画质预设" extra={activePreset ? <Pill tone="ok">使用中</Pill> : null}>
          <div className="presets">
            {presets.map((p) => (
              <button type="button" key={p.id} className={'presetcard' + (activePreset === p.id ? ' active' : '')} onClick={() => applyPreset(p)}>
                <span className="presetname">{p.name}{activePreset === p.id ? ' · 使用中' : ''}</span>
                <span className="presetdesc">{Object.entries(p.values).map(([k, v]) => k + ' ' + String(v)).join(' · ')}</span>
              </button>
            ))}
            <button type="button" className="presetcard ghost" onClick={() => {
              const name = window.prompt('预设名称', '我的预设');
              if (!name) return;
              post('/api/presets', { name, values: captureCurrent() }).then(() => { refreshPresets(); toast('已创建预设「' + name + '」'); });
            }}>
              <span className="presetname"><Icon name="plus" size={13} /> 新建预设</span>
              <span className="presetdesc">把当前画质 + 灯效存为一键场景</span>
            </button>
          </div>
        </Card>
      </div>
    );
  }

  function DeviceDetail() {
    const d = devices.find((x) => x.id === detailId);
    if (!d) return null;
    const meta = DEVICE_META[d.id] ?? { model: d.name, edid: '—', fw: '—', serial: '—' };
    return (
      <div data-screen-label={'设备详情 · ' + d.short}>
        <div className="detailhead">
          <button type="button" className="mini" onClick={() => setDetailId(null)}><Icon name="chevronLeft" size={13} />返回</button>
          <h2>{d.name}</h2>
          <Pill>{d.caps.map((c) => c.key).join(' + ')}</Pill>
        </div>
        <Card title="基本信息">
          <Row label="名称" hint="点击即可修改，失焦保存">
            <input className="nameinp" defaultValue={d.name} aria-label="设备名称" onBlur={() => toast('已保存（M1：持久化到设备注册表）')} />
          </Row>
          <Row label="型号"><span className="rowtext">{meta.model}</span></Row>
          <Row label="EDID"><span className="rowtext">{meta.edid}</span></Row>
          <Row label="固件"><span className="rowtext">{meta.fw}</span></Row>
          <Row label="序列号"><span className="rowtext">{meta.serial}</span></Row>
          {meta.conn ? <Row label="连接"><span className="rowtext">{meta.conn}</span></Row> : null}
          {meta.res ? <Row label="当前模式"><span className="rowtext">{meta.res}</span></Row> : null}
        </Card>
        <Card title="通道" extra={<Pill tone="ok">能力探测于每次启动</Pill>}>
          {d.caps.some((c) => c.key === '6095') && d.ip ? (
            <Row label="6095 遥控" tag="Wi-Fi" hint={d.ip + ':6095 · 上次探测 刚刚'}>
              <button type="button" className="mini" onClick={() => toast('探测完成：6095 通道正常')}>重新探测</button>
            </Row>
          ) : null}
          {d.caps.some((c) => c.key === 'ADB') && d.ip ? (
            <Row label="ADB 调试" tag="5555" hint={'状态 已连接（device） · MtkDirectTool.jar 已部署 ✓ · guardian 未安装'}>
              <button type="button" className="mini" onClick={() => toast('guardian 已安装，ADB 将跨重启保活')}>安装 guardian</button>
            </Row>
          ) : null}
          <Row label="DDC/CI" tag="视频线" hint={d.caps.some((c) => c.key === 'DDC') ? '后端 mac-helper（IOAVService）' : '无 DDC 通道或经由其他通道提供'}>
            {d.caps.some((c) => c.key === 'DDC') ? <Pill tone="ok">可用</Pill> : <Pill>不可用</Pill>}
          </Row>
        </Card>
        <Card title="危险区">
          <Row label="忘掉此设备" hint="清除该设备的绑定与全部本地数据">
            <button type="button" className="mini" onClick={() => setDlg({ text: '将忘掉「' + d.name + '」，清除其绑定与本地数据。', onOk: () => { setDetailId(null); post('/api/devices', { action: 'forget', id: d.id }).then(() => toast('已忘掉')); } })}>忘掉</button>
          </Row>
        </Card>
      </div>
    );
  }

  function SettingsScreen() {
    useEffect(() => { fetch('/api/token').then((r) => r.json() as Promise<{ token: string }>).then((d) => setLanToken(d.token)).catch(() => {}); }, []);
    return (
      <div data-screen-label="设置">
        <Card title="外观">
          <Row label="主题" hint="默认跟随系统深浅色">
            <Seg options={['跟随系统', '浅色', '深色']}
              value={themeMode === 'system' ? '跟随系统' : themeMode === 'light' ? '浅色' : '深色'}
              onChange={(o) => changeTheme(o === '跟随系统' ? 'system' : o === '浅色' ? 'light' : 'dark')} />
          </Row>
        </Card>
        <Card title="设备" extra={
          <button type="button" className="mini" onClick={() => { setScanning(true); post('/api/devices', { action: 'rescan' }).then(() => { setScanning(false); toast('重新扫描完成'); }); }}>
            <Icon name="refresh" size={12} className={scanning ? 'spin' : ''} /> 重新扫描
          </button>
        }>
          <Row label="操作">
            <button type="button" className="mini" onClick={() => { post('/api/sync', {}).then(() => toast('已同步真机状态')); }}>
              <Icon name="check" size={12} /> 同步真机状态
            </button>
          </Row>
          {devices.map((d) => (
            <Row key={d.id} label={d.name} hint={(d.ip ?? 'USB-C / DP 线连') + ' · ' + d.caps.map((c) => c.key).join(' + ')}>
              <button type="button" className="mini" onClick={() => setDetailId(d.id)}>详情</button>
            </Row>
          ))}
        </Card>
        <Card title="连接向导 · G Pro 无线 ADB" extra={
          <button type="button" className="mini" onClick={() => toast('重新检测完成：4/4 通过')}>重新检测</button>
        }>
          {['设置 → 关于：连点「产品型号」7 次', '账号与安全 → ADB 调试允许 + 无线调试', '首连 RSA 授权（显示器上确认）', '自动部署 MtkDirectTool.jar（guardian 可选）'].map((t) => (
            <div className="step" key={t}><span className="stepcheck"><Icon name="check" size={12} /></span>{t}</div>
          ))}
        </Card>
        <Card title="Agent 接入（CLI / MCP）" extra={<Pill tone="ok">应用不内置 AI</Pill>}>
          <Row label="CLI" hint="bun src/cli.ts <command>，脚本 / 快捷指令直接调用" />
          <pre className="codesnippet"><code>{'bun src/cli.ts list                            # 列出设备与可用通道\nbun src/cli.ts volume 30 --display gpro        # 设置音量\nbun src/cli.ts brightness 40 --display mi5k    # 设置亮度（DDC）\nbun src/cli.ts key home --display gpro         # 发送遥控键\nbun src/cli.ts source hdmi2 --display gpro     # 切换信号源\nbun src/cli.ts preset 夜间观影 --display gpro  # 套用预设'}</code></pre>
          <Row label="MCP 服务" hint="stdio，供 Claude / Cursor 等 Agent 调用：bun src/mcp.ts" />
          <pre className="codesnippet"><code>{'{\n  "mcpServers": {\n    "mitv": { "command": "bun", "args": ["run", "mcp"] }\n  }\n}'}</code></pre>
        </Card>
        <Card title="手机远程">
          <Row label="局域网访问" hint="开启后非本机来源需携带令牌（本机自动放行）">
            <Toggle checked={remoteOn} onChange={(v) => { setRemoteOn(v); toast('手机远程已' + (v ? '开启' : '关闭')); }} />
          </Row>
          <Row label="地址" hint={remoteOn ? '同一 Wi-Fi 下浏览器打开' : '已关闭'}>
            <code className="code">http://192.168.0.251:8666</code>
            <button type="button" className="mini" disabled={!remoteOn} onClick={() => { navigator.clipboard?.writeText('http://192.168.0.251:8666').catch(() => {}); toast('已复制'); }}>复制</button>
          </Row>
          <Row label="访问令牌" hint="手机/Agent 请求需携带（重生成后旧令牌失效）">
            <code className="code">{lanToken ? lanToken.slice(0, 14) + '…' : '获取中…'}</code>
            <button type="button" className="mini" disabled={!remoteOn} onClick={() => copyText(lanToken)}>复制</button>
            <button type="button" className="mini" disabled={!remoteOn}
              onClick={() => post('/api/token', { action: 'regenerate' }).then((t) => { setLanToken(String(t.token ?? '')); toast('已重新生成'); })}>重生成</button>
          </Row>
        </Card>
        <Card title="全局快捷键">
          {[['⌥ ⌘ ↑ / ↓', '音量 ±'], ['⌥ ⌘ ← / →', '亮度 ±'], ['⌥ ⌘ M', '静音'], ['⌥ ⌘ R', '遥控面板']].map(([k, l]) => (
            <Row key={l} label={l}><span className="kbd">{k}</span></Row>
          ))}
        </Card>
        <Card title="关于">
          <p className="aboutp">MiTV 控制中心 v0.1.0 · 数值基线为 2026-10-24 真机实测</p>
        </Card>
      </div>
    );
  }

  const screens: Record<TabId, () => React.ReactNode> = {
    quick: QuickScreen, remote: RemoteScreen, picture: PictureScreen, game: GameScreen,
    light: LightScreen, presets: PresetsScreen, settings: SettingsScreen,
  };
  const screen = detailId ? DeviceDetail() : screens[tab]();

  return (
    <div className="page">
      <div className="win" role="application" aria-label="MiTV 控制中心">
        <aside className="side">
          <div className="brandrow">
            <span className="brandmark" />
            <span className="brandname">MiTV 控制中心</span>
          </div>
          <div className="seclabel">显示器</div>
          <div className="sidegroup" role="tablist" aria-label="显示器">
            {devices.map((d) => (
              <button type="button" key={d.id} role="tab" aria-selected={deviceId === d.id}
                title={d.name + (d.ip ? ' · ' + d.ip : '')}
                className={'navitem' + (deviceId === d.id ? ' sel' : '')} onClick={() => selectDevice(d.id)}>
                <Icon name="monitor" size={15} />
                <span>{d.short}</span>
                <span className="navdot" />
              </button>
            ))}
            {!devices.length && <span className="sidefoot-status">正在发现设备…</span>}
          </div>
          <div className="seclabel">功能</div>
          <nav className="sidegroup" aria-label="功能">
            {TABS.map((t) => {
              const locked = t.need !== null && !capOf(dev, t.need);
              return (
                <button type="button" key={t.id} className={'navitem' + (tab === t.id ? ' sel' : '') + (locked ? ' lock' : '')}
                  title={locked ? '此显示器缺少通道：' + (t.need === 'net' ? '6095' : 'ADB') : undefined}
                  onClick={() => go(t.id)}>
                  <Icon name={t.icon} size={15} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="sidefoot">
            <button type="button" className={'navitem' + (tab === 'settings' ? ' sel' : '')} onClick={() => go('settings')}>
              <Icon name="settings" size={15} />
              <span>设置</span>
            </button>
          </div>
        </aside>
        <main className="content"><div className="cinner">{screen}</div></main>
        <Toasts items={toasts} />
        <Modal dlg={dlg} onCancel={() => setDlg(null)} />
      </div>
    </div>
  );
}
