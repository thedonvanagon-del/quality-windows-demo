// Keeps the games table current. The games page and the pick form refresh a
// sport's board when it's more than a minute or two old; a timer checks for
// finals on games with open picks.

import { SPORT, SPORTS } from './sports.js';
import { gradeFinished } from './picks.js';
import { addDays, etDay } from './time.js';

const BOARD_MAX_AGE = 2 * 60_000;
const PICK_MAX_AGE = 60_000;
// If ESPN can't be reached, a cached line is still good for a pick this long.
const PICK_FALLBACK_AGE = 10 * 60_000;
const GRADE_FETCH_LIMIT = 30;

export function createGames({ store, espn, now = () => new Date(), log = console }) {
  const fetchedAt = new Map(); // "nfl 20261019-20261025" -> ms
  const inFlight = new Map();
  const problems = new Map(); // sport -> last error message

  async function refresh(sport, from, to = from) {
    const key = `${sport.key} ${from}-${to}`;
    if (inFlight.has(key)) return inFlight.get(key);
    const job = (async () => {
      let games;
      try {
        games = await espn.scoreboard(sport, from, to);
      } catch (err) {
        problems.set(sport.key, err.message);
        log.warn(`refresh ${key}: ${err.message}`);
        return 0;
      } finally {
        inFlight.delete(key);
      }
      fetchedAt.set(key, now().getTime());
      problems.delete(sport.key);
      return save(games);
    })();
    inFlight.set(key, job);
    return job;
  }

  /** Store a batch of games from ESPN and grade whatever went final. Returns how many picks it graded. */
  function save(games) {
    const at = now().toISOString();
    store.tx(() => {
      for (const g of games) {
        const lines = JSON.stringify(g.lines);
        // Before kickoff, an empty board means the book pulled the line, and
        // a pulled line must not stay pickable.
        const replaceLines = g.state === 'pre' || Boolean(g.lines.spread || g.lines.total || g.lines.ml);
        store.run(
          `INSERT INTO games (id, sport, start_time, state, status, detail, completed,
                              home_name, home_short, home_abbr, home_score, home_logo,
                              away_name, away_short, away_abbr, away_score, away_logo, lines, updated_at,
                              tv, home_record, away_record, home_color, away_color)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             start_time = excluded.start_time, state = excluded.state, status = excluded.status,
             detail = excluded.detail, completed = excluded.completed,
             home_score = excluded.home_score, away_score = excluded.away_score,
             home_logo = COALESCE(excluded.home_logo, games.home_logo),
             away_logo = COALESCE(excluded.away_logo, games.away_logo),
             tv = COALESCE(excluded.tv, games.tv),
             home_record = COALESCE(excluded.home_record, games.home_record),
             away_record = COALESCE(excluded.away_record, games.away_record),
             home_color = COALESCE(excluded.home_color, games.home_color),
             away_color = COALESCE(excluded.away_color, games.away_color),
             -- ESPN drops the odds once a game starts; keep the last ones seen
             -- for display.
             lines = CASE WHEN ? THEN excluded.lines ELSE games.lines END,
             updated_at = excluded.updated_at`,
          g.id, g.sport, g.start, g.state, g.status, g.detail, g.completed ? 1 : 0,
          g.home.name, g.home.short, g.home.abbr, g.home.score, g.home.logo ?? null,
          g.away.name, g.away.short, g.away.abbr, g.away.score, g.away.logo ?? null, lines, at,
          g.tv ?? null, g.home.record ?? null, g.away.record ?? null, g.home.color ?? null, g.away.color ?? null, replaceLines ? 1 : 0,
        );
      }
    });
    return gradeFinished(store, now());
  }

  function boardRange(sport) {
    const today = etDay(now());
    return [today, addDays(today, sport.days - 1)];
  }

  async function freshBoard(sport) {
    const [from, to] = boardRange(sport);
    const age = now().getTime() - (fetchedAt.get(`${sport.key} ${from}-${to}`) ?? 0);
    if (age > BOARD_MAX_AGE) await refresh(sport, from, to);
  }

  return {
    save,

    /** Every game in progress right now, across all sports, scores at most two minutes old. */
    async live() {
      await Promise.all(SPORTS.map(freshBoard));
      return store.all(`SELECT * FROM games WHERE state = 'in' ORDER BY start_time, sport, home_name`).map(toGame);
    },
    /** Live scores as last stored, without asking ESPN: cheap enough for a ticker on every board. */
    liveNow(limit = 12) {
      return store.all(`SELECT * FROM games WHERE state = 'in' ORDER BY start_time, sport, home_name LIMIT ?`, limit).map(toGame);
    },
    problem: (sportKey) => problems.get(sportKey) ?? null,

    /** Games still to start in the sport's window, freshest lines first fetched if stale. */
    async upcoming(sportKey) {
      const sport = SPORT[sportKey];
      await freshBoard(sport);
      const until = new Date(now().getTime() + sport.days * 86_400_000).toISOString();
      return store
        .all(
          `SELECT * FROM games WHERE sport = ? AND state = 'pre' AND start_time > ? AND start_time <= ?
           ORDER BY start_time, home_name`,
          sport.key, now().toISOString(), until,
        )
        .map(toGame);
    },

    /**
     * One game, refreshed if its board is more than a minute old, so a pick
     * is checked against the latest line and status. Returns { game, stale }
     * where stale means ESPN couldn't be reached and the cached copy is too
     * old to take a pick on.
     */
    async current(gameId) {
      const row = store.get('SELECT * FROM games WHERE id = ?', gameId);
      if (!row) return { game: null };
      const sport = SPORT[row.sport];
      const [from, to] = boardRange(sport);
      const day = etDay(row.start_time);
      const key = day >= from && day <= to ? [from, to] : [day, day];
      const age = now().getTime() - (fetchedAt.get(`${sport.key} ${key[0]}-${key[1]}`) ?? 0);
      if (age > PICK_MAX_AGE) await refresh(sport, ...key);
      const game = toGame(store.get('SELECT * FROM games WHERE id = ?', gameId));
      const stale = now().getTime() - new Date(game.updatedAt).getTime() > PICK_FALLBACK_AGE;
      return { game, stale };
    },

    get(gameId) {
      const row = store.get('SELECT * FROM games WHERE id = ?', gameId);
      return row ? toGame(row) : null;
    },

    /** Look for finals on every started game that still has an open pick. */
    async checkFinals() {
      const due = store.all(
        `SELECT DISTINCT g.sport, g.start_time FROM picks p JOIN games g ON g.id = p.game_id
          WHERE p.result IS NULL AND g.start_time <= ? ORDER BY g.start_time`,
        now().toISOString(),
      );
      const days = new Map();
      for (const { sport, start_time: start } of due) days.set(`${sport} ${etDay(start)}`, [SPORT[sport], etDay(start)]);
      let graded = 0;
      for (const [sport, day] of [...days.values()].slice(0, GRADE_FETCH_LIMIT)) graded += await refresh(sport, day);
      return graded + gradeFinished(store, now());
    },

    sports: SPORTS,
  };
}

export function toGame(row) {
  return {
    id: row.id,
    sport: row.sport,
    start: row.start_time,
    state: row.state,
    status: row.status,
    detail: row.detail,
    completed: Boolean(row.completed),
    tv: row.tv ?? null,
    home: { name: row.home_name, short: row.home_short, abbr: row.home_abbr, score: row.home_score, logo: row.home_logo, record: row.home_record ?? null, color: row.home_color ?? null },
    away: { name: row.away_name, short: row.away_short, abbr: row.away_abbr, score: row.away_score, logo: row.away_logo, record: row.away_record ?? null, color: row.away_color ?? null },
    lines: JSON.parse(row.lines),
    updatedAt: row.updated_at,
  };
}
