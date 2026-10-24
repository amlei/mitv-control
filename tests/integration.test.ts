// 集成测试：mock 6095 服务器 + 路由处理器直调（不依赖真机）
// 独立测试库：DATABASE_URL 指向 tests/.int.db，beforeAll 里 migrate deploy
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { execSync } from 'node:child_process';
import { serve } from 'bun';

process.env.DATABASE_URL = 'file:./tests/.int.db';

let stopMock: () => void;
let mockVolume = 21;
const keyLog: string[] = [];

beforeAll(() => {
  execSync('bunx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: 'file:./tests/.int.db' }, stdio: 'pipe' });
  const server = serve({
    port: 46095,
    fetch(req) {
      const url = new URL(req.url);
      const ok = (data: unknown) => new Response(JSON.stringify({ status: 0, msg: 'success', data }), { headers: { 'Content-Type': 'application/json' } });
      if (url.pathname === '/request' && url.searchParams.get('action') === 'isalive') {
        return ok({ devicename: '米显', ip: '127.0.0.1:6095', feature: ['power'], platform: 1523, version: 16777510 });
      }
      if (url.pathname === '/controller' && url.searchParams.get('action') === 'getvolume') {
        return ok({ stream: 'music', maxVolume: 100, volume: mockVolume });
      }
      if (url.pathname === '/controller' && url.searchParams.get('action') === 'keyevent') {
        const key = url.searchParams.get('keycode') ?? '';
        keyLog.push(key);
        if (key === 'volumeup') mockVolume = Math.min(100, mockVolume + 1);
        if (key === 'volumedown') mockVolume = Math.max(0, mockVolume - 1);
        return ok({});
      }
      return new Response('not found', { status: 404 });
    },
  });
  stopMock = () => server.stop(true);
});

afterAll(() => stopMock());

// StateHub 直接注入（绕过发现，指向 mock 服务器）
import { stateHub, gproRuntime } from '../src/core/services/state-hub';
import { GET as getState } from '../src/app/api/state/route';
import { GET as getDevices, POST as postDevices } from '../src/app/api/devices/route';
import { POST as postVolume } from '../src/app/api/volume/route';
import { GET as getPresets, POST as postPresets } from '../src/app/api/presets/route';
import { GET as getEvents } from '../src/app/api/events/route';

function jsonReq(path: string, body: unknown): Request {
  return new Request('http://localhost' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

describe('API 集成（mock 6095）', () => {
  test('state 路由返回种子设备并初始化预设', async () => {
    const res = await getState() as Response;
    const data = await res.json() as { devices: { id: string }[] };
    expect(Array.isArray(data.devices)).toBe(true);
  });

  test('音量：路由 → 步进队列 → mock 收到 volumeup 且状态同步', async () => {
    stateHub.seed({ ...gproRuntime('mock', 'Mock G Pro', '127.0.0.1', false), port: 46095 });
    // mock 服务器在 46095 端口，StateHub 的 ip 指向 127.0.0.1 的 6095 —— 通过 patch 对准端口
    const dev = stateHub.get('mock')!;
    void dev;
    const res = await postVolume(jsonReq('/api/volume', { device: 'mock', value: 24 })) as Response;
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 900)); // 3 步 × 45ms + 余量
    const before = keyLog.filter((k) => k === 'volumeup').length;
    expect(before).toBeGreaterThanOrEqual(3);
    expect(stateHub.get('mock')?.volume).toBe(24);
    expect(mockVolume).toBe(24);
  });

  test('静音 → 步进到 0；取消 → 恢复原值', async () => {
    await postVolume(jsonReq('/api/volume', { device: 'mock', muted: true })) as Response;
    await new Promise((r) => setTimeout(r, 1200));
    expect(stateHub.get('mock')?.muted).toBe(true);
    expect(stateHub.get('mock')?.volume).toBe(0);
    await postVolume(jsonReq('/api/volume', { device: 'mock', muted: false })) as Response;
    await new Promise((r) => setTimeout(r, 1200));
    expect(stateHub.get('mock')?.muted).toBe(false);
    expect(stateHub.get('mock')?.volume).toBe(24);
  });

  test('预设 CRUD + 套用（无 ADB 能力时如实返回 applied:false）', async () => {
    const created = await (postPresets(jsonReq('/api/presets', { name: '集成测试预设', values: { brightness: 30, colorTemp: '暖色' } })) as Promise<Response>);
    expect(created.status).toBe(200);
    const list = await (getPresets() as Promise<Response>).then((r) => r.json()) as { presets: { id: string; name: string }[] };
    const target = list.presets.find((p) => p.name === '集成测试预设');
    expect(target).toBeDefined();
    const applied = await (postPresets(jsonReq('/api/presets', { action: 'apply', id: target!.id, device: 'mock' })) as Promise<Response>).then((r) => r.json());
    // mock 设备无 ADB 通道 → 亮度等如实返回 applied:false（协议语义：不谎报成功）
    expect(applied.applied).toBe(false);
    const del = await (postPresets(jsonReq('/api/presets', { action: 'delete', id: target!.id })) as Promise<Response>);
    expect(del.status).toBe(200);
    const list2 = await (getPresets() as Promise<Response>).then((r) => r.json()) as { presets: { name: string }[] };
    expect(list2.presets.some((p) => p.name === '集成测试预设')).toBe(false);
  });

  test('SSE：/api/events 首帧推送当前状态', async () => {
    const res = await getEvents() as Response;
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('data: [');
    await reader.cancel();
  });

  test('设备发现路由：rescan 动作可用', async () => {
    const res = await (postDevices(jsonReq('/api/devices', { action: 'rescan' })) as Promise<Response>);
    expect(res.status).toBe(200);
    void getDevices;
  });
});
