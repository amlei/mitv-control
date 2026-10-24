import { NextResponse } from 'next/server';
import { setGame } from '@/core/services/display-service';
import type { GameState } from '@/core/services/state-hub';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  const body = await req.json() as { device: string; patch: Partial<GameState> };
  return NextResponse.json(await setGame(body.device, body.patch ?? {}));
}
