import unittest
from datetime import datetime

from cfbbot import sports
from cfbbot.sports import ET, NCAAF, NFL


def et(*args):
    return datetime(*args, tzinfo=ET)


class Windows(unittest.TestCase):
    def test_college_saturday(self):
        self.assertIsNone(sports.window_start(NCAAF, et(2026, 10, 17, 9, 59)))
        self.assertEqual(sports.window_start(NCAAF, et(2026, 10, 17, 10, 0)), et(2026, 10, 17, 10, 0))
        self.assertEqual(sports.window_start(NCAAF, et(2026, 10, 18, 4, 29)), et(2026, 10, 17, 10, 0))
        self.assertIsNone(sports.window_start(NCAAF, et(2026, 10, 18, 4, 30)))
        self.assertIsNone(sports.window_start(NCAAF, et(2026, 10, 16, 20, 0)))  # Friday

    def test_nfl_days(self):
        self.assertIsNotNone(sports.window_start(NFL, et(2026, 10, 18, 9, 0)))    # Sunday morning
        self.assertIsNotNone(sports.window_start(NFL, et(2026, 10, 19, 0, 59)))   # Sunday night game
        self.assertIsNone(sports.window_start(NFL, et(2026, 10, 19, 1, 0)))
        self.assertIsNotNone(sports.window_start(NFL, et(2026, 10, 19, 20, 15)))  # Monday night
        self.assertIsNotNone(sports.window_start(NFL, et(2026, 10, 22, 20, 15)))  # Thursday night
        self.assertIsNone(sports.window_start(NFL, et(2026, 10, 21, 20, 15)))     # Wednesday

    def test_open_sports(self):
        self.assertEqual(sports.open_sports(et(2026, 10, 17, 14, 0)), [NCAAF, NFL])  # NFL Saturday window too
        self.assertEqual(sports.open_sports(et(2026, 10, 18, 13, 0)), [NFL])
        self.assertEqual(sports.open_sports(et(2026, 10, 21, 13, 0)), [])


if __name__ == "__main__":
    unittest.main()
