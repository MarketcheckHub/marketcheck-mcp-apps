import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "uk-dealer-pricing" }); } catch {}

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
function _getUrlParams(): Record<string, string> { const params = new URLSearchParams(location.search); const result: Record<string, string> = {}; for (const key of ["vin","zip","make","model","miles","state","dealer_id","ticker","price","postal_code"]) { const v = params.get(key); if (v) result[key] = v; } return result; }
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

async function _fetchDirect(args: any) {
  const scope = args?.make ? { make: args.make } : {};
  const [inventory, market, recent] = await Promise.all([
    args?.dealer_id
      ? _mcUkActive({ dealer_id: args.dealer_id, rows: 100, stats: "price,miles" })
      : _mcUkActive({ rows: 100, stats: "price,miles", ...scope }),
    // Market baseline stats used as the per-vehicle comparison.
    _mcUkActive({ rows: 0, stats: "price,miles", ...scope }),
    _mcUkRecent({ rows: 15, stats: "price,miles", ...scope }),
  ]);
  return { inventory, market, recent };
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
(function injectResponsiveStyles() { const s = document.createElement("style"); s.textContent = `@media(max-width:768px){body{font-size:13px!important}table{font-size:12px!important}th,td{padding:6px 8px!important}h1{font-size:18px!important}h2{font-size:15px!important}canvas{max-width:100%!important}input,select,button{font-size:14px!important}[style*="display:flex"][style*="gap"],[style*="display: flex"][style*="gap"]{flex-wrap:wrap!important}[style*="grid-template-columns: repeat"]{grid-template-columns:1fr!important}[style*="grid-template-columns:repeat"]{grid-template-columns:1fr!important}table{min-width:600px}[style*="width:35%"],[style*="width:40%"],[style*="width:25%"],[style*="width:50%"],[style*="width:60%"],[style*="width:65%"],[style*="width: 35%"],[style*="width: 40%"],[style*="width: 25%"],[style*="width: 50%"],[style*="width: 60%"],[style*="width: 65%"]{width:100%!important;min-width:0!important}}@media(max-width:480px){body{padding:8px!important}h1{font-size:16px!important}th,td{padding:4px 6px!important;font-size:11px!important}input,select{max-width:100%!important;width:100%!important;box-sizing:border-box!important}}`; document.head.appendChild(s); })();


// ── Types ──────────────────────────────────────────────────────────────
interface UkVehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  listedPrice: number;
  marketAvg: number;
  gapGBP: number;
  gapPct: number;
  miles: number;
  dom: number;
  marketCount: number;
  action: string;
}

interface AgingBucket {
  label: string;
  min: number;
  max: number;
  count: number;
  color: string;
}

interface RecentSale {
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  miles: number;
  dom: number;
  soldDate: string;
}

interface KpiSummary {
  totalUnits: number;
  avgPrice: number;
  avgMiles: number;
  pctOverpriced: number;
  pctUnderpriced: number;
}

interface ActionSummary {
  reduce: number;
  hold: number;
  raise: number;
}

interface DashboardData {
  dealerName: string;
  inventory: UkVehicle[];
  aging: AgingBucket[];
  recentSales: RecentSale[];
  kpis: KpiSummary;
  actionSummary: ActionSummary;
}

// ── Mock Data ──────────────────────────────────────────────────────────
function generateMockData(): DashboardData {
  const ukMakes = ["Ford", "Volkswagen", "BMW", "Audi", "Toyota", "Vauxhall", "Mercedes-Benz", "Hyundai", "Kia", "Nissan"];
  const ukModels: Record<string, string[]> = {
    Ford: ["Focus", "Fiesta", "Kuga", "Puma", "Ranger"],
    Volkswagen: ["Golf", "Polo", "Tiguan", "T-Roc", "ID.3"],
    BMW: ["3 Series", "1 Series", "X1", "X3", "5 Series"],
    Audi: ["A3", "A4", "Q3", "Q5", "A1"],
    Toyota: ["Yaris", "Corolla", "RAV4", "C-HR", "Aygo"],
    Vauxhall: ["Corsa", "Astra", "Mokka", "Crossland", "Grandland"],
    "Mercedes-Benz": ["A-Class", "C-Class", "GLA", "GLC", "E-Class"],
    Hyundai: ["Tucson", "i20", "Kona", "i30", "IONIQ 5"],
    Kia: ["Sportage", "Niro", "Ceed", "Picanto", "EV6"],
    Nissan: ["Qashqai", "Juke", "Leaf", "Micra", "X-Trail"],
  };
  const trims = ["SE", "Titanium", "R-Line", "Sport", "S line", "SE-L", "Excel", "GT-Line", "Tekna", "Active"];

  const inventory: UkVehicle[] = [];
  for (let i = 0; i < 25; i++) {
    const make = ukMakes[i % ukMakes.length];
    const modelList = ukModels[make];
    const model = modelList[Math.floor(Math.random() * modelList.length)];
    const trim = trims[Math.floor(Math.random() * trims.length)];
    const year = 2019 + Math.floor(Math.random() * 5);
    const miles = 5000 + Math.floor(Math.random() * 65000);
    const dom = Math.floor(Math.random() * 120);
    const marketAvg = 8000 + Math.floor(Math.random() * 34000);
    const gapPctRaw = -12 + Math.random() * 24;
    const listedPrice = Math.round(marketAvg * (1 + gapPctRaw / 100));
    const gapGBP = listedPrice - marketAvg;
    const gapPct = Math.round(((listedPrice - marketAvg) / marketAvg) * 1000) / 10;

    let action = "COMPETITIVE";
    if (gapPct > 5) action = "REDUCE";
    else if (gapPct < -5) action = "RAISE";

    const vin = `WBA${String(1000 + i).slice(-4)}${String(Math.floor(Math.random() * 900000) + 100000)}`;

    inventory.push({
      vin,
      year,
      make,
      model,
      trim,
      listedPrice,
      marketAvg,
      gapGBP: Math.round(gapGBP),
      gapPct,
      miles,
      dom,
      marketCount: 10 + Math.floor(Math.random() * 40),
      action,
    });
  }

  // Aging
  const aging: AgingBucket[] = [
    { label: "0-30d", min: 0, max: 30, count: 0, color: "#10b981" },
    { label: "31-60d", min: 31, max: 60, count: 0, color: "#f59e0b" },
    { label: "61-90d", min: 61, max: 90, count: 0, color: "#f97316" },
    { label: "90+d", min: 91, max: 9999, count: 0, color: "#ef4444" },
  ];
  for (const v of inventory) {
    for (const b of aging) {
      if (v.dom >= b.min && v.dom <= b.max) { b.count++; break; }
    }
  }

  // Recent sales
  const recentSales: RecentSale[] = [];
  for (let i = 0; i < 15; i++) {
    const make = ukMakes[Math.floor(Math.random() * ukMakes.length)];
    const modelList = ukModels[make];
    const model = modelList[Math.floor(Math.random() * modelList.length)];
    const trim = trims[Math.floor(Math.random() * trims.length)];
    const year = 2019 + Math.floor(Math.random() * 5);
    const price = 7000 + Math.floor(Math.random() * 35000);
    const miles = 8000 + Math.floor(Math.random() * 60000);
    const dom = 5 + Math.floor(Math.random() * 50);
    const daysAgo = Math.floor(Math.random() * 30);
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    recentSales.push({ year, make, model, trim, price, miles, dom, soldDate: d.toISOString().slice(0, 10) });
  }

  // KPIs
  const totalUnits = inventory.length;
  const avgPrice = Math.round(inventory.reduce((s, v) => s + v.listedPrice, 0) / totalUnits);
  const avgMiles = Math.round(inventory.reduce((s, v) => s + v.miles, 0) / totalUnits);
  const pctOverpriced = Math.round((inventory.filter(v => v.action === "REDUCE").length / totalUnits) * 100);
  const pctUnderpriced = Math.round((inventory.filter(v => v.action === "RAISE").length / totalUnits) * 100);

  const actionSummary: ActionSummary = {
    reduce: inventory.filter(v => v.action === "REDUCE").length,
    hold: inventory.filter(v => v.action === "COMPETITIVE").length,
    raise: inventory.filter(v => v.action === "RAISE").length,
  };

  return {
    dealerName: "Brighton Motor Group",
    inventory,
    aging,
    recentSales,
    kpis: { totalUnits, avgPrice, avgMiles, pctOverpriced, pctUnderpriced },
    actionSummary,
  };
}

// ── API → DashboardData normalizer ──────────────────────────────────────
// Raw MarketCheck UK responses come back nested (listing.build.year,
// listing.dealer.city, etc.) and the shape that the UI renders is flat with
// per-vehicle computed gap/action. This mapper accepts either the raw
// {inventory, market, recent} envelope or a pre-flattened proxy response.
function _normalizeDashboard(raw: any, dealerLabel: string): DashboardData | null {
  if (!raw) return null;
  const invSrc = raw.inventory ?? raw.active ?? raw;
  const marketSrc = raw.market ?? invSrc;
  const recentSrc = raw.recent ?? raw.recent_sales ?? {};
  const rawListings: any[] = invSrc?.listings ?? [];
  if (rawListings.length === 0) return null;

  const marketAvgPrice =
    Number(marketSrc?.stats?.price?.avg ?? marketSrc?.stats?.price?.mean ?? invSrc?.stats?.price?.avg ?? invSrc?.stats?.price?.mean ?? 0);
  const marketCount = Number(marketSrc?.num_found ?? invSrc?.num_found ?? rawListings.length);

  const inventory: UkVehicle[] = rawListings
    .map((l: any, idx: number): UkVehicle => {
      const b = l.build ?? {};
      const price = Number(l.price ?? 0);
      const miles = Number(l.miles ?? 0);
      const dom = Number(l.dom ?? l.days_on_market ?? 0);
      const mavg = marketAvgPrice > 0 ? marketAvgPrice : price;
      const gapGBP = price - mavg;
      const gapPct = mavg > 0 ? Math.round(((price - mavg) / mavg) * 1000) / 10 : 0;
      let action = "COMPETITIVE";
      if (gapPct > 5) action = "REDUCE";
      else if (gapPct < -5) action = "RAISE";
      return {
        vin: String(l.vin ?? l.id ?? `API-${idx}`),
        year: Number(l.year ?? b.year ?? 0),
        make: String(l.make ?? b.make ?? ""),
        model: String(l.model ?? b.model ?? ""),
        trim: String(l.trim ?? b.trim ?? ""),
        listedPrice: price,
        marketAvg: Math.round(mavg),
        gapGBP: Math.round(gapGBP),
        gapPct,
        miles,
        dom,
        marketCount,
        action,
      };
    })
    .filter((v) => v.listedPrice > 0);

  if (inventory.length === 0) return null;

  const aging: AgingBucket[] = [
    { label: "0-30d", min: 0, max: 30, count: 0, color: "#10b981" },
    { label: "31-60d", min: 31, max: 60, count: 0, color: "#f59e0b" },
    { label: "61-90d", min: 61, max: 90, count: 0, color: "#f97316" },
    { label: "90+d", min: 91, max: 9999, count: 0, color: "#ef4444" },
  ];
  for (const v of inventory) {
    for (const b of aging) {
      if (v.dom >= b.min && v.dom <= b.max) {
        b.count++;
        break;
      }
    }
  }

  const rawSales: any[] = recentSrc?.listings ?? recentSrc?.recent_sales ?? [];
  const recentSales: RecentSale[] = rawSales.slice(0, 15).map((r: any): RecentSale => {
    const b = r.build ?? {};
    const soldRaw = String(r.sold_date ?? r.last_seen_date ?? r.removed_date ?? "");
    return {
      year: Number(r.year ?? b.year ?? 0),
      make: String(r.make ?? b.make ?? ""),
      model: String(r.model ?? b.model ?? ""),
      trim: String(r.trim ?? b.trim ?? ""),
      price: Number(r.price ?? r.last_seen_price ?? 0),
      miles: Number(r.miles ?? 0),
      dom: Number(r.dom ?? r.days_on_market ?? 0),
      soldDate: soldRaw.slice(0, 10),
    };
  });

  const totalUnits = inventory.length;
  const avgPrice = Math.round(inventory.reduce((s, v) => s + v.listedPrice, 0) / totalUnits);
  const avgMiles = Math.round(inventory.reduce((s, v) => s + v.miles, 0) / totalUnits);
  const pctOverpriced = Math.round((inventory.filter((v) => v.action === "REDUCE").length / totalUnits) * 100);
  const pctUnderpriced = Math.round((inventory.filter((v) => v.action === "RAISE").length / totalUnits) * 100);

  const actionSummary: ActionSummary = {
    reduce: inventory.filter((v) => v.action === "REDUCE").length,
    hold: inventory.filter((v) => v.action === "COMPETITIVE").length,
    raise: inventory.filter((v) => v.action === "RAISE").length,
  };

  return {
    dealerName: dealerLabel,
    inventory,
    aging,
    recentSales,
    kpis: { totalUnits, avgPrice, avgMiles, pctOverpriced, pctUnderpriced },
    actionSummary,
  };
}

// ── Formatters ─────────────────────────────────────────────────────────
function fmtGBP(v: number): string {
  return "\u00A3" + Math.round(v).toLocaleString();
}
function fmtPct(v: number): string {
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}
function fmtNum(v: number): string {
  return Math.round(v).toLocaleString();
}

// ── State ──────────────────────────────────────────────────────────────
let sortColumn = 5; // gap%
let sortAsc = false;
let activeDomBucket: AgingBucket | null = null;
let activeAction: string | null = null;

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  document.body.style.cssText =
    "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;overflow-x:hidden;";

  renderInputForm();

  // Auto-submit when a dealer or make scope is provided via URL.
  const urlP = _getUrlParams();
  if (urlP.dealer_id || urlP.make) {
    handleAnalyse();
  }
}

// ── Input Form ─────────────────────────────────────────────────────────
function renderInputForm() {
  document.body.innerHTML = "";

  const header = el("div", {
    style: "background:#1e293b;padding:12px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:12px;",
  });
  header.innerHTML = `<h1 style="margin:0;font-size:16px;font-weight:600;color:#f8fafc;">UK Dealer Pricing Dashboard</h1>
    <span style="font-size:12px;color:#64748b;">Inventory vs Market Analysis</span>`;
  _addSettingsBar(header);
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

  const content = el("div", { style: "padding:24px 20px;max-width:700px;margin:0 auto;" });
  document.body.appendChild(content);

  // Description
  const descPanel = el("div", {
    style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:20px;",
  });
  descPanel.innerHTML = `
    <div style="font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:8px;">UK Lot Pricing Analysis</div>
    <div style="font-size:13px;color:#94a3b8;line-height:1.6;">
      Analyse your UK dealership inventory against local market pricing. See which vehicles are
      overpriced, underpriced, or competitive. Includes aging heatmap, recent sales evidence,
      and price action recommendations.
    </div>
  `;
  content.appendChild(descPanel);

  // Form
  const formPanel = el("div", {
    style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:20px;margin-bottom:16px;",
  });

  const urlP = _getUrlParams();

  // Dealer ID (numeric MarketCheck ID)
  const dealerLabel = el("label", { style: "font-size:12px;color:#94a3b8;display:block;margin-bottom:4px;" });
  dealerLabel.textContent = "Dealer ID";
  formPanel.appendChild(dealerLabel);

  const dealerInput = document.createElement("input");
  dealerInput.id = "dealer-input";
  dealerInput.type = "text";
  dealerInput.placeholder = "Numeric MarketCheck dealer_id, e.g. 12345";
  dealerInput.value = urlP.dealer_id ?? "";
  dealerInput.style.cssText = "width:100%;padding:10px 12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;margin-bottom:4px;box-sizing:border-box;";
  formPanel.appendChild(dealerInput);
  const dealerHint = el("div", { style: "font-size:10px;color:#64748b;margin-bottom:14px;" });
  dealerHint.textContent = "Leave blank to see a UK-wide sample. With a key and dealer_id, the app fetches that dealer's live inventory.";
  formPanel.appendChild(dealerHint);

  // Make filter (optional)
  const makeLabel = el("label", { style: "font-size:12px;color:#94a3b8;display:block;margin-bottom:4px;" });
  makeLabel.textContent = "Make (optional)";
  formPanel.appendChild(makeLabel);

  const makeInput = document.createElement("input");
  makeInput.id = "make-input";
  makeInput.type = "text";
  makeInput.placeholder = "e.g. Ford, BMW — scopes the market baseline";
  makeInput.value = urlP.make ?? "";
  makeInput.style.cssText = "width:100%;padding:10px 12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;margin-bottom:14px;box-sizing:border-box;";
  formPanel.appendChild(makeInput);

  // Postal code (context only)
  const postalLabel = el("label", { style: "font-size:12px;color:#94a3b8;display:block;margin-bottom:4px;" });
  postalLabel.textContent = "Postal Code (context)";
  formPanel.appendChild(postalLabel);

  const postalInput = document.createElement("input");
  postalInput.id = "postal-input";
  postalInput.type = "text";
  postalInput.placeholder = "e.g. BN1 1AE";
  postalInput.value = urlP.postal_code ?? "";
  postalInput.style.cssText = "width:100%;padding:10px 12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;margin-bottom:14px;box-sizing:border-box;";
  formPanel.appendChild(postalInput);

  // Buttons
  const buttonRow = el("div", { style: "display:flex;gap:12px;margin-top:8px;" });

  const analyseBtn = document.createElement("button");
  analyseBtn.textContent = "Analyse Pricing";
  analyseBtn.style.cssText = "padding:10px 24px;border-radius:6px;border:none;background:#3b82f6;color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;";
  analyseBtn.addEventListener("click", () => handleAnalyse());
  buttonRow.appendChild(analyseBtn);

  const demoBtn = document.createElement("button");
  demoBtn.textContent = "Load Demo Data";
  demoBtn.style.cssText = "padding:10px 24px;border-radius:6px;border:1px solid #334155;background:transparent;color:#94a3b8;font-size:14px;cursor:pointer;font-family:inherit;";
  demoBtn.addEventListener("click", () => {
    renderDashboard(generateMockData());
  });
  buttonRow.appendChild(demoBtn);

  formPanel.appendChild(buttonRow);
  content.appendChild(formPanel);
}

// ── Handle Analyse ─────────────────────────────────────────────────────
async function handleAnalyse() {
  const dealerInput = document.getElementById("dealer-input") as HTMLInputElement;
  const makeInput = document.getElementById("make-input") as HTMLInputElement;
  const postalInput = document.getElementById("postal-input") as HTMLInputElement;
  const dealerId = dealerInput?.value?.trim() || "";
  const make = makeInput?.value?.trim() || "";
  const postalCode = postalInput?.value?.trim() || "";
  const dealerLabel = dealerId ? `Dealer ${dealerId}` : "UK Market Sample";

  // Show loading
  document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#94a3b8;">
    <div style="width:20px;height:20px;border:2px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:12px;"></div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    Analysing pricing for ${dealerLabel}...
  </div>`;

  let data: DashboardData = generateMockData();
  try {
    const result = await _callTool("scan-uk-lot-pricing", {
      dealer_id: dealerId || undefined,
      make: make || undefined,
      postal_code: postalCode || undefined,
    });
    const text = result?.content?.find((c: any) => c.type === "text")?.text;
    if (text) {
      const parsed = JSON.parse(text);
      // Preferred: proxy pre-built DashboardData.
      if (Array.isArray(parsed.inventory) && parsed.inventory.length > 0 && parsed.kpis) {
        data = { ...parsed, dealerName: parsed.dealerName || dealerLabel } as DashboardData;
      } else {
        // Fallback: raw {inventory, market, recent} envelope — normalize.
        const normalized = _normalizeDashboard(parsed, dealerLabel);
        if (normalized) data = normalized;
      }
    }
  } catch {}

  renderDashboard(data);
}

// ── Render Dashboard ───────────────────────────────────────────────────
function renderDashboard(data: DashboardData) {
  document.body.innerHTML = "";
  activeDomBucket = null;
  activeAction = null;

  // Header
  const header = el("div", {
    style: "background:#1e293b;padding:12px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:12px;",
  });
  header.innerHTML = `<h1 style="margin:0;font-size:16px;font-weight:600;color:#f8fafc;">UK Dealer Pricing</h1>
    <span style="font-size:12px;color:#64748b;">${data.dealerName} | ${data.kpis.totalUnits} units</span>`;

  const backBtn = document.createElement("button");
  backBtn.textContent = "New Search";
  backBtn.style.cssText = "margin-left:auto;padding:6px 14px;border-radius:6px;border:1px solid #334155;background:transparent;color:#94a3b8;font-size:12px;cursor:pointer;font-family:inherit;";
  backBtn.addEventListener("click", () => renderInputForm());
  header.appendChild(backBtn);

  _addSettingsBar(header);
  document.body.appendChild(header);

  const content = el("div", { style: "padding:16px 20px;" });
  document.body.appendChild(content);

  // ── KPI Ribbon ───────────────────────────────────────────────────
  const kpiRibbon = el("div", {
    style: "display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;margin-bottom:16px;flex-wrap:wrap;",
  });

  const kpis = data.kpis;
  const kpiCards = [
    { label: "Total Units", value: fmtNum(kpis.totalUnits), trend: "on the lot", color: "#94a3b8" },
    { label: "Avg Price", value: fmtGBP(kpis.avgPrice), trend: "listed price", color: "#60a5fa" },
    { label: "Avg Mileage", value: fmtNum(kpis.avgMiles), trend: "miles", color: "#94a3b8" },
    { label: "% Overpriced", value: `${kpis.pctOverpriced}%`, trend: kpis.pctOverpriced > 30 ? "action needed" : "healthy", color: kpis.pctOverpriced > 30 ? "#ef4444" : "#10b981" },
    { label: "% Underpriced", value: `${kpis.pctUnderpriced}%`, trend: kpis.pctUnderpriced > 20 ? "leaving money" : "ok", color: kpis.pctUnderpriced > 20 ? "#f59e0b" : "#10b981" },
  ];

  for (const k of kpiCards) {
    const card = el("div", {
      style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px 16px;min-width:140px;flex:1;",
    });
    card.innerHTML = `
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">${k.label}</div>
      <div style="font-size:22px;font-weight:700;color:#f8fafc;margin-top:4px;">${k.value}</div>
      <div style="font-size:12px;color:${k.color};margin-top:2px;">${k.trend}</div>
    `;
    kpiRibbon.appendChild(card);
  }
  content.appendChild(kpiRibbon);

  // ── Main Layout: Table + Aging Heatmap ───────────────────────────
  const mainRow = el("div", {
    style: "display:flex;gap:16px;margin-bottom:16px;align-items:flex-start;",
  });
  content.appendChild(mainRow);

  // ── Inventory Table ──────────────────────────────────────────────
  const tableSection = el("div", { style: "flex:3;min-width:0;" });
  mainRow.appendChild(tableSection);

  const tableTitle = el("h2", {
    style: "font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:10px;",
  });
  tableTitle.textContent = "Inventory Pricing";
  tableSection.appendChild(tableTitle);

  // Filter chips
  const chipRow = el("div", {
    style: "display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;align-items:center;",
  });
  chipRow.innerHTML = `<span style="font-size:11px;color:#64748b;margin-right:4px;">ACTION:</span>`;

  const actions = [
    { key: null as string | null, label: "All" },
    { key: "REDUCE", label: "Reduce" },
    { key: "COMPETITIVE", label: "Hold" },
    { key: "RAISE", label: "Raise" },
  ];

  for (const a of actions) {
    const chip = document.createElement("button");
    chip.style.cssText = chipStyle(activeAction === a.key || (a.key === null && activeAction === null));
    chip.textContent = a.label;
    chip.addEventListener("click", () => {
      activeAction = a.key;
      renderDashboard(data);
    });
    chipRow.appendChild(chip);
  }
  tableSection.appendChild(chipRow);

  // Filter
  let filtered = data.inventory;
  if (activeAction) {
    filtered = filtered.filter(v => v.action === activeAction);
  }
  if (activeDomBucket) {
    const bucket = activeDomBucket;
    filtered = filtered.filter(v => v.dom >= bucket.min && v.dom <= bucket.max);
  }

  // Sort
  const sortKeys: Array<(v: UkVehicle) => number | string> = [
    v => `${v.year} ${v.make} ${v.model}`,
    v => v.listedPrice,
    v => v.marketAvg,
    v => v.gapGBP,
    v => v.miles,
    v => v.gapPct,
    v => v.dom,
    v => v.action,
  ];
  const sorted = [...filtered].sort((a, b) => {
    const av = sortKeys[sortColumn](a);
    const bv = sortKeys[sortColumn](b);
    if (typeof av === "number" && typeof bv === "number") return sortAsc ? av - bv : bv - av;
    return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });

  const tableWrapper = el("div", {
    style: "overflow-x:auto;border:1px solid #334155;border-radius:8px;max-height:500px;overflow-y:auto;",
  });
  const table = el("table", {
    style: "width:100%;border-collapse:collapse;font-size:12px;",
  });

  const headers = ["Vehicle", "Listed", "Market Avg", "Gap", "Miles", "Gap %", "DOM", "Action"];
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headers.forEach((h, idx) => {
    const th = document.createElement("th");
    th.style.cssText = "padding:8px 10px;text-align:left;background:#1e293b;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;position:sticky;top:0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;cursor:pointer;white-space:nowrap;user-select:none;z-index:1;";
    const arrow = sortColumn === idx ? (sortAsc ? " ▲" : " ▼") : "";
    th.textContent = h + arrow;
    th.addEventListener("click", () => {
      if (sortColumn === idx) sortAsc = !sortAsc;
      else { sortColumn = idx; sortAsc = true; }
      renderDashboard(data);
    });
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const v of sorted) {
    const tr = document.createElement("tr");
    let rowBg = "";
    if (v.gapPct > 5) rowBg = "rgba(239,68,68,0.08)";
    else if (v.gapPct < -5) rowBg = "rgba(16,185,129,0.08)";
    tr.style.cssText = `border-bottom:1px solid #1e293b;background:${rowBg};`;
    tr.addEventListener("mouseenter", () => { tr.style.background = "#1e293b"; });
    tr.addEventListener("mouseleave", () => { tr.style.background = rowBg; });

    const actionColor = v.action === "REDUCE" ? "#ef4444" : v.action === "RAISE" ? "#10b981" : "#f59e0b";
    const actionBg = v.action === "REDUCE" ? "#ef444422" : v.action === "RAISE" ? "#10b98122" : "#f59e0b22";

    const gapColor = v.gapGBP > 0 ? "#ef4444" : v.gapGBP < 0 ? "#10b981" : "#94a3b8";

    const cells = [
      `<div style="font-weight:600;color:#f8fafc;">${v.year} ${v.make} ${v.model}</div><div style="font-size:10px;color:#64748b;">${v.trim}</div>`,
      fmtGBP(v.listedPrice),
      fmtGBP(v.marketAvg),
      `<span style="color:${gapColor};">${v.gapGBP >= 0 ? '+' : ''}${fmtGBP(v.gapGBP)}</span>`,
      fmtNum(v.miles),
      `<span style="color:${gapColor};">${fmtPct(v.gapPct)}</span>`,
      `${v.dom}d`,
      `<span style="padding:3px 8px;border-radius:8px;font-size:10px;font-weight:700;background:${actionBg};color:${actionColor};border:1px solid ${actionColor}33;">${v.action}</span>`,
    ];

    for (const cellHtml of cells) {
      const td = document.createElement("td");
      td.style.cssText = "padding:8px 10px;white-space:nowrap;";
      td.innerHTML = cellHtml;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  tableSection.appendChild(tableWrapper);

  // ── Aging Heatmap (right column) ─────────────────────────────────
  const agingSection = el("div", { style: "flex:1;min-width:220px;" });
  mainRow.appendChild(agingSection);

  const agingTitle = el("h2", {
    style: "font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:10px;",
  });
  agingTitle.textContent = "Aging Heatmap";
  agingSection.appendChild(agingTitle);

  // Canvas heatmap
  const heatmapContainer = el("div", {
    style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:12px;",
  });

  const canvas = document.createElement("canvas");
  canvas.width = 260;
  canvas.height = 220;
  canvas.style.cssText = "width:260px;height:220px;max-width:100%;";
  heatmapContainer.appendChild(canvas);
  agingSection.appendChild(heatmapContainer);

  drawAgingHeatmap(canvas, data.aging, data.kpis.totalUnits);

  // Aging bucket cards (clickable)
  for (const bucket of data.aging) {
    const bucketCard = document.createElement("div");
    const isActive = activeDomBucket?.label === bucket.label;
    bucketCard.style.cssText = `display:flex;justify-content:space-between;align-items:center;padding:10px 14px;margin-bottom:6px;background:${isActive ? bucket.color + '22' : '#1e293b'};border:1px solid ${isActive ? bucket.color : '#334155'};border-radius:6px;cursor:pointer;`;

    const pct = data.kpis.totalUnits > 0 ? Math.round((bucket.count / data.kpis.totalUnits) * 100) : 0;
    bucketCard.innerHTML = `
      <div>
        <span style="font-size:13px;font-weight:600;color:${bucket.color};">${bucket.label}</span>
        <span style="font-size:11px;color:#64748b;margin-left:6px;">${pct}%</span>
      </div>
      <span style="font-size:16px;font-weight:700;color:#f8fafc;">${bucket.count}</span>
    `;

    bucketCard.addEventListener("click", () => {
      activeDomBucket = activeDomBucket?.label === bucket.label ? null : bucket;
      renderDashboard(data);
    });
    agingSection.appendChild(bucketCard);
  }

  // ── Recent Sales Evidence ────────────────────────────────────────
  const salesTitle = el("h2", {
    style: "font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:12px;margin-top:8px;",
  });
  salesTitle.textContent = "Recent Sales Evidence";
  content.appendChild(salesTitle);

  renderRecentSales(content, data.recentSales);

  // ── Price Action Summary ─────────────────────────────────────────
  const summaryTitle = el("h2", {
    style: "font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:12px;margin-top:8px;",
  });
  summaryTitle.textContent = "Price Action Summary";
  content.appendChild(summaryTitle);

  const summaryPanel = el("div", {
    style: "display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px;",
  });

  const actionCards = [
    { label: "REDUCE", count: data.actionSummary.reduce, color: "#ef4444", desc: "Overpriced vs market - consider lowering" },
    { label: "COMPETITIVE", count: data.actionSummary.hold, color: "#f59e0b", desc: "Priced within market range - hold position" },
    { label: "RAISE", count: data.actionSummary.raise, color: "#10b981", desc: "Underpriced vs market - opportunity to increase" },
  ];

  for (const ac of actionCards) {
    const card = el("div", {
      style: `flex:1;min-width:180px;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;border-left:4px solid ${ac.color};`,
    });
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:12px;font-weight:700;color:${ac.color};letter-spacing:0.5px;">${ac.label}</span>
        <span style="font-size:24px;font-weight:700;color:#f8fafc;">${ac.count}</span>
      </div>
      <div style="font-size:11px;color:#64748b;">${ac.desc}</div>
      <div style="margin-top:8px;height:4px;background:#0f172a;border-radius:2px;overflow:hidden;">
        <div style="height:100%;width:${data.kpis.totalUnits > 0 ? Math.round((ac.count / data.kpis.totalUnits) * 100) : 0}%;background:${ac.color};border-radius:2px;"></div>
      </div>
      <div style="font-size:10px;color:#64748b;margin-top:4px;">${data.kpis.totalUnits > 0 ? Math.round((ac.count / data.kpis.totalUnits) * 100) : 0}% of inventory</div>
    `;
    summaryPanel.appendChild(card);
  }
  content.appendChild(summaryPanel);

  // Revenue opportunity
  const reduceVehicles = data.inventory.filter(v => v.action === "REDUCE");
  const raiseVehicles = data.inventory.filter(v => v.action === "RAISE");
  const potentialReduction = reduceVehicles.reduce((s, v) => s + Math.abs(v.gapGBP), 0);
  const potentialIncrease = raiseVehicles.reduce((s, v) => s + Math.abs(v.gapGBP), 0);

  const revenuePanel = el("div", {
    style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:24px;",
  });
  revenuePanel.innerHTML = `
    <div style="font-size:13px;font-weight:600;color:#f8fafc;margin-bottom:10px;">Revenue Impact</div>
    <div style="display:flex;gap:24px;flex-wrap:wrap;">
      <div>
        <div style="font-size:11px;color:#64748b;">If REDUCE vehicles align to market</div>
        <div style="font-size:18px;font-weight:700;color:#ef4444;margin-top:2px;">-${fmtGBP(potentialReduction)}</div>
        <div style="font-size:10px;color:#64748b;">total price reduction</div>
      </div>
      <div>
        <div style="font-size:11px;color:#64748b;">If RAISE vehicles align to market</div>
        <div style="font-size:18px;font-weight:700;color:#10b981;margin-top:2px;">+${fmtGBP(potentialIncrease)}</div>
        <div style="font-size:10px;color:#64748b;">potential revenue uplift</div>
      </div>
      <div>
        <div style="font-size:11px;color:#64748b;">Net revenue opportunity</div>
        <div style="font-size:18px;font-weight:700;color:${potentialIncrease > potentialReduction ? '#10b981' : '#ef4444'};margin-top:2px;">${potentialIncrease >= potentialReduction ? '+' : '-'}${fmtGBP(Math.abs(potentialIncrease - potentialReduction))}</div>
        <div style="font-size:10px;color:#64748b;">if all actions taken</div>
      </div>
    </div>
  `;
  content.appendChild(revenuePanel);
}

// ── Aging Heatmap Canvas ───────────────────────────────────────────────
function drawAgingHeatmap(canvas: HTMLCanvasElement, aging: AgingBucket[], total: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width;
  const h = canvas.height;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, w, h);

  const padLeft = 50;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 40;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;
  const maxCount = Math.max(...aging.map(b => b.count), 1);

  // Grid
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 0.5;
  ctx.fillStyle = "#64748b";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.textAlign = "right";

  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const y = padTop + (chartH / gridSteps) * i;
    const val = maxCount - (maxCount / gridSteps) * i;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + chartW, y);
    ctx.stroke();
    ctx.fillText(String(Math.round(val)), padLeft - 8, y + 4);
  }

  // Bars
  const barWidth = chartW / aging.length - 10;
  for (let i = 0; i < aging.length; i++) {
    const b = aging[i];
    const x = padLeft + (chartW / aging.length) * i + 5;
    const barH = (b.count / maxCount) * chartH;
    const y = padTop + chartH - barH;

    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barH, [4, 4, 0, 0]);
    ctx.fill();

    // Count label
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 12px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(b.count), x + barWidth / 2, y - 6);

    // Percentage
    const pct = total > 0 ? Math.round((b.count / total) * 100) : 0;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "9px -apple-system, sans-serif";
    ctx.fillText(`${pct}%`, x + barWidth / 2, y - 18);

    // Bucket label
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "11px -apple-system, sans-serif";
    ctx.fillText(b.label, x + barWidth / 2, padTop + chartH + 16);
  }

  // Title
  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Days on Market Distribution", w / 2, padTop + chartH + 34);
}

// ── Recent Sales Table ─────────────────────────────────────────────────
function renderRecentSales(container: HTMLElement, sales: RecentSale[]) {
  const tableWrapper = el("div", {
    style: "overflow-x:auto;border:1px solid #334155;border-radius:8px;max-height:360px;overflow-y:auto;margin-bottom:16px;",
  });

  const table = el("table", {
    style: "width:100%;border-collapse:collapse;font-size:12px;",
  });

  const headers = ["Vehicle", "Sale Price", "Miles", "DOM", "Date"];
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const h of headers) {
    const th = document.createElement("th");
    th.style.cssText = "padding:8px 10px;text-align:left;background:#1e293b;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;position:sticky;top:0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;z-index:1;";
    th.textContent = h;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (let i = 0; i < sales.length; i++) {
    const s = sales[i];
    const tr = document.createElement("tr");
    const rowBg = i % 2 === 0 ? "transparent" : "rgba(30,41,59,0.5)";
    tr.style.cssText = `border-bottom:1px solid #1e293b;background:${rowBg};`;
    tr.addEventListener("mouseenter", () => { tr.style.background = "#1e293b"; });
    tr.addEventListener("mouseleave", () => { tr.style.background = rowBg; });

    const cells = [
      `<span style="font-weight:600;color:#f8fafc;">${s.year} ${s.make} ${s.model}</span><span style="font-size:10px;color:#64748b;margin-left:6px;">${s.trim}</span>`,
      `<span style="color:#10b981;font-weight:600;">${fmtGBP(s.price)}</span>`,
      fmtNum(s.miles),
      `${s.dom}d`,
      `<span style="color:#64748b;">${s.soldDate}</span>`,
    ];

    for (const cellHtml of cells) {
      const td = document.createElement("td");
      td.style.cssText = "padding:8px 10px;white-space:nowrap;";
      td.innerHTML = cellHtml;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  container.appendChild(tableWrapper);
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
