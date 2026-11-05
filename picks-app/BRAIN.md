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
  a live-score strip on the board (taken out 2026-11-02: it didn't work well
  live; scores stay on More → Live games). Players can switch to **Bull Market** (black
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
- **2026-11-04:** After a pick, the board comes back at the game you picked,
  not the top, with the LOCKED stamp right above that game (owner's ask).
- **2026-11-05: Picks never look stuck.** Tapping a line opens the slip at
  once ("Loading the line…") from the cached line; the pick itself is still
  checked against the live line. A pick re-fetches only that game's day from
  ESPN (it used to reload the sport's whole 3-day board, seconds on a big
  college slate). "Lock it in" turns to "Locking it in…" and can't double-send.
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
- **2026-11-05: First-time setup** (`/setup`), once, right after the screen
  name: pick your sports and follow a few players (the official BookieBullies
  account comes checked, plus the top five on the all-time board). Skip still
  follows the official account. The games page opens on your first sport.
  Players who were already here never see it.
- **2026-11-05: Screen names can change**, once every 30 days, from your
  profile. The old name sends people to the new one for 90 days (a 302, since
  browsers keep a 301 forever), and nobody else can take it in that time.
  Look-alikes of BookieBullies (B00kie_Bu11ies and the like) are reserved.
  Replaces "stays fixed so shared links keep working".
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
- **2026-11-05: Parlays** (owner approved). 2 to 6 legs, each on a **different
  game** (no same-game parlays: those legs move together). A leg is any
  spread, total or moneyline on the board, before that game starts.
  - **Same cap as a straight pick:** never risks more than 5u, never wins more
    than 5u. The legs' decimal odds multiply; the price shows in American
    (3 legs at -110 is +596, so 0.83u is the most). The cap is worked from the
    exact price, so rounding the American number can never let one win 5.01u.
    0.1u minimum; a parlay so long that 0.1u would win over 5u can't be played.
  - **Building one:** the pick slip (sheet and full page) has **Add to parlay**
    next to Lock it in. Legs are kept on the server as a draft per player
    (`parlay_draft_legs`), so it works without JavaScript and across devices.
    A leg on a game already in the draft **replaces** that game's leg, with a
    note. A slim bar over the tab bar ("Parlay · 3 legs · +596 · Review")
    opens `/parlay`: each leg with Remove, combined odds, units with buttons
    (quarters and halves when the max is under 1u, then Max), to win, and
    **Lock parlay**. On the board, a leg in the draft gets a dashed outline.
  - **Locking:** every leg is checked against the live line, the same way as
    a straight pick (paused if ESPN can't be reached). If a line moved, the
    page comes back with the new prices: "Lines moved. Still want it?" A leg
    whose game started drops out with a note, and the player confirms the
    shorter parlay too (its price changed), rather than it locking on its
    own. Under 2 legs left, nothing locks. On success the draft clears and the
    gold LOCKED ticket shows legs, odds, units and to win.
  - **Grading** runs with the straight picks (`gradeFinished`), using the same
    leg grading. A losing leg loses the parlay at once. A pushed (or voided)
    leg drops out and the price is worked again from the rest; every leg
    pushing is a push. Profit can't top 5u (asserted). Settled parlays get
    the same "your bet settled" notification.
  - **Deleting:** until the **first** leg starts. After that it's on the record.
  - **Hidden** from everyone else until the first leg starts, like picks
    (the official account's would be public at once, same as its picks).
  - **Records:** a parlay is **one bet** in W-L-P, units, ROI, last 10, hot
    streaks, every leaderboard, group boards and the 5-pick minimum for a rank.
    It stays out of the profile breakdown (by bet type, fav/dog, home/road)
    and the public split. On a sport's board (and in By sport, and in a
    one-sport group) it counts only when every leg is in that sport; a mixed
    parlay counts overall only. Its date for 7/30-day windows is its first
    leg's start. Profiles, My bets, Following and group feeds list it with a
    PARLAY tag and each leg's result (✓, ✗, push).
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

### Following, streaks, splits, notifications
- **2026-11-05: Player search** (`/search`, a box on the leaderboard, "Find
  players" in More). Matches the start of a screen name, any case, up to 20,
  with record and units. Unconfirmed emails stay out, same as the boards.
- **2026-10-30: Follow players.** Follow anyone from their profile; **Following**
  (in More) shows their picks once each game starts. Profiles show follower counts.
- **2026-10-30: Hot streaks** (`/hot`): the best last ten over 30 days by units
  (ten graded picks needed), with the current run (W5, L2) and Follow buttons.
- **2026-10-30: Public split.** Game pages show what share of players took each
  side, once a market has 5 picks (so it never points at one person's open
  pick). Cards show the spread lean ("64% on KC").
- **2026-10-30: Breakdown** on profiles: spreads, totals, moneylines; favorites
  vs underdogs; home vs road.
- **2026-10-30: Notifications.** A bell with a count, an inbox, and phone
  notifications (Web Push, built in, no outside service, checked against the
  spec's own example). Players hear when bets settle and when someone they
  follow locks a pick (not the side; that waits for the start; at most one per
  player per half hour). Both can be turned off. iPhones get them once the app
  is on the Home Screen (iOS 16.4+). The App Store version isn't needed for this.

### Getting the app
- **2026-10-31: Get the app**, as easy as possible on both phones. A button at
  the top and a one-time bar on phones (Not now hides it for good) lead to
  `/install`. Chrome and Edge (Android, computers) get the real Install prompt
  in one tap. iPhone gets the three Safari taps, or the Chrome steps when in
  Chrome. In Instagram, TikTok, Facebook and other apps' built-in browsers
  (which can't install) it says to open in Safari or Chrome, with Copy link.
  Everything hides once the app is installed.
- **2026-10-31:** On iPhone Safari, Get the app opens a pop-up with the three
  steps (real Share and Add to Home Screen icons) and an arrow bouncing toward
  Safari's bar. Apple lets no website add itself to the Home Screen; a real
  App Store app ($99/year) is the only way to one tap, for later.
- **2026-10-31:** www.bookiebullies.com's 3-hourly refresh was found switched off
  by hand since 2026-07-27. The owner wants the site running all the time, so
  it was turned back on (`refresh-site.yml`, bookie-bullies#4). The first run
  deployed fine, Pick'em tab included. The main site still hides its tabs on
  phones; a Get the app button there is offered, not built.

### Chat
- **2026-11-05: Admin page for reported chat** (`/admin/reports`, an Admin row
  in More). Lists every reported message with its author, game, report count
  and time. Restore puts it back and clears its reports; Delete takes it down.
  Admins are the emails in `ADMIN_EMAILS`, and only once that email is
  confirmed in the app. Everyone else gets a 404.
- **2026-10-30: Game chat**, one public thread per game (`/games/:id`, hub at
  `/chat`, linked from every game card and More). Plain text, 280 characters,
  confirmed emails only, eight messages a minute. Picks show next to names once
  the game starts. People delete their own; three reports hide a message.
  (Admin screen added 2026-11-05, above.)

### The official account
- **2026-11-05: The site's model picks post in the app** as **BookieBullies**,
  with an **Official** tag wherever it shows and a gold **LOCK** tag on the
  site's locks. Every 15 minutes the app reads
  www.bookiebullies.com/picks_log.jsonl (setting: `OFFICIAL_PICKS_URL`) and
  makes each new pick the normal way: today's and tomorrow's moneylines and
  spreads/run lines (MLB, NBA, college hoops) at 3+ confidence and 0.1u+, at
  the app's line right then, sized at the site's units up to the 5u caps, and
  only before the game starts. Totals and first-five bets don't come over
  (the log doesn't say over or under). Each log row is imported once. The
  account is listed on the boards but **never takes a rank**, so it can't be #1.
  It has no password and can't log in.
- **2026-11-05: Official picks are public before the game.** Everyone else's
  open picks stay hidden until the start; the official account's show on its
  profile and in follow/group feeds right away, since they're the site's
  published picks. Its follow alert reads "posted a pick ... Tap to see it."
- **2026-11-02: College hoops picks on www.bookiebullies.com first**, app
  later (owner's call). A separate engine (`cbb_picks.py` in the
  bookie-bullies repo) so the MLB/NBA code isn't touched. It blends ESPN's
  matchup predictor 50/50 with the betting line. Spread pick when they disagree
  by 2.5+ points, moneyline at a 4%+ edge. Stakes are 1/8 Kelly, capped at
  2u while in beta, at most 8 a day. Each game is logged once, before tip.
  Lives at `/cbb.html` ("College Hoops" in the nav) and is graded nightly. It
  counts in the track record.
- **2026-11-02: Skip lopsided games.** The first live run picked eight
  +28 to +44 underdogs. ESPN's win chance flattens near 100%, so a 99%
  favorite read as about 25 points against a 44-point line. Now it skips lines
  over 14 and predictor calls outside 12–88%. Those eight picks were pulled
  before any game tipped.
- **2026-11-02: One board for every sport.** The homepage Locks and Card
  rank all sports together (MLB, NBA, college hoops) by the same score,
  with a sport filter. Each sport still has its own page (/free-mlb-picks/,
  /free-nba-picks/, /cbb.html). The team we're on shows gold for a lock,
  green for a good pick. College 5-star picks count as Locks.
- Next: our own college ratings to replace ESPN's predictor once there's a
  season of games. CBB games and picks in the app.

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
- **2026-10-31:** All of today's features deployed from CloudShell (`/hot` answers
  200). **Email turned on:** sends from **originalbookiebullies@gmail.com** (Gmail
  app password, 2-Step on), which is also the contact address on Terms and
  Privacy. Move to an @bookiebullies.com address later: change `SMTP_USER`,
  `SMTP_PASS`, `MAIL_FROM` and `CONTACT_EMAIL` in `/etc/bookie-bullies-app.env`
  and restart. AWS account: 9385-2195-2366.

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
  cards, slide-up pick slip, LOCKED confirmation
- Profile record card with a units line, ROI, last 10, rank, Share as image
- Follow players and a Following feed; Hot streaks; public split; profile breakdown
- Notifications: bell and inbox, phone notifications (Web Push)
- Installable on phones (manifest, icons, iPhone full-screen)
- Automatic grading every 10 minutes, with voids for postponed games
- The official BookieBullies account: the site's model picks, imported every
  15 minutes, with Official and LOCK tags, never ranked
- First-time setup (sports and players to follow), screen name changes,
  player search, and an admin page for reported chat
- Parlays: 2 to 6 legs on different games, a draft and a parlay bar, the
  same 5u caps, graded with picks, one bet on every record and board
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
8. **Set `ADMIN_EMAILS`** in `/etc/bookie-bullies-app.env` (2026-11-05), like
   `ADMIN_EMAILS=originalbookiebullies@gmail.com`, then restart. That email
   needs an app account, confirmed, to see Admin in More. The official picks
   import needs nothing set: it reads www.bookiebullies.com/picks_log.jsonl.

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
4. ~~The Bookie Bullies model as a player~~: built 2026-11-05 (the official
   BookieBullies account).
5. **cfb-bot as a player**, same idea, for college football and the NFL.
6. **Streaks and badges:** "8-2 last 10", "Hot in NBA", "Top 3 this week".
7. **Weekly winners in groups.**
8. **Notifications** when bets settle or games start (and the App Store push).
9. App Store and Google Play versions.
10. Trash talk in groups. (~~Following players~~: built 2026-10-30.)
11. ~~Changing a screen name~~ (built 2026-11-05), props, ~~parlays~~ (built 2026-11-05), more admin
    tools (~~reported chat~~ built 2026-11-05; fixing a bad grade is still by hand).

## How to work on it

- `cd picks-app && npm test` runs every test. `npm run demo` runs it locally.
- Node 22, no npm packages: built-in http server, built-in SQLite.
- Database changes go at the end of `MIGRATIONS` in `src/db.js`; never edit
  one that has shipped.
- The README has the details: settings, file map, security notes.
