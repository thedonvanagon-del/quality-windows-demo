import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    telegram_token: str = ""
    telegram_chat_id: str = ""
    odds_api_key: str = ""
    bookmakers: tuple = ()
    spread_edge: float = 3.5  # points of value before a side gets flagged
    total_edge: float = 5.0   # points of value before a total gets flagged
    heartbeat: bool = True    # say so when games are live but nothing's worth a bet
    state_path: str = "state/state.json"

    @classmethod
    def from_env(cls, env=os.environ):
        # GitHub Actions hands unset variables over as empty strings, so every
        # empty value falls back to the default.
        return cls(
            telegram_token=env.get("TELEGRAM_BOT_TOKEN", "").strip(),
            telegram_chat_id=env.get("TELEGRAM_CHAT_ID", "").strip(),
            odds_api_key=env.get("ODDS_API_KEY", "").strip(),
            bookmakers=tuple(b.strip().lower() for b in env.get("CFB_BOOKMAKERS", "").split(",") if b.strip()),
            spread_edge=_number(env, "CFB_SPREAD_EDGE", cls.spread_edge),
            total_edge=_number(env, "CFB_TOTAL_EDGE", cls.total_edge),
            heartbeat=env.get("CFB_HEARTBEAT", "").strip().lower() not in ("false", "0", "no", "off"),
            state_path=env.get("CFB_STATE_PATH", "").strip() or cls.state_path,
        )


def _number(env, name, default):
    raw = env.get(name, "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        raise SystemExit(f"{name} should be a number, got {raw!r}") from None
