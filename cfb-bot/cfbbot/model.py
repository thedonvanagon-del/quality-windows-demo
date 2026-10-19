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

Yardage, when ESPN has it, sharpens both. Books move live lines on how teams
are playing, not just the score, and on the first live Saturday most of the
model's "edges" were spots where it couldn't see that. Yards are a steadier
read than points: on sides they shift how good the model thinks each team is,
and on totals they stand in for half the points when judging the pace.
A quarter or two of yards is still noisy, so by halftime they carry a fifth
of the weight on sides.

A side pick has to clear the threshold with the current possession left out
too. The odds feed can trail the play-by-play by a few minutes, and an edge
that only exists because of where the ball is right now is usually the
book's number not having caught up yet.

None of this knows about injuries, weather or a QB change. When the market
disagrees with the model by a lot, that's often why.
"""

import math
from dataclasses import dataclass

from .espn import GAME_MINUTES, Game
from .odds import Lines, Quote
from .sports import NCAAF
from .util import fmt_spread, implied, norm_cdf

# How noisy scores are and what a yard is worth differ by sport; see sports.py.
PRIOR_MINUTES = 120.0  # minutes of evidence the pregame total is worth
# Inside the last 10 minutes the game stops looking like the model. A one-score
# game can go to overtime (college OT piles on points), the trailing team
# hurries, and whoever has the ball matters more than anything here. On the
# first live Saturday this flagged an Auburn/Georgia under at 4:46 left as "95%".
MIN_REMAINING = 10.0
MIN_BOOKS = 2         # one book's odd number is not a market
ML_MAX_PRICE = 500    # past this a moneyline is a lottery ticket, not a bet
STRENGTH_PRIOR_MINUTES = 120.0  # minutes of evidence the pregame spread is worth against yardage


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
    yards: tuple | None = None  # (home, away) at the time of the pick
    tag: str = ""               # "board" for morning-board picks
    basis: str = ""             # what a board pick was measured against

    @property
    def key(self):
        return f"{self.game.id}:{self.market}:{self.side}" + (f":{self.tag}" if self.tag else "")

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


def fair_home_margin(game, pregame_home_spread, yards=None, possession=True, sport=NCAAF):
    """Expected final home margin. `yards` is (home, away) total yards so far.
    `possession=False` leaves out the value of whoever has the ball."""
    rate = -pregame_home_spread / GAME_MINUTES
    if yards and game.elapsed_minutes > 0:
        played = (yards[0] - yards[1]) * sport.pts_per_yard
        rate = (rate * STRENGTH_PRIOR_MINUTES + played) / (STRENGTH_PRIOR_MINUTES + game.elapsed_minutes)
    margin = game.home_margin + rate * game.remaining_minutes
    if possession and game.possession and game.yards_from_own_goal is not None:
        value = expected_points(game.yards_from_own_goal)
        margin += value if game.possession == game.home.id else -value
    return margin


def fair_total(game, pregame_total, yards=None, sport=NCAAF):
    observed = game.total_points
    if yards:
        observed = (game.total_points + sum(yards) * sport.pts_per_yard) / 2
    rate = (pregame_total / GAME_MINUTES * PRIOR_MINUTES + observed) / (PRIOR_MINUTES + game.elapsed_minutes)
    return game.total_points + rate * game.remaining_minutes


def sigma(full_game, game):
    return full_game * math.sqrt(max(game.remaining_minutes / GAME_MINUTES, 0.04))


def priceable(game):
    """Live, in regulation, and with enough clock left for the model to mean something."""
    return game.state == "in" and not game.overtime and game.remaining_minutes >= MIN_REMAINING


def find_picks(game: Game, lines: Lines | None, pregame_spread, pregame_total, spread_edge, total_edge, yards=None,
               sport=NCAAF):
    if not priceable(game) or lines is None or lines.books < MIN_BOOKS:
        return []
    picks = []
    if pregame_spread is not None and lines.home_spread is not None:
        picks.append(_side_pick(game, lines, pregame_spread, spread_edge, yards, sport))
    if pregame_total is not None and lines.total is not None:
        picks.append(_total_pick(game, lines, pregame_total, total_edge, yards, sport))
    return [p for p in picks if p]


def _side_pick(game, lines, pregame_spread, threshold, yards, sport):
    margins = (fair_home_margin(game, pregame_spread, yards, sport=sport),
               fair_home_margin(game, pregame_spread, yards, possession=False, sport=sport))
    sd = sigma(sport.sigma_margin, game)
    for side, sign in (("home", 1), ("away", -1)):
        quote = lines.best.get(side)
        if not quote:
            continue
        # Judge on whichever margin is less kind to this side.
        side_margin = min(sign * m for m in margins)
        edge = side_margin + quote.point
        if edge < threshold:
            continue
        # Mention the moneyline when the side is a dog and the price is better
        # than the model's win chance. Favorites' ML is just a worse spread bet.
        ml, ml_prob = lines.best.get("ml_" + side), norm_cdf(side_margin / sd)
        if not (ml and 0 < ml.price <= ML_MAX_PRICE and ml_prob > implied(ml.price)):
            ml, ml_prob = None, None
        return Pick(game, "spread", side, quote, -side_margin, edge, norm_cdf(edge / sd), pregame_spread, ml, ml_prob, yards)
    return None


def _total_pick(game, lines, pregame_total, threshold, yards, sport):
    projected = fair_total(game, pregame_total, yards, sport)
    sd = sigma(sport.sigma_total, game)
    over, under = lines.best.get("over"), lines.best.get("under")
    if over and projected - over.point >= threshold:
        edge = projected - over.point
        return Pick(game, "total", "over", over, projected, edge, norm_cdf(edge / sd), pregame_total, yards=yards)
    if under and under.point - projected >= threshold:
        edge = under.point - projected
        return Pick(game, "total", "under", under, projected, edge, norm_cdf(edge / sd), pregame_total, yards=yards)
    return None
