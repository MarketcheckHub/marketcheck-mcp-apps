import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "market-anomaly-detector" }); } catch {}

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
function _isEmbedMode(): boolean { return new URLSearchParams(location.search).has("embed"); }
function _getUrlParams(): Record<string, string> { const params = new URLSearchParams(location.search); const result: Record<string, string> = {}; for (const key of ["vin","zip","make","model","miles","state","dealer_id","ticker","price","year","sensitivity"]) { const v = params.get(key); if (v) result[key] = v; } return result; }
function _proxyBase(): string { return location.protocol.startsWith("http") ? "" : "http://localhost:3001"; }

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
  const headers: any = {};
  if (auth.mode === "oauth_token") headers["Authorization"] = "Bearer " + auth.value;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url.toString(), { headers, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error("MC API " + res.status);
    return res.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
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
  const results = await _mcActive({make:args.make,model:args.model,year:args.year,state:args.state,rows:50,stats:"price,miles,dom",sort_by:"price",sort_order:"asc"});
  return {results};
}
async function _callTool(toolName, args) {
  const auth = _getAuth();
  if (auth.value) {
    // 1. Try proxy first (same-origin, no CORS issues)
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
  const bar = document.createElement("div"); bar.style.cssText = "display:flex;align-items:center;gap:8px;margin-left:auto;";
  const colors: Record<string, { bg: string; fg: string; label: string }> = { mcp: { bg: "#1e40af22", fg: "#60a5fa", label: "MCP" }, live: { bg: "#05966922", fg: "#34d399", label: "LIVE" }, demo: { bg: "#92400e88", fg: "#fbbf24", label: "DEMO" } };
  const c = colors[mode];
  bar.innerHTML = `<span style="padding:3px 10px;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:0.5px;background:${c.bg};color:${c.fg};border:1px solid ${c.fg}33;">${c.label}</span>`;
  if (mode !== "mcp") {
    const gear = document.createElement("button"); gear.innerHTML = "&#9881;"; gear.title = "API Settings"; gear.style.cssText = "background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;padding:4px;";
    const panel = document.createElement("div"); panel.style.cssText = "display:none;position:fixed;top:50px;right:16px;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;z-index:1000;min-width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.5);";
    panel.innerHTML = `<div style="font-size:13px;font-weight:600;color:#f8fafc;margin-bottom:12px;">API Configuration</div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px;">MarketCheck API Key</label><input id="_mc_key_inp" type="password" placeholder="Enter your API key" value="${_getAuth().mode === 'api_key' ? _getAuth().value ?? '' : ''}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;margin-bottom:8px;box-sizing:border-box;" /><div style="font-size:10px;color:#64748b;margin-bottom:12px;">Get a free key at <a href="https://developers.marketcheck.com" target="_blank" style="color:#60a5fa;">developers.marketcheck.com</a></div><div style="display:flex;gap:8px;"><button id="_mc_save" style="flex:1;padding:8px;border-radius:6px;border:none;background:#3b82f6;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Save & Reload</button><button id="_mc_clear" style="padding:8px 12px;border-radius:6px;border:1px solid #334155;background:transparent;color:#94a3b8;font-size:13px;cursor:pointer;">Clear</button></div>`;
    gear.addEventListener("click", () => { panel.style.display = panel.style.display === "none" ? "block" : "none"; });
    document.addEventListener("click", (e) => { if (!panel.contains(e.target as Node) && e.target !== gear) panel.style.display = "none"; });
    document.body.appendChild(panel);
    setTimeout(() => { document.getElementById("_mc_save")?.addEventListener("click", () => { const k = (document.getElementById("_mc_key_inp") as HTMLInputElement)?.value?.trim(); if (k) { localStorage.setItem("mc_api_key", k); location.reload(); } }); document.getElementById("_mc_clear")?.addEventListener("click", () => { localStorage.removeItem("mc_api_key"); localStorage.removeItem("mc_access_token"); location.reload(); }); }, 0);
    bar.appendChild(gear);
  }
  headerEl.appendChild(bar);
}

function _renderDemoBanner() {
  if (_detectAppMode() !== "demo" || _isEmbedMode()) return;
  if (document.getElementById("_demo_banner")) return;
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
  _db.querySelector("#_banner_save")!.addEventListener("click", () => {
    const k = (_db.querySelector("#_banner_key") as HTMLInputElement).value.trim();
    if (!k) return;
    localStorage.setItem("mc_api_key", k);
    _db.style.background = "linear-gradient(135deg,#05966922,#10b98111)";
    _db.style.borderColor = "#10b98144";
    _db.innerHTML = '<div style="font-size:13px;font-weight:700;color:#10b981;">&#10003; API key saved — reloading with live data...</div>';
    setTimeout(() => location.reload(), 800);
  });
  _db.querySelector("#_banner_key")!.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") (_db.querySelector("#_banner_save") as HTMLButtonElement).click();
  });
}
(function injectResponsiveStyles() { const s = document.createElement("style"); s.textContent = `@media(max-width:768px){body{font-size:13px!important}table{font-size:12px!important}th,td{padding:6px 8px!important}h1{font-size:18px!important}h2{font-size:15px!important}canvas{max-width:100%!important}input,select,button{font-size:14px!important}[style*="display:flex"][style*="gap"],[style*="display: flex"][style*="gap"]{flex-wrap:wrap!important}[style*="grid-template-columns: repeat"]{grid-template-columns:1fr!important}[style*="grid-template-columns:repeat"]{grid-template-columns:1fr!important}table{min-width:600px}[style*="width:35%"],[style*="width:40%"],[style*="width:25%"],[style*="width:50%"],[style*="width:60%"],[style*="width:65%"],[style*="width: 35%"],[style*="width: 40%"],[style*="width: 25%"],[style*="width: 50%"],[style*="width: 60%"],[style*="width: 65%"]{width:100%!important;min-width:0!important}}@media(max-width:480px){body{padding:8px!important}h1{font-size:16px!important}th,td{padding:4px 6px!important;font-size:11px!important}input,select{max-width:100%!important;width:100%!important;box-sizing:border-box!important}}`; document.head.appendChild(s); })();


// ── Types ──────────────────────────────────────────────────────────────
interface Listing {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  predictedPrice: number;
  discountPct: number;
  miles: number;
  dom: number;
  dealer: string;
  city: string;
  state: string;
  isAnomaly: boolean;
  priceDropPct: number;
}

interface PriceStats {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number;
  stdDev: number;
}

interface ScanResult {
  listings: Listing[];
  stats: PriceStats;
  totalScanned: number;
  anomalyCount: number;
  avgDiscount: number;
  biggestOutlier: Listing | null;
  sensitivity: number;
}

// ── Constants ──────────────────────────────────────────────────────────
const BG = "#0f172a";
const SURFACE = "#1e293b";
const BORDER = "#334155";
const TEXT = "#e2e8f0";
const TEXT_SEC = "#94a3b8";
const TEXT_MUTED = "#64748b";
const ACCENT = "#3b82f6";
const RED = "#ef4444";
const GREEN = "#22c55e";
const YELLOW = "#eab308";
const ORANGE = "#f97316";
const CYAN = "#06b6d4";
const PURPLE = "#a78bfa";

const US_STATES = [
  "", "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI",
  "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND",
  "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA",
  "WA", "WV", "WI", "WY"
];

const MAKES_MODELS: Record<string, string[]> = {
  "Toyota": ["RAV4", "Camry", "Corolla", "Highlander", "Tacoma", "4Runner"],
  "Honda": ["CR-V", "Civic", "Accord", "Pilot", "HR-V"],
  "Ford": ["F-150", "Escape", "Explorer", "Bronco", "Maverick", "Mustang"],
  "Chevrolet": ["Silverado", "Equinox", "Traverse", "Tahoe", "Malibu"],
  "Hyundai": ["Tucson", "Elantra", "Santa Fe", "Palisade", "Kona"],
  "Nissan": ["Rogue", "Altima", "Sentra", "Pathfinder"],
  "BMW": ["X3", "X5", "3 Series", "5 Series"],
  "Tesla": ["Model 3", "Model Y", "Model S", "Model X"],
  "Subaru": ["Outback", "Forester", "Crosstrek"],
  "Kia": ["Sportage", "Forte", "Telluride", "Seltos"],
};

// ── Utility Functions ──────────────────────────────────────────────────
function fmt$(v: number): string { return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 }); }
function fmtPct(v: number): string { return v.toFixed(1) + "%"; }
function fmtK(v: number): string { return (v / 1000).toFixed(0) + "K"; }

function computeStats(prices: number[]): PriceStats {
  const sorted = [...prices].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  const q1 = sorted[Math.floor(n * 0.25)];
  const median = sorted[Math.floor(n * 0.5)];
  const q3 = sorted[Math.floor(n * 0.75)];
  return { min: sorted[0], q1, median, q3, max: sorted[n - 1], mean, stdDev };
}

// ── Mock Data Generator ────────────────────────────────────────────────
function generateMockData(make: string, model: string, year: string, state: string, sensitivity: number): ScanResult {
  const basePrice = getBasePrice(make, model);
  const yearNum = parseInt(year) || 2023;
  const ageFactor = 1 - (2025 - yearNum) * 0.06;
  const adjustedBase = Math.round(basePrice * ageFactor);

  const dealers = [
    "AutoNation Toyota", "Larry H. Miller", "Hendrick Auto", "Penske Motors",
    "Group 1 Auto", "Sonic Automotive", "Lithia Motors", "Asbury Auto",
    "Ken Garff", "Sewell Automotive", "Park Place", "Galpin Motors",
    "CarMax", "Carvana", "Vroom"
  ];
  const cities: Record<string, string[]> = {
    CO: ["Denver", "Colorado Springs", "Boulder", "Fort Collins", "Aurora", "Lakewood"],
    CA: ["Los Angeles", "San Francisco", "San Diego", "Sacramento"],
    TX: ["Houston", "Dallas", "Austin", "San Antonio"],
    FL: ["Miami", "Orlando", "Tampa", "Jacksonville"],
    NY: ["New York", "Buffalo", "Albany", "Rochester"],
  };
  const stateCities = cities[state] || cities["CO"];
  const effectiveState = state || "CO";

  const listings: Listing[] = [];
  const totalScanned = 127 + Math.floor(Math.random() * 40);

  for (let i = 0; i < totalScanned; i++) {
    const noise = (Math.random() - 0.5) * adjustedBase * 0.25;
    let price = Math.round(adjustedBase + noise);
    const isOutlier = i < 8;
    if (isOutlier) {
      const dropFactor = 0.55 + Math.random() * 0.25;
      price = Math.round(adjustedBase * dropFactor);
    }
    price = Math.max(price, 5000);
    const predicted = Math.round(adjustedBase + (Math.random() - 0.3) * adjustedBase * 0.08);
    const discountPct = ((predicted - price) / predicted) * 100;
    const miles = Math.round(15000 + Math.random() * 80000);
    const dom = Math.round(5 + Math.random() * 90);
    const priceDropPct = isOutlier && Math.random() > 0.4 ? 8 + Math.random() * 18 : Math.random() * 6;

    listings.push({
      vin: generateVin(i),
      year: yearNum - Math.floor(Math.random() * 3),
      make,
      model,
      trim: ["LE", "XLE", "SE", "Limited", "XSE", "TRD"][Math.floor(Math.random() * 6)],
      price,
      predictedPrice: predicted,
      discountPct,
      miles,
      dom,
      dealer: dealers[Math.floor(Math.random() * dealers.length)],
      city: stateCities[Math.floor(Math.random() * stateCities.length)],
      state: effectiveState,
      isAnomaly: false,
      priceDropPct,
    });
  }

  const prices = listings.map(l => l.price);
  const stats = computeStats(prices);
  const threshold = stats.mean - sensitivity * stats.stdDev;

  listings.forEach(l => {
    l.isAnomaly = l.price < threshold;
  });

  const anomalies = listings.filter(l => l.isAnomaly);
  anomalies.sort((a, b) => a.discountPct > b.discountPct ? -1 : 1);

  listings.sort((a, b) => {
    if (a.isAnomaly && !b.isAnomaly) return -1;
    if (!a.isAnomaly && b.isAnomaly) return 1;
    return b.discountPct - a.discountPct;
  });

  const avgDiscount = anomalies.length > 0
    ? anomalies.reduce((s, l) => s + l.discountPct, 0) / anomalies.length
    : 0;

  return {
    listings,
    stats,
    totalScanned,
    anomalyCount: anomalies.length,
    avgDiscount,
    biggestOutlier: anomalies[0] || null,
    sensitivity,
  };
}

function getBasePrice(make: string, model: string): number {
  const prices: Record<string, number> = {
    "Toyota RAV4": 32000, "Toyota Camry": 28000, "Toyota Corolla": 23000,
    "Toyota Highlander": 40000, "Toyota Tacoma": 35000, "Toyota 4Runner": 42000,
    "Honda CR-V": 31000, "Honda Civic": 25000, "Honda Accord": 29000,
    "Honda Pilot": 38000, "Honda HR-V": 26000,
    "Ford F-150": 45000, "Ford Escape": 30000, "Ford Explorer": 38000,
    "Ford Bronco": 40000, "Ford Maverick": 28000, "Ford Mustang": 35000,
    "Chevrolet Silverado": 44000, "Chevrolet Equinox": 29000,
    "Chevrolet Traverse": 36000, "Chevrolet Tahoe": 55000, "Chevrolet Malibu": 26000,
    "Tesla Model 3": 42000, "Tesla Model Y": 48000, "Tesla Model S": 82000, "Tesla Model X": 90000,
    "BMW X3": 48000, "BMW X5": 62000, "BMW 3 Series": 45000, "BMW 5 Series": 55000,
  };
  return prices[`${make} ${model}`] || 30000;
}

function generateVin(index: number): string {
  const chars = "0123456789ABCDEFGHJKLMNPRSTUVWXYZ";
  const prefix = ["1HGCV", "2T1BU", "4T1BF", "5YJSA", "1FTFW", "3GNAX", "WBAJB", "KNDCB"][index % 8];
  let vin = prefix;
  for (let i = vin.length; i < 17; i++) {
    vin += chars[Math.floor(Math.random() * chars.length)];
  }
  return vin;
}

// ── Rendering ──────────────────────────────────────────────────────────
function renderHeader(): string {
  return `<div id="app-header" style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <div>
      <h1 style="font-size:22px;font-weight:700;color:${TEXT};margin:0;">Market Anomaly Detector</h1>
      <p style="font-size:12px;color:${TEXT_MUTED};margin:4px 0 0 0;">Scan market for pricing anomalies and below-market listings</p>
    </div>
  </div>`;
}

function renderSearchForm(defaults: { make: string; model: string; year: string; state: string; sensitivity: number }): string {
  const makeOptions = Object.keys(MAKES_MODELS).map(m =>
    `<option value="${m}" ${m === defaults.make ? "selected" : ""}>${m}</option>`
  ).join("");
  const modelOptions = (MAKES_MODELS[defaults.make] || []).map(m =>
    `<option value="${m}" ${m === defaults.model ? "selected" : ""}>${m}</option>`
  ).join("");
  const yearOptions = Array.from({ length: 8 }, (_, i) => 2025 - i).map(y =>
    `<option value="${y}" ${String(y) === defaults.year ? "selected" : ""}>${y}</option>`
  ).join("");
  const stateOptions = US_STATES.map(s =>
    `<option value="${s}" ${s === defaults.state ? "selected" : ""}>${s || "All States"}</option>`
  ).join("");

  return `<div style="background:${SURFACE};border-radius:10px;padding:16px;margin-bottom:20px;border:1px solid ${BORDER};">
    <div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;">
      <div style="flex:1;min-width:120px;">
        <label style="font-size:11px;color:${TEXT_SEC};display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Make</label>
        <select id="inp-make" style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid ${BORDER};background:${BG};color:${TEXT};font-size:13px;">
          ${makeOptions}
        </select>
      </div>
      <div style="flex:1;min-width:120px;">
        <label style="font-size:11px;color:${TEXT_SEC};display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Model</label>
        <select id="inp-model" style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid ${BORDER};background:${BG};color:${TEXT};font-size:13px;">
          ${modelOptions}
        </select>
      </div>
      <div style="flex:0.7;min-width:90px;">
        <label style="font-size:11px;color:${TEXT_SEC};display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Year</label>
        <select id="inp-year" style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid ${BORDER};background:${BG};color:${TEXT};font-size:13px;">
          ${yearOptions}
        </select>
      </div>
      <div style="flex:0.7;min-width:90px;">
        <label style="font-size:11px;color:${TEXT_SEC};display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">State</label>
        <select id="inp-state" style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid ${BORDER};background:${BG};color:${TEXT};font-size:13px;">
          ${stateOptions}
        </select>
      </div>
      <div style="flex:1.3;min-width:200px;">
        <label style="font-size:11px;color:${TEXT_SEC};display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">
          Anomaly Sensitivity: <span id="sens-val" style="color:${CYAN};">${defaults.sensitivity.toFixed(1)}&sigma;</span>
        </label>
        <input id="inp-sensitivity" type="range" min="1" max="3" step="0.1" value="${defaults.sensitivity}"
          style="width:100%;accent-color:${CYAN};height:28px;" />
        <div style="display:flex;justify-content:space-between;font-size:9px;color:${TEXT_MUTED};margin-top:2px;">
          <span>1&sigma; (More results)</span><span>2&sigma; (Balanced)</span><span>3&sigma; (Strict)</span>
        </div>
      </div>
      <div>
        <button id="btn-scan" style="padding:10px 24px;border-radius:6px;border:none;background:${RED};color:#fff;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap;">
          Scan for Anomalies
        </button>
      </div>
    </div>
  </div>`;
}

function renderKPIs(data: ScanResult): string {
  const biggest = data.biggestOutlier;
  const biggestStr = biggest ? `${fmt$(biggest.price)} vs ${fmt$(biggest.predictedPrice)} (${fmtPct(biggest.discountPct)})` : "N/A";

  const kpis = [
    { label: "Total Scanned", value: data.totalScanned.toString(), color: ACCENT },
    { label: "Anomalies Found", value: data.anomalyCount.toString(), color: RED },
    { label: "Avg Discount", value: fmtPct(data.avgDiscount), color: ORANGE },
    { label: "Biggest Outlier", value: biggest ? fmtPct(biggest.discountPct) + " below" : "N/A", color: PURPLE, sub: biggest ? `${fmt$(biggest.price)} vs ${fmt$(biggest.predictedPrice)}` : "" },
  ];

  return `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
    ${kpis.map(k => `
      <div style="background:${SURFACE};border-radius:10px;padding:16px;text-align:center;border-left:4px solid ${k.color};border:1px solid ${BORDER};">
        <div style="font-size:11px;color:${TEXT_SEC};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${k.label}</div>
        <div style="font-size:22px;font-weight:700;color:${k.color};">${k.value}</div>
        ${(k as any).sub ? `<div style="font-size:10px;color:${TEXT_MUTED};margin-top:4px;">${(k as any).sub}</div>` : ""}
      </div>
    `).join("")}
  </div>`;
}

function renderOutlierTable(listings: Listing[]): string {
  const anomalies = listings.filter(l => l.isAnomaly).sort((a, b) => b.discountPct - a.discountPct);
  if (anomalies.length === 0) {
    return `<div style="background:${SURFACE};border-radius:10px;padding:20px;margin-bottom:20px;text-align:center;color:${TEXT_MUTED};border:1px solid ${BORDER};">
      No anomalies detected at current sensitivity level. Try lowering the threshold.
    </div>`;
  }

  const rows = anomalies.map((l, i) => {
    const discColor = l.discountPct > 20 ? RED : l.discountPct > 15 ? ORANGE : YELLOW;
    return `<tr style="border-bottom:1px solid ${BORDER};${i % 2 === 0 ? `background:${BG}33;` : ""}">
      <td style="padding:8px 10px;font-family:monospace;font-size:11px;color:#93c5fd;">${l.vin.slice(0, 6)}...${l.vin.slice(-4)}</td>
      <td style="padding:8px 10px;color:${TEXT};">${l.year} ${l.make} ${l.model} ${l.trim}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;color:${GREEN};">${fmt$(l.price)}</td>
      <td style="padding:8px 10px;text-align:right;color:${TEXT_SEC};">${fmt$(l.predictedPrice)}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;color:${discColor};">${fmtPct(l.discountPct)}</td>
      <td style="padding:8px 10px;text-align:right;color:${TEXT_SEC};">${l.dom}d</td>
      <td style="padding:8px 10px;color:${TEXT_SEC};font-size:12px;">${l.dealer}</td>
      <td style="padding:8px 10px;color:${TEXT_MUTED};font-size:12px;">${l.city}, ${l.state}</td>
    </tr>`;
  }).join("");

  return `<div style="background:${SURFACE};border-radius:10px;padding:16px;margin-bottom:20px;border:1px solid ${BORDER};">
    <h3 style="color:${TEXT};font-size:14px;margin-bottom:12px;display:flex;align-items:center;gap:6px;">
      <span style="color:${RED};">&#9888;</span> Outlier Listings (${anomalies.length} anomalies)
    </h3>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:2px solid ${BORDER};">
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">VIN</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Vehicle</th>
            <th style="padding:8px 10px;text-align:right;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Listed</th>
            <th style="padding:8px 10px;text-align:right;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Predicted</th>
            <th style="padding:8px 10px;text-align:right;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Discount</th>
            <th style="padding:8px 10px;text-align:right;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">DOM</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Dealer</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Location</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

function drawBoxWhiskerPlot(canvasId: string, data: ScanResult): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  const { stats, listings } = data;
  const pad = { top: 40, right: 40, bottom: 50, left: 70 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const priceMin = Math.max(0, stats.min - stats.stdDev);
  const priceMax = stats.max + stats.stdDev * 0.5;

  function yPos(price: number): number {
    return pad.top + plotH - ((price - priceMin) / (priceMax - priceMin)) * plotH;
  }

  // Grid lines
  const gridSteps = 6;
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 0.5;
  ctx.fillStyle = TEXT_MUTED;
  ctx.font = "11px system-ui";
  ctx.textAlign = "right";
  for (let i = 0; i <= gridSteps; i++) {
    const price = priceMin + (i / gridSteps) * (priceMax - priceMin);
    const y = yPos(price);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(W - pad.right, y);
    ctx.stroke();
    ctx.fillText(fmt$(Math.round(price)), pad.left - 8, y + 4);
  }

  // Box-and-whisker
  const boxX = pad.left + plotW * 0.25;
  const boxW = plotW * 0.5;
  const yQ1 = yPos(stats.q1);
  const yQ3 = yPos(stats.q3);
  const yMed = yPos(stats.median);
  const yMin = yPos(stats.min);
  const yMax = yPos(stats.max);

  // Whiskers
  ctx.strokeStyle = TEXT_SEC;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(boxX + boxW / 2, yMax);
  ctx.lineTo(boxX + boxW / 2, yQ3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(boxX + boxW / 2, yQ1);
  ctx.lineTo(boxX + boxW / 2, yMin);
  ctx.stroke();
  ctx.setLineDash([]);

  // Whisker caps
  const capW = boxW * 0.3;
  ctx.beginPath();
  ctx.moveTo(boxX + boxW / 2 - capW / 2, yMax);
  ctx.lineTo(boxX + boxW / 2 + capW / 2, yMax);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(boxX + boxW / 2 - capW / 2, yMin);
  ctx.lineTo(boxX + boxW / 2 + capW / 2, yMin);
  ctx.stroke();

  // Box
  ctx.fillStyle = "rgba(56, 189, 248, 0.15)";
  ctx.fillRect(boxX, yQ3, boxW, yQ1 - yQ3);
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX, yQ3, boxW, yQ1 - yQ3);

  // Median line
  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(boxX, yMed);
  ctx.lineTo(boxX + boxW, yMed);
  ctx.stroke();

  // Mean marker
  const yMean = yPos(stats.mean);
  ctx.fillStyle = YELLOW;
  ctx.beginPath();
  ctx.arc(boxX + boxW / 2, yMean, 5, 0, Math.PI * 2);
  ctx.fill();

  // Anomaly threshold line
  const threshold = stats.mean - data.sensitivity * stats.stdDev;
  const yThresh = yPos(threshold);
  ctx.strokeStyle = RED;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(pad.left, yThresh);
  ctx.lineTo(W - pad.right, yThresh);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = RED;
  ctx.font = "11px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(`Anomaly threshold (${data.sensitivity.toFixed(1)}\u03C3)`, W - pad.right - 170, yThresh - 6);

  // Plot individual points
  const anomalies = listings.filter(l => l.isAnomaly);
  const normals = listings.filter(l => !l.isAnomaly);

  // Normal points - scattered along x
  ctx.globalAlpha = 0.35;
  normals.forEach((l, i) => {
    const x = pad.left + plotW * 0.1 + Math.random() * plotW * 0.8;
    const y = yPos(l.price);
    ctx.fillStyle = CYAN;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Anomaly points - highlighted as red
  anomalies.forEach((l, i) => {
    const x = pad.left + plotW * 0.15 + Math.random() * plotW * 0.7;
    const y = yPos(l.price);
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fecaca";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Labels
  ctx.fillStyle = TEXT_SEC;
  ctx.font = "11px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("Price Distribution", W / 2, H - 8);

  // Legend
  ctx.textAlign = "left";
  ctx.font = "11px system-ui";
  const legX = pad.left + 10;
  const legY = pad.top + 10;

  ctx.fillStyle = CYAN;
  ctx.beginPath(); ctx.arc(legX, legY, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = TEXT_SEC;
  ctx.fillText("Normal", legX + 10, legY + 4);

  ctx.fillStyle = RED;
  ctx.beginPath(); ctx.arc(legX + 70, legY, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = TEXT_SEC;
  ctx.fillText("Anomaly", legX + 80, legY + 4);

  ctx.fillStyle = YELLOW;
  ctx.beginPath(); ctx.arc(legX + 150, legY, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = TEXT_SEC;
  ctx.fillText("Mean", legX + 160, legY + 4);

  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(legX + 210, legY - 2, 16, 3);
  ctx.fillStyle = TEXT_SEC;
  ctx.fillText("Median", legX + 230, legY + 4);

  // Title
  ctx.fillStyle = TEXT;
  ctx.font = "bold 13px system-ui";
  ctx.textAlign = "left";
  ctx.fillText("Price Distribution with Anomalies", pad.left, pad.top - 16);
}

function renderPriceDropAlerts(listings: Listing[]): string {
  const drops = listings.filter(l => l.priceDropPct >= 5).sort((a, b) => b.priceDropPct - a.priceDropPct);
  if (drops.length === 0) {
    return `<div style="background:${SURFACE};border-radius:10px;padding:16px;margin-bottom:20px;border:1px solid ${BORDER};">
      <h3 style="color:${TEXT};font-size:14px;margin-bottom:8px;">Price Drop Alerts</h3>
      <p style="color:${TEXT_MUTED};font-size:13px;">No significant price drops detected in current results.</p>
    </div>`;
  }

  const rows = drops.slice(0, 10).map(l => {
    const dropColor = l.priceDropPct > 15 ? RED : l.priceDropPct > 10 ? ORANGE : YELLOW;
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px;border-bottom:1px solid ${BORDER};">
      <div style="width:40px;height:40px;border-radius:8px;background:${dropColor}22;display:flex;align-items:center;justify-content:center;">
        <span style="color:${dropColor};font-size:14px;font-weight:700;">&#8595;</span>
      </div>
      <div style="flex:1;">
        <div style="color:${TEXT};font-size:13px;font-weight:600;">${l.year} ${l.make} ${l.model} ${l.trim}</div>
        <div style="color:${TEXT_MUTED};font-size:11px;">${l.dealer} - ${l.city}, ${l.state} | ${l.dom} DOM</div>
      </div>
      <div style="text-align:right;">
        <div style="color:${dropColor};font-size:15px;font-weight:700;">-${fmtPct(l.priceDropPct)}</div>
        <div style="color:${TEXT_SEC};font-size:11px;">Now ${fmt$(l.price)}</div>
      </div>
    </div>`;
  }).join("");

  return `<div style="background:${SURFACE};border-radius:10px;padding:16px;margin-bottom:20px;border:1px solid ${BORDER};">
    <h3 style="color:${TEXT};font-size:14px;margin-bottom:12px;display:flex;align-items:center;gap:6px;">
      <span style="color:${ORANGE};">&#9660;</span> Price Drop Alerts (&ge; 5% reduction) - ${drops.length} vehicles
    </h3>
    ${rows}
  </div>`;
}

function renderQuickStats(stats: PriceStats): string {
  const statItems = [
    { label: "Minimum", value: fmt$(stats.min), color: GREEN },
    { label: "Q1 (25th pctl)", value: fmt$(stats.q1), color: CYAN },
    { label: "Median", value: fmt$(stats.median), color: "#f8fafc" },
    { label: "Q3 (75th pctl)", value: fmt$(stats.q3), color: CYAN },
    { label: "Maximum", value: fmt$(stats.max), color: RED },
    { label: "Std Dev", value: fmt$(stats.stdDev), color: PURPLE },
  ];

  return `<div style="background:${SURFACE};border-radius:10px;padding:16px;margin-bottom:20px;border:1px solid ${BORDER};">
    <h3 style="color:${TEXT};font-size:14px;margin-bottom:12px;">Quick Stats: Price Distribution</h3>
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;">
      ${statItems.map(s => `
        <div style="text-align:center;padding:12px 8px;background:${BG};border-radius:8px;">
          <div style="font-size:10px;color:${TEXT_MUTED};text-transform:uppercase;margin-bottom:6px;">${s.label}</div>
          <div style="font-size:17px;font-weight:700;color:${s.color};">${s.value}</div>
        </div>
      `).join("")}
    </div>
  </div>`;
}

function renderBoxWhiskerContainer(): string {
  return `<div style="background:${SURFACE};border-radius:10px;padding:16px;margin-bottom:20px;border:1px solid ${BORDER};">
    <canvas id="box-whisker-canvas" style="width:100%;height:360px;border-radius:8px;"></canvas>
  </div>`;
}

// ── Loading State ──────────────────────────────────────────────────────
function renderLoading(): string {
  return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;">
    <div style="width:48px;height:48px;border:4px solid ${BORDER};border-top:4px solid ${RED};border-radius:50%;animation:spin 1s linear infinite;"></div>
    <div style="color:${TEXT_SEC};font-size:14px;margin-top:16px;">Scanning market for anomalies...</div>
    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
  </div>`;
}

// ── Main Application ───────────────────────────────────────────────────
let currentData: ScanResult | null = null;

async function loadData(make: string, model: string, year: string, state: string, sensitivity: number): Promise<ScanResult> {
  const mode = _detectAppMode();
  if (mode === "demo") {
    return generateMockData(make, model, year, state, sensitivity);
  }

  const result = await _callTool("detect-market-anomalies", { make, model, year, state, sensitivity });
  if (!result?.content?.[0]?.text) {
    // Fall through to mock only if live call produced nothing at all.
    return generateMockData(make, model, year, state, sensitivity);
  }

  let parsed: any;
  try { parsed = JSON.parse(result.content[0].text); } catch { return generateMockData(make, model, year, state, sensitivity); }
  const searchData = parsed?.results ?? parsed?.search ?? parsed ?? {};
  const rawListings: any[] = Array.isArray(searchData?.listings) ? searchData.listings : [];

  if (rawListings.length === 0) {
    // Empty result set — return an empty ScanResult so runResults can render
    // an "nothing found" state rather than silently showing demo data.
    return {
      listings: [],
      stats: { min: 0, q1: 0, median: 0, q3: 0, max: 0, mean: 0, stdDev: 0 },
      totalScanned: 0,
      anomalyCount: 0,
      avgDiscount: 0,
      biggestOutlier: null,
      sensitivity,
    };
  }

  // Predicted-price baseline: use the API's stats.price.mean when available
  // (it represents the true market mean for the full num_found set, not just
  // the page we received). Falls back to computing from the page.
  const apiStats = searchData?.stats?.price ?? {};
  const apiMean = Number(apiStats.mean) || 0;
  const apiStdDev = Number(apiStats.stddev ?? apiStats.std_dev) || 0;

  // Optional server-side predictions (proxy / MCP may supply these).
  const predictions = parsed?.predictions ?? [];
  const predMap = new Map(
    (Array.isArray(predictions) ? predictions : [])
      .filter((p: any) => !p.error && p.vin && p.prediction?.predicted_price)
      .map((p: any) => [p.vin, Number(p.prediction.predicted_price)])
  );

  const listings: Listing[] = rawListings.map((raw: any, i: number) => {
    const build = raw.build ?? {};
    const dealer = raw.dealer ?? {};
    const price = Number(raw.price) || 0;
    const miles = Number(raw.miles ?? raw.days_on_market ?? 0) || 0;
    const dom = Number(raw.dom ?? raw.days_on_market ?? 0) || 0;
    // Prefer per-listing prediction, then the API's own market mean, then the
    // listing's own price (so discount% = 0 instead of a random number).
    const predictedPrice = Math.round(predMap.get(raw.vin) ?? (apiMean > 0 ? apiMean : price));
    const discountPct = predictedPrice > 0 ? ((predictedPrice - price) / predictedPrice) * 100 : 0;
    // Real price-drop signal from the listing's own price history.
    const priceDropPct = Math.max(0, -Number(raw.price_change_percent ?? 0) || 0);

    return {
      vin: String(raw.vin || generateVin(i)),
      year: Number(build.year ?? raw.year ?? 0) || 0,
      make: String(build.make ?? raw.make ?? make),
      model: String(build.model ?? raw.model ?? model),
      trim: String(build.trim ?? raw.trim ?? ""),
      price,
      predictedPrice,
      discountPct,
      miles,
      dom,
      dealer: String(dealer.name ?? raw.dealer_name ?? "Unknown Dealer"),
      city: String(dealer.city ?? raw.city ?? ""),
      state: String(dealer.state ?? raw.state ?? state ?? ""),
      isAnomaly: false,
      priceDropPct,
    };
  });

  // Stats: prefer the API block (it reflects the full num_found population),
  // fall back to the page-computed stats.
  const prices = listings.map((l) => l.price).filter((p) => p > 0);
  const computed = prices.length ? computeStats(prices) : { min: 0, q1: 0, median: 0, q3: 0, max: 0, mean: 0, stdDev: 0 };
  const stats: PriceStats = {
    min: Number(apiStats.min ?? computed.min) || computed.min,
    q1: Number(apiStats?.percentiles?.["25.0"] ?? computed.q1) || computed.q1,
    median: Number(apiStats.median ?? computed.median) || computed.median,
    q3: Number(apiStats?.percentiles?.["75.0"] ?? computed.q3) || computed.q3,
    max: Number(apiStats.max ?? computed.max) || computed.max,
    mean: apiMean || computed.mean,
    stdDev: apiStdDev || computed.stdDev,
  };

  const threshold = stats.mean - sensitivity * stats.stdDev;
  listings.forEach((l) => { l.isAnomaly = l.price > 0 && l.price < threshold; });

  const anomalies = listings.filter((l) => l.isAnomaly);
  const avgDiscount = anomalies.length > 0 ? anomalies.reduce((s, l) => s + l.discountPct, 0) / anomalies.length : 0;

  listings.sort((a, b) => {
    if (a.isAnomaly && !b.isAnomaly) return -1;
    if (!a.isAnomaly && b.isAnomaly) return 1;
    return b.discountPct - a.discountPct;
  });

  return {
    listings,
    stats,
    totalScanned: Number(searchData.num_found) || listings.length,
    anomalyCount: anomalies.length,
    avgDiscount,
    biggestOutlier: anomalies[0] ?? null,
    sensitivity,
  };
}

function renderResults(data: ScanResult): void {
  const container = document.getElementById("results-container");
  if (!container) return;

  if (data.listings.length === 0) {
    container.innerHTML = `
      <div style="background:${SURFACE};border:1px solid ${BORDER};border-radius:10px;padding:24px;display:flex;gap:16px;align-items:flex-start;">
        <div style="width:36px;height:36px;border-radius:50%;background:${YELLOW}22;border:1px solid ${YELLOW}55;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:${YELLOW};flex-shrink:0;">!</div>
        <div>
          <div style="font-size:15px;font-weight:700;color:#f8fafc;margin-bottom:4px;">No active listings found</div>
          <div style="font-size:13px;color:${TEXT_SEC};line-height:1.5;">The MarketCheck API returned zero active listings for the current filters. Try broadening the search — remove the state filter, widen the year, or pick a more common make/model.</div>
        </div>
      </div>`;
    return;
  }

  container.innerHTML = `
    ${renderKPIs(data)}
    ${renderOutlierTable(data.listings)}
    <div style="display:flex;gap:16px;">
      <div style="flex:1.2;">${renderBoxWhiskerContainer()}</div>
      <div style="flex:0.8;">${renderQuickStats(data.stats)}</div>
    </div>
    ${renderPriceDropAlerts(data.listings)}
  `;

  requestAnimationFrame(() => {
    drawBoxWhiskerPlot("box-whisker-canvas", data);
  });
}

function initApp(): void {
  const urlParams = _getUrlParams();
  const sensParam = parseFloat(urlParams.sensitivity ?? "");
  const defaults = {
    make: urlParams.make || "Toyota",
    model: urlParams.model || "RAV4",
    year: String(urlParams.year ?? "2023"),
    state: (urlParams.state || "CO").toUpperCase(),
    sensitivity: isFinite(sensParam) && sensParam >= 1 && sensParam <= 3 ? sensParam : 2.0,
  };

  document.body.style.cssText = `margin:0;padding:20px;background:${BG};color:${TEXT};font-family:system-ui,-apple-system,sans-serif;min-height:100vh;`;

  document.body.innerHTML = `
    ${renderHeader()}
    ${renderSearchForm(defaults)}
    <div id="results-container">${renderLoading()}</div>
  `;

  _renderDemoBanner();

  // Settings bar
  const header = document.getElementById("app-header");
  if (header) _addSettingsBar(header);

  // Update model dropdown when make changes
  const makeSelect = document.getElementById("inp-make") as HTMLSelectElement;
  const modelSelect = document.getElementById("inp-model") as HTMLSelectElement;
  makeSelect?.addEventListener("change", () => {
    const models = MAKES_MODELS[makeSelect.value] || [];
    modelSelect.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join("");
  });

  // Sensitivity slider label update
  const sensSlider = document.getElementById("inp-sensitivity") as HTMLInputElement;
  const sensVal = document.getElementById("sens-val");
  sensSlider?.addEventListener("input", () => {
    if (sensVal) sensVal.textContent = parseFloat(sensSlider.value).toFixed(1) + "\u03C3";
  });

  // Scan button
  const scanBtn = document.getElementById("btn-scan");
  scanBtn?.addEventListener("click", async () => {
    const make = (document.getElementById("inp-make") as HTMLSelectElement)?.value || "Toyota";
    const model = (document.getElementById("inp-model") as HTMLSelectElement)?.value || "RAV4";
    const year = (document.getElementById("inp-year") as HTMLSelectElement)?.value || "2023";
    const state = (document.getElementById("inp-state") as HTMLSelectElement)?.value || "";
    const sensitivity = parseFloat((document.getElementById("inp-sensitivity") as HTMLInputElement)?.value || "2");

    const container = document.getElementById("results-container");
    if (container) container.innerHTML = renderLoading();

    try {
      currentData = await loadData(make, model, year, state, sensitivity);
      renderResults(currentData);
    } catch (err) {
      if (container) container.innerHTML = `<div style="color:${RED};padding:20px;text-align:center;">Error loading data. Falling back to demo...</div>`;
      currentData = generateMockData(make, model, year, state, sensitivity);
      renderResults(currentData);
    }
  });

  // Initial load
  (async () => {
    try {
      currentData = await loadData(defaults.make, defaults.model, defaults.year, defaults.state, defaults.sensitivity);
    } catch {
      currentData = generateMockData(defaults.make, defaults.model, defaults.year, defaults.state, defaults.sensitivity);
    }
    renderResults(currentData);
  })();
}

// Handle window resize for canvas
window.addEventListener("resize", () => {
  if (currentData) {
    requestAnimationFrame(() => drawBoxWhiskerPlot("box-whisker-canvas", currentData!));
  }
});

initApp();
