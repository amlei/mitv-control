// 协议常量 — 全部来自真机实测（docs/design/initial-plan.md 附录 A/B），键名原样引用，勿改大小写

export const MITV_PORT = 6095;
export const ADB_PORT = 5555;
export const ADB_SERVER_PORT = 5038; // 独立 ADB server 端口，避免与用户本机 adb 冲突

/** 6095 keyevent 合法键名（此机实测 volumeup/volumedown 生效；mute 未验证） */
export const MITV_KEYCODES = [
  'up', 'down', 'left', 'right', 'enter', 'home', 'back', 'menu', 'power',
  'volumeup', 'volumedown',
] as const;
export type MitvKeycode = (typeof MITV_KEYCODES)[number];

/** 画面类 Android Global Settings 键（写入需成对/单键原样引用） */
export const PICTURE_SETTING_KEYS = {
  mode: ['picture_mode'],
  backlight: ['picture_backlight', 'xiaomi_picture_backlight'],
  blackLevel: ['picture_brightness'],
  contrast: ['picture_contrast'],
  saturation: ['picture_saturation'],
  hue: ['picture_hue'],
  sharpness: ['picture_sharpness'],
  redGain: ['picture_red_gain'],
  greenGain: ['picture_green_gain'],
  blueGain: ['picture_blue_gain'],
  atmosphereLight: ['atmosphere_light_illumination'],
} as const;

/** MTK JNI 寄存器名（经 TvService + MtkDirectTool.jar 读写） */
export const MTK_REGISTERS = {
  backLight: 'g_disp__disp_back_light',
  colorTemp: 'g_video__clr_temp',
  localDimming: 'g_video__vid_local_dimming',
  freesync: 'g_video__freesync_switch',
  hdmiEdidVersion: 'g_fusion_picture__hdmi_edid_version',
  resetByPicMode: 'g_fusion_picture__pic_reset_def_bypicmode',
  gamut: 'g_video__vid_gamut_mapping_mode',
  gainR: 'g_video__clr_gain_r',
  gainG: 'g_video__clr_gain_g',
  gainB: 'g_video__clr_gain_b',
} as const;

/** jar 在显示器上的部署位置（经 TvService cp 写入，shell uid 无权直写） */
export const MITV_JAR_CACHE_DIR = '/data/data/mitv.service/cache';

/** 画质参数变更后的生效广播（OS3.0.120 实测有效） */
export const PIC_MODE_CHANGED_BROADCAST =
  'am broadcast -a com.xiaomi.mitv.action.PIC_MODE_CHANGED --ei picmode 7';

/**
 * 构造经 TvService 转发的 app_process 命令。
 * TvService 的 runSystemCommand 用 Runtime.exec 按空白切分、不起 shell，
 * 因此参数间空格一律写成字面量 `${IFS}`，由内层 `sh -c eval` 展开还原。
 * 调用方（adb shell）必须用单引号包裹整条命令，保持 `\${IFS}` 字面量原样到达远端。
 */
const IFS = '\\${IFS}'; // 字面量：反斜杠 + ${IFS}

export function tvServiceAppProcessCmd(jar: string, parts: readonly string[]): string {
  const encoded = parts.map((p) => IFS + p).join('');
  return (
    'service call TvService 3 s16 "sh -c eval' + IFS +
    'CLASSPATH=' + jar + IFS +
    '/system/bin/app_process' + IFS +
    MITV_JAR_CACHE_DIR + encoded + '"'
  );
}

/** 经 TvService 执行普通 shell 命令（如 cp），不带 app_process（Toolbox 同款手法） */
export function tvServiceShellCmd(parts: readonly string[]): string {
  const encoded = parts.map((p) => IFS + p).join('');
  return 'service call TvService 3 s16 "sh -c eval' + IFS + encoded.slice(1) + '"';
}

// ===== 画面/游戏/灯效真实语义（源自 Mimonitor_Toolbox pages/display_features 与 ColorfulLedTool.java）=====
export const PICTURE_MODE_VALUES = { 标准: 14, 电影: 9, 游戏: 10 } as const;
export const COLOR_TEMP_VALUES = { 冷色: 0, 标准: 1, 暖色: 2, 原色: 8, 自定义: 3 } as const;
/** 小米色温值 → MTK g_video__clr_temp 值 */
export const COLOR_TEMP_TO_MTK: Record<number, number> = { 0: 1, 1: 2, 2: 3, 3: 0, 8: 6 };
export const DIMMING_VALUES = { 关: 0, 低: 1, 中: 2, 高: 3 } as const;
export const CLARITY_VALUES = { 关: 0, 低: 1, 中: 2, 高: 3 } as const;
export const GAMUT_VALUES = { 自动: 0, sRGB: 3, AdobeRGB: 4, BT2020: 5, 'DCI-P3': 6, BT709: 7 } as const;
export const RESPONSE_VALUES = { 普通: 1, 快速: 2, 高速: 3 } as const;

export const MTK_REG_OD_RESPONSE = 'g_video__vid_od_response_time';
export const MTK_REG_INSERT_BLACK = 'g_video__vid_insert_black';
export const MTK_REG_DP_ADAPTIVE_SYNC = 'g_video__dp_adaptive_sync';

export const PICTURE_SETTINGS = {
  colorTemperature: 'picture_color_temperature',
  localDimming: 'picture_local_dimming',
  localDimmingOsd: 'tv_picture_video_local_dimming',
  colorSpace: 'tv_picture_advanced_video_color_space',
  colorSpaceOsd: 'tv_picture_video_color_space',
  responseTime: 'picture_response_time',
  dynamicDefinition: 'picture_dynamic_definition',
} as const;

export const SOURCE_SETTINGS_KEY = 'mitv.tvplayer.hdmi.last.source';
export const SOURCE_VALUES = { 'HDMI 1': 23, 'HDMI 2': 24, DP: 29, 'USB-C': 30 } as const;

// 3.0.120 固件原生 OSD 实测写键（注意 illumination 是 atmosphere_light_illumination，
// Toolbox 写的 atmosphere_illumination 是旧键，原生守护进程不读它）
export const LED_SETTINGS = {
  mode: 'atmosphere_light_switcher_pm2',
  illumination: 'atmosphere_light_illumination',
  colorTemp: 'atmosphere_light_color_temp',
  colorValue: 'atmosphere_light_color_value',
  preState: 'atmosphere_light_switcher_pre_state',
  lastBeforeOff: 'atmosphere_light_last_before_off',
} as const;
/** 模式名 → settings 值 / ColorfulLedTool 动作 */
export const LED_MODES = {
  照明: { setting: 0, action: 'lighting' },
  纯色: { setting: 2, action: 'solid' },
  屏幕同色: { setting: 1, action: 'ambient' },
  七彩梦境: { setting: 3, action: 'cycle' },
  关闭: { setting: 4, action: 'off' },
} as const;
export const LED_SOLID_COLORS = ['冰蓝', '流金', '天青', '草地', '日落'] as const; // 真实仅此 5 色
export const LED_LIGHTING_TEMPS = ['2700K', '4000K', '6500K'] as const;
export const LED_JAR = MITV_JAR_CACHE_DIR + '/ColorfulLedTool.jar';

/** 经 TvService 执行外部命令（如 cp 部署 jar 到 mitv.service 缓存目录） */

// ===== 反向映射（读回值 → UI 名称），与上面写入映射一一互逆 =====
export const MODE_NAMES: Record<number, string> = { 14: '标准', 9: '电影', 10: '游戏' };
export const COLOR_TEMP_NAMES: Record<number, string> = { 0: '冷色', 1: '标准', 2: '暖色', 3: '自定义', 8: '原色' };
export const DIMMING_NAMES: Record<number, string> = { 0: '关', 1: '低', 2: '中', 3: '高' };
export const CLARITY_NAMES: Record<number, string> = { 0: '关', 1: '低', 2: '中', 3: '高' };
export const GAMUT_NAMES: Record<number, string> = { 0: '自动', 3: 'sRGB', 4: 'AdobeRGB', 5: 'BT2020', 6: 'DCI-P3', 7: 'BT709' };
export const RESPONSE_NAMES: Record<number, string> = { 1: '普通', 2: '快速', 3: '高速' };
export const SOURCE_NAMES: Record<number, string> = { 23: 'HDMI 1', 24: 'HDMI 2', 29: 'DP', 30: 'USB-C' };
export const CROSSHAIR_NAMES: Record<number, string> = { 0: '关', 1: '十字', 2: '圆点' };
export const LIGHT_MODE_NAMES: Record<number, string> = { 0: '照明', 1: '屏幕同色', 2: '纯色', 3: '七彩梦境', 4: '关闭' };
export const LIGHT_TEMP_NAMES: Record<number, string> = { 0: '2700K', 1: '4000K', 2: '6500K' };
export const LIGHT_COLOR_NAMES: Record<number, string> = { 0: '冰蓝', 1: '流金', 2: '天青', 3: '草地', 4: '日落' };
