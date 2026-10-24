import { describe, expect, test } from 'bun:test';

// 步进数学的纯逻辑契约（服务内循环同款算法）：45ms/格、latest-wins、边界 clamp
describe('音量步进契约', () => {
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
  test('向上步进逐格逼近目标', () => {
    let cur = 21; const target = 24; let steps = 0;
    while (cur !== target && steps < 120) { cur += cur < target ? 1 : -1; steps++; }
    expect(cur).toBe(24); expect(steps).toBe(3);
  });
  test('目标中途变化时按新目标继续（合并语义）', () => {
    let cur = 21; let target = 30; let steps = 0;
    // 走 3 步后目标变为 10
    while (cur !== target && steps < 200) {
      if (steps === 3) target = 10;
      cur += cur < target ? 1 : -1; steps++;
    }
    expect(cur).toBe(10); expect(steps).toBe(17); // 3 上 + 14 下
  });
  test('clamp 边界', () => { expect(clamp(-5)).toBe(0); expect(clamp(250)).toBe(100); expect(clamp(56.4)).toBe(56); });
});
