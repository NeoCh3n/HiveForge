# HiveForge

A unified “multi-agent software factory” scaffold that combines:

- **Flow (vc-inspired):** `services/orchestrator` codifies collaboration as a state machine (Issue → Plan → Execute → Review → Iterate → Done → Memory).
- **Mail (aligned with mcp_agent_mail):** `services/mail` exposes `send/poll/ack/subscribe`; default backend is the vendor MCP server (filesystem fallback for tests).
- **Memory (aligned with beads):** `services/memory` exposes `remember/recall/link/summarize`; the MVP stores JSONL beads locally.

Upstreams are pulled in as submodules under `vendor/` (do not modify them directly):

- `vendor/mcp_agent_mail`
- `vendor/beads`
- `vendor/vc`

## Layout

- `services/`
  - `mail/adapter.ts`: unified Mail API (default: vendor MCP; filesystem fallback for tests)
  - `memory/adapter.ts`: unified Memory API (MVP: JSONL beads)
  - `orchestrator/cli.ts`: state machine + CLI (`issue submit` / `orchestrator run` / `demo run`)
- `agents/`: four stubs (planner / implementer / reviewer / integrator)
- `schemas/`: Message / Workflow / Bead JSON Schema
- `types/`: TypeScript protocol definitions + lightweight Node shims
- `examples/issue.json`: sample issue for the demo
- `vendor/*`: upstream submodules

## Quickstart (local multi-process demo)

One command to start orchestrator + 4 stub agents and submit a sample issue.
If you’re using the default mail backend, start the vendor MCP server first.

```bash
npm run demo
```

## Multi-Codex mode (one Codex per agent)

Run orchestrator + UI, then open 4 separate Codex sessions (planner/implementer/reviewer/integrator) to reply over Mail.

Start the stack (no stub agents):

```bash
npm run stack:codex
```

In 4 other terminals:

```bash
npm run codex:planner
npm run codex:implementer
npm run codex:reviewer
npm run codex:integrator
```

Inside each Codex session, use the helper CLI to poll/reply/ack:

```bash
npm run hf -- mail poll planner
npm run hf -- mail reply planner <msg_id> --type PLAN --payload-file plan.json --ack
```

## Codex-backed agents (automatic “new Codex per task”)

This starts long-running agent processes that, on each incoming Mail message, spawn a fresh `codex exec` run to generate the reply payload.

```bash
npm run stack:codex-agents
```

Then submit issues via UI (http://localhost:8787) or CLI:

```bash
node services/orchestrator/cli.ts issue submit examples/issue.json
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

Spin up a minimal web console to inspect threads (flow), mailboxes (mail), memory beads (beads), and events:

```bash
npm run ui
# open http://localhost:8787
```

Tips:
- Run alongside `npm run demo` (or your own orchestrator + agents) so data flows.
- Use “New issue” in the UI to send an ISSUE with title/description/acceptance criteria to the orchestrator inbox (no CLI needed).
- The UI reads local state/event log from `.hiveforge/` and mail from the configured mail backend.

## Dev commands

- `npm run orchestrator`: run orchestrator only (start agents separately)
- `npm run agent:<role>`: run a specific stub agent
- `npm run typecheck`: `tsc -p tsconfig.json` (type-check only)

Node 24’s `--experimental-strip-types` executes `.ts` directly; no build step required.

### All-in-one stack

Run everything (orchestrator + agents + UI) with one command, then open the UI:

```bash
npm run stack
# UI: http://localhost:8787
```

## Protocols (summary)

- Message (`schemas/message.schema.json`):
  - `type`: ISSUE | PLAN_REQUEST | PLAN | TASK_REQUEST | RESULT | REVIEW_REQUEST | REVIEW | MERGE_REQUEST | MERGE_CONFIRMED | INFO
  - `context_refs`, `acceptance_criteria` carry context and acceptance gates
- Workflow (`schemas/workflow.schema.json`): states ISSUE_RECEIVED → … → DONE / ITERATING / ERROR
- Bead (`schemas/bead.schema.json`): ProjectBead / DecisionBead / TaskBead

## Roadmap to real services

Mail now uses the vendor MCP server by default. Next steps to complete the “real backend” stack:

1) Memory: swap `services/memory/adapter.ts` to use `vendor/beads` (CLI or lib) while returning the same bead shape.
2) Workflow: keep `services/orchestrator` depending only on mail+memory adapters to stay swappable.

## Mail backend (vendor/mcp_agent_mail)

By default, `services/mail` targets the vendor MCP server.

```bash
# default: http://127.0.0.1:8765/mcp/
export HIVEFORGE_MCP_BASE_URL="http://127.0.0.1:8765/mcp/"
export HIVEFORGE_MCP_PROJECT_KEY="$(pwd)"
```

If you need the local filesystem mailbox for tests/offline:

```bash
export HIVEFORGE_MAIL_BACKEND=filesystem
```

## Codex provider (LLM)

Codex-backed agents call the Codex CLI. By default it uses the OpenAI provider.

```bash
export HIVEFORGE_CODEX_PROVIDER=openai   # default
export HIVEFORGE_CODEX_MODEL="gpt-5.2"   # optional
export HIVEFORGE_CODEX_PROFILE="default" # optional
```

For local OSS models, set `HIVEFORGE_CODEX_PROVIDER=oss` and ensure Ollama is running.

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
