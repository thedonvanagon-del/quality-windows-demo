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
  `${KEYS_OFF}
  -- Tournament chat, player-made tournaments and "where you stand" alerts
  -- (2026-11-06).
  --
  -- A chat message now belongs to a game, a group or a tournament: exactly
  -- one. chat_messages is rebuilt with a third optional key under the CHECK,
  -- every row copied as it is. Foreign keys are off while this runs, so
  -- dropping the old table takes nothing with it: chat_reports keeps pointing
  -- at chat_messages by name, and the new table takes that name. A tournament
  -- with chat can't be deleted (no ON DELETE), so its chat is never lost;
  -- the app only ever cancels one, and a canceled one's chat stays read-only.
  CREATE TABLE chat_messages_v3 (
    id INTEGER PRIMARY KEY,
    game_id TEXT REFERENCES games(id),
    group_id INTEGER REFERENCES friend_groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    deleted_at TEXT,
    tournament_id INTEGER REFERENCES tournaments(id),
    CHECK ((game_id IS NOT NULL) + (group_id IS NOT NULL) + (tournament_id IS NOT NULL) = 1)
  );
  -- SELECT * stops this with an error if chat_messages has a column this list doesn't know.
  INSERT INTO chat_messages_v3 (id, game_id, group_id, user_id, body, created_at, deleted_at) SELECT * FROM chat_messages;
  DROP TABLE chat_messages;
  ALTER TABLE chat_messages_v3 RENAME TO chat_messages;
  CREATE INDEX chat_messages_game ON chat_messages(game_id, id);
  CREATE INDEX chat_messages_group ON chat_messages(group_id, id);
  CREATE INDEX chat_messages_tournament ON chat_messages(tournament_id, id);

  -- Player-made tournaments: a 'custom' tournament with a row here. Public
  -- ones are listed in the hub; private ones only open from /t/<invite_code>.
  -- group_id ties one to a group or local room: with members_only, only its
  -- members can join (and if the group is deleted, nobody new can). Three
  -- reports since reviewed_at hide it from the lists until an admin looks.
  CREATE TABLE player_tournaments (
    tournament_id INTEGER PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
    visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
    invite_code TEXT NOT NULL UNIQUE,
    group_id INTEGER REFERENCES friend_groups(id) ON DELETE SET NULL,
    members_only INTEGER NOT NULL DEFAULT 0,
    reviewed_at TEXT
  );
  CREATE INDEX player_tournaments_group ON player_tournaments(group_id);
  -- One report per player per tournament, ever.
  CREATE TABLE tournament_reports (
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (tournament_id, user_id)
  );

  -- "Where you stand" alerts, written on the entry like reminded_at, so a
  -- restart never sends one twice: the graded top-3 place last seen, when
  -- the last "You moved into 2nd" went, and when "2 hours left" went.
  ALTER TABLE tournament_entries ADD COLUMN alert_place INTEGER;
  ALTER TABLE tournament_entries ADD COLUMN moved_at TEXT;
  ALTER TABLE tournament_entries ADD COLUMN final_alert_at TEXT;
  -- The Tournament updates setting, on by default.
  ALTER TABLE users ADD COLUMN notify_tournament_updates INTEGER NOT NULL DEFAULT 1;
  `,
  `
  -- www.bookiebullies.com in the app (src/site.js). show_bb: the official
  -- account's picks on the board (BB Pick chips, the Locks card, the line on
  -- the LOCKED ticket), on unless the player turns it off. bb_card_hidden_day:
  -- the ET day ("20261106") the player closed the Locks card; it shows again
  -- the next day.
  ALTER TABLE users ADD COLUMN show_bb INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE users ADD COLUMN bb_card_hidden_day TEXT;
  `,
  `
  -- NFL formats (2026-11-06): Survivor, NFL Pick'em and the Bookie Bullies
  -- Cup. Free, like every tournament.
  --
  -- The NFL week of a game, from ESPN's scoreboard when it sends one
  -- (season.year, season.type: 2 is the regular season, week.number).
  -- src/nflweeks.js works it out from the date when these are empty.
  ALTER TABLE games ADD COLUMN season INTEGER;
  ALTER TABLE games ADD COLUMN season_type INTEGER;
  ALTER TABLE games ADD COLUMN week INTEGER;

  -- Survivor: one pool per NFL season, made on its own. Each week a player
  -- picks one team to win; a team can be used once a season. start_week is
  -- the week they joined for. out_week is set when a loss, a tie or a missed
  -- week ends their run; won_at when the pool closes with them on top.
  CREATE TABLE survivor_pools (
    id INTEGER PRIMARY KEY,
    season INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    closed_at TEXT,
    closed_week INTEGER,
    entry_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (entry_fee_cents = 0)
  );
  CREATE TABLE survivor_entries (
    pool_id INTEGER NOT NULL REFERENCES survivor_pools(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TEXT NOT NULL,
    start_week INTEGER NOT NULL,
    out_week INTEGER,
    out_reason TEXT CHECK (out_reason IN ('loss', 'tie', 'missed')),
    out_team TEXT,
    won_at TEXT,
    PRIMARY KEY (pool_id, user_id)
  );
  CREATE INDEX survivor_entries_user ON survivor_entries(user_id);
  -- One pick a week. team is the team's abbreviation; a team counts as used
  -- unless its pick was voided (a postponed or canceled game), and the
  -- partial index keeps it to once a season.
  CREATE TABLE survivor_picks (
    pool_id INTEGER NOT NULL REFERENCES survivor_pools(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week INTEGER NOT NULL,
    game_id TEXT NOT NULL REFERENCES games(id),
    side TEXT NOT NULL CHECK (side IN ('home', 'away')),
    team TEXT NOT NULL,
    made_at TEXT NOT NULL,
    result TEXT CHECK (result IN ('win', 'loss', 'tie', 'void')),
    graded_at TEXT,
    PRIMARY KEY (pool_id, user_id, week)
  );
  CREATE UNIQUE INDEX survivor_picks_team ON survivor_picks(pool_id, user_id, team) WHERE result IS NULL OR result != 'void';
  CREATE INDEX survivor_picks_game ON survivor_picks(game_id);
  -- A week is settled once (missed weeks knocked out, the pool closed if it's done).
  CREATE TABLE survivor_weeks (
    pool_id INTEGER NOT NULL REFERENCES survivor_pools(id) ON DELETE CASCADE,
    week INTEGER NOT NULL,
    settled_at TEXT NOT NULL,
    PRIMARY KEY (pool_id, week)
  );

  -- NFL Pick'em: every game of a week against the spread, at the line when
  -- the pick was saved. Its own picks, apart from bets: no units, no record.
  -- One Best Bet a week counts double.
  CREATE TABLE pickem_picks (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL REFERENCES games(id),
    season INTEGER NOT NULL,
    week INTEGER NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('home', 'away')),
    line REAL NOT NULL,
    best INTEGER NOT NULL DEFAULT 0,
    made_at TEXT NOT NULL,
    result TEXT CHECK (result IN ('win', 'loss', 'push', 'void')),
    points REAL,
    graded_at TEXT,
    PRIMARY KEY (user_id, game_id)
  );
  CREATE UNIQUE INDEX pickem_best ON pickem_picks(user_id, season, week) WHERE best = 1;
  CREATE INDEX pickem_week ON pickem_picks(season, week);
  CREATE INDEX pickem_game ON pickem_picks(game_id);
  -- A week closes once, and its top 3 are written once.
  CREATE TABLE pickem_weeks (
    season INTEGER NOT NULL,
    week INTEGER NOT NULL,
    closed_at TEXT NOT NULL,
    PRIMARY KEY (season, week)
  );
  CREATE TABLE pickem_results (
    season INTEGER NOT NULL,
    week INTEGER NOT NULL,
    place INTEGER NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points REAL NOT NULL,
    record TEXT NOT NULL,
    PRIMARY KEY (season, week, place)
  );
  CREATE INDEX pickem_results_user ON pickem_results(user_id);

  -- The Bookie Bullies Cup: points for every finish in every closed
  -- tournament (source + ref says which), summed per calendar year. Written
  -- once per player per event, so a backfill can run any number of times.
  CREATE TABLE cup_points (
    year INTEGER NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('tournament', 'weekly', 'survivor', 'pickem')),
    ref TEXT NOT NULL,
    label TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    place INTEGER NOT NULL,
    points INTEGER NOT NULL,
    awarded_at TEXT NOT NULL,
    PRIMARY KEY (source, ref, user_id)
  );
  CREATE INDEX cup_points_year ON cup_points(year, user_id);
  -- A year is closed once, after it ends; its top 3 are written once.
  CREATE TABLE cup_years (
    year INTEGER PRIMARY KEY,
    closed_at TEXT NOT NULL
  );
  CREATE TABLE cup_results (
    year INTEGER NOT NULL REFERENCES cup_years(year),
    place INTEGER NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    PRIMARY KEY (year, place)
  );
  CREATE INDEX cup_results_user ON cup_results(user_id);
  `,
  `${KEYS_OFF}
  -- Leagues, the March Madness bracket challenge and prize tournaments
  -- (2026-11-06). Free, like every tournament: each new table that could
  -- ever carry an entry fee refuses anything but 0.
  --
  -- The Cup counts league and bracket finishes too, so cup_points is rebuilt
  -- with two more sources under its CHECK, every row copied as it is.
  -- Nothing points at cup_points; foreign keys are off anyway, the rebuild
  -- recipe in openStore.
  CREATE TABLE cup_points_v2 (
    year INTEGER NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('tournament', 'weekly', 'survivor', 'pickem', 'league', 'bracket')),
    ref TEXT NOT NULL,
    label TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    place INTEGER NOT NULL,
    points INTEGER NOT NULL,
    awarded_at TEXT NOT NULL,
    PRIMARY KEY (source, ref, user_id)
  );
  -- SELECT * stops this with an error if cup_points has a column this list doesn't know.
  INSERT INTO cup_points_v2 (year, source, ref, label, user_id, place, points, awarded_at) SELECT * FROM cup_points;
  DROP TABLE cup_points;
  ALTER TABLE cup_points_v2 RENAME TO cup_points;
  CREATE INDEX cup_points_year ON cup_points(year, user_id);

  -- Head-to-head leagues: 4 to 16 players, a round-robin of weekly
  -- matchups (Monday to Sunday ET, units won on graded bets), then a
  -- single-elimination playoff. start_week is week 1's Monday ("20261109").
  -- Like player-made tournaments: public or private (invite_code), and
  -- optionally tied to a group or local room (members_only).
  CREATE TABLE leagues (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    sports TEXT,                     -- comma-separated keys, null for all
    start_week TEXT NOT NULL,
    regular_weeks INTEGER NOT NULL CHECK (regular_weeks BETWEEN 3 AND 10),
    playoff_size INTEGER NOT NULL CHECK (playoff_size IN (2, 4, 8)),
    visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
    invite_code TEXT NOT NULL UNIQUE,
    group_id INTEGER REFERENCES friend_groups(id) ON DELETE SET NULL,
    members_only INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    started_at TEXT,                 -- the schedule was made
    canceled_at TEXT,
    cancel_reason TEXT,
    closed_at TEXT,
    champion_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    entry_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (entry_fee_cents = 0)
  );
  CREATE INDEX leagues_open ON leagues(started_at, canceled_at, closed_at);
  CREATE INDEX leagues_created_by ON leagues(created_by);
  -- seed is set when the regular season ends, for the playoff qualifiers.
  CREATE TABLE league_members (
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TEXT NOT NULL,
    seed INTEGER,
    PRIMARY KEY (league_id, user_id)
  );
  CREATE INDEX league_members_user ON league_members(user_id);
  -- One matchup: a against b (b null is a bye). Regular-season weeks are
  -- written when the league starts; each playoff round when the round
  -- before it settles. Settled once: both scores, the result and the winner
  -- (null for a tie). told_at marks the "This week you play" note.
  CREATE TABLE league_matchups (
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    week INTEGER NOT NULL,
    slot INTEGER NOT NULL,
    playoff INTEGER NOT NULL DEFAULT 0,
    a_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    b_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    a_seed INTEGER,
    b_seed INTEGER,
    a_units REAL,
    b_units REAL,
    result TEXT CHECK (result IN ('a', 'b', 'tie', 'bye')),
    winner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    settled_at TEXT,
    told_at TEXT,
    PRIMARY KEY (league_id, week, slot)
  );

  -- The March Madness bracket challenge: one a year, free. regions are the
  -- four region names in Final Four order (the 1st plays the 2nd, the 3rd
  -- the 4th). opened_at is when an admin confirmed the field and players
  -- could start filling brackets; locks_at the first Round of 64 tip.
  CREATE TABLE bracket_challenges (
    year INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    regions TEXT NOT NULL,
    locks_at TEXT,
    source TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('espn', 'admin', 'demo')),
    opened_at TEXT,
    opened_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title_total INTEGER,
    closed_at TEXT,
    created_at TEXT NOT NULL,
    entry_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (entry_fee_cents = 0)
  );
  -- The 64 slots: a region and a seed. A First Four slot has two teams
  -- (name2...) until its game is played (ff_winner). Picks name the slot,
  -- never a team, so a First Four result changes nobody's bracket.
  CREATE TABLE bracket_slots (
    year INTEGER NOT NULL REFERENCES bracket_challenges(year) ON DELETE CASCADE,
    region INTEGER NOT NULL CHECK (region BETWEEN 0 AND 3),
    seed INTEGER NOT NULL CHECK (seed BETWEEN 1 AND 16),
    name TEXT NOT NULL,
    abbr TEXT,
    espn_id TEXT,
    logo TEXT,
    name2 TEXT,
    abbr2 TEXT,
    espn_id2 TEXT,
    logo2 TEXT,
    ff_winner INTEGER CHECK (ff_winner IN (1, 2)),
    PRIMARY KEY (year, region, seed)
  );
  -- A player's bracket: picks is JSON, game number (0 to 62) -> slot
  -- ("2-11"). tiebreak is their guess at the title game's total points.
  -- place and points are written once, when the challenge closes.
  CREATE TABLE bracket_entries (
    year INTEGER NOT NULL REFERENCES bracket_challenges(year) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    picks TEXT NOT NULL DEFAULT '{}',
    tiebreak INTEGER,
    created_at TEXT NOT NULL,
    saved_at TEXT NOT NULL,
    place INTEGER,
    points INTEGER,
    PRIMARY KEY (year, user_id)
  );
  CREATE INDEX bracket_entries_user ON bracket_entries(user_id);
  -- Each of the 63 games, once decided: the winning slot.
  CREATE TABLE bracket_results (
    year INTEGER NOT NULL REFERENCES bracket_challenges(year) ON DELETE CASCADE,
    game INTEGER NOT NULL CHECK (game BETWEEN 0 AND 62),
    winner TEXT NOT NULL,
    score TEXT,
    source TEXT NOT NULL CHECK (source IN ('espn', 'admin')),
    decided_at TEXT NOT NULL,
    PRIMARY KEY (year, game)
  );

  -- Prize tournaments: an admin-made custom tournament with a sponsor's
  -- prize. Still free (the tournament's entry_fee_cents CHECK stays). Nobody
  -- sees it until an admin records a lawyer's review and publishes it.
  CREATE TABLE prize_tournaments (
    tournament_id INTEGER PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
    prize TEXT NOT NULL,
    value_cents INTEGER NOT NULL CHECK (value_cents >= 0),
    sponsor TEXT NOT NULL,
    eligibility TEXT NOT NULL,
    delivery TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TEXT,
    published_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    published_at TEXT,
    sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    sent_at TEXT
  );
  -- "I've read the official rules", checked when joining a prize tournament.
  ALTER TABLE tournament_entries ADD COLUMN rules_accepted_at TEXT;
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
