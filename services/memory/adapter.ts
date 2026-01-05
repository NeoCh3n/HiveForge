import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Bead } from "../../types/protocol.ts";

const MEMORY_ROOT = resolve(".hiveforge/memory");
const BEADS_FILE = join(MEMORY_ROOT, "beads.jsonl");
const LINKS_FILE = join(MEMORY_ROOT, "links.json");

async function ensureMemory(): Promise<void> {
  try {
    await access(MEMORY_ROOT);
  } catch {
    await mkdir(MEMORY_ROOT, { recursive: true });
  }

  try {
    await access(BEADS_FILE);
  } catch {
    await writeFile(BEADS_FILE, "", "utf-8");
  }

  try {
    await access(LINKS_FILE);
  } catch {
    await writeFile(LINKS_FILE, JSON.stringify({}, null, 2), "utf-8");
  }
}

export async function remember(bead: Partial<Bead>): Promise<Bead> {
  await ensureMemory();
  const record: Bead = {
    id: bead.id ?? randomUUID(),
    type: bead.type ?? "TaskBead",
    title: bead.title ?? "Untitled",
    content: bead.content ?? "",
    thread_id: bead.thread_id,
    tags: bead.tags ?? [],
    created_at: bead.created_at ?? new Date().toISOString(),
    extra: bead.extra ?? {}
  };

  const line = JSON.stringify(record);
  await appendFile(BEADS_FILE, `${line}\n`, "utf-8");
  return record;
}

export async function recall(
  query: string,
  scope: { type?: string; thread_id?: string } = {},
  k = 5
): Promise<Bead[]> {
  await ensureMemory();
  const data = await readFile(BEADS_FILE, "utf-8");
  const lines = data.split("\n").filter(Boolean);
  const beads: Bead[] = [];

  for (const line of lines) {
    try {
      const bead = JSON.parse(line) as Bead;
      if (scope.type && bead.type !== scope.type) continue;
      if (scope.thread_id && bead.thread_id !== scope.thread_id) continue;

      if (query) {
        const haystack = `${bead.title} ${bead.content} ${(bead.tags ?? []).join(" ")}`.toLowerCase();
        if (!haystack.includes(query.toLowerCase())) continue;
      }

      beads.push(bead);
    } catch (err) {
      console.error("[memory] failed to parse bead line:", err);
    }
  }

  beads.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return beads.slice(0, k);
}

export async function link(threadId: string, beadIds: string[]): Promise<void> {
  await ensureMemory();
  const raw = await readFile(LINKS_FILE, "utf-8");
  const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
  const existing = parsed[threadId] ?? [];
  const merged = Array.from(new Set([...existing, ...beadIds]));
  parsed[threadId] = merged;
  await writeFile(LINKS_FILE, JSON.stringify(parsed, null, 2), "utf-8");
}

export async function summarize(threadId: string): Promise<string> {
  const beads = await recall("", { thread_id: threadId }, 10);
  if (!beads.length) return "No beads found for this thread.";
  return beads
    .map((b) => `- ${b.type}: ${b.title}`)
    .join("\n");
}
