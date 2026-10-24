# repo-conventions — 仓库约定

> 何时读：新建文件/目录/包、写或改代码、改用户可见文案。命名与放置问题以本文为唯一权威。

## 目录职责

| 目录 | 职责 | 禁止放入 |
|---|---|---|
| `src/app/` | Next App Router：UI 面板 + `app/api/*`（LAN 服务/SSE） | 传输实现（属于 core/channels） |
| `src/core/` | 服务端核心：`channels/`(传输) + `services/`(策略) + `types.ts`(契约) | UI/React 代码 |
| `src/generated/prisma/` | Prisma client（生成物，gitignore） | 手写文件 |
| `src/cli.ts` · `src/mcp.ts` | `mitv` 命令 / stdio MCP Server 入口（P2） | 业务策略（复用 core/services） |
| `electron/` | 窗口壳（M1）：main/preload，仅窗口/托盘/自启 | 任何业务逻辑 |
| `prisma/` | schema 与迁移（源码） | 生成物 |
| `src/generated/prisma/` | Prisma client（生成物，gitignore） | 手写文件 |
| `ddc-helper/` | macOS Swift DDC 助手源码（自带 AGENTS.md） | TS 代码 |
| `resources/` | 打包资源：MtkDirectTool.jar、ColorfulLedTool.jar、adb_guardian.apk、ddc-helper 产物 | 随意堆放的大文件 |
| `tests/` | 集成测试（mock server / 协议回放） | 单元测试（同置源码旁） |
| `probe/` | 真机实测脚本（保留作回归探测工具） | 应用代码 |
| `docs/` | 设计与规范文档 | 临时笔记 |
| `designs/` | baoyu-design 原型项目（HTML + JSX，HTTP 预览），每项目一目录 | 应用代码、进打包产物 |

## 代码放置

- 必须一个顶层概念一个目录，新概念先在本文登记目录职责，再写代码。
- 跨入口（UI/CLI/MCP）复用的类型与常量放 `src/core/types.ts` 与 `core/channels/constants.ts`；仅服务端用的放 core 内就近。
- 疑难归属：策略（如音量步进、DDC 真源规则）在 services；传输与重试在 channels。

## 命名

- 文件/目录：kebab-case（`device-registry.ts`）；React 组件文件：PascalCase（`VolumeSlider.tsx`）。
- SSE 事件与 REST 路径命名：`域:动作`（`volume:set`、`device:list`、`preset:apply`），常量集中在 `src/core/ipc-names.ts`（M1 建）。
- Prisma：model PascalCase、字段 camelCase、表名 snake_case（`@@map`）。
- 6095 keycode、ADB settings 键、JNI 寄存器名：一律原样引用字符串常量（集中 `src/main/channels/constants.ts`），不得自造别名或改大小写。

## 代码风格

- Prettier + ESLint（配置在仓库根，`bun run lint` 必须零告警）。
- 错误处理：通道层返回 Result 风格对象 `{ ok, value?, error? }`；业务返回 `{ applied, verified, source }`（语义见 initial-plan.md §5.5）。不抛异常跨越 IPC 边界。
- 禁止 `any` 出现在 IPC 契约（`src/shared/`）与 channel 返回值；内部模块须显式类型。
- 日志：主进程统一 logger（分级 + 设备 id 前缀），渲染进程不得直接 console 打日志进生产。

## 界面文案

- 简体中文；专有名词保留原文（HDMI、FreeSync、Prisma 等）。
- 术语表：设备名显示用户命名，无命名时显示「型号 + 尾号」；通道不可用统一句式
  「{功能}需要{通道}，当前不可用」；置灰必须给原因，不弹错误窗。
- 危险操作（电源、恢复默认、切换信号源）二次确认，文案模板：
  「将{动作}。{影响一句话}。确认执行？」按钮为「确认执行 / 取消」。
- 数值一律带单位与范围（音量 `21/100`、亮度 `56%`），不显示裸数字。
