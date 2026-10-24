import { describe, expect, test, beforeEach } from 'bun:test';
import { StateHub, gproRuntime, mi5kRuntime } from './state-hub';

describe('StateHub', () => {
  let hub: StateHub;
  beforeEach(() => { hub = new StateHub(); });
  test('seed/patch/subscribe', () => {
    hub.seed(gproRuntime('gpro', 'G Pro', '192.168.0.25', true));
    hub.seed(mi5kRuntime('mi5k', '小米 5K'));
    expect(hub.list()).toHaveLength(2);
    const seen: number[] = [];
    const unsub = hub.subscribe((d) => seen.push(d.length));
    hub.patch('gpro', { volume: 40 });
    expect(hub.get('gpro')?.volume).toBe(40);
    expect(seen).toEqual([2]);
    unsub();
    hub.patch('gpro', { volume: 41 });
    expect(seen).toEqual([2]); // 退订后不再通知
  });
  test('5K 无 6095 能力', () => {
    const d = mi5kRuntime('mi5k', '小米 5K');
    expect(d.caps.some((c) => c.key === '6095')).toBe(false);
    expect(d.caps.some((c) => c.key === 'DDC')).toBe(true);
  });
});
