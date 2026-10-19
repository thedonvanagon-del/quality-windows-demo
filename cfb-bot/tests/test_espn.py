import unittest
from unittest import mock

from helpers import sample_games

from cfbbot import espn


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


class SportUrls(unittest.TestCase):
    def test_nfl_scoreboard_and_game_page(self):
        from datetime import date
        from cfbbot.sports import NFL
        with mock.patch.object(espn, "get_json", return_value=({"events": []}, {})) as get:
            espn.fetch_scoreboard(date(2026, 10, 18), NFL)
        url = get.call_args[0][0]
        self.assertIn("/football/nfl/scoreboard?", url)
        self.assertIn("dates=20261018", url)
        self.assertNotIn("groups", url)
        game = sample_games()["401700001"]
        with mock.patch.object(espn, "get_json", return_value=({}, {})) as get:
            espn.fetch_game_page(game, NFL)
        self.assertIn("/football/nfl/summary?event=401700001", get.call_args[0][0])

    def test_college_scoreboard_keeps_fbs(self):
        from datetime import date
        with mock.patch.object(espn, "get_json", return_value=({"events": []}, {})) as get:
            espn.fetch_scoreboard(date(2026, 10, 17))
        self.assertIn("/football/college-football/scoreboard?", get.call_args[0][0])
        self.assertIn("groups=80", get.call_args[0][0])


class GamePage(unittest.TestCase):
    def setUp(self):
        self.game = sample_games()["401700004"]  # TA&M (245) @ AUB (2)

    def test_fetched_by_event_id(self):
        with mock.patch.object(espn, "get_json", return_value=({"ok": 1}, {})) as get:
            self.assertEqual(espn.fetch_game_page(self.game), {"ok": 1})
        self.assertIn("event=401700004", get.call_args[0][0])

    def test_reads_the_pick_center(self):
        page = {"pickcenter": [
            {"provider": {"name": "no numbers"}},
            {"provider": {"name": "ESPN BET"}, "details": "TA&M -3.5", "overUnder": 47.5, "spread": 3.5},
        ]}
        self.assertEqual(espn.pregame_lines(page, self.game), (3.5, 47.5))

    def test_no_pick_center(self):
        self.assertEqual(espn.pregame_lines({}, self.game), (None, None))

    def test_team_yards(self):
        page = {"boxscore": {"teams": [
            {"team": {"id": "245"}, "statistics": [{"name": "totalYards", "displayValue": "1,012"}]},
            # no totalYards: passing plus rushing
            {"team": {"id": "2"}, "statistics": [{"name": "netPassingYards", "displayValue": "104"},
                                                 {"name": "rushingYards", "displayValue": "41"}]},
        ]}}
        self.assertEqual(espn.team_yards(page, self.game), (145, 1012))  # (home AUB, away TA&M)

    def test_team_yards_missing(self):
        one_side = {"boxscore": {"teams": [{"team": {"id": "245"}, "statistics": [{"name": "totalYards", "displayValue": "90"}]}]}}
        self.assertIsNone(espn.team_yards({}, self.game))
        self.assertIsNone(espn.team_yards(one_side, self.game))


if __name__ == "__main__":
    unittest.main()
