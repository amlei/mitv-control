import { NextResponse } from 'next/server';
import { pressKey } from '@/core/services/display-service';
import { agentAllowed } from '@/app/api/agent-guard';

export const runtime = 'nodejs';
export async function POST(req: Request) {
    if (!(await agentAllowed(req))) return new Response("forbidden", { status: 403 });
  const body = await req.json() as { device: string; key: string };
  return NextResponse.json(await pressKey(body.device, body.key));
}
