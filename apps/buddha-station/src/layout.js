// The station is the permission system. A room's gear decides what the crew in
// that room can do, and hallways decide who can hand work to whom. Everything
// the browser sends back is rebuilt here from scratch, field by field.

import crypto from "node:crypto";
import { MODELS, DEFAULT_MODEL } from "./budget.js";

export const GRID = { cols: 32, rows: 20 };

export const GEAR = {
  cabinet: {
    label: "Filing Cabinet",
    grants: "files",
    blurb: "Read and write files in the crew member's own folder. Read the shared Inbox.",
  },
  memory: {
    label: "Memory Core",
    grants: "memory",
    blurb: "Keep notes that carry over from one task to the next.",
  },
  dish: {
    label: "Signal Dish",
    grants: "web",
    blurb: "Search the web and read pages. Runs on Anthropic's servers, not your computer.",
  },
  workbench: {
    label: "Workbench",
    grants: "code",
    blurb: "Run code in Anthropic's cloud sandbox. Nothing runs on your computer.",
  },
  hatch: {
    label: "Comms Hatch",
    grants: "handoff",
    blurb: "Hand work to crew in this room or a room joined by a hallway.",
  },
  antenna: {
    label: "Antenna",
    grants: "mcp",
    blurb: "Use an outside tool server you've connected in Settings (MCP).",
  },
  counter: {
    label: "Shop Counter",
    grants: "etsy",
    blurb: "Look at your Etsy shop: listings, orders and reviews. Read-only, and buyer details are hidden.",
  },
};

export const CLASSES = {
  writer: {
    label: "Writer",
    persona: "You write product copy, emails and posts. Plain words, short sentences, warm and direct. No hype.",
  },
  researcher: {
    label: "Researcher",
    persona: "You dig up facts and sources, then report what you found and how sure you are. You never make up a source.",
  },
  analyst: {
    label: "Analyst",
    persona: "You work through numbers and spreadsheets (CSV). Show the math, flag anything odd, keep summaries short.",
  },
  operator: {
    label: "Operator",
    persona: "You turn messy notes into checklists, plans and tidy files. Practical and brief.",
  },
  generalist: {
    label: "Generalist",
    persona: "You help with whatever comes up. Ask yourself what the captain actually needs, then do that.",
  },
};

export const EFFORTS = ["low", "medium", "high"];

export const ROOM_COLORS = ["#3b6ea5", "#7a4fa3", "#2f8a6b", "#a5683b", "#9a3b5a", "#5a6b7a"];

export function newId() {
  return crypto.randomBytes(6).toString("hex");
}

const text = (value, max, fallback = "") =>
  typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : fallback;
const int = (value, min, max) => {
  const n = Number.isInteger(value) ? value : Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
};
const id = (value) => (typeof value === "string" && /^[a-f0-9]{12}$/.test(value) ? value : newId());

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function sanitizeStation(input) {
  const src = input && typeof input === "object" ? input : {};
  const rooms = [];
  for (const r of Array.isArray(src.rooms) ? src.rooms.slice(0, 12) : []) {
    const room = {
      id: id(r?.id),
      name: text(r?.name, 30, "Room") || "Room",
      color: ROOM_COLORS.includes(r?.color) ? r.color : ROOM_COLORS[rooms.length % ROOM_COLORS.length],
      x: int(r?.x, 0, GRID.cols - 4),
      y: int(r?.y, 0, GRID.rows - 3),
      w: int(r?.w, 4, 14),
      h: int(r?.h, 3, 10),
    };
    if ([room.x, room.y, room.w, room.h].includes(null)) continue;
    room.w = Math.min(room.w, GRID.cols - room.x);
    room.h = Math.min(room.h, GRID.rows - room.y);
    if (room.w < 4 || room.h < 3) continue;
    if (rooms.some((other) => other.id === room.id || overlaps(other, room))) continue;
    rooms.push(room);
  }
  const roomIds = new Set(rooms.map((r) => r.id));
  const roomById = new Map(rooms.map((r) => [r.id, r]));

  const hallways = [];
  const seen = new Set();
  for (const h of Array.isArray(src.hallways) ? src.hallways.slice(0, 30) : []) {
    const a = h?.a, b = h?.b;
    if (!roomIds.has(a) || !roomIds.has(b) || a === b) continue;
    const key = [a, b].sort().join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    hallways.push({ a, b });
  }

  const gear = [];
  const taken = new Set();
  for (const g of Array.isArray(src.gear) ? src.gear.slice(0, 60) : []) {
    if (!GEAR[g?.type]) continue;
    const room = roomById.get(g?.room);
    if (!room) continue;
    const x = int(g?.x, room.x, room.x + room.w - 1);
    const y = int(g?.y, room.y, room.y + room.h - 1);
    if (x === null || y === null || taken.has(`${x},${y}`)) continue;
    taken.add(`${x},${y}`);
    const item = { id: id(g?.id), type: g.type, room: room.id, x, y };
    if (g.type === "antenna") item.mcpServerId = typeof g.mcpServerId === "string" ? g.mcpServerId.slice(0, 12) : null;
    gear.push(item);
  }

  const agents = [];
  for (const a of Array.isArray(src.agents) ? src.agents.slice(0, 16) : []) {
    if (!roomIds.has(a?.room)) continue;
    const cls = CLASSES[a?.class] ? a.class : "generalist";
    const name = text(a?.name, 24);
    if (!name || agents.some((other) => other.name.toLowerCase() === name.toLowerCase())) continue;
    agents.push({
      id: id(a?.id),
      name,
      class: cls,
      persona: text(a?.persona, 2000, CLASSES[cls].persona) || CLASSES[cls].persona,
      model: MODELS[a?.model] ? a.model : DEFAULT_MODEL,
      effort: EFFORTS.includes(a?.effort) ? a.effort : "medium",
      room: a.room,
    });
  }

  return { rooms, hallways, gear, agents };
}

export function capabilitiesFor(station, agent) {
  const grants = new Set();
  const mcpServerIds = new Set();
  for (const g of station.gear) {
    if (g.room !== agent.room) continue;
    grants.add(GEAR[g.type].grants);
    if (g.type === "antenna" && g.mcpServerId) mcpServerIds.add(g.mcpServerId);
  }
  return { grants, mcpServerIds };
}

// Who this agent may hand work to: crew in the same room, or in a room one
// hallway away. Only when this room has a Comms Hatch.
export function handoffTargets(station, agent) {
  if (!capabilitiesFor(station, agent).grants.has("handoff")) return [];
  const rooms = new Set([agent.room]);
  for (const h of station.hallways) {
    if (h.a === agent.room) rooms.add(h.b);
    if (h.b === agent.room) rooms.add(h.a);
  }
  return station.agents.filter((a) => a.id !== agent.id && rooms.has(a.room));
}

export function starterStation() {
  const bridge = { id: newId(), name: "Bridge", color: ROOM_COLORS[0], x: 12, y: 6, w: 8, h: 6 };
  const comms = { id: newId(), name: "Comms Deck", color: ROOM_COLORS[1], x: 2, y: 2, w: 7, h: 6 };
  const lab = { id: newId(), name: "Lab", color: ROOM_COLORS[2], x: 23, y: 11, w: 7, h: 6 };
  const g = (type, room, dx, dy) => ({ id: newId(), type, room: room.id, x: room.x + dx, y: room.y + dy });
  return sanitizeStation({
    rooms: [bridge, comms, lab],
    hallways: [{ a: bridge.id, b: comms.id }, { a: bridge.id, b: lab.id }],
    gear: [
      g("cabinet", bridge, 1, 1), g("memory", bridge, 6, 1), g("hatch", bridge, 3, 4), g("counter", bridge, 6, 4),
      g("dish", comms, 1, 1), g("cabinet", comms, 5, 1), g("hatch", comms, 3, 4),
      g("workbench", lab, 1, 1), g("cabinet", lab, 5, 1), g("hatch", lab, 3, 4),
    ],
    agents: [
      { name: "Sage", class: "writer", room: bridge.id, persona: CLASSES.writer.persona },
      { name: "Scout", class: "researcher", room: comms.id, persona: CLASSES.researcher.persona },
      { name: "Tally", class: "analyst", room: lab.id, persona: CLASSES.analyst.persona },
    ],
  });
}
