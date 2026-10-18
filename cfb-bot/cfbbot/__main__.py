import argparse
import html
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from . import espn, odds, scan, sports, telegram
from .config import Config
from .state import State

SAMPLE_DIR = Path(__file__).parent / "sample"
SAMPLE_NOW = datetime(2026, 10, 17, 19, 5, tzinfo=timezone.utc)


def main(argv=None):
    parser = argparse.ArgumentParser(prog="cfbbot", description="Live college football bet scanner that posts to Telegram.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="print messages instead of sending them, and leave state alone")
    mode.add_argument("--test-telegram", action="store_true", help="send one test message and exit")
    mode.add_argument("--loop", action="store_true",
                      help="scan every 30 minutes while a sport's window is open (how GitHub runs it)")
    mode.add_argument("--board", action="store_true",
                      help="send the morning board now for any sport with games left today")
    mode.add_argument("--demo", action="store_true", help="run on the bundled sample Saturday, no network or keys needed")
    args = parser.parse_args(argv)
    cfg = Config.from_env()

    if args.demo:
        return demo()

    if not args.dry_run and not (cfg.telegram_token and cfg.telegram_chat_id):
        print("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID have to be set (or use --dry-run).", file=sys.stderr)
        return 2

    if args.test_telegram:
        bot, chat = telegram.whoami(cfg.telegram_token, cfg.telegram_chat_id)
        telegram.send(cfg.telegram_token, cfg.telegram_chat_id,
                      f"🏈 CFB bot is hooked up. This is {bot}. You'll hear from me on game days.")
        print(f"Test message sent from {bot} to {chat}. Open your chat with {bot} in Telegram to see it.")
        return 0

    if args.loop:
        again = scan.keep_scanning(lambda: scan_open_sports(cfg))
        _set_output("again", "true" if again else "false")
        return 0

    # One pass of every sport, window or not.
    for sport in sports.SPORTS:
        scan_once(cfg, sport, args.dry_run, force_board=args.board, live=not args.board)
    return 0


def scan_open_sports(cfg):
    for sport in sports.open_sports(datetime.now(timezone.utc)):
        try:
            scan_once(cfg, sport, dry_run=False)
        except Exception as err:  # one sport's trouble shouldn't stop the other
            print(f"{sport.name} scan failed: {err}")


def scan_once(cfg, sport, dry_run, force_board=False, live=True):
    now = datetime.now(timezone.utc)
    state = State.load(os.path.join(os.path.dirname(cfg.state_path), sport.state_file))
    games = espn.fetch_scoreboard(scan.slate_day(now), sport)
    messages = []
    # Pinnacle rides along on the board's call so there's a sharp line to beat.
    board_books = cfg.bookmakers + ("pinnacle",) if cfg.bookmakers else ()
    board = scan.morning_board(cfg, state, now, games,
                               lambda: odds.fetch(cfg.odds_api_key, board_books, sport, markets="spreads"),
                               sport, force=force_board)
    if board:
        print(f"{sport.name} board sent")
        messages.append(board)
    if live:
        result = scan.run(cfg, state, now, lambda day: games,
                          lambda: odds.fetch(cfg.odds_api_key, cfg.bookmakers, sport),
                          lambda game: espn.fetch_game_page(game, sport), sport)
        print(result.summary)
        messages += result.messages
    for message in messages:
        if dry_run:
            print("\n" + message)
        else:
            telegram.send(cfg.telegram_token, cfg.telegram_chat_id, message)
    # Save only after everything sent, so a failed send gets retried next scan.
    if not dry_run:
        state.prune(now)
        state.save()


def _set_output(name, value):
    """Hand a value to later workflow steps (GitHub Actions step outputs)."""
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a") as f:
            f.write(f"{name}={value}\n")


def demo():
    games = espn.parse_scoreboard(json.loads((SAMPLE_DIR / "scoreboard.json").read_text()))
    events = json.loads((SAMPLE_DIR / "odds.json").read_text())
    result = scan.run(Config(odds_api_key="demo"), State(), SAMPLE_NOW, lambda day: games, lambda: (events, None))
    print(result.summary)
    for message in result.messages:
        print("\n" + html.unescape(re.sub(r"</?[bi]>", "", message)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
