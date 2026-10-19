import json

from cfbbot import espn
from cfbbot.__main__ import SAMPLE_DIR, SAMPLE_NOW

__all__ = ["SAMPLE_NOW", "sample_games", "sample_events", "sample_event"]


def sample_games():
    """The bundled sample Saturday, keyed by ESPN game id."""
    games = espn.parse_scoreboard(json.loads((SAMPLE_DIR / "scoreboard.json").read_text()))
    return {g.id: g for g in games}


def sample_events():
    return json.loads((SAMPLE_DIR / "odds.json").read_text())


def sample_event(event_id):
    return next(e for e in sample_events() if e["id"] == event_id)
