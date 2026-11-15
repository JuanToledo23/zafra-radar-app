import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { Site } from "./App";
import { BASEMAP_LAYER, BASEMAP_SOURCE, probeBasemap } from "./basemap";
import { t, type Lang } from "./i18n";
import { STYLE, tilesUrl } from "./MapView";
import {
  BUCKET_COLORS,
  BUCKET_KEYS,
  MUTED_COLOR,
  MUTED_OPACITY,
  opsColorExpression,
  opsOpacityExpression,
  type BucketKey,
} from "./ops";

const SOURCE = "segments";
const FILL = "ops-fill";
const LINE = "ops-line";
const FOCUS = "ops-focus";
const NONE = ["==", ["get", "segment_id"], ""] as maplibregl.FilterSpecification;
const FOCUS_DEG = 0.004; // half-size of the box flown to around a focused field's centroid

type Props = {
  site: Site;
  day: number;
  bucket: BucketKey | null;
  focus: { id: string; centroid: [number, number] } | null;
  lang: Lang;
};

/** Map of the mill operations screen: burned-and-not-harvested fields coloured by days
 * since the first fire at `day` (from the tiles' first_fire_day / harvest_day, so a new day
 * only repaints), everything else muted. */
export default function OpsMap({ site, day, bucket, focus, lang }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);

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
      map.addSource(SOURCE, { type: "vector", tiles: [tilesUrl(site.site_id)], maxzoom: 15, promoteId: "segment_id" });
      map.addLayer({ id: FILL, type: "fill", source: SOURCE, "source-layer": "segments" });
      map.addLayer({
        id: LINE,
        type: "line",
        source: SOURCE,
        "source-layer": "segments",
        paint: { "line-color": "#1d1d1d", "line-width": 0.3, "line-opacity": 0.4 },
      });
      map.addLayer({
        id: FOCUS,
        type: "line",
        source: SOURCE,
        "source-layer": "segments",
        filter: NONE,
        paint: { "line-color": "#00e5ff", "line-width": 3 },
      });
      mapRef.current = map;
      setLoaded(true);
      // Read by the headless check.
      map.once("idle", () => Object.assign(window, { __opsMapReady: site.site_id, __opsMap: map }));
      const online = await probeBasemap();
      // Not if the map was removed meanwhile (view or site switched).
      if (online && mapRef.current === map) map.setLayoutProperty(BASEMAP_LAYER, "visibility", "visible");
    });
    return () => {
      mapRef.current = null;
      Object.assign(window, { __opsMapReady: null });
      map.remove();
    };
  }, [site]);

  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    map.setPaintProperty(FILL, "fill-color", opsColorExpression(day, bucket));
    map.setPaintProperty(FILL, "fill-opacity", opsOpacityExpression(day, bucket));
  }, [loaded, day, bucket]);

  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    map.setFilter(FOCUS, focus ? ["==", ["get", "segment_id"], focus.id] : NONE);
    if (!focus) return;
    const [x, y] = focus.centroid;
    map.fitBounds([x - FOCUS_DEG, y - FOCUS_DEG, x + FOCUS_DEG, y + FOCUS_DEG], { maxZoom: 16 });
  }, [loaded, focus]);

  return (
    <div className="ops-map-wrap">
      <div ref={container} className="map" data-testid="ops-map" />
      <div className="ops-legend" data-testid="ops-legend">
        <div className="legend-label">{t(lang, "mapLegend")}</div>
        {BUCKET_KEYS.map((b) => (
          <div key={b} className={`legend-item${bucket && bucket !== b ? " dim" : ""}`}>
            <span className="swatch" style={{ background: BUCKET_COLORS[b] }} /> {t(lang, `b${b}`)}
          </div>
        ))}
        <div className="legend-item">
          <span className="swatch" style={{ background: MUTED_COLOR, opacity: MUTED_OPACITY + 0.2 }} /> {t(lang, "mapOther")}
        </div>
      </div>
    </div>
  );
}
