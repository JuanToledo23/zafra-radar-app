import type { ExpressionSpecification } from "maplibre-gl";

// Pure date, week and colour helpers for the harvest map. Days are integers counted from
// 1970-01-01 (UTC), the same unit as the tiles' `harvest_day` property.

const DAY_MS = 86_400_000;

// The harvest map has two states: standing cane dark green, harvested amber. They differ in
// lightness (CIELAB L* 41 against 77) as well as hue, so they stay apart with protanopia,
// deuteranopia and tritanopia (simulated CIEDE2000 difference 29 or more as drawn over the
// dark basemap; see docs/DESIGN.md). Fields with no harvest date are subdued: a faint light
// grey fill and a thin light outline, so they read as context rather than as gaps.
export const STANDING_COLOR = "#1b6e35";
export const HARVESTED_COLOR = "#ffb000";
export const UNDATED_COLOR = "#c9ced6";
export const UNDATED_OUTLINE = "#c9ced6";
export const DATED_OPACITY = 0.9;
export const UNDATED_OPACITY = 0.18;
// Fields harvested in the latest week while the timeline advances: a pale warm highlight
// (L* 96, 21 or more above the amber in every simulation) that fades into the harvested colour.
export const HIGHLIGHT_COLOR = "#fff4cc";
// "Colour by harvest date" (More options): plasma (perceptually uniform, colour-blind safe),
// early = dark blue, late = yellow, in place of the single harvested colour.
export const RAMP = ["#0d0887", "#7e03a8", "#cc4778", "#f89540", "#f0f921"];
// Reference-field outlines: white dashes on a dark casing, unlike any fill colour above and
// visible on both the satellite and the plain basemap.
export const REFERENCE_COLOR = "#ffffff";
export const REFERENCE_CASING = "#1d1d1d";

/** Days since 1970-01-01 of an ISO date (`YYYY-MM-DD`). */
export function toDay(iso: string): number {
  return Math.round(Date.parse(iso.slice(0, 10)) / DAY_MS);
}

/** ISO date (`YYYY-MM-DD`) of a day number. */
export function fromDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Monday on or before `day` (1970-01-01 was a Thursday). */
export function mondayOf(day: number): number {
  return day - ((day + 3) % 7);
}

/** Sunday on or after `day`: the last day of its Monday week. */
export function sundayOf(day: number): number {
  return mondayOf(day) + 6;
}

/** Slider positions: the Sundays from the one on or after `minDay` to the one on or after
 * `maxDay`. Each is the end of a Monday week, so the weekly counts (Monday weeks) summed up
 * to it equal the segments painted as harvested at it. */
export function weekSteps(minDay: number, maxDay: number): number[] {
  const steps: number[] = [];
  for (let d = sundayOf(minDay); d <= sundayOf(maxDay); d += 7) steps.push(d);
  return steps;
}

/** Index of the slider step containing `day`: the first Sunday on or after it, clamped to
 * the steps (0 for an empty list). */
export function stepIndex(steps: number[], day: number): number {
  const i = steps.findIndex((s) => s >= day);
  return i < 0 ? Math.max(steps.length - 1, 0) : i;
}

export type WeekCount = { week_start: string; harvests: number };

/** Detected harvests summed over the Monday weeks that start on or before `day`. */
export function cumulativeHarvests(weeks: WeekCount[], day: number): number {
  return weeks.reduce((n, w) => (toDay(w.week_start) <= day ? n + w.harvests : n), 0);
}

/** Detected harvests in the Monday week that ends on Sunday `day`. */
export function weekHarvests(weeks: WeekCount[], day: number): number {
  return weeks.find((w) => toDay(w.week_start) === day - 6)?.harvests ?? 0;
}

/** Ramp stops spread evenly over the season [minDay, maxDay]. */
export function rampStops(minDay: number, maxDay: number): (number | string)[] {
  const span = Math.max(maxDay - minDay, 1); // interpolate needs strictly ascending stops
  return RAMP.flatMap((c, i) => [minDay + (i * span) / (RAMP.length - 1), c]);
}

/** Fill colour at slider day `day`: undated grey, harvested amber (or, `byDate`, the ramp
 * colour of its harvest date), else standing green. Null properties are absent from vector
 * tiles, hence `has`. */
export function harvestColorExpression(minDay: number, maxDay: number, day: number, byDate = false): ExpressionSpecification {
  return [
    "case",
    ["!", ["has", "harvest_day"]],
    UNDATED_COLOR,
    ["<=", ["get", "harvest_day"], day],
    byDate ? ["interpolate", ["linear"], ["get", "harvest_day"], ...rampStops(minDay, maxDay)] : HARVESTED_COLOR,
    STANDING_COLOR,
  ] as ExpressionSpecification;
}

export const RAMP_CSS = `linear-gradient(to right, ${RAMP.join(", ")})`;
