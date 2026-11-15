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
date are subdued, a faint `#c9ced6` fill at 0.18 and a thin outline of the same colour at 0.2,
so they read as context rather than gaps. The latest week's harvests show in `#fff4cc` (pale
warm, L* 96) while the timeline advances (see Motion). The plasma ramp (colour by harvest
date) is a More options choice.

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

## Map canvas

The explorer's map is a dark, quiet backdrop under light interface panels: the satellite
image greyed and darkened (`BASEMAP_DIM`, `basemap.ts`: saturation −0.9, brightness 0–0.3,
contrast −0.1, about L* 5–35) over a plain `#24272b`, so the map looks alike with and without
the satellite image (offline). The segment fill has no anti-aliased edge (overlapping faint
edges added up to a light web); a hairline outline draws the edges.

Colours checked by simulating protanopia, deuteranopia and tritanopia (Machado et al. 2009,
full severity) as drawn at their opacity over three backdrops (plain `#24272b`, the darkest
image tone `#16181b`, a light image tone `#4a4e54`):

| Pair | CIEDE2000 (min over normal, protan, deutan, tritan) | ΔL* (min) |
|---|---|---|
| standing vs harvested | 29.9 | 28.0 |
| harvested vs backdrop | 48.0 | — |
| standing vs backdrop | 18.8 (light image tone), 23.6 (plain) | 5.7 (light tone), 21.6 (plain) |
| highlight vs harvested | 21.9 | 21.1 |
| no date vs backdrop / vs standing | 8.2 / 18.3 | — |

The two states stay apart by lightness alone in every simulation. Standing cane is closest to
the backdrop on the lightest image tones; the fields' dark hairline edge separates them there.

**Opening view.** The camera fits the extent of the site's cane fields (measured once from the
loaded tiles) with 24 px padding, 56 px on the right for the zoom buttons, so the fields fill
the map at 1280×720 and 1440×900; the map panel overlaps only the empty top-left corner.

**Radar views.** At the whole site the radar image is grey texture to a non-specialist, so
"Radar image" and "Before / after" open close (about zoom 14) over the site's radar area
(`RADAR_AREAS`, `radar.ts`): a 2.8 × 2 km window chosen from the data, where the most cane
was dated between the first and last acquisition with an ascending HV drop of 3 dB or more
(Morelos 147 fields, Brazil 97), so single fields and their darkening show. It sits right of
most of the map panel (220 px left padding). Zoomed out, the camera stays within the image
footprint (max bounds), so the image fills the map with no empty bands. Field edges over the
image: `#e8e8e8`, 0.6 px, opacity 0.35, faded in from zoom 13 to 14, where fields of 1-3 ha
are wide enough for the edges not to cover them; never filled. "Field outlines on top"
(More options) still draws them in the harvest colours.

## Motion

Motion carries the message and nothing else; every piece is off with `prefers-reduced-motion`.

* **First visit:** the season plays once from the first week (600 ms a week, about 13 s for
  Morelos and 6 s for Brazil) when the map is ready, and stops at the end or on any pointer,
  key or wheel input (on the play button the click pauses, as usual). Remembered in
  `localStorage` (`zafra.autoplay.seen`); not with reduced motion and not in presenter mode
  (`PRESENTER`, `?present=1`, the single flag in `App.tsx`).
* **Weekly highlight:** when the timeline moves forward, the fields harvested in the week it
  closes show in the highlight at once, hold 150 ms, then fade over 400 ms into the harvested
  colour underneath (a native MapLibre opacity transition on one extra fill layer), all within
  one play step. Not when going back, over radar imagery, or with reduced motion.
* **Numbers:** the "Season so far" figures ease to each new value in 350 ms (cubic ease-out,
  tabular figures, so the digits do not shift).
* **Divider hint:** entering Before / after, the divider starts in the middle and sways once
  (±6 % of the width, 1.1 s, after 0.5 s); a drag stops it.
* **Camera:** after the first paint of a site, a 500 ms ease to the cane extent; entering a
  radar view from the harvest map, a 500 ms ease to the radar area. Tour scenes jump.

## Layout

* **Top bar** (56 px, white): product name, site select, the Explorer / Mill operations
  segmented control, then on the right Find field (Explorer), the EN / ES language switch (the
  whole interface) and the "Take the tour" button. The basemap and API status labels stay in the
  page for the headless checks but are not shown.
* **Explorer:** map in the middle; the **map panel** floating top-left; **detail panel** on the
  right (400 px); the **timeline bar** docked under the map (play, "Week of" the Monday, the
  slider with the season's weekly harvest counts drawn as bars along its track, the weeks
  played in the accent, the current one darker; fields harvested so far, then their hectares
  and share of the mapped cane; season progress button); the **season panel** is a bottom
  drawer under the timeline (40 %, or about 75 % of the window expanded).
* **Three map views**, one click each on the map panel's segmented control:
  1. **Harvest map** (default): standing green, harvested amber, no harvest date grey, over the
     dimmed basemap; play turns the fields amber week by week.
  2. **Radar image**: the NISAR HV image of the latest acquisition on or before the timeline
     date, following play; faint field edges (see Radar views); legend: a bright-to-dark bar
     with "Bright: tall vegetation, such as standing cane and trees" under its bright end and
     "Dark: cut cane, bare soil or water" under its dark end (consistent with the library's
     legend text), and the image date.
  3. **Before / after**: the first against the last acquisition with the divider, labelled
     "Before harvest · date" and "After harvest · date"; faint field edges, the same legend, no
     other controls. The divider has a round drag handle (40 px) in the middle of its height
     on a 32 px hit strip. The labels are plain text (no arrows: they are not buttons) and sit
     near the top, each beside the divider on its own side, both on one row when they can,
     moved down below the map panel, the zoom buttons or the credit when they would cover
     them. On a narrow side a label wraps to two lines (text, date); when even that does not
     fit (divider within about 15 % of an edge, or More options open over the left side) it is
     pinned inside the map edge and may cross the divider, never hidden or overlapping the
     other label; it then names its side ("Left: Before harvest · date").
* **More options** (closed by default) holds everything else: colour by harvest date, the
  radar product, dates, follow time slider, change layer, opacity, outlines, the library's full
  legend and credit, reference fields and alerts.
* **Nothing selected:** the site's name and season, its subtitle (the site's role, e.g.
  "training site", is in the "?" beside it, not in the visible text), a **Season so far**
  block that follows the timeline (the harvested share of the mapped cane area as a figure
  and a bar, fields and hectares harvested so far, this week's fields and hectares), the
  site's three key numbers as compact rows (cane hectares, fields, fields with a harvest
  date), and one line inviting to press play or click a field.
* **Field detail:** one sentence in large type ("Harvested around 21 Dec 2025 (± 6 days)" or
  "No harvest date detected"), then one chart, the HV radar signal titled "The radar signal
  drops when the cane is cut", and the summary. Date confidence, probabilities, HV drop,
  coherence, HH, fires and alerts are under "More detail", with their notes.
* **Guided tour** (`tour.ts`, `TourCard.tsx`): a card bottom-left over the map (over the side
  panel's lower part when the season panel covers the map; bottom-right on Mill operations)
  with "Step n of 9", the scene's title and one-sentence caption, one dot per scene, Back and
  Next. Presenter mode shows only "n / 9" in the bottom-right corner, and the closing scene's
  links. Captions carry no figures; the numbers on screen come from the API.
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
* **Legends:** a swatch or line sample beside each label, inside the layer they describe; a
  continuous image (radar HV) gets a small bar from one end of its ramp to the other with the
  meaning of each end under it, never square swatches (they read as checkboxes).
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
  Escape. In the tour: right arrow, Space and PageDown go to the next scene, left arrow and
  PageUp back, Escape leaves; arrows and Space keep their meaning in form controls (the
  slider), Space on a button.
* Every icon-only button has an `aria-label`; groups have `role="group"` and a label.
* `prefers-reduced-motion`: no transitions or shimmer, map moves without animation, no
  first-visit autoplay, weekly highlight, number easing or divider hint.
* Interface motion is short (150 ms) and only on opacity, colour and small transforms; the
  map's motion follows the rules under Motion above.
* No NASA or agency logos or insignia anywhere; the favicon is a neutral radar mark.
