# AGENTS.md — mitv 控制中心

Redmi G Pro 27U + 小米显示器的桌面操控中心（Electron）。产品需求、三通道协议、
实测事实见 `docs/design/initial-plan.md`；本文只放跨任务硬约束与阅读入口。

技术栈：Next.js 16（App Router；UI + 本地 API/SSE，端口 8666；ADB 经系统 adb CLI -P 5038）· TypeScript 7（原生编译器）
· Prisma 6 + SQLite（本地持久层）· Bun（包管理/脚本/测试）· Electron 窗口壳（M1）+ electron-builder。

## 硬约束（违反即缺陷）

- 包管理器只用 Bun：依赖一律 `bun add`；锁文件只认 `bun.lock`，
  不得引入 package-lock.json / pnpm-lock.yaml / .npmrc 链接器配置。
- 构建入口：`bun run dev`（Next, 8666）/ `bun run build` / `bun run lint` / `bun run typecheck`（TS7 原生）；
  测试 `bun test`；不得绕过脚本直接调 tsc / next / electron。
- Prisma：改 schema 必须走 `bun run db:migrate`（内部 `bunx prisma migrate dev`），
  client 重生成走 `bun run db:generate`；`prisma/migrations/**` 是源码必须提交，
  不得改写或删除已应用的迁移；`src/generated/prisma/**` 禁止手改。
- 生成物禁止手改：`out/`、`dist/`、`src/generated/prisma/**`、`node_modules/`。
- 进程边界：渲染进程不得直接访问 Node / 网络 / 显示器通道，一律经 preload IPC 白名单；
  通道实现（6095 / ADB / DDC）不得 import 任何 UI 代码。
- 真机联调纪律：对真实显示器默认只发安全指令（读状态、音量±、亮度±）；
  power / changesource / EDID / 恢复默认类指令仅在任务明确要求时发送；
  任何写操作测试后必须复原原值（步骤见 docs/development-workflow.md#运行与调试）。
- 测试与源码同置：单测 `*.test.ts` 放被测模块旁，集成测试放 `tests/`；
  行为改动必须带对应测试（bun test）。

## 按需阅读（先按表定位 → 只读命中文档的 1–3 个相关章节；不通读 docs/）

| 何时 | 读什么 |
|---|---|
| 定位模块 / 运行调试 | docs/architecture.md#模块地图 · docs/development-workflow.md#运行与调试 |
| 新建文件 / 目录 / 包 | docs/repo-conventions.md#目录职责 · docs/repo-conventions.md#命名 |
| 新增或修改代码 | docs/development-workflow.md#规范与实现同步 · docs/repo-conventions.md#代码风格 |
| 动 6095 / ADB / DDC 协议行为 | docs/design/initial-plan.md#5-关键设计 与 附录A/B |
| 改数据库 schema / 持久化 | docs/architecture.md#数据层 · docs/development-workflow.md#依赖与生成物 |
| 改产品行为 / 架构 | docs/design/initial-plan.md 对应节 + docs/architecture.md |
| 验证改动 | docs/development-workflow.md#验证入口 |
| 改用户可见文案 | docs/repo-conventions.md#界面文案 |
| 改依赖 / 打包资源 / 生成物 | docs/development-workflow.md#依赖与生成物 |
| 修改本文件或 docs/ 内任何文档 | docs/README.md#文档约定 |

局部协议：`ddc-helper/`（macOS Swift 助手，M1 起存在）创建时同步建自己的 AGENTS.md，
进入该目录以其为准。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
