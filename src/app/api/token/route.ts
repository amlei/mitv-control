// 令牌管理：仅限本机（loopback）访问，局域网即使持旧令牌也不可读写此端点
import { NextResponse } from 'next/server';
import { isLoopback } from '../agent-guard';
import { db } from '@/core/db';

export const runtime = 'nodejs';
const KEY = 'lan_token';

async function currentToken(): Promise<string> {
  const row = await db().setting.findUnique({ where: { key: KEY } }).catch(() => null);
  if (row?.value) return row.value;
  const token = 'mitv-' + Math.random().toString(36).slice(2, 10) + '-' + Math.random().toString(36).slice(2, 6);
  await db().setting.upsert({ where: { key: KEY }, update: { value: token }, create: { key: KEY, value: token } });
  return token;
}

export async function GET(req: Request) {
  if (!isLoopback(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ token: await currentToken() });
}

export async function POST(req: Request) {
  if (!isLoopback(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({})) as { action?: string };
  if (body.action === 'regenerate') {
    const token = 'mitv-' + Math.random().toString(36).slice(2, 10) + '-' + Math.random().toString(36).slice(2, 6);
    await db().setting.upsert({ where: { key: KEY }, update: { value: token }, create: { key: KEY, value: token } });
    return NextResponse.json({ token });
  }
  return NextResponse.json({ token: await currentToken() });
}
