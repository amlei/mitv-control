import { NextResponse } from 'next/server';
import { pressKey } from '@/core/services/display-service';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  const body = await req.json() as { device: string; key: string };
  return NextResponse.json(await pressKey(body.device, body.key));
}
