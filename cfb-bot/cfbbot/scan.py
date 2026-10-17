"""One pass: pull the board, price every live game, decide what to send."""

from dataclasses import dataclass, field
from datetime import timedelta
from zoneinfo import ZoneInfo

from . import espn, model, odds, report

ET = ZoneInfo("America/New_York")
SOON = timedelta(minutes=75)  # grab a pregame line for anything kicking off within this


@dataclass
class Result:
    messages: list = field(default_factory=list)
    summary: str = ""


def slate_day(now):
    """Saturday's late games run past midnight Eastern. They're still Saturday."""
    return (now.astimezone(ET) - timedelta(hours=6)).date()


def run(cfg, state, now, fetch_games, fetch_odds, fetch_page=None):
    day = slate_day(now)
    now_et = now.astimezone(ET)
    games = fetch_games(day)
    live = [g for g in games if g.state == "in"]
    soon = [g for g in games if g.state == "pre" and g.start - now <= SOON]

    # ESPN's scoreboard has pregame lines only until kickoff, so save them
    # while they're there. A line from the books (below) replaces these.
    for game in games:
        if game.state == "pre" and (game.espn_home_spread is not None or game.espn_total is not None):
            state.set_pregame(game.id, game.espn_home_spread, game.espn_total, now, source="espn")
    # ESPN's game page for every game the model can price: yards so far, and
    # the pregame line for games already going when the bot first saw them.
    yards = {}
    for game in live if fetch_page else ():
        if not model.priceable(game):
            continue
        try:
            page = fetch_page(game)
        except (OSError, ValueError) as err:
            print(f"warning: no game page for {game.away.abbr} @ {game.home.abbr}: {err}")
            continue
        yards[game.id] = espn.team_yards(page, game)
        if not (state.has_pregame(game.id) or game.espn_home_spread is not None or game.espn_total is not None):
            state.set_pregame(game.id, *espn.pregame_lines(page, game), now, source="espn")

    notes, lines, credits, odds_ok = [], {}, None, bool(cfg.odds_api_key)
    if cfg.odds_api_key and (live or soon):
        try:
            events, credits = fetch_odds()
        except (odds.OddsError, OSError) as err:
            notes.append(f"Odds feed failed this round ({err}). Fair lines only.")
            events, odds_ok = [], False
        for game_id, (event, home, away) in odds.match(live + soon, events).items():
            game = next(g for g in live + soon if g.id == game_id)
            lines[game_id] = odds.summarize(event, home, away, now, live=game.state == "in")
        for game in soon:
            if game.id in lines:
                state.set_pregame(game.id, lines[game.id].home_spread, lines[game.id].total, now)

    pregame = {g.id: _pregame_lines(state, g) for g in live}
    picks = []
    for game in live:
        spread, total = pregame[game.id]
        picks += model.find_picks(game, lines.get(game.id), spread, total, cfg.spread_edge, cfg.total_edge,
                                  yards.get(game.id))
    picks.sort(key=lambda p: p.prob, reverse=True)
    still = [p for p in picks if state.alerted(day, p.key)]
    fresh = [p for p in picks if not state.alerted(day, p.key)]
    for pick in fresh:
        state.record_alert(day, pick, now)

    result = Result()
    if live:
        priced = sum(1 for g in live if lines.get(g.id) and lines[g.id].books)
        if not odds_ok or not priced:
            if not odds_ok and not cfg.odds_api_key:
                notes.append("No ODDS_API_KEY set.")
            priceable = [(g, *pregame[g.id], yards.get(g.id)) for g in live if model.priceable(g)]
            if priceable:
                result.messages.append(report.fair_lines_message(now_et, len(live), priceable, notes))
        elif fresh:
            result.messages.append(report.picks_message(now_et, len(live), fresh, still, notes))
        elif cfg.heartbeat:
            result.messages.append(report.heartbeat_message(now_et, len(live), priced, still, notes))

    for game in games:
        if game.state == "post":
            state.grade(day, game)
    alerts = state.alerts(day)
    still_going = any(g.state == "in" or (g.state == "pre" and g.start - now <= timedelta(hours=12)) for g in games)
    if alerts and not still_going and not state.recap_sent(day):
        result.messages.append(report.recap_message(day, list(alerts.values())))
        state.mark_recap_sent(day)

    with_lines = sum(1 for g in live if any(x is not None for x in pregame[g.id]))
    with_yards = sum(1 for y in yards.values() if y)
    result.summary = (
        f"{day}: {len(games)} games, {len(live)} live ({with_lines} with a pregame line, {with_yards} with yards), "
        f"{len(soon)} kicking off soon, "
        f"{len(picks)} picks ({len(fresh)} new), {len(result.messages)} messages"
        + (f", odds credits left: {credits}" if credits is not None else "")
    )
    # One line per pick, so the run log shows the model's reasoning without
    # anyone having to read Telegram.
    for p in picks:
        g = p.game
        result.summary += (
            f"\n  {'new  ' if p in fresh else 'still'} {p.label} {p.quote.price:+d} {p.quote.book}"
            f" | {g.away.abbr} {g.away.score}, {g.home.abbr} {g.home.score}, {g.detail}"
            f" | pregame {p.pregame:g}, fair {p.fair:.1f}, edge {p.edge:.1f}, {p.prob:.0%}"
            + (f" | yards {g.away.abbr} {p.yards[1]}, {g.home.abbr} {p.yards[0]}" if p.yards else "")
        )
    return result


def _pregame_lines(state, game):
    """Prefer the line we saw ourselves just before kickoff. Fall back to ESPN's
    for games that were already going when the bot first looked."""
    seen = state.pregame(game.id)
    spread = seen.get("home_spread")
    total = seen.get("total")
    return (
        spread if spread is not None else game.espn_home_spread,
        total if total is not None else game.espn_total,
    )
