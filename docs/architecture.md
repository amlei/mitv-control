# architecture — 模块职责与代码结构

> 何时读：定位模块、改产品行为/架构、动数据层。产品需求与协议事实在 docs/design/initial-plan.md，
> 本文只管代码如何组织。**2026-10-24 已按脚手架定稿（Next.js 16 + TS7），旧 Electron 主进程架构作废。**

## 技术基座（脚手架实测版本）

| 层 | 事实 |
|---|---|
| UI + 本地服务 | **Next.js 16.4.3**（App Router、src 目录、Tailwind v4、Turbopack）——页面与 `app/api/*` 同一服务，端口 8666 |
| 语言 | **TypeScript 7.0.2**（原生编译器，`bun run typecheck` = `tsc --noEmit`） |
| 运行/包管理/测试 | Bun 1.3（`bun.lock` 唯一锁文件，`bun test`） |
| 持久层 | **Prisma 6.19 + SQLite**（Prisma 8 仍为 RC，M2 评估升级） |
| 桌面壳 | Electron（**M1 引入**，仅窗口/托盘/自启，业务为零） |

核心架构转变：**「Electron 主进程即后端」改为「Next.js 服务即后端」**——API 路由、CLI、MCP
三个入口共享 `src/core`；Electron 只是把 `http://127.0.0.1:8666` 装进窗口。

## 模块地图（✅=骨架已建）

```
src/
├─ app/                     # Next App Router（UI + API 一体）
│  ├─ page.tsx              # 控制面板（验收基准 = designs/mitv-control 原型）
│  ├─ api/                  # 原 lanServer 职责 → 路由处理器
│  │  ├─ state/route.ts     # GET 全量状态（M1）
│  │  ├─ events/route.ts    # SSE 状态推送（M1，替代 WS）
│  │  └─ volume|brightness|key|source|preset/route.ts（M1）
│  └─ mobile/               # 手机 PWA 布局（P1，复用组件）
├─ core/                    # 服务端核心：UI 不得直接 import，只经 API/IPC
│  ├─ types.ts              # 契约面 MonitorDevice / ApplyResult ✅
│  ├─ channels/             # 传输层
│  │  ├─ constants.ts       # 6095/ADB/JNI 常量 + tvServiceAppProcessCmd ✅
│  │  ├─ mitv.ts            # 6095 HTTP 客户端 ✅（isalive/getVolume/keyevent/changeSource）
│  │  ├─ adb.ts             # 系统 adb CLI（-P 5038）+ TvService JNI + batchGet ✅
│  │  ├─ ddc.ts             # 平台分发 → mac-helper / node-ddcci（M1）
│  │  └─ discover.ts        # 6095 /24 扫描 + ADB 探测（M1）
│  └─ services/             # 策略层（M1）
│     ├─ device-registry.ts # 发现/绑定/状态机/EDID 识别
│     ├─ volume-service.ts  # getvolume 真源 + 步进队列 + 拖动合并
│     ├─ display-service.ts # 亮度/画面路由到 ADB 或 DDC
│     ├─ preset-engine.ts   # 预设/自动任务（读写 db）
│     └─ state-hub.ts       # 状态唯一聚合点 → SSE 广播
├─ generated/prisma/        # 生成物（gitignore，勿手改）
├─ cli.ts                   # `mitv` 命令入口（P2）
├─ mcp.ts                   # stdio MCP Server（P2）
electron/                   # 窗口壳（M1）：main.ts/preload.ts，业务为零
prisma/                     # schema + 迁移（源码）✅ 四表 + init 迁移
resources/  ddc-helper/  tests/  probe/  designs/  docs/
```

## 依赖规则

- 分层自上而下：`UI(app) → API routes → services → channels → 设备`；
  **禁止反向、禁止跨层**（UI 不 import core；channels 不 import services）。
- `StateHub` 是状态唯一聚合点：channels 只上报，services 只写 StateHub，
  UI/SSE/CLI/MCP 只读 StateHub 或发起动作。
- `db`（Prisma）只被 services 访问；channels 不得碰数据库。
- Next 服务端进程是 **adbkit / m1ddc / node-ddcci 子进程调用的唯一宿主**；Electron 主进程不实现业务。

## 数据流

控制动作：UI / CLI / MCP → API route → service（合并/限流）→ channel（重试）→ 设备 →
结果回填 StateHub → SSE 广播 → UI 更新。UI 侧交互细节以 designs/mitv-control 原型为准
（滑条本地值+松手提交、同类 toast 合并、危险操作弹窗）。

## 进程模型与安全

- dev：`bun run dev` 监听 127.0.0.1:8666；开启手机远程时绑 0.0.0.0，中间件强制 Bearer 令牌。
- Electron 生产：主进程拉起 standalone Next 服务再开窗；`output: 'standalone'`（M1 配置）。
- 正式签名、6095 无鉴权风险、令牌策略 → initial-plan §8 R4/R5。

## 数据层

- Prisma 6.19 + SQLite；`prisma/schema.prisma`：`Device / Preset / OperationLog / Setting` ✅，
  初始迁移 `20261024023800_init` ✅；client 生成到 `src/generated/prisma`（gitignore）。
- **SQLite 无 Json 类型**：结构化数据一律存 String（JSON.stringify），读写处集中解析。
- dev 期 DB = `prisma/dev.db`；运行期 = `userData/mitv.db`（M1 接线：运行时注入 DATABASE_URL）。
- 命令：`bun run db:migrate / db:generate / db:studio`。

## 扩展点

新增通道：实现 Channel 接口（probe/connect/apply/read）→ DeviceRegistry 注册 → 能力探测决定 UI 置灰。
SSE 事件命名与 IPC 一致：`域:动作`。
