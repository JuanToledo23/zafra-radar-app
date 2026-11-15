# API

Read-only HTTP API over the tables filled by `python -m app.loader` (see [DATA.md](../DATA.md)).
Base URL `http://localhost:8010`; the web app reaches the same routes under `/api` through
the Vite proxy. Interactive schema: `/docs`. All endpoints are `GET`. An unknown site or
segment gives 404 with `{"detail": "..."}`. Dates are ISO strings (`YYYY-MM-DD`); missing
values are `null` (never NaN).

## `GET /sites`

```bash
curl http://localhost:8010/sites
```

A list, one object per loaded site:

| key | meaning |
|---|---|
| `site_id`, `name`, `season`, `timezone` | from `configs/<site>.yaml` |
| `bbox` | `[west, south, east, north]`, degrees (EPSG:4326) |
| `segment_count`, `dated_segment_count` | segments in the map; those with a harvest date |
| `cane_area_ha`, `dated_area_ha` | area of all segments (every map segment is cane) and of the dated ones |
| `harvest_date_min`, `harvest_date_max` | range of `harvest_date` |
| `series_date_min`, `series_date_max` | range of the NISAR acquisition dates in the series |
| `has_official`, `has_summaries` | official CONADESUCA weekly rows / field summaries loaded |
| `alert_counts`, `official_final` | `results/6/alert_counts.json` and `results/10/ez_final.json` as loaded; `null` where absent (Brazil) |

## `GET /tiles/{site}/{z}/{x}/{y}.pbf`

```bash
curl -o t.pbf http://localhost:8010/tiles/morelos/12/919/1832.pbf
```

Mapbox vector tile (`application/vnd.mapbox-vector-tile`, `Cache-Control: public,
max-age=3600`), layer `segments`, extent 4096, buffer 64. Feature properties:
`segment_id`, `status`, `confidence`, `area_ha`, `p_cane`, `p_cane_radar`,
`date_uncertainty_days`, `harvest_date` (ISO string) and `harvest_day` (integer days since
1970-01-01, for filtering and colouring by a time slider); both are absent from the feature
when the segment is undated. `alert_codes`: the segment's alert codes, sorted and joined with
commas (`BURN_WITHOUT_HARVEST,FIRE_ACTIVE_OUTSIDE_HOURS`), absent when it has none.
`first_fire_day`, `last_fire_day`: integer day numbers of the segment's first and last season
fire (see "Mill operations" below), absent without one; with `harvest_day` they let the map
colour "burned and not harvested" for any date without reloading tiles. Below z12 the polygons are simplified in Web Mercator
(`ST_Simplify`) with a tolerance of half a screen pixel at that zoom, taking a tile as 512
pixels wide (38 m at z10, 19 m at z11), and polygons that collapse are left out (61 of 6,014
Morelos and 162 of 12,210 Brazil segments at z10, none at z11); from z12 on the geometry is
not simplified. 204 when the tile has no segment; 400 for non-integer or
out-of-range `z`/`x`/`y` (`0 <= z <= 22`); 404 for an unknown site.

## `GET /segments/{site}/{segment_id}`

```bash
curl http://localhost:8010/segments/morelos/cc00042
```

| key | meaning |
|---|---|
| `site_id`, `segment_id`, `area_ha`, `p_cane`, `p_cane_radar`, `p_cane_optical`, `harvest_date`, `date_uncertainty_days`, `status`, `confidence`, `hv_drop_db`, `coh_min`, `wc_disagrees` | segment attributes |
| `centroid` | `[lon, lat]` |
| `bbox` | `[west, south, east, north]`, for fly-to |
| `series` | `{"asc": [...], "desc": [...]}`, each a date-sorted list of `{date, hv_db, hh_db}` (dB; orbits never averaged) |
| `coherence` | list of `{ref_date, sec_date, coh_mean, coh_min}`, sorted by pair |
| `fires` | FIRMS detections within `fire_buffer_m` (200 m) of the polygon, on the geography: `{datetime_local, sensor, source, frp, confidence, distance_m}`; `sensor` is the FIRMS satellite code (`N`, `N20`, `N21`) |
| `fire_buffer_m` | 200, the library's `alerts.fire_buffer_m` used for `fires_cane` |
| `summary` | `{"es": {text, source}, "en": {text, source}}`, `source` `llm` (verifier passed) preferred over `template`; `null` when the segment has no summary |
| `alerts` | list of `{code, severity, evidence}`: every cane segment where the derived alerts file was loaded (both sites), otherwise only the summarised segments (DATA.md) |

## `GET /weekly/{site}`

```bash
curl http://localhost:8010/weekly/morelos
```

| key | meaning |
|---|---|
| `weeks` | `{week_start, harvests, fires_all, fires_cane}` per Monday week (`weekly.csv`) |
| `official` | CONADESUCA weekly rows (`results/10/ez_weekly.csv`: `cutoff`, `week_start`, `report`, `cycle_week`, `cum_ha`, `cum_cane_t`, `reported_week_ha`, `reported_week_cane_t`, `week_ha`, `week_cane_t`, `diff_vs_reported_ha`, `diff_vs_reported_cane_t`); `null` for a site without them |
| `cumulative` | `null` without official data; otherwise `source`, `official_total_ha`, `detected_total_ha`, `weeks` (`cutoff`, `report`, `official_week_ha`, `official_cum_ha`, `detected_week_ha`, `detected_cum_ha`, `official_pct`, `detected_pct`) and `crossings` (`"25"`, `"50"`, `"75"`: first cut-off at or above that percentage, `official` and `detected`) |

The cumulative curves are recomputed on each request from the loaded tables with the
definition of the research library's `scripts/20_official_data.py` (exercise 10): official
season weeks (Sunday-Saturday, keyed by the Saturday cut-off), detected = dated cane area
binned by the cut-off on or after its harvest date; official % = cumulative ha / final
area (9,565 ha); detected % = cumulative dated ha / all dated ha (6,867 ha). The library
writes these per-week values only into a Markdown table (`results/10/official_comparison.md`,
2 decimals), so no file is loaded for them; the recomputation matches that table in all 24
weeks.

## `GET /reference/{site}`

```bash
curl http://localhost:8010/reference/morelos
```

GeoJSON FeatureCollection of the site's reference fields (hand-traced polygons with labels
and reference harvest dates; DATA.md), in natural id order (`p2a`, `p2b`, ..., `p10`). A site
without reference fields (Brazil) gives `{"type": "FeatureCollection", "site_id": ...,
"features": []}`. Each feature has `id` = field id, a MultiPolygon geometry (EPSG:4326) and
these properties:

| key | meaning |
|---|---|
| `field_id`, `area_ha`, `hyp`, `label`, `harvest_window_start`, `harvest_window_end`, `orig_field` | GeoJSON properties: tracing hypothesis, NDVI label (`cana`, `no_cana`, `dudoso`), labelled NDVI harvest window |
| other properties | the remaining GeoJSON properties as in the file (`region`, `municipio`, `ground_truth_*`), only those on the loader's allow-list; none holds a personal name |
| `bbox` | `[west, south, east, north]`, for fly-to |
| `reference_dates` | one object per reference date: `property` (`harvest_window` or the `ground_truth_date[_suffix]` it comes from), `kind` (`labelled_window` = NDVI harvest window; `ground_truth` = reported ground-truth date), `date_start`, `date_end` (equal for a single date), `season`, and `event`, `source`, `note` verbatim from the file (`null` where absent) |
| `facts` | the facts of the field's record in `results/6/summaries.jsonl` (the library's field-level outputs: `harvest_date`, `date_uncertainty_days`, `cane_confidence`, `segments_covering`, ...); `null` without a record |
| `summary` | as in `/segments`: `{"es": {text, source}, "en": {text, source}}`, `null` without a record |
| `segments` | map segments overlapping the field: `{segment_id, overlap_share, harvest_date, date_uncertainty_days}`, largest `overlap_share` first; `overlap_share` = intersection area / field area on the geography (4 decimals); segments that only touch the field are left out |

`segments` covers only the slim map's cane segments, so its count and total share can be
lower than the library's `facts.segments_covering`, which counts every segment of the
segmentation (p36: 9 cane segments covering 63 % of the field vs 23 segments, 94.5 %).

## `GET /alerts/{site}`

```bash
curl 'http://localhost:8010/alerts/morelos?code=FIRE_ACTIVE_OUTSIDE_HOURS&limit=50&offset=0'
```

Alerts of the research library's rules (`zafra.alerts`) over every cane segment of the site,
as computed by `tools/build_alerts.py` and loaded from `data/derived/alerts_<site>.json`
(DATA.md). They are flags for review, not findings.

Query parameters: `code` (optional, one alert code; empty = all), `limit` (1-500, default 50),
`offset` (>= 0, default 0). A code the site does not know gives 400; a code that is known but
disabled for the site (e.g. `FIRE_ACTIVE_OUTSIDE_HOURS` for Brazil) gives 200 with no rows;
an out-of-range `limit`/`offset` gives 422; an unknown site 404.

| key | meaning |
|---|---|
| `source` | `derived` (the derived file was loaded) or `summaries` (only the summarised segments of `summaries.jsonl`; then `codes` has no definitions) |
| `library` | `{commit, commit_short, dirty, script, rules_module}`: the library checkout the alerts were computed with; `null` for `summaries` |
| `layer`, `cane_segments` | the library layer the rules ran on, and its number of gated cane segments |
| `codes` | one object per code, in the library's order: `code`, `severity` (`warning` / `info`), `enabled` (in `configs/<site>.yaml`), `params` (the rule's parameters there, e.g. `days_after`), `count` (alerts of that code on the site, independent of the `code` filter), `definition` (the library's own text from the `zafra.alerts` docstring, verbatim; bracketed names are config parameters), `definition_source` (`file:lines` in the library) |
| `code`, `total`, `limit`, `offset` | the filter applied, the number of alerts matching it, the page |
| `alerts` | the page: `{segment_id, code, severity, evidence, harvest_date, area_ha, centroid}`; `evidence` is the library's evidence object verbatim; `centroid` is `[lon, lat]` |

Order: warnings before info, then by the segment's `harvest_date` (undated last), then
`segment_id` and `code`. A segment can appear once per code.

## Mill operations: `GET /ops/{site}` and related

A replay of the season "as of" a date for a mill's field department. **App logic, not
research-library results**; the definitions below are this app's. It is not a live system:
every number comes from the loaded season files.

**Definitions.**

* **Season window**: `zafra.start` .. `zafra.end` of `configs/<site>.yaml` in the research
  library, end exclusive (Morelos 2025-11-01 .. 2026-06-01, Brazil 2026-04-01 ..
  2026-12-01), loaded into `sites.season_start` / `season_end`. A fire is in the season when
  its UTC time is inside the window, as `zafra.summary.field_facts` filters fires; earlier
  seasons' fires (the Morelos FIRMS files start 2024-11-01) are excluded.
* **Season fires** of a segment: FIRMS detections within 200 m of the polygon (on the
  geography; the library's `alerts.fire_buffer_m`) in the season window, dated by their local
  date. Precomputed by the loader (`segments.season_fire_dates`, `first_fire_date`,
  `last_fire_date`, DATA.md).
* **As of date D**, each segment is in exactly one state: **harvested** (`harvest_date <=
  D`), **not yet harvested** (`harvest_date > D`, standing cane at D) or **no date detected**
  (no `harvest_date`; reported separately, never counted as standing cane).
* **Burned and not harvested as of D**: at least one season fire on or before D and not
  harvested as of D (not yet harvested **or** no date detected). **Days since burn** = D minus
  the date of its first season fire. **Buckets**: `0_2` (0–2 days), `3_7`, `8_14`, `over_14`
  (more than 14 days).
* **Harvested in the last 7 days**: `harvest_date` in D − 6 .. D. **Pace**: harvested area of
  the last three full Monday–Sunday weeks ending on or before D (a Sunday D closes its own
  week), divided by 3, in ha per week. **Projected end**: D plus the not-yet-harvested area ÷
  pace, in weeks, rounded up to a day; `null` when the pace is 0, D itself when nothing is
  dated later.
* **Fires outside permitted hours, last 7 days** (only where the site config enables
  `FIRE_ACTIVE_OUTSIDE_HOURS` and has a burn window: Morelos): season fires within 200 m of a
  segment, local date D − 6 .. D, local time outside the config's default window (both ends
  permitted, as the library's rule). The library's per-municipality windows are not applied
  (the map has no municipality; every configured window is 09:00–17:00).
* **Cane tonnage estimate** (only with official mill data giving a mean field yield: Morelos):
  harvested area × `field_yield_t_ha` of `results/10/ez_final.json` (95.7 t/ha), labelled an
  estimate.

`as_of` (`YYYY-MM-DD`, optional) defaults to the site's last harvest date. A malformed date
gives 422, an unknown site 404, an unknown `bucket` 400.

### `GET /ops/{site}?as_of=`

```bash
curl 'http://localhost:8010/ops/morelos?as_of=2026-02-15'
```

| key | meaning |
|---|---|
| `replay`, `as_of`, `as_of_default` | always `true`; the date used; whether it is the default |
| `season` | `{name, start, end_exclusive, source}` |
| `fire_buffer_m` | 200 |
| `cane` | `{segments, area_ha}` of every map segment (all are cane) |
| `harvested` | `{segments, area_ha, share_of_cane_area}` |
| `harvested_last_7_days` | `{from, to, segments, area_ha}` |
| `not_yet_harvested`, `no_date_detected` | `{segments, area_ha}` |
| `pace` | `{ha_per_week, weeks: [{start, end, area_ha}]}` (three weeks, oldest first) |
| `projected_end` | date or `null` |
| `burned_not_harvested` | `{segments, area_ha, no_date_segments, buckets: [{bucket, min_days, max_days, segments, area_ha}]}` |
| `fires_outside_hours_last_7_days` | `{from, to, burn_window, window_confirmed, detections, segments}`, or `null` without the rule |
| `cane_tonnage_estimate` | `{label: "estimate", tonnes, field_yield_t_ha, harvested_area_ha, source}`; **absent** without official yield data |

### `GET /ops/{site}/burned?as_of=&bucket=&limit=&offset=`

The burned-and-not-harvested list as of the date: `{site_id, as_of, bucket, total, limit,
offset, rows}`, each row `{segment_id, area_ha, first_fire_date, last_fire_date,
days_since_burn, bucket, harvest_date, date_uncertainty_days, centroid}`. `last_fire_date` is
the last season fire on or before the date; `harvest_date` is the radar date of the later
harvest (`null` when none was detected). Order: most days since burn first, then largest area,
then `segment_id`. `limit` 1–500 (default 50), `offset` >= 0.

### CSV exports

UTF-8 with a byte-order mark (opens in Excel without mojibake), CRLF line ends,
`Content-Disposition: attachment`.

* `GET /ops/{site}/burned.csv?as_of=&bucket=`: the whole list in the same order; columns
  `segment_id, area_ha, first_fire_date, last_fire_date, days_since_burn, bucket,
  harvest_date_later, date_uncertainty_days, lon, lat`.
* `GET /ops/{site}/ledger.csv?as_of=`: one row per segment, by id; columns `segment_id,
  area_ha, status_as_of` (`harvested`, `not_yet_harvested`, `no_date_detected`), `harvest_date,
  date_uncertainty_days, p_cane, p_cane_radar, p_cane_optical, first_season_fire,
  last_season_fire` (on or before the date), `days_since_burn, bucket` (burned and not
  harvested only), `alert_codes` (`;`-separated; the library's alerts over the whole season,
  not as of the date), `lon, lat` (centroid).

### `GET /ops/{site}/fire-to-harvest`

Season statistic, not shown in the web app: for the segments with both a season fire and a
harvest date, the distribution of `harvest_date − first season fire date` in days: `count`,
`median`, `q1`, `q3` (linear interpolation, as `percentile_cont`), `min`, `max`,
`share_within_3` (|days| <= 3), `share_over_7`, `share_over_14`, `share_negative` (first fire
after the harvest date), as fractions of `count`.
