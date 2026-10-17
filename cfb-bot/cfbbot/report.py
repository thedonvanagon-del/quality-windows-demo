"""Telegram messages, HTML parse mode. Team names go through escape() because
Texas A&M would otherwise break the markup."""

from html import escape

from .model import fair_home_margin, fair_total
from .util import fmt_spread, implied

FOOTER = "Big gaps usually mean the book knows something: injury, weather, a QB change. Check before you bet."
RESULT_ICONS = {"win": "✅", "loss": "❌", "push": "➖", "void": "⚪"}


def clock(now_et):
    return now_et.strftime("%I:%M %p").lstrip("0")


def header(now_et, live_count):
    return f"🏈 <b>CFB live</b> · {clock(now_et)} ET · {live_count} live"


def picks_message(now_et, live_count, fresh, still, notes=()):
    parts = [header(now_et, live_count), *(f"<i>{escape(n)}</i>" for n in notes)]
    parts += [_pick_block(p) for p in fresh]
    if still:
        parts.append(_still_line(still))
    parts.append(f"<i>{FOOTER}</i>")
    return "\n\n".join(parts)


def heartbeat_message(now_et, live_count, priced_count, still, notes=()):
    parts = [header(now_et, live_count), *(f"<i>{escape(n)}</i>" for n in notes)]
    parts.append(f"Nothing new worth a bet. Live odds on {priced_count} of {live_count}.")
    if still:
        parts.append(_still_line(still))
    return "\n\n".join(parts)


def fair_lines_message(now_et, live_count, priced, notes=()):
    """For when there are no live odds to compare against: the model's own
    numbers, so you can hold them up to your book. `priced` is a list of
    (game, pregame home spread, pregame total)."""
    parts = [header(now_et, live_count), *(f"<i>{escape(n)}</i>" for n in notes)]
    parts.append("No live odds to check, so here are the model's fair lines. Hold them up to your book.")
    for game, spread, total in priced:
        fair = []
        if spread is not None:
            margin = fair_home_margin(game, spread)
            fav = game.home if margin >= 0 else game.away
            fair.append(f"{escape(fav.abbr)} -{abs(margin):.1f}" if round(abs(margin), 1) else "PK")
        if total is not None:
            fair.append(f"total {fair_total(game, total):.1f}")
        parts.append(f"{_scoreline(game)}\nFair: {' · '.join(fair) or 'no pregame line to work from'}")
    return "\n\n".join(parts)


def recap_message(day, alerts):
    results = [a.get("result") for a in alerts]
    wins, losses, pushes = (results.count(r) for r in ("win", "loss", "push"))
    record = f"{wins}-{losses}" + (f"-{pushes}" if pushes else "")
    lines = [f"🏈 <b>{day:%A} recap</b> · {record}"]
    for a in alerts:
        icon = RESULT_ICONS.get(a.get("result"), "❔")
        final = f" · {escape(a['final'])}" if a.get("final") else " · no final score"
        lines.append(f"{icon} {escape(a['label'])} {a['price']:+d}{final}")
    return "\n".join(lines)


def _pick_block(p):
    g = p.game
    lines = [f"<b>{escape(p.label)}</b>  {p.quote.price:+d} at {escape(p.quote.book)}", _scoreline(g)]
    if p.market == "spread":
        abbr = escape(p.team.abbr)
        lines.append(f"Model has {abbr} {fmt_spread(round(p.fair, 1))}. {p.edge:.1f} pts of value, {p.prob:.0%} to cover.")
        lines.append(_spread_context(p))
        if p.ml:
            lines.append(
                f"{abbr} ML {p.ml.price:+d} at {escape(p.ml.book)} too: "
                f"model {p.ml_prob:.0%}, price says {implied(p.ml.price):.0%}."
            )
    else:
        lines.append(f"Model total {p.fair:.1f}. {p.edge:.1f} pts of value, {p.prob:.0%} to hit.")
        lines.append(_total_context(p))
    return "\n".join(lines)


def _scoreline(g):
    text = f"{escape(g.away.abbr)} {g.away.score}, {escape(g.home.abbr)} {g.home.score} · {escape(g.detail)}"
    team = g.team(g.possession)
    if team:
        text += f" · {escape(team.abbr)} ball"
        if g.down_distance:
            text += f", {escape(g.down_distance)}"
        if g.ball_on:
            text += f" at {escape(g.ball_on)}"
    return text


def _spread_context(p):
    g = p.game
    fav = g.home if p.pregame <= 0 else g.away
    closed = "PK" if p.pregame == 0 else f"{escape(fav.abbr)} -{abs(p.pregame):g}"
    live_home = p.quote.point if p.side == "home" else -p.quote.point
    return f"Closed {closed}. The live number has moved {abs(live_home - p.pregame):g} pts since kickoff."


def _total_context(p):
    g = p.game
    minutes = g.elapsed_minutes
    pace = g.total_points / minutes * 60 if minutes else p.pregame
    cool = "Model expects it to cool off." if p.side == "under" else "Model expects scoring to pick up."
    return f"{g.total_points} pts in {minutes:.0f} min, on pace for {pace:.0f}. Closed {p.pregame:g}. {cool}"


def _still_line(picks):
    items = ", ".join(f"{escape(p.label)} {p.quote.price:+d} at {escape(p.quote.book)}" for p in picks)
    return f"Still good from earlier: {items}"
