import { formatDate, t, useLang, type Key, type Lang } from "./i18n";
import {
  IMAGE_PRODUCTS,
  changeFor,
  changeLayers,
  changeName,
  layerDates,
  rampCss,
  type Product,
  type RadarSettings,
  type RadarView,
  type RasterIndex,
  type RasterLayer,
} from "./radar";
import { InfoTip } from "./ui";

type Props = {
  index: RasterIndex | null;
  settings: RadarSettings;
  view: RadarView | null;
  onChange: (s: RadarSettings) => void;
};

/** Plain name of a product, with the technical term kept. */
export const productName = (lang: Lang, p: Product) => t(lang, `prod_${p}` as Key);

// Legend line of one layer: its ramp over the stretch and the library's description of the
// colours (meaning.text, cited in meaning.source), shown as the library wrote it.
function Legend({ layer, side, dates }: { layer: RasterLayer; side?: string; dates?: string }) {
  const lang = useLang();
  const [lo, hi] = layer.stretch;
  return (
    <div className="radar-legend" data-testid="radar-legend">
      <div className="radar-legend-head">
        {side && <strong>{side}: </strong>}
        {productName(lang, layer.product)}, <span>{dates ?? layerDates(lang, layer)}</span>
      </div>
      <div className="radar-ramp" style={{ background: rampCss(layer) }} />
      <div className="ramp-labels">
        <span>{lo} dB</span>
        <span>{hi} dB</span>
      </div>
      <p className="radar-meaning" lang="en" title={t(lang, "sourceIs", { src: layer.meaning.source })}>
        {layer.meaning.text}
      </p>
    </div>
  );
}

// "Radar imagery" settings under More options: the product and date(s) of the current view
// (Radar image: one date, optionally following the time slider; Before / after: two dates
// side by side with a divider), opacity, outlines and the full legend. The view itself is
// picked with the map's view switch; the map work is in MapView.
export default function RadarControl({ index, settings: s, view, onChange }: Props) {
  const lang = useLang();
  const set = (patch: Partial<RadarSettings>) => onChange({ ...s, ...patch });
  const dates = index?.dates ?? [];
  const hasChange = !!index && changeLayers(index).length > 0;
  const pairChange = index ? changeFor(index, s.left, s.right) : null;
  const products: Product[] = hasChange ? [...IMAGE_PRODUCTS, "change"] : IMAGE_PRODUCTS;
  const sameProduct = !!view?.left && !!view.right && view.left.product === view.right.product;
  const dateOptions = (list: string[]) =>
    list.map((d) => (
      <option key={d} value={d}>
        {formatDate(lang, d)}
      </option>
    ));

  return (
    <div className="radar" data-testid="radar">
      <div className="layer-head">
        <span className="layer-title">
          {t(lang, "radarImagery")}
          <InfoTip text={t(lang, "tipRadar")} />
        </span>
      </div>
      {!index && <p className="muted small radar-none">{t(lang, "noRadarTiles")}</p>}
      {index && s.mode === "off" && <p className="muted small radar-none" data-testid="radar-pick">{t(lang, "radarPickView")}</p>}
      {index && s.mode === "single" && (
        <div className="radar-body">
          <label className="field-row">
            <span>{t(lang, "product")}</span>
            <select className="select" value={s.product} data-testid="radar-product" onChange={(e) => set({ product: e.target.value as Product })}>
              {products.map((p) => (
                <option key={p} value={p}>
                  {productName(lang, p)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>{t(lang, s.product === "change" ? "pair" : "date")}</span>
            {s.product === "change" ? (
              <select
                className="select"
                value={view?.left?.id ?? ""}
                disabled={s.follow}
                data-testid="radar-date-select"
                onChange={(e) => set({ changeId: e.target.value })}
              >
                {!view?.left && <option value="">—</option>}
                {changeLayers(index).map((l) => (
                  <option key={l.id} value={l.id}>
                    {changeName(lang, l)}
                  </option>
                ))}
              </select>
            ) : (
              <select
                className="select"
                value={view?.left?.date ?? ""}
                disabled={s.follow}
                data-testid="radar-date-select"
                onChange={(e) => set({ date: e.target.value })}
              >
                {!view?.left && <option value="">—</option>}
                {dateOptions(dates)}
              </select>
            )}
          </label>
          <label className="check" title={t(lang, "followTitle")}>
            <input type="checkbox" checked={s.follow} data-testid="radar-follow" onChange={(e) => set({ follow: e.target.checked })} />
            <span>{t(lang, "followSlider")}</span>
          </label>
        </div>
      )}
      {index && s.mode === "compare" && (
        <div className="radar-body">
          <label className="field-row">
            <span>{t(lang, "product")}</span>
            <select className="select" value={s.product === "change" ? "HV" : s.product} data-testid="radar-product" onChange={(e) => set({ product: e.target.value as Product })}>
              {IMAGE_PRODUCTS.map((p) => (
                <option key={p} value={p}>
                  {productName(lang, p)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>{t(lang, "leftEarlier")}</span>
            <select
              className="select"
              value={s.left ?? ""}
              data-testid="radar-left"
              onChange={(e) => {
                const left = e.target.value;
                set({ left, right: s.right && s.right > left ? s.right : dates[dates.indexOf(left) + 1] });
              }}
            >
              {dateOptions(dates.slice(0, -1))}
            </select>
          </label>
          <label className="field-row">
            <span>{t(lang, "rightLater")}</span>
            <select className="select" value={s.right ?? ""} data-testid="radar-right" onChange={(e) => set({ right: e.target.value })}>
              {dateOptions(dates.filter((d) => !s.left || d > s.left))}
            </select>
          </label>
          {hasChange && (
            <label className="check" title={pairChange ? undefined : t(lang, "rightChangeTitle")}>
              <input
                type="checkbox"
                checked={s.rightChange && !!pairChange}
                disabled={!pairChange}
                data-testid="radar-right-change"
                onChange={(e) => set({ rightChange: e.target.checked })}
              />
              <span>{t(lang, pairChange ? "rightChange" : "rightChangeNone")}</span>
            </label>
          )}
        </div>
      )}
      {index && s.mode !== "off" && (
        <>
          <div className="radar-body">
            <label className="field-row">
              <span>{t(lang, "opacity")}</span>
              <input
                className="range-sm"
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={s.opacity}
                data-testid="radar-opacity"
                onChange={(e) => set({ opacity: Number(e.target.value) })}
              />
            </label>
            <label className="check">
              <input type="checkbox" checked={s.outlines} data-testid="radar-outlines" onChange={(e) => set({ outlines: e.target.checked })} />
              <span>{t(lang, "outlinesOnTop")}</span>
            </label>
          </div>
          {view?.left && sameProduct ? (
            <Legend
              layer={view.left}
              side={t(lang, "bothSides")}
              dates={t(lang, "leftRight", { l: layerDates(lang, view.left), r: layerDates(lang, view.right!) })}
            />
          ) : (
            <>
              {view?.left && <Legend layer={view.left} side={s.mode === "compare" ? t(lang, "left") : undefined} />}
              {view?.right && <Legend layer={view.right} side={t(lang, "right")} />}
            </>
          )}
          {s.outlines && <p className="radar-meaning muted">{t(lang, "outlinesNote")}</p>}
          <p className="radar-credit" title={t(lang, "sourceIs", { src: index.attribution.source })}>
            {t(lang, "imagery", { text: index.attribution.text })}
          </p>
        </>
      )}
    </div>
  );
}
