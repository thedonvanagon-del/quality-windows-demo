import os
import tempfile
import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone

from helpers import SAMPLE_NOW, sample_events, sample_games

from cfbbot import odds, scan
from cfbbot.config import Config
from cfbbot.state import State

# The original thresholds, so these tests keep exercising both a side and a
# total from the sample game. ConfigFromEnv checks the real defaults.
CFG = Config(odds_api_key="test", spread_edge=3.5, total_edge=5.0)


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
        self.assertIn("<b>Under 72.5 · TEX @ UGA</b>", message)
        # ESPN said MISS -6 / 58.5; the books' consensus replaced it.
        self.assertEqual(state.pregame("401700005"),
                         {"home_spread": -6.5, "total": 59.0, "updated": SAMPLE_NOW.isoformat(), "source": "odds"})
        self.assertEqual(state.pregame("401700006")["home_spread"], -9.5)  # not soon: ESPN's line, saved for later
        self.assertIn("odds credits left: 450", result.summary)

    def test_second_scan_does_not_repeat_itself(self):
        state = State()
        run(state)
        message = run(state).messages[0]
        self.assertIn("Nothing new worth a bet", message)
        self.assertIn("Still good from earlier: Under 72.5", message)
        self.assertNotIn("<b>Georgia", message)

    def test_default_thresholds_are_strict(self):
        message = run(State(), cfg=Config(odds_api_key="test")).messages[0]
        self.assertIn("<b>Under 72.5 · TEX @ UGA</b>", message)  # 6.2 pts clears 6
        self.assertNotIn("<b>Georgia +11.5</b>", message)        # 3.6 pts doesn't

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
        self.assertIn("· 4 live", message)
        self.assertIn("Fair: TEX -7.9 · total 66.3", message)
        self.assertNotIn("IOWA 13, WIS 17", message)  # 2:30 left: too late to price

    def test_no_fair_lines_when_nothing_is_priceable(self):
        games = {gid: g for gid, g in sample_games().items() if gid in ("401700003", "401700005")}
        games["401700005"] = replace(games["401700005"], state="in", period=5, clock_seconds=0)  # overtime
        self.assertEqual(run(State(), games=games, cfg=Config()).messages, [])

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

    def test_espn_never_overwrites_the_books(self):
        state = State()
        run(state)
        run(state)
        self.assertEqual(state.pregame("401700005")["source"], "odds")
        self.assertEqual(state.pregame("401700005")["home_spread"], -6.5)

    def test_game_page_fills_a_missing_line_once_and_brings_yards(self):
        games = sample_games()
        games["401700001"] = replace(games["401700001"], espn_home_spread=None, espn_total=None)
        box = {"teams": [
            {"team": {"id": "61"}, "statistics": [{"name": "totalYards", "displayValue": "150"}]},
            {"team": {"id": "251"}, "statistics": [{"name": "totalYards", "displayValue": "210"}]},
        ]}
        pages = {"401700001": {"pickcenter": [{"details": "UGA -7.5", "overUnder": 52.5}], "boxscore": box}}
        asked = []

        def fetch_page(game):
            asked.append(game.id)
            return pages.get(game.id, {})

        state = State()
        first = scan.run(CFG, state, SAMPLE_NOW, lambda day: list(games.values()), lambda: (sample_events(), None), fetch_page)
        pages["401700001"]["pickcenter"] = [{"details": "UGA -3.5", "overUnder": 49.5}]
        second = scan.run(CFG, state, SAMPLE_NOW, lambda day: list(games.values()), lambda: (sample_events(), None), fetch_page)
        self.assertEqual(state.pregame("401700001")["home_spread"], -7.5)  # saved once, not overwritten
        self.assertEqual(asked.count("401700001"), 2)  # yards every scan
        self.assertNotIn("401700003", asked)           # 2:30 left: can't be priced, so no page
        self.assertIn("4 live (4 with a pregame line, 1 with yards)", second.summary)
        self.assertIn("yards TEX 210, UGA 150", first.summary)
        self.assertIn("Yards: TEX 210, UGA 150", first.messages[0])

    def test_espn_game_page_failure_is_not_fatal(self):
        games = sample_games()
        games["401700001"] = replace(games["401700001"], espn_home_spread=None, espn_total=None)

        def broken(game):
            raise OSError("timed out")

        def garbled(game):
            raise ValueError("Expecting value: line 1 column 1")

        for fetch_page in (broken, garbled):
            result = scan.run(Config(), State(), SAMPLE_NOW, lambda day: list(games.values()), None, fetch_page)
            self.assertIn("3 with a pregame line, 0 with yards", result.summary)
            self.assertIn("Fair: no pregame line to work from", result.messages[0])

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
        # Texas by 11: Georgia +11.5 wins by half a point. 59 total: under 72.5 cashes.
        result = run(state, games=self.finals(24, 35), now=later)
        self.assertEqual(len(result.messages), 1)
        recap = result.messages[0]
        self.assertIn("<b>CFB Saturday recap</b> · 2-0", recap)
        self.assertIn("✅ Georgia +11.5 -105 · TEX 35, UGA 24", recap)
        self.assertEqual(run(state, games=self.finals(24, 35), now=later).messages, [])

    def test_loss_and_push(self):
        state = State()
        run(state)
        later = SAMPLE_NOW + timedelta(hours=8)
        recap = run(state, games=self.finals(40, 37), now=later).messages[0]  # 77 total, UGA by 3
        self.assertIn("1-1", recap)
        self.assertIn("❌ Under 72.5", recap)

    def test_no_recap_while_night_games_are_coming(self):
        state = State()
        run(state)
        games = self.finals(24, 35)
        games["401700006"] = replace(games["401700006"], state="pre", completed=False)
        self.assertEqual(run(state, games=games, now=SAMPLE_NOW + timedelta(hours=1)).messages, [])


class FakeClock:
    def __init__(self, start):
        self.now = start
        self.scans = 0

    def __call__(self):
        return self.now

    def sleep(self, seconds):
        self.now += timedelta(seconds=seconds)

    def scan(self):
        self.scans += 1
        self.now += timedelta(seconds=20)


class KeepScanning(unittest.TestCase):
    def test_runs_until_the_window_closes(self):
        clock = FakeClock(datetime(2026, 10, 18, 22, 0, tzinfo=scan.ET))  # Sunday night game
        self.assertFalse(scan.keep_scanning(clock.scan, now=clock, sleep=clock.sleep))
        self.assertEqual(clock.scans, 6)  # 10:00, 10:30 ... 12:30
        self.assertLess(clock.now, datetime(2026, 10, 19, 1, 0, tzinfo=scan.ET))

    def test_hands_off_before_the_six_hour_limit(self):
        clock = FakeClock(datetime(2026, 10, 17, 12, 0, tzinfo=scan.ET))  # noon Saturday
        self.assertTrue(scan.keep_scanning(clock.scan, now=clock, sleep=clock.sleep))
        self.assertEqual(clock.scans, 12)
        self.assertLess(clock.now - datetime(2026, 10, 17, 12, 0, tzinfo=scan.ET), timedelta(hours=6))

    def test_outside_every_window_it_does_nothing(self):
        clock = FakeClock(datetime(2026, 10, 21, 12, 7, tzinfo=scan.ET))  # Wednesday
        self.assertFalse(scan.keep_scanning(clock.scan, now=clock, sleep=clock.sleep))
        self.assertEqual(clock.scans, 0)

    def test_carries_from_saturday_night_into_nfl_sunday(self):
        # College closes at 4:30am and the NFL opens at 9. A run going at 1am
        # doesn't quit in between: it hands off to a fresh run that waits.
        clock = FakeClock(datetime(2026, 10, 18, 1, 0, tzinfo=scan.ET))
        self.assertTrue(scan.keep_scanning(clock.scan, now=clock, sleep=clock.sleep))
        self.assertGreater(clock.now, datetime(2026, 10, 18, 4, 30, tzinfo=scan.ET))
        self.assertTrue(scan.stay_up(datetime(2026, 10, 18, 6, 40, tzinfo=scan.ET)))

    def test_an_early_saturday_start_waits_for_the_board(self):
        self.assertTrue(scan.stay_up(datetime(2026, 10, 17, 6, 7, tzinfo=scan.ET)))   # board at 10
        self.assertFalse(scan.stay_up(datetime(2026, 10, 17, 4, 7, tzinfo=scan.ET)))  # too early to wait
        self.assertFalse(scan.stay_up(datetime(2026, 10, 19, 1, 7, tzinfo=scan.ET)))  # after Sunday night

    def test_a_failed_scan_does_not_end_the_night(self):
        clock = FakeClock(datetime(2026, 10, 18, 23, 0, tzinfo=scan.ET))  # Sunday night
        calls = []

        def flaky():
            calls.append(1)
            clock.now += timedelta(seconds=20)
            if len(calls) == 1:
                raise OSError("ESPN timed out")

        self.assertFalse(scan.keep_scanning(flaky, now=clock, sleep=clock.sleep))
        self.assertEqual(len(calls), 4)  # 11:00 (failed), 11:30, 12:00, 12:30


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
        self.assertEqual((cfg.spread_edge, cfg.total_edge, cfg.heartbeat), (6.0, 6.0, True))
        self.assertIn("draftkings", cfg.bookmakers)
        self.assertNotIn("mybookieag", cfg.bookmakers)

    def test_all_books(self):
        self.assertEqual(Config.from_env({"CFB_BOOKMAKERS": "all"}).bookmakers, ())

    def test_overrides(self):
        cfg = Config.from_env({"CFB_SPREAD_EDGE": "4", "CFB_HEARTBEAT": "false", "CFB_BOOKMAKERS": "DraftKings, fanduel"})
        self.assertEqual((cfg.spread_edge, cfg.heartbeat, cfg.bookmakers), (4.0, False, ("draftkings", "fanduel")))

    def test_bad_number(self):
        with self.assertRaises(SystemExit):
            Config.from_env({"CFB_SPREAD_EDGE": "lots"})


if __name__ == "__main__":
    unittest.main()
