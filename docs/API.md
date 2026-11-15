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
commas (`BURN_WITHOUT_HARVEST,FIRE_ACTIVE_OUTSIDE_HOURS`), absent when it has none. Below z12 the polygons are simplified in Web Mercator
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

**No hindsight.** Every endpoint of this screen, as of date D, uses only what would be known on
D: harvest dates on or before D and fires on or before D. No response shows a date after D
(apart from the season window, which is configuration) and none tells a field dated after D
from a field never dated. `test_ops_no_hindsight_on_any_endpoint` checks every endpoint below.
Two limits: the radar dates a harvest only after its next acquisition, so a harvest dated D
would in practice be known some days later; and an official weekly report is used from its
cut-off date, its publication lag not being known.

**Fire detections are context only.** A satellite fire detection near a field is not attributed
to it: a field's attributed detection falls within ±3 days of its radar harvest date in 14–25 %
of cases against 9.9–13.0 % by chance within the same month ([FINDINGS.md](FINDINGS.md)).

**Definitions.**

* **Season window**: `zafra.start` .. `zafra.end` of `configs/<site>.yaml` in the research
  library, end exclusive (Morelos 2025-11-01 .. 2026-06-01, Brazil 2026-04-01 ..
  2026-12-01), loaded into `sites.season_start` / `season_end`. A fire is in the season when
  its UTC time is inside the window, as `zafra.summary.field_facts` filters fires; earlier
  seasons' fires (the Morelos FIRMS files start 2024-11-01) are excluded.
* **As of date D**, each segment is in exactly one state: **harvested** (`harvest_date <= D`)
  or **not yet detected as harvested** (no harvest date on or before D: dated later or never
  dated, not told apart). Not yet detected = cane area minus harvested; it is not "standing
  cane": the radar does not date every harvested field.
* **Harvested in the last 7 days**: `harvest_date` in D − 6 .. D; **the 7 days before**: D − 13
  .. D − 7. **Pace**: harvested area of the last three full Monday–Sunday weeks ending on or
  before D (a Sunday D closes its own week), divided by 3, in ha per week.
* **Official report as of D** (only with official weekly data: Morelos): the last CONADESUCA
  weekly row (`official_weekly`) with a cut-off on or before D and some harvested area. Its
  cumulative area is set beside the detected area harvested on or before the same cut-off.
* **Cane tonnage estimate** (same sites): harvested area as of D × the official mean field yield
  to that report (cumulative cane t / cumulative ha), labelled an estimate. At the end of the
  season it equals the final yield (95.70 t/ha).
* **Fire detections near cane**: season fires within 200 m of any cane segment (on the
  geography; the library's `alerts.fire_buffer_m`), local date D − 6 .. D. **Night**: local hour
  before 6. The VIIRS satellites pass at about 02:00 and 14:00 local time (Morelos detections
  01:19–03:10 and 12:53–14:53, Brazil 01:15–02:02 and 13:10–14:49), so burns between passes
  are not seen.

`as_of` (`YYYY-MM-DD`, optional) defaults to the site's last harvest date. A malformed date
gives 422, an unknown site 404, a `days` other than 7 or 14 gives 400, an out-of-range
`limit` / `offset` 422.

### `GET /ops/{site}?as_of=`

```bash
curl 'http://localhost:8010/ops/morelos?as_of=2026-02-15'
```

| key | meaning |
|---|---|
| `replay`, `as_of`, `as_of_default` | always `true`; the date used; whether it is the default |
| `season` | `{name, start, end_exclusive, source}` |
| `cane` | `{segments, area_ha}` of every map segment (all are cane) |
| `harvested` | `{segments, area_ha, share_of_cane_area}` |
| `harvested_last_7_days`, `harvested_previous_7_days` | `{from, to, segments, area_ha}` |
| `pace` | `{ha_per_week, weeks: [{start, end, area_ha}]}` (three weeks, oldest first) |
| `not_yet_detected` | `{segments, area_ha, share_of_cane_area}`: cane minus harvested |
| `cane_tonnage_estimate` | `{label: "estimate", tonnes, yield_t_ha, harvested_area_ha, official_cutoff, official_report, source}`; `null` before the first official report; **absent** without official data |
| `official` | `{report, cutoff, official_harvested_ha, detected_harvested_ha, detected_share_of_official, source}`; `null` before the first report; **absent** without official data |

### `GET /ops/{site}/harvested?as_of=&days=&limit=&offset=`

Segments with a harvest date in the last `days` days up to D (`days` 7, the default, or 14):
`{site_id, as_of, days, from, to, total, limit, offset, rows}`, each row `{segment_id,
harvest_date, date_uncertainty_days, date_confidence, area_ha, tonnes_estimate, centroid}`;
`date_confidence` is the segment's `confidence`, `tonnes_estimate` its area × the yield of the
brief (`null` without one). Order: latest harvest date first, then largest area, then
`segment_id`. `limit` 1–500 (default 50), `offset` >= 0.

### `GET /ops/{site}/not-detected?as_of=&limit=&offset=`

Segments not yet detected as harvested as of D: `{site_id, as_of, total, limit, offset, rows}`,
each row `{segment_id, area_ha, centroid}` and nothing else. Order: largest area first, then
`segment_id`.

### `GET /ops/{site}/fires?as_of=`

Fire detections near cane in D − 6 .. D, as context: `{site_id, as_of, from, to,
fire_buffer_m, night_before_hour, detections, night, rows}`, each row `{datetime_local, frp,
confidence, satellite, cane_segments_within_200m, lon, lat}` (latest first); `confidence` is
the FIRMS VIIRS class (`l`, `n`, `h`). No row names a segment.

### `GET /ops/{site}/tiles/{z}/{x}/{y}.pbf?as_of=`

The map of the screen: a vector tile as `/tiles` (layer `segments`, same simplification, 204,
400 and 404 rules) with only `segment_id`, `area_ha` and, for segments harvested on or before
D, `harvest_date` and `harvest_day`. No status, confidence or alert codes.

### CSV exports

UTF-8 with a byte-order mark (opens in Excel without mojibake), CRLF line ends,
`Content-Disposition: attachment`.

* `GET /ops/{site}/harvested.csv?as_of=&days=`: the whole list in the same order; columns
  `segment_id, harvest_date, date_uncertainty_days, date_confidence, area_ha, tonnes_estimate,
  lon, lat`. Meant to be reconciled with the mill's own delivery records.
* `GET /ops/{site}/not-detected.csv?as_of=`: the whole list; `segment_id, area_ha, lon, lat`.
* `GET /ops/{site}/ledger.csv?as_of=`: one row per segment, by id; columns `segment_id,
  area_ha, status_as_of` (`harvested`, `not_yet_detected`), `harvest_date,
  date_uncertainty_days, date_confidence` (only for harvested segments),
  `fire_detections_within_200m, first_fire_detection_within_200m,
  last_fire_detection_within_200m` (season detections on or before D: count, first and last
  local date; not attributed to the segment), `p_cane_whole_season, p_cane_radar_whole_season,
  p_cane_optical_whole_season` (computed over the whole season, not as of D), `lon, lat`
  (centroid). The library's alert codes are not in the ledger: some depend on later harvest
  dates (`BURN_WITHOUT_HARVEST`).
