import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AlertRow } from "./alerts";
import { startAnalytics, track } from "./analytics";
import FindField from "./FindField";
import Guide, { guideDismissed } from "./Guide";
import { BrandMark, Icon } from "./icons";
import LayersPanel from "./LayersPanel";
import MapView, { type CameraRequest } from "./MapView";
import OpsView from "./OpsView";
import SeasonPanel, { type Weekly } from "./SeasonPanel";
import SidePanel, { type SeasonSoFar } from "./SidePanel";
import TimeSlider from "./TimeSlider";
import TopMenu from "./TopMenu";
import TourCard from "./TourCard";
import type { BasemapState } from "./basemap";
import { LANGS, LangContext, t, tValue, type Key, type Lang } from "./i18n";
import type { OpsSeries } from "./ops";
import {
  DEFAULT_RADAR,
  changeLayers,
  isSeasonCompare,
  layerDates,
  type MapViewKind,
  resolveRadar,
  viewOf,
  viewPreset,
  type RadarSettings,
  type RasterIndex,
} from "./radar";
import { cachedFetch } from "./prefetch";
import type { ReferenceCollection } from "./reference";
import { cumulativeHarvests, stepIndex, toDay, weekHarvests, weekSteps } from "./season";
import { SCENES, preloadTour, presenterScenes, type Scene } from "./tour";
import { COMPACT, SHEET, Segmented, reducedMotion, useMedia } from "./ui";

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
// The map views as named in the analytics events.
const VIEW_NAMES: Record<MapViewKind, string> = { harvest: "harvest map", radar: "radar image", compare: "before/after" };

// Presenter mode (`?present=1`): the single flag for it. The tour starts on its first scene
// with captions hidden, later scenes' data is fetched ahead, and the first visit's autoplay
// and guide stay off. `?lang=es` or `?lang=en` sets the interface language, `?skip=7` (scene
// numbers, comma-separated) leaves scenes out; the public tour always has them all.
const QUERY = new URLSearchParams(window.location.search);
export const PRESENTER = QUERY.get("present") === "1";
const TOUR_SCENES = PRESENTER ? presenterScenes(QUERY.get("skip")) : SCENES;
const URL_LANG = LANGS.find((l) => l === QUERY.get("lang")) ?? null;

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
  const [lang, setLang] = useState<Lang>(URL_LANG ?? "en");
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
  const [guideOpen, setGuideOpen] = useState(() => !PRESENTER && !guideDismissed());
  const [autoplay, setAutoplay] = useState<Autoplay>(() => (!PRESENTER && firstVisit() && !reducedMotion() ? "pending" : "off"));
  // Camera moves asked of the map: a radar view's opening view, a tour scene's view.
  const [camera, setCamera] = useState<CameraRequest | null>(null);
  // Tour: the scene shown (null outside the tour), the tour's language (a scene may set its
  // own), and the scene waiting for its site's map, radar index or reference fields.
  const [tour, setTour] = useState<number | null>(PRESENTER ? 0 : null);
  const [tourLang, setTourLang] = useState<Lang>(URL_LANG ?? "en");
  const [pending, setPending] = useState<Scene | null>(null);
  const [mapReady, setMapReady] = useState<string | null>(null); // site whose map has rendered
  const [rastersSite, setRastersSite] = useState<string | null>(null); // site of the loaded radar index
  const [seasonNext, setSeasonNext] = useState(false); // open the season panel once the scene's camera is set
  // Phones and tablets: the top bar's menu, and the detail panel as a bottom sheet, open or not.
  const compact = useMedia(COMPACT);
  const sheet = useMedia(SHEET);
  const short = compact && !sheet;
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Visit counts (analytics.ts): only on the production host, not in presenter mode.
  useEffect(() => startAnalytics(PRESENTER), []);

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
    cachedFetch(`/api/weekly/${siteId}`, { signal: ctrl.signal })
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
    cachedFetch(`/api/reference/${siteId}`, { signal: ctrl.signal })
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
    setRastersSite(null);
    cachedFetch(`/api/rasters/${siteId}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((idx: RasterIndex | null) => {
        setRasters(idx);
        setRastersSite(siteId);
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
        if (ctrl.signal.aborted) return;
        setRasters(null);
        setRastersSite(siteId);
      });
    return () => ctrl.abort();
  }, [siteId]);

  const site = sites.find((s) => s.site_id === siteId) ?? null;

  useEffect(() => {
    if (!site) return;
    const ctrl = new AbortController();
    setAreaWeeks(null);
    cachedFetch(`/api/ops/${site.site_id}/series?as_of=${site.harvest_date_max}`, { signal: ctrl.signal })
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
  // A radar view keeps the camera over the image footprint (all layers share it).
  const imageBounds = mapView !== "harvest" ? (rasters?.layers[0]?.bounds ?? null) : null;
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

  // The sheet opens on a field (a tap on the map, Find field, an alert, a tour scene) and on
  // the alerts list; clearing the field closes it again, back to the map.
  useEffect(() => {
    if (selected) setSheetOpen(true);
    else if (!alertsOpen) setSheetOpen(false);
  }, [selected]);
  useEffect(() => {
    if (alertsOpen) setSheetOpen(true);
  }, [alertsOpen]);

  // A day picked on a season chart: the first slider Sunday on or after it, clamped to the season.
  const pickDay = (d: number) => {
    setPlaying(false);
    setAsOf(steps[stepIndex(steps, d)]);
  };

  const togglePlay = () => {
    if (!playing && at >= steps.length - 1) setAsOf(steps[0]); // replay from the start
    if (!playing) track("season-played");
    setPlaying(!playing);
  };

  const toggleAlerts = () => {
    if (!alertsOpen) setSelected(null); // open on the list, not on a field
    else setAlertCode(null);
    setAlertsOpen(!alertsOpen);
  };
  const switchView = (v: View) => {
    if (v === "ops" && view !== "ops") track("mill-operations-opened");
    setPlaying(false);
    setAutoplay("off");
    setCamera(null); // a map created again on return opens on its own view
    setView(v);
  };

  // A field opened by the user (map, side panel, alert, Find field); a tour scene sets the
  // selection directly and is not counted. Stable: the map is created again when its
  // onSelect changes.
  const openField = useCallback((s: Selection) => {
    if (s) track(s.kind === "reference" ? "reference-field-opened" : "field-opened");
    setSelected(s);
  }, []);

  // ---- tour (tour.ts): a scene sets its site, screen and language at once; the rest once
  // that site's map has rendered and its radar index (and, for a reference field, the
  // reference fields) have loaded, so nothing a site change resets is set too early.
  useEffect(() => {
    if (PRESENTER) preloadTour(TOUR_SCENES);
  }, []);
  useEffect(() => setMapReady(null), [view, siteId]);
  const goTo = (i: number) => {
    const scene = TOUR_SCENES[i];
    track("tour-step", { step: i + 1 });
    setTour(i);
    setPlaying(false);
    setAutoplay("off");
    setGuideOpen(false);
    setMenuOpen(false);
    setAlertsOpen(false);
    setAlertCode(null);
    setByDate(false);
    setLang(scene.state.lang ?? tourLang);
    if (scene.state.site !== siteId) setSelected(null);
    setSiteId(scene.state.site);
    setView(scene.state.view);
    setPending(scene);
    setCamera(null); // not applied again to a map created for this scene
    // keys go to the tour, not to a control focused in the previous scene
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };
  const startTour = () => {
    track("tour-started");
    goTo(0);
  };
  const leaveTour = () => {
    setTour(null);
    setPending(null);
  };
  useEffect(() => {
    if (PRESENTER) goTo(0);
  }, []); // once, on the first render
  useEffect(() => {
    if (!pending) return;
    const s = pending.state;
    const field = s.selected?.kind === "reference" ? reference?.features.find((f) => f.properties.field_id === s.selected!.id) : undefined;
    if (site?.site_id !== s.site || !steps.length || rastersSite !== s.site) return;
    if (s.view === "explorer" && mapReady !== s.site) return;
    if (s.camera === "reference" && !field) return;
    setPending(null);
    const base: RadarSettings = {
      ...DEFAULT_RADAR,
      date: rasters?.dates[0] ?? null,
      changeId: rasters ? (changeLayers(rasters)[0]?.id ?? null) : null,
      left: rasters?.dates[0] ?? null,
      right: rasters?.dates.at(-1) ?? null,
    };
    setRadar(viewPreset(s.mapView, rasters, base));
    setAsOf(s.timeline === "start" || s.timeline === "play" ? steps[0] : s.timeline === "end" ? steps[steps.length - 1] : toDay(s.timeline));
    setPlaying(s.timeline === "play");
    setSelected(s.selected);
    setReferenceOn(s.reference);
    // The camera is fitted to the whole map, then the season panel opens over its lower part
    // (the map's own effect runs before this component's), so the view does not depend on
    // the previous scene's panel.
    setSeasonOpen(false);
    setSeasonNext(s.season === "expanded");
    setZoomTo(null);
    if (s.view === "explorer" && s.camera)
      setCamera({ target: s.camera === "reference" ? field!.properties.bbox : s.camera });
  }, [pending, site, steps, rastersSite, mapReady, reference, rasters]);
  useEffect(() => {
    if (!seasonNext) return;
    setSeasonNext(false);
    setSeasonOpen(true);
    setSeasonExpanded(true);
  }, [seasonNext]);

  // Keys while the tour is on: Next on the right arrow, Space and PageDown, Back on the left
  // arrow and PageUp (presentation remotes send these), Escape leaves. Arrows and Space keep
  // their usual meaning in a form control, Space on a button or link.
  const tourRef = useRef({ tour, goTo, leaveTour });
  tourRef.current = { tour, goTo, leaveTour };
  useEffect(() => {
    if (tour === null) return;
    const onKey = (e: KeyboardEvent) => {
      const { tour: at, goTo: go, leaveTour: leave } = tourRef.current;
      if (at === null || e.altKey || e.ctrlKey || e.metaKey) return;
      const el = e.target instanceof Element ? e.target : null;
      const field = !!el?.closest("input, select, textarea, [contenteditable='true']");
      const next = e.key === "PageDown" || (!field && (e.key === "ArrowRight" || (e.key === " " && !el?.closest("button, a"))));
      const back = e.key === "PageUp" || (!field && e.key === "ArrowLeft");
      if (e.key === "Escape") return leave();
      if (!next && !back) return;
      e.preventDefault();
      if (next && at < TOUR_SCENES.length - 1) go(at + 1);
      if (back && at > 0) go(at - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour === null]); // the current step and handlers are read from tourRef

  // Read by the headless checks: the scene shown and whether it is still being applied.
  useEffect(() => {
    Object.assign(window, { __tour: { step: tour, scene: tour === null ? null : TOUR_SCENES[tour].id, pending: pending !== null } });
  }, [tour, pending]);

  // The map panel: over the map, or at the top of the side panel on a short screen (a phone
  // in landscape), where the map has little height.
  const layersPanel = (
    <LayersPanel
      docked={short}
      site={site}
      view={mapView}
      onView={(v) => {
        // entering a radar view from the harvest map opens on the site's radar area
        if (mapView === "harvest" && v !== "harvest") setCamera({ target: "radar", animate: true });
        if (v !== mapView) track("view-changed", { view: VIEW_NAMES[v] });
        setRadar(viewPreset(v, rasters, radar));
      }}
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
  );
  const tourCard = tour !== null && <TourCard scenes={TOUR_SCENES} step={tour} presenter={PRESENTER} onGo={goTo} onClose={leaveTour} />;
  const findField = view === "explorer" && (
    <FindField
      siteId={siteId}
      reference={reference}
      onFound={(sel, bbox) => {
        if (sel?.kind === "reference") setReferenceOn(true);
        openField(sel);
        setZoomTo({ bbox });
        setMenuOpen(false);
      }}
    />
  );
  const langSwitch = (
    <Segmented
      label={t(lang, "language")}
      size="sm"
      value={lang}
      onChange={(l) => {
        if (l !== lang) track("language-changed", { language: l });
        setLang(l);
        if (tour !== null && !TOUR_SCENES[tour].state.lang) setTourLang(l); // the tour follows the switch
      }}
      options={LANGS.map((l) => ({ value: l, label: l.toUpperCase(), testId: `lang-${l}` }))}
    />
  );
  const tourButton = !PRESENTER && (
    <button
      type="button"
      className="btn btn-ghost btn-sm guide-btn"
      aria-pressed={tour !== null}
      data-testid="tour-start"
      onClick={() => (tour === null ? startTour() : leaveTour())}
    >
      <Icon name="help" /> {t(lang, "takeTour")}
    </button>
  );

  return (
    <LangContext.Provider value={lang}>
    <div className="app" lang={lang}>
      <header className="topbar">
        <div className="brand">
          <BrandMark size={28} />
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
              track("site-changed", { site: e.target.value });
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
            // a narrow phone shows the short name (Map / Mill)
            label: (
              <>
                <span className="label-long">{t(lang, v)}</span>
                <span className="label-short">{t(lang, v === "explorer" ? "explorerShort" : "opsShort")}</span>
              </>
            ),
            testId: `view-${v}`,
          }))}
        />
        <div className="topbar-right">
          {compact ? (
            // Phones and tablets: Find field, the language and the tour behind one menu.
            <TopMenu open={menuOpen} onOpen={setMenuOpen}>
              {findField}
              {langSwitch}
              {tourButton}
            </TopMenu>
          ) : (
            <>
              {findField}
              {langSwitch}
            </>
          )}
          {/* Kept for the headless checks (scripts/screenshot.mjs), not shown. */}
          <div className="status sr-only" aria-label={t(lang, "connection")}>
            <span className={`status-item status-${basemap}`} data-testid="basemap-state" title="Map background">
              basemap: {basemap === "online" ? "satellite" : basemap === "offline" ? "offline (plain)" : "checking"}
            </span>
            <span className={`status-item status-${api === "ok" ? "online" : api === "checking" ? "checking" : "offline"}`} data-testid="api-state" title="Data service">
              api: {api}
            </span>
          </div>
          {!compact && tourButton}
        </div>
      </header>
      {view === "ops" ? (
        <main className="main ops-main">
          {site && asOf !== null && <OpsView site={site} day={asOf} onDay={setAsOf} lang={lang} />}
          {!compact && tourCard}
        </main>
      ) : (
        <main className={`main${seasonOpen ? " season-open" : ""}${seasonOpen && seasonExpanded ? " season-expanded" : ""}`}>
          <div className="map-col">
            <div className="map-area">
              <MapView
                site={site}
                camera={camera}
                imagery={mapView !== "harvest"}
                imageBounds={imageBounds}
                day={day}
                zoomTo={zoomTo}
                reference={reference}
                referenceOn={referenceOn}
                alertCode={alertsOpen ? alertCode : null}
                selected={selected}
                onSelect={openField}
                onBasemap={setBasemap}
                radar={radarView}
                radarOpacity={radar.opacity}
                radarOutlines={radar.outlines}
                radarAttribution={rasters?.attribution.text ?? null}
                compare={radar.mode === "compare"}
                byDate={byDate}
                sideLabels={sideLabels}
                onReady={(id) => {
                  setMapReady(id);
                  startAutoplay(id);
                }}
              />
              {!short && layersPanel}
              {guideOpen && (
                <Guide
                  onClose={() => setGuideOpen(false)}
                  onPlay={() => {
                    if (!playing) togglePlay();
                  }}
                  onOpenOps={() => switchView("ops")}
                  onTour={startTour}
                />
              )}
              {!compact && tourCard}
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
                onToggleSeason={() => {
                  if (!seasonOpen) track("season-panel-opened");
                  setSeasonOpen(!seasonOpen);
                }}
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
            top={short ? layersPanel : null}
            sheet={sheet}
            sheetOpen={sheetOpen}
            onSheet={setSheetOpen}
            site={site}
            season={season}
            selected={selected}
            reference={reference}
            referenceOn={referenceOn}
            onZoom={(bbox) => setZoomTo({ bbox })}
            onSelect={openField}
            alertsOpen={alertsOpen}
            alertCode={alertCode}
            onAlertCode={setAlertCode}
            onOpenAlert={(a: AlertRow) => {
              const [x, y] = a.centroid;
              openField({ kind: "segment", id: a.segment_id });
              setZoomTo({ bbox: [x - ALERT_ZOOM_DEG, y - ALERT_ZOOM_DEG, x + ALERT_ZOOM_DEG, y + ALERT_ZOOM_DEG] });
            }}
          />
        </main>
      )}
      {/* Phones and tablets: the tour's card under the page, so it covers no control. */}
      {compact && tourCard}
    </div>
    </LangContext.Provider>
  );
}
