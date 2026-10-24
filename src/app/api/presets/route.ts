import { NextResponse } from 'next/server';
import { applyPreset, createPreset, deletePreset, listPresets } from '@/core/services/preset-engine';
import type { PresetValues } from '@/core/services/preset-engine';
import { agentAllowed } from '@/app/api/agent-guard';

export const runtime = 'nodejs';
export async function GET(req: Request) { return NextResponse.json({ presets: await listPresets() }); }
export async function POST(req: Request) {
    if (!(await agentAllowed(req))) return new Response("forbidden", { status: 403 });
  const body = await req.json() as { action?: string; id?: string; device?: string; name?: string; values?: PresetValues };
  if (body.action === 'apply' && body.id) return NextResponse.json(await applyPreset(body.id, body.device ?? 'gpro'));
  if (body.action === 'delete' && body.id) { await deletePreset(body.id); return NextResponse.json({ ok: true }); }
  if (body.name) return NextResponse.json(await createPreset(body.name, body.values ?? {}));
  return NextResponse.json({ error: 'bad request' }, { status: 400 });
}
