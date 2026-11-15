import { useEffect, useRef, useState } from "react";
import { ALERT_FIRE_NOTE, ALERT_NOTE, ALERT_PAGE, alertLabel, evidenceLine, oneLine, type AlertPage, type AlertRow } from "./alerts";
import { FINDINGS_URL } from "./ops";

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
        {ALERT_NOTE} {ALERT_FIRE_NOTE}{" "}
        <a href={FINDINGS_URL} target="_blank" rel="noreferrer" data-testid="findings-link">
          Why: fire detections cannot be attributed to single fields
        </a>
        .
      </p>
      {load.state === "loading" && <p className="muted">Loading alerts…</p>}
      {load.state === "error" && <p className="error">Could not load alerts: {load.message}</p>}
      {page && (
        <>
          <div className="chips" role="group" aria-label="Filter by alert">
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
                  <span className={`sev sev-${c.severity}`}>{c.severity}</span>
                  <span className="chip-label">{alertLabel(c.code)}</span>
                  <span className="chip-count">{c.count.toLocaleString("en-US")}</span>
                </span>
                {c.definition && <span className="chip-def">{oneLine(c)}</span>}
              </button>
            ))}
          </div>
          {disabled.length > 0 && (
            <p className="muted small">
              Not evaluated for this site (rule off in the site configuration):{" "}
              {disabled.map((c) => alertLabel(c.code)).join(", ")}.
            </p>
          )}
          <p className="muted small" data-testid="alerts-count">
            {page.total.toLocaleString("en-US")} alerts{code ? ` (${alertLabel(code)})` : ""}, warnings
            first, then by harvest date
            {page.library ? `. Computed with the research library at ${page.library.commit_short}.` : "."}
          </p>
          <ul className="alert-rows">
            {rows.map((a) => (
              <li key={`${a.segment_id}/${a.code}`}>
                <button type="button" className="alert-row" data-testid="alert-row" onClick={() => onOpen(a)}>
                  <span className="alert-row-head">
                    <span className="alert-seg">{a.segment_id}</span>
                    <span className={`sev sev-${a.severity}`}>{a.severity}</span>
                    <span className="alert-row-label">{alertLabel(a.code)}</span>
                  </span>
                  <span className="alert-row-meta">
                    {a.harvest_date ? `Harvest ${a.harvest_date}` : "Undated"}
                    {a.area_ha !== null ? ` · ${a.area_ha.toFixed(2)} ha` : ""}
                    {evidenceLine(a) ? ` · ${evidenceLine(a)}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {rows.length < page.total && (
            <button type="button" className="zoom more" data-testid="alerts-more" disabled={more} onClick={loadMore}>
              {more ? "Loading…" : `Load more (${(page.total - rows.length).toLocaleString("en-US")} left)`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
