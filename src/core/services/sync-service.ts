// 真机状态同步：程序未运行期间显示器可能被遥控器/OSD/其他工具改动，
// 这里从设备读回真实配置并刷新 StateHub（UI/SSE 自动跟着变）。
// 能读：音量(6095)、画面全项/游戏/灯效(ADB settings+batchGet)、信号源(ADB settings，尽力)。
// 读不到：静音状态（6095 无回读）、电源开关（推断：6095 不可达即 offline）。
import { getVolume } from '../channels/mitv';
import { AdbClient } from '../channels/adb';
import {
  CLARITY_NAMES, COLOR_TEMP_NAMES, CROSSHAIR_NAMES, DIMMING_NAMES, GAMUT_NAMES,
  LIGHT_COLOR_NAMES, LIGHT_MODE_NAMES, LIGHT_TEMP_NAMES, MTK_REGISTERS,
  MODE_NAMES, PICTURE_SETTINGS, RESPONSE_NAMES, SOURCE_NAMES, SOURCE_SETTINGS_KEY,
} from '../channels/constants';
import { stateHub, type DeviceRuntime } from './state-hub';

const num = (v: string | undefined) => {
  const n = parseInt((v ?? '').trim(), 10);
  return Number.isNaN(n) ? null : n;
};
const name = <T extends Record<number, string>>(map: T, v: string | undefined, fallback: string): string => {
  const n = num(v);
  return n != null && map[n] ? map[n] : fallback;
};

export async function syncDeviceState(id: string): Promise<boolean> {
  const dev = stateHub.get(id);
  if (!dev) return false;

  // ① 音量（6095，实时真源）
  if (dev.ip && dev.caps.some((c) => c.key === '6095')) {
    try {
      const v = await getVolume(dev.ip);
      stateHub.patch(id, { volume: v.volume, online: true });
    } catch {
      stateHub.patch(id, { online: false });
    }
  }

  // ② 画面/游戏/灯效（ADB）
  if (!dev.ip || !dev.caps.some((c) => c.key === 'ADB')) {
    // 仅 DDC 的普通屏：尽力读亮度（DDC 读噪声大，只信 0-100 合法值）
    if (dev.caps.some((c) => c.key === 'DDC')) {
      const { firstAckedChannel, helperLuminance } = await import('../channels/ddc');
      const target = await firstAckedChannel();
      if (target) {
        const v = await helperLuminance(target.vendor, target.model).catch(() => null);
        if (v != null) stateHub.patch(id, { brightness: v, picture: { ...(dev.picture ?? {}), backlight: v } });
      }
    }
    return true;
  }

  const adb = new AdbClient(dev.ip);
  if (!(await adb.ensureConnected())) { stateHub.patch(id, { online: false }); return false; }

  const keys = [
    'picture_mode', 'picture_backlight', PICTURE_SETTINGS.colorTemperature,
    'picture_brightness', 'picture_contrast', 'picture_saturation', 'picture_hue', 'picture_sharpness',
    PICTURE_SETTINGS.localDimming, PICTURE_SETTINGS.dynamicDefinition, PICTURE_SETTINGS.responseTime,
    PICTURE_SETTINGS.colorSpace, SOURCE_SETTINGS_KEY,
    'front_sight_index', 'mt_game_dynamic_ft', 'mt_game_scope', 'mt_game_scope_night',
    'atmosphere_light_switcher_pm2', 'atmosphere_light_illumination',
    'atmosphere_light_color_temp', 'atmosphere_light_color_value',
  ];
  const [vals, regs] = await Promise.all([
    adb.settingsGetMany(keys),
    adb.batchGet([MTK_REGISTERS.backLight, MTK_REGISTERS.freesync, MTK_REGISTERS.hdmiEdidVersion]).catch(() => ({} as Record<string, number>)),
  ]);

  const cur = stateHub.get(id);
  if (!cur) return false;
  const patch: Partial<DeviceRuntime> = {};

  const bl = regs[MTK_REGISTERS.backLight] ?? num(vals.picture_backlight);
  if (bl != null) { patch.brightness = bl; }
  const modeN = num(vals.picture_mode);
  if (modeN != null && MODE_NAMES[modeN]) patch.picture = { ...(patch.picture ?? cur.picture), mode: MODE_NAMES[modeN] } as typeof cur.picture;
  const setPic = (k: keyof typeof cur.picture, v: string | number | undefined) => {
    if (v == null) return;
    patch.picture = { ...(patch.picture ?? cur.picture), [k]: v } as typeof cur.picture;
  };
  setPic('backlight', bl ?? undefined);
  setPic('black', num(vals.picture_brightness) ?? undefined);
  setPic('contrast', num(vals.picture_contrast) ?? undefined);
  setPic('saturation', num(vals.picture_saturation) ?? undefined);
  setPic('hue', num(vals.picture_hue) ?? undefined);
  setPic('sharpness', num(vals.picture_sharpness) ?? undefined);
  setPic('colorTemp', name(COLOR_TEMP_NAMES, vals[PICTURE_SETTINGS.colorTemperature], cur.picture.colorTemp));
  setPic('dimming', name(DIMMING_NAMES, vals[PICTURE_SETTINGS.localDimming], cur.picture.dimming));
  setPic('clarity', name(CLARITY_NAMES, vals[PICTURE_SETTINGS.dynamicDefinition], cur.picture.clarity));
  setPic('response', name(RESPONSE_NAMES, vals[PICTURE_SETTINGS.responseTime], cur.picture.response));
  setPic('gamut', name(GAMUT_NAMES, vals[PICTURE_SETTINGS.colorSpace], cur.picture.gamut));

  const fs = regs[MTK_REGISTERS.freesync];
  const game: Partial<typeof cur.game> = {};
  if (fs != null) game.freesync = fs > 0;
  const edid = regs[MTK_REGISTERS.hdmiEdidVersion];
  if (edid != null) game.hz320 = edid === 1;
  const ch = num(vals.front_sight_index);
  if (ch != null && CROSSHAIR_NAMES[ch]) game.crosshair = CROSSHAIR_NAMES[ch];
  const dyn = num(vals.mt_game_dynamic_ft); if (dyn != null) game.dynCross = dyn > 0;
  const sc = num(vals.mt_game_scope); if (sc != null) game.scope = sc > 0;
  const ni = num(vals.mt_game_scope_night); if (ni != null) game.night = ni > 0;
  if (Object.keys(game).length) patch.game = { ...cur.game, ...game } as typeof cur.game;

  const pm2 = num(vals['atmosphere_light_switcher_pm2']);
  const illum = num(vals['atmosphere_light_illumination']);
  const light: Partial<typeof cur.light> = {};
  if (pm2 != null) { light.mode = LIGHT_MODE_NAMES[pm2] ?? cur.light.mode; light.on = pm2 !== 4; }
  if (illum != null) light.level = Math.max(1, Math.min(15, illum));
  const ltemp = num(vals['atmosphere_light_color_temp']);
  if (ltemp != null && LIGHT_TEMP_NAMES[ltemp]) light.temp = LIGHT_TEMP_NAMES[ltemp];
  const lcolor = num(vals['atmosphere_light_color_value']);
  if (lcolor != null && LIGHT_COLOR_NAMES[lcolor]) light.colorName = LIGHT_COLOR_NAMES[lcolor];
  if (Object.keys(light).length) patch.light = { ...cur.light, ...light } as typeof cur.light;

  const srcN = num(vals[SOURCE_SETTINGS_KEY]);
  if (srcN != null && SOURCE_NAMES[srcN]) patch.source = SOURCE_NAMES[srcN];

  stateHub.patch(id, patch);
  return true;
}

export async function syncAll(): Promise<boolean> {
  const list = stateHub.list();
  const results = await Promise.all(list.map((d) => syncDeviceState(d.id).catch(() => false)));
  return results.some(Boolean);
}
