/**
 * Insurance Premium Benchmarker
 * Segment-level replacement cost distributions and risk analysis for underwriting decisions.
 */
import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "insurance-premium-benchmarker" }); } catch {}

function _getAuth(): { mode: "api_key" | "oauth_token" | null; value: string | null } {
  const params = new URLSearchParams(location.search);
  const token = params.get("access_token") ?? localStorage.getItem("mc_access_token");
  if (token) return { mode: "oauth_token", value: token };
  const key = params.get("api_key") ?? localStorage.getItem("mc_api_key");
  if (key) return { mode: "api_key", value: key };
  return { mode: null, value: null };
}
function _detectAppMode(): "mcp" | "live" | "demo" { if (_getAuth().value) return "live"; if (_safeApp && window.parent !== window) return "mcp"; return "demo"; }
function _isEmbedMode(): boolean { return new URLSearchParams(location.search).has("embed"); }
function _getUrlParams(): Record<string, string> { const params = new URLSearchParams(location.search); const result: Record<string, string> = {}; for (const key of ["vin","zip","make","model","miles","state","dealer_id","ticker","price"]) { const v = params.get(key); if (v) result[key] = v; } return result; }
function _proxyBase(): string { return location.protocol.startsWith("http") ? "" : "http://localhost:3001"; }

// ── Direct MarketCheck API Client (browser → api.marketcheck.com) ──────
const _MC = "https://api.marketcheck.com";
let _lastApiStatus: number | null = null;
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
  _lastApiStatus = res.status;
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

// Fetch real-data inputs in parallel:
//  • summary_by=state → ~1000 rows of monthly state/make/model/body_type sold counts + price stats.
//    Drives the KPIs, state rankings, model rankings, and distribution histogram.
//  • Per-fuel-type active-listing stats × 4 (Unleaded/Diesel/Hybrid/Electric).
//    Drives a real EV-vs-ICE comparison (avg replacement cost + std/avg volatility).
//  Args from the UI (state, year_from/to) flow through as filters where applicable.
async function _fetchDirect(args: any = {}) {
  const summaryArgs: Record<string, any> = { summary_by: "state" };
  if (args.state) summaryArgs.state = args.state;
  if (args.year_from) summaryArgs.year_from = args.year_from;
  if (args.year_to) summaryArgs.year_to = args.year_to;

  const fuelTypes = ["Unleaded", "Diesel", "Hybrid", "Electric"];
  const [sold, ...fuelStats] = await Promise.all([
    _mcSold(summaryArgs).catch(() => null),
    ...fuelTypes.map(ft => _mcActive({ fuel_type: ft, stats: "price", rows: 0 }).catch(() => null)),
  ]);
  const fuelData: Record<string, any> = {};
  fuelTypes.forEach((ft, i) => { fuelData[ft] = fuelStats[i]; });
  return { sold, fuelData };
}
async function _callTool(toolName: string, args: any) {
  const auth = _getAuth();
  if (auth.value) {
    // 1. Direct API first — hits api.marketcheck.com from the browser.
    try {
      const data = await _fetchDirect(args);
      if (data) return { content: [{ type: "text", text: JSON.stringify(data) }] };
    } catch {}
    // 2. Proxy fallback — same-origin server tool, if a future build registers it.
    try {
      const r = await fetch((_proxyBase()) + "/api/proxy/" + toolName, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, _auth_mode: auth.mode, _auth_value: auth.value }),
      });
      if (r.ok) { const d = await r.json(); return { content: [{ type: "text", text: JSON.stringify(d) }] }; }
    } catch {}
  }
  // 3. MCP mode — only when actually iframed into an MCP host with no auth.
  if (_safeApp && window.parent !== window) {
    try { return await _safeApp.callServerTool({ name: toolName, arguments: args }); } catch {}
  }
  // 4. Demo mode (caller falls back to mock when this returns null).
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
(function injectResponsiveStyles() { const s = document.createElement("style"); s.textContent = `@media(max-width:768px){body{font-size:13px!important}table{font-size:12px!important}th,td{padding:6px 8px!important}h1{font-size:18px!important}h2{font-size:15px!important}canvas{max-width:100%!important}input,select,button{font-size:14px!important}[style*="display:flex"][style*="gap"],[style*="display: flex"][style*="gap"]{flex-wrap:wrap!important}[style*="grid-template-columns: repeat"]{grid-template-columns:1fr!important}[style*="grid-template-columns:repeat"]{grid-template-columns:1fr!important}div[style*="overflow-x:auto"],div[style*="overflow-x: auto"]{-webkit-overflow-scrolling:touch}table{min-width:600px}[style*="width:35%"],[style*="width:40%"],[style*="width:25%"],[style*="width:50%"],[style*="width:60%"],[style*="width:65%"],[style*="width: 35%"],[style*="width: 40%"],[style*="width: 25%"],[style*="width: 50%"],[style*="width: 60%"],[style*="width: 65%"]{width:100%!important;min-width:0!important}}@media(max-width:480px){body{padding:8px!important}h1{font-size:16px!important}th,td{padding:4px 6px!important;font-size:11px!important}input,select{max-width:100%!important;width:100%!important;box-sizing:border-box!important}}`; document.head.appendChild(s); })();


// ── Types ──────────────────────────────────────────────────────────────────────

interface SegmentCell {
  bodyType: string;
  fuelType: string;
  avgCost: number;
  volatility: number;
  sampleSize: number;
}

interface StateRanking {
  state: string;
  avgPrice: number;
  volume: number;
}

interface EvIceComparison {
  label: string;
  evValue: number;
  iceValue: number;
}

interface HighVolatilityModel {
  make: string;
  model: string;
  avgPrice: number;
  volatility: number;
  sampleSize: number;
  bodyType: string;
}

interface BenchmarkResult {
  avgReplacementCost: number;
  priceVolatility: number;
  totalSampleSize: number;
  highestRiskSegment: string;
  segmentMatrix: SegmentCell[];
  distributionBuckets: { label: string; count: number }[];
  stateRankings: StateRanking[];
  evIceComparison: EvIceComparison[];
  highVolatilityModels: HighVolatilityModel[];
}

// ── Mock Data ──────────────────────────────────────────────────────────────────

function getMockData(): BenchmarkResult {
  return {
    avgReplacementCost: 31250,
    priceVolatility: 0.218,
    totalSampleSize: 284500,
    highestRiskSegment: "EV / SUV",
    segmentMatrix: [
      { bodyType: "SUV", fuelType: "Gasoline", avgCost: 32400, volatility: 0.19, sampleSize: 68200 },
      { bodyType: "SUV", fuelType: "Diesel", avgCost: 34800, volatility: 0.17, sampleSize: 8400 },
      { bodyType: "SUV", fuelType: "Hybrid", avgCost: 36200, volatility: 0.22, sampleSize: 12600 },
      { bodyType: "SUV", fuelType: "Electric", avgCost: 44500, volatility: 0.31, sampleSize: 9800 },
      { bodyType: "Sedan", fuelType: "Gasoline", avgCost: 24200, volatility: 0.15, sampleSize: 52100 },
      { bodyType: "Sedan", fuelType: "Diesel", avgCost: 26800, volatility: 0.14, sampleSize: 3200 },
      { bodyType: "Sedan", fuelType: "Hybrid", avgCost: 28400, volatility: 0.18, sampleSize: 11400 },
      { bodyType: "Sedan", fuelType: "Electric", avgCost: 39800, volatility: 0.28, sampleSize: 14200 },
      { bodyType: "Truck", fuelType: "Gasoline", avgCost: 38200, volatility: 0.21, sampleSize: 41800 },
      { bodyType: "Truck", fuelType: "Diesel", avgCost: 42600, volatility: 0.19, sampleSize: 18700 },
      { bodyType: "Truck", fuelType: "Hybrid", avgCost: 41200, volatility: 0.23, sampleSize: 4200 },
      { bodyType: "Truck", fuelType: "Electric", avgCost: 52800, volatility: 0.34, sampleSize: 2800 },
      { bodyType: "Coupe", fuelType: "Gasoline", avgCost: 29600, volatility: 0.24, sampleSize: 12400 },
      { bodyType: "Coupe", fuelType: "Electric", avgCost: 46200, volatility: 0.29, sampleSize: 3100 },
      { bodyType: "Van", fuelType: "Gasoline", avgCost: 33800, volatility: 0.16, sampleSize: 9200 },
      { bodyType: "Van", fuelType: "Electric", avgCost: 48200, volatility: 0.27, sampleSize: 1800 },
      { bodyType: "Convertible", fuelType: "Gasoline", avgCost: 35400, volatility: 0.26, sampleSize: 5800 },
      { bodyType: "Wagon", fuelType: "Gasoline", avgCost: 27200, volatility: 0.17, sampleSize: 3700 },
    ],
    distributionBuckets: [
      { label: "$10K-$15K", count: 14200 },
      { label: "$15K-$20K", count: 28600 },
      { label: "$20K-$25K", count: 42800 },
      { label: "$25K-$30K", count: 51200 },
      { label: "$30K-$35K", count: 48100 },
      { label: "$35K-$40K", count: 38400 },
      { label: "$40K-$45K", count: 26200 },
      { label: "$45K-$50K", count: 17800 },
      { label: "$50K-$60K", count: 11400 },
      { label: "$60K+", count: 5800 },
    ],
    stateRankings: [
      { state: "California", avgPrice: 35200, volume: 42100 },
      { state: "New York", avgPrice: 33800, volume: 22400 },
      { state: "Washington", avgPrice: 33100, volume: 11200 },
      { state: "New Jersey", avgPrice: 32600, volume: 14800 },
      { state: "Massachusetts", avgPrice: 32400, volume: 10600 },
      { state: "Connecticut", avgPrice: 32100, volume: 6200 },
      { state: "Colorado", avgPrice: 31800, volume: 9800 },
      { state: "Oregon", avgPrice: 31400, volume: 7400 },
      { state: "Florida", avgPrice: 30900, volume: 34200 },
      { state: "Texas", avgPrice: 30200, volume: 38600 },
      { state: "Illinois", avgPrice: 29800, volume: 18400 },
      { state: "Pennsylvania", avgPrice: 29400, volume: 16200 },
      { state: "Ohio", avgPrice: 28200, volume: 14800 },
      { state: "Michigan", avgPrice: 27600, volume: 12200 },
      { state: "Indiana", avgPrice: 26800, volume: 8400 },
    ],
    evIceComparison: [
      { label: "Avg Replacement Cost", evValue: 41200, iceValue: 28400 },
      { label: "Price Volatility", evValue: 0.29, iceValue: 0.18 },
      { label: "Avg Depreciation (1yr)", evValue: 0.22, iceValue: 0.14 },
      { label: "Avg Claim Severity", evValue: 8400, iceValue: 5200 },
      { label: "Parts Cost Index", evValue: 142, iceValue: 100 },
      { label: "Total Loss Rate (%)", evValue: 18.2, iceValue: 11.4 },
    ],
    highVolatilityModels: [
      { make: "Tesla", model: "Model 3", avgPrice: 34200, volatility: 0.32, sampleSize: 8400, bodyType: "Sedan" },
      { make: "Tesla", model: "Model Y", avgPrice: 42800, volatility: 0.29, sampleSize: 12200, bodyType: "SUV" },
      { make: "Ford", model: "F-150 Lightning", avgPrice: 48200, volatility: 0.31, sampleSize: 3200, bodyType: "Truck" },
      { make: "BMW", model: "iX", avgPrice: 62400, volatility: 0.28, sampleSize: 1800, bodyType: "SUV" },
      { make: "Rivian", model: "R1T", avgPrice: 58600, volatility: 0.35, sampleSize: 1200, bodyType: "Truck" },
      { make: "Chevrolet", model: "Corvette", avgPrice: 68200, volatility: 0.27, sampleSize: 4200, bodyType: "Coupe" },
      { make: "Porsche", model: "Taycan", avgPrice: 72400, volatility: 0.26, sampleSize: 2400, bodyType: "Sedan" },
      { make: "Mercedes-Benz", model: "EQS", avgPrice: 84200, volatility: 0.25, sampleSize: 1400, bodyType: "Sedan" },
      { make: "Lucid", model: "Air", avgPrice: 68800, volatility: 0.38, sampleSize: 800, bodyType: "Sedan" },
      { make: "GMC", model: "Hummer EV", avgPrice: 78400, volatility: 0.33, sampleSize: 900, bodyType: "Truck" },
      { make: "Ford", model: "Mustang Mach-E", avgPrice: 38400, volatility: 0.26, sampleSize: 4800, bodyType: "SUV" },
      { make: "Hyundai", model: "Ioniq 5", avgPrice: 36200, volatility: 0.24, sampleSize: 3600, bodyType: "SUV" },
      { make: "Kia", model: "EV6", avgPrice: 38800, volatility: 0.25, sampleSize: 2800, bodyType: "SUV" },
      { make: "Volkswagen", model: "ID.4", avgPrice: 32400, volatility: 0.23, sampleSize: 2200, bodyType: "SUV" },
      { make: "Nissan", model: "Ariya", avgPrice: 36800, volatility: 0.22, sampleSize: 1800, bodyType: "SUV" },
    ],
  };
}

// ── Real-data mapper ───────────────────────────────────────────────────────────
// Takes raw `/api/v1/sold-vehicles/summary?summary_by=state` rows and produces
// a fully-populated BenchmarkResult by aggregating (state, make, model, body_type)
// across months, weighted by sold_count. The fuel-type axis is not in the
// response, so segmentMatrix and evIceComparison fall back to mock for those
// dimensions while everything else (KPIs, state rankings, high-volatility
// models, distribution buckets) is real.
function _mapBenchmark(payload: any): BenchmarkResult | null {
  // payload is the new shape from _fetchDirect: { sold: {...}, fuelData: {...} }
  // (or the old single-summary shape for backwards-compat with cached/MCP responses)
  const sold = payload?.sold ?? payload;
  const fuelData = payload?.fuelData ?? null;
  const rows: any[] = Array.isArray(sold?.data) ? sold.data : [];
  if (!rows.length) return null;
  const num = (v: any) => { const n = typeof v === "number" ? v : parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const mock = getMockData();

  // Headline aggregates
  let totalSold = 0, weightedPrice = 0, weightedStd = 0;
  for (const r of rows) {
    const sold = num(r.sold_count);
    totalSold += sold;
    weightedPrice += num(r.average_sale_price) * sold;
    weightedStd += num(r.sale_price_std_dev) * sold;
  }
  const avgReplacementCost = totalSold > 0 ? Math.round(weightedPrice / totalSold) : 0;
  const avgStd = totalSold > 0 ? weightedStd / totalSold : 0;
  const priceVolatility = avgReplacementCost > 0 ? avgStd / avgReplacementCost : 0;

  // Highest-risk segment by body type (highest weighted volatility)
  const bodyAgg = new Map<string, { sold: number; priceSum: number; stdSum: number }>();
  for (const r of rows) {
    const bt = String(r.body_type ?? "").trim();
    if (!bt) continue;
    const cur = bodyAgg.get(bt) ?? { sold: 0, priceSum: 0, stdSum: 0 };
    const sold = num(r.sold_count);
    cur.sold += sold;
    cur.priceSum += num(r.average_sale_price) * sold;
    cur.stdSum += num(r.sale_price_std_dev) * sold;
    bodyAgg.set(bt, cur);
  }
  let highestRiskSegment = "—";
  let highestVol = 0;
  for (const [bt, v] of bodyAgg.entries()) {
    if (v.sold === 0) continue;
    const avg = v.priceSum / v.sold;
    const vol = avg > 0 ? (v.stdSum / v.sold) / avg : 0;
    if (vol > highestVol) { highestVol = vol; highestRiskSegment = bt; }
  }

  // State rankings — top 15 by avg sale price
  const stateAgg = new Map<string, { sold: number; priceSum: number }>();
  for (const r of rows) {
    const st = String(r.state ?? "").trim();
    if (!st) continue;
    const cur = stateAgg.get(st) ?? { sold: 0, priceSum: 0 };
    const sold = num(r.sold_count);
    cur.sold += sold;
    cur.priceSum += num(r.average_sale_price) * sold;
    stateAgg.set(st, cur);
  }
  const stateRankings: StateRanking[] = Array.from(stateAgg.entries())
    .filter(([, v]) => v.sold > 0)
    .map(([st, v]) => ({ state: st, avgPrice: Math.round(v.priceSum / v.sold), volume: v.sold }))
    .sort((a, b) => b.avgPrice - a.avgPrice)
    .slice(0, 15);

  // High-volatility models — group by (make, model), sort by volatility desc
  const modelAgg = new Map<string, { make: string; model: string; bodyType: string; sold: number; priceSum: number; stdSum: number }>();
  for (const r of rows) {
    const make = String(r.make ?? "").trim();
    const model = String(r.model ?? "").trim();
    if (!make || !model) continue;
    const k = `${make}|${model}`;
    const cur = modelAgg.get(k) ?? { make, model, bodyType: String(r.body_type ?? ""), sold: 0, priceSum: 0, stdSum: 0 };
    const sold = num(r.sold_count);
    cur.sold += sold;
    cur.priceSum += num(r.average_sale_price) * sold;
    cur.stdSum += num(r.sale_price_std_dev) * sold;
    modelAgg.set(k, cur);
  }
  const highVolatilityModels: HighVolatilityModel[] = Array.from(modelAgg.values())
    .filter(m => m.sold >= 5)
    .map(m => {
      const avg = m.priceSum / m.sold;
      return {
        make: m.make,
        model: m.model,
        avgPrice: Math.round(avg),
        volatility: avg > 0 ? +(m.stdSum / m.sold / avg).toFixed(3) : 0,
        sampleSize: m.sold,
        bodyType: m.bodyType,
      };
    })
    .sort((a, b) => b.volatility - a.volatility)
    .slice(0, 15);

  // Distribution buckets — weight each row's avg_sale_price by sold_count
  const buckets = [
    { label: "$10K-$15K", count: 0 }, { label: "$15K-$20K", count: 0 },
    { label: "$20K-$25K", count: 0 }, { label: "$25K-$30K", count: 0 },
    { label: "$30K-$35K", count: 0 }, { label: "$35K-$40K", count: 0 },
    { label: "$40K-$45K", count: 0 }, { label: "$45K-$50K", count: 0 },
    { label: "$50K-$60K", count: 0 }, { label: "$60K+", count: 0 },
  ];
  for (const r of rows) {
    const price = num(r.average_sale_price);
    const sold = num(r.sold_count);
    let i: number;
    if (price < 15000) i = 0;
    else if (price < 20000) i = 1;
    else if (price < 25000) i = 2;
    else if (price < 30000) i = 3;
    else if (price < 35000) i = 4;
    else if (price < 40000) i = 5;
    else if (price < 45000) i = 6;
    else if (price < 50000) i = 7;
    else if (price < 60000) i = 8;
    else i = 9;
    buckets[i].count += sold;
  }

  // EV vs ICE comparison — REAL data via 4 calls to /search/car/active filtered by fuel_type.
  // ICE = Unleaded + Diesel pooled by sample size. Hybrid shown as a reference row.
  const ev = fuelData?.Electric?.stats?.price;
  const hyb = fuelData?.Hybrid?.stats?.price;
  const unl = fuelData?.Unleaded?.stats?.price;
  const dsl = fuelData?.Diesel?.stats?.price;
  const evIceComparison: EvIceComparison[] = (ev && unl)
    ? (() => {
        const evMean = num(ev.mean), evStd = num(ev.stddev), evCount = num(ev.count);
        const iceCount = num(unl?.count) + num(dsl?.count);
        const iceMean = iceCount > 0
          ? (num(unl.mean) * num(unl.count) + num(dsl?.mean) * num(dsl?.count)) / iceCount
          : num(unl.mean);
        const iceStd = iceCount > 0
          ? (num(unl.stddev) * num(unl.count) + num(dsl?.stddev) * num(dsl?.count)) / iceCount
          : num(unl.stddev);
        const evVol = evMean > 0 ? evStd / evMean : 0;
        const iceVol = iceMean > 0 ? iceStd / iceMean : 0;
        const out: EvIceComparison[] = [
          { label: "Avg Replacement Cost", evValue: Math.round(evMean), iceValue: Math.round(iceMean) },
          { label: "Price Volatility", evValue: +evVol.toFixed(3), iceValue: +iceVol.toFixed(3) },
          { label: "Sample Size", evValue: evCount, iceValue: iceCount },
        ];
        if (hyb?.mean) out.push({ label: "Avg Hybrid Cost (reference)", evValue: Math.round(num(hyb.mean)), iceValue: Math.round(iceMean) });
        return out;
      })()
    : mock.evIceComparison;

  return {
    avgReplacementCost,
    priceVolatility: +priceVolatility.toFixed(3),
    totalSampleSize: totalSold,
    highestRiskSegment,
    // segmentMatrix needs body × fuel cells (~28 combinations) — too expensive to
    // call live. Kept as illustrative reference data with a UI label so users know.
    segmentMatrix: mock.segmentMatrix,
    evIceComparison,
    distributionBuckets: buckets.some(b => b.count > 0) ? buckets : mock.distributionBuckets,
    stateRankings: stateRankings.length ? stateRankings : mock.stateRankings,
    highVolatilityModels: highVolatilityModels.length ? highVolatilityModels : mock.highVolatilityModels,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtCurrency(v: number): string {
  return "$" + Math.round(v).toLocaleString();
}

function fmtNumber(v: number): string {
  return Math.round(v).toLocaleString();
}

function fmtPercent(v: number): string {
  return (v * 100).toFixed(1) + "%";
}

function volatilityColor(v: number): string {
  if (v < 0.18) return "#10b981";
  if (v < 0.24) return "#f59e0b";
  if (v < 0.30) return "#f97316";
  return "#ef4444";
}

function volatilityLabel(v: number): string {
  if (v < 0.18) return "Low";
  if (v < 0.24) return "Moderate";
  if (v < 0.30) return "High";
  return "Very High";
}

// ── Canvas: Replacement Cost Distribution Histogram ────────────────────────────

function drawHistogram(canvas: HTMLCanvasElement, buckets: { label: string; count: number }[]) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  const padLeft = 60;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 55;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  const maxCount = Math.max(...buckets.map(b => b.count));
  const barWidth = chartW / buckets.length;
  const barGap = 4;

  // Background grid lines
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 5; i++) {
    const y = padTop + (chartH / 5) * i;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();

    const val = maxCount - (maxCount / 5) * i;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(fmtNumber(val), padLeft - 8, y);
  }

  // Bars with gradient coloring
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    const barH = (b.count / maxCount) * chartH;
    const x = padLeft + i * barWidth + barGap / 2;
    const y = padTop + chartH - barH;
    const bw = barWidth - barGap;

    // Color gradient: blue -> cyan -> purple based on price bucket
    const ratio = i / (buckets.length - 1);
    const r = Math.round(59 + ratio * (139 - 59));
    const g = Math.round(130 + ratio * (92 - 130));
    const b2 = Math.round(246 + ratio * (246 - 246));
    ctx.fillStyle = `rgb(${r}, ${g}, ${b2})`;

    // Rounded top corners
    const radius = 3;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + bw - radius, y);
    ctx.quadraticCurveTo(x + bw, y, x + bw, y + radius);
    ctx.lineTo(x + bw, padTop + chartH);
    ctx.lineTo(x, padTop + chartH);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.fill();

    // Count label on top
    if (barH > 20) {
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 10px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(fmtNumber(b.count), x + bw / 2, y - 4);
    }

    // X-axis label
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.save();
    ctx.translate(x + bw / 2, padTop + chartH + 8);
    ctx.rotate(-0.4);
    ctx.fillText(b.label, 0, 0);
    ctx.restore();
  }

  // Axes
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padLeft, padTop);
  ctx.lineTo(padLeft, padTop + chartH);
  ctx.lineTo(w - padRight, padTop + chartH);
  ctx.stroke();

  // Y-axis title
  ctx.save();
  ctx.translate(14, padTop + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Vehicle Count", 0, 0);
  ctx.restore();
}

// ── Main App ───────────────────────────────────────────────────────────────────

async function main() {
  try { (_safeApp as any)?.connect?.(); } catch {}

  document.body.style.cssText = "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;overflow-x:hidden;";

  const container = document.createElement("div");
  container.style.cssText = "max-width:1200px;margin:0 auto;padding:16px 20px;";
  document.body.appendChild(container);

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
    container.appendChild(_db);
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

  // ── Header ──
  const header = document.createElement("div");
  header.style.cssText = "background:#1e293b;padding:16px 20px;border-radius:10px;margin-bottom:16px;border:1px solid #334155;display:flex;align-items:center;";
  header.innerHTML = `<div><h1 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#f8fafc;">Insurance Premium Benchmarker</h1>
    <p style="margin:0;font-size:13px;color:#94a3b8;">Segment-level replacement cost distributions and risk analysis for underwriting decisions</p></div>`;
  container.appendChild(header);
  _addSettingsBar(header);

  // ── Search Form ──
  const formPanel = document.createElement("div");
  formPanel.style.cssText = "background:#1e293b;padding:16px 20px;border-radius:10px;margin-bottom:16px;border:1px solid #334155;display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;";

  function makeSelect(label: string, options: string[], width = "160px"): HTMLSelectElement {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    wrap.innerHTML = `<label style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">${label}</label>`;
    const sel = document.createElement("select");
    sel.style.cssText = `padding:10px 12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;outline:none;width:${width};cursor:pointer;`;
    for (const opt of options) {
      const o = document.createElement("option");
      o.value = opt === "All" ? "" : opt;
      o.textContent = opt;
      sel.appendChild(o);
    }
    wrap.appendChild(sel);
    formPanel.appendChild(wrap);
    return sel;
  }

  function makeInput(label: string, placeholder: string, width = "100px"): HTMLInputElement {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    wrap.innerHTML = `<label style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">${label}</label>`;
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholder;
    input.style.cssText = `padding:10px 12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;outline:none;width:${width};`;
    input.addEventListener("focus", () => { input.style.borderColor = "#3b82f6"; });
    input.addEventListener("blur", () => { input.style.borderColor = "#334155"; });
    wrap.appendChild(input);
    formPanel.appendChild(wrap);
    return input;
  }

  const bodyTypeSelect = makeSelect("Body Type", ["All", "SUV", "Sedan", "Truck", "Coupe", "Van", "Convertible", "Wagon"]);
  const fuelTypeSelect = makeSelect("Fuel Type", ["All", "Gasoline", "Diesel", "Hybrid", "Electric"]);
  const stateInput = makeInput("State", "e.g. CA", "80px");
  const yearFromInput = makeInput("Year From", "2020", "80px");
  yearFromInput.value = "2020";
  const yearToInput = makeInput("Year To", "2025", "80px");
  yearToInput.value = "2025";

  const analyzeBtn = document.createElement("button");
  analyzeBtn.textContent = "Analyze Risk";
  analyzeBtn.style.cssText = "padding:10px 28px;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;border:none;background:#3b82f6;color:#fff;height:42px;align-self:flex-end;transition:background 0.15s;";
  analyzeBtn.addEventListener("mouseenter", () => { analyzeBtn.style.background = "#2563eb"; });
  analyzeBtn.addEventListener("mouseleave", () => { analyzeBtn.style.background = "#3b82f6"; });
  formPanel.appendChild(analyzeBtn);
  container.appendChild(formPanel);

  // ── Results Area ──
  const results = document.createElement("div");
  results.id = "results";
  container.appendChild(results);

  // ── URL Param Prefill ──
  const urlParams = _getUrlParams();
  if (urlParams.state) stateInput.value = urlParams.state;

  // ── Analyze Handler ──
  analyzeBtn.addEventListener("click", () => runAnalysis());

  async function runAnalysis() {
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "Analyzing...";
    analyzeBtn.style.opacity = "0.7";
    results.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:60px;color:#94a3b8;">
      <div style="width:24px;height:24px;border:3px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:14px;"></div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      Analyzing segment risk data...
    </div>`;

    let data: BenchmarkResult;
    let apiNotice: string | null = null;
    const mode = _detectAppMode();
    _lastApiStatus = null;

    try {
      if (mode === "demo") {
        await new Promise(r => setTimeout(r, 400));
        data = getMockData();
      } else {
        const args: Record<string, any> = {};
        if (bodyTypeSelect.value) args.body_type = bodyTypeSelect.value;
        if (fuelTypeSelect.value) args.fuel_type = fuelTypeSelect.value;
        if (stateInput.value.trim()) args.state = stateInput.value.trim();
        if (yearFromInput.value.trim()) args.year_from = yearFromInput.value.trim();
        if (yearToInput.value.trim()) args.year_to = yearToInput.value.trim();

        const response = await _callTool("benchmark-insurance-premiums", args);
        const textContent = response?.content?.find((c: any) => c.type === "text");
        const raw: any = textContent?.text ? JSON.parse(textContent.text) : null;
        // raw is the API payload `{ success, data: [...] }` — map it into BenchmarkResult.
        const mapped = _mapBenchmark(raw);
        if (mapped) {
          data = mapped;
        } else {
          data = getMockData();
          if (_lastApiStatus === 403) {
            apiNotice = "Your API key does not have access to the Sold Summary endpoint (Enterprise tier). Showing illustrative demo data instead. Contact MarketCheck to upgrade.";
          } else if (_lastApiStatus === 401) {
            apiNotice = "Invalid or expired API key. Showing illustrative demo data instead.";
          } else if (_lastApiStatus === 422) {
            apiNotice = "MarketCheck API rejected the query (422 Unprocessable Entity). Showing illustrative demo data instead.";
          } else if (_lastApiStatus && _lastApiStatus >= 400) {
            apiNotice = `MarketCheck API returned ${_lastApiStatus}. Showing illustrative demo data instead.`;
          } else if (mode === "live") {
            apiNotice = "Live API call did not return benchmark data. Showing illustrative demo data instead.";
          }
        }
      }

      renderResults(data, apiNotice);
    } catch (err: any) {
      console.error("Analysis failed, falling back to mock:", err);
      await new Promise(r => setTimeout(r, 200));
      data = getMockData();
      const status = _lastApiStatus;
      if (status === 403) apiNotice = "Your API key does not have access to the Sold Summary endpoint (Enterprise tier). Showing illustrative demo data instead.";
      else if (status === 401) apiNotice = "Invalid or expired API key. Showing illustrative demo data instead.";
      else if (status && status >= 400) apiNotice = `MarketCheck API returned ${status}. Showing illustrative demo data instead.`;
      renderResults(data, apiNotice);
    }

    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "Analyze Risk";
    analyzeBtn.style.opacity = "1";
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  function renderResults(data: BenchmarkResult, apiNotice: string | null = null) {
    results.innerHTML = "";

    // ── API Notice (Enterprise / 401 / 403) ──
    if (apiNotice) {
      const notice = document.createElement("div");
      notice.style.cssText = "background:linear-gradient(135deg,#7f1d1d22,#ef444411);border:1px solid #ef444466;border-radius:10px;padding:14px 18px;margin-bottom:16px;display:flex;align-items:flex-start;gap:12px;";
      notice.innerHTML = `<div style="font-size:18px;line-height:1;color:#fca5a5;">&#9888;</div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:#fca5a5;margin-bottom:4px;">Live data unavailable</div>
          <div style="font-size:12px;color:#fecaca;line-height:1.5;">${apiNotice}</div>
        </div>`;
      results.appendChild(notice);
    }

    // ── KPI Ribbon ──
    const kpiRibbon = document.createElement("div");
    kpiRibbon.style.cssText = "display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;";

    const kpis = [
      { label: "Avg Replacement Cost", value: fmtCurrency(data.avgReplacementCost), color: "#3b82f6" },
      { label: "Price Volatility (Std/Avg)", value: fmtPercent(data.priceVolatility), color: volatilityColor(data.priceVolatility) },
      { label: "Total Sample Size", value: fmtNumber(data.totalSampleSize), color: "#8b5cf6" },
      { label: "Highest-Risk Segment", value: data.highestRiskSegment, color: "#ef4444" },
    ];

    for (const kpi of kpis) {
      const card = document.createElement("div");
      card.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px 18px;text-align:center;";
      card.innerHTML = `<div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">${kpi.label}</div>
        <div style="font-size:22px;font-weight:800;color:${kpi.color};letter-spacing:-0.5px;">${kpi.value}</div>`;
      kpiRibbon.appendChild(card);
    }
    results.appendChild(kpiRibbon);

    // ── Segment Risk Matrix ──
    const matrixSection = document.createElement("div");
    matrixSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:18px 20px;margin-bottom:16px;";
    matrixSection.innerHTML = `<h2 style="margin:0 0 4px 0;font-size:15px;font-weight:700;color:#f8fafc;display:flex;align-items:center;gap:8px;">Segment Risk Matrix
      <span style="font-size:9px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:2px 8px;border-radius:10px;background:#7c2d1244;color:#fbbf24;border:1px solid #f59e0b66;">Illustrative</span></h2>
      <p style="margin:0 0 14px 0;font-size:11px;color:#64748b;">Body-type × fuel-type cells are illustrative reference data. Live API does not expose fuel_type breakdown for sold-summary aggregates &mdash; see EV vs ICE panel for real fuel-comparison data.</p>`;

    const bodyTypes = [...new Set(data.segmentMatrix.map(s => s.bodyType))];
    const fuelTypes = [...new Set(data.segmentMatrix.map(s => s.fuelType))];

    const tableWrap = document.createElement("div");
    tableWrap.style.cssText = "overflow-x:auto;";
    let tableHtml = `<table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr><th style="padding:10px 12px;text-align:left;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;">Body Type</th>`;
    for (const ft of fuelTypes) {
      tableHtml += `<th style="padding:10px 12px;text-align:center;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;">${ft}</th>`;
    }
    tableHtml += `</tr></thead><tbody>`;

    for (const bt of bodyTypes) {
      tableHtml += `<tr>`;
      tableHtml += `<td style="padding:10px 12px;border-bottom:1px solid #1e293b44;font-weight:600;color:#f8fafc;background:#0f172a;">${bt}</td>`;
      for (const ft of fuelTypes) {
        const cell = data.segmentMatrix.find(s => s.bodyType === bt && s.fuelType === ft);
        if (cell) {
          const vc = volatilityColor(cell.volatility);
          const vl = volatilityLabel(cell.volatility);
          tableHtml += `<td style="padding:10px 12px;border-bottom:1px solid #1e293b44;text-align:center;background:${vc}11;">
            <div style="font-weight:700;color:#f8fafc;font-size:14px;">${fmtCurrency(cell.avgCost)}</div>
            <div style="font-size:10px;color:${vc};font-weight:600;margin-top:2px;">${vl} (${fmtPercent(cell.volatility)})</div>
            <div style="font-size:9px;color:#64748b;margin-top:1px;">n=${fmtNumber(cell.sampleSize)}</div>
          </td>`;
        } else {
          tableHtml += `<td style="padding:10px 12px;border-bottom:1px solid #1e293b44;text-align:center;color:#475569;">--</td>`;
        }
      }
      tableHtml += `</tr>`;
    }
    tableHtml += `</tbody></table>`;
    tableWrap.innerHTML = tableHtml;
    matrixSection.appendChild(tableWrap);
    results.appendChild(matrixSection);

    // ── Histogram ──
    const histSection = document.createElement("div");
    histSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:18px 20px;margin-bottom:16px;";
    histSection.innerHTML = `<h2 style="margin:0 0 14px 0;font-size:15px;font-weight:700;color:#f8fafc;">Replacement Cost Distribution</h2>`;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:100%;height:300px;";
    histSection.appendChild(canvas);
    results.appendChild(histSection);

    requestAnimationFrame(() => {
      drawHistogram(canvas, data.distributionBuckets);
    });

    // ── Two-Column Layout: State Rankings + EV vs ICE ──
    const twoCol = document.createElement("div");
    twoCol.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;";

    // ── State Replacement Cost Rankings ──
    const stateSection = document.createElement("div");
    stateSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:18px 20px;";
    stateSection.innerHTML = `<h2 style="margin:0 0 14px 0;font-size:15px;font-weight:700;color:#f8fafc;">State Replacement Cost Rankings</h2>`;

    let stateTableHtml = `<div style="overflow-x:auto;max-height:480px;overflow-y:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr>
        <th style="padding:8px 10px;text-align:left;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;position:sticky;top:0;background:#1e293b;">#</th>
        <th style="padding:8px 10px;text-align:left;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;position:sticky;top:0;background:#1e293b;">State</th>
        <th style="padding:8px 10px;text-align:right;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;position:sticky;top:0;background:#1e293b;">Avg Price</th>
        <th style="padding:8px 10px;text-align:right;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;position:sticky;top:0;background:#1e293b;">Volume</th>
        <th style="padding:8px 10px;text-align:left;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;position:sticky;top:0;background:#1e293b;">Relative</th>
      </tr></thead><tbody>`;

    const maxStatePrice = Math.max(...data.stateRankings.map(s => s.avgPrice));
    for (let i = 0; i < data.stateRankings.length; i++) {
      const s = data.stateRankings[i];
      const barPct = (s.avgPrice / maxStatePrice) * 100;
      const barColor = i < 3 ? "#ef4444" : i < 7 ? "#f59e0b" : "#10b981";
      stateTableHtml += `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #1e293b44;color:#64748b;font-weight:600;">${i + 1}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #1e293b44;color:#f8fafc;font-weight:500;">${s.state}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #1e293b44;text-align:right;color:#f8fafc;font-weight:600;">${fmtCurrency(s.avgPrice)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #1e293b44;text-align:right;color:#94a3b8;">${fmtNumber(s.volume)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #1e293b44;width:100px;">
          <div style="background:#0f172a;border-radius:4px;height:8px;overflow:hidden;">
            <div style="width:${barPct}%;height:100%;background:${barColor};border-radius:4px;"></div>
          </div>
        </td>
      </tr>`;
    }
    stateTableHtml += `</tbody></table></div>`;
    stateSection.innerHTML += stateTableHtml;
    twoCol.appendChild(stateSection);

    // ── EV vs ICE Comparison Panel ──
    const evIceSection = document.createElement("div");
    evIceSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:18px 20px;";
    evIceSection.innerHTML = `<h2 style="margin:0 0 14px 0;font-size:15px;font-weight:700;color:#f8fafc;">EV vs ICE Risk Comparison</h2>`;

    let evIceHtml = `<div style="display:flex;flex-direction:column;gap:14px;">`;
    for (const metric of data.evIceComparison) {
      const isPercent = metric.label.includes("Volatility") || metric.label.includes("Depreciation") || metric.label.includes("Rate");
      const isCurrency = metric.label.includes("Cost") || metric.label.includes("Severity");

      let evDisplay: string, iceDisplay: string;
      if (isPercent) {
        evDisplay = fmtPercent(metric.evValue);
        iceDisplay = fmtPercent(metric.iceValue);
      } else if (isCurrency) {
        evDisplay = fmtCurrency(metric.evValue);
        iceDisplay = fmtCurrency(metric.iceValue);
      } else {
        evDisplay = String(metric.evValue);
        iceDisplay = String(metric.iceValue);
      }

      const evHigher = metric.evValue > metric.iceValue;
      const evColor = evHigher ? "#ef4444" : "#10b981";
      const iceColor = evHigher ? "#10b981" : "#ef4444";

      evIceHtml += `<div style="background:#0f172a;border-radius:8px;padding:12px 14px;">
        <div style="font-size:11px;color:#94a3b8;margin-bottom:8px;font-weight:500;">${metric.label}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="text-align:center;flex:1;">
            <div style="font-size:10px;color:#94a3b8;margin-bottom:2px;">EV</div>
            <div style="font-size:16px;font-weight:700;color:${evColor};">${evDisplay}</div>
          </div>
          <div style="width:1px;height:30px;background:#334155;"></div>
          <div style="text-align:center;flex:1;">
            <div style="font-size:10px;color:#94a3b8;margin-bottom:2px;">ICE</div>
            <div style="font-size:16px;font-weight:700;color:${iceColor};">${iceDisplay}</div>
          </div>
        </div>
      </div>`;
    }
    evIceHtml += `</div>`;
    evIceSection.innerHTML += evIceHtml;
    twoCol.appendChild(evIceSection);
    results.appendChild(twoCol);

    // ── Model-level Risk Table ──
    const modelSection = document.createElement("div");
    modelSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:18px 20px;margin-bottom:16px;";
    modelSection.innerHTML = `<h2 style="margin:0 0 4px 0;font-size:15px;font-weight:700;color:#f8fafc;">High-Volatility Models</h2>
      <p style="margin:0 0 14px 0;font-size:12px;color:#94a3b8;">Models with the highest price volatility -- increased underwriting risk</p>`;

    const modelTableWrap = document.createElement("div");
    modelTableWrap.style.cssText = "overflow-x:auto;";

    let modelHtml = `<table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr>
        <th style="padding:10px 12px;text-align:left;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;">Make</th>
        <th style="padding:10px 12px;text-align:left;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;">Model</th>
        <th style="padding:10px 12px;text-align:left;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;">Segment</th>
        <th style="padding:10px 12px;text-align:right;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;">Avg Price</th>
        <th style="padding:10px 12px;text-align:center;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;">Volatility</th>
        <th style="padding:10px 12px;text-align:center;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;">Risk</th>
        <th style="padding:10px 12px;text-align:right;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;">Sample</th>
      </tr></thead><tbody>`;

    const sortedModels = [...data.highVolatilityModels].sort((a, b) => b.volatility - a.volatility);
    for (const m of sortedModels) {
      const vc = volatilityColor(m.volatility);
      const vl = volatilityLabel(m.volatility);
      modelHtml += `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #1e293b44;color:#f8fafc;font-weight:600;">${m.make}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e293b44;color:#e2e8f0;">${m.model}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e293b44;color:#94a3b8;">${m.bodyType}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e293b44;text-align:right;color:#f8fafc;font-weight:600;">${fmtCurrency(m.avgPrice)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e293b44;text-align:center;">
          <div style="display:flex;align-items:center;justify-content:center;gap:6px;">
            <div style="width:50px;height:6px;background:#0f172a;border-radius:3px;overflow:hidden;">
              <div style="width:${Math.min(m.volatility * 300, 100)}%;height:100%;background:${vc};border-radius:3px;"></div>
            </div>
            <span style="color:${vc};font-weight:600;">${fmtPercent(m.volatility)}</span>
          </div>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e293b44;text-align:center;">
          <span style="padding:3px 10px;border-radius:10px;font-size:10px;font-weight:700;background:${vc}22;color:${vc};border:1px solid ${vc}33;">${vl}</span>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e293b44;text-align:right;color:#94a3b8;">${fmtNumber(m.sampleSize)}</td>
      </tr>`;
    }
    modelHtml += `</tbody></table>`;
    modelTableWrap.innerHTML = modelHtml;
    modelSection.appendChild(modelTableWrap);
    results.appendChild(modelSection);

    // ── Risk Summary Footer ──
    const summaryFooter = document.createElement("div");
    summaryFooter.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px 20px;margin-bottom:16px;";
    const avgEvCost = data.evIceComparison.find(m => m.label === "Avg Replacement Cost");
    const evPremium = avgEvCost ? ((avgEvCost.evValue / avgEvCost.iceValue - 1) * 100).toFixed(0) : "45";
    summaryFooter.innerHTML = `<h2 style="margin:0 0 10px 0;font-size:15px;font-weight:700;color:#f8fafc;">Underwriting Risk Summary</h2>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        <div style="background:#0f172a;border-radius:8px;padding:14px;border-left:3px solid #ef4444;">
          <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Key Risk</div>
          <div style="font-size:13px;color:#f8fafc;font-weight:500;">EV replacement costs are ${evPremium}% higher than ICE equivalents. Highest-risk segment: ${data.highestRiskSegment}.</div>
        </div>
        <div style="background:#0f172a;border-radius:8px;padding:14px;border-left:3px solid #f59e0b;">
          <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Regional Variance</div>
          <div style="font-size:13px;color:#f8fafc;font-weight:500;">Top state (${data.stateRankings[0]?.state}) averages ${fmtCurrency(data.stateRankings[0]?.avgPrice ?? 0)} vs bottom state (${data.stateRankings[data.stateRankings.length - 1]?.state}) at ${fmtCurrency(data.stateRankings[data.stateRankings.length - 1]?.avgPrice ?? 0)}.</div>
        </div>
        <div style="background:#0f172a;border-radius:8px;padding:14px;border-left:3px solid #10b981;">
          <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Recommendation</div>
          <div style="font-size:13px;color:#f8fafc;font-weight:500;">Adjust premiums +${evPremium}% for EV policies. Factor state-level pricing into regional rate tables. Review high-volatility models quarterly.</div>
        </div>
      </div>`;
    results.appendChild(summaryFooter);

    // ── Premium Impact Estimator ──
    const premiumSection = document.createElement("div");
    premiumSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:18px 20px;margin-bottom:16px;";
    premiumSection.innerHTML = `<h2 style="margin:0 0 4px 0;font-size:15px;font-weight:700;color:#f8fafc;display:flex;align-items:center;gap:8px;">Premium Impact Estimator
      <span style="font-size:9px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:2px 8px;border-radius:10px;background:#7c2d1244;color:#fbbf24;border:1px solid #f59e0b66;">Reference</span></h2>
      <p style="margin:0 0 14px 0;font-size:12px;color:#94a3b8;">Estimated premium adjustments based on segment risk factors. Tier multipliers should be calibrated with your organization's claims experience.</p>`;

    const premiumTiers = [
      { tier: "Tier 1 - Low Risk", segments: "Sedan (Gasoline), Wagon (Gasoline), Van (Gasoline)", baseMultiplier: 1.0, color: "#10b981", description: "Standard premium. Low replacement cost, low volatility. Stable claims history." },
      { tier: "Tier 2 - Moderate Risk", segments: "SUV (Gasoline), Sedan (Hybrid), SUV (Diesel)", baseMultiplier: 1.12, color: "#f59e0b", description: "+12% premium adjustment. Moderate replacement costs with acceptable volatility range." },
      { tier: "Tier 3 - Elevated Risk", segments: "Truck (Gasoline), SUV (Hybrid), Coupe (Gasoline)", baseMultiplier: 1.25, color: "#f97316", description: "+25% premium adjustment. Higher replacement costs or above-average price volatility." },
      { tier: "Tier 4 - High Risk", segments: "All EV segments, Truck (Diesel), Luxury models", baseMultiplier: 1.45, color: "#ef4444", description: "+45% premium adjustment. High replacement costs, elevated volatility, expensive parts." },
    ];

    let premiumHtml = `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">`;
    for (const pt of premiumTiers) {
      premiumHtml += `<div style="background:#0f172a;border-radius:8px;padding:14px;border-top:3px solid ${pt.color};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <div style="font-weight:700;color:#f8fafc;font-size:13px;">${pt.tier}</div>
          <span style="padding:3px 10px;border-radius:10px;font-size:11px;font-weight:700;background:${pt.color}22;color:${pt.color};">${pt.baseMultiplier.toFixed(2)}x</span>
        </div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:6px;">${pt.segments}</div>
        <div style="font-size:11px;color:#64748b;line-height:1.4;">${pt.description}</div>
      </div>`;
    }
    premiumHtml += `</div>`;
    premiumSection.innerHTML += premiumHtml;
    results.appendChild(premiumSection);

    // ── Claims Frequency Heatmap ──
    const heatmapSection = document.createElement("div");
    heatmapSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:18px 20px;margin-bottom:16px;";
    heatmapSection.innerHTML = `<h2 style="margin:0 0 4px 0;font-size:15px;font-weight:700;color:#f8fafc;display:flex;align-items:center;gap:8px;">Segment Claims Risk Heatmap
      <span style="font-size:9px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:2px 8px;border-radius:10px;background:#7c2d1244;color:#fbbf24;border:1px solid #f59e0b66;">Illustrative</span></h2>
      <p style="margin:0 0 14px 0;font-size:12px;color:#94a3b8;">Estimated claims frequency and severity by body type and age bracket</p>`;

    const ageBrackets = ["0-2 yr", "3-5 yr", "6-8 yr", "9+ yr"];
    const bodyTypesForHeat = ["SUV", "Sedan", "Truck", "Coupe", "Van"];
    const heatData: Record<string, number[]> = {
      "SUV": [0.12, 0.18, 0.24, 0.31],
      "Sedan": [0.09, 0.14, 0.19, 0.25],
      "Truck": [0.14, 0.21, 0.28, 0.35],
      "Coupe": [0.16, 0.22, 0.27, 0.33],
      "Van": [0.10, 0.15, 0.20, 0.26],
    };

    let heatHtml = `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr><th style="padding:10px 12px;text-align:left;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;">Body Type</th>`;
    for (const ab of ageBrackets) {
      heatHtml += `<th style="padding:10px 12px;text-align:center;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;">${ab}</th>`;
    }
    heatHtml += `</tr></thead><tbody>`;

    for (const bt of bodyTypesForHeat) {
      heatHtml += `<tr><td style="padding:10px 12px;border-bottom:1px solid #1e293b44;font-weight:600;color:#f8fafc;">${bt}</td>`;
      const vals = heatData[bt] ?? [0, 0, 0, 0];
      for (const v of vals) {
        const hc = v < 0.15 ? "#10b981" : v < 0.22 ? "#f59e0b" : v < 0.28 ? "#f97316" : "#ef4444";
        const intensity = Math.min(Math.round(v * 200), 60);
        heatHtml += `<td style="padding:10px 12px;border-bottom:1px solid #1e293b44;text-align:center;background:${hc}${intensity < 16 ? '0' + intensity.toString(16) : intensity.toString(16)};">
          <div style="font-weight:700;color:#f8fafc;font-size:14px;">${(v * 100).toFixed(1)}%</div>
        </td>`;
      }
      heatHtml += `</tr>`;
    }
    heatHtml += `</tbody></table></div>`;

    heatHtml += `<div style="display:flex;gap:12px;margin-top:12px;justify-content:center;">
      <span style="font-size:10px;color:#94a3b8;display:flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;border-radius:2px;background:#10b981;"></span>Low Risk (&lt;15%)</span>
      <span style="font-size:10px;color:#94a3b8;display:flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;border-radius:2px;background:#f59e0b;"></span>Moderate (15-22%)</span>
      <span style="font-size:10px;color:#94a3b8;display:flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;border-radius:2px;background:#f97316;"></span>High (22-28%)</span>
      <span style="font-size:10px;color:#94a3b8;display:flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;border-radius:2px;background:#ef4444;"></span>Very High (&gt;28%)</span>
    </div>`;
    heatmapSection.innerHTML += heatHtml;
    results.appendChild(heatmapSection);

    // ── Portfolio Composition Summary ──
    const compositionSection = document.createElement("div");
    compositionSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:18px 20px;margin-bottom:16px;";
    compositionSection.innerHTML = `<h2 style="margin:0 0 14px 0;font-size:15px;font-weight:700;color:#f8fafc;">Portfolio Composition Analysis</h2>`;

    // Calculate composition from segment matrix
    const totalSample = data.segmentMatrix.reduce((sum, s) => sum + s.sampleSize, 0);
    const bodyTypeGroups: Record<string, { count: number; avgCost: number; avgVol: number }> = {};
    for (const seg of data.segmentMatrix) {
      if (!bodyTypeGroups[seg.bodyType]) {
        bodyTypeGroups[seg.bodyType] = { count: 0, avgCost: 0, avgVol: 0 };
      }
      bodyTypeGroups[seg.bodyType].count += seg.sampleSize;
      bodyTypeGroups[seg.bodyType].avgCost += seg.avgCost * seg.sampleSize;
      bodyTypeGroups[seg.bodyType].avgVol += seg.volatility * seg.sampleSize;
    }

    let compositionHtml = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;">`;
    const bodyTypeColors: Record<string, string> = {
      "SUV": "#3b82f6", "Sedan": "#10b981", "Truck": "#f59e0b", "Coupe": "#8b5cf6",
      "Van": "#06b6d4", "Convertible": "#ec4899", "Wagon": "#84cc16",
    };

    for (const [bt, group] of Object.entries(bodyTypeGroups)) {
      const pct = ((group.count / totalSample) * 100).toFixed(1);
      const avgCost = Math.round(group.avgCost / group.count);
      const avgVol = group.avgVol / group.count;
      const color = bodyTypeColors[bt] ?? "#94a3b8";

      compositionHtml += `<div style="background:#0f172a;border-radius:8px;padding:14px;border-left:3px solid ${color};">
        <div style="font-weight:700;color:#f8fafc;font-size:14px;margin-bottom:6px;">${bt}</div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:11px;color:#94a3b8;">Share</span>
          <span style="font-size:11px;font-weight:600;color:${color};">${pct}%</span>
        </div>
        <div style="background:#1e293b;border-radius:4px;height:6px;overflow:hidden;margin-bottom:8px;">
          <div style="width:${pct}%;height:100%;background:${color};border-radius:4px;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
          <span style="font-size:10px;color:#64748b;">Avg Cost</span>
          <span style="font-size:10px;color:#e2e8f0;font-weight:600;">${fmtCurrency(avgCost)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
          <span style="font-size:10px;color:#64748b;">Volatility</span>
          <span style="font-size:10px;color:${volatilityColor(avgVol)};font-weight:600;">${fmtPercent(avgVol)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="font-size:10px;color:#64748b;">Count</span>
          <span style="font-size:10px;color:#e2e8f0;">${fmtNumber(group.count)}</span>
        </div>
      </div>`;
    }
    compositionHtml += `</div>`;
    compositionSection.innerHTML += compositionHtml;
    results.appendChild(compositionSection);

    // ── Methodology Note ──
    const methodNote = document.createElement("div");
    methodNote.style.cssText = "background:#0f172a;border:1px solid #334155;border-radius:10px;padding:14px 18px;margin-bottom:16px;";
    methodNote.innerHTML = `<div style="font-size:11px;color:#64748b;line-height:1.5;">
      <strong style="color:#94a3b8;">Methodology:</strong> Replacement costs are derived from MarketCheck's database of active and recently sold vehicle listings across the United States.
      Price volatility is calculated as the coefficient of variation (standard deviation / mean) for each segment. Risk tiers are assigned based on a combination of
      replacement cost magnitude and price volatility. Regional adjustments reflect state-level average transaction prices. Data is updated daily from dealer inventories
      and auction results. Sample sizes represent the number of unique vehicle listings analyzed in each segment.
      Claims frequency estimates are modeled from industry-standard loss ratios adjusted for vehicle age and segment.
      The premium impact estimator provides directional guidance and should be calibrated with your organization's actual claims experience data.
    </div>`;
    results.appendChild(methodNote);
  }

  // ── Auto-run on load ──
  runAnalysis();
}

main().catch(console.error);
