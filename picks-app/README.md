# Receipts

A pick'em app where every record is real. People sign up with an email and a
password, choose a screen name, and make picks on real games. Picks lock when
the game starts, get graded off the final score, and nobody can edit them
after the fact. Not even the person who made them.

It's built for two crowds at once:

- **Friends** who want to know who's actually been picking best. Everyone is on
  the big board and on each sport's board. You can also start a private group
  with an invite code.
- **Anyone selling picks.** A profile link shows a full record with every loss
  and a timestamp on every pick, so people can check it for themselves.

Run `npm run demo` to click around with fake games and players. No keys or
network needed. Log in as `demo@example.com` / `letmein123`.

## The rules that make a record worth something

- **Only real games.** The schedule, lines and final scores come from ESPN's
  public scoreboard, the same feed Bookie Bullies and cfb-bot use. No key, no
  monthly bill.
- **The line comes from the board.** A pick takes the spread, total or
  moneyline ESPN shows right then (DraftKings, usually). Nobody types in their
  own number. If the line moved since the player looked, they see the new one
  and confirm it.
- **Locked at the start.** No picks once a game starts, by the clock or by
  ESPN saying it's on. Before then a player can delete a pick. After that it's
  on the record for good.
- **One pick per market per game.** No taking both sides of a spread.
- **Hidden until the start.** Anyone's open picks stay hidden from everyone
  else until the game starts, so nobody can copy or fade them early. Profiles
  show how many are waiting.
- **One record per person.** Groups and sport boards read from the same picks,
  so nobody keeps a separate record per group.
- **Graded for you.** A timer checks ESPN every 10 minutes for finals on games
  with open picks. Postponed and canceled games are void. So is a game ESPN
  still shows unfinished three days later, but only on ESPN's word: if the app
  just couldn't reach ESPN, picks wait.

Boards rank by units won, not win rate, so a 6-4 record at long odds and a
6-4 record at short odds don't look the same. Stakes run from half a unit to
five.

## What's in the app

| Page | What it does |
|---|---|
| `/games` | Upcoming games by sport, with spread, total and moneyline. Tap a number to pick it. |
| `/picks` | Your open picks (deletable until the start) and your graded ones. |
| `/leaderboard` | Everyone, or one sport, over 7 days, 30 days or all time. Public. |
| `/groups` | Start a group (all sports or one), join with a code, see its board and its picks feed. |
| `/u/<name>` | A player's public record: overall, by sport, and every pick with when it was locked. |

It looks like a sportsbook: dark, with odds tiles, team logos from ESPN's
image server, and an app-style tab bar on phones. Players pick their accent
color (orange, teal or violet) on their profile.

Sports: NFL, college football, NBA, college basketball, MLB and NHL. Run lines
and puck lines only go up when ESPN posts a price for them.

## Running it

Node 22.13 or newer. No packages to install: it uses Node's built-in web server
and SQLite.

```
npm test        # ESPN parsing, grading math, and the whole app end to end
npm run demo    # fake games and players, on http://localhost:3000
npm start       # the real thing, against ESPN, with the database in data/receipts.db
```

| Setting | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Where it listens. |
| `DATABASE_PATH` | `data/receipts.db` | The SQLite file. This holds every account and every record. |
| `APP_NAME` | `Receipts` | The name in the header and the page titles. |
| `THEME` | `ember` | The accent color for visitors and new players: `ember` (orange), `teal` or `violet`. Each player can switch on their own profile. |
| `TRUST_PROXY` | off | Turn on behind a host's proxy (Fly, Render, Railway) so it reads the real visitor IP and knows the site is on https. |
| `DEMO` | off | Fake games and players. Never in production. |

## Putting it online

It needs a host that runs a Docker container and keeps a disk between deploys,
because the database is a file. Fly.io, Railway and Render (with a paid disk)
all work. On Fly:

```
fly launch --no-deploy                      # from this folder; it finds the Dockerfile
fly volumes create receipts_data --size 1
```

Add this to the `fly.toml` it wrote, then `fly deploy`:

```
[mounts]
  source = "receipts_data"
  destination = "/data"
```

Back up `/data/receipts.db`. Losing that file loses every account and every
record.

## Security

- Passwords are hashed with scrypt. Nothing stores them in plain text.
- Sessions are random tokens in an HttpOnly cookie. The database keeps only a
  hash of each one.
- Every form checks it came from this site, and signed-in forms carry a token.
- Login and signup are rate limited. A wrong email takes as long to reject as
  a wrong password.
- Everything a player types is escaped before it reaches a page, and a strict
  Content-Security-Policy blocks inline scripts.

## Not built yet

- **Password reset and email verification.** Both need the app to send email.
  The Buddha Beans Google Workspace could do it over SMTP.
- **Changing a screen name.** It stays fixed for now so shared profile links
  keep working.
- **Props, parlays, futures.** Sides, totals and moneylines only.
- **Admin tools.** Fixing a bad grade means editing the database by hand.

## Where things live

```
src/server.js     starts everything, checks for finals every 10 minutes
src/app.js        every page and form
src/espn.js       reads ESPN's scoreboard: games, lines, scores
src/games.js      keeps the games table fresh
src/picks.js      lock rules, line checks, grading, payouts
src/stats.js      records and leaderboards
src/groups.js     friend groups and invite codes
src/history.js    pick lists, with open picks hidden from other people
src/auth.js       passwords, sessions, rate limits
src/db.js         the schema; add migrations at the end, never edit a shipped one
src/demo.js       the fake ESPN and players behind npm run demo
src/views/        the pages
public/           styles and a little script that shows times in your own time zone
```
