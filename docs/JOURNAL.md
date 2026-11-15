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

## 2026-11-14 16:37 CST

- `tools/build_alerts.py` runs the library's alert rules (script 17's `facts_table`, `zafra.alerts`)
  at `0d6b064` over every cane segment into `data/derived/alerts_<site>.json`; Morelos per-code
  totals equal `results/6/alert_counts.json` (337 / 1,325 / 0 / 0 / 1,202 / 653).
- Brazil runs on its config unchanged: 5,797 alerts; `FIRE_ACTIVE_OUTSIDE_HOURS` is off there (no
  burn window) and `HARVEST_WITHOUT_FIRE` is off on both sites.
- Loader: derived alerts replace the summaries.jsonl ones, `segments.alert_codes` feeds the tiles;
  two runs give identical counts (3,517 / 5,797). New `/alerts/{site}` with code filter and paging.
- Web: "Alerts" list with code chips, map outline of the selected code, Load more, row opens the
  field detail. 7 new tests; 36 pass. Type-check and build pass; checked headless in Chrome.

## 2026-11-14 17:13 CST

- Production files: `docker-compose.prod.yml` (standalone; Caddy the only service with ports, no
  published db/api ports, password required from `.env`), `Caddyfile`, `web/Dockerfile.prod`,
  `deploy.sh` (rsync of the loader's own input list plus `data/derived`, then ssh), `DEPLOY.md`.
- Loader: `--list-inputs` prints the 21 input files; a test checks it equals what `load_site` opens.
- Local production test over HTTP on port 8080: app, `/api/health`, tiles (178,390 B, 86,833 gzip,
  87,474 zstd, API `Cache-Control` kept), www redirect; db and api not reachable from the host.
- Not deployed; nothing sent to a remote machine.

## 2026-11-14 19:35 CST

- Loader: season window and burn window from the site configs into `sites`; per-segment season
  fire dates (200 m, in the window) into `segments`, their day numbers into the tiles. Two runs
  give identical counts and checksums (Morelos 2,246 segments with a season fire, Brazil 43).
- `/ops/{site}` brief, `/ops/{site}/burned` list, two CSV exports (UTF-8 BOM) and
  `/ops/{site}/fire-to-harvest`; Morelos as of its last harvest date: 3,976 segments, 6,867 ha.
- Web: "Mill operations" view (banner synced with the slider, brief, bucket table, map by
  bucket, exports, EN / ES). 28 new tests, 65 pass; type-check and build pass; checked
  headless in Chrome, both sites and languages.


## 2026-11-14 20:24 CST

- The "Mill operations" screen's burned-and-not-harvested list (fire within 200 m, no harvest
  date yet, days since burn) was tested against chance on Morelos: a field's attributed fire
  falls within ±3 days of its radar harvest date in 14–25 % of cases against 9.9–13.0 % by
  chance within the same month; about a third come after the harvest (docs/FINDINGS.md).
- Removed the list, its buckets, CSV and map colours, the fire-to-harvest endpoint, the
  projected end and the outside-hours figure; the loader's per-segment fire columns and
  `sites.burn_window` are dropped. Analysis scripts in `tools/analysis/fire_attribution/`.
- Replaced by a brief and lists on radar harvest dates only, as of the date with no hindsight
  (harvested this week, not yet detected as harvested, official area beside detected), fire
  detections near cane as unattributed context, and per-date map tiles; a test checks every
  endpoint of the screen for dates after the selected one.

## 2026-11-14 20:47 CST

- Mill operations: "Weekly report" opens a print-ready page (`/?report=<site>&as_of=&lang=`)
  from the `/ops` endpoints as of the date, EN / ES, with "Print / Save as PDF".
- New `/ops/{site}/series` (weekly detected area and cumulative official vs detected area up to
  the date, in ha); added to the no-hindsight test, plus one test of its weeks and official rows.
- Date error in the report's footnote quoted from the library's docs/VALIDATION.md (:18, :26).
- Printed with headless Chrome: Morelos 2026-02-15 EN and ES, Brazil 2026-09-30, Letter and A4,
  2 pages each, no horizontal overflow; PDFs not kept.

## 2026-11-14 21:20 CST

- First production deployment to zafraradar.earth, run by the author with `./deploy.sh`.
- Both production images (api, Caddy with the web build) built on the VM for the first time;
  all three containers (db, api, caddy) healthy.
- Loader counts on the server identical to the local ones.

## 2026-11-14 21:45 CST

- Radar imagery in the Explorer: `/rasters/{site}` (the library's tiles_index.json, normalised,
  with the library's colour description and NISAR credit cited by file and line) and
  `/rasters/{site}/{layer}/{z}/{x}/{y}.png` (files from the read-only mount, 204 when missing).
- Web: off / single date (follow the time slider) / compare with a divider drawn by two
  scissor-clipped raster layers in one map, no plugin. 31 new tests, 93 pass; build passes.
- Headless Chrome, both sites: harvested fields turn dark between the first and last date
  and line up with the outlines. The library's overview tiles (z10-13) lack the easternmost
  column, a 2-12 km blank strip on the east edge (DATA.md); tile sets 646 MB, 12,650 files.

## 2026-11-14 22:10 CST

- Radar imagery, east edge: new `tools/build_overview_tiles.py` builds the zoom 10-13 tiles
  missing from the library's sets from their children (mosaic, 2 × 2 mean ignoring nodata,
  same palette) into `data/derived/tiles/` (git-ignored). Morelos 384 tiles, Brazil 456; the
  gap was also a south row at z10 (Brazil z10-11), now none at any zoom. The library is
  unchanged.
- `/rasters/{site}/{layer}/{z}/{x}/{y}.png` serves the library's tile, else the derived one
  (`X-Tile-Source`); `/rasters/{site}` gains `derived_tiles`. `deploy.sh --with-rasters`
  also copies the derived tiles; the plain derived rsync now leaves them out.
- Headless Chrome, both sites, map zoom 9.5-12.5, library-only vs with derived tiles: the
  imagery now reaches the east edge at every zoom; no visible seam or shift in tone.
- Explorer: a new radar date stays hidden under the previous image until its tiles in view
  have loaded, then replaces it. Morelos, HV, "Follow time slider", whole season played,
  every render frame read back: 0 blank frames in 3 runs (the previous code: 40 of 278).


## 2026-11-14 23:32 CST

- Interface redesign, appearance, layout and wording only (no API, calculation or data-colour
  change): design tokens and rules in docs/DESIGN.md; top bar; one Map layers panel; timeline
  bar docked under the map; season panel as a bottom drawer; "?" tooltips; "Start here" guide.
- Audit at 1280×720 before: season charts squashed to ~20 px, slider over the attribution,
  running text at 10-12 px, three toggle styles, interface green equal to "standing cane".
- Headless Chrome at 1440×900, 1280×720 and 390×844, both sites, EN / ES: 383 checks pass, no
  console errors; weekly report 2 pages on Letter and A4 (both sites, both languages).
- Type-check and build pass in the web container; api suite 110 passed.

## 2026-11-15 00:25 CST

- Explorer simplified to three map views (Harvest map, Radar image, Before / after), one click
  each; every other map control moved under "More options", field charts and numbers beyond
  the HV signal under "More detail". No API, calculation or data change.
- Harvest map: standing `#1b6e35`, harvested `#ffb000`, no date `#d6d6d6` over a dimmed
  basemap; simulated protan / deutan / tritan CIEDE2000 between the two states ≥ 26.
- EN / ES switch for the whole interface; dates day first (21 Dec 2025 / 21 dic 2025).
- Headless Chrome at 1280×720 and 1440×900, both sites and languages, offline and the weekly
  report (2 pages, Letter and A4): 487 checks pass; build passes; api suite 110 passed.

## 2026-11-15 01:25 CST

- Explorer first impression, appearance and motion only (no API, calculation or feature
  change): dark desaturated basemap under light panels; no-date fields a faint fill and thin
  outline; standing / harvested colours kept (simulated CVD CIEDE2000 ≥ 29.9 on the dark map).
- First visit plays the season once (stops at the end or on any input; not on return
  visits, with reduced motion or `?present=1`); the week's harvests light up and fade into amber.
- Timeline draws weekly harvests along the slider and the share of mapped cane; "Season so
  far" block in the side panel; camera fits the cane extent; divider labels placed clear of
  the panel, zoom buttons and credit, with a drag handle and one hint sway.
- Headless Chrome, 1280×720 and 1440×900, both sites and languages: 487 regression and 475
  new checks pass; weekly report 2 pages (Letter, A4); build passes; api suite 110 passed.
- Play frames: the weekly highlight is spread across the whole supply area each week (weekly
  centroid moves 0.5-4 km against an 8-12 km spread), so it reads as a fill-in, not a wave.
