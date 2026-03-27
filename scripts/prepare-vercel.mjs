#!/usr/bin/env node
/**
 * After building all apps + gallery, copy dist files to public/ for Vercel static serving.
 */
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const publicDir = join(root, "public");

// Clean and create public/
import { rmSync } from "node:fs";
if (existsSync(publicDir)) {
  rmSync(publicDir, { recursive: true, force: true });
}
mkdirSync(publicDir, { recursive: true });

// Copy gallery dist → public/
const galleryDist = join(root, "packages", "gallery", "dist");
if (existsSync(galleryDist)) {
  cpSync(galleryDist, publicDir, { recursive: true });
  console.log("✓ Gallery → public/");
}

// Copy each app dist → public/apps/{name}/dist/
const appsDir = join(root, "packages", "apps");
const apps = readdirSync(appsDir).filter(d => existsSync(join(appsDir, d, "dist", "index.html")));

for (const app of apps) {
  const src = join(appsDir, app, "dist");
  const dest = join(publicDir, "apps", app, "dist");
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
}
console.log(`✓ ${apps.length} apps → public/apps/`);


// Copy static assets (screenshots) → public/assets/screenshots/
const staticDir = join(root, "static", "screenshots");
if (existsSync(staticDir)) {
  const dest = join(publicDir, "assets", "screenshots");
  mkdirSync(dest, { recursive: true });
  cpSync(staticDir, dest, { recursive: true });
  console.log("✓ Screenshots → public/assets/screenshots/");
}

// Copy logo → public/assets/
const logoSrc = join(root, "static", "mc-logo.webp");
if (existsSync(logoSrc)) {
  const assetsDest = join(publicDir, "assets");
  mkdirSync(assetsDest, { recursive: true });
  cpSync(logoSrc, join(assetsDest, "mc-logo.webp"));
  console.log("✓ Logo → public/assets/mc-logo.webp");
}

console.log("Done. public/ is ready for Vercel.");
