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
-- Alert codes of the derived per-segment table (data/derived/alerts_<site>.json, written by
-- tools/build_alerts.py): per code its severity, enabled flag, parameters, count and the
-- library's definition text, plus the library commit. NULL without a derived file.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS alert_rules jsonb;

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
-- Distinct codes of the segment's rows in `alerts`, sorted; set by app.loader for the tiles.
ALTER TABLE segments ADD COLUMN IF NOT EXISTS alert_codes text[] NOT NULL DEFAULT '{}';

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

-- From data/derived/alerts_<site>.json where it exists (every cane segment), otherwise from
-- the summarised segments of results/6/summaries.jsonl.
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
CREATE INDEX IF NOT EXISTS alerts_site_code ON alerts (site_id, code);

-- Reference fields: hand-traced polygons with labels and reference harvest dates
-- (configs/<site>.yaml reference_fields; Morelos only). Properties are allow-listed by
-- app.loader, so a new property (e.g. a person's name) stops the load instead of being served.
CREATE TABLE IF NOT EXISTS reference_fields (
    site_id              text NOT NULL REFERENCES sites (site_id) ON DELETE CASCADE,
    field_id             text NOT NULL,        -- `id`: p1 .. p36
    geom                 geometry(MultiPolygon, 4326) NOT NULL,
    area_ha              real,
    hyp                  text,                 -- hypothesis when traced: cana | no_cana
    label                text,                 -- NDVI label: cana | no_cana | dudoso
    harvest_window_start date,                 -- NDVI harvest window of the site's season
    harvest_window_end   date,
    orig_field           text,
    properties           jsonb NOT NULL DEFAULT '{}'::jsonb,  -- the other allowed properties
    facts                jsonb,                -- facts of the field's summaries.jsonl record
    PRIMARY KEY (site_id, field_id)
);
CREATE INDEX IF NOT EXISTS reference_fields_geom_gist ON reference_fields USING gist (geom);

-- Reference dates per field, one row per source property: the labelled NDVI harvest window
-- and each ground-truth date (ground_truth_date, ground_truth_date_<suffix>).
CREATE TABLE IF NOT EXISTS reference_dates (
    site_id     text NOT NULL,
    field_id    text NOT NULL,
    property    text NOT NULL,                 -- 'harvest_window' | 'ground_truth_date[_suffix]'
    kind        text NOT NULL,                 -- 'labelled_window' | 'ground_truth'
    date_start  date NOT NULL,
    date_end    date NOT NULL,                 -- = date_start for a single date
    season      text,                          -- zafra the date belongs to, where known
    event       text,                          -- ground_truth_event[_suffix], verbatim
    source      text,                          -- ground_truth_source[_suffix], verbatim
    note        text,                          -- ground_truth_note[_suffix], verbatim
    PRIMARY KEY (site_id, field_id, property),
    FOREIGN KEY (site_id, field_id) REFERENCES reference_fields (site_id, field_id) ON DELETE CASCADE
);

-- Summaries of the reference-field records of results/6/summaries.jsonl.
CREATE TABLE IF NOT EXISTS reference_summaries (
    site_id     text NOT NULL,
    field_id    text NOT NULL,
    lang        text NOT NULL,                 -- 'es' | 'en'
    source      text NOT NULL,                 -- 'template' | 'llm' (verifier passed)
    text        text NOT NULL,
    PRIMARY KEY (site_id, field_id, lang, source),
    FOREIGN KEY (site_id, field_id) REFERENCES reference_fields (site_id, field_id) ON DELETE CASCADE
);
