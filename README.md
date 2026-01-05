# HiveForge

统一工程化“多 Agent 软件工厂”脚手架：

- **Flow（vc 思路）**：`services/orchestrator` 把协作固化为状态机（Issue → Plan → Execute → Review → Iterate → Done → Memory）。
- **Mail（mcp_agent_mail 能力对齐）**：`services/mail` 提供统一 `send/poll/ack/subscribe` 接口；MVP 默认用文件系统 inbox/outbox。
- **Memory（beads 能力对齐）**：`services/memory` 提供统一 `remember/recall/link/summarize` 接口；MVP 默认用本地 JSON beads 存储。

上游仓库以 submodule 引入到 `vendor/`，避免直接改动，便于跟 upstream 同步：

- `vendor/mcp_agent_mail`
- `vendor/beads`
- `vendor/vc`

## 目录速览

- `services/`: HiveForge 稳定接口
  - `mail/adapter.ts`: 统一 Mail API（MVP: 本地文件 inbox/outbox）
  - `memory/adapter.ts`: 统一 Memory API（MVP: JSONL beads）
  - `orchestrator/cli.ts`: 状态机 + CLI（issue submit / orchestrator run / demo run）
- `agents/`: 4 个 stub（planner / implementer / reviewer / integrator）
- `schemas/`: Message / Workflow / Bead JSON Schema
- `types/`: TypeScript 协议定义（含 Node 轻量 shims）
- `examples/issue.json`: 演示用 issue
- `vendor/*`: upstream submodule（请勿直接修改）

## Quickstart（本地多进程 Demo）

一条命令启动 orchestrator + 4 个 agent stub，并提交一个示例 issue：

```bash
npm run demo
```

或拆开跑（5 个终端）：

```bash
node services/orchestrator/cli.ts orchestrator run
node agents/planner/agent.ts
node agents/implementer/agent.ts
node agents/reviewer/agent.ts
node agents/integrator/agent.ts

node services/orchestrator/cli.ts issue submit examples/issue.json
```

运行产物默认落在 `.hiveforge/`（消息、线程状态、事件日志、记忆 beads）。

## 开发命令

- `npm run orchestrator`：只跑 orchestrator（需另开 4 个 agent 进程）
- `npm run agent:<role>`：单独跑某个 stub agent
- `npm run typecheck`：`tsc -p tsconfig.json`（仅类型检查，不输出 JS）

Node 24 的 `--experimental-strip-types` 会直接执行 `.ts` 文件，无需转译。

## 协议摘要

- Message（见 `schemas/message.schema.json`）：
  - `type`: ISSUE | PLAN_REQUEST | PLAN | TASK_REQUEST | RESULT | REVIEW_REQUEST | REVIEW | MERGE_REQUEST | MERGE_CONFIRMED | INFO
  - `context_refs`、`acceptance_criteria` 用于上下文与验收传递
- Workflow（见 `schemas/workflow.schema.json`）：状态机轨迹（ISSUE_RECEIVED → … → DONE/ITERATING/ERROR）
- Bead（见 `schemas/bead.schema.json`）：ProjectBead / DecisionBead / TaskBead

## 与 upstream 对齐的路线图

MVP 先用文件系统适配器跑通端到端，后续可以替换为真实服务：

1) Mail：在 `services/mail/adapter.ts` 内接入 `vendor/mcp_agent_mail` 的 HTTP/MCP API（保留相同接口签名）。
2) Memory：在 `services/memory/adapter.ts` 内改为调用 `vendor/beads`（CLI 或库），仍返回/存储统一 Bead 结构。
3) Workflow：`services/orchestrator` 逻辑保持只依赖 mail+memory 适配器，便于替换实现。

## Submodule 提示

```bash
git submodule update --init --recursive    # 初始化
git submodule update --remote vendor/beads # 跟踪 upstream 更新
```

## 清理与调试

- 重置演示数据：`rm -rf .hiveforge/`
- 事件日志：`.hiveforge/events.log`
- 每个线程的状态：`.hiveforge/state/<thread>.json`
- 内存存储：`.hiveforge/memory/beads.jsonl`

## TypeScript/Node 版本

- 运行时：Node >= 20（推荐 24），需要 `--experimental-strip-types`。
- `tsc`：使用本地全局 `tsc`（脚手架不内置依赖），必要时自行 `npm i -D typescript @types/node`。
