import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { Site } from "./App";
import { linearScale, monthLabel, monthTicks, nearestIndex, niceTicks, pearson } from "./chartScale";
import { FIRE_COLOR, GRID_COLOR, HARVEST_COLOR, MARKER_COLOR, OFFICIAL_COLOR, REFERENCE_COLOR } from "./colors";
import { formatDate, formatNumber, t, tValue, useLang, type Key, type Lang } from "./i18n";
import { fromDay, toDay } from "./season";
import { Icon } from "./icons";
import { MarkerShape, SeriesSwatch, type Marker } from "./TimeSeriesChart";
import { Skeleton, TitleTip } from "./ui";

// GET /weekly/{site} (docs/API.md).
export type WeekRow = { week_start: string; harvests: number; fires_all: number; fires_cane: number };
type CumulativeWeek = {
  cutoff: string;
  report: number;
  official_cum_ha: number;
  detected_cum_ha: number;
  official_pct: number;
  detected_pct: number;
};
type Crossing = { official: string | null; detected: string | null };
export type Weekly = {
  weeks: WeekRow[];
  cumulative: {
    official_total_ha: number;
    detected_total_ha: number;
    weeks: CumulativeWeek[];
    crossings: Record<string, Crossing>;
  } | null;
};

// Positions on the shared x axis are instants in days since 1970-01-01: a Monday week spans
// [Monday, Monday + 7), and a date shown as a point (a cut-off, the slider's Sunday) sits at
// the end of that day (+1), so the slider marker falls on the right edge of its week's bar.
const AX = { left: 46, right: 14, top: 4 };
const TITLE_H = 15; // panel title (with units) above each bar panel
const PANEL_GAP = 4;
const X_LABELS_H = 36; // month line, year line and the x axis title
const MIN_LABEL_GAP = 14; // px between the axis start and the first month label
const LEVELS = [25, 50, 75];
const MIN_FIRES_FOR_R = 30; // fewer fires in cane over the weeks shown: r is not displayed
const CUM_SERIES: { key: "detected" | "official"; label: Key; color: string; marker: Marker; dash?: string }[] = [
  { key: "detected", label: "seriesDetected", color: HARVEST_COLOR, marker: "square", dash: "5 3" },
  { key: "official", label: "seriesOfficial", color: OFFICIAL_COLOR, marker: "circle" },
];

const ha = (lang: Lang, v: number) => `${formatNumber(lang, Math.round(v))} ha`;
const int = (lang: Lang, v: number) => formatNumber(lang, v);
const date = (lang: Lang, iso: string) => formatDate(lang, iso);

/** Pixel size of an element, kept up to date with a ResizeObserver. */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Month grid labels and the x axis title under a plot ending at `bottom`. */
function MonthAxis({ x, xDomain, bottom, title }: { x: (d: number) => number; xDomain: [number, number]; bottom: number; title: string }) {
  const lang = useLang();
  // A month starting within a few days of the axis start would collide with the y tick "0".
  const months = monthTicks(xDomain[0], xDomain[1]).filter((d) => x(d) - x(xDomain[0]) >= MIN_LABEL_GAP);
  return (
    <>
      <line x1={x(xDomain[0])} x2={x(xDomain[1])} y1={bottom} y2={bottom} stroke="#8c959f" />
      {months.map((d, i) => {
        const [m, yr] = monthLabel(lang, d, i === 0);
        return (
          <text key={d} x={x(d)} y={bottom + 11} className="tick" textAnchor="middle">
            <tspan x={x(d)}>{m}</tspan>
            {yr && (
              <tspan x={x(d)} dy={10}>
                {yr}
              </tspan>
            )}
          </text>
        );
      })}
      <text x={(x(xDomain[0]) + x(xDomain[1])) / 2} y={bottom + X_LABELS_H - 2} className="axis-title" textAnchor="middle">
        {title}
      </text>
    </>
  );
}

/** The time slider's week: a vertical line, with a small flag on top unless `flag` is false. */
function SliderMarker({ x, top, bottom, flag = true }: { x: number; top: number; bottom: number; flag?: boolean }) {
  return (
    <g data-testid="slider-marker" pointerEvents="none">
      <line x1={x} x2={x} y1={top} y2={bottom} stroke={MARKER_COLOR} strokeWidth={1.5} />
      {flag && <path d={`M${x - 4},${top}h8l-4,5Z`} fill={MARKER_COLOR} />}
    </g>
  );
}

function MarkerSwatch() {
  return (
    <svg width={14} height={12} aria-hidden="true">
      <line x1={7} x2={7} y1={0} y2={12} stroke={MARKER_COLOR} strokeWidth={1.5} />
      <path d="M3,0h8l-4,5Z" fill={MARKER_COLOR} />
    </svg>
  );
}

type ChartProps = { xDomain: [number, number]; markerDay: number | null; onPick: (day: number) => void };

/** Two bar panels on one weekly x axis: detected harvests on top, fires in cane below. */
function WeeklyBars({ weeks, xDomain, markerDay, onPick }: ChartProps & { weeks: WeekRow[] }) {
  const lang = useLang();
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const first = toDay(weeks[0].week_start);
  const x = linearScale(xDomain, [AX.left, w - AX.right]);
  const panelH = Math.max((h - AX.top - 2 * TITLE_H - PANEL_GAP - X_LABELS_H) / 2, 16);
  const panels = [
    { key: "harvests", title: t(lang, "barsHarvests"), color: HARVEST_COLOR, values: weeks.map((r) => r.harvests) },
    {
      key: "fires",
      title: t(lang, "barsFires"),
      color: FIRE_COLOR,
      values: weeks.map((r) => r.fires_cane),
    },
  ].map((p, i) => {
    const top = AX.top + TITLE_H + i * (panelH + PANEL_GAP + TITLE_H);
    const ticks = niceTicks(0, Math.max(...p.values, 1), 2);
    return { ...p, top, ticks, y: linearScale([0, ticks[ticks.length - 1]], [top + panelH, top]) };
  });
  const plotBottom = panels[1].top + panelH;
  const markerX = markerDay !== null && markerDay >= xDomain[0] && markerDay <= xDomain[1] ? x(markerDay) : null;
  const months = monthTicks(xDomain[0], xDomain[1]);

  const weekAt = (e: MouseEvent<SVGSVGElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const day = xDomain[0] + ((px - AX.left) / (w - AX.left - AX.right)) * (xDomain[1] - xDomain[0]);
    const i = Math.floor((day - first) / 7);
    return i >= 0 && i < weeks.length ? i : null;
  };
  const hw = hover !== null ? weeks[hover] : null;

  return (
    <div className="season-chart">
      <div className="readout" aria-live="polite">
        {hw ? (
          <>
            <strong>
              {t(lang, "weekReadout", { from: date(lang, hw.week_start), to: date(lang, fromDay(toDay(hw.week_start) + 6)) })}
            </strong>{" "}
            {t(lang, "weekReadoutValues", { h: int(lang, hw.harvests), f: int(lang, hw.fires_cane) })}
          </>
        ) : (
          <span className="muted">{t(lang, "hoverWeek")}</span>
        )}
      </div>
      <div className="season-plot" ref={ref}>
        {w > 0 && (
          <svg
            width={w}
            height={h}
            role="img"
            aria-label={t(lang, "barsAria")}
            data-testid="weekly-chart"
            onPointerMove={(e) => setHover(weekAt(e))}
            onPointerLeave={() => setHover(null)}
            onClick={(e) => {
              const i = weekAt(e);
              if (i !== null) onPick(toDay(weeks[i].week_start) + 6);
            }}
          >
            {panels.map((p) => (
              <g key={p.key}>
                <text x={AX.left} y={p.top - 4} className="axis-title">
                  {p.title}
                </text>
                {p.ticks.map((t) => (
                  <g key={t}>
                    <line x1={AX.left} x2={w - AX.right} y1={p.y(t)} y2={p.y(t)} stroke={GRID_COLOR} />
                    <text x={AX.left - 4} y={p.y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
                      {int(lang, t)}
                    </text>
                  </g>
                ))}
                {months.map((d) => (
                  <line key={d} x1={x(d)} x2={x(d)} y1={p.top} y2={p.top + panelH} stroke={GRID_COLOR} />
                ))}
                {hover !== null && (
                  <rect
                    x={x(first + 7 * hover)}
                    width={x(first + 7 * hover + 7) - x(first + 7 * hover)}
                    y={p.top}
                    height={panelH}
                    fill={MARKER_COLOR}
                    opacity={0.08}
                  />
                )}
                {p.values.map((v, i) =>
                  v > 0 ? (
                    <rect
                      key={i}
                      x={x(first + 7 * i) + 0.5}
                      width={Math.max(x(first + 7 * i + 7) - x(first + 7 * i) - 1, 1)}
                      y={p.y(v)}
                      height={p.y(0) - p.y(v)}
                      fill={p.color}
                    />
                  ) : null,
                )}
                <line x1={AX.left} x2={w - AX.right} y1={p.y(0)} y2={p.y(0)} stroke="#8c959f" />
              </g>
            ))}
            {/* drawn per panel, so it does not cross the lower panel's title */}
            {markerX !== null &&
              panels.map((p, i) => <SliderMarker key={p.key} x={markerX} top={p.top} bottom={p.top + panelH} flag={i === 0} />)}
            <MonthAxis x={x} xDomain={xDomain} bottom={plotBottom} title={t(lang, "weekAxis")} />
          </svg>
        )}
      </div>
    </div>
  );
}

/** Detected and official cumulative share of the season area, per official cut-off. */
function CumulativeChart({ cum, xDomain, markerDay, onPick }: ChartProps & { cum: NonNullable<Weekly["cumulative"]> }) {
  const lang = useLang();
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const top = AX.top + 6;
  const bottom = Math.max(h - X_LABELS_H, top + 20);
  const x = linearScale(xDomain, [AX.left, w - AX.right]);
  const y = linearScale([0, 100], [bottom, top]);
  const points = cum.weeks.map((r) => ({ r, x: x(toDay(r.cutoff) + 1) }));
  const months = monthTicks(xDomain[0], xDomain[1]);
  const hr = hover !== null ? cum.weeks[hover] : null;
  const half = cum.crossings["50"];

  const weekAt = (e: MouseEvent<SVGSVGElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const i = nearestIndex(points.map((p) => ({ x: p.x, y: 0 })), px, 0);
    return i < 0 ? null : i;
  };

  return (
    <div className="season-chart">
      <div className="readout" aria-live="polite">
        {hr ? (
          <>
            <strong>{t(lang, "cutoffReadout", { date: date(lang, hr.cutoff) })}</strong>{" "}
            {t(lang, "cutoffValues", {
              r: hr.report,
              dp: formatNumber(lang, hr.detected_pct, 1),
              dha: ha(lang, hr.detected_cum_ha),
              op: formatNumber(lang, hr.official_pct, 1),
              oha: ha(lang, hr.official_cum_ha),
            })}
          </>
        ) : (
          <span className="muted">{t(lang, "hoverCutoff")}</span>
        )}
      </div>
      <div className="season-plot" ref={ref}>
        {w > 0 && (
          <svg
            width={w}
            height={h}
            role="img"
            aria-label={t(lang, "cumAria")}
            data-testid="cumulative-chart"
            onPointerMove={(e) => setHover(weekAt(e))}
            onPointerLeave={() => setHover(null)}
            onClick={(e) => {
              const i = weekAt(e);
              if (i !== null) onPick(toDay(cum.weeks[i].cutoff));
            }}
          >
            {[0, ...LEVELS, 100].map((t) => {
              const level = LEVELS.includes(t);
              return (
                <g key={t}>
                  <line
                    x1={AX.left}
                    x2={w - AX.right}
                    y1={y(t)}
                    y2={y(t)}
                    stroke={level ? REFERENCE_COLOR : GRID_COLOR}
                    strokeDasharray={level ? "2 3" : undefined}
                  />
                  <text x={AX.left - 4} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
                    {t}
                  </text>
                </g>
              );
            })}
            {months.map((d) => (
              <line key={d} x1={x(d)} x2={x(d)} y1={top} y2={bottom} stroke={GRID_COLOR} />
            ))}
            <text
              className="axis-title"
              transform={`translate(10 ${(top + bottom) / 2}) rotate(-90)`}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {t(lang, "cumShare")}
            </text>
            {hr && hover !== null && (
              <line x1={points[hover].x} x2={points[hover].x} y1={top} y2={bottom} stroke={MARKER_COLOR} strokeOpacity={0.35} />
            )}
            {CUM_SERIES.map((s) => {
              const pct = (r: CumulativeWeek) => (s.key === "detected" ? r.detected_pct : r.official_pct);
              return (
                <g key={s.key}>
                  <polyline
                    points={points.map((p) => `${p.x},${y(pct(p.r))}`).join(" ")}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={1.5}
                    strokeDasharray={s.dash}
                  />
                  {points.map((p, i) => (
                    <MarkerShape key={i} shape={s.marker} x={p.x} y={y(pct(p.r))} color={s.color} r={2.6} />
                  ))}
                </g>
              );
            })}
            {markerDay !== null && markerDay >= xDomain[0] && markerDay <= xDomain[1] && (
              <SliderMarker x={x(markerDay)} top={top} bottom={bottom} />
            )}
            <MonthAxis x={x} xDomain={xDomain} bottom={bottom} title={t(lang, "cutoffAxis")} />
          </svg>
        )}
      </div>
      {half && (
        <p className="season-note" data-testid="crossing-50">
          {t(lang, "crossing")} <strong>{half.detected ? date(lang, half.detected) : t(lang, "notReached")}</strong>{" "}
          {t(lang, "crossingOfficial")} <strong>{half.official ? date(lang, half.official) : t(lang, "notReached")}</strong>
        </p>
      )}
    </div>
  );
}

function KeyNumber({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <div className="key-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

type Props = {
  site: Site;
  weekly: Weekly | null;
  sliderDay: number | null;
  expanded: boolean;
  onPick: (day: number) => void;
  onToggleSize: () => void;
  onClose: () => void;
};

export default function SeasonPanel({ site, weekly, sliderDay, expanded, onPick, onToggleSize, onClose }: Props) {
  const lang = useLang();
  const cum = site.has_official ? (weekly?.cumulative ?? null) : null;
  const officialHa = site.official_final?.area_ha ?? cum?.official_total_ha ?? null;
  const weeks = weekly?.weeks ?? [];
  const firesCane = weeks.reduce((n, w) => n + w.fires_cane, 0);
  const r = pearson(
    weeks.map((w) => w.harvests),
    weeks.map((w) => w.fires_cane),
  );
  // One x axis for all charts: the weekly rows and the cut-offs (at the end of their day).
  const days = [
    ...weeks.flatMap((w) => [toDay(w.week_start), toDay(w.week_start) + 7]),
    ...(cum?.weeks.map((c) => toDay(c.cutoff) + 1) ?? []),
  ];
  const xDomain: [number, number] = [Math.min(...days), Math.max(...days)];
  const markerDay = sliderDay === null ? null : sliderDay + 1;

  return (
    <section
      className={`season${expanded ? " expanded" : ""}`}
      data-testid="season-panel"
      data-expanded={expanded}
      aria-label={t(lang, "seasonProgress")}
    >
      <div className="season-head">
        <h2>
          {t(lang, "seasonProgress")} <span className="season-site">· {tValue(lang, `short_${site.site_id}`, site.name.split(",")[0])} {site.season}</span>
        </h2>
        <div className="season-buttons">
          <button type="button" className="btn btn-secondary btn-sm" aria-expanded={expanded} data-testid="season-size" onClick={onToggleSize}>
            <Icon name={expanded ? "collapse" : "expand"} /> {t(lang, expanded ? "collapse" : "expand")}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            <Icon name="close" /> {t(lang, "close")}
          </button>
        </div>
      </div>
      <div className="key-numbers season-numbers" data-testid="season-numbers">
        <KeyNumber value={ha(lang, site.cane_area_ha)} label={t(lang, "detectedCaneArea")} />
        <KeyNumber value={int(lang, site.segment_count)} label={t(lang, "caneSegments")} />
        <KeyNumber value={int(lang, site.dated_segment_count)} label={t(lang, "datedSegments")} />
        <KeyNumber value={ha(lang, site.dated_area_ha)} label={t(lang, "datedArea")} />
        {site.has_official && officialHa !== null ? (
          <>
            <KeyNumber
              value={ha(lang, officialHa)}
              label={`${t(lang, "officialMillArea")}${site.official_final?.mill ? ` (${site.official_final.mill})` : ""}`}
            />
            <KeyNumber value={`${Math.round((100 * site.cane_area_ha) / officialHa)} %`} label={t(lang, "detectedVsOfficial")} />
          </>
        ) : (
          <p className="muted season-none" data-testid="no-official">
            {t(lang, "noOfficial")}
          </p>
        )}
      </div>
      {!weekly ? (
        <Skeleton lines={4} label={t(lang, "loadingWeekly")} />
      ) : !weeks.length ? (
        <p className="muted">{t(lang, "noWeekly")}</p>
      ) : (
        <div className={`season-body${cum ? " two" : ""}`}>
          <div className="season-col">
            <div className="season-col-head">
              <TitleTip tip={t(lang, "tipHarvestsFires")}>{t(lang, "harvestsFires")}</TitleTip>
              <div className="chart-legend">
                <span>
                  <MarkerSwatch /> {t(lang, "sliderWeek")}
                </span>
              </div>
            </div>
            <WeeklyBars weeks={weeks} xDomain={xDomain} markerDay={markerDay} onPick={onPick} />
            {firesCane < MIN_FIRES_FOR_R ? (
              <p className="season-note" data-testid="pearson">
                {t(lang, "fewFires", { n: int(lang, firesCane) })}
              </p>
            ) : (
              <p className="season-note" data-testid="pearson">
                {t(lang, "pearson", { n: weeks.length })} <strong>{Number.isNaN(r) ? "n/a" : r.toFixed(2)}</strong>
              </p>
            )}
          </div>
          {cum && (
            <div className="season-col">
              <div className="season-col-head">
              <TitleTip tip={t(lang, "tipRadarVsMill")}>{t(lang, "radarVsMill")}</TitleTip>
              <div className="chart-legend">
                {CUM_SERIES.map((s) => (
                  <span key={s.key}>
                    <SeriesSwatch color={s.color} marker={s.marker} dash={s.dash} /> {t(lang, s.label)}
                  </span>
                ))}
                <span>
                  <svg width={26} height={10} aria-hidden="true">
                    <line x1={1} x2={25} y1={5} y2={5} stroke={REFERENCE_COLOR} strokeDasharray="2 3" />
                  </svg>{" "}
                  {t(lang, "levels")}
                </span>
                <span>
                  <MarkerSwatch /> {t(lang, "sliderWeek")}
                </span>
              </div>
              </div>
              <CumulativeChart cum={cum} xDomain={xDomain} markerDay={markerDay} onPick={onPick} />
              <p className="season-note muted">
                {t(lang, "shareNote", { o: ha(lang, cum.official_total_ha), d: ha(lang, cum.detected_total_ha) })}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
