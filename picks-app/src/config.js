export const THEMES = ['teal', 'violet', 'ember'];

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 3000,
    host: env.HOST || '0.0.0.0',
    databasePath: env.DATABASE_PATH || 'data/receipts.db',
    appName: env.APP_NAME || 'Receipts',
    // The accent color: teal, violet or ember. See public/style.css.
    theme: THEMES.includes(env.THEME) ? env.THEME : THEMES[0],
    // Fake games and players, so the app can be clicked through with no
    // network. Never set this in production.
    demo: truthy(env.DEMO),
    // Behind a host's proxy (Fly, Render, Railway), trust X-Forwarded-* for
    // the client IP and for whether the request came in over https.
    trustProxy: truthy(env.TRUST_PROXY),
  };
}

function truthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}
