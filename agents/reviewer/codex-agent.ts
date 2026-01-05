import { randomUUID } from "node:crypto";

import { ack, poll, send } from "../../services/mail/adapter.ts";
import { codexExecJson } from "../lib/codex.ts";
import type { Message } from "../../types/protocol.ts";

const AGENT_ID = "reviewer";
const SLEEP_MS = 700;
const ERROR_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 8000;
const OUTPUT_SCHEMA = "schemas/codex/review_output.schema.json";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextBackoff(currentMs: number): number {
  return currentMs ? Math.min(currentMs * 2, MAX_BACKOFF_MS) : ERROR_BACKOFF_MS;
}

async function handle(message: Message): Promise<void> {
  if (message.type !== "REVIEW_REQUEST") return;

  const prompt = `You are the HiveForge Reviewer agent (agent id: ${AGENT_ID}).

Follow the repo rules in AGENTS.md and the role prompt in agents/reviewer/CODEX_PROMPT.md.

Task:
- Review correctness, tests/verification, schema/protocol compliance, and security risks.
- Be strict about acceptance criteria.
- Output MUST be valid JSON matching: ${OUTPUT_SCHEMA}
- Output ONLY the JSON object (no markdown, no prose).
- Do NOT modify code. Do NOT run git commit/push. Do NOT touch vendor/*.

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
    type: "REVIEW",
    context_refs: [
      ...(message.context_refs ?? []),
      { kind: "codex_run", path: runDir, note: "Reviewer codex run dir" }
    ],
    acceptance_criteria: message.acceptance_criteria ?? [],
    payload: output,
    created_at: new Date().toISOString()
  };

  await send(reply);
  console.log(`[reviewer:codex] sent REVIEW for ${message.thread_id}`);
}

async function loop(): Promise<void> {
  console.log("[reviewer:codex] started");
  let backoffMs = 0;
  while (true) {
    let messages: Message[] = [];
    try {
      messages = await poll(AGENT_ID, 10);
      backoffMs = 0;
    } catch (err) {
      backoffMs = nextBackoff(backoffMs);
      console.error(`[reviewer:codex] poll failed; retrying in ${backoffMs}ms`, err);
      await sleep(backoffMs);
      continue;
    }

    for (const msg of messages) {
      try {
        await handle(msg);
        await ack(AGENT_ID, msg.msg_id);
      } catch (err) {
        console.error("[reviewer:codex] failed to handle message", msg.msg_id, err);
      }
    }
    await sleep(SLEEP_MS);
  }
}

loop().catch((err) => {
  console.error("[reviewer:codex] fatal error", err);
  process.exit(1);
});
