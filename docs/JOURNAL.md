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
