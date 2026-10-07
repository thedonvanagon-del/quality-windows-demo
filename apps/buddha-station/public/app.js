// The control panel. Everything a crew member writes is shown as plain text
// (textContent), never as HTML, so nothing they write can run on this page.

import { StationView } from "./station.js";

// ---------- token & API ----------

const TOKEN_KEY = "buddha-station-token";
(() => {
  const m = location.hash.match(/t=([\w-]+)/);
  if (m) {
    try { sessionStorage.setItem(TOKEN_KEY, m[1]); } catch { /* private mode */ }
    window.__token = m[1];
    history.replaceState(null, "", location.pathname);
  }
})();
const token = window.__token || (() => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } })();

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { "x-station-token": token ?? "", ...(body !== undefined && { "content-type": "application/json" }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function downloadFile(path, name) {
  const res = await fetch(path, { headers: { "x-station-token": token } });
  if (!res.ok) return toast("Couldn't download that file.");
  const url = URL.createObjectURL(await res.blob());
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---------- tiny DOM helper ----------

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    // Through the style object, which the page's strict CSP allows; a style
    // attribute string would be blocked.
    else if (k === "style") el.style.cssText = v;
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const $ = (id) => document.getElementById(id);
const money = (n) => `$${(n ?? 0).toFixed(2)}`;
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
const newId = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, "0")).join("");

let toastTimer;
function toast(message, ok = false) {
  const el = $("toast");
  el.textContent = message;
  el.className = ok ? "show ok" : "show";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ""), 4500);
}

async function attempt(fn, success) {
  try {
    const out = await fn();
    if (success) toast(success, true);
    return out;
  } catch (err) {
    toast(err.message);
    return null;
  }
}

// ---------- state ----------

let S = null;
const ui = {
  tab: "crew",
  agent: null,
  task: null, // task detail being viewed
  taskDetail: null,
  room: null,
  buildMode: "select",
  gearType: "cabinet",
  antennaServer: null,
  pairCode: null,
  editing: false,
};

const view = new StationView($("station"), {
  onSelectAgent: (id) => { ui.agent = id; ui.task = null; ui.tab = "crew"; ui.editing = false; syncSelection(); render(); },
  onSelectRoom: (id) => { ui.room = id; if (id) ui.tab = "build"; syncSelection(); render(); },
  onSelectGear: (g) => { ui.room = g.room; ui.tab = "build"; syncSelection(); render(); },
  onMoveAgent: (agentId, roomId) => {
    const station = structuredClone(S.station);
    const agent = station.agents.find((a) => a.id === agentId);
    const room = station.rooms.find((r) => r.id === roomId);
    agent.room = roomId;
    saveStation(station, `${agent.name} moved to ${room.name}. Their gear changes on their next job.`);
  },
  onDrawRoom: (rect) => {
    const station = structuredClone(S.station);
    const room = { id: newId(), name: `Room ${station.rooms.length + 1}`, color: S.catalog.colors[station.rooms.length % S.catalog.colors.length], ...rect };
    station.rooms.push(room);
    ui.room = room.id;
    saveStation(station, "Room built. Add some gear to it.");
  },
  onPlaceGear: (g) => {
    const station = structuredClone(S.station);
    const item = { id: newId(), ...g };
    if (g.type === "antenna") item.mcpServerId = ui.antennaServer;
    station.gear.push(item);
    ui.room = g.room;
    saveStation(station);
  },
  onHallway: (a, b) => {
    const station = structuredClone(S.station);
    station.hallways.push({ a, b });
    saveStation(station, "Hallway built. Crew in those rooms can now hand work to each other (if both have a Comms Hatch).");
  },
  onHover: (text) => { $("hint").textContent = text || defaultHint(); },
  onHint: (text) => { $("hint").textContent = text; },
});

function defaultHint() {
  if (ui.tab === "build") {
    return {
      select: "Click a room to edit it. Drag a crew member into another room to change what they can do.",
      room: "Click and drag on empty space to build a room.",
      gear: "Click a spot inside a room to place the gear.",
      hallway: "Click one room, then another, to join them with a hallway.",
    }[ui.buildMode];
  }
  return "Click a crew member to give them a job. Hover over gear to see what it does.";
}

function syncSelection() {
  view.select({ agent: ui.tab === "crew" ? ui.agent : null, room: ui.tab === "build" ? ui.room : null });
  view.setMode(ui.tab === "build" ? { kind: ui.buildMode, gear: ui.gearType } : { kind: "select" });
  $("hint").textContent = defaultHint();
}

async function saveStation(station, message) {
  const saved = await attempt(() => api("PUT", "/api/station", station), message);
  if (saved) {
    S.station = saved;
    view.setState(S);
    render();
  }
}

function upsertTask(task) {
  const i = S.tasks.findIndex((t) => t.id === task.id);
  if (i >= 0) S.tasks[i] = { ...S.tasks[i], ...task };
  else S.tasks.unshift(task);
  if (ui.taskDetail?.id === task.id) ui.taskDetail = { ...ui.taskDetail, ...task, steps: task.steps.length >= (ui.taskDetail.steps?.length ?? 0) ? task.steps : ui.taskDetail.steps };
}

// ---------- live updates ----------

function connect() {
  if (!token) {
    $("locked").hidden = false;
    return;
  }
  const es = new EventSource(`/api/events?t=${encodeURIComponent(token)}`);
  es.addEventListener("state", (e) => {
    const first = !S;
    S = JSON.parse(e.data);
    view.setState(S);
    if (first) syncSelection();
    for (const t of S.tasks) if (t.status === "running") view.activity(t.agentId, { status: "working" });
    render();
  });
  es.addEventListener("task", (e) => {
    const task = JSON.parse(e.data);
    if (!S) return;
    upsertTask(task);
    if (task.status === "running") view.activity(task.agentId, { status: "working", text: "On it" });
    else view.activity(task.agentId, { status: task.status });
    renderMeter();
    if (ui.tab === "crew" || ui.tab === "tasks") render();
  });
  es.addEventListener("step", (e) => {
    const { taskId, agentId, step } = JSON.parse(e.data);
    if (step.kind === "action") view.activity(agentId, { status: "working", gear: step.gear, text: step.text });
    else if (step.kind === "said") view.activity(agentId, { status: "working", text: step.text });
    else if (step.kind === "thought") view.activity(agentId, { status: "working", text: "Thinking…" });
    if (ui.taskDetail?.id === taskId) {
      ui.taskDetail.steps = [...(ui.taskDetail.steps ?? []), step];
      if (ui.tab === "crew") render();
    }
  });
  es.addEventListener("spend", (e) => {
    if (!S) return;
    S.spend.today = JSON.parse(e.data).today;
    renderMeter();
  });
  es.onerror = () => {
    $("offline").hidden = false;
  };
  es.onopen = () => {
    $("offline").hidden = true;
  };
}

// ---------- header ----------

function renderMeter() {
  if (!S) return;
  const cap = S.config.dailyCapUsd;
  const pct = cap > 0 ? Math.min(100, (S.spend.today / cap) * 100) : 100;
  const meter = $("meter");
  meter.replaceChildren(
    h("span", {}, `Today ${money(S.spend.today)} of ${money(cap)}`),
    h("span", { class: "gauge" }, h("span", { class: pct > 85 ? "fill hot" : "fill", style: `width:${pct.toFixed(1)}%` })),
  );
  $("nightshift").checked = S.config.nightShift;
  const running = S.tasks.filter((t) => t.status === "running" || t.status === "queued").length;
  $("stopall").textContent = running ? `Stop everything (${running})` : "Stop everything";
}

$("stopall").addEventListener("click", () => attempt(() => api("POST", "/api/stop-all", {}), "Stopped. Nothing is running."));
$("nightshift").addEventListener("change", async (e) => {
  const out = await attempt(() => api("POST", "/api/nightshift", { on: e.target.checked }));
  if (out?.report) toast(`Welcome back. Your shift report is in the Outbox: ${out.report}`, true);
  else if (out && e.target.checked) toast("Night Shift on. Your Mac stays awake while the station is open.", true);
});

// ---------- tabs ----------

const TABS = [
  ["crew", "Crew"],
  ["build", "Build"],
  ["outbox", "Outbox"],
  ["schedules", "Schedules"],
  ["settings", "Settings"],
  ["log", "Log"],
];

function render() {
  if (!S) return;
  renderMeter();
  $("tabs").replaceChildren(...TABS.map(([id, label]) =>
    h("button", { class: ui.tab === id ? "tab on" : "tab", onclick: () => { ui.tab = id; syncSelection(); render(); } }, label)));
  const body = { crew: renderCrew, build: renderBuild, outbox: renderOutbox, schedules: renderSchedules, settings: renderSettings, log: renderLog }[ui.tab]();
  const panel = $("view");
  // Keep whatever the captain is typing when the panel refreshes.
  const focused = document.activeElement;
  if (focused && panel.contains(focused) && (focused.tagName === "TEXTAREA" || focused.tagName === "INPUT") && focused.dataset.keep) return;
  panel.replaceChildren(body);
}

// ---------- crew ----------

const STATUS_LABEL = { queued: "Waiting", running: "Working", done: "Done", failed: "Hit a snag", stopped: "Stopped" };

function grantsFor(agent) {
  const grants = new Set(S.station.gear.filter((g) => g.room === agent.room).map((g) => S.catalog.gear[g.type].grants));
  return Object.values(S.catalog.gear).filter((g) => grants.has(g.grants));
}

function agentStatus(agent) {
  const live = S.tasks.find((t) => t.agentId === agent.id && (t.status === "running" || t.status === "queued"));
  return live ? live.status : "idle";
}

function renderCrew() {
  if (ui.task) return renderTaskDetail();
  const agent = S.station.agents.find((a) => a.id === ui.agent);
  if (agent) return ui.editing ? renderAgentEdit(agent) : renderAgent(agent);
  return h("div", {},
    h("h2", {}, "Your crew"),
    S.secrets.anthropic ? null : h("p", { class: "callout" }, "First stop: add your Anthropic API key in Settings. Nobody can work without it."),
    h("ul", { class: "list" }, S.station.agents.map((a) => {
      const st = agentStatus(a);
      const room = S.station.rooms.find((r) => r.id === a.room);
      return h("li", { class: "row clickable", onclick: () => { ui.agent = a.id; syncSelection(); render(); } },
        h("span", { class: `dot ${st}` }),
        h("strong", {}, a.name),
        h("span", { class: "muted" }, ` ${S.catalog.classes[a.class].label} · ${room?.name ?? ""}`),
        h("span", { class: "right muted" }, st === "idle" ? "" : STATUS_LABEL[st]));
    })),
    renderRecruit(),
  );
}

function renderRecruit() {
  if (S.station.rooms.length === 0) return h("p", { class: "muted" }, "Build a room first, then recruit crew into it.");
  const name = h("input", { placeholder: "Name, like Juniper", maxlength: 24 });
  const cls = h("select", {}, Object.entries(S.catalog.classes).map(([k, v]) => h("option", { value: k }, v.label)));
  const room = h("select", {}, S.station.rooms.map((r) => h("option", { value: r.id }, r.name)));
  const model = h("select", {}, Object.entries(S.catalog.models).map(([k, v]) => h("option", { value: k }, v)));
  return h("details", { class: "box" },
    h("summary", {}, "Recruit a crew member"),
    h("label", {}, "Name", name),
    h("label", {}, "Class", cls),
    h("label", {}, "Room (decides what they can do)", room),
    h("label", {}, "Model", model),
    h("button", {
      onclick: () => {
        if (!name.value.trim()) return toast("Give them a name.");
        const station = structuredClone(S.station);
        const id = newId();
        station.agents.push({ id, name: name.value.trim(), class: cls.value, room: room.value, model: model.value, effort: "medium", persona: S.catalog.classes[cls.value].persona });
        ui.agent = id;
        saveStation(station, `${name.value.trim()} is aboard.`);
      },
    }, "Bring them aboard"),
  );
}

function renderAgent(agent) {
  const room = S.station.rooms.find((r) => r.id === agent.room);
  const kit = grantsFor(agent);
  const tasks = S.tasks.filter((t) => t.agentId === agent.id).slice(0, 12);
  const order = h("textarea", { rows: 4, placeholder: `What should ${agent.name} do?`, "data-keep": "1", maxlength: 8000 });
  const send = async () => {
    if (!order.value.trim()) return;
    const task = await attempt(() => api("POST", "/api/tasks", { agentId: agent.id, text: order.value }), `${agent.name} is on it.`);
    if (task) {
      order.value = "";
      // The live feed may already have this job, and further along than this
      // reply. Only add it if it's new.
      if (!S.tasks.some((t) => t.id === task.id)) upsertTask(task);
      render();
    }
  };
  order.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); });
  const memory = h("div", { class: "muted" }, "Loading…");
  if (kit.some((g) => g.grants === "memory")) {
    api("GET", `/api/memory/${agent.id}`).then((m) => memory.replaceChildren(renderMemory(agent, m.memory))).catch(() => {});
  }
  const files = h("ul", { class: "list small" });
  api("GET", `/api/workspace/${agent.id}`).then((list) => files.replaceChildren(
    ...(list.length ? list.map((f) => h("li", { class: "row" }, h("span", {}, f.path),
      h("button", { class: "link right", onclick: () => downloadFile(`/api/workspace/${agent.id}/download?path=${encodeURIComponent(f.path)}`, f.path.split("/").pop()) }, "Download")))
      : [h("li", { class: "muted" }, "Empty.")]),
  )).catch(() => {});

  return h("div", {},
    h("button", { class: "link", onclick: () => { ui.agent = null; syncSelection(); render(); } }, "← All crew"),
    h("h2", {}, agent.name, h("span", { class: "muted" }, ` · ${S.catalog.classes[agent.class].label} in ${room?.name ?? "?"}`)),
    h("p", { class: "muted" }, agent.persona),
    h("div", { class: "chips" },
      kit.length ? kit.map((g) => h("span", { class: "chip", title: g.blurb }, g.label)) : h("span", { class: "chip off" }, "No gear in this room"),
      h("span", { class: "chip", title: "Every crew member can deliver finished work to the Outbox." }, "Outbox")),
    h("div", { class: "box" },
      order,
      h("div", { class: "row" },
        h("button", { onclick: send }, "Send order"),
        h("span", { class: "muted right" }, `${S.catalog.models[agent.model]?.split(" (")[0]} · ${agent.effort} effort · caps ${money(S.config.taskCapUsd)}/job`))),
    h("h3", {}, "Jobs"),
    tasks.length ? h("ul", { class: "list" }, tasks.map(taskRow)) : h("p", { class: "muted" }, "No jobs yet."),
    kit.some((g) => g.grants === "memory") ? h("details", { class: "box" }, h("summary", {}, "Memory"), memory) : null,
    kit.some((g) => g.grants === "files") ? h("details", { class: "box" }, h("summary", {}, "Workspace files"), files) : null,
    h("div", { class: "row" },
      h("button", { class: "secondary", onclick: () => { ui.editing = true; render(); } }, "Edit"),
      h("button", {
        class: "secondary danger-text right",
        onclick: () => {
          if (!confirm(`Remove ${agent.name} from the crew? Their files stay in the data folder.`)) return;
          const station = structuredClone(S.station);
          station.agents = station.agents.filter((a) => a.id !== agent.id);
          ui.agent = null;
          saveStation(station, `${agent.name} left the station.`);
        },
      }, "Remove")),
  );
}

function renderMemory(agent, text) {
  const area = h("textarea", { rows: 6, value: text, "data-keep": "1", maxlength: 8192 });
  return h("div", {},
    h("p", { class: "muted" }, "What they remember between jobs. You can edit or clear it."),
    area,
    h("div", { class: "row" },
      h("button", { class: "secondary", onclick: () => attempt(() => api("PUT", `/api/memory/${agent.id}`, { memory: area.value }), "Memory saved.") }, "Save memory"),
      h("button", { class: "secondary right", onclick: () => { area.value = ""; attempt(() => api("PUT", `/api/memory/${agent.id}`, { memory: "" }), "Memory cleared."); } }, "Clear")));
}

function renderAgentEdit(agent) {
  const name = h("input", { value: agent.name, maxlength: 24 });
  const persona = h("textarea", { rows: 5, value: agent.persona, maxlength: 2000 });
  const cls = h("select", {}, Object.entries(S.catalog.classes).map(([k, v]) => h("option", { value: k, selected: k === agent.class }, v.label)));
  const model = h("select", {}, Object.entries(S.catalog.models).map(([k, v]) => h("option", { value: k, selected: k === agent.model }, v)));
  const effort = h("select", {}, S.catalog.efforts.map((e) => h("option", { value: e, selected: e === agent.effort }, e)));
  return h("div", {},
    h("h2", {}, `Edit ${agent.name}`),
    h("label", {}, "Name", name),
    h("label", {}, "Class", cls),
    h("label", {}, "Who they are (their instructions)", persona),
    h("label", {}, "Model", model),
    h("label", {}, "Effort (higher thinks harder and costs more)", effort),
    h("div", { class: "row" },
      h("button", {
        onclick: () => {
          const station = structuredClone(S.station);
          Object.assign(station.agents.find((a) => a.id === agent.id), {
            name: name.value.trim(), class: cls.value, persona: persona.value, model: model.value, effort: effort.value,
          });
          ui.editing = false;
          saveStation(station, "Saved. Changes apply from their next job.");
        },
      }, "Save"),
      h("button", { class: "secondary", onclick: () => { ui.editing = false; render(); } }, "Cancel")));
}

function taskRow(t) {
  return h("li", { class: "row clickable", onclick: () => openTask(t.id) },
    h("span", { class: `dot ${t.status}` }),
    h("span", { class: "grow" }, t.text.length > 70 ? `${t.text.slice(0, 69)}…` : t.text),
    h("span", { class: "muted right" }, `${STATUS_LABEL[t.status]} · ${money(t.cost)}`));
}

async function openTask(id) {
  ui.task = id;
  ui.taskDetail = await attempt(() => api("GET", `/api/tasks/${id}`));
  render();
}

const STEP_LABEL = { order: "Order", thought: "Thinking", said: "Said", action: "Did", problem: "Problem", note: "Note" };

function renderTaskDetail() {
  const t = ui.taskDetail;
  if (!t) return h("p", { class: "muted" }, "Loading…");
  const live = t.status === "running" || t.status === "queued";
  const source = { you: "you", schedule: "a schedule", telegram: "your phone", handoff: `${t.from} (hand-off)` }[t.source] ?? t.source;
  return h("div", {},
    h("button", { class: "link", onclick: () => { ui.task = null; ui.taskDetail = null; render(); } }, `← ${t.agentName}`),
    h("h2", {}, `${t.agentName}: ${STATUS_LABEL[t.status]}`),
    h("p", { class: "muted" }, `From ${source} · ${when(t.createdAt)} · ${money(t.cost)}`),
    live ? h("button", { class: "danger", onclick: () => attempt(() => api("POST", `/api/tasks/${t.id}/stop`, {}), "Stopping.") }, "Stop this job") : null,
    t.result ? h("div", { class: `result ${t.status}` }, t.result) : null,
    h("ol", { class: "steps" }, (t.steps ?? []).map((s) =>
      h("li", { class: `step ${s.kind}` }, h("span", { class: "tag" }, STEP_LABEL[s.kind] ?? s.kind), h("span", { class: "text" }, s.text)))),
  );
}

// ---------- build ----------

function renderBuild() {
  const modes = [["select", "Select & move"], ["room", "Build room"], ["gear", "Place gear"], ["hallway", "Hallway"]];
  const room = S.station.rooms.find((r) => r.id === ui.room);
  return h("div", {},
    h("h2", {}, "Build the station"),
    h("p", { class: "muted" }, "The layout is the permission system. Gear in a room is what the crew in that room can use. Nothing else."),
    h("div", { class: "seg" }, modes.map(([k, label]) =>
      h("button", { class: ui.buildMode === k ? "on" : "", onclick: () => { ui.buildMode = k; syncSelection(); render(); } }, label))),
    ui.buildMode === "gear" ? renderGearPalette() : null,
    room ? renderRoomEditor(room) : h("p", { class: "muted" }, "Click a room on the station to edit it."),
  );
}

function renderGearPalette() {
  const servers = S.config.mcpServers;
  return h("div", { class: "box" },
    h("ul", { class: "list" }, Object.entries(S.catalog.gear).map(([k, g]) =>
      h("li", { class: ui.gearType === k ? "row clickable picked" : "row clickable", onclick: () => { ui.gearType = k; syncSelection(); render(); } },
        h("div", {}, h("strong", {}, g.label), h("div", { class: "muted small" }, g.blurb))))),
    ui.gearType === "antenna"
      ? (servers.length
        ? h("label", {}, "Which tool server?", h("select", { onchange: (e) => (ui.antennaServer = e.target.value) },
          h("option", { value: "" }, "Pick one"), servers.map((s) => h("option", { value: s.id, selected: s.id === ui.antennaServer }, s.name))))
        : h("p", { class: "callout" }, "Add a tool server in Settings first. An Antenna without one does nothing."))
      : null,
    ui.gearType === "counter" && !S.etsy.connected ? h("p", { class: "callout" }, "Connect Etsy in Settings so the Shop Counter has something to show.") : null,
  );
}

function renderRoomEditor(room) {
  const name = h("input", { value: room.name, maxlength: 30 });
  const gear = S.station.gear.filter((g) => g.room === room.id);
  const crew = S.station.agents.filter((a) => a.room === room.id);
  const halls = S.station.hallways.filter((x) => x.a === room.id || x.b === room.id);
  const update = (fn, message) => {
    const station = structuredClone(S.station);
    fn(station);
    saveStation(station, message);
  };
  return h("div", { class: "box" },
    h("label", {}, "Room name", name),
    h("div", { class: "swatches" }, S.catalog.colors.map((c) =>
      h("button", { class: c === room.color ? "swatch on" : "swatch", style: `background:${c}`, title: c,
        onclick: () => update((s) => { s.rooms.find((r) => r.id === room.id).color = c; }) }))),
    h("button", { class: "secondary", onclick: () => update((s) => { s.rooms.find((r) => r.id === room.id).name = name.value; }, "Renamed.") }, "Save name"),
    h("h3", {}, "Gear here"),
    gear.length ? h("ul", { class: "list" }, gear.map((g) => h("li", { class: "row" },
      h("span", {}, S.catalog.gear[g.type].label, g.type === "antenna" ? ` → ${S.config.mcpServers.find((s) => s.id === g.mcpServerId)?.name ?? "no server"}` : ""),
      h("button", { class: "link right", onclick: () => update((s) => { s.gear = s.gear.filter((x) => x.id !== g.id); }) }, "Remove"))))
      : h("p", { class: "muted" }, "No gear. Crew here can only deliver to the Outbox."),
    h("h3", {}, "Hallways"),
    halls.length ? h("ul", { class: "list" }, halls.map((x) => {
      const other = S.station.rooms.find((r) => r.id === (x.a === room.id ? x.b : x.a));
      return h("li", { class: "row" }, h("span", {}, `To ${other?.name}`),
        h("button", { class: "link right", onclick: () => update((s) => { s.hallways = s.hallways.filter((y) => !(y.a === x.a && y.b === x.b)); }) }, "Remove"));
    })) : h("p", { class: "muted" }, "None."),
    h("h3", {}, "Crew here"),
    h("p", {}, crew.length ? crew.map((a) => a.name).join(", ") : h("span", { class: "muted" }, "Nobody.")),
    h("button", {
      class: "secondary danger-text",
      onclick: () => {
        if (crew.length) return toast("Move the crew out first.");
        update((s) => {
          s.rooms = s.rooms.filter((r) => r.id !== room.id);
          s.gear = s.gear.filter((g) => g.room !== room.id);
          s.hallways = s.hallways.filter((x) => x.a !== room.id && x.b !== room.id);
        }, "Room taken down.");
        ui.room = null;
      },
    }, "Take down this room"),
  );
}

// ---------- outbox ----------

function renderOutbox() {
  const out = h("ul", { class: "list" }, h("li", { class: "muted" }, "Loading…"));
  const inbox = h("ul", { class: "list small" });
  const load = () => {
    api("GET", "/api/outbox").then((files) => out.replaceChildren(...(files.length ? files.slice().reverse().map((f) =>
      h("li", { class: "row" },
        h("span", { class: "grow" }, f.path, h("span", { class: "muted small" }, ` · ${Math.max(1, Math.round(f.bytes / 1024))} KB · ${when(f.modified)}`)),
        h("button", { class: "link", onclick: () => downloadFile(`/api/outbox/download?name=${encodeURIComponent(f.path)}`, f.path) }, "Download"),
        h("button", { class: "link danger-text", onclick: async () => { if (confirm(`Delete ${f.path}?`)) { await attempt(() => api("DELETE", `/api/outbox?name=${encodeURIComponent(f.path)}`)); load(); } } }, "Delete")))
      : [h("li", { class: "muted" }, "Nothing yet. Finished work lands here.")]))).catch((e) => toast(e.message));
    api("GET", "/api/inbox").then((files) => inbox.replaceChildren(...(files.length
      ? files.map((f) => h("li", {}, f.path)) : [h("li", { class: "muted" }, "Empty.")]))).catch(() => {});
  };
  load();
  return h("div", {},
    h("h2", {}, "Outbox"),
    h("p", { class: "muted" }, "Finished work from the crew. It's also in this folder on your Mac:"),
    h("code", { class: "path" }, S.paths.outbox),
    out,
    h("h3", {}, "Inbox"),
    h("p", { class: "muted" }, "Drop files here in Finder for crew with a Filing Cabinet to read (text files like .txt, .md, .csv):"),
    h("code", { class: "path" }, S.paths.inbox),
    inbox,
  );
}

// ---------- schedules ----------

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Ready-made jobs. Each says what gear it needs so the right crew member gets it.
const STARTERS = [
  {
    title: "Weekly Etsy report",
    needs: "Shop Counter",
    kind: "weekly", day: 1, time: "08:00",
    task: "Look at the last 7 days of Etsy orders and the shop overview. Deliver a one-page report to the Outbox called etsy-weekly.md: number of orders, revenue, best sellers, slow movers, and anything that looks off. Plain words, short.",
  },
  {
    title: "Draft replies to new reviews",
    needs: "Shop Counter",
    kind: "daily", time: "09:00",
    task: "Read the newest Etsy reviews. For each one from the last day or two, draft a short, warm reply in our voice. Thank them by what they bought, never by name. No promises about refunds and no health claims. Deliver the drafts to the Outbox as review-replies.md. If there are no new reviews, say so and stop.",
  },
  {
    title: "Freshen up a slow listing",
    needs: "Shop Counter",
    kind: "weekly", day: 3, time: "10:00",
    task: "Find the active Etsy listing with the fewest views. Draft a better title, a better description (lead with what it tastes and smells like), and 13 tags. Keep every fact from the current listing and don't touch the price. Deliver it to the Outbox as listing-refresh.md, with the old and new versions side by side.",
  },
  {
    title: "Find wholesale leads",
    needs: "Signal Dish",
    kind: "weekly", day: 2, time: "10:00",
    task: "Find 5 independent cafes, bakeries or wellness shops that look like a fit for specialty coffee or CBD coffee and don't already list a roaster. Public business info only. Deliver a CSV to the Outbox called wholesale-leads.csv with: name, city, website, why they fit, and a one-line opener for an email. Note anything you're unsure about.",
  },
  {
    title: "Weekly coffee story",
    needs: "Filing Cabinet",
    kind: "weekly", day: 4, time: "09:00",
    task: "Write a 500-word blog post about one of our coffees: where it's grown, how it's processed, and what it tastes like in the morning. Use notes from the Inbox if there are any. No hype and no health claims. Deliver it to the Outbox as a .md file.",
  },
];

function describeSchedule(s) {
  if (s.kind === "every") return `Every ${s.everyHours} hour${s.everyHours === 1 ? "" : "s"}`;
  if (s.kind === "weekly") return `${DAYS[s.day]}s at ${s.time}`;
  return `${s.kind === "weekdays" ? "Weekdays" : "Every day"} at ${s.time}`;
}

function crewWith(gearLabel) {
  const type = Object.entries(S.catalog.gear).find(([, g]) => g.label === gearLabel)?.[0];
  const rooms = new Set(S.station.gear.filter((g) => g.type === type).map((g) => g.room));
  return S.station.agents.filter((a) => rooms.has(a.room));
}

function renderSchedules() {
  const save = (schedules, message) => attempt(async () => {
    S.schedules = await api("PUT", "/api/schedules", { schedules });
    render();
  }, message);
  const agent = h("select", {}, S.station.agents.map((a) => h("option", { value: a.id }, a.name)));
  const kind = h("select", {},
    h("option", { value: "daily" }, "Every day at"),
    h("option", { value: "weekdays" }, "Weekdays at"),
    h("option", { value: "weekly" }, "Once a week on"),
    h("option", { value: "every" }, "Every N hours"));
  const day = h("select", {}, DAYS.map((d, i) => h("option", { value: i }, d)));
  const time = h("input", { type: "time", value: "08:00" });
  const hours = h("input", { type: "number", min: 1, max: 168, value: 24 });
  const job = h("textarea", { rows: 4, placeholder: "What should happen each time?", maxlength: 4000, "data-keep": "1" });
  const showFields = () => {
    day.hidden = kind.value !== "weekly";
    time.hidden = kind.value === "every";
    hours.hidden = kind.value !== "every";
  };
  kind.addEventListener("change", showFields);
  showFields();
  const useStarter = (st) => {
    const fit = crewWith(st.needs);
    if (fit.length === 0) return toast(`Nobody has a ${st.needs} yet. Put one in a room first.`);
    agent.value = fit[0].id;
    kind.value = st.kind;
    if (st.day !== undefined) day.value = st.day;
    time.value = st.time;
    job.value = st.task;
    showFields();
    job.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  return h("div", {},
    h("h2", {}, "Schedules"),
    h("p", { class: "muted" }, "Jobs that run on their own while the station is open. A job missed while the station was closed is skipped, not piled up."),
    S.schedules.length ? h("ul", { class: "list" }, S.schedules.map((s) => {
      const who = S.station.agents.find((a) => a.id === s.agentId)?.name ?? "?";
      return h("li", { class: "row" },
        h("input", { type: "checkbox", checked: s.enabled, title: "On/off", onchange: (e) => save(S.schedules.map((x) => (x.id === s.id ? { ...x, enabled: e.target.checked } : x))) }),
        h("div", { class: "grow" }, h("strong", {}, `${who}: `), s.task.length > 80 ? `${s.task.slice(0, 79)}…` : s.task,
          h("div", { class: "muted small" }, describeSchedule(s), s.lastRunAt ? ` · last ran ${when(s.lastRunAt)}` : "")),
        h("button", { class: "link danger-text", onclick: () => save(S.schedules.filter((x) => x.id !== s.id), "Schedule removed.") }, "Remove"));
    })) : h("p", { class: "muted" }, "No schedules yet."),
    h("details", { class: "box" },
      h("summary", {}, "Starter jobs"),
      h("p", { class: "muted small" }, "Pick one to fill in the form below. Read it over, change what you like, then add it. Everything they make lands in the Outbox for you to check first."),
      h("ul", { class: "list" }, STARTERS.map((st) => h("li", { class: "row clickable", onclick: () => useStarter(st) },
        h("div", { class: "grow" }, h("strong", {}, st.title), h("div", { class: "muted small" }, `Needs a ${st.needs} · ${describeSchedule(st)}`)))))),
    S.station.agents.length ? h("div", { class: "box" },
      h("h3", {}, "New schedule"),
      h("label", {}, "Who", agent),
      h("div", { class: "row" }, kind, day, time, hours),
      h("label", {}, "The job", job),
      h("button", {
        onclick: () => {
          const item = { id: newId(), agentId: agent.value, kind: kind.value, task: job.value, enabled: true };
          if (kind.value === "every") item.everyHours = Number(hours.value);
          else item.time = time.value;
          if (kind.value === "weekly") item.day = Number(day.value);
          if (!job.value.trim()) return toast("Say what the job is.");
          save([...S.schedules, item], "Scheduled.");
        },
      }, "Add schedule")) : null,
  );
}

// ---------- settings ----------

function secretBox({ title, name, saved, placeholder, help, after }) {
  const input = h("input", { type: "password", placeholder, autocomplete: "off", "data-keep": "1" });
  return h("div", { class: "box" },
    h("h3", {}, title),
    help ? h("p", { class: "muted" }, ...[].concat(help)) : null,
    saved ? h("p", {}, "Saved", typeof saved === "string" ? ` (${saved})` : "", ` in your ${S.secrets.kind}.`) : null,
    h("div", { class: "row" }, input,
      h("button", { onclick: async () => { if (await attempt(() => api("POST", `/api/secrets/${name}`, { value: input.value }), "Saved.")) input.value = ""; } }, "Save")),
    saved ? h("button", { class: "link danger-text", onclick: () => attempt(() => api("DELETE", `/api/secrets/${name}`), "Removed.") }, "Remove") : null,
    after ?? null,
  );
}

function renderSettings() {
  const daily = h("input", { type: "number", min: 0, max: 500, step: "0.5", value: S.config.dailyCapUsd });
  const perTask = h("input", { type: "number", min: 0.05, max: 50, step: "0.05", value: S.config.taskCapUsd });
  const steps = h("input", { type: "number", min: 3, max: 60, value: S.config.maxSteps });
  const domains = h("textarea", { rows: 3, value: S.config.allowedDomains.join("\n"), placeholder: "Leave empty to allow any site.\nexample.com", "data-keep": "1" });
  const recent = Object.entries(S.spend.history).sort().slice(-7).reverse();

  const mcpName = h("input", { placeholder: "Name, like Shopify", maxlength: 30 });
  const mcpUrl = h("input", { placeholder: "https://…" });
  const mcpToken = h("input", { type: "password", placeholder: "Access token (if it needs one)", autocomplete: "off" });
  const mcpTools = h("input", { placeholder: "Tool names to allow, comma separated (empty = all)" });

  return h("div", {},
    h("h2", {}, "Settings"),
    secretBox({
      title: "Anthropic API key",
      name: "anthropic",
      saved: S.secrets.anthropic,
      placeholder: "sk-ant-…",
      help: "Get one at console.anthropic.com. Set a monthly spend limit there too. It's a second brake on top of the caps below.",
      after: h("button", { class: "secondary", onclick: async () => { const r = await attempt(() => api("POST", "/api/check-key", {})); if (r) toast(r.message, r.ok); } }, "Check the key"),
    }),

    h("div", { class: "box" },
      h("h3", {}, "Spending limits"),
      h("label", {}, "Daily cap (US $). Everything stops when it's reached.", daily),
      h("label", {}, "Per-job cap (US $)", perTask),
      h("label", {}, "Most steps per job", steps),
      h("button", { onclick: () => attempt(() => api("PUT", "/api/config", { dailyCapUsd: Number(daily.value), taskCapUsd: Number(perTask.value), maxSteps: Number(steps.value) }), "Limits saved.") }, "Save limits"),
      recent.length ? h("table", { class: "spend" }, recent.map(([d, v]) => h("tr", {}, h("td", {}, d), h("td", {}, money(v))))) : null,
      h("p", { class: "muted small" }, "These are estimates at list price. Your Anthropic invoice is the real number."),
    ),

    h("div", { class: "box" },
      h("h3", {}, "Signal Dish: allowed websites"),
      h("p", { class: "muted" }, "One site per line. If you list any, crew can only search and read those sites."),
      domains,
      h("button", { onclick: () => attempt(() => api("PUT", "/api/config", { allowedDomains: domains.value.split(/\s+/).filter(Boolean) }), "Saved.") }, "Save sites"),
    ),

    renderEtsySettings(),

    secretBox({
      title: "Telegram (talk to the crew from your phone)",
      name: "telegram",
      saved: S.secrets.telegram,
      placeholder: "Bot token from @BotFather",
      help: ["In Telegram, message @BotFather, send /newbot, and paste the token it gives you here. Then pair your phone. ",
        "From the phone you can give orders, check status and stop everything. Nothing in Settings can be changed from the phone."],
      after: S.secrets.telegram ? h("div", {},
        h("p", {}, S.telegram.paired ? "Paired with your phone." : "Not paired yet."),
        ui.pairCode ? h("p", { class: "callout" }, `Send this code to your bot in the next 10 minutes: ${ui.pairCode}`) : null,
        S.telegram.paired ? null : h("button", { class: "secondary", onclick: async () => { const r = await attempt(() => api("POST", "/api/telegram/pair", {})); if (r) { ui.pairCode = r.code; render(); } } }, "Pair my phone"),
      ) : null,
    }),

    h("div", { class: "box" },
      h("h3", {}, "Tool servers (MCP) for the Antenna"),
      h("p", { class: "muted" }, "Connect an outside service that offers an MCP server. Anthropic's servers call it directly, so only add services you trust, and name the exact tools to allow."),
      S.config.mcpServers.length ? h("ul", { class: "list" }, S.config.mcpServers.map((s) => h("li", { class: "row" },
        h("div", { class: "grow" }, h("strong", {}, s.name), h("div", { class: "muted small" }, s.url, s.tools.length ? ` · allows ${s.tools.join(", ")}` : " · allows all tools")),
        h("button", { class: "link danger-text", onclick: () => attempt(() => api("DELETE", `/api/mcp/${s.id}`), "Removed.") }, "Remove")))) : null,
      mcpName, mcpUrl, mcpToken, mcpTools,
      h("button", {
        class: "secondary",
        onclick: () => attempt(() => api("POST", "/api/mcp", {
          name: mcpName.value, url: mcpUrl.value, token: mcpToken.value || undefined,
          tools: mcpTools.value.split(",").map((t) => t.trim()).filter(Boolean),
        }), "Tool server added. Place an Antenna to use it."),
      }, "Add tool server"),
    ),

    h("div", { class: "box" },
      h("h3", {}, "Where things live"),
      h("p", { class: "muted" }, "Everything the station keeps is in this folder, readable only by your Mac account:"),
      h("code", { class: "path" }, S.paths.home),
    ),
  );
}

function renderEtsySettings() {
  const ready = S.secrets.etsyKey && S.secrets.etsySecret;
  return h("div", { class: "box" },
    h("h3", {}, "Etsy (read-only)"),
    h("p", { class: "muted" },
      "Lets crew with a Shop Counter look at your listings, orders and reviews. They can't change anything on Etsy, and buyer names, emails and addresses are never shown to them."),
    S.etsy.connected
      ? h("div", {},
        h("p", {}, `Connected to ${S.etsy.shopName}.`),
        h("button", { class: "secondary danger-text", onclick: () => attempt(() => api("POST", "/api/etsy/disconnect", {}), "Etsy disconnected.") }, "Disconnect Etsy"))
      : h("ol", { class: "small" },
        h("li", {}, "Go to etsy.com/developers, create an app, and wait for Etsy to approve it."),
        h("li", {}, "In the app's settings, add this exact callback URL: ", h("code", {}, S.etsy.redirectUri)),
        h("li", {}, "Paste the app's keystring and shared secret below."),
        h("li", {}, "Click Connect Etsy and approve on etsy.com.")),
    S.etsy.connected ? null : secretBox({ title: "Etsy keystring", name: "etsy-key", saved: S.secrets.etsyKey, placeholder: "Keystring" }),
    S.etsy.connected ? null : secretBox({ title: "Etsy shared secret", name: "etsy-secret", saved: S.secrets.etsySecret, placeholder: "Shared secret" }),
    !S.etsy.connected && ready ? h("button", {
      onclick: async () => {
        const r = await attempt(() => api("POST", "/api/etsy/connect", {}));
        if (r?.url) window.open(r.url, "_blank", "noopener");
      },
    }, "Connect Etsy") : null,
  );
}

// ---------- log ----------

function renderLog() {
  const list = h("tbody", {}, h("tr", {}, h("td", { class: "muted" }, "Loading…")));
  api("GET", "/api/audit").then((rows) => list.replaceChildren(...rows.map((r) => {
    const { at, event, ...rest } = r;
    const detail = Object.entries(rest).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ");
    return h("tr", {}, h("td", { class: "muted small" }, when(at)), h("td", {}, event), h("td", { class: "small" }, detail));
  }))).catch((e) => toast(e.message));
  return h("div", {},
    h("h2", {}, "Log"),
    h("p", { class: "muted" }, "Every job, tool use, setting change and outside message, newest first. Keys and tokens are never written here."),
    h("table", { class: "log" }, list),
  );
}

connect();
