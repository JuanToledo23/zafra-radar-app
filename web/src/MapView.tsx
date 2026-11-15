import maplibregl, { type CustomLayerInterface, type StyleSpecification } from "maplibre-gl";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { Selection, Site } from "./App";
import {
  BASEMAP_DIM,
  BASEMAP_LAYER,
  BASEMAP_SOURCE,
  ESRI_ATTRIBUTION,
  EXPLORER_BACKGROUND,
  ESRI_TILES,
  probeBasemap,
  type BasemapState,
} from "./basemap";
import { ALERT_OUTLINE_COLOR } from "./alerts";
import { t, useLang } from "./i18n";
import { Icon } from "./icons";
import { reducedMotion } from "./ui";
import { RADAR_AREAS, type RasterLayer, type RadarView } from "./radar";
import type { ReferenceCollection } from "./reference";
import {
  DATED_OPACITY,
  HIGHLIGHT_COLOR,
  REFERENCE_CASING,
  REFERENCE_COLOR,
  UNDATED_OPACITY,
  UNDATED_OUTLINE,
  harvestColorExpression,
  toDay,
} from "./season";

// No glyphs or sprites: the style needs nothing from the network to render.
export const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    [BASEMAP_SOURCE]: {
      type: "raster",
      tiles: [ESRI_TILES],
      tileSize: 256,
      maxzoom: 19,
      attribution: ESRI_ATTRIBUTION,
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#e9e5da" } },
    { id: BASEMAP_LAYER, type: "raster", source: BASEMAP_SOURCE, layout: { visibility: "none" } },
  ],
};

const SOURCE = "segments";
const FILL = "segments-fill";
const FRESH = "segments-fresh"; // the latest week's harvests, highlighted while the timeline advances
const LINE = "segments-line";
const ALERT = "segments-alert";
const SELECTED = "segments-selected";
const LAYERS = [FILL, FRESH, LINE, ALERT, SELECTED];
const NONE = ["==", ["get", "segment_id"], ""] as maplibregl.FilterSpecification;
const REF_SOURCE = "reference";
const REF_FILL = "reference-fill"; // transparent; only for "is the click inside a field"
const REF_CASING = "reference-casing";
const REF_LINE = "reference-line";
const REF_SELECTED = "reference-selected";
const REF_LAYERS = [REF_FILL, REF_CASING, REF_LINE, REF_SELECTED];
const REF_NONE = ["==", ["get", "field_id"], ""] as maplibregl.FilterSpecification;
const REF_LABEL_MINZOOM = 12;
const REF_HIT_PX = 5; // click tolerance around a reference outline
// Absolute URL: tiles are fetched from a worker, which cannot resolve a relative path.
export const tilesUrl = (site: string) => `${window.location.origin}/api/tiles/${site}/{z}/{x}/{y}.pbf`;
// Radar imagery (GET /rasters): up to two raster sources below the segment layers. In
// compare mode each is clipped to its side of the divider by a scissor rectangle that a
// custom layer sets just before it; the last custom layer switches the scissor off again, so
// every layer above (segments, reference fields) is drawn whole. MapLibre itself uses the
// scissor only for its debug drawing.
const RADAR = ["radar-left", "radar-right"] as const; // prefixes of the per-layer source ids
const CLIP_LEFT = "radar-clip-left";
const CLIP_RIGHT = "radar-clip-right";
const CLIP_OFF = "radar-clip-off";
const rasterUrl = (path: string) => `${window.location.origin}/api${path}`;
// Highlight of the latest week: shown at once, held, then faded into the harvested colour
// underneath, all within one play step (App's PLAY_STEP_MS, 600 ms).
const FRESH_OPACITY = 0.95;
const FRESH_HOLD_MS = 150;
const FRESH_FADE_MS = 400;
// Opening view: the extent of the site's cane fields, with room for the zoom buttons.
const FIT_PADDING = { top: 24, bottom: 24, left: 24, right: 56 };
// Opening view of the radar views: the site's radar area (RADAR_AREAS), shifted right of most
// of the map panel, which covers only the window's top-left corner.
const RADAR_PADDING = { top: 24, bottom: 24, left: 220, right: 56 };
const BOX_PADDING = 80; // a field
type FitKind = "cane" | "radar" | "box";

/** Camera padding of a fit: the paddings above, clear of the map panel and the zoom buttons.
 * On a narrow map (phones and tablets) the panel spans the top, so the fit starts below it;
 * the top padding is held under 60 % of the map's height, so the camera can always fit. */
function fitPadding(map: maplibregl.Map, kind: FitKind) {
  const base = kind === "cane" ? FIT_PADDING : kind === "radar" ? RADAR_PADDING : BOX_PADDING;
  const c = map.getContainer();
  const panel = c.closest(".map-area")?.querySelector<HTMLElement>(".layers");
  if (!panel || panel.offsetWidth < 0.6 * c.clientWidth) return base;
  const top = panel.getBoundingClientRect().bottom - c.getBoundingClientRect().top + 12;
  return { top: Math.max(16, Math.min(top, 0.6 * c.clientHeight - 16)), bottom: 16, left: 16, right: 16 };
}
const CAMERA_MS = 500;
// Divider hint on entering Before / after: one small sway either side, then back to the middle.
const HINT_DELAY_MS = 500;
const HINT_MS = 1100;
const HINT_AMPLITUDE = 0.06; // of the map width
const hovered = (yes: unknown, no: unknown) => ["case", ["boolean", ["feature-state", "hover"], false], yes, no];

/** Custom layer that clips what follows to one side of the divider (`split()`, 0..1 of the
 * width), or stops clipping ("off"). */
function clipLayer(id: string, side: "left" | "right" | "off", split: () => number): CustomLayerInterface {
  return {
    id,
    type: "custom",
    render(gl) {
      if (side === "off") {
        gl.disable(gl.SCISSOR_TEST);
        return;
      }
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const x = Math.round(split() * w);
      gl.enable(gl.SCISSOR_TEST);
      if (side === "left") gl.scissor(0, 0, x, h);
      else gl.scissor(x, 0, w - x, h);
    },
  };
}

const SEGMENT_FILL_OPACITY = hovered(1, ["case", ["has", "harvest_day"], DATED_OPACITY, UNDATED_OPACITY]);
// Dated fields: a hairline dark edge. Fields with no harvest date: a thin light outline over
// their faint fill, so they read as context, not as gaps.
const dated = (yes: unknown, no: unknown) => ["case", ["has", "harvest_day"], yes, no];
const SEGMENT_LINE = {
  color: hovered("#ffffff", dated("#1d1d1d", UNDATED_OUTLINE)),
  width: hovered(2, dated(0.3, 0.5)),
  opacity: hovered(1, dated(0.5, 0.2)),
};

// Over radar imagery: thin, neutral, faint edges and no fill, faded in from the zoom at which
// the fields are large enough for the edges not to cover their insides (fields of about
// 1-3 ha are some 10 px wide at zoom 13, 20 px at 14).
const RADAR_EDGE = {
  color: hovered("#ffffff", "#e8e8e8"),
  width: hovered(2, 0.6),
  opacity: ["interpolate", ["linear"], ["zoom"], 13, 0, 14, hovered(1, 0.35)],
};

function addSegmentLayers(map: maplibregl.Map, tiles: string) {
  map.addSource(SOURCE, { type: "vector", tiles: [tiles], maxzoom: 15, promoteId: "segment_id" });
  map.addLayer({
    id: FILL,
    type: "fill",
    source: SOURCE,
    "source-layer": "segments",
    // No anti-aliasing edge: on the dark backdrop the overlapping edges of the faint undated
    // fills add up to a light web; the outline layer draws the edges instead.
    paint: { "fill-opacity": SEGMENT_FILL_OPACITY, "fill-antialias": false } as maplibregl.FillLayerSpecification["paint"],
  });
  map.addLayer({
    id: FRESH,
    type: "fill",
    source: SOURCE,
    "source-layer": "segments",
    filter: NONE,
    paint: { "fill-color": HIGHLIGHT_COLOR, "fill-opacity": 0, "fill-opacity-transition": { duration: 0, delay: 0 } },
  });
  map.addLayer({
    id: LINE,
    type: "line",
    source: SOURCE,
    "source-layer": "segments",
    paint: {
      "line-color": SEGMENT_LINE.color,
      "line-width": SEGMENT_LINE.width,
      "line-opacity": SEGMENT_LINE.opacity,
    } as maplibregl.LineLayerSpecification["paint"],
  });
  map.addLayer({
    id: ALERT,
    type: "line",
    source: SOURCE,
    "source-layer": "segments",
    filter: NONE,
    paint: { "line-color": ALERT_OUTLINE_COLOR, "line-width": 2.5 },
  });
  map.addLayer({
    id: SELECTED,
    type: "line",
    source: SOURCE,
    "source-layer": "segments",
    filter: NONE,
    paint: { "line-color": "#00e5ff", "line-width": 3 },
  });
}

/** Segments whose `alert_codes` tile property (comma-separated, docs/API.md) holds `code`. */
function alertFilter(code: string | null): maplibregl.FilterSpecification {
  if (!code) return NONE;
  return ["in", `,${code},`, ["concat", ",", ["coalesce", ["get", "alert_codes"], ""], ","]];
}

/** Reference outlines above the segments, ids only (the card reads the full collection). */
function addReferenceLayers(map: maplibregl.Map, data: ReferenceCollection) {
  map.addSource(REF_SOURCE, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: data.features.map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: { field_id: f.properties.field_id },
      })),
    },
  });
  map.addLayer({ id: REF_FILL, type: "fill", source: REF_SOURCE, paint: { "fill-opacity": 0 } });
  map.addLayer({
    id: REF_CASING,
    type: "line",
    source: REF_SOURCE,
    paint: { "line-color": REFERENCE_CASING, "line-width": 4, "line-opacity": 0.8 },
  });
  map.addLayer({
    id: REF_LINE,
    type: "line",
    source: REF_SOURCE,
    paint: { "line-color": REFERENCE_COLOR, "line-width": 2, "line-dasharray": [2, 1.5] },
  });
  map.addLayer({
    id: REF_SELECTED,
    type: "line",
    source: REF_SOURCE,
    filter: REF_NONE,
    paint: { "line-color": "#00e5ff", "line-width": 4 },
  });
}

/** Field-id labels as HTML markers: the style has no glyphs (nothing from the network). */
function referenceLabels(data: ReferenceCollection): maplibregl.Marker[] {
  return data.features.map((f) => {
    const el = document.createElement("div");
    el.className = "ref-label";
    el.textContent = f.properties.field_id;
    const [w, s, e, n] = f.properties.bbox;
    return new maplibregl.Marker({ element: el }).setLngLat([(w + e) / 2, (s + n) / 2]);
  });
}

type Box = [number, number, number, number];

/** Extent of the segment features loaded in the source (all of them once the site's bbox is
 * in view), or null when none are loaded yet. */
function caneExtent(map: maplibregl.Map): Box | null {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (c: unknown): void => {
    if (typeof (c as number[])[0] === "number") {
      const [x, y] = c as number[];
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    } else (c as unknown[]).forEach(visit);
  };
  for (const f of map.querySourceFeatures(SOURCE, { sourceLayer: "segments" })) {
    const g = f.geometry;
    if (g.type === "Polygon" || g.type === "MultiPolygon") visit(g.coordinates);
  }
  return w < e && s < n ? [w, s, e, n] : null;
}

type Rect = { x: number; y: number; w: number; h: number };
const LABEL_MARGIN = 8; // from the map edges
const LABEL_GAP = 14; // from the divider
const LABEL_TOP = 12;
const overlaps = (a: Rect, b: Rect, pad = 4) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

/** Positions of the two divider labels (map pixels): each beside the divider on its own side
 * near the top, moved down below whatever it would cover (the map panel, the zoom buttons,
 * the credit, the other label), and kept fully on the map. When its side is too narrow even
 * for the two-line form, a label is pinned to the map edge and may cross the divider; its
 * arrow still points to its side. Both share one row when they can. */
export function placeLabels(width: number, height: number, split: number, sizes: [Rect["w"], Rect["h"]][], obstacles: Rect[]): Rect[] {
  const x0 = split * width;
  const clear = (r: Rect, others: Rect[]) => !others.some((o) => overlaps(r, o));
  const tops = (h: number) =>
    [LABEL_TOP, ...obstacles.map((o) => o.y + o.h + 6)].filter((y) => y >= LABEL_TOP && y + h <= height - LABEL_MARGIN).sort((a, b) => a - b);
  // Both beside the divider on one row, the highest that is clear, when both fit on their side.
  const [[wl, hl], [wr, hr]] = sizes;
  const pair = [
    { x: x0 - LABEL_GAP - wl, w: wl, h: hl },
    { x: x0 + LABEL_GAP, w: wr, h: hr },
  ];
  if (pair[0].x >= LABEL_MARGIN && pair[1].x + wr <= width - LABEL_MARGIN)
    for (const y of tops(Math.max(hl, hr))) {
      const rs = pair.map((p) => ({ ...p, y }));
      if (rs.every((r) => clear(r, obstacles))) return rs;
    }
  // Otherwise each on its own.
  const placed: Rect[] = [];
  sizes.forEach(([w, h], i) => {
    const right = i === 1;
    const want = right ? x0 + LABEL_GAP : x0 - LABEL_GAP - w;
    const clampX = (x: number) => Math.min(Math.max(x, LABEL_MARGIN), width - LABEL_MARGIN - w);
    const blocks = [...obstacles, ...placed];
    // beside the divider, or just clear of an obstacle on the same side
    const xs = [want, ...blocks.map((o) => (right ? o.x + o.w + LABEL_GAP : o.x - LABEL_GAP - w))].map(clampX);
    const ys = [LABEL_TOP, ...blocks.map((o) => o.y + o.h + 6)].filter((y) => y >= LABEL_TOP && y + h <= height - LABEL_MARGIN);
    let best: { r: Rect; cost: number } | null = null;
    for (const x of xs)
      for (const y of ys) {
        const r = { x, y, w, h };
        if (blocks.some((o) => overlaps(r, o))) continue;
        const crosses = right ? x < x0 - 1 : x + w > x0 + 1;
        const cost = Math.abs(x - want) + (y - LABEL_TOP) + (crosses ? 1000 : 0);
        if (!best || cost < best.cost) best = { r, cost };
      }
    placed.push(best?.r ?? { x: clampX(want), y: LABEL_TOP, w, h });
  });
  return placed;
}

/** A camera move asked by the app (a new object each time): the site's cane fields, its
 * radar area, or a box (a field); `animate` eases instead of jumping (never with reduced
 * motion). */
export type CameraRequest = { target: "cane" | "radar" | Box; animate?: boolean };

type Props = {
  site: Site | null;
  camera: CameraRequest | null;
  imagery: boolean; // a radar view is chosen (its image may still be loading)
  imageBounds: Box | null; // the site's radar image footprint, while a radar view is chosen
  day: number | null;
  zoomTo: { bbox: [number, number, number, number] } | null;
  reference: ReferenceCollection | null;
  referenceOn: boolean;
  alertCode: string | null;
  selected: Selection;
  onSelect: (s: Selection) => void;
  onBasemap: (s: BasemapState) => void;
  radar: RadarView | null;
  radarOpacity: number;
  radarOutlines: boolean;
  radarAttribution: string | null;
  compare: boolean;
  byDate: boolean;
  sideLabels: [string, string] | null; // compare mode: the left and right labels
  onReady?: (siteId: string) => void; // the site's opening view has rendered
};

export default function MapView({
  site, camera, imagery, imageBounds, day, zoomTo, reference, referenceOn, alertCode, selected, onSelect, onBasemap,
  radar, radarOpacity, radarOutlines, radarAttribution, compare, byDate, sideLabels, onReady,
}: Props) {
  const lang = useLang();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(0);
  // Divider position, 0..1 of the map width: state for the DOM handle, ref for the GL clip.
  const [split, setSplit] = useState(0.5);
  const splitRef = useRef(0.5);
  // Radar layers on the map (layer id = source id) per side: shown, and pending until loaded.
  const radarShown = useRef<(string | null)[]>([null, null]); // map layer (= source) id per side
  const radarPending = useRef<(string | null)[]>([null, null]);
  const radarKey = useRef("");
  const radarOn = !!(radar?.left || radar?.right);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const extents = useRef(new Map<string, Box>()); // cane extent per site, once measured
  const shownDay = useRef<{ site: string; day: number } | null>(null); // last painted slider day
  const imageryRef = useRef(imagery);
  imageryRef.current = imagery;
  const imageBoundsRef = useRef(imageBounds);
  imageBoundsRef.current = imageBounds;

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      style: STYLE,
      center: [-99.2, 18.62],
      zoom: 10,
      attributionControl: { compact: true },
    });
    // top right: the map layers panel sits top left
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.on("zoomend", () => setZoom(map.getZoom()));

    const setBasemap = (s: BasemapState) => {
      if (!map.getLayer(BASEMAP_LAYER)) return;
      // Dimmed and desaturated, so the field colours stand out (the ops map keeps it plain).
      Object.entries(BASEMAP_DIM).forEach(([k, v]) => map.setPaintProperty(BASEMAP_LAYER, k, v));
      map.setLayoutProperty(BASEMAP_LAYER, "visibility", s === "online" ? "visible" : "none");
      onBasemap(s);
    };

    // Tile failures after going online (e.g. wifi off mid-session) fall back to plain.
    map.on("error", (e) => {
      if ((e as { sourceId?: string }).sourceId === BASEMAP_SOURCE) setBasemap("offline");
    });

    map.on("load", async () => {
      map.setPaintProperty("background", "background-color", EXPLORER_BACKGROUND);
      // The segment source and layers are added by the site effect once a site is known.
      let hoverId: string | null = null;
      const setHover = (id: string | null) => {
        if (hoverId !== null) map.setFeatureState({ source: SOURCE, sourceLayer: "segments", id: hoverId }, { hover: false });
        hoverId = id;
        if (id !== null) map.setFeatureState({ source: SOURCE, sourceLayer: "segments", id }, { hover: true });
      };
      map.on("mousemove", FILL, (e) => {
        map.getCanvas().style.cursor = "pointer";
        setHover((e.features?.[0]?.id as string | undefined) ?? null);
      });
      map.on("mouseleave", FILL, () => {
        map.getCanvas().style.cursor = "";
        setHover(null);
      });
      // A reference outline (within a few pixels) wins; then a segment; then the inside of
      // a reference field, so segments inside a field stay clickable.
      map.on("click", (e) => {
        if (!map.getLayer(FILL)) return;
        const refShown = map.getLayer(REF_LINE) && map.getLayoutProperty(REF_LINE, "visibility") !== "none";
        const near: [maplibregl.PointLike, maplibregl.PointLike] = [
          [e.point.x - REF_HIT_PX, e.point.y - REF_HIT_PX],
          [e.point.x + REF_HIT_PX, e.point.y + REF_HIT_PX],
        ];
        const outline = refShown ? map.queryRenderedFeatures(near, { layers: [REF_CASING] })[0] : undefined;
        const segment = map.queryRenderedFeatures(e.point, { layers: [FILL] })[0];
        const inside = refShown ? map.queryRenderedFeatures(e.point, { layers: [REF_FILL] })[0] : undefined;
        if (outline) onSelect({ kind: "reference", id: outline.properties.field_id as string });
        else if (segment) onSelect({ kind: "segment", id: segment.properties.segment_id as string });
        else if (inside) onSelect({ kind: "reference", id: inside.properties.field_id as string });
        else onSelect(null);
      });

      mapRef.current = map;
      setZoom(map.getZoom());
      setLoaded(true);
      const online = await probeBasemap();
      if (mapRef.current === map) setBasemap(online ? "online" : "offline"); // not if removed meanwhile
    });

    return () => {
      mapRef.current = null;
      radarKey.current = "";
      radarShown.current = [null, null];
      radarPending.current = [null, null];
      map.remove();
    };
  }, [onSelect, onBasemap]);

  // Site: new segment source (no selection, no hover state), fit to the site's bbox.
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map || !site) return;
    Object.assign(window, { __mapReadySite: null, __zafraMap: map });
    // Replaced rather than setTiles(): tiles requested right after setTiles() (by the refit)
    // still used the previous site's URL.
    if (map.getSource(SOURCE)) {
      LAYERS.forEach((id) => map.removeLayer(id));
      map.removeSource(SOURCE);
    }
    addSegmentLayers(map, tilesUrl(site.site_id));
    REF_LAYERS.forEach((id) => map.getLayer(id) && map.moveLayer(id)); // keep outlines on top
    // Opening view: the cane fields' extent. Measured once per site from the tiles of its
    // bbox, then the camera eases to it (jumps with reduced motion). In a radar view: the
    // site's radar area, once the extent is known.
    const known = extents.current.get(site.site_id);
    const area = () => (imageryRef.current ? RADAR_AREAS[site.site_id] : undefined);
    map.setMaxBounds(null); // the previous site's image footprint
    if (known && area()) map.fitBounds(area()!, { padding: fitPadding(map, "radar"), duration: 0 });
    else map.fitBounds(known ?? site.bbox, { padding: known ? fitPadding(map, "cane") : 40, duration: 0 });
    onSelect(null);
    let live = true;
    const ready = () => {
      if (!live) return;
      // Read by the headless checks (scripts/screenshot.mjs).
      Object.assign(window, { __mapReadySite: site.site_id });
      onReadyRef.current?.(site.site_id);
    };
    map.once("idle", () => {
      if (!live || known) return ready();
      const box = caneExtent(map);
      if (!box) return ready();
      extents.current.set(site.site_id, box);
      const to = area();
      map.fitBounds(to ?? box, { padding: fitPadding(map, to ? "radar" : "cane"), duration: reducedMotion() ? 0 : CAMERA_MS });
      map.once("idle", ready);
    });
    return () => {
      live = false;
    };
  }, [loaded, site, onSelect]);

  // Slider day: repaint only; the source is not reloaded. With radar imagery on, the fills
  // are transparent (still clickable) and the outlines carry the harvest colours instead,
  // or are hidden.
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map || !site || day === null || !map.getLayer(FILL)) return;
    const color = harvestColorExpression(toDay(site.harvest_date_min), toDay(site.harvest_date_max), day, byDate);
    map.setPaintProperty(FILL, "fill-color", color);
    map.setPaintProperty(FILL, "fill-opacity", radarOn ? 0 : SEGMENT_FILL_OPACITY);
    // With "Field outlines on top" (More options) the edges carry the harvest colours.
    const line = !radarOn ? SEGMENT_LINE : radarOutlines ? { color: hovered("#ffffff", color), width: hovered(2.5, 1.2), opacity: hovered(1, 0.9) } : RADAR_EDGE;
    map.setPaintProperty(LINE, "line-color", line.color);
    map.setPaintProperty(LINE, "line-width", line.width);
    map.setPaintProperty(LINE, "line-opacity", line.opacity);
  }, [loaded, site, day, radarOn, radarOutlines, byDate]);

  // The timeline advanced: the fields harvested in the latest week (the Monday-Sunday week
  // ending on the slider day) light up, then settle into the harvested colour. Not when the
  // timeline goes back, on a new site, over radar imagery, or with reduced motion.
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map || !site || day === null || !map.getLayer(FRESH)) return;
    const prev = shownDay.current;
    shownDay.current = { site: site.site_id, day };
    const set = (opacity: number, duration: number) => {
      map.setPaintProperty(FRESH, "fill-opacity-transition", { duration, delay: 0 });
      map.setPaintProperty(FRESH, "fill-opacity", opacity);
    };
    if (!prev || prev.site !== site.site_id || day <= prev.day || radarOn || reducedMotion()) {
      set(0, 0);
      return;
    }
    map.setFilter(FRESH, ["all", ["has", "harvest_day"], [">", ["get", "harvest_day"], day - 7], ["<=", ["get", "harvest_day"], day]]);
    set(FRESH_OPACITY, 0);
    const timer = setTimeout(() => set(0, FRESH_FADE_MS), FRESH_HOLD_MS);
    return () => clearTimeout(timer);
  }, [loaded, site, day, radarOn]);

  // Radar sources, below the segment layers; clip layers only in compare mode. A new site,
  // compare mode, or a side appearing or disappearing rebuilds them. A side whose layer
  // changes (a new date or product, e.g. while playing with "Follow time slider") keeps the
  // previous image on screen: the new layer is added just below it and replaces it once its
  // tiles in view have loaded (or the map is idle), so no blank frame shows in between.
  const leftId = radar?.left?.id ?? null;
  const rightId = radar?.right?.id ?? null;
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map || !site) return;
    const drop = (id: string | null) => {
      if (id && map.getLayer(id)) map.removeLayer(id);
      if (id && map.getSource(id)) map.removeSource(id);
    };
    const add = (i: number, layer: RasterLayer, beforeId: string | undefined) => {
      const id = `${RADAR[i]}:${layer.id}`;
      map.addSource(id, {
        type: "raster",
        tiles: [rasterUrl(layer.tile_url)],
        tileSize: 256,
        minzoom: layer.minzoom,
        maxzoom: layer.maxzoom,
        bounds: layer.bounds,
        attribution: radarAttribution ?? undefined,
      });
      map.addLayer(
        { id, type: "raster", source: id, paint: { "raster-opacity": radarOpacity, "raster-fade-duration": 0 } },
        beforeId,
      );
      return id;
    };
    const layers = [radar?.left ?? null, compare ? (radar?.right ?? null) : null];
    const key = `${site.site_id}|${compare}|${radarAttribution}|${layers.map(Boolean).join()}`;
    const shown = radarShown.current;
    const pending = radarPending.current;
    if (key === radarKey.current) {
      layers.forEach((layer, i) => {
        const want = layer && `${RADAR[i]}:${layer.id}`;
        if (want === (pending[i] ?? shown[i])) return;
        drop(pending[i]);
        pending[i] = null;
        if (want !== shown[i]) pending[i] = add(i, layer!, shown[i]!);
      });
      return;
    }
    radarKey.current = key;
    [...shown, ...pending].forEach(drop);
    [CLIP_LEFT, CLIP_RIGHT, CLIP_OFF].forEach((id) => map.getLayer(id) && map.removeLayer(id));
    const before = map.getLayer(FILL) ? FILL : undefined;
    layers.forEach((layer, i) => {
      shown[i] = pending[i] = null;
      if (!layer) return;
      if (compare) map.addLayer(clipLayer(i ? CLIP_RIGHT : CLIP_LEFT, i ? "right" : "left", () => splitRef.current), before);
      shown[i] = add(i, layer, before);
    });
    if (compare && layers.some(Boolean)) map.addLayer(clipLayer(CLIP_OFF, "off", () => 0), before);
  }, [loaded, site, leftId, rightId, compare, radarAttribution]); // opacity: its own effect below

  // A pending radar layer replaces the shown one when its source has loaded the tiles in view;
  // when the map is idle, whatever is pending has loaded or has nothing to load in view.
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    const swap = (only?: string) => {
      radarPending.current.forEach((id, i) => {
        if (!id || (only !== undefined && id !== only) || !map.getSource(id)) return;
        const old = radarShown.current[i];
        if (old && map.getLayer(old)) map.removeLayer(old);
        if (old && map.getSource(old)) map.removeSource(old);
        radarShown.current[i] = id;
        radarPending.current[i] = null;
      });
    };
    const onData = (e: maplibregl.MapSourceDataEvent) => {
      if (e.tile && radarPending.current.includes(e.sourceId) && map.isSourceLoaded(e.sourceId)) swap(e.sourceId);
    };
    const onIdle = () => swap();
    map.on("sourcedata", onData);
    map.on("idle", onIdle);
    return () => {
      map.off("sourcedata", onData);
      map.off("idle", onIdle);
    };
  }, [loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    [...radarShown.current, ...radarPending.current].forEach(
      (id) => id && map.getLayer(id) && map.setPaintProperty(id, "raster-opacity", radarOpacity),
    );
  }, [loaded, radarOpacity, leftId, rightId]);

  // Reference fields of the site: replaced with the collection (empty for Brazil).
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    if (map.getSource(REF_SOURCE)) {
      REF_LAYERS.forEach((id) => map.removeLayer(id));
      map.removeSource(REF_SOURCE);
    }
    if (!reference) return;
    addReferenceLayers(map, reference);
    const markers = referenceLabels(reference);
    const show = () => {
      const on = referenceOn && map.getZoom() >= REF_LABEL_MINZOOM;
      markers.forEach((m) => (on ? m.addTo(map) : m.remove()));
    };
    REF_LAYERS.forEach((id) => map.setLayoutProperty(id, "visibility", referenceOn ? "visible" : "none"));
    show();
    map.on("zoomend", show);
    return () => {
      map.off("zoomend", show);
      markers.forEach((m) => m.remove());
    };
  }, [loaded, reference, referenceOn]);

  // Selection highlight, whether it came from a click, a reference card link or Find field.
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    if (map.getLayer(SELECTED))
      map.setFilter(SELECTED, selected?.kind === "segment" ? ["==", ["get", "segment_id"], selected.id] : NONE);
    if (map.getLayer(REF_SELECTED))
      map.setFilter(REF_SELECTED, selected?.kind === "reference" ? ["==", ["get", "field_id"], selected.id] : REF_NONE);
  }, [loaded, selected, site, reference, referenceOn]);

  // Outline of the segments carrying the alert code picked in the alerts list.
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map || !map.getLayer(ALERT)) return;
    map.setFilter(ALERT, alertFilter(alertCode));
  }, [loaded, site, alertCode]);

  // "Zoom to field" from the side panel.
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map || !zoomTo) return;
    const [w, s, e, n] = zoomTo.bbox;
    map.fitBounds([w, s, e, n], { padding: fitPadding(map, "box"), maxZoom: 17, animate: !reducedMotion() });
  }, [loaded, zoomTo]);

  // Camera moves asked by the app (a map view's opening view, a tour scene).
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map || !site || !camera) return;
    const { target } = camera;
    const duration = camera.animate && !reducedMotion() ? CAMERA_MS : 0;
    if (!imageBoundsRef.current) map.setMaxBounds(null); // left a radar view: not held to its image
    map.resize(); // the map's size now, if a panel has just opened or closed
    if (target === "cane") map.fitBounds(extents.current.get(site.site_id) ?? site.bbox, { padding: fitPadding(map, "cane"), duration });
    else if (target === "radar") {
      const area = RADAR_AREAS[site.site_id];
      if (area) map.fitBounds(area, { padding: fitPadding(map, "radar"), duration });
    } else map.fitBounds(target, { padding: fitPadding(map, "box"), maxZoom: 17, duration });
  }, [loaded, camera]); // a new request moves the camera; a new site does not

  // In a radar view the camera stays over the image footprint, so zoomed out the image fills
  // the map with no empty bands at its sides. Set after a camera move in progress ends.
  const boundsKey = imageBounds?.join() ?? "";
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    const apply = () => map.setMaxBounds(imageBounds ?? null);
    if (imageBounds && map.isMoving()) {
      map.once("moveend", apply);
      return () => {
        map.off("moveend", apply);
      };
    }
    apply();
  }, [loaded, boundsKey]); // the bounds by value

  const setDivider = (f: number) => {
    splitRef.current = f;
    setSplit(f);
    mapRef.current?.triggerRepaint();
  };
  const hint = useRef(0); // animation frame of the divider hint, 0 when none
  const stopHint = () => {
    cancelAnimationFrame(hint.current);
    hint.current = 0;
  };
  const moveDivider = (e: PointerEvent<HTMLDivElement>) => {
    const rect = container.current!.getBoundingClientRect();
    setDivider(Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1));
  };
  const minzoom = radar?.left?.minzoom ?? radar?.right?.minzoom ?? 0;
  const dividerOn = compare && radarOn;

  // Entering Before / after: the divider starts in the middle and sways once to show that it
  // can be dragged (not with reduced motion; a drag stops it).
  useEffect(() => {
    if (!dividerOn) return;
    setDivider(0.5);
    if (reducedMotion()) return;
    let start = 0;
    const step = (now: number) => {
      start ||= now;
      const p = Math.min((now - start) / HINT_MS, 1);
      setDivider(0.5 + HINT_AMPLITUDE * Math.sin(2 * Math.PI * p) * (1 - p * 0.35));
      hint.current = p < 1 ? requestAnimationFrame(step) : 0;
    };
    const timer = setTimeout(() => (hint.current = requestAnimationFrame(step)), HINT_DELAY_MS);
    return () => {
      clearTimeout(timer);
      stopHint();
    };
  }, [dividerOn]);

  // Divider labels: measured, then placed clear of the map's other overlays.
  const wrap = useRef<HTMLDivElement>(null);
  const labels = useRef<(HTMLDivElement | null)[]>([null, null]);
  const [labelRects, setLabelRects] = useState<Rect[] | null>(null);
  const [layout, setLayout] = useState(0); // bumped when the map or an overlay is resized
  // A label pinned across the divider says in words which side it belongs to.
  const [crossed, setCrossed] = useState<[boolean, boolean]>([false, false]);
  useEffect(() => {
    const el = wrap.current;
    if (!dividerOn || !el) return;
    const ro = new ResizeObserver(() => setLayout((n) => n + 1));
    ro.observe(el);
    el.parentElement?.querySelectorAll(".layers, .guide, .tour-card").forEach((o) => ro.observe(o));
    return () => ro.disconnect();
  }, [dividerOn]);
  useLayoutEffect(() => {
    const el = wrap.current;
    const [l, r] = labels.current;
    if (!dividerOn || !el || !l || !r) return setLabelRects(null);
    const box = el.getBoundingClientRect();
    // On a narrow side a label wraps to two lines (its text and its date) to stay on that side.
    const x0 = split * box.width;
    l.style.maxWidth = `${Math.max(x0 - LABEL_GAP - LABEL_MARGIN, 0)}px`;
    r.style.maxWidth = `${Math.max(box.width - x0 - LABEL_GAP - LABEL_MARGIN, 0)}px`;
    const rel = (o: Element): Rect => {
      const b = o.getBoundingClientRect();
      return { x: b.left - box.left, y: b.top - box.top, w: b.width, h: b.height };
    };
    const obstacles = [
      ...(el.parentElement?.querySelectorAll(".layers, .guide, .tour-card") ?? []),
      ...el.querySelectorAll(".maplibregl-ctrl-top-right, .maplibregl-ctrl-bottom-right, .maplibregl-ctrl-bottom-left, .radar-zoom-note"),
    ]
      .map(rel)
      .filter((o) => o.w > 0 && o.h > 0);
    const rects = placeLabels(box.width, box.height, split, [[l.offsetWidth, l.offsetHeight], [r.offsetWidth, r.offsetHeight]], obstacles);
    setLabelRects(rects);
    // A wider label (with its side) never fits where the shorter one did not, so this settles.
    const across: [boolean, boolean] = [rects[0].x + rects[0].w > x0 + 1, rects[1].x < x0 - 1];
    if (across[0] !== crossed[0] || across[1] !== crossed[1]) setCrossed(across);
  }, [dividerOn, split, sideLabels, layout, zoom, lang, crossed]);

  return (
    <div ref={wrap} className="map-wrap">
      <div ref={container} className="map" data-testid="map" />
      {dividerOn && (
        <>
          <div
            className="radar-divider"
            style={{ left: `${split * 100}%` }}
            data-testid="radar-divider"
            role="separator"
            aria-orientation="vertical"
            aria-label={t(lang, "legDivider")}
            aria-valuenow={Math.round(split * 100)}
            // Captured by the element pressed: the strip with a mouse, the handle on a touch
            // screen, where only the handle takes input (styles.css) and the map pans around it.
            onPointerDown={(e) => {
              stopHint();
              (e.target as Element).setPointerCapture(e.pointerId);
              moveDivider(e);
            }}
            onPointerMove={(e) => (e.target as Element).hasPointerCapture(e.pointerId) && moveDivider(e)}
          >
            <span className="radar-handle" data-testid="radar-handle">
              <Icon name="chevronLeft" size={16} />
              <Icon name="chevronRight" size={16} />
            </span>
          </div>
          {(["left", "right"] as const).map((side, i) => (
            <div
              key={side}
              ref={(el) => {
                labels.current[i] = el;
              }}
              className={`radar-side radar-side-${side}`}
              style={labelRects ? { transform: `translate(${labelRects[i].x}px, ${labelRects[i].y}px)` } : { visibility: "hidden" }}
              data-testid={`radar-side-${side}`}
            >
              <span className="radar-side-text">
                {(crossed[i] ? t(lang, side === "left" ? "sideOnLeft" : "sideOnRight", { label: sideLabels?.[i] ?? "—" }) : (sideLabels?.[i] ?? "—")).split(/(?<= ·) /).map((part, j) => (
                  <Fragment key={j}>
                    {j > 0 && " "}
                    <span>{part}</span>
                  </Fragment>
                ))}
              </span>
            </div>
          ))}
        </>
      )}
      {/* 256-pixel raster tiles are drawn at about one zoom level above the map's */}
      {radarOn && Math.round(zoom + 1) < minzoom && (
        <div className="radar-zoom-note">{t(lang, "zoomInRadar")}</div>
      )}
    </div>
  );
}
