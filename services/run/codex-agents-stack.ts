// @ts-nocheck
import { spawn } from "node:child_process";

type Proc = { name: string; child: any };

const procs: Proc[] = [];

function run(name: string, args: string[]) {
  const child = spawn(process.execPath, ["--experimental-strip-types", ...args], {
    stdio: "inherit"
  });
  procs.push({ name, child });
  child.on("exit", (code) => {
    console.log(`[stack:codex-agents] ${name} exited with code ${code}`);
  });
}

function startAll() {
  run("orchestrator", ["services/orchestrator/cli.ts", "orchestrator", "run"]);
  run("planner:codex", ["agents/planner/codex-agent.ts"]);
  run("implementer:codex", ["agents/implementer/codex-agent.ts"]);
  run("reviewer:codex", ["agents/reviewer/codex-agent.ts"]);
  run("integrator:codex", ["agents/integrator/codex-agent.ts"]);
  run("gateway", ["services/gateway/server.ts"]);
}

function shutdown() {
  console.log("[stack:codex-agents] Shutting down...");
  for (const { child } of procs) {
    try {
      child.kill("SIGINT");
    } catch {
      // ignore
    }
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("[stack:codex-agents] Starting orchestrator + codex-backed agents + UI...");
console.log("[stack:codex-agents] UI at http://localhost:8787");
startAll();

