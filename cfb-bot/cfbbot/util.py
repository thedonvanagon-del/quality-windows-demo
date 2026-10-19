import math
from datetime import datetime, timezone


def parse_time(value):
    """ISO 8601 from either feed ("2026-10-17T16:00Z", "2026-10-17T16:00:00Z")
    to an aware UTC datetime, or None."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def norm_cdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def implied(price):
    """Win probability an American price implies, vig included."""
    return 100 / (price + 100) if price > 0 else -price / (-price + 100)


def decimal_odds(price):
    """What a $1 bet returns, stake included, at an American price."""
    return 1 + (price / 100 if price > 0 else 100 / -price)


def fmt_spread(points):
    return "PK" if points == 0 else f"{points:+g}"
