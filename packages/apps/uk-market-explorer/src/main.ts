import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "uk-market-explorer" }); } catch {}

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
  for (const key of ["vin", "zip", "make", "model", "miles", "state", "dealer_id", "ticker", "price", "postal_code", "radius", "year_min", "year_max", "price_min", "price_max"]) {
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
  const active = await _mcUkActive({make:args.make,model:args.model,year:args.year,postal_code:args.postal_code,radius:args.radius,price_range:args.price_range,miles_range:args.miles_range,rows:args.rows??25,stats:"price,miles",start:args.start});
  let recent = null;
  try { recent = await _mcUkRecent({make:args.make,model:args.model,rows:10,stats:"price"}); } catch {}
  return {active,recent};
}

async function _callTool(toolName, args) {
  const auth = _getAuth();
  if (auth.value) {
    // 1. Proxy (same-origin, reliable)
    try {
      const r = await fetch((_proxyBase()) + "/api/proxy/" + toolName, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, _auth_mode: auth.mode, _auth_value: auth.value }),
      });
      if (r.ok) { const d = await r.json(); return { content: [{ type: "text", text: JSON.stringify(d) }] }; }
    } catch {}
    // 2. Direct API fallback
    try {
      const data = await _fetchDirect(args);
      if (data) return { content: [{ type: "text", text: JSON.stringify(data) }] };
    } catch {}
  }
  // 3. MCP mode (Claude, VS Code, etc.)
  if (_safeApp) {
    try { return await _safeApp.callServerTool({ name: toolName, arguments: args }); } catch {}
  }
  // 4. Demo mode
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
        width: 100% !important; min-width: 0 !important;
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
interface UkListing {
  id: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  miles: number;
  city: string;
  dealer_name: string;
  body_type: string;
  fuel_type: string;
  engine: string;
  transmission: string;
  exterior_color: string;
  registration: string;
}

interface RecentSale {
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  miles: number;
  sold_date: string;
  city: string;
}

interface SearchState {
  postal_code: string;
  radius: number;
  make: string;
  model: string;
  year_min: string;
  year_max: string;
  price_min: string;
  price_max: string;
}

// ── Mock Data ──────────────────────────────────────────────────────────────
const UK_CITIES = ["London", "Birmingham", "Manchester", "Leeds", "Bristol", "Liverpool", "Sheffield", "Edinburgh", "Glasgow", "Cardiff", "Nottingham", "Newcastle", "Brighton", "Oxford", "Cambridge"];
const UK_DEALERS = ["AutoTrader Select", "Evans Halshaw", "Arnold Clark", "Lookers", "Peter Vardy", "Pendragon", "JCT600", "Jardine Motors", "Sytner Group", "Inchcape", "Marshall Motor", "Vertu Motors", "Caffyns", "Hendy Group", "Listers Group"];

const MOCK_LISTINGS: UkListing[] = [
  { id: "UK001", year: 2022, make: "Ford", model: "Fiesta", trim: "Titanium", price: 14250, miles: 18400, city: "London", dealer_name: "Evans Halshaw", body_type: "Hatchback", fuel_type: "Petrol", engine: "1.0L EcoBoost", transmission: "Manual", exterior_color: "Magnetic Grey", registration: "WR22 ABC" },
  { id: "UK002", year: 2021, make: "Volkswagen", model: "Golf", trim: "R-Line", price: 22800, miles: 24500, city: "Birmingham", dealer_name: "Sytner Group", body_type: "Hatchback", fuel_type: "Petrol", engine: "1.5L TSI", transmission: "DSG", exterior_color: "Atlantic Blue", registration: "BH21 DEF" },
  { id: "UK003", year: 2023, make: "BMW", model: "3 Series", trim: "320d M Sport", price: 34500, miles: 8200, city: "Manchester", dealer_name: "Inchcape", body_type: "Saloon", fuel_type: "Diesel", engine: "2.0L TwinPower Turbo", transmission: "Automatic", exterior_color: "Black Sapphire", registration: "MA23 GHI" },
  { id: "UK004", year: 2022, make: "Audi", model: "A3", trim: "S Line", price: 26900, miles: 15800, city: "Leeds", dealer_name: "JCT600", body_type: "Hatchback", fuel_type: "Petrol", engine: "1.5L TFSI", transmission: "S tronic", exterior_color: "Glacier White", registration: "LS22 JKL" },
  { id: "UK005", year: 2021, make: "Toyota", model: "Yaris", trim: "Design", price: 16400, miles: 22300, city: "Bristol", dealer_name: "Listers Group", body_type: "Hatchback", fuel_type: "Hybrid", engine: "1.5L Hybrid", transmission: "CVT", exterior_color: "Tokyo Red", registration: "BS21 MNO" },
  { id: "UK006", year: 2023, make: "Ford", model: "Fiesta", trim: "ST-Line", price: 17800, miles: 5600, city: "Liverpool", dealer_name: "Arnold Clark", body_type: "Hatchback", fuel_type: "Petrol", engine: "1.0L EcoBoost", transmission: "Manual", exterior_color: "Race Red", registration: "LV23 PQR" },
  { id: "UK007", year: 2022, make: "Volkswagen", model: "Golf", trim: "GTI", price: 31200, miles: 12700, city: "Sheffield", dealer_name: "Vertu Motors", body_type: "Hatchback", fuel_type: "Petrol", engine: "2.0L TSI", transmission: "DSG", exterior_color: "Kings Red", registration: "SH22 STU" },
  { id: "UK008", year: 2020, make: "BMW", model: "3 Series", trim: "330e M Sport", price: 28900, miles: 35600, city: "Edinburgh", dealer_name: "Peter Vardy", body_type: "Saloon", fuel_type: "Hybrid", engine: "2.0L Plug-in Hybrid", transmission: "Automatic", exterior_color: "Mineral Grey", registration: "ED20 VWX" },
  { id: "UK009", year: 2023, make: "Audi", model: "A3", trim: "Technik", price: 28400, miles: 9100, city: "Glasgow", dealer_name: "Arnold Clark", body_type: "Saloon", fuel_type: "Diesel", engine: "2.0L TDI", transmission: "S tronic", exterior_color: "Navarra Blue", registration: "GL23 YZA" },
  { id: "UK010", year: 2022, make: "Toyota", model: "Yaris", trim: "Excel", price: 19200, miles: 11500, city: "Cardiff", dealer_name: "Hendy Group", body_type: "Hatchback", fuel_type: "Hybrid", engine: "1.5L Hybrid", transmission: "CVT", exterior_color: "Brass Gold", registration: "CF22 BCD" },
  { id: "UK011", year: 2021, make: "Ford", model: "Focus", trim: "Active", price: 19800, miles: 28900, city: "Nottingham", dealer_name: "Pendragon", body_type: "Hatchback", fuel_type: "Petrol", engine: "1.0L EcoBoost", transmission: "Automatic", exterior_color: "Desert Island Blue", registration: "NG21 EFG" },
  { id: "UK012", year: 2022, make: "Volkswagen", model: "Polo", trim: "Match", price: 15600, miles: 19700, city: "Newcastle", dealer_name: "Lookers", body_type: "Hatchback", fuel_type: "Petrol", engine: "1.0L TSI", transmission: "Manual", exterior_color: "Reflex Silver", registration: "NC22 HIJ" },
  { id: "UK013", year: 2023, make: "BMW", model: "1 Series", trim: "M Sport", price: 29800, miles: 6400, city: "Brighton", dealer_name: "Jardine Motors", body_type: "Hatchback", fuel_type: "Petrol", engine: "2.0L TwinPower Turbo", transmission: "Automatic", exterior_color: "Misano Blue", registration: "BN23 KLM" },
  { id: "UK014", year: 2021, make: "Audi", model: "Q3", trim: "Sport", price: 27500, miles: 31200, city: "Oxford", dealer_name: "Inchcape", body_type: "SUV", fuel_type: "Petrol", engine: "1.5L TFSI", transmission: "S tronic", exterior_color: "Chronos Grey", registration: "OX21 NOP" },
  { id: "UK015", year: 2022, make: "Toyota", model: "Corolla", trim: "GR Sport", price: 24300, miles: 14800, city: "Cambridge", dealer_name: "Marshall Motor", body_type: "Hatchback", fuel_type: "Hybrid", engine: "2.0L Hybrid", transmission: "CVT", exterior_color: "Scarlet Flare", registration: "CB22 QRS" },
  { id: "UK016", year: 2020, make: "Ford", model: "Puma", trim: "ST-Line X", price: 18500, miles: 32100, city: "London", dealer_name: "Evans Halshaw", body_type: "SUV", fuel_type: "Petrol", engine: "1.0L EcoBoost Hybrid", transmission: "Manual", exterior_color: "Lucid Red", registration: "LO20 TUV" },
  { id: "UK017", year: 2023, make: "Volkswagen", model: "T-Roc", trim: "Style", price: 27100, miles: 7800, city: "Birmingham", dealer_name: "Sytner Group", body_type: "SUV", fuel_type: "Petrol", engine: "1.5L TSI", transmission: "DSG", exterior_color: "Ravenna Blue", registration: "BH23 WXY" },
  { id: "UK018", year: 2022, make: "BMW", model: "X1", trim: "xDrive25e M Sport", price: 33800, miles: 16500, city: "Manchester", dealer_name: "Caffyns", body_type: "SUV", fuel_type: "Hybrid", engine: "1.5L Plug-in Hybrid", transmission: "Automatic", exterior_color: "Phytonic Blue", registration: "MA22 ZAB" },
  { id: "UK019", year: 2021, make: "Audi", model: "A1", trim: "Vorsprung", price: 21600, miles: 20400, city: "Leeds", dealer_name: "JCT600", body_type: "Hatchback", fuel_type: "Petrol", engine: "1.5L TFSI", transmission: "S tronic", exterior_color: "Python Yellow", registration: "LS21 CDE" },
  { id: "UK020", year: 2023, make: "Toyota", model: "RAV4", trim: "Dynamic", price: 35200, miles: 4200, city: "Bristol", dealer_name: "Listers Group", body_type: "SUV", fuel_type: "Hybrid", engine: "2.5L Hybrid AWD", transmission: "CVT", exterior_color: "Emotional Red", registration: "BS23 FGH" },
];

const MOCK_RECENT_SALES: RecentSale[] = [
  { year: 2022, make: "Ford", model: "Fiesta", trim: "Titanium", price: 13800, miles: 21500, sold_date: "2024-01-15", city: "London" },
  { year: 2021, make: "Volkswagen", model: "Golf", trim: "R-Line", price: 21400, miles: 28700, sold_date: "2024-01-12", city: "Manchester" },
  { year: 2023, make: "BMW", model: "3 Series", trim: "320d Sport", price: 32100, miles: 11200, sold_date: "2024-01-10", city: "Edinburgh" },
  { year: 2022, make: "Audi", model: "A3", trim: "Sport", price: 24500, miles: 18900, sold_date: "2024-01-08", city: "Leeds" },
  { year: 2021, make: "Toyota", model: "Yaris", trim: "Icon", price: 14900, miles: 26800, sold_date: "2024-01-06", city: "Bristol" },
  { year: 2022, make: "Ford", model: "Focus", trim: "Titanium", price: 17200, miles: 24300, sold_date: "2024-01-04", city: "Birmingham" },
  { year: 2023, make: "Volkswagen", model: "Polo", trim: "Life", price: 16800, miles: 7600, sold_date: "2024-01-02", city: "Liverpool" },
  { year: 2020, make: "BMW", model: "1 Series", trim: "118i Sport", price: 20500, miles: 38400, sold_date: "2023-12-28", city: "Glasgow" },
  { year: 2022, make: "Toyota", model: "Corolla", trim: "Design", price: 21800, miles: 17500, sold_date: "2023-12-22", city: "Cardiff" },
  { year: 2021, make: "Audi", model: "Q3", trim: "Technik", price: 25300, miles: 34100, sold_date: "2023-12-18", city: "Newcastle" },
];

// ── Constants ──────────────────────────────────────────────────────────────
const UK_MAKES = ["Any", "Audi", "BMW", "Ford", "Honda", "Hyundai", "Kia", "Mercedes-Benz", "Nissan", "Peugeot", "Renault", "SEAT", "Skoda", "Toyota", "Vauxhall", "Volkswagen", "Volvo"];
const RADIUS_OPTIONS = [10, 25, 50, 100, 200];

// ── API Normalizers ────────────────────────────────────────────────────────
// MarketCheck UK API returns listings with nested `build` and `dealer` objects
// (e.g. listing.build.year, listing.dealer.city). A proxy may pre-flatten these.
// These normalizers accept either shape and return the flat UkListing / RecentSale
// the UI renders from.
function _normalizeListing(l: any, idx: number): UkListing {
  const b = l.build || {};
  const d = l.dealer || {};
  const engine = l.engine ?? b.engine ?? (b.engine_size ? `${b.engine_size}L` : "") ?? "";
  return {
    id: String(l.id ?? l.vin ?? `API-${idx}`),
    year: Number(l.year ?? b.year ?? 0),
    make: String(l.make ?? b.make ?? ""),
    model: String(l.model ?? b.model ?? ""),
    trim: String(l.trim ?? b.trim ?? ""),
    price: Number(l.price ?? 0),
    miles: Number(l.miles ?? 0),
    city: String(l.city ?? d.city ?? ""),
    dealer_name: String(l.dealer_name ?? d.dealer_name ?? d.name ?? ""),
    body_type: String(l.body_type ?? b.body_type ?? ""),
    fuel_type: String(l.fuel_type ?? b.fuel_type ?? ""),
    engine: String(engine),
    transmission: String(l.transmission ?? b.transmission ?? ""),
    exterior_color: String(l.exterior_color ?? l.ref_color ?? b.exterior_color ?? ""),
    registration: String(l.registration ?? l.registration_num ?? l.vin ?? ""),
  };
}

function _normalizeRecent(r: any): RecentSale {
  const b = r.build || {};
  const d = r.dealer || {};
  return {
    year: Number(r.year ?? b.year ?? 0),
    make: String(r.make ?? b.make ?? ""),
    model: String(r.model ?? b.model ?? ""),
    trim: String(r.trim ?? b.trim ?? ""),
    price: Number(r.price ?? r.last_seen_price ?? 0),
    miles: Number(r.miles ?? 0),
    // UK Recents returns close-out date as `last_seen_at_date` (ISO string).
    // Slice to YYYY-MM-DD so the Recently Sold table stays compact.
    sold_date: String(r.sold_date ?? r.last_seen_at_date ?? r.last_seen_date ?? r.removed_date ?? "").slice(0, 10),
    city: String(r.city ?? d.city ?? ""),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtGBP(v: number | undefined): string {
  if (v == null || isNaN(v)) return "N/A";
  return "\u00A3" + Math.round(v).toLocaleString("en-GB");
}

function fmtMiles(v: number | undefined): string {
  if (v == null) return "N/A";
  return Math.round(v).toLocaleString("en-GB") + " mi";
}

function makeColorFromMake(make: string): string {
  const palette: Record<string, string> = {
    "Ford": "#1e40af", "Volkswagen": "#0369a1", "BMW": "#0284c7",
    "Audi": "#6d28d9", "Toyota": "#dc2626", "Mercedes-Benz": "#475569",
    "Vauxhall": "#b91c1c", "Nissan": "#c2410c", "Hyundai": "#0f766e",
    "Kia": "#7c3aed", "Honda": "#0891b2", "Peugeot": "#1d4ed8",
  };
  if (palette[make]) return palette[make];
  let hash = 0;
  for (let i = 0; i < make.length; i++) hash = make.charCodeAt(i) + ((hash << 5) - hash);
  const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];
  return colors[Math.abs(hash) % colors.length];
}

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

// ── State ──────────────────────────────────────────────────────────────────
let listings: UkListing[] = [];
let recentSales: RecentSale[] = [];
let compareIds: Set<string> = new Set();
let showCompare = false;
let loading = false;
let searchPerformed = false;
let numFound = 0;
let avgPrice = 0;
let avgMiles = 0;

const searchState: SearchState = {
  postal_code: "",
  radius: 50,
  make: "Any",
  model: "",
  year_min: "",
  year_max: "",
  price_min: "",
  price_max: "",
};

// ── Data Loading ───────────────────────────────────────────────────────────
async function loadData() {
  loading = true;
  render();

  try {
    const args: Record<string, any> = { rows: 20 };
    if (searchState.postal_code) args.postal_code = searchState.postal_code;
    if (searchState.radius) args.radius = searchState.radius;
    if (searchState.make && searchState.make !== "Any") args.make = searchState.make;
    if (searchState.model) args.model = searchState.model;
    if (searchState.year_min || searchState.year_max) {
      args.year = `${searchState.year_min || "2015"}-${searchState.year_max || "2025"}`;
    }
    if (searchState.price_min || searchState.price_max) {
      args.price_range = `${searchState.price_min || "0"}-${searchState.price_max || "100000"}`;
    }
    args.stats = "price,miles";

    const result = await _callTool("search-uk-cars", args);
    if (result) {
      const data = JSON.parse(result.content[0].text);
      // Unwrap {active, recent} (direct fetch) or treat {listings, ...} (proxy) as root.
      const activeSrc = data.active ?? data;
      const recentSrc = data.recent ?? data;
      const rawListings: any[] = activeSrc?.listings ?? [];
      const rawRecent: any[] = recentSrc?.listings ?? recentSrc?.recent_sales ?? [];
      if (rawListings.length > 0) {
        listings = rawListings.map(_normalizeListing);
        recentSales = rawRecent.slice(0, 10).map(_normalizeRecent);
        numFound = activeSrc?.num_found ?? listings.length;
        const priceStats = activeSrc?.stats?.price ?? {};
        const milesStats = activeSrc?.stats?.miles ?? {};
        avgPrice = priceStats.avg ?? priceStats.mean ?? (listings.reduce((s, l) => s + l.price, 0) / listings.length);
        avgMiles = milesStats.avg ?? milesStats.mean ?? (listings.reduce((s, l) => s + l.miles, 0) / listings.length);
        searchPerformed = true;
        loading = false;
        render();
        return;
      }
    }
  } catch {}

  // Fall back to mock data
  let filtered = [...MOCK_LISTINGS];
  if (searchState.make && searchState.make !== "Any") {
    filtered = filtered.filter(l => l.make === searchState.make);
  }
  if (searchState.model) {
    const m = searchState.model.toLowerCase();
    filtered = filtered.filter(l => l.model.toLowerCase().includes(m));
  }
  if (searchState.year_min) {
    filtered = filtered.filter(l => l.year >= parseInt(searchState.year_min));
  }
  if (searchState.year_max) {
    filtered = filtered.filter(l => l.year <= parseInt(searchState.year_max));
  }
  if (searchState.price_min) {
    filtered = filtered.filter(l => l.price >= parseInt(searchState.price_min));
  }
  if (searchState.price_max) {
    filtered = filtered.filter(l => l.price <= parseInt(searchState.price_max));
  }

  listings = filtered;
  recentSales = MOCK_RECENT_SALES;
  numFound = filtered.length;
  avgPrice = filtered.length > 0 ? filtered.reduce((s, l) => s + l.price, 0) / filtered.length : 0;
  avgMiles = filtered.length > 0 ? filtered.reduce((s, l) => s + l.miles, 0) / filtered.length : 0;
  searchPerformed = true;
  loading = false;
  render();
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  document.body.innerHTML = "";
  document.body.style.cssText = "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;overflow-x:hidden;min-height:100vh;";

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
  const header = el("div", { style: "background:#1e293b;padding:12px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:12px;" });
  const titleArea = el("div", { style: "display:flex;align-items:center;gap:10px;" });
  titleArea.innerHTML = `<span style="font-size:22px;">&#127468;&#127463;</span><h1 style="margin:0;font-size:18px;font-weight:700;color:#f8fafc;">UK Market Explorer</h1>`;
  header.appendChild(titleArea);
  _addSettingsBar(header);
  document.body.appendChild(header);

  const container = el("div", { style: "max-width:1400px;margin:0 auto;padding:20px;" });

  // ── Demo mode banner (always visible while in demo mode) ──
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
    _db.querySelector("#_banner_save")!.addEventListener("click", () => {
      const k = (_db.querySelector("#_banner_key") as HTMLInputElement).value.trim();
      if (!k) return;
      localStorage.setItem("mc_api_key", k);
      _db.style.background = "linear-gradient(135deg,#05966922,#10b98111)";
      _db.style.borderColor = "#10b98144";
      _db.innerHTML = '<div style="font-size:13px;font-weight:700;color:#10b981;">&#10003; API key saved — reloading with live data...</div>';
      setTimeout(() => location.reload(), 800);
    });
    _db.querySelector("#_banner_key")!.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") (_db.querySelector("#_banner_save") as HTMLElement).click(); });
  }

  // Search Form
  renderSearchForm(container);

  if (loading) {
    const spin = el("div", { style: "text-align:center;padding:60px 0;" });
    spin.innerHTML = `<div style="display:inline-block;width:40px;height:40px;border:3px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;"></div><div style="margin-top:12px;color:#94a3b8;font-size:14px;">Searching UK market...</div>`;
    container.appendChild(spin);
    document.body.appendChild(container);
    return;
  }

  if (showCompare && compareIds.size > 0) {
    renderCompareDrawer(container);
  }

  if (searchPerformed) {
    renderKPIs(container);
    renderCardGrid(container);
    renderScatterPlot(container);
    renderMakeDistribution(container);
    renderRecentSales(container);
    renderSummaryFooter(container);
  } else {
    const welcome = el("div", { style: "text-align:center;padding:60px 20px;color:#94a3b8;" });
    welcome.innerHTML = `<div style="font-size:48px;margin-bottom:16px;">&#128663;</div><h2 style="color:#f8fafc;font-size:20px;margin-bottom:8px;">Search the UK Used Car Market</h2><p style="font-size:14px;">Enter a postal code and filters above, then click Search to find vehicles.</p>`;
    container.appendChild(welcome);
  }

  document.body.appendChild(container);
}

// ── Search Form ────────────────────────────────────────────────────────────
function renderSearchForm(container: HTMLElement) {
  const panel = el("div", { style: "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:20px;" });
  const title = el("h2", { style: "margin:0 0 16px 0;font-size:15px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;" });
  title.textContent = "Search Filters";
  panel.appendChild(title);

  const grid = el("div", { style: "display:grid;grid-template-columns:repeat(4, 1fr);gap:12px;" });

  // Postal code
  const pcGroup = makeFormGroup("Postal Code", "text", searchState.postal_code, "e.g. SW1A 1AA", (v) => { searchState.postal_code = v; });
  grid.appendChild(pcGroup);

  // Radius
  const radGroup = makeSelectGroup("Radius", RADIUS_OPTIONS.map(r => ({ value: String(r), label: `${r} mi` })), String(searchState.radius), (v) => { searchState.radius = parseInt(v); });
  grid.appendChild(radGroup);

  // Make
  const makeGroup = makeSelectGroup("Make", UK_MAKES.map(m => ({ value: m, label: m })), searchState.make, (v) => { searchState.make = v; });
  grid.appendChild(makeGroup);

  // Model
  const modelGroup = makeFormGroup("Model", "text", searchState.model, "e.g. Golf", (v) => { searchState.model = v; });
  grid.appendChild(modelGroup);

  // Year Min
  const yearMinGroup = makeFormGroup("Year From", "number", searchState.year_min, "2015", (v) => { searchState.year_min = v; });
  grid.appendChild(yearMinGroup);

  // Year Max
  const yearMaxGroup = makeFormGroup("Year To", "number", searchState.year_max, "2025", (v) => { searchState.year_max = v; });
  grid.appendChild(yearMaxGroup);

  // Price Min
  const priceMinGroup = makeFormGroup("Min Price (\u00A3)", "number", searchState.price_min, "0", (v) => { searchState.price_min = v; });
  grid.appendChild(priceMinGroup);

  // Price Max
  const priceMaxGroup = makeFormGroup("Max Price (\u00A3)", "number", searchState.price_max, "100000", (v) => { searchState.price_max = v; });
  grid.appendChild(priceMaxGroup);

  panel.appendChild(grid);

  const btnRow = el("div", { style: "display:flex;gap:10px;margin-top:16px;" });
  const searchBtn = makeButton("Search", () => { loadData(); }, "primary");
  searchBtn.style.cssText += "padding:10px 32px;font-size:14px;";
  btnRow.appendChild(searchBtn);

  const resetBtn = makeButton("Reset", () => {
    searchState.postal_code = ""; searchState.radius = 50; searchState.make = "Any";
    searchState.model = ""; searchState.year_min = ""; searchState.year_max = "";
    searchState.price_min = ""; searchState.price_max = "";
    listings = []; recentSales = []; compareIds.clear(); showCompare = false;
    searchPerformed = false; render();
  }, "secondary");
  btnRow.appendChild(resetBtn);

  if (compareIds.size > 0) {
    const compBtn = makeButton(`Compare (${compareIds.size})`, () => { showCompare = !showCompare; render(); }, "secondary");
    compBtn.style.cssText += "margin-left:auto;border-color:#8b5cf6;color:#c4b5fd;";
    btnRow.appendChild(compBtn);
  }

  panel.appendChild(btnRow);
  container.appendChild(panel);
}

function makeFormGroup(label: string, type: string, value: string, placeholder: string, onChange: (v: string) => void): HTMLElement {
  const g = el("div", { style: "display:flex;flex-direction:column;gap:4px;" });
  const lbl = el("label", { style: "font-size:11px;color:#94a3b8;font-weight:500;" });
  lbl.textContent = label;
  g.appendChild(lbl);
  const inp = document.createElement("input");
  inp.type = type;
  inp.value = value;
  inp.placeholder = placeholder;
  inp.style.cssText = "padding:8px 10px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;";
  inp.addEventListener("input", () => onChange(inp.value));
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") loadData(); });
  g.appendChild(inp);
  return g;
}

function makeSelectGroup(label: string, options: { value: string; label: string }[], selected: string, onChange: (v: string) => void): HTMLElement {
  const g = el("div", { style: "display:flex;flex-direction:column;gap:4px;" });
  const lbl = el("label", { style: "font-size:11px;color:#94a3b8;font-weight:500;" });
  lbl.textContent = label;
  g.appendChild(lbl);
  const sel = document.createElement("select");
  sel.style.cssText = "padding:8px 10px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;";
  for (const o of options) {
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    if (o.value === selected) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => onChange(sel.value));
  g.appendChild(sel);
  return g;
}

// ── KPI Ribbon ─────────────────────────────────────────────────────────────
function renderKPIs(container: HTMLElement) {
  const kpis = [
    { label: "Total Found", value: numFound.toLocaleString("en-GB"), color: "#3b82f6" },
    { label: "Avg Price", value: fmtGBP(avgPrice), color: "#10b981" },
    { label: "Avg Mileage", value: fmtMiles(avgMiles), color: "#f59e0b" },
    { label: "Results Shown", value: String(listings.length), color: "#8b5cf6" },
  ];

  const row = el("div", { style: "display:grid;grid-template-columns:repeat(4, 1fr);gap:12px;margin-bottom:20px;" });
  for (const kpi of kpis) {
    const card = el("div", { style: `background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px;border-left:3px solid ${kpi.color};` });
    card.innerHTML = `<div style="font-size:11px;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">${kpi.label}</div><div style="font-size:22px;font-weight:700;color:#f8fafc;">${kpi.value}</div>`;
    row.appendChild(card);
  }
  container.appendChild(row);
}

// ── Card Grid ──────────────────────────────────────────────────────────────
function renderCardGrid(container: HTMLElement) {
  const section = el("div", { style: "margin-bottom:24px;" });
  const hdr = el("div", { style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;" });
  const h2 = el("h2", { style: "margin:0;font-size:16px;font-weight:600;color:#f8fafc;" });
  h2.textContent = "Vehicle Listings";
  hdr.appendChild(h2);
  section.appendChild(hdr);

  const grid = el("div", { style: "display:grid;grid-template-columns:repeat(3, 1fr);gap:16px;" });

  for (const listing of listings) {
    const isSelected = compareIds.has(listing.id);
    const isBelowAvg = listing.price < avgPrice;
    const color = makeColorFromMake(listing.make);

    const card = el("div", {
      style: `background:#1e293b;border:1px solid ${isSelected ? "#8b5cf6" : "#334155"};border-radius:10px;overflow:hidden;transition:border-color 0.2s;cursor:pointer;`,
    });

    // Image placeholder
    const imgArea = el("div", { style: `height:140px;background:${color}22;display:flex;align-items:center;justify-content:center;position:relative;` });
    imgArea.innerHTML = `<span style="font-size:36px;color:${color};font-weight:700;opacity:0.6;">${listing.make.charAt(0)}${listing.model.charAt(0)}</span>`;

    if (isBelowAvg) {
      const badge = el("span", { style: "position:absolute;top:8px;right:8px;background:#059669;color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:10px;" });
      badge.textContent = "GOOD DEAL";
      imgArea.appendChild(badge);
    }

    card.appendChild(imgArea);

    // Info
    const info = el("div", { style: "padding:12px;" });
    info.innerHTML = `
      <div style="font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:4px;">${listing.year} ${listing.make} ${listing.model}</div>
      <div style="font-size:12px;color:#94a3b8;margin-bottom:8px;">${listing.trim}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:18px;font-weight:700;color:#10b981;">${fmtGBP(listing.price)}</span>
        <span style="font-size:12px;color:#94a3b8;">${fmtMiles(listing.miles)}</span>
      </div>
      <div style="font-size:11px;color:#64748b;margin-bottom:4px;">${listing.city} &bull; ${listing.fuel_type} &bull; ${listing.transmission}</div>
      <div style="font-size:11px;color:#64748b;margin-bottom:8px;">${listing.dealer_name}</div>
    `;

    const compBtn = document.createElement("button");
    compBtn.textContent = isSelected ? "Remove from Compare" : "Add to Compare";
    compBtn.style.cssText = `width:100%;padding:6px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid ${isSelected ? "#8b5cf6" : "#334155"};background:${isSelected ? "#8b5cf622" : "transparent"};color:${isSelected ? "#c4b5fd" : "#94a3b8"};`;
    compBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isSelected) { compareIds.delete(listing.id); }
      else if (compareIds.size < 3) { compareIds.add(listing.id); }
      render();
    });
    info.appendChild(compBtn);

    card.appendChild(info);
    grid.appendChild(card);
  }

  section.appendChild(grid);
  container.appendChild(section);
}

// ── Scatter Plot ───────────────────────────────────────────────────────────
function renderScatterPlot(container: HTMLElement) {
  if (listings.length < 2) return;

  const section = el("div", { style: "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:24px;" });
  const h2 = el("h2", { style: "margin:0 0 16px 0;font-size:16px;font-weight:600;color:#f8fafc;" });
  h2.textContent = "Price vs Mileage";
  section.appendChild(h2);

  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 380;
  canvas.style.cssText = "width:100%;max-width:800px;height:auto;";
  section.appendChild(canvas);
  container.appendChild(section);

  setTimeout(() => drawScatter(canvas), 0);
}

function drawScatter(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  const pad = { top: 20, right: 30, bottom: 50, left: 70 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, W, H);

  const prices = listings.map(l => l.price);
  const miles = listings.map(l => l.miles);
  const pMin = Math.min(...prices) * 0.9;
  const pMax = Math.max(...prices) * 1.1;
  const mMin = 0;
  const mMax = Math.max(...miles) * 1.15;
  const medianPrice = [...prices].sort((a, b) => a - b)[Math.floor(prices.length / 2)];
  const medianMiles = [...miles].sort((a, b) => a - b)[Math.floor(miles.length / 2)];

  function xPos(m: number): number { return pad.left + ((m - mMin) / (mMax - mMin)) * plotW; }
  function yPos(p: number): number { return pad.top + plotH - ((p - pMin) / (pMax - pMin)) * plotH; }

  // Grid lines
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = pad.top + (plotH / 5) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    const val = pMax - ((pMax - pMin) / 5) * i;
    ctx.fillStyle = "#64748b"; ctx.font = "11px sans-serif"; ctx.textAlign = "right";
    ctx.fillText(fmtGBP(val), pad.left - 8, y + 4);
  }
  for (let i = 0; i <= 5; i++) {
    const x = pad.left + (plotW / 5) * i;
    ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + plotH); ctx.stroke();
    const val = mMin + ((mMax - mMin) / 5) * i;
    ctx.fillStyle = "#64748b"; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(Math.round(val / 1000) + "K mi", x, H - pad.bottom + 20);
  }

  // Median lines
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = "#f59e0b88";
  ctx.lineWidth = 1.5;
  const medY = yPos(medianPrice);
  ctx.beginPath(); ctx.moveTo(pad.left, medY); ctx.lineTo(W - pad.right, medY); ctx.stroke();
  ctx.fillStyle = "#f59e0b"; ctx.font = "10px sans-serif"; ctx.textAlign = "left";
  ctx.fillText("Median: " + fmtGBP(medianPrice), W - pad.right - 120, medY - 6);

  ctx.strokeStyle = "#8b5cf688";
  const medX = xPos(medianMiles);
  ctx.beginPath(); ctx.moveTo(medX, pad.top); ctx.lineTo(medX, pad.top + plotH); ctx.stroke();
  ctx.fillStyle = "#8b5cf6"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("Median: " + Math.round(medianMiles / 1000) + "K mi", medX, pad.top - 4);
  ctx.setLineDash([]);

  // Dots
  for (const l of listings) {
    const cx = xPos(l.miles);
    const cy = yPos(l.price);
    const color = makeColorFromMake(l.make);
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Axis labels
  ctx.fillStyle = "#94a3b8"; ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Mileage", W / 2, H - 6);
  ctx.save();
  ctx.translate(14, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Price (\u00A3)", 0, 0);
  ctx.restore();
}

// ── Recently Sold Panel ────────────────────────────────────────────────────
function renderRecentSales(container: HTMLElement) {
  if (recentSales.length === 0) return;

  const section = el("div", { style: "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:24px;" });
  const h2 = el("h2", { style: "margin:0 0 16px 0;font-size:16px;font-weight:600;color:#f8fafc;" });
  h2.textContent = "Recently Sold";
  section.appendChild(h2);

  const tableWrap = el("div", { style: "overflow-x:auto;" });
  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;font-size:13px;";

  const thead = document.createElement("thead");
  thead.innerHTML = `<tr style="border-bottom:1px solid #334155;">
    <th style="text-align:left;padding:8px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Vehicle</th>
    <th style="text-align:right;padding:8px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Sold Price</th>
    <th style="text-align:right;padding:8px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Miles</th>
    <th style="text-align:left;padding:8px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">City</th>
    <th style="text-align:left;padding:8px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Date</th>
  </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const sale of recentSales) {
    const tr = document.createElement("tr");
    tr.style.cssText = "border-bottom:1px solid #334155;";
    tr.innerHTML = `
      <td style="padding:8px 12px;color:#e2e8f0;">${sale.year} ${sale.make} ${sale.model} ${sale.trim}</td>
      <td style="padding:8px 12px;text-align:right;color:#10b981;font-weight:600;">${fmtGBP(sale.price)}</td>
      <td style="padding:8px 12px;text-align:right;color:#e2e8f0;">${fmtMiles(sale.miles)}</td>
      <td style="padding:8px 12px;color:#94a3b8;">${sale.city}</td>
      <td style="padding:8px 12px;color:#94a3b8;">${sale.sold_date}</td>
    `;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  section.appendChild(tableWrap);
  container.appendChild(section);
}

// ── Compare Drawer ─────────────────────────────────────────────────────────
function renderCompareDrawer(container: HTMLElement) {
  const selected = listings.filter(l => compareIds.has(l.id));
  if (selected.length === 0) return;

  const section = el("div", { style: "background:#1e293b;border:1px solid #8b5cf644;border-radius:10px;padding:20px;margin-bottom:24px;" });
  const hdr = el("div", { style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;" });
  const h2 = el("h2", { style: "margin:0;font-size:16px;font-weight:600;color:#c4b5fd;" });
  h2.textContent = "Side-by-Side Comparison";
  hdr.appendChild(h2);
  const closeBtn = makeButton("Close", () => { showCompare = false; render(); }, "secondary");
  hdr.appendChild(closeBtn);
  section.appendChild(hdr);

  const grid = el("div", { style: `display:grid;grid-template-columns:repeat(${selected.length}, 1fr);gap:16px;` });

  for (const v of selected) {
    const card = el("div", { style: "background:#0f172a;border:1px solid #334155;border-radius:8px;padding:16px;" });
    const rows = [
      ["Vehicle", `${v.year} ${v.make} ${v.model}`],
      ["Trim", v.trim],
      ["Price", fmtGBP(v.price)],
      ["Mileage", fmtMiles(v.miles)],
      ["Body Type", v.body_type],
      ["Fuel Type", v.fuel_type],
      ["Engine", v.engine],
      ["Transmission", v.transmission],
      ["Colour", v.exterior_color],
      ["City", v.city],
      ["Dealer", v.dealer_name],
      ["Registration", v.registration],
    ];

    card.innerHTML = `<div style="font-size:15px;font-weight:700;color:#f8fafc;margin-bottom:12px;text-align:center;">${v.year} ${v.make} ${v.model}</div>`;
    for (const [label, value] of rows) {
      const row = el("div", { style: "display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1e293b;font-size:12px;" });
      row.innerHTML = `<span style="color:#94a3b8;">${label}</span><span style="color:#e2e8f0;font-weight:500;">${value}</span>`;
      card.appendChild(row);
    }
    grid.appendChild(card);
  }

  section.appendChild(grid);
  container.appendChild(section);
}

// ── Make Distribution Bar Chart ─────────────────────────────────────────────
function renderMakeDistribution(container: HTMLElement) {
  if (listings.length < 3) return;

  // Tally makes
  const makeCounts: Record<string, { count: number; totalPrice: number }> = {};
  for (const l of listings) {
    if (!makeCounts[l.make]) makeCounts[l.make] = { count: 0, totalPrice: 0 };
    makeCounts[l.make].count++;
    makeCounts[l.make].totalPrice += l.price;
  }
  const sorted = Object.entries(makeCounts)
    .map(([make, d]) => ({ make, count: d.count, avg: d.totalPrice / d.count }))
    .sort((a, b) => b.count - a.count);

  if (sorted.length < 2) return;

  const section = el("div", { style: "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:24px;" });
  const h2 = el("h2", { style: "margin:0 0 16px 0;font-size:16px;font-weight:600;color:#f8fafc;" });
  h2.textContent = "Results by Make";
  section.appendChild(h2);

  const canvas = document.createElement("canvas");
  canvas.width = 700;
  canvas.height = Math.max(180, sorted.length * 36 + 40);
  canvas.style.cssText = "width:100%;max-width:700px;height:auto;";
  section.appendChild(canvas);
  container.appendChild(section);

  setTimeout(() => drawMakeBars(canvas, sorted), 0);
}

function drawMakeBars(canvas: HTMLCanvasElement, data: { make: string; count: number; avg: number }[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  const pad = { top: 10, right: 80, bottom: 10, left: 120 };
  const plotW = W - pad.left - pad.right;
  const barH = 24;
  const gap = 8;
  const maxCount = Math.max(...data.map(d => d.count));

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const y = pad.top + i * (barH + gap);
    const bw = (d.count / maxCount) * plotW;
    const color = makeColorFromMake(d.make);

    // Label
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(d.make, pad.left - 8, y + barH / 2);

    // Bar
    const gradient = ctx.createLinearGradient(pad.left, 0, pad.left + bw, 0);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, color + "88");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(pad.left, y, bw, barH, [0, 6, 6, 0]);
    ctx.fill();

    // Count label
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${d.count} (avg ${fmtGBP(d.avg)})`, pad.left + bw + 6, y + barH / 2);
  }
}

// ── Summary Stats Footer ────────────────────────────────────────────────────
function renderSummaryFooter(container: HTMLElement) {
  if (!searchPerformed || listings.length === 0) return;

  const prices = listings.map(l => l.price).sort((a, b) => a - b);
  const medianPrice = prices[Math.floor(prices.length / 2)];
  const minPrice = prices[0];
  const maxPrice = prices[prices.length - 1];

  const miles = listings.map(l => l.miles).sort((a, b) => a - b);
  const medianMiles = miles[Math.floor(miles.length / 2)];

  const cities = new Set(listings.map(l => l.city));
  const dealers = new Set(listings.map(l => l.dealer_name));
  const makes = new Set(listings.map(l => l.make));

  const section = el("div", { style: "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:24px;" });
  const h2 = el("h2", { style: "margin:0 0 12px 0;font-size:15px;font-weight:600;color:#f8fafc;" });
  h2.textContent = "Search Summary";
  section.appendChild(h2);

  const grid = el("div", { style: "display:grid;grid-template-columns:repeat(4, 1fr);gap:12px;" });
  const stats = [
    { label: "Price Range", value: `${fmtGBP(minPrice)} - ${fmtGBP(maxPrice)}` },
    { label: "Median Price", value: fmtGBP(medianPrice) },
    { label: "Median Mileage", value: fmtMiles(medianMiles) },
    { label: "Makes", value: `${makes.size} makes` },
    { label: "Cities", value: `${cities.size} locations` },
    { label: "Dealers", value: `${dealers.size} dealers` },
    { label: "Below Average", value: `${listings.filter(l => l.price < avgPrice).length} vehicles` },
    { label: "Low Mileage (<15K)", value: `${listings.filter(l => l.miles < 15000).length} vehicles` },
  ];

  for (const s of stats) {
    const cell = el("div", { style: "padding:8px 0;" });
    cell.innerHTML = `<div style="font-size:11px;color:#64748b;margin-bottom:2px;">${s.label}</div><div style="font-size:13px;font-weight:600;color:#e2e8f0;">${s.value}</div>`;
    grid.appendChild(cell);
  }

  section.appendChild(grid);
  container.appendChild(section);
}

// ── Init ───────────────────────────────────────────────────────────────────
const urlParams = _getUrlParams();
if (urlParams.postal_code) searchState.postal_code = urlParams.postal_code;
if (urlParams.make) searchState.make = urlParams.make;
if (urlParams.model) searchState.model = urlParams.model;
if (urlParams.radius) {
  const r = parseInt(urlParams.radius);
  if (!isNaN(r)) searchState.radius = r;
}
if (urlParams.year_min) searchState.year_min = urlParams.year_min;
if (urlParams.year_max) searchState.year_max = urlParams.year_max;
if (urlParams.price_min) searchState.price_min = urlParams.price_min;
if (urlParams.price_max) searchState.price_max = urlParams.price_max;

if (searchState.postal_code || searchState.make !== "Any" || searchState.model) {
  loadData();
} else {
  render();
}
