// ADB 通道 — 通过系统 adb CLI（独立 server 端口 5038），协议见 initial-plan 附录 B
// 注意：单次 JNI get 的 logcat 通道在 OS3.0.120 无输出，读取一律走 batchGet
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { MITV_JAR_CACHE_DIR, MTK_REGISTERS, PIC_MODE_CHANGED_BROADCAST, tvServiceAppProcessCmd, tvServiceShellCmd } from './constants';

const ADB_SERVER_PORT = 5038;
const MTK_JAR = MITV_JAR_CACHE_DIR + '/MtkDirectTool.jar';
// MtkDirectTool.jar 内部硬编码的输出路径（不可改，见 tools 源码）
const BATCH_RESULT = '/sdcard/Download/Mimonitor_Toolbox/.mtk_batch_result.txt';

function adbRun(args: string[], timeoutMs = 12000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('adb', ['-P', String(ADB_SERVER_PORT), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { proc.kill(); reject(new Error('adb timeout: ' + args.join(' '))); }, timeoutMs);
    proc.stdout.on('data', (c) => { out += String(c); });
    proc.stderr.on('data', (c) => { out += String(c); });
    proc.on('close', () => { clearTimeout(timer); resolve(out.trim()); });
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

const connectedUntil = new Map<string, number>();

export class AdbClient {
  constructor(readonly host: string) {}
  serial(): string { return this.host + ':5555'; }

  async ensureConnected(): Promise<boolean> {
    // 连接缓存：30s 内免 get-state（否则每次动作多 2 个 adb 子进程，UI 明显卡）
    if ((connectedUntil.get(this.host) ?? 0) > Date.now()) return true;
    const state = await adbRun(['-s', this.serial(), 'get-state']).catch(() => '');
    if (state.trim() === 'device') { connectedUntil.set(this.host, Date.now() + 30000); return true; }
    await adbRun(['connect', this.serial()]).catch(() => '');
    const again = await adbRun(['-s', this.serial(), 'get-state']).catch(() => '');
    const ok = again.trim() === 'device';
    if (ok) connectedUntil.set(this.host, Date.now() + 30000);
    return ok;
  }

  async shell(cmd: string, timeoutMs = 15000): Promise<string> {
    return adbRun(['-s', this.serial(), 'shell', cmd], timeoutMs);
  }

  async settingsGet(key: string): Promise<string> {
    return (await this.shell('settings get global ' + key)).replace(/\r/g, '').trim();
  }

  /** 批量读 settings（单 shell），返回 key→原始字符串 */
  async settingsGetMany(keys: string[]): Promise<Record<string, string>> {
    const script = keys.map((k) => 'echo ' + k + '="$(settings get global ' + k + ')"').join('; ');
    const out = (await this.shell(script)).replace(/\r/g, '');
    const vals: Record<string, string> = {};
    for (const line of out.split('\n')) {
      const m = line.match(/^([\w.]+)=(.*)$/);
      if (m) vals[m[1]] = m[2].trim();
    }
    return vals;
  }

  async settingsPut(pairs: Record<string, string | number>): Promise<void> {
    const parts = Object.entries(pairs).map(([k, v]) => 'settings put global ' + k + ' ' + v);
    await this.shell(parts.join('; '));
  }

  /** JNI 批量读：batchGet 写结果文件再 cat（OS3.0.120 实测主路径，约 35ms） */
  async batchGet(keys: string[]): Promise<Record<string, number>> {
    const get = tvServiceAppProcessCmd(MTK_JAR, ['MtkDirectTool', 'batchGet'].concat(keys));
    const script = 'mkdir -p /sdcard/Download/mitv; rm -f ' + BATCH_RESULT + '; ' + get +
      ' >/dev/null; i=0; while [ $i -lt 30 ] && [ ! -f ' + BATCH_RESULT + ' ]; do sleep 0.1; i=$((i+1)); done; cat ' + BATCH_RESULT + ' 2>/dev/null';
    const out = await this.shell(script);
    const vals: Record<string, number> = {};
    for (const line of out.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('__') || !t.includes('=')) continue;
      const [k, raw] = t.split('=', 2);
      if (raw.startsWith('ERROR')) continue;
      const n = parseInt(raw, 10);
      if (!Number.isNaN(n)) vals[k] = n;
    }
    return vals;
  }

  /** JNI 写寄存器（upd=3 立即应用） */
  async jniSet(register: string, val: number): Promise<void> {
    await this.shell(tvServiceAppProcessCmd(MTK_JAR, ['MtkDirectTool', 'set', register, String(val), '3']));
  }

  async refreshPq(): Promise<void> {
    await this.shell(PIC_MODE_CHANGED_BROADCAST);
  }

  /** jar 部署：比对 /sdcard 与本地大小，缺失/不符则 push，再经 TvService cp 进 mitv.service 缓存目录 */
  async ensureJar(filename: string, localPath: string): Promise<boolean> {
    let localSize = 0;
    try { localSize = statSync(localPath).size; } catch { return false; }
    const remote = (await this.shell('stat -c %s /sdcard/' + filename + ' 2>/dev/null || echo 0')).trim();
    const remoteSize = parseInt(remote.split('\n').pop() ?? '0', 10) || 0;
    if (remoteSize !== localSize) {
      await adbRun(['-s', this.serial(), 'push', localPath, '/sdcard/' + filename]);
    }
    await this.shell(tvServiceShellCmd(['cp', '/sdcard/' + filename, MITV_JAR_CACHE_DIR + '/' + filename]));
    return true;
  }
}
