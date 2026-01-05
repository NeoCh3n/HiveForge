const threadsEl = document.getElementById("threads");
const stateEl = document.getElementById("state-view");
const threadTitleEl = document.getElementById("thread-title");
const beadsEl = document.getElementById("beads");
const mailEl = document.getElementById("mail");
const eventsEl = document.getElementById("events");
const refreshBtn = document.getElementById("refresh");

let threads = [];
let selectedThread = null;

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
  return res.json();
}

function renderThreads() {
  threadsEl.innerHTML = "";
  if (!threads.length) {
    threadsEl.innerHTML = `<div class="muted">No threads yet. Run the demo.</div>`;
    return;
  }
  threads.forEach((t) => {
    const div = document.createElement("div");
    div.className = `thread ${selectedThread === t.thread_id ? "active" : ""}`;
    div.onclick = () => {
      selectedThread = t.thread_id;
      renderThreads();
      renderState(t);
      loadBeads();
      loadMail();
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
  const copy = { ...state };
  stateEl.textContent = JSON.stringify(copy, null, 2);
}

async function loadThreads() {
  try {
    const data = await fetchJson("/api/state");
    threads = data.data || [];
    if (!selectedThread && threads.length) {
      selectedThread = threads[0].thread_id;
    }
    renderThreads();
    const current = threads.find((t) => t.thread_id === selectedThread);
    renderState(current);
  } catch (err) {
    threadsEl.innerHTML = `<div class="muted">Failed to load threads.</div>`;
    console.error(err);
  }
}

async function loadBeads() {
  if (!selectedThread) {
    beadsEl.innerHTML = `<div class="muted">Select a thread.</div>`;
    return;
  }
  try {
    const data = await fetchJson(`/api/beads?thread_id=${encodeURIComponent(selectedThread)}`);
    const beads = data.data || [];
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
  } catch (err) {
    beadsEl.innerHTML = `<div class="muted">Failed to load beads.</div>`;
    console.error(err);
  }
}

async function loadMail() {
  try {
    const agents = ["orchestrator", "planner", "implementer", "reviewer", "integrator"];
    mailEl.innerHTML = "";
    for (const agent of agents) {
      const data = await fetchJson(`/api/messages?agent=${agent}`);
      const items = data.data || [];
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
    }
  } catch (err) {
    mailEl.innerHTML = `<div class="muted">Failed to load mail.</div>`;
    console.error(err);
  }
}

async function loadEvents() {
  try {
    const data = await fetchJson("/api/events");
    const lines = data.data || [];
    eventsEl.textContent = lines.join("\n");
  } catch (err) {
    eventsEl.textContent = "Failed to load events.";
    console.error(err);
  }
}

async function refreshAll() {
  await loadThreads();
  await loadBeads();
  await loadMail();
  await loadEvents();
}

refreshBtn.addEventListener("click", refreshAll);
refreshAll();
setInterval(refreshAll, 2500);
