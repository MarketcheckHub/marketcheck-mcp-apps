#!/usr/bin/env node
/**
 * Build all app UIs in packages/apps/
 * Each app gets Vite-built into a single HTML file.
 */
import { readdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const appsDir = join(import.meta.dirname, "..", "packages", "apps");
const apps = readdirSync(appsDir).filter(d => {
  return existsSync(join(appsDir, d, "package.json"));
});

console.log(`Building ${apps.length} apps...`);

for (const app of apps) {
  const appDir = join(appsDir, app);
  console.log(`  Building ${app}...`);
  try {
    execSync("npm run build", { cwd: appDir, stdio: "pipe" });
    console.log(`  ✓ ${app}`);
  } catch (err) {
    console.error(`  ✗ ${app}: ${err.message}`);
  }
}

console.log("Done.");
