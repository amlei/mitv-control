import { NextResponse } from 'next/server';
import { setBrightness } from '@/core/services/display-service';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  const body = await req.json() as { device: string; value: number };
  if (typeof body.value !== 'number') return NextResponse.json({ error: 'value required' }, { status: 400 });
  const result = await setBrightness(body.device, Math.max(0, Math.min(100, Math.round(body.value))));
  return NextResponse.json(result);
}
