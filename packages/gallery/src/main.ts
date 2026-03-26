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
  { name: "Appraiser", color: "#3b82f6", icon: "&#9878;" },
  { name: "Dealer", color: "#f59e0b", icon: "&#9881;" },
  { name: "Dealership Group", color: "#f97316", icon: "&#9632;" },
  { name: "Analyst", color: "#8b5cf6", icon: "&#9650;" },
  { name: "Lender", color: "#06b6d4", icon: "&#9670;" },
  { name: "Insurer", color: "#ec4899", icon: "&#9829;" },
  { name: "Manufacturer", color: "#ef4444", icon: "&#9733;" },
  { name: "Auction House", color: "#84cc16", icon: "&#9654;" },
  { name: "Lender Sales", color: "#14b8a6", icon: "&#8599;" },
  { name: "Cross-Segment", color: "#a78bfa", icon: "&#8854;" },
];

const APPS: AppDef[] = [
  { id: "used-car-market-index", name: "Used Car Market Index", tagline: "Track prices like Wall Street tracks stocks", segment: "Consumer" },
  { id: "trade-in-estimator", name: "Trade-In Estimator", tagline: "What's your car worth? 3-tier instant valuation", segment: "Consumer" },
  { id: "deal-evaluator", name: "Deal Evaluator", tagline: "Should I buy this car? Get a Buy/Negotiate/Pass verdict", segment: "Consumer" },
  { id: "car-search-compare", name: "Car Search & Compare", tagline: "Find and compare cars side by side", segment: "Consumer" },
  { id: "oem-incentives-explorer", name: "OEM Incentives Explorer", tagline: "Cash back, APR, and lease deals by ZIP", segment: "Consumer" },
  { id: "appraiser-workbench", name: "Appraiser Workbench", tagline: "Complete vehicle valuation studio", segment: "Appraiser" },
  { id: "comparables-explorer", name: "Comparables Explorer", tagline: "Price distribution and market positioning", segment: "Appraiser" },
  { id: "depreciation-analyzer", name: "Depreciation Analyzer", tagline: "Track how vehicles lose value over time", segment: "Appraiser" },
  { id: "market-trends-dashboard", name: "Market Trends Dashboard", tagline: "The pulse of the automotive market", segment: "Appraiser" },
  { id: "lot-pricing-dashboard", name: "Lot Pricing Dashboard", tagline: "See your entire lot priced against the market", segment: "Dealer" },
  { id: "stocking-intelligence", name: "Stocking Intelligence", tagline: "Know what to buy at auction", segment: "Dealer" },
  { id: "group-operations-center", name: "Group Operations Center", tagline: "Every store, one screen", segment: "Dealership Group" },
  { id: "location-benchmarking", name: "Location Benchmarking", tagline: "Rank and compare your locations", segment: "Dealership Group" },
  { id: "inventory-balancer", name: "Inventory Balancer", tagline: "Move the right cars to the right stores", segment: "Dealership Group" },
  { id: "earnings-signal-dashboard", name: "Earnings Signal Dashboard", tagline: "Pre-earnings channel check for auto tickers", segment: "Analyst" },
  { id: "watchlist-monitor", name: "Watchlist Monitor", tagline: "Morning signal scan across your portfolio", segment: "Analyst" },
  { id: "dealer-group-scorecard", name: "Dealer Group Scorecard", tagline: "Benchmark public dealer groups", segment: "Analyst" },
  { id: "portfolio-risk-monitor", name: "Portfolio Risk Monitor", tagline: "Track collateral health across your loan book", segment: "Lender" },
  { id: "ev-collateral-risk", name: "EV Collateral Risk Monitor", tagline: "EV vs ICE depreciation risk tracking", segment: "Lender" },
  { id: "claims-valuation-workbench", name: "Claims Valuation Workbench", tagline: "Total-loss determination with market evidence", segment: "Insurer" },
  { id: "brand-command-center", name: "Brand Command Center", tagline: "Your brands vs the competition", segment: "Manufacturer" },
  { id: "regional-demand-allocator", name: "Regional Demand Allocator", tagline: "Allocate inventory where demand is hottest", segment: "Manufacturer" },
  { id: "auction-lane-planner", name: "Auction Lane Planner", tagline: "Plan lanes, price consignments, target buyers", segment: "Auction House" },
  { id: "territory-pipeline", name: "Territory Pipeline", tagline: "Find dealers who need floor plan", segment: "Lender Sales" },
  { id: "ev-market-monitor", name: "EV Market Monitor", tagline: "The EV transition in one dashboard", segment: "Cross-Segment" },
];

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

/* ── Light Theme (default) ─────────────── */
:root, [data-theme="light"] {
  --bg: #f8fafc;
  --surface: #ffffff;
  --card: #ffffff;
  --border: #e2e8f0;
  --border-light: #cbd5e1;
  --text: #1e293b;
  --text-heading: #0f172a;
  --muted: #64748b;
  --brand: #066aab;
  --brand-light: #0987d4;
  --green: #059669;
  --yellow: #d97706;
  --purple: #7c3aed;
  --red: #dc2626;
  --pink: #db2777;
  --orange: #ea580c;
  --cyan: #0891b2;
  --card-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
  --card-hover-shadow: 0 4px 16px rgba(0,0,0,0.1);
  --hero-gradient-a: rgba(6, 106, 171, 0.06);
  --hero-gradient-b: rgba(6, 106, 171, 0.02);
  --hero-point-color: rgba(6, 106, 171, 0.2);
  --hero-line-color: rgba(6, 106, 171, 0.06);
  --hero-title-gradient: linear-gradient(135deg, #0f172a 0%, #1e3a5f 40%, #066aab 100%);
  --badge-demo-bg: rgba(217, 119, 6, 0.1);
  --badge-demo-fg: #b45309;
  --badge-live-bg: rgba(5, 150, 105, 0.1);
  --badge-live-fg: #047857;
  --input-bg: #f1f5f9;
  --scrollbar-thumb: #cbd5e1;
  --scrollbar-track: #f1f5f9;
  --font: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --mono: 'JetBrains Mono', 'SF Mono', monospace;
}

/* ── Dark Theme ───────────────────────── */
[data-theme="dark"] {
  --bg: #060a10;
  --surface: #0c1220;
  --card: #111827;
  --border: #1a2236;
  --border-light: #253046;
  --text: #e2e8f0;
  --text-heading: #f8fafc;
  --muted: #7a8ba8;
  --brand: #066aab;
  --brand-light: #0987d4;
  --green: #10b981;
  --yellow: #f59e0b;
  --purple: #8b5cf6;
  --red: #ef4444;
  --pink: #ec4899;
  --orange: #f97316;
  --cyan: #06b6d4;
  --card-shadow: 0 1px 3px rgba(0,0,0,0.3);
  --card-hover-shadow: 0 8px 32px rgba(0,0,0,0.3);
  --hero-gradient-a: rgba(6, 106, 171, 0.06);
  --hero-gradient-b: rgba(6, 106, 171, 0.02);
  --hero-point-color: rgba(6, 106, 171, 0.3);
  --hero-line-color: rgba(6, 106, 171, 0.08);
  --hero-title-gradient: linear-gradient(135deg, #fff 0%, #bfd4e8 40%, #066aab 100%);
  --badge-demo-bg: rgba(245, 158, 11, 0.15);
  --badge-demo-fg: #f59e0b;
  --badge-live-bg: rgba(16, 185, 129, 0.15);
  --badge-live-fg: #34d399;
  --input-bg: #0f172a;
  --scrollbar-thumb: #253046;
  --scrollbar-track: #060a10;
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

.hero {
  position: relative;
  min-height: 80vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 100px 24px 60px;
  overflow: hidden;
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
  gap: 6px;
  padding: 6px 16px;
  border-radius: 20px;
  background: rgba(6, 106, 171, 0.15);
  border: 1px solid rgba(6, 106, 171, 0.3);
  color: var(--brand-light);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 28px;
  animation: fadeInDown 0.8s ease;
}

.hero h1 {
  font-size: clamp(42px, 6vw, 72px);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -1.5px;
  background: var(--hero-title-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 16px;
  animation: fadeInUp 0.7s ease;
}

.hero .subtitle {
  font-size: clamp(16px, 2vw, 20px);
  color: var(--muted);
  max-width: 600px;
  margin: 0 auto 40px;
  font-weight: 400;
  animation: fadeInUp 0.7s ease 0.1s backwards;
}

.hero-ctas {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
  animation: fadeInUp 0.7s ease 0.2s backwards;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 14px 28px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  font-family: var(--font);
  cursor: pointer;
  border: none;
  transition: all 0.25s ease;
  text-decoration: none;
}

.btn-primary {
  background: var(--brand);
  color: #fff;
  box-shadow: 0 0 20px rgba(6, 106, 171, 0.3), inset 0 1px 0 rgba(255,255,255,0.1);
}
.btn-primary:hover {
  background: var(--brand-light);
  box-shadow: 0 0 30px rgba(6, 106, 171, 0.5), inset 0 1px 0 rgba(255,255,255,0.15);
  transform: translateY(-1px);
}

.btn-secondary {
  background: rgba(255,255,255,0.05);
  color: var(--text);
  border: 1px solid var(--border-light);
}
.btn-secondary:hover {
  background: rgba(255,255,255,0.1);
  border-color: var(--muted);
  transform: translateY(-1px);
}

.hero-stats {
  display: flex;
  gap: 40px;
  justify-content: center;
  margin-top: 56px;
  animation: fadeInUp 0.7s ease 0.35s backwards;
}

.hero-stat {
  text-align: center;
}
.hero-stat .val {
  font-size: 32px;
  font-weight: 700;
  font-family: var(--mono);
  color: var(--text-heading);
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

[data-theme="light"] .top-nav { background: rgba(255,255,255,0.85); }
[data-theme="dark"] .top-nav { background: rgba(12,18,32,0.85); }

.nav-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.nav-logo {
  height: 28px;
  border-radius: 5px;
}

.nav-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-heading);
  letter-spacing: -0.3px;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nav-link {
  font-size: 13px;
  color: var(--muted);
  text-decoration: none;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: color 0.2s;
}
.nav-link:hover { color: var(--text); }

.nav-github {
  padding: 6px 14px;
  border-radius: 6px;
  background: var(--card);
  border: 1px solid var(--border);
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}
.nav-github:hover {
  border-color: var(--brand);
  color: var(--brand-light);
}

.nav-github svg {
  width: 16px;
  height: 16px;
  fill: currentColor;
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

@media (max-width: 640px) {
  .hero { min-height: 70vh; padding: 60px 16px 40px; }
  .hero-stats { gap: 24px; }
  .hero-stat .val { font-size: 24px; }
  .mode-grid { grid-template-columns: 1fr; }
  .app-grid { grid-template-columns: 1fr; }
  .auth-row { flex-direction: column; }
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
  renderModes();
  renderAuthPanel();
  renderApps();
  renderFooter();
}

let heroCanvas: HTMLCanvasElement | null = null;

// ── Top Nav ─────────────────────────────────────────────────────────────

function renderTopNav() {
  const nav = document.createElement("nav");
  nav.className = "top-nav";
  nav.innerHTML = `
    <div class="nav-left">
      <img src="https://34682200.delivery.rocketcdn.me/wp-content/uploads/2024/05/cropped-MC-Icon.png.webp" alt="MC" class="nav-logo" />
      <span class="nav-title">MarketCheck Apps</span>
    </div>
    <div class="nav-right">
      <a href="#apps" class="nav-link">Apps</a>
      <a href="https://apidocs.marketcheck.com" target="_blank" class="nav-link">API Docs</a>
      <a href="https://developers.marketcheck.com" target="_blank" class="nav-link">Developer Portal</a>
      <a href="https://github.com/MarketcheckHub/marketcheck-mcp-apps" target="_blank" class="nav-github">
        <svg viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        Open Source
      </a>
      <button class="theme-toggle" id="theme-toggle" title="Toggle theme" style="position:static;width:36px;height:36px;font-size:16px;">&#9789;</button>
    </div>
  `;
  document.body.appendChild(nav);

  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const next = getTheme() === "light" ? "dark" : "light";
    setTheme(next);
    document.getElementById("theme-toggle")!.innerHTML = next === "light" ? "&#9789;" : "&#9788;";
    if (heroCanvas) initHeroBg(heroCanvas);
  });

  // Update toggle icon to match current theme
  setTimeout(() => {
    const btn = document.getElementById("theme-toggle");
    if (btn) btn.innerHTML = getTheme() === "light" ? "&#9789;" : "&#9788;";
  }, 0);
}

// ── App Open Modal ──────────────────────────────────────────────────────

function showAppOpenModal(appId: string, appName: string) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  overlay.innerHTML = `
    <div class="modal">
      <h3>Open ${appName}</h3>
      <p>This app works with demo data or live MarketCheck data. How would you like to proceed?</p>
      <div class="auth-field" id="modal-key-field" style="display:none;">
        <label class="auth-label">MarketCheck API Key</label>
        <input class="auth-input" id="modal-api-key" type="password" placeholder="Enter your API key" />
        <div class="auth-hint" style="margin-top:6px;">
          Get a free key at <a href="https://developers.marketcheck.com" target="_blank">developers.marketcheck.com</a>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="modal-demo">View Demo</button>
        <button class="btn btn-primary" id="modal-live">Use API Key</button>
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

  // Demo button → open app with no key
  document.getElementById("modal-demo")!.addEventListener("click", () => {
    overlay.remove();
    window.open(`/apps/${appId}/dist/index.html`, "_blank");
  });

  // Live button → toggle key input or open with key
  document.getElementById("modal-live")!.addEventListener("click", () => {
    if (keyField.style.display === "none") {
      // First click: show key input
      keyField.style.display = "block";
      keyInput.value = getApiKey() ?? "";
      keyInput.focus();
      document.getElementById("modal-live")!.textContent = "Open with Key";
    } else {
      // Second click: save key and open
      const key = keyInput.value.trim();
      if (key) {
        localStorage.setItem("mc_api_key", key);
        refreshBadges();
        overlay.remove();
        window.open(`/apps/${appId}/dist/index.html?api_key=${encodeURIComponent(key)}`, "_blank");
      }
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
    <div class="hero-badge"><img src="https://34682200.delivery.rocketcdn.me/wp-content/uploads/2024/05/cropped-MC-Icon.png.webp" alt="MC" style="height:16px;vertical-align:middle;margin-right:6px;border-radius:3px;" />Powered by MarketCheck Data</div>
    <h1><img src="https://34682200.delivery.rocketcdn.me/wp-content/uploads/2024/05/cropped-MC-Icon.png.webp" alt="MarketCheck" style="height:56px;vertical-align:middle;margin-right:12px;border-radius:8px;" />MarketCheck Apps</h1>
    <p class="subtitle">25 interactive automotive market intelligence dashboards. Real-time data for dealers, appraisers, lenders, analysts, manufacturers, and consumers.</p>
    <div class="hero-ctas">
      <a href="#apps" class="btn btn-primary">Explore Apps &#8594;</a>
      <button class="btn btn-secondary" id="btn-connect">Connect Live Data</button>
    </div>
    <div class="hero-stats">
      <div class="hero-stat"><div class="val">25</div><div class="lbl">Apps</div></div>
      <div class="hero-stat"><div class="val">11</div><div class="lbl">Segments</div></div>
      <div class="hero-stat"><div class="val">9</div><div class="lbl">API Tools</div></div>
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
    { color: "yellow", icon: "&#9654;", badge: "DEMO", title: "Demo Mode", desc: "Browse all 25 apps with realistic sample data. No API key required.", link: null },
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

  document.getElementById("btn-show-embed")?.addEventListener("click", () => {
    const panel = document.getElementById("auth-container");
    if (panel) {
      panel.classList.add("open");
      // Switch to OAuth tab
      document.querySelectorAll(".auth-tab").forEach((t, i) => {
        t.classList.toggle("active", i === 1);
      });
      document.querySelectorAll(".auth-pane").forEach((p, i) => {
        p.classList.toggle("active", i === 1);
      });
      panel.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  // MCP setup modal
  document.getElementById("btn-show-mcp")?.addEventListener("click", () => {
    showMcpSetupModal();
  });
}

function showMcpSetupModal() {
  const serverUrl = location.origin + "/mcp";
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" style="max-width:580px;">
      <h3 style="display:flex;align-items:center;gap:8px;">
        <span style="color:var(--brand-light);font-size:22px;">&#10023;</span>
        Using with AI Assistants
      </h3>
      <p>These apps render as interactive UIs inside MCP-compatible AI hosts. The AI calls a tool, and the app appears inline in the conversation.</p>

      <div style="margin-bottom:20px;">
        <div class="auth-label">MCP Server URL</div>
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

      <div class="modal-actions" style="margin-top:20px;">
        <button class="btn btn-secondary" id="modal-mcp-close">Close</button>
        <a href="https://github.com/MarketcheckHub/marketcheck-mcp-apps" target="_blank" class="btn btn-primary" style="text-decoration:none;">View on GitHub</a>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.getElementById("modal-mcp-close")?.addEventListener("click", () => overlay.remove());
  document.getElementById("btn-copy-mcp-url")?.addEventListener("click", () => {
    navigator.clipboard.writeText(serverUrl);
    const btn = document.getElementById("btn-copy-mcp-url")!;
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = "Copy"; }, 2000);
  });
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

// ── App Grid ────────────────────────────────────────────────────────────

function renderApps() {
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

    const group = document.createElement("div");
    group.className = "segment-group";
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

      const card = document.createElement("div");
      card.className = "app-card stagger";
      card.style.animationDelay = `${delay * 0.04}s`;
      delay++;

      card.innerHTML = `
        <div class="app-top">
          <div class="app-name">${app.name}</div>
          <span class="app-mode-badge ${live ? "live" : "demo"}">${live ? "LIVE" : "DEMO"}</span>
        </div>
        <div class="app-tagline">${app.tagline}</div>
        <div class="app-footer">
          <span class="app-segment-badge" style="background:${seg.color}18;color:${seg.color};border:1px solid ${seg.color}33;">${seg.name}</span>
          <div style="display:flex;align-items:center;gap:8px;">
            <a href="https://github.com/MarketcheckHub/marketcheck-mcp-apps/tree/main/packages/apps/${app.id}" target="_blank" class="app-source-link" title="View Source">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
            </a>
            <button class="app-open-btn" data-app-id="${app.id}" data-app-name="${app.name}">Open &#8594;</button>
          </div>
        </div>
      `;

      // Open button click handler
      card.querySelector(".app-open-btn")!.addEventListener("click", (e) => {
        e.preventDefault();
        const id = (e.currentTarget as HTMLElement).getAttribute("data-app-id")!;
        const name = (e.currentTarget as HTMLElement).getAttribute("data-app-name")!;

        if (isLive()) {
          // Has auth — open directly with key
          const authParam = getAccessToken()
            ? `access_token=${encodeURIComponent(getAccessToken()!)}`
            : `api_key=${encodeURIComponent(getApiKey()!)}`;
          window.open(`/apps/${id}/dist/index.html?${authParam}`, "_blank");
        } else {
          // No auth — show modal with Demo / API Key options
          showAppOpenModal(id, name);
        }
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
