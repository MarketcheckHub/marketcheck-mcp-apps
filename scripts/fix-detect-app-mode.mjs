#!/usr/bin/env node
/**
 * Fixes _detectAppMode in all apps to prefer live mode when an API key is available,
 * and only use MCP mode when actually iframed into an MCP host (window.parent !== window).
 * This fixes:
 *  1) Demo banner not showing when no API key (because _safeApp is always truthy)
 *  2) Apps returning dummy data even with an API key (MCP path fails silently)
 */
import fs from "node:fs";
import path from "node:path";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const OLD_PATTERN = /function _detectAppMode\(\): "mcp" \| "live" \| "demo" \{\s*if \(_safeApp\) return "mcp";\s*if \(_getAuth\(\)\.value\) return "live";\s*return "demo";\s*\}/;

const NEW_CODE = `function _detectAppMode(): "mcp" | "live" | "demo" {
  // Auth (URL or localStorage) takes priority — run in standalone live mode
  if (_getAuth().value) return "live";
  // Only use MCP mode when no auth AND we're actually iframed into an MCP host
  if (_safeApp && window.parent !== window) return "mcp";
  return "demo";
}`;

const appsDir = path.join(ROOT, "packages", "apps");
const files = readdirSync(appsDir)
  .map(d => path.join(appsDir, d, "src", "main.ts"))
  .filter(f => fs.existsSync(f));

let updated = 0, skipped = 0;
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const appName = path.basename(path.dirname(path.dirname(file)));
  if (!OLD_PATTERN.test(src)) { skipped++; continue; }
  // Skip if already patched (has "window.parent !== window")
  if (src.includes("window.parent !== window")) { console.log(`  SKIP (already fixed): ${appName}`); skipped++; continue; }
  const newSrc = src.replace(OLD_PATTERN, NEW_CODE);
  fs.writeFileSync(file, newSrc);
  console.log(`  FIXED: ${appName}`);
  updated++;
}
console.log(`\nDone: ${updated} updated, ${skipped} skipped.`);
