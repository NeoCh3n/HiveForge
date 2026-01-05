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

