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
    console.log(`[stack] ${name} exited with code ${code}`);
  });
}

function startAll() {
  run("orchestrator", ["services/orchestrator/cli.ts", "orchestrator", "run"]);
  run("planner", ["agents/planner/agent.ts"]);
  run("implementer", ["agents/implementer/agent.ts"]);
  run("reviewer", ["agents/reviewer/agent.ts"]);
  run("integrator", ["agents/integrator/agent.ts"]);
  run("gateway", ["services/gateway/server.ts"]);
}

function shutdown() {
  console.log("[stack] Shutting down...");
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

console.log("[stack] Starting orchestrator, agents, and gateway UI...");
console.log("[stack] UI at http://localhost:8787");
startAll();
