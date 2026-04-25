// ── MarketCheck Apps Gallery ────────────────────────────────────────────
// "Command Center Noir" — Bloomberg meets Porsche Design

// ── Data ────────────────────────────────────────────────────────────────

interface AppDef {
  id: string;
  name: string;
  tagline: string;
  segment: string;
}

const SEGMENTS: { name: string; color: string; icon: string }[] = [
  { name: "Consumer", color: "#10b981", icon: "&#9733;" },
  { name: "Dealer", color: "#f59e0b", icon: "&#9881;" },
  { name: "Appraiser", color: "#3b82f6", icon: "&#9878;" },
  { name: "Dealership Group", color: "#f97316", icon: "&#9632;" },
  { name: "Lender", color: "#06b6d4", icon: "&#9670;" },
  { name: "Analyst", color: "#8b5cf6", icon: "&#9650;" },
  { name: "Insurer", color: "#ec4899", icon: "&#9829;" },
  { name: "Manufacturer", color: "#ef4444", icon: "&#9733;" },
  { name: "Auction House", color: "#84cc16", icon: "&#9654;" },
  { name: "Wholesaler", color: "#78716c", icon: "&#9670;" },
  { name: "Cross-Segment", color: "#a78bfa", icon: "&#8854;" },
  { name: "Auto Media", color: "#d946ef", icon: "&#9998;" },
  { name: "Fleet Manager", color: "#059669", icon: "&#9881;" },
  { name: "Rental/Subscription", color: "#0ea5e9", icon: "&#9670;" },
  { name: "Lender Sales", color: "#14b8a6", icon: "&#8599;" },
  { name: "Chat Demos", color: "#6366f1", icon: "&#128172;" },
];

const APPS: AppDef[] = [
  // ── Consumer (10 apps) ──
  { id: "vin-market-report", name: "VIN Market Report", tagline: "VIN-based market report — embeddable widget like CarStory.ai", segment: "Consumer" },
  { id: "car-search-compare", name: "Car Search & Compare", tagline: "Find and compare cars side by side", segment: "Consumer" },
  { id: "car-search-app", name: "Car Search", tagline: "Full search with SERP, vehicle details, and natural language search", segment: "Consumer" },
  { id: "deal-evaluator", name: "Deal Evaluator", tagline: "Should I buy this car? Get a Buy/Negotiate/Pass verdict", segment: "Consumer" },
  { id: "incentive-adjusted-deal-eval", name: "Incentive-Adjusted Deal Evaluator", tagline: "True out-of-pocket cost after rebates and APR savings", segment: "Consumer" },
  { id: "trade-in-estimator", name: "Trade-In Estimator", tagline: "What's your car worth? 3-tier instant valuation", segment: "Consumer" },
  { id: "used-car-market-index", name: "Used Car Market Index", tagline: "Track prices like Wall Street tracks stocks", segment: "Consumer" },
  { id: "oem-incentives-explorer", name: "OEM Incentives Explorer", tagline: "Cash back, APR, and lease deals by ZIP", segment: "Consumer" },
  { id: "incentive-deal-finder", name: "Incentive Deal Finder", tagline: "Search ALL OEM incentives by budget, not by brand", segment: "Consumer" },
  { id: "uk-market-explorer", name: "UK Market Explorer", tagline: "Search and compare UK car listings in GBP", segment: "Consumer" },

  // ── Dealer (7 apps) ──
  { id: "lot-pricing-dashboard", name: "Lot Pricing Dashboard", tagline: "See your entire lot priced against the market", segment: "Dealer" },
  { id: "stocking-intelligence", name: "Stocking Intelligence", tagline: "Know what to buy at auction", segment: "Dealer" },
  { id: "pricing-transparency-report", name: "Pricing Transparency Report", tagline: "Shareable market report dealers give buyers", segment: "Dealer" },
  { id: "dealer-inventory-fit-scorer", name: "Dealer Inventory Fit Scorer", tagline: "Which cars match your sales DNA?", segment: "Dealer" },
  { id: "dealer-conquest-analyzer", name: "Dealer Conquest Analyzer", tagline: "Find competitors' best-sellers you should stock", segment: "Dealer" },
  { id: "uk-dealer-pricing", name: "UK Dealer Pricing", tagline: "UK lot inventory priced against the market", segment: "Dealer" },
  { id: "deal-finder", name: "Deal Finder", tagline: "Best deals scored by price, DOM, and market position", segment: "Dealer" },

  // ── Appraiser (4 apps) ──
  { id: "appraiser-workbench", name: "Appraiser Workbench", tagline: "Complete vehicle valuation studio", segment: "Appraiser" },
  { id: "comparables-explorer", name: "Comparables Explorer", tagline: "Price distribution and market positioning", segment: "Appraiser" },
  { id: "depreciation-analyzer", name: "Depreciation Analyzer", tagline: "Track how vehicles lose value over time", segment: "Appraiser" },
  { id: "market-trends-dashboard", name: "Market Trends Dashboard", tagline: "The pulse of the automotive market", segment: "Appraiser" },

  // ── Dealership Group (4 apps) ──
  { id: "group-operations-center", name: "Group Operations Center", tagline: "Every store, one screen", segment: "Dealership Group" },
  { id: "inventory-balancer", name: "Inventory Balancer", tagline: "Move the right cars to the right stores", segment: "Dealership Group" },
  { id: "location-benchmarking", name: "Location Benchmarking", tagline: "Rank and compare your locations", segment: "Dealership Group" },
  { id: "group-health-scorecard", name: "Group Health Scorecard", tagline: "0-100 health score per rooftop with alerts", segment: "Dealership Group" },

  // ── Lender (4 apps — ordered by workflow: single loan → portfolio → stress) ──
  { id: "underwriting-decision-support", name: "Underwriting Decision Support", tagline: "Single-loan collateral valuation with LTV forecast", segment: "Lender" },
  { id: "portfolio-risk-monitor", name: "Portfolio Risk Monitor", tagline: "Track collateral health across your loan book", segment: "Lender" },
  { id: "lender-portfolio-stress-test", name: "Lender Portfolio Stress Test", tagline: "What-if depreciation scenarios on your loan book", segment: "Lender" },
  { id: "ev-collateral-risk", name: "EV Collateral Risk Monitor", tagline: "EV vs ICE depreciation risk tracking", segment: "Lender" },

  // ── Analyst (6 apps) ──
  { id: "earnings-signal-dashboard", name: "Earnings Signal Dashboard", tagline: "Pre-earnings channel check for auto tickers", segment: "Analyst" },
  { id: "watchlist-monitor", name: "Watchlist Monitor", tagline: "Morning signal scan across your portfolio", segment: "Analyst" },
  { id: "dealer-group-scorecard", name: "Dealer Group Scorecard", tagline: "Benchmark public dealer groups", segment: "Analyst" },
  { id: "oem-stock-tracker", name: "OEM Stock Tracker", tagline: "Leading indicators for automotive tickers with buy/sell signals", segment: "Analyst" },
  { id: "pricing-power-tracker", name: "Pricing Power Tracker", tagline: "Discount-to-MSRP trends as margin signals", segment: "Analyst" },
  { id: "market-share-analyzer", name: "Market Share Analyzer", tagline: "Brand share with basis-point changes and conquest analysis", segment: "Analyst" },

  // ── Insurer (2 apps) ──
  { id: "claims-valuation-workbench", name: "Claims Valuation Workbench", tagline: "Total-loss determination with market evidence", segment: "Insurer" },
  { id: "insurance-premium-benchmarker", name: "Insurance Premium Benchmarker", tagline: "Segment-level replacement cost and risk analysis", segment: "Insurer" },

  // ── Manufacturer (7 apps) ──
  { id: "brand-command-center", name: "Brand Command Center", tagline: "Your brands vs the competition", segment: "Manufacturer" },
  { id: "regional-demand-allocator", name: "Regional Demand Allocator", tagline: "Allocate inventory where demand is hottest", segment: "Manufacturer" },
  { id: "oem-depreciation-tracker", name: "OEM Depreciation Tracker", tagline: "How fast are your models losing value vs the competition?", segment: "Manufacturer" },
  { id: "ev-transition-monitor", name: "EV Transition Monitor", tagline: "Track your electrification progress against the market", segment: "Manufacturer" },
  { id: "model-contenting-analyzer", name: "Model Contenting Analyzer", tagline: "Which trims and configs are the market buying?", segment: "Manufacturer" },
  { id: "market-momentum-report", name: "Market Momentum Report", tagline: "Monthly market pulse for strategic planning", segment: "Manufacturer" },
  { id: "incentive-effectiveness-dashboard", name: "Incentive Effectiveness Dashboard", tagline: "Are your incentives moving metal?", segment: "Manufacturer" },

  // ── Auction House (5 apps) ──
  { id: "auction-lane-planner", name: "Auction Lane Planner", tagline: "Plan lanes, price consignments, target buyers", segment: "Auction House" },
  { id: "auction-arbitrage-finder", name: "Auction Arbitrage Finder", tagline: "Wholesale vs retail spread — find profit opportunities", segment: "Auction House" },
  { id: "auction-run-list-analyzer", name: "Auction Run List Analyzer", tagline: "Pre-sale VIN evaluation with hammer price predictions", segment: "Auction House" },
  { id: "consignment-sourcer", name: "Consignment Sourcer", tagline: "Find dealers with aged inventory ripe for consignment", segment: "Auction House" },
  { id: "auction-dealer-targeting", name: "Auction Dealer Targeting", tagline: "Identify high-volume buyers in your target market", segment: "Auction House" },

  // ── Wholesaler (1 app) ──
  { id: "wholesale-vehicle-router", name: "Wholesale Vehicle Router", tagline: "Paste VINs, get dealer-match rankings", segment: "Wholesaler" },

  // ── Cross-Segment (4 apps) ──
  { id: "ev-market-monitor", name: "EV Market Monitor", tagline: "The EV transition in one dashboard", segment: "Cross-Segment" },
  { id: "vin-history-detective", name: "VIN History Detective", tagline: "Full listing timeline — dealer hops, price changes, red flags", segment: "Cross-Segment" },
  { id: "market-anomaly-detector", name: "Market Anomaly Detector", tagline: "Find underpriced vehicles and pricing outliers", segment: "Cross-Segment" },
  { id: "uk-market-trends", name: "UK Market Trends", tagline: "Macro UK automotive market intelligence", segment: "Cross-Segment" },

  // ── Auto Media (1 app) ──
  { id: "auto-journalist-briefing", name: "Auto Journalist Briefing", tagline: "One-page market briefing with quotable data points", segment: "Auto Media" },

  // ── Fleet Manager (1 app) ──
  { id: "fleet-lifecycle-manager", name: "Fleet Lifecycle Manager", tagline: "Fleet values, depreciation, and replacement planning", segment: "Fleet Manager" },

  // ── Rental/Subscription (1 app) ──
  { id: "rental-fleet-valuator", name: "Rental Fleet Valuator", tagline: "Mileage-adjusted fleet valuation with rotation timing", segment: "Rental/Subscription" },

  // ── Lender Sales (4 apps) ──
  { id: "territory-pipeline", name: "Territory Pipeline", tagline: "Find dealers who need floor plan", segment: "Lender Sales" },
  { id: "floor-plan-opportunity-scanner", name: "Floor Plan Opportunity Scanner", tagline: "Find dealers with aging inventory who need floor plan financing", segment: "Lender Sales" },
  { id: "dealer-intelligence-brief", name: "Dealer Intelligence Brief", tagline: "Dealer profile data for pitch prep", segment: "Lender Sales" },
  { id: "subprime-opportunity-finder", name: "Subprime Opportunity Finder", tagline: "Identify subprime-heavy dealers for lending products", segment: "Lender Sales" },

  // ── Chat Demos (7 apps — each uses a different chat SDK) ──
  { id: "chat-vercel-ai", name: "AI Car Advisor (Vercel AI SDK)", tagline: "Conversational car shopping with Claude streaming", segment: "Chat Demos" },
  { id: "chat-copilotkit", name: "Dashboard Copilot (CopilotKit)", tagline: "AI copilot overlay on existing dashboards", segment: "Chat Demos" },
  { id: "chat-assistant-ui", name: "MarketCheck Chat (assistant-ui)", tagline: "Custom-branded chat with rich tool result cards", segment: "Chat Demos" },
  { id: "chat-sdk-bot", name: "Multi-Platform Bot (Chat SDK)", tagline: "One bot for Slack, Discord, Telegram, and Teams", segment: "Chat Demos" },
  { id: "chat-chainlit", name: "Market Analyst (Chainlit)", tagline: "Python MCP chat with tool execution visualization", segment: "Chat Demos" },
  { id: "chat-streamlit", name: "Quick Market Check (Streamlit)", tagline: "Lightweight Python chat for data teams", segment: "Chat Demos" },
  { id: "chat-langchain", name: "AI Agent Explorer (LangChain)", tagline: "Autonomous agent with visible reasoning chains", segment: "Chat Demos" },
];

// Apps that are tested and ready for live demo
const READY_APPS = new Set([
  "vin-market-report", "trade-in-estimator", "used-car-market-index",
  "car-search-app",
  "dealer-inventory-fit-scorer", "dealer-conquest-analyzer", "deal-finder",
  "floor-plan-opportunity-scanner", "dealer-intelligence-brief", "subprime-opportunity-finder",
  "chat-vercel-ai", "chat-copilotkit", "chat-assistant-ui", "chat-sdk-bot",
  "chat-chainlit", "chat-streamlit", "chat-langchain",
]);

// ── State ───────────────────────────────────────────────────────────────

function getApiKey(): string | null {
  return localStorage.getItem("mc_api_key");
}
function getAccessToken(): string | null {
  return localStorage.getItem("mc_access_token");
}
function isLive(): boolean {
  return !!(getApiKey() || getAccessToken());
}
function getTheme(): "light" | "dark" {
  return (localStorage.getItem("mc_theme") as "light" | "dark") ?? "light";
}
function setTheme(t: "light" | "dark") {
  localStorage.setItem("mc_theme", t);
  document.documentElement.setAttribute("data-theme", t);
}

// ── Styles ──────────────────────────────────────────────────────────────

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap');

/* ── Light Theme (default) — matching Cowork portal ─────────────── */
:root, [data-theme="light"] {
  --bg: #F4F7FF;
  --surface: #FFFFFF;
  --card: #FFFFFF;
  --border: #D8E3F2;
  --border-light: #EBF0FA;
  --text: #344B68;
  --text-heading: #0B1C3F;
  --muted: #6B7F9E;
  --brand: #1A6FD8;
  --brand-light: #1A8CFF;
  --green: #059669;
  --yellow: #d97706;
  --purple: #7c3aed;
  --red: #dc2626;
  --pink: #db2777;
  --orange: #ea580c;
  --cyan: #0891b2;
  --card-shadow: 0 1px 3px rgba(11, 28, 63, 0.06), 0 4px 16px rgba(11, 28, 63, 0.04);
  --card-hover-shadow: 0 2px 8px rgba(26, 111, 216, 0.12), 0 8px 32px rgba(26, 111, 216, 0.08);
  --hero-gradient-a: rgba(26, 111, 216, 0.1);
  --hero-gradient-b: rgba(6, 106, 171, 0.06);
  --hero-point-color: rgba(26, 111, 216, 0.2);
  --hero-line-color: rgba(26, 111, 216, 0.06);
  --hero-title-gradient: linear-gradient(135deg, #0B1C3F 0%, #1A6FD8 50%, #1A8CFF 100%);
  --badge-demo-bg: rgba(217, 119, 6, 0.1);
  --badge-demo-fg: #b45309;
  --badge-live-bg: rgba(5, 150, 105, 0.1);
  --badge-live-fg: #047857;
  --input-bg: #E8EFFC;
  --scrollbar-thumb: rgba(26, 111, 216, 0.2);
  --scrollbar-track: transparent;
  --nav-shadow: 0 1px 0 #D8E3F2, 0 2px 12px rgba(11, 28, 63, 0.05);
  --font: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --mono: 'JetBrains Mono', 'SF Mono', monospace;
}

/* ── Dark Theme — matching Cowork portal ───────────────────────── */
[data-theme="dark"] {
  --bg: #0B1929;
  --surface: #0F2237;
  --card: #0F2237;
  --border: rgba(26, 140, 255, 0.12);
  --border-light: rgba(26, 140, 255, 0.06);
  --text: #94A3B8;
  --text-heading: #F1F5F9;
  --muted: #64748B;
  --brand: #1A8CFF;
  --brand-light: #6BB3FF;
  --green: #10b981;
  --yellow: #f59e0b;
  --purple: #8b5cf6;
  --red: #ef4444;
  --pink: #ec4899;
  --orange: #f97316;
  --cyan: #06b6d4;
  --card-shadow: none;
  --card-hover-shadow: none;
  --hero-gradient-a: rgba(26, 140, 255, 0.1);
  --hero-gradient-b: rgba(6, 106, 171, 0.05);
  --hero-point-color: rgba(26, 140, 255, 0.3);
  --hero-line-color: rgba(26, 140, 255, 0.04);
  --hero-title-gradient: linear-gradient(135deg, #F1F5F9 0%, #6BB3FF 50%, #1A8CFF 100%);
  --badge-demo-bg: rgba(245, 158, 11, 0.15);
  --badge-demo-fg: #f59e0b;
  --badge-live-bg: rgba(16, 185, 129, 0.15);
  --badge-live-fg: #34d399;
  --input-bg: #081420;
  --scrollbar-thumb: rgba(26, 140, 255, 0.15);
  --scrollbar-track: transparent;
  --nav-shadow: none;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

html {
  scroll-behavior: smooth;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}

body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
  overflow-x: hidden;
}

::selection { background: var(--brand); color: #fff; }

/* ── Hero ─────────────────────────────────── */

/* ── Hero — Cowork-style grid bg ─────── */
.hero {
  position: relative;
  min-height: 80vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 100px 24px 60px;
  overflow: hidden;
  background:
    radial-gradient(ellipse 80% 50% at 50% -20%, var(--hero-gradient-a), transparent),
    radial-gradient(ellipse 60% 40% at 80% 50%, var(--hero-gradient-b), transparent);
}

/* Grid pattern overlay */
.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(var(--hero-line-color) 1px, transparent 1px),
    linear-gradient(90deg, var(--hero-line-color) 1px, transparent 1px);
  background-size: 60px 60px;
  z-index: 0;
}

.hero-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.hero-bg canvas { width: 100%; height: 100%; }

.hero-content {
  position: relative;
  z-index: 1;
  text-align: center;
  max-width: 800px;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  border-radius: 999px;
  background: rgba(26, 111, 216, 0.08);
  border: 1px solid rgba(26, 111, 216, 0.15);
  color: var(--brand);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  margin-bottom: 24px;
  animation: fadeInDown 0.8s ease;
}
.hero-badge .badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--brand);
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.hero h1 {
  font-size: clamp(32px, 6vw, 72px);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -1px;
  color: var(--text-heading);
  margin-bottom: 24px;
  animation: fadeInUp 0.7s ease;
}
.hero h1 .accent-word {
  background: linear-gradient(135deg, #1A8CFF, #6BB3FF);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero .subtitle {
  font-size: clamp(15px, 2vw, 18px);
  color: var(--muted);
  max-width: 640px;
  margin: 0 auto 40px;
  font-weight: 400;
  line-height: 1.7;
  animation: fadeInUp 0.7s ease 0.1s backwards;
}

.hero-ctas {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
  animation: fadeInUp 0.7s ease 0.2s backwards;
}

/* ── Buttons — Cowork pill style ─────── */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 14px 32px;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 600;
  font-family: var(--font);
  cursor: pointer;
  border: none;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  text-decoration: none;
}

.btn-primary {
  background: #1A8CFF;
  color: #fff;
  box-shadow: 0 8px 24px rgba(26, 140, 255, 0.2);
}
.btn-primary:hover {
  background: #066aab;
  box-shadow: 0 8px 32px rgba(26, 140, 255, 0.3);
  transform: translateY(-1px);
}

.btn-secondary {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
}
.btn-secondary:hover {
  border-color: rgba(26, 111, 216, 0.3);
  color: var(--text-heading);
  transform: translateY(-1px);
}

/* ── Hero Stats — Cowork style ───────── */
.hero-stats {
  display: flex;
  gap: 48px;
  justify-content: center;
  margin-top: 56px;
  animation: fadeInUp 0.7s ease 0.35s backwards;
}

.hero-stat {
  text-align: center;
}
.hero-stat .val {
  font-size: 36px;
  font-weight: 700;
  color: var(--text-heading);
  letter-spacing: -0.5px;
}
.hero-stat .lbl {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  margin-top: 4px;
}

/* ── Theme Toggle ─────────────────────── */

.theme-toggle {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--card);
  border: 1px solid var(--border);
  color: var(--muted);
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
  box-shadow: var(--card-shadow);
}
.theme-toggle:hover {
  color: var(--text);
  border-color: var(--brand);
  box-shadow: var(--card-hover-shadow);
}
.hero-stat .lbl {
  font-size: 12px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-top: 4px;
}

/* ── Modes Section ────────────────────────── */

.section {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 32px;
  padding-left: 4px;
}

.modes {
  padding: 60px 0 80px;
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.mode-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 28px 24px;
  transition: all 0.3s ease;
  cursor: default;
  position: relative;
  overflow: hidden;
}
.mode-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.mode-card:hover {
  border-color: var(--border-light);
  transform: translateY(-2px);
  box-shadow: var(--card-hover-shadow);
}
.mode-card:hover::before { opacity: 1; }

.mode-card[data-color="yellow"]::before { background: var(--yellow); }
.mode-card[data-color="green"]::before { background: var(--green); }
.mode-card[data-color="purple"]::before { background: var(--purple); }
.mode-card[data-color="blue"]::before { background: var(--brand); }

.mode-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.mode-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.mode-card[data-color="yellow"] .mode-icon { background: rgba(245, 158, 11, 0.12); color: var(--yellow); }
.mode-card[data-color="green"] .mode-icon { background: rgba(16, 185, 129, 0.12); color: var(--green); }
.mode-card[data-color="purple"] .mode-icon { background: rgba(139, 92, 246, 0.12); color: var(--purple); }
.mode-card[data-color="blue"] .mode-icon { background: rgba(6, 106, 171, 0.12); color: var(--brand-light); }

.mode-badge {
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.8px;
}
.mode-card[data-color="yellow"] .mode-badge { background: rgba(245, 158, 11, 0.15); color: var(--yellow); }
.mode-card[data-color="green"] .mode-badge { background: rgba(16, 185, 129, 0.15); color: var(--green); }
.mode-card[data-color="purple"] .mode-badge { background: rgba(139, 92, 246, 0.15); color: var(--purple); }
.mode-card[data-color="blue"] .mode-badge { background: rgba(6, 106, 171, 0.15); color: var(--brand-light); }

.mode-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-heading);
}

.mode-desc {
  font-size: 14px;
  color: var(--muted);
  line-height: 1.5;
}

.mode-link {
  display: inline-block;
  margin-top: 12px;
  font-size: 13px;
  color: var(--brand-light);
  text-decoration: none;
  font-weight: 500;
}
.mode-link:hover { text-decoration: underline; }

/* ── Auth Panel ───────────────────────────── */

.auth-panel {
  max-width: 1280px;
  margin: 0 auto 60px;
  padding: 0 24px;
}

.auth-container {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  display: none;
}
.auth-container.open { display: block; animation: slideDown 0.3s ease; }

.auth-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
}

.auth-tab {
  flex: 1;
  padding: 14px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
  background: none;
  border: none;
  font-family: var(--font);
  transition: all 0.2s;
  border-bottom: 2px solid transparent;
}
.auth-tab.active {
  color: var(--text);
  border-bottom-color: var(--brand);
  background: rgba(6, 106, 171, 0.05);
}
.auth-tab:hover:not(.active) { color: var(--text); background: rgba(255,255,255,0.02); }

.auth-body { padding: 28px; }
.auth-pane { display: none; }
.auth-pane.active { display: block; }

.auth-field {
  margin-bottom: 16px;
}

.auth-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.auth-input {
  width: 100%;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--input-bg);
  color: var(--text);
  font-size: 14px;
  font-family: var(--mono);
  outline: none;
  transition: border-color 0.2s;
}
.auth-input:focus { border-color: var(--brand); }
.auth-input::placeholder { color: var(--border-light); }

.auth-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}
.auth-row .auth-field { flex: 1; }

.auth-hint {
  font-size: 12px;
  color: var(--muted);
  margin-top: 8px;
  line-height: 1.5;
}
.auth-hint a { color: var(--brand-light); text-decoration: none; }
.auth-hint a:hover { text-decoration: underline; }

.auth-warning {
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 13px;
  color: var(--yellow);
  margin-top: 16px;
  line-height: 1.5;
}

.token-display {
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  margin-top: 16px;
  display: none;
}
.token-display.visible { display: block; animation: fadeIn 0.3s; }

.token-value {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--green);
  word-break: break-all;
  margin-bottom: 8px;
}

.token-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--muted);
}

.embed-snippet {
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  margin-top: 12px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
  white-space: pre-wrap;
  word-break: break-all;
  display: none;
}
.embed-snippet.visible { display: block; }

.btn-sm {
  padding: 8px 16px;
  font-size: 13px;
  border-radius: 6px;
}

/* ── App Grid ─────────────────────────────── */

.apps {
  padding: 0 0 80px;
}

.segment-group {
  margin-bottom: 48px;
}

.segment-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.segment-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.segment-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-heading);
  letter-spacing: 0.3px;
}

.segment-count {
  font-size: 12px;
  color: var(--muted);
  font-family: var(--mono);
}

.app-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}

.app-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px;
  transition: all 0.25s ease;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}
.app-card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 10px;
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
}
.app-card:hover {
  border-color: var(--border-light);
  transform: translateY(-2px);
  box-shadow: var(--card-hover-shadow);
}
.app-card:hover::after { opacity: 1; }

.app-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 8px;
}

.app-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-heading);
  line-height: 1.3;
}

.app-mode-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.6px;
  flex-shrink: 0;
  margin-left: 12px;
}
.app-mode-badge.demo { background: var(--badge-demo-bg); color: var(--badge-demo-fg); }
.app-mode-badge.live { background: var(--badge-live-bg); color: var(--badge-live-fg); }

.app-tagline {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.4;
  flex: 1;
  margin-bottom: 16px;
}

.app-thumbnail {
  width: 100%;
  aspect-ratio: 16/10;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  cursor: pointer;
  position: relative;
  transition: border-color 0.2s;
}
.app-thumbnail:hover { border-color: var(--brand); }
.app-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top left;
  display: block;
}
.app-thumbnail .carousel-images {
  display: flex;
  transition: transform 0.3s ease;
  width: 100%;
  height: 100%;
}
.app-thumbnail .carousel-images img {
  flex-shrink: 0;
  width: 100%;
  height: 100%;
}
.app-thumbnail .carousel-dots {
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 5px;
}
.app-thumbnail .carousel-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255,255,255,0.4);
  cursor: pointer;
  transition: background 0.2s;
}
.app-thumbnail .carousel-dot.active { background: #fff; }
.app-thumbnail .carousel-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(0,0,0,0.5);
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}
.app-thumbnail:hover .carousel-nav { opacity: 1; }
.app-thumbnail .carousel-prev { left: 6px; }
.app-thumbnail .carousel-next { right: 6px; }
.app-thumbnail .zoom-hint {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0,0,0,0.6);
  color: #fff;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}
.app-thumbnail:hover .zoom-hint { opacity: 1; }

.app-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.app-segment-badge {
  padding: 3px 10px;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

/* Title link */
.app-name-link {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-heading);
  line-height: 1.3;
  text-decoration: none;
  transition: color 0.2s;
}
.app-name-link:hover { color: var(--brand); text-decoration: none; }

/* View Details button */
.app-details-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 7px 16px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  border: 1px solid var(--border);
  text-decoration: none;
  transition: all 0.2s;
  font-family: var(--font);
}
.app-details-btn:hover {
  color: var(--brand);
  border-color: var(--brand);
  background: rgba(6, 106, 171, 0.06);
  text-decoration: none;
}

/* Coming Soon — only affects the launch button, not the preview */
.app-card.coming-soon .app-open-btn {
  opacity: 0.4; pointer-events: none; cursor: default;
}
.app-card.coming-soon .app-open-btn:hover { transform: none; }

/* Share button overlay on thumbnail */
.thumb-overlay-btns {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 5;
  opacity: 0;
  transition: opacity 0.2s;
}
.app-card:hover .thumb-overlay-btns { opacity: 1; }
.thumb-overlay-btns .app-share-btn {
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(4px);
  border: none;
  color: #fff;
  border-radius: 8px;
}
.thumb-overlay-btns .app-share-btn:hover {
  background: rgba(0,0,0,0.75);
  color: #fff;
}
.thumb-overlay-btns .share-menu {
  right: 0;
  left: auto;
}

/* Category nav strip */
.category-nav {
  display: flex;
  gap: 8px;
  padding: 16px 24px;
  overflow-x: auto;
  scrollbar-width: none;
  justify-content: center;
  flex-wrap: wrap;
  max-width: 1200px;
  margin: 0 auto;
}
.category-nav::-webkit-scrollbar { display: none; }
.category-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--muted);
  text-decoration: none;
  white-space: nowrap;
  transition: all 0.2s;
}
.category-chip:hover {
  border-color: var(--brand);
  color: var(--brand);
  text-decoration: none;
}
.category-chip .chip-count {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--border);
  color: var(--text);
}

.app-source-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  color: var(--muted);
  border: 1px solid var(--border);
  transition: all 0.2s;
  text-decoration: none;
}
.app-source-link:hover {
  color: var(--text);
  border-color: var(--border-light);
  background: rgba(6, 106, 171, 0.08);
}

.app-share-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  color: var(--muted);
  border: 1px solid var(--border);
  background: none;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  font-family: var(--font);
  padding: 0;
  position: relative;
}
.app-share-btn:hover {
  color: var(--text);
  border-color: var(--border-light);
  background: rgba(6, 106, 171, 0.08);
}

.lightbox-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0,0,0,0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.2s;
  cursor: pointer;
  backdrop-filter: blur(8px);
}
.lightbox-overlay img {
  max-width: 92vw;
  max-height: 88vh;
  border-radius: 8px;
  box-shadow: 0 16px 64px rgba(0,0,0,0.5);
  cursor: default;
}
.lightbox-close {
  position: fixed;
  top: 16px;
  right: 20px;
  z-index: 301;
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.2);
  color: #fff;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lightbox-close:hover { background: rgba(255,255,255,0.2); }

.share-menu {
  position: absolute;
  bottom: 40px;
  right: 0;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  z-index: 10;
  display: none;
  min-width: 170px;
}
.share-menu.open { display: block; animation: slideDown 0.2s ease; }
.share-menu a, .share-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text);
  text-decoration: none;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: var(--font);
  text-align: left;
}
.share-menu a:hover, .share-menu button:hover { background: rgba(6,106,171,0.1); }

.app-open-btn {
  padding: 7px 18px;
  border-radius: 6px;
  background: rgba(6, 106, 171, 0.12);
  border: 1px solid rgba(6, 106, 171, 0.25);
  color: var(--brand-light);
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font);
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.app-open-btn:hover {
  background: rgba(6, 106, 171, 0.25);
  border-color: var(--brand);
  transform: translateX(2px);
}

/* ── Top Nav ──────────────────────────────── */

.top-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

[data-theme="light"] .top-nav { background: rgba(255,255,255,0.8); box-shadow: var(--nav-shadow); }
[data-theme="dark"] .top-nav { background: rgba(15,34,55,0.8); }

.nav-inner {
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 56px;
}

.nav-left {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
}

.nav-logo {
  height: 32px;
  border-radius: 6px;
}

.nav-brand {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.nav-brand-mc {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-heading);
  letter-spacing: -0.3px;
}
.nav-brand-sub {
  font-size: 11px;
  font-weight: 600;
  color: var(--brand);
  letter-spacing: 1.5px;
  text-transform: uppercase;
}

.nav-center {
  display: flex;
  align-items: center;
  gap: 32px;
}

.nav-link {
  font-size: 14px;
  color: var(--muted);
  text-decoration: none;
  font-weight: 400;
  transition: color 0.2s;
}
.nav-link:hover {
  color: var(--text-heading);
  text-decoration: none;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nav-cta {
  padding: 8px 20px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}
.nav-cta-outline {
  background: rgba(26, 111, 216, 0.08);
  border: 1px solid rgba(26, 111, 216, 0.15);
  color: var(--brand);
}
.nav-cta-outline:hover {
  background: rgba(26, 111, 216, 0.15);
  border-color: rgba(26, 111, 216, 0.3);
  text-decoration: none;
}
.nav-cta-primary {
  background: rgba(26, 111, 216, 0.08);
  border: 1px solid rgba(26, 111, 216, 0.2);
  color: var(--brand);
}
.nav-cta-primary:hover {
  background: rgba(26, 111, 216, 0.15);
  border-color: rgba(26, 111, 216, 0.3);
  text-decoration: none;
}
.nav-cta svg { width: 14px; height: 14px; fill: currentColor; }

/* Mobile hamburger */
.nav-hamburger {
  display: none;
  background: none;
  border: none;
  color: var(--muted);
  font-size: 24px;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
}

.nav-mobile-menu {
  display: none;
  position: fixed;
  top: 56px;
  left: 0;
  right: 0;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 8px 16px 16px;
  z-index: 49;
  flex-direction: column;
  gap: 2px;
}
.nav-mobile-menu.open { display: flex; }
.nav-mobile-menu a {
  display: block;
  padding: 10px 12px;
  font-size: 14px;
  color: var(--muted);
  text-decoration: none;
  border-radius: 6px;
  font-weight: 500;
}
.nav-mobile-menu a:hover { background: rgba(6,106,171,0.06); color: var(--text); }

@media (max-width: 900px) {
  .nav-center { display: none; }
  .nav-hamburger { display: block; }
}
@media (max-width: 640px) {
  .nav-right .nav-cta-outline { display: none; }
}

/* ── Modal ────────────────────────────────── */

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.2s;
  backdrop-filter: blur(4px);
}

.modal {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 32px;
  max-width: 440px;
  width: 90%;
  box-shadow: 0 16px 48px rgba(0,0,0,0.3);
  animation: slideDown 0.3s ease;
}

.modal h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-heading);
  margin-bottom: 8px;
}

.modal p {
  font-size: 14px;
  color: var(--muted);
  margin-bottom: 20px;
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  gap: 10px;
}

.modal-actions .btn { flex: 1; justify-content: center; }

/* ── Toast ─────────────────────────────────── */

.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%) translateY(20px);
  background: var(--green);
  color: #fff;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  z-index: 300;
  opacity: 0;
  transition: all 0.3s ease;
  pointer-events: none;
}
.toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* ── Footer ───────────────────────────────── */

.footer {
  border-top: 1px solid var(--border);
  padding: 40px 24px;
  text-align: center;
}

.footer-text {
  font-size: 13px;
  color: var(--muted);
}
.footer-text a {
  color: var(--brand-light);
  text-decoration: none;
}
.footer-text a:hover { text-decoration: underline; }

.footer-sep {
  display: inline-block;
  margin: 0 12px;
  color: var(--border-light);
}

/* ── Animations ───────────────────────────── */

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fadeInDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.stagger { animation: fadeInUp 0.5s ease backwards; }

/* ── Responsive ───────────────────────────── */

/* Tablet */
@media (max-width: 900px) {
  .app-grid { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  .mode-grid { grid-template-columns: repeat(2, 1fr); }
  .hero h1 { font-size: 36px; letter-spacing: -1px; }
  .hero h1 img { height: 40px !important; margin-right: 8px !important; }
  .hero-stats { gap: 28px; }
}

/* Mobile */
@media (max-width: 640px) {
  /* Nav */
  .top-nav { padding: 10px 12px; gap: 6px; }
  .nav-title { font-size: 13px; }
  .nav-inner { padding: 0 12px; }
  .nav-logo { height: 24px; }
  .nav-brand-mc { font-size: 15px; }
  .nav-brand-sub { font-size: 10px; }
  .theme-toggle { width: 32px !important; height: 32px !important; font-size: 14px !important; }

  /* Hero */
  .hero { min-height: auto; padding: 80px 16px 40px; }
  .hero h1 { font-size: 28px; letter-spacing: -0.5px; }
  .hero h1 img { height: 32px !important; margin-right: 6px !important; }
  .hero .subtitle { font-size: 14px; }
  .hero-badge { font-size: 10px; padding: 4px 12px; }
  .hero-ctas { flex-direction: column; width: 100%; }
  .hero-ctas .btn { width: 100%; justify-content: center; }
  .hero-stats { gap: 16px; flex-wrap: wrap; }
  .hero-stat .val { font-size: 22px; }
  .hero-stat .lbl { font-size: 10px; }

  /* Sections */
  .section { padding: 0 12px; }
  .section-title { font-size: 12px; margin-bottom: 20px; }

  /* Mode cards */
  .modes { padding: 40px 0 50px; }
  .mode-grid { grid-template-columns: 1fr; gap: 10px; }
  .mode-card { padding: 20px 16px; }
  .mode-icon { width: 34px; height: 34px; font-size: 15px; }
  .mode-title { font-size: 14px; }
  .mode-desc { font-size: 13px; }

  /* App grid */
  .apps { padding: 0 0 50px; }
  .app-grid { grid-template-columns: 1fr; gap: 10px; }
  .app-card { padding: 16px; }
  .app-name { font-size: 14px; }
  .app-tagline { font-size: 12px; margin-bottom: 12px; }
  .app-segment-badge { font-size: 9px; padding: 2px 8px; }
  .app-open-btn { font-size: 11px; padding: 6px 14px; }
  .app-source-link { width: 26px; height: 26px; }
  .app-source-link svg { width: 12px; height: 12px; }
  .segment-header { margin-bottom: 14px; padding-bottom: 8px; }
  .segment-name { font-size: 13px; }
  .segment-group { margin-bottom: 32px; }

  /* Auth panel */
  .auth-panel { padding: 0 12px; }
  .auth-body { padding: 16px; }
  .auth-row { flex-direction: column; }
  .auth-input { font-size: 13px; padding: 10px 12px; }
  .auth-tab { font-size: 12px; padding: 10px; }
  .auth-warning { font-size: 12px; padding: 10px 12px; }

  /* Modal */
  .modal { padding: 20px; max-width: 95%; }
  .modal h3 { font-size: 16px; }
  .modal p { font-size: 13px; }
  .modal-actions { flex-direction: column; }
  .modal-actions .btn { width: 100%; }

  /* Inline instruction panels */
  #embed-instructions-panel > div,
  #mcp-instructions-panel > div { padding: 16px; max-width: 100% !important; }
  #embed-instructions-panel code,
  #mcp-instructions-panel code { font-size: 10px; padding: 8px; }

  /* Footer */
  .footer { padding: 24px 12px; }
  .footer-text { font-size: 11px; line-height: 2; }
  .footer-sep { margin: 0 6px; }

  /* Toast */
  .toast { font-size: 13px; padding: 10px 20px; max-width: 90%; }
}

/* Small mobile */
@media (max-width: 380px) {
  .hero h1 { font-size: 24px; }
  .hero h1 img { height: 26px !important; }
  .nav-brand { font-size: 13px; }
  .hero-stats { gap: 12px; }
  .hero-stat .val { font-size: 18px; }
}
`;

// ── Render ──────────────────────────────────────────────────────────────

function render() {
  // Set initial theme (light default)
  document.documentElement.setAttribute("data-theme", getTheme());

  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  document.body.innerHTML = "";

  renderTopNav();
  renderHero();
  renderCategoryNav();
  renderApps();
  renderModes();
  renderAuthPanel();
  renderFooter();
}

let heroCanvas: HTMLCanvasElement | null = null;

// ── Top Nav ─────────────────────────────────────────────────────────────

function renderTopNav() {
  const nav = document.createElement("nav");
  nav.className = "top-nav";
  nav.innerHTML = `
    <div class="nav-inner">
      <a href="/" class="nav-left">
        <img src="/assets/mc-logo.webp" alt="MC" class="nav-logo" />
        <span class="nav-brand"><span class="nav-brand-mc">MarketCheck</span> <span class="nav-brand-sub">APPS</span></span>
      </a>
      <div class="nav-center">
        <a href="#apps" class="nav-link">Apps</a>
        <a href="/docs/derivative-apis/" class="nav-link">Derivative APIs</a>
        <a href="https://apidocs.marketcheck.com" target="_blank" class="nav-link">API Docs</a>
      </div>
      <div class="nav-right">
        <a href="https://github.com/MarketcheckHub/marketcheck-mcp-apps" target="_blank" class="nav-cta nav-cta-outline">
          <svg viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          GitHub
        </a>
        <a href="https://developers.marketcheck.com" target="_blank" class="nav-cta nav-cta-primary">Get API Key</a>
        <button class="theme-toggle" id="theme-toggle" title="Toggle theme" style="position:static;width:36px;height:36px;font-size:16px;">&#9789;</button>
        <button class="nav-hamburger" id="nav-hamburger">&#9776;</button>
      </div>
    </div>
  `;
  document.body.appendChild(nav);

  // Mobile menu
  const mobileMenu = document.createElement("div");
  mobileMenu.className = "nav-mobile-menu";
  mobileMenu.id = "nav-mobile-menu";
  mobileMenu.innerHTML = `
    <a href="#apps">Apps</a>
    <a href="/docs/derivative-apis/">Derivative APIs</a>
    <a href="https://apidocs.marketcheck.com" target="_blank">API Docs</a>
    <a href="https://github.com/MarketcheckHub/marketcheck-mcp-apps" target="_blank">GitHub</a>
    <a href="https://developers.marketcheck.com" target="_blank">Get API Key</a>
  `;
  document.body.appendChild(mobileMenu);

  document.getElementById("nav-hamburger")?.addEventListener("click", () => {
    mobileMenu.classList.toggle("open");
  });

  // Close mobile menu on link click
  mobileMenu.querySelectorAll("a").forEach(a => {
    a.addEventListener("click", () => mobileMenu.classList.remove("open"));
  });

  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const next = getTheme() === "light" ? "dark" : "light";
    setTheme(next);
    document.getElementById("theme-toggle")!.innerHTML = next === "light" ? "&#9789;" : "&#9788;";
    if (heroCanvas) initHeroBg(heroCanvas);
  });

  setTimeout(() => {
    const btn = document.getElementById("theme-toggle");
    if (btn) btn.innerHTML = getTheme() === "light" ? "&#9789;" : "&#9788;";
  }, 0);
}

// ── App Open Modal ──────────────────────────────────────────────────────

function showAppOpenModal(appId: string, appName: string) {
  const isChatApp = appId.startsWith("chat-");
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const savedKey = getApiKey() ?? "";
  const hasKey = !!savedKey;

  overlay.innerHTML = `
    <div class="modal">
      <h3>Launch ${appName}</h3>
      <p>${isChatApp
        ? "This chat app requires an LLM API key and a MarketCheck API key to work."
        : hasKey
          ? "Your API key is saved. You can update it below or launch with the current key."
          : "Enter your MarketCheck API key for live data, or view with demo data."}</p>
      <div class="auth-field" id="modal-key-field">
        ${isChatApp ? `
        <label class="auth-label">LLM Provider</label>
        <select class="auth-input" id="modal-llm-provider" style="margin-bottom:12px;cursor:pointer;">
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI (GPT)</option>
          <option value="gemini">Google (Gemini)</option>
        </select>
        <label class="auth-label" id="modal-llm-key-label">Anthropic API Key</label>
        <input class="auth-input" id="modal-llm-key" type="password" placeholder="sk-ant-..." />
        <div class="auth-hint" style="margin-top:6px;margin-bottom:16px;" id="modal-llm-hint">
          Get one at <a href="https://console.anthropic.com/" target="_blank">console.anthropic.com</a>
        </div>
        ` : ""}
        <label class="auth-label">MarketCheck API Key</label>
        <input class="auth-input" id="modal-api-key" type="password" placeholder="Enter your API key" value="${savedKey}" />
        <div class="auth-hint" style="margin-top:6px;">
          ${hasKey ? "Key is saved. Update it here or launch directly." : 'Get a free key at <a href="https://developers.marketcheck.com" target="_blank">developers.marketcheck.com</a>'}
        </div>
      </div>
      <div class="modal-actions">
        ${isChatApp ? "" : '<button class="btn btn-secondary" id="modal-demo">View Demo</button>'}
        <button class="btn btn-primary" id="modal-live">${hasKey ? "Launch with Live Data" : (isChatApp ? "Open Chat" : "Launch with API Key")}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close on overlay click
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const keyField = document.getElementById("modal-key-field")!;
  const keyInput = document.getElementById("modal-api-key") as HTMLInputElement;

  // LLM provider switching (chat apps only)
  if (isChatApp) {
    const providerSelect = document.getElementById("modal-llm-provider") as HTMLSelectElement;
    const llmKeyInput = document.getElementById("modal-llm-key") as HTMLInputElement;
    const llmKeyLabel = document.getElementById("modal-llm-key-label")!;
    const llmHint = document.getElementById("modal-llm-hint")!;

    const providerConfig: Record<string, { label: string; placeholder: string; hint: string }> = {
      anthropic: { label: "Anthropic API Key", placeholder: "sk-ant-...", hint: 'Get one at <a href="https://console.anthropic.com/" target="_blank">console.anthropic.com</a>' },
      openai: { label: "OpenAI API Key", placeholder: "sk-...", hint: 'Get one at <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a>' },
      gemini: { label: "Google AI API Key", placeholder: "AIza...", hint: 'Get one at <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com</a>' },
    };

    // Restore saved provider
    const savedProvider = localStorage.getItem("mc_llm_provider") ?? "anthropic";
    providerSelect.value = savedProvider;
    const cfg = providerConfig[savedProvider];
    llmKeyLabel.textContent = cfg.label;
    llmKeyInput.placeholder = cfg.placeholder;
    llmHint.innerHTML = cfg.hint;
    llmKeyInput.value = localStorage.getItem("mc_llm_key") ?? "";
    keyInput.value = getApiKey() ?? "";

    providerSelect.addEventListener("change", () => {
      const cfg = providerConfig[providerSelect.value];
      llmKeyLabel.textContent = cfg.label;
      llmKeyInput.placeholder = cfg.placeholder;
      llmHint.innerHTML = cfg.hint;
      llmKeyInput.value = "";
    });
  }

  // Demo button → open app with no key (non-chat apps only)
  document.getElementById("modal-demo")?.addEventListener("click", () => {
    overlay.remove();
    window.open(`/apps/${appId}/dist/index.html`, "_blank");
  });

  // Live button → save key and open app
  document.getElementById("modal-live")!.addEventListener("click", () => {
    const mcKey = keyInput.value.trim();

    if (isChatApp) {
      // Chat app: save both keys + provider
      const llmKey = (document.getElementById("modal-llm-key") as HTMLInputElement)?.value?.trim();
      const provider = (document.getElementById("modal-llm-provider") as HTMLSelectElement)?.value;

      if (!llmKey || !mcKey) {
        alert("Both API keys are required for chat apps.");
        return;
      }
      localStorage.setItem("mc_llm_key", llmKey);
      localStorage.setItem("mc_llm_provider", provider);
      localStorage.setItem("mc_api_key", mcKey);
      refreshBadges();
      renderApiKeyBanner();
      overlay.remove();
      window.open(`/apps/${appId}/dist/index.html?api_key=${encodeURIComponent(mcKey)}`, "_blank");
    } else {
      // Regular app: save MC key and open
      if (mcKey) {
        localStorage.setItem("mc_api_key", mcKey);
        refreshBadges();
        renderApiKeyBanner();
      }
      overlay.remove();
      const url = mcKey
        ? `/apps/${appId}/dist/index.html?api_key=${encodeURIComponent(mcKey)}`
        : `/apps/${appId}/dist/index.html`;
      window.open(url, "_blank");
    }
  });
}

// ── Hero ────────────────────────────────────────────────────────────────

function renderHero() {
  const hero = document.createElement("section");
  hero.className = "hero";

  // Animated background canvas
  const bgDiv = document.createElement("div");
  bgDiv.className = "hero-bg";
  const canvas = document.createElement("canvas");
  bgDiv.appendChild(canvas);
  hero.appendChild(bgDiv);
  heroCanvas = canvas;
  initHeroBg(canvas);

  const content = document.createElement("div");
  content.className = "hero-content";
  content.innerHTML = `
    <div class="hero-badge"><span class="badge-dot"></span> Powered by MarketCheck APIs &amp; MCPs</div>
    <h1>Automotive Market<br><span class="accent-word">Intelligence</span> Apps</h1>
    <p class="subtitle">68 reference implementations showcasing MarketCheck API &amp; MCP capabilities &mdash; dashboards and AI chat demos for dealers, appraisers, lenders, analysts, manufacturers, insurers, and more. Fork them, build your own, or use as-is.</p>
    <div class="hero-ctas">
      <a href="#apps" class="btn btn-primary">Explore Apps <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg></a>
      <a href="https://github.com/MarketcheckHub/marketcheck-api-mcp-apps" target="_blank" class="btn btn-secondary">View on GitHub</a>
    </div>
    <div class="hero-stats">
      <div class="hero-stat"><div class="val">68</div><div class="lbl">Apps</div></div>
      <div class="hero-stat"><div class="val">16</div><div class="lbl">Segments</div></div>
      <div class="hero-stat"><div class="val">12</div><div class="lbl">API Tools</div></div>
      <div class="hero-stat"><div class="val">4</div><div class="lbl">Modes</div></div>
    </div>
  `;
  hero.appendChild(content);
  document.body.appendChild(hero);

  document.getElementById("btn-connect")?.addEventListener("click", () => {
    const panel = document.getElementById("auth-container");
    if (panel) {
      panel.classList.toggle("open");
      panel.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  document.getElementById("btn-share-page")?.addEventListener("click", () => {
    const shareText = "52 free automotive market intelligence apps & AI chat demos — powered by MarketCheck. Try them now:";
    const shareUrl = location.origin;
    if (navigator.share) {
      navigator.share({ title: "MarketCheck Apps", text: shareText, url: shareUrl });
    } else {
      const tw = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
      window.open(tw, "_blank");
    }
  });
}

// ── Hero Background (animated data grid) ────────────────────────────────

function initHeroBg(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let w = 0, h = 0;
  const points: { x: number; y: number; vx: number; vy: number; r: number }[] = [];

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    w = canvas.parentElement!.clientWidth;
    h = canvas.parentElement!.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();
  window.addEventListener("resize", resize);

  // Create grid points
  for (let i = 0; i < 60; i++) {
    points.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.5,
    });
  }

  function draw() {
    ctx!.clearRect(0, 0, w, h);

    // Radial gradient background
    const isDark = getTheme() === "dark";
    const grad = ctx!.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, w * 0.8);
    grad.addColorStop(0, isDark ? "rgba(6, 106, 171, 0.06)" : "rgba(6, 106, 171, 0.04)");
    grad.addColorStop(0.5, isDark ? "rgba(6, 106, 171, 0.02)" : "rgba(6, 106, 171, 0.015)");
    grad.addColorStop(1, "transparent");
    ctx!.fillStyle = grad;
    ctx!.fillRect(0, 0, w, h);

    // Draw connections
    ctx!.strokeStyle = isDark ? "rgba(6, 106, 171, 0.08)" : "rgba(6, 106, 171, 0.06)";
    ctx!.lineWidth = 0.5;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[i].x - points[j].x;
        const dy = points[i].y - points[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          ctx!.globalAlpha = 1 - dist / 150;
          ctx!.beginPath();
          ctx!.moveTo(points[i].x, points[i].y);
          ctx!.lineTo(points[j].x, points[j].y);
          ctx!.stroke();
        }
      }
    }
    ctx!.globalAlpha = 1;

    // Draw + move points
    for (const p of points) {
      ctx!.fillStyle = isDark ? "rgba(6, 106, 171, 0.3)" : "rgba(6, 106, 171, 0.15)";
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx!.fill();

      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }

    requestAnimationFrame(draw);
  }

  draw();
}

// ── Modes ───────────────────────────────────────────────────────────────

function renderModes() {
  const section = document.createElement("section");
  section.className = "modes section";
  section.innerHTML = `<div class="section-title">Choose Your Mode</div>`;

  const grid = document.createElement("div");
  grid.className = "mode-grid";

  const modes = [
    { color: "yellow", icon: "&#9654;", badge: "DEMO", title: "Demo Mode", desc: "Browse all 68 apps with realistic sample data. No API key required.", link: null },
    { color: "green", icon: "&#9919;", badge: "LIVE", title: "Live Data", desc: "Enter your MarketCheck API key to see real market data in any app.", link: '<a class="mode-link" href="https://developers.marketcheck.com" target="_blank">Get a free API key &rarr;</a>' },
    { color: "purple", icon: "&lt;/&gt;", badge: "EMBED", title: "Embed in Your Portal", desc: "Embed any app in your website using an iframe with secure OAuth tokens.", link: '<button class="mode-link" id="btn-show-embed">See embed instructions &rarr;</button>' },
    { color: "blue", icon: "&#10023;", badge: "MCP", title: "AI Assistants", desc: "Use inside Claude, VS Code Copilot, Goose, and other MCP-compatible AI hosts.", link: '<button class="mode-link" id="btn-show-mcp">Setup instructions &rarr;</button>' },
  ];

  modes.forEach((m, i) => {
    const card = document.createElement("div");
    card.className = "mode-card stagger";
    card.style.animationDelay = `${i * 0.08}s`;
    card.setAttribute("data-color", m.color);
    card.innerHTML = `
      <div class="mode-header">
        <div class="mode-icon">${m.icon}</div>
        <div>
          <span class="mode-badge">${m.badge}</span>
          <div class="mode-title" style="margin-top:6px;">${m.title}</div>
        </div>
      </div>
      <div class="mode-desc">${m.desc}</div>
      ${m.link ? m.link : ""}
    `;
    grid.appendChild(card);
  });

  section.appendChild(grid);
  document.body.appendChild(section);

  // Embed instructions — inline panel toggle
  document.getElementById("btn-show-embed")?.addEventListener("click", () => {
    const panel = document.getElementById("embed-instructions-panel");
    if (panel) {
      const isOpen = panel.style.display !== "none";
      panel.style.display = isOpen ? "none" : "block";
      if (!isOpen) panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  // MCP instructions — inline panel toggle
  document.getElementById("btn-show-mcp")?.addEventListener("click", () => {
    const panel = document.getElementById("mcp-instructions-panel");
    if (panel) {
      const isOpen = panel.style.display !== "none";
      panel.style.display = isOpen ? "none" : "block";
      if (!isOpen) panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  // ── Embed Instructions Inline Panel ──────────────────────────────────
  const embedPanel = document.createElement("div");
  embedPanel.id = "embed-instructions-panel";
  embedPanel.style.cssText = "display:none;margin-top:24px;animation:slideDown 0.3s ease;";
  embedPanel.innerHTML = `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:28px;max-width:720px;">
      <h3 style="font-size:16px;font-weight:600;color:var(--text-heading);margin-bottom:8px;display:flex;align-items:center;gap:8px;">
        <span style="color:var(--purple);">&lt;/&gt;</span> Embedding Apps in Your Portal
      </h3>
      <p style="font-size:14px;color:var(--muted);margin-bottom:20px;line-height:1.5;">Embed any app as an iframe. For security, use <strong>OAuth access tokens</strong> (not API keys) — tokens expire in 6 hours and can be revoked.</p>

      <div style="margin-bottom:16px;">
        <div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Step 1: Generate an OAuth token (server-side)</div>
        <code style="display:block;background:var(--input-bg);border:1px solid var(--border);padding:12px;border-radius:8px;font-size:12px;color:var(--text);font-family:var(--mono);white-space:pre-wrap;line-height:1.6;">curl -X POST https://api.marketcheck.com/oauth2/token \\
  -H "Content-Type: application/json" \\
  -d '{"grant_type":"client_credentials","client_id":"YOUR_API_KEY","client_secret":"YOUR_SECRET"}'</code>
      </div>

      <div style="margin-bottom:16px;">
        <div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Step 2: Embed with the token</div>
        <code style="display:block;background:var(--input-bg);border:1px solid var(--border);padding:12px;border-radius:8px;font-size:12px;color:var(--text);font-family:var(--mono);white-space:pre-wrap;line-height:1.6;">&lt;iframe
  src="${location.origin}/apps/deal-evaluator/dist/index.html?access_token=TOKEN&amp;embed=true&amp;vin=5TDJSKFC2NS055758"
  width="100%" height="700"
  style="border:none;border-radius:8px;"
&gt;&lt;/iframe&gt;</code>
      </div>

      <div style="padding:12px 14px;background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.2);border-radius:8px;font-size:12px;color:var(--purple);line-height:1.5;">
        <strong>Security:</strong> OAuth tokens expire in 6 hours and can be revoked at <a href="https://developers.marketcheck.com" target="_blank" style="color:var(--purple);">developers.marketcheck.com</a>. Never embed API keys or client secrets directly in iframe URLs.
      </div>
    </div>
  `;
  section.appendChild(embedPanel);

  // ── MCP Instructions Inline Panel ────────────────────────────────────
  const serverUrl = location.origin + "/mcp";
  const mcpPanel = document.createElement("div");
  mcpPanel.id = "mcp-instructions-panel";
  mcpPanel.style.cssText = "display:none;margin-top:24px;animation:slideDown 0.3s ease;";
  mcpPanel.innerHTML = `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:28px;max-width:720px;">
      <h3 style="font-size:16px;font-weight:600;color:var(--text-heading);margin-bottom:8px;display:flex;align-items:center;gap:8px;">
        <span style="color:var(--brand-light);font-size:20px;">&#10023;</span> Using with AI Assistants
      </h3>
      <p style="font-size:14px;color:var(--muted);margin-bottom:20px;line-height:1.5;">These apps render as interactive UIs inside MCP-compatible AI hosts. The AI calls a tool, and the app appears inline in the conversation.</p>

      <div style="margin-bottom:20px;">
        <div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">MCP Server URL</div>
        <div style="display:flex;gap:8px;">
          <input class="auth-input" id="mcp-url-display" type="text" readonly value="${serverUrl}" style="flex:1;cursor:text;" />
          <button class="btn btn-primary btn-sm" id="btn-copy-mcp-url">Copy</button>
        </div>
      </div>

      <div style="font-size:14px;font-weight:600;color:var(--text-heading);margin-bottom:12px;">Setup by Host</div>

      <div style="margin-bottom:16px;padding:14px;background:var(--input-bg);border:1px solid var(--border);border-radius:8px;">
        <div style="font-size:13px;font-weight:600;color:var(--brand-light);margin-bottom:6px;">Claude (claude.ai / Claude Desktop)</div>
        <ol style="font-size:13px;color:var(--muted);padding-left:20px;line-height:1.8;">
          <li>Go to <strong>Settings &rarr; Connectors &rarr; Add Custom Connector</strong></li>
          <li>Paste the MCP Server URL above</li>
          <li>Start a new chat and ask Claude to use any of the 25 tools</li>
          <li>The app renders as an interactive UI inside the conversation</li>
        </ol>
        <div style="font-size:11px;color:var(--muted);margin-top:6px;font-style:italic;">Requires Claude Pro, Max, or Team plan for custom connectors.</div>
      </div>

      <div style="margin-bottom:16px;padding:14px;background:var(--input-bg);border:1px solid var(--border);border-radius:8px;">
        <div style="font-size:13px;font-weight:600;color:var(--brand-light);margin-bottom:6px;">VS Code / GitHub Copilot</div>
        <ol style="font-size:13px;color:var(--muted);padding-left:20px;line-height:1.8;">
          <li>Open VS Code Settings (<code style="background:var(--border);padding:1px 4px;border-radius:3px;font-size:12px;">Cmd+,</code>)</li>
          <li>Search for <code style="background:var(--border);padding:1px 4px;border-radius:3px;font-size:12px;">mcp</code></li>
          <li>Add a new MCP server with the URL above</li>
        </ol>
      </div>

      <div style="margin-bottom:16px;padding:14px;background:var(--input-bg);border:1px solid var(--border);border-radius:8px;">
        <div style="font-size:13px;font-weight:600;color:var(--brand-light);margin-bottom:6px;">Other Hosts (Goose, Postman, MCPJam)</div>
        <p style="font-size:13px;color:var(--muted);line-height:1.6;">Add the MCP Server URL as a remote StreamableHTTP server in your host's MCP configuration. See <a href="https://modelcontextprotocol.io/extensions/apps" target="_blank" style="color:var(--brand-light);">MCP Apps documentation</a> for host-specific guides.</p>
      </div>

      <div style="margin-bottom:16px;padding:14px;background:var(--input-bg);border:1px solid var(--border);border-radius:8px;">
        <div style="font-size:13px;font-weight:600;color:var(--brand-light);margin-bottom:6px;">Local Development (tunnel)</div>
        <p style="font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:8px;">If running locally, expose your server to the internet:</p>
        <code style="display:block;background:var(--border);padding:10px 12px;border-radius:6px;font-size:12px;color:var(--text);font-family:var(--mono);">npx cloudflared tunnel --url http://localhost:3001</code>
        <p style="font-size:12px;color:var(--muted);margin-top:6px;">Use the generated tunnel URL + <code style="font-size:11px;">/mcp</code> as your connector URL.</p>
      </div>

      <div style="padding:12px 14px;background:rgba(6,106,171,0.08);border:1px solid rgba(6,106,171,0.2);border-radius:8px;font-size:12px;color:var(--brand-light);line-height:1.5;">
        <strong>Environment variable:</strong> Set <code style="font-size:11px;">MARKETCHECK_API_KEY</code> on the server for live data in MCP mode. Without it, apps will use mock data.
      </div>
    </div>
  `;
  section.appendChild(mcpPanel);

  // Copy MCP URL button
  setTimeout(() => {
    document.getElementById("btn-copy-mcp-url")?.addEventListener("click", () => {
      navigator.clipboard.writeText(serverUrl);
      const btn = document.getElementById("btn-copy-mcp-url")!;
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = "Copy"; }, 2000);
    });
  }, 0);
}

// ── Auth Panel ──────────────────────────────────────────────────────────

function renderAuthPanel() {
  const wrapper = document.createElement("div");
  wrapper.className = "auth-panel";
  wrapper.innerHTML = `
    <div class="auth-container" id="auth-container">
      <div class="auth-tabs">
        <button class="auth-tab active" data-tab="0">API Key</button>
        <button class="auth-tab" data-tab="1">OAuth Token (Embed)</button>
      </div>
      <div class="auth-body">
        <!-- Tab 0: API Key -->
        <div class="auth-pane active" id="auth-pane-0">
          <div class="auth-field">
            <label class="auth-label">MarketCheck API Key</label>
            <input class="auth-input" id="inp-api-key" type="password" placeholder="Enter your API key" value="${getApiKey() ?? ""}" />
          </div>
          <div style="display:flex;gap:12px;">
            <button class="btn btn-primary btn-sm" id="btn-save-key">Save Key</button>
            <button class="btn btn-secondary btn-sm" id="btn-clear-key">Clear</button>
          </div>
          <div class="auth-hint" style="margin-top:12px;">
            Don't have an API key? <a href="https://developers.marketcheck.com" target="_blank">Sign up free at developers.marketcheck.com</a>
          </div>
          <div class="auth-warning">
            API keys stored in your browser are suitable for personal use. For embedding apps on your website, use OAuth tokens instead &mdash; they expire automatically and can be revoked.
          </div>
        </div>

        <!-- Tab 1: OAuth -->
        <div class="auth-pane" id="auth-pane-1">
          <div class="auth-row">
            <div class="auth-field">
              <label class="auth-label">Client ID (API Key)</label>
              <input class="auth-input" id="inp-client-id" type="text" placeholder="Your API key" />
            </div>
            <div class="auth-field">
              <label class="auth-label">Client Secret</label>
              <input class="auth-input" id="inp-client-secret" type="password" placeholder="Your client secret" />
            </div>
          </div>
          <button class="btn btn-primary btn-sm" id="btn-gen-token" style="margin-top:12px;">Generate Access Token</button>
          <div class="auth-hint">
            Generate credentials at <a href="https://developers.marketcheck.com/api-keys" target="_blank">developers.marketcheck.com/api-keys</a>
          </div>

          <div class="token-display" id="token-display">
            <div class="auth-label">Access Token</div>
            <div class="token-value" id="token-value"></div>
            <div class="token-meta">
              <span id="token-expiry">Expires in 6 hours</span>
              <button class="btn btn-secondary btn-sm" id="btn-copy-token">Copy Token</button>
            </div>
          </div>

          <div class="embed-snippet" id="embed-snippet"></div>
          <button class="btn btn-secondary btn-sm" id="btn-copy-embed" style="margin-top:8px;display:none;">Copy Embed Snippet</button>

          <div class="auth-warning" style="margin-top:16px;">
            OAuth tokens expire in 6 hours and can be <a href="https://developers.marketcheck.com/api-keys" target="_blank" style="color:var(--yellow);">revoked anytime</a>. Never embed your API key or client secret directly in iframe URLs.
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);

  // Tab switching
  wrapper.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const idx = tab.getAttribute("data-tab")!;
      wrapper.querySelectorAll(".auth-tab").forEach((t, i) => t.classList.toggle("active", i === parseInt(idx)));
      wrapper.querySelectorAll(".auth-pane").forEach((p, i) => p.classList.toggle("active", i === parseInt(idx)));
    });
  });

  // Save API key
  document.getElementById("btn-save-key")?.addEventListener("click", () => {
    const key = (document.getElementById("inp-api-key") as HTMLInputElement).value.trim();
    if (key) {
      localStorage.setItem("mc_api_key", key);
      refreshBadges();
      showToast("API key saved. Apps will now use live data.");
    }
  });

  // Clear
  document.getElementById("btn-clear-key")?.addEventListener("click", () => {
    localStorage.removeItem("mc_api_key");
    localStorage.removeItem("mc_access_token");
    (document.getElementById("inp-api-key") as HTMLInputElement).value = "";
    refreshBadges();
    showToast("API key cleared. Apps will use demo data.");
  });

  // Generate OAuth token
  document.getElementById("btn-gen-token")?.addEventListener("click", async () => {
    const clientId = (document.getElementById("inp-client-id") as HTMLInputElement).value.trim();
    const clientSecret = (document.getElementById("inp-client-secret") as HTMLInputElement).value.trim();
    if (!clientId || !clientSecret) return;

    const btn = document.getElementById("btn-gen-token") as HTMLButtonElement;
    btn.textContent = "Generating...";
    btn.disabled = true;

    try {
      const r = await fetch("/api/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
      });
      const data = await r.json();
      if (data.access_token) {
        localStorage.setItem("mc_access_token", data.access_token);
        const display = document.getElementById("token-display")!;
        display.classList.add("visible");
        document.getElementById("token-value")!.textContent = data.access_token;
        document.getElementById("token-expiry")!.textContent = `Expires in ${data.expires_in ? Math.round(data.expires_in / 3600) : 6} hours`;

        // Show embed snippet
        const snippet = document.getElementById("embed-snippet")!;
        snippet.classList.add("visible");
        snippet.textContent = `<iframe\n  src="${location.origin}/apps/deal-evaluator/dist/index.html?access_token=${data.access_token}&embed=true"\n  width="100%" height="700"\n  style="border:none;border-radius:8px;"\n></iframe>`;
        document.getElementById("btn-copy-embed")!.style.display = "inline-flex";

        refreshBadges();
      } else {
        alert(data.error || "Failed to generate token");
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      btn.textContent = "Generate Access Token";
      btn.disabled = false;
    }
  });

  // Copy buttons
  document.getElementById("btn-copy-token")?.addEventListener("click", () => {
    const token = document.getElementById("token-value")?.textContent;
    if (token) navigator.clipboard.writeText(token);
  });
  document.getElementById("btn-copy-embed")?.addEventListener("click", () => {
    const snippet = document.getElementById("embed-snippet")?.textContent;
    if (snippet) navigator.clipboard.writeText(snippet);
  });
}

// ── Category Nav Strip ──────────────────────────────────────────────────

function renderCategoryNav() {
  const counts = new Map<string, number>();
  for (const app of APPS) {
    counts.set(app.segment, (counts.get(app.segment) ?? 0) + 1);
  }

  const strip = document.createElement("div");
  strip.className = "category-nav";

  for (const seg of SEGMENTS) {
    const count = counts.get(seg.name);
    if (!count) continue;
    const segId = seg.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const chip = document.createElement("a");
    chip.href = `#seg-${segId}`;
    chip.className = "category-chip";
    chip.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${seg.color};flex-shrink:0;"></span>${seg.name}<span class="chip-count">${count}</span>`;
    strip.appendChild(chip);
  }

  document.body.appendChild(strip);
}

// ── API Key Banner (shown above apps when no key is set) ────────────────

function renderApiKeyBanner() {
  const existing = document.getElementById("api-key-banner");
  if (existing) existing.remove();

  const banner = document.createElement("div");
  banner.id = "api-key-banner";
  const hasKey = isLive();

  banner.innerHTML = `
    <div style="max-width:900px;margin:0 auto 24px;padding:18px 24px;border-radius:12px;background:${hasKey ? "var(--green-bg,#05966922)" : "var(--yellow-bg,#92400e33)"};border:1px solid ${hasKey ? "var(--green,#34d399)33" : "var(--yellow,#fbbf24)44"};display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
      <div style="flex:1;min-width:200px;">
        <div style="font-weight:700;font-size:15px;color:var(--text);margin-bottom:4px;">
          ${hasKey ? "&#10003; API Key Active &mdash; Apps show live market data" : "&#9888; No API Key Set &mdash; Apps will show demo data"}
        </div>
        <div style="font-size:13px;color:var(--text-sec);">
          ${hasKey ? "Your MarketCheck API key is saved. All apps will fetch real-time data." : "Enter your MarketCheck API key to see real market data in all apps."}
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
        <input id="banner-api-key" type="password" placeholder="${hasKey ? "••••••••••••" : "Enter your API key"}" value="${getApiKey() ?? ""}"
          style="padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;width:240px;" />
        <button id="banner-save-key" style="padding:8px 16px;border-radius:8px;border:none;background:var(--brand);color:#fff;font-weight:600;font-size:13px;cursor:pointer;white-space:nowrap;">
          ${hasKey ? "Update" : "Save & Activate"}
        </button>
        ${hasKey ? '<button id="banner-clear-key" style="padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text-sec);font-size:13px;cursor:pointer;">Clear</button>' : ""}
      </div>
    </div>
  `;

  document.body.appendChild(banner);

  document.getElementById("banner-save-key")?.addEventListener("click", () => {
    const key = (document.getElementById("banner-api-key") as HTMLInputElement).value.trim();
    if (key) {
      localStorage.setItem("mc_api_key", key);
      refreshBadges();
      renderApiKeyBanner();
      showToast("API key saved — apps will now show live data");
    }
  });

  document.getElementById("banner-clear-key")?.addEventListener("click", () => {
    localStorage.removeItem("mc_api_key");
    localStorage.removeItem("mc_access_token");
    refreshBadges();
    renderApiKeyBanner();
    showToast("API key cleared");
  });
}

// ── App Grid ────────────────────────────────────────────────────────────

function renderApps() {
  renderApiKeyBanner();

  const section = document.createElement("section");
  section.className = "apps section";
  section.id = "apps";
  section.innerHTML = `<div class="section-title">All Apps</div>`;

  // Group by segment
  const grouped = new Map<string, AppDef[]>();
  for (const app of APPS) {
    if (!grouped.has(app.segment)) grouped.set(app.segment, []);
    grouped.get(app.segment)!.push(app);
  }

  let delay = 0;
  for (const seg of SEGMENTS) {
    const apps = grouped.get(seg.name);
    if (!apps) continue;

    const segId = seg.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const group = document.createElement("div");
    group.className = "segment-group";
    group.id = `seg-${segId}`;
    group.style.scrollMarginTop = "80px";
    group.innerHTML = `
      <div class="segment-header">
        <div class="segment-dot" style="background:${seg.color};"></div>
        <div class="segment-name">${seg.name}</div>
        <div class="segment-count">${apps.length} app${apps.length > 1 ? "s" : ""}</div>
      </div>
    `;

    const grid = document.createElement("div");
    grid.className = "app-grid";

    for (const app of apps) {
      const live = isLive();
      const isReady = READY_APPS.has(app.id);

      const card = document.createElement("div");
      card.className = `app-card stagger${isReady ? "" : " coming-soon"}`;
      card.style.animationDelay = `${delay * 0.04}s`;
      delay++;

      const shareText = encodeURIComponent(`Check out ${app.name} — ${app.tagline}. Free interactive automotive dashboard powered by MarketCheck.`);
      const shareUrl = encodeURIComponent(`${location.origin}/apps/${app.id}/dist/index.html`);
      const screenshotUrl = `/assets/screenshots/${app.id}.png`;
      const formUrl = `/assets/screenshots/${app.id}-form.png`;
      const resultUrl = `/assets/screenshots/${app.id}-result.png`;

      // Apps with form+result screenshots get a carousel
      const hasCarousel = [
        "trade-in-estimator", "deal-evaluator", "appraiser-workbench",
        "car-search-compare", "earnings-signal-dashboard", "claims-valuation-workbench",
        "comparables-explorer", "oem-incentives-explorer", "car-search-app"
      ].includes(app.id);

      const thumbnailHtml = hasCarousel ? `
        <div class="app-thumbnail" data-app-id="${app.id}" title="Click to preview">
          <div class="carousel-images" data-slide="0">
            <img src="${screenshotUrl}" alt="${app.name}" loading="lazy" onerror="this.style.display='none'" />
            <img src="${resultUrl}" alt="${app.name} result" loading="lazy" />
          </div>
          <button class="carousel-nav carousel-prev" data-dir="-1">&#8249;</button>
          <button class="carousel-nav carousel-next" data-dir="1">&#8250;</button>
          <div class="carousel-dots"><span class="carousel-dot active"></span><span class="carousel-dot"></span></div>
          <span class="zoom-hint">&#128269; Preview</span>
        </div>
      ` : `
        <div class="app-thumbnail" data-app-id="${app.id}" title="Click to preview">
          <img src="${screenshotUrl}" alt="${app.name} preview" loading="lazy" onerror="this.parentElement.style.display='none'" />
          <span class="zoom-hint">&#128269; Preview</span>
        </div>
      `;

      card.innerHTML = `
        <div style="position:relative;">
          ${thumbnailHtml}
          <div class="thumb-overlay-btns">
            <button class="app-share-btn" title="Share" data-share-id="${app.id}">&#8599;</button>
            <div class="share-menu" id="share-menu-${app.id}">
              <a href="https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}" target="_blank">&#120143; Post on X</a>
              <a href="https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}" target="_blank">&#128279; Share on LinkedIn</a>
              <button class="copy-link-btn" data-url="${location.origin}/apps/${app.id}/dist/index.html">&#128203; Copy Link</button>
            </div>
          </div>
        </div>
        <div class="app-top">
          <a href="/app/${app.id}/" class="app-name-link">${app.name}</a>
          <span class="app-mode-badge ${live ? "live" : "demo"}">${live ? "LIVE" : "DEMO"}</span>
        </div>
        <div class="app-tagline">${app.tagline}</div>
        <div class="app-footer">
          <a href="/app/${app.id}/" class="app-details-btn">How to build?</a>
          <button class="app-open-btn" data-app-id="${app.id}" data-app-name="${app.name}">${isReady ? "Launch App &#8594;" : "Coming Soon"}</button>
        </div>
      `;

      // Open button click handler — always show modal for key confirmation
      card.querySelector(".app-open-btn")!.addEventListener("click", (e) => {
        e.preventDefault();
        const id = (e.currentTarget as HTMLElement).getAttribute("data-app-id")!;
        const name = (e.currentTarget as HTMLElement).getAttribute("data-app-name")!;
        showAppOpenModal(id, name);
      });

      // Carousel navigation
      const carouselImages = card.querySelector(".carousel-images") as HTMLElement | null;
      if (carouselImages) {
        const navBtns = card.querySelectorAll(".carousel-nav");
        const dots = card.querySelectorAll(".carousel-dot");
        let currentSlide = 0;
        const totalSlides = 2;

        const goToSlide = (idx: number) => {
          currentSlide = Math.max(0, Math.min(idx, totalSlides - 1));
          carouselImages.style.transform = `translateX(-${currentSlide * 100}%)`;
          dots.forEach((d, i) => d.classList.toggle("active", i === currentSlide));
        };

        navBtns.forEach(btn => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const dir = parseInt((btn as HTMLElement).getAttribute("data-dir")!);
            goToSlide(currentSlide + dir);
          });
        });

        dots.forEach((dot, i) => {
          dot.addEventListener("click", (e) => { e.stopPropagation(); goToSlide(i); });
        });

        // Auto-rotate every 3 seconds
        let autoTimer = setInterval(() => goToSlide((currentSlide + 1) % totalSlides), 3000);
        card.querySelector(".app-thumbnail")?.addEventListener("mouseenter", () => clearInterval(autoTimer));
        card.querySelector(".app-thumbnail")?.addEventListener("mouseleave", () => {
          autoTimer = setInterval(() => goToSlide((currentSlide + 1) % totalSlides), 3000);
        });
      }

      // Thumbnail click → lightbox with carousel if available
      const appImages = hasCarousel ? [screenshotUrl, resultUrl] : [screenshotUrl];
      card.querySelector(".app-thumbnail")?.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest(".carousel-nav, .carousel-dot")) return;
        showLightbox(appImages, app.name);
      });

      // Share button
      card.querySelector(".app-share-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        const menu = document.getElementById(`share-menu-${app.id}`);
        // Close all other menus
        document.querySelectorAll(".share-menu.open").forEach(m => { if (m !== menu) m.classList.remove("open"); });
        menu?.classList.toggle("open");
      });

      // Copy link button
      card.querySelector(".copy-link-btn")?.addEventListener("click", (e) => {
        const url = (e.currentTarget as HTMLElement).getAttribute("data-url")!;
        navigator.clipboard.writeText(url);
        showToast("Link copied to clipboard");
        document.querySelectorAll(".share-menu.open").forEach(m => m.classList.remove("open"));
      });

      card.setAttribute("data-app-id", app.id);
      grid.appendChild(card);
    }

    group.appendChild(grid);
    section.appendChild(group);
  }

  document.body.appendChild(section);
}

// ── Footer ──────────────────────────────────────────────────────────────

function renderFooter() {
  const footer = document.createElement("footer");
  footer.className = "footer";
  footer.innerHTML = `
    <div class="footer-text">
      Powered by <a href="https://www.marketcheck.com" target="_blank">MarketCheck</a>
      <span class="footer-sep">|</span>
      <a href="https://apidocs.marketcheck.com" target="_blank">API Docs</a>
      <span class="footer-sep">|</span>
      <a href="https://developers.marketcheck.com" target="_blank">Developer Portal</a>
      <span class="footer-sep">|</span>
      Built with <a href="https://modelcontextprotocol.io/extensions/apps" target="_blank">MCP Apps</a>
      <span class="footer-sep">|</span>
      <a href="https://github.com/MarketcheckHub/marketcheck-mcp-apps" target="_blank">GitHub</a>
    </div>
  `;
  document.body.appendChild(footer);
}

// ── Toast Notification ──────────────────────────────────────────────────

function showToast(message: string) {
  let toast = document.getElementById("mc-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "mc-toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast!.classList.remove("show"), 3000);
}

// ── Lightbox ────────────────────────────────────────────────────────────

function showLightbox(images: string | string[], alt: string) {
  const srcs = Array.isArray(images) ? images : [images];
  let currentIdx = 0;
  const overlay = document.createElement("div");
  overlay.className = "lightbox-overlay";

  const isCarousel = srcs.length > 1;

  overlay.innerHTML = `
    <button class="lightbox-close">&times;</button>
    <div style="position:relative;max-width:92vw;max-height:88vh;display:flex;align-items:center;">
      ${isCarousel ? `<button class="carousel-nav carousel-prev" style="position:absolute;left:-40px;opacity:1;width:36px;height:36px;font-size:18px;z-index:2;">&#8249;</button>` : ""}
      <img id="lightbox-img" src="${srcs[0]}" alt="${alt}" style="max-width:92vw;max-height:88vh;border-radius:8px;box-shadow:0 16px 64px rgba(0,0,0,0.5);cursor:default;transition:opacity 0.2s;" />
      ${isCarousel ? `<button class="carousel-nav carousel-next" style="position:absolute;right:-40px;opacity:1;width:36px;height:36px;font-size:18px;z-index:2;">&#8250;</button>` : ""}
    </div>
    ${isCarousel ? `<div style="position:fixed;bottom:24px;display:flex;gap:8px;">${srcs.map((_, i) => `<span class="carousel-dot ${i === 0 ? "active" : ""}" data-idx="${i}" style="width:8px;height:8px;cursor:pointer;"></span>`).join("")}</div>` : ""}
  `;
  document.body.appendChild(overlay);

  const img = document.getElementById("lightbox-img") as HTMLImageElement;
  const dots = overlay.querySelectorAll(".carousel-dot");

  const goTo = (idx: number) => {
    currentIdx = ((idx % srcs.length) + srcs.length) % srcs.length;
    img.style.opacity = "0";
    setTimeout(() => { img.src = srcs[currentIdx]; img.style.opacity = "1"; }, 150);
    dots.forEach((d, i) => d.classList.toggle("active", i === currentIdx));
  };

  // Auto-rotate
  let autoTimer = isCarousel ? setInterval(() => goTo(currentIdx + 1), 3500) : 0;

  overlay.querySelector(".carousel-prev")?.addEventListener("click", (e) => { e.stopPropagation(); clearInterval(autoTimer); goTo(currentIdx - 1); });
  overlay.querySelector(".carousel-next")?.addEventListener("click", (e) => { e.stopPropagation(); clearInterval(autoTimer); goTo(currentIdx + 1); });
  dots.forEach(d => d.addEventListener("click", (e) => { e.stopPropagation(); clearInterval(autoTimer); goTo(parseInt((d as HTMLElement).getAttribute("data-idx")!)); }));

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || (e.target as HTMLElement).classList.contains("lightbox-close")) {
      clearInterval(autoTimer);
      overlay.remove();
    }
  });
  document.addEventListener("keydown", function handler(e) {
    if (e.key === "Escape") { clearInterval(autoTimer); overlay.remove(); document.removeEventListener("keydown", handler); }
    if (e.key === "ArrowRight") { clearInterval(autoTimer); goTo(currentIdx + 1); }
    if (e.key === "ArrowLeft") { clearInterval(autoTimer); goTo(currentIdx - 1); }
  });
}

// Close share menus on outside click
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (!target.closest(".app-share-btn") && !target.closest(".share-menu")) {
    document.querySelectorAll(".share-menu.open").forEach(m => m.classList.remove("open"));
  }
});

// ── Badge Refresh ───────────────────────────────────────────────────────

function refreshBadges() {
  const live = isLive();
  document.querySelectorAll(".app-mode-badge").forEach((badge) => {
    badge.className = `app-mode-badge ${live ? "live" : "demo"}`;
    badge.textContent = live ? "LIVE" : "DEMO";
  });

  // Update Open links with auth params
  const authParam = getAccessToken()
    ? `access_token=${encodeURIComponent(getAccessToken()!)}`
    : getApiKey()
    ? `api_key=${encodeURIComponent(getApiKey()!)}`
    : "";

  document.querySelectorAll<HTMLAnchorElement>(".app-open-btn").forEach((btn) => {
    const card = btn.closest(".app-card");
    const appId = card?.getAttribute("data-app-id");
    if (appId) {
      btn.href = `/apps/${appId}/dist/index.html${authParam ? "?" + authParam : ""}`;
    }
  });
}

// ── Init ────────────────────────────────────────────────────────────────

render();
