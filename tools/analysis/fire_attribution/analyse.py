"""Fire attribution analysis, Morelos (read-only). Inputs: the three CSVs written by
extract*.sql (psql \\copy) and, for a day/night cross-check only, the library's FIRMS CSVs
(opened read-only). Output: results.json in the same directory. Standard library only.

    python3 -I analyse.py <dir with the CSVs> <library root>
"""

import csv
import datetime as dt
import json
import random
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

D, LIB = Path(sys.argv[1]), Path(sys.argv[2])
SEED = 20261114
REPS_B, REPS_C = 1000, 200
day = dt.date.fromisoformat

# --- inputs -------------------------------------------------------------------------------
fires = {}
for r in csv.DictReader((D / "extract.csv").open()):
    t = dt.datetime.fromisoformat(r["datetime_local"])
    fires[int(r["fire_id"])] = {
        "date": day(r["fire_date"]), "conf": r["confidence"], "hour": t.hour,
        # VIIRS overpasses here are about 01:30 and 13:30 local; hours seen: 1-3 and 12-14.
        "night": t.hour < 6, "month": r["fire_date"][:7],
        "lat": float(r["lat"]), "lon": float(r["lon"]),
    }
pairs = defaultdict(list)  # fire_id -> [(dist_m, segment_id, inside, harvest_date|None)]
for r in csv.DictReader((D / "extract_pairs.csv").open()):
    pairs[int(r["fire_id"])].append((float(r["dist_m"]), r["segment_id"], r["inside"] == "t",
                                     day(r["harvest_date"]) if r["harvest_date"] else None))
segs = {r["segment_id"]: (day(r["harvest_date"]) if r["harvest_date"] else None,
                          day(r["first_fire_date"]) if r["first_fire_date"] else None)
        for r in csv.DictReader((D / "extract_segments.csv").open())}
hd = {s: v[0] for s, v in segs.items()}

# --- A. field-centric attribution ---------------------------------------------------------
def attribute(rule):
    """segment_id -> list of attributed fire dates (one per detection) under `rule`."""
    out = defaultdict(list)
    for fid, ps in pairs.items():
        if rule == "r1_within_200":
            chosen = [p for p in ps if p[0] <= 200]
        elif rule == "r2_inside":
            chosen = [p for p in ps if p[2]]
        else:
            lim = 200 if rule == "r3_nearest_200" else 100
            near = sorted((p for p in ps if p[0] <= lim), key=lambda p: (p[0], p[1]))
            chosen = near[:1]  # single nearest; ties -> lowest segment_id
        for p in chosen:
            out[p[1]].append(fires[fid]["date"])
    return out


def stats(diffs):
    n = len(diffs)
    q1, med, q3 = statistics.quantiles(diffs, n=4, method="inclusive")
    return {"n": n, "median": med, "q1": q1, "q3": q3,
            "within_3": sum(abs(x) <= 3 for x in diffs) / n,
            "within_6": sum(abs(x) <= 6 for x in diffs) / n,
            "negative": sum(x < 0 for x in diffs) / n,
            "over_14": sum(x > 14 for x in diffs) / n}


def nearest_in_time(h, dates):
    """Fire date nearest to the harvest date h; a tie goes to the earlier fire."""
    return min(dates, key=lambda f: (abs((h - f).days), f))


RULES = ["r1_within_200", "r2_inside", "r3_nearest_200", "r4_nearest_100"]
A, attributed = {}, {}
for rule in RULES:
    att = {s: v for s, v in attribute(rule).items() if hd[s] is not None}
    attributed[rule] = att
    first = [(hd[s] - min(v)).days for s, v in att.items()]
    near = [(hd[s] - nearest_in_time(hd[s], v)).days for s, v in att.items()]
    A[rule] = {"first_fire": stats(first), "nearest_in_time": stats(near),
               "segments_with_fire_any_date_status": len(attribute(rule)),
               "fires_attributed": sum(len(v) for v in attribute(rule).values())}

# Check: rule 1's first fire equals the loader's segments.first_fire_date everywhere.
r1 = attribute("r1_within_200")
check_first = sum((min(r1[s]) if s in r1 else None) != segs[s][1] for s in segs)

# --- B. chance baseline -------------------------------------------------------------------
near_cane = [fid for fid, ps in pairs.items() if any(p[0] <= 200 for p in ps)]
POOLS = {"season_fires_within_200m_of_cane": [fires[f]["date"] for f in near_cane],
         "all_season_fires": [f["date"] for f in fires.values()]}


def chance(att, pool, mode, rng):
    w3 = w6 = neg = o14 = 0.0
    for _ in range(REPS_B):
        a = b = c = e = 0
        for s, v in att.items():
            h = hd[s]
            if mode == "single":
                f = rng.choice(pool)
            else:
                draws = [rng.choice(pool) for _ in v]  # as many draws as attributed detections
                f = min(draws) if mode == "k_first" else nearest_in_time(h, draws)
            x = (h - f).days
            a += abs(x) <= 3
            b += abs(x) <= 6
            c += x < 0
            e += x > 14
        n = len(att)
        w3 += a / n; w6 += b / n; neg += c / n; o14 += e / n
    return {"within_3": w3 / REPS_B, "within_6": w6 / REPS_B, "negative": neg / REPS_B,
            "over_14": o14 / REPS_B}


B = {}
for rule in RULES:
    B[rule] = {}
    for pname, pool in POOLS.items():
        for mode in ("single", "k_first", "k_nearest"):
            if pname == "all_season_fires" and mode != "single":
                continue
            B[rule][f"{pname}/{mode}"] = chance(attributed[rule], pool, mode, random.Random(SEED))

# B2 (extra, stricter): harvest dates permuted among each rule's dated attributed segments
# harvested in the same calendar month; fire dates fixed. Keeps the season's timing, so only
# a field-specific alignment finer than a month can beat it.
def month_shuffle(att, rng):
    by_month = defaultdict(list)
    for s_ in att:
        by_month[hd[s_].strftime("%Y-%m")].append(s_)
    acc = Counter()
    for _ in range(REPS_B):
        fake = {}
        for ids in by_month.values():
            hs = [hd[x] for x in ids]
            rng.shuffle(hs)
            fake.update(zip(ids, hs))
        n = len(att)
        for mode in ("first", "nearest"):
            xs = [(fake[x] - (min(v) if mode == "first" else nearest_in_time(fake[x], v))).days
                  for x, v in att.items()]
            acc[f"{mode}/within_3"] += sum(abs(x) <= 3 for x in xs) / n
            acc[f"{mode}/within_6"] += sum(abs(x) <= 6 for x in xs) / n
    return {k: v / REPS_B for k, v in acc.items()}


B2 = {rule: month_shuffle(attributed[rule], random.Random(SEED)) for rule in RULES}

# --- C. fire-centric matching -------------------------------------------------------------
RADII = [200, 400, 750]
WINDOWS = [(3, 6), (6, 12), (3, 14)]  # (days before the fire, days after)
cand = {R: {f: [p[3] for p in pairs[f] if p[0] <= R] for f in near_cane} for R in RADII}


def matched(fdate, hds, w):
    return any(h is not None and -w[0] <= (h - fdate).days <= w[1] for h in hds)


def match_share(dates, R, w, subset=None):
    ids = subset if subset is not None else near_cane
    m = sum(matched(dates[f], cand[R][f], w) for f in ids)
    return m, len(ids) - m


fdate = {f: fires[f]["date"] for f in near_cane}
C = {}
for R in RADII:
    for w in WINDOWS:
        m, u = match_share(fdate, R, w)
        C[f"R{R} ({-w[0]:+d},{w[1]:+d})"] = {"fires": len(near_cane), "matched": m,
                                             "share": m / len(near_cane), "unmatched": u}

# Chance: fire dates permuted among the fire locations.
rng = random.Random(SEED)
acc = defaultdict(float)
for _ in range(REPS_C):
    perm = [fdate[f] for f in near_cane]
    rng.shuffle(perm)
    pd_ = dict(zip(near_cane, perm))
    for R in RADII:
        for w in WINDOWS:
            acc[f"R{R} ({-w[0]:+d},{w[1]:+d})"] += match_share(pd_, R, w)[0] / len(near_cane)
for k in C:
    C[k]["chance_share"] = acc[k] / REPS_C

# C2 (extra, stricter): fire dates permuted among the fires of the same calendar month.
rng = random.Random(SEED)
acc = defaultdict(float)
by_month = defaultdict(list)
for f in near_cane:
    by_month[fires[f]["month"]].append(f)
for _ in range(REPS_C):
    pd_ = {}
    for ids in by_month.values():
        ds = [fdate[f] for f in ids]
        rng.shuffle(ds)
        pd_.update(zip(ids, ds))
    for R in RADII:
        for w in WINDOWS:
            acc[f"R{R} ({-w[0]:+d},{w[1]:+d})"] += match_share(pd_, R, w)[0] / len(near_cane)
for k in C:
    C[k]["chance_share_within_month"] = acc[k] / REPS_C

# Unmatched at R = 400, (-6, +12): exhaustive partition.
W, R = (6, 12), 400
part = Counter()
overlap = Counter()
for f in near_cane:
    hs = cand[R][f]
    if matched(fdate[f], hs, W):
        continue
    dated = [(h - fdate[f]).days for h in hs if h is not None]
    undated = any(h is None for h in hs)
    if dated and all(x > 14 for x in dated):
        overlap["dated_neighbours_all_later_than_14"] += 1
    if dated and all(x < -6 for x in dated):
        overlap["dated_neighbours_all_earlier"] += 1
    if undated:
        overlap["has_undated_within_400"] += 1
        part["has an undated segment within 400 m"] += 1
    elif all(x > W[1] for x in dated):
        part["only later segments (> +12 d)"] += 1
        if all(x > 14 for x in dated):
            part["  of which all > +14 d"] += 1
    elif all(x < -W[0] for x in dated):
        part["only earlier segments (< -6 d; burning after harvest?)"] += 1
    else:
        part["mixed: some earlier, some later, none in the window"] += 1
C_unmatched = {"partition": dict(part), "overlapping_counts": dict(overlap)}

# --- D. sensitivity of the headline (R = 400, -6 .. +12) ----------------------------------
def strat(key, within_month=False):
    groups = defaultdict(list)
    for f in near_cane:
        groups[key(fires[f])].append(f)
    out = {g: {"fires": len(ids), "share": match_share(fdate, R, W, ids)[0] / len(ids)}
           for g, ids in sorted(groups.items())}
    rng = random.Random(SEED)
    acc = defaultdict(float)
    for _ in range(REPS_C):
        if within_month:
            pd_ = {}
            for ids in groups.values():
                ds = [fdate[f] for f in ids]
                rng.shuffle(ds)
                pd_.update(zip(ids, ds))
        else:
            perm = [fdate[f] for f in near_cane]
            rng.shuffle(perm)
            pd_ = dict(zip(near_cane, perm))
        for g, ids in groups.items():
            acc[g] += match_share(pd_, R, W, ids)[0] / len(ids)
    for g in out:
        out[g]["chance_share"] = acc[g] / REPS_C
    return out


DD = {"confidence": strat(lambda x: x["conf"]),
      "day_night": strat(lambda x: "night" if x["night"] else "day"),
      "month": strat(lambda x: x["month"], within_month=True)}

# Day/night cross-check against the FIRMS `daynight` column (library files, read-only).
key = {}
for p in sorted((LIB / "data/firms").glob("*.csv")):
    with p.open(newline="") as fh:
        for r in csv.DictReader(fh):
            key[(round(float(r["latitude"]), 5), round(float(r["longitude"]), 5), r["acq_date"])] = r["daynight"]
agree = disagree = missing = 0
for f in near_cane:
    x = fires[f]
    # acq_date is UTC; a night overpass at 01-03 local is 07-09 UTC the same day, a day one
    # at 12-14 local is 18-20 UTC the same day, so the local date equals the UTC date here.
    k = key.get((round(x["lat"], 5), round(x["lon"], 5), x["date"].isoformat()))
    if k is None:
        missing += 1
    elif (k == "N") == x["night"]:
        agree += 1
    else:
        disagree += 1

json.dump({"A": A, "A_check_rule1_first_fire_mismatches": check_first, "B": B, "B2_within_month": B2, "C": C,
           "C_unmatched_R400_w6_12": C_unmatched, "D": DD,
           "daynight_check": {"agree": agree, "disagree": disagree, "missing": missing},
           "counts": {"season_fires": len(fires), "season_fires_within_200m_of_cane": len(near_cane),
                      "segments": len(segs), "dated_segments": sum(h is not None for h in hd.values())},
           "seed": SEED, "reps": {"B": REPS_B, "C_D": REPS_C}},
          (D / "results.json").open("w"), indent=1, default=str)
print("ok")
