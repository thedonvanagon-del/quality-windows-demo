import unittest
from dataclasses import replace

from helpers import SAMPLE_NOW, sample_event, sample_events, sample_games

from cfbbot import odds
from cfbbot.util import implied


class Summarize(unittest.TestCase):
    def test_consensus_and_best_price(self):
        lines = odds.summarize(sample_event("evt-uga-tex"), "Georgia Bulldogs", "Texas Longhorns", SAMPLE_NOW, live=True)
        self.assertEqual(lines.books, 2)  # BetMGM's quotes are 25 minutes old
        self.assertEqual(lines.home_spread, 11.5)
        self.assertEqual(lines.total, 72.5)
        self.assertEqual((lines.best["home"].book, lines.best["home"].price), ("FanDuel", -105))
        self.assertEqual((lines.best["under"].book, lines.best["under"].price), ("FanDuel", -108))
        self.assertEqual(lines.best["ml_home"].price, 340)
        self.assertLess(lines.home_win_prob, 0.25)

    def test_pregame_lines_skip_the_freshness_check(self):
        lines = odds.summarize(sample_event("evt-miss-ou"), "Mississippi Rebels", "Oklahoma Sooners", SAMPLE_NOW, live=False)
        self.assertEqual((lines.home_spread, lines.total), (-6.5, 59.0))

    def test_best_number_beats_best_price(self):
        lines = odds.summarize(sample_event("evt-ala-lsu"), "Alabama Crimson Tide", "LSU Tigers", SAMPLE_NOW, live=True)
        self.assertEqual(lines.best["home"].point, -7.0)   # ALA -7 beats -7.5
        self.assertEqual(lines.best["away"].point, 7.5)    # LSU +7.5 beats +7
        self.assertEqual(lines.best["over"].point, 50.5)
        self.assertEqual(lines.best["under"].point, 51.0)

    def test_outlier_books_are_not_shopped(self):
        event = sample_event("evt-uga-tex")
        stale = event["bookmakers"][2]
        for market in stale["markets"]:
            market["last_update"] = "2026-10-17T19:04:00Z"
        lines = odds.summarize(event, "Georgia Bulldogs", "Texas Longhorns", SAMPLE_NOW, live=True)
        self.assertEqual(lines.best["home"].point, 11.5)  # BetMGM's +14.5 is 3 off the pack
        self.assertEqual(lines.best["under"].point, 72.5)  # BetMGM's 76.5 is 4 off

    def test_implied(self):
        self.assertAlmostEqual(implied(-110), 0.5238, places=4)
        self.assertAlmostEqual(implied(150), 0.4)


class Match(unittest.TestCase):
    def setUp(self):
        self.games = sample_games()

    def test_sample_pairs(self):
        pairs = odds.match(list(self.games.values()), sample_events())
        names = {gid: (home, away) for gid, (_, home, away) in pairs.items()}
        self.assertEqual(names["401700001"], ("Georgia Bulldogs", "Texas Longhorns"))
        self.assertEqual(names["401700004"], ("Auburn Tigers", "Texas A&M Aggies"))
        self.assertEqual(names["401700005"], ("Mississippi Rebels", "Oklahoma Sooners"))
        self.assertNotIn("401700007", names)  # no odds for Ohio State

    def test_same_mascot_is_not_enough(self):
        auburn_game = self.games["401700004"]
        memphis = [e for e in sample_events() if e["id"] == "evt-memphis-tulane"]
        self.assertEqual(odds.match([auburn_game], memphis), {})

    def test_neutral_site_flip(self):
        g = self.games["401700001"]
        flipped = replace(g, home=g.away, away=g.home)
        pairs = odds.match([flipped], [sample_event("evt-uga-tex")])
        _, home, away = pairs[g.id]
        self.assertEqual((home, away), ("Texas Longhorns", "Georgia Bulldogs"))

    def test_team_name_variants(self):
        g = self.games["401700005"]
        self.assertEqual(odds.team_match(g.home, "Ole Miss Rebels"), 1.0)
        self.assertEqual(odds.team_match(g.home, "Mississippi Rebels"), 1.0)
        self.assertLess(odds.team_match(g.home, "Mississippi State Bulldogs"), odds.MIN_TEAM_MATCH)
        hawaii = replace(g.home, location="Hawai'i", mascot="Rainbow Warriors", abbr="HAW")
        self.assertEqual(odds.team_match(hawaii, "Hawaii Rainbow Warriors"), 1.0)


if __name__ == "__main__":
    unittest.main()
