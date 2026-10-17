"""What the bot remembers between scans: pregame lines it saw before kickoff,
picks it already sent (so it doesn't repeat itself), and how they finished.

On GitHub Actions this file rides between runs in the Actions cache."""

import json
import os
from datetime import date, timedelta

from .util import parse_time


class State:
    def __init__(self, path=None, data=None):
        self.path = path
        self.data = data or {}
        self.data.setdefault("pregame", {})
        self.data.setdefault("slates", {})

    @classmethod
    def load(cls, path):
        try:
            with open(path) as f:
                return cls(path, json.load(f))
        except FileNotFoundError:
            return cls(path)
        except json.JSONDecodeError:
            print(f"warning: {path} is not valid JSON, starting fresh")
            return cls(path)

    def save(self):
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        tmp = self.path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(self.data, f, indent=1, sort_keys=True)
        os.replace(tmp, self.path)

    def pregame(self, game_id):
        return self.data["pregame"].get(game_id, {})

    def has_pregame(self, game_id):
        return game_id in self.data["pregame"]

    def set_pregame(self, game_id, home_spread, total, now, source="odds"):
        """Remember a game's pregame line. `source` is "odds" for a consensus
        from the books, "espn" for ESPN's number. Book consensus wins: ESPN
        never overwrites it."""
        entry = self.data["pregame"].setdefault(game_id, {})
        if source != "odds" and entry.get("source") == "odds":
            return
        entry["source"] = source
        if home_spread is not None:
            entry["home_spread"] = home_spread
        if total is not None:
            entry["total"] = total
        entry["updated"] = now.isoformat()

    def alerts(self, day):
        return self._slate(day)["alerts"]

    def alerted(self, day, key):
        return key in self.alerts(day)

    def record_alert(self, day, pick, now):
        self.alerts(day)[pick.key] = {
            "game_id": pick.game.id,
            "market": pick.market,
            "side": pick.side,
            "point": pick.quote.point,
            "price": pick.quote.price,
            "book": pick.quote.book,
            "label": pick.label,
            "sent": now.isoformat(),
            "result": None,
        }

    def grade(self, day, game):
        for alert in self.alerts(day).values():
            if alert["game_id"] != game.id or alert.get("result"):
                continue
            alert["final"] = f"{game.away.abbr} {game.away.score}, {game.home.abbr} {game.home.score}"
            alert["result"] = grade(alert, game.home_margin, game.total_points) if game.completed else "void"

    def recap_sent(self, day):
        return self._slate(day).get("recap_sent", False)

    def mark_recap_sent(self, day):
        self._slate(day)["recap_sent"] = True

    def prune(self, now):
        cutoff = now - timedelta(days=4)
        self.data["pregame"] = {
            k: v for k, v in self.data["pregame"].items()
            if (parse_time(v.get("updated")) or cutoff) > cutoff
        }
        oldest = (now - timedelta(days=30)).date()
        self.data["slates"] = {k: v for k, v in self.data["slates"].items() if date.fromisoformat(k) >= oldest}

    def _slate(self, day):
        return self.data["slates"].setdefault(day.isoformat(), {"alerts": {}, "recap_sent": False})


def grade(alert, home_margin, total):
    point = alert["point"]
    if alert["market"] == "spread":
        diff = (home_margin if alert["side"] == "home" else -home_margin) + point
    else:
        diff = total - point if alert["side"] == "over" else point - total
    return "win" if diff > 0 else "loss" if diff < 0 else "push"
