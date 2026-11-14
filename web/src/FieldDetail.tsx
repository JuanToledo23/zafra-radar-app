import { useEffect, useState } from "react";
import type { Site } from "./App";
import { niceTicks } from "./chartScale";
import { COHERENCE_COLOR, FIRE_COLOR, HARVEST_COLOR, ORBIT_COLORS, REFERENCE_COLOR } from "./colors";
import { toDay } from "./season";
import TimeSeriesChart, { SeriesSwatch, type ChartSeries } from "./TimeSeriesChart";

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
const SENSORS: Record<string, string> = { N: "VIIRS S-NPP", N20: "VIIRS NOAA-20", N21: "VIIRS NOAA-21" };
const SOURCES: Record<string, string> = { llm: "LLM, verified", template: "template" };
const ORBITS = [
  { key: "asc", label: "Ascending", marker: "circle", dash: undefined },
  { key: "desc", label: "Descending", marker: "square", dash: "5 3" },
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

function orbitSeries(d: SegmentDetail, band: "hv_db" | "hh_db"): ChartSeries[] {
  return ORBITS.map((o) => ({
    key: o.key,
    label: o.label,
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

function Charts({ d, site }: { d: SegmentDetail; site: Site }) {
  const hv = orbitSeries(d, "hv_db");
  const hh = orbitSeries(d, "hh_db");
  const coherence: ChartSeries[] = [
    {
      key: "coh",
      label: "Coherence",
      color: COHERENCE_COLOR,
      marker: "diamond",
      points: d.coherence.flatMap((c) =>
        c.coh_mean === null ? [] : [{ day: toDay(c.sec_date), value: c.coh_mean, note: `pair ${c.ref_date} → ${c.sec_date}` }],
      ),
    },
  ];
  // The site's series range, stretched to a coherence pair that ends after it (Morelos has
  // pairs ending 2026-05-22, after the last backscatter date 2026-05-17).
  const lastPair = Math.max(...coherence[0].points.map((p) => p.day));
  const xDomain: [number, number] = [
    toDay(site.series_date_min) - X_PAD_DAYS,
    Math.max(toDay(site.series_date_max), lastPair) + X_PAD_DAYS,
  ];
  const common = {
    xDomain,
    harvest:
      d.harvest_date !== null ? { day: toDay(d.harvest_date), unc: d.date_uncertainty_days ?? 0 } : null,
    fireDays: d.fires.map((f) => toDay(f.datetime_local)),
  };
  const db = (v: number) => v.toFixed(Number.isInteger(v) ? 0 : 1);

  return (
    <div className="charts">
      <div className="chart-legend">
        {ORBITS.map((o) => (
          <span key={o.key}>
            <SeriesSwatch color={ORBIT_COLORS[o.key]} marker={o.marker} dash={o.dash} /> {o.label} orbit
          </span>
        ))}
        <span>
          <SeriesSwatch color={COHERENCE_COLOR} marker="diamond" /> Coherence (pair mean, at later date)
        </span>
        <span>
          <svg width={26} height={10} aria-hidden="true">
            <rect x={7} y={0} width={12} height={10} fill={HARVEST_COLOR} opacity={0.2} />
            <line x1={13} x2={13} y1={0} y2={10} stroke={HARVEST_COLOR} strokeWidth={2} />
          </svg>{" "}
          Harvest date ± uncertainty
        </span>
        <span>
          <svg width={26} height={10} aria-hidden="true">
            <path d="M13,2l4,7h-8Z" fill={FIRE_COLOR} />
          </svg>{" "}
          Fire within {d.fire_buffer_m} m
        </span>
        <span>
          <svg width={26} height={10} aria-hidden="true">
            <line x1={1} x2={25} y1={5} y2={5} stroke={REFERENCE_COLOR} strokeDasharray="2 3" />
          </svg>{" "}
          Coherence {COHERENCE_REF} reference
        </span>
      </div>
      <h3>HV backscatter</h3>
      <TimeSeriesChart {...common} yTitle="HV (dB)" unit="dB" yTicks={ticksFor(hv, [-25, -10])} series={hv} format={db} />
      <h3>HH backscatter</h3>
      <TimeSeriesChart {...common} yTitle="HH (dB)" unit="dB" yTicks={ticksFor(hh, [-15, 0])} series={hh} format={db} />
      <h3>Interferometric coherence</h3>
      <TimeSeriesChart
        {...common}
        yTitle="Coherence (0–1)"
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

export function Summary({ summary }: { summary: SegmentDetail["summary"] }) {
  const [lang, setLang] = useState<"en" | "es">("en");
  if (!summary) return <p className="muted">No summary for this field yet</p>;
  const s = summary[lang];
  return (
    <>
      <div className="summary-bar">
        <div className="toggle" role="group" aria-label="Summary language">
          {(["en", "es"] as const).map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <span className="source-label">{SOURCES[s.source] ?? s.source}</span>
      </div>
      <p className="summary-text" lang={lang}>
        {s.text}
      </p>
    </>
  );
}

function Fires({ fires, buffer }: { fires: Fire[]; buffer: number }) {
  const newest = [...fires].sort((a, b) => b.datetime_local.localeCompare(a.datetime_local));
  const more = newest.length - MAX_FIRES;
  return (
    <>
      <p className="key-line">
        <strong>{fires.length}</strong> fire detection{fires.length === 1 ? "" : "s"} within {buffer} m
      </p>
      {fires.length > 0 && (
        <table className="fires">
          <thead>
            <tr>
              <th>Local time</th>
              <th>Sensor</th>
              <th className="num">FRP (MW)</th>
              <th className="num">Dist. (m)</th>
            </tr>
          </thead>
          <tbody>
            {newest.slice(0, MAX_FIRES).map((f, i) => (
              <tr key={i}>
                <td>{f.datetime_local.slice(0, 16).replace("T", " ")}</td>
                <td>{SENSORS[f.sensor] ?? f.sensor}</td>
                <td className="num">{num(f.frp, 1)}</td>
                <td className="num">{Math.round(f.distance_m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {more > 0 && <p className="muted small">and {more} more</p>}
    </>
  );
}

function Detail({ d, site, onZoom }: { d: SegmentDetail; site: Site; onZoom: (bbox: SegmentDetail["bbox"]) => void }) {
  const disagree = d.alerts.some((a) => a.code === "RADAR_OPTICAL_DISAGREE");
  return (
    <>
      <div className="field-head">
        <div>
          <div className="field-id">{d.segment_id}</div>
          <div className="muted">
            {d.area_ha.toFixed(2)} ha · {STATUS[d.status] ?? d.status}
          </div>
        </div>
        <button type="button" className="zoom" onClick={() => onZoom(d.bbox)}>
          Zoom to field
        </button>
      </div>

      <section className="block" data-testid="harvest">
        <h3>Harvest</h3>
        {d.harvest_date ? (
          <p className="harvest-date">
            {d.harvest_date}
            {d.date_uncertainty_days !== null && <span> ± {d.date_uncertainty_days} days</span>}
          </p>
        ) : (
          <p className="harvest-date">No harvest dated</p>
        )}
        <table className="props">
          <tbody>
            <tr>
              <th>Date confidence</th>
              <td>{CONFIDENCE[d.confidence] ?? d.confidence}</td>
            </tr>
            <tr>
              <th>Cane probability, optical (p_cane)</th>
              <td>{num(d.p_cane, 2)}</td>
            </tr>
            <tr>
              <th>Cane probability, radar (p_cane_radar)</th>
              <td>{num(d.p_cane_radar, 2)}</td>
            </tr>
          </tbody>
        </table>
        <div className="key-numbers">
          <div>
            <div className="key-value">{num(d.hv_drop_db, 2)} dB</div>
            <div className="muted small">{d.harvest_date ? "HV drop at harvest" : "Largest HV drop"}</div>
          </div>
          <div>
            <div className="key-value">{num(d.coh_min, 2)}</div>
            <div className="muted small">Minimum coherence</div>
          </div>
        </div>
        {disagree && <p className="note">Radar and optical disagree on whether this field is cane.</p>}
        {d.wc_disagrees && <p className="note">The WorldCover land-cover map shows trees or grassland here.</p>}
      </section>

      <section className="block">
        <h3>Summary</h3>
        <Summary key={d.segment_id} summary={d.summary} />
      </section>

      <section className="block">
        <h3>Radar time series</h3>
        <Charts d={d} site={site} />
      </section>

      <section className="block">
        <h3>Fires</h3>
        <Fires fires={d.fires} buffer={d.fire_buffer_m} />
      </section>

      {d.alerts.length > 0 && (
        <section className="block">
          <h3>Alerts</h3>
          <ul className="alerts">
            {d.alerts.map((a) => (
              <li key={a.code}>
                <span className={`sev sev-${a.severity}`}>{a.severity}</span> {a.code}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

type Props = { site: Site; segmentId: string; onZoom: (bbox: SegmentDetail["bbox"]) => void };

export default function FieldDetail({ site, segmentId, onZoom }: Props) {
  const load = useSegment(site.site_id, segmentId);
  return (
    <div className="field" data-testid="field-detail" data-state={load.state}>
      {load.state === "loading" && <p className="muted">Loading {segmentId}…</p>}
      {load.state === "not-found" && <p className="muted">Segment {segmentId} was not found for this site.</p>}
      {load.state === "error" && <p className="error">Could not load {segmentId}: {load.message}</p>}
      {load.state === "ok" && <Detail d={load.data} site={site} onZoom={onZoom} />}
    </div>
  );
}
