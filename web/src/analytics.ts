// Visit counts with Umami Cloud (cookieless, no personal data). The tracker is loaded only on
// the production host, never in presenter mode or with Do Not Track on; without it, track()
// does nothing. Events carry fixed names and small fixed values (a site, a view, a list, a
// step number): never a field or segment id, nor text typed by the user.

const SCRIPT = "https://cloud.umami.is/script.js";
const WEBSITE_ID = "16ccd2cd-cb34-4073-bae8-2abb2af360cc"; // public by design
const HOSTS = ["zafraradar.earth", "www.zafraradar.earth"];

export type AnalyticsEvent =
  | "site-changed"
  | "view-changed"
  | "season-played"
  | "field-opened"
  | "reference-field-opened"
  | "season-panel-opened"
  | "mill-operations-opened"
  | "weekly-report-opened"
  | "csv-exported"
  | "language-changed"
  | "tour-started"
  | "tour-step"
  | "tour-finished"
  | "find-field";

type Umami = { track: (name: string, data?: Record<string, string | number>) => unknown };

function doNotTrack(): boolean {
  const w = window as { doNotTrack?: string };
  const n = navigator as { doNotTrack?: string | null; msDoNotTrack?: string };
  return [w.doNotTrack, n.doNotTrack, n.msDoNotTrack].some((v) => v === "1" || v === "yes");
}

let started = false;

/** Adds the tracker's script once, after the app has started. The page view is counted by
 * the script itself. If it fails to load or is blocked, the element is removed and nothing
 * else happens. */
export function startAnalytics(presenter: boolean) {
  if (started || presenter || !HOSTS.includes(window.location.hostname) || doNotTrack()) return;
  started = true;
  const s = document.createElement("script");
  s.src = SCRIPT;
  s.defer = true;
  s.async = true;
  s.dataset.websiteId = WEBSITE_ID;
  s.dataset.domains = HOSTS.join(","); // the tracker's own host check, as a second guard
  s.dataset.doNotTrack = "true";
  s.onerror = () => s.remove();
  document.head.appendChild(s);
}

/** Counts one event; does nothing when the tracker is absent. */
export function track(name: AnalyticsEvent, data?: Record<string, string | number>) {
  try {
    (window as { umami?: Umami }).umami?.track(name, data);
  } catch {
    // tracker absent or broken: nothing to count
  }
}
