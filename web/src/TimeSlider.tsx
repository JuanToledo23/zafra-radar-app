import type { CSSProperties } from "react";
import { Icon } from "./icons";
import { fromDay } from "./season";
import { InfoTip } from "./ui";

type Props = {
  steps: number[];
  index: number;
  onIndex: (i: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
  harvests: number | null;
  seasonOpen: boolean;
  onToggleSeason: () => void;
};

// Weekly slider (Sundays) over the site's harvest dates; the map repaints from the selected day.
// Docked under the map as the timeline bar, with the season progress drawer's button.
export default function TimeSlider({ steps, index, onIndex, playing, onTogglePlay, harvests, seasonOpen, onToggleSeason }: Props) {
  const day = steps[index];
  const fill = steps.length > 1 ? (100 * index) / (steps.length - 1) : 0;
  return (
    <div className="timeline" data-testid="slider">
      <button
        type="button"
        className="play"
        onClick={onTogglePlay}
        data-testid="play"
        aria-label={playing ? "Pause the season" : "Play the season"}
        title={playing ? "Pause" : "Play the season week by week"}
      >
        <Icon name={playing ? "pause" : "play"} size={20} />
      </button>
      <label htmlFor="week" className="timeline-date" data-testid="slider-date">
        <span className="timeline-label">Harvested by</span> <strong>{fromDay(day)}</strong>
      </label>
      <div className="timeline-track">
        <input
          id="week"
          type="range"
          min={0}
          max={steps.length - 1}
          step={1}
          value={index}
          aria-valuetext={`Week ending ${fromDay(day)}`}
          style={{ "--fill": `${fill}%` } as CSSProperties}
          onChange={(e) => onIndex(Number(e.target.value))}
        />
        <div className="timeline-ends" aria-hidden="true">
          <span>{fromDay(steps[0])}</span>
          <span>{fromDay(steps[steps.length - 1])}</span>
        </div>
      </div>
      <div className="timeline-count">
        <span data-testid="harvest-count">
          {harvests === null ? (
            <span className="timeline-label">…</span>
          ) : (
            <>
              <strong>{harvests.toLocaleString("en-US")}</strong>
              <span className="timeline-label"> harvests detected by this date</span>
            </>
          )}
        </span>
        <InfoTip text="Number of field segments with a radar harvest date on or before the timeline date." />
      </div>
      <button
        type="button"
        className={`btn btn-secondary season-btn${seasonOpen ? " on" : ""}`}
        aria-pressed={seasonOpen}
        data-testid="season-toggle"
        onClick={onToggleSeason}
      >
        <Icon name="chart" /> Season progress
      </button>
    </div>
  );
}
