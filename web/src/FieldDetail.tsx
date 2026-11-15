import { useEffect, useState } from "react";
import type { Site } from "./App";
import { niceTicks } from "./chartScale";
import { COHERENCE_COLOR, FIRE_COLOR, HARVEST_COLOR, ORBIT_COLORS, REFERENCE_COLOR } from "./colors";
import { alertLabel, severityLabel } from "./alerts";
import { formatDate, formatNumber, t, tValue, useLang, type Lang } from "./i18n";
import { Icon } from "./icons";
import { toDay } from "./season";
import TimeSeriesChart, { SeriesSwatch, type ChartSeries } from "./TimeSeriesChart";
import { Disclosure, EmptyState, Segmented, Skeleton, TitleTip } from "./ui";

// GET /segments/{site}/{segment_id} (docs/API.md).
type SeriesRow = { date: string; hv_db: number | null; hh_db: number | null };
type CoherenceRow = { ref_date: string; sec_date: string; coh_mean: number | null; coh_min: number | null };
type Fire = {
  datetime_local: string;
  sensor: string;
  source: string;
  frp: number | null;
  confidence: string | null;
  distance_m: number;
};
type SummaryText = { text: string; source: string };
type Alert = { code: string; severity: string };
export type SegmentDetail = {
  site_id: string;
  segment_id: string;
  area_ha: number;
  p_cane: number | null;
  p_cane_radar: number | null;
  harvest_date: string | null;
  date_uncertainty_days: number | null;
  status: string;
  confidence: string;
  hv_drop_db: number | null;
  coh_min: number | null;
  wc_disagrees: boolean | null;
  bbox: [number, number, number, number];
  series: { asc: SeriesRow[]; desc: SeriesRow[] };
  coherence: CoherenceRow[];
  fires: Fire[];
  fire_buffer_m: number;
  summary: { es: SummaryText; en: SummaryText } | null;
  alerts: Alert[];
};

type Load =
  | { state: "loading" }
  | { state: "not-found" }
  | { state: "error"; message: string }
  | { state: "ok"; data: SegmentDetail };

// Plain-language values for the library's status and date-confidence codes (research
// library docs/METHODS.md section 6) are in i18n.ts: status_<code>, fconf_<code>.
const SENSORS: Record<string, string> = { N: "VIIRS S-NPP", N20: "VIIRS NOAA-20", N21: "VIIRS NOAA-21" };
const ORBITS = [
  { key: "asc", marker: "circle", dash: undefined },
  { key: "desc", marker: "square", dash: "5 3" },
] as const;
const MAX_FIRES = 10;
const COHERENCE_REF = 0.3;
const X_PAD_DAYS = 4; // keeps markers at the ends of the season inside the plot

const num = (v: number | null, digits: number) => (v === null ? "–" : v.toFixed(digits));

/** Fetch one segment; a new id aborts the request still in flight for the previous one. */
function useSegment(siteId: string, segmentId: string): Load {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  useEffect(() => {
    const ctrl = new AbortController();
    setLoad({ state: "loading" });
    fetch(`/api/segments/${siteId}/${encodeURIComponent(segmentId)}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (r.status === 404) return setLoad({ state: "not-found" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setLoad({ state: "ok", data: await r.json() });
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setLoad({ state: "error", message: String(e.message ?? e) });
      });
    return () => ctrl.abort();
  }, [siteId, segmentId]);
  return load;
}

function orbitSeries(lang: Lang, d: SegmentDetail, band: "hv_db" | "hh_db"): ChartSeries[] {
  return ORBITS.map((o) => ({
    key: o.key,
    label: t(lang, `orbit_${o.key}`),
    color: ORBIT_COLORS[o.key],
    marker: o.marker,
    dash: o.dash,
    points: d.series[o.key].flatMap((r) => (r[band] === null ? [] : [{ day: toDay(r.date), value: r[band]! }])),
  }));
}

/** Y ticks covering every value, with a fallback range when there is none. */
function ticksFor(series: ChartSeries[], fallback: [number, number]): number[] {
  const values = series.flatMap((s) => s.points.map((p) => p.value));
  return values.length ? niceTicks(Math.min(...values), Math.max(...values), 4) : niceTicks(...fallback, 4);
}

const db = (v: number) => v.toFixed(Number.isInteger(v) ? 0 : 1);

/** What the charts of one field share: the date axis, the harvest band and the fire days. */
function chartBase(d: SegmentDetail, site: Site, fires: boolean) {
  // The site's series range, stretched to a coherence pair that ends after it (Morelos has
  // pairs ending 2026-05-22, after the last backscatter date 2026-05-17).
  const lastPair = Math.max(...d.coherence.flatMap((c) => (c.coh_mean === null ? [] : [toDay(c.sec_date)])));
  const xDomain: [number, number] = [
    toDay(site.series_date_min) - X_PAD_DAYS,
    Math.max(toDay(site.series_date_max), lastPair) + X_PAD_DAYS,
  ];
  return {
    xDomain,
    harvest: d.harvest_date !== null ? { day: toDay(d.harvest_date), unc: d.date_uncertainty_days ?? 0 } : null,
    fireDays: fires ? d.fires.map((f) => toDay(f.datetime_local)) : [],
  };
}

function OrbitLegend() {
  const lang = useLang();
  return (
    <>
      {ORBITS.map((o) => (
        <span key={o.key}>
          <SeriesSwatch color={ORBIT_COLORS[o.key]} marker={o.marker} dash={o.dash} /> {t(lang, `legOrbit_${o.key}`)}
        </span>
      ))}
    </>
  );
}

function HarvestBandSwatch() {
  return (
    <svg width={26} height={10} aria-hidden="true">
      <rect x={7} y={0} width={12} height={10} fill={HARVEST_COLOR} opacity={0.2} />
      <line x1={13} x2={13} y1={0} y2={10} stroke={HARVEST_COLOR} strokeWidth={2} />
    </svg>
  );
}

/** The one chart shown by default: HV over the season, with the harvest date marked. */
function HvChart({ d, site }: { d: SegmentDetail; site: Site }) {
  const lang = useLang();
  const hv = orbitSeries(lang, d, "hv_db");
  return (
    <div className="charts" data-testid="hv-chart">
      <div className="chart-legend">
        <OrbitLegend />
        {d.harvest_date && (
          <span>
            <HarvestBandSwatch /> {t(lang, "legHarvestBand")}
          </span>
        )}
      </div>
      <TimeSeriesChart {...chartBase(d, site, false)} yTitle={t(lang, "yHv")} unit="dB" yTicks={ticksFor(hv, [-25, -10])} series={hv} format={db} xLabels />
    </div>
  );
}

/** More detail: HV, HH and coherence on one date axis, with the nearby fires. */
function Charts({ d, site }: { d: SegmentDetail; site: Site }) {
  const lang = useLang();
  const hv = orbitSeries(lang, d, "hv_db");
  const hh = orbitSeries(lang, d, "hh_db");
  const coherence: ChartSeries[] = [
    {
      key: "coh",
      label: t(lang, "coherence"),
      color: COHERENCE_COLOR,
      marker: "diamond",
      points: d.coherence.flatMap((c) =>
        c.coh_mean === null
          ? []
          : [{ day: toDay(c.sec_date), value: c.coh_mean, note: t(lang, "pairNote", { a: formatDate(lang, c.ref_date), b: formatDate(lang, c.sec_date) }) }],
      ),
    },
  ];
  const common = chartBase(d, site, true);

  return (
    <div className="charts">
      <div className="chart-legend">
        <OrbitLegend />
        <span>
          <SeriesSwatch color={COHERENCE_COLOR} marker="diamond" /> {t(lang, "legCoherence")}
        </span>
        <span>
          <HarvestBandSwatch /> {t(lang, "legHarvestBand")}
        </span>
        <span>
          <svg width={26} height={10} aria-hidden="true">
            <path d="M13,2l4,7h-8Z" fill={FIRE_COLOR} />
          </svg>{" "}
          {t(lang, "legFire", { m: d.fire_buffer_m })}
        </span>
        <span>
          <svg width={26} height={10} aria-hidden="true">
            <line x1={1} x2={25} y1={5} y2={5} stroke={REFERENCE_COLOR} strokeDasharray="2 3" />
          </svg>{" "}
          {t(lang, "legCohRef", { v: COHERENCE_REF })}
        </span>
      </div>
      <TitleTip as="h3" tip={t(lang, "tipHv")}>
        {t(lang, "prod_HV")}
      </TitleTip>
      <TimeSeriesChart {...common} yTitle={t(lang, "yHv")} unit="dB" yTicks={ticksFor(hv, [-25, -10])} series={hv} format={db} />
      <TitleTip as="h3" tip={t(lang, "tipHh")}>
        {t(lang, "hhTitle")}
      </TitleTip>
      <TimeSeriesChart {...common} yTitle={t(lang, "yHh")} unit="dB" yTicks={ticksFor(hh, [-15, 0])} series={hh} format={db} />
      <TitleTip as="h3" tip={t(lang, "tipCoh")}>
        {t(lang, "cohTitle")}
      </TitleTip>
      <TimeSeriesChart
        {...common}
        yTitle={t(lang, "yCoh")}
        unit=""
        yTicks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
        series={coherence}
        reference={{ value: COHERENCE_REF, label: String(COHERENCE_REF) }}
        format={(v) => v.toFixed(Number.isInteger(v * 10) ? 1 : 2)}
        xLabels
      />
    </div>
  );
}

/** The field's summary in English or Spanish; it opens in the interface language. */
export function Summary({ summary }: { summary: SegmentDetail["summary"] }) {
  const appLang = useLang();
  const [lang, setLang] = useState<Lang>(appLang);
  useEffect(() => setLang(appLang), [appLang]);
  if (!summary) return <EmptyState title={t(appLang, "noSummary")} />;
  const s = summary[lang];
  return (
    <>
      <div className="summary-bar">
        <Segmented
          label={t(appLang, "summaryLang")}
          size="sm"
          value={lang}
          onChange={setLang}
          options={(["en", "es"] as const).map((l) => ({ value: l, label: l.toUpperCase() }))}
        />
        <span className="pill">{tValue(appLang, `src_${s.source}`, s.source)}</span>
      </div>
      <p className="summary-text" lang={lang}>
        {s.text}
      </p>
    </>
  );
}

function Fires({ fires, buffer }: { fires: Fire[]; buffer: number }) {
  const lang = useLang();
  const newest = [...fires].sort((a, b) => b.datetime_local.localeCompare(a.datetime_local));
  const more = newest.length - MAX_FIRES;
  return (
    <>
      <p className="key-line">
        <strong>{formatNumber(lang, fires.length)}</strong> {t(lang, fires.length === 1 ? "fireDetOne" : "fireDetMany", { m: buffer })}
      </p>
      {fires.length > 0 && (
        <table className="table table-compact fires">
          <thead>
            <tr>
              <th>{t(lang, "colLocalTime")}</th>
              <th>{t(lang, "colSensor")}</th>
              <th className="num">{t(lang, "colFrp")}</th>
              <th className="num">{t(lang, "colDist")}</th>
            </tr>
          </thead>
          <tbody>
            {newest.slice(0, MAX_FIRES).map((f, i) => (
              <tr key={i}>
                <td>
                  {formatDate(lang, f.datetime_local)} {f.datetime_local.slice(11, 16)}
                </td>
                <td>{SENSORS[f.sensor] ?? f.sensor}</td>
                <td className="num">{num(f.frp, 1)}</td>
                <td className="num">{Math.round(f.distance_m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {more > 0 && <p className="muted small">{t(lang, "andMore", { n: formatNumber(lang, more) })}</p>}
    </>
  );
}

function Detail({ d, site, onZoom }: { d: SegmentDetail; site: Site; onZoom: (bbox: SegmentDetail["bbox"]) => void }) {
  const lang = useLang();
  const disagree = d.alerts.some((a) => a.code === "RADAR_OPTICAL_DISAGREE");
  return (
    <>
      <div className="field-head">
        <div>
          <div className="field-id">{d.segment_id}</div>
          <div className="muted">
            {formatNumber(lang, d.area_ha, 2)} ha · {tValue(lang, `status_${d.status}`, d.status)}
          </div>
        </div>
        <button type="button" className="btn btn-secondary btn-sm zoom" onClick={() => onZoom(d.bbox)}>
          <Icon name="target" /> {t(lang, "zoomToField")}
        </button>
      </div>

      <p className="field-lead" data-testid="harvest-lead">
        {d.harvest_date ? (
          <>
            {t(lang, "leadHarvested", { date: formatDate(lang, d.harvest_date) })}
            {d.date_uncertainty_days !== null && (
              <span className="field-lead-unc"> {t(lang, "leadUncertainty", { n: formatNumber(lang, d.date_uncertainty_days) })}</span>
            )}
          </>
        ) : (
          t(lang, "leadNone")
        )}
      </p>

      <section className="block">
        <TitleTip tip={t(lang, "tipHv")}>{t(lang, "hvTitle")}</TitleTip>
        <HvChart d={d} site={site} />
      </section>

      <section className="block">
        <TitleTip tip={t(lang, "tipSummary")}>{t(lang, "summary")}</TitleTip>
        <Summary key={d.segment_id} summary={d.summary} />
      </section>

      <Disclosure label={t(lang, "moreDetail")} testId="more-detail" className="field-more">
        <section className="block" data-testid="harvest">
          <TitleTip tip={t(lang, "tipHarvest")}>{t(lang, "harvest")}</TitleTip>
          <table className="props">
            <tbody>
              <tr>
                <th>{t(lang, "dateConfidence")}</th>
                <td>{tValue(lang, `fconf_${d.confidence}`, d.confidence)}</td>
              </tr>
              <tr>
                <th>{t(lang, "pCane")}</th>
                <td>{num(d.p_cane, 2)}</td>
              </tr>
              <tr>
                <th>{t(lang, "pCaneRadar")}</th>
                <td>{num(d.p_cane_radar, 2)}</td>
              </tr>
            </tbody>
          </table>
          <div className="key-numbers">
            <div className="stat">
              <div className="key-value">{num(d.hv_drop_db, 2)} dB</div>
              <div className="stat-label">{t(lang, d.harvest_date ? "hvDropAt" : "hvDropMax")}</div>
            </div>
            <div className="stat">
              <div className="key-value">{num(d.coh_min, 2)}</div>
              <div className="stat-label">{t(lang, "cohMin")}</div>
            </div>
          </div>
          {disagree && <p className="note">{t(lang, "noteDisagree")}</p>}
          {d.wc_disagrees && <p className="note">{t(lang, "noteWorldCover")}</p>}
        </section>

        <section className="block">
          <TitleTip tip={t(lang, "tipSeries")}>{t(lang, "seriesTitle")}</TitleTip>
          <Charts d={d} site={site} />
        </section>

        <section className="block">
          <TitleTip tip={t(lang, "tipFires", { m: d.fire_buffer_m })}>{t(lang, "fires")}</TitleTip>
          <Fires fires={d.fires} buffer={d.fire_buffer_m} />
        </section>

        {d.alerts.length > 0 && (
          <section className="block">
            <h3>{t(lang, "alerts")}</h3>
            <ul className="alerts">
              {d.alerts.map((a) => (
                <li key={a.code}>
                  <span className={`sev sev-${a.severity}`}>{severityLabel(lang, a.severity)}</span> {alertLabel(lang, a.code)}{" "}
                  <span className="muted small">({a.code})</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Disclosure>
    </>
  );
}

type Props = { site: Site; segmentId: string; onZoom: (bbox: SegmentDetail["bbox"]) => void };

export default function FieldDetail({ site, segmentId, onZoom }: Props) {
  const lang = useLang();
  const load = useSegment(site.site_id, segmentId);
  return (
    <div className="field" data-testid="field-detail" data-state={load.state}>
      {load.state === "loading" && <Skeleton lines={6} label={t(lang, "loadingId", { id: segmentId })} />}
      {load.state === "not-found" && <EmptyState icon="search" title={t(lang, "segmentNotFound", { id: segmentId })} />}
      {load.state === "error" && <p className="error">{t(lang, "couldNotLoad", { id: segmentId, msg: load.message })}</p>}
      {load.state === "ok" && <Detail d={load.data} site={site} onZoom={onZoom} />}
    </div>
  );
}
