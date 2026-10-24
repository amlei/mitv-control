# development-workflow — 开发流程

> 何时读：新增/修改代码、验证改动、改依赖/生成物、真机联调。命名与放置问题在
> repo-conventions.md，代码结构在 architecture.md。

## 规范与实现同步

- 必须同步：改产品行为 → initial-plan.md 对应节；改代码结构/数据流 → architecture.md；
  改放置/命名/文案 → repo-conventions.md；改流程/命令 → 本文。
- PR 描述必须包含一行「已同步文档：<文件#锚点>」；无行为变化（样式/重构）可标「无」。
- 同步方式 = 整合改写拥有该主题的节（docs/README.md#文档约定），不得文末追加。

## 运行与调试

| 命令 | 用途 |
|---|---|
| `bun install` | 安装依赖（唯一安装方式） |
| `bun run dev` | Next 开发模式（127.0.0.1:8666，热更新） |
| `bun run typecheck` | TypeScript 7 原生编译器（`tsc --noEmit`） |
| `bun test` | 全部测试（bun test 内置 runner） |
| `bun run lint` / `bun run typecheck` | 静态检查 |
| `bun run build` | next build（生产构建；M1 起 output standalone + electron-builder） |
| `bun run db:migrate` / `db:generate` / `db:studio` | Prisma 流程 |

真机联调纪律（AGENTS.md 硬约束的展开）：

- 默认安全指令 = 读状态、音量±、亮度±。power / changesource / EDID（320Hz）/ 恢复默认
  仅在任务明确要求时发送，且发送前在回复中预告影响。
- 写操作测试后复原：先读原值 → 写测试值 → 读回校验 → 写回原值 → 再读回确认。
- 连接类探测用 `probe/` 既有脚本（scan6095 / scan-ports / tv-test），新探测脚本进 probe/ 并可独立运行。
- 显示器 RSA 授权弹窗、ADB 端口漂移等现场问题按 initial-plan.md 附录 C 处理。

## 验证入口

改动验证顺序：`bun run lint` → `bun run typecheck` → `bun test` → 涉及打包或依赖时 `bun run build`。

M1 起的真机冒烟清单（验收前必跑，安全指令范围内）：
发现设备 → 读音量 → 音量 ±1 并复原 → G Pro 亮度 ±5 并复原 → 普通屏亮度 ±5 并复原。

## 依赖与生成物

- 新增依赖：PR 写明用途与不自己实现的理由；能用 Node/Bun 内置与现有依赖实现的不新增。
- 运行时二进制资源进 `resources/` 并在 initial-plan.md 登记来源与版本（jar×2、adb_guardian.apk、
  ddc-helper 编译产物）；禁止随手下载未登记的二进制。
- 生成物禁改清单（同 AGENTS.md）：`out/`、`dist/`、`src/generated/prisma/**`、`node_modules/`。
- Prisma：schema 变更必须伴随迁移文件一并提交；review 时检查迁移可从空库重放。
- electron-builder 打包清单（resources、Prisma engine、ddc-helper）改动必须跑一次完整
  `bun run build` 验证产物可启动。

## 提交

- Conventional Commits（`feat:` `fix:` `docs:` `chore:` `refactor:` `test:`）。
- 小步提交：一次提交一个意图；文档同步与对应行为改动同一提交。
- 分支：`main` 之上开功能分支；提交前 `bun run lint && bun test` 绿。
