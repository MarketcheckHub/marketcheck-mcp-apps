#!/usr/bin/env node
// Regenerate the deal-evaluator gallery screenshots.
//
// Usage:
//   Demo mode (default, safe for CI and anyone without a key):
//     node scripts/retake-deal-evaluator.mjs
//
//   Live mode (richer data — rich histogram, real price-history chart):
//     MC_API_KEY=xxx node scripts/retake-deal-evaluator.mjs
//     MC_API_KEY=xxx TEST_VIN=... TEST_ZIP=... node scripts/retake-deal-evaluator.mjs
//
// Security: the API key is read from the environment only and never written
// to disk, stdout, logs, or screenshot URLs beyond the live browser session.
// Do NOT hardcode the key here. Do NOT `echo $MC_API_KEY` in CI logs.

import puppeteer from "puppeteer";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "static", "screenshots");
const BASE = process.env.APPS_BASE || "http://localhost:4005";
const APP = "deal-evaluator";
const APP_URL = `${BASE}/apps/${APP}/dist/index.html`;

// Live-mode inputs (all optional — only used when MC_API_KEY is set).
const API_KEY = process.env.MC_API_KEY || "";
const TEST_VIN = process.env.TEST_VIN || "WBAJE5C53KWW20025";   // 2019 BMW 540i — rich 10-entry history + 58 comps
const TEST_ZIP = process.env.TEST_ZIP || "90210";
const TEST_PRICE = process.env.TEST_PRICE || "32000";
const TEST_MILES = process.env.TEST_MILES || "57680";

const kb = (p) => Math.round(statSync(p).size / 1024);

function buildUrl({ withKey, withVin }) {
  const params = new URLSearchParams();
  if (withKey && API_KEY) params.set("api_key", API_KEY);
  if (withVin && API_KEY) {
    params.set("vin", TEST_VIN);
    params.set("zip", TEST_ZIP);
    params.set("askingPrice", TEST_PRICE);
    params.set("miles", TEST_MILES);
  }
  const qs = params.toString();
  return qs ? `${APP_URL}?${qs}` : APP_URL;
}

async function main() {
  const liveMode = Boolean(API_KEY);
  console.log(`Mode: ${liveMode ? "LIVE" : "DEMO"}${liveMode ? ` (VIN=${TEST_VIN}, ZIP=${TEST_ZIP})` : ""}`);

  const browser = await puppeteer.launch({
    headless: "shell",
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    protocolTimeout: 90000,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

  // ── 1 & 2. Initial / form — load without vin param so auto-submit doesn't fire.
  // In live mode, api_key alone lights up the LIVE badge; in demo mode, the demo banner shows.
  await page.goto(buildUrl({ withKey: liveMode, withVin: false }), {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });
  await new Promise((r) => setTimeout(r, 1500));
  const initialPath = join(outDir, `${APP}-initial.png`);
  await page.screenshot({ path: initialPath, clip: { x: 0, y: 0, width: 1280, height: 900 } });
  console.log(`✓ ${APP}-initial.png (${kb(initialPath)}KB)`);
  const formPath = join(outDir, `${APP}-form.png`);
  await page.screenshot({ path: formPath, clip: { x: 0, y: 0, width: 1280, height: 900 } });
  console.log(`✓ ${APP}-form.png (${kb(formPath)}KB)`);

  // ── 3. Trigger evaluation.
  if (liveMode) {
    // Navigate with full URL params — the app auto-submits when vin is in URL.
    await page.goto(buildUrl({ withKey: true, withVin: true }), {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    // Wait for 4 API calls + transformer + render + animations (~7s generous).
    await new Promise((r) => setTimeout(r, 7000));
  } else {
    // Demo: click Evaluate, wait for mock render + animations (~2.6s).
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Evaluate",
      );
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 2600));
  }

  // ── 4. Result — first-fold after evaluation.
  const resultPath = join(outDir, `${APP}-result.png`);
  await page.screenshot({ path: resultPath, clip: { x: 0, y: 0, width: 1280, height: 900 } });
  console.log(`✓ ${APP}-result.png (${kb(resultPath)}KB)`);

  // ── 5. Canonical — the gallery tile (same first-fold as result).
  const canonPath = join(outDir, `${APP}.png`);
  await page.screenshot({ path: canonPath, clip: { x: 0, y: 0, width: 1280, height: 900 } });
  console.log(`✓ ${APP}.png (${kb(canonPath)}KB)`);

  // ── 6. Full-page — explicit viewport resize; `fullPage: true` alone is unreliable in headless shell.
  const fullHeight = await page.evaluate(() =>
    Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
  );
  await page.setViewport({ width: 1280, height: fullHeight, deviceScaleFactor: 1 });
  await new Promise((r) => setTimeout(r, 400));
  const fullPath = join(outDir, `${APP}-full.png`);
  await page.screenshot({ path: fullPath, clip: { x: 0, y: 0, width: 1280, height: fullHeight } });
  console.log(`✓ ${APP}-full.png (${kb(fullPath)}KB, 1280x${fullHeight})`);

  await browser.close();
  console.log(`\nDone. 5 screenshots refreshed under static/screenshots/ (${liveMode ? "live" : "demo"} mode).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
