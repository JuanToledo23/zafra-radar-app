"""Mill operations (/ops): pure helpers for the season replay "as of" a date. App logic, not
library results; the definitions are in docs/API.md. Tested in api/tests/test_ops.py.

No hindsight: everything as of date D uses only what would be known on D, harvest dates on or
before D and fires on or before D. As of D every segment is in exactly one state:
  harvested            harvest_date <= D
  not_yet_detected     no harvest date on or before D (dated later or never: not told apart)
Satellite fire detections are context only and are never attributed to a field
(docs/FINDINGS.md).
"""

import csv
import datetime as dt
import io

PACE_WEEKS = 3
RECENT_DAYS = 7  # "last 7 days": D - 6 .. D
LIST_DAYS = (7, 14)  # windows of the "harvested this week" list
NIGHT_BEFORE_HOUR = 6  # a detection before 06:00 local time is a night-time one


def state_of(harvest_date, as_of: dt.date) -> str:
    """harvested | not_yet_detected of one segment as of `as_of`."""
    return "harvested" if harvest_date is not None and harvest_date <= as_of else "not_yet_detected"


def recent_window(as_of: dt.date, days: int = RECENT_DAYS) -> tuple[dt.date, dt.date]:
    """The last `days` days up to and including `as_of`."""
    return as_of - dt.timedelta(days=days - 1), as_of


def previous_window(as_of: dt.date, days: int = RECENT_DAYS) -> tuple[dt.date, dt.date]:
    """The `days` days just before recent_window(as_of, days)."""
    start, _ = recent_window(as_of, days)
    return start - dt.timedelta(days=days), start - dt.timedelta(days=1)


def pace_weeks(as_of: dt.date, n: int = PACE_WEEKS) -> list[tuple[dt.date, dt.date]]:
    """The last `n` full Monday-Sunday weeks ending on or before `as_of`, oldest first, as
    (monday, sunday). A Sunday `as_of` closes its own week."""
    last_sunday = as_of - dt.timedelta(days=(as_of.weekday() + 1) % 7)
    return [(last_sunday - dt.timedelta(days=7 * k + 6), last_sunday - dt.timedelta(days=7 * k))
            for k in reversed(range(n))]


def official_as_of(rows: list[dict], as_of: dt.date):
    """The last official weekly row (dicts with `cutoff`, `cum_ha`, `cum_cane_t`) whose cut-off
    is on or before `as_of`, or None. Rows before the first harvested hectare are skipped."""
    known = [r for r in rows if r["cutoff"] <= as_of and (r["cum_ha"] or 0) > 0]
    return max(known, key=lambda r: r["cutoff"]) if known else None


def yield_to_date(row) -> float | None:
    """Official mean field yield to a report's cut-off: cumulative cane t / cumulative ha."""
    if not row or not row.get("cum_ha") or row.get("cum_cane_t") is None:
        return None
    return row["cum_cane_t"] / row["cum_ha"]


def is_night(local_time: dt.datetime) -> bool:
    return local_time.hour < NIGHT_BEFORE_HOUR


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
