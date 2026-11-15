import { formatDate, t, type Lang } from "./i18n";
import { fromDay, toDay } from "./season";

// NISAR raster layers of GET /rasters/{site} (docs/API.md) and the pure choices of the
// "Radar imagery" control: which layer(s) to draw for its settings and the slider day.

export type Product = "HV" | "HH" | "cross-ratio" | "change";
export const IMAGE_PRODUCTS: Product[] = ["HV", "HH", "cross-ratio"];

export type RasterLayer = {
  id: string;
  product: Product;
  date: string | null;
  date_pair: [string, string] | null;
  season: boolean;
  label: string;
  units: string;
  stretch: [number, number];
  ramp: { at: number; rgb: [number, number, number] }[];
  meaning: { text: string; source: string };
  tile_url: string;
  minzoom: number;
  maxzoom: number;
  bounds: [number, number, number, number];
};

export type RasterIndex = {
  site: string;
  dates: string[];
  minzoom: number;
  maxzoom: number;
  attribution: { text: string; source: string };
  layers: RasterLayer[];
};

export type RadarMode = "off" | "single" | "compare";

export type RadarSettings = {
  mode: RadarMode;
  product: Product; // single date
  date: string | null; // single date, image products
  changeId: string | null; // single date, change product
  follow: boolean;
  left: string | null; // compare: earlier date
  right: string | null; // compare: later date
  rightChange: boolean; // compare: the HV change of the pair on the right instead of the later image
  opacity: number;
  outlines: boolean;
};

export const DEFAULT_RADAR: RadarSettings = {
  mode: "off",
  product: "HV",
  date: null,
  changeId: null,
  follow: true,
  left: null,
  right: null,
  rightChange: false,
  opacity: 1,
  outlines: false,
};

// The explorer's three map views, one per radar mode: the harvest map (no imagery), the HV
// image following the timeline, and the first against the last acquisition.
export type MapViewKind = "harvest" | "radar" | "compare";
export const viewOf = (s: RadarSettings): MapViewKind => (s.mode === "off" ? "harvest" : s.mode === "single" ? "radar" : "compare");

/** The settings a click on a view sets; More options can change them afterwards. */
export function viewPreset(view: MapViewKind, index: RasterIndex | null, s: RadarSettings): RadarSettings {
  if (view === "harvest" || !index) return { ...s, mode: "off" };
  const base = { ...s, product: "HV" as Product, opacity: 1, outlines: false };
  if (view === "radar") return { ...base, mode: "single", follow: true };
  return { ...base, mode: "compare", left: index.dates[0], right: index.dates.at(-1) ?? null, rightChange: false };
}

/** True when compare mode shows the HV image of the first and of the last acquisition. */
export const isSeasonCompare = (index: RasterIndex | null, s: RadarSettings) =>
  !!index && s.mode === "compare" && s.product === "HV" && !s.rightChange && s.left === index.dates[0] && s.right === index.dates.at(-1);

// What the map draws: `left` alone in single-date mode; in compare mode `left` west of the
// divider and `right` east of it. `note` explains an empty map (follow before the first date).
export type RadarView = { left: RasterLayer | null; right: RasterLayer | null; note: string | null };

export const imageLayer = (index: RasterIndex, product: Product, date: string | null) =>
  index.layers.find((l) => l.product === product && l.date === date) ?? null;

/** Change layers between two consecutive dates, in date order (not the season layer). */
export const pairChanges = (index: RasterIndex) => index.layers.filter((l) => l.product === "change" && !l.season);

export const changeLayers = (index: RasterIndex) => index.layers.filter((l) => l.product === "change");

/** The library's change layer for exactly this date pair, if there is one. */
export const changeFor = (index: RasterIndex, d1: string | null, d2: string | null) =>
  index.layers.find((l) => l.product === "change" && l.date_pair?.[0] === d1 && l.date_pair?.[1] === d2) ?? null;

/** Latest of the ISO `dates` on or before `day` (null if all are later). */
export function latestOnOrBefore(dates: string[], day: number): string | null {
  return dates.filter((d) => toDay(d) <= day).sort().at(-1) ?? null;
}

export function changeName(lang: Lang, l: RasterLayer): string {
  if (!l.date_pair) return l.id;
  const [a, b] = l.date_pair.map((d) => formatDate(lang, d));
  return l.season ? t(lang, "changeSeason", { date: a }) : `${a} → ${b}`;
}

/** Date(s) a layer shows, for the on-screen labels. */
export function layerDates(lang: Lang, l: RasterLayer): string {
  if (l.date) return formatDate(lang, l.date);
  return l.season
    ? t(lang, "seasonDates", { a: formatDate(lang, l.date_pair![0]), b: formatDate(lang, l.date_pair![1]) })
    : changeName(lang, l);
}

export function resolveRadar(lang: Lang, index: RasterIndex | null, s: RadarSettings, day: number | null): RadarView | null {
  if (!index || s.mode === "off") return null;
  if (s.mode === "compare") {
    const left = imageLayer(index, s.product === "change" ? "HV" : s.product, s.left);
    const right = s.rightChange
      ? changeFor(index, s.left, s.right)
      : imageLayer(index, s.product === "change" ? "HV" : s.product, s.right);
    return { left, right, note: null };
  }
  if (s.product === "change") {
    if (!s.follow || day === null) return { left: changeLayers(index).find((l) => l.id === s.changeId) ?? null, right: null, note: null };
    const layer = pairChanges(index).filter((l) => toDay(l.date_pair![1]) <= day).at(-1) ?? null;
    return { left: layer, right: null, note: layer ? null : t(lang, "noPair", { date: formatDate(lang, fromDay(day)) }) };
  }
  if (!s.follow || day === null) return { left: imageLayer(index, s.product, s.date), right: null, note: null };
  const date = latestOnOrBefore(index.dates, day);
  return {
    left: imageLayer(index, s.product, date),
    right: null,
    note: date ? null : t(lang, "noAcquisition", { date: formatDate(lang, fromDay(day)), first: formatDate(lang, index.dates[0]) }),
  };
}

/** CSS gradient of a layer's ramp over its stretch. */
export function rampCss(l: RasterLayer): string {
  const [lo, hi] = l.stretch;
  const stops = l.ramp.map((r) => `rgb(${r.rgb.join(",")}) ${(((r.at - lo) / (hi - lo)) * 100).toFixed(1)}%`);
  return `linear-gradient(to right, ${stops.join(", ")})`;
}
