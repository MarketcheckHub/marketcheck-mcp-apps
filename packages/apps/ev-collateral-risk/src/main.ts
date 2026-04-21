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
  // Auth (URL or localStorage) takes priority — run in standalone live mode
  if (_getAuth().value) return "live";
  // Only use MCP mode when no auth AND we're actually iframed into an MCP host
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

async function _callTool(toolName: string, args: Record<string, any>): Promise<any> {
  if (_safeApp) {
    try {
      const r = await _safeApp.callServerTool({ name: toolName, arguments: args }); return r;
            
    } catch {}
  }
  const auth = _getAuth();
  if (auth.value) {
    try {
      const r = await fetch(`${_proxyBase()}/api/proxy/${toolName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, _auth_mode: auth.mode, _auth_value: auth.value }),
      });
      if (r.ok) { const d = await r.json(); return { content: [{ type: "text", text: JSON.stringify(d) }] }; }
    } catch {}
  }
  return null;
}

function _addSettingsBar(headerEl?: HTMLElement) {
  if (_isEmbedMode() || !headerEl) return;
  const mode = _detectAppMode();
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;align-items:center;gap:8px;margin-left:auto;";
  const colors: Record<string, { bg: string; fg: string; label: string }> = {
    mcp: { bg: "#1e40af22", fg: "#60a5fa", label: "MCP" },
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
      /* Fix grid/flex layouts to stack on mobile */
      [style*="display:flex"][style*="gap"],
      [style*="display: flex"][style*="gap"] { flex-wrap: wrap !important; }
      [style*="grid-template-columns: repeat"] { grid-template-columns: 1fr !important; }
      [style*="grid-template-columns:repeat"] { grid-template-columns: 1fr !important; }
      /* Ensure tables scroll horizontally */
      div[style*="overflow-x:auto"], div[style*="overflow-x: auto"] { -webkit-overflow-scrolling: touch; }
      table { min-width: 600px; }
      /* Stack panels that use percentage widths */
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
  { make: "Lucid", evVolume: 2100, evAvgPrice: 68500, evDepreciationRate: 34.2, iceDepreciationRate: 0, evIceRatio: 0, riskTier: "HIGH" },
  { make: "Rivian", evVolume: 8400, evAvgPrice: 62300, evDepreciationRate: 29.8, iceDepreciationRate: 0, evIceRatio: 0, riskTier: "HIGH" },
  { make: "Tesla", evVolume: 142000, evAvgPrice: 38200, evDepreciationRate: 24.5, iceDepreciationRate: 0, evIceRatio: 0, riskTier: "HIGH" },
  { make: "Mercedes", evVolume: 9800, evAvgPrice: 58700, evDepreciationRate: 22.1, iceDepreciationRate: 8.4, evIceRatio: 2.63, riskTier: "HIGH" },
  { make: "BMW", evVolume: 14200, evAvgPrice: 52100, evDepreciationRate: 19.7, iceDepreciationRate: 9.2, evIceRatio: 2.14, riskTier: "ELEVATED" },
  { make: "VW", evVolume: 6300, evAvgPrice: 34800, evDepreciationRate: 18.4, iceDepreciationRate: 7.8, evIceRatio: 2.36, riskTier: "ELEVATED" },
  { make: "Ford", evVolume: 28500, evAvgPrice: 41200, evDepreciationRate: 17.6, iceDepreciationRate: 8.1, evIceRatio: 2.17, riskTier: "ELEVATED" },
  { make: "GM", evVolume: 22300, evAvgPrice: 43500, evDepreciationRate: 16.2, iceDepreciationRate: 7.5, evIceRatio: 2.16, riskTier: "ELEVATED" },
  { make: "Hyundai", evVolume: 18700, evAvgPrice: 36900, evDepreciationRate: 14.8, iceDepreciationRate: 6.9, evIceRatio: 2.14, riskTier: "MODERATE" },
];

const stateAdoptions: StateAdoption[] = [
  { state: "California", evPenetration: 24.6, evVolume: 312000, riskLevel: "HIGH" },
  { state: "Washington", evPenetration: 16.8, evVolume: 48200, riskLevel: "HIGH" },
  { state: "New Jersey", evPenetration: 14.2, evVolume: 52100, riskLevel: "HIGH" },
  { state: "Oregon", evPenetration: 13.5, evVolume: 22400, riskLevel: "HIGH" },
  { state: "Colorado", evPenetration: 12.1, evVolume: 31500, riskLevel: "MODERATE" },
  { state: "Massachusetts", evPenetration: 11.8, evVolume: 34800, riskLevel: "MODERATE" },
  { state: "Connecticut", evPenetration: 11.2, evVolume: 16200, riskLevel: "MODERATE" },
  { state: "Maryland", evPenetration: 10.9, evVolume: 28700, riskLevel: "MODERATE" },
  { state: "Vermont", evPenetration: 10.4, evVolume: 3200, riskLevel: "MODERATE" },
  { state: "Nevada", evPenetration: 9.8, evVolume: 14600, riskLevel: "MODERATE" },
  { state: "Arizona", evPenetration: 9.1, evVolume: 32100, riskLevel: "LOW" },
  { state: "Virginia", evPenetration: 8.7, evVolume: 36400, riskLevel: "LOW" },
  { state: "New York", evPenetration: 8.3, evVolume: 68200, riskLevel: "LOW" },
  { state: "Hawaii", evPenetration: 7.9, evVolume: 5100, riskLevel: "LOW" },
  { state: "Florida", evPenetration: 7.4, evVolume: 82300, riskLevel: "LOW" },
];

// ─── Utilities ──────────────────────────────────────────────────────────────

function getRiskBadgeColor(tier: string): { bg: string; text: string } {
  switch (tier) {
    case "HIGH":
      return { bg: "#dc2626", text: "#fff" };
    case "ELEVATED":
      return { bg: "#d97706", text: "#fff" };
    case "MODERATE":
      return { bg: "#ca8a04", text: "#fff" };
    case "LOW":
    case "NORMALIZING":
      return { bg: "#16a34a", text: "#fff" };
    default:
      return { bg: "#64748b", text: "#fff" };
  }
}

function getRatioLabel(ratio: number): { label: string; tier: string } {
  if (ratio >= 2.0) return { label: "HIGH RISK", tier: "HIGH" };
  if (ratio >= 1.5) return { label: "ELEVATED", tier: "ELEVATED" };
  return { label: "NORMALIZING", tier: "NORMALIZING" };
}

function formatCurrency(n: number): string {
  return "$" + n.toLocaleString("en-US");
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
  container.style.cssText = `
    max-width: 1440px; margin: 0 auto; padding: 20px;
    display: flex; flex-direction: column; gap: 16px;
  `;
  document.body.appendChild(container);

  // ── Demo mode banner ──
  if (_detectAppMode() === "demo") {
    const _db = document.createElement("div");
    _db.id = "_demo_banner";
    _db.style.cssText = "background:linear-gradient(135deg,#92400e22,#f59e0b11);border:1px solid #f59e0b44;border-radius:10px;padding:14px 20px;margin-bottom:12px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;";
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
    _db.querySelector("#_banner_save").addEventListener("click", () => {
      const k = _db.querySelector("#_banner_key").value.trim();
      if (!k) return;
      localStorage.setItem("mc_api_key", k);
      _db.style.background = "linear-gradient(135deg,#05966922,#10b98111)";
      _db.style.borderColor = "#10b98144";
      _db.innerHTML = '<div style="font-size:13px;font-weight:700;color:#10b981;">&#10003; API key saved — reloading with live data...</div>';
      setTimeout(() => location.reload(), 800);
    });
    _db.querySelector("#_banner_key").addEventListener("keydown", (e) => { if (e.key === "Enter") _db.querySelector("#_banner_save").click(); });
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
        <div style="font-size:12px;color:#94a3b8;">Lender portfolio depreciation & advance rate intelligence</div>
      </div>
    </div>
    <div style="font-size:12px;color:#64748b;">Updated: Mar 26, 2026</div>
  `;
  container.appendChild(header);

  // Scorecard Ribbon
  renderScorecard(container);

  // Main content area: chart (50%) + sidebar
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

// ─── Scorecard Ribbon ───────────────────────────────────────────────────────

function renderScorecard(parent: HTMLElement): void {
  const ribbon = document.createElement("div");
  ribbon.style.cssText = `
    display: flex; gap: 12px; padding: 14px 16px;
    background: #1e293b; border-radius: 10px; border: 1px solid #334155;
    overflow-x: auto;
  `;

  const ratioInfo = getRatioLabel(scorecard.evIceRatio);
  const riskColors = getRiskBadgeColor(ratioInfo.tier);

  const cards: { label: string; value: string; extra?: string }[] = [
    {
      label: "EV Penetration",
      value: formatPct(scorecard.evPenetration),
      extra: `<span style="color:${scorecard.evPenetrationTrend > 0 ? "#22c55e" : "#ef4444"};font-size:12px;margin-left:6px;">${scorecard.evPenetrationTrend > 0 ? "&#9650;" : "&#9660;"} ${formatPct(Math.abs(scorecard.evPenetrationTrend))}</span>`,
    },
    {
      label: "EV Avg Depreciation",
      value: formatPct(scorecard.evAvgDepreciation),
    },
    {
      label: "ICE Avg Depreciation",
      value: formatPct(scorecard.iceAvgDepreciation),
    },
    {
      label: "EV-to-ICE Depr. Ratio",
      value: scorecard.evIceRatio.toFixed(1) + "x",
      extra: `<span style="background:${riskColors.bg};color:${riskColors.text};font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;margin-left:8px;">${ratioInfo.label}</span>`,
    },
    {
      label: "EV Days Supply",
      value: scorecard.evDaysSupply.toString(),
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
      <div style="font-size:22px;font-weight:700;color:#f1f5f9;display:flex;align-items:center;">${c.value}${c.extra || ""}</div>
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

  // Clear
  ctx.clearRect(0, 0, W, H);

  // Y-axis range
  const yMin = 28000;
  const yMax = 50000;
  const yRange = yMax - yMin;

  // Helper: map data to canvas coords
  function xPos(i: number): number {
    return pad.left + (i / (monthlyPrices.length - 1)) * chartW;
  }
  function yPos(val: number): number {
    return pad.top + chartH - ((val - yMin) / yRange) * chartH;
  }

  // Grid lines
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 0.5;
  const yTicks = [28000, 32000, 36000, 40000, 44000, 48000];
  yTicks.forEach((val) => {
    const y = yPos(val);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(W - pad.right, y);
    ctx.stroke();

    // Y labels
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("$" + (val / 1000).toFixed(0) + "K", pad.left - 10, y + 4);
  });

  // X labels
  ctx.textAlign = "center";
  ctx.fillStyle = "#94a3b8";
  ctx.font = "11px -apple-system, sans-serif";
  monthlyPrices.forEach((p, i) => {
    const x = xPos(i);
    ctx.fillText(p.month, x, H - pad.bottom + 20);

    // Vertical tick
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + chartH);
    ctx.stroke();
  });

  // Shaded gap area between EV and ICE
  ctx.beginPath();
  monthlyPrices.forEach((p, i) => {
    const x = xPos(i);
    const y = yPos(p.evAvgPrice);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  for (let i = monthlyPrices.length - 1; i >= 0; i--) {
    const x = xPos(i);
    const y = yPos(monthlyPrices[i].iceAvgPrice);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(59, 130, 246, 0.08)";
  ctx.fill();

  // EV line (blue)
  ctx.beginPath();
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  monthlyPrices.forEach((p, i) => {
    const x = xPos(i);
    const y = yPos(p.evAvgPrice);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // EV dots
  monthlyPrices.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(xPos(i), yPos(p.evAvgPrice), 3, 0, Math.PI * 2);
    ctx.fillStyle = "#3b82f6";
    ctx.fill();
  });

  // ICE line (orange)
  ctx.beginPath();
  ctx.strokeStyle = "#f97316";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  monthlyPrices.forEach((p, i) => {
    const x = xPos(i);
    const y = yPos(p.iceAvgPrice);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // ICE dots
  monthlyPrices.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(xPos(i), yPos(p.iceAvgPrice), 3, 0, Math.PI * 2);
    ctx.fillStyle = "#f97316";
    ctx.fill();
  });

  // "EV Gap" label in the middle of the shaded area
  const midIdx = Math.floor(monthlyPrices.length / 2);
  const midX = xPos(midIdx);
  const midEvY = yPos(monthlyPrices[midIdx].evAvgPrice);
  const midIceY = yPos(monthlyPrices[midIdx].iceAvgPrice);
  const gapCenterY = (midEvY + midIceY) / 2;

  ctx.fillStyle = "rgba(59, 130, 246, 0.6)";
  ctx.font = "bold 12px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("EV Gap", midX, gapCenterY);

  // Axis labels
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
  const evLTV = 72;
  const iceLTV = 92;
  const differential = scorecard.evAvgDepreciation - scorecard.iceAvgDepreciation;

  const panel = document.createElement("div");
  panel.style.cssText = `
    background: #1e293b; border-radius: 10px; border: 1px solid #334155;
    padding: 20px; height: 100%;
  `;
  panel.innerHTML = `
    <div style="font-size:15px;font-weight:600;color:#f1f5f9;margin-bottom:16px;">Advance Rate Recommendations</div>

    <div style="background:#0f172a;border-radius:8px;border:1px solid #334155;padding:16px;margin-bottom:14px;">
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Suggested LTV Cap for EV</div>
      <div style="font-size:32px;font-weight:800;color:#3b82f6;">${evLTV}%</div>
      <div style="margin-top:8px;">
        <div style="height:6px;background:#1e293b;border-radius:3px;overflow:hidden;border:1px solid #334155;">
          <div style="height:100%;width:${evLTV}%;background:linear-gradient(90deg,#3b82f6,#60a5fa);border-radius:3px;"></div>
        </div>
      </div>
    </div>

    <div style="background:#0f172a;border-radius:8px;border:1px solid #334155;padding:16px;margin-bottom:14px;">
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Suggested LTV Cap for ICE</div>
      <div style="font-size:32px;font-weight:800;color:#f97316;">${iceLTV}%</div>
      <div style="margin-top:8px;">
        <div style="height:6px;background:#1e293b;border-radius:3px;overflow:hidden;border:1px solid #334155;">
          <div style="height:100%;width:${iceLTV}%;background:linear-gradient(90deg,#f97316,#fb923c);border-radius:3px;"></div>
        </div>
      </div>
    </div>

    <div style="background:#0f172a;border-radius:8px;border:1px solid #334155;padding:16px;margin-bottom:14px;">
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">LTV Spread (ICE - EV)</div>
      <div style="font-size:28px;font-weight:700;color:#f1f5f9;">${iceLTV - evLTV} pts</div>
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
  const sorted = [...brandRisks].sort((a, b) => b.evDepreciationRate - a.evDepreciationRate);

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

  // Header
  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr style="border-bottom:1px solid #334155;">
      <th style="text-align:left;padding:8px 10px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Make</th>
      <th style="text-align:right;padding:8px 10px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">EV Volume</th>
      <th style="text-align:right;padding:8px 10px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">EV Avg Price</th>
      <th style="text-align:right;padding:8px 10px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">EV Depr Rate</th>
      <th style="text-align:right;padding:8px 10px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">ICE Depr Rate</th>
      <th style="text-align:right;padding:8px 10px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">EV/ICE Ratio</th>
      <th style="text-align:center;padding:8px 10px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Risk Tier</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  sorted.forEach((row, idx) => {
    const colors = getRiskBadgeColor(row.riskTier);
    const isEVOnly = row.make === "Tesla" || row.make === "Rivian" || row.make === "Lucid";
    const ratioText = isEVOnly ? "EV Only" : row.evIceRatio.toFixed(2) + "x";
    const iceText = isEVOnly ? "N/A" : formatPct(row.iceDepreciationRate);
    const bgColor = idx % 2 === 0 ? "transparent" : "rgba(51,65,85,0.2)";

    const tr = document.createElement("tr");
    tr.style.cssText = `border-bottom:1px solid #1e293b;background:${bgColor};`;
    tr.innerHTML = `
      <td style="padding:10px;color:#f1f5f9;font-weight:500;">${row.make}</td>
      <td style="padding:10px;text-align:right;color:#cbd5e1;">${formatVolume(row.evVolume)}</td>
      <td style="padding:10px;text-align:right;color:#cbd5e1;">${formatCurrency(row.evAvgPrice)}</td>
      <td style="padding:10px;text-align:right;color:#f87171;font-weight:600;">${formatPct(row.evDepreciationRate)}</td>
      <td style="padding:10px;text-align:right;color:#94a3b8;">${iceText}</td>
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
    const bgColor = getPenetrationBg(row.evPenetration);
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

// ─── Bootstrap ──────────────────────────────────────────────────────────────

render();
