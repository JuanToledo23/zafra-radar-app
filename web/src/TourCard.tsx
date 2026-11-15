import { track } from "./analytics";
import { t, useLang } from "./i18n";
import { Icon } from "./icons";
import { LINKS, type Scene } from "./tour";

// The tour's card. Public tour: the scene's title and caption, Back / Next, one dot per scene
// and a close button. Presenter mode: only a discreet step indicator (the speaker carries the
// captions), except the closing scene's links. `scenes`: the tour's scenes (presenter mode may
// leave some out).

type Props = {
  scenes: Scene[];
  step: number;
  presenter: boolean;
  onGo: (i: number) => void;
  onClose: () => void;
};

export default function TourCard({ scenes, step, presenter, onGo, onClose }: Props) {
  const lang = useLang();
  const scene = scenes[step];
  const last = step === scenes.length - 1;
  const links = scene.closing && (
    <ul className="tour-links" data-testid="tour-links">
      <li>
        <a href={LINKS.findings} target="_blank" rel="noreferrer">{t(lang, "tourFindings")}</a>
      </li>
      <li>
        <a href={LINKS.app} target="_blank" rel="noreferrer">{t(lang, "tourAppRepo")}</a>
      </li>
      <li>
        <a href={LINKS.library} target="_blank" rel="noreferrer">{t(lang, "tourLibraryRepo")}</a>
      </li>
    </ul>
  );

  if (presenter)
    return (
      <>
        {scene.closing && (
          <section className="tour-card" aria-label={scene.title[lang]} data-testid="tour-card">
            <h2 className="tour-title">{scene.title[lang]}</h2>
            {links}
          </section>
        )}
        <div className="tour-step" data-testid="tour-step" aria-live="polite">
          {t(lang, "tourStepShort", { n: step + 1, of: scenes.length })}
        </div>
      </>
    );

  return (
    <section className={`tour-card${scene.card ? ` tour-at-${scene.card}` : ""}`} role="dialog" aria-labelledby="tour-title" data-testid="tour-card" data-scene={scene.id}>
      <div className="tour-head">
        <span className="tour-count">{t(lang, "tourStep", { n: step + 1, of: scenes.length })}</span>
        <button type="button" className="icon-btn" aria-label={t(lang, "tourLeave")} data-testid="tour-close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <h2 id="tour-title" className="tour-title">{scene.title[lang]}</h2>
      <p className="tour-caption" data-testid="tour-caption">{scene.caption[lang]}</p>
      {links}
      {scene.closing && <p className="tour-privacy" data-testid="tour-privacy">{t(lang, "tourPrivacy")}</p>}
      <div className="tour-foot">
        <div className="tour-dots" role="group" aria-label={t(lang, "tourScenes")}>
          {scenes.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`tour-dot${i === step ? " on" : ""}`}
              aria-label={s.title[lang]}
              aria-current={i === step ? "step" : undefined}
              onClick={() => onGo(i)}
            />
          ))}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" data-testid="tour-back" disabled={step === 0} onClick={() => onGo(step - 1)}>
          {t(lang, "tourBack")}
        </button>
        <button type="button" className="btn btn-primary btn-sm" data-testid="tour-next" onClick={() => {
            if (!last) return onGo(step + 1);
            track("tour-finished");
            onClose();
          }}>
          {t(lang, last ? "tourFinish" : "tourNext")}
        </button>
      </div>
    </section>
  );
}
