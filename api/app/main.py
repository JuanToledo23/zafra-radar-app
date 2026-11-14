"""Zafra Radar API: /health, /version and the read endpoints over the tables filled by
app.loader (/sites, /tiles, /segments, /weekly). Endpoint reference: docs/API.md."""

import datetime as dt
import json
import math

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.db import engine

VERSION = "0.1.0"
MAX_ZOOM = 22
FIRE_BUFFER_M = 200  # configs/<site>.yaml alerts.fire_buffer_m, the library's fires_cane buffer
# Bounding-box prefilter for the fire search, in degrees: 0.01° is more than 200 m in any
# direction below about 80° latitude, so the exact ST_DWithin test below decides.
FIRE_PREFILTER_DEG = 0.01
SHARE_LEVELS = (0.25, 0.5, 0.75)
EPOCH = dt.date(1970, 1, 1)

app = FastAPI(title="Zafra Radar API", version=VERSION)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"])


def clean(value):
    """JSON-safe copy: dates -> ISO strings, NaN/inf -> None, jsonb text -> objects."""
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    return value


def real(row: dict) -> dict:
    """Floats of `real` (float4) columns at float4 precision (7 significant digits), so
    2.49 is not sent as 2.490000009536743."""
    return {k: float(f"{v:.7g}") if isinstance(v, float) else v for k, v in row.items()}


def as_json(value):
    """jsonb column value: asyncpg returns text unless a codec is registered."""
    return json.loads(value) if isinstance(value, str) else value


async def fetch(conn, sql: str, **params) -> list[dict]:
    return [dict(r) for r in (await conn.execute(text(sql), params)).mappings().all()]


async def require_site(conn, site: str) -> dict:
    rows = await fetch(conn, "SELECT site_id, official_final FROM sites WHERE site_id = :site",
                       site=site)
    if not rows:
        raise HTTPException(404, f"unknown site: {site}")
    return rows[0]


@app.get("/health")
async def health() -> dict:
    """Liveness plus a database round trip, so the healthcheck fails if PostGIS is down."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        db = "ok"
    except Exception as exc:  # reported in the body, not raised
        db = f"error: {type(exc).__name__}"
    return {"status": "ok" if db == "ok" else "degraded", "db": db}


@app.get("/version")
async def version() -> dict:
    return {"name": "zafra-radar-api", "version": VERSION}


SITES_SQL = """
SELECT s.site_id, s.name, s.season, s.timezone,
       ST_XMin(s.bbox) AS west, ST_YMin(s.bbox) AS south,
       ST_XMax(s.bbox) AS east, ST_YMax(s.bbox) AS north,
       g.segments, g.dated_segments, g.cane_ha, g.dated_ha, g.min_harvest, g.max_harvest,
       t.min_series, t.max_series,
       EXISTS (SELECT 1 FROM official_weekly o WHERE o.site_id = s.site_id) AS has_official,
       EXISTS (SELECT 1 FROM summaries m WHERE m.site_id = s.site_id) AS has_summaries,
       s.alert_counts, s.official_final
FROM sites s
LEFT JOIN LATERAL (
    SELECT count(*) AS segments, count(harvest_date) AS dated_segments,
           sum(area_ha::float8) AS cane_ha,
           sum(area_ha::float8) FILTER (WHERE harvest_date IS NOT NULL) AS dated_ha,
           min(harvest_date) AS min_harvest, max(harvest_date) AS max_harvest
    FROM segments WHERE site_id = s.site_id) g ON true
LEFT JOIN LATERAL (
    SELECT min(acquisition_date) AS min_series, max(acquisition_date) AS max_series
    FROM segment_series WHERE site_id = s.site_id) t ON true
ORDER BY s.site_id
"""


@app.get("/sites")
async def sites() -> list[dict]:
    """One object per loaded site. Every segment in the map is cane (DATA.md, cane rule), so
    the cane area is the area of all segments."""
    async with engine.connect() as conn:
        rows = await fetch(conn, SITES_SQL)
    return [clean({
        "site_id": r["site_id"], "name": r["name"], "season": r["season"],
        "timezone": r["timezone"],
        "bbox": [r["west"], r["south"], r["east"], r["north"]],
        "segment_count": r["segments"], "dated_segment_count": r["dated_segments"],
        "cane_area_ha": round(r["cane_ha"] or 0.0, 2),
        "dated_area_ha": round(r["dated_ha"] or 0.0, 2),
        "harvest_date_min": r["min_harvest"], "harvest_date_max": r["max_harvest"],
        "series_date_min": r["min_series"], "series_date_max": r["max_series"],
        "has_official": r["has_official"], "has_summaries": r["has_summaries"],
        "alert_counts": as_json(r["alert_counts"]),
        "official_final": as_json(r["official_final"]),
    }) for r in rows]


# `geom && <4326 envelope>` lets the planner use segments_geom_gist; the geometry is only
# transformed to web mercator for the segments that pass it.
TILE_SQL = """
WITH mvt AS (
    SELECT ST_AsMVTGeom(ST_Transform(geom, 3857), ST_TileEnvelope(:z, :x, :y), 4096, 64, true)
               AS geom,
           segment_id, status, confidence, area_ha, p_cane, p_cane_radar,
           date_uncertainty_days,
           to_char(harvest_date, 'YYYY-MM-DD') AS harvest_date,
           (harvest_date - DATE '1970-01-01') AS harvest_day
    FROM segments
    WHERE site_id = :site AND geom && ST_Transform(ST_TileEnvelope(:z, :x, :y), 4326)
)
SELECT ST_AsMVT(mvt, 'segments', 4096, 'geom') FROM mvt WHERE geom IS NOT NULL
"""


def tile_coords(z: str, x: str, y: str) -> tuple[int, int, int]:
    try:
        zi, xi, yi = int(z), int(x), int(y)
    except ValueError:
        raise HTTPException(400, "z, x and y must be integers") from None
    if not 0 <= zi <= MAX_ZOOM or not (0 <= xi < 2 ** zi and 0 <= yi < 2 ** zi):
        raise HTTPException(400, f"invalid tile {z}/{x}/{y}")
    return zi, xi, yi


@app.get("/tiles/{site}/{z}/{x}/{y}.pbf")
async def tile(site: str, z: str, x: str, y: str) -> Response:
    """Mapbox vector tile of the site's segments, layer `segments`; 204 when empty."""
    zi, xi, yi = tile_coords(z, x, y)
    async with engine.connect() as conn:
        await require_site(conn, site)
        data = (await conn.execute(text(TILE_SQL), {"site": site, "z": zi, "x": xi, "y": yi})
                ).scalar()
    if not data:
        return Response(status_code=204)
    return Response(content=bytes(data), media_type="application/vnd.mapbox-vector-tile",
                    headers={"Cache-Control": "public, max-age=3600"})


SEGMENT_SQL = """
SELECT segment_id, area_ha, p_cane, p_cane_radar, p_cane_optical, harvest_date,
       date_uncertainty_days, status, confidence, hv_drop_db, coh_min, wc_disagrees,
       ST_X(ST_Centroid(geom)) AS cx, ST_Y(ST_Centroid(geom)) AS cy,
       ST_XMin(geom) AS west, ST_YMin(geom) AS south, ST_XMax(geom) AS east,
       ST_YMax(geom) AS north
FROM segments WHERE site_id = :site AND segment_id = :seg
"""
SERIES_SQL = """
SELECT orbit, acquisition_date AS date, hv_db, hh_db FROM segment_series
WHERE site_id = :site AND segment_id = :seg ORDER BY orbit, acquisition_date
"""
COHERENCE_SQL = """
SELECT ref_date, sec_date, coh_mean, coh_min FROM segment_coherence
WHERE site_id = :site AND segment_id = :seg ORDER BY ref_date, sec_date
"""
# Distance on the geography (metres), as the library's 200 m buffer for fires_cane.
FIRES_SQL = """
SELECT f.datetime_local, f.satellite AS sensor, f.source, f.frp, f.confidence,
       ST_Distance(f.geom::geography, s.geom::geography) AS distance_m
FROM segments s JOIN fires f ON f.site_id = s.site_id
WHERE s.site_id = :site AND s.segment_id = :seg
  AND f.geom && ST_Expand(s.geom, :deg)
  AND ST_DWithin(f.geom::geography, s.geom::geography, :buffer)
ORDER BY f.datetime_local
"""
SUMMARY_SQL = """
SELECT lang, source, text FROM summaries WHERE site_id = :site AND segment_id = :seg
"""
ALERTS_SQL = """
SELECT code, severity, evidence FROM alerts
WHERE site_id = :site AND segment_id = :seg ORDER BY alert_id
"""


def pick_summary(rows: list[dict]):
    """{'es': {text, source}, 'en': {...}}, the verified LLM text over the template per
    language; None when the segment has no summary."""
    if not rows:
        return None
    out = {}
    for lang in ("es", "en"):
        by_source = {r["source"]: r["text"] for r in rows if r["lang"] == lang}
        source = "llm" if "llm" in by_source else "template" if "template" in by_source else None
        out[lang] = {"text": by_source[source], "source": source} if source else None
    return out


@app.get("/segments/{site}/{segment_id}")
async def segment(site: str, segment_id: str) -> dict:
    p = {"site": site, "seg": segment_id}
    async with engine.connect() as conn:
        await require_site(conn, site)
        rows = await fetch(conn, SEGMENT_SQL, **p)
        if not rows:
            raise HTTPException(404, f"unknown segment: {site}/{segment_id}")
        seg = rows[0]
        series = await fetch(conn, SERIES_SQL, **p)
        coherence = await fetch(conn, COHERENCE_SQL, **p)
        fires = await fetch(conn, FIRES_SQL, deg=FIRE_PREFILTER_DEG, buffer=FIRE_BUFFER_M, **p)
        summaries = await fetch(conn, SUMMARY_SQL, **p)
        alerts = await fetch(conn, ALERTS_SQL, **p)

    by_orbit: dict[str, list] = {}
    for r in series:
        by_orbit.setdefault(r["orbit"], []).append(
            real({"date": r["date"], "hv_db": r["hv_db"], "hh_db": r["hh_db"]}))
    fires = [{**real(f), "distance_m": round(f["distance_m"], 1)} for f in fires]
    attrs = real({k: seg[k] for k in seg if k not in ("cx", "cy", "west", "south", "east",
                                                         "north")})
    return clean({
        "site_id": site,
        **attrs,
        "centroid": [seg["cx"], seg["cy"]],
        "bbox": [seg["west"], seg["south"], seg["east"], seg["north"]],
        "series": by_orbit,
        "coherence": [real(c) for c in coherence],
        "fires": fires,
        "fire_buffer_m": FIRE_BUFFER_M,
        "summary": pick_summary(summaries),
        "alerts": [{**a, "evidence": as_json(a["evidence"])} for a in alerts],
    })


WEEKLY_SQL = """
SELECT week_start, harvests, fires_all, fires_cane FROM weekly
WHERE site_id = :site ORDER BY week_start
"""
OFFICIAL_SQL = """
SELECT cutoff, week_start, report, cycle_week, cum_ha, cum_cane_t, reported_week_ha,
       reported_week_cane_t, week_ha, week_cane_t, diff_vs_reported_ha, diff_vs_reported_cane_t
FROM official_weekly WHERE site_id = :site ORDER BY report
"""
# Dated cane area per official week, keyed by the Saturday cut-off on or after the harvest
# date: scripts/20_official_data.py:302, `d + ((5 - d.dt.day_of_week) % 7)` with Monday = 0,
# i.e. (6 - isodow) mod 7 days with isodow Monday = 1 .. Sunday = 7.
DETECTED_SQL = """
SELECT harvest_date + ((13 - extract(isodow FROM harvest_date)::int) % 7) AS cutoff,
       sum(area_ha::float8) AS det_ha
FROM segments WHERE site_id = :site AND harvest_date IS NOT NULL
GROUP BY 1
"""


def cumulative_curves(official: list[dict], detected: dict, final: dict) -> dict:
    """Cumulative share of the season, official vs detected, replicating the library's
    exercise 10 (scripts/20_official_data.py in the research library):
      * season weeks: official rows with cutoff >= season start and week_start <= season end
        (:421, :434-436);
      * detected ha per week: dated cane area binned by Saturday cut-off (:296-303),
        0 for weeks without detections (:437), cumulated over the season weeks (:440);
      * official share = cum_ha / final area_ha (:441); detected share = cumulative detected
        ha / total dated ha of the map (:442, total from :308);
      * crossing = first cut-off whose share is >= the level (:453-455).
    Percentages are the shares x 100."""
    start = dt.date.fromisoformat(final["season_start"])
    end = dt.date.fromisoformat(final["season_end"])
    season = [r for r in official if r["cutoff"] >= start and r["week_start"] <= end]
    dated_ha = sum(detected.values())
    weeks, det_cum = [], 0.0
    for r in season:
        det_ha = detected.get(r["cutoff"], 0.0)
        det_cum += det_ha
        weeks.append({
            "cutoff": r["cutoff"], "report": r["report"],
            "official_week_ha": r["week_ha"], "official_cum_ha": r["cum_ha"],
            "detected_week_ha": round(det_ha, 2), "detected_cum_ha": round(det_cum, 2),
            "official_pct": 100 * r["cum_ha"] / final["area_ha"],
            "detected_pct": 100 * det_cum / dated_ha,
        })

    def first_cross(key: str, level: float):
        return next((w["cutoff"] for w in weeks if w[key] >= 100 * level), None)

    return {
        "source": "recomputed from the loaded tables with the definition of the research "
                  "library's scripts/20_official_data.py (exercise 10)",
        "official_total_ha": final["area_ha"],
        "detected_total_ha": round(dated_ha, 2),
        "weeks": weeks,
        "crossings": {f"{int(100 * q)}": {"official": first_cross("official_pct", q),
                                          "detected": first_cross("detected_pct", q)}
                      for q in SHARE_LEVELS},
    }


@app.get("/weekly/{site}")
async def weekly(site: str) -> dict:
    async with engine.connect() as conn:
        info = await require_site(conn, site)
        weeks = await fetch(conn, WEEKLY_SQL, site=site)
        official = [real(r) for r in await fetch(conn, OFFICIAL_SQL, site=site)]
        detected = {r["cutoff"]: r["det_ha"] for r in await fetch(conn, DETECTED_SQL, site=site)}
    final = as_json(info["official_final"])
    curves = cumulative_curves(official, detected, final) if official and final else None
    return clean({
        "site_id": site,
        "weeks": weeks,
        "official": official or None,
        "cumulative": curves,
    })
