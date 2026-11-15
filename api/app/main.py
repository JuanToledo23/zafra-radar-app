"""Zafra Radar API: /health, /version and the read endpoints over the tables filled by
app.loader (/sites, /tiles, /segments, /weekly, /reference, /alerts, /ops). Endpoint
reference: docs/API.md."""

import datetime as dt
import json
import math
import re

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app import ops
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
# transformed to web mercator for the segments that pass it. Below SIMPLIFY_BELOW_ZOOM it is
# also simplified there by :tol metres; a polygon that collapses gives NULL or empty, which
# ST_AsMVTGeom turns into NULL, so it is dropped.
TILE_SQL_TEMPLATE = """
WITH mvt AS (
    SELECT ST_AsMVTGeom({geom}, ST_TileEnvelope(:z, :x, :y), 4096, 64, true)
               AS geom,
           segment_id, status, confidence, area_ha, p_cane, p_cane_radar,
           date_uncertainty_days,
           to_char(harvest_date, 'YYYY-MM-DD') AS harvest_date,
           (harvest_date - DATE '1970-01-01') AS harvest_day,
           first_fire_day, last_fire_day,
           NULLIF(array_to_string(alert_codes, ','), '') AS alert_codes
    FROM segments
    WHERE site_id = :site AND geom && ST_Transform(ST_TileEnvelope(:z, :x, :y), 4326)
)
SELECT ST_AsMVT(mvt, 'segments', 4096, 'geom') FROM mvt WHERE geom IS NOT NULL
"""
TILE_SQL = TILE_SQL_TEMPLATE.format(geom="ST_Transform(geom, 3857)")
TILE_SQL_SIMPLIFIED = TILE_SQL_TEMPLATE.format(geom="ST_Simplify(ST_Transform(geom, 3857), :tol)")
SIMPLIFY_BELOW_ZOOM = 12
WORLD_M = 2 * math.pi * 6378137  # web mercator world width, metres


def simplify_tolerance(z: int) -> float:
    """Half a screen pixel in web mercator metres at tile zoom z (38 m at z10). MapLibre
    draws a vector tile over 512 pixels, so one pixel is WORLD_M / (512 * 2**z)."""
    return WORLD_M / (512 * 2 ** z) / 2


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
        params = {"site": site, "z": zi, "x": xi, "y": yi}
        if zi < SIMPLIFY_BELOW_ZOOM:
            sql = TILE_SQL_SIMPLIFIED
            params["tol"] = simplify_tolerance(zi)
        else:
            sql = TILE_SQL
        data = (await conn.execute(text(sql), params)).scalar()
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


REFERENCE_SQL = """
SELECT field_id, area_ha, hyp, label, harvest_window_start, harvest_window_end, orig_field,
       properties, facts, ST_AsGeoJSON(geom, 7) AS geometry,
       ST_XMin(geom) AS west, ST_YMin(geom) AS south, ST_XMax(geom) AS east,
       ST_YMax(geom) AS north
FROM reference_fields WHERE site_id = :site
"""
REFERENCE_DATES_SQL = """
SELECT field_id, property, kind, date_start, date_end, season, event, source, note
FROM reference_dates WHERE site_id = :site ORDER BY field_id, date_start, property
"""
REFERENCE_SUMMARY_SQL = """
SELECT field_id, lang, source, text FROM reference_summaries WHERE site_id = :site
"""
# Share of the reference field's area covered by each map segment, on the geography (m²).
# Segments that only touch the field (zero-area intersection) are left out.
REFERENCE_OVERLAP_SQL = """
SELECT r.field_id, s.segment_id, s.harvest_date, s.date_uncertainty_days,
       ST_Area(ST_Intersection(r.geom, s.geom)::geography)
           / ST_Area(r.geom::geography) AS overlap_share
FROM reference_fields r
JOIN segments s ON s.site_id = r.site_id AND s.geom && r.geom AND ST_Intersects(r.geom, s.geom)
WHERE r.site_id = :site
"""


def natural_key(field_id: str):
    """p2a < p2b < p10: digit runs compared as numbers."""
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", field_id)]


@app.get("/reference/{site}")
async def reference(site: str) -> dict:
    """GeoJSON FeatureCollection of the site's reference fields (empty without them)."""
    async with engine.connect() as conn:
        await require_site(conn, site)
        fields = await fetch(conn, REFERENCE_SQL, site=site)
        dates = await fetch(conn, REFERENCE_DATES_SQL, site=site)
        summaries = await fetch(conn, REFERENCE_SUMMARY_SQL, site=site)
        overlaps = await fetch(conn, REFERENCE_OVERLAP_SQL, site=site)

    def by_field(rows: list[dict]) -> dict[str, list[dict]]:
        out: dict[str, list[dict]] = {}
        for r in rows:
            out.setdefault(r["field_id"], []).append({k: v for k, v in r.items() if k != "field_id"})
        return out

    dates_by, summaries_by = by_field(dates), by_field(summaries)
    segments_by = {
        fid: sorted(({**real({k: v for k, v in s.items() if k != "overlap_share"}),
                      "overlap_share": round(s["overlap_share"], 4)}
                     for s in rows if s["overlap_share"] > 0),
                    key=lambda s: (-s["overlap_share"], s["segment_id"]))
        for fid, rows in by_field(overlaps).items()
    }
    features = []
    for f in sorted(fields, key=lambda r: natural_key(r["field_id"])):
        fid = f["field_id"]
        props = real({k: f[k] for k in ("field_id", "area_ha", "hyp", "label",
                                         "harvest_window_start", "harvest_window_end",
                                         "orig_field")})
        features.append({
            "type": "Feature",
            "id": fid,
            "geometry": json.loads(f["geometry"]),
            "properties": {
                **props,
                **(as_json(f["properties"]) or {}),
                "bbox": [f["west"], f["south"], f["east"], f["north"]],
                "reference_dates": dates_by.get(fid, []),
                "facts": as_json(f["facts"]),
                "summary": pick_summary(summaries_by.get(fid, [])),
                "segments": segments_by.get(fid, []),
            },
        })
    return clean({"type": "FeatureCollection", "site_id": site, "features": features})


ALERT_RULES_SQL = "SELECT alert_rules FROM sites WHERE site_id = :site"
# Sites without a derived alerts file: the codes present in `alerts`, no definitions.
ALERT_CODES_SQL = """
SELECT code, min(severity) AS severity, count(*) AS count FROM alerts
WHERE site_id = :site GROUP BY code ORDER BY code
"""
# Warnings first, then by harvest date (undated last), then segment id. :code NULL = all.
ALERT_FILTER = "a.site_id = :site AND (CAST(:code AS text) IS NULL OR a.code = :code)"
ALERT_TOTAL_SQL = f"SELECT count(*) AS n FROM alerts a WHERE {ALERT_FILTER}"
ALERT_PAGE_SQL = f"""
SELECT a.segment_id, a.code, a.severity, a.evidence, s.harvest_date, s.area_ha,
       ST_X(ST_Centroid(s.geom)) AS cx, ST_Y(ST_Centroid(s.geom)) AS cy
FROM alerts a JOIN segments s ON s.site_id = a.site_id AND s.segment_id = a.segment_id
WHERE {ALERT_FILTER}
ORDER BY CASE a.severity WHEN 'warning' THEN 0 WHEN 'info' THEN 1 ELSE 2 END,
         s.harvest_date NULLS LAST, a.segment_id, a.code
LIMIT :limit OFFSET :offset
"""
ALERT_PAGE_MAX = 500


@app.get("/alerts/{site}")
async def alerts(site: str, code: str | None = None,
                 limit: int = Query(50, ge=1, le=ALERT_PAGE_MAX),
                 offset: int = Query(0, ge=0)) -> dict:
    """Per-code counts (with severity and the library's definition where the derived file
    was loaded) and one page of alerts, warnings first, then by harvest date."""
    code = code or None
    async with engine.connect() as conn:
        await require_site(conn, site)
        rules = as_json((await fetch(conn, ALERT_RULES_SQL, site=site))[0]["alert_rules"])
        if rules:
            codes = rules["codes"]
        else:
            codes = [{"code": r["code"], "severity": r["severity"], "enabled": True,
                      "params": None, "count": r["count"], "definition": None,
                      "definition_source": None}
                     for r in await fetch(conn, ALERT_CODES_SQL, site=site)]
        if code is not None and code not in {c["code"] for c in codes}:
            raise HTTPException(400, f"unknown alert code for {site}: {code}")
        p = {"site": site, "code": code}
        total = (await fetch(conn, ALERT_TOTAL_SQL, **p))[0]["n"]
        rows = await fetch(conn, ALERT_PAGE_SQL, limit=limit, offset=offset, **p)
    return clean({
        "site_id": site,
        "source": "derived" if rules else "summaries",
        "library": rules.get("library") if rules else None,
        "layer": rules.get("layer") if rules else None,
        "cane_segments": rules.get("cane_segments") if rules else None,
        "codes": codes,
        "code": code,
        "total": total,
        "limit": limit,
        "offset": offset,
        "alerts": [{**real({k: r[k] for k in ("segment_id", "code", "severity", "harvest_date",
                                              "area_ha")}),
                    "evidence": as_json(r["evidence"]),
                    "centroid": [r["cx"], r["cy"]]} for r in rows],
    })


# --- Mill operations: season replay as of a date (app logic, docs/API.md) -------------------

OPS_SITE_SQL = """
SELECT s.site_id, s.season, s.season_start, s.season_end, s.burn_window, s.official_final,
       (SELECT max(harvest_date) FROM segments g WHERE g.site_id = s.site_id) AS last_harvest
FROM sites s WHERE s.site_id = :site
"""
# Not harvested as of :d (not yet harvested or no date) with a season fire on or before :d.
OPS_BURNED_WHERE = """
site_id = :site AND first_fire_date <= CAST(:d AS date)
AND (harvest_date IS NULL OR harvest_date > CAST(:d AS date))
"""
OPS_DAYS = "(CAST(:d AS date) - first_fire_date)"
OPS_BUCKETS_SQL = f"""
SELECT {ops.bucket_sql(OPS_DAYS)} AS bucket, count(*) AS segments,
       sum(area_ha::float8) AS area_ha,
       count(*) FILTER (WHERE harvest_date IS NULL) AS no_date_segments,
       sum(area_ha::float8) FILTER (WHERE harvest_date IS NULL) AS no_date_area_ha
FROM segments WHERE {OPS_BURNED_WHERE}
GROUP BY 1
"""
# Season fires (the segments' 200 m buffer, the season window) dated :r0 .. :d locally at a
# local time outside the burn window [:lo, :hi] (minutes; both ends permitted, as
# zafra.alerts.fire_active_outside_hours).
OPS_OUTSIDE_HOURS_SQL = """
SELECT count(DISTINCT f.fire_id) AS detections, count(DISTINCT g.segment_id) AS segments
FROM fires f
JOIN sites t ON t.site_id = f.site_id
JOIN segments g ON g.site_id = f.site_id
WHERE f.site_id = :site
  AND f.datetime_local::date BETWEEN CAST(:r0 AS date) AND CAST(:d AS date)
  AND f.datetime_utc >= t.season_start::timestamp AT TIME ZONE 'UTC'
  AND f.datetime_utc < t.season_end::timestamp AT TIME ZONE 'UTC'
  AND (extract(hour FROM f.datetime_local) * 60 + extract(minute FROM f.datetime_local)
       NOT BETWEEN :lo AND :hi)
  AND f.geom && ST_Expand(g.geom, :deg)
  AND ST_DWithin(f.geom::geography, g.geom::geography, :buffer)
"""
OPS_BURNED_COLUMNS = f"""
segment_id, area_ha, first_fire_date, harvest_date, date_uncertainty_days,
(SELECT max(x) FROM unnest(season_fire_dates) x WHERE x <= CAST(:d AS date)) AS last_fire_date,
{OPS_DAYS} AS days_since_burn, {ops.bucket_sql(OPS_DAYS)} AS bucket,
ST_X(ST_Centroid(geom)) AS cx, ST_Y(ST_Centroid(geom)) AS cy
"""
OPS_BURNED_FILTER = f"{OPS_BURNED_WHERE} AND (CAST(:bucket AS text) IS NULL OR {ops.bucket_sql(OPS_DAYS)} = :bucket)"
OPS_BURNED_TOTAL_SQL = f"SELECT count(*) AS n FROM segments WHERE {OPS_BURNED_FILTER}"
OPS_BURNED_SQL = f"""
SELECT {OPS_BURNED_COLUMNS} FROM segments WHERE {OPS_BURNED_FILTER}
ORDER BY days_since_burn DESC, area_ha DESC, segment_id
LIMIT :limit OFFSET :offset
"""
OPS_LEDGER_SQL = """
SELECT segment_id, area_ha, harvest_date, date_uncertainty_days, p_cane, p_cane_radar,
       p_cane_optical, CASE WHEN first_fire_date <= CAST(:d AS date) THEN first_fire_date END
           AS first_fire_date,
       (SELECT max(x) FROM unnest(season_fire_dates) x WHERE x <= CAST(:d AS date))
           AS last_fire_date,
       alert_codes, ST_X(ST_Centroid(geom)) AS cx, ST_Y(ST_Centroid(geom)) AS cy
FROM segments WHERE site_id = :site ORDER BY segment_id
"""
OPS_FIRE_TO_HARVEST_SQL = """
SELECT harvest_date - first_fire_date AS days FROM segments
WHERE site_id = :site AND harvest_date IS NOT NULL AND first_fire_date IS NOT NULL
"""
OPS_PAGE_MAX = 500
LEDGER_STATUS = {"harvested": "harvested", "not_yet_harvested": "not_yet_harvested",
                 "no_date": "no_date_detected"}


async def ops_context(conn, site: str, as_of: dt.date | None) -> tuple[dict, dt.date]:
    """The site's ops row and the date used: `as_of`, or the site's last harvest date."""
    await require_site(conn, site)
    info = (await fetch(conn, OPS_SITE_SQL, site=site))[0]
    day = as_of or info["last_harvest"] or info["season_start"]
    return info, day


def check_bucket(bucket: str | None) -> str | None:
    if bucket and bucket not in ops.BUCKET_KEYS:
        raise HTTPException(400, f"unknown bucket: {bucket} (one of {', '.join(ops.BUCKET_KEYS)})")
    return bucket or None


def season_info(info: dict, site: str) -> dict:
    return {"name": info["season"], "start": info["season_start"],
            "end_exclusive": info["season_end"],
            "source": f"configs/{site}.yaml zafra.start / zafra.end (research library)"}


def tonnage_estimate(final: dict | None, harvested_ha: float):
    """Harvested area x the mill's official mean field yield, or None without one."""
    yield_t_ha = (final or {}).get("field_yield_t_ha")
    if not isinstance(yield_t_ha, (int, float)) or not yield_t_ha > 0:
        return None
    return {"label": "estimate", "tonnes": round(harvested_ha * yield_t_ha),
            "field_yield_t_ha": yield_t_ha, "harvested_area_ha": round(harvested_ha, 2),
            "source": f"{final.get('mill')} mill, official mean field yield of the season "
                      f"({final.get('source')}, results/10/ez_final.json)"}


@app.get("/ops/{site}")
async def ops_brief(site: str, as_of: dt.date | None = None) -> dict:
    """Season replay as of a date: harvested, standing and undated cane, pace and projected
    end, burned-and-not-harvested buckets, fires outside permitted hours (docs/API.md)."""
    async with engine.connect() as conn:
        info, d = await ops_context(conn, site, as_of)
        r0, _ = ops.recent_window(d)
        weeks = ops.pace_weeks(d)
        week_cols = ", ".join(
            f"coalesce(sum(area_ha::float8) FILTER (WHERE harvest_date BETWEEN"
            f" CAST(:w{i}a AS date) AND CAST(:w{i}b AS date)), 0) AS w{i}" for i in range(len(weeks)))
        params = {f"w{i}{e}": v for i, w in enumerate(weeks) for e, v in zip("ab", w)}
        totals = (await fetch(conn, f"""
            SELECT count(*) AS n, coalesce(sum(area_ha::float8), 0) AS ha,
              count(*) FILTER (WHERE harvest_date <= CAST(:d AS date)) AS h_n,
              coalesce(sum(area_ha::float8) FILTER (WHERE harvest_date <= CAST(:d AS date)), 0) AS h_ha,
              count(*) FILTER (WHERE harvest_date > CAST(:d AS date)) AS s_n,
              coalesce(sum(area_ha::float8) FILTER (WHERE harvest_date > CAST(:d AS date)), 0) AS s_ha,
              count(*) FILTER (WHERE harvest_date IS NULL) AS u_n,
              coalesce(sum(area_ha::float8) FILTER (WHERE harvest_date IS NULL), 0) AS u_ha,
              count(*) FILTER (WHERE harvest_date BETWEEN CAST(:r0 AS date) AND CAST(:d AS date)) AS r_n,
              coalesce(sum(area_ha::float8) FILTER (WHERE harvest_date BETWEEN CAST(:r0 AS date)
                       AND CAST(:d AS date)), 0) AS r_ha,
              {week_cols}
            FROM segments WHERE site_id = :site""", site=site, d=d, r0=r0, **params))[0]
        buckets = {b["bucket"]: b for b in await fetch(conn, OPS_BUCKETS_SQL, site=site, d=d)}
        outside = None
        bw = as_json(info["burn_window"])
        if bw:
            lo, hi = (ops.minutes(t) for t in bw["default"])
            row = (await fetch(conn, OPS_OUTSIDE_HOURS_SQL, site=site, d=d, r0=r0, lo=lo, hi=hi,
                               deg=FIRE_PREFILTER_DEG, buffer=FIRE_BUFFER_M))[0]
            outside = {"from": r0, "to": d, "burn_window": bw["default"],
                       "window_confirmed": bw["default_confirmed"],
                       "detections": row["detections"], "segments": row["segments"]}

    cane_ha = totals["ha"]
    week_ha = [totals[f"w{i}"] for i in range(len(weeks))]
    pace = sum(week_ha) / len(weeks)
    burned = [{"bucket": key, "min_days": lo, "max_days": hi,
               "segments": buckets.get(key, {}).get("segments", 0),
               "area_ha": round(buckets.get(key, {}).get("area_ha") or 0.0, 2)}
              for key, lo, hi in ops.BUCKETS]
    out = {
        "site_id": site,
        "replay": True,
        "as_of": d,
        "as_of_default": as_of is None,
        "season": season_info(info, site),
        "fire_buffer_m": FIRE_BUFFER_M,
        "cane": {"segments": totals["n"], "area_ha": round(cane_ha, 2)},
        "harvested": {"segments": totals["h_n"], "area_ha": round(totals["h_ha"], 2),
                      "share_of_cane_area": totals["h_ha"] / cane_ha if cane_ha else None},
        "harvested_last_7_days": {"from": r0, "to": d, "segments": totals["r_n"],
                                  "area_ha": round(totals["r_ha"], 2)},
        "not_yet_harvested": {"segments": totals["s_n"], "area_ha": round(totals["s_ha"], 2)},
        "no_date_detected": {"segments": totals["u_n"], "area_ha": round(totals["u_ha"], 2)},
        "pace": {"ha_per_week": round(pace, 2),
                 "weeks": [{"start": a, "end": b, "area_ha": round(h, 2)}
                           for (a, b), h in zip(weeks, week_ha)]},
        "projected_end": ops.projected_end(d, totals["s_ha"], pace),
        "burned_not_harvested": {
            "segments": sum(b["segments"] for b in burned),
            "area_ha": round(sum(b["area_ha"] for b in burned), 2),
            "no_date_segments": sum(b.get("no_date_segments") or 0 for b in buckets.values()),
            "buckets": burned,
        },
        "fires_outside_hours_last_7_days": outside,
    }
    estimate = tonnage_estimate(as_json(info["official_final"]), totals["h_ha"])
    if estimate:
        out["cane_tonnage_estimate"] = estimate
    return clean(out)


@app.get("/ops/{site}/burned")
async def ops_burned(site: str, as_of: dt.date | None = None, bucket: str | None = None,
                     limit: int = Query(50, ge=1, le=OPS_PAGE_MAX),
                     offset: int = Query(0, ge=0)) -> dict:
    """Burned and not harvested as of the date, longest since burn first, then largest."""
    bucket = check_bucket(bucket)
    async with engine.connect() as conn:
        _, d = await ops_context(conn, site, as_of)
        p = {"site": site, "d": d, "bucket": bucket}
        total = (await fetch(conn, OPS_BURNED_TOTAL_SQL, **p))[0]["n"]
        rows = await fetch(conn, OPS_BURNED_SQL, limit=limit, offset=offset, **p)
    return clean({
        "site_id": site, "as_of": d, "bucket": bucket, "total": total, "limit": limit,
        "offset": offset,
        "rows": [{**real({k: r[k] for k in ("segment_id", "area_ha", "first_fire_date",
                                             "last_fire_date", "days_since_burn", "bucket",
                                             "harvest_date", "date_uncertainty_days")}),
                  "centroid": [r["cx"], r["cy"]]} for r in rows],
    })


def csv_response(body: bytes, name: str) -> Response:
    return Response(content=body, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@app.get("/ops/{site}/burned.csv")
async def ops_burned_csv(site: str, as_of: dt.date | None = None,
                         bucket: str | None = None) -> Response:
    """The whole burned-and-not-harvested list (same filters and order), as CSV."""
    bucket = check_bucket(bucket)
    async with engine.connect() as conn:
        _, d = await ops_context(conn, site, as_of)
        rows = await fetch(conn, OPS_BURNED_SQL, site=site, d=d, bucket=bucket,
                           limit=None, offset=0)
    header = ["segment_id", "area_ha", "first_fire_date", "last_fire_date", "days_since_burn",
              "bucket", "harvest_date_later", "date_uncertainty_days", "lon", "lat"]
    body = ops.csv_bytes(header, [
        [r["segment_id"], f"{r['area_ha']:.2f}", r["first_fire_date"], r["last_fire_date"],
         r["days_since_burn"], r["bucket"], r["harvest_date"],
         None if r["date_uncertainty_days"] is None else f"{r['date_uncertainty_days']:g}",
         f"{r['cx']:.6f}", f"{r['cy']:.6f}"] for r in rows])
    return csv_response(body, f"{site}_burned_not_harvested_{d}{'_' + bucket if bucket else ''}.csv")


@app.get("/ops/{site}/ledger.csv")
async def ops_ledger_csv(site: str, as_of: dt.date | None = None) -> Response:
    """One row per segment with its state as of the date, as CSV."""
    async with engine.connect() as conn:
        _, d = await ops_context(conn, site, as_of)
        rows = await fetch(conn, OPS_LEDGER_SQL, site=site, d=d)
    header = ["segment_id", "area_ha", "status_as_of", "harvest_date", "date_uncertainty_days",
              "p_cane", "p_cane_radar", "p_cane_optical", "first_season_fire",
              "last_season_fire", "days_since_burn", "bucket", "alert_codes", "lon", "lat"]
    out = []
    for r in rows:
        state = ops.state_of(r["harvest_date"], d)
        burned = r["first_fire_date"] is not None and state != "harvested"
        days = (d - r["first_fire_date"]).days if burned else None
        fmt = lambda v, spec: None if v is None else format(v, spec)  # noqa: E731
        out.append([r["segment_id"], fmt(r["area_ha"], ".2f"), LEDGER_STATUS[state],
                    r["harvest_date"], fmt(r["date_uncertainty_days"], "g"),
                    fmt(r["p_cane"], ".3f"), fmt(r["p_cane_radar"], ".3f"),
                    fmt(r["p_cane_optical"], ".3f"), r["first_fire_date"], r["last_fire_date"],
                    days, ops.bucket_of(days) if burned else None, list(r["alert_codes"]),
                    f"{r['cx']:.6f}", f"{r['cy']:.6f}"])
    return csv_response(ops.csv_bytes(header, out), f"{site}_field_ledger_{d}.csv")


@app.get("/ops/{site}/fire-to-harvest")
async def ops_fire_to_harvest(site: str) -> dict:
    """Season statistic: days from the first season fire to the harvest date, over the
    segments with both (not shown in the web app)."""
    async with engine.connect() as conn:
        info, _ = await ops_context(conn, site, None)
        days = [r["days"] for r in await fetch(conn, OPS_FIRE_TO_HARVEST_SQL, site=site)]
    return clean({"site_id": site, "season": season_info(info, site),
                  "fire_buffer_m": FIRE_BUFFER_M,
                  "definition": "harvest_date - first season fire date, in days, over segments "
                                "with both; negative = first fire after the harvest date",
                  **ops.fire_to_harvest_stats(days)})
