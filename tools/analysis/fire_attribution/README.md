# Fire attribution analysis

Reproduces every number of [docs/FINDINGS.md](../../../docs/FINDINGS.md), "Fire detections
cannot be attributed to single fields" (Morelos, 2025-26).

* `extract.sql`, `extract_pairs.sql`: season detections of Morelos, and every (detection, cane
  segment) pair within 750 m with its distance, inside flag and harvest date.
* `extract_segments.sql`: cane segments with their harvest date and first season detection within
  200 m (used only for a check). Adapted: the original read `segments.first_fire_date`, a loader
  column since removed; the same definition is now computed from `fires`.
* `analyse.py`: the analysis (standard library only, fixed seed). It also reads the research
  library's FIRMS CSVs, read-only, to cross-check the day / night split.

Needs the database loaded by `python -m app.loader --site all` with the research library at
`0d6b064`. From the repository root, with `S` a scratch directory outside the repository:

```bash
S=/path/to/scratch
for n in extract extract_pairs extract_segments; do
  docker compose exec -T db psql -U zafra -d zafra -q -f - \
    < tools/analysis/fire_attribution/$n.sql > $S/$n.csv
done
python3 -I tools/analysis/fire_attribution/analyse.py $S /path/to/zafra-radar   # -> $S/results.json
```

Expected: `extract.csv` 1,097 rows, `extract_pairs.csv` 29,440, `extract_segments.csv` 6,014;
`results.json` gives `counts` 1,097 / 673 / 6,014 / 3,976 and 0 first-fire mismatches. It runs in
about 11 s. `fire_id` values change with each load; the results do not. Keep the CSVs and
`results.json` out of the repository.
