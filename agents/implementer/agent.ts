import { randomUUID } from "node:crypto";
import { ack, poll, send } from "../../services/mail/adapter.ts";
import type { Message } from "../../types/protocol.ts";

const AGENT_ID = "implementer";
const SLEEP_MS = 700;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handle(message: Message): Promise<void> {
  if (message.type !== "TASK_REQUEST") return;

  const issue = message.payload.issue ?? {};
  const plan = message.payload.plan ?? {};
  const iteration = message.payload.iteration === true;
  const summary = `Implemented stub for "${issue.title ?? "unknown"}"`;

  const result: Message = {
    thread_id: message.thread_id,
    msg_id: randomUUID(),
    from: AGENT_ID,
    to: "orchestrator",
    type: "RESULT",
    payload: {
      status: "COMPLETED",
      summary,
      changed_files: [],
      tests: ["not run (stub agent)"]
    },
    created_at: new Date().toISOString()
  };

  if (iteration) {
    result.payload.notes = ["Stub iteration: no changes applied."];
  }

  if (plan && Object.keys(plan).length) {
    result.payload.plan = plan;
  }

  await send(result);
  console.log(`[implementer] sent RESULT for ${message.thread_id}`);
}

async function loop(): Promise<void> {
  console.log("[implementer] started");
  while (true) {
    const messages = await poll(AGENT_ID, 10);
    for (const msg of messages) {
      await handle(msg);
      await ack(AGENT_ID, msg.msg_id);
    }
    await sleep(SLEEP_MS);
  }
}

loop().catch((err) => {
  console.error("[implementer] fatal error", err);
  process.exit(1);
});
