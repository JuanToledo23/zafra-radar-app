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
