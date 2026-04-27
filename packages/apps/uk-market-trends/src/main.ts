import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "uk-market-trends" }); } catch {}

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
  for (const key of ["vin", "zip", "make", "model", "miles", "state", "dealer_id", "ticker", "price", "postal_code"]) {
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
  const scope = args?.make ? { make: args.make } : {};
  const [active, recent] = await Promise.all([
    _mcUkActive({ rows: 0, stats: "price,miles", facets: "make|body_type|fuel_type", ...scope }),
    _mcUkRecent({ rows: 0, stats: "price,miles", ...scope }),
  ]);
  return { active, recent };
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
interface MakeData {
  make: string;
  count: number;
  avg_price: number;
  market_share: number;
}

interface BodyTypeData {
  body_type: string;
  count: number;
  share: number;
  color: string;
}

interface PriceBucket {
  label: string;
  min: number;
  max: number;
  count: number;
}

interface PriceTier {
  label: string;
  range: string;
  count: number;
  avg_price: number;
  share: number;
  color: string;
}

interface MarketOverview {
  total_active: number;
  avg_price: number;
  avg_mileage: number;
  recent_count: number;
  active_to_recent_ratio: number;
}

// ── Mock Data ──────────────────────────────────────────────────────────────
const MOCK_OVERVIEW: MarketOverview = {
  total_active: 285000,
  avg_price: 18450,
  avg_mileage: 34200,
  recent_count: 42500,
  active_to_recent_ratio: 6.7,
};

const MOCK_MAKES: MakeData[] = [
  { make: "Ford", count: 42000, avg_price: 16200, market_share: 14.7 },
  { make: "Volkswagen", count: 31000, avg_price: 19800, market_share: 10.9 },
  { make: "BMW", count: 28000, avg_price: 24500, market_share: 9.8 },
  { make: "Audi", count: 25000, avg_price: 23200, market_share: 8.8 },
  { make: "Mercedes-Benz", count: 22000, avg_price: 26800, market_share: 7.7 },
  { make: "Toyota", count: 18000, avg_price: 17500, market_share: 6.3 },
  { make: "Vauxhall", count: 16500, avg_price: 12800, market_share: 5.8 },
  { make: "Nissan", count: 14200, avg_price: 14600, market_share: 5.0 },
  { make: "Hyundai", count: 12800, avg_price: 15200, market_share: 4.5 },
  { make: "Kia", count: 11500, avg_price: 16100, market_share: 4.0 },
  { make: "Peugeot", count: 10200, avg_price: 13400, market_share: 3.6 },
  { make: "SEAT", count: 8500, avg_price: 14900, market_share: 3.0 },
  { make: "Skoda", count: 7800, avg_price: 15600, market_share: 2.7 },
  { make: "Volvo", count: 7200, avg_price: 22100, market_share: 2.5 },
  { make: "Honda", count: 6800, avg_price: 16800, market_share: 2.4 },
];

const BODY_TYPE_COLORS: Record<string, string> = {
  "Hatchback": "#3b82f6",
  "SUV": "#10b981",
  "Saloon": "#f59e0b",
  "Estate": "#8b5cf6",
  "Coupe": "#ef4444",
  "Convertible": "#ec4899",
  "MPV": "#06b6d4",
};

const MOCK_BODY_TYPES: BodyTypeData[] = [
  { body_type: "Hatchback", count: 99750, share: 35.0, color: BODY_TYPE_COLORS["Hatchback"] },
  { body_type: "SUV", count: 79800, share: 28.0, color: BODY_TYPE_COLORS["SUV"] },
  { body_type: "Saloon", count: 51300, share: 18.0, color: BODY_TYPE_COLORS["Saloon"] },
  { body_type: "Estate", count: 34200, share: 12.0, color: BODY_TYPE_COLORS["Estate"] },
  { body_type: "Coupe", count: 19950, share: 7.0, color: BODY_TYPE_COLORS["Coupe"] },
];

const MOCK_PRICE_BUCKETS: PriceBucket[] = [
  { label: "\u00A30-5K", min: 0, max: 5000, count: 28500 },
  { label: "\u00A35-10K", min: 5000, max: 10000, count: 42750 },
  { label: "\u00A310-15K", min: 10000, max: 15000, count: 51300 },
  { label: "\u00A315-20K", min: 15000, max: 20000, count: 45600 },
  { label: "\u00A320-25K", min: 20000, max: 25000, count: 37050 },
  { label: "\u00A325-30K", min: 25000, max: 30000, count: 28500 },
  { label: "\u00A330-35K", min: 30000, max: 35000, count: 19950 },
  { label: "\u00A335-40K", min: 35000, max: 40000, count: 14250 },
  { label: "\u00A340-50K", min: 40000, max: 50000, count: 11400 },
  { label: "\u00A350K+", min: 50000, max: 999999, count: 5700 },
];

const MOCK_PRICE_TIERS: PriceTier[] = [
  { label: "Budget", range: "Under \u00A310,000", count: 71250, avg_price: 6800, share: 25.0, color: "#10b981" },
  { label: "Mid-Range", range: "\u00A310,000 - \u00A325,000", count: 133950, avg_price: 16900, share: 47.0, color: "#3b82f6" },
  { label: "Premium", range: "\u00A325,000 - \u00A350,000", count: 62700, avg_price: 33200, share: 22.0, color: "#f59e0b" },
  { label: "Luxury", range: "Over \u00A350,000", count: 17100, avg_price: 68500, share: 6.0, color: "#ef4444" },
];

const MOCK_RECENT_STATS = {
  total: 42500,
  avg_price: 16800,
  avg_mileage: 38400,
  top_make: "Ford",
  top_body: "Hatchback",
};

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtGBP(v: number | undefined): string {
  if (v == null || isNaN(v)) return "N/A";
  return "\u00A3" + Math.round(v).toLocaleString("en-GB");
}

function fmtCount(v: number): string {
  if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(v);
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

// ── State ──────────────────────────────────────────────────────────────────
let overview: MarketOverview = MOCK_OVERVIEW;
let makes: MakeData[] = MOCK_MAKES;
let bodyTypes: BodyTypeData[] = MOCK_BODY_TYPES;
let fuelTypes: FuelTypeData[] = [];
let priceBuckets: PriceBucket[] = MOCK_PRICE_BUCKETS;
let priceTiers: PriceTier[] = MOCK_PRICE_TIERS;
let recentStats = MOCK_RECENT_STATS;
let loading = true;
let activeMakeFilter: string = "";

// ── Facet parser ───────────────────────────────────────────────────────────
// MarketCheck returns facets in several shapes depending on version / endpoint.
// Handle array-of-object, flat-pairs, and plain-object forms so UI stays robust.
function _parseFacet(raw: any): Array<{ item: string; count: number }> {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];
    if (typeof raw[0] === "object" && raw[0] !== null) {
      return raw
        .map((f: any) => ({
          item: String(f.item ?? f.value ?? f.name ?? f.term ?? "").trim(),
          count: Number(f.count ?? f.num_found ?? f.doc_count ?? 0),
        }))
        .filter((f) => f.item && f.count > 0);
    }
    // flat-pairs: ["Ford", 42000, "VW", 31000, ...]
    const out: Array<{ item: string; count: number }> = [];
    for (let i = 0; i < raw.length; i += 2) {
      const item = String(raw[i] ?? "").trim();
      const count = Number(raw[i + 1] ?? 0);
      if (item && count > 0) out.push({ item, count });
    }
    return out;
  }
  if (typeof raw === "object") {
    return Object.entries(raw)
      .map(([k, v]) => ({ item: String(k), count: Number(v) }))
      .filter((f) => f.item && f.count > 0);
  }
  return [];
}

// ── Data Loading ───────────────────────────────────────────────────────────
async function loadData() {
  loading = true;
  render();

  try {
    const result = await _callTool("get-uk-market-trends", activeMakeFilter ? { make: activeMakeFilter } : {});
    if (result) {
      const data = JSON.parse(result.content[0].text);

      // Unwrap {active, recent} (direct fetch) or accept flat shape (proxy-normalized).
      const activeSrc = data.active ?? data;
      const recentSrc = data.recent ?? data.recent_stats ?? {};

      const totalActive = Number(activeSrc?.num_found ?? 0);
      const priceStats = activeSrc?.stats?.price ?? {};
      const milesStats = activeSrc?.stats?.miles ?? {};
      const avgPrice = Number(priceStats.avg ?? priceStats.mean ?? 0);
      const avgMiles = Number(milesStats.avg ?? milesStats.mean ?? 0);
      const recentTotal = Number(recentSrc?.num_found ?? recentSrc?.total ?? 0);
      const recentPriceStats = recentSrc?.stats?.price ?? {};
      const recentMilesStats = recentSrc?.stats?.miles ?? {};
      const recentAvgPrice = Number(recentPriceStats.avg ?? recentPriceStats.mean ?? recentSrc?.avg_price ?? 0);
      const recentAvgMiles = Number(recentMilesStats.avg ?? recentMilesStats.mean ?? recentSrc?.avg_mileage ?? 0);

      // Facets: make / body_type / fuel_type
      const facets = activeSrc?.facets ?? {};
      const makeFacet = _parseFacet(facets.make);
      const bodyFacet = _parseFacet(facets.body_type);
      const fuelFacet = _parseFacet(facets.fuel_type);

      // Only replace UI state if we actually got something back from the API.
      const haveReal = totalActive > 0 && (avgPrice > 0 || makeFacet.length > 0);
      if (haveReal) {
        overview = {
          total_active: totalActive,
          avg_price: avgPrice,
          avg_mileage: Math.round(avgMiles),
          recent_count: recentTotal,
          active_to_recent_ratio: recentTotal > 0 ? Math.round((totalActive / recentTotal) * 10) / 10 : 0,
        };
        recentStats = {
          total: recentTotal,
          avg_price: Math.round(recentAvgPrice),
          avg_mileage: Math.round(recentAvgMiles),
          top_make: makeFacet[0]?.item ?? recentStats.top_make,
          top_body: bodyFacet[0]?.item ?? recentStats.top_body,
        };

        if (makeFacet.length > 0) {
          makes = makeFacet.slice(0, 15).map((f) => ({
            make: f.item,
            count: f.count,
            // API facets don't include per-make avg price; use market-wide average.
            avg_price: avgPrice,
            market_share: totalActive > 0 ? Math.round((f.count / totalActive) * 1000) / 10 : 0,
          }));
        }

        if (bodyFacet.length > 0) {
          const totalBody = bodyFacet.reduce((s, b) => s + b.count, 0) || totalActive;
          bodyTypes = bodyFacet.slice(0, 8).map((f) => ({
            body_type: f.item,
            count: f.count,
            share: Math.round((f.count / totalBody) * 1000) / 10,
            color: BODY_TYPE_COLORS[f.item] ?? "#64748b",
          }));
        }

        if (fuelFacet.length > 0) {
          const totalFuel = fuelFacet.reduce((s, f) => s + f.count, 0) || totalActive;
          const trendFor = (name: string) => {
            if (/electric/i.test(name)) return "Growing Rapidly";
            if (/hybrid/i.test(name)) return "Growing";
            if (/petrol/i.test(name)) return "Declining";
            if (/diesel/i.test(name)) return "Declining";
            return "Stable";
          };
          const colorFor = (name: string) => {
            if (/electric/i.test(name)) return "#8b5cf6";
            if (/plug/i.test(name)) return "#06b6d4";
            if (/hybrid/i.test(name)) return "#10b981";
            if (/petrol/i.test(name)) return "#3b82f6";
            if (/diesel/i.test(name)) return "#64748b";
            return "#94a3b8";
          };
          fuelTypes = fuelFacet.slice(0, 8).map((f) => ({
            fuel_type: f.item,
            count: f.count,
            share: Math.round((f.count / totalFuel) * 1000) / 10,
            avg_price: avgPrice,
            color: colorFor(f.item),
            trend: trendFor(f.item),
          }));
        }
      }
    }
  } catch {}

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
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #1e293b; }
    ::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
  `;
  document.body.appendChild(style);

  // Header
  const header = el("div", { style: "background:#1e293b;padding:12px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:12px;" });
  const titleArea = el("div", { style: "display:flex;align-items:center;gap:10px;" });
  titleArea.innerHTML = `<span style="font-size:22px;">&#128200;</span><h1 style="margin:0;font-size:18px;font-weight:700;color:#f8fafc;">UK Market Trends</h1><span style="font-size:12px;color:#94a3b8;margin-left:8px;">Macro UK Automotive Intelligence</span>`;
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

  if (loading) {
    const spin = el("div", { style: "text-align:center;padding:60px 0;" });
    spin.innerHTML = `<div style="display:inline-block;width:40px;height:40px;border:3px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;"></div><div style="margin-top:12px;color:#94a3b8;font-size:14px;">Loading UK market data...</div>`;
    container.appendChild(spin);
    document.body.appendChild(container);
    return;
  }

  if (activeMakeFilter) {
    const chip = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:16px;padding:8px 12px;background:#1e293b;border:1px solid #334155;border-radius:8px;font-size:12px;color:#94a3b8;width:fit-content;" });
    chip.innerHTML = `Filtered to <strong style="color:#60a5fa;">${activeMakeFilter}</strong> &nbsp;·&nbsp; <a href="?" style="color:#fbbf24;text-decoration:underline;">clear</a>`;
    container.appendChild(chip);
  }

  renderKPIs(container);
  renderMakeLeaderboard(container);

  // Two-column layout for charts
  const chartRow = el("div", { style: "display:flex;gap:20px;margin-bottom:24px;" });
  renderPriceHistogram(chartRow);
  renderBodyTypeDonut(chartRow);
  container.appendChild(chartRow);

  renderActiveVsSold(container);
  renderPriceTiers(container);
  renderFuelTypeAnalysis(container);
  renderRegionalHighlights(container);
  renderMarketHealth(container);

  document.body.appendChild(container);
}

// ── KPI Ribbon ─────────────────────────────────────────────────────────────
function renderKPIs(container: HTMLElement) {
  const kpis = [
    { label: "Total Active Listings", value: fmtCount(overview.total_active), color: "#3b82f6", sub: "Across all UK" },
    { label: "Average Price", value: fmtGBP(overview.avg_price), color: "#10b981", sub: "Used vehicles" },
    { label: "Average Mileage", value: overview.avg_mileage.toLocaleString("en-GB") + " mi", color: "#f59e0b", sub: "Market-wide" },
    { label: "Active:Recent Ratio", value: overview.active_to_recent_ratio.toFixed(1) + ":1", color: "#8b5cf6", sub: `${fmtCount(overview.recent_count)} recently sold` },
  ];

  const row = el("div", { style: "display:grid;grid-template-columns:repeat(4, 1fr);gap:12px;margin-bottom:24px;" });
  for (const kpi of kpis) {
    const card = el("div", { style: `background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px;border-top:3px solid ${kpi.color};` });
    card.innerHTML = `
      <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">${kpi.label}</div>
      <div style="font-size:24px;font-weight:700;color:#f8fafc;margin-bottom:4px;">${kpi.value}</div>
      <div style="font-size:11px;color:#64748b;">${kpi.sub}</div>
    `;
    row.appendChild(card);
  }
  container.appendChild(row);
}

// ── Make Leaderboard ───────────────────────────────────────────────────────
function renderMakeLeaderboard(container: HTMLElement) {
  const section = el("div", { style: "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:24px;" });
  const h2 = el("h2", { style: "margin:0 0 16px 0;font-size:16px;font-weight:600;color:#f8fafc;" });
  h2.textContent = "Make Leaderboard - Top 15 by Listing Count";
  section.appendChild(h2);

  const tableWrap = el("div", { style: "overflow-x:auto;" });
  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;font-size:13px;";

  const thead = document.createElement("thead");
  thead.innerHTML = `<tr style="border-bottom:2px solid #334155;">
    <th style="text-align:left;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Rank</th>
    <th style="text-align:left;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Make</th>
    <th style="text-align:right;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Listings</th>
    <th style="text-align:right;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Avg Price</th>
    <th style="text-align:right;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Market Share</th>
    <th style="text-align:left;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;min-width:200px;">Share Bar</th>
  </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const maxShare = Math.max(...makes.map(m => m.market_share));

  for (let i = 0; i < makes.length; i++) {
    const m = makes[i];
    const barWidth = (m.market_share / maxShare) * 100;
    const tr = document.createElement("tr");
    tr.style.cssText = "border-bottom:1px solid #334155;";
    tr.addEventListener("mouseenter", () => { tr.style.background = "#0f172a"; });
    tr.addEventListener("mouseleave", () => { tr.style.background = ""; });
    tr.innerHTML = `
      <td style="padding:10px 12px;color:#64748b;font-weight:600;">${i + 1}</td>
      <td style="padding:10px 12px;color:#f8fafc;font-weight:600;">${m.make}</td>
      <td style="padding:10px 12px;text-align:right;color:#e2e8f0;">${m.count.toLocaleString("en-GB")}</td>
      <td style="padding:10px 12px;text-align:right;color:#10b981;font-weight:600;">${fmtGBP(m.avg_price)}</td>
      <td style="padding:10px 12px;text-align:right;color:#e2e8f0;">${m.market_share.toFixed(1)}%</td>
      <td style="padding:10px 12px;">
        <div style="height:14px;background:#334155;border-radius:7px;overflow:hidden;">
          <div style="height:100%;width:${barWidth}%;background:linear-gradient(90deg,#3b82f6,#60a5fa);border-radius:7px;transition:width 0.5s;"></div>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  section.appendChild(tableWrap);
  container.appendChild(section);
}

// ── Price Distribution Histogram ───────────────────────────────────────────
function renderPriceHistogram(row: HTMLElement) {
  const section = el("div", { style: "flex:1;background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;" });
  const h2 = el("h2", { style: "margin:0 0 16px 0;font-size:16px;font-weight:600;color:#f8fafc;" });
  h2.textContent = "Price Distribution";
  section.appendChild(h2);

  const canvas = document.createElement("canvas");
  canvas.width = 520;
  canvas.height = 340;
  canvas.style.cssText = "width:100%;height:auto;";
  section.appendChild(canvas);
  row.appendChild(section);

  setTimeout(() => drawHistogram(canvas), 0);
}

function drawHistogram(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  const pad = { top: 20, right: 20, bottom: 70, left: 60 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, W, H);

  const maxCount = Math.max(...priceBuckets.map(b => b.count));
  const barW = plotW / priceBuckets.length - 4;

  // Grid
  for (let i = 0; i <= 5; i++) {
    const y = pad.top + (plotH / 5) * i;
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    const val = maxCount - (maxCount / 5) * i;
    ctx.fillStyle = "#64748b"; ctx.font = "10px sans-serif"; ctx.textAlign = "right";
    ctx.fillText(fmtCount(val), pad.left - 8, y + 4);
  }

  // Bars
  for (let i = 0; i < priceBuckets.length; i++) {
    const b = priceBuckets[i];
    const barH = (b.count / maxCount) * plotH;
    const x = pad.left + i * (plotW / priceBuckets.length) + 2;
    const y = pad.top + plotH - barH;

    const gradient = ctx.createLinearGradient(x, y, x, pad.top + plotH);
    gradient.addColorStop(0, "#3b82f6");
    gradient.addColorStop(1, "#1e40af");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
    ctx.fill();

    // Count label
    ctx.fillStyle = "#94a3b8"; ctx.font = "9px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(fmtCount(b.count), x + barW / 2, y - 6);

    // X label
    ctx.save();
    ctx.translate(x + barW / 2, pad.top + plotH + 8);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#94a3b8"; ctx.font = "10px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(b.label, 0, 0);
    ctx.restore();
  }

  // Axis label
  ctx.fillStyle = "#94a3b8"; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("Number of Listings", pad.left + plotW / 2, 14);
}

// ── Body Type Donut Chart ──────────────────────────────────────────────────
function renderBodyTypeDonut(row: HTMLElement) {
  const section = el("div", { style: "flex:0 0 380px;background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;" });
  const h2 = el("h2", { style: "margin:0 0 16px 0;font-size:16px;font-weight:600;color:#f8fafc;" });
  h2.textContent = "Body Type Segments";
  section.appendChild(h2);

  const canvas = document.createElement("canvas");
  canvas.width = 340;
  canvas.height = 240;
  canvas.style.cssText = "width:100%;height:auto;display:block;margin:0 auto;";
  section.appendChild(canvas);

  // Legend
  const legend = el("div", { style: "display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;justify-content:center;" });
  for (const bt of bodyTypes) {
    const item = el("div", { style: "display:flex;align-items:center;gap:4px;font-size:11px;" });
    item.innerHTML = `<span style="width:10px;height:10px;border-radius:50%;background:${bt.color};display:inline-block;"></span><span style="color:#e2e8f0;">${bt.body_type}</span><span style="color:#64748b;">${bt.share}%</span>`;
    legend.appendChild(item);
  }
  section.appendChild(legend);
  row.appendChild(section);

  setTimeout(() => drawDonut(canvas), 0);
}

function drawDonut(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const outerR = Math.min(cx, cy) - 10;
  const innerR = outerR * 0.55;

  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, W, H);

  let startAngle = -Math.PI / 2;
  const total = bodyTypes.reduce((s, b) => s + b.share, 0);

  for (const bt of bodyTypes) {
    const sweep = (bt.share / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, startAngle, startAngle + sweep);
    ctx.arc(cx, cy, innerR, startAngle + sweep, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = bt.color;
    ctx.fill();

    // Label
    const midAngle = startAngle + sweep / 2;
    const labelR = (outerR + innerR) / 2;
    const lx = cx + Math.cos(midAngle) * labelR;
    const ly = cy + Math.sin(midAngle) * labelR;
    if (bt.share > 8) {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(bt.share + "%", lx, ly);
    }

    startAngle += sweep;
  }

  // Center text
  ctx.fillStyle = "#f8fafc"; ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(fmtCount(overview.total_active), cx, cy - 8);
  ctx.fillStyle = "#94a3b8"; ctx.font = "10px sans-serif";
  ctx.fillText("Total Listings", cx, cy + 10);
}

// ── Active vs Recently Sold ────────────────────────────────────────────────
function renderActiveVsSold(container: HTMLElement) {
  const section = el("div", { style: "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:24px;" });
  const h2 = el("h2", { style: "margin:0 0 16px 0;font-size:16px;font-weight:600;color:#f8fafc;" });
  h2.textContent = "Active vs Recently Sold Comparison";
  section.appendChild(h2);

  const grid = el("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:20px;" });

  // Active panel
  const activePanel = el("div", { style: "background:#0f172a;border:1px solid #334155;border-radius:8px;padding:16px;" });
  activePanel.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
      <span style="width:10px;height:10px;border-radius:50%;background:#3b82f6;"></span>
      <span style="font-size:14px;font-weight:600;color:#f8fafc;">Active Listings</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div><div style="font-size:11px;color:#94a3b8;">Total Count</div><div style="font-size:18px;font-weight:700;color:#f8fafc;">${overview.total_active.toLocaleString("en-GB")}</div></div>
      <div><div style="font-size:11px;color:#94a3b8;">Avg Price</div><div style="font-size:18px;font-weight:700;color:#10b981;">${fmtGBP(overview.avg_price)}</div></div>
      <div><div style="font-size:11px;color:#94a3b8;">Avg Mileage</div><div style="font-size:18px;font-weight:700;color:#f8fafc;">${overview.avg_mileage.toLocaleString("en-GB")} mi</div></div>
      <div><div style="font-size:11px;color:#94a3b8;">Top Make</div><div style="font-size:18px;font-weight:700;color:#f8fafc;">${makes[0]?.make ?? "N/A"}</div></div>
    </div>
  `;
  grid.appendChild(activePanel);

  // Recent panel
  const recentPanel = el("div", { style: "background:#0f172a;border:1px solid #334155;border-radius:8px;padding:16px;" });
  const priceDiff = overview.avg_price - recentStats.avg_price;
  const priceDiffPct = ((priceDiff / recentStats.avg_price) * 100).toFixed(1);
  const diffColor = priceDiff > 0 ? "#10b981" : "#ef4444";
  const diffArrow = priceDiff > 0 ? "&#9650;" : "&#9660;";

  recentPanel.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
      <span style="width:10px;height:10px;border-radius:50%;background:#f59e0b;"></span>
      <span style="font-size:14px;font-weight:600;color:#f8fafc;">Recently Sold (90 Days)</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div><div style="font-size:11px;color:#94a3b8;">Total Sold</div><div style="font-size:18px;font-weight:700;color:#f8fafc;">${recentStats.total.toLocaleString("en-GB")}</div></div>
      <div><div style="font-size:11px;color:#94a3b8;">Avg Sold Price</div><div style="font-size:18px;font-weight:700;color:#f59e0b;">${fmtGBP(recentStats.avg_price)}</div></div>
      <div><div style="font-size:11px;color:#94a3b8;">Avg Mileage</div><div style="font-size:18px;font-weight:700;color:#f8fafc;">${recentStats.avg_mileage.toLocaleString("en-GB")} mi</div></div>
      <div><div style="font-size:11px;color:#94a3b8;">Price Delta</div><div style="font-size:18px;font-weight:700;color:${diffColor};">${diffArrow} ${priceDiffPct}%</div></div>
    </div>
  `;
  grid.appendChild(recentPanel);

  section.appendChild(grid);
  container.appendChild(section);
}

// ── Price Tier Analysis ────────────────────────────────────────────────────
function renderPriceTiers(container: HTMLElement) {
  const section = el("div", { style: "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:24px;" });
  const h2 = el("h2", { style: "margin:0 0 16px 0;font-size:16px;font-weight:600;color:#f8fafc;" });
  h2.textContent = "Price Tier Analysis";
  section.appendChild(h2);

  const grid = el("div", { style: "display:grid;grid-template-columns:repeat(4, 1fr);gap:16px;" });

  for (const tier of priceTiers) {
    const card = el("div", { style: `background:#0f172a;border:1px solid #334155;border-radius:10px;padding:16px;border-top:3px solid ${tier.color};` });
    card.innerHTML = `
      <div style="font-size:15px;font-weight:700;color:#f8fafc;margin-bottom:2px;">${tier.label}</div>
      <div style="font-size:11px;color:#64748b;margin-bottom:12px;">${tier.range}</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="font-size:11px;color:#94a3b8;">Listings</span>
        <span style="font-size:13px;font-weight:600;color:#e2e8f0;">${tier.count.toLocaleString("en-GB")}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="font-size:11px;color:#94a3b8;">Avg Price</span>
        <span style="font-size:13px;font-weight:600;color:#10b981;">${fmtGBP(tier.avg_price)}</span>
      </div>
      <div style="margin-top:8px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:11px;color:#94a3b8;">Market Share</span>
          <span style="font-size:12px;font-weight:600;color:${tier.color};">${tier.share}%</span>
        </div>
        <div style="height:8px;background:#334155;border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${tier.share}%;background:${tier.color};border-radius:4px;"></div>
        </div>
      </div>
    `;
    grid.appendChild(card);
  }

  section.appendChild(grid);
  container.appendChild(section);
}

// ── Fuel Type Analysis ─────────────────────────────────────────────────────
interface FuelTypeData {
  fuel_type: string;
  count: number;
  share: number;
  avg_price: number;
  color: string;
  trend: string;
}

const MOCK_FUEL_TYPES: FuelTypeData[] = [
  { fuel_type: "Petrol", count: 142500, share: 50.0, avg_price: 16200, color: "#3b82f6", trend: "Declining" },
  { fuel_type: "Diesel", count: 71250, share: 25.0, avg_price: 17800, color: "#64748b", trend: "Declining" },
  { fuel_type: "Hybrid", count: 42750, share: 15.0, avg_price: 23400, color: "#10b981", trend: "Growing" },
  { fuel_type: "Electric", count: 22800, share: 8.0, avg_price: 28900, color: "#8b5cf6", trend: "Growing Rapidly" },
  { fuel_type: "Plug-in Hybrid", count: 5700, share: 2.0, avg_price: 26100, color: "#06b6d4", trend: "Stable" },
];

function renderFuelTypeAnalysis(container: HTMLElement) {
  const section = el("div", { style: "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:24px;" });
  const h2 = el("h2", { style: "margin:0 0 16px 0;font-size:16px;font-weight:600;color:#f8fafc;" });
  h2.textContent = "Fuel Type Breakdown";
  section.appendChild(h2);

  const tableWrap = el("div", { style: "overflow-x:auto;" });
  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;font-size:13px;";

  const thead = document.createElement("thead");
  thead.innerHTML = `<tr style="border-bottom:2px solid #334155;">
    <th style="text-align:left;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Fuel Type</th>
    <th style="text-align:right;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Listings</th>
    <th style="text-align:right;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Market Share</th>
    <th style="text-align:right;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Avg Price</th>
    <th style="text-align:left;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Trend</th>
    <th style="text-align:left;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;min-width:150px;">Share</th>
  </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const fuelRows = fuelTypes.length > 0 ? fuelTypes : MOCK_FUEL_TYPES;
  for (const ft of fuelRows) {
    const trendColor = ft.trend.includes("Growing") ? "#10b981" : ft.trend === "Stable" ? "#f59e0b" : "#ef4444";
    const tr = document.createElement("tr");
    tr.style.cssText = "border-bottom:1px solid #334155;";
    tr.innerHTML = `
      <td style="padding:10px 12px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${ft.color};margin-right:8px;"></span><span style="color:#f8fafc;font-weight:500;">${ft.fuel_type}</span></td>
      <td style="padding:10px 12px;text-align:right;color:#e2e8f0;">${ft.count.toLocaleString("en-GB")}</td>
      <td style="padding:10px 12px;text-align:right;color:#e2e8f0;">${ft.share.toFixed(1)}%</td>
      <td style="padding:10px 12px;text-align:right;color:#10b981;font-weight:600;">${fmtGBP(ft.avg_price)}</td>
      <td style="padding:10px 12px;color:${trendColor};font-weight:500;font-size:12px;">${ft.trend}</td>
      <td style="padding:10px 12px;">
        <div style="height:12px;background:#334155;border-radius:6px;overflow:hidden;">
          <div style="height:100%;width:${ft.share}%;background:${ft.color};border-radius:6px;"></div>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  section.appendChild(tableWrap);
  container.appendChild(section);
}

// ── Regional Highlights ────────────────────────────────────────────────────
interface RegionData {
  region: string;
  listings: number;
  avg_price: number;
  top_make: string;
  supply_level: string;
}

const MOCK_REGIONS: RegionData[] = [
  { region: "London & South East", listings: 68400, avg_price: 21200, top_make: "BMW", supply_level: "High" },
  { region: "Midlands", listings: 42750, avg_price: 16800, top_make: "Ford", supply_level: "High" },
  { region: "North West", listings: 34200, avg_price: 15900, top_make: "Ford", supply_level: "Medium" },
  { region: "Scotland", listings: 22800, avg_price: 16400, top_make: "Volkswagen", supply_level: "Medium" },
  { region: "Yorkshire & Humber", listings: 21375, avg_price: 15500, top_make: "Ford", supply_level: "Medium" },
  { region: "South West", listings: 19950, avg_price: 17600, top_make: "Toyota", supply_level: "Low" },
  { region: "Wales", listings: 11400, avg_price: 14200, top_make: "Vauxhall", supply_level: "Low" },
  { region: "North East", listings: 9975, avg_price: 14800, top_make: "Nissan", supply_level: "Low" },
];

function renderRegionalHighlights(container: HTMLElement) {
  const section = el("div", { style: "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:24px;" });
  const h2 = el("h2", { style: "margin:0 0 16px 0;font-size:16px;font-weight:600;color:#f8fafc;" });
  h2.textContent = "Regional Market Overview";
  section.appendChild(h2);

  const grid = el("div", { style: "display:grid;grid-template-columns:repeat(4, 1fr);gap:12px;" });

  for (const region of MOCK_REGIONS) {
    const supplyColor = region.supply_level === "High" ? "#10b981" : region.supply_level === "Medium" ? "#f59e0b" : "#ef4444";
    const card = el("div", { style: "background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px;" });
    card.innerHTML = `
      <div style="font-size:13px;font-weight:600;color:#f8fafc;margin-bottom:8px;">${region.region}</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="font-size:11px;color:#64748b;">Listings</span>
        <span style="font-size:12px;color:#e2e8f0;font-weight:500;">${region.listings.toLocaleString("en-GB")}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="font-size:11px;color:#64748b;">Avg Price</span>
        <span style="font-size:12px;color:#10b981;font-weight:500;">${fmtGBP(region.avg_price)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="font-size:11px;color:#64748b;">Top Make</span>
        <span style="font-size:12px;color:#e2e8f0;">${region.top_make}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="font-size:11px;color:#64748b;">Supply</span>
        <span style="font-size:11px;font-weight:600;color:${supplyColor};">${region.supply_level}</span>
      </div>
    `;
    grid.appendChild(card);
  }

  section.appendChild(grid);
  container.appendChild(section);
}

// ── Market Health Indicators ───────────────────────────────────────────────
function renderMarketHealth(container: HTMLElement) {
  const section = el("div", { style: "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:24px;" });
  const h2 = el("h2", { style: "margin:0 0 16px 0;font-size:16px;font-weight:600;color:#f8fafc;" });
  h2.textContent = "Market Health Indicators";
  section.appendChild(h2);

  const indicators = [
    { label: "Days on Market (Avg)", value: "32 days", status: "Normal", statusColor: "#10b981", description: "Stable turnover rate" },
    { label: "Price-to-List Ratio", value: "96.2%", status: "Healthy", statusColor: "#10b981", description: "Buyers paying close to asking" },
    { label: "New Listings (Weekly)", value: "18,200", status: "Growing", statusColor: "#3b82f6", description: "+4.2% vs last month" },
    { label: "Inventory Months Supply", value: "2.8 months", status: "Tight", statusColor: "#f59e0b", description: "Below balanced market (3-4 mo)" },
    { label: "EV Adoption Rate", value: "8.0%", status: "Accelerating", statusColor: "#8b5cf6", description: "+2.1pp year-over-year" },
    { label: "Premium Segment Share", value: "28.0%", status: "Stable", statusColor: "#10b981", description: "BMW + Audi + Mercedes" },
  ];

  const grid = el("div", { style: "display:grid;grid-template-columns:repeat(3, 1fr);gap:12px;" });

  for (const ind of indicators) {
    const card = el("div", { style: "background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px;" });
    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span style="font-size:12px;color:#94a3b8;">${ind.label}</span>
        <span style="font-size:10px;padding:2px 8px;border-radius:8px;background:${ind.statusColor}22;color:${ind.statusColor};font-weight:600;">${ind.status}</span>
      </div>
      <div style="font-size:20px;font-weight:700;color:#f8fafc;margin-bottom:4px;">${ind.value}</div>
      <div style="font-size:11px;color:#64748b;">${ind.description}</div>
    `;
    grid.appendChild(card);
  }

  section.appendChild(grid);
  container.appendChild(section);
}

// ── Init ───────────────────────────────────────────────────────────────────
const urlParams = _getUrlParams();
if (urlParams.make) activeMakeFilter = urlParams.make;
loadData();
