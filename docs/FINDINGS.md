# Findings

Results of analyses run on this app's loaded data that changed what the app claims. Each section
says what was tested, the numbers, how to read them and what the app does as a result.

## Fire detections cannot be attributed to single fields

Analysis of 2026-11-14, Morelos, 2025-26 season. Scripts and commands to reproduce every number
below: [`tools/analysis/fire_attribution/`](../tools/analysis/fire_attribution/README.md).

### What was tested

The first "Mill operations" screen listed fields as **burned and not harvested**: a field with a
satellite fire detection (VIIRS, NASA FIRMS) within 200 m and no radar harvest date yet, with
"days since burn" counted from the first detection. That list holds only if a detection near a
field says that this field was burned, shortly before its harvest. Tested:

* **Field-centric**: for each cane segment with a radar harvest date and at least one attributed
  season fire, the difference `harvest_date − fire date` in days (positive: harvest after the
  fire), under four attribution rules: (1) every fire within 200 m, the rule of the screen;
  (2) the fire point inside the polygon; (3) only the single nearest segment within 200 m;
  (4) only the single nearest segment within 100 m. Both the first attributed fire and the
  attributed fire nearest in time to the harvest date.
* **Chance baselines**: (a) *random date*: each segment paired with fire dates drawn at random
  from the season's detections near cane (1,000 repetitions); (b) *within month*, stricter: harvest
  dates shuffled among the segments harvested in the same calendar month, fire dates kept. The
  second keeps the season's timing, so only an alignment finer than a month beats it.
* **Fire-centric**: for each of the 673 season detections within 200 m of a cane segment, whether
  some cane segment within R m has a harvest date in a window around the detection's date; chance
  by shuffling the detection dates among the detection locations, over all dates or only within
  the calendar month (200 repetitions).

Inputs: 6,014 cane segments, 3,976 with a harvest date; 1,097 season detections (2025-11-01 ..
2026-06-01, as the app's season window), 673 of them within 200 m of a cane segment. Distances on
the geography; a detection is dated by its local date (America/Mexico_City). 95 % intervals are
Wilson intervals treating segments or detections as independent; fires and fields are spatially
clustered, so these intervals are optimistic.

### Field-centric rules against both chance baselines

Share of segments whose attributed fire is within ±3 or ±6 days of the harvest date. *Random
date*: one random season detection date per segment (the k-draw variant with as many draws as the
segment has detections gives the same 4.3–4.4 % for the first fire). *Within month*: harvest dates
shuffled within their calendar month.

First attributed fire:

| rule | segments | median (d) | Q1 | Q3 | within ±3 d (95 % CI) | random date | within month | within ±6 d (95 % CI) | random date | within month | fire after harvest | over 14 d |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1. every fire within 200 m (screen rule) | 1,677 | 8 | -3 | 30 | 13.6 % (12.0–15.3) | 4.4 % | 9.9 % | 25.9 % (23.8–28.0) | 8.4 % | 18.1 % | 29.8 % | 40.6 % |
| 2. fire point inside the polygon | 190 | 4 | -2.75 | 20 | 25.3 % (19.6–31.9) | 4.4 % | 13.0 % | 38.4 % (31.8–45.5) | 8.4 % | 24.3 % | 34.2 % | 30.5 % |
| 3. single nearest segment within 200 m | 381 | 4 | -11 | 22 | 16.3 % (12.9–20.3) | 4.4 % | 10.1 % | 28.1 % (23.8–32.8) | 8.5 % | 18.9 % | 39.6 % | 32.3 % |
| 4. single nearest segment within 100 m | 327 | 4 | -9 | 22 | 17.7 % (14.0–22.2) | 4.3 % | 11.0 % | 30.3 % (25.5–35.5) | 8.3 % | 20.3 % | 37.0 % | 32.1 % |

Attributed fire nearest in time to the harvest date (random date: as many draws as the segment
has detections, then the one nearest the harvest date):

| rule | segments | within ±3 d (95 % CI) | random date | within month | within ±6 d (95 % CI) | random date | within month | fire after harvest |
|---|---|---|---|---|---|---|---|---|
| 1. every fire within 200 m (screen rule) | 1,677 | 18.6 % (16.8–20.5) | 7.2 % | 13.6 % | 32.9 % (30.7–35.2) | 13.4 % | 23.8 % | 35.8 % |
| 2. fire point inside the polygon | 190 | 25.3 % (19.6–31.9) | 4.7 % | 13.2 % | 38.9 % (32.3–46.0) | 9.0 % | 24.9 % | 35.3 % |
| 3. single nearest segment within 200 m | 381 | 17.1 % (13.6–21.2) | 5.1 % | 10.7 % | 29.9 % (25.5–34.7) | 9.8 % | 20.0 % | 41.5 % |
| 4. single nearest segment within 100 m | 327 | 18.3 % (14.5–22.9) | 4.8 % | 11.7 % | 32.1 % (27.3–37.4) | 9.4 % | 21.4 % | 38.8 % |

Coverage (all segments, dated or not): rule 1 2,246 segments; rule 2 248; rule 3 545; rule 4 451.
Under one random date, 47.7–50.0 % of the segments get a fire after the harvest and 40.7–43.0 %
one more than 14 days before it.

### Fire-centric matching against both chance baselines

A detection is matched when at least one cane segment within R m has a harvest date from W1 days
before to W2 days after the detection's local date. 673 detections.

| R | window (days) | matched | share (95 % CI) | unmatched | chance, all dates shuffled | chance, within month |
|---|---|---|---|---|---|---|
| 200 m | −3 .. +6 | 291 | 43.2 % (39.5–47.0) | 382 | 15.4 % | 32.0 % |
| 200 m | −6 .. +12 | 343 | 51.0 % (47.2–54.7) | 330 | 23.3 % | 44.3 % |
| 200 m | −3 .. +14 | 342 | 50.8 % (47.0–54.6) | 331 | 22.8 % | 43.9 % |
| 400 m | −3 .. +6 | 372 | 55.3 % (51.5–59.0) | 301 | 28.1 % | 45.8 % |
| 400 m | −6 .. +12 | 424 | 63.0 % (59.3–66.6) | 249 | 39.2 % | 58.1 % |
| 400 m | −3 .. +14 | 417 | 62.0 % (58.2–65.6) | 256 | 38.6 % | 57.7 % |
| 750 m | −3 .. +6 | 443 | 65.8 % (62.2–69.3) | 230 | 45.3 % | 60.1 % |
| 750 m | −6 .. +12 | 492 | 73.1 % (69.6–76.3) | 181 | 57.5 % | 70.8 % |
| 750 m | −3 .. +14 | 489 | 72.7 % (69.2–75.9) | 184 | 56.8 % | 70.4 % |

### Unmatched detections (R = 400 m, −6 .. +12 days)

249 detections, classified in this order (each in the first class that fits):

| class | detections |
|---|---|
| an undated cane segment within 400 m | 217 |
| only segments harvested later (more than 12 days after) | 5 |
| of which all more than 14 days after (part of the row above) | 4 |
| mixed: some earlier, some later, none in the window | 4 |
| only segments harvested earlier (more than 6 days before; burning after harvest?) | 23 |

Ignoring whether an undated segment is also present: dated neighbours all harvested more than 14
days later 68; dated neighbours all harvested more than 6 days earlier 73.

### Day and night (R = 400 m, −6 .. +12 days)

A detection is night-time when its local hour is before 6; the detections fall at 01–03 h and
12–14 h local time, and this split agrees with the FIRMS `daynight` flag for all 673.

| detections | count | matched share (95 % CI) | chance, all dates shuffled |
|---|---|---|---|
| day | 609 | 60.8 % (56.8–64.6) | 38.1 % |
| night | 64 | 84.4 % (73.6–91.3) | 49.3 % |

### Reading

Every rule beats the random-date baseline by a wide margin (rule 1: 13.6 % of segments within ±3
days against 4.4 %), but most of that margin is the shared season: with harvest dates shuffled
only within their calendar month, chance rises to 9.9 %. Against that baseline the fire point
inside the polygon (rule 2) is the clearest, 25.3 % within ±3 days against 13.0 %, about twice
chance, but it covers only 190 dated segments and 34.2 % of its first fires still come after the
harvest date; the screen's 200 m rule is 13.6 % against 9.9 %. Fire-centric matching is above
the within-month chance by only 2–11 points, the margin shrinking as R and the window grow
(R = 200 m, −3 .. +6: 43.2 % against 32.0 %; R = 400 m, −6 .. +12: 63.0 % against 58.1 %), and
217 of the 249 unmatched detections at R = 400 m have an undated cane segment within 400 m, so
the radar's undated fields and the fires cannot be told apart with this data.

Over the season, detections coincide with nearby radar-dated harvests more often than the
season's timing alone would give. For a single field they do not: its attributed fire falls
within ±3 days of its harvest date in only 14–25 % of cases (against 9.9–13.0 % by chance within the
same month), and about a third of the attributed fires come after the field's harvest date.

### What the app claims as a result

The "Mill operations" screen no longer says that any field is burned. Removed: the
burned-and-not-harvested list, its buckets, map colours and CSV export, "days since burn", the
fire-to-harvest statistic, the projected end of the harvest, and the fires-outside-permitted-hours
figure (the permitted window is marked unconfirmed in the research library's configuration).

The screen claims:

* that a field has a radar harvest date (± its uncertainty, with its date confidence), and the
  areas and counts that follow from those dates, using only dates on or before the selected date;
* that a satellite fire was detected at a stated place and time within 200 m of cane, and how
  many cane fields lie within 200 m of it, as context.

It does not claim:

* that a field near a detection was burned, when, or for how long its cane has been burned;
* that a field without a radar harvest date is standing: it is "not yet detected as harvested";
* anything about the order of harvests after the selected date.

The explorer's alert list keeps the research library's fire rules as flags for review, with a
note that a detection within 200 m of a field is often a neighbouring field's.
