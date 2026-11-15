import { useEffect, useRef, useState } from "react";
import { ALERT_PAGE, alertLabel, evidenceLine, oneLine, severityLabel, type AlertPage, type AlertRow } from "./alerts";
import { formatDate, formatNumber, t, useLang } from "./i18n";
import { Icon } from "./icons";
import { FINDINGS_URL } from "./ops";
import { EmptyState, Skeleton } from "./ui";

type Props = {
  siteId: string;
  code: string | null;
  onCode: (code: string | null) => void;
  onOpen: (a: AlertRow) => void;
};

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ok"; page: AlertPage };

const pageUrl = (site: string, code: string | null, offset: number) =>
  `/api/alerts/${site}?limit=${ALERT_PAGE}&offset=${offset}${code ? `&code=${encodeURIComponent(code)}` : ""}`;

/** Side-panel list of the site's alerts: code chips (filter), then 50 rows at a time. */
export default function AlertsList({ siteId, code, onCode, onOpen }: Props) {
  const lang = useLang();
  const n = (v: number) => formatNumber(lang, v);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [more, setMore] = useState(false);
  // Filter the rows on screen belong to; a "Load more" answer for another filter is dropped.
  const current = useRef("");

  useEffect(() => {
    const ctrl = new AbortController();
    current.current = `${siteId}/${code}`;
    setLoad({ state: "loading" });
    setRows([]);
    fetch(pageUrl(siteId, code, 0), { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((page: AlertPage) => {
        setLoad({ state: "ok", page });
        setRows(page.alerts);
      })
      .catch((e: Error) => {
        if (!ctrl.signal.aborted) setLoad({ state: "error", message: e.message });
      });
    return () => ctrl.abort();
  }, [siteId, code]);

  const loadMore = async () => {
    const key = current.current;
    setMore(true);
    try {
      const r = await fetch(pageUrl(siteId, code, rows.length));
      const next = r.ok ? ((await r.json()) as AlertPage).alerts : [];
      if (key === current.current) setRows((prev) => [...prev, ...next]);
    } finally {
      setMore(false);
    }
  };

  const page = load.state === "ok" ? load.page : null;
  const enabled = page?.codes.filter((c) => c.enabled) ?? [];
  const disabled = page?.codes.filter((c) => !c.enabled) ?? [];
  return (
    <div className="alerts-list" data-testid="alerts-list" data-state={load.state}>
      <p className="note alerts-note" data-testid="alerts-note">
        <Icon name="info" className="note-icon" />
        {t(lang, "alertNote")} {t(lang, "alertFireNote")}{" "}
        <a href={FINDINGS_URL} target="_blank" rel="noreferrer" data-testid="findings-link">
          {t(lang, "findingsLink")}
        </a>
        .
      </p>
      {load.state === "loading" && <Skeleton lines={5} label={t(lang, "loadingAlerts")} />}
      {load.state === "error" && <p className="error">{t(lang, "alertsLoadError", { msg: load.message })}</p>}
      {page && (
        <>
          <div className="chips" role="group" aria-label={t(lang, "filterByAlert")}>
            {enabled.map((c) => (
              <button
                key={c.code}
                type="button"
                className={`chip${code === c.code ? " on" : ""}`}
                aria-pressed={code === c.code}
                data-testid="alert-chip"
                data-code={c.code}
                disabled={c.count === 0}
                title={c.definition ? `${c.code}: ${c.definition}` : c.code}
                onClick={() => onCode(code === c.code ? null : c.code)}
              >
                <span className="chip-head">
                  <span className={`sev sev-${c.severity}`}>{severityLabel(lang, c.severity)}</span>
                  <span className="chip-label">{alertLabel(lang, c.code)}</span>
                  <span className="chip-count">{n(c.count)}</span>
                </span>
                {c.definition && <span className="chip-def" lang="en">{oneLine(c)}</span>}
              </button>
            ))}
          </div>
          {disabled.length > 0 && (
            <p className="muted small">
              {t(lang, "notEvaluated", { list: disabled.map((c) => alertLabel(lang, c.code)).join(", ") })}
            </p>
          )}
          <p className="muted small" data-testid="alerts-count">
            {t(lang, "alertsCount", { n: n(page.total), code: code ? ` (${alertLabel(lang, code)})` : "" })}
            {page.library ? t(lang, "computedWith", { c: page.library.commit_short }) : "."}
          </p>
          {page.total === 0 && <EmptyState title={t(lang, code ? "noAlertsType" : "noAlerts")} />}
          <ul className="alert-rows">
            {rows.map((a) => (
              <li key={`${a.segment_id}/${a.code}`}>
                <button type="button" className="alert-row" data-testid="alert-row" onClick={() => onOpen(a)}>
                  <span className="alert-row-head">
                    <span className="alert-seg">{a.segment_id}</span>
                    <span className={`sev sev-${a.severity}`}>{severityLabel(lang, a.severity)}</span>
                    <span className="alert-row-label">{alertLabel(lang, a.code)}</span>
                  </span>
                  <span className="alert-row-meta">
                    {a.harvest_date ? t(lang, "harvestOn", { date: formatDate(lang, a.harvest_date) }) : t(lang, "undated")}
                    {a.area_ha !== null ? ` · ${formatNumber(lang, a.area_ha, 2)} ha` : ""}
                    {evidenceLine(lang, a) ? ` · ${evidenceLine(lang, a)}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {rows.length < page.total && (
            <button type="button" className="btn btn-secondary more" data-testid="alerts-more" disabled={more} onClick={loadMore}>
              {more ? t(lang, "loading") : t(lang, "loadMore", { n: n(page.total - rows.length) })}
            </button>
          )}
        </>
      )}
    </div>
  );
}
