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
