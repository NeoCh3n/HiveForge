import { randomUUID } from "node:crypto";
import { ack, poll, send } from "../../services/mail/adapter.ts";
import type { Message } from "../../types/protocol.ts";

const AGENT_ID = "reviewer";
const SLEEP_MS = 700;
const ERROR_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 8000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextBackoff(currentMs: number): number {
  return currentMs ? Math.min(currentMs * 2, MAX_BACKOFF_MS) : ERROR_BACKOFF_MS;
}

async function handle(message: Message): Promise<void> {
  if (message.type !== "REVIEW_REQUEST") return;

  const review: Message = {
    thread_id: message.thread_id,
    msg_id: randomUUID(),
    from: AGENT_ID,
    to: "orchestrator",
    type: "REVIEW",
    payload: {
      status: "COMPLETED",
      blocking: false,
      summary: "Looks good for demo purposes.",
      comments: ["Stub reviewer approves by default."]
    },
    created_at: new Date().toISOString()
  };

  await send(review);
  console.log(`[reviewer] sent REVIEW for ${message.thread_id}`);
}

async function loop(): Promise<void> {
  console.log("[reviewer] started");
  let backoffMs = 0;
  while (true) {
    let messages: Message[] = [];
    try {
      messages = await poll(AGENT_ID, 10);
      backoffMs = 0;
    } catch (err) {
      backoffMs = nextBackoff(backoffMs);
      console.error(`[reviewer] poll failed; retrying in ${backoffMs}ms`, err);
      await sleep(backoffMs);
      continue;
    }

    for (const msg of messages) {
      try {
        await handle(msg);
        await ack(AGENT_ID, msg.msg_id);
      } catch (err) {
        console.error("[reviewer] failed to handle message", msg.msg_id, err);
      }
    }
    await sleep(SLEEP_MS);
  }
}

loop().catch((err) => {
  console.error("[reviewer] fatal error", err);
  process.exit(1);
});
