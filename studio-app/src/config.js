// Everything the server needs from its environment. Business details (name,
// hours, policies, address) are NOT here: the owner edits those in the app.

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 3100,
    host: env.HOST || '0.0.0.0',
    databasePath: env.DATABASE_PATH || 'data/studio.db',
    // The public address, for links in emails (https://book.example.com).
    appUrl: (env.APP_URL || '').replace(/\/+$/, '') || null,
    // Behind Caddy / a load balancer: trust X-Forwarded-* for https detection and client IP.
    trustProxy: truthy(env.TRUST_PROXY),
    timezone: env.TIMEZONE || 'America/Los_Angeles',
    // Who runs the studio: comma-separated emails. They get the owner view
    // after signing in with an emailed code (a password alone never proves it).
    adminEmails: String(env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
    // Fake clients and bookings so the app can be clicked through. Never in production.
    demo: truthy(env.DEMO),
    smtp: {
      host: env.SMTP_HOST || null,
      port: Number(env.SMTP_PORT) || 465,
      user: env.SMTP_USER || null,
      pass: env.SMTP_PASS || null,
      from: env.MAIL_FROM || (env.SMTP_USER ? `Studio <${env.SMTP_USER}>` : null),
    },
  };
}

function truthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}
