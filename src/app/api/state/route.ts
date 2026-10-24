import { NextResponse } from 'next/server';
import { ensureDevices } from '@/core/services/device-registry';
import { ensureSeedPresets } from '@/core/services/preset-engine';
import { syncAll } from '@/core/services/sync-service';

export const runtime = 'nodejs';
export async function GET() {
  const devices = await ensureDevices();
  await ensureSeedPresets().catch(() => {});
  // 后台同步真机状态（程序未运行期间配置可能被遥控器/OSD 改过），完成后经 SSE 推送
  void syncAll().catch(() => {});
  return NextResponse.json({ devices });
}
