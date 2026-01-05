const threadsEl = document.getElementById("threads");
const stateEl = document.getElementById("state-view");
const threadTitleEl = document.getElementById("thread-title");
const beadsEl = document.getElementById("beads");
const mailEl = document.getElementById("mail");
const eventsEl = document.getElementById("events");
const refreshBtn = document.getElementById("refresh");
const newIssueBtn = document.getElementById("new-issue");

const backdrop = document.getElementById("modal-backdrop");
const modalClose = document.getElementById("modal-close");
const modalCancel = document.getElementById("modal-cancel");
const modalSubmit = document.getElementById("modal-submit");
const issueForm = document.getElementById("issue-form");
const titleInput = document.getElementById("issue-title");
const descInput = document.getElementById("issue-desc");
const criteriaInput = document.getElementById("issue-criteria");

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

function openModal() {
  backdrop.classList.remove("hidden");
  titleInput.focus();
}

function closeModal() {
  backdrop.classList.add("hidden");
  issueForm.reset();
}

function parseCriteria(text) {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function submitIssue(event) {
  event.preventDefault();
  modalSubmit.disabled = true;
  modalSubmit.textContent = "Submitting...";
  try {
    const issue = {
      title: titleInput.value.trim(),
      description: descInput.value.trim(),
      acceptance_criteria: parseCriteria(criteriaInput.value)
    };
    const res = await fetchJson("/api/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issue })
    });
    selectedThread = res.thread_id;
    closeModal();
    await refreshAll();
  } catch (err) {
    alert("Failed to submit issue. Make sure orchestrator + agents are running.");
    console.error(err);
  } finally {
    modalSubmit.disabled = false;
    modalSubmit.textContent = "Submit";
  }
}

refreshBtn.addEventListener("click", refreshAll);
newIssueBtn.addEventListener("click", openModal);
modalClose.addEventListener("click", closeModal);
modalCancel.addEventListener("click", closeModal);
issueForm.addEventListener("submit", submitIssue);

backdrop.addEventListener("click", (e) => {
  if (e.target === backdrop) closeModal();
});

refreshAll();
setInterval(refreshAll, 2500);
