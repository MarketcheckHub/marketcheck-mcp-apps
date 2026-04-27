import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "trade-in-estimator" }); } catch {}

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
  const decode = await _mcDecode(args.vin);
  const [retail, wholesale] = await Promise.all([
    _mcPredict({...args,dealer_type:"franchise"}).catch(() => ({})),
    _mcPredict({...args,dealer_type:"independent"}).catch(() => ({})),
  ]);
  const soldComps = await _mcRecent({make:decode?.make,model:decode?.model,year:decode?.year?`${decode.year-1}-${decode.year+1}`:undefined,zip:args.zip,radius:100,rows:10,stats:"price"}).catch(() => ({listings:[],num_found:0}));
  return {decode,retail,wholesale,soldComps};
}

function _str(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") return v.name ?? v.display ?? v.value ?? v.label ?? "";
  return "";
}

function _transformRawToTradeIn(raw: any, args: any): TradeInResult {
  const d = raw.decode ?? {};
  const retail = raw.retail ?? {};
  const wholesale = raw.wholesale ?? {};
  const soldResult = raw.soldComps ?? {};

  const franchiseFmv = retail.predicted_price ?? retail.marketcheck_price ?? retail.price ?? 0;
  const independentFmv = wholesale.predicted_price ?? wholesale.marketcheck_price ?? wholesale.price ?? 0;
  const confLow = retail.price_range?.low ?? (franchiseFmv > 0 ? franchiseFmv * 0.9 : 0);
  const confHigh = retail.price_range?.high ?? (franchiseFmv > 0 ? franchiseFmv * 1.1 : 0);

  // Trade-in is typically 10-15% below retail; instant cash ~20% below
  // Cap trade-in at 88% of retail to guarantee it stays below private party value
  // (some VINs return wholesale FMV >= retail FMV, which is unrealistic for trade-in)
  const retailFloor = franchiseFmv > 0 ? Math.round(franchiseFmv * 0.88) : 0;
  const tradeInValue = independentFmv > 0 && independentFmv < franchiseFmv
    ? Math.min(independentFmv, retailFloor || independentFmv)
    : retailFloor || independentFmv;
  const tradeInLow = Math.round(tradeInValue * 0.92);
  const tradeInHigh = Math.round(tradeInValue * 1.08);

  const soldListings = soldResult.listings ?? [];
  const soldStats = soldResult.stats?.price ?? {};
  const soldComps: SoldComp[] = soldListings
    .filter((l: any) => (l.price ?? 0) > 0)
    .slice(0, 8)
    .map((l: any) => {
      const trim = _str(l.trim ?? l.build?.trim);
      const city = _str(l.dealer?.city ?? l.city);
      const state = _str(l.dealer?.state ?? l.state);
      return {
        year: l.year ?? l.build?.year ?? d.year ?? 0,
        make: _str(l.make ?? l.build?.make ?? d.make),
        model: _str(l.model ?? l.build?.model ?? d.model) + (trim ? " " + trim : ""),
        price: l.price ?? 0,
        miles: l.miles ?? 0,
        days_to_sell: l.dom ?? l.dom_active ?? 0,
        location: city + (state ? ", " + state : ""),
      };
    });

  const now = new Date();
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const fmt = (dt: Date) => dt.toLocaleDateString("en-US", { month: "short", year: "numeric" });

  return {
    vehicle: {
      vin: args.vin,
      year: d.year ?? 0,
      make: _str(d.make) || "Unknown",
      model: _str(d.model) || "Unknown",
      trim: _str(d.trim),
      engine: _str(d.engine),
      transmission: _str(d.transmission),
      drivetrain: _str(d.drivetrain),
      fuel_type: _str(d.fuel_type),
      msrp: d.msrp ?? 0,
      body_type: _str(d.body_type),
    },
    privatePartyValue: franchiseFmv,
    privatePartyLow: Math.round(confLow),
    privatePartyHigh: Math.round(confHigh),
    tradeInValue,
    tradeInLow,
    tradeInHigh,
    instantCashLow: Math.round(tradeInValue * 0.85),
    instantCashHigh: Math.round(tradeInValue * 0.95),
    soldComps,
    compCount: soldResult.num_found ?? soldComps.length,
    dateRange: `${fmt(threeMonthsAgo)} - ${fmt(now)}`,
    geoScope: args.zip ? `Within 100 miles of ${args.zip}` : "Nationwide",
    tips: _generateTips(args, franchiseFmv, soldStats, d),
  };
}

function _generateTips(args: any, fmv: number, soldStats: any, decode: any): string[] {
  const tips: string[] = [];
  const avgMiles = soldStats.mean ?? soldStats.avg ?? 0;
  if (args.miles && avgMiles > 0 && args.miles < avgMiles * 0.8) {
    tips.push(`Your mileage is below average for this model — comparable vehicles have ${Math.round(avgMiles).toLocaleString()} miles on average`);
  } else if (args.miles && avgMiles > 0 && args.miles > avgMiles * 1.2) {
    tips.push(`Your mileage is above average — similar vehicles average ${Math.round(avgMiles).toLocaleString()} miles`);
  }
  tips.push("Having maintenance records can add $500-$800 to your selling price");
  tips.push("Selling privately typically nets 10-15% more than a dealer trade-in");
  if (decode?.body_type === "SUV" || decode?.body_type === "Truck") {
    tips.push("SUVs and trucks are in high demand — consider timing your sale for spring/summer");
  }
  return tips.slice(0, 4);
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
      if (r.ok) {
        const raw = await r.json();
        const d = _transformRawToTradeIn(raw, args);
        return { content: [{ type: "text", text: JSON.stringify(d) }] };
      }
    } catch {}
    // 2. Direct API fallback
    try {
      const raw = await _fetchDirect(args);
      if (raw) {
        const d = _transformRawToTradeIn(raw, args);
        return { content: [{ type: "text", text: JSON.stringify(d) }] };
      }
    } catch {}
    return null;
  }
  // 3. MCP mode (Claude, VS Code, etc.) — only when no auth
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

interface VehicleSpecs {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  engine: string;
  transmission: string;
  drivetrain: string;
  fuel_type: string;
  msrp: number;
  body_type: string;
}

interface SoldComp {
  year: number;
  make: string;
  model: string;
  price: number;
  miles: number;
  days_to_sell: number;
  location: string;
}

interface TradeInResult {
  vehicle: VehicleSpecs;
  privatePartyValue: number;
  privatePartyLow: number;
  privatePartyHigh: number;
  tradeInValue: number;
  tradeInLow: number;
  tradeInHigh: number;
  instantCashLow: number;
  instantCashHigh: number;
  soldComps: SoldComp[];
  compCount: number;
  dateRange: string;
  geoScope: string;
  tips: string[];
}

type Condition = "excellent" | "good" | "fair" | "poor";

const CONDITION_ADJ: Record<Condition, number> = {
  excellent: 0.05,
  good: 0.0,
  fair: -0.08,
  poor: -0.18,
};

// ── Mock Data ──────────────────────────────────────────────────────────────────

const MOCK_RESULT: TradeInResult = {
  vehicle: {
    vin: "KNDCB3LC9L5359658",
    year: 2020,
    make: "Kia",
    model: "Forte",
    trim: "LXS",
    engine: "2.0L I4 147hp",
    transmission: "CVT",
    drivetrain: "FWD",
    fuel_type: "Gasoline",
    msrp: 19790,
    body_type: "Sedan",
  },
  privatePartyValue: 15800,
  privatePartyLow: 14200,
  privatePartyHigh: 17500,
  tradeInValue: 13900,
  tradeInLow: 12400,
  tradeInHigh: 15200,
  instantCashLow: 11600,
  instantCashHigh: 13400,
  soldComps: [
    { year: 2020, make: "Kia", model: "Forte LXS", price: 15400, miles: 42100, days_to_sell: 16, location: "San Jose, CA" },
    { year: 2020, make: "Kia", model: "Forte LXS", price: 16200, miles: 35800, days_to_sell: 11, location: "Oakland, CA" },
    { year: 2020, make: "Kia", model: "Forte FE", price: 14100, miles: 51200, days_to_sell: 22, location: "Sacramento, CA" },
    { year: 2020, make: "Kia", model: "Forte LXS", price: 15100, miles: 44600, days_to_sell: 19, location: "Fremont, CA" },
    { year: 2020, make: "Kia", model: "Forte GT-Line", price: 16800, miles: 38400, days_to_sell: 13, location: "San Francisco, CA" },
  ],
  compCount: 47,
  dateRange: "Jan 2026 - Mar 2026",
  geoScope: "Within 100 miles of 94105",
  tips: [
    "Cars like yours with under 40K miles sell for $1,200 more on average",
    "Demand for mid-size sedans is above average in your area right now",
    "Having maintenance records can add $500-$800 to your selling price",
    "Selling privately typically nets 10-15% more than a dealer trade-in",
  ],
};

// ── Helpers ─────────────────────────────────────────────────────────────────────

function fmtCurrency(v: number): string {
  return "$" + Math.round(v).toLocaleString();
}

function fmtNum(v: number): string {
  return Math.round(v).toLocaleString();
}

function adjustValue(base: number, condition: Condition): number {
  return Math.round(base * (1 + CONDITION_ADJ[condition]));
}

// ── App Init ───────────────────────────────────────────────────────────────────


document.body.style.cssText =
  "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;overflow-x:hidden;min-height:100vh;";

// State
let currentResult: TradeInResult | null = null;
let selectedCondition: Condition = "good";

// Root container
const root = document.createElement("div");
root.style.cssText = "max-width:720px;margin:0 auto;padding:24px 20px 48px;";
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

// ── Render Input Section ───────────────────────────────────────────────────────

function renderInputSection() {
  root.innerHTML = "";

  // Header
  const header = document.createElement("div");
  header.style.cssText = "text-align:center;margin-bottom:32px;";
  header.innerHTML = `
    <div style="font-size:36px;margin-bottom:8px;">&#128663;</div>
    <h1 style="font-size:24px;font-weight:700;color:#f8fafc;margin:0 0 6px;">What's My Car Worth?</h1>
    <p style="font-size:14px;color:#94a3b8;margin:0;">Get an instant trade-in estimate backed by real market data</p>
  `;
  root.appendChild(header);

  // Form card
  const form = document.createElement("div");
  form.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:12px;padding:24px;";

  // VIN input
  const vinGroup = createInputGroup("VIN (Vehicle Identification Number)", "Enter 17-character VIN");
  const vinInput = vinGroup.querySelector("input") as HTMLInputElement;
  vinInput.maxLength = 17;
  vinInput.value = "KNDCB3LC9L5359658";
  vinInput.style.fontSize = "16px";
  vinInput.style.padding = "12px 16px";
  vinInput.style.letterSpacing = "1.5px";
  vinInput.style.textTransform = "uppercase";
  const vinHelper = document.createElement("div");
  vinHelper.style.cssText = "font-size:11px;color:#64748b;margin-top:4px;";
  vinHelper.textContent = "Find your VIN on your registration card or driver-side door jamb";
  vinGroup.appendChild(vinHelper);
  form.appendChild(vinGroup);

  // Mileage + ZIP row
  const row = document.createElement("div");
  row.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;";

  const milesGroup = createInputGroup("Current Mileage", "e.g. 45000");
  const milesInput = milesGroup.querySelector("input") as HTMLInputElement;
  milesInput.type = "number";
  milesInput.min = "0";
  milesInput.max = "500000";
  // Add odometer icon
  const milesLabel = milesGroup.querySelector("label") as HTMLLabelElement;
  milesLabel.innerHTML = `<span style="margin-right:4px;">&#9201;</span> Current Mileage`;
  row.appendChild(milesGroup);

  const zipGroup = createInputGroup("ZIP Code", "e.g. 94105");
  const zipInput = zipGroup.querySelector("input") as HTMLInputElement;
  zipInput.maxLength = 5;
  zipInput.pattern = "[0-9]{5}";
  row.appendChild(zipGroup);

  form.appendChild(row);

  // Condition selector
  const condLabel = document.createElement("div");
  condLabel.style.cssText = "font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-top:20px;margin-bottom:10px;";
  condLabel.textContent = "Vehicle Condition";
  form.appendChild(condLabel);

  const condGrid = document.createElement("div");
  condGrid.style.cssText = "display:grid;grid-template-columns:repeat(4,1fr);gap:8px;";

  const conditions: { key: Condition; icon: string; title: string; desc: string }[] = [
    { key: "excellent", icon: "&#11088;", title: "Excellent", desc: "Showroom quality" },
    { key: "good", icon: "&#9989;", title: "Good", desc: "Minor wear only" },
    { key: "fair", icon: "&#9888;&#65039;", title: "Fair", desc: "Noticeable wear" },
    { key: "poor", icon: "&#128295;", title: "Poor", desc: "Significant issues" },
  ];

  const condCards: HTMLElement[] = [];
  conditions.forEach((c) => {
    const card = document.createElement("div");
    card.dataset.condition = c.key;
    card.style.cssText = `
      border:2px solid ${c.key === selectedCondition ? "#3b82f6" : "#334155"};
      background:${c.key === selectedCondition ? "#3b82f622" : "#0f172a"};
      border-radius:8px;padding:10px 8px;text-align:center;cursor:pointer;transition:all 0.15s;
    `;
    card.innerHTML = `
      <div style="font-size:20px;margin-bottom:4px;">${c.icon}</div>
      <div style="font-size:12px;font-weight:600;color:${c.key === selectedCondition ? "#60a5fa" : "#e2e8f0"};">${c.title}</div>
      <div style="font-size:10px;color:#64748b;margin-top:2px;">${c.desc}</div>
    `;
    card.addEventListener("click", () => {
      selectedCondition = c.key;
      condCards.forEach((cc) => {
        const isActive = cc.dataset.condition === c.key;
        cc.style.borderColor = isActive ? "#3b82f6" : "#334155";
        cc.style.background = isActive ? "#3b82f622" : "#0f172a";
        const titleEl = cc.querySelector("div:nth-child(2)") as HTMLElement;
        if (titleEl) titleEl.style.color = isActive ? "#60a5fa" : "#e2e8f0";
      });
      // If we already have results, recalculate instantly
      if (currentResult) {
        renderResults();
      }
    });
    condCards.push(card);
    condGrid.appendChild(card);
  });
  form.appendChild(condGrid);

  // Error message area
  const errorMsg = document.createElement("div");
  errorMsg.style.cssText = "color:#f87171;font-size:12px;margin-top:12px;display:none;";
  form.appendChild(errorMsg);

  // Submit button
  const btnWrap = document.createElement("div");
  btnWrap.style.cssText = "margin-top:20px;";
  const submitBtn = document.createElement("button");
  submitBtn.style.cssText = `
    width:100%;padding:14px;border:none;border-radius:8px;font-size:16px;font-weight:700;
    cursor:pointer;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;
    transition:opacity 0.15s;letter-spacing:0.3px;
  `;
  submitBtn.textContent = "Get My Value";
  submitBtn.addEventListener("mouseenter", () => { submitBtn.style.opacity = "0.9"; });
  submitBtn.addEventListener("mouseleave", () => { submitBtn.style.opacity = "1"; });
  submitBtn.addEventListener("click", async () => {
    const vin = vinInput.value.trim().toUpperCase();
    const miles = parseInt(milesInput.value, 10);
    const zip = zipInput.value.trim();

    // Validation
    if (vin.length !== 17) {
      errorMsg.textContent = "Please enter a valid 17-character VIN.";
      errorMsg.style.display = "block";
      return;
    }
    if (isNaN(miles) || miles < 0) {
      errorMsg.textContent = "Please enter a valid mileage.";
      errorMsg.style.display = "block";
      return;
    }
    if (!/^\d{5}$/.test(zip)) {
      errorMsg.textContent = "Please enter a valid 5-digit ZIP code.";
      errorMsg.style.display = "block";
      return;
    }
    errorMsg.style.display = "none";

    // Show loading
    submitBtn.disabled = true;
    submitBtn.textContent = "Analyzing market data...";
    submitBtn.style.opacity = "0.7";

    try {
      const response = await _callTool("estimate-trade-in", { vin, miles, zip, condition: selectedCondition });

      const text = response?.content?.[0]?.text;
      if (text) {
        currentResult = JSON.parse(text) as TradeInResult;
      } else {
        throw new Error("No data returned");
      }
    } catch (_err) {
      // Fallback to mock data
      currentResult = { ...MOCK_RESULT };
      currentResult.vehicle.vin = vin;
    }

    renderResults();
  });
  btnWrap.appendChild(submitBtn);
  form.appendChild(btnWrap);

  root.appendChild(form);
}

// ── Input Group Helper ─────────────────────────────────────────────────────────

function createInputGroup(labelText: string, placeholder: string): HTMLElement {
  const group = document.createElement("div");
  const label = document.createElement("label");
  label.style.cssText = "display:block;font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;";
  label.textContent = labelText;
  const input = document.createElement("input");
  input.placeholder = placeholder;
  input.style.cssText = `
    width:100%;padding:10px 14px;border:1px solid #334155;border-radius:6px;
    background:#0f172a;color:#e2e8f0;font-size:14px;outline:none;
    transition:border-color 0.15s;
  `;
  input.addEventListener("focus", () => { input.style.borderColor = "#3b82f6"; });
  input.addEventListener("blur", () => { input.style.borderColor = "#334155"; });
  group.appendChild(label);
  group.appendChild(input);
  return group;
}

// ── Render Results ─────────────────────────────────────────────────────────────

function renderResults() {
  if (!currentResult) return;
  root.innerHTML = "";

  const r = currentResult;
  const cond = selectedCondition;

  // Back button
  const backBtn = document.createElement("button");
  backBtn.style.cssText = "background:none;border:none;color:#60a5fa;font-size:13px;cursor:pointer;margin-bottom:16px;padding:0;";
  backBtn.innerHTML = "&#8592; New Estimate";
  backBtn.addEventListener("click", () => {
    currentResult = null;
    selectedCondition = "good";
    renderInputSection();
  });
  root.appendChild(backBtn);

  // Title
  const title = document.createElement("div");
  title.style.cssText = "margin-bottom:24px;";
  title.innerHTML = `
    <h1 style="font-size:20px;font-weight:700;color:#f8fafc;margin:0 0 4px;">Your ${r.vehicle.year} ${r.vehicle.make} ${r.vehicle.model}</h1>
    <p style="font-size:13px;color:#94a3b8;margin:0;">${r.vehicle.trim} &middot; VIN: ${r.vehicle.vin}</p>
  `;
  root.appendChild(title);

  // ── Hero Values ──────────────────────────────────────────────────────────────

  const heroCard = document.createElement("div");
  heroCard.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;margin-bottom:16px;";

  // Condition pill row
  const condRow = document.createElement("div");
  condRow.style.cssText = "display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;";
  (["excellent", "good", "fair", "poor"] as Condition[]).forEach((c) => {
    const pill = document.createElement("button");
    const isActive = c === cond;
    pill.style.cssText = `
      padding:5px 12px;border-radius:14px;font-size:11px;font-weight:600;cursor:pointer;
      border:1px solid ${isActive ? "#3b82f6" : "#334155"};
      background:${isActive ? "#3b82f622" : "transparent"};
      color:${isActive ? "#60a5fa" : "#94a3b8"};text-transform:capitalize;
    `;
    pill.textContent = c;
    pill.addEventListener("click", () => {
      selectedCondition = c;
      renderResults();
    });
    condRow.appendChild(pill);
  });
  heroCard.appendChild(condRow);

  // Value tiers
  const tiers: { label: string; description: string; value: number; low: number; high: number; color: string }[] = [
    {
      label: "Private Party Value",
      description: "What you'd get selling directly to a buyer",
      value: adjustValue(r.privatePartyValue, cond),
      low: adjustValue(r.privatePartyLow, cond),
      high: adjustValue(r.privatePartyHigh, cond),
      color: "#10b981",
    },
    {
      label: "Dealer Trade-In Value",
      description: "What a dealer would offer on trade",
      value: adjustValue(r.tradeInValue, cond),
      low: adjustValue(r.tradeInLow, cond),
      high: adjustValue(r.tradeInHigh, cond),
      color: "#3b82f6",
    },
    {
      label: "Instant Cash Offer Range",
      description: "Quick-sale offers from dealers and services",
      value: Math.round((adjustValue(r.instantCashLow, cond) + adjustValue(r.instantCashHigh, cond)) / 2),
      low: adjustValue(r.instantCashLow, cond),
      high: adjustValue(r.instantCashHigh, cond),
      color: "#f59e0b",
    },
  ];

  tiers.forEach((tier, idx) => {
    const tierEl = document.createElement("div");
    tierEl.style.cssText = `margin-bottom:${idx < tiers.length - 1 ? "16px" : "0"};`;

    const labelRow = document.createElement("div");
    labelRow.style.cssText = "display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;";
    labelRow.innerHTML = `
      <div>
        <span style="font-size:13px;font-weight:600;color:#e2e8f0;">${tier.label}</span>
        <span style="font-size:11px;color:#64748b;margin-left:8px;">${tier.description}</span>
      </div>
      <span style="font-size:${idx === 0 ? "22" : "18"}px;font-weight:700;color:${tier.color};">${fmtCurrency(tier.value)}</span>
    `;
    tierEl.appendChild(labelRow);

    // Range bar
    const barContainer = document.createElement("div");
    barContainer.style.cssText = "position:relative;height:24px;margin-top:4px;";

    const barBg = document.createElement("div");
    barBg.style.cssText = "position:absolute;top:8px;left:0;right:0;height:8px;background:#0f172a;border-radius:4px;overflow:hidden;";

    const range = tier.high - tier.low || 1;
    const fillPct = ((tier.value - tier.low) / range) * 100;

    barBg.innerHTML = `
      <div style="position:absolute;left:0;top:0;height:100%;width:100%;background:${tier.color}22;"></div>
      <div style="position:absolute;left:0;top:0;height:100%;width:${fillPct}%;background:${tier.color}55;border-radius:4px;"></div>
    `;
    barContainer.appendChild(barBg);

    // Marker dot
    const marker = document.createElement("div");
    const markerPct = Math.min(Math.max(fillPct, 3), 97);
    marker.style.cssText = `
      position:absolute;top:4px;left:${markerPct}%;transform:translateX(-50%);
      width:16px;height:16px;border-radius:50%;background:${tier.color};
      border:2px solid #1e293b;box-shadow:0 0 6px ${tier.color}88;
    `;
    barContainer.appendChild(marker);

    // Low/High labels
    const rangeLabels = document.createElement("div");
    rangeLabels.style.cssText = "display:flex;justify-content:space-between;margin-top:2px;";
    rangeLabels.innerHTML = `
      <span style="font-size:10px;color:#64748b;">${fmtCurrency(tier.low)}</span>
      <span style="font-size:10px;color:#64748b;">${fmtCurrency(tier.high)}</span>
    `;
    tierEl.appendChild(barContainer);
    tierEl.appendChild(rangeLabels);

    heroCard.appendChild(tierEl);

    // Separator between tiers
    if (idx < tiers.length - 1) {
      const sep = document.createElement("div");
      sep.style.cssText = "height:1px;background:#334155;margin:0 0 16px;";
      heroCard.appendChild(sep);
    }
  });

  root.appendChild(heroCard);

  // ── Vehicle Identity Card ────────────────────────────────────────────────────

  const specCard = document.createElement("div");
  specCard.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;margin-bottom:16px;";

  const specTitle = document.createElement("h2");
  specTitle.style.cssText = "font-size:14px;font-weight:600;color:#f8fafc;margin:0 0 12px;";
  specTitle.textContent = "Vehicle Details";
  specCard.appendChild(specTitle);

  const specGrid = document.createElement("div");
  specGrid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;";

  const specs: [string, string][] = [
    ["Year / Make / Model", `${r.vehicle.year} ${r.vehicle.make} ${r.vehicle.model}`],
    ["Trim", r.vehicle.trim],
    ["Engine", r.vehicle.engine],
    ["Transmission", r.vehicle.transmission],
    ["Drivetrain", r.vehicle.drivetrain],
    ["Fuel Type", r.vehicle.fuel_type],
    ["Body Type", r.vehicle.body_type],
    ["MSRP When New", fmtCurrency(r.vehicle.msrp)],
  ];

  specs.forEach(([label, value]) => {
    const specItem = document.createElement("div");
    specItem.style.cssText = "padding:6px 0;border-bottom:1px solid #0f172a;";
    specItem.innerHTML = `
      <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.3px;">${label}</div>
      <div style="font-size:13px;color:#e2e8f0;font-weight:500;margin-top:2px;">${value}</div>
    `;
    specGrid.appendChild(specItem);
  });
  specCard.appendChild(specGrid);
  root.appendChild(specCard);

  // ── How We Got This Number (Expandable) ──────────────────────────────────────

  const compCard = document.createElement("div");
  compCard.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:12px;overflow:hidden;margin-bottom:16px;";

  const compHeader = document.createElement("div");
  compHeader.style.cssText = "padding:16px 20px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;";
  const compArrow = document.createElement("span");
  compArrow.textContent = "\u25B6";
  compArrow.style.cssText = "color:#64748b;font-size:10px;transition:transform 0.2s;";
  compHeader.innerHTML = `<span style="font-size:14px;font-weight:600;color:#f8fafc;">How We Got This Number</span>`;
  compHeader.appendChild(compArrow);

  const compBody = document.createElement("div");
  compBody.style.cssText = "padding:0 20px;max-height:0;overflow:hidden;transition:max-height 0.3s ease,padding 0.3s ease;";

  let compExpanded = false;
  compHeader.addEventListener("click", () => {
    compExpanded = !compExpanded;
    if (compExpanded) {
      compBody.style.maxHeight = "600px";
      compBody.style.paddingBottom = "16px";
      compArrow.style.transform = "rotate(90deg)";
    } else {
      compBody.style.maxHeight = "0";
      compBody.style.paddingBottom = "0";
      compArrow.style.transform = "rotate(0deg)";
    }
  });

  // Comp summary stats
  const compStats = document.createElement("div");
  compStats.style.cssText = "display:flex;gap:24px;margin-bottom:12px;flex-wrap:wrap;";
  compStats.innerHTML = `
    <div><span style="font-size:11px;color:#64748b;">Comparables Found</span><div style="font-size:16px;font-weight:700;color:#f8fafc;">${r.compCount}</div></div>
    <div><span style="font-size:11px;color:#64748b;">Date Range</span><div style="font-size:13px;color:#e2e8f0;">${r.dateRange}</div></div>
    <div><span style="font-size:11px;color:#64748b;">Geographic Scope</span><div style="font-size:13px;color:#e2e8f0;">${r.geoScope}</div></div>
  `;
  compBody.appendChild(compStats);

  // Comp table
  const tableWrap = document.createElement("div");
  tableWrap.style.cssText = "overflow-x:auto;border:1px solid #334155;border-radius:8px;";
  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;font-size:12px;";
  table.innerHTML = `
    <thead>
      <tr>
        <th style="padding:8px 10px;text-align:left;background:#0f172a;color:#64748b;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #334155;">Vehicle</th>
        <th style="padding:8px 10px;text-align:right;background:#0f172a;color:#64748b;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #334155;">Sale Price</th>
        <th style="padding:8px 10px;text-align:right;background:#0f172a;color:#64748b;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #334155;">Miles</th>
        <th style="padding:8px 10px;text-align:right;background:#0f172a;color:#64748b;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #334155;">Days to Sell</th>
        <th style="padding:8px 10px;text-align:left;background:#0f172a;color:#64748b;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #334155;">Location</th>
      </tr>
    </thead>
    <tbody>
      ${r.soldComps
        .slice(0, 5)
        .map(
          (c) => `
        <tr style="border-bottom:1px solid #1e293b;">
          <td style="padding:8px 10px;color:#e2e8f0;">${c.year} ${c.make} ${c.model}</td>
          <td style="padding:8px 10px;color:#10b981;text-align:right;font-weight:600;">${fmtCurrency(c.price)}</td>
          <td style="padding:8px 10px;color:#e2e8f0;text-align:right;">${fmtNum(c.miles)}</td>
          <td style="padding:8px 10px;color:#e2e8f0;text-align:right;">${c.days_to_sell}d</td>
          <td style="padding:8px 10px;color:#94a3b8;">${c.location}</td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  `;
  tableWrap.appendChild(table);
  compBody.appendChild(tableWrap);

  compCard.appendChild(compHeader);
  compCard.appendChild(compBody);
  root.appendChild(compCard);

  // ── Maximize Your Value Tips ─────────────────────────────────────────────────

  const tipsCard = document.createElement("div");
  tipsCard.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;margin-bottom:16px;";

  const tipsTitle = document.createElement("h2");
  tipsTitle.style.cssText = "font-size:14px;font-weight:600;color:#f8fafc;margin:0 0 12px;";
  tipsTitle.innerHTML = "&#128161; Maximize Your Value";
  tipsCard.appendChild(tipsTitle);

  const tipsList = document.createElement("div");
  tipsList.style.cssText = "display:flex;flex-direction:column;gap:8px;";
  r.tips.forEach((tip) => {
    const tipEl = document.createElement("div");
    tipEl.style.cssText = "display:flex;align-items:flex-start;gap:8px;padding:8px 12px;background:#0f172a;border-radius:6px;";
    tipEl.innerHTML = `
      <span style="color:#10b981;font-size:14px;flex-shrink:0;margin-top:1px;">&#10003;</span>
      <span style="font-size:13px;color:#e2e8f0;line-height:1.4;">${tip}</span>
    `;
    tipsList.appendChild(tipEl);
  });
  tipsCard.appendChild(tipsList);
  root.appendChild(tipsCard);

  // ── Disclaimer ───────────────────────────────────────────────────────────────

  const disclaimer = document.createElement("div");
  disclaimer.style.cssText = "text-align:center;font-size:10px;color:#475569;margin-top:8px;padding:0 12px;";
  disclaimer.textContent = "Values are estimates based on recent comparable sales data. Actual trade-in values may vary based on vehicle inspection, local market conditions, and dealer discretion.";
  root.appendChild(disclaimer);
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────

renderInputSection();
