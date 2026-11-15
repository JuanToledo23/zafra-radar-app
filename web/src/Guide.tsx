import { useEffect, useRef } from "react";
import { t, useLang } from "./i18n";
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

type Props = { onClose: () => void; onPlay: () => void; onOpenOps: () => void; onTour: () => void };

export default function Guide({ onClose, onPlay, onOpenOps, onTour }: Props) {
  const lang = useLang();
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
        <h2 id="guide-title">{t(lang, "startHere")}</h2>
        <button type="button" className="icon-btn" aria-label={t(lang, "closeGuide")} onClick={close}>
          <Icon name="close" />
        </button>
      </div>
      <p className="guide-intro">{t(lang, "guideIntro")}</p>
      <ol className="guide-steps">
        <li>
          <span className="guide-num">1</span>
          <div>
            <strong>{t(lang, "guide1Title")}</strong> {t(lang, "guide1")}
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
              <Icon name="play" /> {t(lang, "play")}
            </button>
          </div>
        </li>
        <li>
          <span className="guide-num">2</span>
          <div>
            <strong>{t(lang, "guide2Title")}</strong> {t(lang, "guide2")}
          </div>
        </li>
        <li>
          <span className="guide-num">3</span>
          <div>
            <strong>{t(lang, "guide3Title")}</strong> {t(lang, "guide3")}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              data-testid="guide-ops"
              onClick={() => {
                close();
                onOpenOps();
              }}
            >
              {t(lang, "openOps")}
            </button>
          </div>
        </li>
      </ol>
      <div className="guide-foot">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          data-testid="guide-tour"
          onClick={() => {
            close();
            onTour();
          }}
        >
          {t(lang, "takeTour")}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" data-testid="guide-dismiss" onClick={close}>
          {t(lang, "guideDismiss")}
        </button>
      </div>
    </section>
  );
}
