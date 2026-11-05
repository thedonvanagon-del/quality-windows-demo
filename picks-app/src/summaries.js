// Injuries and recent form for game pages, from ESPN's game summary. A game
// page never waits on ESPN: it shows whatever is cached, and when nothing is
// (or it's older than 30 minutes) a fetch starts in the background so the
// next view has it. One request per game at a time, however busy the page.

import { summaryForGame } from './espn.js';
import { SPORT } from './sports.js';

const FRESH_FOR = 30 * 60_000;
// After a failure, show nothing and leave ESPN alone this long.
const RETRY_AFTER = 5 * 60_000;
const MAX_GAMES = 500;

export function createSummaries({ espn, now = () => new Date(), log = console, freshFor = FRESH_FOR, retryAfter = RETRY_AFTER, maxGames = MAX_GAMES }) {
  const cache = new Map(); // game id -> { at, until, data }
  const inFlight = new Map(); // game id -> promise

  function remember(id, entry) {
    cache.delete(id);
    cache.set(id, entry);
    // The oldest entries go first once there are too many.
    while (cache.size > maxGames) cache.delete(cache.keys().next().value);
  }

  /** Fetch one game's summary now. Resolves (never rejects) once the cache holds the answer. */
  function load(game) {
    if (inFlight.has(game.id)) return inFlight.get(game.id);
    const sport = SPORT[game.sport];
    const eventId = String(game.id).split(':')[1];
    const job = (async () => {
      try {
        if (!sport || !eventId || typeof espn?.summary !== 'function') throw new Error('no summary for this game');
        const data = summaryForGame(await espn.summary(sport, eventId), game);
        remember(game.id, { until: now().getTime() + freshFor, data });
      } catch (err) {
        log.warn(`summary ${game.id}: ${err.message}`);
        remember(game.id, { until: now().getTime() + retryAfter, data: null });
      } finally {
        inFlight.delete(game.id);
      }
    })();
    inFlight.set(game.id, job);
    return job;
  }

  return {
    load,

    /** Resolves once any fetch for this game that's under way has finished. */
    idle: (game) => inFlight.get(game.id) ?? Promise.resolve(),

    /**
     * What's cached for the game right now: { away, home } with injuries and
     * form, or null. Never waits; starts a background fetch when there's
     * nothing cached or it's gone stale. A failed fetch shows nothing.
     */
    peek(game) {
      const entry = cache.get(game.id);
      if (!entry || entry.until <= now().getTime()) load(game);
      return entry?.data ?? null;
    },
  };
}
