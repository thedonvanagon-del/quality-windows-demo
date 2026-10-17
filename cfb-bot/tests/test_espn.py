import unittest

from helpers import sample_games


class ParseScoreboard(unittest.TestCase):
    def setUp(self):
        self.games = sample_games()

    def test_live_game(self):
        g = self.games["401700001"]
        self.assertEqual(g.state, "in")
        self.assertEqual((g.away.abbr, g.away.score, g.home.abbr, g.home.score), ("TEX", 21, "UGA", 10))
        self.assertAlmostEqual(g.elapsed_minutes, 15 + 15 - 425 / 60)
        self.assertEqual(g.home.rank, 4)

    def test_ball_in_own_territory(self):
        g = self.games["401700001"]
        self.assertEqual(g.possession, g.away.id)
        self.assertEqual(g.yards_from_own_goal, 35)

    def test_ball_in_opponent_territory(self):
        g = self.games["401700004"]  # Auburn ball at the TA&M 22
        self.assertEqual(g.possession, g.home.id)
        self.assertEqual(g.yards_from_own_goal, 78)

    def test_halftime_is_thirty_minutes_in(self):
        g = self.games["401700002"]
        self.assertEqual(g.elapsed_minutes, 30)
        self.assertIsNone(g.possession)

    def test_pregame_lines_from_espn(self):
        self.assertEqual(self.games["401700001"].espn_home_spread, -7.5)  # "UGA -7.5", UGA home
        self.assertEqual(self.games["401700004"].espn_home_spread, 3.0)   # "TA&M -3", A&M away
        self.assertEqual(self.games["401700001"].espn_total, 52.5)

    def test_unranked_is_none(self):
        self.assertIsNone(self.games["401700002"].away.rank)  # ESPN sends 99

    def test_pre_and_post(self):
        pre, post = self.games["401700005"], self.games["401700007"]
        self.assertEqual((pre.state, pre.elapsed_minutes), ("pre", 0))
        self.assertTrue(post.completed)
        self.assertEqual(post.remaining_minutes, 0)


if __name__ == "__main__":
    unittest.main()
