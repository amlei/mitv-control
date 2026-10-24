import { NextResponse } from 'next/server';
import { ensureDevices } from '@/core/services/device-registry';
import { syncAll, syncDeviceState } from '@/core/services/sync-service';
import { stateHub } from '@/core/services/state-hub';
import { agentAllowed } from '@/app/api/agent-guard';

export const runtime = 'nodejs';
export async function POST(req: Request) {
    if (!(await agentAllowed(req))) return new Response("forbidden", { status: 403 });
  await ensureDevices();
  const body = await req.json().catch(() => ({})) as { device?: string };
  const ok = body.device ? await syncDeviceState(body.device).catch(() => false) : await syncAll().catch(() => false);
  return NextResponse.json({ ok, devices: stateHub.list() });
}
