import { useEffect, useMemo, useState } from "react";
import type { AlertRow } from "./alerts";
import FindField from "./FindField";
import MapView from "./MapView";
import SeasonPanel, { type Weekly } from "./SeasonPanel";
import SidePanel from "./SidePanel";
import TimeSlider from "./TimeSlider";
import type { BasemapState } from "./basemap";
import type { ReferenceCollection } from "./reference";
import { cumulativeHarvests, toDay, weekSteps } from "./season";

// Subset of GET /sites used by the map and the season panel (docs/API.md).
export type Site = {
  site_id: string;
  name: string;
  season: string;
  bbox: [number, number, number, number];
  segment_count: number;
  dated_segment_count: number;
  cane_area_ha: number;
  dated_area_ha: number;
  harvest_date_min: string;
  harvest_date_max: string;
  series_date_min: string;
  series_date_max: string;
  has_official: boolean;
  official_final: { mill: string; area_ha: number } | null;
};

// What the side panel shows: a map segment (`from`: the reference field whose card linked to
// it) or a reference field.
export type Selection =
  | { kind: "segment"; id: string; from?: string }
  | { kind: "reference"; id: string }
  | null;

export const SITE_LABELS: Record<string, string> = { morelos: "Morelos", brazil: "Brazil" };
const DEFAULT_SITE = "morelos";
const PLAY_STEP_MS = 600;
const ALERT_ZOOM_DEG = 0.002; // half-size of the box flown to around an alert's segment centroid

export default function App() {
  const [selected, setSelected] = useState<Selection>(null);
  const [reference, setReference] = useState<ReferenceCollection | null>(null);
  const [referenceOn, setReferenceOn] = useState(false);
  const [basemap, setBasemap] = useState<BasemapState>("checking");
  const [api, setApi] = useState<string>("checking");
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState(DEFAULT_SITE);
  const [weekly, setWeekly] = useState<Weekly | null>(null);
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [seasonExpanded, setSeasonExpanded] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  // "Zoom to field": a new object each click, so the same bbox can be flown to again.
  const [zoomTo, setZoomTo] = useState<{ bbox: [number, number, number, number] } | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertCode, setAlertCode] = useState<string | null>(null);

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
    const ctrl = new AbortController();
    setWeekly(null);
    fetch(`/api/weekly/${siteId}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then(setWeekly)
      .catch(() => {
        if (!ctrl.signal.aborted) setWeekly(null);
      });
    return () => ctrl.abort();
  }, [siteId]);

  useEffect(() => {
    const ctrl = new AbortController();
    setReference(null);
    fetch(`/api/reference/${siteId}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then(setReference)
      .catch(() => {
        if (!ctrl.signal.aborted) setReference(null);
      });
    return () => ctrl.abort();
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

  // Clamped: on a site change the index is reset by the effect above only after this render.
  const at = Math.min(index, steps.length - 1);
  const day = steps.length ? steps[at] : null;

  // A day picked on a season chart: the first slider Sunday on or after it, clamped to the season.
  const pickDay = (d: number) => {
    const i = steps.findIndex((s) => s >= d);
    setPlaying(false);
    setIndex(i < 0 ? steps.length - 1 : i);
  };

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
              setAlertCode(null);
              setSiteId(e.target.value);
            }}
          >
            {(sites.length ? sites.map((s) => s.site_id) : [DEFAULT_SITE]).map((id) => (
              <option key={id} value={id}>
                {SITE_LABELS[id] ?? id}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`season-toggle${seasonOpen ? " on" : ""}`}
            aria-pressed={seasonOpen}
            data-testid="season-toggle"
            onClick={() => setSeasonOpen(!seasonOpen)}
          >
            Season progress
          </button>
          <button
            type="button"
            className={`season-toggle${referenceOn ? " on" : ""}`}
            aria-pressed={referenceOn}
            data-testid="reference-toggle"
            disabled={!reference?.features.length}
            title={reference?.features.length ? undefined : "No reference fields for this site"}
            onClick={() => setReferenceOn(!referenceOn)}
          >
            Reference fields
          </button>
          <button
            type="button"
            className={`season-toggle${alertsOpen ? " on" : ""}`}
            aria-pressed={alertsOpen}
            data-testid="alerts-toggle"
            onClick={() => {
              if (!alertsOpen) setSelected(null); // open on the list, not on a field
              else setAlertCode(null);
              setAlertsOpen(!alertsOpen);
            }}
          >
            Alerts
          </button>
          <FindField
            siteId={siteId}
            reference={reference}
            onFound={(sel, bbox) => {
              if (sel?.kind === "reference") setReferenceOn(true);
              setSelected(sel);
              setZoomTo({ bbox });
            }}
          />
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
      <main className={`main${seasonOpen ? " season-open" : ""}${seasonOpen && seasonExpanded ? " season-expanded" : ""}`}>
        <div className="map-col">
          <MapView
            site={site}
            day={day}
            zoomTo={zoomTo}
            reference={reference}
            referenceOn={referenceOn}
            alertCode={alertsOpen ? alertCode : null}
            selected={selected}
            onSelect={setSelected}
            onBasemap={setBasemap}
          />
          {seasonOpen && site && (
            <SeasonPanel
              site={site}
              weekly={weekly}
              sliderDay={day}
              expanded={seasonExpanded}
              onPick={pickDay}
              onToggleSize={() => setSeasonExpanded(!seasonExpanded)}
              onClose={() => setSeasonOpen(false)}
            />
          )}
        </div>
        <SidePanel
          site={site}
          selected={selected}
          reference={reference}
          referenceOn={referenceOn}
          onZoom={(bbox) => setZoomTo({ bbox })}
          onSelect={setSelected}
          alertsOpen={alertsOpen}
          alertCode={alertCode}
          onAlertCode={setAlertCode}
          onOpenAlert={(a: AlertRow) => {
            const [x, y] = a.centroid;
            setSelected({ kind: "segment", id: a.segment_id });
            setZoomTo({ bbox: [x - ALERT_ZOOM_DEG, y - ALERT_ZOOM_DEG, x + ALERT_ZOOM_DEG, y + ALERT_ZOOM_DEG] });
          }}
        />
        {day !== null && (
          <TimeSlider
            steps={steps}
            index={at}
            onIndex={(i) => {
              setPlaying(false);
              setIndex(i);
            }}
            playing={playing}
            onTogglePlay={togglePlay}
            harvests={weekly ? cumulativeHarvests(weekly.weeks, day) : null}
          />
        )}
      </main>
    </div>
  );
}
