# HiveForge Agent Instructions

目标：把 `mcp_agent_mail`（通信）、`beads`（记忆）、`vc`（流程理念）整合成一个可运行的“多 Agent 软件工厂”脚手架。

## 基本约束

- 不要直接修改 `vendor/*`（upstream 仓库）；所有集成通过 `services/*` 适配层完成。
- 协议以 `schemas/*` 为准：消息（Message）、记忆（Bead）、流程事件（Workflow）。
- 适配器稳定接口：
  - `services/mail`：`send/poll/ack/subscribe`
  - `services/memory`：`remember/recall/link/summarize`
  - `services/orchestrator`：只依赖 mail+memory 适配器，不依赖 `vendor/*` 内部结构

## 本地演示

`npm run demo` 会启动：
- `orchestrator` + 4 个 agent stub（planner/implementer/reviewer/integrator）
- 通过文件系统 inbox/outbox 跑通一条端到端线程
