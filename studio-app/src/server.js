import http from 'node:http';

import { createApp } from './app.js';
import { deleteExpired } from './auth.js';
import { loadConfig } from './config.js';
import { openStore } from './db.js';
import { seedDemo } from './demo.js';
import { createMailer } from './mail.js';
import { createNotifier } from './notify.js';
import { sendReminders } from './reminders.js';
import { seedIfEmpty } from './seed.js';
import { getSettings } from './settings.js';

const config = loadConfig();
const store = openStore(config.databasePath);
const mailer = createMailer(config.smtp);

if (mailer.configured && !config.appUrl) {
  console.error('Set APP_URL (like https://book.example.com) before turning on email.');
  process.exit(1);
}
if (!config.demo && !config.adminEmails.length) {
  console.warn('ADMIN_EMAILS is empty: nobody can open the owner pages yet. Set it to the owner\'s email.');
}

if (seedIfEmpty(store)) console.log('Started with the sample menu and hours. Edit them in the owner pages.');
if (config.demo) seedDemo({ store, tz: config.timezone });

const server = http.createServer(createApp({ store, config, mailer }));
server.listen(config.port, config.host, () => {
  console.log(`Studio booking is up on http://localhost:${config.port}`);
  if (config.demo) console.log(`Demo mode. Owner: sign in with ${config.adminEmails[0] ?? 'ADMIN_EMAILS'} (the code shows on screen).`);
});

// Reminders and housekeeping. Never allowed to take the server down.
const notifier = createNotifier({ mailer, config, getSettings: () => getSettings(store), tz: config.timezone });
const tick = async () => {
  try {
    const sent = await sendReminders({ store, notifier });
    if (sent) console.log(`sent ${sent} reminder${sent === 1 ? '' : 's'}`);
    deleteExpired(store);
  } catch (err) {
    console.error(`background job: ${err.message}`);
  }
};
setInterval(tick, 10 * 60_000).unref();
setTimeout(tick, 5_000).unref();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5_000).unref();
  });
}
