import type { Selection } from "./App";
import type { Lang } from "./i18n";
import { OPS_PAGE } from "./ops";
import { RADAR_AREAS, type MapViewKind, type RasterIndex } from "./radar";
import { cachedFetch, prefetch, warm } from "./prefetch";

// The guided tour: scenes that each put the app into one prepared state. The same scenes
// serve a live presentation (`?present=1`: captions hidden, keyboard or remote) and the
// self-guided tour ("Take the tour"). Captions carry no figures: every number on screen
// comes from the API.

/** Morelos, dated 19 Jan 2026 ± 2.5 days, 7.9 ha, inside the radar area: from a steady level
 * its HV falls by about 5 dB (ascending orbit) and 4.5 dB (descending) within a month.
 * Chosen from the data (docs/JOURNAL.md). */
export const EXAMPLE_FIELD = "cc12065";
export const REFERENCE_FIELD = "p36";

export const LINKS = {
  findings: "https://github.com/JuanToledo23/zafra-radar-app/blob/main/docs/FINDINGS.md",
  app: "https://github.com/JuanToledo23/zafra-radar-app",
  library: "https://github.com/JuanToledo23/zafra-radar-research",
};

export type SceneState = {
  site: string;
  view: "explorer" | "ops";
  lang?: Lang; // this scene's language; otherwise the tour's
  mapView: MapViewKind;
  // the timeline: the season's first or last week, played from the start, or a date (ISO)
  timeline: "start" | "end" | "play" | string;
  camera: "cane" | "radar" | "reference" | null; // "reference": the selected reference field
  selected: Selection;
  season: "closed" | "expanded";
  reference: boolean; // reference fields shown
};

export type Scene = {
  id: string;
  title: Record<Lang, string>;
  caption: Record<Lang, string>;
  state: SceneState;
  closing?: boolean; // the last scene: links to the findings and the repositories
  card?: "panel"; // the card over the side panel's lower part, when the map is mostly covered
};

const MORELOS: SceneState = {
  site: "morelos",
  view: "explorer",
  mapView: "harvest",
  timeline: "end",
  camera: "cane",
  selected: null,
  season: "closed",
  reference: false,
};

export const SCENES: Scene[] = [
  {
    id: "harvest-map",
    title: { en: "The harvest map", es: "El mapa de corte" },
    caption: {
      en: "Each shape is a sugarcane field in Morelos, Mexico: green while the cane stands, amber once the radar detects its harvest.",
      es: "Cada figura es una parcela de caña en Morelos, México: verde mientras la caña está en pie, ámbar cuando el radar detecta su corte.",
    },
    state: { ...MORELOS, timeline: "start" },
  },
  {
    id: "season",
    title: { en: "The season", es: "La zafra" },
    caption: {
      en: "Week by week, the fields turn amber as the satellite radar detects each harvest.",
      es: "Semana tras semana, las parcelas pasan a ámbar conforme el radar satelital detecta cada corte.",
    },
    state: { ...MORELOS, timeline: "play" },
  },
  {
    id: "before-after",
    title: { en: "Before and after", es: "Antes y después" },
    caption: {
      en: "The radar image at the first and the last pass: standing cane shows bright, cut cane turns dark. Drag the divider.",
      es: "La imagen de radar en el primer y el último paso: la caña en pie se ve clara, la cortada se oscurece. Arrastra el divisor.",
    },
    state: { ...MORELOS, mapView: "compare", camera: "radar" },
  },
  {
    id: "one-field",
    title: { en: "One field", es: "Una parcela" },
    caption: {
      en: "Each field's harvest date comes from the sharp drop in its radar signal, seen in both satellite orbits.",
      es: "La fecha de corte de cada parcela sale de la caída brusca de su señal de radar, vista en las dos órbitas del satélite.",
    },
    state: { ...MORELOS, camera: "radar", selected: { kind: "segment", id: EXAMPLE_FIELD } },
  },
  {
    id: "radar-vs-mill",
    title: { en: "Radar and mill reports", es: "Radar y reportes del ingenio" },
    caption: {
      en: "The share of the season's harvest the radar detected, week by week, beside the area the mill reported officially.",
      es: "La parte del corte de la zafra que detectó el radar, semana a semana, junto al área que el ingenio reportó oficialmente.",
    },
    state: { ...MORELOS, season: "expanded" },
    card: "panel",
  },
  {
    id: "reference-field",
    title: { en: "A field with a grower-reported date", es: "Una parcela con fecha del productor" },
    caption: {
      en: "Field p36 has a grower-reported harvest date, one of the references used to check the radar's dates.",
      es: "La parcela p36 tiene una fecha de corte reportada por el productor, una de las referencias para revisar las fechas del radar.",
    },
    state: { ...MORELOS, camera: "reference", reference: true, selected: { kind: "reference", id: REFERENCE_FIELD } },
  },
  {
    id: "mill-operations",
    title: { en: "Mill operations", es: "Operación del ingenio" },
    caption: {
      en: "The season replayed as known on one day: fields harvested that week, cane not yet detected, and a weekly report to print.",
      es: "La zafra repetida como se conocía un día dado: parcelas cortadas esa semana, caña aún no detectada y un reporte semanal para imprimir.",
    },
    state: { ...MORELOS, view: "ops", lang: "es", timeline: "2026-02-15", camera: null },
  },
  {
    id: "brazil",
    title: { en: "Brazil", es: "Brasil" },
    caption: {
      en: "The same method on a cane region of São Paulo, Brazil, without retraining.",
      es: "El mismo método en una región cañera de São Paulo, Brasil, sin reentrenar.",
    },
    state: { ...MORELOS, site: "brazil" },
  },
  {
    id: "explore",
    title: { en: "Explore freely", es: "Explora libremente" },
    caption: {
      en: "Play the season, click any field or open Mill operations. The findings and the code are linked below.",
      es: "Reproduce la zafra, haz clic en cualquier parcela o abre Operación del ingenio. Abajo están los hallazgos y el código.",
    },
    state: MORELOS,
    closing: true,
  },
];

// Radar tiles of a box at one zoom (Web Mercator tile numbers).
function tilesOf([w, s, e, n]: [number, number, number, number], z: number): [number, number][] {
  const x = (lon: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
  const y = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
  };
  const out: [number, number][] = [];
  for (let i = x(w); i <= x(e); i++) for (let j = y(n); j <= y(s); j++) out.push([i, j]);
  return out;
}

/** Presenter mode's scenes: all but those `?skip=` leaves out, as comma-separated scene
 * numbers from 1 (others are ignored; leaving out every scene leaves out none). */
export function presenterScenes(skip: string | null): Scene[] {
  const out = new Set((skip ?? "").split(",").map((n) => Number(n.trim())));
  const kept = SCENES.filter((_, i) => !out.has(i + 1));
  return kept.length ? kept : SCENES;
}

/** Presenter mode: everything the given scenes load, fetched while the first is shown. */
export function preloadTour(scenes: Scene[]) {
  const api = "/api";
  for (const site of new Set(scenes.map((s) => s.state.site))) {
    ["weekly", "reference", "rasters"].forEach((k) => prefetch(`${api}/${k}/${site}`));
  }
  for (const s of scenes)
    if (s.state.selected?.kind === "segment")
      prefetch(`${api}/segments/${s.state.site}/${encodeURIComponent(s.state.selected.id)}`);
  for (const s of scenes) {
    if (s.state.view !== "ops") continue;
    const ops = `${api}/ops/${s.state.site}`;
    const at = s.state.timeline;
    prefetch(`${ops}?as_of=${at}`);
    prefetch(`${ops}/fires?as_of=${at}`);
    prefetch(`${ops}/harvested?as_of=${at}&days=7&limit=${OPS_PAGE}&offset=0`);
    prefetch(`${ops}/not-detected?as_of=${at}&limit=${OPS_PAGE}&offset=0`);
  }
  // The Before / after scene's two images over the radar area and around it (the tiles are
  // sent with Cache-Control, so the browser keeps them).
  if (!scenes.some((s) => s.state.mapView === "compare" && s.state.site === "morelos")) return;
  cachedFetch(`${api}/rasters/morelos`)
    .then((r) => (r.ok ? r.json() : null))
    .then((idx: RasterIndex | null) => {
      const [w, s, e, n] = RADAR_AREAS.morelos;
      const dx = (e - w) / 2;
      const dy = (n - s) / 2;
      const around: [number, number, number, number] = [w - dx, s - dy, e + dx, n + dy];
      const hv = idx?.layers.filter((l) => l.product === "HV" && (l.date === idx.dates[0] || l.date === idx.dates.at(-1))) ?? [];
      for (const l of hv)
        for (const z of [13, 14])
          for (const [x, y] of tilesOf(around, z))
            warm(`${api}${l.tile_url.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y))}`);
    })
    .catch(() => {});
}
