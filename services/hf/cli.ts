import { access, mkdir, readFile, rename } from "node:fs/promises";
import { join } from "node:path";

import { ack, listInbox, poll, send, subscribe } from "../mail/adapter.ts";
import { link, recall, remember, summarize } from "../memory/adapter.ts";
import { MAIL_BACKEND, MAIL_ROOT } from "../config.ts";
import type { BeadType, Message, MessageType } from "../../types/protocol.ts";

type ParsedArgs = {
  positionals: string[];
  flags: Record<string, string | boolean>;
};

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    index++;
  }

  return { positionals, flags };
}

function getString(flags: ParsedArgs["flags"], key: string): string | undefined {
  const value = flags[key];
  if (typeof value === "string") return value;
  return undefined;
}

function getBool(flags: ParsedArgs["flags"], key: string): boolean {
  return flags[key] === true || flags[key] === "true" || flags[key] === "1";
}

function getNumber(flags: ParsedArgs["flags"], key: string, fallback: number): number {
  const raw = getString(flags, key);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

async function readJsonFile(path: string): Promise<any> {
  const raw = await readFile(path, "utf-8");
  return raw ? (JSON.parse(raw) as any) : {};
}

async function parseJsonPayload(flags: ParsedArgs["flags"]): Promise<Record<string, any>> {
  const payloadFile = getString(flags, "payload-file");
  if (payloadFile) return (await readJsonFile(payloadFile)) as Record<string, any>;

  const payload = getString(flags, "payload");
  if (!payload) return {};
  return JSON.parse(payload) as Record<string, any>;
}

async function ensureDir(path: string): Promise<void> {
  try {
    await access(path);
  } catch {
    await mkdir(path, { recursive: true });
  }
}

async function claimMessageFile(agentId: string, msgId: string): Promise<string> {
  const inbox = join(MAIL_ROOT, agentId, "inbox");
  const processing = join(MAIL_ROOT, agentId, "processing");
  await ensureDir(inbox);
  await ensureDir(processing);

  const processingFile = join(processing, `${msgId}.json`);
  try {
    await access(processingFile);
    return processingFile;
  } catch {
    // continue
  }

  const inboxFile = join(inbox, `${msgId}.json`);
  const claimedFile = processingFile;
  await rename(inboxFile, claimedFile);
  return claimedFile;
}

async function mailSend(args: ParsedArgs): Promise<void> {
  const from = getString(args.flags, "from");
  const to = getString(args.flags, "to");
  const type = getString(args.flags, "type") as MessageType | undefined;
  const thread_id = getString(args.flags, "thread") ?? getString(args.flags, "thread_id");
  const priority = getString(args.flags, "priority") as "low" | "normal" | "high" | undefined;

  if (!from || !to || !type || !thread_id) {
    console.error("Usage: mail send --from <id> --to <id> --type <TYPE> --thread <thread_id> [--payload ...]");
    process.exit(2);
  }

  const payload = await parseJsonPayload(args.flags);
  const acceptanceRaw = getString(args.flags, "acceptance");
  const acceptance_criteria = acceptanceRaw ? acceptanceRaw.split("|").map((s) => s.trim()).filter(Boolean) : [];

  const msg = await send({
    thread_id,
    from,
    to,
    type,
    priority,
    acceptance_criteria,
    payload
  });

  console.log(JSON.stringify(msg, null, 2));
}

async function mailPoll(args: ParsedArgs): Promise<void> {
  const agentId = args.positionals[0];
  if (!agentId) {
    console.error("Usage: mail poll <agentId> [--limit 20]");
    process.exit(2);
  }
  const limit = getNumber(args.flags, "limit", 20);
  const messages = await poll(agentId, limit);
  console.log(JSON.stringify(messages, null, 2));
}

async function mailAck(args: ParsedArgs): Promise<void> {
  const agentId = args.positionals[0];
  const msgId = args.positionals[1];
  if (!agentId || !msgId) {
    console.error("Usage: mail ack <agentId> <msg_id>");
    process.exit(2);
  }
  await ack(agentId, msgId);
  console.log(JSON.stringify({ ok: true, agentId, msgId }));
}

async function mailReply(args: ParsedArgs): Promise<void> {
  const agentId = args.positionals[0];
  const msgId = args.positionals[1];
  const type = getString(args.flags, "type") as MessageType | undefined;
  if (!agentId || !msgId || !type) {
    console.error(
      "Usage: mail reply <agentId> <msg_id> --type <TYPE> [--payload ...|--payload-file <path>] [--to <id>] [--ack]"
    );
    process.exit(2);
  }

  let original: Message | undefined;
  if (MAIL_BACKEND === "filesystem") {
    const claimedFile = await claimMessageFile(agentId, msgId);
    original = (await readJsonFile(claimedFile)) as Message;
  } else {
    const messages = await listInbox(agentId, 200);
    original = messages.find((m) => m.msg_id === msgId);
  }

  if (!original) {
    console.error(`Message ${msgId} not found for ${agentId}`);
    process.exit(2);
  }
  const payload = await parseJsonPayload(args.flags);
  const to = getString(args.flags, "to") ?? original.from;

  const msg = await send({
    thread_id: original.thread_id,
    from: agentId,
    to,
    type,
    acceptance_criteria: original.acceptance_criteria ?? [],
    context_refs: original.context_refs ?? [],
    payload
  });

  if (getBool(args.flags, "ack")) {
    await ack(agentId, msgId);
  }

  console.log(JSON.stringify(msg, null, 2));
}

async function mailWatch(args: ParsedArgs): Promise<void> {
  const agentId = args.positionals[0];
  if (!agentId) {
    console.error("Usage: mail watch <agentId> [--interval-ms 800] [--limit 20]");
    process.exit(2);
  }
  const limit = getNumber(args.flags, "limit", 20);
  const intervalMs = getNumber(args.flags, "interval-ms", 800);

  for await (const message of subscribe(agentId, { limit, intervalMs })) {
    console.log(JSON.stringify(message));
  }
}

async function memoryRemember(args: ParsedArgs): Promise<void> {
  const type = (getString(args.flags, "type") ?? "TaskBead") as BeadType;
  const title = getString(args.flags, "title") ?? "Untitled";
  const content = getString(args.flags, "content") ?? "";
  const thread_id = getString(args.flags, "thread") ?? getString(args.flags, "thread_id");
  const tagsRaw = getString(args.flags, "tags");
  const tags = tagsRaw ? tagsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];

  const bead = await remember({ type, title, content, thread_id, tags });
  console.log(JSON.stringify(bead, null, 2));
}

async function memoryRecall(args: ParsedArgs): Promise<void> {
  const query = args.positionals[0] ?? "";
  const type = getString(args.flags, "type");
  const thread_id = getString(args.flags, "thread") ?? getString(args.flags, "thread_id");
  const limit = getNumber(args.flags, "limit", 5);

  const beads = await recall(query, { type, thread_id }, limit);
  console.log(JSON.stringify(beads, null, 2));
}

async function memoryLink(args: ParsedArgs): Promise<void> {
  const threadId = args.positionals[0];
  const beadIds = args.positionals.slice(1);
  if (!threadId || !beadIds.length) {
    console.error("Usage: memory link <thread_id> <bead_id> [bead_id...]");
    process.exit(2);
  }
  await link(threadId, beadIds);
  console.log(JSON.stringify({ ok: true, thread_id: threadId, bead_ids: beadIds }));
}

async function memorySummarize(args: ParsedArgs): Promise<void> {
  const threadId = args.positionals[0];
  if (!threadId) {
    console.error("Usage: memory summarize <thread_id>");
    process.exit(2);
  }
  const summary = await summarize(threadId);
  console.log(summary);
}

function printHelp(): void {
  console.log(
    `HiveForge helper CLI

Usage:
  node services/hf/cli.ts mail <cmd> ...
  node services/hf/cli.ts memory <cmd> ...

Mail:
  mail poll <agentId> [--limit 20]
  mail watch <agentId> [--interval-ms 800] [--limit 20]
  mail ack <agentId> <msg_id>
  mail send --from <id> --to <id> --type <TYPE> --thread <thread_id> [--payload <json>|--payload-file <path>] [--priority low|normal|high] [--acceptance \"a|b|c\"]
  mail reply <agentId> <msg_id> --type <TYPE> [--payload <json>|--payload-file <path>] [--to <id>] [--ack]

Memory:
  memory remember [--type ProjectBead|DecisionBead|TaskBead] [--thread <id>] --title <t> --content <c> [--tags a,b,c]
  memory recall [query] [--type <BeadType>] [--thread <id>] [--limit 5]
  memory link <thread_id> <bead_id> [bead_id...]
  memory summarize <thread_id>
`
  );
}

async function main(): Promise<void> {
  const [, , domain, subcmd, ...rest] = process.argv;
  if (!domain) {
    printHelp();
    return;
  }

  const args = parseArgs(rest);

  if (domain === "mail") {
    if (subcmd === "send") return mailSend(args);
    if (subcmd === "poll") return mailPoll(args);
    if (subcmd === "watch") return mailWatch(args);
    if (subcmd === "ack") return mailAck(args);
    if (subcmd === "reply") return mailReply(args);
    printHelp();
    return;
  }

  if (domain === "memory") {
    if (subcmd === "remember") return memoryRemember(args);
    if (subcmd === "recall") return memoryRecall(args);
    if (subcmd === "link") return memoryLink(args);
    if (subcmd === "summarize") return memorySummarize(args);
    printHelp();
    return;
  }

  printHelp();
}

main().catch((err) => {
  console.error("hf fatal error:", err);
  process.exit(1);
});
