// data.jsx — 设备、通道能力、Tab 定义、初始状态、预设、CLI/MCP 暴露示例
// 全部数值来自 2026-10-24 真机实测（见 docs/design/initial-plan.md 附录）
// 定位：本应用不内置 AI；通过 CLI 与 MCP 把控制面暴露给外部 Agent

const DEVICES = [
  {
    id: 'gpro',
    short: 'G Pro 27U',
    name: 'Redmi G Pro 27U「米显」',
    ip: '192.168.0.25',
    caps: [{ key: '6095', tip: 'Wi-Fi：音量 / 遥控 / 信号源 / 电源' }, { key: 'ADB', tip: '画面 / 游戏 / 灯效 / 亮度' }],
    channels: '6095 + ADB',
    powerable: true,
    detail: {
      model: 'MiTV-MFFU1（beekeeper）',
      edid: 'XMI3009 · 2026 款 27U',
      fw: 'HyperOS OS3.0.120.0 · Android 14',
      serial: '058488c36f8fb4e2',
      mitv: { addr: '192.168.0.25:6095', latency: '3 ms', lastSeen: '刚刚' },
      adb: { state: '已连接（device）', jar: true, guardian: false },
      ddc: { ok: false, backend: 'mac-helper（IOAVService）', note: 'HDMI 口无 DDC 通道，亮度已由 ADB 通道提供' },
    },
  },
  {
    id: 'mi5k',
    short: '小米 5K',
    name: '小米 5K 显示器',
    ip: null,
    caps: [{ key: 'DDC', tip: '线控：亮度（校验和验证）' }],
    channels: '仅 DDC',
    powerable: false,
    detail: {
      model: '小米 5K 显示器',
      edid: 'Mi Monitor · 厂商 MI',
      fw: '—（非智能款，无系统）',
      serial: 'CC860348-248E-4AB9',
      conn: 'USB-C（DP Alt Mode）',
      res: '5120 × 2880 @ 160 Hz',
      mitv: null,
      adb: null,
      ddc: { ok: true, backend: 'mac-helper（IOAVService）', target: 'Display CC860348' },
    },
  },
];

// need: 'net' = 6095，'adb' = ADB；设备缺该通道时 Tab 置灰
const TABS = [
  { id: 'quick', label: '快捷', icon: 'gauge', need: null },
  { id: 'remote', label: '遥控', icon: 'gamepad', need: 'net' },
  { id: 'picture', label: '画面', icon: 'sliders', need: 'adb' },
  { id: 'game', label: '游戏', icon: 'crosshair', need: 'adb' },
  { id: 'light', label: '灯效', icon: 'lamp', need: 'adb' },
  { id: 'presets', label: '预设', icon: 'bookmark', need: 'adb' },
  { id: 'settings', label: '设置', icon: 'settings', need: null },
];

const SOURCES = ['HDMI 1', 'HDMI 2', 'DP', 'USB-C'];
const PICTURE_MODES = ['标准', '电影', '游戏', '明亮', '暗房'];

const PICTURE_SLIDERS = [
  { key: 'backlight', label: '背光', max: 100 },
  { key: 'black', label: '黑色级别', max: 100 },
  { key: 'contrast', label: '对比度', max: 100 },
  { key: 'saturation', label: '饱和度', max: 100 },
  { key: 'hue', label: '色调', max: 100 },
  { key: 'sharpness', label: '锐度', max: 100 },
];

const PICTURE_SEGS = [
  { key: 'colorTemp', label: '色温', options: ['标准', '暖色', '冷色', '自定义'] },
  { key: 'dimming', label: '精密控光', options: ['关', '低', '中', '高'] },
  { key: 'clarity', label: '动态清晰度', options: ['关', '低', '高'] },
  { key: 'response', label: '响应时间', options: ['关', '快速', '极速'] },
  { key: 'gamut', label: '色域', options: ['自动', 'sRGB', 'DCI-P3', 'AdobeRGB'] },
];

const PRESETS = [
  { id: 'night', name: '夜间观影', desc: '背光 25 · 暖色温 · 灯光照明', values: { brightness: 25, colorTemp: '暖色', lightOn: true, lightMode: '照明' } },
  { id: 'office', name: '日间办公', desc: '背光 80 · 标准色温', values: { brightness: 80, colorTemp: '标准', lightOn: false } },
  { id: 'game', name: '游戏竞技', desc: '游戏模式 · FreeSync · 准星十字', values: { mode: '游戏', freesync: true, crosshair: '十字' } },
];

const HOTKEYS = [
  { keys: '⌥ ⌘ ↑ / ↓', label: '音量 ±' },
  { keys: '⌥ ⌘ ← / →', label: '亮度 ±' },
  { keys: '⌥ ⌘ M', label: '静音' },
  { keys: '⌥ ⌘ R', label: '遥控面板' },
];

const GPRO_DEFAULTS = {
  volume: 21, muted: false, source: 'HDMI 1', powered: true,
  picture: { mode: '标准', backlight: 56, black: 50, contrast: 50, saturation: 50, hue: 50, sharpness: 20, colorTemp: '标准', dimming: '关', clarity: '关', response: '关', gamut: '自动' },
  game: { freesync: false, hz320: false, fps: false, crosshair: '关', dynCross: false, scope: false, night: false },
  light: { on: false, mode: '纯色', colorName: '流金', level: 5, temp: '4000K' },
};

const INITIAL = {
  gpro: { brightness: 56, ...GPRO_DEFAULTS },
  // 5K 也能打开全部 Tab（控件按能力置灰），因此需要完整运行时形状
  mi5k: { brightness: 82, volume: 0, muted: false, source: 'HDMI 1', powered: false,
          picture: { ...GPRO_DEFAULTS.picture }, game: { ...GPRO_DEFAULTS.game }, light: { ...GPRO_DEFAULTS.light } },
};

// Agent 接入：CLI 子命令示例与 MCP 配置（应用不内置 AI，Agent 经此操控）
const CLI_EXAMPLES = [
  'mitv list                            # 列出设备与可用通道',
  'mitv volume 30 --display gpro        # 设置音量',
  'mitv brightness 40 --display mi5k    # 设置亮度（DDC）',
  'mitv key home --display gpro         # 发送遥控键',
  'mitv source hdmi2 --display gpro     # 切换信号源',
  'mitv preset night --display gpro     # 套用预设',
];
const MCP_TOOLS = 'list_devices · set_volume · set_brightness · press_key · set_source · apply_preset · set_light';
const MCP_CONFIG = '{\n  "mcpServers": {\n    "mitv": { "command": "mitv", "args": ["mcp"] }\n  }\n}';

Object.assign(window, { DEVICES, TABS, SOURCES, PICTURE_MODES, PICTURE_SLIDERS, PICTURE_SEGS, PRESETS, HOTKEYS, INITIAL, CLI_EXAMPLES, MCP_TOOLS, MCP_CONFIG });
