import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { send } from "../mail/adapter.ts";
import { ORCHESTRATOR_ID, runOrchestrator } from "./orchestrator.ts";
import type { Message } from "../../types/protocol.ts";

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

function spawnAgent(name: string, args: string[]): void {
  const child = spawn(process.execPath, ["--experimental-strip-types", ...args], {
    stdio: "inherit"
  });
  child.on("close", (code: number | null) => {
    console.log(`[demo] ${name} exited with code ${code}`);
  });
}

async function runDemo(issuePath: string): Promise<void> {
  console.log("Starting demo processes...");
  spawnAgent("orchestrator", [resolve("services/orchestrator/cli.ts"), "orchestrator", "run"]);
  spawnAgent("planner", [resolve("agents/planner/agent.ts")]);
  spawnAgent("implementer", [resolve("agents/implementer/agent.ts")]);
  spawnAgent("reviewer", [resolve("agents/reviewer/agent.ts")]);
  spawnAgent("integrator", [resolve("agents/integrator/agent.ts")]);

  await new Promise((resolve) => setTimeout(resolve, 1000));
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
