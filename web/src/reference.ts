import type { Feature, FeatureCollection, MultiPolygon } from "geojson";
import { formatDate, t, type Lang } from "./i18n";
import { toDay } from "./season";

// GET /reference/{site} (docs/API.md).
export type ReferenceDate = {
  property: string;
  kind: "labelled_window" | "ground_truth" | string;
  date_start: string;
  date_end: string;
  season: string | null;
  event: string | null;
  source: string | null;
  note: string | null;
};
export type OverlapSegment = {
  segment_id: string;
  overlap_share: number;
  harvest_date: string | null;
  date_uncertainty_days: number | null;
};
type SummaryText = { text: string; source: string };
export type ReferenceProps = {
  field_id: string;
  area_ha: number | null;
  hyp: string | null;
  label: string | null;
  municipio?: string | null;
  bbox: [number, number, number, number];
  reference_dates: ReferenceDate[];
  facts: {
    harvest_date?: string | null;
    date_uncertainty_days?: number | null;
    cane_confidence?: string | null;
    status_detail?: string | null;
  } | null;
  summary: { es: SummaryText; en: SummaryText } | null;
  segments: OverlapSegment[];
};
export type ReferenceFeature = Feature<MultiPolygon, ReferenceProps>;
export type ReferenceCollection = FeatureCollection<MultiPolygon, ReferenceProps>;

/** What each kind of reference date is, for the card. */
export function referenceDateLabel(lang: Lang, r: ReferenceDate): string {
  const season = r.season ? t(lang, "zafraSeason", { s: r.season }) : "";
  if (r.kind === "labelled_window") return t(lang, "labelledWindow") + season;
  if (r.kind === "ground_truth") return t(lang, "groundTruth") + season;
  return r.property;
}

/** The reference date as text: one date, or `start → end` for a window. */
export function referenceDateText(lang: Lang, r: ReferenceDate): string {
  const [a, b] = [formatDate(lang, r.date_start), formatDate(lang, r.date_end)];
  return r.date_start === r.date_end ? a : `${a} → ${b}`;
}

/** Radar date minus reference, in days (positive: radar later). For a window, 0 when the
 * radar date is inside it, otherwise the distance to the nearer end. */
export function daysVsReference(radar: string, r: ReferenceDate): number {
  const d = toDay(radar);
  const start = toDay(r.date_start);
  const end = toDay(r.date_end);
  if (d < start) return d - start;
  if (d > end) return d - end;
  return 0;
}

/** True when the reference date overlaps the radar coverage [from, to] (ISO dates), so a
 * radar date can be compared with it. */
export function inCoverage(r: ReferenceDate, from: string, to: string): boolean {
  return r.date_end >= from && r.date_start <= to;
}

export function formatDiff(lang: Lang, days: number, isWindow: boolean): string {
  if (days === 0) return isWindow ? t(lang, "inside") : "0";
  return days > 0 ? `+${days}` : `${days}`;
}
