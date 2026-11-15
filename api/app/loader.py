"""Load the research library's precomputed outputs into PostGIS.

    python -m app.loader --site morelos|brazil|all [--recreate-schema]
    python -m app.loader --site all --list-inputs   # input files only (deploy.sh)

ZAFRA_DATA is the root of a zafra-radar-research checkout (DATA.md lists every input and
the table it feeds). ZAFRA_DERIVED, optional, is the app's derived-data directory
(data/derived/, written by tools/build_alerts.py): where it holds alerts_<site>.json, that
file replaces the summaries.jsonl alerts of the site. Each site is reloaded inside one transaction: its row in `sites` is
deleted (cascading to all its data) and everything is inserted again, so running the
loader twice gives the same row counts. A missing required file stops the load with its
path; a missing optional input (summaries, official data, reference fields, derived alerts) is
skipped with one log line.

The parsing functions below are pure (no database, no files) and unit-tested in
api/tests/; the async functions after them do the reading and writing.
"""

import argparse
import asyncio
import csv
import datetime as dt
import json
import math
import os
import re
import sys
import time
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

SITES = ("morelos", "brazil")
LANGS = ("es", "en")
SCHEMA = Path(__file__).with_name("schema.sql")
# Dropped by --recreate-schema (children first; CASCADE covers anything left over).
APP_TABLES = ("reference_summaries", "reference_dates", "reference_fields", "alerts",
              "summaries", "official_weekly", "weekly", "fires", "segment_coherence",
              "segment_series", "segments", "sites")
COUNT_TABLES = ("sites", "segments", "segment_series", "segment_coherence", "fires", "weekly",
                "official_weekly", "summaries", "alerts", "reference_fields", "reference_dates",
                "reference_summaries")

# Slim GeoJSON properties -> segments columns (same names). An unknown property stops the
# load, so a new column in the library cannot be dropped silently.
SEGMENT_COLUMNS = ("segment_id", "area_ha", "p_cane", "p_cane_radar", "p_cane_optical",
                   "harvest_date", "date_uncertainty_days", "status", "confidence",
                   "hv_drop_db", "coh_min", "wc_disagrees")
WEEKLY_COLUMNS = {"week": "week_start", "harvests": "harvests", "fires_all": "fires_all",
                  "fires_cane": "fires_cane"}
OFFICIAL_INT = ("report", "cycle_week")
OFFICIAL_DATE = ("cutoff", "week_start")
OFFICIAL_REAL = ("cum_ha", "cum_cane_t", "reported_week_ha", "reported_week_cane_t", "week_ha",
                 "week_cane_t", "diff_vs_reported_ha", "diff_vs_reported_cane_t")
OFFICIAL_COLUMNS = OFFICIAL_DATE + OFFICIAL_INT + OFFICIAL_REAL
# Derived per-segment alerts: <ZAFRA_DERIVED>/alerts_<site>.json (tools/build_alerts.py).
DERIVED_ALERTS = "alerts_{site}.json"
SEVERITIES = ("warning", "info")  # zafra.alerts.SEVERITIES; the API orders by this
# CONADESUCA mill data exists for Morelos only (library exercise 10).
OFFICIAL = {"morelos": ("results/10/ez_weekly.csv", "results/10/ez_final.json")}

# Reference-field GeoJSON properties. Allow-listed rather than passed through: a property
# outside this list stops the load, so a new one (e.g. a grower's or owner's name) is reviewed
# before the API can serve it. None of the current properties holds a personal name.
REFERENCE_COLUMNS = ("field_id", "area_ha", "hyp", "label", "harvest_window_start",
                     "harvest_window_end", "orig_field")
REFERENCE_EXTRA = ("region", "municipio")
# ground_truth_<part>[_<suffix>]: one ground-truth date per suffix (none, _2026, ...).
GROUND_TRUTH = re.compile(r"ground_truth_(date|zafra|event|source|note)(_[0-9A-Za-z]+)?")


class MissingInput(RuntimeError):
    pass


# --- pure functions -------------------------------------------------------------------


def parse_date(value):
    """'2026-01-07', '2026-01-07T00:00:00' or None/'' -> date | None."""
    if value in (None, ""):
        return None
    return dt.date.fromisoformat(str(value)[:10])


def opt_float(value):
    if value in (None, ""):
        return None
    x = float(value)
    return None if math.isnan(x) else x


def clean_json(value):
    """NaN/inf -> None, recursively, so the value is valid jsonb."""
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {str(k): clean_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [clean_json(v) for v in value]
    return value


def site_info(cfg: dict) -> dict:
    """sites row (without the jsonb columns) from configs/<site>.yaml."""
    lon0, lat0, lon1, lat1 = cfg["aoi"]["bbox"]
    return {
        "site_id": cfg["name"],
        "name": cfg["description"],
        "season": cfg["zafra"]["name"],
        "bbox": (lon0, lat0, lon1, lat1),
        "timezone": cfg["alerts"]["timezone"],
    }


def site_paths(cfg: dict) -> dict:
    """Input paths relative to ZAFRA_DATA, from the site config (as the library resolves them)."""
    site, p = cfg["name"], cfg["paths"]
    results6 = "results/6" if site == "morelos" else f"results/6_{site}"  # script 17's rule
    return {
        "slim": p["slim_geojson"],
        "series": p["timeseries"],
        "coherence": p["coherence"],
        "weekly": f"{p['results_dir']}/weekly.csv",
        "firms_dir": cfg["firms"]["dir"],
        "summaries": f"{results6}/summaries.jsonl",
        "alert_counts": f"{results6}/alert_counts.json",
        "reference_fields": cfg.get("reference_fields"),  # None where the site has none
    }


def site_inputs(cfg: dict) -> list:
    """Every input file of a site relative to ZAFRA_DATA, required and optional, except the
    FIRMS CSVs (a directory glob): the config, the site_paths files and the official data."""
    site, rel = cfg["name"], site_paths(cfg)
    files = [f"configs/{site}.yaml"]
    files += [v for k, v in rel.items() if k != "firms_dir" and v]
    return files + list(OFFICIAL.get(site, ()))


def segment_record(props: dict) -> tuple:
    """Slim GeoJSON feature properties -> values in SEGMENT_COLUMNS order."""
    unknown = set(props) - set(SEGMENT_COLUMNS)
    if unknown:
        raise ValueError(f"segment {props.get('segment_id')}: unmapped properties {sorted(unknown)}")
    row = dict(props)
    row["segment_id"] = str(row["segment_id"])
    row["harvest_date"] = parse_date(row.get("harvest_date"))
    for k in ("area_ha", "p_cane", "p_cane_radar", "p_cane_optical", "date_uncertainty_days",
              "hv_drop_db", "coh_min"):
        row[k] = opt_float(row.get(k))
    if row.get("wc_disagrees") is not None:
        row["wc_disagrees"] = bool(row["wc_disagrees"])
    return tuple(row.get(c) for c in SEGMENT_COLUMNS)


def weekly_record(row: dict) -> tuple:
    """weekly.csv row (header week, harvests, ..., fires_cane, ...) -> weekly values."""
    missing = set(WEEKLY_COLUMNS) - set(row)
    if missing:
        raise ValueError(f"weekly.csv: missing columns {sorted(missing)}")
    return (parse_date(row["week"]), int(row["harvests"]), int(row["fires_all"]),
            int(row["fires_cane"]))


def official_record(row: dict) -> tuple:
    """ez_weekly.csv row -> values in OFFICIAL_COLUMNS order (blank cells -> NULL)."""
    out = {k: parse_date(row[k]) for k in OFFICIAL_DATE}
    out.update({k: int(row[k]) if row[k] != "" else None for k in OFFICIAL_INT})
    out.update({k: opt_float(row[k]) for k in OFFICIAL_REAL})
    return tuple(out[k] for k in OFFICIAL_COLUMNS)


def firms_times(acq_date: str, acq_time: str, tz: str):
    """FIRMS acq_date + acq_time (UTC, HHMM, leading zeros may be dropped) ->
    (aware UTC datetime, naive local wall-clock datetime in tz)."""
    hhmm = str(acq_time).strip().zfill(4)
    utc = dt.datetime.combine(dt.date.fromisoformat(acq_date),
                              dt.time(int(hhmm[:2]), int(hhmm[2:])), tzinfo=dt.timezone.utc)
    return utc, utc.astimezone(ZoneInfo(tz)).replace(tzinfo=None)


def firms_record(row: dict, tz: str) -> tuple:
    """FIRMS VIIRS CSV row -> (lon, lat, datetime_utc, datetime_local, satellite, source,
    frp, confidence)."""
    utc, local = firms_times(row["acq_date"], row["acq_time"], tz)
    return (float(row["longitude"]), float(row["latitude"]), utc, local, row.get("satellite"),
            row.get("source"), opt_float(row.get("frp")), row.get("confidence"))


def record_segment_id(rec: dict):
    """Segment id of a summaries.jsonl record, or None for a reference-field record
    (those are keyed by field id and have no segment_id)."""
    sid = (rec.get("facts") or {}).get("segment_id")
    return str(sid) if sid not in (None, "") else None


def record_field_id(rec: dict):
    """Reference-field id of a summaries.jsonl record (facts.field_id, with no segment_id),
    or None for a segment record."""
    facts = rec.get("facts") or {}
    if record_segment_id(rec) is not None or facts.get("field_id") in (None, ""):
        return None
    return str(facts["field_id"])


def summary_texts(rec: dict) -> list:
    """(lang, source, text) per language: the template text, and the LLM text when the LLM
    rendered it (no fallback) and the verifier passed for that language."""
    rows = []
    tpl = rec.get("template") or {}
    llm = rec.get("llm") or {}
    use_llm = llm.get("renderer") == "llm" and not llm.get("rejected")
    for lang in LANGS:
        if tpl.get(lang) and ((tpl.get("verifier") or {}).get(lang) or {}).get("ok"):
            rows.append((lang, "template", tpl[lang]))
        if use_llm and llm.get(lang) and ((llm.get("verifier") or {}).get(lang) or {}).get("ok"):
            rows.append((lang, "llm", llm[lang]))
    return rows


def summary_rows(rec: dict) -> list:
    """(segment_id, lang, source, text) of a segment record (summary_texts); [] for a
    reference-field record."""
    sid = record_segment_id(rec)
    return [] if sid is None else [(sid, *t) for t in summary_texts(rec)]


def reference_summary_rows(rec: dict) -> list:
    """(field_id, lang, source, text) of a reference-field record; [] for a segment record."""
    fid = record_field_id(rec)
    return [] if fid is None else [(fid, *t) for t in summary_texts(rec)]


def reference_record(props: dict) -> tuple:
    """Reference GeoJSON properties -> (values in REFERENCE_COLUMNS order, other allowed
    properties as a dict). Raises on a property outside the allow-list (see
    REFERENCE_COLUMNS)."""
    props = {("field_id" if k == "id" else k): v for k, v in props.items()}
    unknown = sorted(k for k in props if k not in REFERENCE_COLUMNS
                     and k not in REFERENCE_EXTRA and not GROUND_TRUTH.fullmatch(k))
    if unknown:
        raise ValueError(f"reference field {props.get('field_id')}: properties not in the "
                         f"allow-list {unknown}; check them for personal names, then add them")
    row = dict(props)
    row["field_id"] = str(row["field_id"])
    row["area_ha"] = opt_float(row.get("area_ha"))
    for k in ("harvest_window_start", "harvest_window_end"):
        row[k] = parse_date(row.get(k))
    extra = {k: clean_json(v) for k, v in props.items() if k not in REFERENCE_COLUMNS}
    return tuple(row.get(c) for c in REFERENCE_COLUMNS), extra


def reference_dates(props: dict, season) -> list:
    """Reference dates of one field from its GeoJSON properties, as (property, kind,
    date_start, date_end, season, event, source, note):
      * the labelled NDVI harvest window (harvest_window_start/end), of the site's `season`;
      * one 'ground_truth' row per ground_truth_date[_suffix] with a date, with its
        ground_truth_zafra / event / source / note of the same suffix, verbatim."""
    rows = []
    start = parse_date(props.get("harvest_window_start"))
    end = parse_date(props.get("harvest_window_end"))
    if start or end:
        rows.append(("harvest_window", "labelled_window", start or end, end or start, season,
                     None, None, None))
    suffixes = sorted(m.group(2) or "" for k in props
                      if (m := GROUND_TRUTH.fullmatch(k)) and m.group(1) == "date")
    for sfx in suffixes:
        day = parse_date(props.get(f"ground_truth_date{sfx}"))
        if day is None:
            continue
        part = {p: props.get(f"ground_truth_{p}{sfx}") for p in ("zafra", "event", "source", "note")}
        rows.append((f"ground_truth_date{sfx}", "ground_truth", day, day, part["zafra"],
                     part["event"], part["source"], part["note"]))
    return rows


def alert_rows(rec: dict) -> list:
    """(segment_id, code, severity, evidence json text) for each alert of a segment record."""
    sid = record_segment_id(rec)
    if sid is None:
        return []
    return [(sid, a["code"], a["severity"], json.dumps(clean_json(a.get("evidence") or {})))
            for a in rec.get("alerts") or []]


def derived_alert_rows(doc: dict, site: str) -> list:
    """(segment_id, code, severity, evidence json text) of an alerts_<site>.json document
    (tools/build_alerts.py). Raises if the file is for another site, a row has a code the
    file does not describe or a severity outside SEVERITIES, or a per-code count in `codes`
    differs from the rows."""
    if doc.get("site") != site:
        raise ValueError(f"derived alerts: file is for site {doc.get('site')!r}, not {site!r}")
    codes = doc["codes"]
    rows, per_code = [], dict.fromkeys(codes, 0)
    for a in doc["alerts"]:
        if a["code"] not in codes:
            raise ValueError(f"derived alerts: {a['segment_id']}: unknown code {a['code']!r}")
        if a["severity"] not in SEVERITIES:
            raise ValueError(f"derived alerts: {a['segment_id']}: severity {a['severity']!r}")
        per_code[a["code"]] += 1
        rows.append((str(a["segment_id"]), a["code"], a["severity"],
                     json.dumps(clean_json(a.get("evidence") or {}))))
    wrong = {c: (v["count"], per_code[c]) for c, v in codes.items() if v["count"] != per_code[c]}
    if wrong:
        raise ValueError(f"derived alerts: count in file vs rows {wrong}")
    return rows


def alert_rules(doc: dict) -> dict:
    """sites.alert_rules from an alerts_<site>.json document: where it came from and, per
    code (in file order), severity, enabled, params, count, the library's definition text and
    its source."""
    keys = ("severity", "enabled", "params", "count", "definition", "definition_source")
    return clean_json({
        "library": doc.get("library"),
        "layer": doc.get("layer"),
        "generated_at": doc.get("generated_at"),
        "cane_segments": doc.get("cane_segments"),
        # a list, in the library's CODES order (jsonb does not keep object key order)
        "codes": [{"code": c, **{k: v.get(k) for k in keys}} for c, v in doc["codes"].items()],
    })


def format_counts(counts: dict, sites) -> str:
    """{(table, site): n} -> aligned text table, one row per table, one column per site."""
    w = max(len(t) for t in COUNT_TABLES)
    lines = [f"{'table':<{w}}  " + "  ".join(f"{s:>10}" for s in sites)]
    for t in COUNT_TABLES:
        lines.append(f"{t:<{w}}  " + "  ".join(f"{counts.get((t, s), 0):>10,}" for s in sites))
    return "\n".join(lines)


# --- reading and writing --------------------------------------------------------------


def log(msg: str) -> None:
    print(msg, flush=True)


def require(root: Path, rel: str) -> Path:
    path = root / rel
    if not path.is_file():
        raise MissingInput(f"required input missing: {path}")
    return path


def optional(root: Path, rel: str, site: str, what: str):
    path = root / rel
    if path.is_file():
        return path
    log(f"[{site}] skip {what}: {path} not found")
    return None


def dsn() -> str:
    user = os.environ.get("POSTGRES_USER", "zafra")
    password = os.environ.get("POSTGRES_PASSWORD", "zafra_local_only")  # local-only default
    host = os.environ.get("POSTGRES_HOST", "db")
    port = os.environ.get("POSTGRES_PORT", "5432")
    name = os.environ.get("POSTGRES_DB", "zafra")
    return f"postgresql://{user}:{password}@{host}:{port}/{name}"


async def copy_stage(conn, table: str, columns: dict, records: list) -> None:
    """Temporary staging table (dropped at commit) filled with COPY."""
    cols = ", ".join(f"{c} {t}" for c, t in columns.items())
    await conn.execute(f"CREATE TEMP TABLE {table} ({cols}) ON COMMIT DROP")
    await conn.copy_records_to_table(table, records=records, columns=list(columns))


async def load_segments(conn, site: str, path: Path) -> set:
    gj = json.loads(path.read_text())
    crs = (gj.get("crs") or {}).get("properties", {}).get("name")
    if crs not in (None, "urn:ogc:def:crs:OGC:1.3:CRS84", "EPSG:4326"):
        raise ValueError(f"{path}: unexpected CRS {crs}")
    records = [segment_record(f["properties"]) + (json.dumps(f["geometry"]),)
               for f in gj["features"]]
    types = {c: "text" for c in SEGMENT_COLUMNS}
    types.update({c: "real" for c in ("area_ha", "p_cane", "p_cane_radar", "p_cane_optical",
                                      "date_uncertainty_days", "hv_drop_db", "coh_min")})
    types.update(harvest_date="date", wc_disagrees="boolean", geojson="text")
    await copy_stage(conn, "stage_segments", types, records)
    cols = ", ".join(SEGMENT_COLUMNS)
    await conn.execute(
        f"INSERT INTO segments (site_id, {cols}, geom) SELECT $1, {cols}, "
        "ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(geojson), 4326)) FROM stage_segments", site)
    return {r[0] for r in records}


async def load_series(conn, site: str, series: Path, coherence: Path, ids: set) -> None:
    import pyarrow as pa
    import pyarrow.compute as pc
    import pyarrow.parquet as pq

    value_set = pa.array(sorted(ids))
    t = pq.read_table(series, columns=["field_id", "date", "orbit", "hv_db", "hh_db"])
    t = t.filter(pc.is_in(t["field_id"], value_set=value_set))
    rows = zip(*(t[c].to_pylist() for c in ("field_id", "date", "orbit", "hv_db", "hh_db")))
    await conn.copy_records_to_table(
        "segment_series",
        records=[(site, f, d.date(), o, hv, hh) for f, d, o, hv, hh in rows],
        columns=["site_id", "segment_id", "acquisition_date", "orbit", "hv_db", "hh_db"])

    c = pq.read_table(coherence, columns=["field_id", "ref_date", "sec_date", "coh_mean", "coh_min"])
    c = c.filter(pc.is_in(c["field_id"], value_set=value_set))
    rows = zip(*(c[k].to_pylist() for k in ("field_id", "ref_date", "sec_date", "coh_mean", "coh_min")))
    await conn.copy_records_to_table(
        "segment_coherence",
        records=[(site, f, r.date(), s.date(), m, n) for f, r, s, m, n in rows],
        columns=["site_id", "segment_id", "ref_date", "sec_date", "coh_mean", "coh_min"])


async def load_fires(conn, site: str, files: list, tz: str) -> None:
    records = []
    for path in files:
        with path.open(newline="") as fh:
            records += [firms_record(r, tz) for r in csv.DictReader(fh)]
    await copy_stage(conn, "stage_fires", {
        "lon": "double precision", "lat": "double precision", "datetime_utc": "timestamptz",
        "datetime_local": "timestamp", "satellite": "text", "source": "text", "frp": "real",
        "confidence": "text"}, records)
    await conn.execute(
        "INSERT INTO fires (site_id, geom, datetime_utc, datetime_local, satellite, source, frp,"
        " confidence) SELECT $1, ST_SetSRID(ST_MakePoint(lon, lat), 4326), datetime_utc,"
        " datetime_local, satellite, source, frp, confidence FROM stage_fires", site)
    # Segments do not overlap; the lowest id is taken if a point falls on a shared edge.
    await conn.execute(
        "UPDATE fires f SET segment_id = (SELECT s.segment_id FROM segments s"
        " WHERE s.site_id = f.site_id AND ST_Intersects(s.geom, f.geom)"
        " ORDER BY s.segment_id LIMIT 1) WHERE f.site_id = $1", site)


async def load_reference(conn, site: str, path: Path, season, recs: list) -> None:
    """Reference fields, their dates, and the facts and summaries of their summaries.jsonl
    records (`recs`, all records of the file)."""
    gj = json.loads(path.read_text())
    crs = (gj.get("crs") or {}).get("properties", {}).get("name")
    if crs not in (None, "urn:ogc:def:crs:OGC:1.3:CRS84", "EPSG:4326"):
        raise ValueError(f"{path}: unexpected CRS {crs}")
    by_field = {fid: r for r in recs if (fid := record_field_id(r)) is not None}
    fields, dates = [], []
    for f in gj["features"]:
        values, extra = reference_record(f["properties"])
        fid = values[0]
        facts = (by_field.get(fid) or {}).get("facts")
        fields.append((*values, json.dumps(extra), json.dumps(clean_json(facts)) if facts else None,
                       json.dumps(f["geometry"])))
        dates += [(site, fid, *d) for d in reference_dates(f["properties"], season)]
    types = {c: "text" for c in REFERENCE_COLUMNS}
    types.update(area_ha="real", harvest_window_start="date", harvest_window_end="date",
                 properties="text", facts="text", geojson="text")
    await copy_stage(conn, "stage_reference", types, fields)
    cols = ", ".join(REFERENCE_COLUMNS)
    await conn.execute(
        f"INSERT INTO reference_fields (site_id, {cols}, properties, facts, geom) SELECT $1,"
        f" {cols}, properties::jsonb, facts::jsonb,"
        " ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(geojson), 4326)) FROM stage_reference", site)
    await conn.copy_records_to_table(
        "reference_dates", records=dates,
        columns=["site_id", "field_id", "property", "kind", "date_start", "date_end", "season",
                 "event", "source", "note"])
    ids = {f[0] for f in fields}
    orphans = sorted(set(by_field) - ids)
    log(f"[{site}] reference fields: {len(fields)} fields, {len(dates)} reference dates,"
        f" {len(set(by_field) & ids)} with a summary record"
        + (f"; summary records without a polygon skipped: {orphans}" if orphans else ""))
    await conn.copy_records_to_table(
        "reference_summaries",
        records=[(site, *r) for fid, rec in by_field.items() if fid in ids
                 for r in reference_summary_rows(rec)],
        columns=["site_id", "field_id", "lang", "source", "text"])


async def load_alerts(conn, site: str, rows: list, ids: set) -> None:
    """Alert rows, then segments.alert_codes (sorted distinct codes) for the tiles."""
    unknown = sorted({r[0] for r in rows} - ids)
    if unknown:
        raise ValueError(f"[{site}] alerts for segments not in the map: {unknown[:5]}"
                         f" ({len(unknown)} in all)")
    await conn.copy_records_to_table(
        "alerts", records=[(site, *r) for r in rows],
        columns=["site_id", "segment_id", "code", "severity", "evidence"])
    await conn.execute(
        "UPDATE segments s SET alert_codes = a.codes FROM (SELECT segment_id,"
        " array_agg(DISTINCT code ORDER BY code) AS codes FROM alerts WHERE site_id = $1"
        " GROUP BY segment_id) a WHERE s.site_id = $1 AND s.segment_id = a.segment_id", site)
    per_code = await conn.fetch(
        "SELECT code, count(*) AS n FROM alerts WHERE site_id = $1 GROUP BY code ORDER BY code",
        site)
    log(f"[{site}] alerts per code: "
        + (", ".join(f"{r['code']} {r['n']}" for r in per_code) or "none"))


async def load_site(conn, root: Path, site: str, derived: Path | None = None) -> float:
    t0 = time.perf_counter()
    cfg_path = require(root, f"configs/{site}.yaml")
    cfg = yaml.safe_load(cfg_path.read_text())
    info, rel = site_info(cfg), site_paths(cfg)
    slim = require(root, rel["slim"])
    series = require(root, rel["series"])
    coherence = require(root, rel["coherence"])
    weekly = require(root, rel["weekly"])
    firms = sorted((root / rel["firms_dir"]).glob("*.csv"))
    if not firms:
        raise MissingInput(f"required input missing: {root / rel['firms_dir']}/*.csv")
    summaries = optional(root, rel["summaries"], site, "summaries and alerts")
    alert_counts = optional(root, rel["alert_counts"], site, "alert counts")
    if rel["reference_fields"]:
        reference = optional(root, rel["reference_fields"], site, "reference fields")
    else:
        reference = None
        log(f"[{site}] skip reference fields: no reference_fields in configs/{site}.yaml")
    derived_alerts = None
    if derived is None:
        log(f"[{site}] skip derived alerts: ZAFRA_DERIVED not set")
    else:
        derived_alerts = optional(derived, DERIVED_ALERTS.format(site=site), site,
                                  "derived alerts")
    off_weekly = off_final = None
    if site in OFFICIAL:
        off_weekly = require(root, OFFICIAL[site][0])
        off_final = require(root, OFFICIAL[site][1])
    else:
        log(f"[{site}] skip official data: no CONADESUCA comparison for this site")

    async with conn.transaction():
        await conn.execute("DELETE FROM sites WHERE site_id = $1", site)
        final = json.dumps(clean_json(json.loads(off_final.read_text()))) if off_final else None
        counts = (json.dumps(clean_json(json.loads(alert_counts.read_text())))
                  if alert_counts else None)
        doc = json.loads(derived_alerts.read_text()) if derived_alerts else None
        alerts = derived_alert_rows(doc, site) if doc else []
        rules = json.dumps(alert_rules(doc)) if doc else None
        await conn.execute(
            "INSERT INTO sites (site_id, name, season, bbox, timezone, official_final,"
            " alert_counts, alert_rules) VALUES ($1, $2, $3, ST_MakeEnvelope($4, $5, $6, $7,"
            " 4326), $8, $9::jsonb, $10::jsonb, $11::jsonb)",
            info["site_id"], info["name"], info["season"], *info["bbox"], info["timezone"],
            final, counts, rules)

        ids = await load_segments(conn, site, slim)
        await load_series(conn, site, series, coherence, ids)
        await load_fires(conn, site, firms, info["timezone"])

        with weekly.open(newline="") as fh:
            await conn.copy_records_to_table(
                "weekly", records=[(site, *weekly_record(r)) for r in csv.DictReader(fh)],
                columns=["site_id", *WEEKLY_COLUMNS.values()])
        if off_weekly:
            with off_weekly.open(newline="") as fh:
                await conn.copy_records_to_table(
                    "official_weekly",
                    records=[(site, *official_record(r)) for r in csv.DictReader(fh)],
                    columns=["site_id", *OFFICIAL_COLUMNS])
        recs = []
        if summaries:
            recs = [json.loads(line) for line in summaries.read_text().splitlines() if line.strip()]
            seg_recs = [r for r in recs if record_segment_id(r) is not None]
            ref_recs = sum(record_field_id(r) is not None for r in recs)
            log(f"[{site}] summaries.jsonl: {len(recs)} records, {len(seg_recs)} segments,"
                f" {ref_recs} reference fields")
            await conn.copy_records_to_table(
                "summaries", records=[(site, *r) for rec in seg_recs for r in summary_rows(rec)],
                columns=["site_id", "segment_id", "lang", "source", "text"])
            if not doc:
                alerts = [a for rec in seg_recs for a in alert_rows(rec)]
        if doc:
            log(f"[{site}] alerts from {derived_alerts.name} (library"
                f" {(doc.get('library') or {}).get('commit_short')})"
                + (", replacing the summaries.jsonl alerts" if summaries else ""))
        await load_alerts(conn, site, alerts, ids)
        if reference:
            await load_reference(conn, site, reference, info["season"], recs)
    seconds = time.perf_counter() - t0
    log(f"[{site}] loaded in {seconds:.1f} s")
    return seconds


async def apply_schema(conn, recreate: bool) -> None:
    if recreate:
        await conn.execute("DROP TABLE IF EXISTS " + ", ".join(APP_TABLES) + " CASCADE")
        log("dropped app tables")
    await conn.execute(SCHEMA.read_text())


async def table_counts(conn, sites) -> dict:
    counts = {}
    for t in COUNT_TABLES:
        for site, n in await conn.fetch(
                f"SELECT site_id, count(*) FROM {t} WHERE site_id = ANY($1) GROUP BY site_id",
                list(sites)):
            counts[(t, site)] = n
    return counts


def data_root() -> Path:
    root = Path(os.environ.get("ZAFRA_DATA", ""))
    if not os.environ.get("ZAFRA_DATA") or not root.is_dir():
        raise MissingInput(f"ZAFRA_DATA is not a directory: {os.environ.get('ZAFRA_DATA')!r}")
    return root


def list_inputs(root: Path, sites) -> list:
    """Input files of `sites` that exist under root, relative to it, in load order (site_inputs
    plus the FIRMS CSVs). deploy.sh copies exactly these to the server. A missing file is
    reported on stderr and left out; the loader decides whether it is required."""
    out = []
    for site in sites:
        cfg = yaml.safe_load(require(root, f"configs/{site}.yaml").read_text())
        firms = sorted((root / cfg["firms"]["dir"]).glob("*.csv"))
        for rel in site_inputs(cfg) + [str(p.relative_to(root)) for p in firms]:
            if (root / rel).is_file():
                out.append(rel)
            else:
                print(f"[{site}] not found, not listed: {rel}", file=sys.stderr)
    return list(dict.fromkeys(out))


async def run(sites, recreate: bool) -> None:
    import asyncpg

    root = data_root()
    derived = Path(os.environ["ZAFRA_DERIVED"]) if os.environ.get("ZAFRA_DERIVED") else None
    conn = await asyncpg.connect(dsn())
    try:
        await apply_schema(conn, recreate)
        for site in sites:
            await load_site(conn, root, site, derived)
        print(format_counts(await table_counts(conn, sites), sites))
    finally:
        await conn.close()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--site", required=True, choices=(*SITES, "all"))
    ap.add_argument("--recreate-schema", action="store_true",
                    help="drop and recreate the app tables before loading")
    ap.add_argument("--list-inputs", action="store_true",
                    help="print the input files (relative to ZAFRA_DATA) and exit; no database")
    args = ap.parse_args(argv)
    sites = SITES if args.site == "all" else (args.site,)
    try:
        if args.list_inputs:
            print("\n".join(list_inputs(data_root(), sites)))
            return 0
        asyncio.run(run(sites, args.recreate_schema))
    except MissingInput as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
