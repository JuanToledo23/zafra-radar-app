# Build journal

Records the work done on this repository during NASA Space Apps 2026 (Nov 14–15,
Zacatepec). Newest entry last. Times are local (America/Mexico_City).

## 2026-11-14 14:05 CST

- Created this repository (`git init -b main`).
- Copied the product skeleton from zafra-radar-research `product/` as of `v0.1.0`
  (`40edf63`, tagged 2026-11-11), taken from the library checkout at `0d6b064`, where
  `product/` is byte-identical to `v0.1.0`; renamed the compose project to `zafra-radar-app`.
- Added README.md, LICENSE, AI_USAGE.md, DATA.md, docs/RESOURCES.md, this journal, .env.example.
- Verified `docker compose up -d --build`: db, api and web healthy; `/health` and `/version`
  on 8010, web on 5174 returns 200.

## 2026-11-14 14:25 CST

- Added the data loader (`api/app/loader.py`) and reshaped `api/app/schema.sql`: every table
  keyed by site, segments keyed by (site_id, segment_id), coherence in its own table,
  official CONADESUCA weekly data, summaries.
- Compose mounts the library checkout read-only (`ZAFRA_DATA`); pyarrow added to the API image.
- Loaded both sites twice with identical row counts (Morelos 3.5-4.2 s, Brazil 4.6-5.2 s);
  Morelos matches the library's 6,014 segments, 9,943 ha, 3,976 dated segments, 6,867 ha.
- 13 unit tests for the parsing functions pass.

## 2026-11-14 14:40 CST

- Added the read API in `api/app/main.py`: `/sites`, `/tiles/{site}/{z}/{x}/{y}.pbf`
  (ST_AsMVT, layer `segments`), `/segments/{site}/{segment_id}`, `/weekly/{site}`; docs/API.md.
- Cumulative curves recomputed from the loaded tables with the definition of the library's
  `scripts/20_official_data.py`; 50 % reached on 2026-02-07 (detected) and 2026-02-14 (official).
- 8 HTTP tests (`api/tests/test_api.py`) and the 13 loader tests pass.

## 2026-11-14 14:57 CST

- Tiles below z12 are simplified in Web Mercator (half a pixel, 38 m at z10) and collapsed
  polygons dropped: largest Brazil z10 tile 1,188 kB -> 384 kB, Morelos 333 kB -> 149 kB.
- The map reads the API tiles: site select (Morelos / Brazil), weekly time slider on Sundays
  with play/pause and the cumulative harvest count from `/weekly`, legend, hover and click.
- Type-check and build pass; screenshots in `docs/screenshots/`.

## 2026-11-14 15:52 CST

- Added the field detail panel (`web/src/FieldDetail.tsx`): one `/segments` request per click,
  the previous one aborted; loading, not-found and error states; summary EN / ES toggle.
- Hand-written SVG charts (`TimeSeriesChart.tsx`, pure helpers in `chartScale.ts`, Okabe-Ito
  colours in `colors.ts`): HV, HH and coherence on one date axis, harvest band, fire markers.
- The shared axis is the site's series range, stretched to coherence pairs ending after it.
- Type-check and build pass; checked by eye on Morelos cc20456, cc01663 and Brazil cc20010.

## 2026-11-14 16:05 CST

- Added the season progress panel (`web/src/SeasonPanel.tsx`) across the bottom 40 % of the map:
  key numbers, weekly harvests and fires in cane, detected vs official cumulative share (Morelos);
  an Expand control grows it to about 75 % of the window (cumulative plot 427 px tall at 900 px).
- Pearson r computed in the browser: 0.708 harvests vs fires in cane, 0.702 vs all fires (library
  0.708 / 0.702); not shown under 30 fires in cane (Brazil: 14); detected area 104 % of official;
  50 % crossings 2026-02-07 / 2026-02-14.
- The slider index is clamped on a site change; switching site late in the season crashed the slider.
- Type-check and build pass; checked headless in Chrome for both sites in both panel sizes.

## 2026-11-14 16:22 CST

- Loader: reference fields (`reference_fields`, `reference_dates`, `reference_summaries`) from the
  config's `reference_fields` GeoJSON and the 38 reference records of `summaries.jsonl`; properties
  allow-listed (none holds a personal name); two runs give identical counts (38 / 28 / 152).
- `/reference/{site}` with dates, facts, summary and overlapping cane segments (p36: 9 covering 63 %);
  web: outline toggle with id labels, reference card, "Find field" box.
- 6 new loader tests and 2 HTTP tests; 29 pass. Type-check and build pass; checked headless in Chrome.
