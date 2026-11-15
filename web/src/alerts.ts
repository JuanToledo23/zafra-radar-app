import { formatDate, formatNumber, t, tValue, type Lang } from "./i18n";

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
// Plain-language names of the library's alert codes (zafra.alerts.CODES) are in i18n.ts
// (alert_<code>); the review note above the list is alertNote and alertFireNote there.
export const alertLabel = (lang: Lang, code: string) => tValue(lang, `alert_${code}`, code);
export const severityLabel = (lang: Lang, severity: string) => tValue(lang, `sev_${severity}`, severity);

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
export function evidenceLine(lang: Lang, a: AlertRow): string {
  const e = a.evidence;
  switch (a.code) {
    case "FIRE_ACTIVE_OUTSIDE_HOURS": {
      const win = e.burn_window as [string, string] | undefined;
      const at = String(e.datetime_local);
      return t(lang, "evFire", { t: `${formatDate(lang, at)} ${at.slice(11, 16)}` }) +
        (e.overpass ? t(lang, "evOverpass", { o: String(e.overpass) }) : "") +
        (win ? t(lang, "evWindow", { a: win[0], b: win[1] }) : "");
    }
    case "BURN_WITHOUT_HARVEST": {
      const fires = (e.fires as { datetime_local: string }[] | undefined) ?? [];
      return t(lang, fires.length === 1 ? "evDetOne" : "evDetMany", { n: formatNumber(lang, fires.length) }) +
        (fires.length ? t(lang, "evFirst", { d: formatDate(lang, fires[0].datetime_local) }) : "");
    }
    case "HIGH_DATE_UNCERTAINTY":
      return t(lang, "evDays", { n: String(e.date_uncertainty_days) });
    case "RADAR_OPTICAL_DISAGREE":
      return typeof e.p_other === "number" ? t(lang, "evGate", { g: String(e.other_gate), p: e.p_other.toFixed(2) }) : "";
    default:
      return "";
  }
}
