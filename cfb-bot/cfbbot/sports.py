"""What differs between college football and the NFL: where the data lives,
how noisy the scores are, and when the bot is awake."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")


@dataclass(frozen=True)
class Window:
    """A stretch of Eastern time the bot scans. The morning board goes out on
    the first scan of each one."""
    weekday: int  # Monday is 0
    start: int    # minutes after midnight, Eastern
    minutes: int  # how long it stays open


@dataclass(frozen=True)
class Sport:
    key: str
    name: str
    espn_path: str
    espn_params: tuple   # extra scoreboard query parameters
    odds_key: str
    sigma_margin: float  # SD of a final margin around the closing spread
    sigma_total: float   # SD of a final total around the closing total
    pts_per_yard: float
    # How often a game ends on exactly this many points apart (either team),
    # index = margin, roughly from the last couple of decades. Past the end of
    # the table, margin_tail. This is what a half point is worth: crossing 3
    # matters, crossing 0 in a sport with almost no ties doesn't.
    margins: tuple
    margin_tail: float
    windows: tuple
    state_file: str


NCAAF = Sport(
    key="ncaaf",
    name="CFB",
    espn_path="college-football",
    espn_params=(("groups", "80"),),  # FBS
    odds_key="americanfootball_ncaaf",
    sigma_margin=16.0,
    sigma_total=14.0,
    pts_per_yard=0.07,   # about 28 points per 400 yards
    #        0    1     2     3     4     5     6     7     8     9     10    11    12    13    14
    margins=(0, .035, .03, .09, .045, .03, .04, .07, .035, .025, .045, .025, .02, .02, .045),  # overtime: no ties
    margin_tail=.015,
    windows=(Window(5, 10 * 60, 18 * 60 + 30),),  # Saturday 10am to Sunday 4:30am
    state_file="state.json",
)

NFL = Sport(
    key="nfl",
    name="NFL",
    espn_path="nfl",
    espn_params=(),
    odds_key="americanfootball_nfl",
    sigma_margin=13.5,
    sigma_total=13.0,
    pts_per_yard=0.067,  # about 22 points per 330 yards
    #         0     1     2     3    4     5     6    7     8     9    10    11    12    13    14
    margins=(.003, .035, .035, .15, .05, .035, .06, .09, .035, .02, .06, .025, .015, .02, .05),
    margin_tail=.012,
    windows=(
        Window(6, 9 * 60, 16 * 60),   # Sunday 9am (London games) to Monday 1am
        Window(5, 11 * 60, 14 * 60),  # Saturdays late in the season
    ),
    state_file="nfl.json",
)

SPORTS = (NCAAF, NFL)


def window_start(sport, now):
    """When the window `now` falls in opened, or None if it's closed."""
    et = now.astimezone(ET)
    for back in (0, 1):
        day = et.date() - timedelta(days=back)
        for w in sport.windows:
            if day.weekday() != w.weekday:
                continue
            opened = datetime(day.year, day.month, day.day, tzinfo=ET) + timedelta(minutes=w.start)
            if opened <= et < opened + timedelta(minutes=w.minutes):
                return opened
    return None


def open_sports(now):
    return [s for s in SPORTS if window_start(s, now)]
