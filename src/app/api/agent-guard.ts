// 局域网访问守卫：本机放行，非本机来源必须携带 Bearer 令牌
// （6095 无鉴权是小米的锅；这里保护的是我们自己的控制面）
import { db } from '@/core/db';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLoopback(req: Request): boolean {
  const candidates = new Set<string>();
  const host = req.headers.get('host');
  if (host) candidates.add(host.split(':')[0]);
  try { candidates.add(new URL(req.url).hostname); } catch { /* 无效 URL 忽略 */ }
  return [...candidates].some((x) => LOOPBACK_HOSTS.has(x));
}

export async function agentAllowed(req: Request): Promise<boolean> {
  if (isLoopback(req)) return true;
  const row = await db().setting.findUnique({ where: { key: 'lan_token' } }).catch(() => null);
  const token = row?.value ?? process.env.MITV_TOKEN ?? '';
  if (!token) return false; // 未生成令牌 = 局域网访问关闭
  return (req.headers.get('authorization') ?? '') === 'Bearer ' + token;
}
