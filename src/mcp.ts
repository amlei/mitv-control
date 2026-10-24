// MCP stdio 服务 — tools 与 UI/CLI 同一 core 动作面（应用不内置 AI，仅暴露能力）
// 运行: bun src/mcp.ts ；Agent 配置: { "command": "bun", "args": ["run", "mcp"] }
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ensureDevices, rediscover } from './core/services/device-registry';
import { setVolume, setMuted } from './core/services/volume-service';
import { setBrightness, pressKey, setSource, setPicture, setGame, setLight, readBacklight } from './core/services/display-service';
import { applyPreset, listPresets } from './core/services/preset-engine';

const server = new McpServer({ name: 'mitv', version: '0.1.0' });

server.tool('list_devices', {}, async () => {
  const devices = await ensureDevices();
  return { content: [{ type: 'text', text: devices.map((d) => d.id + ' | ' + d.name + ' | ' + d.caps.map((c) => c.key).join('+')).join('\n') }] };
});
server.tool('rescan_devices', {}, async () => {
  const devices = await rediscover();
  return { content: [{ type: 'text', text: '发现 ' + devices.length + ' 台' }] };
});
server.tool('set_volume', { device: z.string(), value: z.number().min(0).max(100) }, async ({ device, value }) => {
  setVolume(device, value);
  return { content: [{ type: 'text', text: '音量 -> ' + value }] };
});
server.tool('set_mute', { device: z.string(), muted: z.boolean() }, async ({ device, muted }) => {
  setMuted(device, muted);
  return { content: [{ type: 'text', text: muted ? '已静音' : '已取消静音' }] };
});
server.tool('set_brightness', { device: z.string(), value: z.number().min(0).max(100) }, async ({ device, value }) => {
  return { content: [{ type: 'text', text: JSON.stringify(await setBrightness(device, value)) }] };
});
server.tool('get_brightness', { device: z.string() }, async ({ device }) => {
  const v = await readBacklight(device);
  return { content: [{ type: 'text', text: v == null ? '读取失败' : '背光 ' + v }] };
});
server.tool('press_key', { device: z.string(), key: z.string() }, async ({ device, key }) => {
  return { content: [{ type: 'text', text: JSON.stringify(await pressKey(device, key)) }] };
});
server.tool('set_source', { device: z.string(), source: z.string() }, async ({ device, source }) => {
  return { content: [{ type: 'text', text: JSON.stringify(await setSource(device, source)) }] };
});
server.tool('set_picture', {
  device: z.string(),
  mode: z.string().optional(), backlight: z.number().optional(), black: z.number().optional(),
  contrast: z.number().optional(), saturation: z.number().optional(), hue: z.number().optional(),
  sharpness: z.number().optional(), colorTemp: z.string().optional(), dimming: z.string().optional(),
  clarity: z.string().optional(), response: z.string().optional(), gamut: z.string().optional(),
}, async ({ device, ...patch }) => {
    return { content: [{ type: 'text', text: JSON.stringify(await setPicture(device, patch)) }] };
  });
server.tool('set_game', {
  device: z.string(),
  freesync: z.boolean().optional(), hz320: z.boolean().optional(), fps: z.boolean().optional(),
  crosshair: z.string().optional(), dynCross: z.boolean().optional(), scope: z.boolean().optional(), night: z.boolean().optional(),
}, async ({ device, ...patch }) => {
    return { content: [{ type: 'text', text: JSON.stringify(await setGame(device, patch)) }] };
  });
server.tool('set_light', {
  device: z.string(),
  on: z.boolean().optional(), mode: z.string().optional(), color: z.string().optional(),
  level: z.number().optional(), temp: z.string().optional(),
}, async ({ device, ...patch }) => {
    return { content: [{ type: 'text', text: JSON.stringify(await setLight(device, patch)) }] };
  });
server.tool('list_presets', {}, async () => {
  const presets = await listPresets();
  return { content: [{ type: 'text', text: presets.map((p) => p.id + ' | ' + p.name).join('\n') || '（空）' }] };
});
server.tool('apply_preset', { device: z.string(), id: z.string() }, async ({ device, id }) => {
  return { content: [{ type: 'text', text: JSON.stringify(await applyPreset(id, device)) }] };
});

await server.connect(new StdioServerTransport());
