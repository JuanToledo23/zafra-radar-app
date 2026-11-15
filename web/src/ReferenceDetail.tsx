import type { Site } from "./App";
import { Summary } from "./FieldDetail";
import { formatDate, formatNumber, t, tValue, useLang } from "./i18n";
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

// Plain-language values of the reference fields' NDVI labels (research library script 07)
// are in i18n.ts: ref_<label>; the field-level cane confidence reuses conf_<level>.

function DateBlock({ r }: { r: ReferenceDate }) {
  const lang = useLang();
  return (
    <div className="ref-date">
      <div className="muted small">{referenceDateLabel(lang, r)}</div>
      <div className="ref-date-value">{referenceDateText(lang, r)}</div>
      {(r.event || r.source || r.note) && (
        <table className="props ref-verbatim">
          <tbody>
            {r.event && (
              <tr>
                <th>{t(lang, "event")}</th>
                <td lang="es">{r.event}</td>
              </tr>
            )}
            {r.source && (
              <tr>
                <th>{t(lang, "source")}</th>
                <td lang="es">{r.source}</td>
              </tr>
            )}
            {r.note && (
              <tr>
                <th>{t(lang, "note")}</th>
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
  const lang = useLang();
  const label = (v: string | null | undefined) => (v ? tValue(lang, `ref_${v}`, v) : "–");
  const plusMinus = (unc: number | null | undefined) => (unc == null ? "" : t(lang, "plusMinusDays", { n: unc }));
  const dated = (date: string | null | undefined, unc: number | null | undefined) =>
    date ? `${formatDate(lang, date)}${plusMinus(unc)}` : t(lang, "notDated");
  // Only reference dates inside the radar coverage can be compared with a radar date.
  const comparable = field.reference_dates.filter((r) => inCoverage(r, site.series_date_min, site.series_date_max));
  const outside = field.reference_dates.filter((r) => !comparable.includes(r));
  const facts = field.facts;
  const diffCells = (radar: string | null | undefined) =>
    comparable.map((r) => (
      <td key={r.property} className="num">
        {radar ? formatDiff(lang, daysVsReference(radar, r), r.date_start !== r.date_end) : "–"}
      </td>
    ));

  return (
    <div className="field" data-testid="reference-detail">
      <div className="field-head">
        <div>
          <div className="field-id">{field.field_id}</div>
          <div className="muted">
            {t(lang, "refMeta", { ha: field.area_ha === null ? "–" : formatNumber(lang, field.area_ha, 2) })}
            {field.municipio ? ` · ${field.municipio}` : ""}
          </div>
          <div className="muted small">{t(lang, "ndviLabel", { l: label(field.label), h: label(field.hyp) })}</div>
        </div>
        <button type="button" className="btn btn-secondary btn-sm zoom" onClick={() => onZoom(field.bbox)}>
          <Icon name="target" /> {t(lang, "zoomToField")}
        </button>
      </div>

      <section className="block" data-testid="reference-dates">
        <TitleTip tip={t(lang, "tipRefDates")}>{t(lang, "referenceDates")}</TitleTip>
        {field.reference_dates.length ? (
          field.reference_dates.map((r) => <DateBlock key={r.property} r={r} />)
        ) : (
          <EmptyState title={t(lang, "noRefDate")} />
        )}
      </section>

      <section className="block" data-testid="reference-radar">
        <TitleTip tip={t(lang, "tipRadarVsRef")}>{t(lang, "radarVsRef")}</TitleTip>
        {comparable.length > 0 && <p className="muted small">{t(lang, "deltaHelp")}</p>}
        {outside.map((r) => (
          <p key={r.property} className="muted small">
            {t(lang, "outsideCoverage", {
              label: referenceDateLabel(lang, r),
              text: referenceDateText(lang, r),
              from: formatDate(lang, site.series_date_min),
              to: formatDate(lang, site.series_date_max),
            })}
          </p>
        ))}
        <div className="table-scroll">
        <table className="table table-compact ref-table">
          <thead>
            <tr>
              <th>{t(lang, "colRadar")}</th>
              <th className="num">{t(lang, "colOverlap")}</th>
              <th>{t(lang, "colHarvestDate")}</th>
              {comparable.map((r) => (
                <th key={r.property} className="num" title={referenceDateLabel(lang, r)}>
                  {t(lang, r.kind === "labelled_window" ? "deltaWindow" : "deltaReported")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {facts && (
              <tr className="ref-field-row">
                <td title={t(lang, "wholeFieldTitle")}>{t(lang, "wholeField")}</td>
                <td className="num">–</td>
                <td>{dated(facts.harvest_date, facts.date_uncertainty_days)}</td>
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
                <td className="num">{s.overlap_share < 0.001 ? "<0.1" : formatNumber(lang, 100 * s.overlap_share, 1)} %</td>
                <td>{dated(s.harvest_date, s.date_uncertainty_days)}</td>
                {diffCells(s.harvest_date)}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {field.segments.length === 0 && <p className="muted small">{t(lang, "noOverlap")}</p>}
        {facts?.cane_confidence && (
          <p className="muted small">
            {t(lang, "caneConfidence", { c: tValue(lang, `conf_${facts.cane_confidence}`, facts.cane_confidence) })}
          </p>
        )}
      </section>

      <section className="block">
        <TitleTip tip={t(lang, "tipSummary")}>{t(lang, "summary")}</TitleTip>
        <Summary key={field.field_id} summary={field.summary} />
      </section>
    </div>
  );
}
