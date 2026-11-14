import type { ExpressionSpecification } from "maplibre-gl";

// Pure date, week and colour helpers for the harvest map. Days are integers counted from
// 1970-01-01 (UTC), the same unit as the tiles' `harvest_day` property.

const DAY_MS = 86_400_000;

// Harvested segments: plasma (perceptually uniform, colour-blind safe), early = dark blue,
// late = yellow. It has no green or grey, so it cannot be confused with the two below.
export const RAMP = ["#0d0887", "#7e03a8", "#cc4778", "#f89540", "#f0f921"];
export const STANDING_COLOR = "#2b8a3e";
export const UNDATED_COLOR = "#9a9a9a";
export const DATED_OPACITY = 0.8;
export const UNDATED_OPACITY = 0.35;

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

export type WeekCount = { week_start: string; harvests: number };

/** Detected harvests summed over the Monday weeks that start on or before `day`. */
export function cumulativeHarvests(weeks: WeekCount[], day: number): number {
  return weeks.reduce((n, w) => (toDay(w.week_start) <= day ? n + w.harvests : n), 0);
}

/** Ramp stops spread evenly over the season [minDay, maxDay]. */
export function rampStops(minDay: number, maxDay: number): (number | string)[] {
  const span = Math.max(maxDay - minDay, 1); // interpolate needs strictly ascending stops
  return RAMP.flatMap((c, i) => [minDay + (i * span) / (RAMP.length - 1), c]);
}

/** Fill colour at slider day `day`: undated grey, harvested by date, else standing green.
 * Null properties are absent from vector tiles, hence `has`. */
export function harvestColorExpression(minDay: number, maxDay: number, day: number): ExpressionSpecification {
  return [
    "case",
    ["!", ["has", "harvest_day"]],
    UNDATED_COLOR,
    ["<=", ["get", "harvest_day"], day],
    ["interpolate", ["linear"], ["get", "harvest_day"], ...rampStops(minDay, maxDay)],
    STANDING_COLOR,
  ] as ExpressionSpecification;
}

export const RAMP_CSS = `linear-gradient(to right, ${RAMP.join(", ")})`;
