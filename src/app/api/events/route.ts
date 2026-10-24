import { stateHub } from '@/core/services/state-hub';
import { agentAllowed } from '@/app/api/agent-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    if (!(await agentAllowed(req))) return new Response("forbidden", { status: 403 });
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode('data: ' + JSON.stringify(data) + '\n\n'));
      send(stateHub.list());
      const unsub = stateHub.subscribe(send);
      const ping = setInterval(() => controller.enqueue(encoder.encode(': ping\n\n')), 15000);
      cleanup = () => { unsub(); clearInterval(ping); };
    },
    cancel() { cleanup?.(); },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
