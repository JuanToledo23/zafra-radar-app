# Data

The application reads precomputed result files from a local checkout of the research
library, [zafra-radar-research](https://github.com/JuanToledo23/zafra-radar-research). No
data file is copied into or committed to this repository.

`ZAFRA_DATA` (see `.env.example`) points to the **root** of that checkout, not to its
`data/` folder: the inputs live under both `data/` and `results/` there. All paths below are
relative to `ZAFRA_DATA`.

Inventory checked on 2026-11-14 against the library at commit `0d6b064`. Sizes are in
binary units (1 MB = 1024² bytes). Schemas: GeoJSON properties of the first feature, CSV
header, parquet column names and Arrow types (schema only), JSONL keys of the first record,
JSON top-level keys. No inspection took more than 1 s.

## Morelos (Mexico), zafra 2025/26

| Input | Path | Size | Rows / features | Schema |
|---|---|---|---|---|
| Harvest map (slim) | `data/results/harvest_map_2025_26_slim.geojson` | 8.1 MB | 6 014 features, Polygon, CRS84 | segment_id, area_ha, p_cane, p_cane_radar, p_cane_optical, harvest_date, date_uncertainty_days, status, confidence, hv_drop_db, coh_min, wc_disagrees |
| Weekly harvests and fires | `results/4e/weekly.csv` | 973 B | 31 rows | week, harvests, harvest_ha, fires_all, fires_cane, harvests_no_baseline_rule |
| Radar time series per segment | `data/features/segments_timeseries.parquet` | 53.6 MB | 1 186 260 rows | field_id: large_string, date: timestamp[us], hv_db: double, enl: double, mean_looks: double, hh_db: double, valid_px: int64, inside_px: int64, cross_ratio_db: double, orbit: large_string |
| Coherence per segment | `data/features/segments_coherence.parquet` | 10.6 MB | 632 672 rows | field_id: large_string, ref_date: timestamp[us], sec_date: timestamp[us], coh_mean: double, coh_min: double, valid_px: int64 |
| Field summaries | `results/6/summaries.jsonl` | 125.7 KB | 58 records | label, key, tags, facts, alerts, template, llm, tokens_estimated (each `alerts` item: code, severity, message_es, message_en, evidence) |
| Alert counts | `results/6/alert_counts.json` | 1.5 KB | 1 object | site, layer, alerts, summaries, template_verifier_pass, llm_used, llm_fallback_reasons, cost, runtime_s |
| FIRMS VIIRS, NOAA-20 | `data/firms/firms_viirs_noaa20_2024-11-01_2026-05-31.csv` | 82.2 KB | 863 rows | latitude, longitude, bright_ti4, scan, track, acq_date, acq_time, satellite, instrument, confidence, version, bright_ti5, frp, daynight, type, source |
| FIRMS VIIRS, NOAA-21 | `data/firms/firms_viirs_noaa21_2024-11-01_2026-05-31.csv` | 70.2 KB | 736 rows | same as NOAA-20 |
| FIRMS VIIRS, Suomi-NPP | `data/firms/firms_viirs_snpp_2024-11-01_2026-05-31.csv` | 73.6 KB | 806 rows | same as NOAA-20 |
| NISAR raster tiles index | `data/tiles/morelos/tiles_index.json` | 17.6 KB | 24 layers | site, description, source, dates, url_template, tile_size, minzoom, maxzoom, bounds, aoi, processing, valid_fraction, total_tile_bytes, layers |
| Sentinel-1 series 2025/26 | `data/results/morelos/s1_series_2025_26.parquet` | 173.5 KB | 4 118 rows | field_id: large_string, date: timestamp[us], orbit: large_string, rel_orbit: int64, platform: large_string, vh_db: double, vv_db: double, vh_linear: double, vv_linear: double, valid_px: int64, image_id: large_string |
| CONADESUCA weekly, Emiliano Zapata mill (Not part of v0.1.0: added to the library in commit 0d6b064 (2026-11-14, during the event).) | `results/10/ez_weekly.csv` | 2.7 KB | 36 rows | cutoff, week_start, report, cycle_week, cum_ha, cum_cane_t, reported_week_ha, reported_week_cane_t, week_ha, week_cane_t, diff_vs_reported_ha, diff_vs_reported_cane_t |
| CONADESUCA final, Emiliano Zapata mill (Not part of v0.1.0: added to the library in commit 0d6b064 (2026-11-14, during the event).) | `results/10/ez_final.json` | 1.6 KB | 1 object | mill, source, publication_date, season_start, season_end, operating_days_real, operating_days_1st_estimate, operating_days_difference, area_ha, cane_t, field_yield_t_ha, sugar_t, factory_yield_pct, agroindustrial_yield_t_sugar_ha, standard_sugar_t, karbe_net_theoretical_kg_tcn_2025_26, precision_vs_1st_estimate_pct, karbe_5_zafras, raw |
| Reference fields | `data/fields/fields_v2.geojson` | 19.9 KB | 38 features, Polygon, CRS84 | id, hyp, label, area_ha, harvest_window_start, harvest_window_end, orig_field |
| Site configuration | `configs/morelos.yaml` | 4.4 KB | — | name, description, aoi, nisar, zafra, firms, gate_variant, reference_fields, paths, alerts, summary, web_rasters |

**Alerts table: not in the library.** `scripts/17_field_summaries.py` evaluates the alert
rules (`zafra.alerts.evaluate`) for every cane segment but writes only the per-code counts
(`results/6/alert_counts.json`) and the alerts of the 58 summarised polygons (inside
`results/6/summaries.jsonl`). The per-segment table is generated in this repository by
`tools/build_alerts.py` (see "Derived data" below).

## Ribeirão Preto (Brazil), NISAR scenes 2026-06-22 .. 2026-10-22

| Input | Path | Size | Rows / features | Schema |
|---|---|---|---|---|
| Harvest map (slim) | `data/results/brazil/harvest_map_slim.geojson` | 24.4 MB | 12 210 features, Polygon, CRS84 | same properties as Morelos |
| Weekly harvests and fires | `results/5_brazil/weekly.csv` | 968 B | 36 rows | same header as Morelos |
| NISAR raster tiles index | `data/tiles/brazil/tiles_index.json` | 17.6 KB | 24 layers | same keys as Morelos |
| Site configuration | `configs/brazil.yaml` | 5.6 KB | — | same keys as Morelos |
| Radar time series per segment | `data/features/brazil/segments_timeseries.parquet` | 24.9 MB | 548 709 rows | same schema as Morelos |
| Coherence per segment | `data/features/brazil/segments_coherence.parquet` | 3.7 MB | 193 662 rows | same schema as Morelos |
| FIRMS VIIRS, NOAA-20 | `data/firms/brazil/firms_viirs_noaa20_2026-04-01_2026-10-25.csv` | 726 B | 6 rows | same header as Morelos |
| FIRMS VIIRS, NOAA-21 | `data/firms/brazil/firms_viirs_noaa21_2026-04-01_2026-10-25.csv` | 948 B | 8 rows | same header as Morelos |
| FIRMS VIIRS, Suomi-NPP | `data/firms/brazil/firms_viirs_snpp_2026-04-01_2026-10-25.csv` | 419 B | 3 rows | same header as Morelos |

**Missing for Brazil:**

* **Summaries:** no `results/6_brazil/` directory (where script 17 writes for sites other
  than Morelos); script 17 has not been run for Brazil.
* **Alerts:** no per-segment file in the library for either site and no Brazil alert counts;
  the app generates both sites' tables itself (see "Derived data" below).
* **Sentinel-1 series:** no Brazil equivalent of `data/results/morelos/s1_series_2025_26.parquet`.
* **Official mill data:** the CONADESUCA comparison (`results/10/`) is Morelos only.

## What the loader loads

`python -m app.loader` (`api/app/loader.py`) reads the paths from `configs/<site>.yaml`
(`paths`, `firms.dir`) as the library does, and writes one transaction per site.
`--list-inputs` prints the input files that exist (21 at `0d6b064`) without loading;
`deploy.sh` copies exactly those to the server.

| Table | Source (Morelos; Brazil equivalent from its config) | Rows loaded |
|---|---|---|
| `sites` | `configs/<site>.yaml`: `description` (name), `zafra.name` (season), `aoi.bbox`, `alerts.timezone`, `zafra.start` / `zafra.end` (`season_start`, `season_end`; the end exclusive); `official_final` from `results/10/ez_final.json`; `alert_counts` from `results/6/alert_counts.json` | one per site; the jsonb columns are NULL for Brazil |
| `segments` | slim harvest map (`paths.slim_geojson`) | every feature; Polygons wrapped with `ST_Multi`; CRS84 checked |
| `segment_series` | `paths.timeseries` (`field_id` → `segment_id`; `date` → `acquisition_date`; `orbit`, `hv_db`, `hh_db`) | cane segments only (below) |
| `segment_coherence` | `paths.coherence` (`ref_date`, `sec_date`, `coh_mean`, `coh_min`) | cane segments only |
| `fires` | every `*.csv` in `firms.dir` (not recursive) | every detection in the files, including the 2024-25 season for Morelos; `segment_id` set by `ST_Intersects` with the site's segments |
| `weekly` | `<results_dir>/weekly.csv` (`week` → `week_start`, `harvests`, `fires_all`, `fires_cane`) | every row; `harvest_ha` and `harvests_no_baseline_rule` are not loaded |
| `official_weekly` | `results/10/ez_weekly.csv`, all columns | Morelos only |
| `summaries` | `results/6/summaries.jsonl`: `template.<lang>` and `llm.<lang>` | segment records only; the LLM text only when the LLM rendered it and the verifier passed for that language |
| `alerts` | `data/derived/alerts_<site>.json` (below) where it exists, replacing the summaries.jsonl alerts for that site; otherwise `results/6/summaries.jsonl`: `alerts[]` (`code`, `severity`, `evidence`), segment records only | Morelos 3,517, Brazil 5,797 (derived); 9 Morelos rows from summaries.jsonl without the derived file |
| `sites.alert_rules` | the same derived file: library commit, layer, and per code `severity`, `enabled`, `params`, `count`, `definition`, `definition_source` | NULL without a derived file |
| `segments.alert_codes` | distinct codes of the segment's `alerts` rows, sorted | set after `alerts` is loaded; empty array without alerts |
| `reference_fields` | `reference_fields` of `configs/<site>.yaml` (`data/fields/fields_v2.geojson`): `id` → `field_id`, `area_ha`, `hyp`, `label`, `harvest_window_start`, `harvest_window_end`, `orig_field`; the other allowed properties (`region`, `municipio`, `ground_truth_*`) in `properties` (jsonb); `facts` of the field's record in `results/6/summaries.jsonl` | every feature (38, Morelos only); Polygons wrapped with `ST_Multi`; CRS84 checked |
| `reference_dates` | the same GeoJSON: `harvest_window_start/end` (kind `labelled_window`) and each `ground_truth_date[_suffix]` with its `ground_truth_zafra/event/source/note[_suffix]` (kind `ground_truth`) | one row per date present: 26 windows and 2 ground-truth dates |
| `reference_summaries` | `results/6/summaries.jsonl`: `template.<lang>` and `llm.<lang>` of the reference-field records (`facts.field_id`, no `segment_id`) | same rule as `summaries`; 152 rows (38 fields × 2 languages × template and LLM) |

**Cane rule.** A segment is cane if it is in the slim map: the library's script 15 writes
only the polygons with `cane_pred == True` (the delivered optical gate) to that file. Every
feature has `p_cane >= 0.5`, and `p_cane` equals `p_cane_optical`.

**Ids.** The series and coherence files name the id `field_id`; its values are the maps'
`segment_id` (`cc00042` ...). Every map segment has series and coherence rows (6,014 / 6,014
Morelos, 12,210 / 12,210 Brazil). The same id can occur in both sites, so segments are keyed
by (`site_id`, `segment_id`).

**Units.** `hv_db` and `hh_db` are already in dB, so they are loaded unchanged. Loaded
ranges: Morelos HV -22.7 to -2.9, HH -17.2 to +9.3; Brazil HV -23.8 to -4.0, HH -18.3 to
+4.9. Linear power would be positive and mostly below 1.

**Gaps.**

* Summaries exist only for the summarised polygons, not for the whole map:
  `summaries.jsonl` has 58 Morelos records; 20 are map segments, 38 are the reference fields
  (keyed by field id, no segment) and go to `reference_summaries` and `reference_fields.facts`.
  That gives 78 segment summary rows (one segment's LLM summary fell back to the template).
  Its 9 segment alerts are replaced by the derived table, which holds the same 9 rows
  (code, severity and evidence identical); the alerts of reference-field records are not
  loaded.
* Brazil has no summaries, alert counts, official data or reference fields (no
  `reference_fields` in its config); the loader logs one line for each and continues. Its
  alerts come from the derived table only.
* `fires.segment_id` uses point-in-polygon. The library's `fires_cane` in `weekly.csv` uses a
  200 m buffer (`alerts.fire_buffer_m`), so the two counts differ.
* Known difference, not investigated: weekly.csv has 1,097 Morelos fires in its window; the
  loader's local-date count for the same window is 1,098.
* Season fires (for `/ops`, computed per request from `fires`; the loader no longer stores
  per-segment season fire dates or `sites.burn_window`, see docs/FINDINGS.md): the window is
  taken at 00:00 UTC, as in the library; no loaded fire changes side if the window is taken on
  local dates instead (checked for both sites).

## Raster tiles (served, not loaded)

The NISAR image tiles are an input of the API, not of the loader: nothing from them goes into
the database. `/rasters/{site}` reads `data/tiles/<site>/tiles_index.json` and
`/rasters/{site}/{layer}/{z}/{x}/{y}.png` serves the PNG files from the read-only mount
(docs/API.md). They are written by the library's `scripts/18_web_rasters.py`
(`zafra.rasters`, its docs/METHODS.md "Web raster layers"): six ascending GCOV dates per site
(`web_rasters` in the site config), 24 layers (HV, HH, HV − HH cross-ratio for each date; HV
change for each consecutive pair and for the season), zoom 10-14, 256-pixel palette PNGs.

Checked on 2026-11-14 at library commit `0d6b064` (`du -sk`, `find -type f`):

| Site | Directory | Files | Size on disk | Dates |
|---|---|---|---|---|
| Morelos | `data/tiles/morelos/` | 6,361 (6,360 PNG + index) | 324 MB (apparent 313 MB) | 2025-11-23, 12-29, 2026-01-22, 02-15, 03-11, 04-28 |
| Brazil | `data/tiles/brazil/` | 6,289 (6,288 PNG + index) | 323 MB (apparent 313 MB) | 2026-06-24, 07-06, 08-11, 09-04, 09-28, 10-22 |
| Both | `data/tiles/` | 12,650 | 646 MB | |

`./deploy.sh --with-rasters` copies this directory (rsync, about 650 MB in 12,650 small files);
without it the server has no tile set and the Explorer's radar control is disabled.

* **Colours** (`meaning` of each layer in `/rasters/{site}`): the stretch and ramp come from
  the index; the description of what brighter / darker and blue / red mean is the library's
  text, cited by file and line in docs/API.md.
* **Attribution**: "NISAR L2 GCOV (Provisional): NASA/JPL-ISRO NISAR Project, distributed by
  ASF DAAC", from the library's docs/DATA_SOURCES.md:11-15 and :28-30.
* **Known gap in the library's tile sets:** the overview zooms 10-13 lack the easternmost
  tile column whose zoom-14 tiles exist (both sites, every layer checked). Where the imagery
  stops on screen, by tile zoom (MapLibre draws zoom z+1 tiles at map zoom about z):

  | Site | z10, z11 | z12 | z13 | z14 |
  |---|---|---|---|---|
  | Morelos | 99.141° W (11.6 km missing) | 99.053° W (2.3 km) | 99.053° W (2.3 km) | complete, to 99.031° W |
  | Brazil | 47.813° W (6.9 km) | 47.813° W (6.9 km) | 47.769° W (2.3 km) | complete, to 47.747° W |

  Cane segments lie in those strips. The fix belongs in the library (`zafra.rasters`
  overview tiling); the app serves the files as they are.

## Reference fields and their dates

Checked on 2026-11-14 in `data/fields/fields_v2.geojson` and the 38 reference-field records
of `results/6/summaries.jsonl`.

| Date | Properties | Fields |
|---|---|---|
| Labelled harvest window, zafra 2025-26 (Sentinel-2 NDVI, library script 07; p36's by script 09) | `harvest_window_start`, `harvest_window_end` | the 26 fields labelled `cana`; `null` for `dudoso` / `no_cana` |
| Reported ground-truth date, zafra 2024/25 | `ground_truth_date`, with `ground_truth_zafra`, `ground_truth_event`, `ground_truth_source` (the label's source: the grower, a dated video, "por confirmar"), `ground_truth_note` | p36 only |
| Reported ground-truth date, 2026 | `ground_truth_date_2026`, with `ground_truth_event_2026` (no source, zafra or note property of its own) | p36 only |

* No property holds a confirmed date: both ground-truth dates are reported and marked "por
  confirmar" in the file, and the library's docs/DATA_SOURCES.md calls the report "not yet
  checked".
* The summary facts hold no reference date; they hold the library's field-level radar output
  (`harvest_date`, `date_uncertainty_days`, `cane_confidence`, `segments_covering`, ...).
* Privacy: no property holds a personal name (`region` and the note say "grower-reported
  field"), so nothing is excluded. The loader allow-lists the properties; any other
  property stops the load until it has been checked.
* The 2024/25 ground-truth date is before the NISAR coverage, so the app computes no
  radar difference for it.

## Derived data (this repository)

`data/derived/` (git-ignored, like all of `data/`) holds files the app computes from the
library. The api container mounts it read-only at `/zafra-derived` (`ZAFRA_DERIVED` in
`.env`, default `./data/derived`); the loader treats it as an optional input.

| File | Written by | Contents |
|---|---|---|
| `data/derived/alerts_<site>.json` | `tools/build_alerts.py` | one object: `site`, `generated_at`, `library` (`commit`, `commit_short`, `dirty`, `script`, `rules_module`), `layer`, `burn_window`, `cane_segments`, `segments_with_alert`, `segments_with_warning`, `per_code`, `codes` (per code: `enabled`, `severity`, `params`, `count`, `definition`, `definition_source`), `alerts` (one row per alert: `segment_id`, `code`, `severity`, `evidence`) |

**How it is made.** `tools/build_alerts.py` runs with the library's Python environment and
imports the library's own code: from `scripts/17_field_summaries.py` it calls
`delivered_layer` and `facts_table` (step 1 of that script), which compute the facts
(`zafra.summary.field_facts`) and alerts (`zafra.alerts.evaluate`) of every gated cane
segment of the delivered layer, with the rule parameters of `configs/<site>.yaml`. No rule
is reimplemented. The definitions are the library's text, read from the "Rules" block of the
`zafra.alerts` docstring (`src/zafra/alerts.py:12-28`). Nothing is written inside the
library (bytecode is off; `git status` runs without the index lock).

```bash
# from this repository's root; ZAFRA_DATA = the library checkout
$ZAFRA_DATA/.venv/bin/python tools/build_alerts.py --site all --library "$ZAFRA_DATA"
docker compose exec api python -m app.loader --site all
```

**Generated on 2026-11-14 against library commit `0d6b064`** (checkout clean), layer
`data/results/harvest_dates_2025_26.geojson` (Morelos) and `data/results/brazil/harvest_dates.geojson`
(Brazil): the unmerged layers, which `merge_summary.json` marks as delivered for both sites.
Every alerted segment id is in the slim map.

| Code | Severity | Morelos | Brazil |
|---|---|---|---|
| `FIRE_ACTIVE_OUTSIDE_HOURS` | warning | 337 | off (no burn window configured) |
| `BURN_WITHOUT_HARVEST` | warning | 1,325 | 43 |
| `HARVEST_WITHOUT_FIRE` | info | off | off |
| `HIGH_DATE_UNCERTAINTY` | info | 0 | 0 |
| `RADAR_OPTICAL_DISAGREE` | warning | 1,202 | 3,504 |
| `NO_BASELINE` | info | 653 | 2,250 |
| total alerts / segments with an alert / with a warning | | 3,517 / 2,700 / 2,361 of 6,014 | 5,797 / 5,311 / 3,526 of 12,210 |

* Morelos check: the per-code totals, segments with an alert and segments with a warning
  equal `results/6/alert_counts.json` exactly.
* Brazil: the library's code runs on `configs/brazil.yaml` unchanged. That config disables
  `FIRE_ACTIVE_OUTSIDE_HOURS` (`burn_window: null`, no permitted burning hours known for São
  Paulo) and `HARVEST_WITHOUT_FIRE` (as for Morelos), so neither appears. There are no library
  totals to compare with (script 17 has not been run for Brazil). Brazil's FIRMS files hold
  17 detections in all, so the fire rules have little to work on.
* `HIGH_DATE_UNCERTAINTY` fires on no segment at either site (no dated segment exceeds 9 days).
* Regenerate after any library commit that changes the rules, the configs or the harvest
  layers, then reload; `/alerts/{site}` reports the commit the loaded table came from.
