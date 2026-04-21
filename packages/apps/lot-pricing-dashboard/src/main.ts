import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "lot-pricing-dashboard" }); } catch {}

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

async function _fetchDirect(args) {
  const inventory = await _mcActive({dealer_id:args.dealerId,rows:50,stats:"price,miles,dom",facets:"body_type,make"});
  const hotList = await _mcSold({state:args.state,ranking_dimensions:"make,model",ranking_measure:"sold_count",ranking_order:"desc",top_n:10});
  return {inventory,hotList};
}

async function _callTool(toolName, args) {
  // 1. MCP mode (Claude, VS Code, etc.)
  if (_safeApp) {
    try { const r = _safeApp.callServerTool({ name: toolName, arguments: args }); return r; } catch {}
  }
  // 2. Direct API mode (browser → api.marketcheck.com)
  const auth = _getAuth();
  if (auth.value) {
    try {
      const data = await _fetchDirect(args);
      if (data) return { content: [{ type: "text", text: JSON.stringify(data) }] };
    } catch (e) { console.warn("Direct API failed, trying proxy:", e); }
    // 3. Proxy fallback
    try {
      const r = await fetch((_proxyBase()) + "/api/proxy/" + toolName, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, _auth_mode: auth.mode, _auth_value: auth.value }),
      });
      if (r.ok) { const d = await r.json(); return { content: [{ type: "text", text: JSON.stringify(d) }] }; }
    } catch {}
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

// ── Types ──────────────────────────────────────────────────────────────
interface Vehicle {
  stock: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  bodyType: string;
  listedPrice: number;
  marketPrice: number;
  gapDollar: number;
  gapPct: number;
  miles: number;
  dom: number;
  compCount: number;
}

interface HotListItem {
  make: string;
  model: string;
  dsRatio: number;
  avgDom: number;
  avgPrice: number;
  unitsToStock: number;
}

interface KpiSummary {
  totalUnits: number;
  avgDom: number;
  agedUnits: number;
  floorPlanBurnPerDay: number;
  pctOverpriced: number;
  pctUnderpriced: number;
}

interface AgingBucket {
  label: string;
  min: number;
  max: number;
  count: number;
  color: string;
}

interface DashboardData {
  inventory: Vehicle[];
  aging: AgingBucket[];
  hotList: HotListItem[];
  kpis: KpiSummary;
}

// ── Mock Data ──────────────────────────────────────────────────────────
function generateMockData(): DashboardData {
  const makes = ["Toyota", "Honda", "Ford", "Chevrolet", "BMW", "Hyundai", "Kia", "Nissan", "Jeep", "Ram"];
  const models: Record<string, string[]> = {
    Toyota: ["Camry", "RAV4", "Tacoma", "Corolla", "Highlander"],
    Honda: ["Civic", "CR-V", "Accord", "Pilot", "HR-V"],
    Ford: ["F-150", "Explorer", "Escape", "Bronco", "Mustang"],
    Chevrolet: ["Silverado", "Equinox", "Tahoe", "Malibu", "Blazer"],
    BMW: ["3 Series", "X3", "X5", "5 Series", "X1"],
    Hyundai: ["Tucson", "Elantra", "Santa Fe", "Palisade", "Kona"],
    Kia: ["Sportage", "Forte", "Telluride", "Sorento", "Seltos"],
    Nissan: ["Rogue", "Altima", "Pathfinder", "Sentra", "Frontier"],
    Jeep: ["Wrangler", "Grand Cherokee", "Cherokee", "Compass", "Gladiator"],
    Ram: ["1500", "2500", "ProMaster", "1500 Classic", "3500"],
  };
  const trims = ["SE", "LE", "XLE", "Limited", "Sport", "LX", "EX", "Touring", "SXT", "Latitude"];
  const bodyTypes = ["Sedan", "SUV", "Truck", "Coupe", "Hatchback"];

  const inventory: Vehicle[] = [];
  for (let i = 0; i < 30; i++) {
    const make = makes[i % makes.length];
    const modelList = models[make];
    const model = modelList[Math.floor(Math.random() * modelList.length)];
    const trim = trims[Math.floor(Math.random() * trims.length)];
    const year = 2019 + Math.floor(Math.random() * 6);
    const bt = bodyTypes[Math.floor(Math.random() * bodyTypes.length)];
    const miles = 8000 + Math.floor(Math.random() * 72000);
    const dom = Math.floor(Math.random() * 130);
    const marketPrice = 18000 + Math.floor(Math.random() * 35000);
    // Gap: some overpriced, some underpriced, some fair
    const gapPctRaw = -15 + Math.random() * 30; // -15% to +15%
    const listedPrice = Math.round(marketPrice * (1 + gapPctRaw / 100));
    const gapDollar = listedPrice - marketPrice;
    const gapPct = ((listedPrice - marketPrice) / marketPrice) * 100;
    const compCount = 5 + Math.floor(Math.random() * 30);
    const vin = `1HGCV${String(1000 + i).slice(-4)}${String(Math.floor(Math.random() * 900000) + 100000)}`;

    inventory.push({
      stock: `S${String(10000 + i).slice(-5)}`,
      vin,
      year,
      make,
      model,
      trim,
      bodyType: bt,
      listedPrice,
      marketPrice,
      gapDollar,
      gapPct,
      miles,
      dom,
      compCount,
    });
  }

  // Sort by urgency (most overpriced first)
  inventory.sort((a, b) => b.gapPct - a.gapPct);

  // Aging buckets
  const agingBuckets: AgingBucket[] = [
    { label: "0-30", min: 0, max: 30, count: 0, color: "#10b981" },
    { label: "31-60", min: 31, max: 60, count: 0, color: "#f59e0b" },
    { label: "61-90", min: 61, max: 90, count: 0, color: "#f97316" },
    { label: "90+", min: 91, max: 9999, count: 0, color: "#ef4444" },
  ];
  for (const v of inventory) {
    for (const b of agingBuckets) {
      if (v.dom >= b.min && v.dom <= b.max) { b.count++; break; }
    }
  }

  // KPIs
  const totalUnits = inventory.length;
  const avgDom = Math.round(inventory.reduce((s, v) => s + v.dom, 0) / totalUnits);
  const agedUnits = inventory.filter(v => v.dom > 60).length;
  const floorPlanBurnPerDay = agedUnits * 35;
  const pctOverpriced = Math.round((inventory.filter(v => v.gapPct > 5).length / totalUnits) * 100);
  const pctUnderpriced = Math.round((inventory.filter(v => v.gapPct < -5).length / totalUnits) * 100);

  // Hot list
  const hotList: HotListItem[] = [
    { make: "Toyota", model: "RAV4", dsRatio: 4.2, avgDom: 18, avgPrice: 32500, unitsToStock: 5 },
    { make: "Honda", model: "CR-V", dsRatio: 3.8, avgDom: 21, avgPrice: 31200, unitsToStock: 4 },
    { make: "Ford", model: "F-150", dsRatio: 3.5, avgDom: 25, avgPrice: 42800, unitsToStock: 6 },
    { make: "Toyota", model: "Camry", dsRatio: 3.3, avgDom: 19, avgPrice: 27500, unitsToStock: 3 },
    { make: "Chevrolet", model: "Silverado", dsRatio: 3.1, avgDom: 28, avgPrice: 41200, unitsToStock: 4 },
    { make: "Hyundai", model: "Tucson", dsRatio: 2.9, avgDom: 22, avgPrice: 28900, unitsToStock: 3 },
    { make: "Jeep", model: "Wrangler", dsRatio: 2.7, avgDom: 30, avgPrice: 38500, unitsToStock: 2 },
    { make: "Kia", model: "Telluride", dsRatio: 2.5, avgDom: 15, avgPrice: 39800, unitsToStock: 2 },
    { make: "Honda", model: "Civic", dsRatio: 2.3, avgDom: 20, avgPrice: 24600, unitsToStock: 3 },
    { make: "Nissan", model: "Rogue", dsRatio: 1.4, avgDom: 45, avgPrice: 26800, unitsToStock: 0 },
  ];

  return {
    inventory,
    aging: agingBuckets,
    hotList,
    kpis: { totalUnits, avgDom, agedUnits, floorPlanBurnPerDay, pctOverpriced, pctUnderpriced },
  };
}

// ── Formatters ─────────────────────────────────────────────────────────
function fmtCurrency(v: number): string {
  return "$" + Math.round(v).toLocaleString();
}
function fmtPct(v: number): string {
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}
function fmtNum(v: number): string {
  return Math.round(v).toLocaleString();
}

// ── Main App ───────────────────────────────────────────────────────────


  // When live data arrives we would parse it; for now mock data is used

async function main() {
  // Set up dark-themed body
  document.body.style.cssText =
    "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;overflow-x:hidden;";

  // Show loading
  document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#94a3b8;">
    <div style="width:20px;height:20px;border:2px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:12px;"></div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    Loading lot pricing data...
  </div>`;

  // Try to call the server tool; fall back to mock data
  let data: DashboardData;
  try {
    const result = await _callTool("scan-lot-pricing", { dealerId: "abc123", zip: "90210", state: "CA" });
    const text = result?.content?.find((c: any) => c.type === "text")?.text;
    if (text) {
      const parsed = JSON.parse(text);
      data = parsed as DashboardData;
    } else {
      data = generateMockData();
    }
  } catch {
    data = generateMockData();
  }

  render(data);
}

// ── State ──────────────────────────────────────────────────────────────
let sortColumn = 10; // default sort by Gap(%)
let sortAsc = false;
let activeBodyTypes: Set<string> = new Set();
let activeDomBucket: AgingBucket | null = null;
let floorPlanRate = 35;

// ── Render ─────────────────────────────────────────────────────────────
function render(data: DashboardData) {
  document.body.innerHTML = "";

  // Header bar
  const header = el("div", {
    style: "background:#1e293b;padding:12px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:12px;",
  });
  header.innerHTML = `<h1 style="margin:0;font-size:16px;font-weight:600;color:#f8fafc;">Lot Pricing Dashboard</h1>
    <span style="font-size:12px;color:#64748b;margin-left:auto;">${data.kpis.totalUnits} units | Updated just now</span>`;
  document.body.appendChild(header);

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
    document.body.appendChild(_db);
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

  // Content wrapper
  const content = el("div", { style: "padding:16px 20px;" });
  document.body.appendChild(content);

  // ── KPI Ribbon ─────────────────────────────────────────────────────
  const kpiRibbon = el("div", {
    style: "display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;margin-bottom:16px;flex-wrap:wrap;",
  });

  const kpis = data.kpis;
  const kpiCards = [
    { label: "Total Units", value: fmtNum(kpis.totalUnits), trend: "", color: "#94a3b8" },
    { label: "Avg DOM", value: `${kpis.avgDom}d`, trend: kpis.avgDom > 45 ? "^ above target" : "on target", color: kpis.avgDom > 45 ? "#ef4444" : "#10b981" },
    { label: "Aged Units (>60d)", value: fmtNum(kpis.agedUnits), trend: `${Math.round((kpis.agedUnits / kpis.totalUnits) * 100)}% of lot`, color: kpis.agedUnits > 10 ? "#ef4444" : "#f59e0b" },
    { label: "Floor Plan Burn", value: `${fmtCurrency(kpis.floorPlanBurnPerDay)}/day`, trend: `${fmtCurrency(kpis.floorPlanBurnPerDay * 30)}/mo projected`, color: "#f97316" },
    { label: "% Overpriced", value: `${kpis.pctOverpriced}%`, trend: kpis.pctOverpriced > 30 ? "action needed" : "healthy", color: kpis.pctOverpriced > 30 ? "#ef4444" : "#10b981" },
    { label: "% Underpriced", value: `${kpis.pctUnderpriced}%`, trend: kpis.pctUnderpriced > 20 ? "leaving money" : "ok", color: kpis.pctUnderpriced > 20 ? "#f59e0b" : "#10b981" },
  ];

  for (const k of kpiCards) {
    const card = el("div", {
      style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px 16px;min-width:150px;flex:1;",
    });
    card.innerHTML = `
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">${k.label}</div>
      <div style="font-size:22px;font-weight:700;color:#f8fafc;margin-top:4px;">${k.value}</div>
      <div style="font-size:12px;color:${k.color};margin-top:2px;">${k.trend}</div>
    `;
    kpiRibbon.appendChild(card);
  }
  content.appendChild(kpiRibbon);

  // ── Main Layout: Table (left ~75%) + Aging Heatmap (right ~25%) ────
  const mainRow = el("div", {
    style: "display:flex;gap:16px;margin-bottom:16px;align-items:flex-start;",
  });
  content.appendChild(mainRow);

  // ── Pricing Action Table ───────────────────────────────────────────
  const tableSection = el("div", { style: "flex:3;min-width:0;" });
  mainRow.appendChild(tableSection);

  // Body type filter chips
  const bodyTypes = [...new Set(data.inventory.map(v => v.bodyType))].sort();
  const chipRow = el("div", {
    style: "display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;align-items:center;",
  });
  chipRow.innerHTML = `<span style="font-size:11px;color:#64748b;margin-right:4px;">FILTER:</span>`;

  // "All" chip
  const allChip = el("button", {
    style: chipStyle(activeBodyTypes.size === 0),
  });
  allChip.textContent = "All";
  allChip.addEventListener("click", () => {
    activeBodyTypes.clear();
    activeDomBucket = null;
    render(data);
  });
  chipRow.appendChild(allChip);

  for (const bt of bodyTypes) {
    const chip = el("button", { style: chipStyle(activeBodyTypes.has(bt)) });
    chip.textContent = bt;
    chip.addEventListener("click", () => {
      if (activeBodyTypes.has(bt)) activeBodyTypes.delete(bt);
      else activeBodyTypes.add(bt);
      render(data);
    });
    chipRow.appendChild(chip);
  }
  tableSection.appendChild(chipRow);

  // Filter inventory
  let filtered = data.inventory;
  if (activeBodyTypes.size > 0) {
    filtered = filtered.filter(v => activeBodyTypes.has(v.bodyType));
  }
  if (activeDomBucket) {
    const bucket = activeDomBucket;
    filtered = filtered.filter(v => v.dom >= bucket.min && v.dom <= bucket.max);
  }

  // Sort
  const sortKeys: Array<(v: Vehicle) => number | string> = [
    v => v.stock,
    v => v.vin.slice(-6),
    v => `${v.year} ${v.make} ${v.model} ${v.trim}`,
    v => v.listedPrice,
    v => v.marketPrice,
    v => v.gapDollar,
    v => v.gapPct,
    v => v.miles,
    v => v.dom,
    v => v.compCount,
    v => v.gapPct, // action column sorts by gap%
  ];
  const sorted = [...filtered].sort((a, b) => {
    const av = sortKeys[sortColumn](a);
    const bv = sortKeys[sortColumn](b);
    if (typeof av === "number" && typeof bv === "number") return sortAsc ? av - bv : bv - av;
    return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });

  // Table
  const tableWrapper = el("div", {
    style: "overflow-x:auto;border:1px solid #334155;border-radius:8px;max-height:480px;overflow-y:auto;",
  });
  const table = el("table", {
    style: "width:100%;border-collapse:collapse;font-size:12px;",
  });

  const headers = ["Stock#", "VIN", "Year/Make/Model/Trim", "Listed", "Market", "Gap ($)", "Gap (%)", "Miles", "DOM", "Comps", "Action"];
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headers.forEach((h, idx) => {
    const th = document.createElement("th");
    th.style.cssText =
      "padding:8px 10px;text-align:left;background:#1e293b;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;position:sticky;top:0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;cursor:pointer;white-space:nowrap;user-select:none;z-index:1;";
    const arrow = sortColumn === idx ? (sortAsc ? " ▲" : " ▼") : "";
    th.textContent = h + arrow;
    th.addEventListener("click", () => {
      if (sortColumn === idx) sortAsc = !sortAsc;
      else { sortColumn = idx; sortAsc = true; }
      render(data);
    });
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const v of sorted) {
    const tr = document.createElement("tr");
    // Row tint based on pricing
    let rowBg = "";
    if (v.gapPct > 5) rowBg = "rgba(239,68,68,0.08)";
    else if (v.gapPct < -5) rowBg = "rgba(16,185,129,0.08)";
    tr.style.cssText = `border-bottom:1px solid #1e293b;background:${rowBg};`;
    tr.addEventListener("mouseenter", () => { tr.style.background = "#1e293b"; });
    tr.addEventListener("mouseleave", () => { tr.style.background = rowBg; });

    // Action badge
    let badge: string;
    if (v.gapPct > 5) badge = `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);">DROP</span>`;
    else if (v.gapPct < -5) badge = `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);">RAISE</span>`;
    else badge = `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);">HOLD</span>`;

    const gapColor = v.gapPct > 5 ? "#ef4444" : v.gapPct < -5 ? "#10b981" : "#f59e0b";

    const cells = [
      v.stock,
      v.vin.slice(-6),
      `${v.year} ${v.make} ${v.model} ${v.trim}`,
      fmtCurrency(v.listedPrice),
      fmtCurrency(v.marketPrice),
      `<span style="color:${gapColor}">${v.gapDollar >= 0 ? "+" : ""}${fmtCurrency(v.gapDollar)}</span>`,
      `<span style="color:${gapColor}">${fmtPct(v.gapPct)}</span>`,
      fmtNum(v.miles),
      `<span style="color:${v.dom > 60 ? "#ef4444" : v.dom > 30 ? "#f59e0b" : "#10b981"}">${v.dom}d</span>`,
      String(v.compCount),
      badge,
    ];

    tr.innerHTML = cells.map(c => `<td style="padding:7px 10px;color:#e2e8f0;white-space:nowrap;">${c}</td>`).join("");
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  tableSection.appendChild(tableWrapper);

  // Filtered summary
  if (activeBodyTypes.size > 0 || activeDomBucket) {
    const filterLabel = el("div", {
      style: "font-size:11px;color:#64748b;margin-top:6px;",
    });
    const parts: string[] = [];
    if (activeBodyTypes.size > 0) parts.push(`Body: ${[...activeBodyTypes].join(", ")}`);
    if (activeDomBucket) parts.push(`DOM: ${activeDomBucket.label} days`);
    filterLabel.textContent = `Showing ${sorted.length} of ${data.inventory.length} | ${parts.join(" | ")}`;
    tableSection.appendChild(filterLabel);
  }

  // ── Aging Heatmap (right sidebar) ──────────────────────────────────
  const sidebar = el("div", { style: "flex:1;min-width:220px;" });
  mainRow.appendChild(sidebar);

  const agingCard = el("div", {
    style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:14px;",
  });
  agingCard.innerHTML = `<h3 style="font-size:13px;font-weight:600;color:#f8fafc;margin:0 0 12px 0;">Inventory Aging</h3>`;

  const totalCount = data.aging.reduce((s, b) => s + b.count, 0);

  // Stacked horizontal bar
  const barContainer = el("div", {
    style: "display:flex;height:32px;border-radius:6px;overflow:hidden;margin-bottom:14px;",
  });
  for (const bucket of data.aging) {
    const pct = totalCount > 0 ? (bucket.count / totalCount) * 100 : 0;
    if (pct === 0) continue;
    const seg = el("div", {
      style: `width:${pct}%;background:${bucket.color};display:flex;align-items:center;justify-content:center;cursor:pointer;transition:opacity 0.15s;position:relative;min-width:24px;`,
    });
    seg.innerHTML = `<span style="font-size:11px;font-weight:700;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.5);">${bucket.count}</span>`;
    seg.title = `${bucket.label} days: ${bucket.count} units`;

    const isActive = activeDomBucket?.label === bucket.label;
    if (isActive) seg.style.outline = "2px solid #f8fafc";

    seg.addEventListener("mouseenter", () => { seg.style.opacity = "0.8"; });
    seg.addEventListener("mouseleave", () => { seg.style.opacity = "1"; });
    seg.addEventListener("click", () => {
      if (activeDomBucket?.label === bucket.label) {
        activeDomBucket = null;
      } else {
        activeDomBucket = bucket;
      }
      render(data);
    });
    barContainer.appendChild(seg);
  }
  agingCard.appendChild(barContainer);

  // Bucket legend
  for (const bucket of data.aging) {
    const row = el("div", {
      style: `display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;border-radius:4px;padding:4px 6px;${activeDomBucket?.label === bucket.label ? "background:#334155;" : ""}`,
    });
    row.innerHTML = `
      <span style="width:10px;height:10px;border-radius:2px;background:${bucket.color};flex-shrink:0;"></span>
      <span style="font-size:12px;color:#e2e8f0;flex:1;">${bucket.label} days</span>
      <span style="font-size:12px;font-weight:600;color:#f8fafc;">${bucket.count}</span>
      <span style="font-size:11px;color:#64748b;">${totalCount > 0 ? Math.round((bucket.count / totalCount) * 100) : 0}%</span>
    `;
    row.addEventListener("click", () => {
      if (activeDomBucket?.label === bucket.label) {
        activeDomBucket = null;
      } else {
        activeDomBucket = bucket;
      }
      render(data);
    });
    agingCard.appendChild(row);
  }
  sidebar.appendChild(agingCard);

  // ── Bottom Row: Floor Plan Burn (left) + Hot List (right) ──────────
  const bottomRow = el("div", {
    style: "display:flex;gap:16px;flex-wrap:wrap;",
  });
  content.appendChild(bottomRow);

  // ── Floor Plan Burn Calculator ─────────────────────────────────────
  const burnCard = el("div", {
    style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;flex:1;min-width:300px;",
  });

  const agedUnits = data.inventory.filter(v => v.dom > 60);
  const dailyBurn = agedUnits.length * floorPlanRate;
  const projected30 = dailyBurn * 30;

  burnCard.innerHTML = `
    <h3 style="font-size:13px;font-weight:600;color:#f8fafc;margin:0 0 14px 0;">Floor Plan Burn Calculator</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
      <div style="background:#0f172a;border:1px solid #334155;border-radius:6px;padding:12px;">
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">Daily Burn (Aged)</div>
        <div style="font-size:20px;font-weight:700;color:#f97316;margin-top:4px;">${fmtCurrency(dailyBurn)}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">${agedUnits.length} units x $${floorPlanRate}/day</div>
      </div>
      <div style="background:#0f172a;border:1px solid #334155;border-radius:6px;padding:12px;">
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">30-Day Projected</div>
        <div style="font-size:20px;font-weight:700;color:#ef4444;margin-top:4px;">${fmtCurrency(projected30)}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">if unsold at current rate</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <label style="font-size:12px;color:#94a3b8;white-space:nowrap;">Daily Rate:</label>
      <input id="floorPlanInput" type="number" value="${floorPlanRate}" min="1" max="200"
        style="padding:6px 10px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;width:80px;outline:none;" />
      <span style="font-size:12px;color:#64748b;">/unit/day</span>
    </div>
  `;
  bottomRow.appendChild(burnCard);

  // Bind floor plan rate input
  setTimeout(() => {
    const inp = document.getElementById("floorPlanInput") as HTMLInputElement | null;
    if (inp) {
      inp.addEventListener("change", () => {
        const val = parseInt(inp.value, 10);
        if (val > 0) {
          floorPlanRate = val;
          render(data);
        }
      });
    }
  }, 0);

  // ── Stocking Hot List ──────────────────────────────────────────────
  const hotCard = el("div", {
    style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;flex:1.5;min-width:380px;",
  });
  hotCard.innerHTML = `<h3 style="font-size:13px;font-weight:600;color:#f8fafc;margin:0 0 12px 0;">Stocking Hot List</h3>`;

  const hotTable = el("table", {
    style: "width:100%;border-collapse:collapse;font-size:12px;",
  });

  const hotHeaders = ["Make/Model", "D/S Ratio", "Avg DOM", "Avg Price", "Units to Stock"];
  const hotHead = document.createElement("thead");
  const hotHeadRow = document.createElement("tr");
  for (const h of hotHeaders) {
    const th = document.createElement("th");
    th.style.cssText =
      "padding:6px 8px;text-align:left;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;";
    th.textContent = h;
    hotHeadRow.appendChild(th);
  }
  hotHead.appendChild(hotHeadRow);
  hotTable.appendChild(hotHead);

  const hotBody = document.createElement("tbody");
  for (const item of data.hotList) {
    const tr = document.createElement("tr");
    tr.style.cssText = "border-bottom:1px solid #1e293b44;";
    tr.addEventListener("mouseenter", () => { tr.style.background = "#0f172a"; });
    tr.addEventListener("mouseleave", () => { tr.style.background = ""; });

    // D/S color: high = green, low = red
    let dsColor: string;
    if (item.dsRatio >= 3.0) dsColor = "#10b981";
    else if (item.dsRatio >= 2.0) dsColor = "#f59e0b";
    else dsColor = "#ef4444";

    const recLabel = item.unitsToStock > 0
      ? `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;background:rgba(16,185,129,0.15);color:#10b981;">${item.unitsToStock}</span>`
      : `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;background:rgba(239,68,68,0.15);color:#ef4444;">Avoid</span>`;

    tr.innerHTML = `
      <td style="padding:6px 8px;color:#e2e8f0;font-weight:500;">${item.make} ${item.model}</td>
      <td style="padding:6px 8px;"><span style="color:${dsColor};font-weight:700;">${item.dsRatio.toFixed(1)}</span></td>
      <td style="padding:6px 8px;color:#e2e8f0;">${item.avgDom}d</td>
      <td style="padding:6px 8px;color:#e2e8f0;">${fmtCurrency(item.avgPrice)}</td>
      <td style="padding:6px 8px;">${recLabel}</td>
    `;
    hotBody.appendChild(tr);
  }
  hotTable.appendChild(hotBody);
  hotCard.appendChild(hotTable);
  bottomRow.appendChild(hotCard);
}

// ── Helpers ────────────────────────────────────────────────────────────
function el(tag: string, attrs?: Record<string, string>): HTMLElement {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "style") e.style.cssText = v;
      else e.setAttribute(k, v);
    }
  }
  return e;
}

function chipStyle(active: boolean): string {
  return `padding:4px 12px;border-radius:14px;font-size:12px;cursor:pointer;border:1px solid ${active ? "#3b82f6" : "#334155"};background:${active ? "rgba(59,130,246,0.13)" : "transparent"};color:${active ? "#60a5fa" : "#94a3b8"};font-weight:${active ? "600" : "400"};font-family:inherit;`;
}

main();
