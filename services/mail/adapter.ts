import { randomUUID } from "node:crypto";
import { access, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Message } from "../../types/protocol.ts";

const MAIL_ROOT = resolve(".hiveforge/mail");

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
  const dir = await inboxDir(agentId);
  const files = await readdir(dir);
  const messages: Message[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const full = join(dir, file);
    try {
      const content = await readFile(full, "utf-8");
      const parsed = JSON.parse(content) as Message;
      messages.push(parsed);
    } catch (err) {
      console.error(`[mail][${agentId}] failed to read ${file}:`, err);
    }
  }

  messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return messages.slice(0, limit);
}

export async function ack(agentId: string, msgId: string): Promise<void> {
  const file = join(MAIL_ROOT, agentId, "inbox", `${msgId}.json`);
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
