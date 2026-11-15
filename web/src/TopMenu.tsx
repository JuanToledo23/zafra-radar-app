import { useEffect, useId, useRef, type ReactNode } from "react";
import { t, useLang } from "./i18n";
import { Icon } from "./icons";

// Phones and tablets: the top bar's controls that do not fit (Find field, the language, the
// tour) behind one menu button. Closes on Escape, on a tap outside it, or when its owner says
// so (a field found, the tour started).

type Props = { open: boolean; onOpen: (open: boolean) => void; children: ReactNode };

export default function TopMenu({ open, onOpen, children }: Props) {
  const lang = useLang();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpen(false);
    const onDown = (e: Event) => e.target instanceof Node && !root.current?.contains(e.target) && onOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, onOpen]);
  return (
    <div className="top-menu" ref={root}>
      <button
        type="button"
        className="icon-btn top-menu-btn"
        aria-label={t(lang, "menu")}
        aria-expanded={open}
        aria-controls={id}
        data-testid="menu"
        onClick={() => onOpen(!open)}
      >
        <Icon name={open ? "close" : "menu"} size={22} />
      </button>
      <div id={id} className="top-menu-panel" hidden={!open} data-testid="menu-panel">
        {children}
      </div>
    </div>
  );
}
