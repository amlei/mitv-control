// 预设引擎：Prisma 持久化 + 应用（values 为 JSON 字符串，SQLite 无 Json 类型）
import { db } from '../db';
import { setBrightness, setGame, setLight, setPicture } from './display-service';
import { stateHub } from './state-hub';

export interface PresetValues {
  brightness?: number; mode?: string; colorTemp?: string;
  freesync?: boolean; crosshair?: string; lightOn?: boolean; lightMode?: string;
}

export async function listPresets() {
  const rows = await db().preset.findMany({ orderBy: { createdAt: 'asc' } });
  return rows.map((r) => ({ id: r.id, name: r.name, values: JSON.parse(r.values) as PresetValues }));
}

export async function createPreset(name: string, values: PresetValues) {
  return db().preset.create({ data: { name, values: JSON.stringify(values) } });
}

export async function deletePreset(id: string) {
  return db().preset.delete({ where: { id } }).catch(() => null);
}

export async function applyPreset(id: string, deviceId = 'gpro') {
  const row = await db().preset.findUnique({ where: { id } });
  if (!row) return { applied: false, verified: false, source: 'cache' } as const;
  const v = JSON.parse(row.values) as PresetValues;
  const results = [];
  if (v.brightness != null) results.push(await setBrightness(deviceId, v.brightness));
  const pic: Record<string, string> = {};
  if (v.mode) pic.mode = v.mode;
  if (v.colorTemp) pic.colorTemp = v.colorTemp;
  if (Object.keys(pic).length) results.push(await setPicture(deviceId, pic));
  const game: Record<string, boolean | string> = {};
  if (v.freesync != null) game.freesync = v.freesync;
  if (v.crosshair) game.crosshair = v.crosshair;
  if (Object.keys(game).length) results.push(await setGame(deviceId, game));
  const light: Record<string, boolean | string> = {};
  if (v.lightOn != null) light.on = v.lightOn;
  if (v.lightMode) light.mode = v.lightMode;
  if (Object.keys(light).length) results.push(await setLight(deviceId, light));
  return {
    applied: results.every((r) => r.applied),
    verified: results.every((r) => r.verified),
    source: 'device',
  } as const;
}

/** 种子预设（首次启动空库时写入，与原型一致） */
export async function ensureSeedPresets() {
  const n = await db().preset.count();
  if (n > 0) return;
  await db().preset.createMany({ data: [
    { name: '夜间观影', values: JSON.stringify({ brightness: 25, colorTemp: '暖色', lightOn: true, lightMode: '照明' }) },
    { name: '日间办公', values: JSON.stringify({ brightness: 80, colorTemp: '标准', lightOn: false }) },
    { name: '游戏竞技', values: JSON.stringify({ mode: '游戏', freesync: true, crosshair: '十字' }) },
  ] });
}

export function runtimeSnapshot() { return stateHub.list(); }
