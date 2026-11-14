import { useEffect, useMemo, useState } from "react";
import MapView from "./MapView";
import SidePanel from "./SidePanel";
import TimeSlider from "./TimeSlider";
import type { BasemapState } from "./basemap";
import { cumulativeHarvests, toDay, weekSteps, type WeekCount } from "./season";

// Subset of GET /sites used by the map (docs/API.md).
export type Site = {
  site_id: string;
  name: string;
  season: string;
  bbox: [number, number, number, number];
  segment_count: number;
  dated_segment_count: number;
  harvest_date_min: string;
  harvest_date_max: string;
};

// Tile feature properties (docs/API.md); the optional ones are absent when null.
export type SegmentProps = {
  segment_id: string;
  status: string;
  confidence: string;
  area_ha: number;
  p_cane: number;
  p_cane_radar: number;
  harvest_date?: string;
  date_uncertainty_days?: number;
};

export const SITE_LABELS: Record<string, string> = { morelos: "Morelos", brazil: "Brazil" };
const DEFAULT_SITE = "morelos";
const PLAY_STEP_MS = 600;

export default function App() {
  const [selected, setSelected] = useState<SegmentProps | null>(null);
  const [basemap, setBasemap] = useState<BasemapState>("checking");
  const [api, setApi] = useState<string>("checking");
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState(DEFAULT_SITE);
  const [weeks, setWeeks] = useState<WeekCount[] | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => setApi(h.status === "ok" ? "ok" : `degraded (db ${h.db})`))
      .catch(() => setApi("unreachable"));
    fetch("/api/sites")
      .then((r) => r.json())
      .then(setSites)
      .catch(() => setSites([]));
  }, []);

  useEffect(() => {
    setWeeks(null);
    fetch(`/api/weekly/${siteId}`)
      .then((r) => r.json())
      .then((w) => setWeeks(w.weeks))
      .catch(() => setWeeks(null));
  }, [siteId]);

  const site = sites.find((s) => s.site_id === siteId) ?? null;
  const steps = useMemo(
    () => (site ? weekSteps(toDay(site.harvest_date_min), toDay(site.harvest_date_max)) : []),
    [site],
  );

  // New site: slider back to the start of its season, playback stopped.
  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [steps]);

  useEffect(() => {
    if (!playing) return;
    if (index >= steps.length - 1) {
      setPlaying(false); // stop at the end of the season
      return;
    }
    const timer = setTimeout(() => setIndex(index + 1), PLAY_STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, index, steps]);

  const day = steps.length ? steps[Math.min(index, steps.length - 1)] : null;

  const togglePlay = () => {
    if (!playing && index >= steps.length - 1) setIndex(0); // replay from the start
    setPlaying(!playing);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="title">
          <h1>Zafra Radar</h1>
          <select
            className="site-select"
            data-testid="site-select"
            aria-label="Site"
            value={siteId}
            onChange={(e) => {
              setSelected(null);
              setSiteId(e.target.value);
            }}
          >
            {(sites.length ? sites.map((s) => s.site_id) : [DEFAULT_SITE]).map((id) => (
              <option key={id} value={id}>
                {SITE_LABELS[id] ?? id}
              </option>
            ))}
          </select>
        </div>
        <div className="badges">
          <span className={`badge badge-${basemap}`} data-testid="basemap-state">
            basemap: {basemap === "online" ? "satellite" : basemap === "offline" ? "offline (plain)" : "checking"}
          </span>
          <span className={`badge badge-${api === "ok" ? "online" : "offline"}`} data-testid="api-state">
            api: {api}
          </span>
        </div>
      </header>
      <main className="main">
        <MapView site={site} day={day} onSelect={setSelected} onBasemap={setBasemap} />
        <SidePanel site={site} selected={selected} />
        {day !== null && (
          <TimeSlider
            steps={steps}
            index={index}
            onIndex={(i) => {
              setPlaying(false);
              setIndex(i);
            }}
            playing={playing}
            onTogglePlay={togglePlay}
            harvests={weeks ? cumulativeHarvests(weeks, day) : null}
          />
        )}
      </main>
    </div>
  );
}
