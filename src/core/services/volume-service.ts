// 音量策略：getvolume 真源 + keyevent 步进（45ms/格，同设备 latest-wins 合并）
// 静音：此机无已验证的 mute 键 → 步进到 0 并记忆原值，取消静音时恢复
import { getVolume, keyevent } from '../channels/mitv';
import { stateHub } from './state-hub';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const chains = new Map<string, Promise<void>>();
const latest = new Map<string, number>();
const prevBeforeMute = new Map<string, number>();

function runner(id: string, host: string, port?: number): Promise<void> {
  let guard = 0;
  let cur = 0;
  return getVolume(host, port)
    .then((v) => { cur = v.volume; })
    .catch(() => { cur = stateHub.get(id)?.volume ?? 0; })
    .then(async () => {
      while (latest.get(id) !== cur && guard++ < 120) {
        const target = latest.get(id) ?? cur;
        await keyevent(host, cur < target ? 'volumeup' : 'volumedown', port);
        await sleep(45);
        cur += cur < target ? 1 : -1;
        stateHub.patch(id, { volume: cur });
      }
    });
}

export function setVolume(id: string, target: number): void {
  const dev = stateHub.get(id);
  if (!dev) return;
  const host = dev.ip;
  if (!host || !dev.caps.some((c) => c.key === '6095')) return;
  const clamped = Math.max(0, Math.min(100, Math.round(target)));
  latest.set(id, clamped);
  const prev = chains.get(id) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(() => runner(id, host, dev.port));
  chains.set(id, next);
}

export function setMuted(id: string, muted: boolean): void {
  const dev = stateHub.get(id);
  if (!dev) return;
  if (muted && !dev.muted) {
    prevBeforeMute.set(id, dev.volume);
    stateHub.patch(id, { muted: true });
    if (dev.volume > 0) setVolume(id, 0);
  } else if (!muted && dev.muted) {
    stateHub.patch(id, { muted: false });
    const restore = prevBeforeMute.get(id);
    if (restore != null && dev.volume === 0) setVolume(id, restore);
  } else {
    stateHub.patch(id, { muted });
  }
}
