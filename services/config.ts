import { join, resolve } from "node:path";

export const DATA_ROOT = resolve(process.env.HIVEFORGE_DATA_ROOT ?? ".hiveforge");

export const STATE_DIR = process.env.HIVEFORGE_STATE_DIR
  ? resolve(process.env.HIVEFORGE_STATE_DIR)
  : join(DATA_ROOT, "state");

export const EVENT_LOG = process.env.HIVEFORGE_EVENT_LOG
  ? resolve(process.env.HIVEFORGE_EVENT_LOG)
  : join(DATA_ROOT, "events.log");

export const MAIL_ROOT = process.env.HIVEFORGE_MAIL_ROOT
  ? resolve(process.env.HIVEFORGE_MAIL_ROOT)
  : join(DATA_ROOT, "mail");

export const MEMORY_ROOT = process.env.HIVEFORGE_MEMORY_ROOT
  ? resolve(process.env.HIVEFORGE_MEMORY_ROOT)
  : join(DATA_ROOT, "memory");

export const MAIL_BACKEND = (process.env.HIVEFORGE_MAIL_BACKEND ?? "mcp") as
  | "filesystem"
  | "mcp";

export const MCP_BASE_URL =
  process.env.HIVEFORGE_MCP_BASE_URL ?? "http://127.0.0.1:8765/mcp/";
export const MCP_PROJECT_KEY = process.env.HIVEFORGE_MCP_PROJECT_KEY ?? process.cwd();
export const MCP_PROGRAM = process.env.HIVEFORGE_MCP_PROGRAM ?? "hiveforge";
export const MCP_MODEL = process.env.HIVEFORGE_MCP_MODEL ?? "codex";

export const CODEX_PROVIDER = process.env.HIVEFORGE_CODEX_PROVIDER ?? "openai";
export const CODEX_MODEL = process.env.HIVEFORGE_CODEX_MODEL;
export const CODEX_PROFILE = process.env.HIVEFORGE_CODEX_PROFILE;
