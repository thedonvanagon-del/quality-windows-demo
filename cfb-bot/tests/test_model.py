import unittest
from dataclasses import replace

from helpers import SAMPLE_NOW, sample_event, sample_games

from cfbbot import model, odds


class FairLines(unittest.TestCase):
    def setUp(self):
        self.games = sample_games()

    def test_at_kickoff_fair_lines_are_the_pregame_lines(self):
        g = replace(self.games["401700002"], period=1, clock_seconds=900)
        g.home, g.away = replace(g.home, score=0), replace(g.away, score=0)
        self.assertAlmostEqual(model.fair_total(g, 55.5), 55.5)
        self.assertAlmostEqual(model.fair_home_margin(g, -10.5), 10.5)

    def test_halftime_total_leans_on_the_pregame_pace(self):
        # 38 points at the half against a 52 total: pregame rate says 26 more,
        # observed rate says 38 more, the model says 28.4.
        g = self.games["401700002"]
        g.home, g.away = replace(g.home, score=20), replace(g.away, score=18)
        self.assertAlmostEqual(model.fair_total(g, 52.0), 66.4)

    def test_possession_counts(self):
        g = self.games["401700004"]  # Auburn (home) ball at the A&M 22
        without = model.fair_home_margin(replace(g, possession=None), 3.0)
        self.assertAlmostEqual(model.fair_home_margin(g, 3.0) - without, model.expected_points(78))

    def test_expected_points_rises_toward_the_goal_line(self):
        values = [model.expected_points(y) for y in (5, 20, 50, 80, 99)]
        self.assertEqual(values, sorted(values))


class FindPicks(unittest.TestCase):
    def setUp(self):
        self.games = sample_games()
        self.uga = self.games["401700001"]
        self.lines = odds.summarize(sample_event("evt-uga-tex"), "Georgia Bulldogs", "Texas Longhorns", SAMPLE_NOW, live=True)

    def test_sample_game_gives_a_side_and_a_total(self):
        picks = {p.key: p for p in model.find_picks(self.uga, self.lines, -7.5, 52.5, 3.5, 5.0)}
        side, total = picks["401700001:spread:home"], picks["401700001:total:under"]
        self.assertEqual((side.label, side.quote.book, side.quote.price), ("Georgia +11.5", "FanDuel", -105))
        self.assertAlmostEqual(side.edge, 3.64, places=2)
        self.assertEqual(side.ml.price, 340)
        self.assertEqual(total.quote.point, 72.5)
        self.assertAlmostEqual(total.edge, 6.2, places=1)

    def test_thresholds_hold_picks_back(self):
        self.assertEqual(model.find_picks(self.uga, self.lines, -7.5, 52.5, 4.0, 7.0), [])

    def test_no_moneyline_mention_for_long_shots(self):
        self.lines.best["ml_home"].price = 3500
        side = next(p for p in model.find_picks(self.uga, self.lines, -7.5, 52.5, 3.5, 5.0) if p.market == "spread")
        self.assertIsNone(side.ml)

    def test_one_book_is_not_enough(self):
        self.lines.books = 1
        self.assertEqual(model.find_picks(self.uga, self.lines, -7.5, 52.5, 3.5, 5.0), [])

    def test_no_picks_late_or_in_overtime(self):
        late = replace(self.uga, period=4, clock_seconds=200)
        overtime = replace(self.uga, period=5, clock_seconds=0)
        self.assertEqual(model.find_picks(late, self.lines, -7.5, 52.5, 0, 0), [])
        self.assertEqual(model.find_picks(overtime, self.lines, -7.5, 52.5, 0, 0), [])

    def test_no_pregame_line_no_pick_on_that_market(self):
        picks = model.find_picks(self.uga, self.lines, None, 52.5, 3.5, 5.0)
        self.assertEqual([p.market for p in picks], ["total"])


if __name__ == "__main__":
    unittest.main()
