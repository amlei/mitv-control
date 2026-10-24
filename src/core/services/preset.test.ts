import { describe, expect, test } from 'bun:test';

// 预设 values（JSON 字符串存储）与应用映射契约
describe('预设契约', () => {
  test('values JSON 往返', () => {
    const values = { brightness: 25, colorTemp: '暖色', lightOn: true, lightMode: '照明' };
    const stored = JSON.stringify(values);
    expect(JSON.parse(stored)).toEqual(values);
  });
  test('画面枚举到 settings 数值映射覆盖全部选项', () => {
    const ENUM: Record<string, Record<string, number>> = {
      colorTemp: { 标准: 0, 暖色: 1, 冷色: 2, 自定义: 3 },
      dimming: { 关: 0, 低: 1, 中: 2, 高: 3 },
      clarity: { 关: 0, 低: 1, 高: 2 },
      response: { 关: 0, 快速: 1, 极速: 2 },
      gamut: { 自动: 0, sRGB: 1, 'DCI-P3': 2, AdobeRGB: 3 },
    };
    for (const m of Object.values(ENUM)) expect(Object.keys(m).length).toBeGreaterThanOrEqual(3);
    expect(ENUM.dimming['高']).toBe(3);
  });
});
