// The first is the default. Each player can switch on their profile.
// scoreboard: navy and amber. market: black and green. ember: the first look, orange.
export const THEMES = ['scoreboard', 'market', 'ember'];

export const OFFICIAL_PICKS_URL = 'https://www.bookiebullies.com/picks_log.jsonl';

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 3000,
    host: env.HOST || '0.0.0.0',
    databasePath: env.DATABASE_PATH || 'data/bookiebullies.db',
    appName: env.APP_NAME || 'Bookie Bullies',
    // The look for visitors and new players: scoreboard, market or ember.
    theme: THEMES.includes(env.THEME) ? env.THEME : THEMES[0],
    // Fake games and players, so the app can be clicked through with no
    // network. Never set this in production.
    demo: truthy(env.DEMO),
    // Behind a host's proxy (Fly, Render, Railway), trust X-Forwarded-* for
    // the client IP and for whether the request came in over https.
    trustProxy: truthy(env.TRUST_PROXY),
    // The public address, for links in emails. Required once email is on:
    // without it a reset link would be built from whatever host a request
    // claimed to be for.
    appUrl: (env.APP_URL || '').replace(/\/+$/, '') || null,
    // Where the Terms and Privacy pages tell people to write.
    contactEmail: env.CONTACT_EMAIL || 'hello@bookiebullies.com',
    // Who can open /admin/reports: comma-separated emails, any case. An admin
    // also has to have confirmed that email in the app.
    adminEmails: String(env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
    // The site's picks log, imported every 15 minutes as the official
    // BookieBullies account. "off" turns the import off.
    officialPicksUrl: env.OFFICIAL_PICKS_URL === 'off' ? null : env.OFFICIAL_PICKS_URL || OFFICIAL_PICKS_URL,
    // Outgoing email for password resets. For Google Workspace:
    // SMTP_HOST=smtp.gmail.com, SMTP_USER=you@yourdomain, SMTP_PASS=an app password.
    smtp: {
      host: env.SMTP_HOST || null,
      port: Number(env.SMTP_PORT) || 465,
      user: env.SMTP_USER || null,
      pass: env.SMTP_PASS || null,
      from: env.MAIL_FROM || (env.SMTP_USER ? `Bookie Bullies <${env.SMTP_USER}>` : null),
    },
  };
}

function truthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}
