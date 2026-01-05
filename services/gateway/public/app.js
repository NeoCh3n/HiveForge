const threadsEl = document.getElementById("threads");
const stateEl = document.getElementById("state-view");
const threadTitleEl = document.getElementById("thread-title");
const beadsEl = document.getElementById("beads");
const mailEl = document.getElementById("mail");
const eventsEl = document.getElementById("events");
const refreshBtn = document.getElementById("refresh");
const submitBtn = document.getElementById("submit-demo");

let dashboard = { states: [], beads: [], mail: {}, events: [] };
let selectedThread = null;

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
  return res.json();
}

function renderThreads() {
  threadsEl.innerHTML = "";
  if (!dashboard.states.length) {
    threadsEl.innerHTML = `<div class="muted">No threads yet. Submit an issue.</div>`;
    return;
  }
  dashboard.states.forEach((t) => {
    const div = document.createElement("div");
    div.className = `thread ${selectedThread === t.thread_id ? "active" : ""}`;
    div.onclick = () => {
      selectedThread = t.thread_id;
      renderThreads();
      renderState(t);
      renderBeads();
      renderMail();
    };
    div.innerHTML = `
      <div class="thread-id">${t.thread_id}</div>
      <div class="thread-state">${t.state}</div>
      <div class="thread-time">${t.updated_at ?? ""}</div>
    `;
    threadsEl.appendChild(div);
  });
}

function renderState(state) {
  if (!state) {
    threadTitleEl.textContent = "Select a thread";
    stateEl.textContent = "";
    return;
  }
  threadTitleEl.textContent = state.thread_id;
  stateEl.textContent = JSON.stringify(state, null, 2);
}

function renderBeads() {
  if (!selectedThread) {
    beadsEl.innerHTML = `<div class="muted">Select a thread.</div>`;
    return;
  }
  const beads = (dashboard.beads || []).filter((b) => b.thread_id === selectedThread);
  if (!beads.length) {
    beadsEl.innerHTML = `<div class="muted">No beads for this thread.</div>`;
    return;
  }
  beadsEl.innerHTML = "";
  beads.forEach((b) => {
    const item = document.createElement("div");
    item.className = "mono";
    item.innerHTML = `<span class="badge">${b.type}</span> ${b.title}<br/><span class="muted">${b.created_at}</span><br/>${b.content}`;
    beadsEl.appendChild(item);
  });
}

function renderMail() {
  const agents = ["orchestrator", "planner", "implementer", "reviewer", "integrator"];
  mailEl.innerHTML = "";
  agents.forEach((agent) => {
    const items = (dashboard.mail && dashboard.mail[agent]) || [];
    const box = document.createElement("div");
    box.className = "mono";
    box.innerHTML =
      `<div class="badge">${agent}</div>` +
      (items.length
        ? items
            .map(
              (m) =>
                `${m.created_at ?? ""} [${m.type}] ${m.thread_id}\n${JSON.stringify(
                  m.payload ?? {},
                  null,
                  2
                )}`
            )
            .join("\n\n")
        : "Inbox empty");
    mailEl.appendChild(box);
  });
}

function renderEvents() {
  const lines = dashboard.events || [];
  eventsEl.textContent = lines.join("\n");
}

async function refreshAll() {
  try {
    const data = await fetchJson("/api/dashboard");
    dashboard = data.data || { states: [], beads: [], mail: {}, events: [] };
    if (!selectedThread && dashboard.states.length) {
      selectedThread = dashboard.states[0].thread_id;
    }
    renderThreads();
    renderState(dashboard.states.find((t) => t.thread_id === selectedThread));
    renderBeads();
    renderMail();
    renderEvents();
  } catch (err) {
    threadsEl.innerHTML = `<div class="muted">Failed to load dashboard.</div>`;
    console.error(err);
  }
}

async function submitDemoIssue() {
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";
  try {
    const issue = {
      title: "UI-submitted issue",
      description: "Created from HiveForge UI to test flow + mail + memory.",
      acceptance_criteria: [
        "Planner responds",
        "Implementer responds",
        "Reviewer responds",
        "Thread ends in DONE and writes bead"
      ]
    };
    const res = await fetchJson("/api/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issue })
    });
    selectedThread = res.thread_id;
    await refreshAll();
  } catch (err) {
    alert("Failed to submit issue. Make sure orchestrator + agents are running.");
    console.error(err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit demo issue";
  }
}

refreshBtn.addEventListener("click", refreshAll);
submitBtn.addEventListener("click", submitDemoIssue);
refreshAll();
setInterval(refreshAll, 2500);
