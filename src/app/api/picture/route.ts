import { NextResponse } from 'next/server';
import { setPicture } from '@/core/services/display-service';
import type { PictureState } from '@/core/services/state-hub';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  const body = await req.json() as { device: string; patch: Partial<PictureState> };
  return NextResponse.json(await setPicture(body.device, body.patch ?? {}));
}
