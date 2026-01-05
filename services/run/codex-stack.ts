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
    console.log(`[stack:codex] ${name} exited with code ${code}`);
  });
}

function startAll() {
  run("orchestrator", ["services/orchestrator/cli.ts", "orchestrator", "run"]);
  run("gateway", ["services/gateway/server.ts"]);
}

function shutdown() {
  console.log("[stack:codex] Shutting down...");
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

console.log("[stack:codex] Starting orchestrator + gateway UI (no stub agents)...");
console.log("[stack:codex] UI at http://localhost:8787");
console.log("[stack:codex] In 4 other terminals, run:");
console.log("  npm run codex:planner");
console.log("  npm run codex:implementer");
console.log("  npm run codex:reviewer");
console.log("  npm run codex:integrator");
startAll();

