import { useId, useState, type PointerEvent } from "react";
import { linearScale, monthLabel, monthTicks, nearestIndex } from "./chartScale";
import { FIRE_COLOR, GRID_COLOR, HARVEST_COLOR, REFERENCE_COLOR } from "./colors";
import { fromDay } from "./season";

export type Marker = "circle" | "square" | "diamond";
export type ChartPoint = { day: number; value: number; note?: string };
export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  marker: Marker;
  dash?: string;
  points: ChartPoint[];
};

type Props = {
  yTitle: string;
  unit: string;
  xDomain: [number, number];
  yTicks: number[]; // first and last tick are the y domain
  series: ChartSeries[];
  harvest: { day: number; unc: number } | null;
  fireDays: number[];
  reference?: { value: number; label: string };
  xLabels?: boolean; // month labels and the x title, on the bottom chart only
  format: (v: number) => string;
};

// Fixed coordinate system; the SVG scales to the panel width.
const W = 368;
const PLOT_H = 112;
const M = { left: 44, right: 8, top: 9 };
const AXIS_GAP = 10; // room under the x axis for fire markers
const LABELS_H = 38; // two-line month labels + x axis title

export function MarkerShape({ shape, x, y, color, r = 3.2 }: { shape: Marker; x: number; y: number; color: string; r?: number }) {
  if (shape === "square") return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} fill={color} />;
  if (shape === "diamond") {
    const d = r * 1.35;
    return <path d={`M${x},${y - d}L${x + d},${y}L${x},${y + d}L${x - d},${y}Z`} fill={color} />;
  }
  return <circle cx={x} cy={y} r={r} fill={color} />;
}

/** Legend swatch: a short line in the series' dash with its marker in the middle. */
export function SeriesSwatch({ color, marker, dash }: { color: string; marker: Marker; dash?: string }) {
  return (
    <svg width={26} height={10} aria-hidden="true">
      <line x1={1} x2={25} y1={5} y2={5} stroke={color} strokeWidth={1.5} strokeDasharray={dash} />
      <MarkerShape shape={marker} x={13} y={5} color={color} />
    </svg>
  );
}

export default function TimeSeriesChart(p: Props) {
  const clipId = `clip${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [hover, setHover] = useState<number | null>(null);

  const plotBottom = M.top + PLOT_H;
  const H = plotBottom + AXIS_GAP + (p.xLabels ? LABELS_H : 0);
  const x = linearScale(p.xDomain, [M.left, W - M.right]);
  const y = linearScale([p.yTicks[0], p.yTicks[p.yTicks.length - 1]], [plotBottom, M.top]);
  const inX = (d: number) => d >= p.xDomain[0] && d <= p.xDomain[1];

  // Every plotted point, flattened for the hover search.
  const flat = p.series.flatMap((s) =>
    s.points.filter((pt) => inX(pt.day)).map((pt) => ({ s, pt, x: x(pt.day), y: y(pt.value) })),
  );
  const months = monthTicks(p.xDomain[0], p.xDomain[1]);
  const fires = [...new Set(p.fireDays)].filter(inX);
  const h = hover !== null ? flat[hover] : undefined;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const k = W / r.width;
    const i = nearestIndex(flat, (e.clientX - r.left) * k, (e.clientY - r.top) * k);
    setHover(i < 0 ? null : i);
  };

  return (
    <div className="chart">
      <div className="readout" aria-live="polite">
        {h ? (
          <>
            <strong>{fromDay(h.pt.day)}</strong> · {h.s.label}: {p.format(h.pt.value)} {p.unit}
            {h.pt.note && <span className="muted"> ({h.pt.note})</span>}
          </>
        ) : (
          <span className="muted">{flat.length ? "Hover the chart for values" : ""}</span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`${p.yTitle} over time`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            {/* a few pixels of slack so markers on the domain edges are drawn whole */}
            <rect x={M.left - 5} y={M.top - 5} width={W - M.left - M.right + 10} height={PLOT_H + 10} />
          </clipPath>
        </defs>

        {/* grid and y axis */}
        {p.yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke={GRID_COLOR} />
            <text x={M.left - 4} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
              {p.format(t)}
            </text>
          </g>
        ))}
        {months.map((d) => (
          <line key={`m${d}`} x1={x(d)} x2={x(d)} y1={M.top} y2={plotBottom + 3} stroke={GRID_COLOR} />
        ))}
        <text
          className="axis-title"
          transform={`translate(11 ${M.top + PLOT_H / 2}) rotate(-90)`}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {p.yTitle}
        </text>

        <g clipPath={`url(#${clipId})`}>
          {p.harvest && (
            <>
              <rect
                x={x(p.harvest.day - p.harvest.unc)}
                width={Math.max(x(p.harvest.day + p.harvest.unc) - x(p.harvest.day - p.harvest.unc), 1)}
                y={M.top}
                height={PLOT_H}
                fill={HARVEST_COLOR}
                opacity={0.2}
              />
              <line x1={x(p.harvest.day)} x2={x(p.harvest.day)} y1={M.top} y2={plotBottom} stroke={HARVEST_COLOR} strokeWidth={2} />
            </>
          )}
          {p.reference && (
            <>
              <line
                x1={M.left}
                x2={W - M.right}
                y1={y(p.reference.value)}
                y2={y(p.reference.value)}
                stroke={REFERENCE_COLOR}
                strokeDasharray="2 3"
              />
              <text x={W - M.right - 3} y={y(p.reference.value) - 3} className="tick" textAnchor="end">
                {p.reference.label}
              </text>
            </>
          )}
          {p.series.map((s) => (
            <g key={s.key}>
              <polyline
                points={s.points.map((pt) => `${x(pt.day)},${y(pt.value)}`).join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth={1.5}
                strokeDasharray={s.dash}
              />
              {s.points.map((pt, i) => (
                <MarkerShape key={i} shape={s.marker} x={x(pt.day)} y={y(pt.value)} color={s.color} />
              ))}
            </g>
          ))}
          {h && (
            <>
              <line x1={h.x} x2={h.x} y1={M.top} y2={plotBottom} stroke="#1f2328" strokeOpacity={0.35} />
              <circle cx={h.x} cy={h.y} r={6} fill="none" stroke="#1f2328" strokeWidth={1.5} />
            </>
          )}
        </g>

        {!flat.length && (
          <text x={(M.left + W - M.right) / 2} y={M.top + PLOT_H / 2} className="tick" textAnchor="middle">
            No data for this field
          </text>
        )}

        {/* x axis and fire markers sitting on it */}
        <line x1={M.left} x2={W - M.right} y1={plotBottom} y2={plotBottom} stroke="#8c959f" />
        {fires.map((d) => (
          <path
            key={`f${d}`}
            d={`M${x(d)},${plotBottom - 1}l4,7h-8Z`}
            fill={FIRE_COLOR}
            stroke="#fff"
            strokeWidth={0.6}
          >
            <title>Fire {fromDay(d)}</title>
          </path>
        ))}

        {p.xLabels && (
          <>
            {months.map((d, i) => {
              const [m, yr] = monthLabel(d, i === 0);
              return (
                <text key={`l${d}`} x={x(d)} y={plotBottom + AXIS_GAP + 6} className="tick" textAnchor="middle">
                  <tspan x={x(d)}>{m}</tspan>
                  {yr && (
                    <tspan x={x(d)} dy={10}>
                      {yr}
                    </tspan>
                  )}
                </text>
              );
            })}
            <text x={(M.left + W - M.right) / 2} y={H - 2} className="axis-title" textAnchor="middle">
              Acquisition date
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
