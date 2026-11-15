import { useEffect, useMemo, useState } from "react";
import type { AlertRow } from "./alerts";
import FindField from "./FindField";
import Guide, { guideDismissed } from "./Guide";
import { Icon } from "./icons";
import LayersPanel from "./LayersPanel";
import MapView from "./MapView";
import OpsView from "./OpsView";
import SeasonPanel, { type Weekly } from "./SeasonPanel";
import SidePanel, { type SeasonSoFar } from "./SidePanel";
import TimeSlider from "./TimeSlider";
import type { BasemapState } from "./basemap";
import { LANGS, LangContext, t, tValue, type Key, type Lang } from "./i18n";
import type { OpsSeries } from "./ops";
import {
  DEFAULT_RADAR,
  changeLayers,
  isSeasonCompare,
  layerDates,
  resolveRadar,
  viewOf,
  viewPreset,
  type RadarSettings,
  type RasterIndex,
} from "./radar";
import type { ReferenceCollection } from "./reference";
import { cumulativeHarvests, stepIndex, toDay, weekHarvests, weekSteps } from "./season";
import { Segmented, reducedMotion } from "./ui";

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

type View = "explorer" | "ops";
const DEFAULT_SITE = "morelos";
const PLAY_STEP_MS = 600;
const ALERT_ZOOM_DEG = 0.002; // half-size of the box flown to around an alert's segment centroid

// Presenter mode (`?present=1`): the single flag for it. For now it only keeps the first
// visit's autoplay off.
export const PRESENTER = new URLSearchParams(window.location.search).get("present") === "1";

// First visit: the season plays once from the beginning when the map is ready, and stops at
// the end or on any interaction. Remembered in localStorage (which may be unavailable: then
// it plays again on the next visit, as the guide shows again). Not in presenter mode, not
// with reduced motion.
const AUTOPLAY_KEY = "zafra.autoplay.seen";
type Autoplay = "pending" | "running" | "off";

function firstVisit(): boolean {
  try {
    return localStorage.getItem(AUTOPLAY_KEY) !== "1";
  } catch {
    return true;
  }
}

function rememberVisit() {
  try {
    localStorage.setItem(AUTOPLAY_KEY, "1");
  } catch {
    // storage blocked: nothing to remember
  }
}

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
  // Harvested area per Monday week (GET /ops/{site}/series as of the last harvest date), for
  // the hectares beside the timeline's count.
  const [areaWeeks, setAreaWeeks] = useState<OpsSeries["weeks"] | null>(null);
  const [byDate, setByDate] = useState(false); // More options: colour harvested fields by date
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
  const [autoplay, setAutoplay] = useState<Autoplay>(() => (!PRESENTER && firstVisit() && !reducedMotion() ? "pending" : "off"));

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

  useEffect(() => {
    if (!site) return;
    const ctrl = new AbortController();
    setAreaWeeks(null);
    fetch(`/api/ops/${site.site_id}/series?as_of=${site.harvest_date_max}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: OpsSeries | null) => setAreaWeeks(s?.weeks ?? null))
      .catch(() => {
        if (!ctrl.signal.aborted) setAreaWeeks(null);
      });
    return () => ctrl.abort();
  }, [site]);
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
  const radarView = useMemo(() => resolveRadar(lang, rasters, radar, day), [lang, rasters, radar, day]);
  const mapView = viewOf(radar);
  const hectares =
    areaWeeks && day !== null ? areaWeeks.reduce((n, w) => (toDay(w.start) <= day ? n + w.area_ha : n), 0) : null;
  // The season up to the slider's week (timeline and side panel), and the weekly counts the
  // timeline draws along its track.
  const season: SeasonSoFar | null =
    day === null
      ? null
      : {
          day,
          fields: weekly ? cumulativeHarvests(weekly.weeks, day) : null,
          hectares,
          weekFields: weekly ? weekHarvests(weekly.weeks, day) : null,
          weekHectares: areaWeeks ? (areaWeeks.find((w) => toDay(w.start) === day - 6)?.area_ha ?? 0) : null,
        };
  const weekCounts = useMemo(() => (weekly ? steps.map((d) => weekHarvests(weekly.weeks, d)) : null), [weekly, steps]);
  // Before / after: the season's first and last image are named as such; other pairs (More
  // options) by their dates, and a change layer as such.
  const seasonCompare = isSeasonCompare(rasters, radar);
  const side = (l: RasterIndex["layers"][number] | null | undefined, key: Key) =>
    l ? t(lang, l.product === "change" ? "sideChange" : key, { date: layerDates(lang, l), dates: layerDates(lang, l) }) : "—";
  const sideLabels: [string, string] | null =
    mapView === "compare" && radarView
      ? [
          side(radarView.left, seasonCompare ? "sideBefore" : "sideEarlier"),
          side(radarView.right, seasonCompare ? "sideAfter" : "sideLater"),
        ]
      : null;

  // Any pointer, key or wheel input cancels the first-visit autoplay, before or while it
  // runs. On the play button it only ends the autoplay state: the click then pauses as usual.
  useEffect(() => {
    if (autoplay === "off") return;
    const stop = (e: Event) => {
      setAutoplay("off");
      if (!(e.target instanceof Element && e.target.closest("[data-testid=play]"))) setPlaying(false);
    };
    const events = ["pointerdown", "keydown", "wheel"];
    events.forEach((ev) => window.addEventListener(ev, stop, { capture: true }));
    return () => events.forEach((ev) => window.removeEventListener(ev, stop, { capture: true }));
  }, [autoplay]);
  useEffect(() => {
    if (autoplay === "running" && !playing) setAutoplay("off"); // reached the end, or stopped
  }, [autoplay, playing]);
  const startAutoplay = (id: string) => {
    if (autoplay !== "pending" || id !== siteId || view !== "explorer" || !steps.length) return;
    rememberVisit();
    setAsOf(steps[0]);
    setPlaying(true);
    setAutoplay("running");
  };

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
    setAutoplay("off");
    setView(v);
  };

  return (
    <LangContext.Provider value={lang}>
    <div className="app" lang={lang}>
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
          <span className="sr-only">{t(lang, "site")}</span>
          <select
            className="select site-select"
            data-testid="site-select"
            aria-label={t(lang, "site")}
            value={siteId}
            onChange={(e) => {
              setSelected(null);
              setAlertCode(null);
              setSiteId(e.target.value);
            }}
          >
            {(sites.length ? sites.map((s) => s.site_id) : [DEFAULT_SITE]).map((id) => (
              <option key={id} value={id}>
                {tValue(lang, `short_${id}`, id)}
              </option>
            ))}
          </select>
        </label>
        <Segmented
          label={t(lang, "view")}
          className="view-switch"
          value={view}
          onChange={switchView}
          options={(["explorer", "ops"] as View[]).map((v) => ({
            value: v,
            label: t(lang, v),
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
          <Segmented
            label={t(lang, "language")}
            size="sm"
            value={lang}
            onChange={setLang}
            options={LANGS.map((l) => ({ value: l, label: l.toUpperCase(), testId: `lang-${l}` }))}
          />
          {/* Kept for the headless checks (scripts/screenshot.mjs), not shown. */}
          <div className="status sr-only" aria-label={t(lang, "connection")}>
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
              <Icon name="help" /> {t(lang, "startHere")}
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
                byDate={byDate}
                sideLabels={sideLabels}
                onReady={startAutoplay}
              />
              <LayersPanel
                site={site}
                view={mapView}
                onView={(v) => setRadar(viewPreset(v, rasters, radar))}
                byDate={byDate}
                onByDate={() => setByDate(!byDate)}
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
                harvests={season?.fields ?? null}
                hectares={hectares}
                share={hectares !== null && site?.cane_area_ha ? hectares / site.cane_area_ha : null}
                weekCounts={weekCounts}
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
            season={season}
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
    </LangContext.Provider>
  );
}
