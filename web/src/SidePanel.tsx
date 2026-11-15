import { useEffect, useRef, type ReactNode } from "react";
import type { Selection, Site } from "./App";
import AlertsList from "./AlertsList";
import type { AlertRow } from "./alerts";
import FieldDetail, { type SegmentDetail } from "./FieldDetail";
import { formatDate, formatNumber, siteName, siteSubtitle, t, tValue, useLang } from "./i18n";
import { Icon } from "./icons";
import ReferenceDetail from "./ReferenceDetail";
import type { ReferenceCollection } from "./reference";
import { seasonLabel } from "./ops";
import { fromDay } from "./season";
import { InfoTip, useTweened } from "./ui";

/** The season up to the timeline's week, for the panel with nothing selected. */
export type SeasonSoFar = {
  day: number; // the slider's Sunday
  fields: number | null; // fields harvested so far
  hectares: number | null; // their area
  weekFields: number | null; // fields harvested in the slider's week
  weekHectares: number | null;
};

type Props = {
  top: ReactNode; // shown first (the map panel, on a short screen)
  sheet: boolean; // phones and tablets: a bottom sheet with a summary bar
  sheetOpen: boolean;
  onSheet: (open: boolean) => void;
  site: Site | null;
  season: SeasonSoFar | null;
  selected: Selection;
  reference: ReferenceCollection | null;
  referenceOn: boolean;
  onZoom: (bbox: SegmentDetail["bbox"]) => void;
  onSelect: (s: Selection) => void;
  alertsOpen: boolean;
  alertCode: string | null;
  onAlertCode: (code: string | null) => void;
  onOpenAlert: (a: AlertRow) => void;
};

/** "Season so far": the harvested share of the mapped cane as a progress figure, fields and
 * hectares harvested up to the timeline's week, and that week's harvest. The figures ease
 * to each new value as the timeline moves. */
function SeasonBlock({ site, season }: { site: Site; season: SeasonSoFar }) {
  const lang = useLang();
  const share = season.hectares === null || !site.cane_area_ha ? null : season.hectares / site.cane_area_ha;
  const pct = useTweened(share === null ? null : 100 * share);
  const fields = useTweened(season.fields);
  const hectares = useTweened(season.hectares);
  const n = (v: number | null) => (v === null ? "…" : formatNumber(lang, v));
  const ha = season.weekHectares === null ? "…" : formatNumber(lang, season.weekHectares);
  return (
    <section className="season-so-far" data-testid="season-so-far" aria-label={t(lang, "seasonSoFar")}>
      <div className="ssf-head">
        <h3 className="ssf-title">
          {t(lang, "seasonSoFar")}
          <InfoTip text={t(lang, "tipSeasonSoFar")} />
        </h3>
        <span className="ssf-week" data-testid="ssf-week">
          {t(lang, "weekOf")} {formatDate(lang, fromDay(season.day - 6))}
        </span>
      </div>
      <div className="ssf-share">
        <span className="ssf-pct" data-testid="ssf-pct">
          {pct === null ? "…" : `${formatNumber(lang, pct)} %`}
        </span>
        <span className="ssf-share-label">{t(lang, "shareHarvested")}</span>
      </div>
      <div
        className="ssf-bar"
        role="progressbar"
        aria-label={t(lang, "shareHarvested")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={share === null ? undefined : Math.round(100 * share)}
      >
        <span style={{ transform: `scaleX(${pct === null ? 0 : Math.min(pct / 100, 1)})` }} />
      </div>
      <div className="ssf-stats">
        <div>
          <div className="ssf-value" data-testid="ssf-fields">{n(fields)}</div>
          <div className="ssf-label">{t(lang, "fieldsHarvested")}</div>
        </div>
        <div>
          <div className="ssf-value" data-testid="ssf-ha">{n(hectares)}</div>
          <div className="ssf-label">{t(lang, "haHarvested")}</div>
        </div>
      </div>
      <div className="ssf-week-row" data-testid="ssf-this-week">
        <span className="ssf-label">{t(lang, "thisWeek")}</span>
        <strong>
          {season.weekFields === null
            ? "…"
            : t(lang, season.weekFields === 1 ? "weekFieldsOne" : "weekFields", { n: formatNumber(lang, season.weekFields), ha })}
        </strong>
      </div>
    </section>
  );
}

/** Nothing selected: the season so far, the site in three numbers and one line on what to do
 * next. */
function SiteFacts({ site, season, referenceOn }: { site: Site; season: SeasonSoFar | null; referenceOn: boolean }) {
  const lang = useLang();
  const n = (v: number) => formatNumber(lang, v);
  const pct = site.segment_count ? Math.round((100 * site.dated_segment_count) / site.segment_count) : 0;
  const sub = siteSubtitle(lang, site);
  return (
    <div className="site-facts" data-testid="panel-empty">
      <h2 className="panel-title">
        {tValue(lang, `short_${site.site_id}`, site.name)} <span className="muted">· {seasonLabel(site.season)}</span>
      </h2>
      <p className="muted small site-facts-name" data-testid="site-subtitle">
        {sub.name}
        {sub.tip && <InfoTip text={sub.tip} />}
      </p>
      {season && <SeasonBlock site={site} season={season} />}
      <div className="facts">
        <div className="fact">
          <div className="fact-value">{n(site.cane_area_ha)}</div>
          <div className="fact-label">{t(lang, "factCane")}</div>
        </div>
        <div className="fact">
          <div className="fact-value">{n(site.segment_count)}</div>
          <div className="fact-label">{t(lang, "factFields")}</div>
        </div>
        <div className="fact">
          <div className="fact-value">{n(site.dated_segment_count)}</div>
          <div className="fact-label">{t(lang, "factDated", { pct })}</div>
        </div>
      </div>
      <p className="invite">
        <Icon name="cursor" /> {t(lang, referenceOn ? "inviteRef" : "invite")}
      </p>
    </div>
  );
}

/** The bottom sheet's summary bar: what the sheet holds in one line, a tap opens or closes
 * it; with a field open, a button closes the field. */
function SheetBar({ site, season, selected, alertsOpen, open, onOpen, onSelect }: {
  site: Site | null;
  season: SeasonSoFar | null;
  selected: Selection;
  alertsOpen: boolean;
  open: boolean;
  onOpen: (open: boolean) => void;
  onSelect: (s: Selection) => void;
}) {
  const lang = useLang();
  const share = season?.hectares != null && site?.cane_area_ha ? (100 * season.hectares) / site.cane_area_ha : null;
  const title = selected
    ? `${t(lang, selected.kind === "reference" ? "referenceTitle" : "fieldTitle")} ${selected.id}`
    : alertsOpen
      ? t(lang, "alerts")
      : t(lang, "seasonSoFar");
  const sub = !selected && !alertsOpen && share !== null ? t(lang, "sheetSeason", { pct: formatNumber(lang, share) }) : null;
  return (
    <div className="sheet-bar">
      <button
        type="button"
        className="sheet-toggle"
        aria-expanded={open}
        title={t(lang, open ? "sheetClose" : "sheetOpen")}
        data-testid="sheet-toggle"
        onClick={() => onOpen(!open)}
      >
        <span className="sheet-grip" aria-hidden="true" />
        <span className="sheet-title">{title}</span>
        {sub && <span className="sheet-sub" data-testid="sheet-sub">{sub}</span>}
        <Icon name="chevronDown" className="sheet-chev" />
      </button>
      {selected && (
        <button type="button" className="icon-btn sheet-clear" aria-label={t(lang, "clearField")} data-testid="sheet-clear" onClick={() => onSelect(null)}>
          <Icon name="close" size={20} />
        </button>
      )}
    </div>
  );
}

export default function SidePanel({
  top, sheet, sheetOpen, onSheet,
  site, season, selected, reference, referenceOn, onZoom, onSelect, alertsOpen, alertCode, onAlertCode, onOpenAlert,
}: Props) {
  const lang = useLang();
  const field =
    selected?.kind === "reference"
      ? reference?.features.find((f) => f.properties.field_id === selected.id)?.properties
      : undefined;
  const shown = !!(site && (selected?.kind === "segment" || field));
  // With the map panel above it (a phone in landscape), a field opens scrolled to its top.
  const fieldRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (top && selected) fieldRef.current?.scrollIntoView({ block: "start" });
  }, [top !== null, selected?.kind, selected?.id]);
  return (
    <aside
      className={`panel${sheet ? " sheet" : ""}${sheet && sheetOpen ? " sheet-open" : ""}`}
      data-testid="panel"
      data-sheet={sheet ? (sheetOpen ? "open" : "closed") : undefined}
      aria-label={t(lang, "details")}
    >
      {top}
      {sheet && (
        <SheetBar site={site} season={season} selected={selected} alertsOpen={alertsOpen} open={sheetOpen} onOpen={onSheet} onSelect={onSelect} />
      )}
      {site && alertsOpen && (
        // Kept mounted while a field is open, so "Back to alerts" returns to the same rows.
        <section hidden={selected !== null}>
          <h2 className="panel-title">{t(lang, "alerts")}</h2>
          <AlertsList siteId={site.site_id} code={alertCode} onCode={onAlertCode} onOpen={onOpenAlert} />
        </section>
      )}
      <section ref={fieldRef} hidden={alertsOpen && selected === null}>
        {alertsOpen && selected && (
          <button type="button" className="btn btn-ghost btn-sm back" data-testid="back-to-alerts" onClick={() => onSelect(null)}>
            <Icon name="arrowLeft" /> {t(lang, "backToAlerts")}
          </button>
        )}
        {shown && <h2 className="panel-title">{t(lang, selected?.kind === "reference" ? "referenceTitle" : "fieldTitle")}</h2>}
        {site && selected?.kind === "segment" && (
          <>
            {selected.from && (
              <button
                type="button"
                className="btn btn-ghost btn-sm back"
                data-testid="back-to-reference"
                onClick={() => onSelect({ kind: "reference", id: selected.from! })}
              >
                <Icon name="arrowLeft" /> {t(lang, "backToReference", { id: selected.from })}
              </button>
            )}
            <FieldDetail key={`${site.site_id}/${selected.id}`} site={site} segmentId={selected.id} onZoom={onZoom} />
          </>
        )}
        {site && field && (
          <ReferenceDetail
            site={site}
            field={field}
            onZoom={onZoom}
            onOpenSegment={(id) => onSelect({ kind: "segment", id, from: field.field_id })}
          />
        )}
        {!shown && site && <SiteFacts site={site} season={season} referenceOn={referenceOn} />}
      </section>
      {site && shown && (
        <p className="muted small site-note">
          {t(lang, "siteNote", { site: siteName(lang, site), n: formatNumber(lang, site.segment_count), d: formatNumber(lang, site.dated_segment_count) })}
        </p>
      )}
    </aside>
  );
}
