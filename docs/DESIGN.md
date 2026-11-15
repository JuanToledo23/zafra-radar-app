# Design system

One page of rules for the web app (`web/src/styles.css` holds the tokens as CSS variables).
The goal: a formal, quiet interface that someone with no remote-sensing background can read at
a glance, on a laptop, online and on a projector at 1280×720.

**One idea per view, readable in three seconds.** Each screen shows one thing and a legend of
at most three plain entries. Everything else sits behind a "More options" (map) or "More
detail" (field) disclosure, closed by default. Advanced controls move there; they are never
removed.

## Tokens

**Colour (interface only).** Neutral light background, white surfaces, one accent. The data
colours (harvest map, harvest-date ramp, orbit and chart series, ops map colours, alert and
selection outlines) live in `colors.ts`, `season.ts`, `ops.ts` and `alerts.ts` and are not
interface tokens.

**Harvest map colours** (`season.ts`): two states, standing cane `#1b6e35` (dark green, CIELAB
L* 41) and harvested `#ffb000` (amber, L* 77), drawn at 0.9 opacity; fields with no harvest
date `#d6d6d6` (light neutral grey) at 0.75. Checked by simulating protanopia, deuteranopia and
tritanopia (Machado et al. 2009, full severity) on the colours as drawn over the dimmed basemap
and over the plain background: standing against harvested differs by CIEDE2000 ≥ 26 and
ΔL* ≥ 25 in every case, so the two states stay apart by lightness alone. The explorer's
satellite basemap is desaturated and flattened to mid greys (`BASEMAP_DIM`, `basemap.ts`) and
its plain background is a matching mid grey (`#8f9297`), so the map looks alike with and
without the satellite image. The plasma ramp (colour by harvest date) is a More options choice.

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
  segmented control, then on the right Find field (Explorer), the EN / ES language switch (the
  whole interface) and the "Start here" button. The basemap and API status labels stay in the
  page for the headless checks but are not shown.
* **Explorer:** map in the middle; the **map panel** floating top-left; **detail panel** on the
  right (400 px); the **timeline bar** docked under the map (play, "Week of" the Monday, slider,
  fields and hectares harvested so far, season progress button); the **season panel** is a
  bottom drawer under the timeline (40 %, or about 75 % of the window expanded).
* **Three map views**, one click each on the map panel's segmented control:
  1. **Harvest map** (default): standing green, harvested amber, no harvest date grey, over the
     dimmed basemap; play turns the fields amber week by week.
  2. **Radar image**: the NISAR HV image of the latest acquisition on or before the timeline
     date, following play; no outlines; legend "Bright: standing cane", "Dark: cut cane or bare
     soil" (from the library's legend text) and the image date.
  3. **Before / after**: the first against the last acquisition with the divider, labelled
     "Before harvest · date" and "After harvest · date"; no outlines, no other controls.
* **More options** (closed by default) holds everything else: colour by harvest date, the
  radar product, dates, follow time slider, change layer, opacity, outlines, the library's full
  legend and credit, reference fields and alerts.
* **Nothing selected:** the site's three key numbers (cane hectares, fields, fields with a
  harvest date) and one line inviting to press play or click a field.
* **Field detail:** one sentence in large type ("Harvested around 21 Dec 2025 (± 6 days)" or
  "No harvest date detected"), then one chart, the HV radar signal titled "The radar signal
  drops when the cane is cut", and the summary. Date confidence, probabilities, HV drop,
  coherence, HH, fires and alerts are under "More detail", with their notes.
* **Mill operations:** toolbar (site, replay date stepper, exports, weekly report), a key
  numbers row, then list and map side by side.
* At 1280×720 nothing essential on the Explorer is below the fold. Under 700 px wide the
  panels stack (map, timeline, then detail).

## Components

* **Buttons:** primary (accent fill, one per area), secondary (white, outlined), ghost (text).
  Height 32 (28 small); icon + label; never colour alone for state.
* **Segmented control:** one rounded track, selected item white with shadow; used for the
  screen, the map views, language and list window.
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
* **Notes and caveats** keep their wording; they sit in an amber note, and move with their
  section into a disclosure, never deleted.
* **Dates** read day first in the interface language (21 Dec 2025 / 21 dic 2025); API
  parameters and CSV files keep ISO dates.
* **Language:** every interface string is in `i18n.ts` (English and Mexican Spanish). Text
  quoted from the research library (legend meanings, alert definitions, the imagery credit)
  stays as the library wrote it.

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
