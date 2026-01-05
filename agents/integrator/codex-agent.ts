import { randomUUID } from "node:crypto";

import { ack, poll, send } from "../../services/mail/adapter.ts";
import { codexExecJson } from "../lib/codex.ts";
import type { Message } from "../../types/protocol.ts";

const AGENT_ID = "integrator";
const SLEEP_MS = 700;
const ERROR_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 8000;
const OUTPUT_SCHEMA = "schemas/codex/merge_output.schema.json";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextBackoff(currentMs: number): number {
  return currentMs ? Math.min(currentMs * 2, MAX_BACKOFF_MS) : ERROR_BACKOFF_MS;
}

async function handle(message: Message): Promise<void> {
  if (message.type !== "MERGE_REQUEST") return;

  const prompt = `You are the HiveForge Integrator agent (agent id: ${AGENT_ID}).

Follow the repo rules in AGENTS.md and the role prompt in agents/integrator/CODEX_PROMPT.md.

Task:
- Confirm merge readiness and summarize what was verified.
- Output MUST be valid JSON matching: ${OUTPUT_SCHEMA}
- Output ONLY the JSON object (no markdown, no prose).
- Do NOT perform destructive git operations or push unless explicitly asked by a human.
- Do NOT modify vendor/*.

Incoming message (JSON):
${JSON.stringify(message, null, 2)}
`;

  const { output, runDir } = await codexExecJson(prompt, {
    sandbox: "read-only",
    outputSchemaPath: OUTPUT_SCHEMA,
    runLabel: `${AGENT_ID}-${message.thread_id}`
  });

  const reply: Message = {
    thread_id: message.thread_id,
    msg_id: randomUUID(),
    from: AGENT_ID,
    to: "orchestrator",
    type: "MERGE_CONFIRMED",
    context_refs: [
      ...(message.context_refs ?? []),
      { kind: "codex_run", path: runDir, note: "Integrator codex run dir" }
    ],
    acceptance_criteria: message.acceptance_criteria ?? [],
    payload: output,
    created_at: new Date().toISOString()
  };

  await send(reply);
  console.log(`[integrator:codex] sent MERGE_CONFIRMED for ${message.thread_id}`);
}

async function loop(): Promise<void> {
  console.log("[integrator:codex] started");
  let backoffMs = 0;
  while (true) {
    let messages: Message[] = [];
    try {
      messages = await poll(AGENT_ID, 10);
      backoffMs = 0;
    } catch (err) {
      backoffMs = nextBackoff(backoffMs);
      console.error(`[integrator:codex] poll failed; retrying in ${backoffMs}ms`, err);
      await sleep(backoffMs);
      continue;
    }

    for (const msg of messages) {
      try {
        await handle(msg);
        await ack(AGENT_ID, msg.msg_id);
      } catch (err) {
        console.error("[integrator:codex] failed to handle message", msg.msg_id, err);
      }
    }
    await sleep(SLEEP_MS);
  }
}

loop().catch((err) => {
  console.error("[integrator:codex] fatal error", err);
  process.exit(1);
});
