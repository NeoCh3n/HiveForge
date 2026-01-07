import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Bead } from "../../types/protocol.ts";

const execFileAsync = promisify(execFile);
const __dirname = join(fileURLToPath(import.meta.url), '..');
const BD_PATH = join(__dirname, '../../vendor/beads/bd');

const TYPE_MAP: Record<string, string> = {
  TaskBead: 'task',
  ProjectBead: 'epic',
  DecisionBead: 'feature'
};

async function runBd(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(BD_PATH, args, { cwd: process.cwd(), timeout: 10000 });
    return stdout.trim();
  } catch (error) {
    console.error("[memory] bd command failed:", error);
    throw new Error(`Beads operation failed: ${error.message}`);
  }
}

async function runBdJson(args: string[]): Promise<any> {
  const output = await runBd([...args, '--json']);
  return JSON.parse(output);
}

async function getBdIdByExternalRef(externalRef: string): Promise<string | null> {
  const issues = await runBdJson(['list', '--all']);
  const issue = issues.find((i: any) => i.external_ref === externalRef);
  return issue ? issue.id : null;
}

async function ensureMemory(): Promise<void> {
  // Check if beads is initialized
  try {
    await runBd(['list', '--limit', '1']);
  } catch {
    // Init if not
    await runBd(['init', '--silent']);
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

  const labels = [...(record.tags ?? [])];
  if (record.thread_id) {
    labels.push(`thread:${record.thread_id}`);
  }

  const args = [
    'create',
    record.title,
    '--external-ref', record.id,
    '--description', record.content,
    '--type', TYPE_MAP[record.type] ?? 'task',
    '--silent'
  ];
  if (labels.length > 0) {
    args.push('--labels', labels.join(','));
  }

  const bdId = await runBd(args);
  // Store bd id in extra for potential future use
  record.extra = { ...record.extra, bdId };

  return record;
}

export async function recall(
  query: string,
  scope: { type?: string; thread_id?: string } = {},
  k = 5
): Promise<Bead[]> {
  await ensureMemory();

  const args = ['list', '--all', '--limit', '1000']; // Get more than k to filter
  if (scope.type) {
    args.push('--type', TYPE_MAP[scope.type] ?? scope.type.toLowerCase());
  }
  if (scope.thread_id) {
    args.push('--label', `thread:${scope.thread_id}`);
  }

  const issues = await runBdJson(args);
  const beads: Bead[] = [];

  for (const issue of issues) {
    // Map back to Bead
    const bead: Bead = {
      id: issue.external_ref || issue.id,
      type: (Object.keys(TYPE_MAP).find(key => TYPE_MAP[key] === issue.issue_type) as BeadType) || 'TaskBead',
      title: issue.title,
      content: issue.description || '',
      thread_id: scope.thread_id, // From scope or extract from labels
      tags: issue.labels?.filter((l: string) => !l.startsWith('thread:')) || [],
      created_at: issue.created_at,
      extra: { bdId: issue.id }
    };

    // Extract thread_id from labels if not in scope
    if (!bead.thread_id) {
      const threadLabel = issue.labels?.find((l: string) => l.startsWith('thread:'));
      if (threadLabel) {
        bead.thread_id = threadLabel.split(':', 2)[1];
      }
    }

    if (query) {
      const haystack = `${bead.title} ${bead.content} ${(bead.tags ?? []).join(" ")}`.toLowerCase();
      if (!haystack.includes(query.toLowerCase())) continue;
    }

    beads.push(bead);
  }

  beads.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return beads.slice(0, k);
}

export async function link(threadId: string, beadIds: string[]): Promise<void> {
  await ensureMemory();

  // Create or get thread bead
  let threadBdId = await getBdIdByExternalRef(`thread-${threadId}`);
  if (!threadBdId) {
    // Create thread bead
    const args = [
      'create',
      `Thread ${threadId}`,
      '--external-ref', `thread-${threadId}`,
      '--type', 'epic',
      '--description', `Thread container for ${threadId}`,
      '--silent'
    ];
    threadBdId = await runBd(args);
  }

  // Link each bead to thread
  for (const beadId of beadIds) {
    const beadBdId = await getBdIdByExternalRef(beadId);
    if (beadBdId) {
      await runBd(['dep', 'add', beadBdId, threadBdId]);
    }
  }
}

export async function summarize(threadId: string): Promise<string> {
  const beads = await recall("", { thread_id: threadId }, 10);
  if (!beads.length) return "No beads found for this thread.";
  return beads
    .map((b) => `- ${b.type}: ${b.title}`)
    .join("\n");
}
