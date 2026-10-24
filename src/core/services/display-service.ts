// 亮度/画面/游戏/灯效：按设备能力路由到 ADB（智能款）或 DDC（普通款）
// 写入链（ADB）：settings put 双键 → JNI set → PIC_MODE_CHANGED 广播 → batchGet 校验
import { AdbClient } from '../channels/adb';
import { firstAckedChannel, helperLuminance, helperPath, helperSetLuminance } from '../channels/ddc';
import {
  MITV_JAR_CACHE_DIR, tvServiceAppProcessCmd,
  COLOR_TEMP_TO_MTK, COLOR_TEMP_VALUES, CLARITY_VALUES, DIMMING_VALUES, GAMUT_VALUES,
  LED_JAR, LED_LIGHTING_TEMPS, LED_MODES, LED_SOLID_COLORS, LED_SETTINGS,
  MTK_REG_DP_ADAPTIVE_SYNC, MTK_REG_INSERT_BLACK, MTK_REG_OD_RESPONSE, MTK_REGISTERS,
  PICTURE_MODE_VALUES, PICTURE_SETTINGS,
  RESPONSE_VALUES,
} from '../channels/constants';
import { stateHub, type GameState, type LightState, type PictureState } from './state-hub';
import type { ApplyResult } from '../types';

/** DDC 目标缓存：设备 id → 配对通道（helper 优先，30s 刷新） */
async function ddcTargetFor(id: string): Promise<{ vendor: number; model: number } | null> {
  if (helperPath()) {
    const ch = await firstAckedChannel();
    if (ch) return ch;
  }
  return null;
}

async function adbBrightness(host: string, v: number): Promise<ApplyResult> {
  const adb = new AdbClient(host);
  if (!(await adb.ensureConnected())) return { applied: false, verified: false, source: 'cache' };
  // 单 shell 合并三步写（settings 双键 + JNI set + 广播），省 2 个子进程
  const jni = tvServiceAppProcessCmd('/data/data/mitv.service/cache/MtkDirectTool.jar',
    ['MtkDirectTool', 'set', MTK_REGISTERS.backLight, String(v), '3']);
  await adb.shell(['settings put global picture_backlight ' + v,
    'settings put global xiaomi_picture_backlight ' + v, jni,
    'am broadcast -a com.xiaomi.mitv.action.PIC_MODE_CHANGED --ei picmode 7'].join('; '));
  const vals = await adb.batchGet([MTK_REGISTERS.backLight]).catch(() => ({} as Record<string, number>));
  const verified = vals[MTK_REGISTERS.backLight] === v;
  return { applied: true, verified, source: 'device' };
}

export async function setBrightness(id: string, v: number): Promise<ApplyResult> {
  const dev = stateHub.get(id);
  if (!dev) return { applied: false, verified: false, source: 'cache' };
  stateHub.patch(id, { brightness: v, picture: { ...dev.picture, backlight: v } });
  if (dev.caps.some((c) => c.key === 'ADB') && dev.ip) {
    return adbBrightness(dev.ip, v);
  }
  if (dev.caps.some((c) => c.key === 'DDC')) {
    const target = await ddcTargetFor(id);
    if (target) {
      const ok = await helperSetLuminance(target.vendor, target.model, v);
      const read = await helperLuminance(target.vendor, target.model).catch(() => null);
      return { applied: ok, verified: ok && read != null && Math.abs(read - v) <= 1, source: 'device' };
    }
  }
  return { applied: false, verified: false, source: 'cache' };
}

/** 画面设置  return { applied: false, verified: false, source: 'cache' };
}

/** 画面设置：全部走 Toolbox 实测写路径（JNI + settings 成对 + 广播），并读回校验 */
const PICTURE_ENUM: Record<string, Record<string, number>> = {
  mode: PICTURE_MODE_VALUES, colorTemp: COLOR_TEMP_VALUES, dimming: DIMMING_VALUES,
  clarity: CLARITY_VALUES, gamut: GAMUT_VALUES, response: RESPONSE_VALUES,
};

const PICTURE_KEY_TO_SETTINGS: Record<string, string[]> = {
  mode: ['picture_mode'], black: ['picture_brightness'], contrast: ['picture_contrast'],
  saturation: ['picture_saturation'], hue: ['picture_hue'], sharpness: ['picture_sharpness'],
};

/** 单项写入：JNI（可选）+ settings（可选）+ 广播 + settingsGet 读回校验 */
async function writePictureItem(adb: AdbClient, item: { jni?: string; settings: string[]; value: number }): Promise<ApplyResult> {
  if (item.jni) await adb.jniSet(item.jni, item.value);
  await adb.settingsPut(Object.fromEntries(item.settings.map((k) => [k, item.value])));
  await adb.refreshPq();
  const readback = (await adb.settingsGet(item.settings[0])).replace(/\D/g, '');
  const verified = readback === String(item.value);
  return { applied: true, verified, source: 'device' };
}

export async function setPicture(id: string, patch: Partial<PictureState>): Promise<ApplyResult> {
  const dev = stateHub.get(id);
  if (!dev || !dev.ip || !dev.caps.some((c) => c.key === 'ADB')) return { applied: false, verified: false, source: 'cache' };
  if (patch.backlight != null) return setBrightness(id, patch.backlight);
  const adb = new AdbClient(dev.ip);
  if (!(await adb.ensureConnected())) return { applied: false, verified: false, source: 'cache' };
  let last: ApplyResult = { applied: false, verified: false, source: 'cache' };
  for (const [k, raw] of Object.entries(patch)) {
    if (raw == null) continue;
    if (k === 'mode') {
      last = await writePictureItem(adb, { settings: ['picture_mode'], value: PICTURE_ENUM.mode[raw as string] });
    } else if (k === 'colorTemp') {
      const sv = PICTURE_ENUM.colorTemp[raw as string];
      await adb.jniSet(MTK_REGISTERS.colorTemp, COLOR_TEMP_TO_MTK[sv]);
      await adb.settingsPut({ [PICTURE_SETTINGS.colorTemperature]: sv });
      await adb.refreshPq();
      const readback = (await adb.settingsGet(PICTURE_SETTINGS.colorTemperature)).replace(/\D/g, '');
      last = { applied: true, verified: readback === String(sv), source: 'device' };
    } else if (k === 'dimming') {
      last = await writePictureItem(adb, { jni: MTK_REGISTERS.localDimming, settings: [PICTURE_SETTINGS.localDimming, PICTURE_SETTINGS.localDimmingOsd], value: PICTURE_ENUM.dimming[raw as string] });
    } else if (k === 'clarity') {
      last = await writePictureItem(adb, { jni: MTK_REG_INSERT_BLACK, settings: [PICTURE_SETTINGS.dynamicDefinition], value: PICTURE_ENUM.clarity[raw as string] });
    } else if (k === 'response') {
      last = await writePictureItem(adb, { jni: MTK_REG_OD_RESPONSE, settings: [PICTURE_SETTINGS.responseTime], value: PICTURE_ENUM.response[raw as string] });
    } else if (k === 'gamut') {
      last = await writePictureItem(adb, { jni: MTK_REGISTERS.gamut, settings: [PICTURE_SETTINGS.colorSpace, PICTURE_SETTINGS.colorSpaceOsd], value: PICTURE_ENUM.gamut[raw as string] });
    } else if (k === 'black' || k === 'contrast' || k === 'saturation' || k === 'hue' || k === 'sharpness') {
      last = await writePictureItem(adb, { settings: PICTURE_KEY_TO_SETTINGS[k], value: raw as number });
    }
  }
  stateHub.patch(id, { picture: { ...dev.picture, ...patch } });
  return last;
}

/** 游戏功能：FreeSync 开=3/关=0（HDMI；DP/USBC 走 dp_adaptive_sync），准星等走 settings */
const GAME_SETTINGS: Record<string, string> = {
  dynCross: 'mt_game_dynamic_ft', scope: 'mt_game_scope', night: 'mt_game_scope_night', crosshair: 'front_sight_index',
};

export async function setGame(id: string, patch: Partial<GameState>): Promise<ApplyResult> {
  const dev = stateHub.get(id);
  if (!dev || !dev.ip || !dev.caps.some((c) => c.key === 'ADB')) return { applied: false, verified: false, source: 'cache' };
  const adb = new AdbClient(dev.ip);
  if (!(await adb.ensureConnected())) return { applied: false, verified: false, source: 'cache' };
  if (patch.freesync != null) {
    const onDp = dev.source === 'DP' || dev.source === 'USB-C';
    if (onDp) await adb.jniSet(MTK_REG_DP_ADAPTIVE_SYNC, patch.freesync ? 1 : 0);
    else await adb.jniSet(MTK_REGISTERS.freesync, patch.freesync ? 3 : 0);
    await adb.refreshPq();
  }
  if (patch.hz320 != null) await adb.jniSet(MTK_REGISTERS.hdmiEdidVersion, patch.hz320 ? 1 : 0);
  const pairs: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(patch)) {
    const key = GAME_SETTINGS[k];
    if (!key || v == null) continue;
    pairs[key] = k === 'crosshair' ? ({ 关: 0, 十字: 1, 圆点: 2 } as Record<string, number>)[v as string] ?? 0 : v ? 1 : 0;
  }
  if (Object.keys(pairs).length) await adb.settingsPut(pairs);
  stateHub.patch(id, { game: { ...dev.game, ...patch } });
  return { applied: true, verified: false, source: 'cache' };
}

/** 屏幕灯：真实语义 —— 模式 关闭(4)/照明(0)/纯色(2)/屏幕同色(1)/七彩梦境(3)；
 *  纯色仅 5 色（冰蓝/流金/天青/草地/日落），照明色温 2700K/4000K/6500K，亮度挡位 1-15。
 *  写入：settings（switcher/illumination/colorTemp/colorValue）+ ColorfulLedTool HIDL 调用。 */
const LED_TOOL_JAR = '/data/data/mitv.service/cache/ColorfulLedTool-dbg2.jar'; // 实测可加载的 dex 版本
function ledToolCmd(parts: string[]): string {
  const IFS = '\\${IFS}';
  const encoded = parts.map((p) => IFS + p).join('');
  return 'service call TvService 3 s16 "sh -c eval' + IFS + 'CLASSPATH=' + LED_TOOL_JAR + IFS +
    '/system/bin/app_process' + IFS + MITV_JAR_CACHE_DIR + encoded + '"';
}

export async function setLight(id: string, patch: Partial<LightState>): Promise<ApplyResult> {
  const dev = stateHub.get(id);
  if (!dev || !dev.ip || !dev.caps.some((c) => c.key === 'ADB')) return { applied: false, verified: false, source: 'cache' };
  const adb = new AdbClient(dev.ip);
  if (!(await adb.ensureConnected())) return { applied: false, verified: false, source: 'cache' };
  const wantsChange = patch.mode != null || patch.colorName != null || patch.temp != null;
  const light = { ...dev.light, ...patch, on: patch.on ?? (wantsChange ? true : dev.light.on) };
  const modeName = light.on ? (light.mode in LED_MODES && light.mode !== '关闭' ? light.mode : '纯色') : '关闭';
  const mode = LED_MODES[modeName as keyof typeof LED_MODES];
  const tempIdx = Math.max(0, LED_LIGHTING_TEMPS.indexOf(light.temp as never));
  const colorIdx = Math.max(0, LED_SOLID_COLORS.indexOf((light.colorName ?? LED_SOLID_COLORS[0]) as never));
  const illum = Math.max(0, Math.min(14, Math.round(light.level) - 1)); // settings 1-15 → HIDL 0-14
  const arg2 = modeName === '照明' ? String(tempIdx) : modeName === '纯色' ? String(colorIdx) : '1';
  // 路径一（3.0.120 原生 OSD 实测）：写 atmosphere_light_* 键组，守护进程监听驱动灯带
  await adb.settingsPut({
    [LED_SETTINGS.mode]: mode.setting,
    [LED_SETTINGS.illumination]: light.on ? Math.round(light.level) : 0,
    [LED_SETTINGS.colorTemp]: tempIdx,
    [LED_SETTINGS.colorValue]: colorIdx,
  });
  // 路径二（BSPM HIDL，Toolbox 原方案）：jar 未部署/异步 cp 未完成会 ClassNotFound 静默失败
  // 对策：ensureJar → 等 cp 落地 → 执行 → 只认 led_log「新增 DONE 行」为真验证 → 无新增重推重试
  let verified = false;
  const logLines = async () => parseInt((await adb.shell('wc -l < /sdcard/Download/mitv/led_log.txt 2>/dev/null').catch(() => '0')).trim(), 10) || 0;
  for (let attempt = 0; attempt < 2 && !verified; attempt++) {
    const deployed = await adb.ensureJar('ColorfulLedTool-dbg2.jar', 'resources/ColorfulLedTool-dbg2.jar');
    if (!deployed) break;
    await new Promise((r) => setTimeout(r, attempt === 0 ? 600 : 1500)); // TvService cp 异步落地
    const before = await logLines();
    await adb.shell(ledToolCmd(['ColorfulLedTool', mode.action, String(illum), arg2]));
    await new Promise((r) => setTimeout(r, 700));
    const after = await logLines();
    const tail = await adb.shell('tail -2 /sdcard/Download/mitv/led_log.txt 2>/dev/null').catch(() => '');
    if (after > before && /DONE mode=\d+ color=\d+ ret=0/.test(tail)) verified = true;
  }
  stateHub.patch(id, { light: { ...light, mode: modeName } });
  return { applied: true, verified, source: verified ? 'device' : 'cache' };
}

export async function setPower(id: string, on: boolean): Promise<ApplyResult> {
  const dev = stateHub.get(id);
  if (!dev || !dev.ip || !dev.caps.some((c) => c.key === '6095')) return { applied: false, verified: false, source: 'cache' };
  const { keyevent } = await import('../channels/mitv');
  await keyevent(dev.ip, 'power');
  stateHub.patch(id, { powered: on, online: on });
  return { applied: true, verified: false, source: 'cache' };
}

export async function setSource(id: string, source: string): Promise<ApplyResult> {
  const dev = stateHub.get(id);
  if (!dev || !dev.ip || !dev.caps.some((c) => c.key === '6095')) return { applied: false, verified: false, source: 'cache' };
  const { changeSource } = await import('../channels/mitv');
  const map: Record<string, 'hdmi1' | 'hdmi2'> = { 'HDMI 1': 'hdmi1', 'HDMI 2': 'hdmi2' };
  const s = map[source];
  if (s) await changeSource(dev.ip, s);
  stateHub.patch(id, { source });
  return { applied: true, verified: false, source: 'cache' };
}

export async function pressKey(id: string, key: string): Promise<ApplyResult> {
  const dev = stateHub.get(id);
  if (!dev || !dev.ip) return { applied: false, verified: false, source: 'cache' };
  // 小爱同学：软件模拟的四种路径（KEYCODE_VOICE_ASSIST 231 / KEYCODE_F5 142 /
  // mitv.voice.KEYDOWN-KEYUP 广播 / 拉起 VoiceControlService）均真机实测无效——
  // 实体遥控器走蓝牙链路，注入 /dev/input 需 root。保留分支便于未来接入。
  if (key === 'xiaoai') return { applied: false, verified: false, source: 'cache' };
  if (!dev.caps.some((c) => c.key === '6095')) return { applied: false, verified: false, source: 'cache' };
  const { keyevent } = await import('../channels/mitv');
  await keyevent(dev.ip, key as never);
  return { applied: true, verified: false, source: 'cache' };
}

export async function readBacklight(id: string): Promise<number | null> {
  const dev = stateHub.get(id);
  if (!dev) return null;
  if (dev.ip && dev.caps.some((c) => c.key === 'ADB')) {
    const adb = new AdbClient(dev.ip);
    const vals = await adb.batchGet([MTK_REGISTERS.backLight]).catch(() => ({} as Record<string, number>));
    return vals[MTK_REGISTERS.backLight] ?? null;
  }
  if (dev.caps.some((c) => c.key === 'DDC')) {
    const target = await ddcTargetFor(id);
    if (target) return helperLuminance(target.vendor, target.model);
  }
  return null;
}
