import { useEffect, useMemo, useState } from "react";
import type { AlertRow } from "./alerts";
import FindField from "./FindField";
import Guide, { guideDismissed } from "./Guide";
import { Icon } from "./icons";
import LayersPanel from "./LayersPanel";
import MapView from "./MapView";
import OpsView from "./OpsView";
import SeasonPanel, { type Weekly } from "./SeasonPanel";
import SidePanel from "./SidePanel";
import TimeSlider from "./TimeSlider";
import type { BasemapState } from "./basemap";
import { LANGS, t, type Lang } from "./i18n";
import { DEFAULT_RADAR, changeLayers, resolveRadar, type RadarSettings, type RasterIndex } from "./radar";
import type { ReferenceCollection } from "./reference";
import { cumulativeHarvests, stepIndex, toDay, weekSteps } from "./season";
import { Segmented } from "./ui";

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
type View = "explorer" | "ops";
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
  const [view, setView] = useState<View>("explorer");
  const [lang, setLang] = useState<Lang>("en");
  // The replay date shared by the explorer's slider and the mill operations screen: null
  // until either sets it (the slider then starts at the season's first week, the operations
  // screen at the last harvest date). The slider shows the week containing it.
  const [asOf, setAsOf] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  // "Zoom to field": a new object each click, so the same bbox can be flown to again.
  const [zoomTo, setZoomTo] = useState<{ bbox: [number, number, number, number] } | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertCode, setAlertCode] = useState<string | null>(null);
  const [rasters, setRasters] = useState<RasterIndex | null>(null);
  const [radar, setRadar] = useState<RadarSettings>(DEFAULT_RADAR);
  const [guideOpen, setGuideOpen] = useState(() => !guideDismissed());

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

  // Radar layers of the site (404 when its tiles are not on the server: control disabled).
  // New site: its first date for one date, first and last for compare; mode kept.
  useEffect(() => {
    const ctrl = new AbortController();
    setRasters(null);
    fetch(`/api/rasters/${siteId}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((idx: RasterIndex | null) => {
        setRasters(idx);
        setRadar((s) => ({
          ...s,
          mode: idx ? s.mode : "off",
          date: idx?.dates[0] ?? null,
          changeId: idx ? (changeLayers(idx)[0]?.id ?? null) : null,
          left: idx?.dates[0] ?? null,
          right: idx?.dates.at(-1) ?? null,
        }));
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setRasters(null);
      });
    return () => ctrl.abort();
  }, [siteId]);

  const site = sites.find((s) => s.site_id === siteId) ?? null;
  const steps = useMemo(
    () => (site ? weekSteps(toDay(site.harvest_date_min), toDay(site.harvest_date_max)) : []),
    [site],
  );

  // New site: date unset (slider back to the start of its season), playback stopped.
  useEffect(() => {
    setAsOf(null);
    setPlaying(false);
  }, [steps]);

  // The operations screen opens on the last harvest date when no date has been set.
  useEffect(() => {
    if (view === "ops" && asOf === null && site) setAsOf(toDay(site.harvest_date_max));
  }, [view, asOf, site]);

  // Slider position: the week containing the shared date (a Sunday), clamped to the season.
  const at = asOf === null ? 0 : stepIndex(steps, asOf);
  const day = steps.length ? steps[at] : null;
  const radarView = useMemo(() => resolveRadar(rasters, radar, day), [rasters, radar, day]);

  useEffect(() => {
    if (!playing) return;
    if (at >= steps.length - 1) {
      setPlaying(false); // stop at the end of the season
      return;
    }
    const timer = setTimeout(() => setAsOf(steps[at + 1]), PLAY_STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, at, steps]);

  // A day picked on a season chart: the first slider Sunday on or after it, clamped to the season.
  const pickDay = (d: number) => {
    setPlaying(false);
    setAsOf(steps[stepIndex(steps, d)]);
  };

  const togglePlay = () => {
    if (!playing && at >= steps.length - 1) setAsOf(steps[0]); // replay from the start
    setPlaying(!playing);
  };

  const toggleAlerts = () => {
    if (!alertsOpen) setSelected(null); // open on the list, not on a field
    else setAlertCode(null);
    setAlertsOpen(!alertsOpen);
  };
  const switchView = (v: View) => {
    setPlaying(false);
    setView(v);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg className="brand-mark" width={28} height={28} viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="currentColor" />
            <path d="M9 23a10 10 0 0 1 14-14M12.5 23a6.5 6.5 0 0 1 9-9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="23" cy="23" r="2.6" fill="#fff" />
          </svg>
          <h1>Zafra Radar</h1>
        </div>
        <label className="site-field">
          <span className="sr-only">Site</span>
          <select
            className="select site-select"
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
        </label>
        <Segmented
          label="View"
          className="view-switch"
          value={view}
          onChange={switchView}
          options={(["explorer", "ops"] as View[]).map((v) => ({
            value: v,
            label: v === "explorer" ? "Explorer" : "Mill operations",
            testId: `view-${v}`,
          }))}
        />
        <div className="topbar-right">
          {view === "explorer" && (
            <FindField
              siteId={siteId}
              reference={reference}
              onFound={(sel, bbox) => {
                if (sel?.kind === "reference") setReferenceOn(true);
                setSelected(sel);
                setZoomTo({ bbox });
              }}
            />
          )}
          {view === "ops" && (
            <Segmented
              label={t(lang, "language")}
              size="sm"
              value={lang}
              onChange={setLang}
              options={LANGS.map((l) => ({ value: l, label: l.toUpperCase(), testId: `ops-lang-${l}` }))}
            />
          )}
          <div className="status" aria-label="Connection status">
            <span className={`status-item status-${basemap}`} data-testid="basemap-state" title="Map background">
              basemap: {basemap === "online" ? "satellite" : basemap === "offline" ? "offline (plain)" : "checking"}
            </span>
            <span className={`status-item status-${api === "ok" ? "online" : api === "checking" ? "checking" : "offline"}`} data-testid="api-state" title="Data service">
              api: {api}
            </span>
          </div>
          {view === "explorer" && (
            <button
              type="button"
              className="btn btn-ghost btn-sm guide-btn"
              aria-pressed={guideOpen}
              data-testid="guide-open"
              onClick={() => setGuideOpen(!guideOpen)}
            >
              <Icon name="help" /> Start here
            </button>
          )}
        </div>
      </header>
      {view === "ops" ? (
        <main className="main ops-main">
          {site && asOf !== null && <OpsView site={site} day={asOf} onDay={setAsOf} lang={lang} />}
        </main>
      ) : (
        <main className={`main${seasonOpen ? " season-open" : ""}${seasonOpen && seasonExpanded ? " season-expanded" : ""}`}>
          <div className="map-col">
            <div className="map-area">
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
                radar={radarView}
                radarOpacity={radar.opacity}
                radarOutlines={radar.outlines}
                radarAttribution={rasters?.attribution.text ?? null}
                compare={radar.mode === "compare"}
              />
              <LayersPanel
                site={site}
                reference={reference}
                referenceOn={referenceOn}
                onReference={() => setReferenceOn(!referenceOn)}
                alertsOpen={alertsOpen}
                alertCode={alertCode}
                onAlerts={toggleAlerts}
                rasters={rasters}
                radar={radar}
                radarView={radarView}
                onRadar={setRadar}
              />
              {guideOpen && (
                <Guide
                  onClose={() => setGuideOpen(false)}
                  onPlay={() => {
                    if (!playing) togglePlay();
                  }}
                  onOpenOps={() => switchView("ops")}
                />
              )}
            </div>
            {day !== null && (
              <TimeSlider
                steps={steps}
                index={at}
                onIndex={(i) => {
                  setPlaying(false);
                  setAsOf(steps[i]);
                }}
                playing={playing}
                onTogglePlay={togglePlay}
                harvests={weekly ? cumulativeHarvests(weekly.weeks, day) : null}
                seasonOpen={seasonOpen}
                onToggleSeason={() => setSeasonOpen(!seasonOpen)}
              />
            )}
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
        </main>
      )}
    </div>
  );
}
