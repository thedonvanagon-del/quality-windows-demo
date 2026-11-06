// SQLite through Node's built-in driver: one file, no server, no packages.
// Each entry in MIGRATIONS runs once, in order; add new ones at the end and
// never edit one that has shipped.

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// A migration that rebuilds a table other tables point at starts with this
// line. It runs with foreign keys off (SQLite's own recipe for a rebuild; with
// them on, dropping the old table deletes every row that points at it) and
// is checked with foreign_key_check before it commits.
const KEYS_OFF = '-- runs with foreign keys off';

export const MIGRATIONS = [
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
  `
  ALTER TABLE games ADD COLUMN tv TEXT;
  ALTER TABLE games ADD COLUMN home_record TEXT;
  ALTER TABLE games ADD COLUMN away_record TEXT;
  ALTER TABLE games ADD COLUMN home_color TEXT;
  ALTER TABLE games ADD COLUMN away_color TEXT;
  `,
  `
  CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX chat_messages_game ON chat_messages(game_id, id);
  CREATE TABLE chat_reports (
    message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (message_id, user_id)
  );
  `,
  `
  CREATE TABLE follows (
    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (follower_id, followee_id)
  );
  CREATE INDEX follows_followee ON follows(followee_id);
  CREATE TABLE notifications (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_at TEXT
  );
  CREATE INDEX notifications_user ON notifications(user_id, id);
  CREATE TABLE push_subscriptions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  ALTER TABLE users ADD COLUMN notify_settled INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE users ADD COLUMN notify_follows INTEGER NOT NULL DEFAULT 1;
  `,
  `
  -- The official BookieBullies account (the site's model picks), first-time
  -- setup, and screen name changes.
  ALTER TABLE users ADD COLUMN official INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN fav_sports TEXT;
  ALTER TABLE users ADD COLUMN setup_done INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN name_changed_at TEXT;
  -- Everyone already playing skips first-time setup.
  UPDATE users SET setup_done = 1 WHERE screen_name IS NOT NULL;

  -- Old screen names point to the new one, and stay held, for 90 days.
  CREATE TABLE name_history (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    old_name TEXT NOT NULL COLLATE NOCASE,
    changed_at TEXT NOT NULL
  );
  CREATE INDEX name_history_name ON name_history(old_name, changed_at);

  -- Each row of the site's picks log that became an app pick, so nothing
  -- is imported twice. source_id is the row's date and id.
  CREATE TABLE official_picks (
    source_id TEXT PRIMARY KEY,
    pick_id INTEGER REFERENCES picks(id) ON DELETE SET NULL,
    is_lock INTEGER NOT NULL DEFAULT 0,
    conf INTEGER,
    imported_at TEXT NOT NULL
  );
  CREATE INDEX official_picks_pick ON official_picks(pick_id);
  `,
  `
  -- Parlays: 2 to 6 legs, each on a different game. The legs a player is
  -- still putting together live in a draft, one per game, with the price the
  -- board showed when they were added.
  CREATE TABLE parlay_draft_legs (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL REFERENCES games(id),
    market TEXT NOT NULL CHECK (market IN ('spread', 'total', 'ml')),
    side TEXT NOT NULL CHECK (side IN ('home', 'away', 'over', 'under')),
    line REAL,
    odds INTEGER NOT NULL,
    added_at TEXT NOT NULL,
    PRIMARY KEY (user_id, game_id)
  );

  -- A locked parlay is one bet on the record. odds is the combined American
  -- price at lock; first_start (the earliest leg's start) decides when it
  -- locks for good and when other people can see it. sport is set when every
  -- leg is in the same sport, so it counts on that sport's boards; null means
  -- mixed sports, which count overall only.
  CREATE TABLE parlays (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sport TEXT,
    units REAL NOT NULL,
    odds INTEGER NOT NULL,
    made_at TEXT NOT NULL,
    first_start TEXT NOT NULL,
    result TEXT CHECK (result IN ('win', 'loss', 'push', 'void')),
    profit REAL,
    graded_at TEXT
  );
  CREATE INDEX parlays_user ON parlays(user_id, first_start);
  CREATE INDEX parlays_board ON parlays(result, sport, first_start);

  CREATE TABLE parlay_legs (
    parlay_id INTEGER NOT NULL REFERENCES parlays(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL REFERENCES games(id),
    sport TEXT NOT NULL,
    market TEXT NOT NULL CHECK (market IN ('spread', 'total', 'ml')),
    side TEXT NOT NULL CHECK (side IN ('home', 'away', 'over', 'under')),
    line REAL,
    odds INTEGER NOT NULL,
    result TEXT CHECK (result IN ('win', 'loss', 'push', 'void')),
    PRIMARY KEY (parlay_id, game_id)
  );
  CREATE INDEX parlay_legs_game ON parlay_legs(game_id);
  `,
  `
  -- The free weekly contest (Monday to Sunday, Eastern). A week is closed
  -- once, and its top 3 written once, so the winners wall never changes.
  CREATE TABLE contest_weeks (
    week TEXT PRIMARY KEY,           -- the Monday it starts, "20261102"
    closed_at TEXT NOT NULL
  );
  CREATE TABLE contest_results (
    week TEXT NOT NULL REFERENCES contest_weeks(week),
    place INTEGER NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    units REAL NOT NULL,
    record TEXT NOT NULL,
    PRIMARY KEY (week, place)
  );
  CREATE INDEX contest_results_user ON contest_results(user_id);

  -- The streak game: one straight pick per player per Eastern day is their
  -- Streak pick. The day is the game's; deleting the pick deletes the flag.
  ALTER TABLE picks ADD COLUMN streak_day TEXT;
  CREATE UNIQUE INDEX picks_streak ON picks(user_id, streak_day) WHERE streak_day IS NOT NULL;

  -- Badges, worked out from the record and awarded once each. ref keeps a
  -- badge that can be won again apart (the week, for a weekly win); detail
  -- is what the chip says about it.
  CREATE TABLE badges (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    ref TEXT NOT NULL DEFAULT '',
    detail TEXT,
    earned_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key, ref)
  );

  -- Invite links: a code per player, and who brought each new player in.
  -- An invite counts once the new player confirms their email and has a name.
  ALTER TABLE users ADD COLUMN invite_code TEXT;
  ALTER TABLE users ADD COLUMN invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE users ADD COLUMN invite_counted_at TEXT;
  CREATE UNIQUE INDEX users_invite_code ON users(invite_code);
  CREATE INDEX users_invited_by ON users(invited_by);

  -- Reminders: "Lines are up" in the morning and the Streak reminder in the
  -- afternoon, each on by default and sent at most once a day.
  ALTER TABLE users ADD COLUMN notify_lines INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE users ADD COLUMN notify_streak INTEGER NOT NULL DEFAULT 1;
  CREATE TABLE reminders_sent (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    day TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    PRIMARY KEY (user_id, kind, day)
  );
  `,
  `
  -- Group chat. A chat message belongs to a game or to a group, never both,
  -- so chat_messages is rebuilt with game_id optional and a group_id that goes
  -- when the group does. chat_reports is rebuilt with it: dropping the old
  -- messages table with reports still pointing at it would cascade them away.
  CREATE TABLE chat_messages_v2 (
    id INTEGER PRIMARY KEY,
    game_id TEXT REFERENCES games(id),
    group_id INTEGER REFERENCES friend_groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    deleted_at TEXT,
    CHECK ((game_id IS NULL) <> (group_id IS NULL))
  );
  INSERT INTO chat_messages_v2 (id, game_id, user_id, body, created_at, deleted_at)
    SELECT id, game_id, user_id, body, created_at, deleted_at FROM chat_messages;
  CREATE TABLE chat_reports_v2 (
    message_id INTEGER NOT NULL REFERENCES chat_messages_v2(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (message_id, user_id)
  );
  INSERT INTO chat_reports_v2 (message_id, user_id, created_at) SELECT message_id, user_id, created_at FROM chat_reports;
  DROP TABLE chat_reports;
  DROP TABLE chat_messages;
  -- Renaming also points chat_reports' foreign key at the new name.
  ALTER TABLE chat_messages_v2 RENAME TO chat_messages;
  ALTER TABLE chat_reports_v2 RENAME TO chat_reports;
  CREATE INDEX chat_messages_game ON chat_messages(game_id, id);
  CREATE INDEX chat_messages_group ON chat_messages(group_id, id);
  -- When each member last opened their group's chat, for the unread counts.
  ALTER TABLE group_members ADD COLUMN chat_read_at TEXT;

  -- Closing lines. Until the game starts, closing_lines holds the latest
  -- pregame line seen for each market (a pulled market keeps its last
  -- number). When the game starts, closing_at is set and it never changes.
  ALTER TABLE games ADD COLUMN closing_lines TEXT;
  ALTER TABLE games ADD COLUMN closing_at TEXT;
  -- Closing line value on a straight pick, worked out once the close is
  -- known: points gained on a spread or total (positive is good for the
  -- bettor) and the no-vig win chance gained, in percentage points.
  ALTER TABLE picks ADD COLUMN clv_points REAL;
  ALTER TABLE picks ADD COLUMN clv_pct REAL;
  `,
  `
  -- Tournaments (2026-11-06). A tournament is a window of time, the sports
  -- it counts (sports: comma-separated keys, null for every sport) and a
  -- minimum number of graded bets to place. The weekly contest shows as one
  -- (kind 'weekly', everyone in, no entries); the timer makes the 'auto'
  -- ones; admins make 'custom' ones. Free only, enforced here: buy-ins wait
  -- on a lawyer (BRAIN.md), so entry_fee_cents can never be anything but 0.
  CREATE TABLE tournaments (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    sports TEXT,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    min_bets INTEGER NOT NULL CHECK (min_bets >= 1),
    prize TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL CHECK (kind IN ('weekly', 'auto', 'custom')),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    closed_at TEXT,
    canceled_at TEXT,
    entry_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (entry_fee_cents = 0),
    CHECK (ends_at > starts_at)
  );
  CREATE INDEX tournaments_window ON tournaments(ends_at, starts_at);
  -- Who joined, and when: only bets made after joined_at count.
  -- reminded_at marks the "starts in 1 hour" note, so it goes once.
  CREATE TABLE tournament_entries (
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TEXT NOT NULL,
    reminded_at TEXT,
    PRIMARY KEY (tournament_id, user_id)
  );
  CREATE INDEX tournament_entries_user ON tournament_entries(user_id);
  -- A closed tournament's top 3, written once. (The weekly one keeps using
  -- contest_results.)
  CREATE TABLE tournament_results (
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    place INTEGER NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    units REAL NOT NULL,
    record TEXT NOT NULL,
    PRIMARY KEY (tournament_id, place)
  );
  CREATE INDEX tournament_results_user ON tournament_results(user_id);
  -- "NFL Sunday starts in 1 hour", on by default.
  ALTER TABLE users ADD COLUMN notify_tournaments INTEGER NOT NULL DEFAULT 1;
  `,
  `${KEYS_OFF}
  -- Local rooms: a public group for a city, one room per city, that anyone
  -- signed in can join with one tap. Players start them from a fixed list of
  -- cities (src/cities.js); none exist until someone does. A room has no
  -- owner and no invite code, so friend_groups is rebuilt with both optional
  -- (private groups still need them). Foreign keys are off while this runs:
  -- dropping the old table with them on would take every member and chat
  -- message with it.
  CREATE TABLE friend_groups_v2 (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    sport TEXT,                      -- null counts every sport
    invite_code TEXT UNIQUE,
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'private' CHECK (kind IN ('private', 'local')),
    city_slug TEXT,                  -- a local room's city, from src/cities.js
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, -- who started a room: for the daily limit, no powers
    archived_at TEXT,                -- hidden, read-only, history kept
    CHECK (kind = 'local' OR (owner_id IS NOT NULL AND invite_code IS NOT NULL)),
    CHECK (kind = 'private' OR (owner_id IS NULL AND invite_code IS NULL AND city_slug IS NOT NULL))
  );
  -- SELECT * stops this with an error if friend_groups has a column this list doesn't know.
  INSERT INTO friend_groups_v2 (id, name, sport, invite_code, owner_id, created_at) SELECT * FROM friend_groups;
  DROP TABLE friend_groups;
  ALTER TABLE friend_groups_v2 RENAME TO friend_groups;
  CREATE INDEX friend_groups_owner ON friend_groups(owner_id);
  CREATE INDEX friend_groups_created_by ON friend_groups(created_by, created_at);
  -- One room per city, archived ones included.
  CREATE UNIQUE INDEX friend_groups_city ON friend_groups(city_slug) WHERE kind = 'local';

  -- A player's home city: a pick from the same list, never a location.
  -- Picking it joins (or starts) that city's room.
  ALTER TABLE users ADD COLUMN home_city TEXT;
  `,
  `
  -- Looks built from two colors: a team's ("Match my team") or the player's
  -- own ("Custom"). users.theme is 'custom' for both; theme_team is the team
  -- ("nfl:KC") when there is one. The accent is stored after the readability
  -- guard; every color is #rrggbb.
  ALTER TABLE users ADD COLUMN theme_team TEXT;
  ALTER TABLE users ADD COLUMN theme_mode TEXT CHECK (theme_mode IN ('dark', 'light'));
  ALTER TABLE users ADD COLUMN theme_accent TEXT;
  ALTER TABLE users ADD COLUMN theme_tint TEXT;
  -- ESPN's second team color, for teams whose first one doesn't read on the page.
  ALTER TABLE games ADD COLUMN home_alt_color TEXT;
  ALTER TABLE games ADD COLUMN away_alt_color TEXT;

  -- Profile photos: a file in MEDIA_DIR with a random name. Three reports
  -- hide one until an admin looks; an admin removing one blocks new uploads
  -- for a week.
  ALTER TABLE users ADD COLUMN photo TEXT;
  ALTER TABLE users ADD COLUMN photo_hidden INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN photo_blocked_until TEXT;
  CREATE UNIQUE INDEX users_photo ON users(photo);
  -- A report is on one photo, so a new photo starts clean.
  CREATE TABLE photo_reports (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    photo TEXT NOT NULL,
    reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, photo, reporter_id)
  );
  `,
  `
  -- How a name shows on the boards: a color and an icon, both keys from the
  -- lists in src/nametags.js (null is the default), never free text. An icon
  -- is an emoji's key ("bull") or a team's ("team:nfl:KC", "team:ncaa:333").
  ALTER TABLE users ADD COLUMN name_color TEXT;
  ALTER TABLE users ADD COLUMN name_icon TEXT;

  -- Every team logo a player can pick as their icon, from ESPN's team lists,
  -- refreshed once a day (src/teams.js). Kept here so a restart doesn't wait
  -- on ESPN. source is the list it came from; college football and
  -- basketball both give "team:ncaa:<ESPN id>" keys, one per school.
  CREATE TABLE team_catalog (
    source TEXT NOT NULL,
    key TEXT NOT NULL,
    name TEXT NOT NULL,
    abbr TEXT NOT NULL,
    logo TEXT NOT NULL,
    color TEXT,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (source, key)
  );
  `,
  `
  -- Cover photos: the banner across the top of a profile, a 1200×400 file in
  -- MEDIA_DIR with a random name, the same as photos. The same rules: three
  -- reports hide one, an admin removing one blocks new covers for a week.
  ALTER TABLE users ADD COLUMN cover TEXT;
  ALTER TABLE users ADD COLUMN cover_hidden INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN cover_blocked_until TEXT;
  CREATE UNIQUE INDEX users_cover ON users(cover);
  -- Reports on covers go in the same table; kind says which picture it was.
  ALTER TABLE photo_reports ADD COLUMN kind TEXT NOT NULL DEFAULT 'avatar' CHECK (kind IN ('avatar', 'cover'));
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
    const keysOff = sql.startsWith(KEYS_OFF);
    // The pragma does nothing inside a transaction, so it goes around it.
    if (keysOff) db.exec('PRAGMA foreign_keys = OFF');
    try {
      store.tx(() => {
        db.exec(sql);
        if (keysOff && store.all('PRAGMA foreign_key_check').length) throw new Error(`migration ${version + i + 1} broke a foreign key`);
        db.exec(`PRAGMA user_version = ${version + i + 1}`);
      });
    } finally {
      if (keysOff) db.exec('PRAGMA foreign_keys = ON');
    }
  });
  return store;
}
