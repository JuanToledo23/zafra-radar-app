"""Unit tests for the pure mill-operations helpers of app.ops (no database)."""

import csv
import datetime as dt
import io

import pytest

from app import ops

D = dt.date


def test_state_partition():
    # Dated later and never dated are one state: nothing as of d tells them apart.
    d = D(2026, 2, 15)
    assert ops.state_of(None, d) == "not_yet_detected"
    assert ops.state_of(D(2026, 2, 15), d) == "harvested"
    assert ops.state_of(D(2026, 2, 16), d) == "not_yet_detected"


def test_recent_window_is_seven_days_inclusive():
    a, b = ops.recent_window(D(2026, 2, 15))
    assert (a, b) == (D(2026, 2, 9), D(2026, 2, 15)) and (b - a).days + 1 == 7


def test_previous_window_is_the_seven_days_before():
    assert ops.previous_window(D(2026, 2, 15)) == (D(2026, 2, 2), D(2026, 2, 8))
    a, b = ops.recent_window(D(2026, 2, 15), 14)
    assert (a, b) == (D(2026, 2, 2), D(2026, 2, 15))


def test_pace_weeks_full_monday_weeks():
    # 2026-02-15 is a Sunday: its own week is full.
    assert ops.pace_weeks(D(2026, 2, 15)) == [
        (D(2026, 1, 26), D(2026, 2, 1)), (D(2026, 2, 2), D(2026, 2, 8)),
        (D(2026, 2, 9), D(2026, 2, 15))]
    # A Wednesday: the week in progress is left out.
    weeks = ops.pace_weeks(D(2026, 2, 18))
    assert weeks[-1] == (D(2026, 2, 9), D(2026, 2, 15))
    assert all(a.weekday() == 0 and b.weekday() == 6 and (b - a).days == 6 for a, b in weeks)


def test_csv_bytes_bom_and_cells():
    body = ops.csv_bytes(["id", "d", "codes", "x"],
                         [["cc1", D(2026, 1, 2), ["A", "B"], None], ["cc2", None, [], 1.5]])
    assert body.startswith(b"\xef\xbb\xbf")
    text = body.decode("utf-8-sig")
    assert "\r\n" in text
    rows = list(csv.reader(io.StringIO(text)))
    assert rows == [["id", "d", "codes", "x"], ["cc1", "2026-01-02", "A;B", ""],
                    ["cc2", "", "", "1.5"]]


def test_official_as_of_uses_only_reports_cut_off_by_the_date():
    rows = [{"report": 1, "cutoff": D(2025, 11, 22), "cum_ha": 0.0, "cum_cane_t": 0.0},
            {"report": 2, "cutoff": D(2025, 11, 29), "cum_ha": 174.0, "cum_cane_t": 16576.0},
            {"report": 3, "cutoff": D(2025, 12, 6), "cum_ha": 434.0, "cum_cane_t": 57264.0}]
    assert ops.official_as_of(rows, D(2025, 11, 28)) is None  # only a report with 0 ha
    assert ops.official_as_of(rows, D(2025, 11, 29))["report"] == 2
    assert ops.official_as_of(rows, D(2025, 12, 5))["report"] == 2  # report 3 not cut off yet
    assert ops.official_as_of(rows, D(2026, 5, 1))["report"] == 3
    assert ops.official_as_of([], D(2026, 5, 1)) is None


def test_yield_to_date():
    assert ops.yield_to_date({"cum_ha": 9565.0, "cum_cane_t": 915365.0}) == pytest.approx(95.6994, abs=1e-4)
    assert ops.yield_to_date({"cum_ha": 0.0, "cum_cane_t": 0.0}) is None
    assert ops.yield_to_date(None) is None


def test_night_is_before_six_local():
    assert ops.is_night(dt.datetime(2026, 2, 15, 2, 6))
    assert ops.is_night(dt.datetime(2026, 2, 15, 5, 59))
    assert not ops.is_night(dt.datetime(2026, 2, 15, 6, 0))
    assert not ops.is_night(dt.datetime(2026, 2, 15, 13, 53))
