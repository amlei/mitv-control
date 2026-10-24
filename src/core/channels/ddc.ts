// DDC/CI 通道 — macOS 走 m1ddc（IOAVService）；读取噪声大（实测 -116/乱数），写可靠
// 防御规则见 initial-plan §5.4：本地缓存为真源、盲写、只信合理读数
import { spawn } from 'node:child_process';

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
