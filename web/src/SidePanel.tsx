import type { Selection, Site } from "./App";
import AlertsList from "./AlertsList";
import { ALERT_OUTLINE_COLOR, alertLabel, type AlertRow } from "./alerts";
import FieldDetail, { type SegmentDetail } from "./FieldDetail";
import ReferenceDetail from "./ReferenceDetail";
import type { ReferenceCollection } from "./reference";
import { REFERENCE_CASING, REFERENCE_COLOR, RAMP_CSS, STANDING_COLOR, UNDATED_COLOR, UNDATED_OPACITY } from "./season";

type Props = {
  site: Site | null;
  selected: Selection;
  reference: ReferenceCollection | null;
  referenceOn: boolean;
  onZoom: (bbox: SegmentDetail["bbox"]) => void;
  onSelect: (s: Selection) => void;
  alertsOpen: boolean;
  alertCode: string | null;
  onAlertCode: (code: string | null) => void;
  onOpenAlert: (a: AlertRow) => void;
};

export default function SidePanel({
  site, selected, reference, referenceOn, onZoom, onSelect, alertsOpen, alertCode, onAlertCode, onOpenAlert,
}: Props) {
  const field =
    selected?.kind === "reference"
      ? reference?.features.find((f) => f.properties.field_id === selected.id)?.properties
      : undefined;
  return (
    <aside className="panel" data-testid="panel">
      {site && alertsOpen && (
        // Kept mounted while a field is open, so "Back to alerts" returns to the same rows.
        <section hidden={selected !== null}>
          <h2>Alerts</h2>
          <AlertsList siteId={site.site_id} code={alertCode} onCode={onAlertCode} onOpen={onOpenAlert} />
        </section>
      )}
      <section hidden={alertsOpen && selected === null}>
        {alertsOpen && selected && (
          <button type="button" className="link back" data-testid="back-to-alerts" onClick={() => onSelect(null)}>
            ← Back to alerts
          </button>
        )}
        <h2>{selected?.kind === "reference" ? "Reference field" : "Field"}</h2>
        {site && selected?.kind === "segment" && (
          <>
            {selected.from && (
              <button
                type="button"
                className="link back"
                data-testid="back-to-reference"
                onClick={() => onSelect({ kind: "reference", id: selected.from! })}
              >
                ← Back to reference field {selected.from}
              </button>
            )}
            <FieldDetail key={`${site.site_id}/${selected.id}`} site={site} segmentId={selected.id} onZoom={onZoom} />
          </>
        )}
        {site && field && (
          <ReferenceDetail
            site={site}
            field={field}
            onZoom={onZoom}
            onOpenSegment={(id) => onSelect({ kind: "segment", id, from: field.field_id })}
          />
        )}
        {!(site && (selected?.kind === "segment" || field)) && (
          <p className="muted">Click a segment{referenceOn ? " or a reference outline" : ""} on the map.</p>
        )}
      </section>
      <section>
        <h2>Map legend</h2>
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
        {referenceOn && (
          <div className="legend-item">
            <svg width={14} height={14} aria-hidden="true">
              <rect x={2} y={2} width={10} height={10} fill="none" stroke={REFERENCE_CASING} strokeWidth={3.5} />
              <rect x={2} y={2} width={10} height={10} fill="none" stroke={REFERENCE_COLOR} strokeWidth={1.5} strokeDasharray="3 2" />
            </svg>
            Reference field ({reference?.features.length ?? 0}), id shown from zoom 12
          </div>
        )}
        {alertsOpen && alertCode && (
          <div className="legend-item">
            <span className="swatch" style={{ border: `2px solid ${ALERT_OUTLINE_COLOR}` }} />
            Alert: {alertLabel(alertCode)}
          </div>
        )}
      </section>
      {site && (
        <section>
          <p className="muted small">
            {site.name}. {site.segment_count.toLocaleString("en-US")} cane segments,{" "}
            {site.dated_segment_count.toLocaleString("en-US")} with a harvest date.
          </p>
        </section>
      )}
    </aside>
  );
}
