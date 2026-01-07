// @ts-nocheck
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { URL } from "node:url";

const PORT = 8787;
const PUBLIC_DIR = resolve("services/gateway/public");

const server = createServer();

server.on("request", async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const path = url.pathname;

  // Health check
  if (path === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      timestamp: new Date().toISOString(),
      services: { mail: "filesystem", memory: "beads", orchestrator: "active" }
    }));
    return;
  }

  // Dashboard API
  if (path === "/api/dashboard") {
    // Mock data for now - will integrate real data later
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      data: {
        states: [],
        beads: [],
        mail: [],
        events: ["2026-01-07T07:54:43.566Z [test] System started"],
        mail_ui_url: null
      }
    }));
    return;
  }

  // Issue submission
  if (path === "/api/issue" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        console.log("Issue submitted:", data);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, thread_id: `issue-${Date.now()}` }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  // Serve static files
  try {
    if (path === "/") path = "/index.html";
    const filePath = join(PUBLIC_DIR, path);
    const content = await readFile(filePath);
    const ext = path.split('.').pop();
    const mime = ext === 'html' ? 'text/html' :
                 ext === 'js' ? 'application/javascript' :
                 ext === 'css' ? 'text/css' : 'text/plain';
    res.writeHead(200, { "Content-Type": mime });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

server.listen(PORT, () => {
  console.log(`HiveForge UI running at http://localhost:${PORT}`);
});