// Types and plain-language helpers for GET /alerts/{site} (docs/API.md).

export type AlertCode = {
  code: string;
  severity: string;
  enabled: boolean;
  params: Record<string, unknown> | null;
  count: number;
  definition: string | null; // the research library's own text (zafra.alerts docstring)
  definition_source: string | null;
};
export type AlertRow = {
  segment_id: string;
  code: string;
  severity: string;
  evidence: Record<string, unknown>;
  harvest_date: string | null;
  area_ha: number | null;
  centroid: [number, number];
};
export type AlertPage = {
  site_id: string;
  source: string;
  library: { commit_short: string } | null;
  codes: AlertCode[];
  code: string | null;
  total: number;
  limit: number;
  offset: number;
  alerts: AlertRow[];
};

export const ALERT_PAGE = 50;
export const ALERT_OUTLINE_COLOR = "#ff2d2d"; // unlike the fill ramp, the reference and the selection colours
export const ALERT_NOTE =
  "Flags for review, not findings of wrongdoing. Satellite fire detections cover only part of the fires.";

// Plain-language names for the library's alert codes (zafra.alerts.CODES).
export const ALERT_LABELS: Record<string, string> = {
  FIRE_ACTIVE_OUTSIDE_HOURS: "Fire outside permitted hours",
  BURN_WITHOUT_HARVEST: "Fire with no harvest after it",
  HARVEST_WITHOUT_FIRE: "Harvest with no fire before it",
  HIGH_DATE_UNCERTAINTY: "Imprecise harvest date",
  RADAR_OPTICAL_DISAGREE: "Radar and optical disagree on cane",
  NO_BASELINE: "Harvest signal, not dated",
};
export const alertLabel = (code: string) => ALERT_LABELS[code] ?? code;

/** First sentence of the library's definition, verbatim, plus the site's rule parameters. */
export function oneLine(c: AlertCode): string {
  if (!c.definition) return "";
  const m = c.definition.match(/^.*?\.(?=\s|$)/);
  const params = Object.entries(c.params ?? {})
    .map(([k, v]) => `${k} = ${v}`)
    .join(", ");
  return (m ? m[0] : c.definition) + (params ? ` (${params})` : "");
}

/** Short evidence line of one alert, from the library's evidence object. */
export function evidenceLine(a: AlertRow): string {
  const e = a.evidence;
  switch (a.code) {
    case "FIRE_ACTIVE_OUTSIDE_HOURS": {
      const win = e.burn_window as [string, string] | undefined;
      return `Fire at ${e.datetime_local}${e.overpass ? ` (${e.overpass} overpass)` : ""}` +
        (win ? `, window ${win[0]}–${win[1]}` : "");
    }
    case "BURN_WITHOUT_HARVEST": {
      const fires = (e.fires as { datetime_local: string }[] | undefined) ?? [];
      return `${fires.length} detection${fires.length === 1 ? "" : "s"}` +
        (fires.length ? `, first ${fires[0].datetime_local.slice(0, 10)}` : "");
    }
    case "HIGH_DATE_UNCERTAINTY":
      return `±${e.date_uncertainty_days} days`;
    case "RADAR_OPTICAL_DISAGREE":
      return typeof e.p_other === "number" ? `${e.other_gate} gate P = ${e.p_other.toFixed(2)}` : "";
    default:
      return "";
  }
}
