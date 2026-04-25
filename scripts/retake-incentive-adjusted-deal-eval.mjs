#!/usr/bin/env node
// Regenerate static/screenshots/incentive-adjusted-deal-eval*.png from the live app.
//
// Usage:
//   MC_API_KEY=xxx node scripts/retake-incentive-adjusted-deal-eval.mjs        # live mode (richer gallery tiles)
//   node scripts/retake-incentive-adjusted-deal-eval.mjs                       # demo mode (CI-safe, mock data)
//
// Optional: PORT=4005 (default), VIN / ZIP / ASKING / MILES overrides.
//
// Output: 5 PNGs in static/screenshots/ — -initial, -form, -result, canonical, -full.

import puppeteer from "puppeteer";
import { statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "static", "screenshots");
const PORT = process.env.PORT || "4005";
const APP = "incentive-adjusted-deal-eval";
const BASE = `http://localhost:${PORT}/apps/${APP}/dist/index.html`;

// Known-good VIN: 2020 Kia Niro LX. Real MSRP $24,590, good incentive coverage.
const VIN = process.env.VIN || "KNDCB3LC9L5359658";
const ZIP = process.env.ZIP || "60601";
const ASKING = process.env.ASKING || "18500";
const MILES = process.env.MILES || "35000";

const KEY = process.env.MC_API_KEY;  // Never hardcoded. Never logged.
const mode = KEY ? "live" : "demo";
console.log(`Mode: ${mode} (${KEY ? "API key from env" : "no key — will use mock data"})`);

// Build URL for the state we want. Key stays in env/URL only — never printed.
function urlFor(params = {}) {
  const u = new URL(BASE);
  if (KEY) u.searchParams.set("api_key", KEY);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

async function takeFull(page, file) {
  // puppeteer's fullPage: true is unreliable in headless "shell" mode —
  // resize viewport to document height first, then clip.
  const fullHeight = await page.evaluate(() => Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
  ));
  await page.setViewport({ width: 1280, height: fullHeight, deviceScaleFactor: 1 });
  await page.screenshot({
    path: file,
    clip: { x: 0, y: 0, width: 1280, height: fullHeight },
  });
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  return statSync(file).size;
}

async function takeViewport(page, file) {
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1280, height: 900 } });
  return statSync(file).size;
}

async function run() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });

  try {
    // 1. Initial — empty form, default VIN, no evaluation yet. Demo mode by
    //    convention (safe for CI) even when a key is present, since auto-submit
    //    fires on load and we can't easily capture the pre-submit state live.
    //    Navigate without key param so auto-submit shows the demo banner.
    const p1 = await browser.newPage();
    await p1.setViewport({ width: 1280, height: 900 });
    await p1.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20000 });
    // Catch the form before auto-submit fires — don't wait for network idle.
    await new Promise(r => setTimeout(r, 250));
    const s1 = await takeViewport(p1, join(outDir, `${APP}-initial.png`));
    console.log(`  ✓ ${APP}-initial.png (${Math.round(s1 / 1024)} KB)`);
    await p1.close();

    // 2. Form-filled — VIN / ZIP / price / miles populated via URL params, just
    //    before results land. Capture quickly.
    const p2 = await browser.newPage();
    await p2.setViewport({ width: 1280, height: 900 });
    await p2.goto(urlFor({ vin: VIN, zip: ZIP, askingPrice: ASKING, miles: MILES }), { waitUntil: "domcontentloaded", timeout: 20000 });
    await new Promise(r => setTimeout(r, 300));
    const s2 = await takeViewport(p2, join(outDir, `${APP}-form.png`));
    console.log(`  ✓ ${APP}-form.png (${Math.round(s2 / 1024)} KB)`);
    await p2.close();

    // 3. Result + canonical + full — same page state, three captures.
    const p3 = await browser.newPage();
    await p3.setViewport({ width: 1280, height: 900 });
    await p3.goto(urlFor({ vin: VIN, zip: ZIP, askingPrice: ASKING, miles: MILES }), { waitUntil: "networkidle0", timeout: 30000 });
    // Wait for the auto-submit to complete and render to settle.
    await new Promise(r => setTimeout(r, 3500));
    const s3 = await takeViewport(p3, join(outDir, `${APP}-result.png`));
    console.log(`  ✓ ${APP}-result.png (${Math.round(s3 / 1024)} KB)`);

    // Canonical: viewport-sized, used as the gallery tile.
    const s4 = await takeViewport(p3, join(outDir, `${APP}.png`));
    console.log(`  ✓ ${APP}.png (${Math.round(s4 / 1024)} KB)`);

    // Full-page: the whole scrollable document.
    const s5 = await takeFull(p3, join(outDir, `${APP}-full.png`));
    console.log(`  ✓ ${APP}-full.png (${Math.round(s5 / 1024)} KB)`);

    await p3.close();
  } finally {
    await browser.close();
  }

  console.log(`\nDone. Mode: ${mode}.`);
}

run().catch((e) => { console.error(e); process.exit(1); });
