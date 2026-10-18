"""Live state of every game from ESPN's public scoreboard feeds. No key needed."""

import re
from dataclasses import dataclass
from urllib.parse import urlencode

from .http import get_json
from .sports import NCAAF
from .util import parse_time

ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/football/{path}/{page}"
QUARTER_MINUTES = 15.0
GAME_MINUTES = 60.0

# "TEX 35" or "2nd & 7 at TEX 35": the side of the field, then the yard line.
_SPOT = re.compile(r"(?:([A-Za-z&]+)\s+)?(\d{1,2})\s*$")
# "UGA -7.5", "TA&M -3"
_DETAILS = re.compile(r"^(\S+)\s+([+-]?\d+(?:\.\d+)?)$")


@dataclass
class Team:
    id: str
    abbr: str
    name: str      # "Georgia Bulldogs"
    location: str  # "Georgia"
    mascot: str    # "Bulldogs"
    score: int
    rank: int | None = None


@dataclass
class Game:
    id: str
    start: object  # datetime, UTC
    state: str     # "pre", "in" or "post"
    completed: bool
    period: int
    clock_seconds: float
    detail: str    # "7:05 - 2nd", "Halftime"
    home: Team
    away: Team
    possession: str | None = None  # id of the team with the ball
    yards_from_own_goal: int | None = None
    ball_on: str = ""              # "TEX 35"
    down_distance: str = ""        # "2nd & 7"
    espn_home_spread: float | None = None
    espn_total: float | None = None

    @property
    def overtime(self):
        return self.period > 4

    @property
    def elapsed_minutes(self):
        if self.state == "pre":
            return 0.0
        if self.state == "post" or self.overtime:
            return GAME_MINUTES
        left_in_quarter = min(max(self.clock_seconds, 0.0) / 60, QUARTER_MINUTES)
        return (max(self.period, 1) - 1) * QUARTER_MINUTES + QUARTER_MINUTES - left_in_quarter

    @property
    def remaining_minutes(self):
        return GAME_MINUTES - self.elapsed_minutes

    @property
    def home_margin(self):
        return self.home.score - self.away.score

    @property
    def total_points(self):
        return self.home.score + self.away.score

    def team(self, team_id):
        return {self.home.id: self.home, self.away.id: self.away}.get(team_id)


def fetch_scoreboard(day, sport=NCAAF):
    query = urlencode({"dates": day.strftime("%Y%m%d"), **dict(sport.espn_params), "limit": 400})
    data, _ = get_json(f"{ESPN_URL.format(path=sport.espn_path, page='scoreboard')}?{query}")
    return parse_scoreboard(data)


def parse_scoreboard(data):
    games = []
    for event in data.get("events") or []:
        comp = (event.get("competitions") or [{}])[0]
        sides = {c.get("homeAway"): c for c in comp.get("competitors") or []}
        start = parse_time(event.get("date") or comp.get("date"))
        if "home" not in sides or "away" not in sides or start is None:
            continue
        home, away = _team(sides["home"]), _team(sides["away"])
        status = comp.get("status") or event.get("status") or {}
        kind = status.get("type") or {}
        situation = comp.get("situation") or {}
        possessor = {home.id: home, away.id: away}.get(str(situation.get("possession") or ""))
        spread, total = _espn_lines((comp.get("odds") or [None])[0], home, away)
        games.append(Game(
            id=str(event.get("id")),
            start=start,
            state=kind.get("state") or "pre",
            completed=bool(kind.get("completed")),
            period=int(status.get("period") or 0),
            clock_seconds=float(status.get("clock") or 0.0),
            detail=kind.get("shortDetail") or kind.get("detail") or "",
            home=home,
            away=away,
            possession=possessor.id if possessor else None,
            yards_from_own_goal=_yards_from_own_goal(situation, possessor),
            ball_on=situation.get("possessionText") or "",
            down_distance=situation.get("shortDownDistanceText") or "",
            espn_home_spread=spread,
            espn_total=total,
        ))
    return games


def _team(competitor):
    t = competitor.get("team") or {}
    rank = (competitor.get("curatedRank") or {}).get("current")
    return Team(
        id=str(t.get("id") or competitor.get("id") or ""),
        abbr=t.get("abbreviation") or "",
        name=t.get("displayName") or "",
        location=t.get("location") or t.get("shortDisplayName") or "",
        mascot=t.get("name") or "",
        score=_int(competitor.get("score")),
        # ESPN marks unranked teams 99.
        rank=rank if isinstance(rank, int) and 1 <= rank <= 25 else None,
    )


def _int(value):
    if isinstance(value, dict):
        value = value.get("value")
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def _yards_from_own_goal(situation, possessor):
    if possessor is None:
        return None
    for text in (situation.get("possessionText"), situation.get("downDistanceText")):
        match = _SPOT.search((text or "").strip())
        if not match:
            continue
        side, yard = match.group(1), int(match.group(2))
        if yard == 50:
            return 50
        if side:
            return yard if side.upper() == possessor.abbr.upper() else 100 - yard
    return None


def fetch_game_page(game, sport=NCAAF):
    """ESPN's game page as JSON: the pick center and the box score."""
    data, _ = get_json(f"{ESPN_URL.format(path=sport.espn_path, page='summary')}?{urlencode({'event': game.id})}")
    return data


def pregame_lines(page, game):
    """Pregame spread and total from the game page's pick center. The
    scoreboard carries odds only until kickoff, so this is how the bot gets a
    starting number for a game that was already going when it first looked."""
    for entry in page.get("pickcenter") or []:
        spread, total = _espn_lines(entry, game.home, game.away)
        if spread is not None or total is not None:
            return spread, total
    return None, None


def team_yards(page, game):
    """(home yards, away yards) from the game page's box score, or None."""
    found = {}
    for side in (page.get("boxscore") or {}).get("teams") or []:
        stats = {s.get("name"): s.get("displayValue") for s in side.get("statistics") or []}
        yards = _whole(stats.get("totalYards"))
        if yards is None:
            passing, rushing = _whole(stats.get("netPassingYards")), _whole(stats.get("rushingYards"))
            if passing is not None and rushing is not None:
                yards = passing + rushing
        if yards is not None:
            found[str((side.get("team") or {}).get("id") or "")] = yards
    if game.home.id in found and game.away.id in found:
        return found[game.home.id], found[game.away.id]
    return None


def _espn_lines(odds, home, away):
    """Spread (home team's number) and total from one ESPN odds entry."""
    odds = odds or {}
    total = _float(odds.get("overUnder"))
    details = (odds.get("details") or "").strip()
    match = _DETAILS.match(details)
    if details.upper() in ("EVEN", "PK", "PICK"):
        return 0.0, total
    if match:
        abbr, points = match.group(1).upper(), float(match.group(2))
        if abbr == home.abbr.upper():
            return points, total
        if abbr == away.abbr.upper():
            return -points, total
    spread = _float(odds.get("spread"))
    if spread is not None:
        if (odds.get("homeTeamOdds") or {}).get("favorite"):
            return -abs(spread), total
        if (odds.get("awayTeamOdds") or {}).get("favorite"):
            return abs(spread), total
    return None, total


def _whole(value):
    try:
        return int(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
