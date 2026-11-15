import { useEffect, useRef, useState } from "react";
import type { Site } from "./App";
import { count, formatDate, formatNumber, LANGS, t, type Lang } from "./i18n";
import OpsMap from "./OpsMap";
import {
  BUCKET_COLORS,
  BUCKET_KEYS,
  BURNED_PAGE,
  LEGAL_REFERENCE_SITES,
  pips,
  seasonLabel,
  type BucketKey,
  type BurnedPage,
  type BurnedRow,
  type OpsBrief,
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

const getJson = <T,>(url: string, signal?: AbortSignal): Promise<T> =>
  fetch(url, { signal }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));

const burnedUrl = (site: string, iso: string, bucket: BucketKey | null, offset: number) =>
  `/api/ops/${site}/burned?as_of=${iso}&limit=${BURNED_PAGE}&offset=${offset}${bucket ? `&bucket=${bucket}` : ""}`;

/** Mill operations: the season replayed as of `day` for a mill's field department. */
export default function OpsView({ site, day, onDay, lang, onLang }: Props) {
  const iso = fromDay(day);
  const [brief, setBrief] = useState<Load<OpsBrief>>({ state: "loading" });
  const [bucket, setBucket] = useState<BucketKey | null>(null);
  const [list, setList] = useState<Load<BurnedPage>>({ state: "loading" });
  const [rows, setRows] = useState<BurnedRow[]>([]);
  const [more, setMore] = useState(false);
  const [focus, setFocus] = useState<{ id: string; centroid: [number, number] } | null>(null);
  const current = useRef(""); // the list a "Load more" answer belongs to

  useEffect(() => setBrief({ state: "loading" }), [site.site_id]);

  useEffect(() => {
    const ctrl = new AbortController();
    setBrief((b) => (b.state === "ok" ? b : { state: "loading" })); // keep the numbers while stepping
    getJson<OpsBrief>(`/api/ops/${site.site_id}?as_of=${iso}`, ctrl.signal)
      .then((data) => setBrief({ state: "ok", data }))
      .catch((e: Error) => !ctrl.signal.aborted && setBrief({ state: "error", message: e.message }));
    return () => ctrl.abort();
  }, [site.site_id, iso]);

  useEffect(() => {
    const ctrl = new AbortController();
    current.current = `${site.site_id}/${iso}/${bucket}`;
    setList({ state: "loading" });
    getJson<BurnedPage>(burnedUrl(site.site_id, iso, bucket, 0), ctrl.signal)
      .then((data) => {
        setList({ state: "ok", data });
        setRows(data.rows);
      })
      .catch((e: Error) => !ctrl.signal.aborted && setList({ state: "error", message: e.message }));
    return () => ctrl.abort();
  }, [site.site_id, iso, bucket]);

  // The outlined field belongs to the list it was picked from.
  useEffect(() => setFocus(null), [site.site_id, iso, bucket]);

  const loadMore = async () => {
    const key = current.current;
    setMore(true);
    try {
      const page = await getJson<BurnedPage>(burnedUrl(site.site_id, iso, bucket, rows.length));
      if (key === current.current) setRows((prev) => [...prev, ...page.rows]);
    } finally {
      setMore(false);
    }
  };

  const b = brief.state === "ok" ? brief.data : null;
  const total = list.state === "ok" ? list.data.total : null;
  const n = (v: number, d = 0) => formatNumber(lang, v, d);
  const ha = (v: number) => `${n(v)} ha`;
  const date = (v: string) => formatDate(lang, v);
  const fields = (v: number) => count(lang, v, "field", "fields");
  const seasonMin = b?.season.start;
  const seasonMax = b ? fromDay(toDay(b.season.end_exclusive) - 1) : undefined;
  const step = (k: number) => onDay(day + 7 * k);
  const csvQuery = `as_of=${iso}${bucket ? `&bucket=${bucket}` : ""}`;

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
        </div>
      </div>
      <p className="ops-timing" data-testid="ops-timing">{t(lang, "timing")}</p>

      {brief.state === "error" && <p className="error">{t(lang, "loadError", { msg: brief.message })}</p>}
      <div className="ops-brief" data-testid="ops-brief" data-as-of={b?.as_of ?? ""}>
        {b ? (
          <>
            <Card label={t(lang, "caneArea")} value={ha(b.cane.area_ha)} note={fields(b.cane.segments)} />
            <Card testId="brief-harvested" label={t(lang, "harvested")} value={ha(b.harvested.area_ha)}
              note={`${n((b.harvested.share_of_cane_area ?? 0) * 100, 1)} % ${t(lang, "ofCane")} · ${fields(b.harvested.segments)}`}
              sub={t(lang, "last7", { ha: ha(b.harvested_last_7_days.area_ha), fields: fields(b.harvested_last_7_days.segments) })} />
            <Card testId="brief-standing" label={t(lang, "standing")} value={ha(b.not_yet_harvested.area_ha)}
              note={`${fields(b.not_yet_harvested.segments)} · ${t(lang, "standingNote")}`} />
            <Card testId="brief-nodate" label={t(lang, "noDate")} value={ha(b.no_date_detected.area_ha)}
              note={`${fields(b.no_date_detected.segments)} · ${t(lang, "noDateNote")}`} />
            <Card label={t(lang, "pace")} value={`${n(b.pace.ha_per_week)} ${t(lang, "paceUnit")}`}
              note={t(lang, "paceNote", { from: date(b.pace.weeks[0].start), to: date(b.pace.weeks[b.pace.weeks.length - 1].end) })} />
            <Card label={t(lang, "projectedEnd")}
              value={b.projected_end && b.not_yet_harvested.area_ha > 0 ? date(b.projected_end) : "—"}
              note={b.not_yet_harvested.area_ha <= 0 ? t(lang, "projectedDone")
                : b.projected_end ? t(lang, "projectedNote", { ha: ha(b.not_yet_harvested.area_ha) }) : t(lang, "projectedNone")} />
            <Card testId="brief-burned" label={t(lang, "burned")} value={fields(b.burned_not_harvested.segments)}
              note={`${ha(b.burned_not_harvested.area_ha)} · ${t(lang, "burnedNote", { n: n(b.burned_not_harvested.no_date_segments) })}`} />
            {b.fires_outside_hours_last_7_days && (
              <Card label={t(lang, "outside")}
                value={count(lang, b.fires_outside_hours_last_7_days.detections, "detection", "detections")}
                note={`${fields(b.fires_outside_hours_last_7_days.segments)} · ${t(lang, "outsideNote", {
                  from: b.fires_outside_hours_last_7_days.burn_window[0],
                  to: b.fires_outside_hours_last_7_days.burn_window[1],
                  confirmed: b.fires_outside_hours_last_7_days.window_confirmed ? "" : t(lang, "unconfirmed"),
                })}`} />
            )}
            {b.cane_tonnage_estimate && (
              <Card testId="brief-tonnage" label={t(lang, "tonnage")} value={`≈ ${n(b.cane_tonnage_estimate.tonnes)} t`}
                note={t(lang, "tonnageNote", { yield: n(b.cane_tonnage_estimate.field_yield_t_ha, 1) })} />
            )}
          </>
        ) : (
          brief.state === "loading" && <p className="muted">{t(lang, "loading")}</p>
        )}
      </div>

      <div className="ops-body">
        <section className="ops-list" data-testid="ops-list" data-state={list.state}>
          <div className="ops-list-head">
            <h2>{t(lang, "listTitle")}</h2>
            <span className="ops-exports">
              <a className="zoom" data-testid="export-burned" download
                href={`/api/ops/${site.site_id}/burned.csv?${csvQuery}`}>{t(lang, "exportList")}</a>
              <a className="zoom" data-testid="export-ledger" download
                href={`/api/ops/${site.site_id}/ledger.csv?as_of=${iso}`}>{t(lang, "exportLedger")}</a>
            </span>
          </div>
          <p className="muted small ops-help">{t(lang, "listHelp")}</p>
          {LEGAL_REFERENCE_SITES.includes(site.site_id) && (
            <p className="note small" data-testid="ops-legal">{t(lang, "legal")}</p>
          )}
          <div className="ops-chips" role="group" aria-label={t(lang, "colDays")}>
            <button type="button" className={`ops-chip${bucket === null ? " on" : ""}`} aria-pressed={bucket === null}
              data-testid="bucket-chip" data-bucket="all" onClick={() => setBucket(null)}>
              {t(lang, "all")} <span className="chip-count">{b ? n(b.burned_not_harvested.segments) : ""}</span>
            </button>
            {BUCKET_KEYS.map((k) => {
              const c = b?.burned_not_harvested.buckets.find((x) => x.bucket === k);
              return (
                <button key={k} type="button" className={`ops-chip${bucket === k ? " on" : ""}`} aria-pressed={bucket === k}
                  data-testid="bucket-chip" data-bucket={k} onClick={() => setBucket(bucket === k ? null : k)}>
                  <span className="swatch" style={{ background: BUCKET_COLORS[k] }} />
                  <span className="pips" aria-hidden="true">{pips(k)}</span> {t(lang, `b${k}`)}{" "}
                  <span className="chip-count">{c ? n(c.segments) : ""}</span>
                </button>
              );
            })}
          </div>
          {list.state === "error" && <p className="error">{t(lang, "loadError", { msg: list.message })}</p>}
          {list.state === "loading" && <p className="muted">{t(lang, "loading")}</p>}
          {list.state === "ok" && total === 0 && <p className="muted" data-testid="ops-empty">{t(lang, "empty")}</p>}
          {list.state === "ok" && total !== null && total > 0 && (
            <>
              <p className="muted small" data-testid="ops-count">
                {t(lang, "rowsShown", { shown: n(rows.length), total: fields(total) })}
              </p>
              <div className="ops-table-wrap">
                <table className="ops-table" data-testid="ops-table">
                  <thead>
                    <tr>
                      <th>{t(lang, "colField")}</th>
                      <th className="num">{t(lang, "colArea")}</th>
                      <th>{t(lang, "colDays")}</th>
                      <th>{t(lang, "colFirst")}</th>
                      <th>{t(lang, "colLast")}</th>
                      <th>{t(lang, "colHarvest")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.segment_id} className={focus?.id === r.segment_id ? "on" : ""} data-testid="ops-row"
                        data-bucket={r.bucket} tabIndex={0} aria-selected={focus?.id === r.segment_id}
                        onClick={() => setFocus({ id: r.segment_id, centroid: r.centroid })}
                        onKeyDown={(e) => e.key === "Enter" && setFocus({ id: r.segment_id, centroid: r.centroid })}>
                        <td className="ops-seg">{r.segment_id}</td>
                        <td className="num">{n(r.area_ha, 2)}</td>
                        <td>
                          <span className="ops-days">{n(r.days_since_burn)}</span>{" "}
                          <span className="ops-bucket">
                            <span className="swatch" style={{ background: BUCKET_COLORS[r.bucket] }} />
                            <span className="pips" aria-hidden="true">{pips(r.bucket)}</span> {t(lang, `b${r.bucket}`)}
                          </span>
                        </td>
                        <td>{date(r.first_fire_date)}</td>
                        <td>{date(r.last_fire_date)}</td>
                        <td>{r.harvest_date ? date(r.harvest_date) : <span className="muted">{t(lang, "noHarvestDate")}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length < total && (
                <button type="button" className="zoom more" data-testid="ops-more" disabled={more} onClick={loadMore}>
                  {more ? t(lang, "loading") : t(lang, "loadMore", { n: n(total - rows.length) })}
                </button>
              )}
            </>
          )}
        </section>
        <OpsMap site={site} day={day} bucket={bucket} focus={focus} lang={lang} />
      </div>
    </div>
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
