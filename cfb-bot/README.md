# cfb-bot

College football and NFL picks on Telegram: a morning board of spreads that
beat the sharp line, then in-play picks every 30 minutes while games are on.
It runs on GitHub Actions, so nothing has to stay on at your place.

| | Morning board | In-play scans |
|---|---|---|
| College (FBS) | Saturday 10am ET | Saturday 10am to 4:30am |
| NFL | Sunday 9am ET | Sunday 9am to 1am |

Weekends only. Monday and Thursday night NFL games are skipped. The NFL's
December Saturday games get the same board and scans from 11am.

An in-play message looks like this:

```
🏈 CFB live · 3:05 PM ET · 4 live

Under 72.5 · TEX @ UGA  -108 at FanDuel
TEX 21, UGA 10 · 7:05 - 2nd · TEX ball, 2nd & 7 at TEX 35
Model total 66.3. 6.2 pts of value, 71% to hit.
31 pts in 23 min, on pace for 81. Closed 52.5. Model expects it to cool off.

Big gaps usually mean the book knows something: injury, weather, a QB change. Check before you bet.
```

Run `python -m cfbbot --demo` from this folder to see it on a sample Saturday.

## What you get on a game day

- **The morning board** 🔒: up to five spreads where one of your books hangs
  a better number than Pinnacle, the sharpest book there is. More on that
  below.
- **In-play picks** when a live line drifts far enough from the model. Each
  one comes with the best price it found and which book has it.
- **A short check-in** on scans with games live but nothing new. It lists
  earlier picks that still hold up. Turn it off with `CFB_HEARTBEAT=false`.
- **A recap** once the last game ends, with every pick graded, board picks
  (marked 🔒) included.
- Silence when nothing's on.

The same pick never gets sent twice in a day.

## Setup (about 10 minutes)

1. **Make the Telegram bot.** In Telegram, message `@BotFather`, send
   `/newbot`, and follow the prompts. It gives you a token like
   `123456:ABC-...`.
2. **Get your chat ID.** Send your new bot any message. Then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and copy the
   number after `"chat":{"id":`. For a group, add the bot to the group, post
   something, and use that chat's ID (it starts with a minus sign).
3. **Get an odds key** at [the-odds-api.com](https://the-odds-api.com). An
   in-play scan costs 3 credits and only happens while games are live or
   about to kick. A board costs 1. A college Saturday runs about 80 credits,
   an NFL Sunday about 60, so both sports come to roughly 600 a month. The
   free plan's 500 covers college alone; for both you need the smallest
   paid plan. When credits run out, boards stop and in-play falls back to
   the model's fair lines until the month resets.
4. **Add the secrets.** In this repo on GitHub: Settings → Secrets and
   variables → Actions → New repository secret. Add `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_CHAT_ID` and `ODDS_API_KEY`.
5. **Merge to `main`.** GitHub only runs schedules from the default branch.
6. **Test it.** Actions tab → cfb-bot → Run workflow → `test-telegram`. You
   should get a hello within a minute. The message and the run log both name
   the bot that sent it, so if nothing shows up, open your chat with that bot.
   `dry-run` prints a real scan to the run log without sending anything, and
   `board` sends a board right now for any sport with games left today.
   Every message the bot sends is also printed in that run's log.

## Tuning

Set these under Settings → Secrets and variables → Actions → **Variables**.
Leave any of them unset to keep the default.

| Variable | Default | What it does |
|---|---|---|
| `CFB_BOOKMAKERS` | DraftKings, FanDuel, BetMGM, Caesars, BetRivers, Fanatics | Only shop these books, e.g. `draftkings,fanduel`. Set it to the books you actually have. Keys: `draftkings`, `fanduel`, `betmgm`, `williamhill_us` (Caesars), `betrivers`, `fanatics`. `all` brings in offshore books too, but they often post pregame lines during games, and those read as fake edges. |
| `CFB_SPREAD_EDGE` | `6.0` | Points of value a side needs before it gets sent. |
| `CFB_TOTAL_EDGE` | `6.0` | Same for totals. |
| `CFB_HEARTBEAT` | `true` | `false` stays quiet unless there's a new pick. |

The defaults are strict on purpose. On the first live Saturday, gaps of 3 to 5
points against DraftKings and FanDuel were mostly the books knowing more than
the model, because they watch yards, drives and injuries and the model only
sees the score. A pick also needs at least two of your books posting a live
line. Expect quiet Saturdays. Watch the recaps for a few weeks before you
loosen anything.

## The morning board

There's no such thing as a lock, so the board doesn't predict who covers. It
does what professional bettors do: shop for a better number than the sharp
market.

Pinnacle takes the sharpest money in the world and moves on it, so its line
with the vig stripped out is the closest thing to a true price. When FanDuel
has Ole Miss -6 and Pinnacle has -7.5, that point and a half is worth real
money over time. The board prices each of your books' spreads against
Pinnacle's no-vig line and sends the best five that clear +1.5% expected value.

Not every point is worth the same. A gap only matters if the game can land
in it: -7.5 to -6.5 picks up every game decided by exactly 7, which happens a
lot, while -10.5 to -9.5 crosses a number games rarely end on. In the NFL,
half a point through 3 is worth about 7.5% cover chance, and -1 to +0.5 is
worth almost nothing because NFL games almost never tie. The board values
each half point by how often games end on that margin. At -110 a bet needs
52.4% to break even, so most one-point gaps off a dead number don't make it.
When Pinnacle has no line on a game, the bar is the median of your books
instead, and it takes +3%.

These are small edges. They pay off over hundreds of bets, not on any one
Saturday.

## How the in-play model thinks

The closing pregame line is the best read on how good two teams are. Live
prices tend to lean too hard on the scoreboard. So the bot prices the rest
of the game off the pregame line, adds what's already happened, and flags
spots where the live number has drifted too far.

- **Sides.** Expected final margin = current margin + how much better one
  team is x how much game is left + the value of the current possession.
  "How much better" starts at the pregame spread and moves toward what the
  yardage says as the game goes. By halftime the yards carry a fifth of the
  weight. A side also has to clear the threshold with the current possession
  left out, because the odds feed can trail the play-by-play by a few
  minutes. Uncertainty shrinks as the clock runs.
- **Totals.** Points so far + minutes left x a scoring rate. That rate leans
  hard on the pregame total all game, because a hot or cold start says less
  than it looks like. Yards count for half of what "so far" means, so a 3–0
  game where both offenses are moving the ball doesn't read as a dead one.
  It flags a total when the book chases the pace further than that.

Yards come from ESPN's box score, checked every scan. A college yard is worth
about 0.07 points (roughly 28 points per 400 yards), an NFL yard about 0.067.
NFL scores are less noisy than college ones, so the NFL model uses tighter
spreads around its numbers (13.5 points on the margin against college's 16).

It skips the last 10 minutes of every game and overtime. A one-score game can
go to OT, the trailing team hurries, and whoever has the ball matters more than
anything the model sees.

It doesn't know about injuries, weather, or a backup QB coming in. When the
market and the model disagree by a lot, that's often why. Look before you
bet. No model wins every week, so size your bets like you know that.

## Running it yourself

Standard library only, Python 3.10+. From this folder:

```
python -m unittest discover -s tests   # tests
python -m cfbbot --demo                # sample Saturday, no keys or network
python -m cfbbot --dry-run             # real scan of both sports, printed instead of sent
python -m cfbbot                       # real scan of both sports, sent to Telegram
python -m cfbbot --board               # morning board now, for any sport with games left today
python -m cfbbot --loop                # what GitHub runs: scan every 30 minutes while a window is open
```

## Things worth knowing

- Live scores come from ESPN's public scoreboard feeds. They're free and
  need no key, but ESPN doesn't document them and could change them.
- GitHub's scheduler is best effort. On the first Saturday it ran 4 of about
  20 half-hour slots. So a run doesn't scan once and quit: it keeps scanning
  every 30 minutes while a window is open and starts the next run before
  GitHub's 6-hour job limit. It also waits out gaps of up to 5 hours, so a
  run that starts as early as 6am Saturday holds for the 10am board, and
  Saturday night carries straight into NFL Sunday. One Saturday slot firing
  covers the whole weekend; the Sunday slots are a backup.
  To start one by hand: Actions → cfb-bot → Run workflow → `loop`.
- That costs nothing on a public repo. On a private one, a weekend runs
  about 45 hours of GitHub Actions minutes.
- The windows live in `cfbbot/sports.py`, in Eastern time.
- On a public repo, GitHub pauses schedules after 60 days with no commits.
  If the bot goes quiet after a long offseason, re-enable it from the
  Actions tab.
- State (pregame lines, picks already sent, one file per sport) lives in the
  Actions cache, not in git. Clearing the cache just means the next scan
  starts fresh.
