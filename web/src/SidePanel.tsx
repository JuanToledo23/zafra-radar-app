import type { SegmentProps, Site } from "./App";
import { RAMP_CSS, STANDING_COLOR, UNDATED_COLOR, UNDATED_OPACITY } from "./season";

// Plain-language values for the library's status and date-confidence codes
// (research library docs/METHODS.md section 6).
const STATUS: Record<string, string> = {
  harvested: "Harvest detected and dated",
  no_baseline: "Not dated: too few standing-cane looks before the drop",
  harvested_before_coverage: "Harvested before radar coverage began",
  not_detected: "No harvest detected",
};
const CONFIDENCE: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "None (no date)",
  uncertain: "None (no date); land-cover map says trees or grassland",
};

const prob = (p: number) => p.toFixed(2);

function Details({ s }: { s: SegmentProps }) {
  const date = s.harvest_date
    ? `${s.harvest_date}${s.date_uncertainty_days != null ? ` ± ${s.date_uncertainty_days} days` : ""}`
    : "Not dated";
  const rows: [string, string][] = [
    ["Segment", s.segment_id],
    ["Harvest date", date],
    ["Status", STATUS[s.status] ?? s.status],
    ["Date confidence", CONFIDENCE[s.confidence] ?? s.confidence],
    ["Area", `${s.area_ha.toFixed(2)} ha`],
    ["Cane probability (optical)", prob(s.p_cane)],
    ["Cane probability (radar)", prob(s.p_cane_radar)],
  ];
  return (
    <>
      <table className="props">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        Cane probability: how likely the polygon is sugarcane (the optical value decides the
        map). Date confidence: how sure the harvest date is. They are separate measures.
      </p>
    </>
  );
}

export default function SidePanel({ site, selected }: { site: Site | null; selected: SegmentProps | null }) {
  return (
    <aside className="panel" data-testid="panel">
      <section>
        <h2>Legend</h2>
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
      <section>
        <h2>Segment</h2>
        {selected ? <Details s={selected} /> : <p className="muted">Click a segment on the map.</p>}
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
