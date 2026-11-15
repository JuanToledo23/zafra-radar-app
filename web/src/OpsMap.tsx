import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { Site } from "./App";
import { BASEMAP_LAYER, BASEMAP_SOURCE, probeBasemap } from "./basemap";
import { t, type Lang } from "./i18n";
import { STYLE } from "./MapView";
import {
  EARLIER_COLOR,
  FIRE_COLOR,
  NOT_DETECTED_COLOR,
  opsColorExpression,
  opsOpacityExpression,
  RECENT_COLOR,
  type FireRow,
  type ListDays,
} from "./ops";
import { fromDay } from "./season";

const SOURCE = "segments";
const FIRES = "fires";
const FILL = "ops-fill";
const LINE = "ops-line";
const FOCUS = "ops-focus";
const FIRE_POINTS = "ops-fire-points";
const NONE = ["==", ["get", "segment_id"], ""] as maplibregl.FilterSpecification;
const FOCUS_DEG = 0.004; // half-size of the box flown to around a focused field's centroid

/** A field (`id`) or a fire detection (`id` null) picked in a list. */
export type OpsFocus = { id: string | null; centroid: [number, number] };

type Props = {
  site: Site;
  day: number;
  days: ListDays;
  focus: OpsFocus | null;
  fires: FireRow[];
  lang: Lang;
};

// Tiles of the operations map as of a date: they carry only the harvest dates on or before it.
const opsTilesUrl = (site: string, day: number) =>
  `${window.location.origin}/api/ops/${site}/tiles/{z}/{x}/{y}.pbf?as_of=${fromDay(day)}`;

const firesGeoJson = (rows: FireRow[]): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: rows.map((r) => ({ type: "Feature", geometry: { type: "Point", coordinates: [r.lon, r.lat] }, properties: {} })),
});

/** Segment source of the ops tiles at `tiles`, its fill, outline and focus layers, below the
 * fire points. */
function addSegmentLayers(map: maplibregl.Map, tiles: string) {
  map.addSource(SOURCE, { type: "vector", tiles: [tiles], maxzoom: 15, promoteId: "segment_id" });
  map.addLayer({ id: FILL, type: "fill", source: SOURCE, "source-layer": "segments" }, FIRE_POINTS);
  map.addLayer(
    {
      id: LINE,
      type: "line",
      source: SOURCE,
      "source-layer": "segments",
      paint: { "line-color": "#1d1d1d", "line-width": 0.3, "line-opacity": 0.4 },
    },
    FIRE_POINTS,
  );
  map.addLayer(
    {
      id: FOCUS,
      type: "line",
      source: SOURCE,
      "source-layer": "segments",
      filter: NONE,
      paint: { "line-color": "#00e5ff", "line-width": 3 },
    },
    FIRE_POINTS,
  );
}

/** Map of the mill operations screen as of `day`: fields harvested in the last `days` days
 * highlighted, harvested earlier muted, not yet detected as harvested in one colour, and the
 * last 7 days' fire detections near cane as points (context, not attributed to a field). */
export default function OpsMap({ site, day, days, focus, fires, lang }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tilesDay, setTilesDay] = useState<number | null>(null); // date of the loaded tiles

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      style: STYLE,
      bounds: site.bbox,
      fitBoundsOptions: { padding: 30 },
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.on("error", (e) => {
      if ((e as { sourceId?: string }).sourceId === BASEMAP_SOURCE && map.getLayer(BASEMAP_LAYER))
        map.setLayoutProperty(BASEMAP_LAYER, "visibility", "none");
    });
    map.on("load", async () => {
      map.addSource(FIRES, { type: "geojson", data: firesGeoJson([]) });
      map.addLayer({
        id: FIRE_POINTS,
        type: "circle",
        source: FIRES,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3, 15, 7],
          "circle-color": FIRE_COLOR,
          "circle-stroke-color": "#1d1d1d",
          "circle-stroke-width": 1.2,
        },
      });
      mapRef.current = map;
      setLoaded(true);
      // Read by the headless check (the segment tiles are added just after, by an effect).
      map.once("idle", () => Object.assign(window, { __opsMapReady: site.site_id, __opsMap: map }));
      const online = await probeBasemap();
      // Not if the map was removed meanwhile (view or site switched).
      if (online && mapRef.current === map) map.setLayoutProperty(BASEMAP_LAYER, "visibility", "visible");
    });
    return () => {
      mapRef.current = null;
      setLoaded(false);
      setTilesDay(null);
      Object.assign(window, { __opsMapReady: null });
      map.remove();
    };
  }, [site]);

  // A new date replaces the segment source: its tiles hold only the harvest dates on or
  // before that date. (setTiles keeps the tiles already drawn in maplibre-gl 5.24.)
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    for (const layer of [FOCUS, LINE, FILL]) if (map.getLayer(layer)) map.removeLayer(layer);
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    addSegmentLayers(map, opsTilesUrl(site.site_id, day));
    setTilesDay(day);
  }, [loaded, site.site_id, day]);

  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map || tilesDay === null) return;
    map.setPaintProperty(FILL, "fill-color", opsColorExpression(tilesDay, days));
    map.setPaintProperty(FILL, "fill-opacity", opsOpacityExpression(tilesDay, days));
  }, [loaded, tilesDay, days]);

  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    (map.getSource(FIRES) as maplibregl.GeoJSONSource).setData(firesGeoJson(fires));
  }, [loaded, fires]);

  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map || tilesDay === null) return;
    map.setFilter(FOCUS, focus?.id ? ["==", ["get", "segment_id"], focus.id] : NONE);
    if (!focus) return;
    const [x, y] = focus.centroid;
    map.fitBounds([x - FOCUS_DEG, y - FOCUS_DEG, x + FOCUS_DEG, y + FOCUS_DEG], { maxZoom: 16 });
  }, [loaded, tilesDay, focus]);

  return (
    <div className="ops-map-wrap">
      <div ref={container} className="map" data-testid="ops-map" />
      <div className="ops-legend" data-testid="ops-legend">
        <div className="legend-item">
          <span className="swatch" style={{ background: RECENT_COLOR }} /> {t(lang, "mapRecent", { days })}
        </div>
        <div className="legend-item">
          <span className="swatch" style={{ background: EARLIER_COLOR, opacity: 0.5 }} /> {t(lang, "mapEarlier")}
        </div>
        <div className="legend-item">
          <span className="swatch" style={{ background: NOT_DETECTED_COLOR, opacity: 0.7 }} /> {t(lang, "mapNotDetected")}
        </div>
        <div className="legend-item">
          <span className="swatch dot" style={{ background: FIRE_COLOR }} /> {t(lang, "mapFire")}
        </div>
      </div>
    </div>
  );
}
