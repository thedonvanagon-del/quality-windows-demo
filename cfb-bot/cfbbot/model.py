"""The betting model.

The idea is old and simple. The closing pregame line is the best read on how
good these two teams are, and live prices lean too hard on the scoreboard. So
we price the rest of the game off the pregame line, add what's already
happened, and flag spots where the live number has drifted too far from that.

Sides: final margin = current margin + pregame expectation x share of the game
left + the value of the current possession. The spread around that shrinks
with the square root of the time left (Stern 1994, the same frame
Pro-Football-Reference uses for win probability).

Totals: points so far + minutes left x a scoring rate that blends the pregame
pace with what we've seen. The pregame number gets 30 minutes' worth of
weight, so it dominates early and splits the difference by halftime.

None of this knows about injuries, weather or a QB change. When the market
disagrees with the model by a lot, that's often why.
"""

import math
from dataclasses import dataclass

from .espn import GAME_MINUTES, Game
from .odds import Lines, Quote
from .util import fmt_spread, implied, norm_cdf

SIGMA_MARGIN = 16.0   # SD of a CFB final margin around the closing spread
SIGMA_TOTAL = 14.0    # SD of a CFB final total around the closing total
PRIOR_MINUTES = 120.0  # minutes of evidence the pregame total is worth
MIN_REMAINING = 4.0   # inside this, clock and timeouts matter more than the model


@dataclass
class Pick:
    game: Game
    market: str      # "spread" or "total"
    side: str        # "home", "away", "over" or "under"
    quote: Quote     # best price on that side, point from the bettor's side
    fair: float      # the model's line, same side
    edge: float      # points of value
    prob: float      # the model's chance this cashes
    pregame: float   # closing home spread or total
    ml: Quote | None = None
    ml_prob: float | None = None

    @property
    def key(self):
        return f"{self.game.id}:{self.market}:{self.side}"

    @property
    def team(self):
        return {"home": self.game.home, "away": self.game.away}.get(self.side)

    @property
    def label(self):
        if self.market == "spread":
            return f"{self.team.location} {fmt_spread(self.quote.point)}"
        return f"{self.side.title()} {self.quote.point:g} · {self.game.away.abbr} @ {self.game.home.abbr}"


def expected_points(yards_from_own_goal):
    """Rough value of having the ball at a spot: about 0.5 at your own 20,
    2.5 at midfield, 4.5 at their 20, and close to 6 at the goal line."""
    return max(-0.5, min(6.0, 0.067 * yards_from_own_goal - 0.85))


def fair_home_margin(game, pregame_home_spread):
    share_left = game.remaining_minutes / GAME_MINUTES
    margin = game.home_margin - pregame_home_spread * share_left
    if game.possession and game.yards_from_own_goal is not None:
        value = expected_points(game.yards_from_own_goal)
        margin += value if game.possession == game.home.id else -value
    return margin


def fair_total(game, pregame_total):
    rate = (pregame_total / GAME_MINUTES * PRIOR_MINUTES + game.total_points) / (PRIOR_MINUTES + game.elapsed_minutes)
    return game.total_points + rate * game.remaining_minutes


def sigma(full_game, game):
    return full_game * math.sqrt(max(game.remaining_minutes / GAME_MINUTES, 0.04))


def priceable(game):
    """Live, in regulation, and with enough clock left for the model to mean something."""
    return game.state == "in" and not game.overtime and game.remaining_minutes >= MIN_REMAINING


def find_picks(game: Game, lines: Lines | None, pregame_spread, pregame_total, spread_edge, total_edge):
    if not priceable(game) or lines is None:
        return []
    picks = []
    if pregame_spread is not None and lines.home_spread is not None:
        picks.append(_side_pick(game, lines, pregame_spread, spread_edge))
    if pregame_total is not None and lines.total is not None:
        picks.append(_total_pick(game, lines, pregame_total, total_edge))
    return [p for p in picks if p]


def _side_pick(game, lines, pregame_spread, threshold):
    margin = fair_home_margin(game, pregame_spread)
    sd = sigma(SIGMA_MARGIN, game)
    for side, sign in (("home", 1), ("away", -1)):
        quote = lines.best.get(side)
        if not quote:
            continue
        side_margin = sign * margin
        edge = side_margin + quote.point
        if edge < threshold:
            continue
        # Mention the moneyline when the side is a dog and the price is better
        # than the model's win chance. Favorites' ML is just a worse spread bet.
        ml, ml_prob = lines.best.get("ml_" + side), norm_cdf(side_margin / sd)
        if not (ml and ml.price > 0 and ml_prob > implied(ml.price)):
            ml, ml_prob = None, None
        return Pick(game, "spread", side, quote, -side_margin, edge, norm_cdf(edge / sd), pregame_spread, ml, ml_prob)
    return None


def _total_pick(game, lines, pregame_total, threshold):
    projected = fair_total(game, pregame_total)
    sd = sigma(SIGMA_TOTAL, game)
    over, under = lines.best.get("over"), lines.best.get("under")
    if over and projected - over.point >= threshold:
        edge = projected - over.point
        return Pick(game, "total", "over", over, projected, edge, norm_cdf(edge / sd), pregame_total)
    if under and under.point - projected >= threshold:
        edge = under.point - projected
        return Pick(game, "total", "under", under, projected, edge, norm_cdf(edge / sd), pregame_total)
    return None
