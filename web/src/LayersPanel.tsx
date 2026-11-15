import { useState, type ReactNode } from "react";
import type { Site } from "./App";
import { ALERT_OUTLINE_COLOR, alertLabel } from "./alerts";
import { Icon } from "./icons";
import RadarControl from "./RadarControl";
import type { RadarSettings, RadarView, RasterIndex } from "./radar";
import type { ReferenceCollection } from "./reference";
import { REFERENCE_CASING, REFERENCE_COLOR, RAMP_CSS, STANDING_COLOR, UNDATED_COLOR, UNDATED_OPACITY } from "./season";
import { InfoTip } from "./ui";

type Props = {
  site: Site | null;
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

// Every map layer of the explorer in one panel over the map: the harvest colours (always on,
// with their legend), radar imagery, reference fields and alerts. Collapsible.
export default function LayersPanel({
  site, reference, referenceOn, onReference, alertsOpen, alertCode, onAlerts, rasters, radar, radarView, onRadar,
}: Props) {
  // Collapsed by default on a narrow screen, where the panel would cover most of the map.
  const [open, setOpen] = useState(() => typeof window === "undefined" || !window.matchMedia("(max-width: 700px)").matches);
  const refCount = reference?.features.length ?? 0;
  return (
    <section className={`layers${open ? "" : " closed"}`} aria-label="Map layers" data-testid="layers">
      <button type="button" className="layers-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="layers" />
        <span>Map layers</span>
        <Icon name="chevronDown" className="chev" />
      </button>
      {open && (
        <div className="layers-body">
          <div className="layer" data-testid="legend">
            <div className="layer-head">
              <span className="layer-title">
                Harvest progress
                <InfoTip text="Each shape is a sugarcane field segment; its colour shows whether the radar had detected its harvest by the timeline date, and when." />
              </span>
            </div>
            <div className="legend-label">Harvested, by harvest date</div>
            <div className="ramp" style={{ background: RAMP_CSS }} />
            <div className="ramp-labels">
              <span>{site?.harvest_date_min ?? ""}</span>
              <span>{site?.harvest_date_max ?? ""}</span>
            </div>
            <div className="legend-item">
              <span className="swatch" style={{ background: STANDING_COLOR }} /> Standing cane (harvested later)
            </div>
            <div className="legend-item">
              <span className="swatch" style={{ background: UNDATED_COLOR, opacity: UNDATED_OPACITY }} />
              Undated cane
            </div>
          </div>
          <RadarControl index={rasters} settings={radar} view={radarView} onChange={onRadar} />
          <LayerSwitch
            title="Reference fields"
            tip="Fields traced in the research library with their satellite (NDVI) harvest windows and, for some, grower-reported dates; used to check the radar dates."
            on={referenceOn}
            disabled={!refCount}
            hint={refCount ? undefined : "No reference fields for this site"}
            testId="reference-toggle"
            onClick={onReference}
          >
            {referenceOn && (
              <div className="legend-item">
                <svg width={14} height={14} aria-hidden="true">
                  <rect x={2} y={2} width={10} height={10} fill="none" stroke={REFERENCE_CASING} strokeWidth={3.5} />
                  <rect x={2} y={2} width={10} height={10} fill="none" stroke={REFERENCE_COLOR} strokeWidth={1.5} strokeDasharray="3 2" />
                </svg>
                Reference field ({refCount}), id shown from zoom 12
              </div>
            )}
            {!refCount && <p className="muted small layer-note">No reference fields for this site</p>}
          </LayerSwitch>
          <LayerSwitch
            title="Alerts"
            tip="Fields flagged for review by the research library's rules, such as a fire outside permitted hours; the list opens on the right."
            on={alertsOpen}
            testId="alerts-toggle"
            onClick={onAlerts}
          >
            {alertsOpen && alertCode && (
              <div className="legend-item">
                <span className="swatch" style={{ border: `2px solid ${ALERT_OUTLINE_COLOR}` }} />
                Alert: {alertLabel(alertCode)}
              </div>
            )}
            {alertsOpen && !alertCode && <p className="muted small layer-note">Pick an alert type in the list to outline its fields.</p>}
          </LayerSwitch>
        </div>
      )}
    </section>
  );
}
