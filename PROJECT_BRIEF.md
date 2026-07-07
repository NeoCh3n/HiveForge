# Project Brief

## Project

- Name: HiveForge
- Repo/path: `/Users/chaoyanchen/Desktop/HiveForge`
- Primary surface: TypeScript/Node CLI processes plus a local web console at `http://localhost:8787`
- Current status: Local MVP scaffold for a multi-agent software factory; filesystem demo works offline, MCP mail and Codex-backed agents are integration targets
- Last updated: 2026-07-07

## One-Sentence Summary

HiveForge is a local-first multi-agent software factory scaffold that coordinates planner, implementer, reviewer, and integrator agents through a mail protocol, workflow state machine, and project memory layer.

## Problem

HiveForge solves the coordination problem of running multiple coding agents on one software task without losing auditability, state, review gates, or institutional memory. It turns ad hoc agent collaboration into a protocol-driven workflow where every issue becomes a thread, every handoff is a message, and completed work is recorded as memory.

## Architecture

- Frontend: Minimal local gateway UI under `services/gateway/public`, served by `services/gateway/server-simple.ts` on port `8787`.
- Backend: Node/TypeScript services under `services/`; `services/orchestrator` owns the workflow state machine and CLI.
- Data/storage: Runtime state, mail, event logs, Codex artifacts, and JSONL memory live under `.hiveforge/`; override with `HIVEFORGE_DATA_ROOT`.
- Agent/LLM layer: Stub agents live in `agents/*`; Codex-backed agents spawn `codex exec` and write artifacts under `.hiveforge/codex/`.
- External services: Vendor MCP mail server via `vendor/mcp_agent_mail`; intended Beads memory backend via `vendor/beads`; VC workflow inspiration under `vendor/vc`.
- Deployment: No production deployment configured; intended usage is local development or future service-backed deployment.

## Current Commands

```bash
# install
npm install

# dev
npm run stack
npm run stack:codex
npm run stack:codex-agents
npm run ui

# test
npm test
npm run typecheck

# build
npm run typecheck

# deploy
# Not configured. This project currently runs locally.
```

## Known Pitfalls

- Auth: Codex-backed agents depend on a working Codex CLI auth/profile; MCP mail may require its own server setup.
- Network: Default mail backend is `mcp` and expects `HIVEFORGE_MCP_BASE_URL` to reach `http://127.0.0.1:8765/mcp/`; tests and offline demos should set `HIVEFORGE_MAIL_BACKEND=filesystem`.
- Build/runtime: Node 20+ is required; Node 24 is recommended because scripts execute TypeScript with `--experimental-strip-types`.
- Deployment: No deploy target or production URL exists yet.
- UI/browser QA: The UI is a lightweight local console; some gateway endpoints are still mock/simple implementations.
- Data/submission format: Protocol truth lives in `schemas/*`; any new message, workflow, or bead shape must update schemas, `types/protocol.ts`, orchestrator behavior, and tests.

## Safety And Privacy Boundaries

- Do not mention: Secrets, tokens, private keys, local `.env` contents, full sensitive payloads, or private runtime data in `.hiveforge/`.
- Can mention: Public architecture, local commands, protocol names, schema names, non-secret environment variable names, and high-level workflow behavior.
- Requires user confirmation: Breaking adapter API changes, schema-breaking protocol changes, dependency additions, release/tag creation, destructive git operations, and any production deployment.
- Secrets/tokens location: Not intentionally stored in repo; Codex/MCP credentials should remain in external CLI or service configuration and must not be committed.

## Current Release State

- Local branch: Current workspace root is not a Git repository; nested `/Users/chaoyanchen/Desktop/HiveForge/project` reports `main...origin/main`.
- GitHub branch/PR: Not available from current workspace context.
- Production URL: None configured.
- Last deployed SHA: None.
- Last known health: Local UI health endpoint is `http://localhost:8787/health` when `npm run ui` is running.

## Resume Copy

### One Line

`HiveForge - Built a TypeScript multi-agent software factory scaffold with protocol-based mail, workflow orchestration, review gates, local memory, and Codex-backed agent runners.`

### Three Lines

- Designed a local-first multi-agent orchestration system with planner, implementer, reviewer, and integrator roles coordinated through schema-validated Mail messages.
- Implemented swappable adapter boundaries for mail and memory so filesystem MVPs can be replaced by MCP Agent Mail and Beads-backed storage without changing orchestrator logic.
- Added CLI, local UI, workflow persistence, event logs, tests, and Codex-backed agent processes for auditable issue-to-result automation.

## Portfolio Copy

### Short Card

HiveForge is a multi-agent software factory prototype that turns one issue into a structured flow: plan, implement, review, merge, and remember. It combines a mail protocol, workflow state machine, and memory beads so agent collaboration is inspectable and replaceable rather than hidden inside one long prompt.

### Case Study

HiveForge explores what a real multi-agent development system needs beyond just calling multiple LLMs. The project defines stable protocols for messages, workflow state, and memory beads, then connects them through thin TypeScript adapters. A local filesystem MVP makes the system easy to run and test, while the architecture leaves clear seams for production backends such as MCP Agent Mail and Beads.

The workflow begins with an `ISSUE` message and moves through planner, implementer, reviewer, and integrator roles. The orchestrator persists per-thread state, logs events by `thread_id`, dispatches tasks, handles blocking reviews, and records completed outcomes into memory. A small local UI provides visibility into threads, mailboxes, events, and memory, while Codex-backed agent processes can spawn fresh `codex exec` runs per task.

The main design goal is auditability: every handoff is a message, every thread has a stable ID, and every completed task can leave behind a memory bead. This makes the system suitable for experimenting with multi-agent software work while keeping protocols and adapters explicit enough to replace local MVP storage with durable services later.

## Interview Explanation

### 60 Seconds

HiveForge is a TypeScript prototype for a multi-agent software factory. Instead of one agent trying to do everything in one session, it models software work as a protocol: an issue becomes a mail thread, the planner writes a plan, the implementer produces a result, the reviewer can block or approve it, and the integrator records the final outcome. The orchestrator is intentionally isolated from backend internals and depends only on stable mail and memory adapters, so the filesystem MVP can later be swapped for real MCP Agent Mail and Beads services.

### 3 Minutes

HiveForge is built around three contracts: Mail, Memory, and Flow. Mail is the coordination layer, with a stable adapter exposing `send`, `poll`, `ack`, and `subscribe`. Memory records project, decision, and task beads through `remember`, `recall`, `link`, and `summarize`. Flow is the orchestrator state machine that turns an `ISSUE` into `PLAN_REQUEST`, `PLAN`, `TASK_REQUEST`, `RESULT`, `REVIEW_REQUEST`, `REVIEW`, `MERGE_REQUEST`, `MERGE_CONFIRMED`, and finally `DONE`.

The important architectural choice is that protocol schemas are the source of truth. Message, workflow, and bead schemas live under `schemas/*`, with TypeScript protocol types under `types/protocol.ts`. The orchestrator uses only the public mail and memory adapter APIs, which keeps vendor integrations out of core workflow logic. That matters because the MVP can run entirely on the local filesystem for tests and demos, while production can later use the vendor MCP mail server and a Beads-backed memory store.

There are four agent roles today: planner, implementer, reviewer, and integrator. The stub agents demonstrate the protocol end to end, and Codex-backed variants can poll mail and spawn fresh `codex exec` runs to produce schema-constrained payloads. Runtime artifacts are written under `.hiveforge/`, including mail, workflow state, events, memory, and Codex outputs.

The result is not just an agent demo; it is an auditable collaboration harness. Every unit of work has a `thread_id`, every transition is logged, reviews can force iteration, and completed tasks are summarized back into memory. The next major step is replacing the local memory adapter with Beads and hardening the MCP mail backend for multi-machine operation.

## Latest Decisions

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-07-07 | Keep protocol truth in `schemas/*` and mirror changes in `types/protocol.ts` plus tests. | Prevent hidden drift between agents, orchestrator, and storage adapters. |
| 2026-07-07 | Keep vendor integrations under `vendor/*` read-only and route all integration through `services/*` adapters. | Preserve upstream updateability and keep core workflow logic independent from backend internals. |
| 2026-07-07 | Use filesystem mail and JSONL memory as the local MVP, with MCP Agent Mail and Beads as swappable backends. | Make the system runnable today while preserving a clear path to durable multi-machine infrastructure. |
| 2026-07-07 | Treat Codex-backed agents as replaceable role processes rather than special orchestrator logic. | Keep the orchestrator provider-agnostic and make agent implementation details isolated. |
