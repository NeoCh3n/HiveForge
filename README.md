# HiveForge

A unified “multi-agent software factory” scaffold that combines:

- **Flow (vc-inspired):** `services/orchestrator` codifies collaboration as a state machine (Issue → Plan → Execute → Review → Iterate → Done → Memory).
- **Mail (aligned with mcp_agent_mail):** `services/mail` exposes `send/poll/ack/subscribe`; the MVP uses a local filesystem inbox/outbox.
- **Memory (aligned with beads):** `services/memory` exposes `remember/recall/link/summarize`; the MVP stores JSONL beads locally.

Upstreams are pulled in as submodules under `vendor/` (do not modify them directly):

- `vendor/mcp_agent_mail`
- `vendor/beads`
- `vendor/vc`

## Layout

- `services/`
  - `mail/adapter.ts`: unified Mail API (MVP: filesystem inbox/outbox)
  - `memory/adapter.ts`: unified Memory API (MVP: JSONL beads)
  - `orchestrator/cli.ts`: state machine + CLI (`issue submit` / `orchestrator run` / `demo run`)
- `agents/`: four stubs (planner / implementer / reviewer / integrator)
- `schemas/`: Message / Workflow / Bead JSON Schema
- `types/`: TypeScript protocol definitions + lightweight Node shims
- `examples/issue.json`: sample issue for the demo
- `vendor/*`: upstream submodules

## Quickstart (local multi-process demo)

One command to start orchestrator + 4 stub agents and submit a sample issue:

```bash
npm run demo
```

Or run in five shells:

```bash
node services/orchestrator/cli.ts orchestrator run
node agents/planner/agent.ts
node agents/implementer/agent.ts
node agents/reviewer/agent.ts
node agents/integrator/agent.ts

node services/orchestrator/cli.ts issue submit examples/issue.json
```

Artifacts land in `.hiveforge/` (messages, state, event log, beads).

## UI (Gateway)

Spin up a minimal web console to inspect threads, mailboxes, memory beads, and events:

```bash
npm run ui
# open http://localhost:8787
```

The UI reads from `.hiveforge/` so run it alongside the demo or any live orchestrator.

## Dev commands

- `npm run orchestrator`: run orchestrator only (start agents separately)
- `npm run agent:<role>`: run a specific stub agent
- `npm run typecheck`: `tsc -p tsconfig.json` (type-check only)

Node 24’s `--experimental-strip-types` executes `.ts` directly; no build step required.

## Protocols (summary)

- Message (`schemas/message.schema.json`):
  - `type`: ISSUE | PLAN_REQUEST | PLAN | TASK_REQUEST | RESULT | REVIEW_REQUEST | REVIEW | MERGE_REQUEST | MERGE_CONFIRMED | INFO
  - `context_refs`, `acceptance_criteria` carry context and acceptance gates
- Workflow (`schemas/workflow.schema.json`): states ISSUE_RECEIVED → … → DONE / ITERATING / ERROR
- Bead (`schemas/bead.schema.json`): ProjectBead / DecisionBead / TaskBead

## Roadmap to real services

Start with filesystem adapters, then swap in real backends without touching orchestrator logic:

1) Mail: implement `services/mail/adapter.ts` using `vendor/mcp_agent_mail` HTTP/MCP API while keeping the same interface.
2) Memory: implement `services/memory/adapter.ts` against `vendor/beads` (CLI or lib) while returning the same bead shape.
3) Workflow: keep `services/orchestrator` depending only on mail+memory adapters to stay swappable.

## Submodule tips

```bash
git submodule update --init --recursive    # initialize
git submodule update --remote vendor/beads # track upstream
```

## Cleanup & debug

- Reset demo data: `rm -rf .hiveforge/`
- Event log: `.hiveforge/events.log`
- Per-thread state: `.hiveforge/state/<thread>.json`
- Memory store: `.hiveforge/memory/beads.jsonl`

## TypeScript / Node

- Runtime: Node ≥ 20 (Node 24 recommended) with `--experimental-strip-types`.
- Type checking: uses global `tsc`; install locally if desired: `npm i -D typescript @types/node`.
