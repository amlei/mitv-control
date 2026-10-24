// mitv CLI — 与 UI/MCP 同一 core 动作面
// 用法: bun src/cli.ts <list|volume|brightness|mute|unmute|key|source|preset> [args] [--display <id>]
import { ensureDevices, rediscover } from './core/services/device-registry';
import { setVolume, setMuted } from './core/services/volume-service';
import { setBrightness, pressKey, setSource, setPicture } from './core/services/display-service';
import { applyPreset, listPresets } from './core/services/preset-engine';
import { stateHub } from './core/services/state-hub';

const argv = process.argv.slice(2);
const cmd = argv[0];
const displayIdx = argv.indexOf('--display');
const display = displayIdx >= 0 ? argv[displayIdx + 1] : undefined;
const args = argv.slice(1).filter((a, i) => !(displayIdx >= 0 && i + 1 === displayIdx - 0 && a === argv[displayIdx + 1]) && a !== '--display' && a !== (displayIdx >= 0 ? argv[displayIdx + 1] : '\u0000'));

async function main() {
  const devices = await ensureDevices();
  const id = display ?? devices[0]?.id;
  const dev = devices.find((d) => d.id === id);
  if (!dev && cmd !== 'list') { console.error('未找到设备（bun src/cli.ts list 查看）'); process.exit(1); }
  switch (cmd) {
    case 'list':
      console.log(devices.map((d) => d.id + '\t' + d.name + '\t' + d.caps.map((c) => c.key).join('+')).join('\n'));
      break;
    case 'volume': {
      const v = parseInt(args[0], 10);
      if (Number.isNaN(v)) { console.error('用法: volume <0-100>'); process.exit(1); }
      setVolume(id!, v); console.log('音量 ->', v);
      break;
    }
    case 'brightness': {
      const v = parseInt(args[0], 10);
      if (Number.isNaN(v)) { console.error('用法: brightness <0-100>'); process.exit(1); }
      console.log(await setBrightness(id!, Math.max(0, Math.min(100, v))));
      break;
    }
    case 'mute': setMuted(id!, true); console.log('已静音'); break;
    case 'unmute': setMuted(id!, false); console.log('已取消静音'); break;
    case 'key': console.log(await pressKey(id!, args[0] ?? 'home')); break;
    case 'source': {
      const map: Record<string, string> = { hdmi1: 'HDMI 1', hdmi2: 'HDMI 2', dp: 'DP', usbc: 'USB-C' };
      console.log(await setSource(id!, map[(args[0] ?? '').toLowerCase()] ?? args[0]));
      break;
    }
    case 'preset': {
      const name = args.join(' ');
      const presets = await listPresets();
      const p = presets.find((x) => x.name === name) ?? presets.find((x) => x.id === name);
      if (!p) { console.error('预设不存在:', name); process.exit(1); }
      console.log(await applyPreset(p.id, id));
      break;
    }
    case 'mode': console.log(await setPicture(id!, { mode: args[0] ?? '标准' })); break;
    case 'rescan': console.log((await rediscover()).map((d) => d.id + ' ' + d.name).join('\n')); break;
    default:
      console.log('命令: list | rescan | volume <n> | brightness <n> | mute | unmute | key <k> | source <hdmi1|hdmi2|dp|usbc> | preset <名称> | mode <名称>\n[--display <设备id>]');
  }
  void stateHub;
}

main().then(() => setTimeout(() => process.exit(0), 300)).catch((e) => { console.error(e.message ?? e); process.exit(1); });
