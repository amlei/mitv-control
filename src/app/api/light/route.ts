import { NextResponse } from 'next/server';
import { setLight } from '@/core/services/display-service';
import type { LightState } from '@/core/services/state-hub';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  const body = await req.json() as { device: string; patch: Partial<LightState> };
  return NextResponse.json(await setLight(body.device, body.patch ?? {}));
}
