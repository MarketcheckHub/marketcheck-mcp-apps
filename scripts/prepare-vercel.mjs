#!/usr/bin/env node
/**
 * After building all apps + gallery, copy dist files to public/ for Vercel static serving.
 */
import { cpSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
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

// ── Generate sitemap.xml ─────────────────────────────────────────────────
const SITE = "https://apps.marketcheck.com";
const today = new Date().toISOString().split("T")[0];

const sitemapUrls = [
  { loc: "/", priority: "1.0", changefreq: "weekly" },
  { loc: "/docs/derivative-apis/", priority: "0.8", changefreq: "monthly" },
  ...apps.map(a => ({ loc: `/app/${a}/`, priority: "0.7", changefreq: "monthly" })),
  ...apps.map(a => ({ loc: `/apps/${a}/dist/index.html`, priority: "0.6", changefreq: "monthly" })),
];

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(u => `  <url>
    <loc>${SITE}${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n")}
</urlset>`;

writeFileSync(join(publicDir, "sitemap.xml"), sitemapXml);
console.log(`✓ sitemap.xml (${sitemapUrls.length} URLs)`);

// ── Generate robots.txt ──────────────────────────────────────────────────
const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;

writeFileSync(join(publicDir, "robots.txt"), robotsTxt);
console.log("✓ robots.txt");

// ── Generate llms.txt ────────────────────────────────────────────────────
const llmsTxt = `# MarketCheck Apps

> 52 interactive automotive market intelligence apps and AI chat demos powered by MarketCheck real-time data.

## About

MarketCheck Apps is an open-source collection of automotive market intelligence tools built on the MarketCheck API platform. The apps cover VIN decoding, price prediction, inventory search, sold vehicle analytics, OEM incentives, and more — serving dealers, appraisers, lenders, analysts, manufacturers, insurers, wholesalers, fleet managers, and consumers.

## Links

- Portal: ${SITE}
- API Documentation: https://apidocs.marketcheck.com
- Developer Portal: https://developers.marketcheck.com
- GitHub: https://github.com/MarketcheckHub/marketcheck-api-mcp-apps
- MCP Endpoint: ${SITE}/mcp
- Derivative APIs: ${SITE}/docs/derivative-apis/

## Apps (${apps.length})

${apps.map(a => `- [${a}](${SITE}/app/${a}/)`).join("\n")}

## Derivative API Endpoints

All derivative endpoints are hosted at \`${SITE}/api/proxy/{endpoint}\` and compose multiple MarketCheck API calls into single responses.

- estimate-trade-in — Trade-in value estimation (VIN decode + retail/wholesale pricing + sold comps)
- evaluate-deal — Deal evaluation (VIN decode + price prediction + history + active comps)
- appraiser-workbench — Full appraisal (VIN decode + retail/wholesale + history + active/sold comps)
- claims-valuation — Insurance claims (VIN decode + FMV + sold comps + regional data + replacements)
- generate-vin-market-report — Complete VIN report (decode + prices + history + comps + incentives)
- search-cars — Enhanced active inventory search with stats, facets, dealer/build objects
- compare-cars — Side-by-side VIN comparison with specs and pricing
- get-market-index — Market index by make and body type segment
- scan-lot-pricing — Dealer lot inventory with market pricing and demand hot list
- stocking-intelligence — Market demand by make/model and body type
- comparables-explorer — Active and sold comparables with optional VIN pricing
- oem-incentives-explorer — OEM incentives with brand comparison
- find-incentive-deals — Multi-OEM incentive scan across brands
- evaluate-incentive-deal — Deal evaluation with OEM incentives
- evaluate-loan-application — Loan collateral assessment
- benchmark-insurance-premiums — Market analysis by body type, fuel type, state
- generate-market-briefing — Executive market summary
- trace-vin-history — VIN listing timeline with pricing
- generate-pricing-report — VIN pricing report with comparables
- find-auction-arbitrage — Wholesale-to-retail spread analysis
- analyze-dealer-conquest — Competitive inventory gap analysis
- detect-market-anomalies — Pricing outlier detection
- stress-test-portfolio — Batch VIN portfolio valuation
- manage-fleet-lifecycle — Fleet valuation with replacements
- value-rental-fleet — Rental fleet valuation
- route-wholesale-vehicles — Wholesale routing decisions
- score-dealer-fit — Dealer inventory fit scoring
- search-uk-cars — UK market vehicle search
- get-uk-market-trends — UK market statistics
- scan-uk-lot-pricing — UK dealer lot analysis

## Authentication

All API endpoints require a MarketCheck API key. Get a free key at https://developers.marketcheck.com

## MCP Integration

Connect to the MCP endpoint at \`${SITE}/mcp\` from Claude, VS Code, or any MCP-compatible client. Pass your API key as a query parameter: \`${SITE}/mcp?api_key=YOUR_KEY\`
`;

writeFileSync(join(publicDir, "llms.txt"), llmsTxt);
console.log("✓ llms.txt");

console.log("Done. public/ is ready for Vercel.");
