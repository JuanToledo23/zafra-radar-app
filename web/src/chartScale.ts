import { formatMonth, type Lang } from "./i18n";
import { fromDay } from "./season";

// Pure scale and tick helpers for the hand-written SVG charts. Days are integers counted
// from 1970-01-01 (UTC), as in season.ts.

/** Linear map from `domain` to `range`; a zero-width domain maps to the middle of the range. */
export function linearScale([d0, d1]: [number, number], [r0, r1]: [number, number]) {
  if (d1 === d0) return () => (r0 + r1) / 2;
  const k = (r1 - r0) / (d1 - d0);
  return (v: number) => r0 + (v - d0) * k;
}

/** A 1, 2 or 5 × 10^n step that splits `span` into about `count` intervals. */
export function niceStep(span: number, count: number): number {
  const raw = span / Math.max(count, 1);
  if (!(raw > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
}

/** Ticks at a nice step from the one at or below `min` to the one at or above `max`, so the
 * first and last tick can serve as the axis domain. Rounded to the step's decimals. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const step = niceStep(max - min, count);
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const ticks: number[] = [];
  let v = Math.floor(min / step) * step;
  for (;;) {
    ticks.push(Number(v.toFixed(decimals)));
    if (v >= max - step * 1e-9) return ticks;
    v += step;
  }
}

/** Days of the first of each month inside [minDay, maxDay]. */
export function monthTicks(minDay: number, maxDay: number): number[] {
  const start = new Date(fromDay(minDay));
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  const ticks: number[] = [];
  for (;;) {
    const day = Date.UTC(y, m, 1) / 86_400_000;
    if (day > maxDay) return ticks;
    if (day >= minDay) ticks.push(day);
    if (++m === 12) {
      m = 0;
      y++;
    }
  }
}

/** Month tick label: the month abbreviation, and the year under the first tick and January. */
export function monthLabel(lang: Lang, day: number, first: boolean): [string, string | null] {
  const d = new Date(fromDay(day));
  const m = d.getUTCMonth();
  return [formatMonth(lang, fromDay(day)), first || m === 0 ? String(d.getUTCFullYear()) : null];
}

/** Index of the point nearest (x, y) by squared distance, or -1 for an empty list. */
export function nearestIndex(points: { x: number; y: number }[], x: number, y: number): number {
  let best = -1;
  let bestD = Infinity;
  points.forEach((p, i) => {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Pearson correlation of two equally long series; NaN when either is constant or n < 2. */
export function pearson(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2 || b.length !== n) return NaN;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : NaN;
}
