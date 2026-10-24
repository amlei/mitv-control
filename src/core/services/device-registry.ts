// 设备注册表：发现（6095 扫描 + ADB 探测）→ 绑定持久化（Setting.devices）→ 注入 StateHub
import { isalive } from '../channels/mitv';
import { probeTcp, scanSubnet, localSubnets } from '../channels/discover';
import { db } from '../db';
import { gproRuntime, mi5kRuntime, stateHub, type DeviceRuntime } from './state-hub';

const BINDING_KEY = 'devices';

async function loadBinding(): Promise<DeviceRuntime[] | null> {
  const row = await db().setting.findUnique({ where: { key: BINDING_KEY } });
  if (!row) return null;
  try {
    const list = JSON.parse(row.value) as DeviceRuntime[];
    return Array.isArray(list) && list.length ? list : null;
  } catch { return null; }
}

async function saveBinding(list: DeviceRuntime[]): Promise<void> {
  const value = JSON.stringify(list);
  await db().setting.upsert({ where: { key: BINDING_KEY }, update: { value }, create: { key: BINDING_KEY, value } });
}

/** 有绑定用绑定，否则自动发现（Result 由调用方等待） */
export async function ensureDevices(): Promise<DeviceRuntime[]> {
  if (stateHub.hasAny()) return stateHub.list();
  const bound = await loadBinding().catch(() => null);
  if (bound) { stateHub.seedAll(bound); return stateHub.list(); }
  await rediscover().catch(() => {});
  return stateHub.list();
}

/** 全网段 6095 扫描 → isalive 确认 → 5555 探测 ADB 能力 → 绑定 */
export async function rediscover(): Promise<DeviceRuntime[]> {
  const found: DeviceRuntime[] = [];
  for (const subnet of localSubnets()) {
    const hosts = await scanSubnet(subnet);
    for (const host of hosts) {
      let info;
      try { info = await isalive(host); } catch { continue; }
      const adb = await probeTcp(host, 5555, 350);
      // 实测设备名「米显」= G Pro 27U（MiTV-MFFU1）；其他 6095 设备按通用 mitv 处理
      const isGpro = (info.devicename || '').includes('米显');
      found.push(isGpro
        ? gproRuntime('gpro', 'Redmi G Pro 27U「' + (info.devicename || '米显') + '」', host, adb)
        : gproRuntime(host, info.devicename || 'MiTV', host, adb));
    }
  }
  // 本机直连的普通显示器（DDC）：按 EDID/实测定值，5K 已实测可 DDC
  if (!found.some((d) => d.id === 'mi5k')) found.push(mi5kRuntime('mi5k', '小米 5K 显示器'));
  if (found.length) await saveBinding(found).catch(() => {});
  stateHub.seedAll(found);
  return stateHub.list();
}

export async function forget(id: string): Promise<void> {
  stateHub.remove(id);
  const list = stateHub.list();
  await saveBinding(list).catch(() => {});
}
