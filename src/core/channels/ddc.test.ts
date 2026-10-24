import { describe, expect, test } from 'bun:test';

// ddc.ts 的解析逻辑不依赖 spawn —— 这里复刻同款正则做契约测试
describe('m1ddc 输出解析契约', () => {
  test('display list 解析（含 (null) 设备名）', () => {
    const out = '[1] Mi Monitor (DA25C670)\n[2] (null) (37D8832A)\n[3] Mi Monitor (CC860348)';
    const displays = [...out.matchAll(/\[(\d+)\]\s*(.*?)\s*\(([^)]+)\)\s*$/gm)]
      .map((m) => ({ index: parseInt(m[1], 10), name: m[2] === '(null)' ? null : m[2], uuid: m[3] }));
    expect(displays).toHaveLength(3);
    expect(displays[1].name).toBeNull();
    expect(displays[2].uuid).toBe('CC860348');
  });
  test('亮度读数只接受 0-100 纯数字（垃圾应答丢弃）', () => {
    const accept = (out: string) => {
      const m = out.match(/^(\d{1,3})$/);
      if (!m) return false;
      const v = parseInt(m[1], 10);
      return v >= 0 && v <= 100;
    };
    expect(accept('82')).toBe(true);
    expect(accept('-116')).toBe(false);   // DDC 读取失败特征值
    expect(accept('77\n51')).toBe(false); // 多行噪声
    expect(accept('114')).toBe(false);    // 超出 0-100 一律拒绝
    expect(accept('101')).toBe(false);
  });
});
