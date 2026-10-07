// The station's control panel, served only to this computer.
//
// Locks on the door:
// - Listens on 127.0.0.1, so nothing on your network or the internet can reach it.
// - Every API call needs a random token minted at launch. Other websites open
//   in your browser can't read it, so they can't drive your crew.
// - Rejects requests whose Host or Origin isn't this station (stops DNS
//   rebinding and cross-site tricks).
// - Strict Content-Security-Policy: the page runs only its own scripts.

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeStation, GEAR, CLASSES, EFFORTS, GRID, ROOM_COLORS, newId } from "./layout.js";
import { sanitizeConfig } from "./store.js";
import { sanitizeSchedules } from "./scheduler.js";
import { MODELS } from "./budget.js";
import { listFiles, resolveInside, PathError } from "./paths.js";
import { hint, SecretError } from "./secrets.js";
import { MAX_MEMORY_BYTES } from "./tools.js";
import { EtsyError } from "./etsy.js";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const STATIC = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/station.js": ["station.js", "text/javascript; charset=utf-8"],
  "/style.css": ["style.css", "text/css; charset=utf-8"],
};
const MAX_BODY = 512 * 1024;
const SECRET_NAMES = new Set(["anthropic", "telegram", "etsy-key", "etsy-secret"]);

const SECURITY_HEADERS = {
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "cache-control": "no-store",
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sameToken(given, expected) {
  if (typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

function json(res, status, value) {
  send(res, status, JSON.stringify(value), { "content-type": "application/json; charset=utf-8" });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, "That's too much data."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "That wasn't valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function stripTask(task) {
  if (!task) return null;
  const { messages, ...rest } = task;
  return rest;
}

function cleanMcpUrl(raw) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    throw new HttpError(400, "That isn't a web address.");
  }
  if (url.protocol !== "https:") throw new HttpError(400, "Tool servers must use https://.");
  if (url.username || url.password) throw new HttpError(400, "Put the token in the token box, not in the address.");
  return url.toString();
}

export function createServer(ctx) {
  const { store, runtime, budget, secrets, telegram, etsy, nightShift, port, token, checkKey } = ctx;
  const files = Object.fromEntries(
    Object.entries(STATIC).map(([route, [file, type]]) => [route, [fs.readFileSync(path.join(PUBLIC, file)), type]]),
  );
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  const streams = new Set();

  const broadcast = (event, data) => {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of streams) res.write(frame);
  };
  runtime.on("task", (t) => broadcast("task", t));
  runtime.on("step", (s) => broadcast("step", s));
  runtime.on("spend", (s) => broadcast("spend", s));
  const heartbeat = setInterval(() => broadcast("ping", {}), 20000);
  heartbeat.unref();

  async function state() {
    const recent = store.recentTasks(40).map(stripTask);
    const live = runtime.activeTasks();
    const liveIds = new Set(live.map((t) => t.id));
    return {
      station: store.station,
      catalog: { gear: GEAR, classes: CLASSES, efforts: EFFORTS, grid: GRID, colors: ROOM_COLORS, models: Object.fromEntries(Object.entries(MODELS).map(([k, v]) => [k, v.label])) },
      config: {
        dailyCapUsd: store.config.dailyCapUsd,
        taskCapUsd: store.config.taskCapUsd,
        maxSteps: store.config.maxSteps,
        allowedDomains: store.config.allowedDomains,
        nightShift: store.config.nightShift,
        mcpServers: store.config.mcpServers,
      },
      spend: { today: budget.spentToday(), history: budget.history() },
      tasks: [...live, ...recent.filter((t) => !liveIds.has(t.id))],
      schedules: store.schedules,
      secrets: {
        kind: secrets.kind,
        anthropic: hint(await secrets.get("anthropic")),
        telegram: Boolean(await secrets.get("telegram")),
        etsyKey: Boolean(await secrets.get("etsy-key")),
        etsySecret: Boolean(await secrets.get("etsy-secret")),
      },
      telegram: telegram.status(),
      etsy: etsy.status(),
      paths: { home: store.home, inbox: store.dir("inbox"), outbox: store.dir("outbox") },
    };
  }

  const changed = async () => broadcast("state", await state());

  function agentOr404(agentId) {
    const agent = store.station.agents.find((a) => a.id === agentId);
    if (!agent) throw new HttpError(404, "No crew member by that id.");
    return agent;
  }

  async function download(res, root, rel) {
    const full = await resolveInside(root, rel, { mustExist: true });
    const stat = await fsp.stat(full);
    if (!stat.isFile()) throw new HttpError(404, "Not a file.");
    const name = path.basename(full);
    // Always a download, never shown in this page's origin, and sandboxed if
    // opened anyway. An HTML file written by a crew member can't run here.
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      "content-type": "application/octet-stream",
      "content-length": stat.size,
      "content-disposition": `attachment; filename="${name.replace(/[^\w .()+@,-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "content-security-policy": "sandbox; default-src 'none'",
    });
    fs.createReadStream(full).pipe(res);
  }

  const routes = [
    ["GET", /^\/api\/state$/, async () => state()],

    ["PUT", /^\/api\/station$/, async (_m, body) => {
      const next = sanitizeStation(body);
      const serverIds = new Set(store.config.mcpServers.map((s) => s.id));
      for (const g of next.gear) if (g.type === "antenna" && !serverIds.has(g.mcpServerId)) g.mcpServerId = null;
      const keep = new Set(next.agents.map((a) => a.id));
      for (const a of store.station.agents) if (!keep.has(a.id)) runtime.stopAgent(a.id, "That crew member was removed.");
      store.saveStation(next);
      store.audit("station.changed", { rooms: next.rooms.length, gear: next.gear.length, crew: next.agents.length });
      await changed();
      return next;
    }],

    ["POST", /^\/api\/tasks$/, async (_m, body) => {
      agentOr404(body.agentId);
      try {
        return stripTask(runtime.summary(runtime.startTask(body.agentId, body.text, { source: "you" })));
      } catch (err) {
        throw new HttpError(400, err.message);
      }
    }],
    ["GET", /^\/api\/tasks\/([a-f0-9]{12})$/, async ([, id]) => {
      const live = runtime.tasks.get(id);
      const task = live ? { ...live, steps: live.steps } : store.loadTask(id);
      if (!task) throw new HttpError(404, "No task by that id.");
      return stripTask(task);
    }],
    ["POST", /^\/api\/tasks\/([a-f0-9]{12})\/stop$/, async ([, id]) => ({ stopped: runtime.stopTask(id) })],
    ["POST", /^\/api\/stop-all$/, async () => {
      runtime.stopAll();
      store.audit("stop_all");
      return { stopped: true };
    }],

    ["GET", /^\/api\/outbox$/, async () => listFiles(store.dir("outbox"))],
    ["GET", /^\/api\/inbox$/, async () => listFiles(store.dir("inbox"))],
    ["DELETE", /^\/api\/outbox$/, async (_m, _b, url) => {
      const full = await resolveInside(store.dir("outbox"), url.searchParams.get("name"), { mustExist: true });
      await fsp.rm(full);
      store.audit("outbox.removed", { file: path.basename(full) });
      return { removed: true };
    }],
    ["GET", /^\/api\/workspace\/([a-f0-9]{12})$/, async ([, id]) => {
      agentOr404(id);
      return listFiles(store.agentDir(id, "workspace"));
    }],
    ["GET", /^\/api\/memory\/([a-f0-9]{12})$/, async ([, id]) => {
      agentOr404(id);
      return { memory: store.readMemory(id) };
    }],
    ["PUT", /^\/api\/memory\/([a-f0-9]{12})$/, async ([, id], body) => {
      agentOr404(id);
      const memory = typeof body.memory === "string" ? body.memory : "";
      if (Buffer.byteLength(memory) > MAX_MEMORY_BYTES) throw new HttpError(400, "Memory is limited to 8 KB.");
      store.writeMemory(id, memory);
      store.audit("memory.edited", { agent: id });
      return { memory };
    }],

    ["PUT", /^\/api\/config$/, async (_m, body) => {
      store.saveConfig(sanitizeConfig(body, store.config));
      store.audit("settings.changed", { dailyCapUsd: store.config.dailyCapUsd, taskCapUsd: store.config.taskCapUsd, maxSteps: store.config.maxSteps });
      await changed();
      return { ok: true };
    }],
    ["POST", /^\/api\/nightshift$/, async (_m, body) => {
      const report = await nightShift.set(Boolean(body.on));
      await changed();
      return { report };
    }],
    ["PUT", /^\/api\/schedules$/, async (_m, body) => {
      store.saveSchedules(sanitizeSchedules(body.schedules, store.station.agents));
      store.audit("schedules.changed", { count: store.schedules.length });
      await changed();
      return store.schedules;
    }],

    ["POST", /^\/api\/secrets\/([a-z-]+)$/, async ([, name], body) => {
      if (!SECRET_NAMES.has(name)) throw new HttpError(404, "Unknown key.");
      const value = typeof body.value === "string" ? body.value.trim() : "";
      if (name === "anthropic" && !value.startsWith("sk-ant-")) throw new HttpError(400, "Anthropic keys start with sk-ant-.");
      if (name === "telegram" && !/^\d{5,15}:[\w-]{20,}$/.test(value)) throw new HttpError(400, "That doesn't look like a Telegram bot token.");
      await secrets.set(name, value);
      store.audit("key.saved", { name });
      if (name === "telegram") await telegram.start();
      await changed();
      return { ok: true };
    }],
    ["DELETE", /^\/api\/secrets\/([a-z-]+)$/, async ([, name]) => {
      if (!SECRET_NAMES.has(name)) throw new HttpError(404, "Unknown key.");
      if (name === "telegram") await telegram.unpair();
      else await secrets.remove(name);
      if (name === "etsy-key" || name === "etsy-secret") await etsy.disconnect();
      store.audit("key.removed", { name });
      await changed();
      return { ok: true };
    }],
    ["POST", /^\/api\/check-key$/, async () => checkKey()],

    ["POST", /^\/api\/telegram\/pair$/, async () => {
      if (!(await secrets.get("telegram"))) throw new HttpError(400, "Save your bot token first.");
      await telegram.start();
      return { code: telegram.beginPairing() };
    }],

    ["POST", /^\/api\/etsy\/connect$/, async () => ({ url: await etsy.beginConnect() })],
    ["POST", /^\/api\/etsy\/disconnect$/, async () => {
      await etsy.disconnect();
      await changed();
      return { ok: true };
    }],

    ["POST", /^\/api\/mcp$/, async (_m, body) => {
      if (store.config.mcpServers.length >= 8) throw new HttpError(400, "That's the limit of 8 tool servers.");
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 30) : "";
      if (!name) throw new HttpError(400, "Give the tool server a name.");
      const tools = (Array.isArray(body.tools) ? body.tools : [])
        .map((t) => (typeof t === "string" ? t.trim() : ""))
        .filter((t) => /^[\w.-]{1,64}$/.test(t))
        .slice(0, 40);
      const server = { id: newId(), name, url: cleanMcpUrl(body.url), tools };
      if (body.token) await secrets.set(`mcp-${server.id}`, body.token);
      store.saveConfig({ ...store.config, mcpServers: [...store.config.mcpServers, server] });
      store.audit("mcp.added", { name, url: server.url, tools: tools.length });
      await changed();
      return server;
    }],
    ["DELETE", /^\/api\/mcp\/([a-f0-9]{12})$/, async ([, id]) => {
      await secrets.remove(`mcp-${id}`);
      store.saveConfig({ ...store.config, mcpServers: store.config.mcpServers.filter((s) => s.id !== id) });
      store.saveStation(sanitizeStation({
        ...store.station,
        gear: store.station.gear.map((g) => (g.mcpServerId === id ? { ...g, mcpServerId: null } : g)),
      }));
      store.audit("mcp.removed", { id });
      await changed();
      return { ok: true };
    }],

    ["GET", /^\/api\/audit$/, async () => store.readAudit(300)],
  ];

  async function handleEtsyCallback(res, url) {
    let message = "Etsy is connected. You can close this tab and go back to the station.";
    let status = 200;
    try {
      if (url.searchParams.get("error")) throw new EtsyError("You cancelled the Etsy sign-in.");
      await etsy.finishConnect({ code: url.searchParams.get("code"), state: url.searchParams.get("state") });
      await changed();
    } catch (err) {
      status = 400;
      message = err instanceof EtsyError ? err.message : "Etsy sign-in failed. Try again from Settings.";
      store.audit("etsy.connect_failed", { reason: message });
    }
    const safe = message.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    send(res, status, `<!doctype html><meta charset="utf-8"><title>Buddha Station</title><p style="font:16px system-ui;margin:3em auto;max-width:30em">${safe}</p>`, {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (!hosts.has(req.headers.host ?? "")) throw new HttpError(403, "Wrong host.");
      const origin = req.headers.origin;
      if (origin && !origins.has(origin)) throw new HttpError(403, "Wrong origin.");
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (req.method === "GET" && STATIC[url.pathname]) {
        const [body, type] = files[url.pathname];
        return send(res, 200, body, { "content-type": type });
      }
      // Etsy's redirect back is a cross-site navigation by design. It's
      // protected by the one-time state value instead of the token.
      if (req.method === "GET" && url.pathname === "/etsy/callback") return await handleEtsyCallback(res, url);
      if (!url.pathname.startsWith("/api/")) throw new HttpError(404, "Not found.");
      if (req.headers["sec-fetch-site"] === "cross-site") throw new HttpError(403, "Cross-site requests aren't allowed.");

      if (url.pathname === "/api/events") {
        if (!sameToken(url.searchParams.get("t"), token)) throw new HttpError(401, "Open the station from its launcher.");
        res.writeHead(200, { ...SECURITY_HEADERS, "content-type": "text/event-stream", connection: "keep-alive" });
        res.write(`event: state\ndata: ${JSON.stringify(await state())}\n\n`);
        streams.add(res);
        req.on("close", () => streams.delete(res));
        return;
      }

      if (!sameToken(req.headers["x-station-token"], token)) throw new HttpError(401, "Open the station from its launcher.");

      if (req.method === "GET" && url.pathname === "/api/outbox/download") {
        return await download(res, store.dir("outbox"), url.searchParams.get("name"));
      }
      const ws = url.pathname.match(/^\/api\/workspace\/([a-f0-9]{12})\/download$/);
      if (req.method === "GET" && ws) {
        agentOr404(ws[1]);
        return await download(res, store.agentDir(ws[1], "workspace"), url.searchParams.get("path"));
      }

      let body = {};
      if (req.method === "POST" || req.method === "PUT") {
        // A JSON content type can't be sent by a plain HTML form, so this
        // closes off the oldest cross-site trick even before the token check.
        if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) {
          throw new HttpError(415, "Send JSON.");
        }
        body = await readBody(req);
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Send a JSON object.");
      }

      for (const [method, pattern, handler] of routes) {
        if (method !== req.method) continue;
        const match = url.pathname.match(pattern);
        if (match) return json(res, 200, await handler(match, body, url));
      }
      throw new HttpError(404, "Not found.");
    } catch (err) {
      if (res.headersSent) return res.end();
      if (err instanceof HttpError) return json(res, err.status, { error: err.message });
      if (err instanceof PathError || err instanceof SecretError || err instanceof EtsyError) {
        return json(res, 400, { error: err.message });
      }
      store.audit("server.error", { message: String(err?.message ?? err).slice(0, 300) });
      return json(res, 500, { error: "Something went wrong on the station. Check the log." });
    }
  });

  server.on("close", () => {
    clearInterval(heartbeat);
    for (const res of streams) res.end();
  });
  return server;
}
