# cfb-bot

Scans live college football every 30 minutes on Saturdays and texts you
in-play bets on Telegram. It runs on GitHub Actions, so nothing has to stay
on at your place.

A message looks like this:

```
🏈 CFB live · 3:05 PM ET · 4 live

Under 72.5 · TEX @ UGA  -108 at FanDuel
TEX 21, UGA 10 · 7:05 - 2nd · TEX ball, 2nd & 7 at TEX 35
Model total 66.3. 6.2 pts of value, 71% to hit.
31 pts in 23 min, on pace for 81. Closed 52.5. Model expects it to cool off.

Big gaps usually mean the book knows something: injury, weather, a QB change. Check before you bet.
```

Run `python -m cfbbot --demo` from this folder to see it on a sample Saturday.

## What you get on a Saturday

- **Picks** when a live line drifts far enough from the model. Each one comes
  with the best price it found and which book has it.
- **A short check-in** on scans with games live but nothing new. It lists
  earlier picks that still hold up. Turn it off with `CFB_HEARTBEAT=false`.
- **A recap** once the last game ends, with every pick graded.
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
3. **Get an odds key** at [the-odds-api.com](https://the-odds-api.com). The
   free plan gives 500 credits a month. Each scan costs 3, and the bot only
   calls it while games are live or about to kick. A full Saturday runs
   about 80 credits, so a five-Saturday month gets close to the cap.
   Without a key the bot still runs and sends the model's fair lines for you
   to compare against your book by hand.
4. **Add the secrets.** In this repo on GitHub: Settings → Secrets and
   variables → Actions → New repository secret. Add `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_CHAT_ID` and `ODDS_API_KEY`.
5. **Merge to `main`.** GitHub only runs schedules from the default branch.
6. **Test it.** Actions tab → cfb-bot → Run workflow → `test-telegram`. You
   should get a hello within a minute. `dry-run` prints a real scan to the
   run log without sending anything.

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

## How the model thinks

The closing pregame line is the best read on how good two teams are. Live
prices tend to lean too hard on the scoreboard. So the bot prices the rest
of the game off the pregame line, adds what's already happened, and flags
spots where the live number has drifted too far.

- **Sides.** Expected final margin = current margin + the pregame spread
  scaled by how much game is left + the value of the current possession.
  Uncertainty shrinks as the clock runs.
- **Totals.** Points so far + minutes left x a scoring rate. That rate leans
  hard on the pregame total all game, because a hot or cold start says less
  than it looks like. It flags a total when the book chases the early pace
  further than that.

It skips games in the last 4 minutes and in overtime. Clock management
decides those, and the model doesn't see it.

It doesn't know about injuries, weather, or a backup QB coming in. When the
market and the model disagree by a lot, that's often why. Look before you
bet. No model wins every week, so size your bets like you know that.

## Running it yourself

Standard library only, Python 3.10+. From this folder:

```
python -m unittest discover -s tests   # tests
python -m cfbbot --demo                # sample Saturday, no keys or network
python -m cfbbot --dry-run             # real scan, printed instead of sent
python -m cfbbot                       # real scan, sent to Telegram
```

## Things worth knowing

- Live scores come from ESPN's public scoreboard feed. It's free and
  needs no key, but ESPN doesn't document it and could change it.
- GitHub can start scheduled runs 5 to 15 minutes late when it's busy.
- On a public repo, GitHub pauses schedules after 60 days with no commits.
  If the bot goes quiet after a long offseason, re-enable it from the
  Actions tab.
- State (pregame lines, picks already sent) lives in the Actions cache, not
  in git. Clearing the cache just means the next scan starts fresh.
