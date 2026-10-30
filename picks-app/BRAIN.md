# Bookie Bullies app: the brain

The running record of what this app is, every decision made about it, what's
built, and what's next. **Read this first in any new session, and add to it
whenever something gets decided or built.** Newest decisions go at the top of
their section, with the date.

## What it is

A pick'em app where every record is real. People sign up, make picks on real
games, and build a track record nobody can fake: picks lock at the start,
take the line on the board, and grade off ESPN's final scores. Two uses:

- **Proof for people selling picks.** A profile link shows the whole record,
  losses included, with when every pick was locked.
- **A game for friends.** Overall and per-sport leaderboards, plus private
  groups with invite codes.

No real money changes hands in the app. Picks are sized in units (1u to 5u),
not dollars, and nothing is paid out.

## Decisions

### Name, brand, address
- **2026-10-26: The name is Bookie Bullies**, on the site we already own.
  It lives at **app.bookiebullies.com**. www.bookiebullies.com (the daily picks
  site, S3 + CloudFront, built from the `bookie-bullies` repo) stays as it is.
  Briefly considered "Strong Lean" the same day; "Receipts" was the working
  name before that.
- **2026-10-26:** www.bookiebullies.com gets a **Pick'em** tab and page
  (`pickem.html`) that sends people to the app:
  [thedonvanagon-del/bookie-bullies#3](https://github.com/thedonvanagon-del/bookie-bullies/pull/3).
  Merge it after the app is live. The main site's template hides its top tabs
  on phones (under 900px) and has no phone menu yet.
- **2026-10-26:** Uses the Bookie Bullies bull crest (`assets/logo.png` in the
  bookie-bullies repo) for the header, the browser tab and the phone icons.

### Look
- **2026-10-30: The Scoreboard look** (option 2 of five mockups at
  https://claude.ai/artifact/Anh377HozoaDPqYiL36388): navy, amber, tall condensed
  type (Barlow Condensed, served from the app), team colors down each game,
  a live-score strip on the board. Players can switch to **Bull Market** (black
  and green, option 4) or **Ember** (the first orange look). Teal and violet are
  retired; anyone on them gets the default.
- **2026-10-30:** Game cards show the TV channel when ESPN lists one, each
  team's record, a Fav tag, and logos (ESPN's standard logo address when the
  feed sends none).
- **2026-10-30:** Profiles open with a **record card**: record, units, a 30-day
  units line, win rate, ROI, last 10, rank, and **Share as image** (a picture
  made in the phone, for posting). ROI matters to the owner; it stays up front.
- **2026-10-30:** Tapping a line slides the pick slip up over the board. A
  locked pick gets a gold **LOCKED** stamp with the exact time.
- **2026-10-25:** Dark and clean, like BetMGM, with our own colors. Odds
  tiles show the line in white and the price in the accent color.
- **2026-10-25:** Orange ("ember") is the default because it's the easiest to
  read. Every player can switch to teal or violet on their profile; the choice
  is saved to their account.
- **2026-10-25:** Bottom tab bar on phones, like Novig: Games, My bets (with a
  badge counting open bets), Leaders, Groups, Profile, More (three dots).
- **2026-10-26:** The More tab holds everything that doesn't fit in the bar.
  New features get a row there. First one: **Live games**.

### Signing up
- **2026-10-27:** Signup asks for email, password, **"I'm 21 or older"** and
  **agree to the Terms and Privacy Policy** (both required checkboxes, with the
  time stored). Then a screen name, plus an **optional first and last name**
  (neither required). A name shows on the profile when given.
- **2026-10-27:** **No ID check**, since no money changes hands. No phone number.
- **2026-10-27:** People **confirm their email** by link. They can pick right
  away, but only show on leaderboards once confirmed; a banner reminds them.
- **2026-10-27:** Players can **delete their account** from their profile
  (needs the password). Apple requires this for App Store apps.
- **2026-10-27:** Terms of Use and Privacy Policy pages (`/terms`, `/privacy`)
  are plain-language first drafts. **Have a lawyer read them before launch.**
  They name hello@bookiebullies.com as the contact (setting: CONTACT_EMAIL).

### How picks work
- **2026-10-19:** Games, lines, scores and logos come from ESPN's free public
  scoreboard, the same feed Bookie Bullies and cfb-bot use. No paid odds API.
- **2026-10-19:** A pick takes the line on the board right then. Nobody types a
  number. If it moved since they looked, they confirm the new one.
- **2026-10-19:** Picks lock when the game starts. Deletable before, never after.
- **2026-10-19:** Other people's open picks stay hidden until the game starts.
- **2026-10-19:** One record per person. Sport boards and groups all read it.
- **2026-10-19:** Leaderboards rank by units won, not win rate.
- **2026-10-30:** **Units only, no dollars.** The slip has 1u to 5u buttons
  (any amount from 0.1u). Replaces the 2026-10-25 dollar wagers below: with
  dollars and a per-player unit size, a $1 unit plus a $1,000 bet counted as
  1,000 units and one lucky hit owned the leaderboard. A $1,000-a-day dollar cap
  was floated but wouldn't have fixed that. The unit-size setting is gone;
  old dollar amounts stay in the database, unused.
- **2026-10-30:** **No pick risks more than 5u or wins more than 5u.** On an
  underdog the cap is what wins 5u: at +150 the most is 3.33u, at +400 1.25u. So
  a long shot can't turn one hit into the leaderboard.
- **2026-10-30:** Boards show W-L but **rank by units won**. W-L alone rewards
  betting only heavy favorites: -400 favorites go 8-2 and still lose money.
  No daily cap for now; add one if someone games it with volume.
- **2026-10-30:** Home page leads with a gold check and **"Trust Your Bets"**.
  Our own mark, styled after Trustpilot's tiles, gold in every theme.
- **2026-10-25 (replaced 2026-10-30 by units only):** Players wager **dollars** on the pick slip ($10 to $250 chips or
  any amount). Each player sets what one unit is worth (starts at $100), and the
  record counts the wager in units, so a $10 bettor and a $1,000 bettor compete
  on skill. **Dollar amounts only ever show to the bettor.**
- **2026-10-26:** The profile link button goes **anywhere the player chooses**
  (Whop, Patreon, a paid Telegram, their own site). Any payment happens there,
  not in the app: Bookie Bullies is the proof, the capper handles the sale.
  Paid picks inside the app (with a cut for us) waits until cappers show
  traction through their links.
- **2026-10-26:** Profiles can carry **one outside link** (Telegram, Instagram,
  X, Discord, a website) as a button, for players who sell picks. A **Share
  profile** button uses the phone's share sheet. A shared profile link previews
  as "Name · 47-31 · +17.5u" with the crest.
- **2026-10-25:** Profiles have a short bio, up to 160 characters.

### Chat
- **2026-10-30: Game chat**, one public thread per game (`/games/:id`, hub at
  `/chat`, linked from every game card and More). Plain text, 280 characters,
  confirmed emails only, eight messages a minute. Picks show next to names once
  the game starts. People delete their own; three reports hide a message.
  No admin screen yet: hidden messages are looked at in the database.

### Hosting and money
- **2026-10-26:** Host on **AWS Lightsail** (we already use AWS), one small
  server in Ohio (us-east-2), about $5 a month plus about $1 for nightly
  snapshots. Fly.io and Railway were the other options.
- **2026-10-26:** Phones get the app by **installing it from the browser**
  (Add to Home Screen): own icon, full screen, no store approval. The real App
  Store and Google Play come later, wrapped with Capacitor, once players want
  push notifications. Apple's account is $99 a year; Google's is $25 once.
- **2026-10-26:** Password reset emails go out through the Google Workspace
  account (SMTP with an app password). Free.

## What's built

All of it is in `picks-app/`, merged to `main` on 2026-10-27 through
[thedonvanagon-del/quality-windows-demo#15](https://github.com/thedonvanagon-del/quality-windows-demo/pull/15).
**Beta launch started 2026-10-27.** Not live yet: waiting on the server setup below.

Launch log:
- **2026-10-28:** Server built with Terraform from CloudShell. Static IP
  **3.136.213.29** (Lightsail, Ohio, `bookie-bullies-app`). Its first-boot setup
  failed: Lightsail runs launch scripts with `sh`, which choked on `pipefail`.
  Fixed in `setup.sh.tftpl` for future servers; this one gets the setup run by hand.
- **2026-10-30:** GitHub settings (`APP_HOST`, `APP_SSH_KEY`) aren't in yet: the
  browser is signed in as **NFTrapper**, a second GitHub account, and only
  **thedonvanagon-del** (the repo owner) can see Settings. Until that login is
  sorted, deploys go straight from CloudShell (`picks-app/README.md`).
- **2026-10-30:** App running on the server (`/healthz` ok). No games showed:
  ESPN answered 400 to the week-at-once request (`dates=FROM-TO`, `limit=1000`).
  Now asks one day at a time with `limit=400`, the way cfb-bot does.

- Email and password signup with 21+ and Terms checkboxes, email confirmation,
  optional first and last name, screen name, login, logout, password reset by
  email, account deletion, Terms and Privacy pages
- Games board for NFL, college football, NBA, college basketball, MLB, NHL
  (spread, total, moneyline)
- Pick slip sized in units (1u to 5u) with live "to win"
- My bets: open (units, to win, countdown, delete) and settled (won or lost in units)
- Leaderboards: everyone or one sport, 7 days, 30 days or all time
- Groups: create, invite code and link, group board, members' picks feed
- Profiles: record, by sport, every pick with its lock time, bio,
  color, an outside link button, Share, and a record preview when shared
- More tab with Live games (scores now, your bets on them) and Game chat
- Scoreboard look with three color choices, TV channel and team records on
  cards, live-score strip, slide-up pick slip, LOCKED confirmation
- Profile record card with a units line, ROI, last 10, rank, Share as image
- Installable on phones (manifest, icons, iPhone full-screen)
- Automatic grading every 10 minutes, with voids for postponed games
- Demo mode: `npm run demo`, log in as demo@example.com / letmein123
- Server setup in `aws/stacks/bookie-bullies-app` and a deploy-on-merge
  workflow (`.github/workflows/picks-app-deploy.yml`)
- A clickable preview with demo data:
  https://claude.ai/artifact/R82nKcHMS3JFNrVoy1TYmL (private to the owner;
  built before the Bookie Bullies rename)

## Waiting on the owner

Beta launch checklist (2026-10-27). The app code is merged; these get it online.

1. ~~Merge the PR~~: done 2026-10-27.
2. **Run the one-time setup** in AWS CloudShell (`terraform apply` in
   `aws/stacks/bookie-bullies-app`; steps in `picks-app/README.md`, "Putting it
   online"). It prints the server's static IP.
3. **Point `app.bookiebullies.com` at that IP**: an A record named `app` wherever
   bookiebullies.com's DNS lives (Route 53, Namecheap, somewhere else?).
4. **Add two GitHub settings** on this repo: variable `APP_HOST` (the IP) and
   secret `APP_SSH_KEY` (the private deploy key from CloudShell). Then the
   "picks-app deploy" workflow ships the app, and every merge after that.
5. **Pick the sending email** (like hello@bookiebullies.com), make a Google app
   password for it, and put the SMTP lines in `/etc/bookie-bullies-app.env` on
   the server. Without it, signup still works but confirm and reset emails
   don't go out, so nobody shows on leaderboards.
6. **Merge the Pick'em tab** on www.bookiebullies.com
   ([bookie-bullies#3](https://github.com/thedonvanagon-del/bookie-bullies/pull/3)),
   after the app is live.
7. **A phone menu for www.bookiebullies.com?** Its tabs disappear under 900px.

## Ideas, not built yet

In rough order of value:

1. ~~Share cards~~ and ~~"hire me" link~~: built 2026-10-26 (text preview with
   the crest; a picture card with the record drawn on it would be the next step).
2. **Tournaments with coin buy-ins** (owner's idea, 2026-10-30). Players buy
   coins and spend them to enter contests (a $5 buy-in, say), best units over a
   weekend or a week wins. **Talk to a gaming lawyer before building.** Paying
   to enter a contest for a prize is a paid fantasy/sweepstakes question that
   changes state by state: some states ban paid contests, most need a license or
   registration, and coins that buy entries for cash prizes count as money.
   Free tournaments with bragging rights (or sponsor prizes) can ship anytime.
3. **Paid picks in the app.** Cappers set a monthly price, subscribers see their
   picks before games start, Bookie Bullies keeps 10 to 20% and Stripe Connect
   pays out the rest. Needs payouts, refunds and tax forms; Apple takes up to
   30% of digital subscriptions sold in an iPhone app; no "guaranteed win"
   claims allowed. Build once cappers are clearly selling through their links.
4. **The Bookie Bullies model as a player.** The site's own daily picks posted
   into the app under an official account, with a public record.
5. **cfb-bot as a player**, same idea, for college football and the NFL.
6. **Streaks and badges:** "8-2 last 10", "Hot in NBA", "Top 3 this week".
7. **Weekly winners in groups.**
8. **Notifications** when bets settle or games start (and the App Store push).
9. App Store and Google Play versions.
10. Trash talk in groups, following players.
11. Changing a screen name, props and parlays, admin tools.

## How to work on it

- `cd picks-app && npm test` runs every test. `npm run demo` runs it locally.
- Node 22, no npm packages: built-in http server, built-in SQLite.
- Database changes go at the end of `MIGRATIONS` in `src/db.js`; never edit
  one that has shipped.
- The README has the details: settings, file map, security notes.
