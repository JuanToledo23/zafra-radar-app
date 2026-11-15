import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import App from "./App";
import { LANGS, type Lang } from "./i18n";
import WeeklyReport from "./WeeklyReport";

// /?report=<site>&as_of=<date>&lang=<lang>: the printable weekly report, without the app.
const q = new URLSearchParams(window.location.search);
const report = q.get("report");
const asOf = q.get("as_of") ?? "";
const lang = (LANGS as string[]).includes(q.get("lang") ?? "") ? (q.get("lang") as Lang) : "en";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {report && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? <WeeklyReport siteId={report} iso={asOf} lang={lang} /> : <App />}
  </StrictMode>,
);
