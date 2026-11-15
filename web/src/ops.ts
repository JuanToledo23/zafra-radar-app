import type { ExpressionSpecification } from "maplibre-gl";

// Types and map colours of the mill operations screen: GET /ops/{site} and its lists
// (docs/API.md). Days are integers counted from 1970-01-01, as in season.ts and the ops
// tiles' harvest_day, which carry only the harvest dates on or before the screen's date.

type Count = { segments: number; area_ha: number };
type Window = Count & { from: string; to: string };
export type OpsBrief = {
  site_id: string;
  as_of: string;
  season: { name: string; start: string; end_exclusive: string; source: string };
  cane: Count;
  harvested: Count & { share_of_cane_area: number | null };
  harvested_last_7_days: Window;
  harvested_previous_7_days: Window;
  pace: { ha_per_week: number; weeks: { start: string; end: string; area_ha: number }[] };
  not_yet_detected: Count & { share_of_cane_area: number | null };
  // Absent for a site without official weekly data; null before its first report.
  cane_tonnage_estimate?: {
    label: string;
    tonnes: number;
    yield_t_ha: number;
    official_cutoff: string;
    source: string;
  } | null;
  official?: {
    report: number;
    cutoff: string;
    official_harvested_ha: number;
    detected_harvested_ha: number;
    detected_share_of_official: number;
  } | null;
};
type Page<R> = { as_of: string; total: number; limit: number; offset: number; rows: R[] };
export type HarvestedRow = {
  segment_id: string;
  harvest_date: string;
  date_uncertainty_days: number | null;
  date_confidence: string | null;
  area_ha: number;
  tonnes_estimate: number | null;
  centroid: [number, number];
};
export type HarvestedPage = Page<HarvestedRow> & { days: number; from: string; to: string };
export type NotDetectedRow = { segment_id: string; area_ha: number; centroid: [number, number] };
export type NotDetectedPage = Page<NotDetectedRow>;
export type FireRow = {
  datetime_local: string;
  frp: number | null;
  confidence: string | null;
  satellite: string | null;
  cane_segments_within_200m: number;
  lon: number;
  lat: number;
};
export type OpsFires = {
  from: string;
  to: string;
  fire_buffer_m: number;
  detections: number;
  night: number;
  night_before_hour: number;
  rows: FireRow[];
};

// GET /ops/{site}/series: the weekly report's charts, up to the date.
export type OpsSeries = {
  as_of: string;
  weeks: { start: string; end: string; partial: boolean; segments: number; area_ha: number }[];
  official?: { report: number; cutoff: string; official_cum_ha: number; detected_cum_ha: number }[];
};

export type ListDays = 7 | 14;
export const LIST_DAYS: ListDays[] = [7, 14];
export const OPS_PAGE = 50;
// Repository copy of the findings document (docs/FINDINGS.md).
export const REPO_URL = "https://github.com/JuanToledo23/zafra-radar-app";
export const FINDINGS_URL = `${REPO_URL}/blob/main/docs/FINDINGS.md`;
export const LIBRARY_URL = "https://github.com/JuanToledo23/zafra-radar-research";

// Harvested in the window: dark orange; harvested earlier: muted grey; not yet detected as
// harvested: green. They differ in lightness too, so they stay apart with the common forms
// of colour blindness; fire detections are points, not polygons.
export const RECENT_COLOR = "#c2410c";
export const EARLIER_COLOR = "#a0a0a0";
export const NOT_DETECTED_COLOR = "#4d9a4d";
export const FIRE_COLOR = "#ffd400";
const RECENT_OPACITY = 0.9;
const EARLIER_OPACITY = 0.3;
const NOT_DETECTED_OPACITY = 0.45;

/** Season label: "2025-26" -> "2025/26". */
export const seasonLabel = (season: string) => season.replace("-", "/");

/** Harvested on or before `day`, and in the `days` days up to it. The ops tiles of `day`
 * carry harvest_day only <= day; the test on `day` also covers the tiles of an earlier date
 * still drawn while the new ones load. */
const harvestedBy = (day: number): ExpressionSpecification => ["all", ["has", "harvest_day"], ["<=", ["get", "harvest_day"], day]];
const recentAt = (day: number, days: ListDays): ExpressionSpecification => ["all", harvestedBy(day), [">", ["get", "harvest_day"], day - days]];

export function opsColorExpression(day: number, days: ListDays): ExpressionSpecification {
  return ["case", recentAt(day, days), RECENT_COLOR, harvestedBy(day), EARLIER_COLOR, NOT_DETECTED_COLOR];
}

export function opsOpacityExpression(day: number, days: ListDays): ExpressionSpecification {
  return ["case", recentAt(day, days), RECENT_OPACITY, harvestedBy(day), EARLIER_OPACITY, NOT_DETECTED_OPACITY];
}
