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

No real money changes hands in the app. Players log what they wager, but
dollars stay private and nothing is paid out.

## Decisions

### Name, brand, address
- **2026-10-26: The name is Bookie Bullies**, on the site we already own.
  It lives at **app.bookiebullies.com**. www.bookiebullies.com (the daily picks
  site, S3 + CloudFront, built from the `bookie-bullies` repo) stays as it is.
  Briefly considered "Strong Lean" the same day; "Receipts" was the working
  name before that.
- **2026-10-26:** Uses the Bookie Bullies bull crest (`assets/logo.png` in the
  bookie-bullies repo) for the header, the browser tab and the phone icons.

### Look
- **2026-10-25:** Dark and clean, like BetMGM, with our own colors. Odds
  tiles show the line in white and the price in the accent color.
- **2026-10-25:** Orange ("ember") is the default because it's the easiest to
  read. Every player can switch to teal or violet on their profile; the choice
  is saved to their account.
- **2026-10-25:** Bottom tab bar on phones, like Novig: Games, My bets (with a
  badge counting open bets), Leaders, Groups, Profile, More (three dots).
- **2026-10-26:** The More tab holds everything that doesn't fit in the bar.
  New features get a row there. First one: **Live games**.

### How picks work
- **2026-10-19:** Games, lines, scores and logos come from ESPN's free public
  scoreboard, the same feed Bookie Bullies and cfb-bot use. No paid odds API.
- **2026-10-19:** A pick takes the line on the board right then. Nobody types a
  number. If it moved since they looked, they confirm the new one.
- **2026-10-19:** Picks lock when the game starts. Deletable before, never after.
- **2026-10-19:** Other people's open picks stay hidden until the game starts.
- **2026-10-19:** One record per person. Sport boards and groups all read it.
- **2026-10-19:** Leaderboards rank by units won, not win rate.
- **2026-10-25:** Players wager **dollars** on the pick slip ($10 to $250 chips or
  any amount). Each player sets what one unit is worth (starts at $100), and the
  record counts the wager in units, so a $10 bettor and a $1,000 bettor compete
  on skill. **Dollar amounts only ever show to the bettor.**
- **2026-10-25:** Profiles have a short bio, up to 160 characters.

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

All of it is in `picks-app/` on PR
[thedonvanagon-del/quality-windows-demo#15](https://github.com/thedonvanagon-del/quality-windows-demo/pull/15),
not merged yet.

- Email and password signup, screen name, login, logout, password reset by email
- Games board for NFL, college football, NBA, college basketball, MLB, NHL
  (spread, total, moneyline)
- Pick slip with dollar wagers and live "to win"
- My bets: open (wager, to win, countdown, delete) and settled (won or lost in dollars)
- Leaderboards: everyone or one sport, 7 days, 30 days or all time
- Groups: create, invite code and link, group board, members' picks feed
- Profiles: record, by sport, every pick with its lock time, bio, unit size, color
- More tab with Live games (scores now, your bets on them)
- Installable on phones (manifest, icons, iPhone full-screen)
- Automatic grading every 10 minutes, with voids for postponed games
- Demo mode: `npm run demo`, log in as demo@example.com / letmein123
- Server setup in `aws/stacks/bookie-bullies-app` and a deploy-on-merge
  workflow (`.github/workflows/picks-app-deploy.yml`)
- A clickable preview with demo data:
  https://claude.ai/artifact/R82nKcHMS3JFNrVoy1TYmL (private to the owner;
  built before the Bookie Bullies rename)

## Waiting on the owner

1. **Merge the PR**, once happy with it.
2. **Where is bookiebullies.com's DNS?** (Route 53, Namecheap, somewhere else?)
   That's where the `app` record goes.
3. **Run the one-time setup** in AWS CloudShell: `picks-app/README.md`,
   "Putting it online". About 20 minutes.
4. **Pick the sending email** (like hello@bookiebullies.com) and make a Google
   app password for it, for reset emails.
5. **A "Play" button on www.bookiebullies.com** pointing to the app? That
   change goes in the bookie-bullies repo.

## Ideas, not built yet

In rough order of value:

1. **Share cards.** A shared profile link shows a card with the record and units.
2. **"Hire me" link** on profiles: website, Telegram, Instagram or Discord.
3. **The Bookie Bullies model as a player.** The site's own daily picks posted
   into the app under an official account, with a public record.
4. **cfb-bot as a player**, same idea, for college football and the NFL.
5. **Streaks and badges:** "8-2 last 10", "Hot in NBA", "Top 3 this week".
6. **Weekly winners in groups.**
7. **Notifications** when bets settle or games start (and the App Store push).
8. App Store and Google Play versions.
9. Trash talk in groups, following players.
10. Changing a screen name, props and parlays, admin tools.

## How to work on it

- `cd picks-app && npm test` runs every test. `npm run demo` runs it locally.
- Node 22, no npm packages: built-in http server, built-in SQLite.
- Database changes go at the end of `MIGRATIONS` in `src/db.js`; never edit
  one that has shipped.
- The README has the details: settings, file map, security notes.
