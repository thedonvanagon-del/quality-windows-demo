// Every sport reads from the same ESPN scoreboard feed Bookie Bullies uses.
// `days` is how far ahead the games page looks: a football week, a few days
// for everything else.
export const SPORTS = [
  { key: 'nfl', name: 'NFL', short: 'NFL', espnPath: 'football/nfl', days: 7, spread: 'Spread' },
  { key: 'ncaaf', name: 'College Football', short: 'CFB', espnPath: 'football/college-football', params: { groups: '80' }, days: 7, spread: 'Spread' },
  { key: 'nba', name: 'NBA', short: 'NBA', espnPath: 'basketball/nba', days: 3, spread: 'Spread' },
  { key: 'ncaab', name: 'College Basketball', short: 'CBB', espnPath: 'basketball/mens-college-basketball', params: { groups: '50' }, days: 3, spread: 'Spread' },
  // Run lines and puck lines rarely sit at -110, so they only go up when ESPN
  // carries a price for them.
  { key: 'mlb', name: 'MLB', short: 'MLB', espnPath: 'baseball/mlb', days: 3, spread: 'Run line', spreadNeedsPrice: true },
  { key: 'nhl', name: 'NHL', short: 'NHL', espnPath: 'hockey/nhl', days: 3, spread: 'Puck line', spreadNeedsPrice: true },
];

export const SPORT = Object.fromEntries(SPORTS.map((s) => [s.key, s]));
