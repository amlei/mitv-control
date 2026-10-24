// app.jsx — App 状态核心：设备切换 × Tab 导航 × 七个功能屏 × 弹窗确认
const { useState, useEffect, useRef } = React;

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

const REMOTE_KEYMAP = {
  ArrowUp: ['上', 'up'], ArrowDown: ['下', 'down'], ArrowLeft: ['左', 'left'], ArrowRight: ['右', 'right'],
  Enter: ['OK', 'enter'], Backspace: ['返回', 'back'], h: ['主页', 'home'], H: ['主页', 'home'],
  m: ['菜单', 'menu'], M: ['菜单', 'menu'], a: ['小爱', 'xiaoai'], A: ['小爱', 'xiaoai'], t: ['TV', 'home'], T: ['TV', 'home'], p: ['电源', 'power'], P: ['电源', 'power'],
  '+': ['音量+', 'volumeup'], '=': ['音量+', 'volumeup'], '-': ['音量-', 'volumedown'],
};

function App() {
  const [themeMode, setThemeMode] = useState('system'); // 'system' | 'light' | 'dark'
  const [deviceId, setDeviceId] = useState('gpro');
  const [tab, setTab] = useState('quick');
  const [st, setSt] = useState(INITIAL);
  const [toasts, setToasts] = useState([]);
  const [dlg, setDlg] = useState(null);
  const [lastKey, setLastKey] = useState(null);
  const [remoteActive, setRemoteActive] = useState(false);
  const [showKeymap, setShowKeymap] = useState(false);
  const [activePreset, setActivePreset] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [remoteOn, setRemoteOn] = useState(true);
  const [mcpOn, setMcpOn] = useState(true);
  const [autoTask, setAutoTask] = useState(true);
  const [detailId, setDetailId] = useState(null);
  const chatEndRef = useRef(null);
  const toastSeq = useRef(0);

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

  // 键盘接管：仅在遥控页且已激活时拦截按键
  useEffect(() => {
    if (!remoteActive || tab !== 'remote') return;
    const onKey = (e) => {
      if (e.key === 'Escape') { setRemoteActive(false); toast('已退出键盘接管'); return; }
      const hit = REMOTE_KEYMAP[e.key] ?? REMOTE_KEYMAP[e.key.toLowerCase()];
      if (hit) { e.preventDefault(); setLastKey(hit[0]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [remoteActive, tab]);

  const dev = DEVICES.find((d) => d.id === deviceId);
  const s = st[deviceId];
  const capOf = (d, need) => need === 'net' ? d.caps.some((c) => c.key === '6095') : d.caps.some((c) => c.key === 'ADB');

  function toast(msg, key) {
    const id = ++toastSeq.current;
    const k = key || 'msg-' + id;
    // 同类操作合并：替换已有同键 toast 并重置计时，连续调整时只见一条演化值
    setToasts((t) => {
      const rest = t.filter((x) => x.key !== k);
      return [...rest.slice(-2), { id, key: k, msg }];
    });
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2300);
  }

  function apply(ids, mut, label) {
    const list = Array.isArray(ids) ? ids : [ids];
    setSt((prev) => {
      const n = { ...prev };
      list.forEach((id) => { n[id] = { ...n[id], ...mut(n[id] || {}) }; });
      return n;
    });
    toast('已应用 · 已验证 · ' + label, label.split(' ')[0]);
  }

  function applyPresetById(id) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    if (activePreset === id) { setActivePreset(null); toast('已取消预设「' + p.name + '」'); return; }
    setSt((prev) => {
      const g = prev.gpro;
      const picture = { ...g.picture };
      const game = { ...g.game };
      const light = { ...g.light };
      const v = p.values;
      if (v.brightness != null) picture.backlight = v.brightness;
      if (v.colorTemp) picture.colorTemp = v.colorTemp;
      if (v.mode) picture.mode = v.mode;
      if (v.freesync != null) game.freesync = v.freesync;
      if (v.crosshair) game.crosshair = v.crosshair;
      if (v.lightOn != null) light.on = v.lightOn;
      if (v.lightMode) light.mode = v.lightMode;
      return { ...prev, gpro: { ...g, picture, game, light, brightness: v.brightness != null ? v.brightness : g.brightness } };
    });
    setActivePreset(id);
    toast('已套用预设「' + p.name + '」');
  }

  function go(t) { setTab(t); setDetailId(null); }

  function selectDevice(id) {
    setDeviceId(id);
    setDetailId(null);
    // 当前功能此显示器不支持时，自动切到快捷（免去手动跳转）
    const d = DEVICES.find((x) => x.id === id);
    const cur = TABS.find((x) => x.id === tab);
    if (cur && cur.need && !capOf(d, cur.need)) setTab('quick');
  }

  const copyText = (t) => {
    try { navigator.clipboard && navigator.clipboard.writeText(t); } catch (e) { /* 原型忽略 */ }
    toast('已复制');
  };

  // ---------- 各屏 ----------
  function QuickScreen() {
    if (deviceId === 'mi5k') {
      return (
        <div data-screen-label="快捷 · 小米 5K">
          <Card title="亮度" extra={<Pill tone="ddc">DDC</Pill>}>
            <Slider label="背光亮度" value={s.brightness} onChange={(v) => apply('mi5k', (x) => ({ ...x, brightness: v }), '亮度 ' + v + '%')} />
          </Card>
          <p className="mutenote">此显示器无智能系统（无 6095 / ADB 通道），音量、信号源、遥控不可用。</p>
        </div>
      );
    }
    const powered = s.powered;
    return (
      <div className={powered ? '' : 'screen-off'} data-screen-label="快捷 · G Pro 27U">
        <Card title="亮度" extra={<Pill tone="adb">ADB</Pill>}>
          <Slider label="背光" value={s.brightness} disabled={!powered}
            onChange={(v) => apply('gpro', (x) => ({ ...x, brightness: v, picture: { ...x.picture, backlight: v } }), '亮度 ' + v + '%')} />
        </Card>
        <Card title="音量" extra={<Pill>6095</Pill>}>
          <Slider label="扬声器" value={s.volume} disabled={!powered} format={(v) => v + '/100'}
            onChange={(v) => apply('gpro', (x) => ({ ...x, volume: v }), '音量 ' + v)}
            trailing={
              <button type="button" className={'miniicon' + (s.muted ? ' active' : '')} aria-pressed={s.muted} aria-label="静音"
                onClick={() => apply('gpro', (x) => ({ ...x, muted: !x.muted }), s.muted ? '取消静音' : '静音')}>
                <Icon name={s.muted ? 'volumeX' : 'volume'} size={14} />
              </button>
            } />
        </Card>
        <Card title="信号源" extra={<Pill>6095</Pill>}>
          <Row label="输入" hint="切换会短暂黑屏">
            <Seg options={SOURCES} value={s.source} disabled={!powered}
              onChange={(o) => o !== s.source && setDlg({ text: '将切换信号源到 ' + o + '。屏幕会短暂黑屏约 1 秒。', onOk: () => apply('gpro', (x) => ({ ...x, source: o }), '信号源 ' + o) })} />
          </Row>
          <Row label="电源" hint={powered ? '当前在线' : '当前待机'}>
            <button type="button" className="mini" onClick={() => setDlg({ text: powered ? '将使显示器进入待机。可再次发送电源键唤醒。' : '将向显示器发送电源键唤醒。', onOk: () => { const to = !powered; apply('gpro', (x) => ({ ...x, powered: to }), to ? '电源唤醒' : '进入待机'); } })}>
              <Icon name="power" size={13} /> {powered ? '进入待机' : '唤醒'}
            </button>
          </Row>
        </Card>
      </div>
    );
  }

  function RemoteScreen() {
    const press = (l) => setLastKey(l);
    const key = (label, icon, cls) => (
      <button type="button" className={'keybtn ' + (cls || '')} aria-label={label} onClick={() => press(label)}>
        {icon ? <Icon name={icon} size={16} /> : label}
      </button>
    );
    return (
      <div data-screen-label="遥控 · G Pro 27U">
        <Card title="虚拟遥控器" extra={lastKey ? <Pill>最近：{lastKey}</Pill> : null}>
          <Row label="键盘接管">
            <span className="grow" />
            <button type="button" className="mini" onClick={(e) => { e.stopPropagation(); setShowKeymap(true); }}>查看键盘</button>
            <Toggle checked={remoteActive} onChange={setRemoteActive} />
          </Row>
          <div className={'remotemirror' + (remoteActive ? ' active' : '')} onClick={() => !remoteActive && setRemoteActive(true)}
            role="button" aria-label={remoteActive ? '遥控器已接管键盘' : '点击激活键盘接管'}>
            {remoteActive && <span className="takeover">键盘已接管 · Esc 退出</span>}
            <div className="rr-top">
              <button type="button" className="rrbtn rrpower" aria-label="电源" title="电源"
                onClick={(e) => { e.stopPropagation(); press('电源', 'power'); }}><Icon name="power" size={16} /></button>
              <button type="button" className="rrbtn rrdisabled" aria-label="小爱同学" title="需实体遥控器（蓝牙链路）触发，软件模拟的四种路径均无效"
                disabled><Icon name="sparkles" size={16} /></button>
            </div>
            <div className="rr-dpad">
              <button type="button" className="rredge up" aria-label="上" onClick={(e) => { e.stopPropagation(); press('上', 'up'); }}><Icon name="chevronUp" size={15} /></button>
              <button type="button" className="rredge left" aria-label="左" onClick={(e) => { e.stopPropagation(); press('左', 'left'); }}><Icon name="chevronLeft" size={15} /></button>
              <button type="button" className="rrokknob" aria-label="OK" onClick={(e) => { e.stopPropagation(); press('OK', 'enter'); }}>OK</button>
              <button type="button" className="rredge right" aria-label="右" onClick={(e) => { e.stopPropagation(); press('右', 'right'); }}><Icon name="chevronRight" size={15} /></button>
              <button type="button" className="rredge down" aria-label="下" onClick={(e) => { e.stopPropagation(); press('下', 'down'); }}><Icon name="chevronDown" size={15} /></button>
            </div>
            <div className="rr-cols">
              <div className="rr-col">
                <button type="button" className="rrbtn" aria-label="返回" onClick={(e) => { e.stopPropagation(); press('返回', 'back'); }}><Icon name="back" size={15} /></button>
                <button type="button" className="rrbtn" aria-label="主页" onClick={(e) => { e.stopPropagation(); press('主页', 'home'); }}><Icon name="home" size={15} /></button>
                <button type="button" className="rrbtn" aria-label="菜单" onClick={(e) => { e.stopPropagation(); press('菜单', 'menu'); }}><Icon name="menu" size={15} /></button>
              </div>
              <div className="rr-col">
                <button type="button" className="rrbtn" aria-label="音量+" onClick={(e) => { e.stopPropagation(); press('音量+', 'volumeup'); }}><Icon name="plus" size={15} /></button>
                <button type="button" className="rrbtn" aria-label="音量-" onClick={(e) => { e.stopPropagation(); press('音量-', 'volumedown'); }}><Icon name="minus" size={15} /></button>
                <button type="button" className="rrbtn" aria-label="TV" title="TV：切换到电视桌面（会切走当前画面）"
                onClick={(e) => { e.stopPropagation(); press('TV', 'home'); }}><Icon name="monitor" size={15} /></button>
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
    const capable = dev.caps.some((c) => c.key === 'ADB');
    const p = s.picture;
    const setP = (k, v, label) => apply('gpro', (x) => ({ ...x, picture: { ...x.picture, [k]: v } }), label || k);
    return (
      <div data-screen-label={'画面 · ' + dev.short}>
        <Card title="画面模式" extra={<Pill tone="adb">ADB</Pill>}>
          <Row label="模式" hint="每个模式独立记忆">
            <Seg options={PICTURE_MODES} value={p.mode} disabled={!capable} onChange={(o) => setP('mode', o, '模式 ' + o)} />
          </Row>
        </Card>
        <Card title="画质">
          <div className="grid2">
            {PICTURE_SLIDERS.map((d) => (
              <Slider key={d.key} label={d.label} value={p[d.key]} max={d.max}
                onChange={(v) => setP(d.key, v, d.label + ' ' + v)} disabled={!capable} />
            ))}
          </div>
        </Card>
        <Card title="高级">
          {PICTURE_SEGS.map((d) => (
            <Row key={d.key} label={d.label}>
              <Seg options={d.options} value={p[d.key]} disabled={!capable} onChange={(o) => setP(d.key, o, d.label + ' ' + o)} />
            </Row>
          ))}
          <Row label="恢复默认" hint="仅当前模式">
            <button type="button" className="mini" onClick={() => setDlg({ text: '将把当前画面模式的所有参数恢复为出厂默认。', onOk: () => apply('gpro', (x) => ({ ...x, picture: { ...INITIAL.gpro.picture, mode: x.picture.mode } }), '恢复默认画质') })}>恢复默认画质</button>
          </Row>
        </Card>
      </div>
    );
  }

  function GameScreen() {
    const capable = dev.caps.some((c) => c.key === 'ADB');
    const g = s.game;
    const setG = (k, v, label) => apply('gpro', (x) => ({ ...x, game: { ...x.game, [k]: v } }), label);
    return (
      <div data-screen-label={'游戏 · ' + dev.short}>
        <Card title="游戏功能" extra={<Pill tone="adb">ADB</Pill>}>
          {st.gpro.picture.mode !== '游戏' && (
            <p className="warnnote">以下功能仅在「游戏」画面模式下生效（当前：{st.gpro.picture.mode}）。</p>
          )}
          <Row label="FreeSync" hint="g_video__freesync_switch"><Toggle checked={g.freesync} disabled={!capable} onChange={(v) => setG('freesync', v, 'FreeSync ' + (v ? '开' : '关'))} /></Row>
          <Row label="准星" hint="切出游戏模式自动隐藏并记忆"><Seg options={['关', '十字', '圆点']} value={g.crosshair} disabled={!capable} onChange={(o) => setG('crosshair', o, '准星 ' + o)} /></Row>
          <Row label="动态准星"><Toggle checked={g.dynCross} onChange={(v) => setG('dynCross', v, '动态准星 ' + (v ? '开' : '关'))} /></Row>
          <Row label="狙击镜"><Toggle checked={g.scope} onChange={(v) => setG('scope', v, '狙击镜 ' + (v ? '开' : '关'))} /></Row>
          <Row label="夜视"><Toggle checked={g.night} onChange={(v) => setG('night', v, '夜视 ' + (v ? '开' : '关'))} /></Row>
          <Row label="FPS 计数器"><Toggle checked={g.fps} onChange={(v) => setG('fps', v, 'FPS 计数器 ' + (v ? '开' : '关'))} /></Row>
        </Card>
        <Card title="显示模式">
          <Row label="320Hz 模式" hint="切换 EDID，屏幕黑屏数秒">
            <Toggle checked={g.hz320} onChange={() => setDlg({ text: g.hz320 ? '将切回 160Hz EDID。屏幕会黑屏数秒并重新识别显示模式。' : '将切换 EDID 至 320Hz 模式（1080p）。屏幕会黑屏数秒并重新识别。', onOk: () => setG('hz320', !g.hz320, '320Hz 模式 ' + (!g.hz320 ? '开' : '关')) })} />
          </Row>
        </Card>
      </div>
    );
  }

  function LightScreen() {
    const capable = dev.caps.some((c) => c.key === 'ADB');
    const l = s.light;
    const setL = (k, v, label) => apply('gpro', (x) => ({ ...x, light: { ...x.light, [k]: v } }), label);
    const off = !l.on;
    return (
      <div data-screen-label={'灯效 · ' + dev.short}>
        <Card title="屏幕灯（背部氛围灯）" extra={<Pill tone="adb">ADB</Pill>}>
          <Row label="屏幕灯"><Toggle checked={l.on} disabled={!capable} onChange={(v) => setL('on', v, '屏幕灯 ' + (v ? '开' : '关'))} /></Row>
          <Row label="模式" hint="屏幕同色=背光随画面；七彩梦境=循环"><Seg options={['照明', '纯色', '屏幕同色', '七彩梦境']} value={l.mode} disabled={off || !capable} onChange={(o) => setL('mode', o, '灯效 ' + o)} /></Row>
          <Row label="纯色颜色" hint="此机仅支持 5 色">
            <Seg options={['冰蓝', '流金', '天青', '草地', '日落']} value={l.colorName} disabled={off || !capable || l.mode !== '纯色'}
              onChange={(o) => setL('colorName', o, '灯光 ' + o)} />
          </Row>
          <Slider label="亮度" value={l.level} min={1} max={15} disabled={off || !capable} format={(v) => v + '/15'}
            onChange={(v) => setL('level', v, '灯光亮度 ' + v)} />
          <Row label="照明色温" hint="仅照明模式">
            <Seg options={['2700K', '4000K', '6500K']} value={l.temp} disabled={off || !capable || l.mode !== '照明'} onChange={(o) => setL('temp', o, '照明色温 ' + o)} />
          </Row>
        </Card>
      </div>
    );
  }

  function PresetsScreen() {
    return (
      <div data-screen-label="预设 · G Pro 27U">
        <Card title="画质预设" extra={activePreset ? <Pill tone="ok">使用中</Pill> : null}>
          <div className="presets">
            {PRESETS.map((p) => (
              <button type="button" key={p.id} className={'presetcard' + (activePreset === p.id ? ' active' : '')}
                onClick={() => applyPresetById(p.id)}>
                <span className="presetname">{p.name}{activePreset === p.id ? ' · 使用中' : ''}</span>
                <span className="presetdesc">{p.desc}</span>
              </button>
            ))}
            <button type="button" className="presetcard ghost" onClick={() => toast('原型：新建预设表单在实现版提供')}>
              <span className="presetname"><Icon name="plus" size={13} /> 新建预设</span>
              <span className="presetdesc">把当前画质 + 灯效存为一键场景</span>
            </button>
          </div>
        </Card>
        <Card title="自动任务">
          <Row label="23:00 – 07:00" hint="自动套用「夜间观影」，结束后还原">
            <Toggle checked={autoTask} onChange={(v) => { setAutoTask(v); toast('自动任务已' + (v ? '开启' : '关闭')); }} />
          </Row>
        </Card>
      </div>
    );
  }

  function SettingsScreen() {
    return (
      <div data-screen-label="设置">
        <Card title="外观">
          <Row label="主题" hint="默认跟随系统深浅色">
            <Seg options={['跟随系统', '浅色', '深色']}
              value={themeMode === 'system' ? '跟随系统' : themeMode === 'light' ? '浅色' : '深色'}
              onChange={(o) => setThemeMode(o === '跟随系统' ? 'system' : o === '浅色' ? 'light' : 'dark')} />
          </Row>
        </Card>
        <Card title="设备" extra={
          <button type="button" className="mini" onClick={() => { setScanning(true); setTimeout(() => { setScanning(false); toast('重新扫描完成：发现 2 台设备'); }, 1200); }}>
            <Icon name="refresh" size={12} className={scanning ? 'spin' : ''} /> 重新扫描
          </button>
        }>
          <Row label="操作">
            <button type="button" className="mini" onClick={() => toast('已同步真机状态（原型演示）')}>同步真机状态</button>
          </Row>
          {DEVICES.map((d) => (
            <Row key={d.id} label={d.name} hint={d.ip ? d.ip + ' · ' + d.channels : 'USB-C / DP 线连 · ' + d.channels}>
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
          <Row label="MCP 服务" hint="stdio，供 Claude / Cursor 等 Agent 调用">
            <Toggle checked={mcpOn} onChange={(v) => { setMcpOn(v); toast('MCP 服务已' + (v ? '开启' : '关闭')); }} />
          </Row>
          <Row label="Tools" hint="与界面同一动作面与验证语义">
            <code className="code codewrap">{MCP_TOOLS}</code>
          </Row>
          <Row label="CLI 示例" hint="脚本 / 快捷指令直接调用">
            <span className="grow" />
          </Row>
          <pre className="codesnippet"><code>{CLI_EXAMPLES.join('\n')}</code></pre>
          <Row label="MCP 配置" hint="加入 Agent 的 mcpServers">
            <span className="grow" />
            <button type="button" className="mini" onClick={() => copyText(MCP_CONFIG)}>复制配置</button>
          </Row>
          <pre className="codesnippet"><code>{MCP_CONFIG}</code></pre>
        </Card>
        <Card title="手机远程">
          <Row label="局域网访问"><Toggle checked={remoteOn} onChange={(v) => { setRemoteOn(v); toast('手机远程已' + (v ? '开启' : '关闭')); }} /></Row>
          <Row label="地址" hint={remoteOn ? '同一 Wi-Fi 下浏览器打开' : '已关闭'}>
            <code className="code">http://192.168.0.251:8666</code>
            <button type="button" className="mini" disabled={!remoteOn} onClick={() => copyText('http://192.168.0.251:8666')}>复制</button>
          </Row>
          <Row label="访问令牌" hint="必填，防同网段滥用">
            <code className="code">mtv-7f3k-…-9q0</code>
            <button type="button" className="mini" disabled={!remoteOn} onClick={() => copyText('mtv-token')}>复制</button>
          </Row>
        </Card>
        <Card title="全局快捷键">
          {HOTKEYS.map((h) => (
            <Row key={h.label} label={h.label}><span className="kbd">{h.keys}</span></Row>
          ))}
        </Card>
        <Card title="关于">
          <p className="aboutp">MiTV 控制中心 v0.1.0 · 交互原型（数值为 2026-10-24 真机实测）</p>
        </Card>
      </div>
    );
  }

  function DeviceDetailScreen() {
    const d = DEVICES.find((x) => x.id === detailId);
    const t = d.detail;
    return (
      <div data-screen-label={'设备详情 · ' + d.short}>
        <div className="detailhead">
          <button type="button" className="mini" onClick={() => setDetailId(null)}><Icon name="chevronLeft" size={13} />返回</button>
          <h2>{d.name}</h2>
          <Pill>{d.channels}</Pill>
        </div>
        <Card title="基本信息">
          <Row label="名称" hint="点击即可修改，失焦保存">
            <input className="nameinp" defaultValue={d.name} aria-label="设备名称"
              onBlur={() => toast('已保存（原型演示）')} />
          </Row>
          <Row label="型号"><span className="rowval" style={{ textAlign: 'left', minWidth: 0 }}>{t.model}</span></Row>
          <Row label="EDID"><span className="rowval" style={{ textAlign: 'left', minWidth: 0 }}>{t.edid}</span></Row>
          <Row label="固件"><span className="rowval" style={{ textAlign: 'left', minWidth: 0 }}>{t.fw}</span></Row>
          <Row label="序列号"><span className="rowval" style={{ textAlign: 'left', minWidth: 0 }}>{t.serial}</span></Row>
          {t.conn ? <Row label="连接"><span className="rowval" style={{ textAlign: 'left', minWidth: 0 }}>{t.conn}</span></Row> : null}
          {t.res ? <Row label="当前模式"><span className="rowval" style={{ textAlign: 'left', minWidth: 0 }}>{t.res}</span></Row> : null}
        </Card>
        <Card title="通道" extra={<Pill tone="ok">能力探测于每次启动</Pill>}>
          {t.mitv ? (
            <Row label="6095 遥控" tag="Wi-Fi" hint={t.mitv.addr + ' · 延迟 ' + t.mitv.latency + ' · 上次探测 ' + t.mitv.lastSeen}>
              <button type="button" className="mini" onClick={() => toast('探测完成：6095 通道正常')}>重新探测</button>
            </Row>
          ) : null}
          {t.adb ? (
            <Row label="ADB 调试" tag="5555" hint={'状态 ' + t.adb.state + ' · MtkDirectTool.jar ' + (t.adb.jar ? '已部署 ✓' : '未部署') + ' · guardian ' + (t.adb.guardian ? '已安装' : '未安装')}>
              <button type="button" className="mini" onClick={() => toast(t.adb.guardian ? '重新检测完成：ADB 正常' : 'guardian 已安装，ADB 将跨重启保活')}>{t.adb.guardian ? '重新检测' : '安装 guardian'}</button>
            </Row>
          ) : null}
          <Row label="DDC/CI" tag="视频线" hint={t.ddc.ok ? '后端 ' + t.ddc.backend + ' · ' + t.ddc.target : t.ddc.note}>
            {t.ddc.ok ? <Pill tone="ok">可用</Pill> : <Pill>不可用</Pill>}
          </Row>
        </Card>
        <Card title="危险区">
          <Row label="忘掉此设备" hint="清除该设备的绑定与全部本地数据">
            <button type="button" className="mini" onClick={() => setDlg({ text: '将忘掉「' + d.name + '」，清除其绑定与本地数据。', onOk: () => { setDetailId(null); toast('已忘掉（原型演示）'); } })}>忘掉</button>
          </Row>
        </Card>
      </div>
    );
  }

  const screen = detailId ? DeviceDetailScreen() : { quick: QuickScreen, remote: RemoteScreen, picture: PictureScreen, game: GameScreen, light: LightScreen, presets: PresetsScreen, settings: SettingsScreen }[tab]();

  return (
    <div className="page">
      <div className="win" role="application" aria-label="MiTV 控制中心原型">
        <aside className="side">
          <div className="brandrow">
            <span className="brandmark" />
            <span className="brandname">MiTV 控制中心</span>
          </div>
          <div className="seclabel">显示器</div>
          <div className="sidegroup" role="tablist" aria-label="显示器">
            {DEVICES.map((d) => (
              <button type="button" key={d.id} role="tab" aria-selected={deviceId === d.id}
                title={d.name + (d.ip ? ' · ' + d.ip : '')}
                className={'navitem' + (deviceId === d.id ? ' sel' : '')} onClick={() => selectDevice(d.id)}>
                <Icon name="monitor" size={15} />
                <span>{d.short}</span>
                <span className="navdot" />
              </button>
            ))}
          </div>
          <div className="seclabel">功能</div>
          <nav className="sidegroup" aria-label="功能">
            {TABS.filter((t) => t.id !== 'settings').map((t) => {
              const locked = t.need && !capOf(dev, t.need);
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
            <button type="button" className={'navitem' + (tab === 'settings' ? ' sel' : '')}
              onClick={() => go('settings')}>
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

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
