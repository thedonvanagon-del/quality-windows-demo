"""Live and pregame lines from The Odds API, boiled down to one consensus
number per market plus the best price you can actually get."""

import re
import statistics
import unicodedata
from dataclasses import dataclass, field
from datetime import timedelta
from difflib import SequenceMatcher
from urllib.error import HTTPError
from urllib.parse import urlencode

from .http import error_message, get_json
from .sports import NCAAF
from .util import implied, parse_time

ODDS_URL = "https://api.the-odds-api.com/v4/sports/{sport}/odds"
LIVE_MARKETS = "h2h,spreads,totals"
# Live markets suspend during plays. A quote older than this is probably a
# suspended or stale one, and pricing off it would invent an edge.
LIVE_MAX_AGE = timedelta(minutes=10)
# A book this far off the consensus is stale or about to move. Don't shop it.
OUTLIER_POINTS = 1.5
MATCH_WINDOW = timedelta(hours=6)
MIN_TEAM_MATCH = 0.8

# The two feeds name a handful of schools differently. Keys and values are
# both run through _norm first.
_PLACE_ALIASES = {
    "mississippi": "ole miss",
    "connecticut": "uconn",
    "appalachian state": "app state",
    "louisiana monroe": "ul monroe",
    "southern mississippi": "southern miss",
    "florida international": "fiu",
    "massachusetts": "umass",
    "ut san antonio": "utsa",
    "texas san antonio": "utsa",
    "sam houston state": "sam houston",
    "north carolina state": "nc state",
    "louisiana lafayette": "louisiana",
    "ul lafayette": "louisiana",
    "central florida": "ucf",
    "southern california": "usc",
    "brigham young": "byu",
    "southern methodist": "smu",
    "texas christian": "tcu",
    "nevada las vegas": "unlv",
    "alabama birmingham": "uab",
    "texas el paso": "utep",
    "middle tennessee state": "middle tennessee",
    "miami ohio": "miami oh",
}


class OddsError(RuntimeError):
    pass


@dataclass
class Quote:
    book: str
    price: int
    point: float | None = None


@dataclass
class Lines:
    home_spread: float | None = None    # consensus, home team's number
    total: float | None = None
    home_win_prob: float | None = None  # consensus, vig removed
    books: int = 0
    # Best quote per side: "home", "away", "over", "under", "ml_home", "ml_away".
    best: dict = field(default_factory=dict)


def fetch(api_key, bookmakers=(), sport=NCAAF, markets=LIVE_MARKETS):
    """Every game the API has lines for, live and upcoming. Costs one credit
    per market (one region, or up to 10 named books)."""
    params = {"apiKey": api_key, "markets": markets, "oddsFormat": "american", "dateFormat": "iso"}
    if bookmakers:
        params["bookmakers"] = ",".join(bookmakers)
    else:
        params["regions"] = "us"
    try:
        data, headers = get_json(f"{ODDS_URL.format(sport=sport.odds_key)}?{urlencode(params)}")
    except HTTPError as err:
        raise OddsError(f"The Odds API returned {err.code}: {error_message(err)}") from None
    return data, headers.get("x-requests-remaining")


def summarize(event, home, away, now, live):
    """Consensus lines and best quotes for one event. `home` and `away` are
    the event's names for ESPN's home and away teams, so the result is always
    oriented the way ESPN sees the game."""
    spreads, totals, probs = [], [], []
    quotes = {k: [] for k in ("home", "away", "over", "under", "ml_home", "ml_away")}
    books = set()
    for book in event.get("bookmakers") or []:
        title = book.get("title") or book.get("key") or "?"
        for market in book.get("markets") or []:
            updated = parse_time(market.get("last_update") or book.get("last_update"))
            if live and (updated is None or now - updated > LIVE_MAX_AGE):
                continue
            out = {o.get("name"): o for o in market.get("outcomes") or []}
            kind = market.get("key")
            try:
                if kind == "spreads" and home in out and away in out:
                    h = float(out[home]["point"])
                    quotes["home"].append(Quote(title, int(out[home]["price"]), h))
                    quotes["away"].append(Quote(title, int(out[away]["price"]), float(out[away]["point"])))
                    spreads.append(h)
                elif kind == "totals" and "Over" in out and "Under" in out:
                    t = float(out["Over"]["point"])
                    quotes["over"].append(Quote(title, int(out["Over"]["price"]), t))
                    quotes["under"].append(Quote(title, int(out["Under"]["price"]), float(out["Under"]["point"])))
                    totals.append(t)
                elif kind == "h2h" and home in out and away in out:
                    ph, pa = int(out[home]["price"]), int(out[away]["price"])
                    quotes["ml_home"].append(Quote(title, ph))
                    quotes["ml_away"].append(Quote(title, pa))
                    probs.append(implied(ph) / (implied(ph) + implied(pa)))
                else:
                    continue
            except (KeyError, TypeError, ValueError):
                continue
            books.add(title)

    lines = Lines(books=len(books))
    if spreads:
        lines.home_spread = statistics.median(spreads)
        _set_best(lines, "home", quotes["home"], lines.home_spread, higher_is_better=True)
        _set_best(lines, "away", quotes["away"], -lines.home_spread, higher_is_better=True)
    if totals:
        lines.total = statistics.median(totals)
        _set_best(lines, "over", quotes["over"], lines.total, higher_is_better=False)
        _set_best(lines, "under", quotes["under"], lines.total, higher_is_better=True)
    if probs:
        lines.home_win_prob = statistics.median(probs)
        lines.best["ml_home"] = max(quotes["ml_home"], key=lambda q: q.price)
        lines.best["ml_away"] = max(quotes["ml_away"], key=lambda q: q.price)
    return lines


def _set_best(lines, side, quotes, consensus, higher_is_better):
    pool = [q for q in quotes if abs(q.point - consensus) <= OUTLIER_POINTS]
    if not pool:
        return
    sign = 1 if higher_is_better else -1
    # Best number first, then best price. American prices are monotonic:
    # -105 beats -110 and +150 beats +130.
    lines.best[side] = max(pool, key=lambda q: (sign * q.point, q.price))


def match(games, events):
    """Pair ESPN games with Odds API events.

    Returns {game_id: (event, home_name, away_name)} where the names are the
    event's spelling of ESPN's home and away teams. The feeds sometimes
    disagree on who's home at neutral sites, so both orientations are tried.
    """
    scored = []
    for game in games:
        for i, event in enumerate(events):
            commence = parse_time(event.get("commence_time"))
            if commence is None or abs(commence - game.start) > MATCH_WINDOW:
                continue
            eh, ea = event.get("home_team") or "", event.get("away_team") or ""
            straight = min(team_match(game.home, eh), team_match(game.away, ea))
            flipped = min(team_match(game.home, ea), team_match(game.away, eh))
            if max(straight, flipped) >= MIN_TEAM_MATCH:
                names = (eh, ea) if straight >= flipped else (ea, eh)
                scored.append((max(straight, flipped), game.id, i, names))

    pairs, used = {}, set()
    for _, game_id, i, (home, away) in sorted(scored, key=lambda s: s[0], reverse=True):
        if game_id in pairs or i in used:
            continue
        pairs[game_id] = (events[i], home, away)
        used.add(i)
    return pairs


def team_match(team, name):
    """How sure we are that `name` (Odds API) is this ESPN team, 0 to 1.

    The mascot has to match, then the school part gets compared. Matching on
    the whole name would pair Auburn Tigers with Memphis Tigers far too easily.
    """
    odds = _norm(name)
    mascot = _norm(team.mascot)
    if mascot and odds.endswith(" " + mascot):
        place = _place(odds[: -len(mascot)])
        options = {_place(team.location), _norm(team.abbr)} - {""}
        return max((SequenceMatcher(None, place, o).ratio() for o in options), default=0.0)
    return 0.85 * SequenceMatcher(None, odds, _norm(team.name)).ratio()


def _norm(text):
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    text = re.sub(r"['’&]", "", text.lower())
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text).split())


def _place(text):
    text = _norm(text)
    return _PLACE_ALIASES.get(text, text)
