import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { t, useLang } from "./i18n";
import { Icon, type IconName } from "./icons";

// Small shared interface pieces (docs/DESIGN.md): the "?" tooltip, segmented control,
// disclosure, loading skeleton and empty state, and the smoothly changing number.

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Phones and tablets (docs/DESIGN.md, Phones and tablets); styles.css repeats these queries.
// COMPACT: the top bar's menu, touch-sized controls, the tour card under the page. SHEET
// (narrow, not short): the detail panel as a bottom sheet. Short screens (a phone in
// landscape) keep a narrow side panel.
export const COMPACT = "(max-width: 899px), (max-height: 520px)";
export const SHEET = "(max-width: 899px) and (min-height: 521px)";

/** Whether a media query matches, following changes (rotation, resizing). */
export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setOn(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return on;
}

/** `value`, eased towards each new value over `ms` (cubic ease-out) so a figure counts up or
 * down instead of jumping; a change mid-way continues from the figure shown. At once with
 * reduced motion, or from or to null. */
export function useTweened(value: number | null, ms = 350): number | null {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const from = current.current;
    if (value === null || from === null || from === value || reducedMotion()) {
      current.current = value;
      setShown(value);
      return;
    }
    let raf = 0;
    let start = 0;
    const step = (now: number) => {
      start ||= now;
      const p = Math.min((now - start) / ms, 1);
      current.current = from + (value - from) * (1 - (1 - p) ** 3);
      setShown(current.current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

const TIP_W = 280;
const TIP_GAP = 8;

/** "?" button with one plain sentence, shown on hover (a mouse), focus or tap; a second tap,
 * a tap elsewhere or Escape closes. The text is placed with fixed coordinates, so a
 * scrolling panel does not clip it. */
export function InfoTip({ text, label }: { text: string; label?: string }) {
  const lang = useLang();
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const tapped = useRef(false); // the focus that follows a tap is not a second "show"
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);

  const show = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.min(Math.max(r.left + r.width / 2 - TIP_W / 2, TIP_GAP), window.innerWidth - TIP_W - TIP_GAP);
    const above = r.bottom + 120 > window.innerHeight;
    setPos({ left, top: above ? r.top - TIP_GAP : r.bottom + TIP_GAP, above });
  };
  const hide = () => setPos(null);

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    const onDown = (e: Event) => e.target instanceof Node && !btn.current?.contains(e.target) && hide();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [pos]);

  return (
    <span
      className="tip"
      onPointerEnter={(e) => e.pointerType === "mouse" && show()}
      onPointerLeave={(e) => e.pointerType === "mouse" && hide()}
    >
      <button
        ref={btn}
        type="button"
        className="tip-btn"
        aria-label={label ?? t(lang, "whatIsThis")}
        aria-describedby={pos ? id : undefined}
        onPointerDown={(e) => (tapped.current = e.pointerType !== "mouse")}
        onFocus={() => {
          if (!tapped.current) show();
        }}
        onBlur={() => {
          tapped.current = false;
          hide();
        }}
        onClick={(e) => {
          tapped.current = false;
          e.stopPropagation();
          if (pos) hide();
          else show();
        }}
      >
        ?
      </button>
      {pos && (
        <span
          role="tooltip"
          id={id}
          className={`tip-text${pos.above ? " above" : ""}`}
          style={{ left: pos.left, top: pos.top, width: TIP_W }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

/** A title with an optional "?" tooltip beside it. */
export function TitleTip({ as: Tag = "h3", children, tip }: { as?: "h2" | "h3"; children: ReactNode; tip?: string }) {
  return (
    <Tag className="title-tip">
      <span>{children}</span>
      {tip && <InfoTip text={tip} />}
    </Tag>
  );
}

export type SegOption<V extends string> = { value: V; label: ReactNode; disabled?: boolean; testId?: string; title?: string };

/** One rounded track of mutually exclusive buttons (aria-pressed on each). */
export function Segmented<V extends string>({
  options, value, onChange, label, size, className,
}: {
  options: SegOption<V>[];
  value: V;
  onChange: (v: V) => void;
  label: string;
  size?: "sm";
  className?: string;
}) {
  return (
    <span className={`seg${size ? ` seg-${size}` : ""}${className ? ` ${className}` : ""}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={value === o.value ? "on" : ""}
          aria-pressed={value === o.value}
          disabled={o.disabled}
          title={o.title}
          data-testid={o.testId}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

/** "More options" / "More detail": a button that shows or hides what follows, closed by
 * default. The content is not rendered while closed. */
export function Disclosure({ label, testId, className, children }: { label: string; testId?: string; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={`disclosure${open ? " open" : ""}${className ? ` ${className}` : ""}`}>
      <button type="button" className="disclosure-btn" aria-expanded={open} aria-controls={id} data-testid={testId} onClick={() => setOpen(!open)}>
        <Icon name="chevronDown" className="chev" />
        <span>{label}</span>
      </button>
      {open && (
        <div id={id} className="disclosure-body">
          {children}
        </div>
      )}
    </div>
  );
}

/** Grey placeholder lines while data loads, with the loading text for screen readers. */
export function Skeleton({ lines = 3, label, className }: { lines?: number; label?: string; className?: string }) {
  const lang = useLang();
  return (
    <div className={`skeleton${className ? ` ${className}` : ""}`} role="status">
      <span className="sr-only">{label ?? t(lang, "loading")}</span>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="skeleton-line" style={{ width: `${[92, 78, 64, 85, 70][i % 5]}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ icon = "info", title, children, testId }: { icon?: IconName; title?: string; children?: ReactNode; testId?: string }) {
  return (
    <div className="empty" data-testid={testId}>
      <span className="empty-icon">
        <Icon name={icon} size={20} />
      </span>
      <div>
        {title && <div className="empty-title">{title}</div>}
        {children && <div className="empty-text">{children}</div>}
      </div>
    </div>
  );
}
