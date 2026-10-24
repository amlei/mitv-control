// 状态唯一聚合点：channels 只上报，services 只写这里，UI/SSE/CLI/MCP 只读
export interface PictureState {
  mode: string; backlight: number; black: number; contrast: number; saturation: number;
  hue: number; sharpness: number; colorTemp: string; dimming: string; clarity: string;
  response: string; gamut: string;
}
export interface GameState {
  freesync: boolean; hz320: boolean; fps: boolean; crosshair: string;
  dynCross: boolean; scope: boolean; night: boolean;
}
export interface LightState { on: boolean; mode: string; colorName: string; level: number; temp: string; }
export interface DeviceCaps { key: string; tip: string }
export interface DeviceRuntime {
  id: string; name: string; short: string; caps: DeviceCaps[]; ip: string | null; port?: number;
  powerable: boolean; online: boolean;
  brightness: number; volume: number; muted: boolean; source: string; powered: boolean;
  picture: PictureState; game: GameState; light: LightState;
}

export function gproRuntime(id: string, name: string, ip: string, adb: boolean): DeviceRuntime {
  return {
    id, name, short: 'G Pro 27U', ip, powerable: true, online: true,
    caps: [{ key: '6095', tip: 'Wi-Fi：音量 / 遥控 / 信号源 / 电源' }].concat(
      adb ? [{ key: 'ADB', tip: '画面 / 游戏 / 灯效 / 亮度' }] : [],
    ),
    brightness: 56, volume: 21, muted: false, source: 'HDMI 1', powered: true,
    picture: { mode: '标准', backlight: 56, black: 50, contrast: 50, saturation: 50, hue: 50, sharpness: 20, colorTemp: '标准', dimming: '关', clarity: '关', response: '关', gamut: '自动' },
    game: { freesync: false, hz320: false, fps: false, crosshair: '关', dynCross: false, scope: false, night: false },
    light: { on: false, mode: '纯色', colorName: '流金', level: 5, temp: '4000K' },
  };
}

export function mi5kRuntime(id: string, name: string): DeviceRuntime {
  return {
    id, name, short: '小米 5K', ip: null, powerable: false, online: true,
    caps: [{ key: 'DDC', tip: '线控：亮度（校验和验证）' }],
    brightness: 82, volume: 0, muted: false, source: 'HDMI 1', powered: false,
    picture: gproRuntime('x', 'x', 'x', false).picture, game: gproRuntime('x', 'x', 'x', false).game, light: gproRuntime('x', 'x', 'x', false).light,
  };
}

type Listener = (devices: DeviceRuntime[]) => void;

export class StateHub {
  private devices = new Map<string, DeviceRuntime>();
  private subs = new Set<Listener>();

  list(): DeviceRuntime[] { return [...this.devices.values()]; }
  get(id: string): DeviceRuntime | undefined { return this.devices.get(id); }
  hasAny(): boolean { return this.devices.size > 0; }
  seed(d: DeviceRuntime): void { this.devices.set(d.id, d); this.emit(); }
  seedAll(list: DeviceRuntime[]): void { list.forEach((d) => this.devices.set(d.id, d)); this.emit(); }
  remove(id: string): void { this.devices.delete(id); this.emit(); }
  patch(id: string, patch: Partial<DeviceRuntime>): DeviceRuntime | undefined {
    const cur = this.devices.get(id);
    if (!cur) return undefined;
    const next = { ...cur, ...patch } as DeviceRuntime;
    this.devices.set(id, next);
    this.emit();
    return next;
  }
  subscribe(fn: Listener): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }
  private emit(): void {
    const snap = this.list();
    this.subs.forEach((fn) => fn(snap));
  }
}

export const stateHub = new StateHub();
