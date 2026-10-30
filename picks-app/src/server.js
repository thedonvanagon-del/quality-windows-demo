import http from 'node:http';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openStore } from './db.js';
import { createDemoEspn, DEMO_LOGIN, seedDemo } from './demo.js';
import { createEspn } from './espn.js';
import { createGames } from './games.js';
import { createMailer } from './mail.js';
import { createNotifier } from './notify.js';
import { createPush } from './push.js';

const GRADE_EVERY = 10 * 60_000;

const config = loadConfig();
const store = openStore(config.databasePath);
const anchor = new Date();
const espn = config.demo ? createDemoEspn({ anchor }) : createEspn();
// Phone notifications sign as the contact address; demo mode never sends any.
const push = createPush({ store, subject: `mailto:${config.contactEmail}`, enabled: !config.demo });
const notifier = createNotifier({ store, push });
const games = createGames({ store, espn, onGraded: (ids) => notifier.settled(ids) });
if (config.demo && !store.get('SELECT 1 FROM users LIMIT 1')) await seedDemo({ store, games, espn });

const mailer = createMailer(config.smtp);
if (mailer.configured && !config.appUrl) {
  console.error('Set APP_URL (like https://app.bookiebullies.com) before turning on email.');
  process.exit(1);
}
const server = http.createServer(createApp({ store, games, config, mailer, notifier, push }));
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

function shutdown() {
  clearInterval(timer);
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
