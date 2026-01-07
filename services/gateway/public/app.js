const threadsEl = document.getElementById("threads");
const stateEl = document.getElementById("state-view");
const workflowVisualEl = document.getElementById("workflow-visual");
const threadTitleEl = document.getElementById("thread-title");
const beadsEl = document.getElementById("beads");
const mailEl = document.getElementById("mail");
const eventsEl = document.getElementById("events");
const latestEventEl = document.getElementById("latest-event");
const refreshBtn = document.getElementById("refresh");
const newIssueBtn = document.getElementById("new-issue");
const toggleJsonBtn = document.getElementById("toggle-json");
const threadSearchEl = document.getElementById("thread-search");
const autoRefreshBtn = document.getElementById("auto-refresh");
const healthStatusEl = document.getElementById("health-status");
const statusDotEl = healthStatusEl.querySelector(".status-dot");
const statusTextEl = healthStatusEl.querySelector(".status-text");

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
let autoRefreshInterval = null;
let isAutoRefreshEnabled = true;
let threadSearchTerm = "";

const WORKFLOW_STEPS = [
  { key: "ISSUE_RECEIVED", label: "Issue Received", icon: "📝" },
  { key: "PLAN_REQUESTED", label: "Planning", icon: "🤔" },
  { key: "PLAN_RECEIVED", label: "Plan Ready", icon: "📋" },
  { key: "TASK_DISPATCHED", label: "Task Started", icon: "⚡" },
  { key: "RESULT_RECEIVED", label: "Implementation Done", icon: "✅" },
  { key: "REVIEW_REQUESTED", label: "Review Started", icon: "🔍" },
  { key: "REVIEW_RECEIVED", label: "Review Complete", icon: "👁️" },
  { key: "APPROVAL_REQUESTED", label: "Approval Pending", icon: "⏳" },
  { key: "APPROVAL_RECEIVED", label: "Approved", icon: "👍" },
  { key: "MERGE_REQUESTED", label: "Merge Requested", icon: "🔀" },
  { key: "DONE", label: "Completed", icon: "🎉" }
];

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
  return res.json();
}

function renderThreads() {
  threadsEl.innerHTML = "";
  const filteredStates = dashboard.states.filter(t =>
    !threadSearchTerm ||
    t.thread_id.toLowerCase().includes(threadSearchTerm.toLowerCase()) ||
    t.state.toLowerCase().includes(threadSearchTerm.toLowerCase())
  );

  if (!filteredStates.length) {
    threadsEl.innerHTML = `<div class="muted">${dashboard.states.length ? 'No threads match search.' : 'No threads yet. Submit an issue.'}</div>`;
    return;
  }

  filteredStates.forEach((t) => {
    const div = document.createElement("div");
    div.className = `thread ${selectedThread === t.thread_id ? "active" : ""}`;
    div.onclick = () => {
      selectedThread = t.thread_id;
      renderThreads();
      renderState(dashboard.states.find(s => s.thread_id === selectedThread));
      renderBeads();
      renderMail();
    };

    const stateStep = WORKFLOW_STEPS.find(s => s.key === t.state);
    const stateLabel = stateStep ? stateStep.label : t.state;

    div.innerHTML = `
      <div class="thread-id">${t.thread_id}</div>
      <div class="thread-state">${stateLabel}</div>
      <div class="thread-time">${t.updated_at ?? ""}</div>
    `;
    threadsEl.appendChild(div);
  });
}

function renderState(state) {
  if (!state) {
    threadTitleEl.textContent = "Select a thread";
    workflowVisualEl.innerHTML = "";
    stateEl.textContent = "";
    return;
  }
  threadTitleEl.textContent = state.thread_id;
  renderWorkflowVisual(state);
  stateEl.textContent = JSON.stringify(state, null, 2);
}

function renderWorkflowVisual(state) {
  workflowVisualEl.innerHTML = "";
  const currentStepIndex = WORKFLOW_STEPS.findIndex(step => step.key === state.state);

  WORKFLOW_STEPS.forEach((step, index) => {
    const stepEl = document.createElement("div");
    stepEl.className = "workflow-step";

    let statusClass = "pending";
    if (index < currentStepIndex) {
      statusClass = "completed";
    } else if (index === currentStepIndex) {
      statusClass = "current";
    }
    stepEl.classList.add(statusClass);

    const history = state.history || [];
    const stepHistory = history.find(h => h.includes(` -> ${step.key}`));
    const time = stepHistory ? stepHistory.split(' ')[0] : '';

    stepEl.innerHTML = `
      <div class="step-icon ${statusClass}">${step.icon}</div>
      <div class="step-label">${step.label}</div>
      ${time ? `<div class="step-time">${time}</div>` : ''}
    `;

    workflowVisualEl.appendChild(stepEl);
  });
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
  if (dashboard.mail_ui_url) {
    if (mailEl.dataset.mailUiUrl === dashboard.mail_ui_url) return;
    mailEl.dataset.mailUiUrl = dashboard.mail_ui_url;
    mailEl.innerHTML = "";

    const link = document.createElement("a");
    link.className = "mail-link";
    link.href = dashboard.mail_ui_url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Open vendor mail UI";

    const frame = document.createElement("iframe");
    frame.className = "mail-frame";
    frame.src = dashboard.mail_ui_url;
    frame.title = "Vendor mail UI";

    mailEl.appendChild(link);
    mailEl.appendChild(frame);
    return;
  }

  mailEl.dataset.mailUiUrl = "";
  mailEl.innerHTML = "";

  const agents = ["orchestrator", "planner", "implementer", "reviewer", "integrator"];
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
  const lines = (dashboard.events || []).slice().reverse(); // newest first
  if (lines.length) {
    latestEventEl.textContent = lines[0];
    latestEventEl.classList.remove("muted");
  } else {
    latestEventEl.textContent = "No events yet.";
    latestEventEl.classList.add("muted");
  }

  eventsEl.innerHTML = "";
  if (!lines.length) {
    eventsEl.innerHTML = `<div class="muted">No events yet.</div>`;
    return;
  }

  lines.forEach((line) => {
    // Expected format: "<time> [thread_id] message"
    const match = line.match(/^(\S+)\s+\[([^\]]+)\]\s+(.*)$/);
    const time = match ? match[1] : "";
    const thread = match ? match[2] : "";
    const msg = match ? match[3] : line;

    const row = document.createElement("div");
    row.className = "event-line";
    row.innerHTML = `
      <span class="event-time">${time}</span>
      <span class="event-thread">${thread}</span>
      <span class="event-msg">${msg}</span>
    `;
    eventsEl.appendChild(row);
  });
}

async function checkHealth() {
  try {
    const health = await fetchJson("/health");
    statusDotEl.className = "status-dot healthy";
    statusTextEl.textContent = `Services OK (${health.services.mail}, ${health.services.memory}, ${health.services.vc})`;
  } catch (err) {
    statusDotEl.className = "status-dot error";
    statusTextEl.textContent = "Services unavailable";
    console.error("Health check failed:", err);
  }
}

async function refreshAll() {
  const originalText = refreshBtn.textContent;
  refreshBtn.textContent = "Loading...";
  refreshBtn.disabled = true;

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
    checkHealth();
  } catch (err) {
    threadsEl.innerHTML = `<div class="muted">Failed to load dashboard. Check if services are running.</div>`;
    statusDotEl.className = "status-dot error";
    statusTextEl.textContent = "Connection failed";
    console.error(err);
  } finally {
    refreshBtn.textContent = originalText;
    refreshBtn.disabled = false;
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
     const errorMsg = err.message.includes("fetch") ?
       "Network error. Check if HiveForge services are running." :
       "Failed to submit issue. Please try again.";
     alert(errorMsg);
     console.error(err);
   } finally {
    modalSubmit.disabled = false;
    modalSubmit.textContent = "Submit";
  }
}

refreshBtn.addEventListener("click", refreshAll);
newIssueBtn.addEventListener("click", openModal);
toggleJsonBtn.addEventListener("click", () => {
  const isVisible = stateEl.style.display !== "none";
  stateEl.style.display = isVisible ? "none" : "block";
  toggleJsonBtn.textContent = isVisible ? "Show JSON" : "Hide JSON";
});
threadSearchEl.addEventListener("input", (e) => {
  threadSearchTerm = e.target.value.trim();
  renderThreads();
});
autoRefreshBtn.addEventListener("click", () => {
  isAutoRefreshEnabled = !isAutoRefreshEnabled;
  autoRefreshBtn.textContent = isAutoRefreshEnabled ? "Auto ✓" : "Auto ✗";
  autoRefreshBtn.dataset.active = isAutoRefreshEnabled.toString();

  if (isAutoRefreshEnabled) {
    autoRefreshInterval = setInterval(refreshAll, 2500);
  } else {
    clearInterval(autoRefreshInterval);
  }
});
modalClose.addEventListener("click", closeModal);
modalCancel.addEventListener("click", closeModal);
issueForm.addEventListener("submit", submitIssue);

backdrop.addEventListener("click", (e) => {
  if (e.target === backdrop) closeModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeModal();
  } else if (e.key === "/" && e.target.tagName !== "INPUT") {
    e.preventDefault();
    threadSearchEl.focus();
  } else if (e.ctrlKey && e.key === "r") {
    e.preventDefault();
    refreshAll();
  } else if (e.ctrlKey && e.key === "n") {
    e.preventDefault();
    openModal();
  }
});

refreshAll();
autoRefreshInterval = setInterval(refreshAll, 2500);
