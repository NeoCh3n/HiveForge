import { randomUUID } from "node:crypto";
import { ack, poll, send } from "../../services/mail/adapter.ts";
import type { Message } from "../../types/protocol.ts";

const AGENT_ID = "planner";
const SLEEP_MS = 700;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handle(message: Message): Promise<void> {
  if (message.type !== "PLAN_REQUEST") return;

  const issue = message.payload.issue ?? {};
  const acceptance_criteria = Array.isArray(issue.acceptance_criteria)
    ? (issue.acceptance_criteria as string[])
    : [];
  const plan: Message = {
    thread_id: message.thread_id,
    msg_id: randomUUID(),
    from: AGENT_ID,
    to: "orchestrator",
    type: "PLAN",
    payload: {
      status: "COMPLETED",
      title: issue.title ?? "Untitled issue",
      steps: [
        "Understand requirements and acceptance criteria",
        "Implement minimal solution",
        "Add sanity tests",
        "Prepare for review"
      ],
      acceptance_criteria,
      risks: ["This is a stub agent; logic is simplified"],
      tests: ["Run demo end-to-end"]
    },
    created_at: new Date().toISOString()
  };

  await send(plan);
  console.log(`[planner] sent PLAN for ${message.thread_id}`);
}

async function loop(): Promise<void> {
  console.log("[planner] started");
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
  console.error("[planner] fatal error", err);
  process.exit(1);
});
