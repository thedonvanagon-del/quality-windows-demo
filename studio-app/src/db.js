// SQLite through Node's built-in driver: one file, no server, no packages.
// Each entry in MIGRATIONS runs once, in order; add new ones at the end and
// never edit one that has shipped.

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const MIGRATIONS = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin')),
    -- Set once the person has proved they own the address with an emailed code.
    email_verified INTEGER NOT NULL DEFAULT 0,
    email_reminders INTEGER NOT NULL DEFAULT 1,
    admin_notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  -- Every visitor gets one (user_id is NULL until they sign in); it carries the CSRF token.
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    csrf TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE login_codes (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL COLLATE NOCASE,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    used INTEGER NOT NULL DEFAULT 0,
    -- A new profile's name, phone and password hash wait here until the code is
    -- entered. No user row exists until then, so nobody can squat on an address.
    payload TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX login_codes_email ON login_codes(email, created_at);

  CREATE TABLE services (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    prep_note TEXT NOT NULL DEFAULT '',
    duration_min INTEGER NOT NULL CHECK (duration_min > 0),
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0
  );

  -- Extras clients can tack on. applies_to is a service category, or '' for every service.
  CREATE TABLE addons (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applies_to TEXT NOT NULL DEFAULT '',
    duration_min INTEGER NOT NULL CHECK (duration_min >= 0),
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0
  );

  -- Weekly open hours in studio local time. A day can have several blocks (a lunch break is two rows).
  CREATE TABLE hours (
    id INTEGER PRIMARY KEY,
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_min INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
    end_min INTEGER NOT NULL CHECK (end_min BETWEEN 1 AND 1440),
    CHECK (end_min > start_min)
  );

  -- Vacations, appointments elsewhere, a sick day: no bookings in these ranges (UTC ISO).
  CREATE TABLE time_off (
    id INTEGER PRIMARY KEY,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE appointments (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    service_id INTEGER NOT NULL REFERENCES services(id),
    -- Name, add-ons and price are copied here so later menu edits never rewrite history.
    service_name TEXT NOT NULL,
    addons TEXT NOT NULL DEFAULT '[]',        -- JSON: [{id, name, price_cents, duration_min}]
    starts_at TEXT NOT NULL,                  -- UTC ISO, e.g. 2026-11-10T18:00:00.000Z
    ends_at TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'completed', 'cancelled', 'no_show')),
    client_note TEXT NOT NULL DEFAULT '',
    admin_note TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT 'client' CHECK (created_by IN ('client', 'admin')),
    created_at TEXT NOT NULL,
    cancelled_at TEXT,
    cancelled_by TEXT,
    late_cancel INTEGER NOT NULL DEFAULT 0,
    reminder_sent_at TEXT
  );
  CREATE INDEX appointments_time ON appointments(starts_at);
  CREATE INDEX appointments_user ON appointments(user_id, starts_at);

  -- Health questionnaire + treatment consent, filled in once before a first visit.
  CREATE TABLE intake (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    answers TEXT NOT NULL,                    -- JSON
    signed_name TEXT NOT NULL,
    signed_at TEXT NOT NULL
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  `
  -- One short line under each service: who it suits ("Sensitive or dull skin").
  ALTER TABLE services ADD COLUMN best_for TEXT NOT NULL DEFAULT '';
  `,
];

export function openStore(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return {
    db,
    get: (sql, ...params) => db.prepare(sql).get(...clean(params)),
    all: (sql, ...params) => db.prepare(sql).all(...clean(params)),
    /** Returns { changes, id } (id = last inserted row). */
    run(sql, ...params) {
      const r = db.prepare(sql).run(...clean(params));
      return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
    },
    /** Runs fn inside one write transaction. No nesting. */
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
}

function migrate(db) {
  const done = db.prepare('PRAGMA user_version').get().user_version;
  for (let i = done; i < MIGRATIONS.length; i += 1) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

// node:sqlite takes numbers, strings, bigints and null: never booleans or undefined.
function clean(params) {
  return params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p));
}
