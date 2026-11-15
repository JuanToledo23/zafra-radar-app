# Design system

One page of rules for the web app (`web/src/styles.css` holds the tokens as CSS variables).
The goal: a formal, quiet interface that someone with no remote-sensing background can read at
a glance, on a laptop, online and on a projector at 1280×720.

## Tokens

**Colour (interface only).** Neutral light background, white surfaces, one accent. The data
colours (harvest ramp, standing / undated cane, orbit and chart series, ops map colours, alert
and selection outlines) live in `colors.ts`, `season.ts`, `ops.ts` and `alerts.ts` and are not
interface tokens: they are never restyled.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#f5f6f8` | app background |
| `--surface` / `--surface-2` | `#ffffff` / `#f1f3f6` | panels, cards / subtle fills, table headers |
| `--border` / `--border-strong` | `#e1e5ea` / `#848f9e` | dividers / control outlines (3.3:1) |
| `--text` / `--text-2` / `--text-3` | `#111827` / `#374151` / `#5b6675` | primary / secondary / muted (≥ 5.4:1 on white) |
| `--accent` / `--accent-strong` / `--accent-soft` | `#1d4ed8` / `#1e3a8a` / `#eaf0fd` | primary actions, selected state, focus |
| `--warn-*`, `--danger-*`, `--ok` | amber, red, green | notes and caveats, errors, status dots |

The accent is blue, not green, so it is never mistaken for "standing cane" on the map.

**Type.** System font stack, no web fonts. Scale: 12 (captions, chart ticks), 13 (helper
text), **14 (body, the minimum for running text)**, 16 (section titles), 20 (key numbers),
28 (hero number, harvest date). Weights 400 / 500 / 600. Every number uses
`font-variant-numeric: tabular-nums`.

**Spacing.** 4-point scale: 4, 8, 12, 16, 24, 32. **Radius:** 6 (controls), 10 (cards and
panels), 999 (pills). **Elevation:** `--shadow-1` (cards), `--shadow-2` (panels floating over
the map), `--shadow-3` (tooltips, the guide).

## Layout

* **Top bar** (56 px, white): product name, site select, the Explorer / Mill operations
  segmented control, then on the right Find field (Explorer), language (Mill operations),
  connection status and the "Start here" button.
* **Explorer:** map in the middle; **Map layers** panel floating top-left (harvest legend,
  radar imagery, reference fields, alerts), collapsible; **detail panel** on the right (400 px);
  the **timeline bar** docked under the map (play, current date, slider, harvest count, season
  progress button); the **season panel** is a bottom drawer under the timeline (40 %, or about
  75 % of the window expanded).
* **Mill operations:** toolbar (site, replay date stepper, exports, weekly report), a key
  numbers row, then list and map side by side.
* At 1280×720 nothing essential on the Explorer is below the fold. Under 700 px wide the
  panels stack (map, timeline, then detail).

## Components

* **Buttons:** primary (accent fill, one per area), secondary (white, outlined), ghost (text).
  Height 32 (28 small); icon + label; never colour alone for state.
* **Segmented control:** one rounded track, selected item white with shadow; used for view,
  language, radar mode, list window.
* **Switch rows** for on/off layers (`aria-pressed`), **chips** for filters, **pills** for
  status and severity.
* **Cards:** white, 1 px border, radius 10, label (13, muted) over value (20, tabular).
* **Tables:** 13–14 px, tabular numbers right-aligned, sticky header on a subtle fill, row
  hover, selected row with an accent bar.
* **Tooltips:** a "?" button next to a title; one plain sentence on hover, focus or tap;
  Escape closes. The technical term stays in parentheses: "Radar signal (HV backscatter)".
* **Legends:** a swatch or line sample beside each label, inside the layer they describe.
* **States:** loading skeletons (shimmer off with reduced motion) with a screen-reader text;
  empty states with an icon and one sentence; errors in a red note with the message.
* **Notes and caveats** keep their wording; they sit in an amber note, never hidden.

## Accessibility

* Text meets WCAG AA contrast (4.5:1; muted text is 5.2:1 or more); control outlines and the
  switch track reach 3:1.
* Visible focus ring on every control: 2 px accent outline, 2 px offset (`:focus-visible`).
* Keyboard: the timeline slider is a native range (arrows, Home / End) with the date as
  `aria-valuetext`; Play is a button; list rows take Enter; the guide and tooltips close with
  Escape.
* Every icon-only button has an `aria-label`; groups have `role="group"` and a label.
* `prefers-reduced-motion`: no transitions or shimmer, map moves without animation.
* Motion is short (150 ms) and only on opacity, colour and small transforms.
* No NASA or agency logos or insignia anywhere; the favicon is a neutral radar mark.
