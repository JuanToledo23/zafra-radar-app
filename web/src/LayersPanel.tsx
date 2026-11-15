import { useState, type ReactNode } from "react";
import type { Site } from "./App";
import { ALERT_OUTLINE_COLOR, alertLabel } from "./alerts";
import { formatDate, t, useLang, type Lang } from "./i18n";
import RadarControl, { productName } from "./RadarControl";
import { layerDates, type MapViewKind, type RadarSettings, type RadarView, type RasterIndex } from "./radar";
import type { ReferenceCollection } from "./reference";
import {
  HARVESTED_COLOR,
  REFERENCE_CASING,
  REFERENCE_COLOR,
  RAMP_CSS,
  STANDING_COLOR,
  UNDATED_COLOR,
  UNDATED_OPACITY,
  UNDATED_OUTLINE,
} from "./season";
import { EXPLORER_BACKGROUND } from "./basemap";
import { Icon } from "./icons";
import { COMPACT, Disclosure, InfoTip, Segmented, useMedia } from "./ui";

type Props = {
  docked?: boolean; // at the top of the side panel (a phone in landscape): the full legend
  site: Site | null;
  view: MapViewKind;
  onView: (v: MapViewKind) => void;
  byDate: boolean;
  onByDate: () => void;
  reference: ReferenceCollection | null;
  referenceOn: boolean;
  onReference: () => void;
  alertsOpen: boolean;
  alertCode: string | null;
  onAlerts: () => void;
  rasters: RasterIndex | null;
  radar: RadarSettings;
  radarView: RadarView | null;
  onRadar: (s: RadarSettings) => void;
};

const VIEWS: [MapViewKind, "viewHarvest" | "viewRadar" | "viewCompare"][] = [
  ["harvest", "viewHarvest"],
  ["radar", "viewRadar"],
  ["compare", "viewCompare"],
];
// The HV ramp's ends (white −8 dB, black −25 dB; docs/API.md), bright first, for the bar.
const BRIGHT = "#f4f4f4";
const DARK = "#141414";

/** On / off row of one layer: a switch-like button (aria-pressed) with its legend below. */
function LayerSwitch({ title, tip, on, disabled, hint, testId, onClick, children }: {
  title: string;
  tip: string;
  on: boolean;
  disabled?: boolean;
  hint?: string;
  testId: string;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="layer">
      <div className="layer-head">
        <span className="layer-title">
          {title}
          <InfoTip text={tip} />
        </span>
        <button
          type="button"
          className={`switch${on ? " on" : ""}`}
          aria-pressed={on}
          aria-label={title}
          data-testid={testId}
          disabled={disabled}
          title={hint}
          onClick={onClick}
        >
          <span className="switch-knob" />
        </button>
      </div>
      {children}
    </div>
  );
}

function Swatch({ color, opacity }: { color: string; opacity?: number }) {
  return <span className="swatch" style={{ background: color, opacity }} />;
}

/** "No harvest date" as the map draws it: a faint fill and a thin light outline, here on
 * the map's dark backdrop so the swatch reads the same on the white panel. */
function UndatedSwatch() {
  return (
    <svg className="swatch" viewBox="0 0 16 16" aria-hidden="true">
      <rect width={16} height={16} rx={3} fill={EXPLORER_BACKGROUND} />
      <rect x={3} y={3} width={10} height={10} fill={UNDATED_COLOR} fillOpacity={UNDATED_OPACITY} stroke={UNDATED_OUTLINE} strokeOpacity={0.5} />
    </svg>
  );
}

/** At most three plain entries describing what the current view draws. `line`: phones and
 * tablets, one line (the radar bar between two short words); the full legend on demand. */
function Legend({ lang, site, view, byDate, rasters, radarView, line }: {
  lang: Lang;
  site: Site | null;
  view: MapViewKind;
  byDate: boolean;
  rasters: RasterIndex | null;
  radarView: RadarView | null;
  line: boolean;
}) {
  if (view === "harvest")
    return (
      <div className={`legend${line ? " legend-line" : ""}`} data-testid="legend" data-view="harvest">
        <InfoTip text={t(lang, "tipHarvestMap")} />
        {byDate ? (
          <div className="legend-ramp">
            <div className="legend-label">{t(lang, "legByDate")}</div>
            <div className="ramp" style={{ background: RAMP_CSS }} />
            <div className="ramp-labels">
              <span>{site ? formatDate(lang, site.harvest_date_min) : ""}</span>
              <span>{site ? formatDate(lang, site.harvest_date_max) : ""}</span>
            </div>
          </div>
        ) : (
          <div className="legend-item">
            <Swatch color={HARVESTED_COLOR} /> {t(lang, "legHarvested")}
          </div>
        )}
        <div className="legend-item">
          <Swatch color={STANDING_COLOR} /> {t(lang, "legStanding")}
        </div>
        <div className="legend-item">
          <UndatedSwatch /> {t(lang, line ? "legUndatedShort" : "legUndated")}
        </div>
      </div>
    );
  if (!rasters) return <p className="legend muted small">{t(lang, "noRadarTiles")}</p>;
  const layer = radarView?.left ?? null;
  const hv = view === "compare" || layer?.product === "HV";
  const bar = <div className="ramp ramp-border" style={{ background: `linear-gradient(to right, ${BRIGHT}, ${DARK})` }} aria-hidden="true" />;
  if (line)
    return (
      <div className="legend legend-line" data-testid="legend" data-view={view}>
        <InfoTip text={t(lang, "tipRadar")} />
        {hv ? (
          <div className="legend-item legend-bar-line" data-testid="radar-legend-bar">
            {t(lang, "legBrightShort")} {bar} {t(lang, "legDarkShort")}
          </div>
        ) : (
          layer && <div className="legend-item">{productName(lang, layer.product)}</div>
        )}
        {view === "radar" && layer && !radarView?.note && (
          <div className="legend-item legend-date" data-testid="radar-date">{layerDates(lang, layer)}</div>
        )}
        {view === "radar" && radarView?.note && <div className="legend-item legend-date note" data-testid="radar-note">{radarView.note}</div>}
      </div>
    );
  return (
    <div className="legend" data-testid="legend" data-view={view}>
      <InfoTip text={t(lang, "tipRadar")} />
      {hv ? (
        <div className="legend-bar" data-testid="radar-legend-bar">
          {bar}
          <div className="legend-bar-labels">
            <span>{t(lang, "legBright")}</span>
            <span>{t(lang, "legDark")}</span>
          </div>
        </div>
      ) : (
        layer && <div className="legend-item">{productName(lang, layer.product)}</div>
      )}
      {view === "radar" &&
        (radarView?.note ? (
          <p className="legend-date note small" data-testid="radar-note">{radarView.note}</p>
        ) : (
          layer && (
            <div className="legend-date" data-testid="radar-date">
              {hv ? t(lang, "radarImageOf", { date: layerDates(lang, layer) }) : layerDates(lang, layer)}
            </div>
          )
        ))}
      {view === "compare" && <div className="legend-date">{t(lang, "legDivider")}</div>}
    </div>
  );
}

// The panel over the map: the three map views (one click each), the legend of the current
// view, and every other map control behind "More options", closed by default.
export default function LayersPanel({
  docked,
  site, view, onView, byDate, onByDate, reference, referenceOn, onReference, alertsOpen, alertCode, onAlerts,
  rasters, radar, radarView, onRadar,
}: Props) {
  const lang = useLang();
  const compact = useMedia(COMPACT);
  const [moreOpen, setMoreOpen] = useState(false);
  const refCount = reference?.features.length ?? 0;
  const legend = (line: boolean) => (
    <Legend lang={lang} site={site} view={view} byDate={byDate} rasters={rasters} radarView={radarView} line={line} />
  );
  const options = (
    <>
      <LayerSwitch
        title={t(lang, "colourByDate")}
        tip={t(lang, "tipColourByDate")}
        on={byDate}
        testId="by-date-toggle"
        onClick={onByDate}
      />
      <RadarControl index={rasters} settings={radar} view={radarView} onChange={onRadar} />
      <LayerSwitch
        title={t(lang, "referenceFields")}
        tip={t(lang, "tipReference")}
        on={referenceOn}
        disabled={!refCount}
        hint={refCount ? undefined : t(lang, "noRefFields")}
        testId="reference-toggle"
        onClick={onReference}
      >
        {referenceOn && (
          <div className="legend-item">
            <svg width={14} height={14} aria-hidden="true">
              <rect x={2} y={2} width={10} height={10} fill="none" stroke={REFERENCE_CASING} strokeWidth={3.5} />
              <rect x={2} y={2} width={10} height={10} fill="none" stroke={REFERENCE_COLOR} strokeWidth={1.5} strokeDasharray="3 2" />
            </svg>
            {t(lang, "refLegend", { n: refCount })}
          </div>
        )}
        {!refCount && <p className="muted small layer-note">{t(lang, "noRefFields")}</p>}
      </LayerSwitch>
      <LayerSwitch title={t(lang, "alerts")} tip={t(lang, "tipAlerts")} on={alertsOpen} testId="alerts-toggle" onClick={onAlerts}>
        {alertsOpen && alertCode && (
          <div className="legend-item">
            <span className="swatch" style={{ border: `2px solid ${ALERT_OUTLINE_COLOR}` }} />
            {t(lang, "alertLegend", { label: alertLabel(lang, alertCode) })}
          </div>
        )}
        {alertsOpen && !alertCode && <p className="muted small layer-note">{t(lang, "alertPick")}</p>}
      </LayerSwitch>
    </>
  );
  return (
    <section className="layers" aria-label={t(lang, "mapView")} data-testid="layers">
      <Segmented
        label={t(lang, "mapView")}
        className="view-seg"
        value={view}
        onChange={onView}
        options={VIEWS.map(([v, key]) => ({
          value: v,
          label: t(lang, key),
          disabled: v !== "harvest" && !rasters,
          title: v !== "harvest" && !rasters ? t(lang, "noRadarTiles") : undefined,
          testId: `mapview-${v}`,
        }))}
      />
      {compact ? (
        // Phones and tablets: the legend in one line and a More options button beside it,
        // which opens the full legend and the options under it.
        <>
          <div className={`legend-row${moreOpen ? " open" : ""}`}>
            {legend(!moreOpen && !docked)}
            <button
              type="button"
              className={`icon-btn legend-more${moreOpen ? " on" : ""}`}
              aria-label={t(lang, "moreOptions")}
              aria-expanded={moreOpen}
              data-testid="more-options"
              onClick={() => setMoreOpen(!moreOpen)}
            >
              <Icon name={moreOpen ? "close" : "layers"} size={20} />
            </button>
          </div>
          {moreOpen && <div className="layers-more-body">{options}</div>}
        </>
      ) : (
        <>
          {legend(false)}
          <Disclosure label={t(lang, "moreOptions")} testId="more-options" className="layers-more">
            {options}
          </Disclosure>
        </>
      )}
    </section>
  );
}
