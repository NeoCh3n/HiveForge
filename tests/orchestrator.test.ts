import assert from "node:assert/strict";
import { test } from "node:test";

import { ack, poll } from "../services/mail/adapter.ts";
import { summarize } from "../services/memory/adapter.ts";
import { loadState, processMessage } from "../services/orchestrator/orchestrator.ts";

test("orchestrator: ISSUE → PLAN → RESULT → REVIEW → MERGE → DONE", async () => {
  const threadId = `test-thread-${Date.now()}`;
  const now = new Date().toISOString();

  await processMessage({
    thread_id: threadId,
    msg_id: "issue-1",
    from: "user",
    to: "orchestrator",
    type: "ISSUE",
    payload: { title: "Test issue", acceptance_criteria: ["Ends in DONE"] },
    created_at: now
  });

  const plannerInbox = await poll("planner", 10);
  assert.equal(plannerInbox.length, 1);
  assert.equal(plannerInbox[0].type, "PLAN_REQUEST");
  await ack("planner", plannerInbox[0].msg_id);

  await processMessage({
    thread_id: threadId,
    msg_id: "plan-1",
    from: "planner",
    to: "orchestrator",
    type: "PLAN",
    payload: { steps: ["Do the thing"], tests: ["npm test"] },
    created_at: new Date().toISOString()
  });

  const implementerInbox = await poll("implementer", 10);
  assert.equal(implementerInbox.length, 1);
  assert.equal(implementerInbox[0].type, "TASK_REQUEST");
  await ack("implementer", implementerInbox[0].msg_id);

  await processMessage({
    thread_id: threadId,
    msg_id: "result-1",
    from: "implementer",
    to: "orchestrator",
    type: "RESULT",
    payload: { summary: "Did it", changed_files: [], tests: ["npm test (not run in unit test)"] },
    created_at: new Date().toISOString()
  });

  const reviewerInbox = await poll("reviewer", 10);
  assert.equal(reviewerInbox.length, 1);
  assert.equal(reviewerInbox[0].type, "REVIEW_REQUEST");
  await ack("reviewer", reviewerInbox[0].msg_id);

  await processMessage({
    thread_id: threadId,
    msg_id: "review-1",
    from: "reviewer",
    to: "orchestrator",
    type: "REVIEW",
    payload: { blocking: false, summary: "LGTM" },
    created_at: new Date().toISOString()
  });

  const integratorInbox = await poll("integrator", 10);
  assert.equal(integratorInbox.length, 1);
  assert.equal(integratorInbox[0].type, "MERGE_REQUEST");
  await ack("integrator", integratorInbox[0].msg_id);

  await processMessage({
    thread_id: threadId,
    msg_id: "merge-1",
    from: "integrator",
    to: "orchestrator",
    type: "MERGE_CONFIRMED",
    payload: { merged: true },
    created_at: new Date().toISOString()
  });

  const state = await loadState(threadId);
  assert.equal(state.state, "DONE");

  const memorySummary = await summarize(threadId);
  assert.match(memorySummary, /TaskBead:/);
});

