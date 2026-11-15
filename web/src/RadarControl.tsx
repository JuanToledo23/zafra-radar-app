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

// "Radar imagery" control over the map: off, one date (optionally following the time
// slider) or two dates side by side with a divider. The map work is in MapView.
export default function RadarControl({ index, settings: s, view, onChange }: Props) {
  const set = (patch: Partial<RadarSettings>) => onChange({ ...s, ...patch });
  const dates = index?.dates ?? [];
  const hasChange = !!index && changeLayers(index).length > 0;
  const pairChange = index ? changeFor(index, s.left, s.right) : null;
  const products: Product[] = hasChange ? [...IMAGE_PRODUCTS, "change"] : IMAGE_PRODUCTS;
  const sameProduct = !!view?.left && !!view.right && view.left.product === view.right.product;

  return (
    <div className="radar" data-testid="radar">
      <div className="radar-head">
        <span className="radar-title">Radar imagery</span>
        <span className="toggle" role="group" aria-label="Radar imagery">
          {MODES.map(([m, label]) => (
            <button
              key={m}
              type="button"
              className={s.mode === m ? "on" : ""}
              aria-pressed={s.mode === m}
              disabled={!index && m !== "off"}
              data-testid={`radar-${m}`}
              onClick={() => set({ mode: m })}
            >
              {label}
            </button>
          ))}
        </span>
      </div>
      {!index && <p className="muted radar-none">No radar tiles for this site.</p>}
      {index && s.mode === "single" && (
        <div className="radar-body">
          <label>
            Product{" "}
            <select value={s.product} data-testid="radar-product" onChange={(e) => set({ product: e.target.value as Product })}>
              {products.map((p) => (
                <option key={p} value={p}>
                  {p === "change" ? "HV change" : p}
                </option>
              ))}
            </select>
          </label>
          <label>
            {s.product === "change" ? "Pair" : "Date"}{" "}
            {s.product === "change" ? (
              <select
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
          <label title="Show the latest acquisition on or before the time slider date">
            <input type="checkbox" checked={s.follow} data-testid="radar-follow" onChange={(e) => set({ follow: e.target.checked })} />{" "}
            Follow time slider
          </label>
        </div>
      )}
      {index && s.mode === "compare" && (
        <div className="radar-body">
          <label>
            Product{" "}
            <select value={s.product === "change" ? "HV" : s.product} data-testid="radar-product" onChange={(e) => set({ product: e.target.value as Product })}>
              {IMAGE_PRODUCTS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label>
            Left (earlier){" "}
            <select
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
          <label>
            Right (later){" "}
            <select value={s.right ?? ""} data-testid="radar-right" onChange={(e) => set({ right: e.target.value })}>
              {dates.filter((d) => !s.left || d > s.left).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          {hasChange && (
            <label title={pairChange ? undefined : "The library has change layers for consecutive dates only, plus the season layer for the first and last date"}>
              <input
                type="checkbox"
                checked={s.rightChange && !!pairChange}
                disabled={!pairChange}
                data-testid="radar-right-change"
                onChange={(e) => set({ rightChange: e.target.checked })}
              />{" "}
              Right side: HV change of the pair{pairChange ? "" : " (not available for these dates)"}
            </label>
          )}
        </div>
      )}
      {index && s.mode !== "off" && (
        <>
          <div className="radar-body">
            <label>
              Opacity{" "}
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={s.opacity}
                data-testid="radar-opacity"
                onChange={(e) => set({ opacity: Number(e.target.value) })}
              />
            </label>
            <label>
              <input type="checkbox" checked={s.outlines} data-testid="radar-outlines" onChange={(e) => set({ outlines: e.target.checked })} />{" "}
              Field outlines on top
            </label>
          </div>
          {view?.note && <p className="note" data-testid="radar-note">{view.note}</p>}
          {view?.left && sameProduct ? (
            <Legend layer={view.left} side="Both sides" dates={`left ${layerDates(view.left)}, right ${layerDates(view.right!)}`} />
          ) : (
            <>
              {view?.left && <Legend layer={view.left} side={s.mode === "compare" ? "Left" : undefined} />}
              {view?.right && <Legend layer={view.right} side="Right" />}
            </>
          )}
          {s.outlines && (
            <p className="radar-meaning">Outlines: harvested segments in the harvest-date colours, standing cane green.</p>
          )}
          <p className="radar-credit" title={`Source: ${index.attribution.source}`}>
            Imagery: {index.attribution.text}
          </p>
        </>
      )}
    </div>
  );
}
