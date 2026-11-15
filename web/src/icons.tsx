// The app's few interface icons: 24 × 24 strokes drawn in currentColor, decorative
// (aria-hidden); the button or text beside them carries the label.

const PATHS = {
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  expand: <path d="M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7" />,
  collapse: <path d="M10 20v-6H4M14 4v6h6M4 20l6-6M20 4l-6 6" />,
  target: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </>
  ),
  download: <path d="M12 4v11m-5-5 5 5 5-5M5 20h14" />,
  report: (
    <>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5M10 13h6M10 17h6" />
    </>
  ),
  chart: <path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-8" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2.5 20h19z" />
      <path d="M12 10v4.5M12 17.5v.5" />
    </>
  ),
  cursor: <path d="m5 3 14 7-6 2-2 6z" />,
  arrowLeft: <path d="M19 12H5m6-6-6 6 6 6" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.5" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

// The product mark (docs/DESIGN.md, Logo): a sugarcane stalk (three segments, the nodes
// between them, one leaf) and two radar arcs, white on the accent tile. Two drawings: the full
// one from 28 px, and one fitted to the 16-pixel grid for smaller sizes. web/public/favicon.svg
// is the small one, apple-touch-icon.png the full one.
const BRAND_TILE = "#1d4ed8";

export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  const cls = `brand-mark${className ? ` ${className}` : ""}`;
  if (size < 28)
    return (
      <svg className={cls} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <rect width="16" height="16" rx="3.5" fill={BRAND_TILE} />
        <g fill="#fff">
          <rect x="4" y="2" width="3" height="3" rx=".5" />
          <rect x="4" y="6" width="3" height="4" rx=".5" />
          <rect x="4" y="11" width="3" height="3" rx=".5" />
          <path d="M4 7.2C2.2 6.6 1.4 5 1.3 2.8C2.7 3.7 3.6 4.7 4 5.6Z" />
        </g>
        <path d="M9.25 5.32A3.5 3.5 0 0 1 9.25 10.68M11.52 3.32A6.5 6.5 0 0 1 11.52 12.68" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg className={cls} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" fill={BRAND_TILE} />
      <g fill="#fff">
        <rect x="16" y="8" width="9" height="13" rx="2" />
        <rect x="16" y="24" width="9" height="16" rx="2" />
        <rect x="16" y="43" width="9" height="13" rx="2" />
        <path d="M16 28.5C9 27.3 5.2 21.8 4.6 12.6C10.4 16 14.4 19.8 16 23.4Z" />
      </g>
      <path d="M33.36 22.04A13 13 0 0 1 33.36 41.96M40.98 15.46A23 23 0 0 1 40.98 48.54" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
