import { fromDay } from "./season";

type Props = {
  steps: number[];
  index: number;
  onIndex: (i: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
  harvests: number | null;
};

// Weekly slider (Sundays) over the site's harvest dates; the map repaints from the selected day.
export default function TimeSlider({ steps, index, onIndex, playing, onTogglePlay, harvests }: Props) {
  const day = steps[index];
  return (
    <div className="slider" data-testid="slider">
      <div className="slider-row">
        <button type="button" className="play" onClick={onTogglePlay} data-testid="play">
          {playing ? "Pause" : "Play"}
        </button>
        <label htmlFor="week" data-testid="slider-date">
          Harvested by <strong>{fromDay(day)}</strong>
        </label>
        <span className="count" data-testid="harvest-count">
          {harvests === null
            ? "…"
            : `${harvests.toLocaleString("en-US")} harvests detected by this date`}
        </span>
      </div>
      <input
        id="week"
        type="range"
        min={0}
        max={steps.length - 1}
        step={1}
        value={index}
        onChange={(e) => onIndex(Number(e.target.value))}
      />
    </div>
  );
}
