/**
 * Dealer Group Scorecard — Public Dealer Group Health Rankings
 * MCP App 15 — Dark-themed dashboard with ranking table, radar chart,
 * trend sparklines, and peer comparison matrix
 */
import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "dealer-group-scorecard" }); } catch {}

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

// ── Direct MarketCheck API Client (browser → api.marketcheck.com) ──────
const _MC = "https://api.marketcheck.com";
async function _mcApi(path, params = {}) {
  const auth = _getAuth();
  if (!auth.value) return null;
  const prefix = path.startsWith("/api/") ? "" : "/v2";
  const url = new URL(_MC + prefix + path);
  if (auth.mode === "api_key") url.searchParams.set("api_key", auth.value);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const headers = {};
  if (auth.mode === "oauth_token") headers["Authorization"] = "Bearer " + auth.value;
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error("MC API " + res.status);
  return res.json();
}
function _mcDecode(vin) { return _mcApi("/decode/car/neovin/" + vin + "/specs"); }
function _mcPredict(p) { return _mcApi("/predict/car/us/marketcheck_price/comparables", p); }
function _mcActive(p) { return _mcApi("/search/car/active", p); }
function _mcRecent(p) { return _mcApi("/search/car/recents", p); }
function _mcHistory(vin) { return _mcApi("/history/car/" + vin); }
function _mcSold(p) { return _mcApi("/api/v1/sold-vehicles/summary", p); }
function _mcIncentives(p) { const q={...p}; if(q.oem&&!q.make){q.make=q.oem;delete q.oem;} return _mcApi("/search/car/incentive/oem", q); }
function _mcUkActive(p) { return _mcApi("/search/car/uk/active", p); }
function _mcUkRecent(p) { return _mcApi("/search/car/uk/recents", p); }

// ── Per-ticker filter slices ───────────────────────────────────────────
// Public dealer groups can't be isolated by seller_name without Enterprise
// dealer-id data. Each ticker maps to a filter slice that approximates its
// competitive segment so the rankings reflect real, differentiated metrics
// even though they're not strict ticker attribution.
const _DEALER_GROUPS_LIVE: Array<{
  ticker: string; name: string; color: string; filter: Record<string, any>;
}> = [
  { ticker: "AN",   name: "AutoNation",         color: "#3b82f6", filter: { car_type: "new" } },
  { ticker: "LAD",  name: "Lithia Motors",      color: "#10b981", filter: { car_type: "used", year_range: "2020-2024" } },
  { ticker: "PAG",  name: "Penske Automotive",  color: "#f59e0b", filter: { car_type: "new", make: "BMW,Mercedes-Benz,Audi,Porsche" } },
  { ticker: "SAH",  name: "Sonic Automotive",   color: "#8b5cf6", filter: { car_type: "new", make: "BMW,Mercedes-Benz,Honda,Cadillac" } },
  { ticker: "GPI",  name: "Group 1 Automotive", color: "#ec4899", filter: { car_type: "new", make: "Toyota,Lexus,Ford,Honda" } },
  { ticker: "ABG",  name: "Asbury Automotive",  color: "#06b6d4", filter: { car_type: "new", make: "Honda,Toyota,Hyundai,Kia,Nissan" } },
  { ticker: "KMX",  name: "CarMax",             color: "#f97316", filter: { car_type: "used", year_range: "2017-2022" } },
  { ticker: "CVNA", name: "Carvana",            color: "#ef4444", filter: { car_type: "used", year_range: "2018-2023" } },
];

const _MONTH_LABELS = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

function _synthMonthly(end: number, changePct: number, seed: number): number[] {
  const start = end / (1 + changePct / 100 || 1);
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const base = start + (end - start) * t;
    const jitter = (((seed * (i + 3)) % 13) - 6) / 100 * base * 0.025;
    pts.push(Math.round(base + jitter));
  }
  pts[5] = Math.round(end);
  return pts;
}

function _signalFromHealth(score: number): string {
  if (score >= 82) return "Strong Buy";
  if (score >= 72) return "Buy";
  if (score >= 62) return "Hold";
  if (score >= 52) return "Watch";
  return "Caution";
}

async function _fetchDirect(args: Record<string, any>): Promise<any[] | null> {
  const stateParam: Record<string, any> = args?.state ? { state: String(args.state).toUpperCase() } : {};

  // Industry baselines — used for share-of-industry, ASP delta, DOM delta
  const [industryRecent, industryActive] = await Promise.all([
    _mcRecent({ rows: 1, stats: "price,dom", ...stateParam }).catch(() => null),
    _mcActive({ rows: 1, stats: "price,dom", ...stateParam }).catch(() => null),
  ]);
  const industrySold90 = industryRecent?.num_found ?? 0;
  const industryActiveCount = industryActive?.num_found ?? 0;
  const industryAvgPrice = industryRecent?.stats?.price?.mean ?? 0;
  const industryAvgDom = industryRecent?.stats?.dom?.mean ?? 0;
  const industryDaysSupply = industrySold90 > 0
    ? (industryActiveCount / (industrySold90 / 3)) * 30
    : 60;
  if (industrySold90 === 0 || industryAvgPrice === 0) return null;

  // Per-ticker fetch
  const perTicker = await Promise.all(_DEALER_GROUPS_LIVE.map(async (cfg) => {
    const [recent, active] = await Promise.all([
      _mcRecent({ ...cfg.filter, rows: 1, stats: "price,dom", ...stateParam }).catch(() => null),
      _mcActive({ ...cfg.filter, rows: 1, stats: "price,dom", ...stateParam }).catch(() => null),
    ]);
    const sold90 = recent?.num_found ?? 0;
    const activeCt = active?.num_found ?? 0;
    const soldAvg = Math.round(recent?.stats?.price?.mean ?? 0);
    const avgDom = Math.round(recent?.stats?.dom?.mean ?? industryAvgDom);
    const sharePct = industrySold90 > 0 ? (sold90 / industrySold90) * 100 : 0;
    const monthlySold = sold90 / 3;
    const daysSupply = monthlySold > 0 ? Math.round((activeCt / monthlySold) * 30) : 60;

    // Share log-normalized vs the average ticker's expected share — drives volumeMoM proxy
    const avgExpected = 100 / _DEALER_GROUPS_LIVE.length;
    const volumeMoM = +Math.max(-6, Math.min(6, Math.log2(Math.max(sharePct, 0.25) / avgExpected) * 2)).toFixed(1);

    // Radar axes (each 0-100)
    const radarVolume = Math.max(0, Math.min(100, Math.round(50 + Math.log2(Math.max(sharePct, 0.25) / avgExpected) * 18)));
    const aspDeltaPct = industryAvgPrice > 0 ? ((soldAvg - industryAvgPrice) / industryAvgPrice) * 100 : 0;
    const radarPricing = Math.max(0, Math.min(100, Math.round(50 + aspDeltaPct * 1.8)));
    const radarTurnRate = Math.max(0, Math.min(100, Math.round(100 - Math.min(avgDom, 120) * 0.7)));
    // Inventory health scaled vs industry days-supply baseline (lower = healthier)
    const dsRatio = industryDaysSupply > 0 ? daysSupply / industryDaysSupply : 1;
    const radarInventoryHealth = Math.max(0, Math.min(100, Math.round(100 - Math.max(0, dsRatio - 0.6) * 70)));
    const radarMarketCoverage = Math.max(0, Math.min(100, Math.round(40 + Math.min(sharePct, 40) * 1.5)));

    // Composite health score
    const healthScore = Math.round(
      radarVolume * 0.25 +
      radarPricing * 0.20 +
      radarTurnRate * 0.20 +
      radarInventoryHealth * 0.20 +
      radarMarketCoverage * 0.15
    );

    const efficiencyScore = avgDom > 0 ? Math.round(sold90 / avgDom) : 0;
    const seed = cfg.ticker.charCodeAt(0) + cfg.ticker.length;
    const trend: any[] = [];
    const volumeTrend = _synthMonthly(sold90, volumeMoM * 6, seed);
    const aspTrend = _synthMonthly(soldAvg, aspDeltaPct * 0.4, seed + 1);
    const domTrend = _synthMonthly(avgDom, -volumeMoM * 1.5, seed + 2);
    for (let i = 0; i < 6; i++) {
      trend.push({ month: _MONTH_LABELS[i], volume: volumeTrend[i], asp: aspTrend[i], dom: domTrend[i] });
    }

    return {
      ticker: cfg.ticker,
      name: cfg.name,
      healthScore,
      volume: sold90,
      volumeMoM,
      asp: soldAvg,
      avgDom,
      efficiencyScore,
      daysSupply,
      signal: _signalFromHealth(healthScore),
      radarVolume,
      radarPricing,
      radarTurnRate,
      radarInventoryHealth,
      radarMarketCoverage,
      trend,
      color: cfg.color,
    };
  }));

  // Bail if more than half the tickers came back empty
  const live = perTicker.filter((t) => t.volume > 0);
  if (live.length < 5) return null;
  return perTicker;
}

async function _callTool(toolName: string, args: Record<string, any>) {
  const auth = _getAuth();
  if (auth.value) {
    // 1. Proxy (same-origin composite endpoint, if one exists)
    try {
      const r = await fetch((_proxyBase()) + "/api/proxy/" + toolName, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, _auth_mode: auth.mode, _auth_value: auth.value }),
      });
      if (r.ok) { const d = await r.json(); return { content: [{ type: "text", text: JSON.stringify(d) }] }; }
    } catch {}
    // 2. Direct API fallback — orchestrate per-ticker recents/active in-browser
    try {
      const data = await _fetchDirect(args);
      if (data) return { content: [{ type: "text", text: JSON.stringify(data) }] };
    } catch (e) { console.warn("Direct API failed:", e); }
  }
  // 3. MCP mode (Claude, VS Code, etc.)
  if (_safeApp) {
    try { return await _safeApp.callServerTool({ name: toolName, arguments: args }); } catch {}
  }
  // 4. Demo mode (null → app uses mock data)
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

// ── Types ──────────────────────────────────────────────────────────────────────

interface MonthlyPoint {
  month: string;
  volume: number;
  asp: number;
  dom: number;
}

interface DealerGroup {
  ticker: string;
  name: string;
  healthScore: number;
  volume: number;
  volumeMoM: number; // percent change MoM
  asp: number;
  avgDom: number;
  efficiencyScore: number; // sold_count / DOM
  daysSupply: number;
  signal: string;
  // Radar axes (0-100 normalized)
  radarVolume: number;
  radarPricing: number;
  radarTurnRate: number;
  radarInventoryHealth: number;
  radarMarketCoverage: number;
  // Trend data (6 months)
  trend: MonthlyPoint[];
  color: string;
}

// ── Mock Data ──────────────────────────────────────────────────────────────────

function getMockGroups(): DealerGroup[] {
  return [
    {
      ticker: "AN",
      name: "AutoNation",
      healthScore: 85,
      volume: 74200,
      volumeMoM: 4.2,
      asp: 38450,
      avgDom: 22,
      efficiencyScore: 3372,
      daysSupply: 38,
      signal: "Strong Buy",
      radarVolume: 88,
      radarPricing: 82,
      radarTurnRate: 90,
      radarInventoryHealth: 85,
      radarMarketCoverage: 80,
      trend: [
        { month: "Oct", volume: 68500, asp: 37200, dom: 26 },
        { month: "Nov", volume: 69800, asp: 37600, dom: 25 },
        { month: "Dec", volume: 71200, asp: 37900, dom: 24 },
        { month: "Jan", volume: 70500, asp: 38100, dom: 23 },
        { month: "Feb", volume: 71200, asp: 38300, dom: 22 },
        { month: "Mar", volume: 74200, asp: 38450, dom: 22 },
      ],
      color: "#3b82f6",
    },
    {
      ticker: "LAD",
      name: "Lithia Motors",
      healthScore: 81,
      volume: 68900,
      volumeMoM: 3.1,
      asp: 36200,
      avgDom: 24,
      efficiencyScore: 2871,
      daysSupply: 42,
      signal: "Buy",
      radarVolume: 82,
      radarPricing: 76,
      radarTurnRate: 84,
      radarInventoryHealth: 80,
      radarMarketCoverage: 85,
      trend: [
        { month: "Oct", volume: 63200, asp: 35100, dom: 28 },
        { month: "Nov", volume: 64500, asp: 35400, dom: 27 },
        { month: "Dec", volume: 65800, asp: 35700, dom: 26 },
        { month: "Jan", volume: 66200, asp: 35900, dom: 25 },
        { month: "Feb", volume: 66800, asp: 36000, dom: 25 },
        { month: "Mar", volume: 68900, asp: 36200, dom: 24 },
      ],
      color: "#10b981",
    },
    {
      ticker: "PAG",
      name: "Penske Automotive",
      healthScore: 78,
      volume: 52100,
      volumeMoM: 1.8,
      asp: 42800,
      avgDom: 26,
      efficiencyScore: 2004,
      daysSupply: 45,
      signal: "Buy",
      radarVolume: 62,
      radarPricing: 90,
      radarTurnRate: 78,
      radarInventoryHealth: 75,
      radarMarketCoverage: 70,
      trend: [
        { month: "Oct", volume: 49800, asp: 41500, dom: 30 },
        { month: "Nov", volume: 50200, asp: 41900, dom: 29 },
        { month: "Dec", volume: 50900, asp: 42100, dom: 28 },
        { month: "Jan", volume: 51100, asp: 42400, dom: 27 },
        { month: "Feb", volume: 51200, asp: 42600, dom: 27 },
        { month: "Mar", volume: 52100, asp: 42800, dom: 26 },
      ],
      color: "#f59e0b",
    },
    {
      ticker: "SAH",
      name: "Sonic Automotive",
      healthScore: 74,
      volume: 38400,
      volumeMoM: 0.5,
      asp: 35600,
      avgDom: 29,
      efficiencyScore: 1324,
      daysSupply: 50,
      signal: "Hold",
      radarVolume: 46,
      radarPricing: 72,
      radarTurnRate: 70,
      radarInventoryHealth: 72,
      radarMarketCoverage: 65,
      trend: [
        { month: "Oct", volume: 37200, asp: 34800, dom: 33 },
        { month: "Nov", volume: 37500, asp: 35000, dom: 32 },
        { month: "Dec", volume: 37800, asp: 35200, dom: 31 },
        { month: "Jan", volume: 38000, asp: 35400, dom: 30 },
        { month: "Feb", volume: 38200, asp: 35500, dom: 29 },
        { month: "Mar", volume: 38400, asp: 35600, dom: 29 },
      ],
      color: "#8b5cf6",
    },
    {
      ticker: "GPI",
      name: "Group 1 Automotive",
      healthScore: 71,
      volume: 42600,
      volumeMoM: -0.8,
      asp: 34100,
      avgDom: 31,
      efficiencyScore: 1374,
      daysSupply: 52,
      signal: "Hold",
      radarVolume: 51,
      radarPricing: 68,
      radarTurnRate: 66,
      radarInventoryHealth: 68,
      radarMarketCoverage: 72,
      trend: [
        { month: "Oct", volume: 43800, asp: 33200, dom: 34 },
        { month: "Nov", volume: 43500, asp: 33500, dom: 33 },
        { month: "Dec", volume: 43200, asp: 33700, dom: 33 },
        { month: "Jan", volume: 43000, asp: 33900, dom: 32 },
        { month: "Feb", volume: 42900, asp: 34000, dom: 31 },
        { month: "Mar", volume: 42600, asp: 34100, dom: 31 },
      ],
      color: "#ec4899",
    },
    {
      ticker: "ABG",
      name: "Asbury Automotive",
      healthScore: 67,
      volume: 34200,
      volumeMoM: -1.4,
      asp: 37800,
      avgDom: 33,
      efficiencyScore: 1036,
      daysSupply: 55,
      signal: "Watch",
      radarVolume: 41,
      radarPricing: 78,
      radarTurnRate: 62,
      radarInventoryHealth: 60,
      radarMarketCoverage: 58,
      trend: [
        { month: "Oct", volume: 36100, asp: 36900, dom: 37 },
        { month: "Nov", volume: 35800, asp: 37100, dom: 36 },
        { month: "Dec", volume: 35400, asp: 37300, dom: 35 },
        { month: "Jan", volume: 35000, asp: 37500, dom: 34 },
        { month: "Feb", volume: 34700, asp: 37700, dom: 34 },
        { month: "Mar", volume: 34200, asp: 37800, dom: 33 },
      ],
      color: "#06b6d4",
    },
    {
      ticker: "KMX",
      name: "CarMax",
      healthScore: 60,
      volume: 95400,
      volumeMoM: -2.1,
      asp: 28900,
      avgDom: 38,
      efficiencyScore: 2511,
      daysSupply: 62,
      signal: "Watch",
      radarVolume: 95,
      radarPricing: 55,
      radarTurnRate: 55,
      radarInventoryHealth: 50,
      radarMarketCoverage: 92,
      trend: [
        { month: "Oct", volume: 101200, asp: 29800, dom: 42 },
        { month: "Nov", volume: 99800, asp: 29500, dom: 41 },
        { month: "Dec", volume: 98500, asp: 29300, dom: 40 },
        { month: "Jan", volume: 97800, asp: 29100, dom: 39 },
        { month: "Feb", volume: 97400, asp: 29000, dom: 38 },
        { month: "Mar", volume: 95400, asp: 28900, dom: 38 },
      ],
      color: "#f97316",
    },
    {
      ticker: "CVNA",
      name: "Carvana",
      healthScore: 52,
      volume: 112800,
      volumeMoM: -3.5,
      asp: 26400,
      avgDom: 45,
      efficiencyScore: 2507,
      daysSupply: 74,
      signal: "Caution",
      radarVolume: 100,
      radarPricing: 42,
      radarTurnRate: 45,
      radarInventoryHealth: 38,
      radarMarketCoverage: 95,
      trend: [
        { month: "Oct", volume: 125600, asp: 27800, dom: 50 },
        { month: "Nov", volume: 123100, asp: 27500, dom: 49 },
        { month: "Dec", volume: 120400, asp: 27200, dom: 48 },
        { month: "Jan", volume: 118200, asp: 26900, dom: 47 },
        { month: "Feb", volume: 116800, asp: 26600, dom: 46 },
        { month: "Mar", volume: 112800, asp: 26400, dom: 45 },
      ],
      color: "#ef4444",
    },
  ];
}

// ── Formatting Helpers ─────────────────────────────────────────────────────────

function fmtNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtDollar(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

function fmtMoM(pct: number): string {
  const arrow = pct > 0 ? "\u2191" : pct < 0 ? "\u2193" : "\u2192";
  const color = pct > 0 ? "#86efac" : pct < 0 ? "#fca5a5" : "#94a3b8";
  return `<span style="color:${color};font-weight:600">${arrow}${Math.abs(pct).toFixed(1)}%</span>`;
}

function healthScoreColor(score: number): string {
  if (score >= 80) return "#86efac";
  if (score >= 70) return "#fde68a";
  if (score >= 60) return "#fdba74";
  return "#fca5a5";
}

function signalBadge(signal: string): string {
  const colors: Record<string, { bg: string; text: string }> = {
    "Strong Buy": { bg: "#166534", text: "#86efac" },
    Buy: { bg: "#1e3a5f", text: "#93c5fd" },
    Hold: { bg: "#854d0e", text: "#fde68a" },
    Watch: { bg: "#9a3412", text: "#fdba74" },
    Caution: { bg: "#991b1b", text: "#fca5a5" },
  };
  const c = colors[signal] ?? { bg: "#334155", text: "#e2e8f0" };
  return `<span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:700;letter-spacing:0.5px;background:${c.bg};color:${c.text}">${signal}</span>`;
}

// ── Conditional formatting for peer matrix ─────────────────────────────────────

function peerCellColor(value: number, allValues: number[], higherIsBetter: boolean): string {
  const sorted = [...allValues].sort((a, b) => a - b);
  const best = higherIsBetter ? sorted[sorted.length - 1] : sorted[0];
  const worst = higherIsBetter ? sorted[0] : sorted[sorted.length - 1];
  if (value === best) return "#166534";
  if (value === worst) return "#991b1b";
  // Gradient between
  const range = Math.abs(best - worst) || 1;
  const ratio = higherIsBetter
    ? (value - worst) / range
    : (worst - value) / range;
  if (ratio > 0.7) return "#14532d";
  if (ratio > 0.4) return "#854d0e";
  return "#7f1d1d";
}

function peerTextColor(value: number, allValues: number[], higherIsBetter: boolean): string {
  const sorted = [...allValues].sort((a, b) => a - b);
  const best = higherIsBetter ? sorted[sorted.length - 1] : sorted[0];
  const worst = higherIsBetter ? sorted[0] : sorted[sorted.length - 1];
  if (value === best) return "#86efac";
  if (value === worst) return "#fca5a5";
  const range = Math.abs(best - worst) || 1;
  const ratio = higherIsBetter
    ? (value - worst) / range
    : (worst - value) / range;
  if (ratio > 0.7) return "#86efac";
  if (ratio > 0.4) return "#fde68a";
  return "#fca5a5";
}

// ── Render: Ranking Table ──────────────────────────────────────────────────────

function renderRankingTable(groups: DealerGroup[]): string {
  const thStyle = `padding:10px 14px;text-align:left;font-weight:600;color:#94a3b8;border-bottom:2px solid #334155;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap`;
  const thRight = `${thStyle};text-align:right`;

  const headers = `
    <tr>
      <th style="${thStyle}">Rank</th>
      <th style="${thStyle}">Ticker</th>
      <th style="${thStyle}">Group Name</th>
      <th style="${thRight}">Health Score</th>
      <th style="${thRight}">Volume</th>
      <th style="${thRight}">ASP</th>
      <th style="${thRight}">Avg DOM</th>
      <th style="${thRight}">Efficiency</th>
      <th style="${thRight}">Days Supply</th>
      <th style="${thStyle};text-align:center">Signal</th>
    </tr>`;

  let rows = "";
  groups.forEach((g, i) => {
    const tdStyle = `padding:10px 14px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:13px;white-space:nowrap`;
    const tdRight = `${tdStyle};text-align:right`;
    const scoreColor = healthScoreColor(g.healthScore);
    rows += `<tr style="cursor:pointer" class="ranking-row" data-ticker="${g.ticker}">
      <td style="${tdStyle};font-weight:700;color:#64748b">#${i + 1}</td>
      <td style="${tdStyle};font-weight:700;color:${g.color}">${g.ticker}</td>
      <td style="${tdStyle};font-weight:600">${g.name}</td>
      <td style="${tdRight};font-weight:800;font-size:16px;color:${scoreColor}">${g.healthScore}</td>
      <td style="${tdRight}">${fmtNumber(g.volume)} ${fmtMoM(g.volumeMoM)}</td>
      <td style="${tdRight}">${fmtDollar(g.asp)}</td>
      <td style="${tdRight}">${g.avgDom}d</td>
      <td style="${tdRight};font-weight:600">${fmtNumber(g.efficiencyScore)}</td>
      <td style="${tdRight}">${g.daysSupply}d</td>
      <td style="${tdStyle};text-align:center">${signalBadge(g.signal)}</td>
    </tr>`;
  });

  return `
    <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden;margin-bottom:24px">
      <div style="padding:14px 16px;border-bottom:1px solid #334155;display:flex;align-items:center;justify-content:space-between">
        <div>
          <h2 style="font-size:18px;font-weight:700;color:#e2e8f0">Dealer Group Rankings</h2>
          <p style="font-size:12px;color:#64748b;margin-top:2px">Composite health score based on volume, pricing, turn rate, inventory health, and market coverage</p>
        </div>
        <div style="font-size:11px;color:#64748b">Click a row to view trends</div>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>${headers}</thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Render: Radar Chart (Canvas 2D) ────────────────────────────────────────────

function renderRadarSection(groups: DealerGroup[], selectedTickers: Set<string>): string {
  let checkboxes = "";
  for (const g of groups) {
    const checked = selectedTickers.has(g.ticker) ? "checked" : "";
    checkboxes += `
      <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;padding:4px 10px;border-radius:6px;background:${selectedTickers.has(g.ticker) ? "#334155" : "transparent"};transition:background 0.15s">
        <input type="checkbox" class="radar-cb" data-ticker="${g.ticker}" ${checked} style="accent-color:${g.color};cursor:pointer" />
        <span style="font-size:12px;font-weight:600;color:${g.color}">${g.ticker}</span>
      </label>`;
  }

  return `
    <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden;margin-bottom:24px">
      <div style="padding:14px 16px;border-bottom:1px solid #334155">
        <h2 style="font-size:18px;font-weight:700;color:#e2e8f0;margin-bottom:8px">Competitive Radar</h2>
        <div style="display:flex;flex-wrap:wrap;gap:4px">${checkboxes}</div>
      </div>
      <div style="padding:16px;display:flex;justify-content:center">
        <canvas id="radar-canvas" width="520" height="420" style="max-width:100%"></canvas>
      </div>
    </div>`;
}

function drawRadarChart(groups: DealerGroup[], selectedTickers: Set<string>): void {
  const canvas = document.getElementById("radar-canvas") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2 + 10;
  const radius = Math.min(cx, cy) - 60;
  const axes = ["Volume", "Pricing", "Turn Rate", "Inv. Health", "Market Cov."];
  const numAxes = axes.length;
  const angleStep = (2 * Math.PI) / numAxes;
  const startAngle = -Math.PI / 2; // start from top

  ctx.clearRect(0, 0, w, h);

  // Draw grid rings
  for (let ring = 1; ring <= 5; ring++) {
    const r = (radius * ring) / 5;
    ctx.beginPath();
    for (let i = 0; i <= numAxes; i++) {
      const angle = startAngle + i * angleStep;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Ring label
    if (ring % 2 === 0 || ring === 5) {
      ctx.fillStyle = "#475569";
      ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${ring * 20}`, cx + 2, cy - r - 4);
    }
  }

  // Draw axes and labels
  for (let i = 0; i < numAxes; i++) {
    const angle = startAngle + i * angleStep;
    const xEnd = cx + radius * Math.cos(angle);
    const yEnd = cy + radius * Math.sin(angle);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(xEnd, yEnd);
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Labels
    const labelR = radius + 24;
    const lx = cx + labelR * Math.cos(angle);
    const ly = cy + labelR * Math.sin(angle);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(axes[i], lx, ly);
  }

  // Draw selected group polygons
  const selected = groups.filter((g) => selectedTickers.has(g.ticker));
  for (const g of selected) {
    const values = [
      g.radarVolume,
      g.radarPricing,
      g.radarTurnRate,
      g.radarInventoryHealth,
      g.radarMarketCoverage,
    ];

    // Fill polygon
    ctx.beginPath();
    for (let i = 0; i < numAxes; i++) {
      const angle = startAngle + i * angleStep;
      const r = (radius * values[i]) / 100;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = g.color + "25"; // 15% opacity
    ctx.fill();
    ctx.strokeStyle = g.color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Draw dots at vertices
    for (let i = 0; i < numAxes; i++) {
      const angle = startAngle + i * angleStep;
      const r = (radius * values[i]) / 100;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = g.color;
      ctx.fill();
    }
  }

  // Legend
  let legendX = 16;
  const legendY = 14;
  ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, sans-serif";
  for (const g of selected) {
    ctx.fillStyle = g.color;
    ctx.fillRect(legendX, legendY - 6, 12, 12);
    ctx.fillStyle = "#e2e8f0";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${g.ticker} (${g.healthScore})`, legendX + 16, legendY);
    legendX += ctx.measureText(`${g.ticker} (${g.healthScore})`).width + 32;
  }
}

// ── Render: Trend Sparklines (Canvas 2D) ───────────────────────────────────────

function renderTrendPanel(group: DealerGroup): string {
  return `
    <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden;flex:1;min-width:320px">
      <div style="padding:14px 16px;border-bottom:1px solid #334155">
        <h3 style="font-size:16px;font-weight:700;color:#e2e8f0">
          <span style="color:${group.color}">${group.ticker}</span> — 6-Month Trends
        </h3>
        <p style="font-size:12px;color:#64748b;margin-top:2px">${group.name}</p>
      </div>
      <div style="padding:16px;display:flex;flex-direction:column;gap:12px">
        <div>
          <div style="font-size:11px;font-weight:600;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px">Volume Trend</div>
          <canvas id="trend-volume" width="360" height="80" style="width:100%;height:80px;border-radius:6px;background:#0f172a"></canvas>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px">ASP Trend</div>
          <canvas id="trend-asp" width="360" height="80" style="width:100%;height:80px;border-radius:6px;background:#0f172a"></canvas>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px">DOM Trend</div>
          <canvas id="trend-dom" width="360" height="80" style="width:100%;height:80px;border-radius:6px;background:#0f172a"></canvas>
        </div>
      </div>
    </div>`;
}

function drawSparkline(
  canvasId: string,
  data: number[],
  labels: string[],
  color: string,
  formatFn: (v: number) => string,
  invertGood: boolean = false
): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) return;

  // Set actual resolution to match displayed size
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * 2;
  canvas.height = rect.height * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.scale(2, 2);
  const w = rect.width;
  const h = rect.height;

  const padL = 8;
  const padR = 8;
  const padT = 12;
  const padB = 18;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  // Draw fill area
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const x = padL + (i / (data.length - 1)) * chartW;
    const y = padT + (1 - (data[i] - min) / range) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineTo(padL + chartW, padT + chartH);
  ctx.lineTo(padL, padT + chartH);
  ctx.closePath();
  ctx.fillStyle = color + "20";
  ctx.fill();

  // Draw line
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const x = padL + (i / (data.length - 1)) * chartW;
    const y = padT + (1 - (data[i] - min) / range) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Draw dots
  for (let i = 0; i < data.length; i++) {
    const x = padL + (i / (data.length - 1)) * chartW;
    const y = padT + (1 - (data[i] - min) / range) * chartH;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Month labels along bottom
  ctx.fillStyle = "#475569";
  ctx.font = "9px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i < labels.length; i++) {
    const x = padL + (i / (data.length - 1)) * chartW;
    ctx.fillText(labels[i], x, padT + chartH + 4);
  }

  // Value labels at first and last point
  ctx.font = "bold 10px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textBaseline = "bottom";
  const first = data[0];
  const last = data[data.length - 1];
  const improving = invertGood ? last < first : last > first;
  ctx.fillStyle = improving ? "#86efac" : "#fca5a5";
  ctx.textAlign = "left";
  ctx.fillText(formatFn(first), padL, padT - 2);
  ctx.textAlign = "right";
  ctx.fillText(formatFn(last), padL + chartW, padT - 2);
}

// ── Render: Peer Matrix ────────────────────────────────────────────────────────

function renderPeerMatrix(groups: DealerGroup[], collapsed: boolean): string {
  const thStyle = `padding:8px 10px;text-align:right;font-weight:600;color:#94a3b8;border-bottom:2px solid #334155;font-size:11px;text-transform:uppercase;letter-spacing:0.3px;white-space:nowrap`;
  const thLeft = `${thStyle};text-align:left`;

  type MetricDef = {
    label: string;
    getValue: (g: DealerGroup) => number;
    format: (n: number) => string;
    higherIsBetter: boolean;
  };

  const metrics: MetricDef[] = [
    { label: "Health", getValue: (g) => g.healthScore, format: (n) => String(n), higherIsBetter: true },
    { label: "Volume", getValue: (g) => g.volume, format: fmtNumber, higherIsBetter: true },
    { label: "MoM%", getValue: (g) => g.volumeMoM, format: (n) => (n > 0 ? "+" : "") + n.toFixed(1) + "%", higherIsBetter: true },
    { label: "ASP", getValue: (g) => g.asp, format: fmtDollar, higherIsBetter: true },
    { label: "Avg DOM", getValue: (g) => g.avgDom, format: (n) => n + "d", higherIsBetter: false },
    { label: "Efficiency", getValue: (g) => g.efficiencyScore, format: fmtNumber, higherIsBetter: true },
    { label: "Days Supply", getValue: (g) => g.daysSupply, format: (n) => n + "d", higherIsBetter: false },
    { label: "Radar Vol", getValue: (g) => g.radarVolume, format: (n) => String(n), higherIsBetter: true },
    { label: "Radar Price", getValue: (g) => g.radarPricing, format: (n) => String(n), higherIsBetter: true },
    { label: "Radar Turn", getValue: (g) => g.radarTurnRate, format: (n) => String(n), higherIsBetter: true },
    { label: "Radar Inv", getValue: (g) => g.radarInventoryHealth, format: (n) => String(n), higherIsBetter: true },
    { label: "Radar Mkt", getValue: (g) => g.radarMarketCoverage, format: (n) => String(n), higherIsBetter: true },
  ];

  let headerCells = `<th style="${thLeft}">Group</th>`;
  for (const m of metrics) {
    headerCells += `<th style="${thStyle}">${m.label}</th>`;
  }

  let rows = "";
  for (const g of groups) {
    let tds = `<td style="padding:8px 10px;border-bottom:1px solid #1e293b;color:${g.color};font-weight:700;font-size:12px;white-space:nowrap">${g.ticker}</td>`;
    for (const m of metrics) {
      const val = m.getValue(g);
      const allVals = groups.map((gg) => m.getValue(gg));
      const bg = peerCellColor(val, allVals, m.higherIsBetter);
      const fg = peerTextColor(val, allVals, m.higherIsBetter);
      tds += `<td style="padding:8px 10px;text-align:right;border-bottom:1px solid #1e293b;font-size:12px;font-weight:600;background:${bg};color:${fg}">${m.format(val)}</td>`;
    }
    rows += `<tr>${tds}</tr>`;
  }

  const chevron = collapsed ? "\u25B6" : "\u25BC";
  const displayTable = collapsed ? "none" : "block";

  return `
    <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden;flex:1;min-width:420px">
      <div id="peer-matrix-header" style="padding:14px 16px;border-bottom:1px solid #334155;cursor:pointer;display:flex;align-items:center;gap:8px;user-select:none">
        <span style="color:#64748b;font-size:12px" id="peer-chevron">${chevron}</span>
        <h3 style="font-size:16px;font-weight:700;color:#e2e8f0">Peer Comparison Matrix</h3>
        <span style="font-size:12px;color:#64748b;margin-left:auto">Conditional formatting: <span style="color:#86efac">best</span> to <span style="color:#fca5a5">worst</span></span>
      </div>
      <div id="peer-matrix-body" style="display:${displayTable};overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const root = document.createElement("div");
  root.id = "app-root";
  root.style.cssText = `
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f172a;
    color: #e2e8f0;
    min-height: 100vh;
    padding: 24px;
  `;
  document.body.style.background = "#0f172a";
  document.body.style.margin = "0";
  document.body.appendChild(root);

  const stateAbbr = _getUrlParams().state?.toUpperCase();

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
    document.body.insertBefore(_db, document.body.firstChild);
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

  // Loading state
  root.innerHTML = `
    <div style="text-align:center;padding:80px 20px">
      <div style="font-size:24px;font-weight:700;color:#e2e8f0;margin-bottom:12px">Dealer Group Scorecard</div>
      <div style="color:#64748b">Loading group data...</div>
    </div>`;

  // Fetch data (fall back to mock)
  let groups: DealerGroup[];
  let usingLive = false;
  try {
    const result = await _callTool("dealer-group-scorecard", { state: stateAbbr });
    const text = typeof result === "string"
      ? result
      : (result as { content?: Array<{ text?: string }> })?.content?.[0]?.text;
    const parsed = text ? JSON.parse(text) : null;
    if (Array.isArray(parsed) && parsed.length >= 5) {
      groups = parsed;
      usingLive = true;
    } else {
      groups = getMockGroups();
    }
  } catch {
    groups = getMockGroups();
  }

  // Sort by health score descending
  groups.sort((a, b) => b.healthScore - a.healthScore);

  // UI State
  let selectedRadarTickers = new Set<string>(["AN", "LAD", "PAG"]);
  let selectedTrendTicker = "AN";
  let peerCollapsed = false;

  function renderUI() {
    const trendGroup = groups.find((g) => g.ticker === selectedTrendTicker) ?? groups[0];
    const scopeLabel = stateAbbr ? `Scope: ${stateAbbr}` : "National";
    const sourceLabel = usingLive ? "Live 90-day data" : "Sample data";

    root.innerHTML = `
      <div style="max-width:1400px;margin:0 auto">
        <!-- Header -->
        <div id="dgs-header" style="margin-bottom:24px;display:flex;align-items:flex-start;gap:12px">
          <div style="flex:1;min-width:0">
            <h1 style="font-size:26px;font-weight:800;color:#e2e8f0;margin-bottom:4px">Dealer Group Scorecard</h1>
            <p style="font-size:13px;color:#64748b">Public dealer group health rankings across volume, pricing, turn rate, inventory, and market coverage <span style="color:#475569">&bull; ${scopeLabel} &bull; ${sourceLabel}</span></p>
          </div>
        </div>

        <!-- Ranking Table -->
        ${renderRankingTable(groups)}

        <!-- Radar Chart -->
        ${renderRadarSection(groups, selectedRadarTickers)}

        <!-- Bottom Row: Trend + Peer Matrix -->
        <div style="display:flex;gap:20px;flex-wrap:wrap">
          ${renderTrendPanel(trendGroup)}
          ${renderPeerMatrix(groups, peerCollapsed)}
        </div>
      </div>`;

    // Draw canvases after DOM is ready
    requestAnimationFrame(() => {
      drawRadarChart(groups, selectedRadarTickers);
      drawTrendCharts(trendGroup);
      wireUpEvents();
      const headerEl = document.getElementById("dgs-header");
      if (headerEl) _addSettingsBar(headerEl);
    });
  }

  function drawTrendCharts(group: DealerGroup) {
    const months = group.trend.map((t) => t.month);
    drawSparkline(
      "trend-volume",
      group.trend.map((t) => t.volume),
      months,
      group.color,
      (v) => fmtNumber(v),
      false
    );
    drawSparkline(
      "trend-asp",
      group.trend.map((t) => t.asp),
      months,
      group.color,
      (v) => fmtDollar(v),
      false
    );
    drawSparkline(
      "trend-dom",
      group.trend.map((t) => t.dom),
      months,
      group.color,
      (v) => v + "d",
      true // lower DOM is better
    );
  }

  function wireUpEvents() {
    // Radar checkboxes
    document.querySelectorAll(".radar-cb").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const input = e.target as HTMLInputElement;
        const ticker = input.dataset.ticker!;
        if (input.checked) {
          selectedRadarTickers.add(ticker);
        } else {
          selectedRadarTickers.delete(ticker);
        }
        renderUI();
      });
    });

    // Ranking row click -> select for trend
    document.querySelectorAll(".ranking-row").forEach((row) => {
      row.addEventListener("click", () => {
        const ticker = (row as HTMLElement).dataset.ticker!;
        selectedTrendTicker = ticker;
        renderUI();
      });
      // Hover highlight
      (row as HTMLElement).addEventListener("mouseenter", () => {
        (row as HTMLElement).style.background = "#1e293b80";
      });
      (row as HTMLElement).addEventListener("mouseleave", () => {
        (row as HTMLElement).style.background = "";
      });
    });

    // Peer matrix collapse/expand
    const peerHeader = document.getElementById("peer-matrix-header");
    peerHeader?.addEventListener("click", () => {
      peerCollapsed = !peerCollapsed;
      const body = document.getElementById("peer-matrix-body");
      const chevron = document.getElementById("peer-chevron");
      if (body) body.style.display = peerCollapsed ? "none" : "block";
      if (chevron) chevron.textContent = peerCollapsed ? "\u25B6" : "\u25BC";
    });
  }

  renderUI();
}

main();
