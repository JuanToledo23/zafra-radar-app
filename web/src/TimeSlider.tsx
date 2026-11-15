import type { CSSProperties } from "react";
import { formatDate, formatNumber, t, useLang } from "./i18n";
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
  hectares: number | null;
  seasonOpen: boolean;
  onToggleSeason: () => void;
};

// Weekly slider (Sundays) over the site's harvest dates; the map repaints from the selected day.
// Docked under the map as the timeline bar, with the season progress drawer's button. Each
// step is shown as the Monday–Sunday week it closes ("Week of" its Monday).
export default function TimeSlider({ steps, index, onIndex, playing, onTogglePlay, harvests, hectares, seasonOpen, onToggleSeason }: Props) {
  const lang = useLang();
  const day = steps[index];
  const date = (d: number) => formatDate(lang, fromDay(d));
  const fill = steps.length > 1 ? (100 * index) / (steps.length - 1) : 0;
  return (
    <div className="timeline" data-testid="slider">
      <button
        type="button"
        className="play"
        onClick={onTogglePlay}
        data-testid="play"
        aria-label={t(lang, playing ? "pauseSeason" : "playSeason")}
        title={t(lang, playing ? "pause" : "playTitle")}
      >
        <Icon name={playing ? "pause" : "play"} size={20} />
      </button>
      <label
        htmlFor="week"
        className="timeline-date"
        data-testid="slider-date"
        data-day={fromDay(day)}
        title={t(lang, "weekRange", { from: date(day - 6), to: date(day) })}
      >
        <span className="timeline-label">{t(lang, "weekOf")}</span> <strong>{date(day - 6)}</strong>
      </label>
      <div className="timeline-track">
        <input
          id="week"
          type="range"
          min={0}
          max={steps.length - 1}
          step={1}
          value={index}
          aria-valuetext={t(lang, "weekEnding", { date: date(day) })}
          style={{ "--fill": `${fill}%` } as CSSProperties}
          onChange={(e) => onIndex(Number(e.target.value))}
        />
        <div className="timeline-ends" aria-hidden="true">
          <span>{date(steps[0] - 6)}</span>
          <span>{date(steps[steps.length - 1])}</span>
        </div>
      </div>
      <div className="timeline-count">
        <span data-testid="harvest-count">
          {harvests === null ? (
            <span className="timeline-label">…</span>
          ) : (
            <>
              <strong>{formatNumber(lang, harvests)}</strong>
              <span className="timeline-label"> {t(lang, harvests === 1 ? "harvestedSoFarOne" : "harvestedSoFarMany")}</span>
              {hectares !== null && (
                <span className="timeline-ha" data-testid="harvest-ha">
                  {" · "}
                  <strong>{formatNumber(lang, hectares)}</strong> ha
                </span>
              )}
            </>
          )}
        </span>
        <InfoTip text={t(lang, "tipHarvestCount")} />
      </div>
      <button
        type="button"
        className={`btn btn-secondary season-btn${seasonOpen ? " on" : ""}`}
        aria-pressed={seasonOpen}
        data-testid="season-toggle"
        onClick={onToggleSeason}
      >
        <Icon name="chart" /> {t(lang, "seasonProgress")}
      </button>
    </div>
  );
}
