// EN / ES text of the mill operations screen (the explorer stays in English). Spanish uses
// the terms of a Mexican mill's field department: zafra, corte, quema, caña en pie, parcela.

export type Lang = "en" | "es";
export const LANGS: Lang[] = ["en", "es"];
export const LOCALE: Record<Lang, string> = { en: "en-US", es: "es-MX" };

const EN = {
  replay: "Season replay {season} · data as of {date}",
  notLive: "Replay, not live",
  timing:
    "Fire detections arrive within hours; radar confirmation of the harvest follows within days. Flags for review, not findings of wrongdoing.",
  prevWeek: "Previous week",
  nextWeek: "Next week",
  asOf: "Data as of",
  language: "Language",
  loading: "Loading…",
  loadError: "Could not load: {msg}",
  field: "field",
  fields: "fields",
  caneArea: "Cane area",
  harvested: "Harvested to date",
  ofCane: "of cane area",
  last7: "Last 7 days: {ha} · {fields}",
  standing: "Standing cane",
  standingNote: "harvest dated after this date",
  noDate: "No harvest date detected",
  noDateNote: "not counted as standing cane",
  pace: "Harvest pace",
  paceUnit: "ha / week",
  paceNote: "mean of the last 3 full weeks ({from} – {to})",
  projectedEnd: "Projected end at this pace",
  projectedNone: "no pace, no projection",
  projectedNote: "for the {ha} still standing",
  projectedDone: "no cane dated after this date",
  burned: "Burned, not harvested",
  burnedNote: "{n} of them with no harvest date detected",
  outside: "Fires outside permitted hours",
  outsideNote: "last 7 days · window {from}–{to}{confirmed}",
  unconfirmed: " (window not confirmed)",
  detection: "detection",
  detections: "detections",
  tonnage: "Cane harvested (estimate)",
  tonnageNote: "estimate: harvested area × {yield} t/ha, the mill's official mean field yield for the season",
  listTitle: "Burned and not harvested",
  listHelp:
    "Fields with a satellite fire within 200 m on or before this date and no harvest by it. Longest since the first fire first, then largest.",
  all: "All",
  exportList: "Export list (CSV)",
  exportLedger: "Export field ledger (CSV)",
  colField: "Field",
  colArea: "Area (ha)",
  colFirst: "First fire",
  colLast: "Last fire",
  colDays: "Days since fire",
  colHarvest: "Harvest dated later",
  noHarvestDate: "no date detected",
  rowsShown: "{shown} of {total}",
  loadMore: "Load more ({n} left)",
  empty: "No burned field without harvest on this date.",
  legal:
    "Reference: burned cane must be delivered no more than 48 hours after burning (Ley de Desarrollo Sustentable de la Caña de Azúcar, art. 73, fr. II). A satellite detection date is not the date of the burn order.",
  mapLegend: "Days since the first fire",
  mapOther: "Other fields (muted)",
  b0_2: "0–2 days",
  b3_7: "3–7 days",
  b8_14: "8–14 days",
  bover_14: "More than 14 days",
};
type Key = keyof typeof EN;

const ES: Record<Key, string> = {
  replay: "Repetición de la zafra {season} · datos al {date}",
  notLive: "Repetición, no en tiempo real",
  timing:
    "Las detecciones de fuego llegan en horas; la confirmación del corte por radar, en días. Son avisos para revisar, no hallazgos de una falta.",
  prevWeek: "Semana anterior",
  nextWeek: "Semana siguiente",
  asOf: "Datos al",
  language: "Idioma",
  loading: "Cargando…",
  loadError: "No se pudo cargar: {msg}",
  field: "parcela",
  fields: "parcelas",
  caneArea: "Superficie de caña",
  harvested: "Cortada a la fecha",
  ofCane: "de la superficie de caña",
  last7: "Últimos 7 días: {ha} · {fields}",
  standing: "Caña en pie",
  standingNote: "corte fechado después de esta fecha",
  noDate: "Sin fecha de corte detectada",
  noDateNote: "no se cuenta como caña en pie",
  pace: "Ritmo de corte",
  paceUnit: "ha / semana",
  paceNote: "promedio de las últimas 3 semanas completas ({from} – {to})",
  projectedEnd: "Fin de corte proyectado a este ritmo",
  projectedNone: "sin ritmo, sin proyección",
  projectedNote: "para las {ha} de caña en pie",
  projectedDone: "sin caña con corte fechado después de esta fecha",
  burned: "Caña quemada sin cortar",
  burnedNote: "{n} de ellas sin fecha de corte detectada",
  outside: "Quemas fuera del horario permitido",
  outsideNote: "últimos 7 días · horario {from}–{to}{confirmed}",
  unconfirmed: " (horario no confirmado)",
  detection: "detección",
  detections: "detecciones",
  tonnage: "Caña cortada (estimación)",
  tonnageNote:
    "estimación: superficie cortada × {yield} t/ha, el rendimiento de campo oficial promedio del ingenio en la zafra",
  listTitle: "Caña quemada sin cortar",
  listHelp:
    "Parcelas con un fuego satelital a 200 m o menos en esta fecha o antes, y sin corte a la fecha. Primero las de más días desde la primera quema, luego las más grandes.",
  all: "Todas",
  exportList: "Exportar lista (CSV)",
  exportLedger: "Exportar relación de parcelas (CSV)",
  colField: "Parcela",
  colArea: "Superficie (ha)",
  colFirst: "Primera quema",
  colLast: "Última quema",
  colDays: "Días desde la quema",
  colHarvest: "Corte fechado después",
  noHarvestDate: "sin fecha detectada",
  rowsShown: "{shown} de {total}",
  loadMore: "Cargar más (faltan {n})",
  empty: "Ninguna parcela quemada sin cortar a esta fecha.",
  legal:
    "Referencia: la caña quemada debe entregarse «no más de 48 horas después de su quema» (Ley de Desarrollo Sustentable de la Caña de Azúcar, art. 73, fr. II). La fecha de detección satelital no es la fecha de la orden de quema.",
  mapLegend: "Días desde la primera quema",
  mapOther: "Otras parcelas (atenuadas)",
  b0_2: "0–2 días",
  b3_7: "3–7 días",
  b8_14: "8–14 días",
  bover_14: "Más de 14 días",
};

const DICT: Record<Lang, Record<Key, string>> = { en: EN, es: ES };

/** Text of `key` in `lang`, with {name} placeholders filled from `vars`. */
export function t(lang: Lang, key: Key, vars: Record<string, string | number> = {}): string {
  return DICT[lang][key].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
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
