# Bookie Bullies app

Start with [BRAIN.md](BRAIN.md): every decision so far, what is built, and what is next.

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
- **Parlays, same rules.** 2 to 6 legs, each on a different game, each
  checked against the live line at lock. Same caps: no parlay risks more than
  5u or wins more than 5u. Deletable until the first leg starts, hidden from
  others until then, and one bet on the record. A pushed leg drops out.
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
| `/picks` | My bets: open bets with their units, to-win and a countdown (deletable until the start), and settled ones. A badge on the tab counts what is open. |
| `/parlay` | The parlay being built: legs added from the pick slip, combined odds, units, Lock parlay. |
| `/leaderboard` | Everyone, or one sport, over 7 days, 30 days or all time. Public. |
| `/groups` | Start a group (all sports or one), join with a code, see its board, its picks feed and its members-only chat. The list shows how many chat messages are new in each group. |
| `/local` | Local rooms: one public room per city, each with its own chat and board. Start one for your city from the list, or join one with a tap. |
| `/games/<id>` | One game: its lines (or score), the public split, injuries and each team's last five before the start, and the game chat. |
| `/u/<name>` | A player's public record: a banner (their cover photo, or a band in their colors), their photo, overall, by sport, how often they beat the closing line, and every pick with when it was locked (and its CLV once the game starts), and their city if they picked one. Signed-in players can report a photo or a cover. Your own has your settings: your photo, your cover photo (an Edit cover button on the banner goes to it), your city, a new screen name (once every 30 days; the old one redirects for 90), the app color, and your name on the boards: a color and an icon (saved with a POST to `/nametag`). |
| `/search` | Find players by the start of their screen name. |
| `/contest` | The free weekly contest: most units on bets whose games start Monday to Sunday (ET), 5 graded bets to place. Public. |
| `/winners` | The winners wall: every past week's top 3 and the most weekly wins, and a Tournaments tab with every finished tournament's. Public. |
| `/tournaments` | Free tournaments: live now, starting soon, finished. Join in one tap; only bets made after joining, on games inside the window and in its sports, count. Public. |
| `/tournaments/<slug>` | One tournament: rules, countdown, Join or Leave (before the start), standings, the final podium. |
| `/admin/tournaments` | For admins only: make a tournament, or cancel one before it starts. |
| `/streak` | The streak game: your current and best streak, today's Streak pick, the streak boards. |
| `/invite` | Your invite link (`/i/<code>`), who joined from it, and progress to the Recruiter badge. |
| `/notifications` | The inbox, and what to hear about: settled bets, players you follow, Lines are up (about 11 AM ET), the Streak reminder (about 5 PM ET), a tournament you joined starting in an hour. |
| `/setup` | Once, after a new player picks a screen name: favorite sports, players to follow, and their city. |
| `/admin/reports` | For admins only: reported chat messages, from games, groups and local rooms (restore or delete), and reported profile and cover photos (dismiss or remove). |
| `/admin/rooms` | Local rooms, for admins only: rename, archive or restore. |

Every week has a free contest (no entry, nothing paid out); results close
once the week's bets are graded, by Tuesday 6 AM ET at the latest, and the top
3 go on the winners wall. **Tournaments** are free too, and only free: the
database refuses any entry fee but 0. The weekly contest shows there as The
Weekly Open; NFL Sunday, College Saturday and Hoops Night are made about two
days ahead when their sports have games; admins can add their own. A
tournament closes once its counted bets are graded (30 hours after the end at
the latest), and its top 3 get Tournament champion and Tournament podium badges. One straight pick a day can be a **Streak pick**.
Badges (First win, Hot hand, Weekly winner and more) are worked out from the
record and show on profiles, with the most notable one on the boards.

The official **BookieBullies** account posts the site's model picks
(moneylines and spreads, MLB, NBA and college hoops) at the app's own line,
before each game, and is graded like anyone. It shows on the boards with an
Official tag but never takes a rank.

It looks like a sportsbook: dark, with odds tiles, team logos from ESPN's
image server, and an app-style tab bar on phones (Games, My bets, Tourneys, Leaders,
Groups, More; your profile is the avatar at the top right). Players pick their look on
their profile: eight presets (Scoreboard navy and amber, Bull Market black and
green, Ember orange, Ice, Royal, Crimson, Forest, and Light, a white one), their
team's colors ("Match my team"), or two colors of their own, on a dark or light
background. A color too dark or too light to read gets a shade lighter or
darker. Players can add a profile photo; it shows on boards, chat and feeds.
They can also put a cover photo across the top of their profile.
They can also pick how their name shows on the boards, standings and chat:
one of 12 name colors (each readable on every look) and an icon: an emoji,
one earned with a badge (👑 for a weekly win, 🏆 for a tournament, 🔥🔥 for a
10 streak, 💎 for 100 bets), or any NFL, NBA, MLB or NHL team's logo, or a
major college program's.

Sports: NFL, college football, NBA, college basketball, MLB and NHL. Run lines
and puck lines only go up when ESPN posts a price for them.

## Running it

Node 22.13 or newer. No packages to install: it uses Node's built-in web server
and SQLite.

```
npm test        # ESPN parsing, grading math, and the whole app end to end
npm run demo    # fake games and players, on http://localhost:3000
npm start       # the real thing, against ESPN, with the database in data/bookiebullies.db
```

| Setting | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Where it listens. |
| `DATABASE_PATH` | `data/bookiebullies.db` | The SQLite file. This holds every account and every record. |
| `APP_NAME` | `Bookie Bullies` | The name in the header and the page titles. |
| `THEME` | `scoreboard` | The look for visitors and new players: `scoreboard` (navy and amber), `market` (black and green), `ember` (orange), `ice`, `royal`, `crimson`, `forest` or `light`. Each player can switch on their own profile. |
| `MEDIA_DIR` | a `media` folder next to the database | Where profile and cover photos are kept (`data/media` by default, `/var/lib/bookie-bullies-app/media` on the server). Made if it isn't there. Keep it on the same disk as the database and in the same backups. |
| `TRUST_PROXY` | off | Turn on behind a host's proxy (Fly, Render, Railway) so it reads the real visitor IP and knows the site is on https. |
| `DEMO` | off | Fake games and players. Never in production. |
| `ADMIN_EMAILS` | none | Who can open `/admin/reports` (reported chat) and `/admin/tournaments`, comma-separated, any case. Each admin also has to have an account with that email, confirmed. |
| `OFFICIAL_PICKS_URL` | `https://www.bookiebullies.com/picks_log.jsonl` | The site's picks log, read every 15 minutes and posted as the official BookieBullies account. `off` turns it off. |

## Putting it online

It runs at **app.bookiebullies.com** on one small Amazon Lightsail server
(about $5 a month), next to the existing www.bookiebullies.com site, which
stays as it is. `aws/stacks/bookie-bullies-app` builds the server; the
`picks-app deploy` workflow ships the code on every merge to `main`.

One-time setup, from AWS CloudShell (the >_ icon in the AWS console, Ohio region):

1. **Make the deploy key.**
   ```
   ssh-keygen -t ed25519 -N "" -f bb-deploy
   cat bb-deploy.pub
   ```
2. **Build the server.** Clone this repo in CloudShell, then:
   ```
   cd aws/stacks/bookie-bullies-app
   cp terraform.tfvars.example terraform.tfvars   # paste bb-deploy.pub's contents in
   terraform init && terraform apply
   ```
   It prints the server's static IP. The first boot takes about five
   minutes to install Node and Caddy.
3. **Point the domain.** Wherever bookiebullies.com's DNS lives, add an A
   record: `app` → the static IP. (If it's Route 53, set `route53_zone_id` in
   step 2 and Terraform adds it.)
4. **Connect GitHub.** In this repo: Settings → Secrets and variables →
   Actions. Add the variable `APP_HOST` (the static IP) and the secret
   `APP_SSH_KEY` (the whole contents of `bb-deploy`, the private half).
5. **Deploy.** Actions → picks-app deploy → Run workflow. It runs the tests,
   copies the app over, restarts it, and checks that
   https://app.bookiebullies.com/healthz answers. Caddy gets the https
   certificate on the first visit.
6. **Turn on reset emails.** In Google Workspace, make an app password for
   the sending address (Google Account → Security → 2-Step Verification →
   App passwords). Then on the server (`ssh -i bb-deploy ubuntu@<ip>`):
   ```
   sudo nano /etc/bookie-bullies-app.env        # fill in the SMTP_ lines
   sudo systemctl restart bookie-bullies-app
   ```

**Deploying from CloudShell instead.** Without the GitHub settings in step 4,
ship the code straight from CloudShell, where the key and a clone already are:
```
cd ~/quality-windows-demo && git pull -q
tar czf - -C picks-app package.json src public | ssh -i ~/bb-deploy ubuntu@<ip> \
  'tar xzf - -C /opt/bookie-bullies-app && sudo systemctl restart bookie-bullies-app'
```

On the server: the code is in `/opt/bookie-bullies-app`, the database in
`/var/lib/bookie-bullies-app/bookiebullies.db`, settings in
`/etc/bookie-bullies-app.env`, and logs from
`sudo journalctl -u bookie-bullies-app`. Lightsail snapshots the whole server
every night; restoring one brings back every account and record as of then.

There's also a Dockerfile, for any host that runs containers and keeps a disk.

## Security

- Passwords are hashed with scrypt. Nothing stores them in plain text.
- Sessions are random tokens in an HttpOnly cookie. The database keeps only a
  hash of each one.
- Every form checks it came from this site, and signed-in forms carry a token.
- Login and signup are rate limited. A wrong email takes as long to reject as
  a wrong password.
- Everything a player types is escaped before it reaches a page, and a strict
  Content-Security-Policy blocks inline scripts and styles. Team and custom
  colors reach the page as a stylesheet, `/theme/t1-<d|l>-<accent>-<tint>.css`,
  whose name is checked letter for letter (hex colors only) and which holds
  nothing but those colors.
- Name colors and icons are stored as keys from fixed lists, never as text,
  and checked again whenever a name is drawn. Team logos come from ESPN's
  team lists and must be https on `a.espncdn.com`, the one outside image
  host the security policy allows; anything else is dropped.
- Profile photos (1 MB at most) and cover photos (2 MB): JPEG, PNG or WebP
  by their first bytes (not by name or type), with EXIF, GPS and other
  metadata stripped on the server even when the browser already did. Each
  is stored under a random name and served from `/media/<name>` with its own
  type and `nosniff`, only while someone has it; any other name is a 404.
  Three reports hide a photo or cover until an admin looks.

## Not built yet

- **Props, futures.** Sides, totals and moneylines (straight or in parlays) only.
- **More admin tools.** There's a page for reported chat; fixing a bad grade
  still means editing the database by hand.

## Where things live

```
src/server.js     starts everything, checks for finals every 10 minutes, imports official picks every 15,
                  closes the weekly contest and tournaments and sends reminders (checked every 5),
                  badges and new auto tournaments hourly, ESPN's team lists once a day
src/app.js        every page and form
src/espn.js       reads ESPN's scoreboard (games, lines, scores) and game summaries (injuries, last five)
src/games.js      keeps the games table fresh, and freezes each game's closing line when it starts
src/clv.js        closing line value: the close, CLV per pick, Beat the close
src/summaries.js  injuries and form for game pages: cached 30 minutes, fetched in the background
src/chat.js       game and group chat: posting, deleting, reports, unread counts
src/picks.js      lock rules, line checks, grading, payouts (parlays' too)
src/parlays.js    the parlay draft, locking a parlay, deleting one
src/stats.js      records and leaderboards
src/contest.js    the free weekly contest: standings and closing for any window, a week, the winners wall
src/tournaments.js free tournaments: auto and admin-made ones, joining, closing once, start reminders
src/streak.js     the streak game: Streak picks, current and best streaks, the streak boards
src/badges.js     badges: what earns each one, awarding once, the most notable for a board
src/nametags.js   name colors and icons: the lists, earned icons, checking and saving
src/teams.js      team logos for icons: ESPN's team lists once a day, stored, with the games table as a fallback
src/invites.js    invite links: codes, counting a friend once they're confirmed and named
src/reminders.js  the Lines are up and Streak reminders, once a day each
src/groups.js     friend groups and invite codes, and local rooms (their chat is in chat.js)
src/cities.js     the cities a local room can be for
src/official.js   the official BookieBullies account and its picks importer
src/names.js      screen name rules, changes and old-name redirects
src/history.js    pick lists, with open picks hidden from other people
src/auth.js       passwords, sessions, rate limits
src/db.js         the schema; add migrations at the end, never edit a shipped one
src/demo.js       the fake ESPN and players behind npm run demo
src/themes.js     looks: the presets, the readability guard, team and custom colors, the /theme stylesheet
src/photos.js     profile and cover photos: checks, metadata stripping, storage, reports, and form uploads (multipart)
src/views/        the pages (avatar.js: a player's photo, or their initial)
public/           styles and a little script that shows times in your own time zone
```
