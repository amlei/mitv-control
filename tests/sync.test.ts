// 同步服务的映射契约（值→名称反向）与集成（mock 6095 音量同步）
import { describe, expect, test } from 'bun:test';
import {
  COLOR_TEMP_NAMES, CROSSHAIR_NAMES, DIMMING_NAMES, GAMUT_NAMES,
  LIGHT_COLOR_NAMES, LIGHT_MODE_NAMES, LIGHT_TEMP_NAMES, MODE_NAMES, RESPONSE_NAMES,
} from '../src/core/channels/constants';

describe('同步反向映射契约', () => {
  test('与写入映射互逆（采样）', () => {
    expect(MODE_NAMES[14]).toBe('标准'); expect(MODE_NAMES[9]).toBe('电影'); expect(MODE_NAMES[10]).toBe('游戏');
    expect(COLOR_TEMP_NAMES[2]).toBe('暖色'); expect(COLOR_TEMP_NAMES[8]).toBe('原色');
    expect(DIMMING_NAMES[3]).toBe('高'); expect(GAMUT_NAMES[6]).toBe('DCI-P3');
    expect(RESPONSE_NAMES[1]).toBe('普通'); expect(CROSSHAIR_NAMES[1]).toBe('十字');
    expect(LIGHT_MODE_NAMES[0]).toBe('照明'); expect(LIGHT_MODE_NAMES[4]).toBe('关闭');
    expect(LIGHT_TEMP_NAMES[0]).toBe('2700K'); expect(LIGHT_COLOR_NAMES[1]).toBe('流金');
  });
  test('未知值不产生名称（保留现状）', () => {
    expect(MODE_NAMES[99]).toBeUndefined();
    expect(COLOR_TEMP_NAMES[7]).toBeUndefined();
  });
});
