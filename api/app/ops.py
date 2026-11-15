"""Mill operations (/ops): pure helpers for the season replay "as of" a date. App logic, not
library results; the definitions are in docs/API.md. Tested in api/tests/test_ops.py.

As of date D, every segment is in exactly one state:
  harvested            harvest_date <= D
  not_yet_harvested    harvest_date > D (standing cane at D)
  no_date              no harvest_date (never counted as standing cane)
Burned and not harvested as of D: a season fire on or before D and not harvested as of D
(not_yet_harvested or no_date); days since burn = D - date of its first season fire.
"""

import csv
import datetime as dt
import io
import math
import statistics

# (key, lowest day, highest day or None): days since burn, D - first season fire date.
BUCKETS = (("0_2", 0, 2), ("3_7", 3, 7), ("8_14", 8, 14), ("over_14", 15, None))
BUCKET_KEYS = tuple(b[0] for b in BUCKETS)
PACE_WEEKS = 3
RECENT_DAYS = 7  # "last 7 days": D - 6 .. D


def bucket_of(days: int) -> str:
    """Bucket key of a number of days since burn (>= 0)."""
    if days < 0:
        raise ValueError(f"days since burn must be >= 0, got {days}")
    for key, lo, hi in BUCKETS:
        if days >= lo and (hi is None or days <= hi):
            return key
    raise AssertionError("unreachable")


def bucket_sql(expr: str) -> str:
    """SQL CASE giving the bucket key of the integer expression `expr` (same as bucket_of)."""
    whens = " ".join(f"WHEN {expr} <= {hi} THEN '{key}'" for key, _, hi in BUCKETS if hi is not None)
    return f"CASE {whens} ELSE '{BUCKETS[-1][0]}' END"


def state_of(harvest_date, as_of: dt.date) -> str:
    """harvested | not_yet_harvested | no_date of one segment as of `as_of`."""
    if harvest_date is None:
        return "no_date"
    return "harvested" if harvest_date <= as_of else "not_yet_harvested"


def recent_window(as_of: dt.date) -> tuple[dt.date, dt.date]:
    """The last RECENT_DAYS days up to and including `as_of`."""
    return as_of - dt.timedelta(days=RECENT_DAYS - 1), as_of


def pace_weeks(as_of: dt.date, n: int = PACE_WEEKS) -> list[tuple[dt.date, dt.date]]:
    """The last `n` full Monday-Sunday weeks ending on or before `as_of`, oldest first, as
    (monday, sunday). A Sunday `as_of` closes its own week."""
    last_sunday = as_of - dt.timedelta(days=(as_of.weekday() + 1) % 7)
    return [(last_sunday - dt.timedelta(days=7 * k + 6), last_sunday - dt.timedelta(days=7 * k))
            for k in reversed(range(n))]


def projected_end(as_of: dt.date, remaining_ha: float, ha_per_week: float):
    """Date the remaining (dated later than `as_of`) area is cut at `ha_per_week`: as_of plus
    remaining / pace weeks, rounded up to a whole day. None when the pace is zero; `as_of`
    itself when nothing remains."""
    if ha_per_week <= 0:
        return None
    if remaining_ha <= 0:
        return as_of
    return as_of + dt.timedelta(days=math.ceil(7 * remaining_ha / ha_per_week))


def fire_to_harvest_stats(days: list[int]) -> dict:
    """Distribution of harvest_date - first season fire date (days) over the segments with
    both. Quartiles: linear interpolation between order statistics (statistics.quantiles,
    method 'inclusive', as PostgreSQL percentile_cont). Shares are fractions of `count`."""
    n = len(days)
    if n == 0:
        return {"count": 0, "median": None, "q1": None, "q3": None, "min": None, "max": None,
                "share_within_3": None, "share_over_7": None, "share_over_14": None,
                "share_negative": None}
    q1, med, q3 = statistics.quantiles(days, n=4, method="inclusive") if n > 1 else (days[0],) * 3
    return {
        "count": n,
        "median": med,
        "q1": q1,
        "q3": q3,
        "min": min(days),
        "max": max(days),
        "share_within_3": sum(abs(d) <= 3 for d in days) / n,
        "share_over_7": sum(d > 7 for d in days) / n,
        "share_over_14": sum(d > 14 for d in days) / n,
        "share_negative": sum(d < 0 for d in days) / n,
    }


def minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def csv_bytes(header: list[str], rows: list[list]) -> bytes:
    """UTF-8 CSV with a byte-order mark (so Excel reads it as UTF-8), CRLF line ends, None as
    an empty cell, lists joined with ';'."""
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n")
    w.writerow(header)
    for r in rows:
        w.writerow(["" if v is None else ";".join(map(str, v)) if isinstance(v, (list, tuple))
                    else v.isoformat() if isinstance(v, dt.date) else v for v in r])
    return ("﻿" + buf.getvalue()).encode("utf-8")
