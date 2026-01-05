import assert from "node:assert/strict";
import { test } from "node:test";

import { ack, poll, send } from "../services/mail/adapter.ts";

test("mail: send → poll → ack", async () => {
  const threadId = `test-thread-${Date.now()}`;
  const agentId = `test-agent-${Date.now()}`;

  const sent = await send({
    thread_id: threadId,
    from: "tester",
    to: agentId,
    type: "INFO",
    payload: { ok: true }
  });

  const messages = await poll(agentId, 10);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].msg_id, sent.msg_id);
  assert.equal(messages[0].thread_id, threadId);
  assert.deepEqual(messages[0].payload, { ok: true });

  await ack(agentId, sent.msg_id);
  const after = await poll(agentId, 10);
  assert.equal(after.length, 0);
});

