import type { Selection, Site } from "./App";
import AlertsList from "./AlertsList";
import type { AlertRow } from "./alerts";
import FieldDetail, { type SegmentDetail } from "./FieldDetail";
import { Icon } from "./icons";
import ReferenceDetail from "./ReferenceDetail";
import type { ReferenceCollection } from "./reference";
import { EmptyState } from "./ui";

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
    <aside className="panel" data-testid="panel" aria-label="Details">
      {site && alertsOpen && (
        // Kept mounted while a field is open, so "Back to alerts" returns to the same rows.
        <section hidden={selected !== null}>
          <h2 className="panel-title">Alerts</h2>
          <AlertsList siteId={site.site_id} code={alertCode} onCode={onAlertCode} onOpen={onOpenAlert} />
        </section>
      )}
      <section hidden={alertsOpen && selected === null}>
        {alertsOpen && selected && (
          <button type="button" className="btn btn-ghost btn-sm back" data-testid="back-to-alerts" onClick={() => onSelect(null)}>
            <Icon name="arrowLeft" /> Back to alerts
          </button>
        )}
        <h2 className="panel-title">{selected?.kind === "reference" ? "Reference field" : "Field"}</h2>
        {site && selected?.kind === "segment" && (
          <>
            {selected.from && (
              <button
                type="button"
                className="btn btn-ghost btn-sm back"
                data-testid="back-to-reference"
                onClick={() => onSelect({ kind: "reference", id: selected.from! })}
              >
                <Icon name="arrowLeft" /> Back to reference field {selected.from}
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
          <>
            <EmptyState icon="cursor" title="No field selected" testId="panel-empty">
              Click a segment{referenceOn ? " or a reference outline" : ""} on the map.
            </EmptyState>
            <div className="explain">
              <h3>What the map shows</h3>
              <p>
                Each coloured shape is a patch of sugarcane (a field segment). The NISAR satellite radar sees a field
                change when its cane is cut, so the map can show the harvest (<i>zafra</i>) advancing week by week.
              </p>
              <p>Press play under the map to watch the season, then click a field to see its harvest date and radar signal.</p>
            </div>
          </>
        )}
      </section>
      {site && (
        <p className="muted small site-note">
          {site.name}. {site.segment_count.toLocaleString("en-US")} cane segments,{" "}
          {site.dated_segment_count.toLocaleString("en-US")} with a harvest date.
        </p>
      )}
    </aside>
  );
}
