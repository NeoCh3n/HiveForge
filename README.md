# Agent Harness Observatory

Evaluation framework for comparing agent workflow architectures under shared tasks, tools, memory policies, and success criteria.

HiveForge is a TypeScript harness for running single-agent and multi-agent workflows through the same protocol surface, then inspecting the resulting execution artifacts. It combines a workflow state machine, mailbox-style tool coordination, persistent memory beads, and a local observability UI so different orchestration patterns can be compared with repeatable inputs.

## Stack

- TypeScript / Node
- Agent workflow orchestration
- Tool-calling protocol via Mail adapters
- Persistent state and memory beads
- Structured trace and workflow evaluation artifacts
- Codex-backed agent runners

## What It Evaluates

- **Workflow architecture:** planner-executor flows, reviewer loops, approval gates, integration handoff, and retry/iteration behavior.
- **Memory strategy:** isolated task context, shared working state, and persistent execution history through ProjectBead, DecisionBead, and TaskBead records.
- **Execution traces:** agent decisions, mailbox messages, tool handoffs, state transitions, retries, task outcomes, and completion memory.
- **Trade-offs:** task success, tool efficiency, iteration count, context growth, recovery behavior, latency proxies from timestamps, and failure modes.

## Core Components

- `services/orchestrator`: state machine for Issue -> Plan -> Execute -> Review -> Iterate -> Approval -> Merge -> Done.
- `services/mail`: adapter surface for `send`, `poll`, `ack`, and `subscribe`; default backend targets `mcp_agent_mail`, with a filesystem fallback for tests and offline runs.
- `services/memory`: persistent bead API for `remember`, `recall`, `link`, and `summarize`; the local MVP stores JSONL beads.
- `agents`: planner, implementer, reviewer, and integrator agents, available as protocol stubs or Codex-backed workers.
- `services/gateway`: local web console for inspecting workflow state, mailboxes, memory, and event logs.
- `schemas`: JSON Schemas for messages, workflow state, and memory beads.

Upstreams are pulled in as submodules under `vendor/` and should not be modified directly:

- `vendor/mcp_agent_mail`
- `vendor/beads`
- `vendor/vc`

## Repository Layout

- `agents/`: planner / implementer / reviewer / integrator agents.
- `examples/issue.json`: sample task input for the local demo.
- `schemas/`: Message, Workflow, and Bead JSON Schema definitions.
- `services/gateway/`: local UI and dashboard API.
- `services/hf/`: helper CLI for mail and memory operations.
- `services/mail/adapter.ts`: tool-calling mailbox adapter.
- `services/memory/adapter.ts`: persistent memory adapter.
- `services/orchestrator/`: workflow state machine and CLI.
- `services/run/`: all-in-one stack launchers.
- `tests/`: unit tests for mail, memory, and workflow transitions.
- `types/`: TypeScript protocol definitions.

## Quickstart

Run a local multi-process demo with the orchestrator, four stub agents, and a sample issue:

```bash
npm run demo
```

Artifacts land in `.hiveforge/`:

- `.hiveforge/state/<thread>.json`: per-thread workflow state and transition history.
- `.hiveforge/events.log`: timestamped execution trace.
- `.hiveforge/memory/beads.jsonl`: persistent task and decision memory.
- `.hiveforge/mail/`: filesystem mailbox data when using the offline backend.

## All-In-One Stack

Run orchestrator, stub agents, and UI together:

```bash
npm run stack
# UI: http://localhost:8787
```

## Multi-Codex Mode

Run the orchestrator and UI, then open one Codex session per role. Each agent polls Mail and replies with schema-constrained payloads.

```bash
npm run stack:codex
```

In four other terminals:

```bash
npm run codex:planner
npm run codex:implementer
npm run codex:reviewer
npm run codex:integrator
```

Inside each Codex session:

```bash
npm run hf -- mail poll planner
npm run hf -- mail reply planner <msg_id> --type PLAN --payload-file plan.json --ack
```

## Codex-Backed Agent Workers

This mode starts long-running agent processes that spawn a fresh `codex exec` run for each incoming Mail message.

```bash
npm run stack:codex-agents
```

Then submit issues through the UI or CLI:

```bash
node services/orchestrator/cli.ts issue submit examples/issue.json
```

## UI

Start the local gateway:

```bash
npm run ui
# open http://localhost:8787
```

The richer gateway in `services/gateway/server.ts` reads local state, event logs, memory beads, and mailboxes. `server-simple.ts` is a lightweight static gateway used by the current `npm run ui` script.

## Dev Commands

- `npm run orchestrator`: run the orchestrator only.
- `npm run agent:<role>`: run a specific stub agent.
- `npm run agent:<role>:codex`: run a specific Codex-backed agent worker.
- `npm run stack`: run orchestrator, stub agents, and UI.
- `npm run stack:codex`: run orchestrator and UI for manual multi-Codex operation.
- `npm run stack:codex-agents`: run orchestrator, UI, and Codex-backed workers.
- `npm run hf -- <command>`: use the helper CLI for mail and memory.
- `npm run typecheck`: type-check the project.
- `npm test`: run the local test suite.

Node 24's `--experimental-strip-types` executes `.ts` files directly; Node 20+ is the baseline.

## Protocols

- Message (`schemas/message.schema.json`): `ISSUE`, `PLAN_REQUEST`, `PLAN`, `TASK_REQUEST`, `RESULT`, `REVIEW_REQUEST`, `REVIEW`, `MERGE_REQUEST`, `MERGE_CONFIRMED`, `INFO`.
- Workflow (`schemas/workflow.schema.json`): `ISSUE_RECEIVED` through `DONE`, with `ITERATING` and `ERROR` states for recovery paths.
- Bead (`schemas/bead.schema.json`): `ProjectBead`, `DecisionBead`, and `TaskBead` for persistent execution history.

## Mail Backend

By default, `services/mail` targets the vendor MCP server:

```bash
export HIVEFORGE_MCP_BASE_URL="http://127.0.0.1:8765/mcp/"
export HIVEFORGE_MCP_PROJECT_KEY="$(pwd)"
export HIVEFORGE_MCP_AGENT_SCOPE=model
export HIVEFORGE_MCP_SHARED_AGENT_IDS="planner,implementer,reviewer,integrator"
```

For local tests or offline runs:

```bash
export HIVEFORGE_MAIL_BACKEND=filesystem
```

If `HIVEFORGE_MCP_PROJECT_KEY` is set to a relative name, HiveForge resolves it to `.hiveforge/projects/<name>`.

## Codex Provider

Codex-backed agents call the Codex CLI:

```bash
export HIVEFORGE_CODEX_PROVIDER=openai
export HIVEFORGE_CODEX_MODEL="gpt-5.2"
export HIVEFORGE_CODEX_PROFILE="default"
```

For local OSS models, set `HIVEFORGE_CODEX_PROVIDER=oss` and ensure Ollama is running.

## Submodules

```bash
git submodule update --init --recursive
git submodule update --remote vendor/beads
```

## Cleanup And Debug

- Reset demo data: `rm -rf .hiveforge/`
- Event log: `.hiveforge/events.log`
- Per-thread state: `.hiveforge/state/<thread>.json`
- Memory store: `.hiveforge/memory/beads.jsonl`
