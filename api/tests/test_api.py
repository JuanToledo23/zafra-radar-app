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

BEFORE_SEASON = "2025-10-15"  # Morelos season window starts 2025-11-01


def ops_csv(path: str):
    status, ctype, body = get(path)
    assert status == 200 and ctype.startswith("text/csv"), (path, status)
    assert body.startswith(b"\xef\xbb\xbf")  # UTF-8 BOM for Excel
    return list(csv.DictReader(io.StringIO(body.decode("utf-8-sig"))))


def test_ops_default_is_last_harvest_and_matches_the_map():
    site = next(s for s in get_json("/sites") if s["site_id"] == "morelos")
    d = get_json("/ops/morelos")
    assert d["replay"] is True and d["as_of_default"] is True
    assert d["as_of"] == site["harvest_date_max"]
    assert d["season"]["start"] == "2025-11-01" and d["season"]["end_exclusive"] == "2026-06-01"
    assert d["harvested"]["segments"] == 3976 and round(d["harvested"]["area_ha"]) == 6867
    assert d["not_yet_harvested"]["segments"] == 0
    assert d["cane_tonnage_estimate"]["label"] == "estimate"
    assert d["cane_tonnage_estimate"]["field_yield_t_ha"] == 95.7
    assert d["cane_tonnage_estimate"]["tonnes"] == round(d["harvested"]["area_ha"] * 95.7)


def test_ops_before_the_season_is_empty():
    d = get_json(f"/ops/morelos?as_of={BEFORE_SEASON}")
    assert d["harvested"]["segments"] == 0 and d["harvested"]["area_ha"] == 0
    assert d["harvested_last_7_days"]["segments"] == 0
    assert d["pace"]["ha_per_week"] == 0 and d["projected_end"] is None
    assert d["burned_not_harvested"]["segments"] == 0
    assert get_json(f"/ops/morelos/burned?as_of={BEFORE_SEASON}")["total"] == 0


def test_ops_burned_list_has_only_fires_on_or_before_as_of():
    for as_of in ("2025-11-20", "2026-01-05", "2026-02-15"):
        page = get_json(f"/ops/morelos/burned?as_of={as_of}&limit=500")
        assert page["total"] > 0
        for r in page["rows"]:
            assert r["first_fire_date"] <= r["last_fire_date"] <= as_of
            assert r["harvest_date"] is None or r["harvest_date"] > as_of
            assert r["days_since_burn"] == (dt.date.fromisoformat(as_of)
                                            - dt.date.fromisoformat(r["first_fire_date"])).days


def test_ops_partition_and_monotonic_harvest():
    site = next(s for s in get_json("/sites") if s["site_id"] == "morelos")
    day, end = dt.date(2025, 11, 2), dt.date.fromisoformat(site["harvest_date_max"])
    prev = (0, 0.0)
    while day <= end + dt.timedelta(days=7):
        d = get_json(f"/ops/morelos?as_of={day}")
        parts = [d[k] for k in ("harvested", "not_yet_harvested", "no_date_detected")]
        assert sum(p["segments"] for p in parts) == d["cane"]["segments"] == 6014
        assert abs(sum(p["area_ha"] for p in parts) - d["cane"]["area_ha"]) < 0.05
        h = (d["harvested"]["segments"], d["harvested"]["area_ha"])
        assert h[0] >= prev[0] and h[1] >= prev[1] - 1e-6, (day, prev, h)
        prev = h
        day += dt.timedelta(days=7)
    assert prev[0] == 3976


def test_ops_buckets_match_the_list_and_its_order():
    as_of = "2026-02-15"
    d = get_json(f"/ops/morelos?as_of={as_of}")
    b = d["burned_not_harvested"]
    assert [x["bucket"] for x in b["buckets"]] == ["0_2", "3_7", "8_14", "over_14"]
    assert b["segments"] == sum(x["segments"] for x in b["buckets"])
    assert get_json(f"/ops/morelos/burned?as_of={as_of}&limit=1")["total"] == b["segments"]
    for x in b["buckets"]:
        page = get_json(f"/ops/morelos/burned?as_of={as_of}&bucket={x['bucket']}&limit=500")
        assert page["total"] == x["segments"]
        assert {r["bucket"] for r in page["rows"]} <= {x["bucket"]}
        assert all(x["min_days"] <= r["days_since_burn"] <= (x["max_days"] or 10 ** 6)
                   for r in page["rows"])
        keys = [(-r["days_since_burn"], -r["area_ha"]) for r in page["rows"]]
        assert keys == sorted(keys)


def test_ops_csv_exports():
    as_of = "2026-02-15"
    d = get_json(f"/ops/morelos?as_of={as_of}")
    rows = ops_csv(f"/ops/morelos/burned.csv?as_of={as_of}")
    assert len(rows) == d["burned_not_harvested"]["segments"]
    assert {"segment_id", "area_ha", "first_fire_date", "last_fire_date", "days_since_burn",
            "bucket", "harvest_date_later", "lon", "lat"} <= set(rows[0])
    over = ops_csv(f"/ops/morelos/burned.csv?as_of={as_of}&bucket=over_14")
    assert len(over) == d["burned_not_harvested"]["buckets"][3]["segments"]
    ledger = ops_csv(f"/ops/morelos/ledger.csv?as_of={as_of}")
    assert len(ledger) == 6014 and len({r["segment_id"] for r in ledger}) == 6014
    status = {k: sum(r["status_as_of"] == k for r in ledger)
              for k in ("harvested", "not_yet_harvested", "no_date_detected")}
    assert status == {"harvested": d["harvested"]["segments"],
                      "not_yet_harvested": d["not_yet_harvested"]["segments"],
                      "no_date_detected": d["no_date_detected"]["segments"]}
    assert sum(bool(r["bucket"]) for r in ledger) == d["burned_not_harvested"]["segments"]
    assert all(r["first_season_fire"] <= as_of for r in ledger if r["first_season_fire"])
    assert all(r["last_season_fire"] <= as_of for r in ledger if r["last_season_fire"])
    assert {"p_cane", "p_cane_radar", "p_cane_optical", "date_uncertainty_days",
            "alert_codes"} <= set(ledger[0])


def test_ops_brazil_has_no_tonnage_or_burn_window():
    d = get_json("/ops/brazil")
    assert "cane_tonnage_estimate" not in d
    assert d["fires_outside_hours_last_7_days"] is None
    assert d["season"]["start"] == "2026-04-01"


def test_ops_fire_to_harvest_statistic():
    d = get_json("/ops/morelos/fire-to-harvest")
    assert d["count"] > 0 and d["q1"] <= d["median"] <= d["q3"]
    for k in ("share_within_3", "share_over_7", "share_over_14", "share_negative"):
        assert 0 <= d[k] <= 1
    assert d["share_over_14"] <= d["share_over_7"]


def test_ops_errors():
    assert get("/ops/nowhere")[0] == 404
    assert get("/ops/morelos/burned?bucket=nope")[0] == 400
    assert get("/ops/morelos/burned.csv?bucket=nope")[0] == 400
    assert get("/ops/morelos?as_of=2026-02-30")[0] == 422
    assert get("/ops/morelos/burned?limit=0")[0] == 422


def test_tiles_carry_the_fire_day_numbers():
    page = get_json("/ops/morelos/burned?as_of=2026-02-15&limit=1")["rows"][0]
    x, y = tile_of(*page["centroid"], 14)
    status, _, body = get(f"/tiles/morelos/14/{x}/{y}.pbf")
    assert status == 200 and b"first_fire_day" in body and b"last_fire_day" in body
