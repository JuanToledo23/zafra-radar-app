import { useEffect, useState, type ReactNode } from "react";
import type { Site } from "./App";
import { linearScale, monthTicks, niceTicks } from "./chartScale";
import { GRID_COLOR, HARVEST_COLOR, OFFICIAL_COLOR } from "./colors";
import { count, formatDate, formatNumber, LOCALE, siteName, t, type Key, type Lang } from "./i18n";
import {
  FINDINGS_URL,
  LIBRARY_URL,
  REPO_URL,
  seasonLabel,
  type HarvestedRow,
  type NotDetectedRow,
  type OpsBrief,
  type OpsFires,
  type OpsSeries,
} from "./ops";
import { fromDay, mondayOf, toDay } from "./season";
import { MarkerShape, SeriesSwatch } from "./TimeSeriesChart";

// The printable weekly report of the mill operations screen, as of one date: the brief, two
// charts and the lists, from the same /ops endpoints (no hindsight, docs/API.md). Opened in its
// own tab at /?report=<site>&as_of=<date>&lang=<lang>, without the app's header.

const HARVESTED_ROWS = 25;
const NOT_DETECTED_ROWS = 15;
const PAGE = 500; // the API's largest page
// Date error per site, quoted from the research library's docs/VALIDATION.md: Morelos :18
// (summary) and :68 (xgboost, delivered), with :8-12 (NDVI references) and :369-370
// (errors optimistic); Brazil :26 (summary) and :220-221 (gate B, delivered), sample at :210.
const DATE_ERROR: Record<string, Key> = { morelos: "methodErrorMorelos", brazil: "methodErrorBrazil" };

type Data = {
  site: Site;
  brief: OpsBrief;
  series: OpsSeries;
  harvested: HarvestedRow[];
  harvestedTotal: number;
  notDetected: NotDetectedRow[];
  fires: OpsFires;
};

const getJson = <T,>(url: string): Promise<T> =>
  fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));

/** Every row of a paged /ops list. */
async function allRows<R>(base: string): Promise<R[]> {
  const rows: R[] = [];
  for (;;) {
    const page = await getJson<{ total: number; rows: R[] }>(`${base}&limit=${PAGE}&offset=${rows.length}`);
    rows.push(...page.rows);
    if (!page.rows.length || rows.length >= page.total) return rows;
  }
}

async function load(siteId: string, iso: string): Promise<Data> {
  const api = `/api/ops/${siteId}`;
  const [sites, brief, series, harvested, notDetected, fires] = await Promise.all([
    getJson<Site[]>("/api/sites"),
    getJson<OpsBrief>(`${api}?as_of=${iso}`),
    getJson<OpsSeries>(`${api}/series?as_of=${iso}`),
    allRows<HarvestedRow>(`${api}/harvested?as_of=${iso}&days=7`),
    getJson<{ total: number; rows: NotDetectedRow[] }>(`${api}/not-detected?as_of=${iso}&limit=${NOT_DETECTED_ROWS}&offset=0`),
    getJson<OpsFires>(`${api}/fires?as_of=${iso}`),
  ]);
  const site = sites.find((s) => s.site_id === siteId);
  if (!site) throw new Error(`unknown site: ${siteId}`);
  // Largest first; the screen's list is most recent first.
  const largest = [...harvested].sort((a, b) => b.area_ha - a.area_ha || a.segment_id.localeCompare(b.segment_id));
  return {
    site,
    brief,
    series,
    harvested: largest.slice(0, HARVESTED_ROWS),
    harvestedTotal: harvested.length,
    notDetected: notDetected.rows,
    fires,
  };
}

export default function WeeklyReport({ siteId, iso, lang }: { siteId: string; iso: string; lang: Lang }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generated] = useState(() => new Date());

  useEffect(() => {
    load(siteId, iso).then(setData, (e: Error) => setError(e.message));
  }, [siteId, iso]);

  useEffect(() => {
    if (data) document.title = `${t(lang, "reportTitle")} · ${siteName(lang, data.site).split(",")[0]} · ${data.brief.as_of}`;
  }, [data, lang]);

  return (
    <div className="report-page" lang={lang}>
      <div className="report-toolbar no-print">
        <button type="button" className="zoom" data-testid="report-print" disabled={!data} onClick={() => window.print()}>
          {t(lang, "print")}
        </button>
        {error && <span className="error">{t(lang, "loadError", { msg: error })}</span>}
        {!data && !error && <span className="muted">{t(lang, "loading")}</span>}
      </div>
      {data && <Report data={data} lang={lang} generated={generated} />}
    </div>
  );
}

function Report({ data, lang, generated }: { data: Data; lang: Lang; generated: Date }) {
  const { site, brief: b, series, fires: f } = data;
  const n = (v: number, d = 0) => formatNumber(lang, v, d);
  const ha = (v: number) => `${n(v)} ha`;
  const pct = (v: number | null) => `${n((v ?? 0) * 100, 1)} %`;
  const date = (v: string) => formatDate(lang, v);
  const fields = (v: number) => count(lang, v, "field", "fields");
  const season = seasonLabel(site.season);
  const tonnage = b.cane_tonnage_estimate;
  const last7 = b.harvested_last_7_days;
  const prev7 = b.harvested_previous_7_days;
  const nd = b.not_yet_detected;
  const moreHarvested = data.harvestedTotal - data.harvested.length;
  const stamp = new Intl.DateTimeFormat(LOCALE[lang], {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  }).format(generated);

  return (
    <article className="report" data-testid="weekly-report" data-ready="true" data-as-of={b.as_of}>
      <header className="report-head">
        <div>
          <h1>{t(lang, "reportTitle")}</h1>
          <div className="report-site" data-testid="report-site">{siteName(lang, site)}</div>
          <div className="report-sub">
            {t(lang, "reportSeason", { season })} · <strong>{t(lang, "weekEnding", { date: date(b.as_of) })}</strong>
          </div>
        </div>
        <div className="report-replay">{t(lang, "seasonReplay", { season })}</div>
      </header>
      <p className="report-timing">{t(lang, "timing")}</p>

      <section className="report-section">
        <h2>{t(lang, "keyNumbers")}</h2>
        <div className="report-numbers">
          <Num label={t(lang, "harvested")} value={ha(b.harvested.area_ha)}
            note={`${pct(b.harvested.share_of_cane_area)} ${t(lang, "ofCane")} (${ha(b.cane.area_ha)})`} />
          <Num label={t(lang, "last7")} value={ha(last7.area_ha)}
            note={`${t(lang, "last7Note", { from: date(last7.from), to: date(last7.to), fields: fields(last7.segments) })}; ${t(lang, "vsPrev7", { ha: ha(prev7.area_ha) })}`} />
          <Num label={t(lang, "pace")} value={`${n(b.pace.ha_per_week)} ${t(lang, "paceUnit")}`}
            note={t(lang, "paceNote", { from: date(b.pace.weeks[0].start), to: date(b.pace.weeks[b.pace.weeks.length - 1].end) })} />
          <Num label={t(lang, "notDetected")} value={ha(nd.area_ha)}
            note={`${pct(nd.share_of_cane_area)} ${t(lang, "ofCane")} · ${fields(nd.segments)}`} />
          {tonnage !== undefined && (
            <Num label={t(lang, "tonnage")} value={tonnage ? `≈ ${n(tonnage.tonnes)} t` : "—"}
              note={tonnage
                ? t(lang, "tonnageNote", { yield: n(tonnage.yield_t_ha, 2), date: date(tonnage.official_cutoff) })
                : t(lang, "tonnageNone")} />
          )}
          {b.official !== undefined && (
            <Num label={t(lang, "official")} value={b.official ? ha(b.official.official_harvested_ha) : "—"}
              note={b.official
                ? t(lang, "officialNote", { date: date(b.official.cutoff), ha: ha(b.official.detected_harvested_ha),
                  pct: n(b.official.detected_share_of_official * 100, 1) })
                : t(lang, "officialNone")} />
          )}
        </div>
      </section>

      <section className="report-section report-charts">
        <figure>
          <figcaption>{t(lang, "chartWeekly")}</figcaption>
          <WeeklyBars series={series} lang={lang} />
          <p className="report-note">
            {t(lang, "chartWeeklyNote")}
            {series.weeks[series.weeks.length - 1].partial && ` ${t(lang, "chartWeeklyPartial", { date: date(b.as_of) })}`}
          </p>
        </figure>
        {series.official && (
          <figure>
            <figcaption>{t(lang, "chartCumulative")}</figcaption>
            <CumulativeLines series={series} lang={lang} />
            <div className="report-legends">
              <span className="report-legend"><SeriesSwatch color={OFFICIAL_COLOR} marker="circle" /> {t(lang, "seriesOfficial")}</span>
              <span className="report-legend"><SeriesSwatch color={HARVEST_COLOR} marker="square" dash="5 3" /> {t(lang, "seriesDetected")}</span>
            </div>
            <p className="report-note">{t(lang, "chartCumulativeNote", { date: date(b.as_of) })}</p>
          </figure>
        )}
      </section>

      <section className="report-section" data-testid="report-harvested">
        <h2>{t(lang, "reportHarvested")}</h2>
        {data.harvestedTotal === 0 ? (
          <p className="report-note">{t(lang, "emptyHarvested")}</p>
        ) : (
          <>
            <p className="report-note">
              {t(lang, "reportHarvestedNote", { shown: n(data.harvested.length), total: fields(data.harvestedTotal),
                from: date(last7.from), to: date(last7.to) })}
            </p>
            <table className="report-table">
              <thead>
                <tr>
                  <th>{t(lang, "colField")}</th>
                  <th>{t(lang, "colHarvestDate")}</th>
                  <th className="num">{t(lang, "colArea")}</th>
                  {tonnage && <th className="num">{t(lang, "colTonnes")}</th>}
                </tr>
              </thead>
              <tbody>
                {data.harvested.map((r) => (
                  <tr key={r.segment_id}>
                    <td>{r.segment_id}</td>
                    <td>
                      {date(r.harvest_date)}
                      {r.date_uncertainty_days !== null && ` ± ${n(r.date_uncertainty_days, 1)} d`}
                    </td>
                    <td className="num">{n(r.area_ha, 2)}</td>
                    {tonnage && <td className="num">{r.tonnes_estimate === null ? "—" : `≈ ${n(r.tonnes_estimate)}`}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="report-note" data-testid="report-more">
              {moreHarvested > 0 ? t(lang, "reportMoreCsv", { n: fields(moreHarvested) }) : t(lang, "reportNoneMore")}
            </p>
          </>
        )}
      </section>

      <section className="report-section" data-testid="report-not-detected">
        <h2>{t(lang, "notDetected")}</h2>
        {nd.segments === 0 ? (
          <p className="report-note">{t(lang, "emptyNotDetected")}</p>
        ) : (
          <>
            <p className="report-note">
              {t(lang, "reportNotDetectedNote", { fields: fields(nd.segments), ha: ha(nd.area_ha),
                pct: pct(nd.share_of_cane_area), shown: n(data.notDetected.length) })}
            </p>
            <table className="report-table report-table-cols">
              <thead>
                <tr>
                  <th>{t(lang, "colField")}</th>
                  <th className="num">{t(lang, "colArea")}</th>
                </tr>
              </thead>
              <tbody>
                {data.notDetected.map((r) => (
                  <tr key={r.segment_id}>
                    <td>{r.segment_id}</td>
                    <td className="num">{n(r.area_ha, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="report-note">{t(lang, "notDetectedHelp")}</p>
          </>
        )}
      </section>

      <section className="report-section" data-testid="report-fires">
        <h2>{t(lang, "reportFires")}</h2>
        <p className="report-context">{t(lang, "fireText")}</p>
        <p className="report-note">
          {t(lang, "fireSummary", { n: count(lang, f.detections, "detection", "detections"), m: f.fire_buffer_m,
            from: date(f.from), to: date(f.to), night: n(f.night) })}
        </p>
        {f.detections > 0 && <FireDays fires={f} lang={lang} />}
      </section>

      <section className="report-section report-method">
        <h2>{t(lang, "methodTitle")}</h2>
        <ul>
          <li>{t(lang, "methodRadar")}</li>
          <li>{t(lang, DATE_ERROR[site.site_id] ?? "methodErrorNone")}</li>
          <li>{t(lang, "methodNotEvery")}</li>
          <li>
            {withLinks(t(lang, "methodLinks"), {
              findings: <a href={FINDINGS_URL}>{FINDINGS_URL}</a>,
              library: <a href={LIBRARY_URL}>{LIBRARY_URL}</a>,
            })}
          </li>
        </ul>
      </section>

      <footer className="report-foot">
        <span>{t(lang, "generated", { ts: stamp })}</span>
        <a href={REPO_URL}>{REPO_URL}</a>
      </footer>
    </article>
  );
}

/** `text` with each {name} placeholder replaced by `parts[name]`. */
function withLinks(text: string, parts: Record<string, ReactNode>): ReactNode[] {
  return text.split(/(\{\w+\})/).map((s, i) => {
    const key = s.match(/^\{(\w+)\}$/)?.[1];
    return key && key in parts ? <span key={i}>{parts[key]}</span> : s;
  });
}

function Num({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="report-num">
      <div className="report-num-label">{label}</div>
      <div className="report-num-value">{value}</div>
      <div className="report-num-note">{note}</div>
    </div>
  );
}

/** The fire detections of the 7 days counted per local date: no place, no field. */
function FireDays({ fires, lang }: { fires: OpsFires; lang: Lang }) {
  const n = (v: number, d = 0) => formatNumber(lang, v, d);
  const days: { date: string; count: number; night: number; frp: number | null }[] = [];
  for (let d = toDay(fires.to); d >= toDay(fires.from); d--) days.push({ date: fromDay(d), count: 0, night: 0, frp: null });
  for (const r of fires.rows) {
    const day = days.find((x) => x.date === r.datetime_local.slice(0, 10));
    if (!day) continue;
    day.count++;
    if (Number(r.datetime_local.slice(11, 13)) < fires.night_before_hour) day.night++;
    if (r.frp !== null) day.frp = Math.max(day.frp ?? 0, r.frp);
  }
  return (
    <table className="report-table report-table-cols">
      <thead>
        <tr>
          <th>{t(lang, "colDate")}</th>
          <th className="num">{t(lang, "colDetections")}</th>
          <th className="num">{t(lang, "colNight")}</th>
          <th className="num">{t(lang, "colMaxFrp")}</th>
        </tr>
      </thead>
      <tbody>
        {days.map((d) => (
          <tr key={d.date}>
            <td>{formatDate(lang, d.date)}</td>
            <td className="num">{n(d.count)}</td>
            <td className="num">{n(d.night)}</td>
            <td className="num">{d.frp === null ? "—" : n(d.frp, 1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Both charts: a fixed viewBox scaled to the column width, x axis ending with the report's date,
// so nothing after it can be drawn. The cumulative chart starts with the series, the weekly
// one at the first week with detected harvests (four weeks before the date when there is none).
const EMPTY_WEEKS_DAYS = 28;
const W = 340;
const H = 150;
const M = { left: 44, right: 8, top: 8, bottom: 30 };

function axis(series: OpsSeries, lang: Lang, start = toDay(series.weeks[0].start)) {
  const xDomain: [number, number] = [start, toDay(series.as_of) + 1];
  const x = linearScale(xDomain, [M.left, W - M.right]);
  const month = new Intl.DateTimeFormat(LOCALE[lang], { month: "short", timeZone: "UTC" });
  const months = monthTicks(xDomain[0], xDomain[1]).map((d) => ({ d, label: month.format(new Date(fromDay(d))).replace(".", "") }));
  return { xDomain, x, months };
}

function Frame({ x, xDomain, y, ticks, months, lang, children }: {
  x: (d: number) => number;
  xDomain: [number, number];
  y: (v: number) => number;
  ticks: number[];
  months: { d: number; label: string }[];
  lang: Lang;
  children: ReactNode;
}) {
  const bottom = H - M.bottom;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="report-chart" role="img">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke={GRID_COLOR} />
          <text x={M.left - 4} y={y(v)} className="tick" textAnchor="end" dominantBaseline="middle">
            {formatNumber(lang, v)}
          </text>
        </g>
      ))}
      {months.map(({ d, label }) => (
        <g key={d}>
          <line x1={x(d)} x2={x(d)} y1={M.top} y2={bottom} stroke={GRID_COLOR} />
          {x(d) - M.left >= 12 && (
            <text x={x(d)} y={bottom + 12} className="tick" textAnchor="middle">
              {label}
            </text>
          )}
        </g>
      ))}
      {children}
      <line x1={x(xDomain[0])} x2={x(xDomain[1])} y1={bottom} y2={bottom} stroke="#8c959f" />
    </svg>
  );
}

function WeeklyBars({ series, lang }: { series: OpsSeries; lang: Lang }) {
  const first = series.weeks.find((w) => w.area_ha > 0);
  const start = first ? toDay(first.start) : mondayOf(toDay(series.as_of) - EMPTY_WEEKS_DAYS);
  const { xDomain, x, months } = axis(series, lang, start);
  const ticks = niceTicks(0, Math.max(...series.weeks.map((w) => w.area_ha), 1), 3);
  const y = linearScale([0, ticks[ticks.length - 1]], [H - M.bottom, M.top]);
  return (
    <Frame x={x} xDomain={xDomain} y={y} ticks={ticks} months={months} lang={lang}>
      {series.weeks.map((w) => {
        const x0 = x(toDay(w.start));
        const x1 = x(toDay(w.end) + 1);
        return w.area_ha > 0 ? (
          <rect key={w.start} x={x0 + 0.5} width={Math.max(x1 - x0 - 1, 1)} y={y(w.area_ha)} height={y(0) - y(w.area_ha)}
            fill={HARVEST_COLOR} opacity={w.partial ? 0.45 : 1} />
        ) : null;
      })}
    </Frame>
  );
}

function CumulativeLines({ series, lang }: { series: OpsSeries; lang: Lang }) {
  const { xDomain, x, months } = axis(series, lang);
  const rows = series.official ?? [];
  const ticks = niceTicks(0, Math.max(...rows.map((r) => Math.max(r.official_cum_ha, r.detected_cum_ha)), 1), 3);
  const y = linearScale([0, ticks[ticks.length - 1]], [H - M.bottom, M.top]);
  const lines = [
    { key: "official", color: OFFICIAL_COLOR, marker: "circle" as const, dash: undefined, v: (r: (typeof rows)[0]) => r.official_cum_ha },
    { key: "detected", color: HARVEST_COLOR, marker: "square" as const, dash: "5 3", v: (r: (typeof rows)[0]) => r.detected_cum_ha },
  ];
  return (
    <Frame x={x} xDomain={xDomain} y={y} ticks={ticks} months={months} lang={lang}>
      {lines.map((s) => (
        <g key={s.key}>
          <polyline points={rows.map((r) => `${x(toDay(r.cutoff) + 1)},${y(s.v(r))}`).join(" ")} fill="none" stroke={s.color}
            strokeWidth={1.5} strokeDasharray={s.dash} />
          {rows.map((r) => (
            <MarkerShape key={r.cutoff} shape={s.marker} x={x(toDay(r.cutoff) + 1)} y={y(s.v(r))} color={s.color} r={2.2} />
          ))}
        </g>
      ))}
    </Frame>
  );
}
