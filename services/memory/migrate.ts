import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = join(fileURLToPath(import.meta.url), '..');
const BD_PATH = join(__dirname, '../../vendor/beads/bd');

const TYPE_MAP: Record<string, string> = {
  TaskBead: 'task',
  ProjectBead: 'epic',
  DecisionBead: 'feature'
};

async function runBd(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(BD_PATH, args, { cwd: process.cwd() });
  return stdout.trim();
}

async function migrate() {
  const beadsFile = join(process.cwd(), '.hiveforge/memory/beads.jsonl');
  const linksFile = join(process.cwd(), '.hiveforge/memory/links.json');

  // Ensure beads is initialized
  try {
    await runBd(['list', '--limit', '1']);
  } catch {
    await runBd(['init', '--silent']);
  }

  try {
    const data = await readFile(beadsFile, 'utf-8');
    const lines = data.split('\n').filter(Boolean);

    console.log(`Migrating ${lines.length} beads...`);

    for (const line of lines) {
      const bead = JSON.parse(line);
      const labels = [...(bead.tags ?? [])];
      if (bead.thread_id) {
        labels.push(`thread:${bead.thread_id}`);
      }

      const args = [
        'create',
        bead.title,
        '--external-ref', bead.id,
        '--description', bead.content,
        '--type', TYPE_MAP[bead.type] ?? 'task',
        '--silent'
      ];
      if (labels.length > 0) {
        args.push('--labels', labels.join(','));
      }

      await runBd(args);
      console.log(`Migrated: ${bead.title}`);
    }

    // Migrate links if needed
    const linksData = await readFile(linksFile, 'utf-8');
    const links = JSON.parse(linksData);

    for (const [threadId, beadIds] of Object.entries(links)) {
      if (Array.isArray(beadIds)) {
        // Create thread bead if not exists
        let threadBdId: string;
        try {
          const issues = JSON.parse(await runBd(['list', '--all', '--json']));
          const threadIssue = issues.find((i: any) => i.external_ref === `thread-${threadId}`);
          threadBdId = threadIssue?.id;
        } catch {}

        if (!threadBdId) {
          threadBdId = await runBd([
            'create',
            `Thread ${threadId}`,
            '--external-ref', `thread-${threadId}`,
            '--type', 'epic',
            '--description', `Thread container for ${threadId}`,
            '--silent'
          ]);
        }

        // Link beads
        for (const beadId of beadIds) {
          try {
            const issues = JSON.parse(await runBd(['list', '--all', '--json']));
            const beadIssue = issues.find((i: any) => i.external_ref === beadId);
            if (beadIssue) {
              await runBd(['dep', 'add', beadIssue.id, threadBdId]);
            }
          } catch (e) {
            console.error(`Failed to link ${beadId}:`, e);
          }
        }
      }
    }

    console.log('Migration complete');
  } catch (e) {
    console.error('Migration failed:', e);
  }
}

migrate();