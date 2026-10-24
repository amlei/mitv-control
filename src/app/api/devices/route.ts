import { NextResponse } from 'next/server';
import { ensureDevices, rediscover, forget } from '@/core/services/device-registry';

export const runtime = 'nodejs';
export async function GET() { return NextResponse.json({ devices: await ensureDevices() }); }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { action?: string; id?: string };
  if (body.action === 'rescan') return NextResponse.json({ devices: await rediscover() });
  if (body.action === 'forget' && body.id) { await forget(body.id); return NextResponse.json({ devices: await ensureDevices() }); }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
