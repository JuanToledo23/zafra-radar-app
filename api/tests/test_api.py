"""HTTP tests against the running API (standard library only). The data must be loaded
(python -m app.loader --site all). Base URL: ZAFRA_API_URL, default http://localhost:8010.
Every test is skipped when the API does not answer /health."""

import json
import math
import os
import urllib.error
import urllib.request

import pytest

BASE = os.environ.get("ZAFRA_API_URL", "http://localhost:8010").rstrip("/")
DATED_MORELOS = "cc00042"  # harvested 2026-01-07 in the Morelos slim map


def get(path: str):
    """(status, content type, body bytes); HTTP errors are returned, not raised."""
    try:
        with urllib.request.urlopen(BASE + path, timeout=30) as r:
            return r.status, r.headers.get("Content-Type"), r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Content-Type"), e.read()


def get_json(path: str):
    status, _, body = get(path)
    assert status == 200, (path, status, body[:200])
    return json.loads(body)


def _reachable() -> bool:
    try:
        with urllib.request.urlopen(BASE + "/health", timeout=3) as r:
            return r.status == 200
    except (OSError, ValueError):
        return False


pytestmark = pytest.mark.skipif(
    not _reachable(), reason=f"API not reachable at {BASE} (start it: docker compose up -d)")


def tile_of(lon: float, lat: float, z: int) -> tuple[int, int]:
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def test_sites_lists_both_sites():
    sites = {s["site_id"]: s for s in get_json("/sites")}
    assert {"morelos", "brazil"} <= set(sites)
    m = sites["morelos"]
    assert len(m["bbox"]) == 4 and m["bbox"][0] < m["bbox"][2] and m["bbox"][1] < m["bbox"][3]
    assert m["has_official"] is True and sites["brazil"]["has_official"] is False
    assert m["segment_count"] == 6014 and m["dated_segment_count"] == 3976


def test_morelos_tile_at_bbox_centre():
    m = next(s for s in get_json("/sites") if s["site_id"] == "morelos")
    w, s, e, n = m["bbox"]
    x, y = tile_of((w + e) / 2, (s + n) / 2, 12)
    status, ctype, body = get(f"/tiles/morelos/12/{x}/{y}.pbf")
    assert status == 200
    assert ctype == "application/vnd.mapbox-vector-tile"
    assert len(body) > 0


def test_unknown_site_is_404():
    assert get("/tiles/nowhere/12/0/0.pbf")[0] == 404
    assert get("/segments/nowhere/cc00042")[0] == 404
    assert get("/weekly/nowhere")[0] == 404


def test_invalid_tile_is_400():
    assert get("/tiles/morelos/12/4096/0.pbf")[0] == 400
    assert get("/tiles/morelos/a/0/0.pbf")[0] == 400


def test_dated_morelos_segment_detail():
    d = get_json(f"/segments/morelos/{DATED_MORELOS}")
    assert {"segment_id", "status", "confidence", "area_ha", "p_cane", "harvest_date",
            "date_uncertainty_days", "centroid", "bbox", "series", "coherence", "fires",
            "summary", "alerts"} <= set(d)
    assert d["harvest_date"] is not None
    assert set(d["series"]) == {"asc", "desc"}
    for points in d["series"].values():
        dates = [p["date"] for p in points]
        assert points and dates == sorted(dates)
        assert {"date", "hv_db", "hh_db"} <= set(points[0])
    assert d["coherence"] and {"ref_date", "sec_date", "coh_mean"} <= set(d["coherence"][0])


def test_unknown_segment_is_404():
    assert get("/segments/morelos/no_such_segment")[0] == 404


def test_weekly_morelos_has_official_rows():
    d = get_json("/weekly/morelos")
    assert len(d["weeks"]) == 31
    assert len(d["official"]) == 36
    assert d["cumulative"]["weeks"]


def test_weekly_brazil_has_no_official():
    d = get_json("/weekly/brazil")
    assert d["weeks"]
    assert d["official"] is None


def test_reference_morelos_has_38_fields_with_p36():
    d = get_json("/reference/morelos")
    assert d["type"] == "FeatureCollection"
    assert len(d["features"]) == 38
    by_id = {f["properties"]["field_id"]: f for f in d["features"]}
    p36 = by_id["p36"]
    assert p36["geometry"]["type"] == "MultiPolygon"
    props = p36["properties"]
    assert {"reference_dates", "summary", "segments", "facts", "bbox"} <= set(props)
    assert {r["kind"] for r in props["reference_dates"]} == {"labelled_window", "ground_truth"}
    assert props["summary"]["en"]["text"] and props["summary"]["es"]["text"]
    shares = [s["overlap_share"] for s in props["segments"]]
    assert shares and shares == sorted(shares, reverse=True) and 0 < sum(shares) <= 1
    assert {"segment_id", "harvest_date", "date_uncertainty_days"} <= set(props["segments"][0])


def test_reference_brazil_is_empty():
    assert get_json("/reference/brazil") == {"type": "FeatureCollection", "site_id": "brazil",
                                             "features": []}
    assert get("/reference/nowhere")[0] == 404


def test_alerts_morelos_counts_and_page():
    d = get_json("/alerts/morelos")
    codes = {c["code"]: c for c in d["codes"]}
    assert d["source"] == "derived" and d["library"]["commit"]
    assert set(codes) >= {"FIRE_ACTIVE_OUTSIDE_HOURS", "BURN_WITHOUT_HARVEST", "NO_BASELINE",
                          "RADAR_OPTICAL_DISAGREE"}
    for c in codes.values():
        assert c["severity"] in ("warning", "info") and c["definition"]
    assert d["total"] == sum(c["count"] for c in codes.values()) > 0
    assert d["limit"] == 50 and len(d["alerts"]) == 50
    first = d["alerts"][0]
    assert {"segment_id", "code", "severity", "evidence", "harvest_date", "area_ha",
            "centroid"} <= set(first)
    assert len(first["centroid"]) == 2
    ranks = [0 if a["severity"] == "warning" else 1 for a in d["alerts"]]
    assert ranks == sorted(ranks)


def test_alerts_code_filter_and_paging():
    counts = {c["code"]: c["count"] for c in get_json("/alerts/morelos")["codes"]}
    d = get_json("/alerts/morelos?code=NO_BASELINE&limit=10&offset=5")
    assert d["code"] == "NO_BASELINE" and d["total"] == counts["NO_BASELINE"]
    assert len(d["alerts"]) == 10 and {a["code"] for a in d["alerts"]} == {"NO_BASELINE"}
    whole = get_json("/alerts/morelos?code=NO_BASELINE&limit=15")["alerts"]
    assert [a["segment_id"] for a in d["alerts"]] == [a["segment_id"] for a in whole[5:15]]


def test_alerts_unknown_code_is_400_and_unknown_site_404():
    assert get("/alerts/morelos?code=NOT_A_CODE")[0] == 400
    assert get("/alerts/nowhere")[0] == 404
    assert get("/alerts/morelos?limit=0")[0] == 422


def test_alert_codes_on_detail_and_tile():
    page = get_json("/alerts/morelos?code=FIRE_ACTIVE_OUTSIDE_HOURS&limit=1")["alerts"][0]
    d = get_json(f"/segments/morelos/{page['segment_id']}")
    assert "FIRE_ACTIVE_OUTSIDE_HOURS" in {a["code"] for a in d["alerts"]}
    x, y = tile_of(*page["centroid"], 14)
    status, _, body = get(f"/tiles/morelos/14/{x}/{y}.pbf")
    assert status == 200 and b"alert_codes" in body and b"FIRE_ACTIVE_OUTSIDE_HOURS" in body


# --- mill operations (/ops) ----------------------------------------------------------------

import csv  # noqa: E402
import datetime as dt  # noqa: E402
import io  # noqa: E402
import re  # noqa: E402

BEFORE_SEASON = "2025-10-15"  # Morelos season window starts 2025-11-01
ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
HINDSIGHT_DATES = {"morelos": ("2025-11-20", "2026-01-05", "2026-02-15", "2026-04-01"),
                   "brazil": ("2026-05-10", "2026-08-30", "2026-09-30")}


def ops_csv(path: str):
    status, ctype, body = get(path)
    assert status == 200 and ctype.startswith("text/csv"), (path, status)
    assert body.startswith(b"\xef\xbb\xbf")  # UTF-8 BOM for Excel
    return list(csv.DictReader(io.StringIO(body.decode("utf-8-sig"))))


def all_pages(path: str) -> list:
    rows, first = [], get_json(f"{path}&limit=500&offset=0")
    rows += first["rows"]
    while len(rows) < first["total"]:
        rows += get_json(f"{path}&limit=500&offset={len(rows)}")["rows"]
    return rows


def site_info(site: str) -> dict:
    return next(s for s in get_json("/sites") if s["site_id"] == site)


def test_ops_default_is_last_harvest_and_matches_the_map():
    site = site_info("morelos")
    d = get_json("/ops/morelos")
    assert d["replay"] is True and d["as_of_default"] is True
    assert d["as_of"] == site["harvest_date_max"]
    assert d["season"]["start"] == "2025-11-01" and d["season"]["end_exclusive"] == "2026-06-01"
    assert d["harvested"]["segments"] == 3976 and round(d["harvested"]["area_ha"]) == 6867
    assert d["not_yet_detected"]["segments"] == 6014 - 3976
    # The last official report cut off by 2026-05-07 is report 25 (2026-05-02): 9,373 ha,
    # 914,718 t; the final one (9,565 ha, 95.70 t/ha) is cut off on 2026-05-09.
    t, o = d["cane_tonnage_estimate"], d["official"]
    assert o["report"] == 25 and o["cutoff"] == "2026-05-02" and o["official_harvested_ha"] == 9373
    assert t["label"] == "estimate" and t["yield_t_ha"] == 97.59 and t["official_cutoff"] == "2026-05-02"
    assert abs(t["tonnes"] - d["harvested"]["area_ha"] * 914718 / 9373) <= 1
    assert o["detected_share_of_official"] == pytest.approx(o["detected_harvested_ha"] / 9373, abs=1e-6)
    end = get_json("/ops/morelos?as_of=2026-05-09")
    assert end["official"]["official_harvested_ha"] == 9565
    assert end["cane_tonnage_estimate"]["yield_t_ha"] == 95.7


def test_ops_before_the_season_is_empty():
    d = get_json(f"/ops/morelos?as_of={BEFORE_SEASON}")
    assert d["harvested"]["segments"] == 0 and d["harvested"]["area_ha"] == 0
    assert d["harvested_last_7_days"]["segments"] == 0
    assert d["harvested_previous_7_days"]["segments"] == 0
    assert d["pace"]["ha_per_week"] == 0
    assert d["not_yet_detected"]["segments"] == 6014
    assert d["official"] is None and d["cane_tonnage_estimate"] is None
    assert get_json(f"/ops/morelos/harvested?as_of={BEFORE_SEASON}")["total"] == 0
    assert get_json(f"/ops/morelos/fires?as_of={BEFORE_SEASON}")["detections"] == 0


def test_ops_partition_and_monotonic_harvest():
    end = dt.date.fromisoformat(site_info("morelos")["harvest_date_max"])
    day, prev = dt.date(2025, 11, 2), (0, 0.0)
    while day <= end + dt.timedelta(days=7):
        d = get_json(f"/ops/morelos?as_of={day}")
        parts = [d["harvested"], d["not_yet_detected"]]
        assert sum(p["segments"] for p in parts) == d["cane"]["segments"] == 6014
        assert abs(sum(p["area_ha"] for p in parts) - d["cane"]["area_ha"]) < 0.05
        assert get_json(f"/ops/morelos/not-detected?as_of={day}&limit=1")["total"] == \
            d["not_yet_detected"]["segments"]
        h = (d["harvested"]["segments"], d["harvested"]["area_ha"])
        assert h[0] >= prev[0] and h[1] >= prev[1] - 1e-6, (day, prev, h)
        prev = h
        day += dt.timedelta(days=7)
    assert prev[0] == 3976


@pytest.mark.parametrize("site", ["morelos", "brazil"])
def test_ops_weekly_harvested_lists_add_up_to_the_total(site):
    info = site_info(site)
    lo, hi = (dt.date.fromisoformat(info[k]) for k in ("harvest_date_min", "harvest_date_max"))
    day, n, ha = lo + dt.timedelta(days=6), 0, 0.0  # windows day-6 .. day tile the season
    while day - dt.timedelta(days=6) <= hi:
        rows = ops_csv(f"/ops/{site}/harvested.csv?as_of={day}&days=7")
        assert get_json(f"/ops/{site}/harvested?as_of={day}&days=7&limit=1")["total"] == len(rows)
        n += len(rows)
        ha += sum(float(r["area_ha"]) for r in rows)
        day += dt.timedelta(days=7)
    total = get_json(f"/ops/{site}?as_of={hi}")["harvested"]
    assert n == total["segments"] == info["dated_segment_count"]
    assert abs(ha - total["area_ha"]) < 0.5


def test_ops_harvested_list():
    as_of = "2026-02-15"
    d = get_json(f"/ops/morelos?as_of={as_of}")
    week = all_pages(f"/ops/morelos/harvested?as_of={as_of}&days=7")
    two = all_pages(f"/ops/morelos/harvested?as_of={as_of}&days=14")
    assert len(week) == d["harvested_last_7_days"]["segments"] > 0
    assert len(two) == len(week) + d["harvested_previous_7_days"]["segments"]
    assert {r["segment_id"] for r in week} <= {r["segment_id"] for r in two}
    assert all("2026-02-09" <= r["harvest_date"] <= as_of for r in week)
    keys = [(r["harvest_date"], r["area_ha"]) for r in two]
    assert keys == sorted(keys, key=lambda k: (k[0], k[1]), reverse=True)
    y = d["cane_tonnage_estimate"]["yield_t_ha"]
    assert all(abs(r["tonnes_estimate"] - r["area_ha"] * y) <= 1 + r["area_ha"] * 0.01 for r in week)
    assert {"segment_id", "harvest_date", "date_uncertainty_days", "date_confidence", "area_ha",
            "tonnes_estimate", "centroid"} == set(week[0])
    rows = ops_csv(f"/ops/morelos/harvested.csv?as_of={as_of}&days=14")
    assert [r["segment_id"] for r in rows] == [r["segment_id"] for r in two]


def test_ops_not_detected_list():
    as_of = "2026-02-15"
    d = get_json(f"/ops/morelos?as_of={as_of}")
    rows = all_pages(f"/ops/morelos/not-detected?as_of={as_of}")
    assert len(rows) == d["not_yet_detected"]["segments"]
    assert abs(sum(r["area_ha"] for r in rows) - d["not_yet_detected"]["area_ha"]) < 0.5
    areas = [r["area_ha"] for r in rows]
    assert areas == sorted(areas, reverse=True)
    assert {tuple(sorted(r)) for r in rows} == {("area_ha", "centroid", "segment_id")}
    assert [r["segment_id"] for r in ops_csv(f"/ops/morelos/not-detected.csv?as_of={as_of}")] == \
        [r["segment_id"] for r in rows]


def test_ops_fires_are_context_within_the_window():
    as_of = "2026-02-15"
    f = get_json(f"/ops/morelos/fires?as_of={as_of}")
    assert f["from"] == "2026-02-09" and f["to"] == as_of and f["fire_buffer_m"] == 200
    assert f["detections"] == len(f["rows"]) > 0
    assert f["night"] == sum(int(r["datetime_local"][11:13]) < 6 for r in f["rows"])
    assert all("2026-02-09" <= r["datetime_local"][:10] <= as_of for r in f["rows"])
    assert all(r["cane_segments_within_200m"] >= 1 for r in f["rows"])
    assert not any(k in f["rows"][0] for k in ("segment_id", "segment_ids"))


@pytest.mark.parametrize("site", ["morelos", "brazil"])
def test_ops_fire_overpass_hours_match_the_screen_wording(site):
    # The screen says the satellites pass at about 02:00 and 14:00 local time.
    season = get_json(f"/ops/{site}")["season"]
    day = dt.date.fromisoformat(season["start"]) + dt.timedelta(days=6)
    end = dt.date.fromisoformat(season["end_exclusive"])
    hours = set()
    while day < end + dt.timedelta(days=7):
        hours |= {int(r["datetime_local"][11:13]) for r in get_json(f"/ops/{site}/fires?as_of={day}")["rows"]}
        day += dt.timedelta(days=7)
    assert hours and hours <= {1, 2, 3, 12, 13, 14}, hours


def test_ops_ledger():
    as_of = "2026-02-15"
    d = get_json(f"/ops/morelos?as_of={as_of}")
    ledger = ops_csv(f"/ops/morelos/ledger.csv?as_of={as_of}")
    assert len(ledger) == 6014 and len({r["segment_id"] for r in ledger}) == 6014
    status = {k: sum(r["status_as_of"] == k for r in ledger) for k in ("harvested", "not_yet_detected")}
    assert status == {"harvested": d["harvested"]["segments"],
                      "not_yet_detected": d["not_yet_detected"]["segments"]}
    for r in ledger:
        n = int(r["fire_detections_within_200m"])
        assert (n == 0) == (r["first_fire_detection_within_200m"] == "")
        assert r["first_fire_detection_within_200m"] <= r["last_fire_detection_within_200m"] <= as_of
        if r["status_as_of"] == "not_yet_detected":
            assert r["harvest_date"] == r["date_uncertainty_days"] == r["date_confidence"] == ""
    assert {"p_cane_whole_season", "p_cane_radar_whole_season",
            "p_cane_optical_whole_season"} <= set(ledger[0])
    # The library's alert codes depend on later harvest dates (BURN_WITHOUT_HARVEST): left out.
    assert not any("alert" in k for k in ledger[0])


def dates_after(value, day: str, path: str = "") -> list:
    """(path, date) of every ISO date later than `day` in a JSON value; the season window
    (configuration, known in advance) is left out."""
    if isinstance(value, dict):
        return [x for k, v in value.items() if not (path == "" and k == "season")
                for x in dates_after(v, day, f"{path}.{k}")]
    if isinstance(value, list):
        return [x for i, v in enumerate(value) for x in dates_after(v, day, f"{path}[{i}]")]
    if isinstance(value, str):
        return [(path, m) for m in ISO_DATE.findall(value) if m > day]
    return []


@pytest.mark.parametrize("site", ["morelos", "brazil"])
def test_ops_no_hindsight_on_any_endpoint(site):
    """Every endpoint of the mill operations screen, as of D, shows no date after D and does
    not tell fields dated after D from fields never dated."""
    info = site_info(site)
    for d in HINDSIGHT_DATES[site]:
        brief = get_json(f"/ops/{site}?as_of={d}")
        assert not dates_after(brief, d), dates_after(brief, d)
        assert not {"not_yet_harvested", "no_date_detected", "projected_end"} & set(brief)
        for path in (f"/ops/{site}/harvested?as_of={d}&days=7", f"/ops/{site}/harvested?as_of={d}&days=14",
                     f"/ops/{site}/not-detected?as_of={d}"):
            rows = all_pages(path)
            assert not dates_after(rows, d), (path, dates_after(rows, d)[:3])
        later = all_pages(f"/ops/{site}/not-detected?as_of={d}")
        assert all(set(r) == {"segment_id", "area_ha", "centroid"} for r in later)
        assert len(later) == brief["not_yet_detected"]["segments"]
        fires = get_json(f"/ops/{site}/fires?as_of={d}")
        assert not dates_after(fires, d)
        series = get_json(f"/ops/{site}/series?as_of={d}")
        assert not dates_after(series, d), dates_after(series, d)[:3]
        assert series["weeks"][-1]["end"] == d
        assert math.isclose(sum(w["area_ha"] for w in series["weeks"]), brief["harvested"]["area_ha"], abs_tol=0.05)
        assert not any("pct" in k or "share" in k for w in series.get("official") or [] for k in w)
        for path in (f"/ops/{site}/harvested.csv?as_of={d}&days=14", f"/ops/{site}/not-detected.csv?as_of={d}",
                     f"/ops/{site}/ledger.csv?as_of={d}"):
            _, _, body = get(path)
            late = [m for m in ISO_DATE.findall(body.decode("utf-8-sig")) if m > d]
            assert not late, (path, late[:3])
        ledger = ops_csv(f"/ops/{site}/ledger.csv?as_of={d}")
        assert {r["status_as_of"] for r in ledger} <= {"harvested", "not_yet_detected"}
        assert all(r["harvest_date"] == r["date_uncertainty_days"] == r["date_confidence"] == ""
                   for r in ledger if r["status_as_of"] == "not_yet_detected")
        # The map's tiles: every tile of the site at z11.
        w, s_, e, n = info["bbox"]
        (x0, y0), (x1, y1) = tile_of(w, n, 11), tile_of(e, s_, 11)
        seen = 0
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                status, _, body = get(f"/ops/{site}/tiles/11/{x}/{y}.pbf?as_of={d}")
                assert status in (200, 204)
                late = [m for m in ISO_DATE.findall(body.decode("latin-1")) if m > d]
                assert not late, (x, y, late[:3])
                for key in (b"status", b"confidence", b"alert_codes", b"fire"):
                    assert key not in body, (x, y, key)
                seen += status == 200
        assert seen > 0


def test_ops_series_weeks_and_official_up_to_the_date():
    as_of = "2026-02-18"  # a Wednesday: its week is counted only up to it
    s = get_json(f"/ops/morelos/series?as_of={as_of}")
    weeks = s["weeks"]
    assert weeks[0]["start"] <= "2025-11-01" and all(not w["partial"] for w in weeks[:-1])
    assert weeks[-1] == {**weeks[-1], "start": "2026-02-16", "end": as_of, "partial": True}
    assert all(dt.date.fromisoformat(w["start"]).weekday() == 0 for w in weeks)
    recent = all_pages(f"/ops/morelos/harvested?as_of={as_of}&days=7")
    assert 0 < weeks[-1]["segments"] == sum(r["harvest_date"] >= "2026-02-16" for r in recent)
    brief = get_json(f"/ops/morelos?as_of={as_of}")
    last = s["official"][-1]
    assert last["cutoff"] == brief["official"]["cutoff"] <= as_of
    assert last["official_cum_ha"] == brief["official"]["official_harvested_ha"]
    assert last["detected_cum_ha"] == brief["official"]["detected_harvested_ha"]
    assert "official" not in get_json("/ops/brazil/series?as_of=2026-09-30")


def test_ops_brazil_has_no_official_or_tonnage():
    d = get_json("/ops/brazil")
    assert "cane_tonnage_estimate" not in d and "official" not in d
    assert d["season"]["start"] == "2026-04-01"


def test_ops_errors():
    assert get("/ops/nowhere")[0] == 404
    assert get("/ops/nowhere/tiles/11/459/914.pbf")[0] == 404
    assert get("/ops/morelos/tiles/11/x/914.pbf")[0] == 400
    assert get("/ops/morelos?as_of=2026-02-30")[0] == 422
    assert get("/ops/morelos/harvested?days=10")[0] == 400
    assert get("/ops/morelos/harvested.csv?days=10")[0] == 400
    assert get("/ops/morelos/harvested?limit=0")[0] == 422
    assert get("/ops/nowhere/series")[0] == 404
    assert get("/ops/morelos/series?as_of=2026-13-01")[0] == 422
    assert get("/ops/morelos/not-detected?limit=501")[0] == 422


def test_explorer_tiles_carry_no_fire_days():
    x, y = tile_of(-99.2, 18.62, 12)
    status, _, body = get(f"/tiles/morelos/12/{x}/{y}.pbf")
    assert status == 200 and b"harvest_day" in body and b"fire_day" not in body
