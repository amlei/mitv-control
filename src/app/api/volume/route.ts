import { NextResponse } from 'next/server';
import { setVolume, setMuted } from '@/core/services/volume-service';
import { stateHub } from '@/core/services/state-hub';
import { agentAllowed } from '@/app/api/agent-guard';

export const runtime = 'nodejs';
export async function POST(req: Request) {
    if (!(await agentAllowed(req))) return new Response("forbidden", { status: 403 });
  const body = await req.json() as { device: string; value?: number; muted?: boolean };
  if (body.muted != null) { setMuted(body.device, body.muted); return NextResponse.json({ ok: true }); }
  if (typeof body.value !== 'number') return NextResponse.json({ error: 'value required' }, { status: 400 });
  setVolume(body.device, body.value);
  return NextResponse.json({ ok: true, target: body.value });
}
