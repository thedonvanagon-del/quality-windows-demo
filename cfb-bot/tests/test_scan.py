import os
import tempfile
import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone

from helpers import SAMPLE_NOW, sample_events, sample_games

from cfbbot import odds, scan
from cfbbot.config import Config
from cfbbot.state import State

CFG = Config(odds_api_key="test")


def run(state, games=None, fetch_odds=None, cfg=CFG, now=SAMPLE_NOW):
    games = list((games or sample_games()).values())
    return scan.run(cfg, state, now, lambda day: games, fetch_odds or (lambda: (sample_events(), "450")))


class Scan(unittest.TestCase):
    def test_first_scan_sends_picks_and_saves_pregame_lines(self):
        state = State()
        result = run(state)
        self.assertEqual(len(result.messages), 1)
        message = result.messages[0]
        self.assertIn("<b>Georgia +11.5</b>  -105 at FanDuel", message)
        self.assertIn("<b>Under 76.5 · TEX @ UGA</b>", message)
        self.assertEqual(state.pregame("401700005"), {"home_spread": -6.5, "total": 59.0, "updated": SAMPLE_NOW.isoformat()})
        self.assertIn("odds credits left: 450", result.summary)

    def test_second_scan_does_not_repeat_itself(self):
        state = State()
        run(state)
        message = run(state).messages[0]
        self.assertIn("Nothing new worth a bet", message)
        self.assertIn("Still good from earlier: Under 76.5", message)
        self.assertNotIn("<b>Georgia", message)

    def test_quiet_when_heartbeat_is_off(self):
        state = State()
        run(state)
        self.assertEqual(run(state, cfg=replace(CFG, heartbeat=False)).messages, [])

    def test_escapes_html(self):
        message = run(State(), cfg=Config()).messages[0]
        self.assertIn("TA&amp;M 10", message)
        self.assertNotIn("TA&M 10", message)

    def test_no_key_sends_fair_lines(self):
        message = run(State(), cfg=Config()).messages[0]
        self.assertIn("No ODDS_API_KEY set.", message)
        self.assertIn("Fair: TEX -7.9 · total 71.1", message)

    def test_odds_outage_falls_back_to_fair_lines(self):
        def broken():
            raise odds.OddsError("The Odds API returned 401: quota exhausted")
        message = run(State(), fetch_odds=broken).messages[0]
        self.assertIn("Odds feed failed this round (The Odds API returned 401: quota exhausted)", message)
        self.assertIn("Fair: ", message)

    def test_pregame_line_we_saw_beats_espn(self):
        state = State()
        state.set_pregame("401700001", -10.5, None, SAMPLE_NOW)
        message = run(state).messages[0]
        self.assertIn("Closed UGA -10.5", message)
        self.assertIn("Closed 52.5", message)  # no total saved, so ESPN's

    def test_no_odds_call_when_nothing_is_live_or_close(self):
        games = {gid: g for gid, g in sample_games().items() if g.state == "post"}
        calls = []
        result = run(State(), games=games, fetch_odds=lambda: calls.append(1) or ([], None))
        self.assertEqual((calls, result.messages), ([], []))


class Recap(unittest.TestCase):
    def finals(self, uga_home, tex_away):
        games = sample_games()
        for gid, g in games.items():
            games[gid] = replace(g, state="post", completed=True, period=4, clock_seconds=0, detail="Final")
        uga = games["401700001"]
        uga.home, uga.away = replace(uga.home, score=uga_home), replace(uga.away, score=tex_away)
        games["401700006"] = replace(games["401700006"], completed=False, detail="Postponed")
        return games

    def test_recap_grades_picks_once(self):
        state = State()
        run(state)
        later = SAMPLE_NOW + timedelta(hours=8)
        # Texas by 11: Georgia +11.5 wins by half a point. 59 total: under 76.5 cashes.
        result = run(state, games=self.finals(24, 35), now=later)
        self.assertEqual(len(result.messages), 1)
        recap = result.messages[0]
        self.assertIn("<b>Saturday recap</b> · 2-0", recap)
        self.assertIn("✅ Georgia +11.5 -105 · TEX 35, UGA 24", recap)
        self.assertEqual(run(state, games=self.finals(24, 35), now=later).messages, [])

    def test_loss_and_push(self):
        state = State()
        run(state)
        later = SAMPLE_NOW + timedelta(hours=8)
        recap = run(state, games=self.finals(40, 37), now=later).messages[0]  # 77 total, UGA by 3
        self.assertIn("1-1", recap)
        self.assertIn("❌ Under 76.5", recap)

    def test_no_recap_while_night_games_are_coming(self):
        state = State()
        run(state)
        games = self.finals(24, 35)
        games["401700006"] = replace(games["401700006"], state="pre", completed=False)
        self.assertEqual(run(state, games=games, now=SAMPLE_NOW + timedelta(hours=1)).messages, [])


class SlateDay(unittest.TestCase):
    def test_late_games_belong_to_saturday(self):
        sunday_2am_et = datetime(2026, 10, 18, 6, 0, tzinfo=timezone.utc)
        self.assertEqual(scan.slate_day(sunday_2am_et).isoformat(), "2026-10-17")
        self.assertEqual(scan.slate_day(SAMPLE_NOW).isoformat(), "2026-10-17")


class StateFile(unittest.TestCase):
    def test_round_trip_and_prune(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "state", "state.json")
            state = State.load(path)
            run(state)
            state.set_pregame("old-game", -3.0, 50.0, SAMPLE_NOW - timedelta(days=10))
            state.prune(SAMPLE_NOW)
            state.save()
            again = State.load(path)
            self.assertEqual(again.pregame("old-game"), {})
            self.assertEqual(len(again.alerts(scan.slate_day(SAMPLE_NOW))), 2)


class ConfigFromEnv(unittest.TestCase):
    def test_empty_strings_mean_defaults(self):
        cfg = Config.from_env({"CFB_SPREAD_EDGE": "", "CFB_TOTAL_EDGE": "", "CFB_HEARTBEAT": "", "CFB_BOOKMAKERS": ""})
        self.assertEqual((cfg.spread_edge, cfg.total_edge, cfg.heartbeat, cfg.bookmakers), (3.5, 5.0, True, ()))

    def test_overrides(self):
        cfg = Config.from_env({"CFB_SPREAD_EDGE": "4", "CFB_HEARTBEAT": "false", "CFB_BOOKMAKERS": "DraftKings, fanduel"})
        self.assertEqual((cfg.spread_edge, cfg.heartbeat, cfg.bookmakers), (4.0, False, ("draftkings", "fanduel")))

    def test_bad_number(self):
        with self.assertRaises(SystemExit):
            Config.from_env({"CFB_SPREAD_EDGE": "lots"})


if __name__ == "__main__":
    unittest.main()
