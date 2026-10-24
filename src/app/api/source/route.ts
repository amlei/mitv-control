import { NextResponse } from 'next/server';
import { setSource } from '@/core/services/display-service';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  const body = await req.json() as { device: string; source: string };
  return NextResponse.json(await setSource(body.device, body.source));
}
