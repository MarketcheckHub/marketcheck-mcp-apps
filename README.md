# MarketCheck API & MCP Apps

<img src="https://34682200.delivery.rocketcdn.me/wp-content/uploads/2024/05/cropped-MC-Icon.png.webp" alt="MarketCheck" width="48" align="left" style="margin-right:12px;" />

**45 interactive automotive market intelligence dashboards + 7 AI chat demos** — usable as MCP UI Apps inside AI assistants, as a standalone web showcase, as embeddable iframe widgets, or as conversational AI chat interfaces.

Powered by [MarketCheck](https://www.marketcheck.com/) real-time automotive data — VIN decoding, ML price predictions, active/sold inventory, and aggregated market analytics. The chat demos showcase the same API capabilities through 7 different chat SDKs.

**Live demo:** [apps.marketcheck.com](https://apps.marketcheck.com)

---

## 4 Ways to Use

| Mode | Description | Auth Required |
|------|-------------|---------------|
| **Demo** | Browse all 45 apps with realistic sample data | None |
| **Live Data** | Enter your MarketCheck API key for real market data | API Key (entered in the app UI) |
| **Embed** | Embed apps in your website/portal via iframe | OAuth Access Token (secure, 6hr TTL) |
| **MCP / AI** | Use inside Claude, VS Code Copilot, Goose, and other MCP hosts | API Key (server-side env var) |

Don't have an API key? [Sign up free at developers.marketcheck.com](https://developers.marketcheck.com)

---

## Quick Start

### Live Demo (hosted)

Visit [apps.marketcheck.com](https://apps.marketcheck.com) — all 45 apps are available in demo mode. Enter your API key in the settings gear to switch to live data.

### Self-hosted

```bash
# Install dependencies
npm install

# Build everything (gallery + 45 apps + server)
npm run build

# Start the server
npm run serve
```

Then open:
- **Gallery:** http://localhost:3001/ — browse all 45 apps
- **MCP endpoint:** http://localhost:3001/mcp — for AI assistant connectors
- **Any app directly:** http://localhost:3001/apps/{app-name}/dist/index.html

### Demo Mode (no server needed)

Open any built HTML file directly in your browser — all apps have mock data:

```bash
open packages/apps/vin-market-report/dist/index.html
open packages/apps/deal-evaluator/dist/index.html
open packages/apps/car-search-app/dist/index.html
```

---

## Connecting as an MCP Server

### MCP Server URL

If hosted at `apps.marketcheck.com`:

```
https://apps.marketcheck.com/mcp
```

### Authentication for MCP Mode

There are **two ways** to authenticate:

#### Option 1: API key in the MCP URL (recommended for individual users)

Pass your MarketCheck API key as a query parameter on the MCP URL:

```
https://apps.marketcheck.com/mcp?api_key=YOUR_API_KEY
```

This lets each user provide their own key. No server configuration needed.

#### Option 2: Server-side environment variable (recommended for shared/hosted deployments)

Set `MARKETCHECK_API_KEY` on the server. All connected MCP clients share this key automatically — users don't need to provide one.

```bash
MARKETCHECK_API_KEY=your_api_key npm run serve
```

**Priority order:** If a client provides `?api_key=` in the URL, it takes precedence over the server env var for that request. If no URL key is provided, the env var is used as fallback.

Don't have an API key? [Sign up free at developers.marketcheck.com](https://developers.marketcheck.com)

### Setting up in Claude

1. Go to **Settings → Connectors → Add Custom Connector**
2. Enter the MCP server URL:
   - With your own key: `https://apps.marketcheck.com/mcp?api_key=YOUR_API_KEY`
   - Without key (uses server default): `https://apps.marketcheck.com/mcp`
3. Start a new chat and ask Claude to use any tool (e.g. "Evaluate this deal: VIN 5TDJSKFC2NS055758")

> Custom connectors require a paid Claude plan (Pro, Max, or Team).

### Setting up in Claude Code / VS Code / Other MCP Clients

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "marketcheck-apps": {
      "url": "https://apps.marketcheck.com/mcp?api_key=YOUR_API_KEY"
    }
  }
}
```

Or without a personal key (server provides its own):

```json
{
  "mcpServers": {
    "marketcheck-apps": {
      "url": "https://apps.marketcheck.com/mcp"
    }
  }
}
```

### How is this different from the MarketCheck MCP Data Server?

MarketCheck offers **two separate MCP servers**:

| Server | Purpose | Tools |
|--------|---------|-------|
| **MarketCheck MCP Data Server** | Raw API access — search, decode, predict, etc. | `search_active_cars`, `decode_vin_neovin`, `predict_price_with_comparables`, etc. |
| **MarketCheck MCP Apps** (this project) | Interactive dashboards with visual UI | `evaluate-deal`, `estimate-trade-in`, `generate-vin-market-report`, etc. |

**Key differences:**
- The **Data Server** returns raw JSON data — the AI model processes and presents it
- The **Apps Server** returns interactive HTML dashboards that render in the MCP host's UI panel — the user can interact with charts, tables, and filters directly
- The Apps Server **calls the same MarketCheck APIs** under the hood, but wraps them in rich visual interfaces
- You can use **both servers simultaneously** — they have different tool names and don't conflict

**You do NOT need the Data Server to use the Apps Server.** Each is independent. The Apps Server has its own server-side API key and makes its own API calls.

---

## All 52 Apps

### Consumer (9 apps)

| App | Tool Name | Description |
|-----|-----------|-------------|
| [VIN Market Report](packages/apps/vin-market-report/) | `generate-vin-market-report` | Complete VIN-based market intelligence report — embeddable widget |
| [Car Search & Compare](packages/apps/car-search-compare/) | `search-cars`, `compare-cars` | Visual car shopping with filters, photo cards, and side-by-side comparison |
| [Car Search](packages/apps/car-search-app/) | — | Full search with SERP, vehicle details, and natural language search |
| [Deal Evaluator](packages/apps/deal-evaluator/) | `evaluate-deal` | Buy/Negotiate/Pass verdict with gauge, negotiation toolkit, and alternatives |
| [Incentive-Adjusted Deal Evaluator](packages/apps/incentive-adjusted-deal-eval/) | `evaluate-incentive-deal` | True out-of-pocket cost after rebates and APR savings |
| [Trade-In Estimator](packages/apps/trade-in-estimator/) | `estimate-trade-in` | Instant 3-tier trade-in value with sold comp evidence |
| [Used Car Market Index](packages/apps/used-car-market-index/) | `get-market-index` | Stock-ticker-style dashboard tracking used car prices ⚠️ *Enterprise API* |
| [OEM Incentives Explorer](packages/apps/oem-incentives-explorer/) | `oem-incentives-explorer` | Cash back, APR, and lease deals by ZIP |
| [Incentive Deal Finder](packages/apps/incentive-deal-finder/) | `find-incentive-deals` | Search ALL OEM incentives by budget, not by brand |

### Dealer (5 apps)

| App | Tool Name | Description |
|-----|-----------|-------------|
| [Lot Pricing Dashboard](packages/apps/lot-pricing-dashboard/) | `scan-lot-pricing` | Full lot inventory with market price gaps, aging heatmap, stocking hot list |
| [Stocking Intelligence](packages/apps/stocking-intelligence/) | `stocking-intelligence` | Demand heatmap, buy/avoid lists, VIN checker |
| [Pricing Transparency Report](packages/apps/pricing-transparency-report/) | `generate-pricing-report` | Shareable market report dealers give buyers |
| [Dealer Inventory Fit Scorer](packages/apps/dealer-inventory-fit-scorer/) | `score-dealer-fit` | Which cars match your sales DNA? ML-scored acquisitions |
| [Dealer Conquest Analyzer](packages/apps/dealer-conquest-analyzer/) | `analyze-dealer-conquest` | Find competitors' best-sellers you should stock |

### Appraiser (4 apps)

| App | Tool Name | Description |
|-----|-----------|-------------|
| [Appraiser Workbench](packages/apps/appraiser-workbench/) | `appraiser-workbench` | Complete vehicle valuation studio |
| [Comparables Explorer](packages/apps/comparables-explorer/) | `comparables-explorer` | Price distribution and market positioning |
| [Depreciation Analyzer](packages/apps/depreciation-analyzer/) | `depreciation-analyzer` | Track how vehicles lose value over time |
| [Market Trends Dashboard](packages/apps/market-trends-dashboard/) | `market-trends-dashboard` | The pulse of the automotive market |

### Dealership Group (3 apps)

| App | Tool Name | Description |
|-----|-----------|-------------|
| [Group Operations Center](packages/apps/group-operations-center/) | `group-operations-center` | Every store, one screen |
| [Inventory Balancer](packages/apps/inventory-balancer/) | `inventory-balancer` | Move the right cars to the right stores |
| [Location Benchmarking](packages/apps/location-benchmarking/) | `location-benchmarking` | Rank and compare your locations |

### Lender (4 apps)

| App | Tool Name | Description |
|-----|-----------|-------------|
| [Underwriting Decision Support](packages/apps/underwriting-decision-support/) | `evaluate-loan-application` | Single-loan collateral valuation with LTV forecast |
| [Portfolio Risk Monitor](packages/apps/portfolio-risk-monitor/) | `portfolio-risk-monitor` | Track collateral health across your loan book |
| [Lender Portfolio Stress Test](packages/apps/lender-portfolio-stress-test/) | `stress-test-portfolio` | What-if depreciation scenarios on your loan book |
| [EV Collateral Risk Monitor](packages/apps/ev-collateral-risk/) | `ev-collateral-risk` | EV vs ICE depreciation risk tracking |

### Analyst (3 apps)

| App | Tool Name | Description |
|-----|-----------|-------------|
| [Earnings Signal Dashboard](packages/apps/earnings-signal-dashboard/) | `earnings-signal-dashboard` | Pre-earnings channel check for auto tickers |
| [Watchlist Monitor](packages/apps/watchlist-monitor/) | `watchlist-monitor` | Morning signal scan across your portfolio |
| [Dealer Group Scorecard](packages/apps/dealer-group-scorecard/) | `dealer-group-scorecard` | Benchmark public dealer groups |

### Insurer (2 apps)

| App | Tool Name | Description |
|-----|-----------|-------------|
| [Claims Valuation Workbench](packages/apps/claims-valuation-workbench/) | `claims-valuation` | Total-loss determination with market evidence |
| [Insurance Premium Benchmarker](packages/apps/insurance-premium-benchmarker/) | `benchmark-insurance-premiums` | Segment-level replacement cost and risk analysis |

### Manufacturer (2 apps)

| App | Tool Name | Description |
|-----|-----------|-------------|
| [Brand Command Center](packages/apps/brand-command-center/) | `brand-command-center` | Your brands vs the competition |
| [Regional Demand Allocator](packages/apps/regional-demand-allocator/) | `regional-demand-allocator` | Allocate inventory where demand is hottest |

### Auction House (2 apps)

| App | Tool Name | Description |
|-----|-----------|-------------|
| [Auction Lane Planner](packages/apps/auction-lane-planner/) | `auction-lane-planner` | Plan lanes, price consignments, target buyers |
| [Auction Arbitrage Finder](packages/apps/auction-arbitrage-finder/) | `find-auction-arbitrage` | Wholesale vs retail spread — find profit opportunities |

### Wholesaler (1 app)

| App | Tool Name | Description |
|-----|-----------|-------------|
| [Wholesale Vehicle Router](packages/apps/wholesale-vehicle-router/) | `route-wholesale-vehicles` | Paste VINs, get dealer-match rankings |

### Cross-Segment (4 apps)

| App | Tool Name | Description |
|-----|-----------|-------------|
| [EV Market Monitor](packages/apps/ev-market-monitor/) | `ev-market-monitor` | The EV transition in one dashboard |
| [VIN History Detective](packages/apps/vin-history-detective/) | `trace-vin-history` | Full listing timeline — dealer hops, price changes, red flags |
| [Market Anomaly Detector](packages/apps/market-anomaly-detector/) | `detect-market-anomalies` | Find underpriced vehicles and pricing outliers |
| [UK Market Trends](packages/apps/uk-market-trends/) | `get-uk-market-trends` | Macro UK automotive market intelligence |

### Consumer UK (1 app)

| App | Tool Name | Description |
|-----|-----------|-------------|
| [UK Market Explorer](packages/apps/uk-market-explorer/) | `search-uk-cars` | Search and compare UK car listings in GBP |

### Dealer UK (1 app)

| App | Tool Name | Description |
|-----|-----------|-------------|
| [UK Dealer Pricing](packages/apps/uk-dealer-pricing/) | `scan-uk-lot-pricing` | UK lot inventory priced against the market |

### Auto Media (1 app)

| App | Tool Name | Description |
|-----|-----------|-------------|
| [Auto Journalist Briefing](packages/apps/auto-journalist-briefing/) | `generate-market-briefing` | One-page market briefing with quotable data points |

### Fleet Manager (1 app)

| App | Tool Name | Description |
|-----|-----------|-------------|
| [Fleet Lifecycle Manager](packages/apps/fleet-lifecycle-manager/) | `manage-fleet-lifecycle` | Fleet values, depreciation, and replacement planning |

### Rental/Subscription (1 app)

| App | Tool Name | Description |
|-----|-----------|-------------|
| [Rental Fleet Valuator](packages/apps/rental-fleet-valuator/) | `value-rental-fleet` | Mileage-adjusted fleet valuation with rotation timing |

### Lender Sales (1 app)

| App | Tool Name | Description |
|-----|-----------|-------------|
| [Territory Pipeline](packages/apps/territory-pipeline/) | `territory-pipeline` | Find dealers who need floor plan |

### Chat Demos (7 apps)

Each chat demo uses a different SDK to showcase MarketCheck API capabilities through conversational AI interfaces:

| App | SDK | Language | Description |
|-----|-----|----------|-------------|
| [AI Car Advisor](packages/apps/chat-vercel-ai/) | [Vercel AI SDK](https://ai-sdk.dev/) | TypeScript/Next.js | Reference chat with `useChat` hook, streaming, and tool visualization |
| [Dashboard Copilot](packages/apps/chat-copilotkit/) | [CopilotKit](https://copilotkit.ai/) | React/Next.js | AI copilot overlay on existing dashboard UI |
| [MarketCheck Chat](packages/apps/chat-assistant-ui/) | [assistant-ui](https://assistant-ui.com/) | React/Next.js | Custom-branded noir theme with rich tool result cards |
| [Multi-Platform Bot](packages/apps/chat-sdk-bot/) | [Chat SDK](https://chat-sdk.dev/) | TypeScript | Single codebase deploys to Slack, Discord, Telegram, Teams |
| [Market Analyst](packages/apps/chat-chainlit/) | [Chainlit](https://chainlit.io/) | Python | MCP-native chat with built-in tool execution visualization |
| [Quick Market Check](packages/apps/chat-streamlit/) | [Streamlit](https://streamlit.io/) | Python | Lightweight chat for data teams |
| [AI Agent Explorer](packages/apps/chat-langchain/) | [LangChain](https://langchain.com/) | TypeScript/Next.js | LangGraph ReAct agent with visible reasoning chains |

#### Running Chat Demos

**TypeScript apps (Vercel AI SDK, CopilotKit, assistant-ui, LangChain):**

```bash
cd packages/chat/vercel-ai-chat   # or copilotkit-chat, assistant-ui-chat, langchain-agent-chat
cp .env.local.example .env.local  # Add your ANTHROPIC_API_KEY and MARKETCHECK_API_KEY
npm install
npm run dev
```

**Python apps (Chainlit, Streamlit):**

```bash
cd packages/chat/chainlit-chat    # or streamlit-chat
cp .env.example .env              # Add your keys
pip install -r requirements.txt

# Chainlit:
chainlit run app.py -w

# Streamlit:
streamlit run app.py
```

**Chat SDK Bot (Slack/Discord/Telegram):**

```bash
cd packages/chat/chat-sdk-bot
cp .env.example .env              # Add API keys + platform bot tokens
npm install
npm run dev
```

---

## API Access Modes

Apps support three data access paths, tried in order:

### 1. MCP Mode (AI assistants)

When running inside an MCP host (Claude, VS Code, etc.), apps call `_safeApp.callServerTool()` which routes through the MCP server. The server uses its `MARKETCHECK_API_KEY` env var — users don't provide a key.

### 2. Direct API Mode (web/embed)

When loaded in a browser with an API key, apps call the MarketCheck API **directly** from the browser:

```
Browser → https://api.marketcheck.com/v2/search/car/active?api_key=KEY&...
```

No proxy or server needed. The MarketCheck API supports CORS (`Access-Control-Allow-Origin: *`).

To use: enter your API key in the app's settings gear, or pass it as a URL parameter:

```
https://apps.marketcheck.com/apps/deal-evaluator/dist/index.html?api_key=YOUR_KEY
```

### 3. Demo Mode (no auth)

If no API key is available, apps display realistic mock data. Every app works fully offline.

---

## Embedding Apps in Your Portal

Embed any app as an iframe in your website.

### Option A: API Key (simple, for internal use)

```html
<iframe
  src="https://apps.marketcheck.com/apps/deal-evaluator/dist/index.html?api_key=YOUR_KEY&embed=true&vin=5TDJSKFC2NS055758"
  width="100%" height="700"
  style="border:none;border-radius:8px;"
></iframe>
```

### Option B: OAuth Token (recommended for production)

Exchange your API key + client secret for a short-lived token (server-side):

```bash
curl -X POST https://api.marketcheck.com/oauth2/token \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"client_credentials","client_id":"YOUR_API_KEY","client_secret":"YOUR_SECRET"}'
```

Then embed with the token:

```html
<iframe
  src="https://apps.marketcheck.com/apps/deal-evaluator/dist/index.html?access_token=TOKEN&embed=true&vin=5TDJSKFC2NS055758"
  width="100%" height="700"
  style="border:none;border-radius:8px;"
></iframe>
```

### URL Parameters

| Param | Description |
|-------|-------------|
| `access_token` | OAuth token (secure, 6hr TTL) |
| `api_key` | API key (for personal/internal use) |
| `embed=true` | Hides chrome, full-bleed layout, auto-executes |
| `vin` | Pre-populate VIN field |
| `zip` | Pre-populate ZIP code |
| `make`, `model` | Pre-populate vehicle selection |
| `miles` | Pre-populate mileage |
| `state` | Pre-populate state |
| `compact=true` | Widget mode (VIN Market Report only) |

---

## Architecture

```
marketcheck-api-mcp-apps/
├── package.json                    # Monorepo root (npm workspaces)
├── packages/
│   ├── shared/                     # Shared utilities & types
│   │   └── src/
│   │       ├── types.ts            # Common TypeScript types
│   │       ├── formatters.ts       # Currency, percent, signal classifiers
│   │       ├── index-calculator.ts # Index computation, depreciation, D/S ratio
│   │       └── marketcheck-client.ts # Typed MarketCheck API wrapper (server-side)
│   ├── server/                     # MCP server (44 tools)
│   │   └── src/
│   │       ├── index.ts            # Express + MCP server
│   │       ├── register-app.ts     # Helper to register tool + UI resource pairs
│   │       ├── proxy.ts            # CORS proxy for legacy/fallback mode
│   │       └── tools/              # 44 tool handler files
│   ├── gallery/                    # Web gallery UI
│   ├── apps/                       # 45 app UI folders
│   │   ├── vin-market-report/
│   │   │   ├── src/main.ts         # Full app UI + direct API client
│   │   │   └── dist/index.html     # Built single-file HTML bundle
│   │   └── ... (44 more)
│   └── chat/                       # 7 AI chat demo apps
│       ├── shared/                 # Shared tool definitions & prompts
│       ├── vercel-ai-chat/         # Next.js + Vercel AI SDK
│       ├── copilotkit-chat/        # Next.js + CopilotKit
│       ├── assistant-ui-chat/      # Next.js + assistant-ui
│       ├── chat-sdk-bot/           # Multi-platform bot (Slack/Discord/Telegram)
│       ├── chainlit-chat/          # Python + Chainlit
│       ├── streamlit-chat/         # Python + Streamlit
│       └── langchain-agent-chat/   # Next.js + LangGraph
├── public/                         # Vercel deployment output
├── static/screenshots/             # App screenshots for gallery
└── scripts/                        # Build & migration utilities
```

### How it works

1. The **MCP server** registers 44 tools, each with a `_meta.ui.resourceUri` pointing to a `ui://` resource
2. When an MCP host (Claude, VS Code, etc.) calls a tool, it also fetches the UI resource — a **single-file HTML bundle**
3. The app renders in a **sandboxed iframe** inside the host
4. The app calls `app.callServerTool()` for data and `app.updateModelContext()` to push results back to the LLM
5. In web mode, apps call the **MarketCheck API directly** from the browser (no proxy needed)
6. All apps include **mock data fallback** for demo mode

### Tech stack

- **Server:** `@modelcontextprotocol/sdk` + `@modelcontextprotocol/ext-apps` + Express
- **UI:** Vanilla TypeScript + Canvas 2D API (no chart libraries)
- **Build:** Vite + `vite-plugin-singlefile` → single HTML file per app
- **Data:** MarketCheck API (12 endpoints: VIN decode, price prediction, active/sold search, listing history, sold summary, OEM incentives, dealer/vehicle ranking, UK markets)

### MarketCheck API Endpoints

| Endpoint | Path | Purpose |
|----------|------|---------|
| VIN Decode | `GET /v2/decode/car/neovin/{vin}/specs` | VIN to full vehicle specs |
| Price Predict | `GET /v2/predict/car/us/marketcheck_price/comparables` | ML price prediction + comparables |
| Search Active | `GET /v2/search/car/active` | Current dealer listings with filters |
| Search Recent | `GET /v2/search/car/recents` | Recently sold/expired listings |
| Car History | `GET /v2/history/car/{vin}` | Listing timeline for a VIN |
| Sold Summary | `GET /api/v1/sold-vehicles/summary` | Aggregated market analytics |
| OEM Incentives | `GET /v2/incentives/by-zip` | Manufacturer incentives by ZIP |
| Rank Dealers | `GET /v2/rank/dealers` | Dealer-vehicle match scoring |
| Rank Vehicles | `GET /v2/rank/vehicles` | Vehicle-dealer fit scoring |
| UK Active | `GET /v2/search/car/uk/active` | UK market active listings |
| UK Recent | `GET /v2/search/car/uk/recents` | UK market recent listings |

---

## Deployment

### Hosted at apps.marketcheck.com

The production instance is hosted at [apps.marketcheck.com](https://apps.marketcheck.com).

- **Gallery:** `https://apps.marketcheck.com/`
- **MCP endpoint:** `https://apps.marketcheck.com/mcp`
- **Individual app:** `https://apps.marketcheck.com/apps/{app-name}/dist/index.html`
- **Health check:** `https://apps.marketcheck.com/health`

### Environment Variables

```bash
MARKETCHECK_API_KEY=your_api_key    # Required for MCP mode
PORT=3001                           # Server port (default 3001)
```

### Self-hosting Options

**Vercel (recommended for serverless):**

```bash
npx vercel --prod
```

**Docker / Cloud Run / Railway / Render / Fly.io:**

```bash
npm install && npm run build
PORT=3001 MARKETCHECK_API_KEY=your_key npm run serve
```

---

## MCP Host Compatibility

MCP Apps are supported by:
- [Claude](https://claude.ai) (web) and [Claude Desktop](https://claude.ai/download)
- [Claude Code](https://claude.ai/code) (CLI and VS Code extension)
- [VS Code GitHub Copilot](https://code.visualstudio.com/)
- [Goose](https://block.github.io/goose/)
- [Postman](https://postman.com)
- [MCPJam](https://www.mcpjam.com/)

---

## Development

### Build all apps

```bash
npm run build
```

### Build a single app

```bash
cd packages/apps/deal-evaluator
npx vite build
```

### Add a new app

1. Create `packages/apps/my-new-app/` with `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`
2. Create `packages/server/src/tools/my-new-app.ts` with the tool handler
3. Add to `packages/server/src/index.ts` toolModules array
4. Add to `packages/gallery/src/main.ts` APPS array
5. Run `npm install && npm run build`

### Project stats

| Metric | Value |
|--------|-------|
| Total apps | 45 dashboard apps + 7 chat demos |
| Segments | 18 (including Chat Demos) |
| API endpoints used | 12 |
| Built HTML bundles | 45 (~400KB each, ~98KB gzipped) |
| External chart libraries | 0 (all Canvas 2D) |
| Mock data | Every app has full offline fallback |

---

## License

MIT
