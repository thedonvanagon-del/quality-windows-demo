import http from 'node:http';

import { createApp } from './app.js';
import { badgesAfterGrading, checkAllBadges } from './badges.js';
import { loadConfig } from './config.js';
import { closeDueWeeks } from './contest.js';
import { openStore } from './db.js';
import { createDemoEspn, DEMO_LOGIN, seedDemo } from './demo.js';
import { createEspn } from './espn.js';
import { createGames } from './games.js';
import { createMailer } from './mail.js';
import { createNotifier } from './notify.js';
import { createOfficialImporter } from './official.js';
import { createPush } from './push.js';
import { createReminders } from './reminders.js';
import { createSummaries } from './summaries.js';
import { createTeamCatalog } from './teams.js';
import { closeDueTournaments, ensureAutoTournaments, sendFinalHoursAlerts, sendMoveAlerts, sendStartReminders } from './tournaments.js';

const GRADE_EVERY = 10 * 60_000;
const IMPORT_EVERY = 15 * 60_000;
// The weekly contest, tournaments and the daily reminders check whether it's time this often.
const DAILY_EVERY = 5 * 60_000;
const BADGES_EVERY = 60 * 60_000;
// New auto tournaments (NFL Sunday, College Saturday, Hoops Night, the Weekly Open), about two days ahead.
const TOURNAMENTS_EVERY = 60 * 60_000;
// Team logos for scoreboard icons: checked hourly, fetched from ESPN once a day.
const TEAMS_EVERY = 60 * 60_000;

const config = loadConfig();
const store = openStore(config.databasePath);
const anchor = new Date();
const espn = config.demo ? createDemoEspn({ anchor }) : createEspn();
// Phone notifications sign as the contact address; demo mode never sends any.
const push = createPush({ store, subject: `mailto:${config.contactEmail}`, enabled: !config.demo });
const notifier = createNotifier({ store, push });
// After grading: tell the bettors, check them for new badges, and tell
// tournament entrants who moved into the top 3.
const games = createGames({
  store,
  espn,
  onGraded: (ids, parlayIds) => {
    notifier.settled(ids, new Date(), parlayIds);
    // A badge or alert problem must never get in the way of grading.
    try {
      badgesAfterGrading(store, { pickIds: ids, parlayIds, now: new Date(), notifier });
    } catch (err) {
      console.error(`badges after grading: ${err.message}`);
    }
    try {
      sendMoveAlerts(store, new Date(), notifier);
    } catch (err) {
      console.error(`tournament alerts after grading: ${err.message}`);
    }
  },
});
if (config.demo && !store.get('SELECT 1 FROM users LIMIT 1')) await seedDemo({ store, games, espn, mediaDir: config.mediaDir });

const mailer = createMailer(config.smtp);
if (mailer.configured && !config.appUrl) {
  console.error('Set APP_URL (like https://app.bookiebullies.com) before turning on email.');
  process.exit(1);
}
// Injuries and recent form for game pages, cached and fetched in the background.
const summaries = createSummaries({ espn });
// Team logos players can pick as their icon. The demo has no network, so it
// uses the teams on its own board.
const teams = createTeamCatalog({ store, fetch: config.demo ? null : globalThis.fetch });
const server = http.createServer(createApp({ store, games, config, mailer, notifier, push, summaries, teams }));
server.listen(config.port, config.host, () => {
  console.log(`${config.appName} is up on http://localhost:${config.port}`);
  if (config.demo) console.log(`Demo mode. Log in as ${DEMO_LOGIN.email} / ${DEMO_LOGIN.password}`);
});

// Look for finals on games with open picks.
async function checkFinals() {
  try {
    const graded = await games.checkFinals();
    if (graded) console.log(`graded ${graded} picks`);
  } catch (err) {
    console.error('checking finals:', err);
  }
}
const timer = setInterval(checkFinals, GRADE_EVERY);
checkFinals();

// Post the site's model picks as the official BookieBullies account. The demo
// seeds its own, with no network.
const importer = config.officialPicksUrl && !config.demo
  ? createOfficialImporter({ store, games, url: config.officialPicksUrl, notifier })
  : null;
async function importOfficial() {
  try {
    const { imported } = await importer.run();
    if (imported) console.log(`imported ${imported} official picks`);
  } catch (err) {
    console.error('importing official picks:', err);
  }
}
const importTimer = importer ? setInterval(importOfficial, IMPORT_EVERY) : null;
if (importer) importOfficial();

// Close last week's contest once it's all graded (Tuesday 6 AM ET at the
// latest), close finished tournaments, send "starts in 1 hour" notes and the
// "where you stand" alerts, and the morning and afternoon reminders. Each only acts when it's time, and never twice.
const reminders = createReminders({ store, games, notifier });
async function daily() {
  try {
    for (const { week, podium } of closeDueWeeks(store, new Date(), notifier)) {
      console.log(`closed the contest for the week of ${week}: ${podium.map((r) => r.screen_name).join(', ') || 'nobody placed'}`);
    }
    for (const { slug, podium } of closeDueTournaments(store, new Date(), notifier)) {
      console.log(`closed tournament ${slug}: ${podium.map((r) => r.screen_name).join(', ') || 'nobody placed'}`);
    }
    const starting = sendStartReminders(store, new Date(), notifier);
    if (starting) console.log(`sent ${starting} tournament start reminders`);
    // "Where you stand": top-3 moves (also sent right after grading) and "2 hours left".
    const moved = sendMoveAlerts(store, new Date(), notifier);
    const final = sendFinalHoursAlerts(store, new Date(), notifier);
    if (moved || final) console.log(`sent ${moved} tournament move and ${final} two-hours-left alerts`);
    const sent = await reminders.run();
    if (sent.lines || sent.streak) console.log(`sent ${sent.lines} lines-up and ${sent.streak} streak reminders`);
  } catch (err) {
    console.error('daily jobs:', err);
  }
}
const dailyTimer = setInterval(daily, DAILY_EVERY);

// Make the auto tournaments a couple of days ahead, once each.
async function tournaments() {
  try {
    const made = await ensureAutoTournaments(store, new Date(), { games });
    if (made.length) console.log(`made tournaments: ${made.join(', ')}`);
  } catch (err) {
    console.error('tournaments:', err);
  }
}
const tournamentsTimer = setInterval(tournaments, TOURNAMENTS_EVERY);
tournaments().then(daily);

// Badges are checked after every grading; this catches anything else, once an hour.
function badges() {
  try {
    const awarded = checkAllBadges(store, new Date(), notifier);
    if (awarded.length) console.log(`awarded ${awarded.length} badges`);
  } catch (err) {
    console.error('badges:', err);
  }
}
const badgesTimer = setInterval(badges, BADGES_EVERY);
badges();

// ESPN's team lists, once a day, in the background. Pages never wait on it.
const teamsTimer = setInterval(() => teams.refreshIfDue(), TEAMS_EVERY);
teams.refreshIfDue();

function shutdown() {
  clearInterval(timer);
  clearInterval(importTimer);
  clearInterval(dailyTimer);
  clearInterval(badgesTimer);
  clearInterval(tournamentsTimer);
  clearInterval(teamsTimer);
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
