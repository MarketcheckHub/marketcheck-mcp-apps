#!/usr/bin/env node
/**
 * Static page generator for app detail pages and Derivative APIs documentation.
 * Produces SEO-optimized, mobile-responsive HTML files.
 *
 * Output:
 *   public/app/{id}/index.html   — Individual app detail pages (52 apps)
 *   public/docs/derivative-apis/index.html — Derivative API documentation
 *
 * Usage: node scripts/generate-pages.mjs
 */
import { mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { APPS, SEGMENTS, MC_API_ENDPOINTS, DERIVATIVE_APIS } from "./page-data.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "public");

// ── Shared HTML Components ──────────────────────────────────────────────

const SITE_URL = "https://apps.marketcheck.com";

const GTAG = `
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-QGPPMDJ4N6"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-QGPPMDJ4N6');
  </script>`;

function sharedCSS() {
  return `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
html { scroll-behavior:smooth; }
body {
  font-family:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;
  background:#f8fafc; color:#1e293b; line-height:1.6;
}
a { color:#066aab; text-decoration:none; }
a:hover { text-decoration:underline; }
code { font-family:'JetBrains Mono',monospace; font-size:0.875em; }
img { max-width:100%; height:auto; }

/* Nav */
.nav {
  position:sticky; top:0; z-index:100;
  background:rgba(255,255,255,0.95); backdrop-filter:blur(12px);
  border-bottom:1px solid #e2e8f0;
  padding:0 24px; height:56px;
  display:flex; align-items:center; gap:16px;
}
.nav-logo { font-weight:700; font-size:15px; color:#0f172a; white-space:nowrap; display:flex; align-items:center; gap:8px; }
.nav-logo img { height:24px; }
.nav-links { display:flex; gap:4px; margin-left:auto; }
.nav-links a {
  padding:6px 14px; border-radius:6px; font-size:13px; font-weight:500;
  color:#64748b; transition:all 0.2s;
}
.nav-links a:hover { background:#f1f5f9; color:#0f172a; text-decoration:none; }
.nav-links a.active { background:#066aab11; color:#066aab; }

/* Mobile nav */
.nav-toggle { display:none; background:none; border:none; font-size:24px; cursor:pointer; color:#64748b; }
@media (max-width:768px) {
  .nav-toggle { display:block; margin-left:auto; }
  .nav-links {
    display:none; position:absolute; top:56px; left:0; right:0;
    background:#fff; border-bottom:1px solid #e2e8f0;
    flex-direction:column; padding:8px;
  }
  .nav-links.open { display:flex; }
  .nav-links a { padding:12px 16px; }
}

/* Hero */
.page-hero {
  padding:48px 24px 32px; max-width:900px; margin:0 auto;
}
.page-hero .breadcrumb { font-size:13px; color:#64748b; margin-bottom:16px; }
.page-hero .breadcrumb a { color:#066aab; }
.page-hero h1 { font-size:clamp(28px,4vw,42px); font-weight:700; color:#0f172a; line-height:1.15; margin-bottom:8px; }
.page-hero .tagline { font-size:18px; color:#64748b; margin-bottom:20px; }
.page-hero .segment-badge {
  display:inline-block; padding:4px 12px; border-radius:20px;
  font-size:12px; font-weight:600; letter-spacing:0.5px;
}
.page-hero .ctas { display:flex; gap:12px; margin-top:24px; flex-wrap:wrap; }
.btn {
  display:inline-flex; align-items:center; gap:6px;
  padding:10px 20px; border-radius:8px; font-size:14px; font-weight:600;
  border:none; cursor:pointer; transition:all 0.2s; text-decoration:none;
}
.btn-primary { background:#066aab; color:#fff; }
.btn-primary:hover { background:#055a91; text-decoration:none; }
.btn-secondary { background:#f1f5f9; color:#1e293b; border:1px solid #e2e8f0; }
.btn-secondary:hover { background:#e2e8f0; text-decoration:none; }

/* Content */
.content { max-width:900px; margin:0 auto; padding:0 24px 64px; }
.section { margin-bottom:48px; }
.section h2 { font-size:22px; font-weight:700; color:#0f172a; margin-bottom:16px; padding-bottom:8px; border-bottom:2px solid #e2e8f0; }
.section h3 { font-size:16px; font-weight:600; color:#0f172a; margin:16px 0 8px; }
.section p { margin-bottom:12px; color:#475569; }

/* Screenshots */
.screenshots { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; margin:16px 0; }
.screenshot { border-radius:12px; overflow:hidden; border:1px solid #e2e8f0; box-shadow:0 2px 8px rgba(0,0,0,0.06); }
.screenshot img { width:100%; display:block; }

/* API endpoint cards */
.api-card {
  background:#fff; border:1px solid #e2e8f0; border-radius:12px;
  padding:20px; margin-bottom:16px; box-shadow:0 1px 3px rgba(0,0,0,0.04);
}
.api-card .method { display:inline-block; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700; letter-spacing:0.5px; background:#dcfce7; color:#166534; }
.api-card .path { font-family:'JetBrains Mono',monospace; font-size:13px; color:#0f172a; margin-left:8px; }
.api-card .api-name { font-weight:600; color:#0f172a; margin-top:8px; }
.api-card a { font-size:13px; }

/* Param table */
.param-table { width:100%; border-collapse:collapse; font-size:14px; margin:12px 0; }
.param-table th { text-align:left; padding:8px 12px; background:#f8fafc; border:1px solid #e2e8f0; font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; }
.param-table td { padding:8px 12px; border:1px solid #e2e8f0; }
.param-table .required { color:#dc2626; font-weight:600; font-size:11px; }

/* Code blocks */
pre.code-block {
  background:#0f172a; color:#e2e8f0; padding:16px; border-radius:8px;
  overflow-x:auto; font-size:13px; line-height:1.5; margin:12px 0;
}

/* Derivative API page */
.api-endpoint {
  background:#fff; border:1px solid #e2e8f0; border-radius:12px;
  margin-bottom:24px; overflow:hidden;
}
.api-endpoint-header {
  padding:16px 20px; border-bottom:1px solid #e2e8f0;
  display:flex; align-items:center; gap:12px; flex-wrap:wrap;
}
.api-endpoint-header .method-badge {
  padding:4px 10px; border-radius:4px; font-size:12px; font-weight:700;
  background:#dbeafe; color:#1e40af;
}
.api-endpoint-header .endpoint-path {
  font-family:'JetBrains Mono',monospace; font-size:14px; color:#0f172a;
}
.api-endpoint-body { padding:20px; }
.api-endpoint-body .underlying { display:flex; flex-wrap:wrap; gap:6px; margin:12px 0; }
.api-endpoint-body .underlying span {
  padding:3px 10px; border-radius:12px; font-size:11px; font-weight:500;
  background:#f0f9ff; color:#0369a1; border:1px solid #bae6fd;
}

/* Footer */
.footer {
  background:#0f172a; color:#94a3b8; padding:48px 24px;
  text-align:center; font-size:13px;
}
.footer a { color:#60a5fa; }
.footer .footer-links { display:flex; gap:24px; justify-content:center; margin-bottom:16px; flex-wrap:wrap; }
`;
}

function navHTML(activePage = "") {
  return `
<nav class="nav">
  <a href="/" class="nav-logo">
    <img src="https://34682200.delivery.rocketcdn.me/wp-content/uploads/2024/05/cropped-MC-Icon.png.webp" alt="MC" width="24" height="24" />
    MarketCheck Apps
  </a>
  <button class="nav-toggle" onclick="document.querySelector('.nav-links').classList.toggle('open')">\u2630</button>
  <div class="nav-links">
    <a href="/"${activePage === "gallery" ? ' class="active"' : ""}>Gallery</a>
    <a href="/docs/derivative-apis/"${activePage === "apis" ? ' class="active"' : ""}>Derivative APIs</a>
    <a href="https://apidocs.marketcheck.com" target="_blank">API Docs \u2197</a>
    <a href="https://developers.marketcheck.com" target="_blank">Get API Key \u2197</a>
  </div>
</nav>`;
}

function footerHTML() {
  return `
<footer class="footer">
  <div class="footer-links">
    <a href="/">App Gallery</a>
    <a href="/docs/derivative-apis/">Derivative APIs</a>
    <a href="https://apidocs.marketcheck.com" target="_blank">API Documentation</a>
    <a href="https://developers.marketcheck.com" target="_blank">Get Free API Key</a>
    <a href="https://github.com/MarketcheckHub/marketcheck-api-mcp-apps" target="_blank">GitHub</a>
  </div>
  <p>&copy; ${new Date().getFullYear()} MarketCheck. Powered by real-time automotive data covering 95%+ of US dealer inventory.</p>
</footer>`;
}

// ── Screenshot Discovery ────────────────────────────────────────────────

function findScreenshots(appId) {
  const ssDir = join(root, "static", "screenshots");
  if (!existsSync(ssDir)) return [];
  return readdirSync(ssDir)
    .filter(f => f.startsWith(appId) && f.endsWith(".png"))
    .sort()
    .map(f => `/assets/screenshots/${f}`);
}

// ── App Detail Page Generator ───────────────────────────────────────────

function generateAppPage(app) {
  const segment = SEGMENTS.find(s => s.name === app.segment);
  const screenshots = findScreenshots(app.id);
  const endpoints = (app.apiEndpoints ?? []).map(k => MC_API_ENDPOINTS[k]).filter(Boolean);

  const pageTitle = `${app.name} \u2014 MarketCheck Apps`;
  const pageDesc = app.description.slice(0, 160);
  const ogImage = screenshots[0] ? `${SITE_URL}${screenshots[0]}` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${GTAG}
  <title>${pageTitle}</title>
  <meta name="description" content="${pageDesc}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${SITE_URL}/app/${app.id}/">

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${pageTitle}">
  <meta property="og:description" content="${pageDesc}">
  <meta property="og:url" content="${SITE_URL}/app/${app.id}/">
  ${ogImage ? `<meta property="og:image" content="${ogImage}">` : ""}

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${pageTitle}">
  <meta name="twitter:description" content="${pageDesc}">
  ${ogImage ? `<meta name="twitter:image" content="${ogImage}">` : ""}

  <!-- Structured Data -->
  <script type="application/ld+json">
  ${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: app.name,
    description: app.description,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: `${SITE_URL}/app/${app.id}/`,
    ...(ogImage ? { image: ogImage } : {}),
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: { "@type": "Organization", name: "MarketCheck", url: "https://www.marketcheck.com" },
  })}
  </script>

  <style>${sharedCSS()}</style>
</head>
<body>
${navHTML()}

<div class="page-hero">
  <div class="breadcrumb"><a href="/">Gallery</a> / <a href="/#${app.segment.toLowerCase().replace(/[^a-z]/g, "-")}">${app.segment}</a> / ${app.name}</div>
  <h1>${app.name}</h1>
  <p class="tagline">${app.tagline}</p>
  <span class="segment-badge" style="background:${segment?.color ?? "#666"}22;color:${segment?.color ?? "#666"};border:1px solid ${segment?.color ?? "#666"}33;">
    ${app.segment}
  </span>
  <div class="ctas">
    <a href="/apps/${app.id}/dist/index.html" class="btn btn-primary">Launch App \u2192</a>
    <a href="https://developers.marketcheck.com" target="_blank" class="btn btn-secondary">Get Free API Key</a>
    <a href="https://apidocs.marketcheck.com" target="_blank" class="btn btn-secondary">API Docs \u2197</a>
  </div>
</div>

<div class="content">
  <!-- Description -->
  <div class="section">
    <h2>About This App</h2>
    <p>${app.description}</p>
  </div>

  <!-- Screenshots -->
  ${screenshots.length ? `
  <div class="section">
    <h2>Screenshots</h2>
    <div class="screenshots">
      ${screenshots.map(s => `<div class="screenshot"><img src="${s}" alt="${app.name} screenshot" loading="lazy" /></div>`).join("\n      ")}
    </div>
  </div>` : ""}

  <!-- API Endpoints Used -->
  ${endpoints.length ? `
  <div class="section">
    <h2>MarketCheck API Endpoints Used</h2>
    <p>This app calls the following MarketCheck API endpoints under the hood:</p>
    ${endpoints.map(ep => `
    <div class="api-card">
      <span class="method">GET</span>
      <span class="path">${ep.path}</span>
      <div class="api-name">${ep.name}</div>
      <a href="${ep.docs}" target="_blank">View API documentation \u2197</a>
    </div>`).join("")}
  </div>` : ""}

  <!-- Input Parameters -->
  ${(app.inputParams ?? []).length ? `
  <div class="section">
    <h2>Parameters</h2>
    <p>${app.tool?.startsWith("chat") ? "Chat apps accept natural language queries. The AI decides which tools and parameters to use." : `Pass these parameters when calling the <code>${app.tool}</code> tool or API endpoint:`}</p>
    <table class="param-table">
      <thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
      <tbody>
        ${app.inputParams.map(p => `<tr><td><code>${p.name}</code></td><td>${p.type}</td><td>${p.required ? '<span class="required">Yes</span>' : "No"}</td><td>${p.desc}</td></tr>`).join("")}
      </tbody>
    </table>
  </div>` : ""}

  ${app.tool && !app.tool.startsWith("chat") ? `
  <!-- Derivative API -->
  <div class="section">
    <h2>Derivative API Endpoint</h2>
    <p>This app is powered by a composite API endpoint that orchestrates multiple MarketCheck API calls:</p>
    <div class="api-card">
      <span class="method" style="background:#dbeafe;color:#1e40af;">POST</span>
      <span class="path">${SITE_URL}/api/proxy/${app.tool.split(",")[0]}</span>
      <p style="margin-top:8px;font-size:13px;color:#64748b;">
        Test this endpoint with your API key. See <a href="/docs/derivative-apis/#${app.tool.split(",")[0]}">full documentation</a>.
      </p>
    </div>
  </div>` : ""}

  <!-- How to Use -->
  <div class="section">
    <h2>How to Use</h2>
    <h3>1. In the Browser (Demo or Live Data)</h3>
    <p>Click "Launch App" above. Enter your MarketCheck API key in the settings gear for live data, or explore with demo data.</p>
    ${app.segment === "Chat Demos" ? `<p>Chat apps also require an LLM API key (Anthropic, OpenAI, or Google Gemini).</p>` : ""}

    <h3>2. As an MCP App (AI Assistants)</h3>
    <p>Add the MarketCheck MCP server to Claude, VS Code, or any MCP-compatible host:</p>
    <pre class="code-block">{
  "mcpServers": {
    "marketcheck-apps": {
      "url": "https://apps.marketcheck.com/mcp?api_key=YOUR_KEY"
    }
  }
}</pre>
    <p>Then ask the AI to use the <code>${app.tool?.split(",")[0] ?? app.id}</code> tool.</p>

    <h3>3. Embed in Your Portal</h3>
    <pre class="code-block">&lt;iframe
  src="${SITE_URL}/apps/${app.id}/dist/index.html?api_key=YOUR_KEY&amp;embed=true"
  width="100%" height="700"
  style="border:none;border-radius:8px;"
&gt;&lt;/iframe&gt;</pre>

    <h3>4. Get a Free API Key</h3>
    <p>Sign up at <a href="https://developers.marketcheck.com" target="_blank">developers.marketcheck.com</a> to get a free API key and start testing.</p>
  </div>

  <!-- GitHub -->
  <div class="section">
    <h2>Source Code</h2>
    <p>This app is open source and part of the MarketCheck API & MCP Apps monorepo:</p>
    <p><a href="https://github.com/MarketcheckHub/marketcheck-api-mcp-apps/tree/main/packages/apps/${app.id}" target="_blank">View source on GitHub \u2197</a></p>
    <p>The full repository contains ${APPS.length} apps across ${SEGMENTS.length} segments, plus full-stack chat demo implementations.</p>
  </div>
</div>

${footerHTML()}
</body>
</html>`;
}

// ── Derivative APIs Page Generator ──────────────────────────────────────

function generateDerivativeApisPage() {
  const pageTitle = "Derivative APIs \u2014 MarketCheck Apps";
  const pageDesc = "Composite API endpoints that orchestrate multiple MarketCheck API calls. Test with your API key at apps.marketcheck.com.";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${GTAG}
  <title>${pageTitle}</title>
  <meta name="description" content="${pageDesc}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${SITE_URL}/docs/derivative-apis/">

  <meta property="og:type" content="website">
  <meta property="og:title" content="${pageTitle}">
  <meta property="og:description" content="${pageDesc}">
  <meta property="og:url" content="${SITE_URL}/docs/derivative-apis/">

  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${pageTitle}">
  <meta name="twitter:description" content="${pageDesc}">

  <style>${sharedCSS()}</style>
</head>
<body>
${navHTML("apis")}

<div class="page-hero">
  <div class="breadcrumb"><a href="/">Home</a> / Derivative APIs</div>
  <h1>Derivative APIs</h1>
  <p class="tagline">Composite endpoints that orchestrate multiple MarketCheck API calls into single, purpose-built responses.</p>
  <div class="ctas">
    <a href="https://developers.marketcheck.com" target="_blank" class="btn btn-primary">Get Free API Key</a>
    <a href="https://apidocs.marketcheck.com" target="_blank" class="btn btn-secondary">Core API Docs \u2197</a>
  </div>
</div>

<div class="content">
  <div class="section">
    <h2>Overview</h2>
    <p>These derivative APIs are hosted at <code>${SITE_URL}/api/proxy/{endpoint}</code> and wrap the underlying <a href="https://apidocs.marketcheck.com" target="_blank">MarketCheck APIs</a> into higher-level, use-case-specific endpoints. Each endpoint orchestrates multiple API calls (VIN decode, price prediction, search, history, etc.) and returns a unified response.</p>

    <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:10px;padding:16px 20px;margin:20px 0;">
      <div style="font-weight:700;color:#92400e;margin-bottom:6px;">&#9888; Reference Only \u2014 Not Under LTS</div>
      <p style="color:#78350f;font-size:14px;margin:0;">These derivative APIs are provided <strong>as reference implementations</strong>, just like the apps themselves. They use the underlying standard MarketCheck APIs under the hood but are <strong>not under Long-Term Support (LTS)</strong> like the <a href="https://apidocs.marketcheck.com" target="_blank" style="color:#92400e;font-weight:600;">standard MarketCheck APIs</a>.</p>
      <p style="color:#78350f;font-size:14px;margin:8px 0 0;"><strong>Recommended approach:</strong> Use these endpoints for development and prototyping only. For production use, either build your own variants using the <a href="https://apidocs.marketcheck.com" target="_blank" style="color:#92400e;font-weight:600;">core MarketCheck APIs</a> directly, or contact <a href="mailto:support@marketcheck.com" style="color:#92400e;font-weight:600;">MarketCheck's support team</a> if you need LTS on any of these endpoints and want them elevated to the standard MarketCheck API platform.</p>
    </div>

    <p><strong>Authentication:</strong> All endpoints require a MarketCheck API key passed in the request body as <code>_auth_mode</code> and <code>_auth_value</code>.</p>
    <pre class="code-block">// Example: POST ${SITE_URL}/api/proxy/evaluate-deal
{
  "vin": "1HGCV1F34LA000001",
  "zip": "90210",
  "_auth_mode": "api_key",
  "_auth_value": "YOUR_MARKETCHECK_API_KEY"
}</pre>
    <p>Don't have an API key? <a href="https://developers.marketcheck.com" target="_blank">Sign up free at developers.marketcheck.com</a></p>
  </div>

  <div class="section">
    <h2>Endpoints (${DERIVATIVE_APIS.length})</h2>
    <p>Jump to: ${DERIVATIVE_APIS.map(a => `<a href="#${a.name}">${a.title}</a>`).join(" &middot; ")}</p>
  </div>

  ${DERIVATIVE_APIS.map(api => `
  <div class="api-endpoint" id="${api.name}">
    <div class="api-endpoint-header">
      <span class="method-badge">${api.method}</span>
      <span class="endpoint-path">/api/proxy/${api.name}</span>
    </div>
    <div class="api-endpoint-body">
      <h3>${api.title}</h3>
      <p>${api.description}</p>

      <h4 style="font-size:13px;color:#64748b;margin:12px 0 6px;text-transform:uppercase;letter-spacing:0.5px;">Underlying MarketCheck APIs</h4>
      <div class="underlying">
        ${api.underlyingApis.map(a => `<span>${a}</span>`).join("")}
      </div>

      ${Object.keys(api.params).length ? `
      <h4 style="font-size:13px;color:#64748b;margin:16px 0 6px;text-transform:uppercase;letter-spacing:0.5px;">Parameters</h4>
      <table class="param-table">
        <thead><tr><th>Name</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
        <tbody>
          ${Object.entries(api.params).map(([name, p]) => `<tr><td><code>${name}</code></td><td>${p.type}</td><td>${p.required ? '<span class="required">Yes</span>' : "No"}</td><td>${p.desc}</td></tr>`).join("")}
        </tbody>
      </table>` : "<p><em>No additional parameters required.</em></p>"}

      <h4 style="font-size:13px;color:#64748b;margin:16px 0 6px;text-transform:uppercase;letter-spacing:0.5px;">Example Request</h4>
      <pre class="code-block">POST ${SITE_URL}/api/proxy/${api.name}
Content-Type: application/json

${JSON.stringify(api.exampleRequest, null, 2)}</pre>

      <h4 style="font-size:13px;color:#64748b;margin:16px 0 6px;text-transform:uppercase;letter-spacing:0.5px;">Example Response</h4>
      <pre class="code-block">${JSON.stringify(api.exampleResponse, null, 2)}</pre>

      <p style="margin-top:12px;"><a href="/app/${APPS.find(a => a.tool?.split(",")[0] === api.name)?.id ?? ""}/" style="font-size:13px;">View app that uses this endpoint \u2192</a></p>
    </div>
  </div>`).join("\n")}
</div>

${footerHTML()}
</body>
</html>`;
}

// ── Main ────────────────────────────────────────────────────────────────

function run() {
  console.log("Generating pages...");
  let count = 0;

  // App detail pages
  for (const app of APPS) {
    const dir = join(outDir, "app", app.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), generateAppPage(app));
    count++;
  }
  console.log(`\u2713 ${count} app detail pages \u2192 public/app/`);

  // Derivative APIs page
  const apiDir = join(outDir, "docs", "derivative-apis");
  mkdirSync(apiDir, { recursive: true });
  writeFileSync(join(apiDir, "index.html"), generateDerivativeApisPage());
  console.log(`\u2713 Derivative APIs page \u2192 public/docs/derivative-apis/`);

  console.log(`Done. ${count + 1} pages generated.`);
}

run();
