import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "car-search-compare" }); } catch {}

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
  // Map app-internal param names → MarketCheck API param names
  const apiParams: Record<string, unknown> = {
    rows: args.rows,
    start: args.start,
    sort_by: args.sort_by,
    sort_order: args.sort_order,
    stats: "price,miles",
    facets: "make,model,trim,body_type",
    include_dealer_object: true,
    include_build_object: true,
    fetch_all_photos: true,
  };
  if (args.makes) apiParams.make = args.makes;
  if (args.bodyTypes) apiParams.body_type = args.bodyTypes;
  if (args.fuelTypes) apiParams.fuel_type = args.fuelTypes;
  if (args.priceRange) apiParams.price_range = args.priceRange;
  if (args.yearRange) apiParams.year_range = args.yearRange;
  if (args.milesMax) apiParams.miles_range = "0-" + args.milesMax;
  if (args.zip) apiParams.zip = args.zip;
  if (args.radius) apiParams.radius = args.radius;
  return _mcActive(apiParams);
}

async function _callTool(toolName, args) {
  // 1. Direct API mode (browser → api.marketcheck.com) — preferred
  const auth = _getAuth();
  if (auth.value) {
    try {
      const data = await _fetchDirect(args);
      if (data) return data;
    } catch (e) { console.warn("Direct API failed:", e); }
  }
  // 2. MCP mode (Claude, VS Code, etc.)
  if (_safeApp) {
    try {
      const r = _safeApp.callServerTool({ name: toolName, arguments: args });
      const text = r?.content?.[0]?.text;
      if (text) return JSON.parse(text);
    } catch {}
  }
  // 3. Demo mode (null → app uses mock data)
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

// ── Types ──────────────────────────────────────────────────────────────────
interface Listing {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  predicted_price?: number;
  miles: number;
  body_type: string;
  fuel_type: string;
  engine: string;
  transmission: string;
  drivetrain: string;
  exterior_color: string;
  interior_color: string;
  mpg_city?: number;
  mpg_highway?: number;
  is_certified: boolean;
  days_on_market: number;
  dealer_name: string;
  dealer_city: string;
  dealer_state: string;
  dealer_distance?: number;
}

interface SearchResult {
  listings: Listing[];
  num_found: number;
  stats?: {
    price?: { min: number; max: number; avg: number };
    miles?: { min: number; max: number; avg: number };
  };
}

interface CompareResult {
  cars: Array<{
    vin: string;
    year: number;
    make: string;
    model: string;
    trim: string;
    price: number;
    predicted_price?: number;
    miles: number;
    body_type: string;
    fuel_type: string;
    engine: string;
    transmission: string;
    drivetrain: string;
    exterior_color: string;
    mpg_city?: number;
    mpg_highway?: number;
    is_certified: boolean;
    days_on_market: number;
    dealer_name: string;
    dealer_city: string;
    dealer_state: string;
    dealer_distance?: number;
  }>;
}

// ── Mock Data ──────────────────────────────────────────────────────────────
const MOCK_LISTINGS: Listing[] = [
  { vin: "KNDCB3LC9L5359658", year: 2023, make: "Honda", model: "Accord", trim: "Sport", price: 28495, predicted_price: 29800, miles: 12450, body_type: "Sedan", fuel_type: "Gas", engine: "1.5L Turbo I4", transmission: "CVT", drivetrain: "FWD", exterior_color: "Platinum White", interior_color: "Black", mpg_city: 29, mpg_highway: 37, is_certified: true, days_on_market: 5, dealer_name: "Valley Honda", dealer_city: "Aurora", dealer_state: "CO", dealer_distance: 8 },
  { vin: "5TDKZ3DC1PS000002", year: 2024, make: "Toyota", model: "Highlander", trim: "XLE", price: 42990, predicted_price: 41500, miles: 8200, body_type: "SUV", fuel_type: "Gas", engine: "2.4L Turbo I4", transmission: "Automatic", drivetrain: "AWD", exterior_color: "Magnetic Gray", interior_color: "Graphite", mpg_city: 22, mpg_highway: 29, is_certified: false, days_on_market: 3, dealer_name: "Peak Toyota", dealer_city: "Littleton", dealer_state: "CO", dealer_distance: 15 },
  { vin: "1G1YY22G965000003", year: 2022, make: "Chevrolet", model: "Corvette", trim: "Stingray 3LT", price: 68750, predicted_price: 71000, miles: 9800, body_type: "Coupe", fuel_type: "Gas", engine: "6.2L V8", transmission: "Automatic", drivetrain: "RWD", exterior_color: "Torch Red", interior_color: "Adrenaline Red", mpg_city: 15, mpg_highway: 27, is_certified: false, days_on_market: 22, dealer_name: "Emich Chevrolet", dealer_city: "Lakewood", dealer_state: "CO", dealer_distance: 12 },
  { vin: "1FTFW1E50PFA00004", year: 2023, make: "Ford", model: "F-150", trim: "Lariat", price: 52300, predicted_price: 53100, miles: 18900, body_type: "Truck", fuel_type: "Gas", engine: "3.5L EcoBoost V6", transmission: "Automatic", drivetrain: "4WD", exterior_color: "Antimatter Blue", interior_color: "Black", mpg_city: 18, mpg_highway: 24, is_certified: true, days_on_market: 11, dealer_name: "Phil Long Ford", dealer_city: "Denver", dealer_state: "CO", dealer_distance: 5 },
  { vin: "5YJ3E1EA1PF000005", year: 2023, make: "Tesla", model: "Model 3", trim: "Long Range", price: 34900, predicted_price: 36200, miles: 15600, body_type: "Sedan", fuel_type: "Electric", engine: "Dual Motor Electric", transmission: "Single Speed", drivetrain: "AWD", exterior_color: "Pearl White", interior_color: "Black", mpg_city: 131, mpg_highway: 120, is_certified: false, days_on_market: 6, dealer_name: "Tesla Denver", dealer_city: "Denver", dealer_state: "CO", dealer_distance: 3 },
  { vin: "WBA53BJ00PCN00006", year: 2023, make: "BMW", model: "5 Series", trim: "530i xDrive", price: 47800, predicted_price: 48900, miles: 21000, body_type: "Sedan", fuel_type: "Gas", engine: "2.0L Turbo I4", transmission: "Automatic", drivetrain: "AWD", exterior_color: "Black Sapphire", interior_color: "Cognac", mpg_city: 25, mpg_highway: 34, is_certified: true, days_on_market: 18, dealer_name: "Schomp BMW", dealer_city: "Highlands Ranch", dealer_state: "CO", dealer_distance: 20 },
  { vin: "WDDZF4JB1PA000007", year: 2024, make: "Mercedes-Benz", model: "E-Class", trim: "E350 4MATIC", price: 62500, predicted_price: 63200, miles: 4300, body_type: "Sedan", fuel_type: "Gas", engine: "2.0L Turbo I4 + Mild Hybrid", transmission: "Automatic", drivetrain: "AWD", exterior_color: "Obsidian Black", interior_color: "Macchiato Beige", mpg_city: 24, mpg_highway: 33, is_certified: false, days_on_market: 2, dealer_name: "MB of Denver", dealer_city: "Denver", dealer_state: "CO", dealer_distance: 7 },
  { vin: "JN1TBNT32U0000008", year: 2022, make: "Nissan", model: "Rogue", trim: "SL", price: 26300, predicted_price: 28100, miles: 32500, body_type: "SUV", fuel_type: "Gas", engine: "1.5L Turbo I3", transmission: "CVT", drivetrain: "AWD", exterior_color: "Scarlet Ember", interior_color: "Charcoal", mpg_city: 28, mpg_highway: 34, is_certified: false, days_on_market: 35, dealer_name: "AutoNation Nissan", dealer_city: "Thornton", dealer_state: "CO", dealer_distance: 18 },
  { vin: "KNAE55LC8PA000009", year: 2023, make: "Kia", model: "EV6", trim: "Wind AWD", price: 38750, predicted_price: 39500, miles: 11200, body_type: "SUV", fuel_type: "Electric", engine: "Dual Motor Electric", transmission: "Single Speed", drivetrain: "AWD", exterior_color: "Glacier White", interior_color: "Black/Gray", mpg_city: 116, mpg_highway: 94, is_certified: false, days_on_market: 9, dealer_name: "Peak Kia", dealer_city: "Littleton", dealer_state: "CO", dealer_distance: 16 },
  { vin: "1C4RJXF68PC000010", year: 2023, make: "Jeep", model: "Grand Cherokee", trim: "Limited 4xe", price: 49200, predicted_price: 51000, miles: 16800, body_type: "SUV", fuel_type: "Hybrid", engine: "2.0L Turbo I4 + PHEV", transmission: "Automatic", drivetrain: "4WD", exterior_color: "Baltic Gray", interior_color: "Global Black", mpg_city: 56, mpg_highway: 27, is_certified: true, days_on_market: 14, dealer_name: "Medved Jeep", dealer_city: "Wheat Ridge", dealer_state: "CO", dealer_distance: 10 },
  { vin: "2T1BURHE0PC000011", year: 2024, make: "Toyota", model: "Camry", trim: "XSE Hybrid", price: 33400, predicted_price: 33800, miles: 3100, body_type: "Sedan", fuel_type: "Hybrid", engine: "2.5L I4 + Hybrid", transmission: "eCVT", drivetrain: "FWD", exterior_color: "Underground", interior_color: "Black/Red", mpg_city: 51, mpg_highway: 53, is_certified: false, days_on_market: 4, dealer_name: "Larry H Miller Toyota", dealer_city: "Murray", dealer_state: "CO", dealer_distance: 22 },
  { vin: "3C6UR5CL1PG000012", year: 2023, make: "RAM", model: "1500", trim: "Rebel", price: 48900, predicted_price: 47200, miles: 24600, body_type: "Truck", fuel_type: "Gas", engine: "5.7L HEMI V8", transmission: "Automatic", drivetrain: "4WD", exterior_color: "Hydro Blue", interior_color: "Black", mpg_city: 15, mpg_highway: 22, is_certified: false, days_on_market: 28, dealer_name: "Perkins Motors", dealer_city: "Colorado Springs", dealer_state: "CO", dealer_distance: 65 },
];

// ── Constants ──────────────────────────────────────────────────────────────
const TOP_MAKES = [
  "Acura", "Audi", "BMW", "Buick", "Cadillac", "Chevrolet", "Chrysler",
  "Dodge", "Ford", "GMC", "Honda", "Hyundai", "Jeep", "Kia",
  "Lexus", "Mercedes-Benz", "Nissan", "RAM", "Subaru", "Tesla",
  "Toyota", "Volkswagen",
];
const BODY_TYPES = ["Sedan", "SUV", "Truck", "Coupe", "Van", "Convertible", "Hatchback"];
const FUEL_TYPES = ["Gas", "Hybrid", "Electric", "Diesel"];
const RADIUS_OPTIONS = [25, 50, 75, 100, 200];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "miles_asc", label: "Mileage: Low to High" },
  { value: "year_desc", label: "Year: Newest First" },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtPrice(v: number | undefined): string {
  if (v == null) return "N/A";
  return "$" + Math.round(v).toLocaleString();
}
function fmtMiles(v: number | undefined): string {
  if (v == null) return "N/A";
  return Math.round(v).toLocaleString() + " mi";
}
function makeColorFromInitial(make: string): string {
  const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];
  let hash = 0;
  for (let i = 0; i < make.length; i++) hash = make.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// ── App ────────────────────────────────────────────────────────────────────

// State
let allListings: Listing[] = [];
let displayedListings: Listing[] = [];
let compareSet: Set<string> = new Set(); // VINs
let currentView: "search" | "compare" = "search";
let searchStart = 0;
let searchTotal = 0;
let currentStats: SearchResult["stats"] = undefined;
let sidebarOpen = true;

// Filter state
let filterMakes: Set<string> = new Set();
let filterBodyTypes: Set<string> = new Set();
let filterFuelTypes: Set<string> = new Set();
let filterPriceMin = "";
let filterPriceMax = "";
let filterYearMin = "";
let filterYearMax = "";
let filterMilesMax = "";
let filterZip = "";
let filterRadius = 50;
let filterSort = "price_desc";
let savedCompareListings: Listing[] = []; // preserve selected cars across searches

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  document.body.innerHTML = "";
  document.body.style.cssText =
    "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;overflow-x:hidden;min-height:100vh;";

  // Inject keyframes
  const style = document.createElement("style");
  style.textContent = `
    @keyframes spin { to { transform: rotate(360deg) } }
    input:focus, select:focus { border-color: #3b82f6 !important; outline: none; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #1e293b; }
    ::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
  `;
  document.body.appendChild(style);

  // Header
  const header = el("div", {
    style: "background:#1e293b;padding:12px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;justify-content:space-between;",
  });
  const titleArea = el("div", { style: "display:flex;align-items:center;gap:12px;" });
  titleArea.innerHTML = `<h1 style="margin:0;font-size:18px;font-weight:700;color:#f8fafc;">Car Search &amp; Compare</h1>`;
  header.appendChild(titleArea);

  _addSettingsBar(titleArea);

  if (currentView === "compare") {
    const backBtn = makeButton("Back to Search", () => {
      currentView = "search";
      render();
    }, "secondary");
    header.appendChild(backBtn);
  } else {
    const toggleSidebar = makeButton(sidebarOpen ? "Hide Stats" : "Show Stats", () => {
      sidebarOpen = !sidebarOpen;
      render();
    }, "secondary");
    header.appendChild(toggleSidebar);
  }
  document.body.appendChild(header);

  // Demo banner
  if (_detectAppMode() === "demo") {
    const _db = document.createElement("div");
    _db.id = "_demo_banner";
    _db.style.cssText = "background:linear-gradient(135deg,#92400e22,#f59e0b11);border:1px solid #f59e0b44;padding:14px 20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;";
    _db.innerHTML = `
      <div style="flex:1;min-width:200px;">
        <div style="font-size:13px;font-weight:700;color:#fbbf24;">&#9888; Demo Mode — Showing sample data</div>
        <div style="font-size:12px;color:#d97706;">Enter your MarketCheck API key for real data.
          <a href="https://developers.marketcheck.com" target="_blank" style="color:#fbbf24;text-decoration:underline;">Get a free key</a></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <input id="_banner_key" type="text" placeholder="Paste your API key"
          style="padding:8px 12px;border-radius:6px;border:1px solid #f59e0b44;background:#0f172a;color:#e2e8f0;font-size:13px;width:220px;" />
        <button id="_banner_save"
          style="padding:8px 16px;border-radius:6px;border:none;background:#f59e0b;color:#0f172a;font-size:12px;font-weight:700;cursor:pointer;">Activate</button>
      </div>`;
    document.body.appendChild(_db);
    (_db.querySelector("#_banner_save") as HTMLButtonElement).addEventListener("click", () => {
      const k = (_db.querySelector("#_banner_key") as HTMLInputElement).value.trim();
      if (!k) return;
      localStorage.setItem("mc_api_key", k);
      _db.innerHTML = '<div style="font-size:13px;font-weight:700;color:#10b981;">&#10003; API key saved — reloading...</div>';
      setTimeout(() => location.reload(), 800);
    });
    (_db.querySelector("#_banner_key") as HTMLInputElement).addEventListener("keydown", (e) => {
      if (e.key === "Enter") (_db.querySelector("#_banner_save") as HTMLButtonElement).click();
    });
  }

  if (currentView === "compare") {
    renderCompareView();
  } else {
    renderSearchView();
  }
}

function renderSearchView() {
  const wrapper = el("div", { style: "display:flex;height:calc(100vh - 49px);overflow:hidden;" });

  // Main area
  const mainArea = el("div", { style: "flex:1;display:flex;flex-direction:column;overflow:hidden;" });

  // Search filters
  mainArea.appendChild(renderFilters());

  // Results header
  const resultsHeader = el("div", {
    style: "padding:10px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1e293b;flex-shrink:0;",
  });
  const countText = el("span", { style: "font-size:13px;color:#94a3b8;" });
  countText.textContent = searchTotal > 0
    ? `${searchTotal.toLocaleString()} vehicles found`
    : displayedListings.length > 0
      ? `${displayedListings.length} vehicles (mock data)`
      : "Enter search criteria to find vehicles";
  resultsHeader.appendChild(countText);

  const sortSelect = makeSelect(SORT_OPTIONS, filterSort);
  sortSelect.style.cssText += "font-size:12px;padding:4px 8px;";
  sortSelect.addEventListener("change", () => {
    filterSort = sortSelect.value;
    searchStart = 0;
    doSearch(false);
  });
  resultsHeader.appendChild(sortSelect);
  mainArea.appendChild(resultsHeader);

  // Results grid (scrollable)
  const resultsContainer = el("div", {
    style: "flex:1;overflow-y:auto;padding:16px 20px;padding-bottom:80px;",
  });
  if (displayedListings.length === 0) {
    resultsContainer.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#64748b;">
      <div style="font-size:48px;margin-bottom:16px;">&#128663;</div>
      <div style="font-size:16px;font-weight:600;margin-bottom:8px;">Search for Your Next Car</div>
      <div style="font-size:13px;">Use the filters above to find vehicles, or click Search to browse all listings.</div>
    </div>`;
  } else {
    const grid = el("div", {
      style: "display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;",
    });
    for (const listing of displayedListings) {
      grid.appendChild(renderListingCard(listing));
    }
    resultsContainer.appendChild(grid);

    // Load more
    if (searchTotal > displayedListings.length) {
      const loadMoreWrap = el("div", { style: "text-align:center;padding:20px;" });
      const loadMoreBtn = makeButton("Load More", () => {
        searchStart += 12;
        doSearch(true);
      });
      loadMoreWrap.appendChild(loadMoreBtn);
      resultsContainer.appendChild(loadMoreWrap);
    }
  }
  mainArea.appendChild(resultsContainer);
  wrapper.appendChild(mainArea);

  // Market stats sidebar
  if (sidebarOpen) {
    wrapper.appendChild(renderStatsSidebar());
  }

  document.body.appendChild(wrapper);

  // Comparison tray (sticky bottom)
  if (compareSet.size > 0) {
    document.body.appendChild(renderCompareTray());
  }
}

// ── Filters ────────────────────────────────────────────────────────────────
function renderFilters(): HTMLElement {
  const container = el("div", {
    style: "background:#1e293b;padding:12px 20px 14px;border-bottom:1px solid #334155;flex-shrink:0;",
  });

  // ── Row 1: all numeric/location inputs in one horizontal bar ──────────
  const row1 = el("div", { style: "display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;" });

  // Price range — inline label + two inputs
  const priceWrap = el("div", { style: "display:flex;align-items:center;gap:4px;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:0 10px;height:36px;" });
  const priceLbl = el("span", { style: "font-size:11px;color:#64748b;white-space:nowrap;font-weight:600;margin-right:2px;" });
  priceLbl.textContent = "Price";
  const priceMinInput = makeInput("Min", filterPriceMin, "62px", "number");
  priceMinInput.style.cssText = "background:transparent;border:none;color:#e2e8f0;font-size:12px;width:62px;outline:none;padding:0;";
  priceMinInput.addEventListener("input", () => { filterPriceMin = priceMinInput.value; });
  const priceSep = el("span", { style: "color:#475569;font-size:11px;padding:0 2px;" }); priceSep.textContent = "–";
  const priceMaxInput = makeInput("Max", filterPriceMax, "62px", "number");
  priceMaxInput.style.cssText = "background:transparent;border:none;color:#e2e8f0;font-size:12px;width:62px;outline:none;padding:0;";
  priceMaxInput.addEventListener("input", () => { filterPriceMax = priceMaxInput.value; });
  priceWrap.appendChild(priceLbl); priceWrap.appendChild(priceMinInput); priceWrap.appendChild(priceSep); priceWrap.appendChild(priceMaxInput);
  row1.appendChild(priceWrap);

  // Year range
  const yearWrap = el("div", { style: "display:flex;align-items:center;gap:4px;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:0 10px;height:36px;" });
  const yearLbl = el("span", { style: "font-size:11px;color:#64748b;white-space:nowrap;font-weight:600;margin-right:2px;" });
  yearLbl.textContent = "Year";
  const yearMinInput = makeInput("From", filterYearMin, "52px", "number");
  yearMinInput.style.cssText = "background:transparent;border:none;color:#e2e8f0;font-size:12px;width:52px;outline:none;padding:0;";
  yearMinInput.addEventListener("input", () => { filterYearMin = yearMinInput.value; });
  const yearSep = el("span", { style: "color:#475569;font-size:11px;padding:0 2px;" }); yearSep.textContent = "–";
  const yearMaxInput = makeInput("To", filterYearMax, "52px", "number");
  yearMaxInput.style.cssText = "background:transparent;border:none;color:#e2e8f0;font-size:12px;width:52px;outline:none;padding:0;";
  yearMaxInput.addEventListener("input", () => { filterYearMax = yearMaxInput.value; });
  yearWrap.appendChild(yearLbl); yearWrap.appendChild(yearMinInput); yearWrap.appendChild(yearSep); yearWrap.appendChild(yearMaxInput);
  row1.appendChild(yearWrap);

  // Max miles
  const milesWrap = el("div", { style: "display:flex;align-items:center;gap:6px;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:0 10px;height:36px;" });
  const milesLbl = el("span", { style: "font-size:11px;color:#64748b;white-space:nowrap;font-weight:600;" });
  milesLbl.textContent = "Max Mi";
  const milesInput = makeInput("e.g. 50000", filterMilesMax, "80px", "number");
  milesInput.style.cssText = "background:transparent;border:none;color:#e2e8f0;font-size:12px;width:80px;outline:none;padding:0;";
  milesInput.addEventListener("input", () => { filterMilesMax = milesInput.value; });
  milesWrap.appendChild(milesLbl); milesWrap.appendChild(milesInput);
  row1.appendChild(milesWrap);

  // ZIP + Radius
  const locWrap = el("div", { style: "display:flex;align-items:center;gap:6px;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:0 10px;height:36px;" });
  const locLbl = el("span", { style: "font-size:11px;color:#64748b;white-space:nowrap;font-weight:600;" });
  locLbl.textContent = "ZIP";
  const zipInput = makeInput("e.g. 90210", filterZip, "72px");
  zipInput.style.cssText = "background:transparent;border:none;color:#e2e8f0;font-size:12px;width:72px;outline:none;padding:0;";
  zipInput.addEventListener("input", () => { filterZip = zipInput.value; });
  const radiusSelect = makeSelect(
    RADIUS_OPTIONS.map((r) => ({ value: String(r), label: `${r} mi` })),
    String(filterRadius),
  );
  radiusSelect.style.cssText = "background:transparent;border:none;color:#94a3b8;font-size:12px;outline:none;padding:0;cursor:pointer;";
  radiusSelect.addEventListener("change", () => { filterRadius = Number(radiusSelect.value); });
  locWrap.appendChild(locLbl); locWrap.appendChild(zipInput); locWrap.appendChild(radiusSelect);
  row1.appendChild(locWrap);

  container.appendChild(row1);

  // ── Row 2: chips + makes + actions all in one line ─────────────────────
  const row2 = el("div", { style: "display:flex;flex-wrap:wrap;gap:8px;align-items:center;" });

  // Body type chips (compact, pill style)
  const bodyChips = el("div", { style: "display:flex;gap:5px;flex-wrap:wrap;align-items:center;" });
  const bodyLbl2 = el("span", { style: "font-size:11px;color:#64748b;font-weight:600;white-space:nowrap;" });
  bodyLbl2.textContent = "Body:";
  bodyChips.appendChild(bodyLbl2);
  bodyChips.appendChild(renderChipGroup(BODY_TYPES, filterBodyTypes, (active) => { filterBodyTypes = active; }));
  row2.appendChild(bodyChips);

  // Divider
  const div1 = el("div", { style: "width:1px;height:20px;background:#334155;flex-shrink:0;" });
  row2.appendChild(div1);

  // Fuel type chips
  const fuelChips = el("div", { style: "display:flex;gap:5px;flex-wrap:wrap;align-items:center;" });
  const fuelLbl2 = el("span", { style: "font-size:11px;color:#64748b;font-weight:600;white-space:nowrap;" });
  fuelLbl2.textContent = "Fuel:";
  fuelChips.appendChild(fuelLbl2);
  fuelChips.appendChild(renderChipGroup(FUEL_TYPES, filterFuelTypes, (active) => { filterFuelTypes = active; }));
  row2.appendChild(fuelChips);

  // Divider
  const div2 = el("div", { style: "width:1px;height:20px;background:#334155;flex-shrink:0;" });
  row2.appendChild(div2);

  // Makes dropdown
  row2.appendChild(renderMakeDropdown());

  // Spacer
  row2.appendChild(el("div", { style: "flex:1;min-width:8px;" }));

  // Search + Reset buttons
  const searchBtn = makeButton("🔍 Search", () => {
    searchStart = 0;
    doSearch(false);
  });
  searchBtn.style.cssText += "padding:8px 22px;font-size:13px;";
  row2.appendChild(searchBtn);

  const resetBtn = makeButton("✕ Reset", () => {
    filterMakes = new Set();
    filterBodyTypes = new Set();
    filterFuelTypes = new Set();
    filterPriceMin = "";
    filterPriceMax = "";
    filterYearMin = "";
    filterYearMax = "";
    filterMilesMax = "";
    filterZip = "";
    filterRadius = 50;
    filterSort = "price_desc";
    allListings = [];
    displayedListings = [];
    compareSet = new Set();
    savedCompareListings = [];
    searchStart = 0;
    searchTotal = 0;
    currentStats = undefined;
    render();
  }, "secondary");
  row2.appendChild(resetBtn);

  container.appendChild(row2);
  return container;
}

function filterGroup(label: string): HTMLElement {
  const g = el("div", { style: "display:flex;flex-direction:column;gap:4px;" });
  const lbl = el("span", { style: "font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;" });
  lbl.textContent = label;
  g.appendChild(lbl);
  const row = el("div", { style: "display:flex;align-items:center;gap:6px;" });
  g.appendChild(row);
  return g;
}

function renderChipGroup(items: string[], activeSet: Set<string>, onToggle: (s: Set<string>) => void): HTMLElement {
  const container = el("div", { style: "display:flex;gap:5px;flex-wrap:wrap;" });
  for (const item of items) {
    const chip = el("button");
    const active = activeSet.has(item);
    chip.textContent = item;
    chip.style.cssText = `padding:3px 12px;border-radius:14px;font-size:12px;cursor:pointer;border:1px solid ${active ? "#3b82f6" : "#334155"};background:${active ? "#3b82f622" : "#0f172a"};color:${active ? "#60a5fa" : "#94a3b8"};font-weight:${active ? "600" : "400"};transition:all 0.15s;`;
    chip.addEventListener("click", () => {
      if (activeSet.has(item)) activeSet.delete(item);
      else activeSet.add(item);
      onToggle(activeSet);
      render();
    });
    container.appendChild(chip);
  }
  return container;
}

function renderMakeDropdown(): HTMLElement {
  const wrapper = el("div", { style: "position:relative;display:inline-block;" });

  const trigger = el("button");
  const count = filterMakes.size;
  trigger.textContent = count === 0 ? "All Makes" : `${count} make${count > 1 ? "s" : ""} selected`;
  trigger.style.cssText =
    "padding:6px 12px;border-radius:6px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;font-size:13px;cursor:pointer;min-width:160px;text-align:left;";

  const dropdown = el("div", {
    style: "display:none;position:absolute;top:100%;left:0;background:#1e293b;border:1px solid #475569;border-radius:8px;padding:8px;z-index:100;max-height:260px;overflow-y:auto;min-width:200px;margin-top:4px;box-shadow:0 8px 32px rgba(0,0,0,0.4);",
  });

  for (const make of TOP_MAKES) {
    const row = el("label", {
      style: "display:flex;align-items:center;gap:8px;padding:4px 6px;cursor:pointer;border-radius:4px;font-size:13px;color:#e2e8f0;",
    });
    row.addEventListener("mouseenter", () => { row.style.background = "#334155"; });
    row.addEventListener("mouseleave", () => { row.style.background = ""; });
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = filterMakes.has(make);
    cb.style.cssText = "accent-color:#3b82f6;";
    cb.addEventListener("change", () => {
      if (cb.checked) filterMakes.add(make);
      else filterMakes.delete(make);
      const ct = filterMakes.size;
      trigger.textContent = ct === 0 ? "All Makes" : `${ct} make${ct > 1 ? "s" : ""} selected`;
    });
    const span = el("span");
    span.textContent = make;
    row.appendChild(cb);
    row.appendChild(span);
    dropdown.appendChild(row);
  }

  let dropdownOpen = false;
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdownOpen = !dropdownOpen;
    dropdown.style.display = dropdownOpen ? "block" : "none";
  });
  document.addEventListener("click", () => {
    dropdownOpen = false;
    dropdown.style.display = "none";
  });
  dropdown.addEventListener("click", (e) => e.stopPropagation());

  wrapper.appendChild(trigger);
  wrapper.appendChild(dropdown);
  return wrapper;
}

// ── Listing Card ───────────────────────────────────────────────────────────
function renderListingCard(listing: Listing): HTMLElement {
  const card = el("div", {
    style: "background:#1e293b;border:1px solid #334155;border-radius:10px;overflow:hidden;transition:border-color 0.15s;position:relative;cursor:pointer;",
  });
  card.addEventListener("mouseenter", () => { card.style.borderColor = "#475569"; });
  card.addEventListener("mouseleave", () => { card.style.borderColor = "#334155"; });

  // Compare checkbox
  const cbWrap = el("div", { style: "position:absolute;top:8px;right:8px;z-index:10;" });
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = compareSet.has(listing.vin);
  cb.title = "Add to compare";
  cb.style.cssText = "width:18px;height:18px;accent-color:#3b82f6;cursor:pointer;";

  function toggleCompare() {
    if (compareSet.has(listing.vin)) {
      compareSet.delete(listing.vin);
      savedCompareListings = savedCompareListings.filter(l => l.vin !== listing.vin);
    } else {
      if (compareSet.size >= 3) return;
      compareSet.add(listing.vin);
      if (!savedCompareListings.find(l => l.vin === listing.vin)) {
        savedCompareListings.push(listing);
      }
    }
    render();
  }

  cb.addEventListener("click", (e) => { e.stopPropagation(); });
  cb.addEventListener("change", toggleCompare);
  cbWrap.appendChild(cb);
  card.appendChild(cbWrap);

  // Click anywhere on card toggles compare
  card.addEventListener("click", toggleCompare);

  // Photo placeholder
  const photoColor = makeColorFromInitial(listing.make);
  const photo = el("div", {
    style: `height:140px;background:linear-gradient(135deg,${photoColor}33,${photoColor}11);display:flex;align-items:center;justify-content:center;`,
  });
  photo.innerHTML = `<span style="font-size:48px;font-weight:800;color:${photoColor}88;">${listing.make.charAt(0)}</span>`;
  card.appendChild(photo);

  // Content
  const content = el("div", { style: "padding:14px;" });

  // Title
  const title = el("div", { style: "font-size:14px;font-weight:700;color:#f8fafc;margin-bottom:6px;" });
  title.textContent = `${listing.year} ${listing.make} ${listing.model} ${listing.trim}`;
  content.appendChild(title);

  // Price row
  const priceRow = el("div", { style: "display:flex;align-items:baseline;gap:8px;margin-bottom:8px;" });
  const priceEl = el("span", { style: "font-size:22px;font-weight:800;color:#f8fafc;" });
  priceEl.textContent = fmtPrice(listing.price);
  priceRow.appendChild(priceEl);

  if (listing.predicted_price && listing.price < listing.predicted_price) {
    const savings = listing.predicted_price - listing.price;
    const savingsEl = el("span", { style: "font-size:12px;color:#10b981;font-weight:600;" });
    savingsEl.textContent = `${fmtPrice(savings)} below market`;
    priceRow.appendChild(savingsEl);
  }
  content.appendChild(priceRow);

  // Details
  const detailRow = el("div", { style: "display:flex;gap:16px;font-size:12px;color:#94a3b8;margin-bottom:10px;" });
  detailRow.innerHTML = `<span>${fmtMiles(listing.miles)}</span><span>${listing.dealer_city}, ${listing.dealer_state}</span>`;
  if (listing.dealer_distance != null) {
    detailRow.innerHTML += `<span>${listing.dealer_distance} mi away</span>`;
  }
  content.appendChild(detailRow);

  // Badges
  const badges = el("div", { style: "display:flex;flex-wrap:wrap;gap:6px;" });
  if (listing.predicted_price && listing.price < listing.predicted_price * 0.97) {
    badges.appendChild(makeBadge("Great Deal", "#10b981"));
  }
  if (listing.is_certified) {
    badges.appendChild(makeBadge("CPO", "#3b82f6"));
  }
  if (listing.miles < 15000) {
    badges.appendChild(makeBadge("Low Miles", "#8b5cf6"));
  }
  if (listing.days_on_market < 7) {
    badges.appendChild(makeBadge("New Arrival", "#f97316"));
  }
  content.appendChild(badges);

  card.appendChild(content);
  return card;
}

function makeBadge(text: string, color: string): HTMLElement {
  const badge = el("span", {
    style: `display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${color}22;color:${color};border:1px solid ${color}44;`,
  });
  badge.textContent = text;
  return badge;
}

// ── Comparison Tray ────────────────────────────────────────────────────────
function renderCompareTray(): HTMLElement {
  const tray = el("div", {
    style: "position:fixed;bottom:0;left:0;right:0;background:#1e293b;border-top:2px solid #3b82f6;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;z-index:50;box-shadow:0 -4px 20px rgba(0,0,0,0.4);",
  });

  const thumbs = el("div", { style: "display:flex;gap:12px;align-items:center;" });
  const label = el("span", { style: "font-size:13px;color:#94a3b8;margin-right:8px;" });
  label.textContent = `${compareSet.size} of 3 selected`;
  thumbs.appendChild(label);

  for (const vin of compareSet) {
    const listing = allListings.find((l) => l.vin === vin) ?? savedCompareListings.find((l) => l.vin === vin) ?? displayedListings.find((l) => l.vin === vin);
    if (!listing) continue;
    const thumb = el("div", {
      style: "background:#0f172a;border:1px solid #334155;border-radius:8px;padding:6px 12px;display:flex;align-items:center;gap:8px;",
    });
    const color = makeColorFromInitial(listing.make);
    thumb.innerHTML = `
      <div style="width:32px;height:32px;border-radius:6px;background:${color}22;display:flex;align-items:center;justify-content:center;font-weight:700;color:${color};font-size:16px;">${listing.make.charAt(0)}</div>
      <div>
        <div style="font-size:12px;font-weight:600;color:#f8fafc;">${listing.year} ${listing.make} ${listing.model}</div>
        <div style="font-size:11px;color:#94a3b8;">${fmtPrice(listing.price)}</div>
      </div>
    `;
    const removeBtn = el("button", {
      style: "background:none;border:none;color:#ef4444;cursor:pointer;font-size:16px;padding:0 4px;",
    });
    removeBtn.innerHTML = "&#10005;";
    removeBtn.addEventListener("click", () => {
      compareSet.delete(vin);
      render();
    });
    thumb.appendChild(removeBtn);
    thumbs.appendChild(thumb);
  }
  tray.appendChild(thumbs);

  const compareBtn = makeButton("Compare Now", () => {
    currentView = "compare";
    doCompare();
  });
  if (compareSet.size < 2) {
    compareBtn.style.opacity = "0.4";
    compareBtn.style.pointerEvents = "none";
  }
  tray.appendChild(compareBtn);
  return tray;
}

// ── Comparison View ────────────────────────────────────────────────────────
function renderCompareView() {
  const vins = [...compareSet];
  const cars = vins.map((vin) =>
    allListings.find((l) => l.vin === vin) ?? savedCompareListings.find((l) => l.vin === vin) ?? displayedListings.find((l) => l.vin === vin)
  ).filter(Boolean) as Listing[];

  if (cars.length < 2) {
    const msg = el("div", { style: "text-align:center;padding:60px;color:#94a3b8;" });
    msg.textContent = "Select at least 2 cars to compare.";
    document.body.appendChild(msg);
    return;
  }

  const container = el("div", { style: "padding:20px;overflow-y:auto;height:calc(100vh - 49px);" });

  // Grid columns
  const colCount = cars.length;
  const table = el("div", {
    style: `display:grid;grid-template-columns:180px repeat(${colCount},1fr);gap:0;border:1px solid #334155;border-radius:10px;overflow:hidden;`,
  });

  // Determine "winner" (best overall value = lowest price relative to predicted)
  let bestIdx = 0;
  let bestRatio = Infinity;
  cars.forEach((car, i) => {
    const ratio = car.predicted_price ? car.price / car.predicted_price : 1;
    if (ratio < bestRatio) { bestRatio = ratio; bestIdx = i; }
  });

  // Header row: photo placeholders
  addCompareRow(table, "", cars.map((car, i) => {
    const color = makeColorFromInitial(car.make);
    const winner = i === bestIdx ? `<div style="background:#10b981;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;display:inline-block;margin-bottom:6px;">BEST VALUE</div>` : "";
    return `<div style="text-align:center;">
      ${winner}
      <div style="width:80px;height:80px;border-radius:10px;background:${color}22;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;">
        <span style="font-size:36px;font-weight:800;color:${color}88;">${car.make.charAt(0)}</span>
      </div>
      <div style="font-weight:700;font-size:14px;color:#f8fafc;">${car.year} ${car.make} ${car.model}</div>
      <div style="font-size:12px;color:#94a3b8;">${car.trim}</div>
    </div>`;
  }), true);

  // Comparison rows
  const rows: Array<{ label: string; values: string[]; bestFn?: (vals: (number | undefined)[]) => number }> = [
    {
      label: "Price",
      values: cars.map((c) => `<span style="font-size:18px;font-weight:700;">${fmtPrice(c.price)}</span>`),
      bestFn: (vals) => vals.indexOf(Math.min(...(vals.filter((v) => v != null) as number[]))),
    },
    {
      label: "Fair Market Price",
      values: cars.map((c) => {
        const pp = fmtPrice(c.predicted_price);
        if (c.predicted_price && c.price < c.predicted_price * 0.97) {
          return `${pp} <span style="color:#10b981;font-size:11px;font-weight:600;">Great Deal</span>`;
        }
        if (c.predicted_price && c.price > c.predicted_price * 1.03) {
          return `${pp} <span style="color:#f59e0b;font-size:11px;font-weight:600;">Above Market</span>`;
        }
        return pp;
      }),
    },
    {
      label: "Mileage",
      values: cars.map((c) => fmtMiles(c.miles)),
      bestFn: (vals) => vals.indexOf(Math.min(...(vals.filter((v) => v != null) as number[]))),
    },
    { label: "Year", values: cars.map((c) => String(c.year)) },
    { label: "Trim", values: cars.map((c) => c.trim) },
    { label: "Engine", values: cars.map((c) => c.engine) },
    { label: "Transmission", values: cars.map((c) => c.transmission) },
    { label: "Drivetrain", values: cars.map((c) => c.drivetrain) },
    {
      label: "MPG (City/Hwy)",
      values: cars.map((c) =>
        c.mpg_city && c.mpg_highway ? `${c.mpg_city} / ${c.mpg_highway}` : "N/A"
      ),
    },
    { label: "Body Type", values: cars.map((c) => c.body_type) },
    { label: "Exterior Color", values: cars.map((c) => c.exterior_color) },
    {
      label: "Dealer",
      values: cars.map((c) => `${c.dealer_name}<br><span style="font-size:11px;color:#94a3b8;">${c.dealer_city}, ${c.dealer_state}${c.dealer_distance != null ? ` (${c.dealer_distance} mi)` : ""}</span>`),
    },
    {
      label: "Days on Market",
      values: cars.map((c) => `${c.days_on_market} days`),
      bestFn: (vals) => vals.indexOf(Math.min(...(vals.filter((v) => v != null) as number[]))),
    },
  ];

  const numericExtract: Record<string, (c: Listing) => number | undefined> = {
    "Price": (c) => c.price,
    "Mileage": (c) => c.miles,
    "Days on Market": (c) => c.days_on_market,
  };

  for (const row of rows) {
    let bestColIdx = -1;
    if (row.bestFn && numericExtract[row.label]) {
      const vals = cars.map((c) => numericExtract[row.label](c));
      bestColIdx = row.bestFn(vals);
    }
    addCompareRow(table, row.label, row.values, false, bestColIdx);
  }

  container.appendChild(table);
  document.body.appendChild(container);
}

function addCompareRow(
  table: HTMLElement,
  label: string,
  cells: string[],
  isHeader = false,
  bestIdx = -1,
) {
  // Label cell
  const labelCell = el("div", {
    style: `padding:12px 16px;background:#1e293b;border-bottom:1px solid #334155;font-size:12px;font-weight:600;color:#94a3b8;display:flex;align-items:center;${isHeader ? "background:#0f172a;" : ""}`,
  });
  labelCell.textContent = label;
  table.appendChild(labelCell);

  // Value cells
  cells.forEach((html, i) => {
    const cell = el("div", {
      style: `padding:12px 16px;border-bottom:1px solid #334155;border-left:1px solid #334155;font-size:13px;color:#e2e8f0;${isHeader ? "background:#0f172a;" : ""}${i === bestIdx ? "background:#10b98111;color:#10b981;font-weight:700;" : ""}`,
    });
    cell.innerHTML = html;
    table.appendChild(cell);
  });
}

// ── Market Stats Sidebar ───────────────────────────────────────────────────
function renderStatsSidebar(): HTMLElement {
  const sidebar = el("div", {
    style: "width:260px;background:#1e293b;border-left:1px solid #334155;padding:20px;overflow-y:auto;flex-shrink:0;",
  });

  const title = el("h3", { style: "font-size:14px;font-weight:700;color:#f8fafc;margin:0 0 16px 0;" });
  title.textContent = "Market Stats";
  sidebar.appendChild(title);

  if (!currentStats && displayedListings.length === 0) {
    const placeholder = el("div", { style: "font-size:12px;color:#64748b;text-align:center;padding:20px 0;" });
    placeholder.textContent = "Run a search to see market statistics.";
    sidebar.appendChild(placeholder);
    return sidebar;
  }

  // Compute from displayed listings if no server stats
  const prices = displayedListings.map((l) => l.price).filter((p) => p > 0);
  const miles = displayedListings.map((l) => l.miles).filter((m) => m > 0);

  const stats = currentStats ?? {
    price: prices.length
      ? { min: Math.min(...prices), max: Math.max(...prices), avg: prices.reduce((a, b) => a + b, 0) / prices.length }
      : undefined,
    miles: miles.length
      ? { min: Math.min(...miles), max: Math.max(...miles), avg: miles.reduce((a, b) => a + b, 0) / miles.length }
      : undefined,
  };

  const statItems: Array<{ label: string; value: string }> = [
    { label: "Total Available", value: (searchTotal || displayedListings.length).toLocaleString() },
  ];

  if (stats.price) {
    statItems.push({ label: "Avg Price", value: fmtPrice(stats.price.avg) });
    statItems.push({ label: "Price Range", value: `${fmtPrice(stats.price.min)} - ${fmtPrice(stats.price.max)}` });
  }
  if (stats.miles) {
    statItems.push({ label: "Avg Mileage", value: fmtMiles(stats.miles.avg) });
    statItems.push({ label: "Mileage Range", value: `${fmtMiles(stats.miles.min)} - ${fmtMiles(stats.miles.max)}` });
  }

  for (const item of statItems) {
    const statEl = el("div", { style: "margin-bottom:14px;" });
    statEl.innerHTML = `
      <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:2px;">${item.label}</div>
      <div style="font-size:16px;font-weight:700;color:#f8fafc;">${item.value}</div>
    `;
    sidebar.appendChild(statEl);
  }

  // Price distribution bar
  if (stats.price) {
    const distTitle = el("div", { style: "font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin:20px 0 8px;" });
    distTitle.textContent = "Price Distribution";
    sidebar.appendChild(distTitle);

    const bar = el("div", {
      style: "height:24px;background:#0f172a;border-radius:6px;overflow:hidden;position:relative;border:1px solid #334155;",
    });
    bar.innerHTML = `
      <div style="position:absolute;left:0;top:0;height:100%;width:50%;background:linear-gradient(90deg,#3b82f633,#3b82f611);"></div>
      <div style="position:absolute;left:4px;top:50%;transform:translateY(-50%);font-size:9px;color:#94a3b8;">${fmtPrice(stats.price.min)}</div>
      <div style="position:absolute;right:4px;top:50%;transform:translateY(-50%);font-size:9px;color:#94a3b8;">${fmtPrice(stats.price.max)}</div>
    `;
    sidebar.appendChild(bar);
  }

  // Body type breakdown from displayed listings
  if (displayedListings.length > 0) {
    const breakdownTitle = el("div", { style: "font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin:20px 0 8px;" });
    breakdownTitle.textContent = "Body Type Breakdown";
    sidebar.appendChild(breakdownTitle);

    const bodyCounts: Record<string, number> = {};
    for (const l of displayedListings) {
      bodyCounts[l.body_type] = (bodyCounts[l.body_type] || 0) + 1;
    }
    const sorted = Object.entries(bodyCounts).sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sorted) {
      const pct = (count / displayedListings.length) * 100;
      const row = el("div", { style: "margin-bottom:6px;" });
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;margin-bottom:2px;">
          <span>${type}</span><span>${count}</span>
        </div>
        <div style="height:4px;background:#0f172a;border-radius:2px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:#3b82f6;border-radius:2px;"></div>
        </div>
      `;
      sidebar.appendChild(row);
    }
  }

  return sidebar;
}

// ── API → Listing mapper ───────────────────────────────────────────────────
function mapApiListing(l: any): Listing {
  return {
    vin: l.vin ?? "",
    year: l.year ?? 0,
    make: l.make ?? l.build?.make ?? "",
    model: l.model ?? l.build?.model ?? "",
    trim: l.trim ?? l.build?.trim ?? "",
    price: l.price ?? 0,
    predicted_price: l.predicted_price ?? l.predicted_value ?? undefined,
    miles: l.miles ?? l.mileage ?? 0,
    body_type: l.body_type ?? l.build?.body_type ?? "",
    fuel_type: l.fuel_type ?? l.build?.fuel_type ?? "",
    engine: l.engine ?? l.build?.engine ?? "",
    transmission: l.transmission ?? l.build?.transmission ?? "",
    drivetrain: l.drivetrain ?? l.build?.drivetrain ?? "",
    exterior_color: l.exterior_color ?? "",
    interior_color: l.interior_color ?? "",
    mpg_city: l.mpg_city ?? l.build?.mpg_city ?? undefined,
    mpg_highway: l.mpg_highway ?? l.build?.mpg_highway ?? undefined,
    is_certified: l.is_certified ?? false,
    days_on_market: l.dom ?? l.days_on_market ?? 0,
    dealer_name: l.dealer?.name ?? l.dealer_name ?? "",
    dealer_city: l.dealer?.city ?? l.dealer_city ?? "",
    dealer_state: l.dealer?.state ?? l.dealer_state ?? "",
    dealer_distance: l.dealer?.distance ?? l.dealer_distance ?? undefined,
  };
}

// ── Data Flow ──────────────────────────────────────────────────────────────
async function doSearch(append: boolean) {
  const makes = filterMakes.size > 0 ? [...filterMakes].join(",") : undefined;
  const bodyTypes = filterBodyTypes.size > 0 ? [...filterBodyTypes].join(",") : undefined;
  const fuelTypes = filterFuelTypes.size > 0 ? [...filterFuelTypes].join(",") : undefined;

  let priceRange: string | undefined;
  if (filterPriceMin || filterPriceMax) {
    priceRange = `${filterPriceMin || "0"}-${filterPriceMax || "999999"}`;
  }

  let yearRange: string | undefined;
  if (filterYearMin || filterYearMax) {
    yearRange = `${filterYearMin || "2000"}-${filterYearMax || "2025"}`;
  }

  const sortMap: Record<string, { sort_by: string; sort_order: string }> = {
    price_asc: { sort_by: "price", sort_order: "asc" },
    price_desc: { sort_by: "price", sort_order: "desc" },
    miles_asc: { sort_by: "miles", sort_order: "asc" },
    year_desc: { sort_by: "year", sort_order: "desc" },
  };
  const sort = sortMap[filterSort] ?? sortMap.price_asc;

  const args: Record<string, unknown> = {
    rows: 12,
    start: searchStart,
    sort_by: sort.sort_by,
    sort_order: sort.sort_order,
    stats: "price,miles",
  };
  if (makes) args.makes = makes;
  if (bodyTypes) args.bodyTypes = bodyTypes;
  if (fuelTypes) args.fuelTypes = fuelTypes;
  if (priceRange) args.priceRange = priceRange;
  if (yearRange) args.yearRange = yearRange;
  if (filterMilesMax) args.milesMax = Number(filterMilesMax);
  if (filterZip) args.zip = filterZip;
  if (filterZip) args.radius = filterRadius;

  try {
    const raw: any = await _callTool("search-cars", args);

    if (raw && raw.listings) {
      const mapped: Listing[] = raw.listings.map((l: any) => mapApiListing(l));
      if (append) {
        allListings = [...allListings, ...mapped];
      } else {
        // Preserve previously selected cars that aren't in new results
        const newVins = new Set(mapped.map(l => l.vin));
        const kept = savedCompareListings.filter(l => compareSet.has(l.vin) && !newVins.has(l.vin));
        allListings = [...kept, ...mapped];
      }
      displayedListings = [...allListings];
      searchTotal = raw.num_found ?? mapped.length;
      currentStats = raw.stats;
      sortListings();
      render();
      return;
    }
  } catch (_e) {
    // Fallback to mock data
  }

  // Mock fallback
  let filtered = [...MOCK_LISTINGS];
  if (makes) {
    const makeSet = new Set(makes.split(","));
    filtered = filtered.filter((l) => makeSet.has(l.make));
  }
  if (bodyTypes) {
    const btSet = new Set(bodyTypes.split(","));
    filtered = filtered.filter((l) => btSet.has(l.body_type));
  }
  if (fuelTypes) {
    const ftSet = new Set(fuelTypes.split(","));
    filtered = filtered.filter((l) => ftSet.has(l.fuel_type));
  }
  if (filterPriceMin) filtered = filtered.filter((l) => l.price >= Number(filterPriceMin));
  if (filterPriceMax) filtered = filtered.filter((l) => l.price <= Number(filterPriceMax));
  if (filterYearMin) filtered = filtered.filter((l) => l.year >= Number(filterYearMin));
  if (filterYearMax) filtered = filtered.filter((l) => l.year <= Number(filterYearMax));
  if (filterMilesMax) filtered = filtered.filter((l) => l.miles <= Number(filterMilesMax));

  allListings = filtered;
  displayedListings = [...filtered];
  searchTotal = filtered.length;
  sortListings();
  render();
}

async function doCompare() {
  const vins = [...compareSet];
  if (vins.length < 2) return;

  try {
    const result = await _callTool("compare-cars", { vins });

    if (result && result.cars) {
      for (const car of result.cars) {
        const mapped = mapApiListing(car);
        const idx = allListings.findIndex((l) => l.vin === mapped.vin);
        if (idx >= 0) {
          allListings[idx] = { ...allListings[idx], ...mapped };
        } else {
          allListings.push(mapped);
        }
      }
    }
  } catch (_e) {
    // Continue with existing data
  }

  render();
}

function sortListings() {
  const sort = filterSort;
  displayedListings.sort((a, b) => {
    switch (sort) {
      case "price_asc": return a.price - b.price;
      case "price_desc": return b.price - a.price;
      case "miles_asc": return a.miles - b.miles;
      case "year_desc": return b.year - a.year;
      default: return 0;
    }
  });
}

// ── DOM Helpers ────────────────────────────────────────────────────────────
function el(tag: string, props?: Record<string, string>): HTMLElement {
  const e = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (k === "style") e.style.cssText = v;
      else if (k === "textContent") e.textContent = v;
      else e.setAttribute(k, v);
    }
  }
  return e;
}

function makeInput(placeholder: string, value: string, width = "120px", type = "text"): HTMLInputElement {
  const input = document.createElement("input");
  input.type = type;
  input.placeholder = placeholder;
  input.value = value;
  input.style.cssText = `padding:6px 10px;border-radius:6px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;font-size:12px;outline:none;width:${width};`;
  return input;
}

function makeSelect(options: Array<{ value: string; label: string }>, selected?: string): HTMLSelectElement {
  const sel = document.createElement("select");
  sel.style.cssText = "padding:6px 10px;border-radius:6px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;font-size:12px;outline:none;";
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === selected) o.selected = true;
    sel.appendChild(o);
  }
  return sel;
}

function makeButton(text: string, onClick: () => void, variant: "primary" | "secondary" = "primary"): HTMLElement {
  const btn = document.createElement("button");
  btn.textContent = text;
  const isPrimary = variant === "primary";
  btn.style.cssText = `padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid ${isPrimary ? "#3b82f6" : "#475569"};background:${isPrimary ? "#3b82f6" : "transparent"};color:${isPrimary ? "#fff" : "#e2e8f0"};transition:opacity 0.15s;`;
  btn.addEventListener("click", onClick);
  btn.addEventListener("mouseenter", () => { btn.style.opacity = "0.85"; });
  btn.addEventListener("mouseleave", () => { btn.style.opacity = "1"; });
  return btn;
}

// ── Init ───────────────────────────────────────────────────────────────────
(function boot() {
  // Pre-fill filters from URL params
  const params = new URLSearchParams(location.search);
  const make = params.get("make");
  if (make) filterMakes = new Set(make.split(","));
  const bodyType = params.get("body_type");
  if (bodyType) filterBodyTypes = new Set(bodyType.split(","));
  const fuelType = params.get("fuel_type");
  if (fuelType) filterFuelTypes = new Set(fuelType.split(","));
  if (params.get("zip")) filterZip = params.get("zip")!;
  if (params.get("radius")) filterRadius = Number(params.get("radius"));
  if (params.get("price_min")) filterPriceMin = params.get("price_min")!;
  if (params.get("price_max")) filterPriceMax = params.get("price_max")!;
  if (params.get("year_min")) filterYearMin = params.get("year_min")!;
  if (params.get("year_max")) filterYearMax = params.get("year_max")!;
  if (params.get("miles_max")) filterMilesMax = params.get("miles_max")!;
  if (params.get("sort_by")) filterSort = params.get("sort_by")!;

  render();

  // Auto-search if any filter params were provided
  const hasFilters = make || bodyType || fuelType || filterZip || filterPriceMin || filterPriceMax || filterYearMin || filterYearMax || filterMilesMax;
  if (hasFilters) {
    searchStart = 0;
    doSearch(false);
  }
})();
