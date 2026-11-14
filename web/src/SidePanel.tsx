import type { SegmentProps, Site } from "./App";
import FieldDetail, { type SegmentDetail } from "./FieldDetail";
import { RAMP_CSS, STANDING_COLOR, UNDATED_COLOR, UNDATED_OPACITY } from "./season";

type Props = {
  site: Site | null;
  selected: SegmentProps | null;
  onZoom: (bbox: SegmentDetail["bbox"]) => void;
};

export default function SidePanel({ site, selected, onZoom }: Props) {
  return (
    <aside className="panel" data-testid="panel">
      <section>
        <h2>Field</h2>
        {site && selected ? (
          <FieldDetail key={`${site.site_id}/${selected.segment_id}`} site={site} segmentId={selected.segment_id} onZoom={onZoom} />
        ) : (
          <p className="muted">Click a segment on the map.</p>
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
