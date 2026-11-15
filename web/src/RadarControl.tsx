import {
  IMAGE_PRODUCTS,
  changeFor,
  changeLayers,
  changeName,
  layerDates,
  rampCss,
  type Product,
  type RadarMode,
  type RadarSettings,
  type RadarView,
  type RasterIndex,
  type RasterLayer,
} from "./radar";
import { InfoTip, Segmented } from "./ui";

type Props = {
  index: RasterIndex | null;
  settings: RadarSettings;
  view: RadarView | null;
  onChange: (s: RadarSettings) => void;
};

const MODES: [RadarMode, string][] = [
  ["off", "Off"],
  ["single", "Single date"],
  ["compare", "Compare"],
];
// Plain names of the products, with the technical term kept.
const PRODUCT_NAMES: Record<Product, string> = {
  HV: "HV backscatter",
  HH: "HH backscatter",
  "cross-ratio": "HV − HH cross-ratio",
  change: "HV change",
};

// Legend line of one layer: its ramp over the stretch and the library's description of the
// colours (meaning.text, cited in meaning.source).
function Legend({ layer, side, dates }: { layer: RasterLayer; side?: string; dates?: string }) {
  const [lo, hi] = layer.stretch;
  return (
    <div className="radar-legend" data-testid="radar-legend">
      <div className="radar-legend-head">
        {side && <strong>{side}: </strong>}
        {layer.label}, <span data-testid="radar-date">{dates ?? layerDates(layer)}</span>
      </div>
      <div className="radar-ramp" style={{ background: rampCss(layer) }} />
      <div className="ramp-labels">
        <span>{lo} dB</span>
        <span>{hi} dB</span>
      </div>
      <p className="radar-meaning" title={`Source: ${layer.meaning.source}`}>
        {layer.meaning.text}
      </p>
    </div>
  );
}

// "Radar imagery" section of the map layers panel: off, one date (optionally following the
// time slider) or two dates side by side with a divider. The map work is in MapView.
export default function RadarControl({ index, settings: s, view, onChange }: Props) {
  const set = (patch: Partial<RadarSettings>) => onChange({ ...s, ...patch });
  const dates = index?.dates ?? [];
  const hasChange = !!index && changeLayers(index).length > 0;
  const pairChange = index ? changeFor(index, s.left, s.right) : null;
  const products: Product[] = hasChange ? [...IMAGE_PRODUCTS, "change"] : IMAGE_PRODUCTS;
  const sameProduct = !!view?.left && !!view.right && view.left.product === view.right.product;

  return (
    <div className="radar" data-testid="radar">
      <div className="layer-head">
        <span className="layer-title">
          Radar imagery
          <InfoTip text="The NISAR L-band radar images under the fields; in HV, brighter means tall vegetation such as standing cane, darker means smooth bare soil or calm water." />
        </span>
      </div>
      <Segmented
        label="Radar imagery"
        size="sm"
        className="seg-block"
        value={s.mode}
        onChange={(m) => set({ mode: m })}
        options={MODES.map(([m, label]) => ({ value: m, label, disabled: !index && m !== "off", testId: `radar-${m}` }))}
      />
      {!index && <p className="muted small radar-none">No radar tiles for this site.</p>}
      {index && s.mode === "single" && (
        <div className="radar-body">
          <label className="field-row">
            <span>Product</span>
            <select className="select" value={s.product} data-testid="radar-product" onChange={(e) => set({ product: e.target.value as Product })}>
              {products.map((p) => (
                <option key={p} value={p}>
                  {PRODUCT_NAMES[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>{s.product === "change" ? "Pair" : "Date"}</span>
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
                    {changeName(l)}
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
                {dates.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className="check" title="Show the latest acquisition on or before the time slider date">
            <input type="checkbox" checked={s.follow} data-testid="radar-follow" onChange={(e) => set({ follow: e.target.checked })} />
            <span>Follow time slider</span>
          </label>
        </div>
      )}
      {index && s.mode === "compare" && (
        <div className="radar-body">
          <label className="field-row">
            <span>Product</span>
            <select className="select" value={s.product === "change" ? "HV" : s.product} data-testid="radar-product" onChange={(e) => set({ product: e.target.value as Product })}>
              {IMAGE_PRODUCTS.map((p) => (
                <option key={p} value={p}>
                  {PRODUCT_NAMES[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Left (earlier)</span>
            <select
              className="select"
              value={s.left ?? ""}
              data-testid="radar-left"
              onChange={(e) => {
                const left = e.target.value;
                set({ left, right: s.right && s.right > left ? s.right : dates[dates.indexOf(left) + 1] });
              }}
            >
              {dates.slice(0, -1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Right (later)</span>
            <select className="select" value={s.right ?? ""} data-testid="radar-right" onChange={(e) => set({ right: e.target.value })}>
              {dates.filter((d) => !s.left || d > s.left).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          {hasChange && (
            <label className="check" title={pairChange ? undefined : "The library has change layers for consecutive dates only, plus the season layer for the first and last date"}>
              <input
                type="checkbox"
                checked={s.rightChange && !!pairChange}
                disabled={!pairChange}
                data-testid="radar-right-change"
                onChange={(e) => set({ rightChange: e.target.checked })}
              />
              <span>Right side: HV change of the pair{pairChange ? "" : " (not available for these dates)"}</span>
            </label>
          )}
        </div>
      )}
      {index && s.mode !== "off" && (
        <>
          <div className="radar-body">
            <label className="field-row">
              <span>Opacity</span>
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
              <span>Field outlines on top</span>
            </label>
          </div>
          {view?.note && <p className="note small" data-testid="radar-note">{view.note}</p>}
          {view?.left && sameProduct ? (
            <Legend layer={view.left} side="Both sides" dates={`left ${layerDates(view.left)}, right ${layerDates(view.right!)}`} />
          ) : (
            <>
              {view?.left && <Legend layer={view.left} side={s.mode === "compare" ? "Left" : undefined} />}
              {view?.right && <Legend layer={view.right} side="Right" />}
            </>
          )}
          {s.outlines && (
            <p className="radar-meaning muted">Outlines: harvested segments in the harvest-date colours, standing cane green.</p>
          )}
          <p className="radar-credit" title={`Source: ${index.attribution.source}`}>
            Imagery: {index.attribution.text}
          </p>
        </>
      )}
    </div>
  );
}
