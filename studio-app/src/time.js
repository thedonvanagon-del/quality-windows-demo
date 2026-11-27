// Dates in the studio's own time zone. Appointments are stored as UTC ISO
// strings; everything a person sees or picks is wall-clock time in `tz`.
// Date strings are "YYYY-MM-DD"; times of day are minutes after midnight.

const fmtCache = new Map();
function dtf(tz, opts) {
  const key = tz + JSON.stringify(opts);
  if (!fmtCache.has(key)) fmtCache.set(key, new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }));
  return fmtCache.get(key);
}

function zonedParts(date, tz) {
  const parts = {};
  for (const p of dtf(tz, { hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return parts;
}

/** The UTC instant for a wall-clock date + minutes-after-midnight in `tz` (DST-safe). */
export function zonedToUtc(dateStr, minutes, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0) + minutes * 60_000;
  const offsetAt = (ms) => {
    const p = zonedParts(new Date(ms), tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  };
  const first = offsetAt(guess);
  let t = guess - first;
  const second = offsetAt(t);
  if (second !== first) t = guess - second;
  return new Date(t);
}

/** "2026-11-06" for the wall-clock day `date` falls on in `tz`. */
export function localDate(date, tz) {
  const p = zonedParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function minutesOfDay(date, tz) {
  const p = zonedParts(date, tz);
  return p.hour * 60 + p.minute;
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Sunday. Calendar math only, so no time zone involved. */
export function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function isMonthStr(s) {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function addMonths(monthStr, n) {
  const [y, m] = monthStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`;
}

export function daysInMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function pad(n) {
  return String(n).padStart(2, '0');
}

// ---- display ----

export function formatTime(date, tz) {
  return dtf(tz, { hour: 'numeric', minute: '2-digit' }).format(date).replace(' AM', ' am').replace(' PM', ' pm');
}

export function formatMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${h < 12 ? 'am' : 'pm'}`;
}

export function formatDay(date, tz) {
  return dtf(tz, { weekday: 'long', month: 'long', day: 'numeric' }).format(date);
}

export function formatDayShort(date, tz) {
  return dtf(tz, { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

export function formatDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return dtf('UTC', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return dtf('UTC', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** "1 hr 15 min", "45 min" */
export function formatDuration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
