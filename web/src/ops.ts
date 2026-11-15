import type { ExpressionSpecification } from "maplibre-gl";

// Types and map colours of the mill operations screen: GET /ops/{site} and
// /ops/{site}/burned (docs/API.md). Days are integers counted from 1970-01-01, as in
// season.ts and the tiles' harvest_day / first_fire_day.

export type BucketKey = "0_2" | "3_7" | "8_14" | "over_14";
export const BUCKET_KEYS: BucketKey[] = ["0_2", "3_7", "8_14", "over_14"];
// Lowest day of each bucket after the first, for a MapLibre `step` (same edges as app.ops).
const BUCKET_STEPS = [3, 8, 15];

// Light to dark (inferno-like): the lightness alone orders the buckets, so they stay apart
// with the common forms of colour blindness and in greyscale. The table also names each
// bucket and shows 1-4 pips, so nothing depends on colour.
export const BUCKET_COLORS: Record<BucketKey, string> = {
  "0_2": "#f6d746",
  "3_7": "#f98c0a",
  "8_14": "#c73e4c",
  over_14: "#5c126e",
};
export const MUTED_COLOR = "#a0a0a0";
export const MUTED_OPACITY = 0.25;
export const BURNED_OPACITY = 0.9;

type Count = { segments: number; area_ha: number };
export type OpsBucket = Count & { bucket: BucketKey; min_days: number; max_days: number | null };
export type OpsBrief = {
  site_id: string;
  as_of: string;
  season: { name: string; start: string; end_exclusive: string; source: string };
  cane: Count;
  harvested: Count & { share_of_cane_area: number | null };
  harvested_last_7_days: Count & { from: string; to: string };
  not_yet_harvested: Count;
  no_date_detected: Count;
  pace: { ha_per_week: number; weeks: { start: string; end: string; area_ha: number }[] };
  projected_end: string | null;
  burned_not_harvested: Count & { no_date_segments: number; buckets: OpsBucket[] };
  fires_outside_hours_last_7_days: {
    from: string;
    to: string;
    burn_window: [string, string];
    window_confirmed: boolean;
    detections: number;
    segments: number;
  } | null;
  cane_tonnage_estimate?: { label: string; tonnes: number; field_yield_t_ha: number; source: string };
};
export type BurnedRow = {
  segment_id: string;
  area_ha: number;
  first_fire_date: string;
  last_fire_date: string;
  days_since_burn: number;
  bucket: BucketKey;
  harvest_date: string | null;
  date_uncertainty_days: number | null;
  centroid: [number, number];
};
export type BurnedPage = { as_of: string; bucket: BucketKey | null; total: number; rows: BurnedRow[] };

export const BURNED_PAGE = 50;
// The legal freshness reference is Mexican law (LDSCA art. 73, fr. II, quoted in the
// research library's docs/REFERENCES.md:151): shown for the Mexican site only.
export const LEGAL_REFERENCE_SITES = ["morelos"];

/** Season label: "2025-26" -> "2025/26". */
export const seasonLabel = (season: string) => season.replace("-", "/");

/** Bucket pips (1-4 filled of 4), so the bucket reads without colour. */
export const pips = (b: BucketKey) => {
  const n = BUCKET_KEYS.indexOf(b) + 1;
  return "▮".repeat(n) + "▯".repeat(BUCKET_KEYS.length - n);
};

/** Burned and not harvested at `day` (null properties are absent from vector tiles). With
 * `bucket`, only the fields of that bucket. */
function burnedAt(day: number, bucket: BucketKey | null): ExpressionSpecification {
  const days: ExpressionSpecification = ["-", day, ["get", "first_fire_day"]];
  const conds: ExpressionSpecification[] = [
    ["has", "first_fire_day"],
    ["<=", ["get", "first_fire_day"], day],
    ["any", ["!", ["has", "harvest_day"]], [">", ["get", "harvest_day"], day]],
  ];
  if (bucket) {
    const i = BUCKET_KEYS.indexOf(bucket);
    if (i > 0) conds.push([">=", days, BUCKET_STEPS[i - 1]]);
    if (i < BUCKET_STEPS.length) conds.push(["<", days, BUCKET_STEPS[i]]);
  }
  return ["all", ...conds] as ExpressionSpecification;
}

export function opsColorExpression(day: number, bucket: BucketKey | null): ExpressionSpecification {
  const step = ["step", ["-", day, ["get", "first_fire_day"]], BUCKET_COLORS["0_2"],
    BUCKET_STEPS[0], BUCKET_COLORS["3_7"], BUCKET_STEPS[1], BUCKET_COLORS["8_14"], BUCKET_STEPS[2],
    BUCKET_COLORS.over_14] as ExpressionSpecification;
  return ["case", burnedAt(day, bucket), step, MUTED_COLOR] as ExpressionSpecification;
}

export function opsOpacityExpression(day: number, bucket: BucketKey | null): ExpressionSpecification {
  return ["case", burnedAt(day, bucket), BURNED_OPACITY, MUTED_OPACITY] as ExpressionSpecification;
}
