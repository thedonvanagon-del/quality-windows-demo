// ESPN files games by Eastern date, so that's the calendar the app counts in.
const ET = 'America/New_York';

const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' });
const clock = new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'short', hour: 'numeric', minute: '2-digit' });
const dayName = new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'long', month: 'short', day: 'numeric' });
const stamp = new Intl.DateTimeFormat('en-US', { timeZone: ET, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const monthYear = new Intl.DateTimeFormat('en-US', { timeZone: ET, month: 'long', year: 'numeric' });

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

/** "20261019" for the Eastern date of `date`. */
export function etDay(date) {
  return ymd.format(new Date(date)).replaceAll('-', '');
}

/** The Eastern day `n` days after `day` ("20261019"). */
export function addDays(day, n) {
  const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8) + n, 12));
  return d.toISOString().slice(0, 10).replaceAll('-', '');
}

/** "Sun 1:00 PM ET" */
export function kickoff(iso) {
  return `${clock.format(new Date(iso))} ET`;
}

/** "Sunday, Oct 19" */
export function dayLabel(iso) {
  return dayName.format(new Date(iso));
}

/** "Oct 19, 9:14 AM ET" */
export function when(iso) {
  return `${stamp.format(new Date(iso))} ET`;
}

/** "October 2026" */
export function joined(iso) {
  return monthYear.format(new Date(iso));
}

/** The UTC instant for an Eastern wall-clock time on `day`. */
export function etToUtc(day, hour, minute = 0) {
  for (const offset of [4, 5]) {
    const guess = new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8), hour + offset, minute));
    if (etDay(guess) === day && +new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: 'numeric', hourCycle: 'h23' }).format(guess) === hour) {
      return guess;
    }
  }
  throw new Error(`no such Eastern time: ${day} ${hour}:${minute}`);
}

/** 0 for Sunday through 6 for Saturday, for an Eastern day ("20261019"). */
export function weekday(day) {
  return new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8))).getUTCDay();
}

/** The Monday (Eastern) of the week `date` falls in, as "20261102". */
export function mondayOf(date) {
  const day = etDay(date);
  return addDays(day, -((weekday(day) + 6) % 7));
}

/** The hour of the day in Eastern, 0 to 23. */
export function etHour(date) {
  return +new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: 'numeric', hourCycle: 'h23' }).format(new Date(date));
}

const shortDay = (day) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8))));

/** "Nov 2 – 8", or "Oct 26 – Nov 1": the Monday-to-Sunday week starting `monday`. */
export function weekLabel(monday) {
  const [from, to] = [shortDay(monday), shortDay(addDays(monday, 6))];
  return from.split(' ')[0] === to.split(' ')[0] ? `${from} – ${to.split(' ')[1]}` : `${from} – ${to}`;
}

/** "Mon, Nov 3": an Eastern day, short. */
export function dayShort(day) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
    .format(new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8))));
}

/** "Nov 3, 2026" */
export function dateLabel(iso) {
  return new Intl.DateTimeFormat('en-US', { timeZone: ET, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso));
}
