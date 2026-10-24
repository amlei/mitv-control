import { describe, expect, test } from 'bun:test';
import { MITV_KEYCODES, MTK_REGISTERS, tvServiceAppProcessCmd } from './constants';

describe('tvServiceAppProcessCmd', () => {
  test('参数以字面量 ${IFS} 分隔，且整体为单引号友好的无空格命令体', () => {
    const cmd = tvServiceAppProcessCmd('/data/data/mitv.service/cache/MtkDirectTool.jar', [
      'MtkDirectTool', 'set', 'g_disp__disp_back_light', '56', '3',
    ]);
    expect(cmd).toStartWith('service call TvService 3 s16 "sh -c eval\\${IFS}CLASSPATH=');
    expect(cmd).toContain('\\${IFS}MtkDirectTool\\${IFS}set\\${IFS}g_disp__disp_back_light\\${IFS}56\\${IFS}3');
    // sh -c 之后的 eval 表达式必须无真实空格（Runtime.exec 按空白切分，${IFS} 由内层 sh 展开）
    const body = cmd.slice(cmd.indexOf('"') + 1, cmd.lastIndexOf('"'));
    const expr = body.slice(body.indexOf('sh -c ') + 6);
    expect(expr).not.toMatch(/ /);
  });

  test('寄存器名与 6095 keycode 原样保留（勿改大小写）', () => {
    expect(MTK_REGISTERS.backLight).toBe('g_disp__disp_back_light');
    expect(MITV_KEYCODES).toContain('volumeup');
  });
});
