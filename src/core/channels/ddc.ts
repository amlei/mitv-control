// DDC/CI 通道 — macOS 走 m1ddc（IOAVService）；读取噪声大（实测 -116/乱数），写可靠
// 防御规则见 initial-plan §5.4：本地缓存为真源、盲写、只信合理读数
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

export interface DdcDisplay { index: number; name: string | null; uuid: string }

function m1ddc(args: string[], timeoutMs = 4000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('m1ddc', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { proc.kill(); reject(new Error('m1ddc timeout')); }, timeoutMs);
    proc.stdout.on('data', (c) => { out += String(c); });
    proc.stderr.on('data', (c) => { out += String(c); });
    proc.on('close', () => { clearTimeout(timer); resolve(out.trim()); });
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

// ---- 自研 mac-helper（首选）----
const envRes = process.env.MITV_RESOURCES;
export const HELPER_PATHS = [
  ...(envRes ? [envRes + '/ddc-helper/ddc-helper'] : []),
  'ddc-helper/ddc-helper',
  'resources/ddc-helper/ddc-helper',
];
export function helperPath(): string | null {
  for (const p of HELPER_PATHS) if (existsSync(p)) return p;
  return null;
}

function helperRun(args: string[], timeoutMs = 8000): Promise<string> {
  const bin = helperPath()!;
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { proc.kill(); reject(new Error('ddc-helper timeout')); }, timeoutMs);
    proc.stdout.on('data', (c) => { out += String(c); });
    proc.stderr.on('data', (c) => { out += String(c); });
    proc.on('close', () => { clearTimeout(timer); resolve(out.trim()); });
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

export interface HelperChannel { index: number; vendor: number; model: number; serial: number; name: string; acked: boolean }

export async function helperList(): Promise<HelperChannel[]> {
  if (!helperPath()) return [];
  const out = await helperRun(['list']).catch(() => '');
  try {
    const parsed = JSON.parse(out) as { channels: HelperChannel[] };
    return Array.isArray(parsed.channels) ? parsed.channels : [];
  } catch { return []; }
}

export async function helperGet(vendor: number, model: number, vcp: number): Promise<{ current: number; max: number } | null> {
  if (!helperPath()) return null;
  const out = await helperRun(['get', String(vendor), String(model), vcp.toString(16)]).catch(() => '');
  try {
    const parsed = JSON.parse(out) as { ok: boolean; current?: number; max?: number };
    if (parsed.ok && typeof parsed.current === 'number') return { current: parsed.current, max: parsed.max ?? 100 };
    return null;
  } catch { return null; }
}

export async function helperSet(vendor: number, model: number, vcp: number, value: number): Promise<{ ok: boolean; verified: boolean }> {
  if (!helperPath()) return { ok: false, verified: false };
  const out = await helperRun(['set', String(vendor), String(model), vcp.toString(16), String(value)]).catch(() => '');
  try {
    const parsed = JSON.parse(out) as { ok?: boolean; verified?: boolean };
    return { ok: !!parsed.ok, verified: !!parsed.verified };
  } catch { return { ok: false, verified: false }; }
}

// ---- m1ddc 回退 ----
export async function listDisplays(): Promise<DdcDisplay[]> {
  const out = await m1ddc(['display', 'list']);
  const displays: DdcDisplay[] = [];
  for (const line of out.split('\n')) {
    const m = line.match(/\[(\d+)\]\s*(.*?)\s*\(([^)]+)\)\s*$/);
    if (m) displays.push({ index: parseInt(m[1], 10), name: m[2] === '(null)' ? null : m[2], uuid: m[3] });
  }
  return displays;
}

/** 读取亮度：最多 3 次，只接受 0-100 的纯数字（垃圾应答一律丢弃） */
export async function getLuminance(index: number): Promise<number | null> {
  for (let i = 0; i < 3; i++) {
    const out = await m1ddc(['display', String(index), 'get', 'luminance']).catch(() => '');
    const m = out.match(/^(\d{1,3})$/);
    if (m) {
      const v = parseInt(m[1], 10);
      if (v >= 0 && v <= 100) return v;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

/** 写亮度：盲写 + 回显校验，失败重试一次 */
export async function setLuminance(index: number, value: number): Promise<boolean> {
  for (let i = 0; i < 2; i++) {
    const out = await m1ddc(['display', String(index), 'set', 'luminance', String(value)]).catch(() => '');
    if (out.trim() === String(value)) return true;
  }
  return false;
}

// ---- 服务层封装：按设备缓存的通道选择（首个应答通道；多屏绑定留待 UI）----
let cachedChannel: { vendor: number; model: number; at: number } | null = null;

export async function firstAckedChannel(): Promise<{ vendor: number; model: number } | null> {
  if (cachedChannel && Date.now() - cachedChannel.at < 30000) {
    return { vendor: cachedChannel.vendor, model: cachedChannel.model };
  }
  const channels = await helperList().catch(() => []);
  const acked = channels.filter((c) => c.acked);
  if (acked.length === 0) return null;
  // 单屏直取；多屏时取首个（UI 绑定留待后续）
  cachedChannel = { vendor: acked[0].vendor, model: acked[0].model, at: Date.now() };
  return { vendor: cachedChannel.vendor, model: cachedChannel.model };
}

/** helper 亮度读取（0x10），3 次尝试已内置 */
export async function helperLuminance(vendor: number, model: number): Promise<number | null> {
  const r = await helperGet(vendor, model, 0x10).catch(() => null);
  if (!r) return null;
  return r.current <= 100 ? r.current : null;
}

/** helper 亮度写入（0x10），写后回读校验 */
export async function helperSetLuminance(vendor: number, model: number, value: number): Promise<boolean> {
  const r = await helperSet(vendor, model, 0x10, Math.max(0, Math.min(100, Math.round(value)))).catch(() => null);
  if (!r || !r.ok) return false;
  const read = await helperGet(vendor, model, 0x10).catch(() => null);
  return read ? Math.abs(read.current - value) <= 1 : true;
}
