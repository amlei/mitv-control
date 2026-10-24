// 双进程共享类型（renderer / API / CLI / MCP 共用的契约面）
// 语义约定见 docs/design/initial-plan.md §5.5：applied/verified/source

export interface MitvBinding {
  host: string;
  lastSeen: number;
}

export interface AdbBinding {
  host: string;
  model: string;
  state: 'device' | 'offline' | 'unauthorized' | 'none';
}

export interface DdcBinding {
  backend: 'mac-helper' | 'win-ddcci';
  target: string;
  available: boolean;
}

export interface MonitorDevice {
  id: string; // 稳定 ID：优先 EDID serial，其次首次发现时间戳
  name: string;
  mitv?: MitvBinding;
  adb?: AdbBinding;
  ddc?: DdcBinding;
  edidVendor?: string; // XMI3009(2026 款 27U) / XMI27B3(2025 款)
}

/** 每个控制动作的统一回执 */
export interface ApplyResult {
  applied: boolean;
  verified: boolean;
  source: 'cache' | 'device';
}
