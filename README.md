Zafra Radar — application built during NASA Space Apps 2026 (Nov 14–15, Zacatepec). Built on top of zafra-radar-research (https://github.com/JuanToledo23/zafra-radar-research), an open-source toolkit published before the event; see AI_USAGE.md.

# Zafra Radar

Map of the sugarcane harvest (*zafra*) from NISAR L-band radar, for Morelos (Mexico) and
a transfer site in Ribeirão Preto (Brazil). PostGIS 16 + FastAPI + React/MapLibre, started
with one command.

## What existed before the event and what was built during it

| Before the event (in zafra-radar-research, MIT, cited as a resource) | During the event (this repo) |
|---|---|
| NISAR readers (GCOV backscatter, GUNW coherence) | Loader from the library's result files into PostGIS |
| Cane / non-cane gate | API (sites, segment tiles, segment detail, weekly, alerts) |
| Harvest-date detector | Map |
| Validation | Field detail |
| Precomputed result files (harvest maps, weekly counts, series, summaries, raster tiles) | Season dashboard |
| Empty product skeleton (compose, empty schema, `/health`, `/version`, sample map), copied into this repo from `v0.1.0` | Alerts |
| | Raster swipe |
| | Site switcher |
| | Deployment |

Disclosure: the library received one commit during the event, 0d6b064 (2026-11-14), which
adds the comparison of detected harvest with official CONADESUCA mill reports. It is
analysis only and does not touch the skeleton. Everything else in the library is in v0.1.0.

The initial scaffold (empty compose/API/map skeleton) was copied from the product/ directory
of zafra-radar-research v0.1.0 (commit 40edf63, tagged 2026-11-11, before the event). The
copy was taken from the library checkout at commit 0d6b064, where product/ is byte-identical
to v0.1.0.

This repo's git history is the record of the work done during the event;
[docs/JOURNAL.md](docs/JOURNAL.md) is the build log.

## Status

What exists right now:

* `docker compose up` starts PostGIS, the API and the web app;
* the database schema (`api/app/schema.sql`) is created on API start;
* the **loader** (`docker compose exec api python -m app.loader --site morelos|brazil|all`)
  fills the schema from the library's result files for both sites (see [DATA.md](DATA.md));
* the **API** serves the loaded data: `/sites`, `/tiles/{site}/{z}/{x}/{y}.pbf` (segment
  vector tiles), `/segments/{site}/{segment_id}` and `/weekly/{site}`, besides `/health`
  and `/version` (see [docs/API.md](docs/API.md));
* the **map** draws the segment vector tiles from the API, with a site select (Morelos /
  Brazil) that refits the map, a weekly time slider with play/pause over the site's harvest
  dates (segments harvested by the slider date coloured by harvest date, the rest standing
  green, undated grey) and the cumulative count of detected harvests from `/weekly`, a
  legend and hover highlight;
* the **field detail panel**: clicking a segment loads `/segments/{site}/{segment_id}` into
  the side panel: area, status and "Zoom to field"; harvest date ± uncertainty, date
  confidence and the optical and radar cane probabilities, HV drop and minimum coherence;
  the field summary with an EN / ES toggle and its source; HV, HH (both orbits) and
  coherence charts on one date axis with the harvest date band and nearby fires; the fire
  list within 200 m and the field's alerts;
* the **season progress panel** ("Season progress" in the header) opens across the bottom of
  the map, from `/sites` and `/weekly/{site}`: cane and dated area and segment counts (and,
  for Morelos, the official mill area and detected area as a share of it); weekly detected
  harvests and VIIRS fires within 200 m of cane on one axis with their Pearson r computed in
  the browser (replaced by a note when the season has fewer than 30 fires in cane); for Morelos, detected vs official cumulative share with the 25/50/75 % levels
  and the 50 % crossing dates. A marker follows the time slider on every chart, and clicking
  a week moves the slider there. "Expand" grows the panel to about 75 % of the window.

The other event features (alerts view, raster swipe, deployment) do not exist yet.

**Planned during the event:** API, map, field detail, season dashboard, alerts, raster
swipe, site switcher, deployment. Build order and estimates:
[HACKATHON_PLAN.md](HACKATHON_PLAN.md).

## Run

```bash
cp .env.example .env          # set ZAFRA_DATA; the database and port defaults are built in
docker compose up --build     # add -d --wait to run in the background until healthy
docker compose exec api python -m app.loader --site all
```

`ZAFRA_DATA` (required) is the host path of a zafra-radar-research checkout; compose mounts
it read-only into the api container at `/zafra-data`. The loader reloads each site in one
transaction, so it can be run again at any time; `--recreate-schema` drops and recreates
the app tables first (needed once when the schema changes). Unit tests for its parsing
functions: `python -m pytest api/tests` (needs pytest and PyYAML); the same command runs
the HTTP tests of the API (`api/tests/test_api.py`), skipped when the API is not reachable.

| Service | URL / port | Notes |
|---|---|---|
| web | http://localhost:5174 | Vite dev server, hot reload (source bind-mounted) |
| api | http://localhost:8010/health, `/version`, `/docs` | FastAPI, reload on save; also proxied at `/api` from the web app |
| db  | localhost:5434 (user/password/db from `.env`) | PostGIS 16-3.4, named volume `pgdata` |

The compose project is named `zafra-radar-app`, so its containers and volume do not collide
with the library's own skeleton stack (`zafra-radar`). Both use the same host ports, so only
one can run at a time.

```bash
docker compose down           # stop, keep the database volume
docker compose down -v        # stop and delete the database volume
```

The API container applies `api/app/schema.sql` on every start (idempotent `CREATE ... IF NOT
EXISTS`); `docker compose exec api python -m app.seed` reapplies it by hand.

## Offline

The stack needs the network only to **build** (base images, pip, npm). Once built, it
starts and the map renders with no network:

* the basemap (Esri World Imagery) is shown only if a probe tile loads; otherwise, or if
  tiles start failing, the map falls back to a plain background with the segment polygons
  ("basemap: offline (plain)" in the header). The style uses no fonts or sprites;
* to check that no container needs egress at runtime:

  ```bash
  docker compose -f docker-compose.yml -f docker-compose.offline.yml up -d --wait
  ```

  puts db/api/web on an `internal` network (no DNS, no internet). A small TCP forwarder
  (`gateway`) publishes ports 5174 and 8010, because Docker does not publish ports of
  containers on internal networks only.

## Notes

* `postgis/postgis:16-3.4` is published for amd64 only; on Apple Silicon it runs under
  emulation (`platform: linux/amd64` in compose).
* Headless check and screenshot: `cd scripts && npm install && node screenshot.mjs
  [--site morelos|brazil] [--at 0..1] [--out file.png] [--offline]` picks the site, moves
  the time slider to that fraction of the season, clicks the segment nearest the centre,
  writes the screenshot (default `docs/skeleton.png`) and prints a JSON report (basemap and
  API state, slider date, harvest count, panel, console errors). `--offline` aborts every
  non-localhost request. Map screenshots: `docs/screenshots/`.
* `web/public/sample.geojson` is no longer drawn; it stays because the web container's
  compose healthcheck fetches it.

## Documentation

* [DATA.md](DATA.md): the input files read from the research library (`ZAFRA_DATA`).
* [docs/API.md](docs/API.md): the API endpoints and their response keys.
* [docs/RESOURCES.md](docs/RESOURCES.md): data, resources and software used.
* [AI_USAGE.md](AI_USAGE.md): how AI was used, in development and in the product.
* [docs/JOURNAL.md](docs/JOURNAL.md): build log of the event.

![skeleton](docs/skeleton.png)

## License

Code: MIT ([LICENSE](LICENSE)).
