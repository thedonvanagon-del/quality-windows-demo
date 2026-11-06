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
- **2026-11-06: Launch screen and ".com" (owner's ask, to promote the
  site).** The first page of each visit shows the crest with
  BOOKIEBULLIES.COM in gold for about a second, then fades (pure CSS, a tap
  skips it, shorter with reduced motion; a session cookie `bb_splash` keeps it
  to once per visit and a redirect doesn't use it up). The header reads
  "BOOKIE BULLIES.com" with a small muted ".com"; on phones the name steps
  down a size so the bell and avatar stay on screen. The installed app's name
  (manifest `name`, shown on Android's launch screen) is "BookieBullies.com";
  the home screen label stays "Bookie Bullies".
- **2026-11-06: Name colors and scoreboard icons** (owner's ask: "be able to
  change your name color for the scoreboard and your icon for the scoreboard").
  On your own profile, under App color, a **Your name on the boards** card: a
  sample board row (your face, icon, colored name, record and units), color
  swatches and an icon grid, all plain radio buttons saved by `POST /nametag`
  (form token), so it works without JavaScript; `app.js` only updates the
  sample row and filters team logos.
  - **12 colors**: Default (no color), Gold, Red, Orange, Lime, Green, Teal,
    Sky, Blue, Purple, Pink, Silver. Each is a class (`.name-c-gold`) reading
    a variable with a **dark-page and a light-page shade**, since other
    players see your name on their own look. The light shades apply under
    `data-mode="light"`, now on `<html>` for the Light preset and for team and
    custom looks on a light background. A test reads `style.css` and checks
    every shade at **4.5:1** on every preset's cards, raised rows, tiles, page
    and the lit-up "me" row, and on team and custom looks across a grid of
    tints and accents, dark and light. The dark shades are pastel because of
    that (a white-tinted custom look with a white accent is the hardest case).
  - **Icons**: 25 emoji anyone can use, plus four **earned** ones: 👑 Crown
    (Weekly winner), 🏆 Trophy (Tournament champion), 🔥🔥 Double fire
    (Streak 10), 💎 Diamond (100 bets). Locked ones show greyed out with
    "Earn it: win a weekly contest" and the like, and the server turns them
    away. Emoji have a screen-reader name (`role="img"`, `aria-label`).
  - **Team logos**, any team, as the icon (added the same day): NFL, NBA,
    MLB, NHL, and about 50 major college programs (`COLLEGE_PROGRAMS` in
    `src/teams.js`, matched to ESPN by exact school name so Miami (OH) isn't
    Miami). The list comes from ESPN's team lists
    (`site.api.espn.com/.../{sport}/teams`, `?limit=1000` for college),
    fetched **once a day in the background** and kept in `team_catalog`, so a
    restart has it at once; an empty or broken answer never replaces a good
    list. **Pages never wait on it**: until a league has loaded, the picker
    and the boards use the teams the games table has already seen. Logos must
    be https on `a.espncdn.com` (checked when stored and again when drawn),
    the one outside host the page's security policy already allows. Shown as
    an 18px `<img>` with the team's name as its alt text. The picker groups
    them by league in `<details>`; with JavaScript, a league menu and a name
    search narrow them.
  - **Stored as keys**, never text: `users.name_color` and `users.name_icon`
    (an emoji key like `bull`, or `team:nfl:KC` / `team:ncaa:333`). Checked
    again every time a name is drawn: a key no longer on a list, an earned
    icon whose badge is gone, or a team that left the catalog draws nothing.
  - **Where**: everywhere a name sits in a list: leaderboard, contest and
    search, the home page board, group and local room boards and members,
    tournament standings, Hot, the streak boards, chat (game, group, room),
    Following (people and feed), group feeds, and the profile header. One
    helper does it (`playerName(row)` / `profileLink(name, { color, icon })`
    in `views/parts.js`); `withLooks(rows)` in `app.js` (was `withPhotos`)
    fills `photo`, `nameColor` and `nameIcon` in one go. Not on podiums,
    the winners wall or admin pages.
  - The **official account** can't set either and never shows one: it keeps
    its gold Official tag.
  - Name and icon stay together on one line (`.pname`); on a phone a long
    row drops its badge chip below the name instead of widening the table.
  - **Decided differently from the brief:** college logos use one key per
    school, `team:ncaa:<ESPN id>`, instead of `team:ncaab:`/`team:ncaaf:`,
    since a school's logo is the same in both and the picker shows "College"
    as one list. The streak-10 icon is two flames (🔥🔥) rather than a new
    symbol.
- **2026-11-06: More looks, team colors and custom colors** (owner's ask).
  - **Eight presets**: Scoreboard, Bull Market, Ember, plus **Ice** (navy and
    sky blue), **Royal** (purple and gold), **Crimson** (deep red, white
    text), **Forest** (green and cream) and **Light** (white and charcoal with
    a dark amber accent, the one light look). Each is a complete token set in
    `style.css`; a test reads them and checks text, muted text, tiles, odds,
    buttons, wins, losses and the gold marks for contrast.
  - **Match my team**: on the profile, pick a sport, then a team (every team
    the app has seen with an ESPN color). The accent is the team's color and
    the background takes a hint of it. ESPN's second color (`alternateColor`)
    is now kept on games too.
  - **Custom**: two color boxes, an accent and a background tint.
  - Both come on a **dark or light background**, the player's choice.
  - **Readability guard:** the accent has to reach 3:1 against the odds
    tiles. A team color that doesn't uses the team's second color if that
    does, else gets lighter (on dark) or darker (on light) until it does.
    Text on accent buttons is black or white, whichever reads better.
    Saved on the player: `theme = 'custom'`, `theme_team`, `theme_mode`,
    `theme_accent` (after the guard), `theme_tint`.
  - **No inline styles:** a team or custom look is a stylesheet whose name is
    its colors, `/theme/t1-d-<accent>-<tint>.css`, cached for good. **Decided
    differently from the brief** (an opaque hash): with the colors in the
    name there's no table to look them up in, and the name is checked
    letter for letter, so it can only ever hold hex colors. The picker's
    sample card loads a `-preview` copy that colors only the sample, so
    what it shows is exactly what saving gives.
  - Players on a team get the **team's logo** by their name on their profile.
- **2026-11-06: A banner behind every profile header**, in the player's team
  colors if they matched a team, else their look's accent and background
  (an SVG, since inline styles are blocked). Their face sits over its edge.
- **2026-11-05: Injuries and recent form on game pages** (owner approved),
  before the start only: each team's listed injuries (worst status first,
  six a team, with position and the injury) and last five results as W/L
  chips ("W 112-104 vs BOS"), newest first, from ESPN's game summary
  (`summary?event=`). A section with nothing in it is hidden. The page
  **never waits on ESPN**: `src/summaries.js` keeps each game's summary 30
  minutes in memory, one request per game at a time; with nothing cached the
  page shows without them and a fetch starts in the background for the next
  view. A failure is logged, shows nothing, and is tried again after 5
  minutes. **The parser hasn't been checked against live ESPN** (see Waiting
  on the owner).
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
- **2026-11-05: Closing line value (CLV)** on straight picks (owner approved).
  - **The close** is the last pregame line the app saw for each market. Until
    the start it's tracked on the game (`games.closing_lines`; a market the
    book pulls keeps its last number); when the game starts, by ESPN's status
    or the clock, it's **frozen once** (`closing_at`) and nothing changes it,
    live odds included. A game the app only saw after it started (or that
    started before this shipped) takes its close from its last stored lines
    at grading.
  - **Per pick**, stored once the close is frozen: `clv_points` for spreads
    and totals, positive when the pick got the better number (+3.5 that
    closed +2.5 is +1.0; Over 44 that closed 45.5 is +1.5; Under the other
    way), and `clv_pct`, the win chance gained on the price, in percentage
    points, with the vig taken out using both closing prices.
  - **Decided differently from the brief:** the pick's own price is scaled by
    the same vig as the close, so a pick at exactly the closing price shows
    0%, not −2.4% (raw −110 against a no-vig 50%). Otherwise every pick that
    matched the close would read as "lost to the close".
  - **Shown** as a "CLV +1.0" (points) or "CLV +2.3%" (price, for moneylines,
    and for spreads and totals whose number didn't move) tag on My bets,
    profile and feed rows, green or red. Profiles show "Beat the close: 58% ·
    Avg CLV +1.2% · 40 picks" with a What's CLV? note. Beat the close counts
    the number on the tag; the average is the price number over every pick
    with one, so flat −110 spreads pull it toward 0. Voids are left out.
    Parlays skip CLV for now. Picks graded before 2026-11-05 have none.
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

### Tournaments
- **2026-11-06: Head-to-head leagues** (owner approved; `src/leagues.js`,
  `/leagues`). Free. 4 to 16 players.
  - **Making one:** any confirmed player, at `/leagues/new` (a "Start a
    league" button in the hub's new **Leagues** section). Two going at once
    (not canceled, not final); admins no limit. Name by the player-made
    tournament rules (`cleanTournamentName`). Sports (none checked is all),
    week 1 (one of the next 8 Mondays), 3 to 10 regular-season weeks, a
    playoff of 2, 4 or 8. Public (listed, Join) or private (`/l/<code>`), and
    optionally tied to a group or local room (members only), like
    player-made tournaments. The maker is in it and can't leave.
  - **Weeks** are the weekly contest's: Monday to Sunday ET. Joining (a
    confirmed email) closes when week 1 starts. Then, once (`runLeagues`,
    every 5 minutes with the daily jobs): **under 4 players it's canceled**
    and everyone hears "Sunday Crew was canceled. Only 3 players joined
    before Week 1. A league needs 4."; otherwise the **round-robin** is made
    and stored (`league_matchups`): the circle method on the members in join
    order, a bye seat when the count is odd, starting over after n-1 weeks.
  - **A matchup** is units won on graded bets (`BETS`, picks and parlays, a
    parlay only when every leg is in the sports) on games that started that
    week. `contest.js`'s `counted()` gained a `userIds` filter, so the
    standings, open-bet and ungraded queries are the contest's own. More
    units wins, the same units is a tie, no bets is 0. A week **settles
    once**, like the weekly contest: after it ends, when every member's
    counted bet is graded, by Tuesday 6 AM ET at the latest. Live: the
    league page shows the current week at the current score (the
    tournaments' `provisional` grading, now exported), "N live" by a score,
    the live note, a 45-second refresh; nothing provisional is written.
  - **Standings:** win share (a tie is half; byes don't count as games),
    then total units (a bye week's units count), then who joined first.
  - **Playoffs:** after the last regular week the top N are seeded
    (`league_members.seed`) into a single-elimination bracket, 1 v N, pairs
    built so 1 and 2 only meet in the final (8: 1-8, 4-5, 2-7, 3-6). One
    round a week, each written when the round before settles. A tied playoff
    matchup goes to the **higher seed**. After the final: `champion_id`, the
    **League champion** badge (`league_champion`, one per league), a note to
    everyone, and **Cup points** (new source `league`) by finish: champion
    1st, runner-up 2nd, semifinal losers 3rd (shared), then everyone else by
    the regular-season standings. The player-made minimum applies: **8 or
    more players** or no Cup points.
  - **Notes**, behind the Tournament updates setting: "This week you play
    DogLover in Sunday Crew." once per matchup (claimed by `told_at`), the
    bye version, "You beat DogLover +3.2u to +1.1u." / "DogLover beat you
    ..." / "You tied ...", "(the higher seed wins a tie)" on a tied playoff
    game, "You made the playoffs in Sunday Crew as the 3 seed.", and
    "Playoffs: this week you play ..." / "In the final, ...". Cancel and
    final notes always go.
  - **Pages:** `/leagues` (yours, then open public ones), `/leagues/new`,
    `/leagues/<id>`: this week's matchups (yours first, lit up), the playoff
    bracket once playoffs start (HTML and CSS: a column a round on wide
    screens, stacked rounds on a phone; TBD for rounds not set), standings
    (a dashed line under the playoff cut), the schedule by week
    (`<details>`, this week open), rules.
  - **Decided differently from the brief:**
    - **No league chat.** A league thread would mean rebuilding
      `chat_messages` again to widen its "exactly one of game, group,
      tournament" CHECK; that isn't additive, so it's skipped as the brief
      allowed. A league tied to a group or room uses that chat (the rules say so).
    - A playoff bigger than the players shrinks when the league starts
      (8 with 6 players becomes 4), rather than refusing it at creation, when
      nobody knows yet how many will join.
    - Ties in the regular season rank by win share, not wins, because byes
      leave players with different game counts.
    - Joining needs a confirmed email (tournaments let unconfirmed players
      join but hide them), since an unseen player would still hold a
      matchup. A league can't be canceled by its maker; under 4 cancels itself.
- **2026-11-06: The March Madness bracket challenge** (owner approved;
  `src/bracket.js`, `/bracket`). One free challenge a year for the NCAA
  men's tournament (`bracket_challenges`, by year).
  - **The tree:** games 0 to 62. Round of 64 = 0-31 (8 a region in the
    1-16, 8-9, 5-12, 4-13, 6-11, 3-14, 7-10, 2-15 order), Round of 32
    32-47, Sweet 16 48-55, Elite Eight 56-59, Final Four 60-61 (region 1 v
    2, 3 v 4), title 62; game g in a later round is fed by two games before
    it. A **slot** is a region and seed ("2-11"). **The First Four isn't
    picked:** a pick names the slot, the slot holds both teams (`name2`)
    until its game (`ff_winner`), so a First Four result changes nobody's
    bracket.
  - **The field from ESPN:** `parseScoreboard` now keeps the game's note
    (`competitions[0].notes[0].headline`, else the event's) and each team's
    ESPN id and a **seed** (`competitor.seed`, else `curatedRank.current`
    from 1 to 16; during the season that's the AP rank, so only tournament
    games read it). `tournamentNote` reads "Men's Basketball Championship -
    South Region - 1st Round" (First Four, rounds, Final Four, National
    Championship; women's and NIT left out). `assembleField` builds the 64
    slots from Round of 64 games (a TBD team's slot comes from its First Four
    game), checks seeds pair to 17, and lists every problem. In March and
    early April the 10-minute finals job (`syncBracket`) looks for the field
    and, with no problems, saves it as a **draft**; **an admin always
    confirms it** at `/admin/bracket`, since the Round of 64 can't say which
    regions meet in the Final Four. The lock is the first Round of 64 tip.
  - **`/admin/bracket`** (admins; a Bracket tab and a More row) works fully
    without ESPN: start the year's challenge, **Look on ESPN** (says so
    plainly when ESPN can't be reached), the regions in Final Four order and
    the lock (ET), the field as **4 × 16 boxes** with a list of college
    teams (`<datalist>`: the catalog's programs plus every college hoops
    team the board has seen; a typed name works too) and a second box for a
    First Four pair, or **pasted** ("South, 16, Howard / Wagner" a line).
    Confirming opens it. Then **results**: First Four winners, every game
    whose two teams are known, and the title game's total; fixing a game
    drops later results that rode on it.
  - **Results from ESPN:** once locked, the finals job reads the last 3
    days of the scoreboard, matches teams to slots by ESPN id, name or
    abbreviation, fills First Four slots and puts each final in the one tree
    game those two slots play, in start order. The title game's score sets
    the total. Then the challenge closes once: places on the entries, the
    **Bracket champion** badge (`bracket_champion`, by year), **Cup points**
    (source `bracket`, no minimum), notes.
  - **Scoring:** 10, 20, 40, 80, 160, 320 a right pick by round (1920 is
    perfect). Ties: closest tiebreak guess (the title game's total points,
    60-300) once the total is known, then whoever saved first. **Possible
    max** = points + every undecided pick whose slot hasn't lost.
  - **`/bracket`:** your bracket by region (tabs for the four regions,
    Final Four, Standings). Each game is two team buttons, radio inputs in a
    **form per round** with a Save button, so it works without JavaScript;
    with it, a tap saves at once and the bracket redraws (the next round
    fills in). Changing a pick drops later picks that rode on the old team,
    and says so. After the lock it's read-only with right/wrong marks and
    knocked-out teams struck. **Other players' brackets** (`?player=`) are a
    404 until the lock; the standings show names and "63 of 63 picked"
    until then and the champion pick after.
  - **The hub card** (next to Survivor and Pick'em): fill your bracket, x of
    63, the lock; your place once locked. Off-season: "The bracket challenge
    opens on Selection Sunday." with the last winner. From November the
    challenge looked for is next year's.
  - **Decided differently from the brief:** an ESPN field is never opened on
    its own (a draft for the admin), since the Final Four pairings aren't in
    the Round of 64 games. Team boxes take any plain name, not only teams on
    the list: the app's college list is about 50 programs plus what the board
    has seen, and the field has 68 schools.
  - **The parser hasn't been checked against live ESPN** (see Waiting on
    the owner). If ESPN's notes or seeds differ, the draft lists problems and
    the admin pastes the field; results can be entered by hand.
- **2026-11-06: Prize tournaments** (owner approved; `src/prizes.js`).
  Admins only can make an **admin-made custom tournament** a prize
  tournament, from its row on `/admin/tournaments` ("Make it a prize
  tournament") to `/admin/tournaments/<slug>/prize`: the prize, its value in
  dollars (up to $5,000), the sponsor, eligibility (default "US residents
  21+, void where prohibited") and how and when it's delivered. How the
  winner is picked is fixed: first place in the final standings. Only
  before the start and with nobody in it yet.
  - **Still free:** no purchase or payment of any kind; `tournaments`'
    `entry_fee_cents = 0` CHECK is untouched (and every new table has the
    same CHECK).
  - **Official rules** at `/tournaments/<slug>/rules`, from the fields plus
    a template: sponsor, NO PURCHASE NECESSARY, eligibility, entry period,
    how to enter (free), how the winner is determined (skill, the app's
    standings and tiebreaks), prize and approximate retail value, odds
    ("depend on skill and the number of entrants"), winner notification and
    verification, publicity, general conditions, a limitation-of-liability
    **placeholder**, privacy (links `/privacy`), the winners list request.
    Admins see a gold banner on top: "Draft rules: have a lawyer review
    before running this tournament."
  - **Publishing gate:** a new prize tournament is a draft that only admins
    see (hub, pages, rules, join all refuse it; the hub shows admins a Draft
    chip). An admin ticks **"A lawyer has reviewed these rules"** (who and
    when are recorded; changing the prize clears it), then **Publish**
    (refused without the review; who and when recorded). Published rules
    can't change.
  - **Players** see a gold **Prize** chip, the prize, its value and sponsor
    and an **Official rules** link on cards and the page. Join needs **"I've
    read the official rules"** checked; its time is stored on the entry
    (`tournament_entries.rules_accepted_at`).
  - **After the close** the admin page lists the winner with their record,
    their **account email** (admins only) and when they read the rules, and
    **Mark prize sent** (who and when). `/admin/tournaments` lists every
    prize tournament with its state.
  - **Before running one for real:** a lawyer reviews the rules, and the
    sweepstakes and contest rules **state by state** (registration and
    bonding in some states for prizes over a value, New York and Florida
    among them; void where prohibited) are checked. See Waiting on the owner.
- **2026-11-06: Survivor, NFL Pick'em and the Bookie Bullies Cup** (owner
  approved; Survivor is the top priority). All free, like every tournament.
  - **NFL weeks** (`src/nflweeks.js`). ESPN's scoreboard files each NFL game
    under `season.year`, `season.type` (2 is the regular season) and
    `week.number`; the parser now carries them (the event's own, else the
    scoreboard's) and `games` keeps them (`season`, `season_type`, `week`).
    When ESPN sends none, the week comes from the date: Tuesday-to-Monday
    Eastern windows, week 1 starting the Tuesday after Labor Day. Regular
    season only (weeks 1 to 18); preseason and playoff games have no week. A
    week is "over" 4 hours after its last game starts; the current week is
    the first one not over. Between weeks, before the next week's games are
    on the board, the next week counts as current with no games yet.
    **ESPN's week fields haven't been checked against the live feed** (see
    Waiting on the owner); without them the date rule gives the same weeks.
  - **Survivor** (`/survivor`, `src/survivor.js`; `/tournaments/survivor`
    redirects there). One pool per NFL season, made on its own ("Survivor
    2026") once the season's games are on the board (hourly, and on page
    views). Each week a player picks **one team to win outright**; a team
    counts **once a season**. A **loss or a tie** ends the run at once, with
    "Your Survivor run ended in Week 6 (Bills lost)." A **postponed or
    canceled game** voids the pick: the player survives the week and the
    team isn't used (a void pick can be replaced while that week has games
    left). A **week with no pick** knocks you out when the week is settled
    ("(no pick)"). **Joining** is open while the current week's first game
    hasn't started; a late joiner is alive from that week on and only weeks
    from then count. Picks change until **that team's** game kicks off; other
    players' picks are hidden until each game starts. When a week is over
    and every pick in it is graded, it's settled once (`survivor_weeks`):
    missed weeks go out, then the pool closes if one player is left, or
    everyone left went out that week (they **share** it), or after Week 18
    (everyone alive shares it). Winners get the **Survivor champion** badge
    (`survivor_champion`, one per season) and a note; everyone else hears who
    won. Alive players with no pick hear "Make your Survivor pick for Week
    10." once a week, 3 hours before the week's first game, behind the
    tournament reminder setting (`reminders_sent`, kind `survivor`).
    - **The pick slip:** on an NFL spread or moneyline bet on a team, for a
      player alive in Survivor, on a game in the current week that hasn't
      started: "Use Chiefs as my Survivor pick for Week 10", or "Switch my
      Survivor pick to Chiefs (now: Bills)", or, for a team used in an earlier
      week, the same line turned off ("Chiefs: used in Week 3"). Checked, it
      saves the Survivor pick with the bet (after the bet goes in; the flash
      says if it couldn't). One small line says Survivor only counts whether
      the team wins outright, whatever the bet. Totals never show it.
    - **The page:** your status (Join, "Alive, Week 10", "Out in Week 6"),
      the week's next kickoff, this week's games with both teams as buttons
      (used teams say "Used Wk 3", started games are locked, your pick is
      marked), your picks by week, and the standings: players left of
      entered, how many went out each week, and every player's picks as
      chips (a lock until the game starts).
    - **Grading** runs after every finals check and every 5 minutes, off the
      same `outcome` as bets (`picks.js` now exports it). `games.checkFinals`
      also fetches the days of games with open Survivor and Pick'em picks,
      so a Survivor-only game still gets its final.
  - **The hub, top first:** a **Survivor featured card** (status, your pick
    this week or **Make your pick**, "10 of 20 left", and the deadline: your
    team's kickoff, or the week's first game; once that's started, the next
    kickoff), then the **NFL Pick'em** card, then a slim **Cup** banner, then
    everything that was there. Between seasons the Survivor card says
    "Survivor returns for the NFL season" with the last winner.
  - **NFL Pick'em** (`/pickem/nfl`, `src/pickem.js`). Every NFL week, pick
    every game **against the spread**, at the app's spread **when you save
    that game's pick** (saving the same side again keeps the old line;
    switching sides takes the new one). 1 point for a right pick, 0.5 for a
    push, 0 for a void; one **Best Bet** a week doubles its own points. Each
    game locks at its kickoff, and so does a Best Bet on it. No join step:
    anyone who saves a pick is in. Its own table (`pickem_picks`): no units,
    no record, no boards. The page is one form of radio buttons drawn as
    team buttons with the spread, plus a Best Bet star per game, saved with
    one button, so it works without JavaScript. Then the week's standings
    and **Season standings** (points summed, weeks won), with tabs for
    earlier weeks. A week closes once (`pickem_weeks`) when every pick is
    graded, 30 hours after its last game at the latest; its top 3 go in
    `pickem_results` and hear about it, and 1st gets **Pick'em winner**
    (`pickem_winner`, one per week).
  - **The Bookie Bullies Cup** (`/cup`, `src/cup.js`): a points race over a
    calendar year (Eastern). Every close gives points by finish (25, 18, 15,
    12, 10, 8, 6, 4, 2, 1 for 1st to 10th) **plus 1 for placing**: auto,
    admin-made and player-made tournaments (player-made only with **8 or
    more placed**), the Weekly Open, Survivor and each Pick'em week. Stored
    once per player per event in `cup_points` (source and ref say which), so
    the standings are a sum and the **backfill** (`backfillCup`, every start)
    is idempotent: this year's closed tournaments and weekly contests.
    `/cup` has the standings (rank, points, wins, podiums, your row lit up),
    your finishes, and a **How points work** box. After the year ends its top
    3 go in `cup_results` once, get **Cup champion** / **Cup podium**
    (`cup_champion`, `cup_podium`, by year) and a note, and show on a new
    **Cup** tab on the winners wall. Profiles show "Cup: #12 · 84 pts"; the
    hub and the leaderboard link it.
  - **Badges:** Cup champion leads the board order; Survivor champion comes
    after Tournament champion, Cup podium before Podium, Pick'em winner after
    Tournament podium. The "keys stay put" test lists them.
  - **Decided differently from the brief:**
    - A Survivor pool needs **two players** in it to close, so a pool with
      one entrant doesn't crown them after week 1 (or when they lose).
    - **After Week 18**, everyone still alive shares the win (the brief
      didn't say).
    - Survivor's finish for the Cup: winners 1st, then by how late each run
      ended; players out the same week share a place and its points.
      Placed means they made at least one pick.
    - A Pick'em week is not a row of its own until it closes: it exists by
      the schedule. **5 graded picks to place** (like the weekly contest);
      ties go to more wins, then to whoever finished saving first.
    - Pick'em picks have nothing to hide: the standings show only totals.
    - Once the week's first game has started, the hub's deadline reads
      "Next kickoff" with the next game still to start, not a time in the
      past.
    - Cup points for a shared place are that place's; Cup ties go to more
      wins, then podiums. Cup podium is one badge per year, not once ever.
    - The demo's NFL calendar puts its current week at **Week 10**
      whatever the date, and adds 14 NFL-only players (no bets, no
      password) so the pools look like pools.
- **2026-11-06: Tournaments, round two** (owner approved list of five).
  - **Live standings.** While a tournament is live its page shows **As it
    stands** in place of Standings: the graded standings plus every counted
    bet on a game in progress, graded at the current score by the same code
    as finals (`grade` and `profit` from `picks.js`; a parlay through
    `settleParlay`, so a live leg losing loses it, and one with a leg still
    to start stands nowhere yet). **Nothing provisional is written**:
    results, closing, badges and alerts use graded bets only. Each row shows
    its move against the graded-only order (▲3 / ▼1, beside the rank) and
    "2 live" under the name; a note says "Live: counts games in progress.
    Final standings use final scores." The section refreshes every 45
    seconds through the live games page's `[data-live-poll]` swap (it now
    reads `data-poll-every`). Scores come from the stored games; a live page
    view calls `games.live()` once (already rate-limited to one ESPN read per
    sport-day a minute). `liveStandingsOf` in `tournaments.js`;
    `rankStandings` and `openBetsIn` came out of `contest.js` so both orders
    follow the same rules. The Weekly Open gets it too. "You" (the card at
    the top) stays graded.
  - **Player-made tournaments** (`/tournaments/new`, a Make a tournament
    button on the hub and on group pages). Any signed-in player with a
    confirmed email. Name 3–40 characters, tidied, **no links, no @
    mentions, and nothing that passes for the official account** (the
    screen-name look-alike check, spaces ignored; bios have no check to
    reuse). One or more sports; start 15+ minutes off; 1 hour to 14 days; 1
    to 20 graded bets to place. **Public** (listed under Player tournaments
    in the hub) or **Private** (unlisted; opened from `/t/<code>`, an 8-letter
    code, and joined only with it). An optional **group or local room** the
    maker is in: only its members can join and it shows on that group's page
    (a Tournaments section). The prize is fixed, "Bragging rights and a
    Tournament champion badge", and it's free like the rest. The maker is in
    it from the start. **Limits:** 2 going (live or coming up) at once and 5
    made in any 24 hours (canceled ones count for the day); admins none.
    **Powers:** the maker can copy the invite link and cancel before the
    start (entrants hear); nothing else. Admins can cancel a player-made one
    any time before it's final. Stored as a `custom` tournament plus a
    `player_tournaments` row (visibility, code, group, `members_only`,
    `reviewed_at`), so the kind CHECK and the tournaments table stay as they
    were. Winners get the same badges; the winners wall lists public ones.
  - **Moderation:** anyone signed in can **report** a player-made one, once
    ever (`tournament_reports`). Three since the last review hide it from
    the hub, group pages and winners wall, and close it to new players;
    people in it still see it. `/admin/tournaments` has a **Reported**
    section (hidden first) with Dismiss (stamps `reviewed_at`, so earlier
    reports stop counting) and Cancel; More shows a count on Admin:
    tournaments.
  - **Where you stand alerts**, a new **Tournament updates** setting (on by
    default, next to the start reminder), through the inbox and push:
    "You moved into 2nd in Hoops Night (+3.4u)." when a player enters the
    graded top 3 or moves up within it, at most one per player per
    tournament every 2 hours; and once, in the first 15 minutes of the last
    two hours, "2 hours left in NFL Sunday. You're 1.4u out of first." to
    placed entrants ranked 2–10 within 5u of first, or "You're in first by
    2.1u." for the leader. The place seen and both sends are kept on the
    entry (`alert_place`, `moved_at`, `final_alert_at`), claimed before
    sending, so restarts never double up. Moves run after every grading and
    every 5 minutes; "2 hours left" every 5 minutes. Not for the Weekly
    Open (the contest has its own notes); the official account gets nothing.
  - **Tournament chat** on each tournament's page (`#chat`): entrants only
    (everyone signed in for the Weekly Open), with every chat rule (280
    characters, confirmed email, the shared 8-a-minute limit across games,
    groups and tournaments, delete your own, report, three hide, admin
    restore or delete on `/admin/reports` as "Tournament: name", 15-second
    refresh). The maker has no say over other people's messages. A canceled
    tournament's page stays up for its entrants with the chat read-only.
    `chat_messages` was rebuilt with `tournament_id` and the CHECK "exactly
    one of game, group, tournament", foreign keys off, every row copied
    (`SELECT *`, so an unknown column stops it); `chat_reports` keeps
    pointing at it. `tournament_id` has no ON DELETE, so a tournament with
    chat can't be deleted; the app only cancels.
  - **Share cards.** On a closed tournament's page, a player in the top 3
    gets "You finished 1st. Out of 24 players." and **Share**: a 1080 square
    drawn on a canvas in the page's colors (crest, "1st in Hoops Night",
    their name and photo, units and record, "Out of N players", the date,
    the link), to the share sheet or downloaded, like the profile's Share as
    image. Weekly contest winners get the same on their own rows on
    `/contest` (last week's top 3) and `/winners` (players counted only for
    the weeks they placed in).
  - **Decided differently from the brief:** "Admins can cancel anything"
    means any **player-made** one at any time before it's final; the
    timer's and admin-made ones still cancel only before the start (an
    existing rule and test). A canceled tournament was a 404; now its page
    stays for the players who were in it (the old test was changed to say
    so) and is a 404 for everyone else. A player-made tournament tied to a
    **private group** is never in the public hub, even if public, so the
    group's name doesn't leak; a local room's public one is. The "2 hours
    left" note isn't sent late: a server down for its first 15 minutes skips
    it. Alerts skip the Weekly Open. The demo now always has three games
    under way when it starts (their own random numbers, so the rest of the
    schedule is unchanged).
- **2026-11-06: Tournaments** (owner approved), a tab of their own
  (`/tournaments`, `src/tournaments.js`). **Free, every one of them.**
  - **What counts:** units won on graded bets (picks and parlays, through
    `BETS`) made **after you joined**, on games that **start inside the
    window**, in the tournament's sports. A parlay counts for a sport list
    only when every leg is in it (NBA + college hoops counts in Hoops Night);
    its date is its first leg's start, as everywhere else. A minimum of graded
    bets to place; ties to the better ROI, then whose last counted bet started
    first. Entrants under the minimum show below with "N more bets to place".
  - **Reuse:** the weekly contest's standings and closing were generalized in
    `src/contest.js` (`windowStandings`, `ungradedIn`, `dueToClose`,
    `closeWindow`) for any window, sport list and entrant list; `/contest`
    and `/winners` run on the same code, unchanged.
  - **Joining:** one tap, until the end. Leave only before the start. The
    official account can't join. Unconfirmed emails can join but show on the
    standings only once confirmed, like the boards.
  - **The Weekly Open** is the weekly contest as a tournament (kind
    `weekly`, slug `weekly-open-YYYY-MM-DD`): everyone's in, no joining, the
    same standings as `/contest`, and it closes with the week (`closeWeek`
    marks it closed; its podium is `contest_results`). Its winners keep the
    Weekly winner and Podium badges and the contest's own note; no second
    badge or note for the same finish.
  - **Auto tournaments**, made by an hourly timer up to two days ahead, once
    each (by slug): **NFL Sunday** (NFL, min 3), **College Saturday** (college
    football, min 3), **Hoops Night** (every day, NBA and college hoops, min 2).
    One whose sports have **no games that day isn't made**, so the off-season
    stays empty; it's made later if games show up. Each starts at its day's
    first game (so "starts in 1 hour" means the first kickoff; it follows the
    schedule until it starts) and ends at midnight ET.
  - **Custom:** admins make them at `/admin/tournaments` (name, sports, start
    and end in ET, min bets, prize text) and can cancel one before it starts;
    entrants hear about it. A canceled auto tournament isn't made again.
    Everyone else gets a 404.
  - **Closing:** at most once, after the end, when every counted bet is
    graded, or 30 hours after the end at the latest (anything ungraded doesn't
    count). The top 3 go in `tournament_results` once and hear "You finished
    #1 in NFL Sunday (+4.2u)."; everyone else who joined hears who won.
    Badges: **Tournament champion** (each 1st, kept apart by slug) and
    **Tournament podium** (top 3, once), next to Weekly winner and Podium on
    the boards.
  - **Notes:** "NFL Sunday starts in 1 hour." once per entrant, with a new
    setting (on by default) next to the other reminders. Results always go.
  - **Pages:** the hub (Live now, Starting soon, the last 10 Finished, a
    link to the winners wall), each card with name, sport chips, window ("Sun,
    Nov 8, 1:00 PM – 11:59 PM ET"), entrants, prize, a **Free** chip and your
    status (Join, Joined, "You're #4"). A tournament's page has the rules in
    plain words, the countdown, Join/Leave, standings with your row lit up,
    and the final podium. `/winners` has a Tournaments tab.
  - **Decided differently from the brief:** the sport column is a list
    (`sports`, comma-separated keys, null for all) instead of `sport` plus a
    second list column, since Hoops Night needs two sports; and a
    `canceled_at` column, so canceling keeps a record and an auto one isn't
    made again.
- **2026-11-06: Buy-ins wait.** Every tournament is free, and the database
  enforces it: `entry_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK
  (entry_fee_cents = 0)`. No coins, no payments, no "coming soon" money
  anywhere in the app. Before any paid entry, all of these first:
  1. **A gaming lawyer.** Paying to enter a contest for a prize is a paid
     fantasy or sweepstakes question, not a pick'em one.
  2. **State-by-state rules.** Some states ban paid contests; most need a
     license or registration; some set age and prize limits. Entries would
     have to be blocked where it isn't legal.
  3. **Apple's real-money gaming rules** for the App Store version: a license
     in each place it runs, geo-restriction to those places, the app free to
     download, and **no in-app purchase for entries** (entries can't be sold
     through Apple's payments).
  4. **A payment processor** that allows real-money contests, plus payouts,
     refunds and tax forms. Changing the CHECK means a new migration that
     rebuilds the table, on purpose.

### Weekly contest, streak game, badges, invites, reminders
- **2026-11-05: Free weekly contest** (`/contest`, "This week's contest" on the
  leaderboard and in More). No entry, no money, everyone's in. A week runs
  Monday 12:00 AM to Sunday 11:59 PM ET. Standings are units won on graded
  bets (straight picks and parlays) whose games **started** that week; 5
  graded bets to place. Ties: better ROI, then whoever got there first, read
  as **whose last counted bet started earlier** (grading runs in batches, so
  grading time would tie too often). The official account shows, never places.
  - **Closing:** once every bet in the week is graded, or Tuesday 6 AM ET at
    the latest (anything still ungraded just doesn't count). A timer in
    `server.js` checks every 5 minutes; a week closes once
    (`contest_weeks`), its top 3 go in `contest_results` once, and each gets
    "You finished #1 in last week's contest (+12.4u)." ("last week's", not the
    approved "this week's", since it lands on Monday or Tuesday.) The first run
    starts from the week before, so no older history is made up; a week missed
    while the server was down still closes later.
  - **Winners wall** (`/winners`): every closed week, newest first, top 3 with
    record and units, plus the most weekly wins of all time.
- **2026-11-05: Streak game** (`/streak`, in More). One **Streak pick** per
  player per ET day (the game's day): a checkbox on the straight-pick slip,
  sheet and full page, shown only while that day has none. Never a parlay.
  Stored on the pick (`picks.streak_day`, one a day by a unique index), so
  deleting the pick before the start takes the flag with it. My bets can move
  it to another of that day's picks before the start; never after.
  - Current streak: wins in a row, back from the newest graded Streak pick.
    Pushes and voids are skipped; a day without one doesn't break it; a loss
    resets to 0. Best streak is the longest run ever.
  - The page shows yours, today's Streak pick (or a button to the board), and
    the top 20 current (1+) and best streaks. Profiles show "Streak: 6 · Best:
    9" once a player has made one; Streak picks carry a Streak tag.
- **2026-11-05: Badges**, worked out from the record, never handed out by
  hand: First win; 50, 100 and 500 bets (graded); Hot hand (8+ of the last 10
  graded bets); Streak 5 and Streak 10; Weekly winner (one per win, with the
  week); Podium (top 3 in a week, once); Parlay hitter (won a parlay of 4+
  legs); Recruiter (3 invited friends joined). Stored once each in `badges`
  with the date, checked after every grading, when a week closes, when an
  invite counts, and hourly for everyone. A new one sends "New badge: Hot
  hand." The official account earns none. Profiles show chips (hover or
  screen reader gives the date); leaderboard and contest rows show the one
  most notable (Weekly winner > Tournament champion > Streak 10 > Hot hand >
  Podium > Tournament podium > Streak 5 > Parlay hitter > 500 bets > Recruiter
  > 100 bets > 50 bets; the two tournament badges added 2026-11-06). **First win
  stays off the boards**: nearly everyone has it, so it says nothing there.
- **2026-11-05: Invite friends** (`/invite`, in More and on your profile).
  Each player gets a link, `/i/<code>` (8 characters, made the first time it's
  needed). It goes to signup with the inviter remembered in the form and in a
  30-day cookie, in case they wander off first. Signup stores
  `users.invited_by`; the new player follows the inviter as soon as they pick a
  screen name (setup's follows still come after). The invite **counts** once
  they've confirmed their email and have a screen name, in either order: the
  inviter hears "Bob joined from your invite." and three earn Recruiter. Group
  links (`/join/<code>`) work as before, and both survive signup together.
- **2026-11-05: Reminders**, two new notification settings, on by default,
  through the same inbox and phone notifications:
  - **Lines are up**, 11 AM to 1 PM ET, once a day: today's games still to
    start in the player's favorite sports ("Lines are up: 9 NBA and 41
    college hoops games today."). Skipped with no games, or no favorites.
  - **Streak reminder**, 5 PM to 7 PM ET, once a day, for players with a
    streak of 1+ (or a Streak pick in the last 7 days) and no Streak pick
    today: "Keep your streak alive: make today's Streak pick." Skipped when no
    games are left today in their sports (any sport, for players from before
    setup who never picked favorites).
  - Checked every 5 minutes; each send is written to `reminders_sent` first,
    so restarts never double up. The official account gets nothing.

### Following, streaks, splits, notifications
- **2026-11-06: Groups reads "Chat Rooms"** (owner's call): the tab bar,
  the top nav, the page's title and heading, More, and the back links to
  it. The page holds private groups and local rooms. URLs and internal names
  stay (`/groups`, `friend_groups`); "Make a group" and the like stay too.
  Measured at 390×760 in the tab font, "CHAT ROOMS" is 60px in a 64px tab,
  so it's **one line**; under 380px wide it wraps to "Chat" over "Rooms"
  rather than cut off (`.tab-wrap`). Screenshot: `tc-tabbar.png`.
- **2026-11-06: The tab bar is Games · My bets · Tourneys · Leaders · Groups ·
  More.** Tournaments gets a tab (a bracket icon); "Tournaments" needs 71px
  and a tab has 64px at 390px wide, so it reads "Tourneys". **Profile left the
  tab bar:** it's the avatar at the top right (checked on a 390px phone) and
  "Your profile" at the top of More. Replaces the 2026-10-25 bar (under Look).
- **2026-11-06: No counts on the tab bar** (owner's call). The My bets tab
  no longer shows an open-bet number; anything new shows only on the bell at
  the top right.
- **2026-11-06: Live games fixed.** The live page used to re-read only the
  boards from today on, so a game that ran past midnight Eastern froze with
  an old score and stayed "live". Now it re-reads each in-progress game's own
  day (at most once a minute), drops games still "in progress" 12 hours after
  their start, and the page refreshes its scores every 30 seconds. ESPN's
  scoreboard is free; one read per sport-day per minute is shared by everyone.
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

### Profile photos
- **2026-11-06: Cover photos** (owner's ask: "allow people to change their
  top photo that is blank right now"). The banner across the top of a
  profile can be the player's own picture instead of the band of colors.
  - **Adding one:** an **Add cover / Edit cover** button on your own banner
    (a link to the form; with JavaScript it opens the file picker), and a
    **Cover photo** section under Profile photo. The browser cuts the biggest
    **3:1** strip from the middle, lets you **drag it** (or use the arrow
    keys) to choose what shows, shrinks it to **1200×400** and sends a JPEG
    at 0.82. Without JavaScript it's a plain file input.
  - **The same pipeline as photos**, not a copy: `src/photos.js` has a
    `KINDS` table (`avatar`, `cover`: column, hidden and blocked columns,
    form field, size limit) and every function takes a `kind`, defaulting
    to `avatar` so photos work exactly as before. A cover may be **2 MB**;
    same first-byte checks, same metadata stripping, same `MEDIA_DIR`, a
    random name in `users.cover`. A new cover deletes the old file; so do
    **Remove cover** and deleting the account.
  - **Showing it:** full width, `object-fit: cover`, **140px tall on a phone
    up to 240px on wide screens** (`clamp(140px, 24vw, 240px)`), with a soft
    fade at the bottom into the page and a light shade at the top behind the
    edit button. The face still sits over the bottom edge. No cover, or a
    hidden one: the color band, unchanged.
  - **Moderation, the same as photos:** **Report cover** on someone else's
    profile (once each), **three reports hide it**, and `/admin/reports`
    lists covers in the same Reported photos section, with Dismiss and
    **Remove cover** (deletes the file, tells the player "Your cover photo
    was removed for breaking the rules", and blocks new covers, not photos,
    for 7 days). Reports share `photo_reports`, with a new `kind` column.
    The admin buttons send `kind`; without one it means the photo, as before.
  - `/media/<name>` serves a file only while someone has it as a photo or a
    cover. Only an admin can give the official account a cover.
  - **Decided differently from the brief:** the Edit cover button scrolls
    to the form's preview rather than cropping on the banner itself, so
    there's one crop preview, not two. Photos and covers share one admin
    section ("Reported photos"), each card saying which it is.
- **2026-11-06: Profile photos** (owner's ask). From your own profile: pick a
  picture, the browser cuts a square from the middle, shrinks it to 400×400
  and sends a JPEG (redrawing it drops EXIF and GPS). Without JavaScript it's
  a plain file input. The server takes **1 MB at most**, checks the **first
  bytes** (JPEG, PNG or WebP only), **strips metadata itself** (JPEG APP1 to
  APP15 and comments; PNG text and EXIF chunks; WebP EXIF and XMP), and
  stores it in `MEDIA_DIR` under a random name. A new photo deletes the old
  file; so do Remove photo and deleting the account.
  - **Where they show:** the profile header (large), the top-right chip,
    leaderboard, contest, search and group boards, group members, Hot
    streaks, Following (people and feed), group feeds, chat, follow and
    invite notes in the inbox, and the profile's Share as image. Without a
    photo it's the same initial circle as before (still hidden on phone
    boards, where photos show small). New places (chat, feeds, Hot,
    Following) get the circle too.
  - **Moderation** (Apple requires it): any signed-in player can **report a
    photo** once. **Three reports hide it** until an admin looks, like chat.
    `/admin/reports` has a Reported photos section: **Dismiss** keeps it and
    clears its reports; **Remove photo** deletes the file, tells the player
    "Your profile photo was removed for breaking the rules", and blocks new
    uploads for 7 days. A hidden photo's address answers only admins.
  - The **official account** has no login, so only an admin can give it a
    photo (from its profile).
  - **`MEDIA_DIR` must be on the server's data disk and in its backups.** By
    default it's a `media` folder next to the database, which on the server
    is `/var/lib/bookie-bullies-app/media`: the one folder the service may
    write to, and on the disk Lightsail snapshots every night. Anyone moving
    the database or changing backups has to move and back up the photos too.

### Chat
- **2026-11-06: Local rooms** (owner's design). A public group per city, so
  players can talk to and rank against bettors near them.
  - **A room is a group** (`friend_groups.kind = 'local'`), with its own chat,
    board ("Top bettors in San Diego", same period tabs) and picks feed on the
    group page. No owner, no invite code: anyone signed in joins with one tap
    and leaves anytime. A non-member opening a room sees a Join page; its chat
    and board are for members, the same gate as group chat.
  - **Players start rooms**, from a fixed list of cities in `src/cities.js`
    (California from the Central Coast south first, then the rest of
    California, then about 85 major US cities by state). Nobody types a room
    name; it comes from the list ("San Diego, CA"). **One room per city**
    (a unique index on `city_slug`); starting a city that has one says
    "There's already a San Diego room. Join it" with the link. A confirmed
    email is needed to start one, and **three a day** per player (admins have
    no limit). The starter is just the first member. No rooms are seeded.
  - **Directory** (`/local`, from More, the top of the Groups page and setup):
    a "Start a room for your city" dropdown, then every open room by region
    (California) or state, with members, "N new" for rooms you're in, and Join
    or Open. `/local/<city>` goes to that city's room.
  - **Your city** (`users.home_city`): in setup and in profile settings, "Pick
    your city" uses the same dropdown. It joins that city's room, starting it
    if there isn't one; for an unconfirmed email the room starts when the
    email is confirmed. One home, any number of rooms; leaving your home
    room clears it. The profile shows it with a pin icon, linked to the room.
    No geolocation, no address: only a pick from the list.
  - **Moderation:** admins, plus the three-report hide. Admins can delete any
    message in a room; reports show on the admin page as "Local room: name".
    A new **Local rooms** tab on the admin pages (`/admin/rooms`): rename
    (the shown name only; the city stays), archive and restore, and start a
    room without the limit. **Archived** rooms leave the directory and lists,
    take no new posts or members, and keep their history.
  - **Never private-group rules:** rooms don't count toward the 20 groups a
    player can run, aren't in "Your groups", and stay when the last member
    leaves. No notification per message; unread counts only.
  - **Schema:** `friend_groups` was rebuilt so `owner_id` and `invite_code`
    can be empty for a room. The migration runs with foreign keys off (a
    migration that starts with `-- runs with foreign keys off` gets that from
    `openStore`, plus `foreign_key_check` before it commits), since dropping
    the old table with them on would delete every member and group message.
  - Rooms with no members and no posts for 30 days could be archived on a
    timer; not built (optional in the design).
- **2026-11-05: Group chat (trash talk)**, owner approved. Every group has a
  Chat section on its page (`/groups/:id#chat`), members only: anyone else
  gets a 404, and leaving a group takes it away. Same rules as game chat
  (plain text, 280 characters, confirmed emails, eight messages a minute
  across games and groups, delete your own, three reports hide), and the
  **group's owner can delete any message** in their group. Reported group
  messages show on `/admin/reports` as "Group: name" (no link: admins aren't
  members). **No push per message**, no mentions: the Groups list shows
  "3 new" by each group, counted from when the player last opened the group
  (`group_members.chat_read_at`; their join time before that), leaving out
  their own and hidden messages. Opening the group, or its chat refreshing,
  reads them. Deleting a group deletes its chat. One `chat.js` serves both
  kinds of thread; `chat_messages` was rebuilt with `game_id` optional and a
  `group_id`, and `chat_reports` with it, so no report was lost.
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
- **2026-11-06: The app sends people to www.bookiebullies.com** (owner's ask:
  promote the site without a new tab, since the bar is full). Everything is
  in `src/site.js`; the address is one setting, `SITE_URL` (default
  `https://www.bookiebullies.com`), and every link is built by one helper,
  `siteLink(base, medium)`, as `?utm_source=app&utm_medium=<spot>`: `bb_chip`,
  `locks_card`, `more_menu`, `ticket`. Links open in a new tab with
  `rel="noopener"`.
  - **BB Pick chips** on `/games`: a game the official account has an open
    (ungraded) pick on gets one chip under its board, next to Chat: gold
    **"🔒 BB Lock · Lakers −4.5"** for a site Lock, else **"BB Pick · Over
    223"**, using the same selection text as everywhere. With two picks on a
    game the Lock shows, then the most confident. The board's official picks
    come from **one query** for all its games (`officialOnGames`, `json_each`).
  - **The chip opens a sheet**: it's a link to `/games/<id>/bb`, a page with
    the model's picks on that game (pick, line, odds, units, confidence as
    1 to 5 stars from `official_picks.conf`), "Locked at the app's line
    before the game", a gold **See all today's picks on bookiebullies.com**
    button and a link to the official profile. `app.js` shows it in the same
    slide-up sheet as the pick slip (it's a `.slip`), so it works without
    JavaScript too.
  - **Today's Locks card**, under the sport tabs on every board: "🔒 3
    Bookie Bullies Locks today · 8 picks · See them" (or "8 Bookie Bullies
    picks today" with no Locks), counting official picks on games that start
    today in ET, every sport. Hidden with none. A second link goes to the
    official profile. The **×** is a form (POST with the form token) that
    stores the ET day on the player (`users.bb_card_hidden_day`), so it stays
    hidden until the next ET day; `app.js` hides it at once and posts in the
    background.
  - **More**: a top row, **Free picks: bookiebullies.com**, with the crest
    and "The Bookie Bullies model's daily picks and Locks". "Your profile" is
    the first page in the app, right under it.
  - **The LOCKED ticket** gets one muted line: "Want a second opinion? See
    the model's picks →".
  - **The share image** (the profile's record card, the only canvas image in
    the app; no tournament or contest win cards exist yet) gets a second
    footer line in gold: "Free daily picks · bookiebullies.com". Any new share
    image should carry it too.
  - **A setting**, "Show Bookie Bullies picks on the board", on by default,
    on your profile under App color (`users.show_bb`). Off hides the chips,
    the Locks card and the ticket line. More's row stays.
  - **Decided differently from the brief:** the ticket line shows on parlays
    too (the wording fits any bet). The chip sits in the card's footer row
    beside Chat rather than on a row of its own, to keep cards short. The
    More row goes above "Your profile", so the test that Profile tops More
    now allows for it.
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
- A free weekly contest with a winners wall, the streak game, badges, invite
  links, and the Lines are up and Streak reminders
- Free tournaments: a Tourneys tab, NFL Sunday, College Saturday, Hoops Night
  and the Weekly Open made on their own, admin-made ones, start reminders,
  champion and podium badges, and a Tournaments tab on the winners wall
- Group chat with unread counts on the Groups list; closing line value on
  straight picks and profiles; injuries and recent form on game pages
- Local rooms: a public room per city, started by players from a fixed city
  list, with chat, a local board, a home city on profiles, and admin
  rename/archive (2026-11-06)
- Eight preset looks (one light), team colors and custom colors with a
  readability guard; profile photos with reports and an admin review; a
  banner in the player's colors on every profile, or their own cover photo
  (2026-11-06)
- Name colors and scoreboard icons (emoji, four earned by badges, and any
  team's logo from ESPN's daily team lists) on every board, standings and chat
- Tournaments, round two (2026-11-06): live "As it stands" standings,
  player-made tournaments (public, private by invite link, or for a group or
  local room) with reports and an admin review, "where you stand" alerts,
  a chat per tournament, and Share cards for top-3 finishes
- Survivor, NFL Pick'em and the Bookie Bullies Cup (2026-11-06): a free
  Survivor pool per NFL season (featured at the top of the hub, a Survivor
  checkbox on NFL pick slips), weekly NFL Pick'em against the spread with a
  Best Bet, and a year-long Cup points race over every tournament close
- Head-to-head leagues with playoff brackets, the March Madness bracket
  challenge (field from ESPN or an admin, `/admin/bracket`), and prize
  tournaments with generated official rules behind a lawyer-review gate
  (2026-11-06); Groups reads "Chat Rooms"
- Links to www.bookiebullies.com: BB Pick chips and a sheet on the board, a
  Today's Locks card, a More row, a line on the LOCKED ticket and the site
  on the share image, with a setting to hide them (2026-11-06)
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
9. **Check injuries and form against live ESPN** (2026-11-05). The session
   that built them couldn't reach site.api.espn.com, so `parseSummary` in
   `src/espn.js` was written from ESPN's known response shape and tested on
   made-up fixtures. A session with ESPN access should fetch a real summary
   per sport (NFL, college football, NBA, college hoops, MLB, NHL) and check
   that the sections fill in. If ESPN's shape differs, the sections just stay
   hidden; nothing breaks.
10. ~~**Check team logos against live ESPN**~~ Done 2026-11-06: right after
   deploying, the server's `team_catalog` held NFL 32, NBA 30, MLB 30, NHL 32,
   college basketball 50 and college football 47 (schools like Gonzaga and
   Villanova have no FBS team, as expected), so `parseTeams` reads ESPN's real
   lists. sqlite3 isn't on the server; check with
   `sudo node -e` and `node:sqlite` (read-only) instead.

11. **Check NFL weeks against live ESPN** (2026-11-06). The parser reads
   `event.week.number` and `event.season.{year,type}` (falling back to the
   scoreboard's own `week` and `season`) from ESPN's known shape; this
   session couldn't reach ESPN. With a real NFL scoreboard, check that
   `games.week` fills in. If it doesn't, nothing breaks: weeks come from
   the date (Tuesday to Monday, from the Tuesday after Labor Day).

12. **Prize tournaments need a lawyer first** (2026-11-06). Before running
   one: a lawyer reviews the generated official rules (and writes the
   limitation-of-liability section, now a placeholder) and checks the
   **sweepstakes and contest rules state by state**: skill contests with a
   prize are still regulated in some states, a few require registration
   and a bond above a prize value (New York and Florida are the usual
   examples), and some bar certain prizes. Only then tick "A lawyer has
   reviewed these rules" and publish. The demo's Buddha Beans tournaments
   are made up.
13. **Check the bracket data live on Selection Sunday** (2026-11-06). The
   session that built the bracket challenge couldn't reach ESPN, so
   `tournamentNote`, the seed fields (`competitor.seed`, `curatedRank`) and
   `assembleField` were written from ESPN's known shape and tested on
   made-up fixtures. On Selection Sunday, open `/admin/bracket`, press
   **Look on ESPN for the field**, and compare with the real bracket. If
   the draft lists problems, paste the field instead; set the Final Four
   order and the lock either way. During the tournament, check that results
   fill in; if not, enter them on the same page.

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
   (~~A free weekly contest~~ built 2026-11-05; ~~free tournaments~~ built
   2026-11-06; the paid kind still waits on the list under Tournaments.)
3. **Paid picks in the app.** Cappers set a monthly price, subscribers see their
   picks before games start, Bookie Bullies keeps 10 to 20% and Stripe Connect
   pays out the rest. Needs payouts, refunds and tax forms; Apple takes up to
   30% of digital subscriptions sold in an iPhone app; no "guaranteed win"
   claims allowed. Build once cappers are clearly selling through their links.
4. ~~The Bookie Bullies model as a player~~: built 2026-11-05 (the official
   BookieBullies account).
5. **cfb-bot as a player**, same idea, for college football and the NFL.
6. ~~**Streaks and badges**~~: built 2026-11-05 (the streak game, badges,
   the weekly contest). "Hot in NBA" (per-sport badges) is still open.
7. **Weekly winners in groups.**
8. ~~**Notifications** when bets settle~~ (built 2026-10-30) ~~or lines go up~~
   (built 2026-11-05, Lines are up). Game-start alerts and the App Store push are still open.
9. App Store and Google Play versions.
10. ~~Trash talk in groups~~ (built 2026-11-05, group chat). (~~Following players~~: built 2026-10-30.)
11. ~~Changing a screen name~~ (built 2026-11-05), props, ~~parlays~~ (built 2026-11-05), more admin
    tools (~~reported chat~~ built 2026-11-05; fixing a bad grade is still by hand).
12. ~~Closing line value~~ and ~~injuries and form on game pages~~: built
    2026-11-05. CLV on parlay legs is still open.

## How to work on it

- `cd picks-app && npm test` runs every test. `npm run demo` runs it locally.
- Node 22, no npm packages: built-in http server, built-in SQLite.
- Database changes go at the end of `MIGRATIONS` in `src/db.js`; never edit
  one that has shipped.
- Profile photos are files in `MEDIA_DIR`, not in the database: back both up.
- The README has the details: settings, file map, security notes.
