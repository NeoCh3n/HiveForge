import { randomUUID } from "node:crypto";
import { access, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  MAIL_BACKEND,
  MAIL_ROOT,
  MCP_BASE_URL,
  MCP_AGENT_SCOPE,
  MCP_MODEL,
  MCP_PROGRAM,
  MCP_PROJECT_KEY,
  MCP_SHARED_AGENT_IDS
} from "../config.ts";
import type { Message, MessageType } from "../../types/protocol.ts";

const DEFAULT_SUBSCRIBE_INTERVAL_MS = 800;
const AGENT_MAP_FILE = join(MAIL_ROOT, "agent-map.json");
const ACK_DIR = join(MAIL_ROOT, "acks");
const ACK_CACHE_LIMIT = 500;
const SHARED_AGENT_IDS = new Set(MCP_SHARED_AGENT_IDS);

async function ensureDir(path: string): Promise<void> {
  try {
    await access(path);
  } catch {
    await mkdir(path, { recursive: true });
  }
}

async function loadAcked(agentId: string): Promise<Set<string>> {
  try {
    const raw = await readFile(join(ACK_DIR, `${agentId}.json`), "utf-8");
    const list = JSON.parse(raw) as string[];
    return new Set(list.map((item) => String(item)));
  } catch {
    return new Set();
  }
}

async function saveAcked(agentId: string, ids: Set<string>): Promise<void> {
  await ensureDir(ACK_DIR);
  const list = Array.from(ids);
  if (list.length > ACK_CACHE_LIMIT) {
    list.splice(0, list.length - ACK_CACHE_LIMIT);
  }
  await writeFile(join(ACK_DIR, `${agentId}.json`), JSON.stringify(list, null, 2), "utf-8");
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

function normalizeMessage(message: Partial<Message>): Message {
  return {
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
}

async function fsSend(message: Partial<Message>): Promise<Message> {
  const msg = normalizeMessage(message);

  const dir = await inboxDir(msg.to);
  const file = join(dir, `${msg.msg_id}.json`);
  await writeFile(file, JSON.stringify(msg, null, 2), "utf-8");
  return msg;
}

async function fsPoll(agentId: string, limit = 20): Promise<Message[]> {
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

async function fsAck(agentId: string, msgId: string): Promise<void> {
  const file = join(MAIL_ROOT, agentId, "processing", `${msgId}.json`);
  await rm(file, { force: true });
}

async function fsLatestModified(agentId: string): Promise<number> {
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

async function fsListInbox(agentId: string, limit = 50): Promise<Message[]> {
  const inbox = await inboxDir(agentId);
  const processing = await processingDir(agentId);
  const dirs = [inbox, processing];
  const items: Message[] = [];

  for (const dir of dirs) {
    let files: string[] = [];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const full = join(dir, file);
      try {
        const content = await readFile(full, "utf-8");
        const parsed = JSON.parse(content) as Message;
        items.push(parsed);
      } catch (err) {
        console.error(`[mail][${agentId}] failed to parse ${file}:`, err);
      }
    }
  }

  items.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  return items.slice(0, limit);
}

type AgentMap = {
  internalToVendor: Record<string, string>;
  vendorToInternal: Record<string, string | string[]>;
  modelToVendor: Record<string, string>;
};

let ensuredProject = false;

async function loadAgentMap(): Promise<AgentMap> {
  await ensureDir(MAIL_ROOT);
  try {
    const raw = await readFile(AGENT_MAP_FILE, "utf-8");
    const parsed = JSON.parse(raw) as AgentMap;
    return {
      internalToVendor: parsed.internalToVendor ?? {},
      vendorToInternal: parsed.vendorToInternal ?? {},
      modelToVendor: parsed.modelToVendor ?? {}
    };
  } catch {
    return { internalToVendor: {}, vendorToInternal: {}, modelToVendor: {} };
  }
}

async function saveAgentMap(map: AgentMap): Promise<void> {
  await ensureDir(MAIL_ROOT);
  await writeFile(AGENT_MAP_FILE, JSON.stringify(map, null, 2), "utf-8");
}

function shouldShareModelAgent(internalId: string): boolean {
  return MCP_AGENT_SCOPE === "model" && SHARED_AGENT_IDS.has(internalId);
}

function modelAgentKey(): string {
  return `${MCP_PROGRAM}:${MCP_MODEL}`;
}

function addVendorMapping(map: AgentMap, internalId: string, vendorName: string): boolean {
  let changed = false;
  if (map.internalToVendor[internalId] !== vendorName) {
    map.internalToVendor[internalId] = vendorName;
    changed = true;
  }

  const existing = map.vendorToInternal[vendorName];
  if (!existing) {
    map.vendorToInternal[vendorName] = internalId;
    changed = true;
    return changed;
  }

  if (Array.isArray(existing)) {
    if (!existing.includes(internalId)) {
      existing.push(internalId);
      changed = true;
    }
    return changed;
  }

  if (existing !== internalId) {
    map.vendorToInternal[vendorName] = [existing, internalId];
    changed = true;
  }

  return changed;
}

type McpToolResult<T> = {
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: T;
  isError?: boolean;
};

function parseJsonText(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function unwrapMcpResult<T>(result: unknown): T {
  if (!result || typeof result !== "object") return result as T;
  if (!("content" in result) && !("structuredContent" in result) && !("isError" in result)) {
    return result as T;
  }

  const wrapper = result as McpToolResult<unknown>;
  if (wrapper.isError) {
    const message =
      wrapper.content?.find((entry) => typeof entry?.text === "string")?.text ??
      "mcp_agent_mail tool error";
    throw new Error(message);
  }

  if (wrapper.structuredContent !== undefined) {
    if (
      wrapper.structuredContent &&
      typeof wrapper.structuredContent === "object" &&
      !Array.isArray(wrapper.structuredContent)
    ) {
      const keys = Object.keys(wrapper.structuredContent);
      if (keys.length === 1 && keys[0] === "result") {
        return (wrapper.structuredContent as { result: unknown }).result as T;
      }
    }
    return wrapper.structuredContent as T;
  }

  const text = wrapper.content
    ?.filter((entry) => typeof entry?.text === "string")
    .map((entry) => entry.text)
    .join("");
  if (text) {
    const parsed = parseJsonText(text);
    return (parsed ?? text) as T;
  }

  return result as T;
}

async function mcpCall<T>(name: string, args: Record<string, any>): Promise<T> {
  const res = await fetch(MCP_BASE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "tools/call",
      params: { name, arguments: args }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`mcp_agent_mail ${name} failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (data.error) throw new Error(data.error.message);
  if (!data.result) throw new Error(`mcp_agent_mail ${name} returned empty result`);
  return unwrapMcpResult<T>(data.result);
}

async function ensureProject(): Promise<void> {
  if (ensuredProject) return;
  await mcpCall("ensure_project", { human_key: MCP_PROJECT_KEY });
  ensuredProject = true;
}

async function ensureVendorAgent(internalId: string): Promise<string> {
  const map = await loadAgentMap();
  const shareByModel = shouldShareModelAgent(internalId);
  if (shareByModel) {
    const key = modelAgentKey();
    let sharedVendor = map.modelToVendor[key];
    if (!sharedVendor) {
      for (const candidateId of SHARED_AGENT_IDS) {
        const candidate = map.internalToVendor[candidateId];
        if (candidate) {
          sharedVendor = candidate;
          break;
        }
      }
      if (sharedVendor) {
        map.modelToVendor[key] = sharedVendor;
      }
    }
    if (sharedVendor) {
      const changed = addVendorMapping(map, internalId, sharedVendor);
      if (changed) await saveAgentMap(map);
      return sharedVendor;
    }
  }

  const existing = map.internalToVendor[internalId];
  if (existing) return existing;

  await ensureProject();
  const result = await mcpCall<{ name: string }>("register_agent", {
    project_key: MCP_PROJECT_KEY,
    program: MCP_PROGRAM,
    model: MCP_MODEL,
    task_description: shareByModel ? `shared model agent (${MCP_MODEL})` : internalId
  });

  if (shareByModel) {
    map.modelToVendor[modelAgentKey()] = result.name;
  }
  addVendorMapping(map, internalId, result.name);
  await saveAgentMap(map);
  return result.name;
}

async function resolveInternalAgent(vendorName?: string): Promise<string | undefined> {
  if (!vendorName) return undefined;
  const map = await loadAgentMap();
  const mapped = map.vendorToInternal[vendorName];
  if (Array.isArray(mapped)) {
    return mapped.length === 1 ? mapped[0] : undefined;
  }
  return mapped ?? vendorName;
}

function parseTypeFromSubject(subject?: string): string | undefined {
  if (!subject) return undefined;
  const match = subject.match(/^\[(\w+)\]/);
  return match ? match[1] : undefined;
}

const MESSAGE_TYPES = new Set<MessageType>([
  "ISSUE",
  "PLAN_REQUEST",
  "PLAN",
  "TASK_REQUEST",
  "RESULT",
  "REVIEW_REQUEST",
  "REVIEW",
  "MERGE_REQUEST",
  "MERGE_CONFIRMED",
  "INFO"
]);

function normalizeType(value?: string): MessageType {
  if (value && MESSAGE_TYPES.has(value as MessageType)) return value as MessageType;
  return "INFO";
}

function tryParseBody(body?: string): Partial<Message> | undefined {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body) as Partial<Message>;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // ignore
  }
  return undefined;
}

function mapPriority(priority?: "low" | "normal" | "high"): string {
  if (!priority) return "normal";
  return priority;
}

function mapImportance(importance?: string): "low" | "normal" | "high" {
  if (!importance) return "normal";
  if (importance === "low") return "low";
  if (importance === "high" || importance === "urgent") return "high";
  return "normal";
}

function shouldAcceptMessage(agentId: string, parsed?: Partial<Message>): boolean {
  if (!shouldShareModelAgent(agentId)) return true;
  return parsed?.to === agentId;
}

async function mcpSend(message: Partial<Message>): Promise<Message> {
  const msg = normalizeMessage(message);
  const fromVendor = await ensureVendorAgent(msg.from);
  const toVendor = await ensureVendorAgent(msg.to);

  const wireBody = JSON.stringify(msg, null, 2);
  const subject = `[${msg.type}] ${msg.thread_id}`;

  const result = await mcpCall<{
    deliveries: Array<{ payload: { id: number; created_ts?: string } }>;
  }>("send_message", {
    project_key: MCP_PROJECT_KEY,
    sender_name: fromVendor,
    to: [toVendor],
    subject,
    body_md: wireBody,
    importance: mapPriority(msg.priority),
    thread_id: msg.thread_id
  });

  const payload = result.deliveries?.[0]?.payload;
  const created_at = payload?.created_ts ?? msg.created_at;
  const msg_id = payload?.id ? String(payload.id) : msg.msg_id;

  return { ...msg, msg_id, created_at };
}

async function mcpPoll(agentId: string, limit = 20): Promise<Message[]> {
  const vendorName = await ensureVendorAgent(agentId);
  const items = await mcpCall<unknown>("fetch_inbox", {
    project_key: MCP_PROJECT_KEY,
    agent_name: vendorName,
    limit,
    include_bodies: true
  });

  const acked = await loadAcked(agentId);
  const list = Array.isArray(items) ? items : [];
  const messages: Message[] = [];
  for (const item of list) {
    const parsed = tryParseBody(item.body_md);
    if (!shouldAcceptMessage(agentId, parsed)) continue;
    const from = (await resolveInternalAgent(item.from)) ?? parsed?.from ?? "unknown";
    const type = normalizeType(parsed?.type ?? parseTypeFromSubject(item.subject));
    const thread_id =
      parsed?.thread_id ?? item.thread_id ?? `thread-${String(item.id ?? randomUUID())}`;
    const created_at = parsed?.created_at ?? item.created_ts ?? new Date().toISOString();
    const msg_id = String(item.id ?? parsed?.msg_id ?? randomUUID());
    if (acked.has(msg_id)) continue;
    const payload = parsed?.payload ?? { body: item.body_md ?? "" };

    messages.push({
      thread_id,
      msg_id,
      from,
      to: agentId,
      type,
      priority: parsed?.priority ?? mapImportance(item.importance),
      context_refs: parsed?.context_refs ?? [],
      acceptance_criteria: parsed?.acceptance_criteria ?? [],
      payload,
      created_at
    });
  }

  messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return messages.slice(0, limit);
}

async function mcpAck(agentId: string, msgId: string): Promise<void> {
  const vendorName = await ensureVendorAgent(agentId);
  const message_id = Number(msgId);
  if (!Number.isFinite(message_id)) {
    throw new Error(`mcp ack requires numeric message id, got ${msgId}`);
  }
  await mcpCall("acknowledge_message", {
    project_key: MCP_PROJECT_KEY,
    agent_name: vendorName,
    message_id
  });
  const acked = await loadAcked(agentId);
  acked.add(String(msgId));
  await saveAcked(agentId, acked);
}

async function mcpLatestModified(agentId: string): Promise<number> {
  const messages = await mcpListInbox(agentId, 1);
  if (!messages.length) return 0;
  return new Date(messages[0].created_at).getTime();
}

async function mcpListInbox(agentId: string, limit = 50): Promise<Message[]> {
  const vendorName = await ensureVendorAgent(agentId);
  const items = await mcpCall<unknown>("fetch_inbox", {
    project_key: MCP_PROJECT_KEY,
    agent_name: vendorName,
    limit,
    include_bodies: true
  });

  const acked = await loadAcked(agentId);
  const list = Array.isArray(items) ? items : [];
  const messages: Message[] = [];
  for (const item of list) {
    const parsed = tryParseBody(item.body_md);
    if (!shouldAcceptMessage(agentId, parsed)) continue;
    const from = (await resolveInternalAgent(item.from)) ?? parsed?.from ?? "unknown";
    const type = normalizeType(parsed?.type ?? parseTypeFromSubject(item.subject));
    const thread_id =
      parsed?.thread_id ?? item.thread_id ?? `thread-${String(item.id ?? randomUUID())}`;
    const created_at = parsed?.created_at ?? item.created_ts ?? new Date().toISOString();
    const msg_id = String(item.id ?? parsed?.msg_id ?? randomUUID());
    if (acked.has(msg_id)) continue;
    const payload = parsed?.payload ?? { body: item.body_md ?? "" };

    messages.push({
      thread_id,
      msg_id,
      from,
      to: agentId,
      type,
      priority: parsed?.priority ?? mapImportance(item.importance),
      context_refs: parsed?.context_refs ?? [],
      acceptance_criteria: parsed?.acceptance_criteria ?? [],
      payload,
      created_at
    });
  }

  messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return messages.slice(0, limit);
}

export async function send(message: Partial<Message>): Promise<Message> {
  if (MAIL_BACKEND === "filesystem") return fsSend(message);
  return mcpSend(message);
}

export async function poll(agentId: string, limit = 20): Promise<Message[]> {
  if (MAIL_BACKEND === "filesystem") return fsPoll(agentId, limit);
  return mcpPoll(agentId, limit);
}

export async function ack(agentId: string, msgId: string): Promise<void> {
  if (MAIL_BACKEND === "filesystem") return fsAck(agentId, msgId);
  return mcpAck(agentId, msgId);
}

export async function latestModified(agentId: string): Promise<number> {
  if (MAIL_BACKEND === "filesystem") return fsLatestModified(agentId);
  return mcpLatestModified(agentId);
}

export async function listInbox(agentId: string, limit = 50): Promise<Message[]> {
  if (MAIL_BACKEND === "filesystem") return fsListInbox(agentId, limit);
  return mcpListInbox(agentId, limit);
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
