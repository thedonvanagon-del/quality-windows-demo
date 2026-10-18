"""The morning board: spreads where your books beat the sharp market.

Pinnacle takes the sharpest money in the world and moves on it, so its line
with the vig stripped out is the closest thing to a true price. When one of
your books hangs a better number than that, the bet is worth more than it
costs. The edges are small, a few percent, but they're real, and it's how
professional bettors pick spots. Without a Pinnacle line the bar is the median
of your own books, which is softer, so it takes a bigger gap to make the board.
"""

import statistics
from datetime import timedelta

from . import odds
from .model import Pick
from .odds import Quote
from .util import decimal_odds, implied, parse_time

SHARP_BOOK = "pinnacle"
# At -110 the juice eats most of a one-point edge (+0.2% in college), so it
# takes about a point and a half, or a better price, to clear these.
MIN_EV = 0.015            # against Pinnacle
MIN_EV_CONSENSUS = 0.03   # against the median of your books
MIN_CONSENSUS_BOOKS = 3
MAX_POINTS_OFF = 2.0      # further than this from the reference is stale or wrong
MAX_AGE = timedelta(hours=3)
MAX_PICKS = 5


def find(games, events, now, sport, user_books=()):
    """Up to MAX_PICKS board picks, best first, from games that haven't started."""
    upcoming = [g for g in games if g.state == "pre" and g.start > now]
    picks = []
    for game_id, (event, home, away) in odds.match(upcoming, events).items():
        game = next(g for g in upcoming if g.id == game_id)
        pick = _best_side(game, event, home, away, now, sport, user_books)
        if pick:
            picks.append(pick)
    picks.sort(key=lambda p: p.edge, reverse=True)
    return picks[:MAX_PICKS]


def _best_side(game, event, home, away, now, sport, user_books):
    sharp, quotes = _spreads(event, home, away, now, user_books)
    if sharp:
        (hp, hprice), (ap, aprice) = sharp
        home_fair = implied(hprice) / (implied(hprice) + implied(aprice))
        refs = {"home": (hp, home_fair), "away": (ap, 1 - home_fair)}
        basis, min_ev = "Pinnacle", MIN_EV
    elif len(quotes["home"]) >= MIN_CONSENSUS_BOOKS:
        median = statistics.median(q.point for q in quotes["home"])
        refs = {"home": (median, 0.5), "away": (-median, 0.5)}
        basis, min_ev = "the market", MIN_EV_CONSENSUS
    else:
        return None

    best = None
    for side, (ref_point, fair) in refs.items():
        for q in quotes[side]:
            gap = q.point - ref_point
            if abs(gap) > MAX_POINTS_OFF:
                continue
            prob = min(0.99, max(0.01, fair + gap * sport.board_slope))
            ev = prob * decimal_odds(q.price) - 1
            if ev >= min_ev and (best is None or ev > best.edge):
                best = Pick(game, "spread", side, q, ref_point, ev, prob, refs["home"][0], tag="board", basis=basis)
    return best


def _spreads(event, home, away, now, user_books):
    """Pinnacle's (home, away) (point, price) pairs, and every other fresh
    quote from your books, oriented the way ESPN sees the game."""
    sharp, quotes = None, {"home": [], "away": []}
    for book in event.get("bookmakers") or []:
        key = book.get("key") or ""
        for market in book.get("markets") or []:
            if market.get("key") != "spreads":
                continue
            updated = parse_time(market.get("last_update") or book.get("last_update"))
            if updated is None or now - updated > MAX_AGE:
                continue
            out = {o.get("name"): o for o in market.get("outcomes") or []}
            try:
                h, a = out[home], out[away]
                pair = ((float(h["point"]), int(h["price"])), (float(a["point"]), int(a["price"])))
            except (KeyError, TypeError, ValueError):
                continue
            if key == SHARP_BOOK:
                sharp = pair
            elif not user_books or key in user_books:
                title = book.get("title") or key
                quotes["home"].append(Quote(title, pair[0][1], pair[0][0]))
                quotes["away"].append(Quote(title, pair[1][1], pair[1][0]))
    return sharp, quotes
