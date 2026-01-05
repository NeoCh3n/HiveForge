// @ts-nocheck
import { createServer } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { URL } from "node:url";

const PORT = parseInt(process.env.PORT ?? "8787", 10);
const DATA_ROOT = resolve(".hiveforge");
const STATE_DIR = join(DATA_ROOT, "state");
const MAIL_DIR = join(DATA_ROOT, "mail");
const MEMORY_FILE = join(DATA_ROOT, "memory", "beads.jsonl");
const EVENTS_FILE = join(DATA_ROOT, "events.log");
const PUBLIC_DIR = resolve("services/gateway/public");

async function safeJson(path: string) {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function listStates() {
  try {
    const files = await readdir(STATE_DIR);
    const items = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const full = join(STATE_DIR, file);
      const payload = await safeJson(full);
      if (payload) items.push(payload);
    }
    items.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
    return items;
  } catch {
    return [];
  }
}

async function listMessages(agent: string) {
  const inbox = join(MAIL_DIR, agent, "inbox");
  try {
    const files = await readdir(inbox);
    const items = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const full = join(inbox, file);
      const payload = await safeJson(full);
      if (payload) items.push(payload);
    }
    items.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
    return items;
  } catch {
    return [];
  }
}

async function listBeads(threadId?: string, limit = 50) {
  try {
    const raw = await readFile(MEMORY_FILE, "utf-8");
    const lines = raw.split("\n").filter(Boolean);
    const items = [];
    for (const line of lines) {
      try {
        const bead = JSON.parse(line);
        if (threadId && bead.thread_id !== threadId) continue;
        items.push(bead);
      } catch {
        // ignore
      }
    }
    items.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    return items.slice(0, limit);
  } catch {
    return [];
  }
}

async function readEvents(limit = 200) {
  try {
    const raw = await readFile(EVENTS_FILE, "utf-8");
    const lines = raw.trim().split("\n");
    return lines.slice(-limit);
  } catch {
    return [];
  }
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function serveStatic(pathname: string, res) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = join(PUBLIC_DIR, safePath);
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) {
      json(res, 404, { error: "Not found" });
      return;
    }
    const ext = extname(filePath);
    const mime =
      ext === ".html"
        ? "text/html"
        : ext === ".js"
        ? "application/javascript"
        : ext === ".css"
        ? "text/css"
        : "text/plain";
    const content = await readFile(filePath);
    res.writeHead(200, { "Content-Type": mime });
    res.end(content);
  } catch {
    json(res, 404, { error: "Not found" });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const path = url.pathname;

  if (path.startsWith("/api/state")) {
    const data = await listStates();
    json(res, 200, { data });
    return;
  }

  if (path.startsWith("/api/messages")) {
    const agent = url.searchParams.get("agent") || "orchestrator";
    const data = await listMessages(agent);
    json(res, 200, { data });
    return;
  }

  if (path.startsWith("/api/beads")) {
    const thread = url.searchParams.get("thread_id") || undefined;
    const data = await listBeads(thread, 100);
    json(res, 200, { data });
    return;
  }

  if (path.startsWith("/api/events")) {
    const data = await readEvents(300);
    json(res, 200, { data });
    return;
  }

  await serveStatic(path, res);
});

server.listen(PORT, () => {
  console.log(`HiveForge UI running at http://localhost:${PORT}`);
});
