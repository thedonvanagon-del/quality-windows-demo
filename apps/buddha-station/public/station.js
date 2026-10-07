// The station view. Everything is drawn in code, pixel by pixel. No images
// are downloaded from anywhere.

const TILE = 32; // canvas pixels per tile
const PX = 2; // canvas pixels per art pixel (a tile is 16x16 art pixels)

const SUITS = {
  writer: "#e0913a",
  researcher: "#2fb3a3",
  analyst: "#4f7fe0",
  operator: "#7ab648",
  generalist: "#b06fd8",
};
const SKIN = ["#f1c9a5", "#d9a47a", "#b07a52", "#8a5a3b", "#5e3d29"];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v + amount * (amount > 0 ? 255 - v : v))));
  const r = c((n >> 16) & 255), g = c((n >> 8) & 255), b = c(n & 255);
  return `rgb(${r},${g},${b})`;
}

export class StationView {
  constructor(canvas, handlers) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.handlers = handlers;
    this.state = null;
    this.mode = { kind: "select" };
    this.selected = { agent: null, room: null };
    this.crew = new Map(); // agentId -> { x, y, tx, ty, frame, bubble, until, status, pauseUntil }
    this.drag = null;
    this.hallwayStart = null;
    this.hover = null;
    this.stars = Array.from({ length: 140 }, (_, i) => ({
      x: hash(`sx${i}`) % canvas.width,
      y: hash(`sy${i}`) % canvas.height,
      s: (hash(`ss${i}`) % 3) === 0 ? 2 : 1,
      p: (hash(`sp${i}`) % 628) / 100,
    }));
    canvas.addEventListener("mousedown", (e) => this.onDown(e));
    canvas.addEventListener("mousemove", (e) => this.onMove(e));
    window.addEventListener("mouseup", (e) => this.onUp(e));
    canvas.addEventListener("mouseleave", () => { this.hover = null; this.handlers.onHover(""); });
    const loop = (t) => {
      this.tick(t);
      this.draw(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  setState(state) {
    this.state = state;
    const ids = new Set(state.station.agents.map((a) => a.id));
    for (const id of this.crew.keys()) if (!ids.has(id)) this.crew.delete(id);
    for (const agent of state.station.agents) {
      const room = this.room(agent.room);
      if (!room) continue;
      if (!this.crew.has(agent.id)) {
        const spot = this.randomSpot(room, agent.id);
        this.crew.set(agent.id, { x: spot.x, y: spot.y, tx: spot.x, ty: spot.y, frame: 0, bubble: null, until: 0, status: "idle", pauseUntil: 0 });
      }
    }
  }

  setMode(mode) {
    this.mode = mode;
    this.hallwayStart = null;
    this.drag = null;
  }

  select({ agent = null, room = null }) {
    this.selected = { agent, room };
  }

  // A crew member started doing something. Walk them to the matching gear.
  activity(agentId, { gear, text, status }) {
    const c = this.crew.get(agentId);
    const agent = this.agent(agentId);
    if (!c || !agent) return;
    const now = performance.now();
    if (status === "working") {
      c.status = "working";
      if (text) { c.bubble = text; c.until = now + 6000; }
      const target = gear && this.state.station.gear.find((g) => g.room === agent.room && g.type === gear);
      if (target) {
        // Stand just below the gear, or just above it if it's on the bottom row.
        const room = this.room(agent.room);
        const row = target.y + 1 < room.y + room.h ? target.y + 1 : target.y - 1;
        c.tx = target.x * TILE + TILE / 2;
        c.ty = row * TILE + TILE / 2;
        c.pauseUntil = now + 4000;
      }
    } else if (status === "done") {
      c.status = "idle";
      c.bubble = "Done ✓";
      c.until = now + 5000;
    } else if (status === "failed" || status === "stopped") {
      c.status = "idle";
      c.bubble = status === "failed" ? "Hit a snag !" : "Stopped";
      c.until = now + 5000;
    } else if (status === "queued") {
      if (c.status !== "working") { c.bubble = "On my list"; c.until = now + 3000; }
    }
  }

  room(id) { return this.state?.station.rooms.find((r) => r.id === id); }
  agent(id) { return this.state?.station.agents.find((a) => a.id === id); }

  randomSpot(room, seed = "") {
    const h = hash(seed + Math.random());
    const tx = room.x + 1 + (h % Math.max(1, room.w - 2));
    // Skip the top row: that's where the wall and the room's name plate are.
    const ty = room.y + 2 + ((h >>> 8) % Math.max(1, room.h - 2));
    return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
  }

  tick(t) {
    if (!this.state) return;
    for (const agent of this.state.station.agents) {
      const c = this.crew.get(agent.id);
      const room = this.room(agent.room);
      if (!c || !room) continue;
      if (this.drag?.agent === agent.id && this.drag.moved) continue;
      const inside = c.x > room.x * TILE && c.x < (room.x + room.w) * TILE && c.y > room.y * TILE && c.y < (room.y + room.h) * TILE;
      const dx = c.tx - c.x, dy = c.ty - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        const speed = inside ? 1.1 : 3;
        c.x += (dx / dist) * Math.min(speed, dist);
        c.y += (dy / dist) * Math.min(speed, dist);
        c.frame = Math.floor(t / 160) % 2;
      } else if (t > c.pauseUntil) {
        const spot = this.randomSpot(room, agent.id);
        c.tx = spot.x; c.ty = spot.y;
        c.pauseUntil = t + (c.status === "working" ? 1500 : 2500 + (hash(agent.id + t) % 4000));
      }
      if (c.bubble && t > c.until) c.bubble = null;
    }
  }

  // ---------- drawing ----------

  draw(t) {
    const { ctx, canvas } = this;
    ctx.fillStyle = "#070a14";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const s of this.stars) {
      const a = 0.35 + 0.65 * Math.abs(Math.sin(t / 900 + s.p));
      ctx.fillStyle = `rgba(220,230,255,${a.toFixed(2)})`;
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    if (!this.state) return;
    const { rooms, hallways, gear, agents } = this.state.station;
    for (const h of hallways) this.drawHallway(h);
    for (const r of rooms) this.drawRoom(r);
    for (const g of gear) this.drawGear(g, t);
    const sorted = [...agents].sort((a, b) => (this.crew.get(a.id)?.y ?? 0) - (this.crew.get(b.id)?.y ?? 0));
    for (const a of sorted) this.drawAgent(a, t);
    for (const a of sorted) this.drawBubble(a);
    this.drawOverlay();
  }

  drawHallway(h) {
    const a = this.room(h.a), b = this.room(h.b);
    if (!a || !b) return;
    const ax = Math.floor(a.x + a.w / 2), ay = Math.floor(a.y + a.h / 2);
    const bx = Math.floor(b.x + b.w / 2), by = Math.floor(b.y + b.h / 2);
    const ctx = this.ctx;
    const tile = (x, y) => {
      ctx.fillStyle = "#262c3d";
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      ctx.fillStyle = "#323a50";
      ctx.fillRect(x * TILE + 4, y * TILE + 4, TILE - 8, TILE - 8);
      ctx.fillStyle = "#3d4762";
      ctx.fillRect(x * TILE + 14, y * TILE + 14, 4, 4);
    };
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) tile(x, ay);
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) tile(bx, y);
  }

  drawRoom(r) {
    const ctx = this.ctx;
    const x = r.x * TILE, y = r.y * TILE, w = r.w * TILE, h = r.h * TILE;
    for (let ty = 0; ty < r.h; ty++) {
      for (let tx = 0; tx < r.w; tx++) {
        ctx.fillStyle = (tx + ty) % 2 ? shade(r.color, -0.62) : shade(r.color, -0.56);
        ctx.fillRect(x + tx * TILE, y + ty * TILE, TILE, TILE);
      }
    }
    ctx.fillStyle = shade(r.color, -0.25);
    ctx.fillRect(x, y, w, 6);
    ctx.fillRect(x, y + h - 4, w, 4);
    ctx.fillRect(x, y, 4, h);
    ctx.fillRect(x + w - 4, y, 4, h);
    ctx.fillStyle = shade(r.color, 0.25);
    ctx.fillRect(x, y, w, 2);
    const selected = this.selected.room === r.id || this.hallwayStart === r.id;
    if (selected) {
      ctx.strokeStyle = "#ffd36b";
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    }
    ctx.font = "bold 12px ui-monospace, Menlo, monospace";
    const label = r.name.toUpperCase();
    const lw = ctx.measureText(label).width + 10;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x + 8, y + 8, lw, 18);
    ctx.fillStyle = "#e8ecf6";
    ctx.fillText(label, x + 13, y + 21);
  }

  px(gx, gy, ax, ay, aw, ah, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(gx + ax * PX, gy + ay * PX, aw * PX, ah * PX);
  }

  drawGear(g, t) {
    const X = g.x * TILE, Y = g.y * TILE;
    const p = (ax, ay, aw, ah, c) => this.px(X, Y, ax, ay, aw, ah, c);
    const blink = Math.floor(t / 500) % 2 === 0;
    switch (g.type) {
      case "cabinet":
        p(3, 2, 10, 13, "#6b7489"); p(4, 3, 8, 3, "#8a93a8"); p(4, 7, 8, 3, "#8a93a8"); p(4, 11, 8, 3, "#8a93a8");
        p(7, 4, 2, 1, "#2b2f3a"); p(7, 8, 2, 1, "#2b2f3a"); p(7, 12, 2, 1, "#2b2f3a");
        break;
      case "memory": {
        const glow = 0.5 + 0.5 * Math.sin(t / 400);
        p(4, 11, 8, 4, "#3a3352");
        p(5, 3, 6, 8, `rgba(170,120,255,${(0.55 + glow * 0.45).toFixed(2)})`);
        p(6, 4, 4, 6, "#e4d6ff"); p(7, 2, 2, 1, "#8f7ad6");
        break;
      }
      case "dish":
        p(7, 9, 2, 6, "#8a93a8"); p(4, 14, 8, 1, "#6b7489");
        p(2, 4, 12, 2, "#dfe6f2"); p(3, 6, 10, 2, "#c4ccdb"); p(5, 8, 6, 1, "#a8b1c4");
        p(7, 1, 2, 3, "#dfe6f2"); if (blink) p(7, 0, 2, 1, "#6bf0ff");
        break;
      case "workbench":
        p(1, 7, 14, 3, "#8a5a32"); p(1, 7, 14, 1, "#a8743f"); p(2, 10, 2, 5, "#5e3d22"); p(12, 10, 2, 5, "#5e3d22");
        p(3, 4, 5, 3, "#1f2733"); p(4, 5, 3, 1, blink ? "#7dff9a" : "#3bb85a"); p(10, 5, 3, 2, "#b8c0cf");
        break;
      case "hatch":
        p(3, 3, 10, 11, "#3a4256"); p(4, 4, 8, 9, "#c9a227"); p(5, 5, 6, 7, "#2d3445");
        p(5, 7, 6, 1, "#c9a227"); p(5, 9, 6, 1, "#c9a227");
        break;
      case "antenna":
        p(7, 3, 2, 12, "#8a93a8"); p(4, 14, 8, 1, "#6b7489"); p(5, 6, 6, 1, "#8a93a8"); p(6, 9, 4, 1, "#8a93a8");
        p(7, 1, 2, 2, blink ? "#ff5a5a" : "#7a2a2a");
        if (!g.mcpServerId) p(11, 1, 3, 3, "#ffb020");
        break;
      case "counter":
        p(1, 8, 14, 7, "#7a4b2a"); p(1, 8, 14, 2, "#a0663a"); p(3, 11, 10, 2, "#5e3a20");
        p(3, 3, 4, 5, "#f1592a"); p(4, 4, 2, 2, "#fff"); p(9, 4, 4, 4, "#e8ecf6"); p(10, 5, 2, 1, "#2b2f3a");
        break;
    }
  }

  drawAgent(a, t) {
    const c = this.crew.get(a.id);
    if (!c) return;
    const suit = SUITS[a.class] ?? SUITS.generalist;
    const skin = SKIN[hash(a.id) % SKIN.length];
    const X = Math.round(c.x - TILE / 2), Y = Math.round(c.y - TILE / 2 - 6);
    const p = (ax, ay, aw, ah, col) => this.px(X, Y, ax, ay, aw, ah, col);
    const bob = c.status === "working" && Math.floor(t / 250) % 2 ? -1 : 0;
    this.ctx.fillStyle = "rgba(0,0,0,0.35)";
    this.ctx.fillRect(X + 8, Y + 30, 16, 4);
    p(4, 1 + bob, 8, 7, shade(suit, -0.2));
    p(5, 2 + bob, 6, 5, skin);
    p(5, 3 + bob, 6, 2, "#9fe3ff");
    p(6, 3 + bob, 1, 1, "#ffffff");
    p(4, 8, 8, 5, suit); p(3, 9, 1, 3, shade(suit, -0.2)); p(12, 9, 1, 3, shade(suit, -0.2));
    p(7, 9, 2, 2, "#ffd36b");
    if (c.frame) { p(5, 13, 2, 3, "#22283a"); p(9, 13, 2, 2, "#22283a"); }
    else { p(5, 13, 2, 2, "#22283a"); p(9, 13, 2, 3, "#22283a"); }
    if (c.status === "working") {
      const glow = 0.4 + 0.4 * Math.sin(t / 200);
      this.ctx.fillStyle = `rgba(255,211,107,${glow.toFixed(2)})`;
      this.ctx.fillRect(X + 28, Y + 2, 4, 4);
    }
    if (this.selected.agent === a.id) {
      this.ctx.strokeStyle = "#ffd36b";
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(X + 4, Y, 24, 34);
    }
    this.ctx.font = "11px ui-monospace, Menlo, monospace";
    const w = this.ctx.measureText(a.name).width;
    this.ctx.fillStyle = "rgba(0,0,0,0.6)";
    this.ctx.fillRect(c.x - w / 2 - 3, Y + 35, w + 6, 13);
    this.ctx.fillStyle = "#f3f5fa";
    this.ctx.fillText(a.name, c.x - w / 2, Y + 45);
  }

  drawBubble(a) {
    const c = this.crew.get(a.id);
    if (!c?.bubble) return;
    const ctx = this.ctx;
    ctx.font = "11px ui-monospace, Menlo, monospace";
    const text = c.bubble.length > 34 ? `${c.bubble.slice(0, 33)}…` : c.bubble;
    const w = ctx.measureText(text).width + 12;
    let bx = Math.round(c.x - w / 2);
    bx = Math.max(2, Math.min(this.canvas.width - w - 2, bx));
    const by = Math.round(c.y - TILE / 2 - 30);
    ctx.fillStyle = "#f7f3e8";
    ctx.fillRect(bx, by, w, 18);
    ctx.fillRect(Math.round(c.x) - 3, by + 18, 6, 4);
    ctx.fillStyle = "#1b1f2b";
    ctx.fillText(text, bx + 6, by + 13);
  }

  drawOverlay() {
    const ctx = this.ctx;
    if (this.drag?.room) {
      const r = this.drag.room;
      ctx.strokeStyle = r.ok ? "#7dff9a" : "#ff6b6b";
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x * TILE + 1, r.y * TILE + 1, r.w * TILE - 2, r.h * TILE - 2);
      ctx.setLineDash([]);
    }
    if (this.hover && (this.mode.kind === "gear" || this.mode.kind === "room")) {
      ctx.strokeStyle = "rgba(255,211,107,0.8)";
      ctx.lineWidth = 2;
      ctx.strokeRect(this.hover.tx * TILE + 1, this.hover.ty * TILE + 1, TILE - 2, TILE - 2);
    }
  }

  // ---------- input ----------

  point(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * this.canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * this.canvas.height;
    return { x, y, tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) };
  }

  roomAt(tx, ty) {
    return this.state?.station.rooms.find((r) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h);
  }

  agentAt(x, y) {
    let best = null, bestD = 22;
    for (const a of this.state?.station.agents ?? []) {
      const c = this.crew.get(a.id);
      if (!c) continue;
      const d = Math.hypot(c.x - x, c.y - 6 - y);
      if (d < bestD) { best = a; bestD = d; }
    }
    return best;
  }

  gearAt(tx, ty) {
    return this.state?.station.gear.find((g) => g.x === tx && g.y === ty);
  }

  onDown(e) {
    if (!this.state) return;
    const pt = this.point(e);
    const kind = this.mode.kind;
    if (kind === "select") {
      const agent = this.agentAt(pt.x, pt.y);
      if (agent) { this.drag = { agent: agent.id, start: pt, moved: false }; return; }
      const gear = this.gearAt(pt.tx, pt.ty);
      if (gear) { this.handlers.onSelectGear(gear); return; }
      const room = this.roomAt(pt.tx, pt.ty);
      this.handlers.onSelectRoom(room?.id ?? null);
    } else if (kind === "room") {
      if (this.roomAt(pt.tx, pt.ty)) return;
      this.drag = { from: pt, room: { x: pt.tx, y: pt.ty, w: 1, h: 1, ok: false } };
    } else if (kind === "gear") {
      const room = this.roomAt(pt.tx, pt.ty);
      if (!room) return this.handlers.onHint("Gear has to go inside a room.");
      if (this.gearAt(pt.tx, pt.ty)) return this.handlers.onHint("Something's already on that spot.");
      this.handlers.onPlaceGear({ type: this.mode.gear, room: room.id, x: pt.tx, y: pt.ty });
    } else if (kind === "hallway") {
      const room = this.roomAt(pt.tx, pt.ty);
      if (!room) return;
      if (!this.hallwayStart) {
        this.hallwayStart = room.id;
        this.handlers.onHint(`Now click the room to connect to ${room.name}.`);
      } else if (this.hallwayStart !== room.id) {
        this.handlers.onHallway(this.hallwayStart, room.id);
        this.hallwayStart = null;
      }
    }
  }

  onMove(e) {
    if (!this.state) return;
    const pt = this.point(e);
    this.hover = pt;
    if (this.drag?.agent) {
      if (!this.drag.moved && Math.hypot(pt.x - this.drag.start.x, pt.y - this.drag.start.y) > 8) this.drag.moved = true;
      if (this.drag.moved) {
        const c = this.crew.get(this.drag.agent);
        if (c) { c.x = pt.x; c.y = pt.y + 6; c.tx = c.x; c.ty = c.y; }
      }
      return;
    }
    if (this.drag?.from) {
      const f = this.drag.from;
      const x = Math.min(f.tx, pt.tx), y = Math.min(f.ty, pt.ty);
      const w = Math.abs(pt.tx - f.tx) + 1, h = Math.abs(pt.ty - f.ty) + 1;
      const rect = { x, y, w, h };
      const clash = this.state.station.rooms.some((r) => x < r.x + r.w && r.x < x + w && y < r.y + r.h && r.y < y + h);
      rect.ok = w >= 4 && h >= 3 && w <= 14 && h <= 10 && !clash;
      this.drag.room = rect;
      return;
    }
    const agent = this.agentAt(pt.x, pt.y);
    const gear = this.gearAt(pt.tx, pt.ty);
    const room = this.roomAt(pt.tx, pt.ty);
    let text = "";
    if (agent) text = `${agent.name}. Click to open, drag to move rooms.`;
    else if (gear) text = `${this.state.catalog.gear[gear.type].label}: ${this.state.catalog.gear[gear.type].blurb}`;
    else if (room) text = `${room.name}`;
    this.handlers.onHover(text);
  }

  onUp(e) {
    if (!this.drag) return;
    const drag = this.drag;
    this.drag = null;
    if (drag.agent) {
      if (!drag.moved) return this.handlers.onSelectAgent(drag.agent);
      const pt = this.point(e);
      const room = this.roomAt(pt.tx, pt.ty);
      const agent = this.agent(drag.agent);
      const c = this.crew.get(drag.agent);
      if (room && agent && room.id !== agent.room) {
        this.handlers.onMoveAgent(drag.agent, room.id);
      } else if (c && agent) {
        const spot = this.randomSpot(this.room(agent.room), agent.id);
        c.tx = spot.x; c.ty = spot.y;
      }
      return;
    }
    if (drag.room) {
      if (drag.room.ok) this.handlers.onDrawRoom({ x: drag.room.x, y: drag.room.y, w: drag.room.w, h: drag.room.h });
      else this.handlers.onHint("Rooms need to be at least 4 wide and 3 tall, and can't overlap.");
    }
  }
}
