"""Unit tests for the pure mill-operations helpers of app.ops (no database)."""

import csv
import datetime as dt
import io

import pytest

from app import ops

D = dt.date


@pytest.mark.parametrize("days, key", [(0, "0_2"), (2, "0_2"), (3, "3_7"), (7, "3_7"),
                                       (8, "8_14"), (14, "8_14"), (15, "over_14"),
                                       (400, "over_14")])
def test_bucket_edges(days, key):
    assert ops.bucket_of(days) == key


def test_bucket_rejects_negative():
    with pytest.raises(ValueError):
        ops.bucket_of(-1)


def test_bucket_sql_matches_bucket_of():
    sql = ops.bucket_sql("x")
    assert sql == ("CASE WHEN x <= 2 THEN '0_2' WHEN x <= 7 THEN '3_7' WHEN x <= 14 THEN "
                   "'8_14' ELSE 'over_14' END")


def test_state_partition():
    d = D(2026, 2, 15)
    assert ops.state_of(None, d) == "no_date"
    assert ops.state_of(D(2026, 2, 15), d) == "harvested"
    assert ops.state_of(D(2026, 2, 16), d) == "not_yet_harvested"


def test_recent_window_is_seven_days_inclusive():
    a, b = ops.recent_window(D(2026, 2, 15))
    assert (a, b) == (D(2026, 2, 9), D(2026, 2, 15)) and (b - a).days + 1 == 7


def test_pace_weeks_full_monday_weeks():
    # 2026-02-15 is a Sunday: its own week is full.
    assert ops.pace_weeks(D(2026, 2, 15)) == [
        (D(2026, 1, 26), D(2026, 2, 1)), (D(2026, 2, 2), D(2026, 2, 8)),
        (D(2026, 2, 9), D(2026, 2, 15))]
    # A Wednesday: the week in progress is left out.
    weeks = ops.pace_weeks(D(2026, 2, 18))
    assert weeks[-1] == (D(2026, 2, 9), D(2026, 2, 15))
    assert all(a.weekday() == 0 and b.weekday() == 6 and (b - a).days == 6 for a, b in weeks)


def test_projected_end():
    d = D(2026, 2, 15)
    assert ops.projected_end(d, 100.0, 0.0) is None
    assert ops.projected_end(d, 0.0, 50.0) == d
    assert ops.projected_end(d, 100.0, 50.0) == D(2026, 3, 1)  # two weeks
    assert ops.projected_end(d, 101.0, 50.0) == D(2026, 3, 2)  # rounded up


def test_fire_to_harvest_stats():
    s = ops.fire_to_harvest_stats([-2, 0, 3, 5, 10, 20])
    assert s["count"] == 6 and s["median"] == 4 and s["min"] == -2 and s["max"] == 20
    assert s["q1"] == pytest.approx(0.75) and s["q3"] == pytest.approx(8.75)
    assert s["share_within_3"] == pytest.approx(3 / 6)
    assert s["share_over_7"] == pytest.approx(2 / 6)
    assert s["share_over_14"] == pytest.approx(1 / 6)
    assert s["share_negative"] == pytest.approx(1 / 6)
    assert ops.fire_to_harvest_stats([])["median"] is None
    assert ops.fire_to_harvest_stats([4])["q1"] == 4


def test_csv_bytes_bom_and_cells():
    body = ops.csv_bytes(["id", "d", "codes", "x"],
                         [["cc1", D(2026, 1, 2), ["A", "B"], None], ["cc2", None, [], 1.5]])
    assert body.startswith(b"\xef\xbb\xbf")
    text = body.decode("utf-8-sig")
    assert "\r\n" in text
    rows = list(csv.reader(io.StringIO(text)))
    assert rows == [["id", "d", "codes", "x"], ["cc1", "2026-01-02", "A;B", ""],
                    ["cc2", "", "", "1.5"]]


def test_minutes():
    assert ops.minutes("09:00") == 540 and ops.minutes("17:00") == 1020
