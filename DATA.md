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

**Alerts table: not on disk.** `scripts/17_field_summaries.py` evaluates the alert rules
(`zafra.alerts.evaluate`) for every cane segment but writes only the per-code counts
(`results/6/alert_counts.json`) and the alerts of the 58 summarised polygons (inside
`results/6/summaries.jsonl`). There is no per-segment alerts file for the whole layer.

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
* **Alerts:** not on disk (no per-segment file for either site; see above), and no Brazil
  alert counts either.
* **Sentinel-1 series:** no Brazil equivalent of `data/results/morelos/s1_series_2025_26.parquet`.
* **Official mill data:** the CONADESUCA comparison (`results/10/`) is Morelos only.

## Differences between the files and `api/app/schema.sql`

For the loader; nothing here is a defect in the files.

* Harvest maps: geometry is `Polygon`, the `segments.geom` column is `MultiPolygon`;
  `p_cane_optical` has no column.
* `weekly.csv`: the date column is `week` (schema: `week_start`); `harvest_ha` and
  `harvests_no_baseline_rule` have no column.
* Time series and coherence name their id column `field_id` (schema: `segment_id`; that the
  values match the maps' `segment_id` was not checked); coherence is per pair (`ref_date`,
  `sec_date`), the series per `date` and `orbit`.
