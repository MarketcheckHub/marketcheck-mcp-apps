# MarketCheck MCP Apps

<img src="https://34682200.delivery.rocketcdn.me/wp-content/uploads/2024/05/cropped-MC-Icon.png.webp" alt="MarketCheck" width="48" align="left" style="margin-right:12px;" />

**25 interactive automotive market intelligence dashboards** — usable as MCP UI Apps inside AI assistants, as a standalone web showcase, or as embeddable iframe widgets in your own portal.

Powered by [MarketCheck](https://www.marketcheck.com/) real-time automotive data — VIN decoding, ML price predictions, active/sold inventory, and aggregated market analytics.

---

## 4 Ways to Use

| Mode | Description | Auth Required |
|------|-------------|---------------|
| **Demo** | Browse all 25 apps with realistic sample data | None |
| **Live Data** | Connect your MarketCheck API key for real market data | API Key |
| **Embed** | Embed apps in your website/portal via iframe | OAuth Access Token (secure, 6hr TTL) |
| **MCP / AI** | Use inside Claude, VS Code Copilot, Goose, and other MCP hosts | API Key (server env) |

Don't have an API key? [Sign up free at developers.marketcheck.com](https://developers.marketcheck.com)

---

## Quick Start

```bash
# Install dependencies
npm install

# Build everything (gallery + 25 apps + server)
npm run build

# Start the server
npm run serve
```

Then open:
- **Gallery:** http://localhost:3001/ — browse all 25 apps, enter API key
- **MCP endpoint:** http://localhost:3001/mcp — for AI assistant connectors
- **Any app directly:** http://localhost:3001/apps/{app-name}/dist/index.html

### Demo Mode (no server needed)

Open any built HTML file directly in your browser — all apps have mock data:

```bash
open packages/apps/used-car-market-index/dist/index.html
open packages/apps/deal-evaluator/dist/index.html
open packages/apps/trade-in-estimator/dist/index.html
```

### Test with MCP test host

```bash
# Terminal 1: Start server
npm run serve

# Terminal 2: Run the official MCP test host
git clone https://github.com/modelcontextprotocol/ext-apps.git /tmp/ext-apps
cd /tmp/ext-apps/examples/basic-host
npm install
SERVERS='["http://localhost:3001/mcp"]' npm start
# → Open http://localhost:8080, pick a tool, call it, see the app render
```

### Test with Claude

```bash
# Terminal 1: Start server
npm run serve

# Terminal 2: Tunnel to internet
npx cloudflared tunnel --url http://localhost:3001
```

Copy the tunnel URL, then in Claude:
1. Go to **Settings → Connectors → Add Custom Connector**
2. Paste the URL with `/mcp` suffix (e.g., `https://random-name.trycloudflare.com/mcp`)
3. Start a new chat and ask Claude to use any tool

> Custom connectors require a paid Claude plan (Pro, Max, or Team).

---

## All 25 Apps

### Consumer Apps

| # | App | Tool Name | Description |
|---|-----|-----------|-------------|
| 25 | [Used Car Market Index](#app-25-used-car-market-index) | `get-market-index` | Stock-ticker-style dashboard for the used car market. Track prices like Wall Street tracks stocks. |
| 7 | [Trade-In Estimator](#app-7-trade-in-estimator) | `estimate-trade-in` | Instant 3-tier trade-in value (private party / dealer / cash offer) with sold comp evidence. |
| 5 | [Deal Evaluator](#app-5-deal-evaluator) | `evaluate-deal` | Enter a VIN, get a Buy/Negotiate/Pass verdict with gauge, negotiation toolkit, and alternatives. |
| 6 | [Car Search & Compare](#app-6-car-search--compare) | `search-cars`, `compare-cars` | Visual car shopping with filters, photo cards, badges, and side-by-side comparison. |
| 24 | [OEM Incentives Explorer](#app-24-oem-incentives-explorer) | `oem-incentives-explorer` | Search cash-back, APR, and lease deals by ZIP. Compare across brands. Savings calculator. |

### Appraiser Apps

| # | App | Tool Name | Description |
|---|-----|-----------|-------------|
| 1 | [Appraiser Workbench](#app-1-appraiser-workbench) | `appraiser-workbench` | Multi-panel valuation studio — retail/wholesale predictions, active/sold comps, price history timeline. |
| 2 | [Comparables Explorer](#app-2-comparables-explorer) | `comparables-explorer` | Price distribution histogram + price-vs-mileage scatter plot with percentile positioning. |
| 3 | [Depreciation Analyzer](#app-3-depreciation-analyzer) | `depreciation-analyzer` | Multi-model depreciation curves, segment comparison, geographic variance, brand residual rankings. |
| 4 | [Market Trends Dashboard](#app-4-market-trends-dashboard) | `market-trends-dashboard` | Macro market view — movers, segment donut, brand residuals, state rankings, markup tracker. |

### Dealer Apps

| # | App | Tool Name | Description |
|---|-----|-----------|-------------|
| 8 | [Lot Pricing Dashboard](#app-8-lot-pricing-dashboard) | `scan-lot-pricing` | Full lot inventory with market price gaps, aging heatmap, floor plan burn, and stocking hot list. |
| 9 | [Stocking Intelligence](#app-9-stocking-intelligence) | `stocking-intelligence` | Demand heatmap, buy/avoid lists, and VIN checker for auction run-list evaluation. |

### Dealership Group Apps

| # | App | Tool Name | Description |
|---|-----|-----------|-------------|
| 10 | [Group Operations Center](#app-10-group-operations-center) | `group-operations-center` | Multi-location health cards, alert feed, cross-store transfer recommendations. |
| 11 | [Location Benchmarking](#app-11-location-benchmarking) | `location-benchmarking` | Rooftop-vs-rooftop comparison across 4 KPIs with Canvas bar charts. |
| 12 | [Inventory Balancer](#app-12-inventory-balancer) | `inventory-balancer` | Supply/demand matrix with specific vehicle transfer recommendations. |

### Analyst Apps

| # | App | Tool Name | Description |
|---|-----|-----------|-------------|
| 13 | [Earnings Signal Dashboard](#app-13-earnings-signal-dashboard) | `earnings-signal-dashboard` | Pre-earnings 6-dimension channel check with bull/bear scenarios for auto tickers. |
| 14 | [Watchlist Monitor](#app-14-watchlist-monitor) | `watchlist-monitor` | Morning signal scan across tracked tickers with sparklines and priority alerts. |
| 15 | [Dealer Group Scorecard](#app-15-dealer-group-scorecard) | `dealer-group-scorecard` | Benchmark 8 public dealer groups with radar charts and peer matrix. |

### Lender Apps

| # | App | Tool Name | Description |
|---|-----|-----------|-------------|
| 16 | [Portfolio Risk Monitor](#app-16-portfolio-risk-monitor) | `portfolio-risk-monitor` | LTV distribution histogram, underwater loan alerts, segment exposure donut, depreciation heatmap. |
| 17 | [EV Collateral Risk Monitor](#app-17-ev-collateral-risk-monitor) | `ev-collateral-risk` | EV vs ICE depreciation gap curves, brand risk table, state adoption heatmap, advance rate recs. |

### Insurer App

| # | App | Tool Name | Description |
|---|-----|-----------|-------------|
| 18 | [Claims Valuation Workbench](#app-18-claims-valuation-workbench) | `claims-valuation` | Total-loss determination with settlement range, comparable evidence, and replacement options. |

### Manufacturer Apps

| # | App | Tool Name | Description |
|---|-----|-----------|-------------|
| 19 | [Brand Command Center](#app-19-brand-command-center) | `brand-command-center` | Market share bars, pricing power scatter, model drill-down, regional heatmap, conquest analysis. |
| 20 | [Regional Demand Allocator](#app-20-regional-demand-allocator) | `regional-demand-allocator` | State-level D/S ratios, segment mix comparison, allocation shift recommendations. |

### Auction House App

| # | App | Tool Name | Description |
|---|-----|-----------|-------------|
| 21 | [Auction Lane Planner](#app-21-auction-lane-planner) | `auction-lane-planner` | Lane planning grid, consignment pipeline, buyer targeting, run-list VIN pricer. |

### Lender Sales App

| # | App | Tool Name | Description |
|---|-----|-----------|-------------|
| 22 | [Territory Pipeline](#app-22-territory-pipeline) | `territory-pipeline` | Territory state map, dealer prospect ranking, profile cards with call prep, pipeline funnel. |

### Cross-Segment App

| # | App | Tool Name | Description |
|---|-----|-----------|-------------|
| 23 | [EV Market Monitor](#app-23-ev-market-monitor) | `ev-market-monitor` | EV adoption trends, price parity tracker, brand leaderboard, state penetration, depreciation comparison. |

---

## App Details

### App 25: Used Car Market Index
**"The stock ticker for cars."**

Track used car prices like Wall Street tracks stocks. Composite market index, segment indices (SUV, Sedan, Truck, EV, Luxury), and individual Make:Model tickers with candlestick-style charts.

- **Canvas line/area chart** with volume bars, crosshair hover, multi-ticker overlay (up to 4)
- **Sector heatmap** — body type × price tier grid colored by price change %
- **Top Gainers / Losers / Most Active** tables
- **Geographic comparison** — state-level pricing for any ticker
- **Watchlist strip** with mini sparklines
- Toggle: Absolute $ ↔ Indexed (base=100), US ↔ UK

### App 7: Trade-In Estimator
**"What's my car worth?"**

Enter VIN + mileage + ZIP + condition → get three value tiers:
1. **Private Party Value** — selling direct
2. **Trade-In Value** — franchise dealer offer
3. **Instant Cash Range** — independent dealer offers

Each with horizontal range bars. Condition cards (Excellent/Good/Fair/Poor) recalculate instantly without API calls. Expandable "How We Got This Number" with sold comp evidence.

### App 5: Deal Evaluator
**"Should I buy this car?"**

Enter a VIN → get a color-coded verdict (Great Deal / Fair / Above Market / Overpriced) with a **Canvas semicircular gauge** showing market position. Three-column layout: This Car specs, Market Context stats, Negotiation Toolkit with suggested offer and leverage points. Scrollable alternative cars row.

### App 6: Car Search & Compare

Visual car shopping with filter chips (body type, fuel, make, year, price, mileage), photo card grid with deal badges, and **side-by-side comparison** of up to 3 cars with auto-highlighted winner.

### App 1: Appraiser Workbench

Three-panel valuation studio:
- **Left:** Retail + wholesale predictions with range bars and % of MSRP
- **Center:** Tabbed Active Comps / Sold Comps (color-coded tables) / History (Canvas stepped line chart)
- **Right:** Full vehicle spec card from VIN decode

### App 8: Lot Pricing Dashboard

Weekly dealer workflow. Full inventory with market price gaps (DROP/HOLD/RAISE badges), aging heatmap (DOM buckets), floor plan burn calculator, and stocking hot list with D/S ratios.

### App 13: Earnings Signal Dashboard

Pre-earnings channel check for auto tickers (F, GM, TM, TSLA, etc.). 6-dimension signal matrix (Volume, Pricing, Inventory, DOM, EV, Mix) with Canvas sparklines and individual BULL/BEAR badges. Composite signal + bull/bear scenario panel.

### App 18: Claims Valuation Workbench

Insurance total-loss determination. Enter VIN + damage severity + condition → get verdict banner (NOT TOTAL LOSS / LIKELY / TOTAL LOSS), settlement range bar (25th–75th percentile), comparable evidence table, regional variance, and replacement vehicle options.

---

## Architecture

```
marketcheck-mcp-apps/
├── package.json                    # Monorepo root (npm workspaces)
├── tsconfig.base.json              # Shared TypeScript config
├── scripts/build-apps.mjs          # Builds all 25 app UIs
├── packages/
│   ├── shared/                     # Shared utilities
│   │   └── src/
│   │       ├── types.ts            # Common TypeScript types
│   │       ├── formatters.ts       # Currency, percent, signal classifiers
│   │       ├── index-calculator.ts # Index computation, depreciation, D/S ratio
│   │       ├── marketcheck-client.ts # Typed MarketCheck API wrapper
│   │       └── app-template.ts     # Shared UI components (KPI cards, tables, badges)
│   ├── server/                     # MCP server (all 25 tools)
│   │   └── src/
│   │       ├── index.ts            # Express + MCP server, registers all tools
│   │       ├── register-app.ts     # Helper to register tool + UI resource pairs
│   │       └── tools/              # 25 tool handler files
│   └── apps/                       # 25 app UI folders
│       ├── used-car-market-index/
│       │   ├── package.json
│       │   ├── vite.config.ts
│       │   ├── index.html
│       │   ├── src/main.ts         # Full app UI code
│       │   └── dist/index.html     # Built single-file HTML bundle
│       ├── trade-in-estimator/
│       ├── deal-evaluator/
│       └── ... (22 more)
```

### How it works

1. The **MCP server** registers 25 tools, each with a `_meta.ui.resourceUri` pointing to a `ui://` resource
2. When a host (Claude, VS Code, etc.) calls a tool, it also fetches the UI resource — a **single-file HTML bundle** containing the entire app
3. The app renders in a **sandboxed iframe** inside the host
4. The app calls `app.callServerTool()` for data and `app.updateModelContext()` to push results back to the LLM
5. All apps include **mock data fallback** so they work even without a live MarketCheck API key

### Tech stack

- **Server:** `@modelcontextprotocol/sdk` + `@modelcontextprotocol/ext-apps` + Express
- **UI:** Vanilla TypeScript + Canvas 2D API (no chart libraries) + `@modelcontextprotocol/ext-apps` App class
- **Build:** Vite + `vite-plugin-singlefile` → single HTML file per app (~400KB, ~98KB gzipped)
- **Data:** MarketCheck API (9 endpoints: VIN decode, price prediction, active/sold search, listing history, sold summary, OEM incentives, UK markets)

---

## Embedding Apps in Your Portal

Embed any app as an iframe in your website. For security, use **OAuth access tokens** (not API keys) — tokens expire in 6 hours and can be revoked.

### Step 1: Generate an OAuth Access Token

Exchange your API key + client secret for a short-lived token (server-side):

```bash
curl -X POST https://api.marketcheck.com/oauth2/token \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"client_credentials","client_id":"YOUR_API_KEY","client_secret":"YOUR_SECRET"}'
```

### Step 2: Embed with the Token

```html
<iframe
  src="https://your-domain.com/apps/deal-evaluator/dist/index.html?access_token=TOKEN&embed=true&vin=5TDJSKFC2NS055758"
  width="100%" height="700"
  style="border:none;border-radius:8px;"
></iframe>
```

### URL Parameters

| Param | Description |
|-------|-------------|
| `access_token` | OAuth token (secure, 6hr TTL) |
| `api_key` | API key (for personal/internal use only) |
| `embed=true` | Hides chrome, full-bleed layout, auto-executes |
| `vin` | Pre-populate VIN field |
| `zip` | Pre-populate ZIP code |
| `make`, `model` | Pre-populate vehicle selection |
| `miles` | Pre-populate mileage |
| `state` | Pre-populate state |

### Security

| Auth Method | Exposure Risk | Recommended For |
|-------------|---------------|-----------------|
| OAuth Access Token | Low (6hr TTL, revocable) | Iframe embedding |
| API Key in URL | Medium (doesn't expire) | Internal/personal use only |
| API Key in server env | None | MCP server mode |

Generate credentials at [developers.marketcheck.com/api-keys](https://developers.marketcheck.com/api-keys)

---

## Deployment

### Environment Variables

```bash
MARKETCHECK_API_KEY=your_api_key    # Required for MCP mode live data
MC_API_BASE=https://mc-api.marketcheck.com/v2  # Default
PORT=3001                           # Server port (default 3001)
```

### Option 1: Vercel (recommended for serverless)

Yes — these apps can be hosted on Vercel. The server uses stateless HTTP mode (`sessionIdGenerator: undefined`), which is compatible with Vercel's serverless functions.

```bash
npm install -g vercel
```

Create `vercel.json` in the project root:

```json
{
  "buildCommand": "npm run build",
  "functions": {
    "api/mcp.ts": {
      "maxDuration": 30
    }
  },
  "rewrites": [
    { "source": "/mcp", "destination": "/api/mcp" }
  ]
}
```

Create `api/mcp.ts`:

```typescript
import type { VercelRequest, VercelResponse } from "@vercel/node";
// Import and initialize your MCP server here
// Handle req/res with StreamableHTTPServerTransport
```

Then deploy:

```bash
vercel --prod
```

> **Note:** Each tool call is a single HTTP POST → response cycle, which fits Vercel's serverless model well. The 30-second timeout is sufficient for most tools. Set `MARKETCHECK_API_KEY` in Vercel's environment variables.

### Option 2: Google Cloud Run (container)

```bash
# Build container
docker build -t marketcheck-mcp-apps .
docker tag marketcheck-mcp-apps gcr.io/YOUR_PROJECT/marketcheck-mcp-apps

# Push and deploy
docker push gcr.io/YOUR_PROJECT/marketcheck-mcp-apps
gcloud run deploy marketcheck-mcp-apps \
  --image gcr.io/YOUR_PROJECT/marketcheck-mcp-apps \
  --port 3001 \
  --set-env-vars MARKETCHECK_API_KEY=your_key \
  --allow-unauthenticated
```

### Option 3: Railway / Render / Fly.io

Any platform that supports Node.js:

```bash
# Railway
railway up

# Render — set build command: npm run build
# Start command: npm run serve

# Fly.io
fly launch
fly deploy
```

### Option 4: Self-hosted (VPS, EC2, etc.)

```bash
npm install && npm run build
PORT=3001 MARKETCHECK_API_KEY=your_key npm run serve
```

### Do I need to host on cloud?

**For personal/local use:** No. Run `npm run serve` locally and use `cloudflared` tunnel to connect to Claude. The apps work fully offline with mock data too.

**For team/production use:** Yes, host on any cloud platform. The server is a standard HTTP service — no WebSockets, no sessions, no state. Any platform that can run a Node.js HTTP server works.

**The apps themselves don't need separate hosting.** They're served as MCP resources from the server — the HTML is bundled into the server response. You only host the single MCP server.

---

## MarketCheck API Tools

The server wraps these MarketCheck API endpoints as MCP tools:

| Tool | Endpoint | Purpose |
|------|----------|---------|
| `decode_vin_neovin` | `POST /decode/neovin` | VIN → full specs (year, make, model, trim, MSRP, engine, etc.) |
| `predict_price_with_comparables` | `GET /pricing/predict` | ML price prediction with comparable vehicle citations |
| `search_active_cars` | `GET /search/car/active` | Current dealer listings with 100+ filters, stats, facets |
| `search_past_90_days` | `GET /search/car/past90` | Recently sold/expired listings for transaction evidence |
| `get_car_history` | `GET /history/listings` | Full listing timeline for a VIN across dealers |
| `get_sold_summary` | `GET /api/v1/sold-vehicles/summary` | Aggregated sold data with ranking/grouping dimensions |
| `search_oem_incentives_by_zip` | `GET /incentives/by-zip` | Manufacturer incentives by ZIP code |
| `search_uk_active_cars` | `GET /search/car/uk/active` | UK market active listings |
| `search_uk_recent_cars` | `GET /search/car/uk/recents` | UK market recent/sold listings |

---

## MCP Host Compatibility

MCP Apps are supported by:
- [Claude](https://claude.ai) (web) and [Claude Desktop](https://claude.ai/download)
- [VS Code GitHub Copilot](https://code.visualstudio.com/)
- [Goose](https://block.github.io/goose/)
- [Postman](https://postman.com)
- [MCPJam](https://www.mcpjam.com/)

---

## Development

### Build a single app

```bash
cd packages/apps/deal-evaluator
npx vite build
```

### Build all apps

```bash
npm run build
```

### Add a new app

1. Create `packages/apps/my-new-app/` with `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`
2. Create `packages/server/src/tools/my-new-app.ts` with the tool handler
3. Import and register in `packages/server/src/index.ts`
4. Run `npm install && npm run build`

### Project stats

| Metric | Value |
|--------|-------|
| Total apps | 25 |
| Total TypeScript lines | ~24,000 |
| Source files | 163 |
| Built HTML bundles | 25 (~400KB each, ~98KB gzipped) |
| External chart libraries | 0 (all Canvas 2D) |
| Mock data | Every app has full offline fallback |

---

## License

MIT
