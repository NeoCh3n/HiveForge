import { randomUUID } from "node:crypto";
import { access, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MAIL_ROOT } from "../config.ts";
import type { Message } from "../../types/protocol.ts";

const DEFAULT_SUBSCRIBE_INTERVAL_MS = 800;

async function ensureDir(path: string): Promise<void> {
  try {
    await access(path);
  } catch {
    await mkdir(path, { recursive: true });
  }
}

async function inboxDir(agentId: string): Promise<string> {
  const dir = join(MAIL_ROOT, agentId, "inbox");
  await ensureDir(dir);
  return dir;
}

async function processingDir(agentId: string): Promise<string> {
  const dir = join(MAIL_ROOT, agentId, "processing");
  await ensureDir(dir);
  return dir;
}

export async function send(message: Partial<Message>): Promise<Message> {
  const msg: Message = {
    thread_id: message.thread_id ?? "unknown-thread",
    msg_id: message.msg_id ?? randomUUID(),
    from: message.from ?? "unknown",
    to: message.to ?? "unknown",
    type: message.type ?? "INFO",
    payload: message.payload ?? {},
    priority: message.priority ?? "normal",
    context_refs: message.context_refs ?? [],
    acceptance_criteria: message.acceptance_criteria ?? [],
    created_at: message.created_at ?? new Date().toISOString()
  };

  const dir = await inboxDir(msg.to);
  const file = join(dir, `${msg.msg_id}.json`);
  await writeFile(file, JSON.stringify(msg, null, 2), "utf-8");
  return msg;
}

export async function poll(agentId: string, limit = 20): Promise<Message[]> {
  const inbox = await inboxDir(agentId);
  const processing = await processingDir(agentId);

  const processingFiles = await readdir(processing);
  const inboxFiles = await readdir(inbox);
  const messages: Message[] = [];

  for (const file of processingFiles) {
    if (!file.endsWith(".json")) continue;
    const full = join(processing, file);
    try {
      const content = await readFile(full, "utf-8");
      const parsed = JSON.parse(content) as Message;
      messages.push(parsed);
    } catch (err) {
      console.error(`[mail][${agentId}] failed to read ${file}:`, err);
    }
  }

  for (const file of inboxFiles) {
    if (messages.length >= limit) break;
    if (!file.endsWith(".json")) continue;
    const full = join(inbox, file);
    const claimed = join(processing, file);
    try {
      await rename(full, claimed);
    } catch {
      continue;
    }

    try {
      const content = await readFile(claimed, "utf-8");
      const parsed = JSON.parse(content) as Message;
      messages.push(parsed);
    } catch (err) {
      console.error(`[mail][${agentId}] failed to parse ${file}:`, err);
    }
  }

  messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return messages.slice(0, limit);
}

export async function ack(agentId: string, msgId: string): Promise<void> {
  const file = join(MAIL_ROOT, agentId, "processing", `${msgId}.json`);
  await rm(file, { force: true });
}

export async function latestModified(agentId: string): Promise<number> {
  const dir = await inboxDir(agentId);
  const files = await readdir(dir);
  let latest = 0;
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const full = join(dir, file);
    const info = await stat(full);
    latest = Math.max(latest, info.mtimeMs);
  }
  return latest;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function* subscribe(
  agentId: string,
  options: { limit?: number; intervalMs?: number; signal?: AbortSignal } = {}
): AsyncGenerator<Message, void, void> {
  const limit = options.limit ?? 20;
  const intervalMs = options.intervalMs ?? DEFAULT_SUBSCRIBE_INTERVAL_MS;

  while (true) {
    if (options.signal?.aborted) return;
    const messages = await poll(agentId, limit);
    for (const message of messages) {
      yield message;
    }
    await sleep(intervalMs);
  }
}
