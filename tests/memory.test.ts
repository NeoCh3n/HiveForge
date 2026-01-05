import assert from "node:assert/strict";
import { test } from "node:test";

import { link, recall, remember, summarize } from "../services/memory/adapter.ts";

test("memory: remember → recall → link → summarize", async () => {
  const threadId = `test-thread-${Date.now()}`;

  const bead = await remember({
    type: "DecisionBead",
    title: "Test decision",
    content: "We decided to test the memory adapter.",
    thread_id: threadId,
    tags: ["test"]
  });

  const recalled = await recall("decided", { thread_id: threadId }, 10);
  assert.ok(recalled.some((b) => b.id === bead.id));

  await link(threadId, [bead.id]);
  const summary = await summarize(threadId);
  assert.match(summary, /DecisionBead: Test decision/);
});

