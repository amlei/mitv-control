import { NextResponse } from 'next/server';
import { ensureDevices, rediscover, forget } from '@/core/services/device-registry';
import { agentAllowed } from '@/app/api/agent-guard';

export const runtime = 'nodejs';
export async function GET(req: Request) { return NextResponse.json({ devices: await ensureDevices() }); }
export async function POST(req: Request) {
    if (!(await agentAllowed(req))) return new Response("forbidden", { status: 403 });
  const body = await req.json().catch(() => ({})) as { action?: string; id?: string };
  if (body.action === 'rescan') return NextResponse.json({ devices: await rediscover() });
  if (body.action === 'forget' && body.id) { await forget(body.id); return NextResponse.json({ devices: await ensureDevices() }); }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
