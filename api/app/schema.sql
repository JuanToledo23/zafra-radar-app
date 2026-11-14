-- Zafra Radar app schema. Idempotent (CREATE ... IF NOT EXISTS); applied by app.seed on API
-- start and by app.loader before loading. Every table carries site_id; deleting a site's row
-- removes all its data (ON DELETE CASCADE), which is how the loader reloads one site.
-- Sources per table: DATA.md.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS sites (
    site_id         text PRIMARY KEY,          -- 'morelos', 'brazil' (configs/<site>.yaml)
    name            text NOT NULL,
    season          text,                      -- e.g. '2025-26'
    bbox            geometry(Polygon, 4326),
    timezone        text NOT NULL,             -- IANA name; FIRMS times are UTC
    official_final  jsonb,                     -- results/10/ez_final.json (Morelos only)
    alert_counts    jsonb                      -- results/6/alert_counts.json, where it exists
);

CREATE TABLE IF NOT EXISTS segments (
    site_id               text NOT NULL REFERENCES sites (site_id) ON DELETE CASCADE,
    segment_id            text NOT NULL,       -- ids repeat across sites (cc00004 in both)
    geom                  geometry(MultiPolygon, 4326) NOT NULL,
    area_ha               real,
    p_cane                real,                -- the site's delivered gate (optical, B)
    p_cane_radar          real,
    p_cane_optical        real,
    harvest_date          date,                -- midpoint of the standing/harvested gap
    date_uncertainty_days real,                -- ± days (half the gap)
    status                text,                -- harvested | not_detected | no_baseline
    confidence            text,                -- high | medium | low | uncertain | none
    hv_drop_db            real,
    coh_min               real,
    wc_disagrees          boolean,
    PRIMARY KEY (site_id, segment_id)
);
CREATE INDEX IF NOT EXISTS segments_geom_gist ON segments USING gist (geom);
CREATE INDEX IF NOT EXISTS segments_site_date ON segments (site_id, harvest_date);

-- NISAR GCOV backscatter per acquisition, already in dB in the library files.
CREATE TABLE IF NOT EXISTS segment_series (
    site_id          text NOT NULL,
    segment_id       text NOT NULL,
    acquisition_date date NOT NULL,
    orbit            text NOT NULL,            -- 'asc' | 'desc', never averaged
    hv_db            real,
    hh_db            real,
    PRIMARY KEY (site_id, segment_id, acquisition_date, orbit),
    FOREIGN KEY (site_id, segment_id) REFERENCES segments (site_id, segment_id) ON DELETE CASCADE
);

-- NISAR GUNW coherence per 12-day pair (reference, secondary), ascending track only.
CREATE TABLE IF NOT EXISTS segment_coherence (
    site_id     text NOT NULL,
    segment_id  text NOT NULL,
    ref_date    date NOT NULL,
    sec_date    date NOT NULL,
    coh_mean    real,
    coh_min     real,
    PRIMARY KEY (site_id, segment_id, ref_date, sec_date),
    FOREIGN KEY (site_id, segment_id) REFERENCES segments (site_id, segment_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fires (
    fire_id        bigserial PRIMARY KEY,
    site_id        text NOT NULL REFERENCES sites (site_id) ON DELETE CASCADE,
    geom           geometry(Point, 4326) NOT NULL,
    datetime_utc   timestamptz NOT NULL,
    datetime_local timestamp NOT NULL,         -- wall-clock time in sites.timezone
    satellite      text,                       -- FIRMS code: N (Suomi-NPP), N20, N21
    source         text,                       -- e.g. VIIRS_SNPP_SP, VIIRS_NOAA20_NRT
    frp            real,
    confidence     text,                       -- FIRMS VIIRS: l | n | h
    segment_id     text,                       -- segment of the same site containing the point
    FOREIGN KEY (site_id, segment_id) REFERENCES segments (site_id, segment_id)
        ON DELETE SET NULL (segment_id)
);
CREATE INDEX IF NOT EXISTS fires_geom_gist ON fires USING gist (geom);
CREATE INDEX IF NOT EXISTS fires_site_segment ON fires (site_id, segment_id);

CREATE TABLE IF NOT EXISTS weekly (
    site_id     text NOT NULL REFERENCES sites (site_id) ON DELETE CASCADE,
    week_start  date NOT NULL,                 -- `week` in weekly.csv
    harvests    integer NOT NULL DEFAULT 0,
    fires_all   integer NOT NULL DEFAULT 0,
    fires_cane  integer NOT NULL DEFAULT 0,
    PRIMARY KEY (site_id, week_start)
);

-- CONADESUCA weekly reports for the site's mill (results/10/ez_weekly.csv, Morelos only).
CREATE TABLE IF NOT EXISTS official_weekly (
    site_id                 text NOT NULL REFERENCES sites (site_id) ON DELETE CASCADE,
    cutoff                  date NOT NULL,
    week_start              date NOT NULL,
    report                  integer NOT NULL,
    cycle_week              integer,
    cum_ha                  real,
    cum_cane_t              real,
    reported_week_ha        real,
    reported_week_cane_t    real,
    week_ha                 real,
    week_cane_t             real,
    diff_vs_reported_ha     real,
    diff_vs_reported_cane_t real,
    PRIMARY KEY (site_id, report)
);

-- Precomputed per-field summaries (results/6/summaries.jsonl): only the summarised segments.
CREATE TABLE IF NOT EXISTS summaries (
    site_id     text NOT NULL,
    segment_id  text NOT NULL,
    lang        text NOT NULL,                 -- 'es' | 'en'
    source      text NOT NULL,                 -- 'template' | 'llm' (verifier passed)
    text        text NOT NULL,
    PRIMARY KEY (site_id, segment_id, lang, source),
    FOREIGN KEY (site_id, segment_id) REFERENCES segments (site_id, segment_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alerts (
    alert_id    bigserial PRIMARY KEY,
    site_id     text NOT NULL,
    segment_id  text NOT NULL,
    code        text NOT NULL,                 -- e.g. FIRE_ACTIVE_OUTSIDE_HOURS
    severity    text NOT NULL,
    evidence    jsonb NOT NULL DEFAULT '{}'::jsonb,
    FOREIGN KEY (site_id, segment_id) REFERENCES segments (site_id, segment_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS alerts_site_segment ON alerts (site_id, segment_id);
