import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { t, useLang } from "./i18n";
import { Icon, type IconName } from "./icons";

// Small shared interface pieces (docs/DESIGN.md): the "?" tooltip, segmented control,
// disclosure, loading skeleton and empty state.

const TIP_W = 280;
const TIP_GAP = 8;

/** "?" button with one plain sentence, shown on hover, focus or tap; Escape closes. The
 * text is placed with fixed coordinates, so a scrolling panel does not clip it. */
export function InfoTip({ text, label }: { text: string; label?: string }) {
  const lang = useLang();
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
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
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
    };
  }, [pos]);

  return (
    <span className="tip" onMouseEnter={show} onMouseLeave={hide}>
      <button
        ref={btn}
        type="button"
        className="tip-btn"
        aria-label={label ?? t(lang, "whatIsThis")}
        aria-describedby={pos ? id : undefined}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
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
