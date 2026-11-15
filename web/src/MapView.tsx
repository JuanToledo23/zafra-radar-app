import maplibregl, { type StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { Selection, Site } from "./App";
import {
  BASEMAP_LAYER,
  BASEMAP_SOURCE,
  ESRI_ATTRIBUTION,
  ESRI_TILES,
  probeBasemap,
  type BasemapState,
} from "./basemap";
import { ALERT_OUTLINE_COLOR } from "./alerts";
import type { ReferenceCollection } from "./reference";
import {
  DATED_OPACITY,
  REFERENCE_CASING,
  REFERENCE_COLOR,
  UNDATED_OPACITY,
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
const LINE = "segments-line";
const ALERT = "segments-alert";
const SELECTED = "segments-selected";
const LAYERS = [FILL, LINE, ALERT, SELECTED];
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
const hovered = (yes: unknown, no: unknown) => ["case", ["boolean", ["feature-state", "hover"], false], yes, no];

function addSegmentLayers(map: maplibregl.Map, tiles: string) {
  map.addSource(SOURCE, { type: "vector", tiles: [tiles], maxzoom: 15, promoteId: "segment_id" });
  map.addLayer({
    id: FILL,
    type: "fill",
    source: SOURCE,
    "source-layer": "segments",
    paint: {
      "fill-opacity": hovered(1, ["case", ["has", "harvest_day"], DATED_OPACITY, UNDATED_OPACITY]),
    } as maplibregl.FillLayerSpecification["paint"],
  });
  map.addLayer({
    id: LINE,
    type: "line",
    source: SOURCE,
    "source-layer": "segments",
    paint: {
      "line-color": hovered("#ffffff", "#1d1d1d"),
      "line-width": hovered(2, 0.3),
      "line-opacity": hovered(1, 0.5),
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

type Props = {
  site: Site | null;
  day: number | null;
  zoomTo: { bbox: [number, number, number, number] } | null;
  reference: ReferenceCollection | null;
  referenceOn: boolean;
  alertCode: string | null;
  selected: Selection;
  onSelect: (s: Selection) => void;
  onBasemap: (s: BasemapState) => void;
};

export default function MapView({
  site, day, zoomTo, reference, referenceOn, alertCode, selected, onSelect, onBasemap,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      style: STYLE,
      center: [-99.2, 18.62],
      zoom: 10,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    const setBasemap = (s: BasemapState) => {
      if (!map.getLayer(BASEMAP_LAYER)) return;
      map.setLayoutProperty(BASEMAP_LAYER, "visibility", s === "online" ? "visible" : "none");
      onBasemap(s);
    };

    // Tile failures after going online (e.g. wifi off mid-session) fall back to plain.
    map.on("error", (e) => {
      if ((e as { sourceId?: string }).sourceId === BASEMAP_SOURCE) setBasemap("offline");
    });

    map.on("load", async () => {
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
      setLoaded(true);
      const online = await probeBasemap();
      if (mapRef.current === map) setBasemap(online ? "online" : "offline"); // not if removed meanwhile
    });

    return () => {
      mapRef.current = null;
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
    const [w, s, e, n] = site.bbox;
    map.fitBounds([w, s, e, n], { padding: 40, duration: 0 });
    onSelect(null);
    // Read by the headless screenshot script (scripts/screenshot.mjs).
    map.once("idle", () => Object.assign(window, { __mapReadySite: site.site_id }));
  }, [loaded, site, onSelect]);

  // Slider day: repaint only; the source is not reloaded.
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map || !site || day === null) return;
    map.setPaintProperty(
      FILL,
      "fill-color",
      harvestColorExpression(toDay(site.harvest_date_min), toDay(site.harvest_date_max), day),
    );
  }, [loaded, site, day]);

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
    map.fitBounds([w, s, e, n], { padding: 80, maxZoom: 17 });
  }, [loaded, zoomTo]);

  return <div ref={container} className="map" data-testid="map" />;
}
