/**
 * Regional Demand Allocator
 * MCP App 20 — Dark-themed dashboard for analyzing vehicle demand/supply
 * across US states with allocation recommendations
 */
import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
if (window.parent !== window) { try { _safeApp = new App({ name: "regional-demand-allocator" }); } catch {} }

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

async function _fetchDirect(args: Record<string, any>) {
  const [stateVolume, segmentVolume] = await Promise.all([
    _mcSold({ ranking_dimensions: "state", ranking_measure: "sold_count", make: args.make, model: args.model, top_n: 25, inventory_type: "used" }),
    _mcSold({ ranking_dimensions: "body_type", ranking_measure: "sold_count", make: args.make, model: args.model, top_n: 10, inventory_type: "used" }),
  ]);
  let activeByState = null;
  try {
    activeByState = await _mcActive({ make: args.make, model: args.model, rows: 0, stats: "state", facets: "state" });
  } catch {}
  return { stateVolume, segmentVolume, activeByState };
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

interface StateDemand {
  state: string;
  stateAbbr: string;
  soldVolume: number;
  activeSupply: number;
  dsRatio: number;
  avgSalePrice: number;
  avgDom: number;
  priceOverMsrpPct: number;
}

interface SegmentMix {
  state: string;
  stateAbbr: string;
  segments: {
    name: string;
    demandPct: number;
    inventoryPct: number;
  }[];
}

interface AllocationRec {
  fromState: string;
  toState: string;
  segment: string;
  dsFrom: number;
  dsTo: number;
  unitsToShift: number;
  revenueImpact: number;
}

interface RegionalData {
  states: StateDemand[];
  segmentMix: SegmentMix[];
  allocations: AllocationRec[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MAKES = [
  "Toyota", "Honda", "Ford", "Chevrolet", "Hyundai", "Kia",
  "Nissan", "Subaru", "Jeep", "Ram", "BMW", "Mercedes-Benz",
  "Mazda", "Volkswagen", "GMC", "Lexus", "Audi",
];

const MODELS_BY_MAKE: Record<string, string[]> = {
  Toyota: ["RAV4", "Camry", "Corolla", "Highlander", "Tacoma", "4Runner", "Tundra"],
  Honda: ["CR-V", "Civic", "Accord", "HR-V", "Pilot", "Odyssey"],
  Ford: ["F-150", "Explorer", "Escape", "Bronco", "Maverick", "Edge"],
  Chevrolet: ["Silverado 1500", "Equinox", "Tahoe", "Traverse", "Malibu", "Blazer"],
  Hyundai: ["Tucson", "Elantra", "Santa Fe", "Palisade", "Kona", "Sonata"],
  Kia: ["Sportage", "Forte", "Telluride", "Sorento", "Seltos", "K5"],
  Nissan: ["Rogue", "Altima", "Sentra", "Pathfinder", "Frontier", "Kicks"],
  Subaru: ["Outback", "Forester", "Crosstrek", "Impreza", "Ascent", "WRX"],
  Jeep: ["Grand Cherokee", "Wrangler", "Cherokee", "Compass", "Gladiator"],
  Ram: ["1500", "2500", "3500"],
  BMW: ["3 Series", "X3", "X5", "5 Series", "X1", "4 Series"],
  "Mercedes-Benz": ["GLE", "C-Class", "GLC", "E-Class", "A-Class", "S-Class"],
  Mazda: ["CX-5", "Mazda3", "CX-50", "CX-9", "MX-5 Miata"],
  Volkswagen: ["Tiguan", "Jetta", "Atlas", "Taos", "ID.4", "Golf GTI"],
  GMC: ["Sierra 1500", "Terrain", "Acadia", "Yukon", "Canyon"],
  Lexus: ["RX", "NX", "ES", "IS", "GX", "UX"],
  Audi: ["Q5", "A4", "Q7", "A3", "Q3", "e-tron"],
};

const BODY_TYPES = ["SUV", "Sedan", "Truck", "Hatchback", "Coupe", "Minivan"];

// ── Mock Data ──────────────────────────────────────────────────────────────────

function getMockRegionalData(): RegionalData {
  const states: StateDemand[] = [
    // Undersupplied (green) — D/S > 1.5
    { state: "Texas", stateAbbr: "TX", soldVolume: 14820, activeSupply: 8240, dsRatio: 1.80, avgSalePrice: 36450, avgDom: 18, priceOverMsrpPct: 4.2 },
    { state: "Florida", stateAbbr: "FL", soldVolume: 12650, activeSupply: 7180, dsRatio: 1.76, avgSalePrice: 37120, avgDom: 16, priceOverMsrpPct: 5.1 },
    { state: "Arizona", stateAbbr: "AZ", soldVolume: 5420, activeSupply: 3280, dsRatio: 1.65, avgSalePrice: 35890, avgDom: 20, priceOverMsrpPct: 3.8 },
    { state: "Georgia", stateAbbr: "GA", soldVolume: 7310, activeSupply: 4520, dsRatio: 1.62, avgSalePrice: 34780, avgDom: 22, priceOverMsrpPct: 3.2 },
    { state: "Tennessee", stateAbbr: "TN", soldVolume: 4890, activeSupply: 3060, dsRatio: 1.60, avgSalePrice: 33950, avgDom: 21, priceOverMsrpPct: 2.9 },
    { state: "Nevada", stateAbbr: "NV", soldVolume: 3120, activeSupply: 2010, dsRatio: 1.55, avgSalePrice: 36210, avgDom: 19, priceOverMsrpPct: 3.5 },
    { state: "South Carolina", stateAbbr: "SC", soldVolume: 3780, activeSupply: 2460, dsRatio: 1.54, avgSalePrice: 33420, avgDom: 23, priceOverMsrpPct: 2.6 },
    // Balanced (yellow) — 0.7 <= D/S <= 1.5
    { state: "North Carolina", stateAbbr: "NC", soldVolume: 6840, activeSupply: 4870, dsRatio: 1.40, avgSalePrice: 34200, avgDom: 26, priceOverMsrpPct: 1.8 },
    { state: "Virginia", stateAbbr: "VA", soldVolume: 5620, activeSupply: 4120, dsRatio: 1.36, avgSalePrice: 35600, avgDom: 25, priceOverMsrpPct: 2.1 },
    { state: "Colorado", stateAbbr: "CO", soldVolume: 4950, activeSupply: 3750, dsRatio: 1.32, avgSalePrice: 37800, avgDom: 24, priceOverMsrpPct: 1.9 },
    { state: "Washington", stateAbbr: "WA", soldVolume: 5280, activeSupply: 4180, dsRatio: 1.26, avgSalePrice: 38200, avgDom: 27, priceOverMsrpPct: 1.4 },
    { state: "Illinois", stateAbbr: "IL", soldVolume: 7150, activeSupply: 5820, dsRatio: 1.23, avgSalePrice: 33600, avgDom: 29, priceOverMsrpPct: 0.8 },
    { state: "Ohio", stateAbbr: "OH", soldVolume: 6230, activeSupply: 5310, dsRatio: 1.17, avgSalePrice: 32400, avgDom: 31, priceOverMsrpPct: 0.5 },
    { state: "Pennsylvania", stateAbbr: "PA", soldVolume: 6890, activeSupply: 6010, dsRatio: 1.15, avgSalePrice: 33800, avgDom: 30, priceOverMsrpPct: 0.6 },
    { state: "Indiana", stateAbbr: "IN", soldVolume: 3950, activeSupply: 3520, dsRatio: 1.12, avgSalePrice: 31200, avgDom: 33, priceOverMsrpPct: 0.2 },
    { state: "Missouri", stateAbbr: "MO", soldVolume: 3680, activeSupply: 3350, dsRatio: 1.10, avgSalePrice: 31800, avgDom: 32, priceOverMsrpPct: 0.3 },
    { state: "Minnesota", stateAbbr: "MN", soldVolume: 3420, activeSupply: 3240, dsRatio: 1.06, avgSalePrice: 34100, avgDom: 34, priceOverMsrpPct: -0.1 },
    { state: "Wisconsin", stateAbbr: "WI", soldVolume: 2980, activeSupply: 2910, dsRatio: 1.02, avgSalePrice: 33200, avgDom: 35, priceOverMsrpPct: -0.3 },
    { state: "New York", stateAbbr: "NY", soldVolume: 8920, activeSupply: 9380, dsRatio: 0.95, avgSalePrice: 36800, avgDom: 38, priceOverMsrpPct: -0.8 },
    { state: "New Jersey", stateAbbr: "NJ", soldVolume: 5140, activeSupply: 5680, dsRatio: 0.90, avgSalePrice: 37200, avgDom: 37, priceOverMsrpPct: -0.5 },
    { state: "Michigan", stateAbbr: "MI", soldVolume: 5870, activeSupply: 6680, dsRatio: 0.88, avgSalePrice: 32100, avgDom: 40, priceOverMsrpPct: -1.2 },
    { state: "Massachusetts", stateAbbr: "MA", soldVolume: 3960, activeSupply: 4820, dsRatio: 0.82, avgSalePrice: 38400, avgDom: 42, priceOverMsrpPct: -1.5 },
    // Oversupplied (red) — D/S < 0.7
    { state: "California", stateAbbr: "CA", soldVolume: 15240, activeSupply: 23440, dsRatio: 0.65, avgSalePrice: 38900, avgDom: 48, priceOverMsrpPct: -3.2 },
    { state: "Oregon", stateAbbr: "OR", soldVolume: 2680, activeSupply: 4120, dsRatio: 0.65, avgSalePrice: 36500, avgDom: 46, priceOverMsrpPct: -2.8 },
    { state: "Connecticut", stateAbbr: "CT", soldVolume: 1840, activeSupply: 3210, dsRatio: 0.57, avgSalePrice: 39200, avgDom: 52, priceOverMsrpPct: -4.1 },
  ];

  const topStates = ["TX", "FL", "AZ", "GA", "CA"];
  const segmentMix: SegmentMix[] = topStates.map((abbr) => {
    const st = states.find((s) => s.stateAbbr === abbr)!;
    let segments: SegmentMix["segments"];
    switch (abbr) {
      case "TX":
        segments = [
          { name: "SUV", demandPct: 38, inventoryPct: 28 },
          { name: "Truck", demandPct: 32, inventoryPct: 22 },
          { name: "Sedan", demandPct: 16, inventoryPct: 26 },
          { name: "Hatchback", demandPct: 8, inventoryPct: 14 },
          { name: "Coupe", demandPct: 4, inventoryPct: 6 },
          { name: "Minivan", demandPct: 2, inventoryPct: 4 },
        ];
        break;
      case "FL":
        segments = [
          { name: "SUV", demandPct: 36, inventoryPct: 30 },
          { name: "Sedan", demandPct: 24, inventoryPct: 18 },
          { name: "Truck", demandPct: 20, inventoryPct: 16 },
          { name: "Hatchback", demandPct: 10, inventoryPct: 18 },
          { name: "Coupe", demandPct: 6, inventoryPct: 10 },
          { name: "Minivan", demandPct: 4, inventoryPct: 8 },
        ];
        break;
      case "AZ":
        segments = [
          { name: "SUV", demandPct: 40, inventoryPct: 32 },
          { name: "Truck", demandPct: 28, inventoryPct: 20 },
          { name: "Sedan", demandPct: 18, inventoryPct: 24 },
          { name: "Hatchback", demandPct: 8, inventoryPct: 12 },
          { name: "Coupe", demandPct: 4, inventoryPct: 8 },
          { name: "Minivan", demandPct: 2, inventoryPct: 4 },
        ];
        break;
      case "GA":
        segments = [
          { name: "SUV", demandPct: 34, inventoryPct: 28 },
          { name: "Sedan", demandPct: 26, inventoryPct: 22 },
          { name: "Truck", demandPct: 22, inventoryPct: 18 },
          { name: "Hatchback", demandPct: 10, inventoryPct: 16 },
          { name: "Coupe", demandPct: 5, inventoryPct: 10 },
          { name: "Minivan", demandPct: 3, inventoryPct: 6 },
        ];
        break;
      case "CA":
        segments = [
          { name: "SUV", demandPct: 30, inventoryPct: 38 },
          { name: "Sedan", demandPct: 22, inventoryPct: 24 },
          { name: "Hatchback", demandPct: 18, inventoryPct: 14 },
          { name: "Truck", demandPct: 14, inventoryPct: 12 },
          { name: "Coupe", demandPct: 10, inventoryPct: 8 },
          { name: "Minivan", demandPct: 6, inventoryPct: 4 },
        ];
        break;
      default:
        segments = [];
    }
    return { state: st.state, stateAbbr: abbr, segments };
  });

  const allocations: AllocationRec[] = [
    { fromState: "CA", toState: "TX", segment: "SUV", dsFrom: 0.65, dsTo: 1.80, unitsToShift: 680, revenueImpact: 2720000 },
    { fromState: "CA", toState: "FL", segment: "SUV", dsFrom: 0.65, dsTo: 1.76, unitsToShift: 520, revenueImpact: 2080000 },
    { fromState: "CA", toState: "TX", segment: "Truck", dsFrom: 0.65, dsTo: 1.80, unitsToShift: 440, revenueImpact: 1936000 },
    { fromState: "OR", toState: "AZ", segment: "SUV", dsFrom: 0.65, dsTo: 1.65, unitsToShift: 310, revenueImpact: 1147000 },
    { fromState: "CT", toState: "GA", segment: "Sedan", dsFrom: 0.57, dsTo: 1.62, unitsToShift: 280, revenueImpact: 980000 },
    { fromState: "CA", toState: "TN", segment: "SUV", dsFrom: 0.65, dsTo: 1.60, unitsToShift: 240, revenueImpact: 888000 },
    { fromState: "CA", toState: "NV", segment: "Truck", dsFrom: 0.65, dsTo: 1.55, unitsToShift: 190, revenueImpact: 722000 },
    { fromState: "OR", toState: "SC", segment: "SUV", dsFrom: 0.65, dsTo: 1.54, unitsToShift: 160, revenueImpact: 592000 },
  ];

  return { states, segmentMix, allocations };
}

// ── Render Helpers ─────────────────────────────────────────────────────────────

function getDsColor(ds: number): string {
  if (ds >= 1.5) return "#22c55e";  // green
  if (ds < 0.7) return "#ef4444";   // red
  return "#eab308";                  // yellow
}

function getDsRowBg(ds: number): string {
  if (ds >= 1.5) return "rgba(34,197,94,0.08)";
  if (ds < 0.7) return "rgba(239,68,68,0.08)";
  return "rgba(234,179,8,0.04)";
}

function getDsLabel(ds: number): string {
  if (ds >= 1.5) return "Undersupplied";
  if (ds < 0.7) return "Oversupplied";
  return "Balanced";
}

function fmtCurrency(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

function fmtPct(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
}

function renderControls(selectedMake: string, selectedModel: string, selectedBody: string): string {
  const makeOptions = MAKES.map(
    (m) => `<option value="${m}" ${m === selectedMake ? "selected" : ""}>${m}</option>`
  ).join("");

  const models = MODELS_BY_MAKE[selectedMake] || [];
  const modelOptions = [`<option value="">All Models</option>`]
    .concat(
      models.map(
        (m) => `<option value="${m}" ${m === selectedModel ? "selected" : ""}>${m}</option>`
      )
    )
    .join("");

  const bodyChips = BODY_TYPES.map(
    (b) =>
      `<button class="body-chip" data-body="${b}" style="
        padding:6px 16px;border-radius:20px;font-size:13px;font-weight:500;cursor:pointer;
        border:1px solid ${b === selectedBody ? "#3b82f6" : "#334155"};
        background:${b === selectedBody ? "#1e3a5f" : "#1e293b"};
        color:${b === selectedBody ? "#60a5fa" : "#94a3b8"};
        transition:all 0.15s;
      ">${b}</button>`
  ).join("");

  return `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:24px;padding:20px;background:#1e293b;border-radius:12px;border:1px solid #334155">
      <div style="display:flex;align-items:center;gap:8px">
        <label style="font-size:13px;color:#94a3b8;font-weight:500">Make</label>
        <select id="make-select" style="
          background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:8px;
          padding:8px 12px;font-size:13px;outline:none;cursor:pointer;min-width:140px;
        ">${makeOptions}</select>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <label style="font-size:13px;color:#94a3b8;font-weight:500">Model</label>
        <select id="model-select" style="
          background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:8px;
          padding:8px 12px;font-size:13px;outline:none;cursor:pointer;min-width:160px;
        ">${modelOptions}</select>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span style="font-size:13px;color:#94a3b8;font-weight:500;margin-right:4px">Body</span>
        ${bodyChips}
      </div>
      <button id="analyze-btn" style="
        background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:10px 28px;
        font-size:14px;font-weight:600;cursor:pointer;transition:background 0.15s;margin-left:auto;
      ">Analyze</button>
    </div>`;
}

function renderStateDemandTable(states: StateDemand[], sortCol: string, sortAsc: boolean): string {
  const sorted = [...states].sort((a, b) => {
    let va: number, vb: number;
    switch (sortCol) {
      case "state": return sortAsc ? a.state.localeCompare(b.state) : b.state.localeCompare(a.state);
      case "soldVolume": va = a.soldVolume; vb = b.soldVolume; break;
      case "activeSupply": va = a.activeSupply; vb = b.activeSupply; break;
      case "dsRatio": va = a.dsRatio; vb = b.dsRatio; break;
      case "avgSalePrice": va = a.avgSalePrice; vb = b.avgSalePrice; break;
      case "avgDom": va = a.avgDom; vb = b.avgDom; break;
      case "priceOverMsrpPct": va = a.priceOverMsrpPct; vb = b.priceOverMsrpPct; break;
      default: va = a.dsRatio; vb = b.dsRatio;
    }
    return sortAsc ? va! - vb! : vb! - va!;
  });

  const headers = [
    { key: "state", label: "State", align: "left" },
    { key: "soldVolume", label: "Sold Volume", align: "right" },
    { key: "activeSupply", label: "Active Supply", align: "right" },
    { key: "dsRatio", label: "D/S Ratio", align: "right" },
    { key: "avgSalePrice", label: "Avg Sale Price", align: "right" },
    { key: "avgDom", label: "Avg DOM", align: "right" },
    { key: "priceOverMsrpPct", label: "Price/MSRP %", align: "right" },
  ];

  const thStyle = (h: typeof headers[0]) => `
    padding:10px 14px;text-align:${h.align};font-size:11px;font-weight:600;
    color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;cursor:pointer;
    user-select:none;white-space:nowrap;border-bottom:1px solid #334155;
    background:#1e293b;position:sticky;top:0;z-index:1;
  `;

  const arrow = (key: string) =>
    sortCol === key ? (sortAsc ? " &#9650;" : " &#9660;") : "";

  const headerRow = headers
    .map(
      (h) =>
        `<th data-sort="${h.key}" style="${thStyle(h)}">${h.label}${arrow(h.key)}</th>`
    )
    .join("");

  const rows = sorted
    .map((s) => {
      const bg = getDsRowBg(s.dsRatio);
      const dsColor = getDsColor(s.dsRatio);
      const label = getDsLabel(s.dsRatio);
      const pctColor = s.priceOverMsrpPct >= 0 ? "#22c55e" : "#ef4444";
      return `<tr style="background:${bg};border-bottom:1px solid rgba(51,65,85,0.5);transition:background 0.15s" onmouseover="this.style.background='rgba(59,130,246,0.08)'" onmouseout="this.style.background='${bg}'">
        <td style="padding:10px 14px;font-size:13px;font-weight:500;white-space:nowrap">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dsColor};margin-right:8px"></span>
          ${s.state} <span style="color:#64748b;font-size:11px">(${s.stateAbbr})</span>
        </td>
        <td style="padding:10px 14px;text-align:right;font-size:13px;font-variant-numeric:tabular-nums">${s.soldVolume.toLocaleString()}</td>
        <td style="padding:10px 14px;text-align:right;font-size:13px;font-variant-numeric:tabular-nums">${s.activeSupply.toLocaleString()}</td>
        <td style="padding:10px 14px;text-align:right;font-size:13px;font-weight:700;color:${dsColor}">
          ${s.dsRatio.toFixed(2)}
          <span style="font-size:10px;font-weight:400;color:#64748b;margin-left:4px">${label}</span>
        </td>
        <td style="padding:10px 14px;text-align:right;font-size:13px;font-variant-numeric:tabular-nums">${fmtCurrency(s.avgSalePrice)}</td>
        <td style="padding:10px 14px;text-align:right;font-size:13px;font-variant-numeric:tabular-nums">${s.avgDom}d</td>
        <td style="padding:10px 14px;text-align:right;font-size:13px;font-weight:600;color:${pctColor}">${fmtPct(s.priceOverMsrpPct)}</td>
      </tr>`;
    })
    .join("");

  return `
    <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden;margin-bottom:24px">
      <div style="padding:16px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;justify-content:space-between">
        <div>
          <h2 style="font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:2px">State Demand Analysis</h2>
          <p style="font-size:12px;color:#64748b">${sorted.length} states sorted by ${sortCol === "dsRatio" ? "D/S Ratio" : sortCol} &middot;
            <span style="color:#22c55e">Green</span> = Undersupplied &middot;
            <span style="color:#eab308">Yellow</span> = Balanced &middot;
            <span style="color:#ef4444">Red</span> = Oversupplied
          </p>
        </div>
      </div>
      <div id="demand-table-wrap" style="max-height:520px;overflow-y:auto">
        <table id="demand-table" style="width:100%;border-collapse:collapse">
          <thead><tr>${headerRow}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function renderSegmentMixPanel(segmentMix: SegmentMix[]): string {
  const maxPct = 45; // scale factor

  const stateBlocks = segmentMix
    .map((sm) => {
      const bars = sm.segments
        .map((seg) => {
          const demandW = Math.round((seg.demandPct / maxPct) * 100);
          const invW = Math.round((seg.inventoryPct / maxPct) * 100);
          const mismatch = Math.abs(seg.demandPct - seg.inventoryPct) >= 8;
          const mismatchIcon = mismatch
            ? seg.demandPct > seg.inventoryPct
              ? `<span style="color:#f97316;font-size:10px;margin-left:4px" title="Demand exceeds inventory">&#9650;</span>`
              : `<span style="color:#a78bfa;font-size:10px;margin-left:4px" title="Inventory exceeds demand">&#9660;</span>`
            : "";

          return `
            <div style="margin-bottom:8px">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
                <span style="font-size:11px;color:#94a3b8;min-width:70px">${seg.name}${mismatchIcon}</span>
                <span style="font-size:10px;color:#64748b">${seg.demandPct}% / ${seg.inventoryPct}%</span>
              </div>
              <div style="display:flex;gap:2px;align-items:center">
                <div style="flex:1;display:flex;flex-direction:column;gap:2px">
                  <div style="height:10px;width:${demandW}%;background:#3b82f6;border-radius:3px;transition:width 0.3s" title="Demand: ${seg.demandPct}%"></div>
                  <div style="height:10px;width:${invW}%;background:#64748b;border-radius:3px;transition:width 0.3s" title="Inventory: ${seg.inventoryPct}%"></div>
                </div>
              </div>
            </div>`;
        })
        .join("");

      return `
        <div style="flex:1;min-width:180px;padding:12px;background:#0f172a;border-radius:8px;border:1px solid #334155">
          <div style="font-size:13px;font-weight:600;color:#e2e8f0;margin-bottom:10px">
            ${sm.state}
            <span style="color:${getDsColor(getMockRegionalData().states.find((s) => s.stateAbbr === sm.stateAbbr)?.dsRatio || 1)};font-size:11px;font-weight:400;margin-left:6px">
              ${sm.stateAbbr}
            </span>
          </div>
          ${bars}
        </div>`;
    })
    .join("");

  return `
    <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid #334155">
        <h2 style="font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:2px">Segment Mix Comparison</h2>
        <p style="font-size:12px;color:#64748b">
          <span style="display:inline-block;width:10px;height:10px;background:#3b82f6;border-radius:2px;margin-right:4px;vertical-align:middle"></span>Demand
          <span style="display:inline-block;width:10px;height:10px;background:#64748b;border-radius:2px;margin-left:12px;margin-right:4px;vertical-align:middle"></span>Inventory
          &middot; <span style="color:#f97316">&#9650;</span> Demand &gt; Inv &middot; <span style="color:#a78bfa">&#9660;</span> Inv &gt; Demand
        </p>
      </div>
      <div style="padding:16px;display:flex;gap:12px;flex-wrap:wrap;overflow-x:auto">
        ${stateBlocks}
      </div>
    </div>`;
}

function renderAllocationTable(allocations: AllocationRec[]): string {
  const sorted = [...allocations].sort((a, b) => b.revenueImpact - a.revenueImpact);
  const rows = sorted
    .map((a, i) => {
      const fromColor = getDsColor(a.dsFrom);
      const toColor = getDsColor(a.dsTo);
      return `<tr style="border-bottom:1px solid rgba(51,65,85,0.5);transition:background 0.15s" onmouseover="this.style.background='rgba(59,130,246,0.08)'" onmouseout="this.style.background='transparent'">
        <td style="padding:10px 12px;font-size:13px;text-align:center;color:#64748b;font-weight:500">${i + 1}</td>
        <td style="padding:10px 12px;font-size:13px;font-weight:500">
          <span style="color:${fromColor}">${a.fromState}</span>
        </td>
        <td style="padding:10px 12px;font-size:13px;color:#64748b;text-align:center">&#8594;</td>
        <td style="padding:10px 12px;font-size:13px;font-weight:500">
          <span style="color:${toColor}">${a.toState}</span>
        </td>
        <td style="padding:10px 12px;font-size:13px;color:#94a3b8">${a.segment}</td>
        <td style="padding:10px 12px;font-size:13px;text-align:right;color:${fromColor};font-variant-numeric:tabular-nums">${a.dsFrom.toFixed(2)}</td>
        <td style="padding:10px 12px;font-size:13px;text-align:right;color:${toColor};font-variant-numeric:tabular-nums">${a.dsTo.toFixed(2)}</td>
        <td style="padding:10px 12px;font-size:13px;text-align:right;font-weight:600;font-variant-numeric:tabular-nums">${a.unitsToShift.toLocaleString()}</td>
        <td style="padding:10px 12px;font-size:13px;text-align:right;font-weight:700;color:#22c55e;font-variant-numeric:tabular-nums">${fmtCurrency(a.revenueImpact)}</td>
      </tr>`;
    })
    .join("");

  const totalRevenue = sorted.reduce((s, a) => s + a.revenueImpact, 0);
  const totalUnits = sorted.reduce((s, a) => s + a.unitsToShift, 0);

  return `
    <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid #334155">
        <h2 style="font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:2px">Allocation Recommendations</h2>
        <p style="font-size:12px;color:#64748b">
          Top ${sorted.length} shifts &middot; ${totalUnits.toLocaleString()} total units &middot;
          <span style="color:#22c55e;font-weight:600">${fmtCurrency(totalRevenue)}</span> est. revenue impact
        </p>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr>
              <th style="padding:10px 12px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;text-align:center;border-bottom:1px solid #334155;background:#1e293b">#</th>
              <th style="padding:10px 12px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;text-align:left;border-bottom:1px solid #334155;background:#1e293b">From</th>
              <th style="padding:10px 12px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;text-align:center;border-bottom:1px solid #334155;background:#1e293b"></th>
              <th style="padding:10px 12px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;text-align:left;border-bottom:1px solid #334155;background:#1e293b">To</th>
              <th style="padding:10px 12px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;text-align:left;border-bottom:1px solid #334155;background:#1e293b">Segment</th>
              <th style="padding:10px 12px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;text-align:right;border-bottom:1px solid #334155;background:#1e293b">D/S (From)</th>
              <th style="padding:10px 12px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;text-align:right;border-bottom:1px solid #334155;background:#1e293b">D/S (To)</th>
              <th style="padding:10px 12px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;text-align:right;border-bottom:1px solid #334155;background:#1e293b">Units</th>
              <th style="padding:10px 12px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;text-align:right;border-bottom:1px solid #334155;background:#1e293b">Revenue Impact</th>
            </tr>
          </thead>
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

  // Apply URL params for deep-linking
  const urlParams = _getUrlParams();

  // State
  let selectedMake = urlParams.make || "Toyota";
  let selectedModel = urlParams.model || "RAV4";
  let selectedBody = "";
  let sortCol = "dsRatio";
  let sortAsc = false;

  // Show loading
  root.innerHTML = `
    <div style="text-align:center;padding:80px 20px">
      <div style="font-size:24px;font-weight:700;color:#e2e8f0;margin-bottom:12px">Regional Demand Allocator</div>
      <div style="color:#64748b">Analyzing regional demand patterns...</div>
    </div>`;

  // Fetch data (with mock fallback)
  let data: RegionalData;
  try {
    const result = await _callTool("regional-demand-allocator", { make: selectedMake, model: selectedModel });
    data = JSON.parse(
      typeof result === "string"
        ? result
        : (result as { content?: Array<{ text?: string }> })?.content?.[0]?.text ?? "{}"
    );
    if (!data.states || !data.segmentMix || !data.allocations) {
      data = getMockRegionalData();
    }
  } catch {
    data = getMockRegionalData();
  }

  // ── Render ──
  function renderUI() {
    const makeLabel = selectedMake;
    const modelLabel = selectedModel || "All Models";
    const bodyLabel = selectedBody || "All Types";

    root.innerHTML = `
      <div style="max-width:1440px;margin:0 auto">
        <!-- Header -->
        <div style="margin-bottom:20px;display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div>
            <h1 style="font-size:26px;font-weight:800;color:#e2e8f0;margin-bottom:4px">Regional Demand Allocator</h1>
            <p style="font-size:13px;color:#64748b">
              ${makeLabel} ${modelLabel !== "All Models" ? modelLabel : ""} demand/supply analysis across US states
              ${bodyLabel !== "All Types" ? " &middot; " + bodyLabel : ""}
            </p>
          </div>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            <div style="background:#1e293b;border-radius:8px;padding:10px 16px;border:1px solid #334155;text-align:center">
              <div style="font-size:20px;font-weight:700;color:#22c55e">${data.states.filter((s) => s.dsRatio >= 1.5).length}</div>
              <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Undersupplied</div>
            </div>
            <div style="background:#1e293b;border-radius:8px;padding:10px 16px;border:1px solid #334155;text-align:center">
              <div style="font-size:20px;font-weight:700;color:#eab308">${data.states.filter((s) => s.dsRatio >= 0.7 && s.dsRatio < 1.5).length}</div>
              <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Balanced</div>
            </div>
            <div style="background:#1e293b;border-radius:8px;padding:10px 16px;border:1px solid #334155;text-align:center">
              <div style="font-size:20px;font-weight:700;color:#ef4444">${data.states.filter((s) => s.dsRatio < 0.7).length}</div>
              <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Oversupplied</div>
            </div>
          </div>
        </div>

        <!-- Controls -->
        ${renderControls(selectedMake, selectedModel, selectedBody)}

        <!-- State Demand Table (60%) -->
        ${renderStateDemandTable(data.states, sortCol, sortAsc)}

        <!-- Bottom Row: Segment Mix + Allocation Recommendations -->
        <div style="display:flex;gap:20px;flex-wrap:wrap">
          <div style="flex:1;min-width:400px">
            ${renderSegmentMixPanel(data.segmentMix)}
          </div>
          <div style="flex:1;min-width:400px">
            ${renderAllocationTable(data.allocations)}
          </div>
        </div>
      </div>`;

    wireEvents();
  }

  function wireEvents() {
    // Settings bar (mode badge + gear icon)
    const headerEl = root.querySelector("h1")?.parentElement?.parentElement as HTMLElement | null;
    if (headerEl) _addSettingsBar(headerEl);

    // Make dropdown
    const makeSelect = document.getElementById("make-select") as HTMLSelectElement | null;
    makeSelect?.addEventListener("change", () => {
      selectedMake = makeSelect.value;
      selectedModel = "";
      renderUI();
    });

    // Model dropdown
    const modelSelect = document.getElementById("model-select") as HTMLSelectElement | null;
    modelSelect?.addEventListener("change", () => {
      selectedModel = modelSelect.value;
      renderUI();
    });

    // Body type chips
    document.querySelectorAll(".body-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const body = (chip as HTMLElement).dataset.body || "";
        selectedBody = selectedBody === body ? "" : body;
        renderUI();
      });
    });

    // Analyze button
    const analyzeBtn = document.getElementById("analyze-btn") as HTMLButtonElement | null;
    analyzeBtn?.addEventListener("click", async () => {
      analyzeBtn.textContent = "Analyzing...";
      analyzeBtn.style.opacity = "0.6";
      analyzeBtn.disabled = true;

      try {
        const result = await _callTool("regional-demand-allocator", {
            make: selectedMake,
            model: selectedModel || undefined,
            bodyType: selectedBody || undefined,
          });
        const parsed = JSON.parse(
          typeof result === "string"
            ? result
            : (result as { content?: Array<{ text?: string }> })?.content?.[0]?.text ?? "{}"
        );
        if (parsed.states && parsed.segmentMix && parsed.allocations) {
          data = parsed;
        }
      } catch {
        // Keep existing data on error
      }

      renderUI();
    });

    // Sortable table headers
    document.querySelectorAll("#demand-table th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const col = (th as HTMLElement).dataset.sort || "dsRatio";
        if (sortCol === col) {
          sortAsc = !sortAsc;
        } else {
          sortCol = col;
          sortAsc = col === "state";
        }
        renderUI();
      });
    });
  }

  renderUI();
}

main();
