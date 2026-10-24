// 局域网 6095 发现（协议同 probe/scan6095.mjs）
import net from 'node:net';
import os from 'node:os';
import { MITV_PORT } from './constants';

export function localSubnets(): string[] {
  const out = new Set<string>();
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) out.add(ni.address.split('.').slice(0, 3).join('.'));
    }
  }
  return [...out];
}

function probePort(host: string, port: number, timeoutMs = 300): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (ok: boolean) => { if (!done) { done = true; sock.destroy(); resolve(ok); } };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
    sock.connect(port, host);
  });
}

export async function probeTcp(host: string, port: number, timeoutMs = 350): Promise<boolean> {
  return probePort(host, port, timeoutMs);
}

export async function scanSubnet(subnet: string, port: number = MITV_PORT, concurrency = 128): Promise<string[]> {
  const hosts = Array.from({ length: 254 }, (_, k) => subnet + '.' + (k + 1));
  const found: string[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < hosts.length) {
      const h = hosts[i++];
      if (await probePort(h, port)) found.push(h);
    }
  }));
  return found.sort((a, b) => Number(a.split('.').pop()) - Number(b.split('.').pop()));
}
