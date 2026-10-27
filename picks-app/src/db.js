// SQLite through Node's built-in driver: one file, no server, no packages.
// Each entry in MIGRATIONS runs once, in order; add new ones at the end and
// never edit one that has shipped.

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    screen_name TEXT UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  -- Every game anyone has seen, refreshed from ESPN. Picks point here, and
  -- grading reads the final score from here.
  CREATE TABLE games (
    id TEXT PRIMARY KEY,             -- "nfl:401772712"
    sport TEXT NOT NULL,
    start_time TEXT NOT NULL,        -- ISO, UTC
    state TEXT NOT NULL,             -- pre | in | post
    status TEXT NOT NULL,            -- ESPN's status name
    detail TEXT NOT NULL,
    completed INTEGER NOT NULL,
    home_name TEXT NOT NULL, home_short TEXT NOT NULL, home_abbr TEXT NOT NULL, home_score INTEGER,
    away_name TEXT NOT NULL, away_short TEXT NOT NULL, away_abbr TEXT NOT NULL, away_score INTEGER,
    lines TEXT NOT NULL,             -- JSON, see espn.parseLines
    updated_at TEXT NOT NULL
  );
  CREATE INDEX games_board ON games(sport, state, start_time);

  -- A pick is written once, with the line and price it was made at, and
  -- never edited. Only the grade gets filled in later.
  CREATE TABLE picks (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL REFERENCES games(id),
    sport TEXT NOT NULL,
    market TEXT NOT NULL CHECK (market IN ('spread', 'total', 'ml')),
    side TEXT NOT NULL CHECK (side IN ('home', 'away', 'over', 'under')),
    line REAL,                       -- the picked side's number; null for moneyline
    odds INTEGER NOT NULL,           -- American
    units REAL NOT NULL,
    game_start TEXT NOT NULL,
    made_at TEXT NOT NULL,
    result TEXT CHECK (result IN ('win', 'loss', 'push', 'void')),
    profit REAL,                     -- units won or lost
    graded_at TEXT,
    UNIQUE (user_id, game_id, market)
  );
  CREATE INDEX picks_user ON picks(user_id, game_start);
  CREATE INDEX picks_board ON picks(result, sport, game_start);
  CREATE INDEX picks_game ON picks(game_id);

  CREATE TABLE friend_groups (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    sport TEXT,                      -- null counts every sport
    invite_code TEXT NOT NULL UNIQUE,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE group_members (
    group_id INTEGER NOT NULL REFERENCES friend_groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TEXT NOT NULL,
    PRIMARY KEY (group_id, user_id)
  );
  CREATE INDEX group_members_user ON group_members(user_id);
  `,
  `
  ALTER TABLE games ADD COLUMN home_logo TEXT;
  ALTER TABLE games ADD COLUMN away_logo TEXT;
  `,
  `
  ALTER TABLE users ADD COLUMN theme TEXT;
  `,
  `
  ALTER TABLE users ADD COLUMN bio TEXT;
  `,
  `
  -- What a player says they're wagering, in dollars, and what one unit is
  -- worth to them. Dollars stay private; boards count units.
  ALTER TABLE users ADD COLUMN unit_size REAL;
  ALTER TABLE picks ADD COLUMN wager REAL;
  `,
  `
  -- One-time links for a forgotten password. Only a hash of the token is
  -- kept, so a copy of the database can't be used to take over accounts.
  CREATE TABLE password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );
  CREATE INDEX password_resets_user ON password_resets(user_id);
  `,
  `
  -- One outside link on a profile: where a player sells picks or posts.
  ALTER TABLE users ADD COLUMN link_url TEXT;
  ALTER TABLE users ADD COLUMN link_label TEXT;
  `,
  `
  -- Signup requirements: 21 or older, the Terms, and a confirmed email
  -- before a record shows on leaderboards. A name is optional.
  ALTER TABLE users ADD COLUMN first_name TEXT;
  ALTER TABLE users ADD COLUMN last_name TEXT;
  ALTER TABLE users ADD COLUMN age_confirmed_at TEXT;
  ALTER TABLE users ADD COLUMN terms_accepted_at TEXT;
  ALTER TABLE users ADD COLUMN email_verified_at TEXT;
  CREATE TABLE email_verifications (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );
  CREATE INDEX email_verifications_user ON email_verifications(user_id);
  `,
];

export function openStore(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

  const statements = new Map();
  const prepared = (sql) => {
    let statement = statements.get(sql);
    if (!statement) statements.set(sql, (statement = db.prepare(sql)));
    return statement;
  };

  const store = {
    all: (sql, ...params) => prepared(sql).all(...params),
    get: (sql, ...params) => prepared(sql).get(...params),
    run: (sql, ...params) => prepared(sql).run(...params),
    exec: (sql) => db.exec(sql),
    tx(fn) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    close: () => db.close(),
  };

  const version = store.get('PRAGMA user_version').user_version;
  MIGRATIONS.slice(version).forEach((sql, i) => {
    store.tx(() => {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${version + i + 1}`);
    });
  });
  return store;
}
