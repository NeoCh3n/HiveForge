// @ts-nocheck
import { createServer } from "node:http";
import { readFile, readdir, stat, mkdir } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { URL } from "node:url";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { listInbox, send as mailSend } from "../mail/adapter.ts";
import { DATA_ROOT, EVENT_LOG, MAIL_BACKEND, MAIL_ROOT, MCP_BASE_URL, MEMORY_ROOT, STATE_DIR } from "../config.ts";

const execFileAsync = promisify(execFile);
const VC_PATH = join(process.cwd(), 'vendor/vc/vc');

const PORT = parseInt(process.env.PORT ?? "8787", 10);
const PORT_ENV = process.env.PORT;
const MAX_PORT_RETRIES = 5;
const MAIL_DIR = MAIL_ROOT;
const MEMORY_FILE = join(MEMORY_ROOT, "beads.jsonl");
const EVENTS_FILE = EVENT_LOG;
const PUBLIC_DIR = resolve("services/gateway/public");
const MAIL_UI_URL = MAIL_BACKEND === "mcp" ? deriveMailUiUrl(MCP_BASE_URL) : null;

function deriveMailUiUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    const replaced = url.pathname.replace(/\/mcp\/?$/, "/mail");
    url.pathname = replaced === url.pathname ? "/mail" : replaced;
    return url.toString();
  } catch {
    return "http://127.0.0.1:8765/mail";
  }
}

async function safeJson(path: string) {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function ensureDirs() {
  await mkdir(DATA_ROOT, { recursive: true });
  await mkdir(STATE_DIR, { recursive: true });
  await mkdir(MAIL_DIR, { recursive: true });
  await mkdir(join(DATA_ROOT, "memory"), { recursive: true });
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

const AGENT_IDS = ["orchestrator", "planner", "implementer", "reviewer", "integrator", "user", "ui"];

async function collectAllMail() {
  const mailbox: Record<string, any[]> = {};
  for (const agent of AGENT_IDS) {
    mailbox[agent] = await listMessages(agent);
  }
  return mailbox;
}

async function listMessages(agent: string) {
  try {
    return await listInbox(agent, 50);
  } catch (err) {
    console.error(`[gateway] failed to list inbox for ${agent}:`, err);
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

async function bodyJson(req) {
  return await new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
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

const server = createServer();

async function start() {
  await ensureDirs();
  let currentPort = PORT;
  let retries = 0;

  server.on("request", async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    const path = url.pathname;

    // Health check
    if (path === "/health") {
      let vcStatus = "not available";
      try {
        await execFileAsync(VC_PATH, ['doctor'], { timeout: 5000 });
        vcStatus = "healthy";
      } catch {
        vcStatus = "unavailable";
      }

      const health = {
        status: "ok",
        timestamp: new Date().toISOString(),
        services: {
          mail: MAIL_BACKEND,
          memory: "beads",
          orchestrator: "active",
          vc: vcStatus
        }
      };
      json(res, 200, health);
      return;
    }

    // Dashboard bundle: states + beads + mail + events
    if (path === "/api/dashboard") {
      const [states, beads, mail, events] = await Promise.all([
        listStates(),
        listBeads(undefined, 100),
        MAIL_BACKEND === "mcp" ? Promise.resolve({}) : collectAllMail(),
        readEvents(300)
      ]);
      json(res, 200, { data: { states, beads, mail, events, mail_ui_url: MAIL_UI_URL } });
      return;
    }

    // Submit issue directly (drops an ISSUE message to orchestrator inbox)
    if (path === "/api/issue" && req.method === "POST") {
      const body = await bodyJson(req);
      const issue = body?.issue ?? body ?? {};
      const thread = issue.thread_id ?? `issue-${randomUUID()}`;
      const msg = {
        thread_id: thread,
        msg_id: randomUUID(),
        from: "ui",
        to: "orchestrator",
        type: "ISSUE",
        payload: { ...issue, thread_id: thread },
        created_at: new Date().toISOString()
      };
      await mailSend(msg);
      json(res, 200, { ok: true, thread_id: thread });
      return;
    }

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

  server.on("error", (err: any) => {
    if (err?.code === "EADDRINUSE" && !PORT_ENV && retries < MAX_PORT_RETRIES) {
      retries += 1;
      const nextPort = currentPort + 1;
      console.warn(`[gateway] port ${currentPort} in use; trying ${nextPort}`);
      currentPort = nextPort;
      server.listen(currentPort, () => {
        console.log(`HiveForge UI running at http://localhost:${currentPort}`);
      });
      return;
    }
    console.error("Gateway failed to start:", err);
    process.exit(1);
  });

  server.listen(currentPort, () => {
    console.log(`HiveForge UI running at http://localhost:${currentPort}`);
  });
}

start().catch((err) => {
  console.error("Gateway failed to start:", err);
  process.exit(1);
});
