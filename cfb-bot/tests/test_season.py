import os
import tempfile
import unittest
from datetime import date, datetime, timezone

from cfbbot import report
from cfbbot.sports import NCAAF
from cfbbot.state import State, season_of


def alert(market, side, price, result):
    return {"game_id": "g", "market": market, "side": side, "point": 3.5, "price": price,
            "book": "FanDuel", "label": "pick", "final": "A 1, B 2", "result": result}


def slate(**alerts):
    return {"alerts": alerts, "recap_sent": True}


def season_state():
    state = State()
    state.data["slates"] = {
        "2026-10-17": slate(**{"g0:spread:home": alert("spread", "home", -110, "loss")}),  # before the record starts
        "2026-10-24": slate(**{
            "g1:spread:home": alert("spread", "home", -110, "win"),
            "g2:total:under": alert("total", "under", -120, "win"),
            "g3:total:over": alert("total", "over", -105, "loss"),
            "g4:spread:away:board": alert("spread", "away", +100, "push"),
            "g5:total:under": alert("total", "under", -110, None),  # never finished
        }),
    }
    return state


class SeasonRecord(unittest.TestCase):
    def test_by_bucket_with_units(self):
        record = season_state().season_record(date(2026, 11, 14))
        self.assertEqual(sorted(record), ["board", "overs", "spreads", "unders"])
        self.assertEqual(record["spreads"][:3], [1, 0, 0])
        self.assertAlmostEqual(record["spreads"][3], 100 / 110)
        self.assertAlmostEqual(record["unders"][3], 100 / 120)
        self.assertEqual(record["overs"], [0, 1, 0, -1.0])
        self.assertEqual(record["board"], [0, 0, 1, 0.0])

    def test_pruned_slates_stay_in_the_record(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = season_state()
            state.path = os.path.join(tmp, "state.json")
            before = state.season_record(date(2026, 11, 30))
            state.prune(datetime(2026, 11, 30, 12, tzinfo=timezone.utc))
            state.save()
            again = State.load(state.path)
            self.assertEqual(again.data["slates"], {})
            self.assertEqual(again.season_record(date(2026, 11, 30)), before)

    def test_bowls_belong_to_the_fall_season(self):
        self.assertEqual(season_of(date(2027, 1, 9)), 2026)
        self.assertEqual(season_of(date(2027, 9, 4)), 2027)
        self.assertEqual(season_state().season_record(date(2027, 9, 4)), {})


class RecapSeasonLine(unittest.TestCase):
    def test_recap_ends_with_the_season(self):
        state = season_state()
        day = date(2026, 10, 24)
        alerts = list(state.alerts(day).values())
        text = report.recap_message(day, alerts, NCAAF, state.season_record(day))
        lines = text.split("\n")
        self.assertEqual(lines[-2], "<b>Season</b> · 2-1-1 · +0.7 units, 1 a pick")
        self.assertEqual(lines[-1], "Spreads 1-0 +0.9 · Overs 0-1 -1.0 · Unders 1-0 +0.8 · Board 🔒 0-0-1 +0.0")

    def test_no_season_line_without_a_record(self):
        day = date(2026, 10, 24)
        text = report.recap_message(day, list(season_state().alerts(day).values()), NCAAF, {})
        self.assertNotIn("Season", text)


if __name__ == "__main__":
    unittest.main()
