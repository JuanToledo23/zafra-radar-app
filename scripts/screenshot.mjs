// Headless check of the map: load the page, pick the site, wait for its tiles, move the time
// slider to a fraction of the season, click the segment nearest the map centre, save a
// screenshot and print a JSON report. --offline aborts every request that is not to
// localhost, as with wifi off.
//   node screenshot.mjs [--url http://localhost:5174] [--out ../docs/skeleton.png]
//                       [--site morelos|brazil] [--at 0..1] [--offline]
import { chromium } from "playwright";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const url = arg("--url", `http://localhost:${process.env.WEB_PORT ?? "5174"}`);
const out = arg("--out", new URL("../docs/skeleton.png", import.meta.url).pathname);
const site = arg("--site", "morelos");
const at = Number(arg("--at", "1"));
const offline = process.argv.includes("--offline");

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const blocked = [];
const errors = [];
const logs = [];
if (offline) {
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host === "localhost" || host === "127.0.0.1") return route.continue();
    blocked.push(host);
    return route.abort("internetdisconnected");
  });
}
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));

const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => window.__mapReadySite === "morelos", null, { timeout: 30_000 });
if (site !== "morelos") {
  await page.getByTestId("site-select").selectOption(site);
  await page.waitForFunction((s) => window.__mapReadySite === s, site, { timeout: 30_000 });
}
const readyMs = Date.now() - t0;
const slider = page.locator("#week");
const index = Math.round(at * Number(await slider.getAttribute("max")));
await slider.fill(String(index));
await page.waitForFunction(() => window.__zafraMap.loaded(), null, { timeout: 10_000 });

const box = await page.getByTestId("map").boundingBox();
const hit = await page.evaluate(() => {
  const map = window.__zafraMap;
  const { width, height } = map.getCanvas().getBoundingClientRect();
  let best = null;
  for (let x = 10; x < width; x += 20) {
    for (let y = 10; y < height; y += 20) {
      if (!map.queryRenderedFeatures([x, y], { layers: ["segments-fill"] }).length) continue;
      const d = (x - width / 2) ** 2 + (y - height / 2) ** 2;
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  return best;
});
if (hit) await page.mouse.click(box.x + hit.x, box.y + hit.y);
await page.getByTestId("panel").locator("table").waitFor({ timeout: 5_000 }).catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: out });

const report = {
  url,
  offline,
  site,
  slider_index: index,
  map_ready_ms: readyMs,
  basemap: await page.getByTestId("basemap-state").innerText(),
  api: await page.getByTestId("api-state").innerText(),
  panel: (await page.getByTestId("panel").locator("table").innerText().catch(() => "")).replace(/\s+/g, " "),
  slider_date: await page.getByTestId("slider-date").innerText(),
  harvest_count: await page.getByTestId("harvest-count").innerText(),
  blocked_hosts: [...new Set(blocked)],
  page_errors: errors,
  console_errors: logs.filter((l) => l.startsWith("error")),
  screenshot: out,
};
console.log(JSON.stringify(report, null, 2));
await browser.close();
