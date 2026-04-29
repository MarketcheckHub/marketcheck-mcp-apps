import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "ev-collateral-risk" }); } catch {}

// ── Dual-Mode Data Provider ────────────────────────────────────────────
function _getAuth(): { mode: "api_key" | "oauth_token" | null; value: string | null } {
  const params = new URLSearchParams(location.search);
  const token = params.get("access_token") ?? localStorage.getItem("mc_access_token");
  if (token) return { mode: "oauth_token", value: token };
  const key = params.get("api_key") ?? localStorage.getItem("mc_api_key");
  if (key) return { mode: "api_key", value: key };
  return { mode: null, value: null };
}

function _detectAppMode(): "mcp" | "live" | "demo" {
  if (_getAuth().value) return "live";
  if (_safeApp && window.parent !== window) return "mcp";
  return "demo";
}

function _isEmbedMode(): boolean {
  return new URLSearchParams(location.search).has("embed");
}

function _getUrlParams(): Record<string, string> {
  const params = new URLSearchParams(location.search);
  const result: Record<string, string> = {};
  for (const key of ["vin", "zip", "make", "model", "miles", "state", "dealer_id", "ticker"]) {
    const v = params.get(key);
    if (v) result[key] = v;
  }
  return result;
}

function _proxyBase(): string {
  return location.protocol.startsWith("http") ? "" : "http://localhost:3001";
}

// ── Direct MarketCheck API Helper ──────────────────────────────────────
const _MC = "https://api.marketcheck.com";

async function _mcApi(path: string, params: Record<string, any> = {}): Promise<any> {
  const auth = _getAuth();
  if (!auth.value) return null;
  const url = new URL(_MC + path);
  if (auth.mode === "api_key") url.searchParams.set("api_key", auth.value);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = {};
  if (auth.mode === "oauth_token") headers["Authorization"] = "Bearer " + auth.value;
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error("MC API " + res.status + (body ? ": " + body.slice(0, 200) : ""));
  }
  return res.json();
}

function _mcSold(p: Record<string, any>): Promise<any> {
  return _mcApi("/api/v1/sold-vehicles/summary", p);
}

function _monthRanges(n: number): Array<{ dateFrom: string; dateTo: string; label: string }> {
  const now = new Date();
  const ranges: Array<{ dateFrom: string; dateTo: string; label: string }> = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    ranges.push({
      dateFrom: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
      dateTo: `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
    });
  }
  return ranges;
}
// ── End Direct API Helper ──────────────────────────────────────────────

// Persists selected state filter across renders
let currentState: string | undefined;

async function _callTool(toolName: string, args: Record<string, any>): Promise<any> {
  if (_safeApp) {
    try {
      return await _safeApp.callServerTool({ name: toolName, arguments: args });
    } catch(e: any) { console.warn("_safeApp.callServerTool failed:", e?.message); }
  }
  return null;
}

function _addSettingsBar(headerEl?: HTMLElement) {
  if (_isEmbedMode() || !headerEl) return;
  const mode = _detectAppMode();
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;align-items:center;gap:8px;margin-left:auto;";
  const colors: Record<string, { bg: string; fg: string; label: string }> = {
    mcp:  { bg: "#1e40af22", fg: "#60a5fa", label: "MCP" },
    live: { bg: "#05966922", fg: "#34d399", label: "LIVE" },
    demo: { bg: "#92400e88", fg: "#fbbf24", label: "DEMO" },
  };
  const c = colors[mode];
  bar.innerHTML = `<span style="padding:3px 10px;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:0.5px;background:${c.bg};color:${c.fg};border:1px solid ${c.fg}33;">${c.label}</span>`;
  if (mode !== "mcp") {
    const gear = document.createElement("button");
    gear.innerHTML = "&#9881;";
    gear.title = "API Settings";
    gear.style.cssText = "background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;padding:4px;";
    const panel = document.createElement("div");
    panel.style.cssText = "display:none;position:fixed;top:50px;right:16px;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;z-index:1000;min-width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.5);";
    panel.innerHTML = `<div style="font-size:13px;font-weight:600;color:#f8fafc;margin-bottom:12px;">API Configuration</div>
      <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px;">MarketCheck API Key</label>
      <input id="_mc_key_inp" type="password" placeholder="Enter your API key" value="${_getAuth().mode === 'api_key' ? _getAuth().value ?? '' : ''}"
        style="width:100%;padding:8px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;margin-bottom:8px;box-sizing:border-box;" />
      <div style="font-size:10px;color:#64748b;margin-bottom:12px;">Get a free key at <a href="https://developers.marketcheck.com" target="_blank" style="color:#60a5fa;">developers.marketcheck.com</a></div>
      <div style="display:flex;gap:8px;">
        <button id="_mc_save" style="flex:1;padding:8px;border-radius:6px;border:none;background:#3b82f6;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Save & Reload</button>
        <button id="_mc_clear" style="padding:8px 12px;border-radius:6px;border:1px solid #334155;background:transparent;color:#94a3b8;font-size:13px;cursor:pointer;">Clear</button>
      </div>`;
    gear.addEventListener("click", () => { panel.style.display = panel.style.display === "none" ? "block" : "none"; });
    document.addEventListener("click", (e) => { if (!panel.contains(e.target as Node) && e.target !== gear) panel.style.display = "none"; });
    document.body.appendChild(panel);
    setTimeout(() => {
      document.getElementById("_mc_save")?.addEventListener("click", () => { const k = (document.getElementById("_mc_key_inp") as HTMLInputElement)?.value?.trim(); if (k) { localStorage.setItem("mc_api_key", k); location.reload(); } });
      document.getElementById("_mc_clear")?.addEventListener("click", () => { localStorage.removeItem("mc_api_key"); localStorage.removeItem("mc_access_token"); location.reload(); });
    }, 0);
    bar.appendChild(gear);
  }
  headerEl.appendChild(bar);
}
// ── End Data Provider ──────────────────────────────────────────────────

// ── Responsive CSS Injection ───────────────────────────────────────────
(function injectResponsiveStyles() {
  const s = document.createElement("style");
  s.textContent = `
    @media (max-width: 768px) {
      body { font-size: 13px !important; }
      table { font-size: 12px !important; }
      th, td { padding: 6px 8px !important; }
      h1 { font-size: 18px !important; }
      h2 { font-size: 15px !important; }
      canvas { max-width: 100% !important; }
      input, select, button { font-size: 14px !important; }
      [style*="display:flex"][style*="gap"],
      [style*="display: flex"][style*="gap"] { flex-wrap: wrap !important; }
      [style*="grid-template-columns: repeat"] { grid-template-columns: 1fr !important; }
      [style*="grid-template-columns:repeat"] { grid-template-columns: 1fr !important; }
      div[style*="overflow-x:auto"], div[style*="overflow-x: auto"] { -webkit-overflow-scrolling: touch; }
      table { min-width: 600px; }
      [style*="width:35%"], [style*="width:40%"], [style*="width:25%"],
      [style*="width:50%"], [style*="width:60%"], [style*="width:65%"],
      [style*="width: 35%"], [style*="width: 40%"], [style*="width: 25%"],
      [style*="width: 50%"], [style*="width: 60%"], [style*="width: 65%"] {
        width: 100% !important;
        min-width: 0 !important;
      }
    }
    @media (max-width: 480px) {
      body { padding: 8px !important; }
      h1 { font-size: 16px !important; }
      th, td { padding: 4px 6px !important; font-size: 11px !important; }
      input, select { max-width: 100% !important; width: 100% !important; box-sizing: border-box !important; }
    }
  `;
  document.head.appendChild(s);
})();

(_safeApp as any)?.connect?.();

// ─── Types ──────────────────────────────────────────────────────────────────

interface MonthlyPrice {
  month: string;
  evAvgPrice: number;
  iceAvgPrice: number;
}

interface BrandRisk {
  make: string;
  evVolume: number;
  evAvgPrice: number;
  evDepreciationRate: number;
  iceDepreciationRate: number;
  evIceRatio: number;
  riskTier: "LOW" | "MODERATE" | "ELEVATED" | "HIGH";
}

interface StateAdoption {
  state: string;
  evPenetration: number;
  evVolume: number;
  riskLevel: "LOW" | "MODERATE" | "HIGH";
}

interface ScorecardData {
  evPenetration: number;
  evPenetrationTrend: number;
  evAvgDepreciation: number;
  iceAvgDepreciation: number;
  evIceRatio: number;
  evDaysSupply: number;
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

const monthlyPrices: MonthlyPrice[] = [
  { month: "Apr 25", evAvgPrice: 48000, iceAvgPrice: 32000 },
  { month: "May 25", evAvgPrice: 47200, iceAvgPrice: 31850 },
  { month: "Jun 25", evAvgPrice: 46500, iceAvgPrice: 31700 },
  { month: "Jul 25", evAvgPrice: 45600, iceAvgPrice: 31550 },
  { month: "Aug 25", evAvgPrice: 44800, iceAvgPrice: 31400 },
  { month: "Sep 25", evAvgPrice: 43700, iceAvgPrice: 31200 },
  { month: "Oct 25", evAvgPrice: 42500, iceAvgPrice: 31050 },
  { month: "Nov 25", evAvgPrice: 41400, iceAvgPrice: 30850 },
  { month: "Dec 25", evAvgPrice: 40600, iceAvgPrice: 30650 },
  { month: "Jan 26", evAvgPrice: 39800, iceAvgPrice: 30400 },
  { month: "Feb 26", evAvgPrice: 39000, iceAvgPrice: 30200 },
  { month: "Mar 26", evAvgPrice: 38000, iceAvgPrice: 30000 },
];

const scorecard: ScorecardData = {
  evPenetration: 9.4,
  evPenetrationTrend: 1.2,
  evAvgDepreciation: 20.8,
  iceAvgDepreciation: 6.3,
  evIceRatio: 2.1,
  evDaysSupply: 92,
};

const brandRisks: BrandRisk[] = [
  { make: "Lucid",    evVolume: 2100,   evAvgPrice: 68500, evDepreciationRate: 34.2, iceDepreciationRate: 0,   evIceRatio: 0,    riskTier: "HIGH" },
  { make: "Rivian",   evVolume: 8400,   evAvgPrice: 62300, evDepreciationRate: 29.8, iceDepreciationRate: 0,   evIceRatio: 0,    riskTier: "HIGH" },
  { make: "Tesla",    evVolume: 142000, evAvgPrice: 38200, evDepreciationRate: 24.5, iceDepreciationRate: 0,   evIceRatio: 0,    riskTier: "HIGH" },
  { make: "Mercedes", evVolume: 9800,   evAvgPrice: 58700, evDepreciationRate: 22.1, iceDepreciationRate: 8.4, evIceRatio: 2.63, riskTier: "HIGH" },
  { make: "BMW",      evVolume: 14200,  evAvgPrice: 52100, evDepreciationRate: 19.7, iceDepreciationRate: 9.2, evIceRatio: 2.14, riskTier: "ELEVATED" },
  { make: "VW",       evVolume: 6300,   evAvgPrice: 34800, evDepreciationRate: 18.4, iceDepreciationRate: 7.8, evIceRatio: 2.36, riskTier: "ELEVATED" },
  { make: "Ford",     evVolume: 28500,  evAvgPrice: 41200, evDepreciationRate: 17.6, iceDepreciationRate: 8.1, evIceRatio: 2.17, riskTier: "ELEVATED" },
  { make: "GM",       evVolume: 22300,  evAvgPrice: 43500, evDepreciationRate: 16.2, iceDepreciationRate: 7.5, evIceRatio: 2.16, riskTier: "ELEVATED" },
  { make: "Hyundai",  evVolume: 18700,  evAvgPrice: 36900, evDepreciationRate: 14.8, iceDepreciationRate: 6.9, evIceRatio: 2.14, riskTier: "MODERATE" },
];

const stateAdoptions: StateAdoption[] = [
  { state: "California",    evPenetration: 24.6, evVolume: 312000, riskLevel: "HIGH" },
  { state: "Washington",    evPenetration: 16.8, evVolume: 48200,  riskLevel: "HIGH" },
  { state: "New Jersey",    evPenetration: 14.2, evVolume: 52100,  riskLevel: "HIGH" },
  { state: "Oregon",        evPenetration: 13.5, evVolume: 22400,  riskLevel: "HIGH" },
  { state: "Colorado",      evPenetration: 12.1, evVolume: 31500,  riskLevel: "MODERATE" },
  { state: "Massachusetts", evPenetration: 11.8, evVolume: 34800,  riskLevel: "MODERATE" },
  { state: "Connecticut",   evPenetration: 11.2, evVolume: 16200,  riskLevel: "MODERATE" },
  { state: "Maryland",      evPenetration: 10.9, evVolume: 28700,  riskLevel: "MODERATE" },
  { state: "Vermont",       evPenetration: 10.4, evVolume: 3200,   riskLevel: "MODERATE" },
  { state: "Nevada",        evPenetration: 9.8,  evVolume: 14600,  riskLevel: "MODERATE" },
  { state: "Arizona",       evPenetration: 9.1,  evVolume: 32100,  riskLevel: "LOW" },
  { state: "Virginia",      evPenetration: 8.7,  evVolume: 36400,  riskLevel: "LOW" },
  { state: "New York",      evPenetration: 8.3,  evVolume: 68200,  riskLevel: "LOW" },
  { state: "Hawaii",        evPenetration: 7.9,  evVolume: 5100,   riskLevel: "LOW" },
  { state: "Florida",       evPenetration: 7.4,  evVolume: 82300,  riskLevel: "LOW" },
];

// ─── Utilities ──────────────────────────────────────────────────────────────

function getRiskBadgeColor(tier: string): { bg: string; text: string } {
  switch (tier) {
    case "HIGH":       return { bg: "#dc2626", text: "#fff" };
    case "ELEVATED":   return { bg: "#d97706", text: "#fff" };
    case "MODERATE":   return { bg: "#ca8a04", text: "#fff" };
    case "LOW":
    case "NORMALIZING":return { bg: "#16a34a", text: "#fff" };
    default:           return { bg: "#64748b", text: "#fff" };
  }
}

function getRatioLabel(ratio: number): { label: string; tier: string } {
  if (ratio >= 2.0) return { label: "HIGH RISK",  tier: "HIGH" };
  if (ratio >= 1.5) return { label: "ELEVATED",   tier: "ELEVATED" };
  return { label: "NORMALIZING", tier: "NORMALIZING" };
}

function formatCurrency(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function formatPct(n: number): string {
  return n.toFixed(1) + "%";
}

function formatVolume(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toLocaleString();
}

function getPenetrationBg(pct: number): string {
  const intensity = Math.min(pct / 25, 1);
  const r = Math.round(15 + (30 - 15) * intensity);
  const g = Math.round(23 + (58 - 23) * intensity);
  const b = Math.round(42 + (138 - 42) * intensity);
  return `rgb(${r},${g},${b})`;
}

// ─── Render ─────────────────────────────────────────────────────────────────

function render(): void {
  document.body.innerHTML = "";
  document.body.style.cssText = `
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 0;
  `;

  const container = document.createElement("div");
  container.id = "ev_container";
  container.style.cssText = `
    max-width: 1440px; margin: 0 auto; padding: 20px;
    display: flex; flex-direction: column; gap: 16px;
  `;
  document.body.appendChild(container);

  // ── Demo mode banner ──
  if (_detectAppMode() === "demo") {
    const _db = document.createElement("div");
    _db.id = "_demo_banner";
    _db.style.cssText = "background:linear-gradient(135deg,#92400e22,#f59e0b11);border:1px solid #f59e0b44;border-radius:10px;padding:14px 20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;";
    _db.innerHTML = `
      <div style="flex:1;min-width:200px;">
        <div style="font-size:13px;font-weight:700;color:#fbbf24;margin-bottom:2px;">&#9888; Demo Mode — Showing sample data</div>
        <div style="font-size:12px;color:#d97706;">Enter your MarketCheck API key to see real market data. <a href="https://developers.marketcheck.com" target="_blank" style="color:#fbbf24;text-decoration:underline;">Get a free key</a></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <input id="_banner_key" type="text" placeholder="Paste your API key" style="padding:8px 12px;border-radius:6px;border:1px solid #f59e0b44;background:#0f172a;color:#e2e8f0;font-size:13px;width:220px;outline:none;" />
        <button id="_banner_save" style="padding:8px 16px;border-radius:6px;border:none;background:#f59e0b;color:#0f172a;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">Activate</button>
      </div>`;
    container.appendChild(_db);
    (_db.querySelector("#_banner_save") as HTMLElement).addEventListener("click", () => {
      const k = (_db.querySelector("#_banner_key") as HTMLInputElement).value.trim();
      if (!k) return;
      localStorage.setItem("mc_api_key", k);
      _db.style.background = "linear-gradient(135deg,#05966922,#10b98111)";
      _db.style.borderColor = "#10b98144";
      _db.innerHTML = '<div style="font-size:13px;font-weight:700;color:#10b981;">&#10003; API key saved — reloading with live data...</div>';
      setTimeout(() => location.reload(), 800);
    });
    (_db.querySelector("#_banner_key") as HTMLElement).addEventListener("keydown", (e: any) => {
      if (e.key === "Enter") (_db.querySelector("#_banner_save") as HTMLElement).click();
    });
  }

  // Header
  const header = document.createElement("div");
  header.style.cssText = `
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px; background: #1e293b; border-radius: 10px;
    border: 1px solid #334155;
  `;
  header.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:18px;">&#9889;</div>
      <div>
        <div style="font-size:18px;font-weight:700;color:#f1f5f9;">EV Collateral Risk Monitor</div>
        <div style="font-size:12px;color:#94a3b8;">Lender portfolio depreciation &amp; advance rate intelligence</div>
      </div>
    </div>
    <div style="font-size:12px;color:#64748b;">Updated: ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
  `;
  container.appendChild(header);
  _addSettingsBar(header);

  // Key Insights — top-level signal cards
  renderKeyInsights(container);

  // Scorecard Ribbon
  renderScorecard(container);

  // State filter (live / mcp mode only)
  if (_detectAppMode() !== "demo") {
    renderStateFilter(container);
  }

  // Main content area: chart + advance rate sidebar
  const mainRow = document.createElement("div");
  mainRow.style.cssText = `display:flex;gap:16px;`;
  container.appendChild(mainRow);

  const chartSection = document.createElement("div");
  chartSection.style.cssText = `flex:1;min-width:0;`;
  mainRow.appendChild(chartSection);

  const sidebar = document.createElement("div");
  sidebar.style.cssText = `width:280px;flex-shrink:0;`;
  mainRow.appendChild(sidebar);

  renderDepreciationChart(chartSection);
  renderAdvanceRatePanel(sidebar);

  // Bottom row: brand table + state heatmap
  const bottomRow = document.createElement("div");
  bottomRow.style.cssText = `display:flex;gap:16px;`;
  container.appendChild(bottomRow);

  const brandSection = document.createElement("div");
  brandSection.style.cssText = `flex:1;min-width:0;`;
  bottomRow.appendChild(brandSection);

  const stateSection = document.createElement("div");
  stateSection.style.cssText = `flex:1;min-width:0;`;
  bottomRow.appendChild(stateSection);

  renderBrandRiskTable(brandSection);
  renderStateHeatmap(stateSection);
}

// ─── Key Insights ────────────────────────────────────────────────────────────

function renderKeyInsights(parent: HTMLElement): void {
  const sorted = [...brandRisks].sort((a, b) => b.evDepreciationRate - a.evDepreciationRate);
  const topRisk = sorted[0];
  const deprDelta = scorecard.evAvgDepreciation - scorecard.iceAvgDepreciation;
  const deprRatio = scorecard.evIceRatio;

  const riskColor   = deprRatio >= 2.0 ? "#ef4444" : deprRatio >= 1.5 ? "#f97316" : "#22c55e";
  const supplyColor = scorecard.evDaysSupply > 90 ? "#ef4444" : scorecard.evDaysSupply > 60 ? "#f59e0b" : "#22c55e";
  const penetColor  = scorecard.evPenetration > 15 ? "#f97316" : scorecard.evPenetration > 10 ? "#fbbf24" : "#3b82f6";

  const insights: { icon: string; iconBg: string; title: string; value: string; valueColor: string; desc: string }[] = [
    {
      icon: "⚡", iconBg: "#ef444418",
      title: "EV/ICE Depr. Ratio",
      value: `${deprRatio.toFixed(1)}x`,
      valueColor: riskColor,
      desc: `EV depreciates ${formatPct(deprDelta)} faster than ICE — tighten advance rates`,
    },
    ...(topRisk ? [{
      icon: "🔴", iconBg: "#f9731618",
      title: "Highest Risk Brand",
      value: topRisk.make,
      valueColor: "#f87171",
      desc: `${formatPct(topRisk.evDepreciationRate)}/yr depreciation — cap or decline EV collateral`,
    }] : []),
    {
      icon: "📈", iconBg: "#3b82f618",
      title: "EV Market Share",
      value: formatPct(scorecard.evPenetration),
      valueColor: penetColor,
      desc: scorecard.evPenetration > 12
        ? "High concentration — portfolio rebalancing warranted"
        : "Growing — monitor for concentration risk",
    },
    {
      icon: "📦", iconBg: `${supplyColor}18`,
      title: "EV Days Supply",
      value: `${scorecard.evDaysSupply}d`,
      valueColor: supplyColor,
      desc: scorecard.evDaysSupply > 90
        ? "Elevated inventory — liquidation risk present"
        : scorecard.evDaysSupply > 60
        ? "Moderate supply — normal conditions"
        : "Low supply — healthy demand & liquidity",
    },
  ];

  const row = document.createElement("div");
  row.style.cssText = `display:flex;gap:12px;`;

  insights.forEach((ins) => {
    const card = document.createElement("div");
    card.style.cssText = `flex:1;min-width:0;background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px;`;
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <div style="width:28px;height:28px;border-radius:6px;background:${ins.iconBg};display:flex;align-items:center;justify-content:center;font-size:14px;">${ins.icon}</div>
        <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.6px;">${ins.title}</div>
      </div>
      <div style="font-size:22px;font-weight:800;color:${ins.valueColor};margin-bottom:6px;">${ins.value}</div>
      <div style="font-size:11px;color:#64748b;line-height:1.45;">${ins.desc}</div>
    `;
    row.appendChild(card);
  });

  parent.appendChild(row);
}

// ─── State Filter ────────────────────────────────────────────────────────────

function renderStateFilter(parent: HTMLElement): void {
  const US_STATES = [
    "AK","AL","AR","AZ","CA","CO","CT","DC","DE","FL","GA","HI","IA","ID","IL","IN","KS","KY",
    "LA","MA","MD","ME","MI","MN","MO","MS","MT","NC","ND","NE","NH","NJ","NM","NV","NY","OH",
    "OK","OR","PA","RI","SC","SD","TN","TX","UT","VA","VT","WA","WI","WV","WY",
  ];

  const row = document.createElement("div");
  row.style.cssText = `display:flex;align-items:center;gap:10px;padding:10px 16px;background:#1e293b;border:1px solid #334155;border-radius:8px;flex-wrap:wrap;`;
  row.innerHTML = `
    <span style="font-size:12px;color:#94a3b8;font-weight:500;">&#128205; Filter by State:</span>
    <select id="_ev_state_select" style="padding:5px 10px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:12px;cursor:pointer;">
      <option value="">All States</option>
      ${US_STATES.map(s => `<option value="${s}"${currentState === s ? " selected" : ""}>${s}</option>`).join("")}
    </select>
    <button id="_ev_state_apply" style="padding:5px 14px;border-radius:6px;border:none;background:#3b82f6;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">Apply</button>
    <span style="font-size:11px;color:${currentState ? "#60a5fa" : "#475569"};">${currentState ? `Showing ${currentState} market` : "Showing national market"}</span>
  `;
  parent.appendChild(row);

  setTimeout(() => {
    document.getElementById("_ev_state_apply")?.addEventListener("click", async () => {
      const sel = document.getElementById("_ev_state_select") as HTMLSelectElement;
      currentState = sel?.value || undefined;
      const btn = document.getElementById("_ev_state_apply") as HTMLButtonElement;
      if (btn) { btn.disabled = true; btn.textContent = "Loading…"; }
      await _fetchDirect(currentState);
      render();
    });
  }, 0);
}

// ─── Scorecard Ribbon ───────────────────────────────────────────────────────

function renderScorecard(parent: HTMLElement): void {
  const ribbon = document.createElement("div");
  ribbon.style.cssText = `
    display: flex; gap: 12px; padding: 14px 16px;
    background: #1e293b; border-radius: 10px; border: 1px solid #334155;
    overflow-x: auto;
  `;

  const ratioInfo  = getRatioLabel(scorecard.evIceRatio);
  const riskColors = getRiskBadgeColor(ratioInfo.tier);

  const evDeprColor  = scorecard.evAvgDepreciation  > 20 ? "#ef4444" : scorecard.evAvgDepreciation  > 12 ? "#f97316" : "#22c55e";
  const iceDeprColor = scorecard.iceAvgDepreciation > 12 ? "#f97316" : scorecard.iceAvgDepreciation  >  8 ? "#fbbf24" : "#34d399";
  const supplyColor  = scorecard.evDaysSupply > 90 ? "#ef4444" : scorecard.evDaysSupply > 60 ? "#f59e0b" : "#22c55e";

  interface CardDef { label: string; value: string; extra?: string; valueColor?: string; }

  const cards: CardDef[] = [
    {
      label: "EV Penetration",
      value: formatPct(scorecard.evPenetration),
      extra: `<span style="color:${scorecard.evPenetrationTrend > 0 ? "#22c55e" : "#ef4444"};font-size:12px;margin-left:6px;">${scorecard.evPenetrationTrend > 0 ? "&#9650;" : "&#9660;"} ${formatPct(Math.abs(scorecard.evPenetrationTrend))}</span>`,
    },
    {
      label: "EV Avg Depreciation",
      value: formatPct(scorecard.evAvgDepreciation),
      valueColor: evDeprColor,
    },
    {
      label: "ICE Avg Depreciation",
      value: formatPct(scorecard.iceAvgDepreciation),
      valueColor: iceDeprColor,
    },
    {
      label: "EV-to-ICE Depr. Ratio",
      value: scorecard.evIceRatio.toFixed(1) + "x",
      extra: `<span style="background:${riskColors.bg};color:${riskColors.text};font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;margin-left:8px;">${ratioInfo.label}</span>`,
    },
    {
      label: "EV Days Supply",
      value: scorecard.evDaysSupply + " days",
      valueColor: supplyColor,
    },
  ];

  cards.forEach((c) => {
    const card = document.createElement("div");
    card.style.cssText = `
      flex: 1; min-width: 160px; padding: 12px 16px;
      background: #0f172a; border-radius: 8px; border: 1px solid #334155;
    `;
    card.innerHTML = `
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${c.label}</div>
      <div style="font-size:22px;font-weight:700;color:${c.valueColor || "#f1f5f9"};display:flex;align-items:center;">${c.value}${c.extra || ""}</div>
    `;
    ribbon.appendChild(card);
  });

  parent.appendChild(ribbon);
}

// ─── Depreciation Comparison Chart ──────────────────────────────────────────

function renderDepreciationChart(parent: HTMLElement): void {
  const panel = document.createElement("div");
  panel.style.cssText = `
    background: #1e293b; border-radius: 10px; border: 1px solid #334155;
    padding: 20px;
  `;

  const titleRow = document.createElement("div");
  titleRow.style.cssText = `display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;`;
  titleRow.innerHTML = `
    <div style="font-size:15px;font-weight:600;color:#f1f5f9;">Depreciation Comparison: EV vs ICE (12-Month)</div>
    <div style="display:flex;gap:16px;font-size:12px;">
      <div style="display:flex;align-items:center;gap:6px;">
        <div style="width:14px;height:3px;background:#3b82f6;border-radius:2px;"></div>
        <span style="color:#94a3b8;">EV Avg Price</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <div style="width:14px;height:3px;background:#f97316;border-radius:2px;"></div>
        <span style="color:#94a3b8;">ICE Avg Price</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <div style="width:14px;height:8px;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.3);border-radius:2px;"></div>
        <span style="color:#94a3b8;">EV Gap</span>
      </div>
    </div>
  `;
  panel.appendChild(titleRow);

  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 360;
  canvas.style.cssText = `width:100%;height:auto;`;
  panel.appendChild(canvas);

  const footnote = document.createElement("div");
  footnote.style.cssText = `font-size:10px;color:#334155;text-align:right;margin-top:8px;`;
  footnote.textContent = "* 12-month trend synthesized from current market snapshot using estimated depreciation rates";
  panel.appendChild(footnote);

  parent.appendChild(panel);
  drawChart(canvas);
}

function drawChart(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  const pad = { top: 20, right: 20, bottom: 50, left: 70 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  // Single-point snapshot: draw a bar comparison instead of a line chart
  if (monthlyPrices.length === 1) {
    const evP  = monthlyPrices[0].evAvgPrice;
    const iceP = monthlyPrices[0].iceAvgPrice;
    const maxP = Math.max(evP, iceP) * 1.15;
    ctx.clearRect(0, 0, W, H);
    const barW = Math.min(chartW * 0.28, 140);
    const evX  = pad.left + chartW * 0.25 - barW / 2;
    const iceX = pad.left + chartW * 0.65 - barW / 2;
    const barH = (v: number) => (v / maxP) * chartH;
    const evBarH = barH(evP);
    const evY = pad.top + chartH - evBarH;
    ctx.fillStyle = "#3b82f6";
    ctx.fillRect(evX, evY, barW, evBarH);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 14px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("$" + Math.round(evP / 1000) + "K", evX + barW / 2, evY - 10);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "13px -apple-system, sans-serif";
    ctx.fillText("EV Avg Price", evX + barW / 2, H - pad.bottom + 20);
    const iceBarH = barH(iceP);
    const iceY = pad.top + chartH - iceBarH;
    ctx.fillStyle = "#f97316";
    ctx.fillRect(iceX, iceY, barW, iceBarH);
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText("$" + Math.round(iceP / 1000) + "K", iceX + barW / 2, iceY - 10);
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("ICE Avg Price", iceX + barW / 2, H - pad.bottom + 20);
    const spread = evP - iceP;
    ctx.fillStyle = spread > 0 ? "#f97316" : "#22c55e";
    ctx.font = "bold 13px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText((spread > 0 ? "EV +$" : "EV -$") + Math.abs(Math.round(spread / 1000)) + "K vs ICE", W / 2, pad.top + 20);
    return;
  }

  ctx.clearRect(0, 0, W, H);

  const allPrices = monthlyPrices.flatMap(p => [p.evAvgPrice, p.iceAvgPrice]).filter(v => v > 0);
  const dataMin = allPrices.length > 0 ? Math.min(...allPrices) : 28000;
  const dataMax = allPrices.length > 0 ? Math.max(...allPrices) : 50000;
  const yPad  = Math.max((dataMax - dataMin) * 0.12, 2000);
  const yMin  = Math.floor((dataMin - yPad) / 2000) * 2000;
  const yMax  = Math.ceil((dataMax + yPad)  / 2000) * 2000;
  const yRange = yMax - yMin;

  function xPos(i: number): number {
    return pad.left + (i / (monthlyPrices.length - 1)) * chartW;
  }
  function yPos(val: number): number {
    return pad.top + chartH - ((val - yMin) / yRange) * chartH;
  }

  const tickStep = Math.ceil((yMax - yMin) / 6 / 2000) * 2000;
  const yTicks: number[] = [];
  for (let t = yMin; t <= yMax; t += tickStep) yTicks.push(t);

  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 0.5;
  yTicks.forEach((val) => {
    const y = yPos(val);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(W - pad.right, y);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("$" + (val / 1000).toFixed(0) + "K", pad.left - 10, y + 4);
  });

  ctx.textAlign = "center";
  ctx.fillStyle = "#94a3b8";
  ctx.font = "11px -apple-system, sans-serif";
  monthlyPrices.forEach((p, i) => {
    const x = xPos(i);
    ctx.fillText(p.month, x, H - pad.bottom + 20);
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + chartH);
    ctx.stroke();
  });

  const n     = monthlyPrices.length;
  const first = monthlyPrices[0];
  const last  = monthlyPrices[n - 1];

  // Shaded gap fill
  const gapGrad = ctx.createLinearGradient(pad.left, 0, pad.left + chartW, 0);
  gapGrad.addColorStop(0, "rgba(59,130,246,0.18)");
  gapGrad.addColorStop(1, "rgba(59,130,246,0.06)");
  ctx.beginPath();
  monthlyPrices.forEach((p, i) => {
    const x = xPos(i), y = yPos(p.evAvgPrice);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(xPos(i), yPos(monthlyPrices[i].iceAvgPrice));
  ctx.closePath();
  ctx.fillStyle = gapGrad;
  ctx.fill();

  // EV line
  ctx.beginPath();
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  monthlyPrices.forEach((p, i) => {
    const x = xPos(i), y = yPos(p.evAvgPrice);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  monthlyPrices.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(xPos(i), yPos(p.evAvgPrice), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#3b82f6"; ctx.fill();
  });

  // ICE line
  ctx.beginPath();
  ctx.strokeStyle = "#f97316";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  monthlyPrices.forEach((p, i) => {
    const x = xPos(i), y = yPos(p.iceAvgPrice);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  monthlyPrices.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(xPos(i), yPos(p.iceAvgPrice), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#f97316"; ctx.fill();
  });

  const fmt = (v: number) => "$" + Math.round(v / 1000) + "K";
  const evDeprPct  = ((first.evAvgPrice  - last.evAvgPrice)  / first.evAvgPrice  * 100);
  const iceDeprPct = ((first.iceAvgPrice - last.iceAvgPrice) / first.iceAvgPrice * 100);

  const pill = (x: number, y: number, text: string, color: string, bg: string) => {
    ctx.font = "bold 11px -apple-system, sans-serif";
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = bg;
    ctx.beginPath();
    (ctx as any).roundRect?.(x - tw / 2 - 6, y - 9, tw + 12, 17, 4) || ctx.fillRect(x - tw / 2 - 6, y - 9, tw + 12, 17);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(text, x, y + 4);
  };

  pill(xPos(0) + 28, yPos(first.evAvgPrice)  - 2, fmt(first.evAvgPrice),  "#60a5fa", "rgba(30,58,138,0.85)");
  pill(xPos(0) + 28, yPos(first.iceAvgPrice) + 2, fmt(first.iceAvgPrice), "#fb923c", "rgba(120,53,15,0.85)");
  pill(xPos(n-1) - 22, yPos(last.evAvgPrice)  - 14, fmt(last.evAvgPrice),         "#60a5fa", "rgba(30,58,138,0.85)");
  pill(xPos(n-1) - 22, yPos(last.iceAvgPrice) + 14, fmt(last.iceAvgPrice),         "#fb923c", "rgba(120,53,15,0.85)");
  pill(xPos(n-1) - 22, yPos(last.evAvgPrice)  +  2, `↓${evDeprPct.toFixed(1)}%`,  "#fff",    "#ef4444cc");
  pill(xPos(n-1) - 22, yPos(last.iceAvgPrice) -  2, `↓${iceDeprPct.toFixed(1)}%`, "#fff",    "#f97316cc");

  const midIdx    = Math.floor(n / 2);
  const gapDollar = monthlyPrices[midIdx].evAvgPrice - monthlyPrices[midIdx].iceAvgPrice;
  const gapY      = (yPos(monthlyPrices[midIdx].evAvgPrice) + yPos(monthlyPrices[midIdx].iceAvgPrice)) / 2;
  if (Math.abs(gapY - yPos(monthlyPrices[midIdx].evAvgPrice)) > 16) {
    ctx.fillStyle = "rgba(59,130,246,0.55)";
    ctx.font = "bold 11px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`EV Gap  ${gapDollar > 0 ? "+" : ""}$${Math.round(Math.abs(gapDollar)).toLocaleString()}`, xPos(midIdx), gapY);
  }

  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = "rgba(148,163,184,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(xPos(n - 1), pad.top);
  ctx.lineTo(xPos(n - 1), pad.top + chartH);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#64748b";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("now", xPos(n - 1), pad.top + 10);

  ctx.fillStyle = "#64748b";
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Month", W / 2, H - 5);
  ctx.save();
  ctx.translate(14, pad.top + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Avg Price", 0, 0);
  ctx.restore();
}

// ─── Advance Rate Panel ────────────────────────────────────────────────────

function renderAdvanceRatePanel(parent: HTMLElement): void {
  // Dynamic LTV caps derived from depreciation delta
  const iceLTV    = Math.max(75, Math.round(100 - scorecard.iceAvgDepreciation * 1.35));
  const evLTV     = Math.max(60, Math.round(100 - scorecard.evAvgDepreciation  * 1.35));
  const spread    = iceLTV - evLTV;
  const spreadColor = spread > 20 ? "#ef4444" : spread > 15 ? "#f97316" : "#22c55e";
  const differential = scorecard.evAvgDepreciation - scorecard.iceAvgDepreciation;

  const panel = document.createElement("div");
  panel.style.cssText = `
    background: #1e293b; border-radius: 10px; border: 1px solid #334155;
    padding: 20px; height: 100%; box-sizing: border-box;
  `;
  panel.innerHTML = `
    <div style="font-size:15px;font-weight:600;color:#f1f5f9;margin-bottom:16px;">Advance Rate Recommendations</div>

    <div style="background:#0f172a;border-radius:8px;border:1px solid #334155;padding:16px;margin-bottom:10px;">
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Suggested LTV Cap — EV</div>
      <div style="font-size:32px;font-weight:800;color:#3b82f6;">${evLTV}%</div>
      <div style="margin-top:8px;">
        <div style="height:6px;background:#1e293b;border-radius:3px;overflow:hidden;border:1px solid #334155;">
          <div style="height:100%;width:${evLTV}%;background:linear-gradient(90deg,#3b82f6,#60a5fa);border-radius:3px;transition:width 0.4s;"></div>
        </div>
      </div>
    </div>

    <div style="background:#0f172a;border-radius:8px;border:1px solid #334155;padding:16px;margin-bottom:10px;">
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Suggested LTV Cap — ICE</div>
      <div style="font-size:32px;font-weight:800;color:#f97316;">${iceLTV}%</div>
      <div style="margin-top:8px;">
        <div style="height:6px;background:#1e293b;border-radius:3px;overflow:hidden;border:1px solid #334155;">
          <div style="height:100%;width:${iceLTV}%;background:linear-gradient(90deg,#f97316,#fb923c);border-radius:3px;transition:width 0.4s;"></div>
        </div>
      </div>
    </div>

    <div style="background:#0f172a;border-radius:8px;border:1px solid #334155;padding:16px;margin-bottom:10px;">
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">LTV Spread (ICE − EV)</div>
      <div style="font-size:28px;font-weight:700;color:${spreadColor};">${spread} pts</div>
      <div style="margin-top:8px;position:relative;height:6px;background:#1e293b;border-radius:3px;border:1px solid #334155;">
        <div style="position:absolute;left:0;height:100%;width:${evLTV}%;background:#3b82f622;border-radius:3px;"></div>
        <div style="position:absolute;left:${evLTV}%;height:100%;width:${spread}%;background:${spreadColor}88;border-radius:0 3px 3px 0;"></div>
      </div>
    </div>

    <div style="background:rgba(220,38,38,0.08);border:1px solid rgba(220,38,38,0.25);border-radius:8px;padding:14px;">
      <div style="font-size:12px;font-weight:600;color:#fca5a5;margin-bottom:6px;">&#9888; Risk Advisory</div>
      <div style="font-size:11px;color:#94a3b8;line-height:1.5;">
        EV depreciation rate of <strong style="color:#f87171;">${formatPct(scorecard.evAvgDepreciation)}</strong> exceeds ICE by
        <strong style="color:#f87171;">${formatPct(differential)}</strong>.
        The ${scorecard.evIceRatio.toFixed(1)}x EV-to-ICE ratio indicates HIGH RISK.
        Recommend tighter advance rates and shorter loan terms for EV collateral.
      </div>
    </div>
  `;
  parent.appendChild(panel);
}

// ─── Brand EV Risk Table ────────────────────────────────────────────────────

function renderBrandRiskTable(parent: HTMLElement): void {
  const sorted   = [...brandRisks].sort((a, b) => b.evDepreciationRate - a.evDepreciationRate);
  const maxDepr  = sorted[0]?.evDepreciationRate || 35;

  const panel = document.createElement("div");
  panel.style.cssText = `
    background: #1e293b; border-radius: 10px; border: 1px solid #334155;
    padding: 20px; overflow-x: auto;
  `;

  const title = document.createElement("div");
  title.style.cssText = `font-size:15px;font-weight:600;color:#f1f5f9;margin-bottom:14px;`;
  title.textContent = "Brand EV Risk Table";
  panel.appendChild(title);

  const table = document.createElement("table");
  table.style.cssText = `width:100%;border-collapse:collapse;font-size:13px;`;

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr style="border-bottom:1px solid #334155;">
      <th style="text-align:left;padding:8px 10px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Make</th>
      <th style="text-align:right;padding:8px 10px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">EV Volume</th>
      <th style="text-align:right;padding:8px 10px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">EV Avg Price</th>
      <th style="padding:8px 10px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">EV Depr Rate</th>
      <th style="text-align:right;padding:8px 10px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">ICE Depr Rate</th>
      <th style="text-align:right;padding:8px 10px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">EV/ICE Ratio</th>
      <th style="text-align:center;padding:8px 10px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Risk Tier</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  sorted.forEach((row, idx) => {
    const colors     = getRiskBadgeColor(row.riskTier);
    const isEVOnly   = EV_MAKES.has(row.make) && row.iceDepreciationRate === 0;
    const ratioText  = isEVOnly ? "EV Only" : row.evIceRatio.toFixed(2) + "x";
    const iceColor   = row.iceDepreciationRate > 10 ? "#f97316" : row.iceDepreciationRate > 7 ? "#fbbf24" : "#34d399";
    const iceText    = isEVOnly ? `<span style="color:#475569;">N/A</span>` : `<span style="color:${iceColor};">${formatPct(row.iceDepreciationRate)}</span>`;
    const bgColor    = idx % 2 === 0 ? "transparent" : "rgba(51,65,85,0.2)";
    const barPct     = Math.min((row.evDepreciationRate / maxDepr) * 100, 100).toFixed(1);
    const barColor   = row.evDepreciationRate > 25 ? "#ef4444" : row.evDepreciationRate > 18 ? "#f97316" : "#fbbf24";

    const tr = document.createElement("tr");
    tr.style.cssText = `border-bottom:1px solid #1e293b;background:${bgColor};`;
    tr.innerHTML = `
      <td style="padding:10px;color:#f1f5f9;font-weight:500;">${row.make}</td>
      <td style="padding:10px;text-align:right;color:#cbd5e1;">${formatVolume(row.evVolume)}</td>
      <td style="padding:10px;text-align:right;color:#cbd5e1;">${formatCurrency(row.evAvgPrice)}</td>
      <td style="padding:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;height:4px;background:#0f172a;border-radius:2px;min-width:50px;">
            <div style="height:100%;width:${barPct}%;background:${barColor};border-radius:2px;"></div>
          </div>
          <span style="color:#f87171;font-weight:600;font-size:13px;min-width:38px;text-align:right;">${formatPct(row.evDepreciationRate)}</span>
        </div>
      </td>
      <td style="padding:10px;text-align:right;">${iceText}</td>
      <td style="padding:10px;text-align:right;color:#cbd5e1;">${ratioText}</td>
      <td style="padding:10px;text-align:center;">
        <span style="background:${colors.bg};color:${colors.text};font-size:10px;font-weight:700;padding:3px 10px;border-radius:4px;letter-spacing:0.3px;">${row.riskTier}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  panel.appendChild(table);
  parent.appendChild(panel);
}

// ─── State Adoption Heatmap ─────────────────────────────────────────────────

function renderStateHeatmap(parent: HTMLElement): void {
  const panel = document.createElement("div");
  panel.style.cssText = `
    background: #1e293b; border-radius: 10px; border: 1px solid #334155;
    padding: 20px; overflow-x: auto;
  `;

  const title = document.createElement("div");
  title.style.cssText = `font-size:15px;font-weight:600;color:#f1f5f9;margin-bottom:14px;`;
  title.textContent = "State EV Adoption Heatmap (Top 15)";
  panel.appendChild(title);

  const table = document.createElement("table");
  table.style.cssText = `width:100%;border-collapse:collapse;font-size:13px;`;

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr style="border-bottom:1px solid #334155;">
      <th style="text-align:left;padding:8px 10px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">State</th>
      <th style="text-align:right;padding:8px 10px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">EV Penetration %</th>
      <th style="text-align:right;padding:8px 10px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">EV Volume</th>
      <th style="text-align:center;padding:8px 10px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Risk Level</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  stateAdoptions.forEach((row) => {
    const bgColor    = getPenetrationBg(row.evPenetration);
    const riskColors = getRiskBadgeColor(row.riskLevel);

    const tr = document.createElement("tr");
    tr.style.cssText = `background:${bgColor};border-bottom:1px solid rgba(51,65,85,0.4);`;
    tr.innerHTML = `
      <td style="padding:10px;color:#f1f5f9;font-weight:500;">${row.state}</td>
      <td style="padding:10px;text-align:right;color:#f1f5f9;font-weight:600;">${formatPct(row.evPenetration)}</td>
      <td style="padding:10px;text-align:right;color:#cbd5e1;">${row.evVolume.toLocaleString()}</td>
      <td style="padding:10px;text-align:center;">
        <span style="background:${riskColors.bg};color:${riskColors.text};font-size:10px;font-weight:700;padding:3px 10px;border-radius:4px;letter-spacing:0.3px;">${row.riskLevel}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  panel.appendChild(table);
  parent.appendChild(panel);
}

// ─── Direct Fetch (live mode) ────────────────────────────────────────────────

// _rows: handle both {data:[]} and {rankings:[]} response shapes
const _rows = (r: any): any[] => r?.data ?? r?.rankings ?? [];

// Known EV makes for inferring EV vs ICE when API lacks fuel_type_category dimension
const EV_MAKES = new Set(["Tesla","Rivian","Lucid","Polestar","BYD","Fisker","Nio","Xpeng","Li Auto","Vinfast","Canoo","Lordstown","Arrival"]);

async function _fetchDirect(state?: string): Promise<void> {
  const sp = state ? { state } : {};

  try {
    // 3 calls only to stay within rate limits.
    // ranking_dimensions: make or body_type only (422 otherwise)
    // ranking_measure: single value only (no comma-separated)
    const [allByVol, allByPrice, byBodyTypeDom] = await Promise.all([
      _mcSold({ ranking_dimensions: "make",      ranking_measure: "sold_count",             ranking_order: "desc", top_n: 30, inventory_type: "Used", ...sp }),
      _mcSold({ ranking_dimensions: "make",      ranking_measure: "average_sale_price",     ranking_order: "desc", top_n: 30, inventory_type: "Used", ...sp }),
      _mcSold({ ranking_dimensions: "body_type", ranking_measure: "average_days_on_market", inventory_type: "Used", ...sp }),
    ]);

    // ── Merge vol + price by make ─────────────────────────────────────────
    const volRows   = _rows(allByVol);
    const priceRows = _rows(allByPrice);
    const makeMap   = new Map<string, any>();
    for (const r of volRows)   makeMap.set(r.make, { make: r.make, sold_count: r.sold_count ?? 0, average_sale_price: 0 });
    for (const r of priceRows) {
      const e = makeMap.get(r.make);
      if (e) e.average_sale_price = r.average_sale_price ?? 0;
      else   makeMap.set(r.make, { make: r.make, sold_count: 0, average_sale_price: r.average_sale_price ?? 0 });
    }
    const allMakes = Array.from(makeMap.values());
    const evMakes  = allMakes.filter((r: any) => EV_MAKES.has(r.make ?? ""));
    const iceMakes = allMakes.filter((r: any) => !EV_MAKES.has(r.make ?? ""));

    // ── Weighted average helper ───────────────────────────────────────────
    const wavg = (rows: any[]) => {
      const cnt = rows.reduce((s: number, r: any) => s + (r.sold_count ?? 1), 0);
      if (cnt === 0) return 0;
      return rows.reduce((s: number, r: any) => s + (r.average_sale_price ?? 0) * (r.sold_count ?? 1), 0) / cnt;
    };

    // ── Synthetic price series from snapshot ───────────────────────────────
    const evAvgSnap  = Math.round(wavg(evMakes));
    const iceAvgSnap = Math.round(wavg(iceMakes));

    if (evAvgSnap > 0 && iceAvgSnap > 0) {
      scorecard.evIceRatio = parseFloat((evAvgSnap / iceAvgSnap).toFixed(2));

      const evDeprAnnual  = (scorecard.evAvgDepreciation  || 20.8) / 100;
      const iceDeprAnnual = (scorecard.iceAvgDepreciation || 6.3)  / 100;
      const labels = _monthRanges(12);
      monthlyPrices.length = 0;
      for (let i = 0; i < 12; i++) {
        const monthsAgo = 12 - i;
        const evP  = Math.round(evAvgSnap  * Math.pow(1 + evDeprAnnual,  monthsAgo / 12));
        const iceP = Math.round(iceAvgSnap * Math.pow(1 + iceDeprAnnual, monthsAgo / 12));
        monthlyPrices.push({ month: labels[i].label, evAvgPrice: evP, iceAvgPrice: iceP });
      }

      const first = monthlyPrices[0];
      const last  = monthlyPrices[monthlyPrices.length - 1];
      const evDepr  = ((first.evAvgPrice  - last.evAvgPrice)  / first.evAvgPrice)  * 100;
      const iceDepr = ((first.iceAvgPrice - last.iceAvgPrice) / first.iceAvgPrice) * 100;
      if (evDepr  > 0) scorecard.evAvgDepreciation  = parseFloat(evDepr.toFixed(1));
      if (iceDepr > 0) scorecard.iceAvgDepreciation = parseFloat(iceDepr.toFixed(1));
      if (iceDepr > 0) scorecard.evIceRatio          = parseFloat((evDepr / iceDepr).toFixed(1));
    }

    // ── Brand-level EV risk ───────────────────────────────────────────────
    const brandData = evMakes.length > 0 ? evMakes : allMakes.filter((r: any) => EV_MAKES.has(r.make ?? ""));

    if (brandData.length > 0) {
      const baseDepr = scorecard.evAvgDepreciation || 20;
      const newBrands: BrandRisk[] = brandData.map((r: any) => {
        const avgPrice    = r.average_sale_price ?? 0;
        const priceFactor = avgPrice > 55000 ? 1.30 : avgPrice > 45000 ? 1.15 : avgPrice > 35000 ? 1.00 : 0.85;
        const deprRate    = parseFloat((baseDepr * priceFactor).toFixed(1));
        const tier: BrandRisk["riskTier"] = deprRate > 25 ? "HIGH" : deprRate > 18 ? "ELEVATED" : deprRate > 12 ? "MODERATE" : "LOW";
        return { make: r.make ?? "Unknown", evVolume: r.sold_count ?? 0, evAvgPrice: avgPrice, evDepreciationRate: deprRate, iceDepreciationRate: 0, evIceRatio: 0, riskTier: tier };
      });
      brandRisks.length = 0;
      brandRisks.push(...newBrands);
    }

    // ── Scorecard: EV penetration + days supply ───────────────────────────
    const evSoldTotal = evMakes.reduce((s: number, r: any) => s + (r.sold_count ?? 0), 0);
    const allSold     = allMakes.reduce((s: number, r: any) => s + (r.sold_count ?? 0), 0);
    if (evSoldTotal > 0 && allSold > 0) {
      scorecard.evPenetration = parseFloat(((evSoldTotal / allSold) * 100).toFixed(1));
    }
    const btRows  = _rows(byBodyTypeDom);
    const domRows = btRows.filter((r: any) => (r.average_days_on_market ?? 0) > 0);
    if (domRows.length > 0) {
      scorecard.evDaysSupply = Math.round(domRows.reduce((s: number, r: any) => s + r.average_days_on_market, 0) / domRows.length);
    }

  } catch (err: any) {
    console.error("[EV Collateral] _fetchDirect error:", err?.message);
  }
}

// ─── Bootstrap ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const mode = _detectAppMode();

  // Seed currentState from URL param on first load
  if (!currentState) {
    const urlState = _getUrlParams().state;
    if (urlState) currentState = urlState;
  }

  // Render immediately with mock/default data — no blank loading screen
  render();

  if (mode === "demo") return;

  // Slim animated loading bar at the top
  const loadingBar = document.createElement("div");
  loadingBar.id = "_ev_loading_bar";
  loadingBar.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
    background: linear-gradient(90deg, #3b82f6, #8b5cf6, #3b82f6);
    background-size: 200% 100%;
    height: 3px;
    animation: _ev_shimmer 1.4s linear infinite;
  `;
  const shimmerStyle = document.createElement("style");
  shimmerStyle.textContent = `@keyframes _ev_shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`;
  document.head.appendChild(shimmerStyle);

  // "Fetching…" banner inserted into the app container (reliable)
  const loadingBanner = document.createElement("div");
  loadingBanner.id = "_ev_loading_banner";
  loadingBanner.style.cssText = `
    background: #1e3a5f; border: 1px solid #3b82f644; border-radius: 6px;
    padding: 8px 16px; font-size: 12px; color: #93c5fd;
    display: flex; align-items: center; gap: 8px;
  `;
  loadingBanner.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#3b82f6;animation:_ev_pulse 1s ease-in-out infinite;"></span> Fetching live market data…
  <style>@keyframes _ev_pulse{0%,100%{opacity:1}50%{opacity:0.3}}</style>`;

  document.body.insertBefore(loadingBar, document.body.firstChild);

  // Insert banner as second child of #ev_container (after demo banner slot)
  const container = document.getElementById("ev_container");
  if (container) container.insertBefore(loadingBanner, container.firstChild);

  const removeLoading = () => {
    document.getElementById("_ev_loading_bar")?.remove();
    document.getElementById("_ev_loading_banner")?.remove();
  };

  try {
    if (mode === "live") {
      await _fetchDirect(currentState);
      removeLoading();
      render();
    } else {
      // MCP mode
      const result = await _callTool("ev-collateral-risk", {
        timeRange: "1Y",
        ...(currentState ? { state: currentState } : {}),
      });
      if (result?.content?.[0]?.text) {
        const data = JSON.parse(result.content[0].text);
        if (!data.error) {
          if (Array.isArray(data.evSeries) && Array.isArray(data.iceSeries)) {
            const parsed: MonthlyPrice[] = [];
            for (let i = 0; i < Math.min(data.evSeries.length, data.iceSeries.length); i++) {
              const evAvgPrice  = data.evSeries[i]?.data?.rankings?.[0]?.average_sale_price ?? 0;
              const iceAvgPrice = data.iceSeries[i]?.data?.rankings?.[0]?.average_sale_price ?? 0;
              if (evAvgPrice > 0 && iceAvgPrice > 0) {
                parsed.push({ month: data.evSeries[i].date ?? `M${i + 1}`, evAvgPrice, iceAvgPrice });
              }
            }
            if (parsed.length >= 3) {
              monthlyPrices.length = 0;
              monthlyPrices.push(...parsed);
              const first = monthlyPrices[0];
              const last  = monthlyPrices[monthlyPrices.length - 1];
              const evDepr  = ((first.evAvgPrice  - last.evAvgPrice)  / first.evAvgPrice)  * 100;
              const iceDepr = ((first.iceAvgPrice - last.iceAvgPrice) / first.iceAvgPrice) * 100;
              if (evDepr  > 0) scorecard.evAvgDepreciation  = parseFloat(evDepr.toFixed(1));
              if (iceDepr > 0) scorecard.iceAvgDepreciation = parseFloat(iceDepr.toFixed(1));
              if (iceDepr > 0) scorecard.evIceRatio          = parseFloat((evDepr / iceDepr).toFixed(1));
            }
          }
          if (Array.isArray(data.evByBrand?.rankings) && data.evByBrand.rankings.length > 0) {
            const baseDepr = scorecard.evAvgDepreciation;
            const newBrands: BrandRisk[] = data.evByBrand.rankings.slice(0, 12).map((r: any) => {
              const avgPrice    = r.average_sale_price ?? 0;
              const priceFactor = avgPrice > 55000 ? 1.30 : avgPrice > 45000 ? 1.15 : avgPrice > 35000 ? 1.00 : 0.85;
              const deprRate    = parseFloat((baseDepr * priceFactor).toFixed(1));
              const tier: BrandRisk["riskTier"] = deprRate > 25 ? "HIGH" : deprRate > 18 ? "ELEVATED" : deprRate > 12 ? "MODERATE" : "LOW";
              return { make: r.make ?? "Unknown", evVolume: r.sold_count ?? 0, evAvgPrice: avgPrice, evDepreciationRate: deprRate, iceDepreciationRate: 0, evIceRatio: 0, riskTier: tier };
            });
            if (newBrands.length > 0) { brandRisks.length = 0; brandRisks.push(...newBrands); }
          }
          if (Array.isArray(data.evByState?.rankings) && data.evByState.rankings.length > 0) {
            const newStates: StateAdoption[] = data.evByState.rankings.slice(0, 15).map((r: any) => {
              const pct = r.market_share ?? 0;
              return { state: r.state ?? "Unknown", evPenetration: pct, evVolume: r.sold_count ?? 0, riskLevel: (pct > 12 ? "HIGH" : pct > 8 ? "MODERATE" : "LOW") as StateAdoption["riskLevel"] };
            });
            if (newStates.length > 0) { stateAdoptions.length = 0; stateAdoptions.push(...newStates); }
          }
        }
      }
      removeLoading();
      render();
    }
  } catch (err) {
    removeLoading();
    console.error("[EV Collateral] fetch failed, using mock data:", err);
  }
}

main();
