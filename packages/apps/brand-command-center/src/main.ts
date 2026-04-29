import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
if (window.parent !== window) { try { _safeApp = new App({ name: "brand-command-center", version: "1.0.0" }); } catch {} }

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

// ── Direct MarketCheck API Client (browser → api.marketcheck.com) ──────
const _MC = "https://api.marketcheck.com";
async function _mcApi(path: string, params: Record<string, any> = {}) {
  const auth = _getAuth();
  if (!auth.value) return null;
  const prefix = path.startsWith("/api/") ? "" : "/v2";
  const url = new URL(_MC + prefix + path);
  if (auth.mode === "api_key") url.searchParams.set("api_key", auth.value);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = {};
  if (auth.mode === "oauth_token") headers["Authorization"] = "Bearer " + auth.value;
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error("MC API " + res.status);
  return res.json();
}
function _mcSold(p: Record<string, any>) { return _mcApi("/api/v1/sold-vehicles/summary", p); }
function _mcActive(p: Record<string, any>) { return _mcApi("/search/car/active", p); }

async function _fetchDirect(args: Record<string, any>) {
  // ranking_dimensions only supports: make, model, body_type, dealership_group_name
  const [brandVolume, modelVolume] = await Promise.all([
    _mcSold({ ranking_dimensions: "make", ranking_measure: "sold_count", top_n: 20, inventory_type: "Used" }),
    _mcSold({ ranking_dimensions: "make,model", ranking_measure: "sold_count", make: args.make, top_n: 10, inventory_type: "Used" }),
  ]);
  return { brandVolume, modelVolume };
}

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

if (_safeApp && window.parent !== window) (_safeApp as any)?.connect?.();

// ─── Types ──────────────────────────────────────────────────────────────────

interface BrandData {
  name: string;
  soldVolume: number;
  sharePercent: number;
  bpsChange: number;
  msrpParityIndex: number;
  volumeTrend: number;
  avgPrice: number;
  avgDOM: number;
  isMyBrand: boolean;
}

interface ModelData {
  model: string;
  soldCount: number;
  sharePercent: number;
  asp: number;
  dom: number;
  momChange: number;
  depreciationRate: number;
  health: "HEALTHY" | "DECLINING" | "MIXED";
}

interface StateData {
  state: string;
  stateAbbr: string;
  volume: number;
  avgPrice: number;
  sharePercent: number;
}

interface ConquestEntry {
  brand: string;
  bps: number;
}

interface ConquestData {
  gainingFrom: ConquestEntry[];
  losingTo: ConquestEntry[];
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

let ALL_BRANDS: BrandData[] = [
  { name: "Toyota", soldVolume: 48200, sharePercent: 14.8, bpsChange: 32, msrpParityIndex: 102.3, volumeTrend: 4.2, avgPrice: 38500, avgDOM: 22, isMyBrand: true },
  { name: "Lexus", soldVolume: 14800, sharePercent: 4.5, bpsChange: 18, msrpParityIndex: 105.1, volumeTrend: 2.8, avgPrice: 52400, avgDOM: 28, isMyBrand: true },
  { name: "Ford", soldVolume: 38600, sharePercent: 11.9, bpsChange: -15, msrpParityIndex: 96.2, volumeTrend: 1.5, avgPrice: 42100, avgDOM: 35, isMyBrand: false },
  { name: "Chevrolet", soldVolume: 35400, sharePercent: 10.9, bpsChange: -28, msrpParityIndex: 94.8, volumeTrend: -2.1, avgPrice: 40300, avgDOM: 38, isMyBrand: false },
  { name: "Honda", soldVolume: 31200, sharePercent: 9.6, bpsChange: 22, msrpParityIndex: 101.5, volumeTrend: 3.1, avgPrice: 35200, avgDOM: 20, isMyBrand: false },
  { name: "Hyundai", soldVolume: 22800, sharePercent: 7.0, bpsChange: 45, msrpParityIndex: 97.3, volumeTrend: 6.8, avgPrice: 32400, avgDOM: 25, isMyBrand: false },
  { name: "Kia", soldVolume: 19600, sharePercent: 6.0, bpsChange: 38, msrpParityIndex: 96.1, volumeTrend: 5.2, avgPrice: 31100, avgDOM: 27, isMyBrand: false },
  { name: "Nissan", soldVolume: 17400, sharePercent: 5.3, bpsChange: -42, msrpParityIndex: 91.5, volumeTrend: -4.3, avgPrice: 33800, avgDOM: 45, isMyBrand: false },
  { name: "Jeep", soldVolume: 15200, sharePercent: 4.7, bpsChange: -35, msrpParityIndex: 93.2, volumeTrend: -3.8, avgPrice: 44200, avgDOM: 52, isMyBrand: false },
  { name: "RAM", soldVolume: 14100, sharePercent: 4.3, bpsChange: -10, msrpParityIndex: 95.5, volumeTrend: -1.2, avgPrice: 48900, avgDOM: 40, isMyBrand: false },
  { name: "GMC", soldVolume: 12800, sharePercent: 3.9, bpsChange: 5, msrpParityIndex: 98.2, volumeTrend: 0.8, avgPrice: 52100, avgDOM: 33, isMyBrand: false },
  { name: "Subaru", soldVolume: 11500, sharePercent: 3.5, bpsChange: 12, msrpParityIndex: 100.8, volumeTrend: 2.1, avgPrice: 34600, avgDOM: 24, isMyBrand: false },
  { name: "BMW", soldVolume: 10200, sharePercent: 3.1, bpsChange: -8, msrpParityIndex: 107.5, volumeTrend: -0.5, avgPrice: 58200, avgDOM: 30, isMyBrand: false },
  { name: "Mercedes", soldVolume: 9800, sharePercent: 3.0, bpsChange: -12, msrpParityIndex: 108.2, volumeTrend: -1.8, avgPrice: 61500, avgDOM: 32, isMyBrand: false },
  { name: "Volkswagen", soldVolume: 8600, sharePercent: 2.6, bpsChange: 15, msrpParityIndex: 98.6, volumeTrend: 3.5, avgPrice: 36800, avgDOM: 29, isMyBrand: false },
  { name: "Mazda", soldVolume: 7400, sharePercent: 2.3, bpsChange: 8, msrpParityIndex: 101.2, volumeTrend: 1.9, avgPrice: 33200, avgDOM: 23, isMyBrand: false },
  { name: "Tesla", soldVolume: 6900, sharePercent: 2.1, bpsChange: -55, msrpParityIndex: 88.5, volumeTrend: -6.2, avgPrice: 44800, avgDOM: 48, isMyBrand: false },
];

const MODEL_DATA: Record<string, ModelData[]> = {
  Toyota: [
    { model: "RAV4", soldCount: 12400, sharePercent: 25.7, asp: 36200, dom: 18, momChange: 3.2, depreciationRate: 8.5, health: "HEALTHY" },
    { model: "Camry", soldCount: 9800, sharePercent: 20.3, asp: 32400, dom: 20, momChange: 1.1, depreciationRate: 9.2, health: "HEALTHY" },
    { model: "Highlander", soldCount: 7200, sharePercent: 14.9, asp: 44500, dom: 24, momChange: -0.8, depreciationRate: 10.1, health: "MIXED" },
    { model: "Tacoma", soldCount: 6500, sharePercent: 13.5, asp: 42800, dom: 15, momChange: 5.4, depreciationRate: 6.2, health: "HEALTHY" },
    { model: "Corolla", soldCount: 5800, sharePercent: 12.0, asp: 25600, dom: 22, momChange: -2.1, depreciationRate: 11.5, health: "MIXED" },
    { model: "4Runner", soldCount: 3700, sharePercent: 7.7, asp: 48200, dom: 12, momChange: 8.2, depreciationRate: 5.8, health: "HEALTHY" },
    { model: "Tundra", soldCount: 2800, sharePercent: 5.8, asp: 52100, dom: 32, momChange: -3.5, depreciationRate: 12.8, health: "DECLINING" },
  ],
  Lexus: [
    { model: "RX", soldCount: 5200, sharePercent: 35.1, asp: 52800, dom: 25, momChange: 2.8, depreciationRate: 9.8, health: "HEALTHY" },
    { model: "NX", soldCount: 3400, sharePercent: 23.0, asp: 45200, dom: 22, momChange: 4.1, depreciationRate: 10.5, health: "HEALTHY" },
    { model: "ES", soldCount: 2100, sharePercent: 14.2, asp: 46500, dom: 30, momChange: -1.2, depreciationRate: 12.1, health: "MIXED" },
    { model: "IS", soldCount: 1800, sharePercent: 12.2, asp: 42800, dom: 28, momChange: -0.5, depreciationRate: 11.2, health: "MIXED" },
    { model: "GX", soldCount: 1500, sharePercent: 10.1, asp: 68200, dom: 18, momChange: 6.5, depreciationRate: 7.2, health: "HEALTHY" },
    { model: "TX", soldCount: 800, sharePercent: 5.4, asp: 72500, dom: 35, momChange: -4.2, depreciationRate: 14.5, health: "DECLINING" },
  ],
  Ford: [
    { model: "F-150", soldCount: 14200, sharePercent: 36.8, asp: 52400, dom: 30, momChange: -1.5, depreciationRate: 11.2, health: "MIXED" },
    { model: "Explorer", soldCount: 6800, sharePercent: 17.6, asp: 42800, dom: 35, momChange: -2.8, depreciationRate: 13.5, health: "DECLINING" },
    { model: "Bronco", soldCount: 5200, sharePercent: 13.5, asp: 45200, dom: 28, momChange: 1.2, depreciationRate: 8.8, health: "HEALTHY" },
    { model: "Escape", soldCount: 4500, sharePercent: 11.7, asp: 33600, dom: 38, momChange: -3.2, depreciationRate: 14.2, health: "DECLINING" },
    { model: "Maverick", soldCount: 3800, sharePercent: 9.8, asp: 32100, dom: 22, momChange: 4.5, depreciationRate: 7.5, health: "HEALTHY" },
    { model: "Mustang", soldCount: 2400, sharePercent: 6.2, asp: 42500, dom: 42, momChange: -5.1, depreciationRate: 15.8, health: "DECLINING" },
    { model: "Edge", soldCount: 1700, sharePercent: 4.4, asp: 38200, dom: 48, momChange: -6.2, depreciationRate: 16.5, health: "DECLINING" },
  ],
  Honda: [
    { model: "CR-V", soldCount: 10500, sharePercent: 33.7, asp: 36800, dom: 16, momChange: 4.2, depreciationRate: 8.2, health: "HEALTHY" },
    { model: "Civic", soldCount: 7200, sharePercent: 23.1, asp: 28500, dom: 18, momChange: 2.8, depreciationRate: 9.5, health: "HEALTHY" },
    { model: "Accord", soldCount: 5400, sharePercent: 17.3, asp: 33200, dom: 20, momChange: 1.5, depreciationRate: 10.2, health: "HEALTHY" },
    { model: "Pilot", soldCount: 4200, sharePercent: 13.5, asp: 44500, dom: 24, momChange: -0.5, depreciationRate: 11.8, health: "MIXED" },
    { model: "HR-V", soldCount: 2500, sharePercent: 8.0, asp: 28200, dom: 22, momChange: 3.1, depreciationRate: 10.8, health: "HEALTHY" },
    { model: "Ridgeline", soldCount: 1400, sharePercent: 4.5, asp: 42100, dom: 32, momChange: -2.2, depreciationRate: 13.5, health: "MIXED" },
  ],
};

// Generate generic model data for brands without explicit data
function generateModelData(brand: BrandData): ModelData[] {
  const models = ["Model A", "Model B", "Model C", "Model D", "Model E"];
  const total = brand.soldVolume;
  const shares = [0.32, 0.25, 0.20, 0.13, 0.10];
  return models.map((m, i) => ({
    model: m,
    soldCount: Math.round(total * shares[i]),
    sharePercent: +(shares[i] * 100).toFixed(1),
    asp: brand.avgPrice + (Math.random() - 0.5) * 8000,
    dom: brand.avgDOM + Math.round((Math.random() - 0.5) * 10),
    momChange: +((Math.random() - 0.4) * 8).toFixed(1),
    depreciationRate: +(8 + Math.random() * 8).toFixed(1),
    health: (["HEALTHY", "MIXED", "DECLINING"] as const)[Math.min(2, Math.floor(Math.random() * 2.5))],
  }));
}

const STATE_DATA: Record<string, StateData[]> = {};
const US_STATES: { name: string; abbr: string }[] = [
  { name: "California", abbr: "CA" }, { name: "Texas", abbr: "TX" }, { name: "Florida", abbr: "FL" },
  { name: "New York", abbr: "NY" }, { name: "Illinois", abbr: "IL" }, { name: "Pennsylvania", abbr: "PA" },
  { name: "Ohio", abbr: "OH" }, { name: "Georgia", abbr: "GA" }, { name: "North Carolina", abbr: "NC" },
  { name: "Michigan", abbr: "MI" }, { name: "New Jersey", abbr: "NJ" }, { name: "Virginia", abbr: "VA" },
  { name: "Washington", abbr: "WA" }, { name: "Arizona", abbr: "AZ" }, { name: "Massachusetts", abbr: "MA" },
];

function getStateData(brand: string): StateData[] {
  if (STATE_DATA[brand]) return STATE_DATA[brand];
  const bd = ALL_BRANDS.find(b => b.name === brand);
  const totalVol = bd ? bd.soldVolume : 10000;
  const shares = [0.14, 0.12, 0.10, 0.09, 0.08, 0.07, 0.06, 0.06, 0.05, 0.05, 0.04, 0.04, 0.04, 0.03, 0.03];
  const result = US_STATES.map((s, i) => ({
    state: s.name,
    stateAbbr: s.abbr,
    volume: Math.round(totalVol * shares[i] * (0.9 + Math.random() * 0.2)),
    avgPrice: (bd?.avgPrice ?? 35000) + Math.round((Math.random() - 0.5) * 6000),
    sharePercent: +(shares[i] * 100 * (0.85 + Math.random() * 0.3)).toFixed(1),
  }));
  STATE_DATA[brand] = result;
  return result;
}

const CONQUEST_DATA: Record<string, ConquestData> = {
  Toyota: {
    gainingFrom: [
      { brand: "Nissan", bps: 18 }, { brand: "Chevrolet", bps: 12 }, { brand: "Ford", bps: 8 },
      { brand: "Jeep", bps: 6 }, { brand: "Volkswagen", bps: 4 },
    ],
    losingTo: [
      { brand: "Hyundai", bps: 10 }, { brand: "Kia", bps: 6 },
    ],
  },
  Lexus: {
    gainingFrom: [
      { brand: "BMW", bps: 8 }, { brand: "Mercedes", bps: 6 }, { brand: "Acura", bps: 5 },
    ],
    losingTo: [
      { brand: "Genesis", bps: 4 }, { brand: "Tesla", bps: 3 },
    ],
  },
};

function getConquestData(brand: string): ConquestData {
  if (CONQUEST_DATA[brand]) return CONQUEST_DATA[brand];
  const bd = ALL_BRANDS.find(b => b.name === brand)!;
  if (bd.bpsChange > 0) {
    return {
      gainingFrom: [
        { brand: "Nissan", bps: Math.round(Math.abs(bd.bpsChange) * 0.4) },
        { brand: "Chevrolet", bps: Math.round(Math.abs(bd.bpsChange) * 0.3) },
        { brand: "Jeep", bps: Math.round(Math.abs(bd.bpsChange) * 0.2) },
      ],
      losingTo: [
        { brand: "Hyundai", bps: Math.round(Math.abs(bd.bpsChange) * 0.1) },
      ],
    };
  }
  return {
    gainingFrom: [
      { brand: "Subaru", bps: Math.round(Math.abs(bd.bpsChange) * 0.15) },
    ],
    losingTo: [
      { brand: "Toyota", bps: Math.round(Math.abs(bd.bpsChange) * 0.35) },
      { brand: "Honda", bps: Math.round(Math.abs(bd.bpsChange) * 0.3) },
      { brand: "Hyundai", bps: Math.round(Math.abs(bd.bpsChange) * 0.25) },
    ],
  };
}

// ─── State ──────────────────────────────────────────────────────────────────

let state = {
  brandFilter: "my" as "my" | "all",
  selectedState: "All States",
  selectedBrand: "Toyota",
};

// ─── Render ─────────────────────────────────────────────────────────────────

function render(): void {
  document.body.innerHTML = "";
  const root = document.createElement("div");
  root.id = "app";
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
    (_db.querySelector("#_banner_save") as HTMLButtonElement)?.addEventListener("click", () => {
      const k = (_db.querySelector("#_banner_key") as HTMLInputElement)?.value?.trim();
      if (!k) return;
      localStorage.setItem("mc_api_key", k);
      _db.style.background = "linear-gradient(135deg,#05966922,#10b98111)";
      _db.style.borderColor = "#10b98144";
      _db.innerHTML = '<div style="font-size:13px;font-weight:700;color:#10b981;">&#10003; API key saved — reloading with live data...</div>';
      setTimeout(() => location.reload(), 800);
    });
    (_db.querySelector("#_banner_key") as HTMLInputElement)?.addEventListener("keydown", (e) => { if (e.key === "Enter") (_db.querySelector("#_banner_save") as HTMLButtonElement)?.click(); });
  }

  root.innerHTML = `
    <style>
      #app {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #0f172a;
        color: #e2e8f0;
        min-height: 100vh;
        padding: 16px;
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
        flex-wrap: wrap;
        gap: 12px;
      }
      .header h1 {
        font-size: 20px;
        font-weight: 700;
        color: #f1f5f9;
        letter-spacing: -0.3px;
      }
      .controls {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .toggle-group {
        display: flex;
        border-radius: 6px;
        overflow: hidden;
        border: 1px solid #334155;
      }
      .toggle-btn {
        padding: 6px 16px;
        font-size: 12px;
        font-weight: 600;
        border: none;
        cursor: pointer;
        background: #1e293b;
        color: #94a3b8;
        transition: all 0.15s;
      }
      .toggle-btn.active {
        background: #3b82f6;
        color: #fff;
      }
      .toggle-btn:hover:not(.active) {
        background: #334155;
      }
      select {
        padding: 6px 12px;
        border-radius: 6px;
        border: 1px solid #334155;
        background: #1e293b;
        color: #e2e8f0;
        font-size: 12px;
        cursor: pointer;
      }
      select:focus { outline: none; border-color: #3b82f6; }

      .grid-top {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin-bottom: 16px;
      }
      .grid-bottom {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }
      .panel {
        background: #1e293b;
        border-radius: 10px;
        border: 1px solid #334155;
        padding: 16px;
        overflow: hidden;
      }
      .panel-title {
        font-size: 13px;
        font-weight: 700;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .panel-title .icon { font-size: 15px; }
      .full-width { grid-column: 1 / -1; }
      canvas { display: block; }

      /* Table styles */
      .data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      .data-table th {
        text-align: left;
        padding: 8px 10px;
        color: #64748b;
        font-weight: 600;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        border-bottom: 1px solid #334155;
        white-space: nowrap;
      }
      .data-table td {
        padding: 7px 10px;
        border-bottom: 1px solid #1e293b;
        white-space: nowrap;
      }
      .data-table tr:hover { background: rgba(59,130,246,0.06); }
      .data-table tr.my-brand { background: rgba(59,130,246,0.08); }
      .data-table tr.selected { background: rgba(59,130,246,0.15); }

      .badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.3px;
      }
      .badge-healthy { background: rgba(34,197,94,0.15); color: #4ade80; }
      .badge-declining { background: rgba(239,68,68,0.15); color: #f87171; }
      .badge-mixed { background: rgba(251,191,36,0.15); color: #fbbf24; }

      .gain { color: #4ade80; }
      .loss { color: #f87171; }
      .star { color: #fbbf24; font-size: 13px; }

      .brand-row { cursor: pointer; }

      /* Conquest section */
      .conquest-section {
        margin-bottom: 16px;
      }
      .conquest-label {
        font-size: 12px;
        font-weight: 700;
        color: #94a3b8;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .conquest-flow {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .flow-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 10px;
        border-radius: 6px;
        font-size: 12px;
      }
      .flow-gain {
        background: rgba(34,197,94,0.08);
        border-left: 3px solid #4ade80;
      }
      .flow-loss {
        background: rgba(239,68,68,0.08);
        border-left: 3px solid #f87171;
      }
      .flow-arrow {
        font-size: 14px;
        flex-shrink: 0;
      }
      .flow-brand {
        font-weight: 600;
        color: #e2e8f0;
        min-width: 90px;
      }
      .flow-bps {
        font-weight: 700;
        margin-left: auto;
      }

      /* Heatmap */
      .heatmap-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      .heatmap-table th {
        text-align: left;
        padding: 7px 10px;
        color: #64748b;
        font-weight: 600;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        border-bottom: 1px solid #334155;
      }
      .heatmap-table td {
        padding: 6px 10px;
        border-bottom: 1px solid rgba(51,65,85,0.4);
      }

      @media (max-width: 900px) {
        .grid-top, .grid-bottom { grid-template-columns: 1fr; }
      }
    </style>

    <div class="header">
      <h1>Brand Command Center</h1>
      <div class="controls">
        <div class="toggle-group">
          <button class="toggle-btn ${state.brandFilter === 'my' ? 'active' : ''}" data-filter="my">My Brands</button>
          <button class="toggle-btn ${state.brandFilter === 'all' ? 'active' : ''}" data-filter="all">All Brands</button>
        </div>
        <select id="state-select">
          <option value="All States">All States</option>
          ${US_STATES.map(s => `<option value="${s.name}" ${state.selectedState === s.name ? 'selected' : ''}>${s.name}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="grid-top">
      <div class="panel" id="market-share-panel">
        <div class="panel-title"><span class="icon">&#9776;</span> Market Share - Top 15 Brands by Volume</div>
        <canvas id="market-share-canvas" width="600" height="420"></canvas>
      </div>
      <div class="panel" id="scatter-panel">
        <div class="panel-title"><span class="icon">&#9673;</span> Pricing Power vs Volume Trend</div>
        <canvas id="scatter-canvas" width="600" height="420"></canvas>
      </div>
    </div>

    <div class="panel full-width" style="margin-bottom:16px;" id="model-panel">
      <div class="panel-title">
        <span class="icon">&#9638;</span>
        Model Drill-Down:
        <span style="color:#3b82f6;font-weight:700;">${state.selectedBrand}</span>
        ${ALL_BRANDS.find(b => b.name === state.selectedBrand)?.isMyBrand ? '<span class="star">&#9733;</span>' : ''}
      </div>
      <div style="overflow-x:auto;" id="model-table-container"></div>
    </div>

    <div class="grid-bottom">
      <div class="panel" id="heatmap-panel">
        <div class="panel-title"><span class="icon">&#9635;</span> Regional Heatmap: ${state.selectedBrand}</div>
        <div id="heatmap-container"></div>
      </div>
      <div class="panel" id="conquest-panel">
        <div class="panel-title"><span class="icon">&#8644;</span> Conquest Analysis: ${state.selectedBrand}</div>
        <div id="conquest-container"></div>
      </div>
    </div>
  `;

  // Settings bar (mode badge + gear icon)
  _addSettingsBar(root.querySelector('.header') as HTMLElement);

  // Bind events
  root.querySelectorAll<HTMLButtonElement>('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.brandFilter = btn.dataset.filter as "my" | "all";
      render();
    });
  });

  root.querySelector<HTMLSelectElement>('#state-select')!.addEventListener('change', (e) => {
    state.selectedState = (e.target as HTMLSelectElement).value;
    render();
  });

  drawMarketShareChart();
  drawScatterPlot();
  renderModelTable();
  renderHeatmap();
  renderConquest();
}

// ─── Market Share Bar Chart (Canvas 2D) ─────────────────────────────────────

function drawMarketShareChart(): void {
  const canvas = document.getElementById('market-share-canvas') as HTMLCanvasElement;
  const container = canvas.parentElement!;
  const dpr = window.devicePixelRatio || 1;
  const w = container.clientWidth - 32;
  const h = 420;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const brands = [...ALL_BRANDS]
    .sort((a, b) => b.soldVolume - a.soldVolume)
    .slice(0, 15);

  const maxVol = brands[0].soldVolume;
  const barH = 22;
  const gap = 5;
  const leftMargin = 110;
  const rightMargin = 180;
  const chartW = w - leftMargin - rightMargin;
  const topPad = 8;

  brands.forEach((b, i) => {
    const y = topPad + i * (barH + gap);
    const barW = (b.soldVolume / maxVol) * chartW;

    // Bar
    const isMyBrand = b.isMyBrand;
    if (isMyBrand) {
      const grad = ctx.createLinearGradient(leftMargin, 0, leftMargin + barW, 0);
      grad.addColorStop(0, '#2563eb');
      grad.addColorStop(1, '#3b82f6');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = '#334155';
    }

    ctx.beginPath();
    ctx.roundRect(leftMargin, y, barW, barH, 3);
    ctx.fill();

    // Highlight border for my brands
    if (isMyBrand) {
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(leftMargin, y, barW, barH, 3);
      ctx.stroke();
    }

    // Brand name on left
    ctx.fillStyle = isMyBrand ? '#f1f5f9' : '#94a3b8';
    ctx.font = `${isMyBrand ? '600' : '400'} 11px -apple-system, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const label = isMyBrand ? `\u2605 ${b.name}` : b.name;
    ctx.fillText(label, leftMargin - 8, y + barH / 2);

    // Right side: share% + bps change
    ctx.textAlign = 'left';
    const rightX = leftMargin + barW + 8;

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 11px -apple-system, sans-serif';
    ctx.fillText(`${b.sharePercent.toFixed(1)}%`, rightX, y + barH / 2);

    // Volume number
    ctx.fillStyle = '#64748b';
    ctx.font = '400 10px -apple-system, sans-serif';
    ctx.fillText(`${(b.soldVolume / 1000).toFixed(1)}K`, rightX + 48, y + barH / 2);

    // BPS change with arrow
    const bpsX = rightX + 95;
    if (b.bpsChange > 0) {
      ctx.fillStyle = '#4ade80';
      ctx.font = '600 11px -apple-system, sans-serif';
      ctx.fillText(`\u25B2 +${b.bpsChange} bps`, bpsX, y + barH / 2);
    } else if (b.bpsChange < 0) {
      ctx.fillStyle = '#f87171';
      ctx.font = '600 11px -apple-system, sans-serif';
      ctx.fillText(`\u25BC ${b.bpsChange} bps`, bpsX, y + barH / 2);
    } else {
      ctx.fillStyle = '#64748b';
      ctx.font = '600 11px -apple-system, sans-serif';
      ctx.fillText(`\u2014 0 bps`, bpsX, y + barH / 2);
    }
  });

  // Click handler for brand selection
  canvas.onclick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top - 8;
    const idx = Math.floor(y / (barH + gap));
    if (idx >= 0 && idx < brands.length) {
      state.selectedBrand = brands[idx].name;
      render();
    }
  };
  canvas.style.cursor = 'pointer';
}

// ─── Pricing Power Scatter Plot (Canvas 2D) ─────────────────────────────────

function drawScatterPlot(): void {
  const canvas = document.getElementById('scatter-canvas') as HTMLCanvasElement;
  const container = canvas.parentElement!;
  const dpr = window.devicePixelRatio || 1;
  const w = container.clientWidth - 32;
  const h = 420;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const pad = { top: 35, right: 25, bottom: 40, left: 50 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  // Axes ranges
  const xMin = 85, xMax = 115; // MSRP parity index
  const yMin = -8, yMax = 8;   // volume trend

  const toX = (v: number) => pad.left + ((v - xMin) / (xMax - xMin)) * plotW;
  const toY = (v: number) => pad.top + ((yMax - v) / (yMax - yMin)) * plotH;

  const centerX = toX(100);
  const centerY = toY(0);

  // Quadrant backgrounds
  ctx.globalAlpha = 0.04;
  // Top-right: Pricing Power (green)
  ctx.fillStyle = '#4ade80';
  ctx.fillRect(centerX, pad.top, pad.left + plotW - centerX + pad.right, centerY - pad.top);
  // Top-left: Momentum (blue)
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(pad.left, pad.top, centerX - pad.left, centerY - pad.top);
  // Bottom-right: Premium Eroding (yellow)
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(centerX, centerY, pad.left + plotW - centerX + pad.right, pad.top + plotH - centerY);
  // Bottom-left: Distressed (red)
  ctx.fillStyle = '#f87171';
  ctx.fillRect(pad.left, centerY, centerX - pad.left, pad.top + plotH - centerY);
  ctx.globalAlpha = 1;

  // Grid lines
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 0.5;
  for (let x = 85; x <= 115; x += 5) {
    ctx.beginPath();
    ctx.moveTo(toX(x), pad.top);
    ctx.lineTo(toX(x), pad.top + plotH);
    ctx.stroke();
  }
  for (let y = -8; y <= 8; y += 2) {
    ctx.beginPath();
    ctx.moveTo(pad.left, toY(y));
    ctx.lineTo(pad.left + plotW, toY(y));
    ctx.stroke();
  }

  // Center lines (thicker)
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(centerX, pad.top);
  ctx.lineTo(centerX, pad.top + plotH);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(pad.left, centerY);
  ctx.lineTo(pad.left + plotW, centerY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Quadrant labels
  ctx.font = '600 10px -apple-system, sans-serif';
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#4ade80';
  ctx.textAlign = 'right';
  ctx.fillText('PRICING POWER', pad.left + plotW - 6, pad.top + 16);
  ctx.fillStyle = '#3b82f6';
  ctx.textAlign = 'left';
  ctx.fillText('MOMENTUM', pad.left + 6, pad.top + 16);
  ctx.fillStyle = '#fbbf24';
  ctx.textAlign = 'right';
  ctx.fillText('PREMIUM ERODING', pad.left + plotW - 6, pad.top + plotH - 6);
  ctx.fillStyle = '#f87171';
  ctx.textAlign = 'left';
  ctx.fillText('DISTRESSED', pad.left + 6, pad.top + plotH - 6);
  ctx.globalAlpha = 1;

  // Axis labels
  ctx.fillStyle = '#64748b';
  ctx.font = '500 10px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MSRP Parity Index (Below \u2190 100 \u2192 Above)', w / 2, h - 5);
  ctx.save();
  ctx.translate(12, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Volume Trend % (Declining \u2190 0 \u2192 Growing)', 0, 0);
  ctx.restore();

  // Tick labels
  ctx.fillStyle = '#64748b';
  ctx.font = '400 9px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  for (let x = 85; x <= 115; x += 5) {
    ctx.fillText(String(x), toX(x), pad.top + plotH + 16);
  }
  ctx.textAlign = 'right';
  for (let y = -8; y <= 8; y += 2) {
    ctx.fillText(String(y), pad.left - 6, toY(y) + 3);
  }

  // Plot brands
  const maxVol = Math.max(...ALL_BRANDS.map(b => b.soldVolume));

  ALL_BRANDS.forEach(b => {
    const cx = toX(b.msrpParityIndex);
    const cy = toY(b.volumeTrend);
    const r = 6 + (b.soldVolume / maxVol) * 20;

    // Dot
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (b.isMyBrand) {
      ctx.fillStyle = 'rgba(59,130,246,0.5)';
      ctx.fill();
      // Highlight ring
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // Outer glow ring
      ctx.beginPath();
      ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(96,165,250,0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(148,163,184,0.3)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(148,163,184,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Label
    ctx.fillStyle = b.isMyBrand ? '#f1f5f9' : '#94a3b8';
    ctx.font = `${b.isMyBrand ? '600' : '400'} ${b.isMyBrand ? 11 : 9}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(b.name, cx, cy - r - 5);
  });

  // Click handler
  canvas.onclick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    for (const b of ALL_BRANDS) {
      const cx = toX(b.msrpParityIndex);
      const cy = toY(b.volumeTrend);
      const r = 6 + (b.soldVolume / maxVol) * 20;
      const dist = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);
      if (dist <= r + 4) {
        state.selectedBrand = b.name;
        render();
        return;
      }
    }
  };
  canvas.style.cursor = 'pointer';
}

// ─── Model Drill-Down Table ─────────────────────────────────────────────────

function renderModelTable(): void {
  const container = document.getElementById('model-table-container')!;
  const brand = ALL_BRANDS.find(b => b.name === state.selectedBrand)!;
  const models = MODEL_DATA[state.selectedBrand] ?? generateModelData(brand);

  const rows = models.map(m => {
    const healthClass = m.health === 'HEALTHY' ? 'badge-healthy' : m.health === 'DECLINING' ? 'badge-declining' : 'badge-mixed';
    const momClass = m.momChange >= 0 ? 'gain' : 'loss';
    const momArrow = m.momChange >= 0 ? '\u25B2' : '\u25BC';
    return `
      <tr>
        <td style="font-weight:600;color:#e2e8f0;">${m.model}</td>
        <td>${m.soldCount.toLocaleString()}</td>
        <td>${m.sharePercent.toFixed(1)}%</td>
        <td>$${m.asp.toLocaleString()}</td>
        <td>${m.dom}d</td>
        <td class="${momClass}">${momArrow} ${m.momChange > 0 ? '+' : ''}${m.momChange.toFixed(1)}%</td>
        <td>${m.depreciationRate.toFixed(1)}%</td>
        <td><span class="badge ${healthClass}">${m.health}</span></td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Model</th>
          <th>Sold Count</th>
          <th>Share%</th>
          <th>ASP</th>
          <th>DOM</th>
          <th>MoM Change%</th>
          <th>Depreciation</th>
          <th>Health</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ─── Regional Heatmap ───────────────────────────────────────────────────────

function renderHeatmap(): void {
  const container = document.getElementById('heatmap-container')!;
  const stateData = getStateData(state.selectedBrand);
  const maxVol = Math.max(...stateData.map(s => s.volume));

  const rows = stateData.map(s => {
    const intensity = s.volume / maxVol;
    const r = Math.round(15 + intensity * 44);
    const g = Math.round(23 + intensity * 107);
    const b = Math.round(42 + intensity * 204);
    const bgColor = `rgba(${r}, ${g}, ${b}, ${0.2 + intensity * 0.6})`;
    return `
      <tr>
        <td style="font-weight:600;color:#e2e8f0;">${s.stateAbbr}</td>
        <td style="background:${bgColor};font-weight:600;">${s.volume.toLocaleString()}</td>
        <td>$${s.avgPrice.toLocaleString()}</td>
        <td>${s.sharePercent.toFixed(1)}%</td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table class="heatmap-table">
      <thead>
        <tr>
          <th>State</th>
          <th>Volume</th>
          <th>Avg Price</th>
          <th>Share%</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ─── Conquest Analysis ──────────────────────────────────────────────────────

function renderConquest(): void {
  const container = document.getElementById('conquest-container')!;
  const conquest = getConquestData(state.selectedBrand);

  const gainRows = conquest.gainingFrom.map(c => `
    <div class="flow-item flow-gain">
      <span class="flow-arrow gain">\u2190</span>
      <span class="flow-brand">${c.brand}</span>
      <span style="color:#64748b;font-size:11px;">share flowing in</span>
      <span class="flow-bps gain">+${c.bps} bps</span>
    </div>
  `).join('');

  const lossRows = conquest.losingTo.map(c => `
    <div class="flow-item flow-loss">
      <span class="flow-arrow loss">\u2192</span>
      <span class="flow-brand">${c.brand}</span>
      <span style="color:#64748b;font-size:11px;">share flowing out</span>
      <span class="flow-bps loss">-${c.bps} bps</span>
    </div>
  `).join('');

  const totalGain = conquest.gainingFrom.reduce((s, c) => s + c.bps, 0);
  const totalLoss = conquest.losingTo.reduce((s, c) => s + c.bps, 0);
  const net = totalGain - totalLoss;
  const netClass = net >= 0 ? 'gain' : 'loss';
  const netSign = net >= 0 ? '+' : '';

  container.innerHTML = `
    <div class="conquest-section">
      <div class="conquest-label"><span class="gain">\u25B2</span> Gaining From</div>
      <div class="conquest-flow">${gainRows}</div>
    </div>
    <div class="conquest-section">
      <div class="conquest-label"><span class="loss">\u25BC</span> Losing To</div>
      <div class="conquest-flow">${lossRows}</div>
    </div>
    <div style="margin-top:12px;padding:10px 14px;background:rgba(51,65,85,0.3);border-radius:8px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:12px;font-weight:600;color:#94a3b8;">Net Conquest</span>
      <span class="${netClass}" style="font-size:16px;font-weight:700;">${netSign}${net} bps</span>
    </div>
  `;
}

// ─── Init ───────────────────────────────────────────────────────────────────

async function main() {
  // Apply URL params for deep-linking
  const urlParams = _getUrlParams();
  if (urlParams.make) {
    const found = ALL_BRANDS.find(b => b.name.toLowerCase() === urlParams.make.toLowerCase());
    if (found) state.selectedBrand = found.name;
  }
  if (urlParams.state) state.selectedState = urlParams.state;

  // In live mode, try fetching real data from Enterprise Sold Summary API
  if (_detectAppMode() === "live") {
    try {
      const data = await _fetchDirect({ make: state.selectedBrand });
      if (data?.brandVolume?.data?.length) {
        const totalVol = data.brandVolume.data.reduce((s: number, d: any) => s + (d.sold_count ?? 0), 0);
        const myMake = state.selectedBrand.toLowerCase();
        ALL_BRANDS = data.brandVolume.data.map((d: any) => {
          const vol = d.sold_count ?? 0;
          const share = totalVol > 0 ? (vol / totalVol) * 100 : 0;
          return {
            name: d.make ?? "Unknown",
            soldVolume: vol,
            sharePercent: +share.toFixed(1),
            bpsChange: 0,
            msrpParityIndex: 100,
            volumeTrend: 0,
            avgPrice: d.average_sale_price ?? d.avg_price ?? 35000,
            avgDOM: d.average_dom ?? d.avg_dom ?? 30,
            isMyBrand: (d.make ?? "").toLowerCase() === myMake,
          } as BrandData;
        });
      }
    } catch (e) {
      console.warn("Enterprise API unavailable, using demo data:", e);
    }
  }

  render();
  window.addEventListener('resize', render);
}

main();
