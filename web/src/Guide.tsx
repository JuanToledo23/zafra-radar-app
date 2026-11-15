import { useEffect, useRef } from "react";
import { Icon } from "./icons";

// "Start here": three steps over the map on the first visit, dismissed for good once closed
// (localStorage, which may be unavailable: then it shows again on the next visit).

const KEY = "zafra.guide.dismissed";

export function guideDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function remember() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // storage blocked: nothing to remember
  }
}

type Props = { onClose: () => void; onPlay: () => void; onOpenOps: () => void };

export default function Guide({ onClose, onPlay, onOpenOps }: Props) {
  const first = useRef<HTMLButtonElement>(null);
  const close = () => {
    remember();
    onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section className="guide" role="dialog" aria-labelledby="guide-title" data-testid="guide">
      <div className="guide-head">
        <h2 id="guide-title">Start here</h2>
        <button type="button" className="icon-btn" aria-label="Close the guide" onClick={close}>
          <Icon name="close" />
        </button>
      </div>
      <p className="guide-intro">Zafra Radar maps the sugarcane harvest from satellite radar. Three steps to see it:</p>
      <ol className="guide-steps">
        <li>
          <span className="guide-num">1</span>
          <div>
            <strong>Play the season.</strong> Watch the fields change colour week by week as the radar detects each
            harvest.
            <button
              ref={first}
              type="button"
              className="btn btn-primary btn-sm"
              data-testid="guide-play"
              onClick={() => {
                onPlay();
                close();
              }}
            >
              <Icon name="play" /> Play
            </button>
          </div>
        </li>
        <li>
          <span className="guide-num">2</span>
          <div>
            <strong>Click a field.</strong> The panel on the right shows its harvest date and the radar signal behind it.
          </div>
        </li>
        <li>
          <span className="guide-num">3</span>
          <div>
            <strong>Open Mill operations.</strong> The same data as a mill's field department would use it: this week's
            harvested fields, lists to export and a weekly report.
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              data-testid="guide-ops"
              onClick={() => {
                close();
                onOpenOps();
              }}
            >
              Open Mill operations
            </button>
          </div>
        </li>
      </ol>
      <div className="guide-foot">
        <button type="button" className="btn btn-ghost btn-sm" data-testid="guide-dismiss" onClick={close}>
          Got it, don't show again
        </button>
      </div>
    </section>
  );
}
