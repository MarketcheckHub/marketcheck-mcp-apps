/**
 * Stocking Intelligence — Dealer Inventory Advisor
 * MCP App 9 — Dark-themed dashboard with demand heatmap, buy/avoid lists, VIN checker
 */
import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "stocking-intelligence" }); } catch {}

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
  const [demandData,segmentDemand] = await Promise.all([_mcSold({state:args.state,ranking_dimensions:"make,model",ranking_measure:"sold_count",ranking_order:"desc",top_n:30}),_mcSold({state:args.state,ranking_dimensions:"body_type",ranking_measure:"sold_count,average_sale_price,average_days_on_market"})]);
  return {demandData,segmentDemand};
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

// ── Types ──────────────────────────────────────────────────────────────────────

interface HeatmapCell {
  bodyType: string;
  priceTier: string;
  dsRatio: number;
}

interface StockModel {
  make: string;
  model: string;
  dsRatio: number;
  avgSalePrice: number;
  avgDom: number;
  turnRate: number;
  expectedMargin: number;
  verdict: string;
}

interface VinResult {
  vin: string;
  year: number;
  make: string;
  model: string;
  retailPrice: number;
  wholesalePrice: number;
  expectedMargin: number;
  localSupply: number;
  verdict: string;
}

interface StockingData {
  heatmap: HeatmapCell[];
  buyList: StockModel[];
  avoidList: StockModel[];
}

interface VinCheckResponse {
  results: VinResult[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const BODY_TYPES = [
  "Compact SUV",
  "Midsize SUV",
  "Full-Size Truck",
  "Midsize Sedan",
  "Compact",
  "Luxury",
];

const PRICE_TIERS = ["$0-15K", "$15-25K", "$25-35K", "$35-50K", "$50K+"];

// ── Mock Data ──────────────────────────────────────────────────────────────────

function getMockStockingData(): StockingData {
  const heatmap: HeatmapCell[] = [
    // Compact SUV
    { bodyType: "Compact SUV", priceTier: "$0-15K", dsRatio: 2.1 },
    { bodyType: "Compact SUV", priceTier: "$15-25K", dsRatio: 1.8 },
    { bodyType: "Compact SUV", priceTier: "$25-35K", dsRatio: 1.3 },
    { bodyType: "Compact SUV", priceTier: "$35-50K", dsRatio: 0.9 },
    { bodyType: "Compact SUV", priceTier: "$50K+", dsRatio: 0.5 },
    // Midsize SUV
    { bodyType: "Midsize SUV", priceTier: "$0-15K", dsRatio: 2.4 },
    { bodyType: "Midsize SUV", priceTier: "$15-25K", dsRatio: 1.9 },
    { bodyType: "Midsize SUV", priceTier: "$25-35K", dsRatio: 1.6 },
    { bodyType: "Midsize SUV", priceTier: "$35-50K", dsRatio: 1.1 },
    { bodyType: "Midsize SUV", priceTier: "$50K+", dsRatio: 0.7 },
    // Full-Size Truck
    { bodyType: "Full-Size Truck", priceTier: "$0-15K", dsRatio: 2.8 },
    { bodyType: "Full-Size Truck", priceTier: "$15-25K", dsRatio: 2.2 },
    { bodyType: "Full-Size Truck", priceTier: "$25-35K", dsRatio: 1.7 },
    { bodyType: "Full-Size Truck", priceTier: "$35-50K", dsRatio: 1.2 },
    { bodyType: "Full-Size Truck", priceTier: "$50K+", dsRatio: 0.8 },
    // Midsize Sedan
    { bodyType: "Midsize Sedan", priceTier: "$0-15K", dsRatio: 1.6 },
    { bodyType: "Midsize Sedan", priceTier: "$15-25K", dsRatio: 1.2 },
    { bodyType: "Midsize Sedan", priceTier: "$25-35K", dsRatio: 0.9 },
    { bodyType: "Midsize Sedan", priceTier: "$35-50K", dsRatio: 0.6 },
    { bodyType: "Midsize Sedan", priceTier: "$50K+", dsRatio: 0.4 },
    // Compact
    { bodyType: "Compact", priceTier: "$0-15K", dsRatio: 1.9 },
    { bodyType: "Compact", priceTier: "$15-25K", dsRatio: 1.4 },
    { bodyType: "Compact", priceTier: "$25-35K", dsRatio: 1.0 },
    { bodyType: "Compact", priceTier: "$35-50K", dsRatio: 0.6 },
    { bodyType: "Compact", priceTier: "$50K+", dsRatio: 0.3 },
    // Luxury
    { bodyType: "Luxury", priceTier: "$0-15K", dsRatio: 1.1 },
    { bodyType: "Luxury", priceTier: "$15-25K", dsRatio: 0.9 },
    { bodyType: "Luxury", priceTier: "$25-35K", dsRatio: 0.7 },
    { bodyType: "Luxury", priceTier: "$35-50K", dsRatio: 1.0 },
    { bodyType: "Luxury", priceTier: "$50K+", dsRatio: 0.5 },
  ];

  const buyList: StockModel[] = [
    { make: "Ford", model: "F-150", dsRatio: 2.8, avgSalePrice: 22500, avgDom: 12, turnRate: 4.2, expectedMargin: 3200, verdict: "STRONG BUY" },
    { make: "Toyota", model: "4Runner", dsRatio: 2.5, avgSalePrice: 31200, avgDom: 9, turnRate: 4.8, expectedMargin: 4100, verdict: "STRONG BUY" },
    { make: "Chevrolet", model: "Silverado", dsRatio: 2.4, avgSalePrice: 24800, avgDom: 14, turnRate: 3.9, expectedMargin: 2900, verdict: "STRONG BUY" },
    { make: "Toyota", model: "RAV4", dsRatio: 2.2, avgSalePrice: 19500, avgDom: 11, turnRate: 4.5, expectedMargin: 2600, verdict: "STRONG BUY" },
    { make: "Honda", model: "CR-V", dsRatio: 2.1, avgSalePrice: 20100, avgDom: 13, turnRate: 4.3, expectedMargin: 2500, verdict: "STRONG BUY" },
    { make: "Jeep", model: "Grand Cherokee", dsRatio: 1.9, avgSalePrice: 28700, avgDom: 16, turnRate: 3.6, expectedMargin: 2800, verdict: "BUY" },
    { make: "Honda", model: "Civic", dsRatio: 1.8, avgSalePrice: 16200, avgDom: 15, turnRate: 3.8, expectedMargin: 1900, verdict: "BUY" },
    { make: "Toyota", model: "Tacoma", dsRatio: 1.8, avgSalePrice: 27300, avgDom: 10, turnRate: 4.6, expectedMargin: 3500, verdict: "BUY" },
    { make: "Hyundai", model: "Tucson", dsRatio: 1.7, avgSalePrice: 18900, avgDom: 18, turnRate: 3.4, expectedMargin: 2100, verdict: "BUY" },
    { make: "Subaru", model: "Outback", dsRatio: 1.7, avgSalePrice: 22400, avgDom: 17, turnRate: 3.5, expectedMargin: 2200, verdict: "BUY" },
    { make: "Ford", model: "Bronco Sport", dsRatio: 1.6, avgSalePrice: 24100, avgDom: 19, turnRate: 3.3, expectedMargin: 2400, verdict: "BUY" },
    { make: "Mazda", model: "CX-5", dsRatio: 1.6, avgSalePrice: 21600, avgDom: 20, turnRate: 3.2, expectedMargin: 2000, verdict: "BUY" },
    { make: "Kia", model: "Sportage", dsRatio: 1.5, avgSalePrice: 19800, avgDom: 21, turnRate: 3.1, expectedMargin: 1800, verdict: "WATCH" },
    { make: "Toyota", model: "Camry", dsRatio: 1.5, avgSalePrice: 18500, avgDom: 22, turnRate: 3.0, expectedMargin: 1700, verdict: "WATCH" },
    { make: "Chevrolet", model: "Equinox", dsRatio: 1.4, avgSalePrice: 17200, avgDom: 23, turnRate: 2.9, expectedMargin: 1500, verdict: "WATCH" },
  ];

  const avoidList: StockModel[] = [
    { make: "Nissan", model: "Altima", dsRatio: 0.4, avgSalePrice: 15800, avgDom: 62, turnRate: 1.1, expectedMargin: 400, verdict: "AVOID" },
    { make: "Chevrolet", model: "Malibu", dsRatio: 0.4, avgSalePrice: 14200, avgDom: 58, turnRate: 1.2, expectedMargin: 350, verdict: "AVOID" },
    { make: "Dodge", model: "Journey", dsRatio: 0.5, avgSalePrice: 13500, avgDom: 55, turnRate: 1.3, expectedMargin: 500, verdict: "AVOID" },
    { make: "Chrysler", model: "300", dsRatio: 0.5, avgSalePrice: 16900, avgDom: 53, turnRate: 1.3, expectedMargin: 450, verdict: "AVOID" },
    { make: "Buick", model: "Encore", dsRatio: 0.5, avgSalePrice: 15100, avgDom: 51, turnRate: 1.4, expectedMargin: 550, verdict: "AVOID" },
    { make: "Infiniti", model: "QX50", dsRatio: 0.6, avgSalePrice: 24500, avgDom: 48, turnRate: 1.5, expectedMargin: 600, verdict: "SLOW" },
    { make: "Lincoln", model: "MKZ", dsRatio: 0.6, avgSalePrice: 19800, avgDom: 47, turnRate: 1.5, expectedMargin: 550, verdict: "SLOW" },
    { make: "Acura", model: "TLX", dsRatio: 0.7, avgSalePrice: 22300, avgDom: 44, turnRate: 1.6, expectedMargin: 700, verdict: "SLOW" },
    { make: "Cadillac", model: "XT4", dsRatio: 0.7, avgSalePrice: 26100, avgDom: 42, turnRate: 1.7, expectedMargin: 750, verdict: "SLOW" },
    { make: "Volkswagen", model: "Passat", dsRatio: 0.7, avgSalePrice: 16400, avgDom: 41, turnRate: 1.7, expectedMargin: 650, verdict: "SLOW" },
  ];

  return { heatmap, buyList, avoidList };
}

function getMockVinResults(vins: string[]): VinResult[] {
  const mockDb: Record<string, Omit<VinResult, "vin">> = {
    "1FTFW1E82MFA00001": { year: 2021, make: "Ford", model: "F-150 XLT", retailPrice: 36500, wholesalePrice: 30200, expectedMargin: 6300, localSupply: 4, verdict: "BUY" },
    "2T1BURHE0JC000002": { year: 2018, make: "Toyota", model: "Corolla LE", retailPrice: 17200, wholesalePrice: 13800, expectedMargin: 3400, localSupply: 12, verdict: "CAUTION" },
    "5J8TC2H56NL000003": { year: 2022, make: "Acura", model: "RDX SH-AWD", retailPrice: 34800, wholesalePrice: 29500, expectedMargin: 5300, localSupply: 3, verdict: "BUY" },
    "1G1YY22G265000004": { year: 2020, make: "Chevrolet", model: "Corvette", retailPrice: 62500, wholesalePrice: 55800, expectedMargin: 6700, localSupply: 1, verdict: "BUY" },
    "3N1AB7AP5KY000005": { year: 2019, make: "Nissan", model: "Sentra S", retailPrice: 12800, wholesalePrice: 10900, expectedMargin: 1900, localSupply: 22, verdict: "PASS" },
    "WBA5R1C50KA000006": { year: 2019, make: "BMW", model: "330i xDrive", retailPrice: 28900, wholesalePrice: 24100, expectedMargin: 4800, localSupply: 6, verdict: "BUY" },
    "1C4RJFBG5LC000007": { year: 2020, make: "Jeep", model: "Grand Cherokee Limited", retailPrice: 31200, wholesalePrice: 25800, expectedMargin: 5400, localSupply: 5, verdict: "BUY" },
    "JTDKN3DU5A0000008": { year: 2021, make: "Toyota", model: "Prius LE", retailPrice: 22500, wholesalePrice: 18600, expectedMargin: 3900, localSupply: 8, verdict: "CAUTION" },
    "1HGBH41JXMN000009": { year: 2021, make: "Honda", model: "Civic EX", retailPrice: 21800, wholesalePrice: 17500, expectedMargin: 4300, localSupply: 7, verdict: "BUY" },
    "KM8J3CA46MU000010": { year: 2021, make: "Hyundai", model: "Tucson SEL", retailPrice: 24100, wholesalePrice: 19800, expectedMargin: 4300, localSupply: 9, verdict: "CAUTION" },
  };

  return vins.map((vin) => {
    const cleaned = vin.trim().toUpperCase();
    const known = mockDb[cleaned];
    if (known) {
      return { vin: cleaned, ...known };
    }
    // Generate plausible random result for unknown VINs
    const retailPrice = 18000 + Math.floor(Math.random() * 25000);
    const wholesalePrice = Math.round(retailPrice * (0.78 + Math.random() * 0.08));
    const margin = retailPrice - wholesalePrice;
    const supply = 2 + Math.floor(Math.random() * 20);
    let verdict: string;
    if (margin > 4000 && supply < 8) verdict = "BUY";
    else if (margin < 2000 || supply > 15) verdict = "PASS";
    else verdict = "CAUTION";
    return {
      vin: cleaned,
      year: 2018 + Math.floor(Math.random() * 5),
      make: "Unknown",
      model: "Decoded Model",
      retailPrice,
      wholesalePrice,
      expectedMargin: margin,
      localSupply: supply,
      verdict,
    };
  });
}

// ── Formatting Helpers ─────────────────────────────────────────────────────────

function fmtDollar(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

function fmtRatio(n: number): string {
  return n.toFixed(1);
}

function heatColor(dsRatio: number): string {
  if (dsRatio > 1.5) return "#166534"; // green — hot/undersupplied
  if (dsRatio >= 0.8) return "#854d0e"; // yellow — balanced
  return "#991b1b"; // red — oversupplied
}

function heatTextColor(dsRatio: number): string {
  if (dsRatio > 1.5) return "#86efac";
  if (dsRatio >= 0.8) return "#fde68a";
  return "#fca5a5";
}

function verdictBadge(verdict: string): string {
  const colors: Record<string, { bg: string; text: string }> = {
    "STRONG BUY": { bg: "#166534", text: "#86efac" },
    BUY: { bg: "#1e3a5f", text: "#93c5fd" },
    WATCH: { bg: "#854d0e", text: "#fde68a" },
    AVOID: { bg: "#991b1b", text: "#fca5a5" },
    SLOW: { bg: "#9a3412", text: "#fdba74" },
    CAUTION: { bg: "#854d0e", text: "#fde68a" },
    PASS: { bg: "#991b1b", text: "#fca5a5" },
  };
  const c = colors[verdict] ?? { bg: "#334155", text: "#e2e8f0" };
  return `<span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:700;letter-spacing:0.5px;background:${c.bg};color:${c.text}">${verdict}</span>`;
}

// ── Render Functions ───────────────────────────────────────────────────────────

function renderHeatmap(cells: HeatmapCell[]): string {
  const lookup = new Map<string, number>();
  for (const c of cells) {
    lookup.set(`${c.bodyType}|${c.priceTier}`, c.dsRatio);
  }

  let headerCells = `<th style="padding:10px 14px;text-align:left;font-weight:600;color:#94a3b8;border-bottom:2px solid #334155;background:#0f172a">Body Type</th>`;
  for (const tier of PRICE_TIERS) {
    headerCells += `<th style="padding:10px 14px;text-align:center;font-weight:600;color:#94a3b8;border-bottom:2px solid #334155;background:#0f172a">${tier}</th>`;
  }

  let rows = "";
  for (const bt of BODY_TYPES) {
    let tds = `<td style="padding:10px 14px;font-weight:600;color:#e2e8f0;border-bottom:1px solid #1e293b">${bt}</td>`;
    for (const tier of PRICE_TIERS) {
      const ratio = lookup.get(`${bt}|${tier}`) ?? 0;
      const bg = heatColor(ratio);
      const fg = heatTextColor(ratio);
      tds += `<td style="padding:10px 14px;text-align:center;font-weight:700;font-size:16px;border-bottom:1px solid #1e293b;background:${bg};color:${fg};border-radius:0">${fmtRatio(ratio)}</td>`;
    }
    rows += `<tr>${tds}</tr>`;
  }

  return `
    <div style="margin-bottom:24px">
      <h2 style="font-size:18px;font-weight:700;color:#e2e8f0;margin-bottom:4px">Demand / Supply Heatmap</h2>
      <p style="font-size:12px;color:#64748b;margin-bottom:12px">
        <span style="color:#86efac">Green &gt;1.5 = Hot (undersupplied)</span> &nbsp;|&nbsp;
        <span style="color:#fde68a">Yellow 0.8-1.5 = Balanced</span> &nbsp;|&nbsp;
        <span style="color:#fca5a5">Red &lt;0.8 = Oversupplied</span>
      </p>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function renderModelTable(models: StockModel[], title: string, isBuy: boolean): string {
  if (!models.length) return "";
  const hasMargin = models.some(m => m.expectedMargin > 0);
  const isUnitCount = models.some(m => m.dsRatio === Math.round(m.dsRatio) && m.dsRatio > 2);
  const ratioLabel = isUnitCount ? "Units" : "D/S Ratio";

  const headerStyle = `padding:8px 12px;text-align:left;font-weight:600;color:#94a3b8;border-bottom:2px solid #334155;font-size:12px;text-transform:uppercase;letter-spacing:0.5px`;
  const headerRight = `${headerStyle};text-align:right`;
  const headers = `
    <tr>
      <th style="${headerStyle}">Make/Model</th>
      <th style="${headerRight}">${ratioLabel}</th>
      <th style="${headerRight}">Avg Price</th>
      <th style="${headerRight}">Avg DOM</th>
      <th style="${headerRight}">Turn Rate</th>
      ${hasMargin ? `<th style="${headerRight}">Exp. Margin</th>` : ""}
      <th style="${headerStyle};text-align:center">Verdict</th>
    </tr>`;

  let rows = "";
  for (const m of models) {
    const cellStyle = `padding:8px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:13px`;
    const cellRight = `${cellStyle};text-align:right`;
    const ratioColor = isBuy ? "#86efac" : "#fca5a5";
    const ratioVal = isUnitCount ? String(Math.round(m.dsRatio)) : fmtRatio(m.dsRatio);
    rows += `<tr>
      <td style="${cellStyle};font-weight:600">${m.make} ${m.model}</td>
      <td style="${cellRight};color:${ratioColor};font-weight:700">${ratioVal}</td>
      <td style="${cellRight}">${fmtDollar(m.avgSalePrice)}</td>
      <td style="${cellRight}">${m.avgDom}d</td>
      <td style="${cellRight}">${m.turnRate.toFixed(1)}x</td>
      ${hasMargin ? `<td style="${cellRight};color:${isBuy ? "#86efac" : "#fca5a5"}">${fmtDollar(m.expectedMargin)}</td>` : ""}
      <td style="${cellStyle};text-align:center">${verdictBadge(m.verdict)}</td>
    </tr>`;
  }

  const borderColor = isBuy ? "#166534" : "#991b1b";
  return `
    <div style="background:#1e293b;border-radius:12px;border:1px solid ${borderColor};overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid #334155">
        <h3 style="font-size:16px;font-weight:700;color:#e2e8f0">${title}</h3>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>${headers}</thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function renderVinChecker(results: VinResult[] | null): string {
  let resultsHtml = "";
  if (results && results.length > 0) {
    const headerStyle = `padding:8px 12px;text-align:left;font-weight:600;color:#94a3b8;border-bottom:2px solid #334155;font-size:12px;text-transform:uppercase;letter-spacing:0.5px`;
    const headerRight = `${headerStyle};text-align:right`;
    const headers = `
      <tr>
        <th style="${headerStyle}">VIN</th>
        <th style="${headerStyle}">Year/Make/Model</th>
        <th style="${headerRight}">Retail Price</th>
        <th style="${headerRight}">Wholesale Price</th>
        <th style="${headerRight}">Exp. Margin</th>
        <th style="${headerRight}">Local Supply</th>
        <th style="${headerStyle};text-align:center">Verdict</th>
      </tr>`;

    let rows = "";
    for (const r of results) {
      const cellStyle = `padding:8px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:13px`;
      const cellRight = `${cellStyle};text-align:right`;
      const marginColor = r.expectedMargin >= 4000 ? "#86efac" : r.expectedMargin >= 2000 ? "#fde68a" : "#fca5a5";
      rows += `<tr>
        <td style="${cellStyle};font-family:monospace;font-size:11px">${r.vin}</td>
        <td style="${cellStyle};font-weight:600">${r.year} ${r.make} ${r.model}</td>
        <td style="${cellRight}">${fmtDollar(r.retailPrice)}</td>
        <td style="${cellRight}">${fmtDollar(r.wholesalePrice)}</td>
        <td style="${cellRight};color:${marginColor};font-weight:700">${fmtDollar(r.expectedMargin)}</td>
        <td style="${cellRight}">${r.localSupply}</td>
        <td style="${cellStyle};text-align:center">${verdictBadge(r.verdict)}</td>
      </tr>`;
    }

    resultsHtml = `
      <div style="margin-top:16px;overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>${headers}</thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  return `
    <div style="margin-top:24px;background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid #334155">
        <h3 style="font-size:16px;font-weight:700;color:#e2e8f0">VIN Checker</h3>
        <p style="font-size:12px;color:#64748b;margin-top:2px">Paste up to 10 VINs, one per line, to evaluate</p>
      </div>
      <div style="padding:16px">
        <div style="display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <textarea id="vin-input" placeholder="Paste VINs here, one per line...&#10;e.g.&#10;1FTFW1E82MFA00001&#10;2T1BURHE0JC000002" style="width:100%;min-height:120px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:8px;padding:12px;font-family:monospace;font-size:13px;resize:vertical;outline:none;box-sizing:border-box"></textarea>
          </div>
          <div style="min-width:120px">
            <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">ZIP Code</label>
            <input id="vin-zip-input" type="text" placeholder="e.g. 75201" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;box-sizing:border-box;outline:none" />
            <div style="font-size:10px;color:#64748b;margin-top:4px">Used for local pricing &amp; supply comparisons</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <button id="vin-check-btn" style="background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:10px 24px;font-size:14px;font-weight:600;cursor:pointer;transition:background 0.15s">Check VINs</button>
          <span id="vin-status" style="font-size:12px;color:#64748b"></span>
        </div>
        <div style="font-size:11px;color:#64748b;margin-top:6px">Each VIN makes ~3 API calls (decode + retail price + wholesale price). Active listing miles used when available.</div>
        <div id="vin-results">${resultsHtml}</div>
      </div>
    </div>`;
}

// ── Dealer Stock Render Functions ─────────────────────────────────────────────

interface DealerResult {
  listings: any[];
  numFound: number;
  dealerName: string;
  stats: { avgPrice: number; avgMiles: number; avgDom: number };
  soldData: { byMakeModel: any; byBodyType: any } | null;
}

function buildSoldModels(soldData: any): StockModel[] {
  if (!soldData?.rankings) return [];
  return soldData.rankings.map((r: any) => {
    const [make, model] = (r.dimension_value || "").split("|");
    const soldCount = r.sold_count || 0;
    const avgPrice = Math.round(r.average_sale_price || 0);
    const avgDom = Math.round(r.average_days_on_market || 0);
    const turnRate = avgDom > 0 ? Math.round((30 / avgDom) * 10) / 10 : 0;
    let verdict: string;
    if (avgDom <= 20 && soldCount >= 50) verdict = "STRONG BUY";
    else if (avgDom <= 30) verdict = "BUY";
    else if (avgDom <= 45) verdict = "WATCH";
    else if (avgDom <= 60) verdict = "SLOW";
    else verdict = "AVOID";
    return { make: make || "Unknown", model: model || "Unknown", dsRatio: soldCount, avgSalePrice: avgPrice, avgDom, turnRate, expectedMargin: 0, verdict };
  }).filter((m: StockModel) => m.make !== "Unknown");
}

function renderDealerDashboard(result: DealerResult): string {
  const { listings, numFound, dealerName: dName, stats, soldData } = result;
  const total = listings.length;

  const card = (label: string, value: string, color: string) => `
    <div style="background:#1e293b;border-radius:12px;padding:20px;flex:1;min-width:140px;border:1px solid #334155">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">${label}</div>
      <div style="font-size:28px;font-weight:800;color:${color}">${value}</div>
    </div>`;

  // Build heatmap from inventory body_type × price tier
  const priceBucket = (p: number): string => {
    if (p < 15000) return "$0-15K";
    if (p < 25000) return "$15-25K";
    if (p < 35000) return "$25-35K";
    if (p < 50000) return "$35-50K";
    return "$50K+";
  };
  const heatCounts: Record<string, number> = {};
  const btCounts: Record<string, number> = {};
  for (const l of listings) {
    const bt = l.body_type || "Other";
    const tier = priceBucket(l.price || 0);
    heatCounts[`${bt}|${tier}`] = (heatCounts[`${bt}|${tier}`] || 0) + 1;
    btCounts[bt] = (btCounts[bt] || 0) + 1;
  }
  const topBodyTypes = Object.entries(btCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(e => e[0]);
  const heatmap: HeatmapCell[] = [];
  for (const bt of topBodyTypes) {
    for (const tier of PRICE_TIERS) {
      const count = heatCounts[`${bt}|${tier}`] || 0;
      const dsRatio = count === 0 ? 0.3 : count <= 1 ? 0.7 : count <= 3 ? 1.2 : count <= 5 ? 1.8 : 2.5;
      heatmap.push({ bodyType: bt, priceTier: tier, dsRatio });
    }
  }
  const heatmapHtml = topBodyTypes.length > 0 ? renderHeatmap(heatmap) : "";
  // Patch renderHeatmap uses BODY_TYPES constant — we need inline heatmap for dynamic body types
  let heatmapInline = "";
  if (topBodyTypes.length > 0) {
    const lookup = new Map<string, number>();
    for (const c of heatmap) lookup.set(`${c.bodyType}|${c.priceTier}`, c.dsRatio);
    let hCells = `<th style="padding:10px 14px;text-align:left;font-weight:600;color:#94a3b8;border-bottom:2px solid #334155;background:#0f172a">Body Type</th>`;
    for (const tier of PRICE_TIERS) hCells += `<th style="padding:10px 14px;text-align:center;font-weight:600;color:#94a3b8;border-bottom:2px solid #334155;background:#0f172a">${tier}</th>`;
    let hRows = "";
    for (const bt of topBodyTypes) {
      let tds = `<td style="padding:10px 14px;font-weight:600;color:#e2e8f0;border-bottom:1px solid #1e293b">${bt}</td>`;
      for (const tier of PRICE_TIERS) {
        const ratio = lookup.get(`${bt}|${tier}`) ?? 0;
        tds += `<td style="padding:10px 14px;text-align:center;font-weight:700;font-size:16px;border-bottom:1px solid #1e293b;background:${heatColor(ratio)};color:${heatTextColor(ratio)}">${fmtRatio(ratio)}</td>`;
      }
      hRows += `<tr>${tds}</tr>`;
    }
    heatmapInline = `<div style="margin-bottom:24px">
      <h2 style="font-size:18px;font-weight:700;color:#e2e8f0;margin-bottom:4px">Inventory Concentration Heatmap</h2>
      <p style="font-size:12px;color:#64748b;margin-bottom:12px">
        <span style="color:#86efac">Green = High stock</span> &nbsp;|&nbsp; <span style="color:#fde68a">Yellow = Moderate</span> &nbsp;|&nbsp; <span style="color:#fca5a5">Red = Low/None</span>
      </p>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden"><thead><tr>${hCells}</tr></thead><tbody>${hRows}</tbody></table></div>
    </div>`;
  }

  // Fast/Slow movers from sold summary (Recents API)
  let fastTable = "";
  let slowTable = "";
  if (soldData?.byMakeModel) {
    const allSold = buildSoldModels(soldData.byMakeModel);
    const fast = allSold.filter(m => m.avgDom <= 30).slice(0, 15);
    const slow = allSold.filter(m => m.avgDom > 45).slice(0, 10);
    if (fast.length) fastTable = renderModelTable(fast, `Hot Sellers — ${fast.length} Fast-Moving Models (Regional Sold Data)`, true);
    if (slow.length) slowTable = renderModelTable(slow, `Slow Movers — ${slow.length} Slow-Moving Models (Regional Sold Data)`, false);
  }

  // Aging alerts from active inventory
  const aging = listings.filter(l => (l.days_on_market || 0) > 45).sort((a, b) => (b.days_on_market || 0) - (a.days_on_market || 0));
  let agingHtml = "";
  if (aging.length) {
    const thS = `padding:8px 12px;font-weight:600;color:#94a3b8;border-bottom:2px solid #334155;font-size:12px`;
    let agingRows = "";
    for (const l of aging) {
      agingRows += `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-weight:600">${l.year || ""} ${l.make || ""} ${l.model || ""} ${l.trim || ""}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;text-align:right">${l.price ? fmtDollar(l.price) : "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;text-align:right">${l.miles ? l.miles.toLocaleString() : "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#fca5a5;text-align:right;font-weight:700">${l.days_on_market || 0}d</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;font-family:monospace;font-size:11px">${l.vin || "—"}</td>
      </tr>`;
    }
    agingHtml = `
      <div style="margin-top:20px;background:#1e293b;border-radius:12px;border:1px solid #991b1b;overflow:hidden">
        <div style="padding:14px 16px;border-bottom:1px solid #334155">
          <h3 style="font-size:16px;font-weight:700;color:#fca5a5">Aging Alerts — ${aging.length} units over 45 DOM</h3>
        </div>
        <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
          <thead><tr><th style="${thS};text-align:left">Vehicle</th><th style="${thS};text-align:right">Price</th><th style="${thS};text-align:right">Miles</th><th style="${thS};text-align:right">DOM</th><th style="${thS};text-align:left">VIN</th></tr></thead>
          <tbody>${agingRows}</tbody>
        </table></div>
      </div>`;
  }

  return `
    <div style="margin-bottom:16px">
      <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:16px;flex-wrap:wrap">
        <h2 style="font-size:20px;font-weight:700;color:#e2e8f0">${dName}</h2>
        <span style="font-size:13px;color:#64748b">${numFound} listings${numFound > total ? " (showing " + total + ")" : ""}</span>
      </div>
      <div style="display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap">
        ${card("Total Units", String(total), "#60a5fa")}
        ${card("Avg Price", fmtDollar(stats.avgPrice), "#34d399")}
        ${card("Avg Miles", stats.avgMiles.toLocaleString(), "#fbbf24")}
        ${card("Avg DOM", stats.avgDom + "d", stats.avgDom > 45 ? "#fca5a5" : "#86efac")}
      </div>
      ${heatmapInline}
      <div style="display:flex;gap:20px;margin-top:4px;flex-wrap:wrap">
        <div style="flex:6;min-width:320px">${fastTable}</div>
        <div style="flex:4;min-width:280px">${slowTable}</div>
      </div>
      ${agingHtml}
    </div>`;
}

// ── Dealer Data Fetch (self-contained, no IIFE deps) ────────────────────────

function _mcAuthHeaders(): { params: URLSearchParams; headers: Record<string, string> } {
  const qp = new URLSearchParams(location.search);
  const apiKey = qp.get("api_key") ?? localStorage.getItem("mc_api_key");
  const token = qp.get("access_token") ?? localStorage.getItem("mc_access_token");
  const params = new URLSearchParams();
  const headers: Record<string, string> = {};
  if (apiKey) params.set("api_key", apiKey);
  else if (token) headers["Authorization"] = "Bearer " + token;
  return { params, headers };
}

async function _mcFetch(path: string, extra: Record<string, string> = {}): Promise<any> {
  const { params, headers } = _mcAuthHeaders();
  for (const [k, v] of Object.entries(extra)) {
    if (v) params.set(k, v);
  }
  const prefix = path.startsWith("/api/") ? "" : "/v2";
  const res = await fetch(`https://api.marketcheck.com${prefix}${path}?${params.toString()}`, { headers });
  if (!res.ok) throw new Error("API error " + res.status);
  return res.json();
}

async function fetchDealerInventory(idOrDomain: string, carType?: string, rows?: number): Promise<any> {
  const trimmed = idOrDomain.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const isNumeric = /^\d+$/.test(trimmed);
  const dealerParams: Record<string, string> = {
    rows: String(rows || 50),
    stats: "price,miles,dom",
    facets: "make,body_type",
  };
  if (isNumeric) dealerParams.dealer_id = trimmed;
  else dealerParams.seller_domain = trimmed;
  if (carType) dealerParams.car_type = carType;
  return _mcFetch("/search/car/active", dealerParams);
}

async function fetchSoldSummary(state: string): Promise<{ byMakeModel: any; byBodyType: any }> {
  const [byMakeModel, byBodyType] = await Promise.all([
    _mcFetch("/api/v1/sold-vehicles/summary", {
      state, ranking_dimensions: "make,model", ranking_measure: "sold_count,average_sale_price,average_days_on_market",
      ranking_order: "desc", top_n: "30",
    }),
    _mcFetch("/api/v1/sold-vehicles/summary", {
      state, ranking_dimensions: "body_type", ranking_measure: "sold_count,average_sale_price,average_days_on_market",
    }),
  ]);
  return { byMakeModel, byBodyType };
}

async function checkVinsLive(vins: string[], zip: string): Promise<VinResult[]> {
  return Promise.all(
    vins.slice(0, 10).map(async (vin): Promise<VinResult> => {
      const cleaned = vin.trim().toUpperCase();
      try {
        // Step 1: Decode VIN + check active listings for real miles
        const [decode, activeLookup] = await Promise.all([
          _mcFetch("/decode/car/neovin/" + cleaned + "/specs"),
          _mcFetch("/search/car/active", { vin: cleaned, rows: "1" }).catch(() => null),
        ]);
        const year = decode?.year || 0;
        const make = decode?.make || "Unknown";
        const model = decode?.model || "Unknown";
        // Use real miles from active listing if available, else estimate from age
        const activeListing = activeLookup?.listings?.[0];
        const realMiles = activeListing?.miles;
        const currentYear = new Date().getFullYear();
        const miles = String(realMiles || Math.max(5000, (currentYear - (year || currentYear)) * 12000));
        // Step 2: Predict retail (franchise) and wholesale (independent) prices
        const predictParams = { vin: cleaned, miles, zip };
        const [retail, wholesale] = await Promise.all([
          _mcFetch("/predict/car/us/marketcheck_price/comparables", { ...predictParams, dealer_type: "franchise" }),
          _mcFetch("/predict/car/us/marketcheck_price/comparables", { ...predictParams, dealer_type: "independent" }),
        ]);
        const retailPrice = Math.round(retail?.marketcheck_price || 0);
        const wholesalePrice = Math.round(wholesale?.marketcheck_price || 0);
        const margin = retailPrice - wholesalePrice;
        const supply = retail?.comparables?.num_found || 0;
        let verdict: string;
        if (margin > 4000 && supply < 8) verdict = "BUY";
        else if (margin < 2000 || supply > 15) verdict = "PASS";
        else verdict = "CAUTION";
        return { vin: cleaned, year, make, model, retailPrice, wholesalePrice, expectedMargin: margin, localSupply: supply, verdict };
      } catch (e: any) {
        return { vin: cleaned, year: 0, make: "Error", model: e.message || "Failed", retailPrice: 0, wholesalePrice: 0, expectedMargin: 0, localSupply: 0, verdict: "PASS" };
      }
    })
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const app = new App();

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

  // ── State ──
  let currentMode: "vin-list" | "dealer-stock" = "vin-list";
  let dealerResult: DealerResult | null = null;
  let vinResults: VinResult[] | null = null;
  let savedVinText = "";
  let savedZip = "";
  let savedDealerInput = "";
  let savedCondition = "";
  let savedRows = "50";

  // ── Render ──
  function render() {
    const modeBtn = (id: string, label: string, mode: string) => {
      const active = currentMode === mode;
      return `<button id="${id}" style="padding:10px 24px;font-size:14px;font-weight:600;border-radius:8px;cursor:pointer;transition:all 0.15s;${
        active
          ? "background:#3b82f6;color:#fff;border:1px solid #3b82f6;"
          : "background:#1e293b;color:#94a3b8;border:1px solid #334155;"
      }">${label}</button>`;
    };

    let content = "";
    if (currentMode === "vin-list") {
      content = renderVinChecker(vinResults);
    } else {
      const inputStyle = "width:100%;padding:10px 12px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;box-sizing:border-box;outline:none";
      content = `
        <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;padding:20px;margin-bottom:24px">
          <h3 style="font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:12px">Load Dealer Inventory</h3>
          <div style="display:flex;gap:12px;align-items:end;flex-wrap:wrap">
            <div style="flex:1;min-width:160px">
              <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">MarketCheck Dealer ID</label>
              <input id="dealer-id-input" type="text" placeholder="e.g. 12345" style="${inputStyle}" />
            </div>
            <div style="color:#64748b;font-size:13px;font-weight:600;padding-bottom:10px">or</div>
            <div style="flex:1;min-width:200px">
              <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">Dealer Website Domain</label>
              <input id="dealer-domain-input" type="text" placeholder="e.g. www.chicagotoyota.com" style="${inputStyle}" />
            </div>
            <div style="min-width:120px">
              <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">Condition</label>
              <select id="dealer-condition" style="${inputStyle};cursor:pointer">
                <option value="">All</option>
                <option value="used">Used</option>
                <option value="new">New</option>
                <option value="certified">Certified</option>
              </select>
            </div>
            <div style="min-width:100px">
              <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px"># Vehicles</label>
              <select id="dealer-rows" style="${inputStyle};cursor:pointer">
                <option value="25">25</option>
                <option value="50" selected>50</option>
                <option value="100">100</option>
                <option value="200">200</option>
              </select>
            </div>
            <button id="dealer-load-btn" style="background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:10px 24px;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap">Load Inventory</button>
          </div>
          <div style="font-size:11px;color:#64748b;margin-top:8px">More vehicles = more API calls and longer loading time. Regional sold data is also fetched for fast/slow mover analysis.</div>
          <div id="dealer-status" style="font-size:12px;color:#64748b;margin-top:6px"></div>
        </div>
        ${dealerResult ? renderDealerDashboard(dealerResult) : ""}`;
    }

    root.innerHTML = `
      <div style="max-width:1400px;margin:0 auto">
        <div style="margin-bottom:24px;display:flex;align-items:center;flex-wrap:wrap;gap:16px">
          <div style="flex:1;min-width:200px">
            <h1 style="font-size:26px;font-weight:800;color:#e2e8f0;margin-bottom:4px">Stocking Intelligence</h1>
            <p style="font-size:13px;color:#64748b">Dealer inventory recommendations based on local demand/supply analysis</p>
          </div>
          <div style="display:flex;gap:8px">
            ${modeBtn("mode-vin", "By VIN List", "vin-list")}
            ${modeBtn("mode-dealer", "By Dealer Stock", "dealer-stock")}
          </div>
        </div>
        ${content}
      </div>`;

    // ── Wire mode buttons ──
    document.getElementById("mode-vin")?.addEventListener("click", () => {
      if (currentMode !== "vin-list") { currentMode = "vin-list"; render(); }
    });
    document.getElementById("mode-dealer")?.addEventListener("click", () => {
      if (currentMode !== "dealer-stock") { currentMode = "dealer-stock"; render(); }
    });

    // ── Wire VIN checker ──
    if (currentMode === "vin-list") {
      const btn = document.getElementById("vin-check-btn") as HTMLButtonElement;
      const textarea = document.getElementById("vin-input") as HTMLTextAreaElement;
      const zipInput = document.getElementById("vin-zip-input") as HTMLInputElement;
      const status = document.getElementById("vin-status") as HTMLSpanElement;
      if (textarea && savedVinText) textarea.value = savedVinText;
      if (zipInput && savedZip) zipInput.value = savedZip;

      btn?.addEventListener("click", async () => {
        const raw = textarea?.value ?? "";
        savedVinText = raw;
        savedZip = zipInput?.value?.trim() || "";
        const zip = savedZip || "75201";
        const vins = raw.split("\n").map(v => v.trim()).filter(v => v.length > 0).slice(0, 10);
        if (!vins.length) { if (status) status.textContent = "Please enter at least one VIN."; return; }
        if (status) status.textContent = `Checking ${vins.length} VIN${vins.length > 1 ? "s" : ""}... (~3 API calls per VIN)`;
        btn.disabled = true; btn.style.opacity = "0.6";

        try {
          vinResults = await checkVinsLive(vins, zip);
        } catch {
          vinResults = getMockVinResults(vins);
        }
        render();
      });
    }

    // ── Wire dealer stock form ──
    if (currentMode === "dealer-stock") {
      const idInput = document.getElementById("dealer-id-input") as HTMLInputElement;
      const domainInput = document.getElementById("dealer-domain-input") as HTMLInputElement;
      const conditionSelect = document.getElementById("dealer-condition") as HTMLSelectElement;
      const rowsSelect = document.getElementById("dealer-rows") as HTMLSelectElement;
      const loadBtn = document.getElementById("dealer-load-btn") as HTMLButtonElement;
      const statusEl = document.getElementById("dealer-status") as HTMLDivElement;

      // Restore saved value into the right field
      if (savedDealerInput) {
        if (/^\d+$/.test(savedDealerInput)) { if (idInput) idInput.value = savedDealerInput; }
        else { if (domainInput) domainInput.value = savedDealerInput; }
      }
      if (conditionSelect && savedCondition) conditionSelect.value = savedCondition;
      if (rowsSelect && savedRows) rowsSelect.value = savedRows;

      const doLoad = async () => {
        const val = idInput?.value?.trim() || domainInput?.value?.trim();
        if (!val) { if (statusEl) statusEl.textContent = "Please enter a Dealer ID or domain."; return; }
        savedDealerInput = val;
        savedCondition = conditionSelect?.value || "";
        savedRows = rowsSelect?.value || "50";
        const rows = parseInt(savedRows, 10);
        if (statusEl) statusEl.innerHTML = '<span style="color:#60a5fa">Loading inventory + regional sold data...</span>';
        if (loadBtn) { loadBtn.disabled = true; loadBtn.style.opacity = "0.6"; }

        try {
          const resp = await fetchDealerInventory(val, savedCondition || undefined, rows);
          if (!resp?.listings?.length) {
            if (statusEl) statusEl.innerHTML = '<span style="color:#fca5a5">No listings found. Check the Dealer ID or domain.</span>';
            if (loadBtn) { loadBtn.disabled = false; loadBtn.style.opacity = "1"; }
            return;
          }
          const listings = resp.listings;
          const numFound = resp.num_found || listings.length;
          const dName = listings[0]?.dealer?.name || val;
          // Use stats from API response (stats.dom.avg) for accurate avg DOM
          const domStats = resp.stats?.dom;
          const priceStats = resp.stats?.price;
          const milesStats = resp.stats?.miles;
          const avgPrice = Math.round(priceStats?.avg || 0);
          const avgMiles = Math.round(milesStats?.avg || 0);
          const avgDom = Math.round(domStats?.avg || 0);

          // Fetch regional sold data for fast/slow mover analysis
          const dealerState = listings[0]?.dealer?.state || listings[0]?.location?.state || "TX";
          if (statusEl) statusEl.innerHTML = '<span style="color:#60a5fa">Loading regional sold data for ' + dealerState + '...</span>';
          let soldData = null;
          try { soldData = await fetchSoldSummary(dealerState); } catch {}

          dealerResult = { listings, numFound, dealerName: dName, stats: { avgPrice, avgMiles, avgDom }, soldData };
          render();
        } catch (e: any) {
          if (statusEl) statusEl.innerHTML = `<span style="color:#fca5a5">Error: ${e.message || "Failed to fetch inventory"}</span>`;
          if (loadBtn) { loadBtn.disabled = false; loadBtn.style.opacity = "1"; }
        }
      };

      loadBtn?.addEventListener("click", doLoad);
      idInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") doLoad(); });
      domainInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") doLoad(); });
    }
  }

  // ── Render immediately — no data pre-loaded ──
  render();
}

main();
