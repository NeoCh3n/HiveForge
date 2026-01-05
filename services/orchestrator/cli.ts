import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { ack, poll, send } from "../mail/adapter.ts";
import { link, recall, remember, summarize } from "../memory/adapter.ts";
import type { Message, WorkflowState, WorkflowStateValue } from "../../types/protocol.ts";

const ORCHESTRATOR_ID = "orchestrator";
const STATE_DIR = resolve(".hiveforge/state");
const EVENT_LOG = resolve(".hiveforge/events.log");
const SLEEP_MS = 800;

async function ensureStateDir(): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
}

async function logEvent(text: string): Promise<void> {
  await appendFile(EVENT_LOG, `${new Date().toISOString()} ${text}\n`);
}

async function loadState(threadId: string): Promise<WorkflowState> {
  const file = join(STATE_DIR, `${threadId}.json`);
  try {
    const content = await readFile(file, "utf-8");
    return JSON.parse(content) as WorkflowState;
  } catch {
    const now = new Date().toISOString();
    const initial: WorkflowState = {
      thread_id: threadId,
      state: "ISSUE_RECEIVED",
      updated_at: now,
      history: []
    };
    await saveState(initial);
    return initial;
  }
}

async function saveState(state: WorkflowState): Promise<void> {
  const file = join(STATE_DIR, `${state.thread_id}.json`);
  await writeFile(file, JSON.stringify(state, null, 2), "utf-8");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function transition(
  state: WorkflowState,
  next: WorkflowStateValue,
  patch: Partial<WorkflowState> = {}
): Promise<WorkflowState> {
  const now = new Date().toISOString();
  const updated: WorkflowState = {
    ...state,
    ...patch,
    state: next,
    updated_at: now,
    history: [...(state.history ?? []), `${now} -> ${next}`]
  };
  await saveState(updated);
  await logEvent(`[${state.thread_id}] ${state.state} -> ${next}`);
  return updated;
}

async function handleIssue(message: Message): Promise<void> {
  const issue = message.payload;
  let state = await loadState(message.thread_id);
  state = await transition(state, "ISSUE_RECEIVED", { issue });

  const projectBeads = await recall("", { type: "ProjectBead" }, 5);
  const decisionBeads = await recall("", { type: "DecisionBead" }, 5);

  const planReq: Message = {
    thread_id: message.thread_id,
    msg_id: randomUUID(),
    from: ORCHESTRATOR_ID,
    to: "planner",
    type: "PLAN_REQUEST",
    priority: "high",
    acceptance_criteria: issue.acceptance_criteria ?? [],
    payload: {
      issue,
      memory: { projectBeads, decisionBeads }
    },
    created_at: new Date().toISOString()
  };

  await send(planReq);
  await logEvent(`[${message.thread_id}] sent PLAN_REQUEST to planner`);
  await transition(state, "PLAN_REQUESTED");
}

async function handlePlan(message: Message, current: WorkflowState): Promise<void> {
  const plan = message.payload;
  let state = await transition(current, "PLAN_RECEIVED", { plan });

  const taskReq: Message = {
    thread_id: message.thread_id,
    msg_id: randomUUID(),
    from: ORCHESTRATOR_ID,
    to: "implementer",
    type: "TASK_REQUEST",
    payload: {
      issue: state.issue,
      plan
    },
    created_at: new Date().toISOString()
  };

  await send(taskReq);
  await logEvent(`[${message.thread_id}] sent TASK_REQUEST to implementer`);
  await transition(state, "TASK_DISPATCHED");
}

async function handleResult(message: Message, current: WorkflowState): Promise<void> {
  const result = message.payload;
  const state = await transition(current, "RESULT_RECEIVED", { result });

  const reviewReq: Message = {
    thread_id: message.thread_id,
    msg_id: randomUUID(),
    from: ORCHESTRATOR_ID,
    to: "reviewer",
    type: "REVIEW_REQUEST",
    payload: { issue: state.issue, plan: state.plan, result },
    created_at: new Date().toISOString()
  };

  await send(reviewReq);
  await logEvent(`[${message.thread_id}] sent REVIEW_REQUEST to reviewer`);
  await transition(state, "REVIEW_REQUESTED");
}

async function handleReview(message: Message, current: WorkflowState): Promise<void> {
  const review = message.payload;
  let state = await transition(current, "REVIEW_RECEIVED", { review });

  if (review.blocking) {
    const iterateReq: Message = {
      thread_id: message.thread_id,
      msg_id: randomUUID(),
      from: ORCHESTRATOR_ID,
      to: "implementer",
      type: "TASK_REQUEST",
      payload: {
        issue: state.issue,
        plan: state.plan,
        review,
        iteration: true
      },
      created_at: new Date().toISOString()
    };
    await send(iterateReq);
    await logEvent(`[${message.thread_id}] review blocking -> resend TASK_REQUEST`);
    await transition(state, "ITERATING");
    return;
  }

  const mergeReq: Message = {
    thread_id: message.thread_id,
    msg_id: randomUUID(),
    from: ORCHESTRATOR_ID,
    to: "integrator",
    type: "MERGE_REQUEST",
    payload: { issue: state.issue, plan: state.plan, result: state.result, review },
    created_at: new Date().toISOString()
  };

  await send(mergeReq);
  await logEvent(`[${message.thread_id}] sent MERGE_REQUEST to integrator`);
  await transition(state, "MERGE_REQUESTED");
}

async function handleMerge(message: Message, current: WorkflowState): Promise<void> {
  const merge = message.payload;
  let state = await transition(current, "DONE", { data: { merge } });

  const taskBead = await remember({
    type: "TaskBead",
    title: `Thread ${state.thread_id} completed`,
    content: `Issue: ${state.issue?.title ?? ""}\nResult: ${JSON.stringify(
      state.result ?? {},
      null,
      2
    )}\nReview: ${JSON.stringify(state.review ?? {}, null, 2)}\nMerge: ${JSON.stringify(merge)}`,
    thread_id: state.thread_id,
    tags: ["hiveforge", "demo"]
  });

  await link(state.thread_id, [taskBead.id]);
  const summary = await summarize(state.thread_id);
  await logEvent(`[${state.thread_id}] DONE. Memory summary:\n${summary}`);
}

async function processMessage(message: Message): Promise<void> {
  const state = await loadState(message.thread_id);

  switch (message.type) {
    case "ISSUE":
      await handleIssue(message);
      break;
    case "PLAN":
      await handlePlan(message, state);
      break;
    case "RESULT":
      await handleResult(message, state);
      break;
    case "REVIEW":
      await handleReview(message, state);
      break;
    case "MERGE_CONFIRMED":
      await handleMerge(message, state);
      break;
    default:
      await logEvent(`[${message.thread_id}] unhandled message type: ${message.type}`);
  }
}

async function runOrchestrator(): Promise<void> {
  await ensureStateDir();
  console.log("Orchestrator running (file-based mail/memory). Ctrl+C to stop.");

  while (true) {
    const messages = await poll(ORCHESTRATOR_ID, 50);
    for (const msg of messages) {
      await processMessage(msg);
      await ack(ORCHESTRATOR_ID, msg.msg_id);
    }
    await sleep(SLEEP_MS);
  }
}

async function submitIssue(path: string): Promise<void> {
  const raw = await readFile(resolve(path), "utf-8");
  const issue = JSON.parse(raw);
  const msg: Message = {
    thread_id: issue.thread_id ?? `issue-${randomUUID()}`,
    msg_id: randomUUID(),
    from: "user",
    to: ORCHESTRATOR_ID,
    type: "ISSUE",
    payload: issue,
    created_at: new Date().toISOString()
  };
  await send(msg);
  console.log(`Submitted issue ${msg.thread_id} to orchestrator inbox.`);
}

function spawnAgent(name: string, script: string): void {
  const child = spawn(process.execPath, ["--experimental-strip-types", script], {
    stdio: "inherit"
  });
  child.on("close", (code: number | null) => {
    console.log(`[demo] ${name} exited with code ${code}`);
  });
}

async function runDemo(issuePath: string): Promise<void> {
  console.log("Starting demo processes...");
  spawnAgent("orchestrator", resolve("services/orchestrator/cli.ts"));
  spawnAgent("planner", resolve("agents/planner/agent.ts"));
  spawnAgent("implementer", resolve("agents/implementer/agent.ts"));
  spawnAgent("reviewer", resolve("agents/reviewer/agent.ts"));
  spawnAgent("integrator", resolve("agents/integrator/agent.ts"));

  await sleep(1000);
  await submitIssue(issuePath);
  console.log("Demo running. Use Ctrl+C to stop all processes.");
}

function printHelp(): void {
  console.log(
    `HiveForge CLI

Usage:
  node services/orchestrator/cli.ts orchestrator run
  node services/orchestrator/cli.ts issue submit <path>
  node services/orchestrator/cli.ts demo run --issue <path>
`
  );
}

async function main(): Promise<void> {
  const [, , cmd, subcmd, ...rest] = process.argv;

  if (!cmd) {
    printHelp();
    return;
  }

  if (cmd === "orchestrator" && subcmd === "run") {
    await runOrchestrator();
    return;
  }

  if (cmd === "issue" && subcmd === "submit") {
    const path = rest[0];
    if (!path) {
      console.error("issue submit requires a path");
      return;
    }
    await submitIssue(path);
    return;
  }

  if (cmd === "demo" && subcmd === "run") {
    const issueIndex = rest.indexOf("--issue");
    const issuePath = issueIndex >= 0 ? rest[issueIndex + 1] : "examples/issue.json";
    await runDemo(issuePath);
    return;
  }

  printHelp();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
