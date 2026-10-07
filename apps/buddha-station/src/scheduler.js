// Recurring jobs. A job only runs while the station is open, and a job missed
// while the station was closed is skipped, not piled up for later.

import { newId } from "./layout.js";

export const KINDS = ["daily", "weekdays", "weekly", "every"];
const LATE_WINDOW_MS = 15 * 60 * 1000;

const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function sanitizeSchedules(input, agents) {
  const ids = new Set(agents.map((a) => a.id));
  const out = [];
  for (const s of Array.isArray(input) ? input.slice(0, 30) : []) {
    if (!ids.has(s?.agentId) || !KINDS.includes(s?.kind)) continue;
    const task = text(s.task, 4000);
    if (!task) continue;
    const item = {
      id: typeof s.id === "string" && /^[a-f0-9]{12}$/.test(s.id) ? s.id : newId(),
      agentId: s.agentId,
      task,
      kind: s.kind,
      enabled: s.enabled !== false,
      lastRunAt: typeof s.lastRunAt === "string" && !Number.isNaN(Date.parse(s.lastRunAt)) ? s.lastRunAt : null,
    };
    if (s.kind === "every") {
      const hours = Math.round(Number(s.everyHours));
      if (!(hours >= 1 && hours <= 168)) continue;
      item.everyHours = hours;
    } else {
      if (typeof s.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) continue;
      item.time = s.time;
      if (s.kind === "weekly") {
        const day = Number(s.day);
        if (!Number.isInteger(day) || day < 0 || day > 6) continue;
        item.day = day;
      }
    }
    out.push(item);
  }
  return out;
}

// The moment today this schedule is meant to fire, or null if not today.
function slotToday(schedule, now) {
  if (schedule.kind === "weekdays" && (now.getDay() === 0 || now.getDay() === 6)) return null;
  if (schedule.kind === "weekly" && now.getDay() !== schedule.day) return null;
  const [h, m] = schedule.time.split(":").map(Number);
  const slot = new Date(now);
  slot.setHours(h, m, 0, 0);
  return slot;
}

export function isDue(schedule, now = new Date()) {
  if (!schedule.enabled) return false;
  const last = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null;
  if (schedule.kind === "every") {
    return !last || now - last >= schedule.everyHours * 3600 * 1000;
  }
  const slot = slotToday(schedule, now);
  if (!slot) return false;
  const sinceSlot = now - slot;
  if (sinceSlot < 0 || sinceSlot > LATE_WINDOW_MS) return false;
  return !last || last < slot;
}

export class Scheduler {
  constructor({ store, runtime, now = () => new Date() }) {
    this.store = store;
    this.runtime = runtime;
    this.now = now;
    this.timer = null;
  }

  start() {
    this.timer = setInterval(() => this.tick(), 30 * 1000);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
  }

  tick() {
    const now = this.now();
    let changed = false;
    const schedules = this.store.schedules.map((s) => {
      if (!isDue(s, now)) return s;
      changed = true;
      try {
        this.runtime.startTask(s.agentId, s.task, { source: "schedule" });
        this.store.audit("schedule.fired", { schedule: s.id });
      } catch (err) {
        this.store.audit("schedule.skipped", { schedule: s.id, reason: String(err.message).slice(0, 200) });
      }
      return { ...s, lastRunAt: now.toISOString() };
    });
    if (changed) this.store.saveSchedules(schedules);
  }
}
