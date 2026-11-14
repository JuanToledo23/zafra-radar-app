import maplibregl, { type StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { SegmentProps, Site } from "./App";
import {
  BASEMAP_LAYER,
  BASEMAP_SOURCE,
  ESRI_ATTRIBUTION,
  ESRI_TILES,
  probeBasemap,
  type BasemapState,
} from "./basemap";
import { DATED_OPACITY, UNDATED_OPACITY, harvestColorExpression, toDay } from "./season";

// No glyphs or sprites: the style needs nothing from the network to render.
const STYLE: StyleSpecification = {
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
const SELECTED = "segments-selected";
const LAYERS = [FILL, LINE, SELECTED];
const NONE = ["==", ["get", "segment_id"], ""] as maplibregl.FilterSpecification;
// Absolute URL: tiles are fetched from a worker, which cannot resolve a relative path.
const tilesUrl = (site: string) => `${window.location.origin}/api/tiles/${site}/{z}/{x}/{y}.pbf`;
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
    id: SELECTED,
    type: "line",
    source: SOURCE,
    "source-layer": "segments",
    filter: NONE,
    paint: { "line-color": "#00e5ff", "line-width": 3 },
  });
}

type Props = {
  site: Site | null;
  day: number | null;
  onSelect: (p: SegmentProps | null) => void;
  onBasemap: (s: BasemapState) => void;
};

export default function MapView({ site, day, onSelect, onBasemap }: Props) {
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
      map.on("click", (e) => {
        if (!map.getLayer(FILL)) return;
        const hit = map.queryRenderedFeatures(e.point, { layers: [FILL] })[0];
        const props = hit ? (hit.properties as SegmentProps) : null;
        map.setFilter(SELECTED, props ? ["==", ["get", "segment_id"], props.segment_id] : NONE);
        onSelect(props);
      });

      mapRef.current = map;
      setLoaded(true);
      setBasemap((await probeBasemap()) ? "online" : "offline");
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

  return <div ref={container} className="map" data-testid="map" />;
}
