import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { DATA_ROOT } from "../../services/config.ts";

export type CodexSandbox = "read-only" | "workspace-write" | "danger-full-access";

export type CodexExecOptions = {
  workdir?: string;
  sandbox?: CodexSandbox;
  outputSchemaPath?: string;
  runLabel?: string;
};

function nowCompact(): string {
  return new Date().toISOString().replaceAll(":", "-");
}

function safeLabel(label: string): string {
  return label.replaceAll(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

export async function codexExecJson(
  prompt: string,
  options: CodexExecOptions = {}
): Promise<{ output: any; raw: string; runDir: string }> {
  const workdir = options.workdir ?? ".";
  const sandbox = options.sandbox ?? "read-only";
  const schemaPath = options.outputSchemaPath ? resolve(options.outputSchemaPath) : undefined;

  const codexDir = join(DATA_ROOT, "codex");
  await mkdir(codexDir, { recursive: true });
  const label = safeLabel(options.runLabel ?? "run");
  const runDir = join(codexDir, `${label}-${nowCompact()}`);
  await mkdir(runDir, { recursive: true });

  const outputFile = join(runDir, "last_message.json");

  const args = [
    "exec",
    "-C",
    workdir,
    "-c",
    'model_reasoning_effort="high"',
    "-c",
    'ask_for_approval="never"',
    "-s",
    sandbox,
    ...(schemaPath ? ["--output-schema", schemaPath] : []),
    "--output-last-message",
    outputFile,
    "-"
  ];

  const child = spawn("codex", args, {
    stdio: ["pipe", "inherit", "inherit"]
  });

  child.stdin.write(prompt);
  child.stdin.end();

  const exitCode: number = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code: number | null) => resolve(code ?? 1));
  });

  const raw = await readFile(outputFile, "utf-8");

  if (exitCode !== 0) {
    const error = new Error(`codex exec failed with code ${exitCode}`);
    (error as any).raw = raw;
    (error as any).runDir = runDir;
    throw error;
  }

  const parsed = JSON.parse(raw) as any;
  return { output: parsed, raw, runDir };
}
