// Everything lives in one private folder (~/BuddhaStation by default), readable
// only by your Mac user account. Plain JSON, so you can open and check it.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sanitizeStation, starterStation, newId } from "./layout.js";

export const DEFAULT_CONFIG = {
  dailyCapUsd: 5,
  taskCapUsd: 1,
  maxSteps: 25,
  allowedDomains: [],
  nightShift: false,
  telegram: { chatId: null },
  mcpServers: [],
};

export function defaultHome() {
  return process.env.BUDDHA_STATION_HOME || path.join(os.homedir(), "BuddhaStation");
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    // A damaged file is set aside, not silently overwritten.
    if (err instanceof SyntaxError) {
      fs.renameSync(file, `${file}.damaged-${Date.now()}`);
      return fallback;
    }
    throw err;
  }
}

function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

const money = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : fallback;
};

function cleanDomains(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(
    list
      .map((d) => (typeof d === "string" ? d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") : ""))
      .filter((d) => /^(?=.{3,100}$)([a-z0-9-]+\.)+[a-z]{2,}$/.test(d)),
  )].slice(0, 30);
}

export function sanitizeConfig(input, current = DEFAULT_CONFIG) {
  const src = input && typeof input === "object" ? input : {};
  return {
    ...current,
    dailyCapUsd: money(src.dailyCapUsd ?? current.dailyCapUsd, 0, 500, current.dailyCapUsd),
    taskCapUsd: money(src.taskCapUsd ?? current.taskCapUsd, 0.05, 50, current.taskCapUsd),
    maxSteps: Math.min(60, Math.max(3, Math.round(Number(src.maxSteps ?? current.maxSteps)) || current.maxSteps)),
    allowedDomains: src.allowedDomains !== undefined ? cleanDomains(src.allowedDomains) : current.allowedDomains,
  };
}

export class Store {
  constructor(home = defaultHome()) {
    this.home = path.resolve(home);
    for (const dir of [this.home, this.dir("agents"), this.dir("inbox"), this.dir("outbox"), this.dir("tasks")]) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    // Tighten the top folder even if it already existed.
    fs.chmodSync(this.home, 0o700);
    this.config = { ...DEFAULT_CONFIG, ...readJson(this.file("config.json"), {}) };
    const station = readJson(this.file("station.json"), null);
    this.station = station ? sanitizeStation(station) : starterStation();
    this.schedules = readJson(this.file("schedules.json"), []);
    this.saveStation(this.station);
    this.saveConfig(this.config);
  }

  dir(...parts) {
    return path.join(this.home, ...parts);
  }

  file(name) {
    return path.join(this.home, name);
  }

  saveConfig(config) {
    this.config = config;
    writeJson(this.file("config.json"), config);
  }

  saveStation(station) {
    this.station = station;
    writeJson(this.file("station.json"), station);
    for (const agent of station.agents) {
      fs.mkdirSync(this.agentDir(agent.id, "workspace"), { recursive: true, mode: 0o700 });
      fs.mkdirSync(this.agentDir(agent.id, "versions"), { recursive: true, mode: 0o700 });
    }
  }

  saveSchedules(schedules) {
    this.schedules = schedules;
    writeJson(this.file("schedules.json"), schedules);
  }

  agentDir(agentId, ...parts) {
    if (!/^[a-f0-9]{12}$/.test(agentId)) throw new Error("bad agent id");
    return this.dir("agents", agentId, ...parts);
  }

  readSpend() {
    return readJson(this.file("spend.json"), { days: {} });
  }

  writeSpend(spend) {
    writeJson(this.file("spend.json"), spend);
  }

  readMemory(agentId) {
    try {
      return fs.readFileSync(this.agentDir(agentId, "memory.md"), "utf8");
    } catch (err) {
      if (err.code === "ENOENT") return "";
      throw err;
    }
  }

  writeMemory(agentId, content) {
    fs.writeFileSync(this.agentDir(agentId, "memory.md"), content, { mode: 0o600 });
  }

  saveTask(task) {
    if (!/^[a-f0-9]{12}$/.test(task.id)) throw new Error("bad task id");
    writeJson(this.dir("tasks", `${task.id}.json`), task);
  }

  loadTask(taskId) {
    if (!/^[a-f0-9]{12}$/.test(taskId)) return null;
    return readJson(this.dir("tasks", `${taskId}.json`), null);
  }

  recentTasks(limit = 100) {
    const dir = this.dir("tasks");
    const files = fs.readdirSync(dir).filter((f) => /^[a-f0-9]{12}\.json$/.test(f));
    const withTime = files.map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }));
    withTime.sort((a, b) => b.t - a.t);
    return withTime.slice(0, limit).map(({ f }) => readJson(path.join(dir, f), null)).filter(Boolean);
  }

  audit(event, details = {}) {
    const line = JSON.stringify({ at: new Date().toISOString(), event, ...details });
    fs.appendFileSync(this.file("audit.log"), `${line}\n`, { mode: 0o600 });
  }

  readAudit(limit = 200) {
    let raw = "";
    try {
      const fd = fs.openSync(this.file("audit.log"), "r");
      const size = fs.fstatSync(fd).size;
      const len = Math.min(size, 256 * 1024);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      fs.closeSync(fd);
      raw = buf.toString("utf8");
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    const lines = raw.split("\n").filter(Boolean).slice(-limit);
    const out = [];
    for (const line of lines) {
      try { out.push(JSON.parse(line)); } catch { /* the first line of a tail read can be partial */ }
    }
    return out.reverse();
  }

  newId() {
    return newId();
  }
}
