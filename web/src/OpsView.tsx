import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Site } from "./App";
import { count, formatDate, formatNumber, LANGS, t, tValue, type Lang } from "./i18n";
import OpsMap, { type OpsFocus } from "./OpsMap";
import {
  LIST_DAYS,
  OPS_PAGE,
  seasonLabel,
  type FireRow,
  type HarvestedRow,
  type ListDays,
  type NotDetectedRow,
  type OpsBrief,
  type OpsFires,
} from "./ops";
import { fromDay, toDay } from "./season";

type Props = {
  site: Site;
  day: number;
  onDay: (day: number) => void;
  lang: Lang;
  onLang: (lang: Lang) => void;
};

type Load<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ok"; data: T };
type Tab = "harvested" | "notDetected" | "fires";
const TABS: Tab[] = ["harvested", "notDetected", "fires"];
const TAB_LABEL = { harvested: "tabHarvested", notDetected: "tabNotDetected", fires: "tabFires" } as const;

const getJson = <T,>(url: string, signal?: AbortSignal): Promise<T> =>
  fetch(url, { signal }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));

/** A paged list of `base` (a URL with its query, without limit / offset): the first page on
 * every new `base`, then "Load more". An answer for an older `base` is dropped. */
function usePaged<R>(base: string) {
  const [load, setLoad] = useState<Load<number>>({ state: "loading" });
  const [rows, setRows] = useState<R[]>([]);
  const [more, setMore] = useState(false);
  const current = useRef("");

  useEffect(() => {
    const ctrl = new AbortController();
    current.current = base;
    setLoad({ state: "loading" });
    getJson<{ total: number; rows: R[] }>(`${base}&limit=${OPS_PAGE}&offset=0`, ctrl.signal)
      .then((page) => {
        setRows(page.rows);
        setLoad({ state: "ok", data: page.total });
      })
      .catch((e: Error) => !ctrl.signal.aborted && setLoad({ state: "error", message: e.message }));
    return () => ctrl.abort();
  }, [base]);

  const loadMore = async () => {
    const key = current.current;
    setMore(true);
    try {
      const page = await getJson<{ rows: R[] }>(`${base}&limit=${OPS_PAGE}&offset=${rows.length}`);
      if (key === current.current) setRows((prev) => [...prev, ...page.rows]);
    } finally {
      setMore(false);
    }
  };
  return { load, rows, more, loadMore, total: load.state === "ok" ? load.data : null };
}

/** Mill operations: the season replayed as of `day`, using only what was known on that day. */
export default function OpsView({ site, day, onDay, lang, onLang }: Props) {
  const iso = fromDay(day);
  const api = `/api/ops/${site.site_id}`;
  const [brief, setBrief] = useState<Load<OpsBrief>>({ state: "loading" });
  const [fires, setFires] = useState<Load<OpsFires>>({ state: "loading" });
  const [tab, setTab] = useState<Tab>("harvested");
  const [days, setDays] = useState<ListDays>(7);
  const [focus, setFocus] = useState<OpsFocus | null>(null);
  const harvested = usePaged<HarvestedRow>(`${api}/harvested?as_of=${iso}&days=${days}`);
  const notDetected = usePaged<NotDetectedRow>(`${api}/not-detected?as_of=${iso}`);

  useEffect(() => setBrief({ state: "loading" }), [site.site_id]);

  useEffect(() => {
    const ctrl = new AbortController();
    setBrief((b) => (b.state === "ok" ? b : { state: "loading" })); // keep the numbers while stepping
    getJson<OpsBrief>(`${api}?as_of=${iso}`, ctrl.signal)
      .then((data) => setBrief({ state: "ok", data }))
      .catch((e: Error) => !ctrl.signal.aborted && setBrief({ state: "error", message: e.message }));
    return () => ctrl.abort();
  }, [api, iso]);

  useEffect(() => {
    const ctrl = new AbortController();
    setFires({ state: "loading" });
    getJson<OpsFires>(`${api}/fires?as_of=${iso}`, ctrl.signal)
      .then((data) => setFires({ state: "ok", data }))
      .catch((e: Error) => !ctrl.signal.aborted && setFires({ state: "error", message: e.message }));
    return () => ctrl.abort();
  }, [api, iso]);

  // The outlined field or point belongs to the list it was picked from.
  useEffect(() => setFocus(null), [site.site_id, iso, tab, days]);

  const b = brief.state === "ok" ? brief.data : null;
  const f = fires.state === "ok" ? fires.data : null;
  const n = (v: number, d = 0) => formatNumber(lang, v, d);
  const ha = (v: number) => `${n(v)} ha`;
  const date = (v: string) => formatDate(lang, v);
  const fields = (v: number) => count(lang, v, "field", "fields");
  const pct = (v: number | null) => `${n((v ?? 0) * 100, 1)} %`;
  const seasonMin = b?.season.start;
  const seasonMax = b ? fromDay(toDay(b.season.end_exclusive) - 1) : undefined;
  const step = (k: number) => onDay(day + 7 * k);
  const tabCount: Record<Tab, number | null> = {
    harvested: harvested.total,
    notDetected: notDetected.total,
    fires: f ? f.detections : null,
  };
  const pick = (id: string | null, centroid: [number, number]) => setFocus({ id, centroid });
  const rowProps = (id: string | null, centroid: [number, number]) => {
    const on = focus !== null && focus.id === id && focus.centroid[0] === centroid[0] && focus.centroid[1] === centroid[1];
    return {
      className: on ? "on" : "",
      tabIndex: 0,
      "aria-selected": on,
      onClick: () => pick(id, centroid),
      onKeyDown: (e: KeyboardEvent) => e.key === "Enter" && pick(id, centroid),
    };
  };

  return (
    <div className="ops" data-testid="ops" lang={lang}>
      <div className="ops-banner">
        <div className="ops-title">
          <strong data-testid="ops-replay">
            {t(lang, "replay", { season: seasonLabel(site.season), date: date(iso) })}
          </strong>
          <span className="ops-badge">{t(lang, "notLive")}</span>
        </div>
        <div className="ops-controls">
          <button type="button" className="zoom" aria-label={t(lang, "prevWeek")} title={t(lang, "prevWeek")}
            data-testid="ops-prev" disabled={!!seasonMin && iso <= seasonMin} onClick={() => step(-1)}>
            ◀ 7
          </button>
          <label className="ops-date">
            <span className="muted small">{t(lang, "asOf")}</span>
            <input type="date" data-testid="ops-date" value={iso} min={seasonMin} max={seasonMax}
              onChange={(e) => e.target.value && onDay(toDay(e.target.value))} />
          </label>
          <button type="button" className="zoom" aria-label={t(lang, "nextWeek")} title={t(lang, "nextWeek")}
            data-testid="ops-next" disabled={!!seasonMax && iso >= seasonMax} onClick={() => step(1)}>
            7 ▶
          </button>
          <span className="toggle" role="group" aria-label={t(lang, "language")}>
            {LANGS.map((l) => (
              <button key={l} type="button" className={lang === l ? "on" : ""} aria-pressed={lang === l}
                data-testid={`ops-lang-${l}`} onClick={() => onLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </span>
          <a className="zoom ops-export" data-testid="export-ledger" download href={`${api}/ledger.csv?as_of=${iso}`}>
            {t(lang, "exportLedger")}
          </a>
        </div>
      </div>
      <p className="ops-timing" data-testid="ops-timing">{t(lang, "timing")}</p>

      {brief.state === "error" && <p className="error">{t(lang, "loadError", { msg: brief.message })}</p>}
      <div className="ops-brief" data-testid="ops-brief" data-as-of={b?.as_of ?? ""}>
        {b ? (
          <>
            <Card label={t(lang, "caneArea")} value={ha(b.cane.area_ha)} note={fields(b.cane.segments)} />
            <Card testId="brief-harvested" label={t(lang, "harvested")} value={ha(b.harvested.area_ha)}
              note={`${pct(b.harvested.share_of_cane_area)} ${t(lang, "ofCane")} · ${fields(b.harvested.segments)}`} />
            <Card testId="brief-last7" label={t(lang, "last7")} value={ha(b.harvested_last_7_days.area_ha)}
              note={t(lang, "last7Note", { from: date(b.harvested_last_7_days.from), to: date(b.harvested_last_7_days.to),
                fields: fields(b.harvested_last_7_days.segments) })}
              sub={t(lang, "prev7", { ha: ha(b.harvested_previous_7_days.area_ha), fields: fields(b.harvested_previous_7_days.segments) })} />
            <Card label={t(lang, "pace")} value={`${n(b.pace.ha_per_week)} ${t(lang, "paceUnit")}`}
              note={t(lang, "paceNote", { from: date(b.pace.weeks[0].start), to: date(b.pace.weeks[b.pace.weeks.length - 1].end) })} />
            <Card testId="brief-not-detected" label={t(lang, "notDetected")} value={ha(b.not_yet_detected.area_ha)}
              note={`${pct(b.not_yet_detected.share_of_cane_area)} ${t(lang, "ofCane")} · ${fields(b.not_yet_detected.segments)}`}
              sub={t(lang, "notDetectedNote")} />
            {b.cane_tonnage_estimate !== undefined && (
              <Card testId="brief-tonnage" label={t(lang, "tonnage")}
                value={b.cane_tonnage_estimate ? `≈ ${n(b.cane_tonnage_estimate.tonnes)} t` : "—"}
                note={b.cane_tonnage_estimate
                  ? t(lang, "tonnageNote", { yield: n(b.cane_tonnage_estimate.yield_t_ha, 2), date: date(b.cane_tonnage_estimate.official_cutoff) })
                  : t(lang, "tonnageNone")} />
            )}
            {b.official !== undefined && (
              <Card testId="brief-official" label={t(lang, "official")}
                value={b.official ? ha(b.official.official_harvested_ha) : "—"}
                note={b.official
                  ? t(lang, "officialNote", { date: date(b.official.cutoff), ha: ha(b.official.detected_harvested_ha),
                    pct: n(b.official.detected_share_of_official * 100, 1) })
                  : t(lang, "officialNone")}
                sub={t(lang, "radarNote")} />
            )}
          </>
        ) : (
          brief.state === "loading" && <p className="muted">{t(lang, "loading")}</p>
        )}
      </div>

      <div className="ops-body">
        <section className="ops-list" data-testid="ops-list" data-tab={tab}>
          <div className="ops-tabs" role="tablist">
            {TABS.map((k) => (
              <button key={k} type="button" role="tab" className={`ops-tab${tab === k ? " on" : ""}`} aria-selected={tab === k}
                data-testid={`ops-tab-${k}`} onClick={() => setTab(k)}>
                {t(lang, TAB_LABEL[k])} <span className="chip-count">{tabCount[k] === null ? "" : n(tabCount[k]!)}</span>
              </button>
            ))}
          </div>

          {tab === "harvested" && (
            <div data-testid="ops-harvested" data-state={harvested.load.state}>
              <div className="ops-list-head">
                <span className="ops-chips" role="group" aria-label={t(lang, "tabHarvested")}>
                  {LIST_DAYS.map((d) => (
                    <button key={d} type="button" className={`ops-chip${days === d ? " on" : ""}`} aria-pressed={days === d}
                      data-testid="days-chip" data-days={d} onClick={() => setDays(d)}>
                      {t(lang, d === 7 ? "days7" : "days14")}
                    </button>
                  ))}
                </span>
                <a className="zoom ops-export" data-testid="export-harvested" download
                  href={`${api}/harvested.csv?as_of=${iso}&days=${days}`}>{t(lang, "exportList")}</a>
              </div>
              <p className="muted small ops-help">{t(lang, "harvestedHelp", { days })}</p>
              <Paged lang={lang} list={harvested} empty={t(lang, "emptyHarvested")} fields={fields}
                head={
                  <tr>
                    <th>{t(lang, "colField")}</th>
                    <th>{t(lang, "colHarvestDate")}</th>
                    <th>{t(lang, "colConfidence")}</th>
                    <th className="num">{t(lang, "colArea")}</th>
                    {b?.cane_tonnage_estimate && <th className="num">{t(lang, "colTonnes")}</th>}
                  </tr>
                }
                row={(r) => (
                  <tr key={r.segment_id} {...rowProps(r.segment_id, r.centroid)} data-testid="ops-row">
                    <td className="ops-seg">{r.segment_id}</td>
                    <td>
                      {date(r.harvest_date)}
                      {r.date_uncertainty_days !== null && <span className="muted"> ± {n(r.date_uncertainty_days, 1)} d</span>}
                    </td>
                    <td>{r.date_confidence ? tValue(lang, `conf_${r.date_confidence}`, r.date_confidence) : "—"}</td>
                    <td className="num">{n(r.area_ha, 2)}</td>
                    {b?.cane_tonnage_estimate && <td className="num">{r.tonnes_estimate === null ? "—" : `≈ ${n(r.tonnes_estimate)}`}</td>}
                  </tr>
                )} />
            </div>
          )}

          {tab === "notDetected" && (
            <div data-testid="ops-not-detected" data-state={notDetected.load.state}>
              <div className="ops-list-head">
                <p className="muted small ops-help">{t(lang, "notDetectedHelp")}</p>
                <a className="zoom ops-export" data-testid="export-not-detected" download
                  href={`${api}/not-detected.csv?as_of=${iso}`}>{t(lang, "exportList")}</a>
              </div>
              <Paged lang={lang} list={notDetected} empty={t(lang, "emptyNotDetected")} fields={fields}
                head={
                  <tr>
                    <th>{t(lang, "colField")}</th>
                    <th className="num">{t(lang, "colArea")}</th>
                  </tr>
                }
                row={(r) => (
                  <tr key={r.segment_id} {...rowProps(r.segment_id, r.centroid)} data-testid="ops-row">
                    <td className="ops-seg">{r.segment_id}</td>
                    <td className="num">{n(r.area_ha, 2)}</td>
                  </tr>
                )} />
            </div>
          )}

          {tab === "fires" && (
            <div data-testid="ops-fires" data-state={fires.state}>
              <p className="note small" data-testid="ops-fire-text">{t(lang, "fireText")}</p>
              {fires.state === "error" && <p className="error">{t(lang, "loadError", { msg: fires.message })}</p>}
              {fires.state === "loading" && <p className="muted">{t(lang, "loading")}</p>}
              {f && (
                <>
                  <p className="muted small ops-help" data-testid="ops-fire-summary">
                    {t(lang, "fireSummary", { n: count(lang, f.detections, "detection", "detections"), m: f.fire_buffer_m,
                      from: date(f.from), to: date(f.to), night: n(f.night) })}
                  </p>
                  {f.rows.length === 0 ? (
                    <p className="muted" data-testid="ops-empty">{t(lang, "emptyFires")}</p>
                  ) : (
                    <div className="ops-table-wrap">
                      <table className="ops-table" data-testid="ops-table">
                        <thead>
                          <tr>
                            <th>{t(lang, "colTime")}</th>
                            <th className="num">{t(lang, "colFrp")}</th>
                            <th>{t(lang, "colFireConfidence")}</th>
                            <th className="num">{t(lang, "colNearby")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {f.rows.map((r: FireRow, i) => {
                            const at: [number, number] = [r.lon, r.lat];
                            return (
                              <tr key={`${r.datetime_local}/${i}`} {...rowProps(null, at)} data-testid="ops-fire-row">
                                <td>{date(r.datetime_local)} {r.datetime_local.slice(11, 16)}</td>
                                <td className="num">{r.frp === null ? "—" : n(r.frp, 1)}</td>
                                <td>{r.confidence ? tValue(lang, `fire_${r.confidence}`, r.confidence) : "—"}</td>
                                <td className="num">{n(r.cane_segments_within_200m)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>
        <OpsMap site={site} day={day} days={days} focus={focus} fires={f?.rows ?? []} lang={lang} />
      </div>
    </div>
  );
}

type PagedList<R> = ReturnType<typeof usePaged<R>>;

function Paged<R>({ lang, list, empty, fields, head, row }: {
  lang: Lang;
  list: PagedList<R>;
  empty: string;
  fields: (v: number) => string;
  head: ReactNode;
  row: (r: R) => ReactNode;
}) {
  const { load, rows, total, more, loadMore } = list;
  const n = (v: number) => formatNumber(lang, v);
  if (load.state === "error") return <p className="error">{t(lang, "loadError", { msg: load.message })}</p>;
  if (load.state === "loading") return <p className="muted">{t(lang, "loading")}</p>;
  if (!total) return <p className="muted" data-testid="ops-empty">{empty}</p>;
  return (
    <>
      <p className="muted small" data-testid="ops-count">{t(lang, "rowsShown", { shown: n(rows.length), total: fields(total) })}</p>
      <div className="ops-table-wrap">
        <table className="ops-table" data-testid="ops-table">
          <thead>{head}</thead>
          <tbody>{rows.map(row)}</tbody>
        </table>
      </div>
      {rows.length < total && (
        <button type="button" className="zoom more" data-testid="ops-more" disabled={more} onClick={loadMore}>
          {more ? t(lang, "loading") : t(lang, "loadMore", { n: n(total - rows.length) })}
        </button>
      )}
    </>
  );
}

function Card({ label, value, note, sub, testId }: { label: string; value: string; note?: string; sub?: string; testId?: string }) {
  return (
    <div className="ops-card" data-testid={testId}>
      <div className="ops-card-label">{label}</div>
      <div className="ops-card-value">{value}</div>
      {note && <div className="ops-card-note">{note}</div>}
      {sub && <div className="ops-card-note">{sub}</div>}
    </div>
  );
}
