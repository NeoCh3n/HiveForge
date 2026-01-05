import { randomUUID } from "node:crypto";
import { ack, poll, send } from "../../services/mail/adapter.ts";
import type { Message } from "../../types/protocol.ts";

const AGENT_ID = "integrator";
const SLEEP_MS = 700;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handle(message: Message): Promise<void> {
  if (message.type !== "MERGE_REQUEST") return;

  const merge: Message = {
    thread_id: message.thread_id,
    msg_id: randomUUID(),
    from: AGENT_ID,
    to: "orchestrator",
    type: "MERGE_CONFIRMED",
    payload: {
      status: "COMPLETED",
      merged: true,
      note: "Stub integrator merged changes."
    },
    created_at: new Date().toISOString()
  };

  await send(merge);
  console.log(`[integrator] sent MERGE_CONFIRMED for ${message.thread_id}`);
}

async function loop(): Promise<void> {
  console.log("[integrator] started");
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
  console.error("[integrator] fatal error", err);
  process.exit(1);
});
