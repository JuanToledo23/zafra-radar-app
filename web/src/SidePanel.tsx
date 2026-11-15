import type { Selection, Site } from "./App";
import AlertsList from "./AlertsList";
import type { AlertRow } from "./alerts";
import FieldDetail, { type SegmentDetail } from "./FieldDetail";
import { formatNumber, siteName, t, tValue, useLang } from "./i18n";
import { Icon } from "./icons";
import ReferenceDetail from "./ReferenceDetail";
import type { ReferenceCollection } from "./reference";
import { seasonLabel } from "./ops";

type Props = {
  site: Site | null;
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

/** Nothing selected: the site in three numbers and one line on what to do next. */
function SiteFacts({ site, referenceOn }: { site: Site; referenceOn: boolean }) {
  const lang = useLang();
  const n = (v: number) => formatNumber(lang, v);
  const pct = site.segment_count ? Math.round((100 * site.dated_segment_count) / site.segment_count) : 0;
  return (
    <div className="site-facts" data-testid="panel-empty">
      <h2 className="panel-title">
        {tValue(lang, `short_${site.site_id}`, site.name)} <span className="muted">· {seasonLabel(site.season)}</span>
      </h2>
      <p className="muted small site-facts-name">{siteName(lang, site)}</p>
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

export default function SidePanel({
  site, selected, reference, referenceOn, onZoom, onSelect, alertsOpen, alertCode, onAlertCode, onOpenAlert,
}: Props) {
  const lang = useLang();
  const field =
    selected?.kind === "reference"
      ? reference?.features.find((f) => f.properties.field_id === selected.id)?.properties
      : undefined;
  const shown = !!(site && (selected?.kind === "segment" || field));
  return (
    <aside className="panel" data-testid="panel" aria-label={t(lang, "details")}>
      {site && alertsOpen && (
        // Kept mounted while a field is open, so "Back to alerts" returns to the same rows.
        <section hidden={selected !== null}>
          <h2 className="panel-title">{t(lang, "alerts")}</h2>
          <AlertsList siteId={site.site_id} code={alertCode} onCode={onAlertCode} onOpen={onOpenAlert} />
        </section>
      )}
      <section hidden={alertsOpen && selected === null}>
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
        {!shown && site && <SiteFacts site={site} referenceOn={referenceOn} />}
      </section>
      {site && shown && (
        <p className="muted small site-note">
          {t(lang, "siteNote", { site: siteName(lang, site), n: formatNumber(lang, site.segment_count), d: formatNumber(lang, site.dated_segment_count) })}
        </p>
      )}
    </aside>
  );
}
