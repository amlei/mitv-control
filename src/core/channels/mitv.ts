// 6095 客户端 — MiTV Assistant Server（协议实测见 docs/design/initial-plan.md 附录 A）
// 成功判定：HTTP 200 且 body 含 "msg":"success"；6095 无鉴权，不要暴露到公网
import { MITV_PORT, type MitvKeycode } from './constants';

async function call(host: string, path: string, timeoutMs = 3000, port: number = MITV_PORT): Promise<unknown> {
  const res = await fetch(`http://${host}:${port}${path}`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.text();
  if (res.status !== 200 || !body.includes('"msg":"success"')) {
    throw new Error(`mitv ${path} -> HTTP ${res.status}: ${body.slice(0, 120)}`);
  }
  return JSON.parse(body) as unknown;
}

export interface MitvAlive {
  devicename: string;
  ip: string;
  feature: string[];
  platform: number;
  version: number;
}

export interface MitvVolume {
  stream: string;
  maxVolume: number;
  volume: number;
}

export async function isalive(host: string, timeoutMs = 3000): Promise<MitvAlive> {
  const json = (await call(host, '/request?action=isalive', timeoutMs)) as { data: MitvAlive };
  return json.data;
}

export async function getVolume(host: string, port = MITV_PORT): Promise<MitvVolume> {
  const json = (await call(host, '/controller?action=getvolume', 3000, port)) as { data: MitvVolume };
  return json.data;
}

export async function keyevent(host: string, keycode: MitvKeycode, port = MITV_PORT): Promise<void> {
  await call(host, `/controller?action=keyevent&keycode=${keycode}`, 3000, port);
}

export async function changeSource(host: string, source: 'hdmi1' | 'hdmi2'): Promise<void> {
  await call(host, `/controller?action=changesource&source=${source}`);
}
