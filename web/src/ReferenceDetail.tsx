import type { Site } from "./App";
import { Summary } from "./FieldDetail";
import { Icon } from "./icons";
import {
  daysVsReference,
  formatDiff,
  inCoverage,
  referenceDateLabel,
  referenceDateText,
  type ReferenceDate,
  type ReferenceProps,
} from "./reference";
import { EmptyState, TitleTip } from "./ui";

// Plain-language values of the reference fields' NDVI labels (research library script 07).
const LABELS: Record<string, string> = { cana: "cane", no_cana: "not cane", dudoso: "doubtful" };
const CONFIDENCE: Record<string, string> = { high: "high", medium: "medium", low: "low" };

const plusMinus = (unc: number | null | undefined) => (unc == null ? "" : ` ± ${unc} d`);

function DateBlock({ r }: { r: ReferenceDate }) {
  return (
    <div className="ref-date">
      <div className="muted small">{referenceDateLabel(r)}</div>
      <div className="ref-date-value">{referenceDateText(r)}</div>
      {(r.event || r.source || r.note) && (
        <table className="props ref-verbatim">
          <tbody>
            {r.event && (
              <tr>
                <th>Event</th>
                <td lang="es">{r.event}</td>
              </tr>
            )}
            {r.source && (
              <tr>
                <th>Source</th>
                <td lang="es">{r.source}</td>
              </tr>
            )}
            {r.note && (
              <tr>
                <th>Note</th>
                <td lang="es">{r.note}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

type Props = {
  site: Site;
  field: ReferenceProps;
  onZoom: (bbox: ReferenceProps["bbox"]) => void;
  onOpenSegment: (segmentId: string) => void;
};

export default function ReferenceDetail({ site, field, onZoom, onOpenSegment }: Props) {
  // Only reference dates inside the radar coverage can be compared with a radar date.
  const comparable = field.reference_dates.filter((r) => inCoverage(r, site.series_date_min, site.series_date_max));
  const outside = field.reference_dates.filter((r) => !comparable.includes(r));
  const facts = field.facts;
  const diffCells = (radar: string | null | undefined) =>
    comparable.map((r) => (
      <td key={r.property} className="num">
        {radar ? formatDiff(daysVsReference(radar, r), r.date_start !== r.date_end) : "–"}
      </td>
    ));

  return (
    <div className="field" data-testid="reference-detail">
      <div className="field-head">
        <div>
          <div className="field-id">{field.field_id}</div>
          <div className="muted">
            Reference field · {field.area_ha?.toFixed(2)} ha
            {field.municipio ? ` · ${field.municipio}` : ""}
          </div>
          <div className="muted small">
            NDVI label: {LABELS[field.label ?? ""] ?? field.label ?? "–"}; traced as{" "}
            {LABELS[field.hyp ?? ""] ?? field.hyp ?? "–"}
          </div>
        </div>
        <button type="button" className="btn btn-secondary btn-sm zoom" onClick={() => onZoom(field.bbox)}>
          <Icon name="target" /> Zoom to field
        </button>
      </div>

      <section className="block" data-testid="reference-dates">
        <TitleTip tip="Dates known for this field from outside the radar: a harvest window seen in Sentinel-2 optical images (NDVI) and, for some fields, a date reported from the ground.">
          Reference dates
        </TitleTip>
        {field.reference_dates.length ? (
          field.reference_dates.map((r) => <DateBlock key={r.property} r={r} />)
        ) : (
          <EmptyState title="No reference date for this field." />
        )}
      </section>

      <section className="block" data-testid="reference-radar">
        <TitleTip tip="The radar harvest date of the whole field and of each map segment overlapping it, and how many days it differs from the reference dates.">
          Radar vs reference
        </TitleTip>
        {comparable.length > 0 && (
          <p className="muted small">
            Δ = radar date − reference date, in days (positive: radar later); for a window, 0 inside it,
            else days to its nearer end.
          </p>
        )}
        {outside.map((r) => (
          <p key={r.property} className="muted small">
            {referenceDateLabel(r)} ({referenceDateText(r)}) is outside the radar coverage ({site.series_date_min} to{" "}
            {site.series_date_max}); no difference computed.
          </p>
        ))}
        <div className="table-scroll">
        <table className="table table-compact ref-table">
          <thead>
            <tr>
              <th>Radar</th>
              <th className="num">Overlap</th>
              <th>Harvest date</th>
              {comparable.map((r) => (
                <th key={r.property} className="num" title={referenceDateLabel(r)}>
                  Δ {r.kind === "labelled_window" ? "window" : "reported"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {facts && (
              <tr className="ref-field-row">
                <td title="The library's field-level output for this polygon (summaries.jsonl facts)">Whole field</td>
                <td className="num">–</td>
                <td>
                  {facts.harvest_date ? `${facts.harvest_date}${plusMinus(facts.date_uncertainty_days)}` : "not dated"}
                </td>
                {diffCells(facts.harvest_date)}
              </tr>
            )}
            {field.segments.map((s) => (
              <tr key={s.segment_id}>
                <td>
                  <button type="button" className="link" onClick={() => onOpenSegment(s.segment_id)}>
                    {s.segment_id}
                  </button>
                </td>
                <td className="num">{s.overlap_share < 0.001 ? "<0.1" : (100 * s.overlap_share).toFixed(1)} %</td>
                <td>{s.harvest_date ? `${s.harvest_date}${plusMinus(s.date_uncertainty_days)}` : "not dated"}</td>
                {diffCells(s.harvest_date)}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {field.segments.length === 0 && <p className="muted small">No cane segment of the map overlaps this field.</p>}
        {facts?.cane_confidence && (
          <p className="muted small">
            Field-level cane confidence: {CONFIDENCE[facts.cane_confidence] ?? facts.cane_confidence}. Segments are the
            map's cane segments; overlap is the share of the field's area.
          </p>
        )}
      </section>

      <section className="block">
        <TitleTip tip="A short text about this field from its facts, in English or Spanish; the label says whether an LLM wrote it (then verified) or a template.">
          Summary
        </TitleTip>
        <Summary key={field.field_id} summary={field.summary} />
      </section>
    </div>
  );
}
