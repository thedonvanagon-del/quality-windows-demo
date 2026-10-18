import unittest
from dataclasses import replace
from datetime import timedelta

from helpers import SAMPLE_NOW, sample_games

from cfbbot import board, report, scan
from cfbbot.config import Config
from cfbbot.sports import ET, NCAAF, NFL
from cfbbot.state import State

MORNING = SAMPLE_NOW.replace(hour=14, minute=10)  # 10:10am ET Saturday
FRESH = "2026-10-17T14:00:00Z"


def spreads(key, title, home_point, home_price, away_price, home="Ole Miss Rebels", away="Oklahoma Sooners"):
    return {"key": key, "title": title, "markets": [{"key": "spreads", "last_update": FRESH, "outcomes": [
        {"name": home, "price": home_price, "point": home_point},
        {"name": away, "price": away_price, "point": -home_point},
    ]}]}


def event(*books):
    return {"id": "e1", "commence_time": "2026-10-17T20:00:00Z", "home_team": "Ole Miss Rebels",
            "away_team": "Oklahoma Sooners", "bookmakers": list(books)}


def games():
    """The sample slate as it looked at 10am: Ole Miss/Oklahoma still to play."""
    return [g for g in sample_games().values() if g.id == "401700005"]


class Find(unittest.TestCase):
    def test_a_better_number_than_pinnacle_makes_the_board(self):
        ev = event(
            spreads("pinnacle", "Pinnacle", -7.5, -105, -105),
            spreads("fanduel", "FanDuel", -6.0, -110, -110),
            spreads("draftkings", "DraftKings", -7.5, -110, -110),
        )
        (pick,) = board.find(games(), [ev], MORNING, NCAAF)
        self.assertEqual((pick.label, pick.quote.book, pick.basis), ("Ole Miss -6", "FanDuel", "Pinnacle"))
        self.assertEqual(pick.fair, -7.5)
        # Pinnacle no-vig is 50%. -7.5 to -6 picks up every 7-point win (3.5%)
        # and turns 6-point wins into pushes (1%): 54.5% at -110.
        self.assertAlmostEqual(pick.prob, 0.545)
        self.assertAlmostEqual(pick.edge, 0.545 * (1 + 100 / 110) - 1)
        self.assertEqual(pick.key, "401700005:spread:home:board")

    def test_a_point_off_a_dead_number_is_not_enough(self):
        ev = event(spreads("pinnacle", "Pinnacle", -10.5, -105, -105), spreads("fanduel", "FanDuel", -9.5, -110, -110))
        self.assertEqual(board.find(games(), [ev], MORNING, NCAAF), [])  # 52.25% at -110 loses money

    def test_a_better_price_counts_too(self):
        ev = event(spreads("pinnacle", "Pinnacle", -7.5, -110, -110), spreads("fanduel", "FanDuel", -6.5, +100, -120))
        (pick,) = board.find(games(), [ev], MORNING, NCAAF)
        self.assertAlmostEqual(pick.edge, 0.535 * 2.0 - 1)

    def test_nfl_points_through_zero_are_nearly_worthless(self):
        # The first live NFL board: Pinnacle Dallas -1, BetRivers Dallas +0.5.
        # A flat 3% a point called it +2.7%. Only a one-point Dallas win (and
        # a tie) changes the result, so it loses money at -110.
        ev = event(spreads("pinnacle", "Pinnacle", -1, -105, -105), spreads("betrivers", "BetRivers", 0.5, -110, -110))
        self.assertEqual(board.find(games(), [ev], MORNING, NFL), [])
        self.assertAlmostEqual(board.cover_gain(NFL, -1, 0.5), 0.003 + 0.0175 - 0.0175 / 2)

    def test_nfl_half_point_through_three_is_worth_a_lot(self):
        ev = event(spreads("pinnacle", "Pinnacle", -3.5, -105, -105), spreads("fanduel", "FanDuel", -2.5, -110, -110))
        (pick,) = board.find(games(), [ev], MORNING, NFL)
        self.assertAlmostEqual(pick.prob, 0.5 + 0.075)

    def test_matching_pinnacle_is_not_an_edge(self):
        ev = event(spreads("pinnacle", "Pinnacle", -7.5, -105, -105), spreads("fanduel", "FanDuel", -7.5, -110, -110))
        self.assertEqual(board.find(games(), [ev], MORNING, NCAAF), [])

    def test_without_pinnacle_it_needs_a_bigger_gap_from_the_pack(self):
        pack = [spreads(k, k.title(), -7.5, -110, -110) for k in ("draftkings", "betmgm", "betrivers")]
        good_vs_pinnacle = event(*pack, spreads("fanduel", "FanDuel", -6.5, -110, -110))
        self.assertEqual(board.find(games(), [good_vs_pinnacle], MORNING, NCAAF), [])  # 2.1% < 3%
        better = event(*pack, spreads("fanduel", "FanDuel", -6.0, -110, -110))
        (pick,) = board.find(games(), [better], MORNING, NCAAF)
        self.assertEqual((pick.basis, pick.quote.point), ("the market", -6.0))

    def test_way_off_lines_are_ignored(self):
        ev = event(spreads("pinnacle", "Pinnacle", -7.5, -105, -105), spreads("fanduel", "FanDuel", -3.5, -110, -110))
        self.assertEqual(board.find(games(), [ev], MORNING, NCAAF), [])  # 4 off: stale or wrong

    def test_started_games_and_stale_quotes_are_skipped(self):
        ev = event(spreads("pinnacle", "Pinnacle", -7.5, -105, -105), spreads("fanduel", "FanDuel", -6.5, -110, -110))
        self.assertEqual(board.find(games(), [ev], SAMPLE_NOW.replace(hour=20, minute=5), NCAAF), [])
        self.assertEqual(board.find(games(), [ev], MORNING + timedelta(hours=4), NCAAF), [])

    def test_only_your_books_get_picked(self):
        ev = event(spreads("pinnacle", "Pinnacle", -7.5, -105, -105), spreads("bovada", "Bovada", -6.5, -110, -110))
        self.assertEqual(board.find(games(), [ev], MORNING, NCAAF, user_books=("fanduel",)), [])


class MorningBoard(unittest.TestCase):
    def setUp(self):
        self.ev = event(spreads("pinnacle", "Pinnacle", -7.5, -105, -105), spreads("fanduel", "FanDuel", -6.0, -110, -110))
        self.cfg = Config(odds_api_key="k", bookmakers=("fanduel",))

    def test_sent_once_per_day_and_graded_in_the_recap(self):
        state, calls = State(), []

        def fetch():
            calls.append(1)
            return [self.ev], None

        message = scan.morning_board(self.cfg, state, MORNING, games(), fetch)
        self.assertIn("🔒 <b>CFB board</b> · Sat 10:10 AM ET", message)
        self.assertIn("<b>Ole Miss -6</b>  -110 at FanDuel", message)
        self.assertIn("Pinnacle has MISS -7.5. 1.5 pt better, about +4.0% EV.", message)
        self.assertIsNone(scan.morning_board(self.cfg, state, MORNING + timedelta(minutes=30), games(), fetch))
        self.assertEqual(len(calls), 1)

        final = replace(games()[0], state="post", completed=True)
        final.home, final.away = replace(final.home, score=31), replace(final.away, score=24)  # MISS by 7
        state.grade(scan.slate_day(MORNING), final)
        (alert,) = state.alerts(scan.slate_day(MORNING)).values()
        self.assertEqual((alert["label"], alert["result"]), ("Ole Miss -6 🔒", "win"))

    def test_not_before_the_window_opens(self):
        early = MORNING - timedelta(minutes=30)  # 9:40am
        self.assertIsNone(scan.morning_board(self.cfg, State(), early, games(), lambda: ([self.ev], None)))
        forced = scan.morning_board(self.cfg, State(), early, games(), lambda: ([self.ev], None), force=True)
        self.assertIn("Ole Miss -6", forced)

    def test_empty_board_still_says_so(self):
        flat = event(spreads("pinnacle", "Pinnacle", -7.5, -105, -105), spreads("fanduel", "FanDuel", -7.5, -110, -110))
        message = scan.morning_board(self.cfg, State(), MORNING, games(), lambda: ([flat], None))
        self.assertIn("Nothing on today's board beats the sharp number", message)

    def test_odds_failure_tries_again_next_scan(self):
        state = State()

        def broken():
            raise OSError("timed out")

        self.assertIsNone(scan.morning_board(self.cfg, state, MORNING, games(), broken))
        self.assertFalse(state.board_sent(scan.slate_day(MORNING)))

    def test_board_message_names_its_sport(self):
        from cfbbot.sports import NFL
        self.assertIn("🔒 <b>NFL board</b>", report.board_message(MORNING.astimezone(ET), [], NFL))


if __name__ == "__main__":
    unittest.main()
