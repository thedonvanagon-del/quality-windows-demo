// The first is the default. Each player can switch on their profile.
export const THEMES = ['ember', 'teal', 'violet'];

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 3000,
    host: env.HOST || '0.0.0.0',
    databasePath: env.DATABASE_PATH || 'data/bookiebullies.db',
    appName: env.APP_NAME || 'Bookie Bullies',
    // The accent color for visitors and new players: ember, teal or violet.
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
