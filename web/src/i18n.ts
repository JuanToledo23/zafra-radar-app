// EN / ES text of the mill operations screen (the explorer stays in English). Spanish uses
// the terms of a Mexican mill's field department: zafra, corte, quema, caña en pie, parcela.

export type Lang = "en" | "es";
export const LANGS: Lang[] = ["en", "es"];
export const LOCALE: Record<Lang, string> = { en: "en-US", es: "es-MX" };

const EN = {
  replay: "Season replay {season} · data as of {date}",
  notLive: "Replay, not live",
  timing:
    "Only what was known on this date: radar harvest dates on or before it (the radar dates a harvest after its next pass) and fire detections on or before it.",
  prevWeek: "Previous week",
  nextWeek: "Next week",
  asOf: "Data as of",
  language: "Language",
  loading: "Loading…",
  loadError: "Could not load: {msg}",
  field: "field",
  fields: "fields",
  detection: "detection",
  detections: "detections",
  caneArea: "Cane area",
  harvested: "Harvested to date",
  ofCane: "of cane area",
  last7: "Harvested, last 7 days",
  last7Note: "{from} – {to} · {fields}",
  prev7: "7 days before: {ha} · {fields}",
  pace: "Harvest pace",
  paceUnit: "ha / week",
  paceNote: "mean of the last 3 full weeks ({from} – {to})",
  notDetected: "Not yet detected as harvested",
  notDetectedNote: "cane area minus harvested to date",
  tonnage: "Cane harvested (estimate)",
  tonnageNote: "estimate: harvested area × {yield} t/ha, the official mean field yield to the mill report of {date}",
  tonnageNone: "no official mill report by this date",
  official: "Mill's official harvested area",
  officialNote: "report to {date} · detected by radar to the same date: {ha} ({pct} % of it)",
  officialNone: "no official mill report by this date",
  radarNote: "The radar does not date every harvested field, so the detected area stays below the official one.",
  tabHarvested: "Harvested this week",
  tabNotDetected: "Not yet detected as harvested",
  tabFires: "Fire detections (context)",
  days7: "Last 7 days",
  days14: "Last 14 days",
  harvestedHelp:
    "Fields with a radar harvest date in the last {days} days up to this date, most recent first. A list to reconcile with the mill's own delivery records.",
  notDetectedHelp:
    "Cane fields with no radar harvest date on or before this date, largest first. Some of them were harvested and not dated by the radar.",
  fireText:
    "Satellite fire detections near cane, for context. The satellites pass at about 02:00 and 14:00 local time, so burns between passes are not seen. A detection is not attributed to any field.",
  fireSummary: "{n} within {m} m of cane in the last 7 days ({from} – {to}); {night} of them at night (before 06:00).",
  exportList: "Export list (CSV)",
  exportLedger: "Export field ledger (CSV)",
  colField: "Field",
  colArea: "Area (ha)",
  colHarvestDate: "Harvest date",
  colConfidence: "Date confidence",
  colTonnes: "Cane (t, est.)",
  colTime: "Local date and time",
  colFrp: "FRP (MW)",
  colFireConfidence: "Confidence",
  colNearby: "Cane fields within 200 m",
  conf_high: "high",
  conf_medium: "medium",
  conf_low: "low",
  conf_uncertain: "uncertain",
  fire_h: "high",
  fire_n: "nominal",
  fire_l: "low",
  rowsShown: "{shown} of {total}",
  loadMore: "Load more ({n} left)",
  emptyHarvested: "No field with a harvest date in this window.",
  emptyNotDetected: "Every cane field has a harvest date on or before this date.",
  emptyFires: "No fire detection within 200 m of cane in these 7 days.",
  mapRecent: "Harvested in the last {days} days",
  mapEarlier: "Harvested earlier",
  mapNotDetected: "Not yet detected as harvested",
  mapFire: "Fire detection, last 7 days (not attributed)",
  // site names by site_id (siteName); a site without one shows its config name
  site_morelos: "Ingenio Emiliano Zapata supply area, Morelos, Mexico (training site)",
  site_brazil: "Ribeirão Preto, São Paulo, Brazil (Jardinópolis / Sales Oliveira; transfer test, no retraining)",
  // weekly report (WeeklyReport.tsx)
  weeklyReport: "Weekly report",
  print: "Print / Save as PDF",
  reportTitle: "Weekly field report",
  weekEnding: "Week ending {date}",
  seasonReplay: "Season replay {season}",
  reportSeason: "Season {season}",
  keyNumbers: "Key numbers",
  vsPrev7: "7 days before: {ha}",
  chartWeekly: "Detected harvest area per week (ha)",
  chartWeeklyNote: "Monday–Sunday weeks, up to the report date.",
  chartWeeklyPartial: "The last week counts only up to {date} (lighter bar).",
  chartCumulative: "Cumulative harvested area (ha)",
  chartCumulativeNote: "At each official weekly cut-off (Saturday) up to {date}.",
  seriesDetected: "Detected (radar)",
  seriesOfficial: "Official (mill reports)",
  reportHarvested: "Harvested this week",
  reportHarvestedNote: "{shown} largest of {total} with a radar harvest date from {from} to {to}.",
  reportMoreCsv: "{n} more in the CSV export (“Export list” on the screen, last 7 days).",
  reportNotDetectedNote: "{fields}, {ha} ({pct} of cane area). The {shown} largest:",
  reportNoneMore: "All are listed.",
  reportFires: "Fire detections near cane, last 7 days",
  colDate: "Local date",
  colDetections: "Detections",
  colNight: "At night",
  colMaxFrp: "Max FRP (MW)",
  methodTitle: "Method and limits",
  methodRadar:
    "Harvest dates come from NISAR L-band radar: a field is dated between the last pass that saw it standing and the first that saw it cut, so a harvest is known only after the next pass.",
  methodNotEvery:
    "The radar does not date every harvested field: “not yet detected as harvested” includes fields already cut, and the detected area stays below the mill's.",
  methodErrorMorelos:
    "Date error, from the research library's validation (docs/VALIDATION.md): on 26 labelled cane fields, out of fold, the delivered dates have a median absolute error of 3.5 days against Sentinel-2 NDVI harvest windows, 24 of 26 within ±12 days. The references are optical windows 2–10 days wide, not field visits, and the library calls these errors optimistic.",
  methodErrorBrazil:
    "Date error, from the research library's validation (docs/VALIDATION.md): on a sample of 40 dated segments, the dates have a median absolute error of 2.5 days against an NDVI rule, 37 of 40 within ±12 days. The reference is optical, not field visits.",
  methodErrorNone: "No date validation is recorded for this site in the research library.",
  methodLinks: "Fire-attribution analysis: {findings}. Research library: {library}.",
  generated: "Generated {ts}",
};
export type Key = keyof typeof EN;

const ES: Record<Key, string> = {
  replay: "Repetición de la zafra {season} · datos al {date}",
  notLive: "Repetición, no en tiempo real",
  timing:
    "Solo lo que se sabía en esta fecha: fechas de corte por radar en esta fecha o antes (el radar fecha un corte en su siguiente paso) y detecciones de fuego en esta fecha o antes.",
  prevWeek: "Semana anterior",
  nextWeek: "Semana siguiente",
  asOf: "Datos al",
  language: "Idioma",
  loading: "Cargando…",
  loadError: "No se pudo cargar: {msg}",
  field: "parcela",
  fields: "parcelas",
  detection: "detección",
  detections: "detecciones",
  caneArea: "Superficie de caña",
  harvested: "Cortada a la fecha",
  ofCane: "de la superficie de caña",
  last7: "Cortada, últimos 7 días",
  last7Note: "{from} – {to} · {fields}",
  prev7: "7 días anteriores: {ha} · {fields}",
  pace: "Ritmo de corte",
  paceUnit: "ha / semana",
  paceNote: "promedio de las últimas 3 semanas completas ({from} – {to})",
  notDetected: "Aún sin corte detectado",
  notDetectedNote: "superficie de caña menos la cortada a la fecha",
  tonnage: "Caña cortada (estimación)",
  tonnageNote:
    "estimación: superficie cortada × {yield} t/ha, el rendimiento de campo oficial promedio al reporte del ingenio del {date}",
  tonnageNone: "sin reporte oficial del ingenio a esta fecha",
  official: "Superficie cosechada oficial del ingenio",
  officialNote: "reporte al {date} · detectada por radar a la misma fecha: {ha} ({pct} % de ella)",
  officialNone: "sin reporte oficial del ingenio a esta fecha",
  radarNote: "El radar no fecha todas las parcelas cortadas, por eso la superficie detectada queda debajo de la oficial.",
  tabHarvested: "Cortadas esta semana",
  tabNotDetected: "Aún sin corte detectado",
  tabFires: "Detecciones de fuego (contexto)",
  days7: "Últimos 7 días",
  days14: "Últimos 14 días",
  harvestedHelp:
    "Parcelas con fecha de corte por radar en los últimos {days} días hasta esta fecha, las más recientes primero. Una lista para conciliar con los registros de entrega de caña del propio ingenio.",
  notDetectedHelp:
    "Parcelas de caña sin fecha de corte por radar en esta fecha o antes, las más grandes primero. Algunas se cortaron y el radar no las fechó.",
  fireText:
    "Detecciones satelitales de fuego cerca de la caña, como contexto. Los satélites pasan hacia las 02:00 y las 14:00 hora local, así que las quemas entre pasos no se ven. Ninguna detección se atribuye a una parcela.",
  fireSummary: "{n} a {m} m o menos de caña en los últimos 7 días ({from} – {to}); {night} de ellas de noche (antes de las 06:00).",
  exportList: "Exportar lista (CSV)",
  exportLedger: "Exportar relación de parcelas (CSV)",
  colField: "Parcela",
  colArea: "Superficie (ha)",
  colHarvestDate: "Fecha de corte",
  colConfidence: "Confianza de la fecha",
  colTonnes: "Caña (t, estim.)",
  colTime: "Fecha y hora local",
  colFrp: "FRP (MW)",
  colFireConfidence: "Confianza",
  colNearby: "Parcelas de caña a 200 m o menos",
  conf_high: "alta",
  conf_medium: "media",
  conf_low: "baja",
  conf_uncertain: "incierta",
  fire_h: "alta",
  fire_n: "nominal",
  fire_l: "baja",
  rowsShown: "{shown} de {total}",
  loadMore: "Cargar más (faltan {n})",
  emptyHarvested: "Ninguna parcela con fecha de corte en este periodo.",
  emptyNotDetected: "Todas las parcelas de caña tienen fecha de corte en esta fecha o antes.",
  emptyFires: "Ninguna detección de fuego a 200 m o menos de caña en estos 7 días.",
  mapRecent: "Cortadas en los últimos {days} días",
  mapEarlier: "Cortadas antes",
  mapNotDetected: "Aún sin corte detectado",
  mapFire: "Detección de fuego, últimos 7 días (sin atribuir)",
  site_morelos: "Zona de abastecimiento del Ingenio Emiliano Zapata, Morelos, México (sitio de entrenamiento)",
  site_brazil: "Ribeirão Preto, São Paulo, Brasil (Jardinópolis / Sales Oliveira; prueba de transferencia, sin reentrenar)",
  weeklyReport: "Reporte semanal",
  print: "Imprimir / Guardar como PDF",
  reportTitle: "Reporte semanal de campo",
  weekEnding: "Semana al {date}",
  seasonReplay: "Repetición de la zafra {season}",
  reportSeason: "Zafra {season}",
  keyNumbers: "Cifras clave",
  vsPrev7: "7 días anteriores: {ha}",
  chartWeekly: "Superficie con corte detectado por semana (ha)",
  chartWeeklyNote: "Semanas de lunes a domingo, hasta la fecha del reporte.",
  chartWeeklyPartial: "La última semana cuenta solo hasta el {date} (barra más clara).",
  chartCumulative: "Superficie cortada acumulada (ha)",
  chartCumulativeNote: "En cada corte semanal oficial (sábado) hasta el {date}.",
  seriesDetected: "Detectada (radar)",
  seriesOfficial: "Oficial (reportes del ingenio)",
  reportHarvested: "Cortadas esta semana",
  reportHarvestedNote: "Las {shown} más grandes de {total} con fecha de corte por radar del {from} al {to}.",
  reportMoreCsv: "{n} más en la exportación CSV (“Exportar lista” en la pantalla, últimos 7 días).",
  reportNotDetectedNote: "{fields}, {ha} ({pct} de la superficie de caña). Las {shown} más grandes:",
  reportNoneMore: "Están todas en la lista.",
  reportFires: "Detecciones de fuego cerca de la caña, últimos 7 días",
  colDate: "Fecha local",
  colDetections: "Detecciones",
  colNight: "De noche",
  colMaxFrp: "FRP máx. (MW)",
  methodTitle: "Método y límites",
  methodRadar:
    "Las fechas de corte vienen del radar NISAR de banda L: una parcela se fecha entre el último paso que la vio en pie y el primero que la vio cortada, así que un corte se conoce hasta el paso siguiente.",
  methodNotEvery:
    "El radar no fecha todas las parcelas cortadas: “aún sin corte detectado” incluye parcelas ya cortadas, y la superficie detectada queda debajo de la del ingenio.",
  methodErrorMorelos:
    "Error de la fecha, según la validación de la biblioteca de investigación (docs/VALIDATION.md): en 26 parcelas de caña etiquetadas, con validación cruzada, las fechas entregadas tienen un error absoluto mediano de 3.5 días frente a las ventanas de corte NDVI de Sentinel-2; 24 de 26 dentro de ±12 días. Las referencias son ventanas ópticas de 2 a 10 días, no visitas a campo, y la biblioteca considera optimistas estos errores.",
  methodErrorBrazil:
    "Error de la fecha, según la validación de la biblioteca de investigación (docs/VALIDATION.md): en una muestra de 40 segmentos fechados, las fechas tienen un error absoluto mediano de 2.5 días frente a una regla NDVI; 37 de 40 dentro de ±12 días. La referencia es óptica, no visitas a campo.",
  methodErrorNone: "La biblioteca de investigación no registra una validación de fechas para este sitio.",
  methodLinks: "Análisis de atribución de fuegos: {findings}. Biblioteca de investigación: {library}.",
  generated: "Generado el {ts}",
};

const DICT: Record<Lang, Record<Key, string>> = { en: EN, es: ES };

/** Text of `key` in `lang`, with {name} placeholders filled from `vars`. */
export function t(lang: Lang, key: Key, vars: Record<string, string | number> = {}): string {
  return DICT[lang][key].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/** Text of `key` when it is a key of the dictionary (a value from the API, such as a
 * confidence level), otherwise `fallback`. */
export function tValue(lang: Lang, key: string, fallback: string): string {
  return key in EN ? t(lang, key as Key) : fallback;
}

/** The site's name in `lang` (`site_<id>` in the dictionary), else the name in its config. */
export function siteName(lang: Lang, site: { site_id: string; name: string }): string {
  return tValue(lang, `site_${site.site_id}`, site.name);
}

/** `n` formatted, then the singular or plural word: "1 field", "2 fields". */
export function count(lang: Lang, n: number, one: "field" | "detection", many: "fields" | "detections"): string {
  return `${formatNumber(lang, n)} ${t(lang, n === 1 ? one : many)}`;
}

export function formatNumber(lang: Lang, v: number, digits = 0): string {
  return v.toLocaleString(LOCALE[lang], { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** An ISO date as a short local date (Feb 15, 2026 / 15 feb 2026), read as UTC. */
export function formatDate(lang: Lang, iso: string): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso.slice(0, 10)}T00:00:00Z`),
  );
}
