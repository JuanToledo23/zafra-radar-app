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
when the segment is undated. 204 when the tile has no segment; 400 for non-integer or
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
| `alerts` | list of `{code, severity, evidence}` (only for summarised segments; DATA.md) |

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
