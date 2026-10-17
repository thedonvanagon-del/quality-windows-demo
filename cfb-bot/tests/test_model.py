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
        self.assertAlmostEqual(model.fair_total(g, 55.5, (0, 0)), 55.5)
        self.assertAlmostEqual(model.fair_home_margin(g, -10.5, (0, 0)), 10.5)

    def test_yards_move_the_margin_toward_the_team_moving_the_ball(self):
        g = self.games["401700002"]  # halftime, ALA 14 LSU 13, closed ALA -10.5
        base = model.fair_home_margin(g, -10.5)
        self.assertGreater(model.fair_home_margin(g, -10.5, (350, 150)), base)
        self.assertLess(model.fair_home_margin(g, -10.5, (150, 350)), base)
        # Even yards at the half: the pregame edge shrinks to four fifths.
        self.assertAlmostEqual(model.fair_home_margin(g, -10.5, (250, 250)), 1 + 10.5 * 120 / 150 * 30 / 60)

    def test_yards_count_for_half_the_pace(self):
        g = self.games["401700002"]  # 27 points at the half
        observed = (27 + 600 * model.PTS_PER_YARD) / 2
        expected = 27 + (55.5 / 60 * model.PRIOR_MINUTES + observed) / (model.PRIOR_MINUTES + 30) * 30
        self.assertAlmostEqual(model.fair_total(g, 55.5, (300, 300)), expected)

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

    def test_possession_alone_cannot_make_a_side_pick(self):
        # Georgia ball at the Texas 10 is worth about 5 points to the model.
        # Without it, Georgia +11.5 is about 5.1 points of value.
        uga_ball = replace(self.uga, possession=self.uga.home.id, yards_from_own_goal=90)
        self.assertEqual(model.find_picks(uga_ball, self.lines, -7.5, None, 6.0, 99), [])
        (side,) = model.find_picks(uga_ball, self.lines, -7.5, None, 5.0, 99)
        self.assertAlmostEqual(side.edge, 11.5 - 11 + 7.5 * (self.uga.remaining_minutes / 60), places=6)

    def test_one_book_is_not_enough(self):
        self.lines.books = 1
        self.assertEqual(model.find_picks(self.uga, self.lines, -7.5, 52.5, 3.5, 5.0), [])

    def test_no_picks_late_or_in_overtime(self):
        late = replace(self.uga, period=4, clock_seconds=9 * 60)  # 9:00 left
        overtime = replace(self.uga, period=5, clock_seconds=0)
        self.assertEqual(model.find_picks(late, self.lines, -7.5, 52.5, 0, 0), [])
        self.assertEqual(model.find_picks(overtime, self.lines, -7.5, 52.5, 0, 0), [])

    def test_no_pregame_line_no_pick_on_that_market(self):
        picks = model.find_picks(self.uga, self.lines, None, 52.5, 3.5, 5.0)
        self.assertEqual([p.market for p in picks], ["total"])


if __name__ == "__main__":
    unittest.main()
