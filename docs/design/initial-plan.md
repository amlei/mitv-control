# MiTV 控制中心 — 项目初始方案

> 版本 v1.0 · 2026-10-24 · 本文档是项目的唯一设计基准，所有实现以「已验证事实」一节为前提。
> 目标用户：作者本人（MacBook Pro M5 Pro，macOS 27），同时要求 Windows 可用。

---

## 1. 项目概述

### 1.1 要解决的问题

| 痛点 | 现状 | 本产品 |
|---|---|---|
| 遥控器操作繁琐（音量/亮度/设置都要多层菜单） | 每次都要找遥控器 | 电脑键盘/鼠标/快捷键直达 |
| macOS 键盘音量键对显示器 HDMI 音频无效 | 只能用遥控器 | 走 6095 网络通道精确调音量 |
| 官方小程序/米家功能缺失、步骤繁琐 | 缺亮度、缺深度画面设置 | 全功能面板 + 手机网页版 |
| Crisp 控普通显示器亮度不稳定（滑条与实际亮度脱节） | 不敢用 | 自研 DDC 防御层（见 §5.4） |
| G Pro 深度功能（画面模式/游戏/灯效）无桌面端入口 | 只有第三方 Windows 工具 | 内建 ADB 通道全覆盖 |

### 1.2 控制对象

| 设备 | 类型 | 通道 |
|---|---|---|
| **Redmi 显示器 G Pro 27U 2026**（MiTV-MFFU1 / beekeeper，HyperOS OS3.0.120.0，Android 14，LAN 名「米显」，实测 IP 192.168.0.25，IP 会变必须动态发现） | 智能显示器（内置安卓） | 6095 + ADB + DDC |
| **小米 5K 显示器**（5K@160Hz，非智能款） | 普通显示器 | 仅 DDC |

### 1.3 产品形态

本地 Web 服务（Next.js 16，端口 8666；UI + REST/SSE API 一体）+ Electron 窗口壳（M1 引入：菜单栏/托盘常驻、开机自启）。同一服务出桌面 UI、手机 PWA 与 Agent 接口。双平台：macOS (arm64) + Windows 10/11。

---

## 2. 已验证事实（2026-10-24 实测档案）

### 2.1 通道验证结果

| 通道 | 状态 | 验证内容 |
|---|---|---|
| **6095 HTTP** | ✅ 全通 | isalive / getinstalledapp / getsysteminfo / getvolume / keyevent（音量 21→22→21 实测）；setVolum 签名接口此机 404 不支持 |
| **ADB 5555** | ✅ 全通 | RSA 授权后连接；settings 读写；MtkDirectTool.jar 部署；JNI batchGet 读（35ms）；背光写入 56→57→56 端到端（settings + JNI + 广播） |
| **DDC/CI (m1ddc)** | ⚠️ 本机不可用 | display 1 永久失败；display 3 读数为噪声（连读 8 次：114/77/116/67/-83/-59/-128/-109，无校验）。此前「写入成功」仅为命令回显。**结论：需自研 IOAVService 助手做正确通道配对**（Crisp 证明了该路可走） |

### 2.2 固件差异注意（相对 Mimonitor_Toolbox 适配的 3.0.112）

- **单次 JNI get 的 logcat 通道无输出** → 读取一律走 `batchGet`（写结果文件再 cat），速度也更快。
- 其余协议（TvService 调用格式、settings 键、寄存器名）实测兼容。

### 2.3 测试资产

- `probe/scan6095.mjs` 全网段 6095 发现；`probe/scan-ports.mjs` 多端口扫描 + miio 广播；`probe/tv-test.mjs` 6095 安全测试。
- 测试纪律：**不发 power / changesource / 导航键**（用户屏幕正接着电脑）；写测试必须复原；shell 引号用单引号包 `${IFS}` 字面量。

---

## 3. 总体架构

```
┌─ 本地服务（Next.js 16 · src/app + src/core · 端口 8666）─────────────┐
│ UI（App Router）: 快捷/遥控/画面/游戏/灯效/预设/设置（验收基准=原型）    │
│ API（app/api/*）: state · events(SSE) · volume · brightness · key…    │
│ core/services: DeviceRegistry · VolumeService · DisplayService ·      │
│                PresetEngine · StateHub（状态唯一聚合点）                │
│ core/channels: mitv.ts(6095) · adb.ts(JNI) · ddc.ts · discover.ts     │
│ 三入口共享 core: 桌面 UI + 手机 PWA（本服务）· CLI(mitv) · MCP(stdio)   │
└───────────────┬──────────────────┬──────────────────┬────────────────┘
           6095 HTTP           ADB :5555          DDC/CI(视频线)
                ▼                  ▼                  ▼
         G Pro 27U（澎湃OS）  G Pro 27U（安卓）    两台显示器
      （Electron 壳 M1 引入：仅窗口/托盘/自启，加载 127.0.0.1:8666）
```

分工原则：**音量/按键/电源/信号源 → 6095；深度画面/游戏/灯效 → ADB；亮度（普通屏）与无网兜底 → DDC**。G Pro 亮度优先走 ADB（画面设置层真实背光，双模式有效）。

### 安全设计

- 6095 本身**无任何鉴权**（小米设计，无法修复）→ 文档中明示风险。
- 内嵌 LAN Server 默认绑定 `127.0.0.1`；开启手机远程时绑定 `0.0.0.0` 并强制访问令牌（首启随机生成，二维码展示）。
- 电源键 UI 二次确认；危险操作（恢复默认、EDID/320Hz 切换）二次确认。

---

## 4. 功能规格（分期）

### P0 — 可用版（先跑通日常高频操作）

| 功能 | 通道 | 说明 |
|---|---|---|
| 设备发现与绑定 | 6095 | 全网段扫 6095 + isalive 取设备名；多设备列表可切换；IP 变化自动重发现 |
| 音量滑块 + 静音 | 6095 | getvolume 实时读（maxVolume=100，1 格=1%）；拖动合并写入（§5.2） |
| 遥控面板 | 6095 | 方向/OK/主页/返回/菜单/电源；键盘方向键直接映射；电源二次确认 |
| 信号源切换 | 6095 | HDMI1/2（DP/USBC 走 ADB 或 DDC，P1 补齐）；切换前确认（会打断当前屏） |
| G Pro 亮度 | ADB | picture_backlight 滑块（§5.3 写入链路）；未连 ADB 时置灰并引导向导 |
| 连接向导 | — | 图文引导开 ADB（设置→关于→连点产品型号 7 次→账号与安全→ADB 调试允许）→ 自动扫 5555 → 引导 RSA 确认 → 自动部署 jar → 可选装保活 APK |

### P1 — 完整版

| 功能 | 通道 | 说明 |
|---|---|---|
| 画面全项设置页 | ADB | 模式/背光/黑色级别/对比度/饱和度/色调/锐度/色温/精密控光/动态清晰度/响应时间/色域（键与寄存器清单见附录 B） |
| 普通屏 DDC 亮度/音量 | DDC | 自研助手（§5.4）；自动探测可用通道，不可用置灰 |
| 预设系统 | ADB | 命名预设 = {settings 键: 值} + 可选寄存器快照；一键套用/恢复 |
| 菜单栏/托盘快捷控制 | — | 音量/亮度/预设直调，可自定义条目 |
| 全局快捷键 | — | 音量±、亮度±、预设切换、静音 |
| 手机 PWA 远程 | LAN Server | 同一套 UI 的移动布局；令牌登录；同网段直连，跨网段用 Tailscale |
| 信号源 DP/USBC | ADB | ADB 可用时补齐 |
| 开机自启 + 常驻 | — | 登录自启，关闭窗口=收进菜单栏/托盘 |

### P2 — 扩展版

| 功能 | 说明 |
|---|---|
| 游戏模式全家桶 | 准星/动态准星/狙击镜/夜视/320Hz/FreeSync/FPS 计数（ADB 键）；准星仅游戏模式生效的联动记忆 |
| 炫彩灯 | ColorfulLedTool.jar：模式/颜色/亮度/照明色温 |
| HDR/SDR 联动 | 检测 HDR 状态，进出 HDR 自动记忆/恢复分区控光 |
| 自动任务 | 按时间段自动套用/还原预设 |
| Agent 接入：CLI + MCP | 本应用不内置 AI；暴露 CLI 子命令与 MCP Server 供外部 Agent 调用（§5.8） |
| 小爱同学/HA 桥接 | 经 Home Assistant 暴露实体（小爱无第三方直连） |
| 实验性：免 ADB Agent | 显示器端常驻 App 直接调 TvService（§8 风险 R6） |

---

## 5. 关键设计

### 5.1 设备注册表与通道绑定

```ts
interface MonitorDevice {
  id: string                 // 稳定 ID：优先 EDID serial，其次首次发现时间戳
  name: string               // 用户可改名
  mitv?: { host: string; lastSeen: number }        // 6095
  adb?:  { host: string; model: string; state: 'device'|'offline'|'unauthorized'|'none' }
  ddc?:  { backend: 'mac-helper'|'win-ddcci'; target: string; available: boolean }
  edidVendor?: string        // XMI3009(2026款 27U) / XMI27B3(2025款) 自动识别
}
```

- 发现：6095 扫描（isalive）、ADB 扫描（getstate→getprop model）、DDC 枚举（mac 助手按 IORegistry 邻近配对；win 枚举）。
- 三通道结果做**候选合并**，用户在设置页确认绑定（同型号多台时手动指定）。
- 某通道不可用 → 对应功能**置灰**并显示原因，永不报错弹窗轰炸。

### 5.2 音量策略（6095）

- 真源 = 显示器 `getvolume`（maxVolume=100）；UI 拖动 → 目标百分比 → 与当前差值 → keyevent 步进队列（45ms/步，方向合并），写完再读一次校准。
- 拖动中连续变化：只保留最新目标，取消未发出的旧步进。
- `setVolum` 签名接口在能力探测（404）后永久跳过，保留代码路径以兼容其他机型。
- 静音：`keycode=mute` 待实测验证（MiTV-Remote 未找到可用静音键）；无效则静音=步进到 0/恢复原值，UI 上如实标注。

### 5.3 ADB 会话管理

- 传输：`@devicefarmer/adbkit`（纯 JS ADB 协议，Mac/Win 免带 adb 二进制；独立 server 端口 5038，避免与用户本机 adb 冲突）。
- 状态机：`none → unauthorized（引导用户在显示器上按 RSA 确认）→ device ⇄ offline`；断线自动重连（先 disconnect 清 stale transport 再 connect，Toolbox 同款经验）。
- jar 自动部署：比对 `/sdcard/` 与本地大小 → push → TvService `cp` 到 `/data/data/mitv.service/cache/`；两个 jar（MtkDirectTool / ColorfulLedTool）随应用资源打包。
- 读取：**一律 batchGet**（单次 get 的 logcat 通道在本固件无输出）；结果文件路径自建目录（不复用 Toolbox 的）。
- 写入链（画面类）：`settings put global <key> <v>`（双键如 picture_backlight + xiaomi_picture_backlight）→ JNI `set <register> <v> 3` → 广播 `am broadcast -a com.xiaomi.mitv.action.PIC_MODE_CHANGED --ei picmode 7` → batchGet 校验。
- 可选部署 adb_guardian APK（Toolbox 资产）保活 5555 跨重启/待机。
- 命令构造：`${IFS}` 分隔符字面量模板见附录 B，统一封装一个 `tvServiceCmd(args)` 函数，禁止散落拼字符串。

### 5.4 DDC 防御设计（修 Crisp 之病）

> 根因结论（实测+Crisp ddc-notes 佐证）：滑条与实际亮度脱节 = 垃圾应答的**假 max 值污染写入比例** + **未验证读回值回灌 UI** + HDR 下显示器**丢弃写入却回执**。

自研 `ddc-helper`（macOS：Swift + IOAVService，MIT 的 Crisp `DDCService.swift` 为参考实现，裁剪至亮度/音量/输入源；Windows：node-ddcci）：

1. **UI 唯一真源是本地缓存状态**：滑条显示「最后确认写入的值」；未通过校验的读回值**永不**触碰 UI。
2. 盲写 + 校验和验证的读：每个应答验 header+checksum（DDC/CI 规范），垃圾帧直接丢弃。
3. max 值合法性检查：0、255、>1000 一律拒绝，回退 100，并缓存。
4. 滑条拖动合并：latest-wins，50ms 地板；每笔写带代际令牌，迟到的旧应答作废。
5. 读隔离：连续 6 次失败停读 10 分钟（防把脆弱控制器打到假死）；>3s 的无应答立即隔离（防 6s/次的 deaf 通道拖垮体验）。
6. HDR 模式检测：HDR 下 DDC 亮度写可能被丢弃 → 降级软件 gamma 并提示。
7. 通道↔显示器配对：IORegistry 邻近遍历（位置→厂商/产品/序列号→遍历序兜底），显示拓扑变化全量刷新映射——**绝不使用显示器编号索引**（m1ddc 在本机的失败根源）。
8. 每显示器独立串行队列：一台卡死不拖累另一台。

**三平台传输实现（2026-10-25 定稿）**：

| 平台 | 传输 | 自研代码 |
| --- | --- | --- |
| macOS | IOKit IOAVService（Apple Silicon 唯一正规 DDC 通道） | **自研 Swift 助手 `ddc-helper/`**（单文件 swiftc 编译随应用打包）：IORegistry 邻近遍历做 DDC 通道↔显示器精确配对（修 m1ddc 多屏配错对的根因）+ 每应答验 DDC/CI 校验和（垃圾帧全拒）+ `list/get/set` JSON CLI |
| Windows | Win32 dxva2.dll Get/SetVCPValue（系统中介） | node-ddcci（N-API 预编译），零自研 |
| Linux | spawn ddcutil（社区怪癖库） | 接口预留，暂不打包 |

Node 侧职责不变：缓存真源、拖动合并、失败隔离——helper 只做传输。效果边界：写入 100% 可靠；读取「合法或如实未确认」，不再出现假值。

### 5.5 UI 状态同步

- 服务端 StateHub 持有全部设备状态（含缓存真源）；UI 经 SSE 订阅，REST/CLI/MCP 复用同一状态层（手机与桌面看到一致状态）。
- 每个控制动作返回 `{applied: boolean, verified: boolean, source: 'cache'|'device'}`，UI 据此展示「已生效/已发送未确认」。

### 5.6 键盘与快捷键

- 面板聚焦时：方向键→遥控方向，Enter→OK，Esc→返回，Home→主页，PgUp/PgDn→音量。
- 全局快捷键（P1）：可配置组合，默认 `⌥⌘V/±` 音量、`⌥⌘B/±` 亮度、`⌥⌘M` 静音。

### 5.7 手机远程与 PWA（P1）

- **PWA**：`src/app/manifest.ts` 生成 webmanifest（name/short_name、`display: standalone`、主题色 #131318、192/512 图标）；`layout.tsx` 补 `appleWebApp` 元数据——手机「添加到主屏幕」即独立全屏应用。
- API 路由（`src/app/api/*`）：`GET /api/state`、`GET /api/events`（SSE）、`POST /api/volume {value}`、`POST /api/brightness {display, value}`、`POST /api/key {key}`、`POST /api/preset/:id`、`POST /api/sync`；鉴权见下。
- **来源鉴权（agent-guard）**：Host 为 localhost/127.0.0.1 的请求直接放行（本机 UI 零打扰）；其余来源必须 `Authorization: Bearer <令牌>`，否则 403（SSE 同样校验）——服务始终绑 0.0.0.0，无需重启切绑定。
- 令牌：首次启用随机生成存 Setting 表；设置→手机远程 显示/复制/重生成（重生成旧令牌即失效）。仓库中无任何密钥。
- 手机浏览器打开 `http://<电脑IP>:8666`，输入令牌后可「添加到主屏幕」当 PWA。

### 5.9 真机状态同步 ✅

- 场景：程序未运行期间显示器可能被遥控器/OSD/其他工具改动 → 需要读回真机状态而不是显示缓存假设值。
- 触发：`POST /api/sync`（可指定 device）+ `/api/state` 首次 GET 触发后台同步 + 设置→设备「同步真机状态」按钮；完成后经 SSE 推送全部客户端。
- 读回：音量(6095 getvolume)；画面全项/游戏/灯效(ADB settingsGetMany 单 shell 批量 + batchGet 寄存器)；信号源(`mitv.tvplayer.hdmi.last.source`，尽力)；5K 亮度(DDC 重试读，失败保持缓存)。
- 读不到（如实标注）：静音状态（6095 无回读接口）、电源开关（推断：6095 不可达即 offline）。
- 值冲突策略：寄存器 batchGet 优先（硬件真值），settings 兜底；反向映射未知值保留现状不猜。

### 5.8 Agent 接入：CLI + MCP（P2）

- **本应用不内置 AI**：把控制面以 **CLI** 与 **MCP** 形式暴露，供外部 Agent（Claude、Cursor 等）调用。
- CLI：`mitv <command>`（list / volume / brightness / mute / key / source / preset / light），`--display` 选设备；脚本、快捷指令可直接调用。
- MCP：`mitv mcp`（stdio）暴露 tools：`list_devices / set_volume / set_brightness / press_key / set_source / apply_preset / set_light`；Agent 在 mcpServers 加一条配置即接入。
- CLI 与 MCP 复用主进程 services 与 StateHub，与 UI/REST 同一动作面和验证语义（applied / verified / source）。
- 手机侧：iOS 快捷指令 / 任何支持 HTTP 的 Agent 走 LAN Server REST（§5.7 不变）。
- 小爱同学：无第三方直连 → 经 Home Assistant 桥接暴露实体（不变）。

---

## 6. 技术选型与项目结构

| 层 | 选型 | 理由 |
|---|---|---|
| 壳 | Electron（M1 引入，仅窗口/托盘/自启） | Windows 支持 + 常驻体验；业务全部在 Next 服务端 |
| UI + 本地服务 | Next.js 16.4.3（App Router + API routes + SSE）+ Tailwind v4 | 用户选定；UI 与 LAN 服务同进程，手机 PWA 复用 |
| 语言 | TypeScript 7.0.2（原生编译器，`tsc --noEmit`） | 用户指定；typecheck 提速 |
| UI | React 18 + Vite + Tailwind + shadcn/ui | 组件现成（滑块/按钮网格/命令面板）；同一套 UI 出桌面与手机 PWA |
| ADB | @devicefarmer/adbkit | 纯 JS，免 adb 二进制依赖 |
| DDC | macOS：自研 Swift 助手（IOAVService）；Win：node-ddcci | m1ddc 实测在本机不可用（§2.1）；Windows 原生 API 可靠 |
| 包管理/脚本/测试 | Bun（`bun.lock` 唯一锁文件，`bun test`） | 用户选定；自带 runner 免配置 |
| 持久层 | Prisma + SQLite | 设备注册表/预设/操作日志本地持久化，迁移可审计；详见 docs/architecture.md#数据层 |
| 打包 | electron-builder（dmg + NSIS） | **必须正式签名**：macOS 15+ 本地网络权限靠稳定代码身份记忆授权，ad-hoc 会静默拒绝（Toolbox mac 版踩坑实录） |

```
mitv/
├─ docs/design/initial-plan.md   # 本文档
├─ designs/mitv-control/         # 已定稿交互原型（baoyu-design）
├─ probe/                        # 真机实测脚本（保留作回归探测）
├─ resources/                    # jar ×2、adb_guardian.apk、ddc-helper 产物（M1 起填充）
├─ prisma/                       # schema + 迁移（源码，Prisma 6 + SQLite）✅
├─ src/
│  ├─ app/                       # Next：UI + app/api/*（LAN 服务）+ SSE
│  ├─ core/                      # channels(mitv/adb/ddc/discover) + services + types ✅骨架
│  ├─ generated/prisma/          # 生成物（gitignore）
│  ├─ cli.ts                     # mitv 命令（P2）
│  └─ mcp.ts                     # stdio MCP Server（P2）
├─ electron/                     # 窗口壳（M1）：main/preload，业务为零
├─ ddc-helper/                   # macOS Swift 助手源码（M1）
└─ tests/                        # bun test（✅ constants 冒烟）
```

---

## 7. 里程碑

| 里程碑 | 内容 | 验收标准 |
|---|---|---|
| M0 骨架 ✅（2026-10-24） | Next.js 16 + TS7 脚手架、Prisma 四表迁移、core 协议骨架 + 单测 | `bun run typecheck` / `bun test` / `bun run dev` 全绿 |
| M1 = P0 | 发现/绑定 + 音量 + 遥控 + 源切换 + G Pro 亮度 + 连接向导 | 断网重连不崩；音量拖动与实际一致；亮度 0-100 实测 |
| M2 = P1 | 画面全项 + DDC 普通屏 + 预设 + 快捷键 + 手机 PWA | 普通屏滑条与实际亮度恒一致；手机可完整遥控 |
| M3 = P2 | 游戏/灯效/CLI+MCP/HA 桥接 | 按需 |

---

## 8. 风险与对策

| # | 风险 | 对策 |
|---|---|---|
| R1 | 小米封堵 ADB/JNI（Toolbox 作者明言「且用且珍惜」） | 通道模块化：6095+DDC 兜底日常功能不受影响；深度功能降级提示而非崩溃 |
| R2 | 显示器重启/待机后 ADB 失效 | adb_guardian APK 部署 + 状态机自动重连 + 向导重修 |
| R3 | DDC 控制器假死（写入 wedged） | 防御 §5.4 全套；文档写恢复三步（OSD 唤醒→重插线→断电 10s） |
| R4 | 6095 无鉴权，同网段任何人可控制 | 无法修复，向导中提示用户；我们自己的 LAN Server 强制令牌 |
| R5 | macOS 本地网络权限静默拒绝 | 正式签名（非 ad-hoc），bundle id 固定 |
| R6 | 固件升级改协议 | 启动时能力探测（isalive feature 列表 / batchGet 试读），按探测结果开关功能 |
| R7 | IP 漂移 | 每次唤醒自动重扫 + DHCP 保留建议 |

---

## 附录 A：6095 协议速查（已验证）

```
基址 http://<ip>:6095   成功判定: HTTP 200 且 body 含 "msg":"success"

GET /request?action=isalive
  → {status:0, msg:"success", data:{devicename:"米显", ip, feature:["power"], platform, version}}
GET /controller?action=getinstalledapp&count=1      # 可用性探测
GET /controller?action=getsysteminfo
  → data:{wifimac, ethmac, deviceid}                # setVolum 签名用
GET /controller?action=getvolume
  → data:{stream:"music", maxVolume:100, volume:21}
GET /controller?action=keyevent&keycode=<key>       # key: up/down/left/right/enter/home/back/menu/power/volumeup/volumedown（mute 未验证）
GET /controller?action=changesource&source=hdmi1|hdmi2
GET /general?action=setVolum&volum=<v>&ts=<ts>&sign=<md5>   # 本机 404
  sign = md5("mitvsignsalt&<volum>&<mac去冒号小写>&<ts>")
```

## 附录 B：ADB / JNI 速查（已验证）

```
# 设备
adb connect <ip>:5555        # 首次需在显示器上确认 RSA
adb -s <ip>:5555 shell getprop ro.product.model    # → MiTV-MFFU1

# 设置读写
adb shell settings get global picture_backlight
adb shell settings put global picture_backlight 56    # 双键: + xiaomi_picture_backlight

# TvService JNI（${IFS} 为字面量，外层单引号）
service call TvService 3 s16 "sh -c eval\${IFS}CLASSPATH=/data/data/mitv.service/cache/MtkDirectTool.jar\${IFS}/system/bin/app_process\${IFS}/data/data/mitv.service/cache\${IFS}MtkDirectTool\${IFS}<set|batchGet>\${IFS}<key>[\${IFS}<value>\${IFS}<upd=3>]"

# 读：一律 batchGet → 结果写 /sdcard/.../.mtk_batch_result.txt（自建目录）→ cat
#   单次 get + logcat 在 OS3.0.120 无输出，勿用
# 写后生效：
adb shell am broadcast -a com.xiaomi.mitv.action.PIC_MODE_CHANGED --ei picmode 7

# jar 部署（缺失/大小不符时）
adb push MtkDirectTool.jar /sdcard/
service call TvService 3 s16 "sh -c eval\${IFS}cp\${IFS}/sdcard/MtkDirectTool.jar\${IFS}/data/data/mitv.service/cache/MtkDirectTool.jar"

# settings 键: picture_mode picture_backlight(+xiaomi_) picture_brightness(黑电平)
#   picture_contrast picture_saturation picture_hue picture_sharpness
#   picture_red/green/blue_gain(524-1524, 中值1024) atmosphere_light_illumination(1-15)
#   front_sight_index mt_game_dynamic_ft mt_game_scope mt_game_scope_night
# JNI 寄存器: g_disp__disp_back_light g_video__clr_temp g_video__clr_gain_r/g/b
#   g_video__vid_gamut_mapping_mode g_video__vid_local_dimming(0-3)
#   g_video__freesync_switch g_fusion_picture__hdmi_edid_version(320Hz)
#   g_fusion_picture__pic_reset_def_bypicmode(恢复默认, 危险)
```

## 附录 C：G Pro 开启 ADB 步骤（向导文案来源，已验证）

1. 设置 → 关于 → **连续点击「产品型号」7 次**（本机无传统版本号；原地点无效时「点一下→移开焦点→移回→再点」）
2. 设置 → 账号与安全 → **ADB 调试 = 允许**，开启无线调试
3. 电脑首连时**显示器屏幕上确认 RSA 弹窗**
4. 建议：路由器为显示器做 DHCP 保留；部署 adb_guardian 保活
