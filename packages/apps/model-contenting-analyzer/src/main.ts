/**
 * Model Contenting Analyzer
 * Analyzes trim/body-type demand for a specific model — compares active inventory
 * distribution against sold patterns to identify over- and under-supplied configs.
 */
import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "model-contenting-analyzer" }); } catch {}

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
  for (const key of ["make", "model", "year", "state"]) {
    const v = params.get(key);
    if (v) result[key] = v;
  }
  return result;
}

function _proxyBase(): string {
  return location.protocol.startsWith("http") ? "" : "http://localhost:3001";
}

const _MC = "https://api.marketcheck.com";
async function _mcApi(path: string, params: Record<string, any> = {}): Promise<any> {
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
const _mcDecode = (vin: string) => _mcApi("/decode/car/neovin/" + vin + "/specs");
const _mcActive = (p: any) => _mcApi("/search/car/active", p);
const _mcRecent = (p: any) => _mcApi("/search/car/recents", p);
const _mcSold = (p: any) => _mcApi("/api/v1/sold-vehicles/summary", p);

async function _fetchDirect(args: any): Promise<any> {
  const baseQ: any = { make: args.make, model: args.model, rows: 50 };
  if (args.year) baseQ.year = args.year;
  if (args.state) baseQ.state = args.state;

  // Step 1: Active inventory facets + Sold body_type performance (parallel)
  const [activeFacets, soldByBody] = await Promise.all([
    _mcActive({ ...baseQ, stats: "price,miles,dom", facets: "trim,body_type,fuel_type" }),
    _mcSold({
      ranking_dimensions: "body_type",
      ranking_measure: "sold_count",
      ranking_order: "desc",
      top_n: 10,
      make: args.make,
      model: args.model,
      ...(args.state ? { state: args.state } : {}),
      inventory_type: "Used",
    }).catch(() => null),
  ]);

  // Step 2: Recent sold + DOM extremes (parallel)
  const [recentSold, slowMovers, fastMovers] = await Promise.all([
    _mcRecent({ ...baseQ, stats: "price", rows: 50 }),
    _mcActive({ ...baseQ, sort_by: "dom", sort_order: "desc", rows: 10 }),
    _mcActive({ ...baseQ, sort_by: "dom", sort_order: "asc", rows: 10 }),
  ]);

  // Step 3: Decode sample VINs from fast vs slow movers (parallel)
  const slowVin = slowMovers?.listings?.[0]?.vin;
  const fastVin = fastMovers?.listings?.[0]?.vin;
  const [slowSpec, fastSpec] = await Promise.all([
    slowVin ? _mcDecode(slowVin).catch(() => null) : Promise.resolve(null),
    fastVin ? _mcDecode(fastVin).catch(() => null) : Promise.resolve(null),
  ]);

  return { activeFacets, soldByBody, recentSold, slowMovers, fastMovers, slowSpec, fastSpec };
}

async function _callTool(toolName: string, args: any): Promise<any> {
  if (_safeApp) {
    try { const r = await _safeApp.callServerTool({ name: toolName, arguments: args }); return r; } catch {}
  }
  const auth = _getAuth();
  if (auth.value) {
    try {
      const data = await _fetchDirect(args);
      if (data) return { content: [{ type: "text", text: JSON.stringify(data) }] };
    } catch (e) { console.warn("Direct API failed:", e); }
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
      [style*="grid-template-columns: repeat"] { grid-template-columns: 1fr !important; }
      [style*="grid-template-columns:repeat"] { grid-template-columns: 1fr !important; }
      [style*="grid-template-columns:1fr 1fr"] { grid-template-columns: 1fr !important; }
      [style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
      div[style*="overflow-x:auto"], div[style*="overflow-x: auto"] { -webkit-overflow-scrolling: touch; }
      table { min-width: 600px; }
    }
    @media (max-width: 480px) {
      body { padding: 8px !important; }
      h1 { font-size: 16px !important; }
      th, td { padding: 4px 6px !important; font-size: 11px !important; }
    }
  `;
  document.head.appendChild(s);
})();

(_safeApp as any)?.connect?.();

// ── Types ──────────────────────────────────────────────────────────────
interface TrimRow {
  trim: string;
  activeCount: number;
  activeShare: number;     // % of active inventory
  demandShare: number;     // % of recent sold (proxy from recents)
  imbalanceBps: number;    // active% - demand% in basis points (positive = oversupplied)
  avgPrice: number;
  avgDom: number;
  status: "OVERSUPPLIED" | "BALANCED" | "UNDERSUPPLIED";
}
interface BodyTypeRow {
  body: string;
  activeCount: number;
  soldCount: number;
  activeShare: number;
  demandShare: number;
}
interface FeatureRow {
  feature: string;
  fast: string;
  slow: string;
  same: boolean;
}
interface AnalysisResult {
  make: string;
  model: string;
  year?: string;
  state?: string;
  totalActive: number;
  totalSold: number;
  trimCount: number;
  contentingScore: number; // 0-100, higher = better aligned
  imbalancedTrims: number;
  trims: TrimRow[];
  bodyTypes: BodyTypeRow[];
  fastMoverTrim: { trim: string; dom: number; price: number };
  slowMoverTrim: { trim: string; dom: number; price: number };
  featureComparison: FeatureRow[];
  insights: string[];
}

// ── Mock Data ──────────────────────────────────────────────────────────
function getMockData(make: string, model: string, year?: string, state?: string): AnalysisResult {
  const trims: TrimRow[] = [
    { trim: "LX",        activeCount:  82, activeShare: 18.4, demandShare: 24.6, imbalanceBps: -620, avgPrice: 26800, avgDom: 18, status: "UNDERSUPPLIED" },
    { trim: "EX",        activeCount: 124, activeShare: 27.8, demandShare: 29.1, imbalanceBps: -130, avgPrice: 29400, avgDom: 22, status: "BALANCED" },
    { trim: "EX-L",      activeCount:  98, activeShare: 22.0, demandShare: 21.5, imbalanceBps:   50, avgPrice: 32100, avgDom: 27, status: "BALANCED" },
    { trim: "Sport",     activeCount:  64, activeShare: 14.3, demandShare: 11.2, imbalanceBps:  310, avgPrice: 31200, avgDom: 38, status: "OVERSUPPLIED" },
    { trim: "Touring",   activeCount:  52, activeShare: 11.7, demandShare:  9.8, imbalanceBps:  190, avgPrice: 36900, avgDom: 44, status: "OVERSUPPLIED" },
    { trim: "Hybrid Sport", activeCount: 18, activeShare: 4.0, demandShare: 2.6, imbalanceBps: 140, avgPrice: 34800, avgDom: 41, status: "OVERSUPPLIED" },
    { trim: "Hybrid Touring", activeCount:  8, activeShare: 1.8, demandShare: 1.2, imbalanceBps: 60, avgPrice: 39400, avgDom: 35, status: "BALANCED" },
  ];
  const bodyTypes: BodyTypeRow[] = [
    { body: "SUV",        activeCount: 412, soldCount: 1840, activeShare: 92.4, demandShare: 94.2 },
    { body: "Crossover",  activeCount:  28, soldCount:   95, activeShare:  6.3, demandShare:  4.9 },
    { body: "Other",      activeCount:   6, soldCount:   18, activeShare:  1.3, demandShare:  0.9 },
  ];
  const featureComparison: FeatureRow[] = [
    { feature: "Drivetrain",       fast: "AWD",                 slow: "FWD",                same: false },
    { feature: "Engine",           fast: "1.5L Turbo",          slow: "1.5L Turbo",         same: true  },
    { feature: "Transmission",     fast: "CVT Automatic",       slow: "CVT Automatic",      same: true  },
    { feature: "Sunroof / Moonroof", fast: "Yes",               slow: "No",                 same: false },
    { feature: "Heated Seats",     fast: "Yes",                 slow: "No",                 same: false },
    { feature: "Leather Interior", fast: "Yes",                 slow: "Cloth",              same: false },
    { feature: "Wheel Size",       fast: "19-inch alloy",       slow: "17-inch steel",      same: false },
    { feature: "Color",            fast: "Crystal Black Pearl", slow: "Sonic Gray",         same: false },
  ];
  const imbalanced = trims.filter(t => t.status !== "BALANCED").length;
  const totalImb = trims.reduce((s, t) => s + Math.abs(t.imbalanceBps), 0);
  const contentingScore = Math.max(0, Math.min(100, Math.round(100 - totalImb / 60)));
  return {
    make, model, year, state,
    totalActive: 446, totalSold: 1953, trimCount: trims.length,
    contentingScore, imbalancedTrims: imbalanced,
    trims, bodyTypes,
    fastMoverTrim: { trim: "EX-L AWD", dom: 8, price: 32400 },
    slowMoverTrim: { trim: "Touring FWD", dom: 71, price: 37200 },
    featureComparison,
    insights: [
      `LX trim is undersupplied — 24.6% of demand but only 18.4% of inventory. Consider increasing production allocation.`,
      `Touring and Sport trims are oversupplied — combined 26% of active inventory but only 21% of demand. Average DOM > 38 days.`,
      `Fast-movers consistently have AWD, sunroof, and leather. Slow-movers lack these. Content the volume trims accordingly.`,
      `Hybrid trims are still niche (~6% combined) — keep allocation conservative until demand catches up.`,
    ],
  };
}

// ── API → Result transformation ────────────────────────────────────────
function _normFacet(rawList: any[]): { name: string; count: number }[] {
  if (!Array.isArray(rawList)) return [];
  return rawList.map(x => ({
    name: String(x.item ?? x.term ?? x.value ?? x.key ?? x.name ?? "").trim(),
    count: Number(x.count ?? x.doc_count ?? 0),
  })).filter(x => x.name && x.name.toLowerCase() !== "unknown" && x.count > 0);
}

function _trimKey(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

function _classifyImbalance(bps: number): "OVERSUPPLIED" | "BALANCED" | "UNDERSUPPLIED" {
  if (bps > 200) return "OVERSUPPLIED";
  if (bps < -200) return "UNDERSUPPLIED";
  return "BALANCED";
}

function transformApiResult(api: any, make: string, model: string, year?: string, state?: string): AnalysisResult {
  const facets = api?.activeFacets?.facets ?? api?.activeFacets?.aggregations ?? {};
  const trimFacet = _normFacet(facets.trim ?? facets.trims ?? []);
  const bodyFacet = _normFacet(facets.body_type ?? facets.bodyType ?? []);

  const totalActive = Number(api?.activeFacets?.num_found ?? trimFacet.reduce((s, t) => s + t.count, 0));

  // Recent sold facets aren't always available — derive demand from recents listings (keyed lowercase)
  const recentList: any[] = api?.recentSold?.listings ?? [];
  const recentTrimCounts: Record<string, number> = {};
  for (const l of recentList) {
    const k = _trimKey(l?.build?.trim ?? l?.trim);
    if (!k) continue;
    recentTrimCounts[k] = (recentTrimCounts[k] ?? 0) + 1;
  }
  const totalSold = recentList.length || 1;

  // DOM by trim — only from the unsorted active sample (slow/fast lists are outliers by design).
  // Price by trim — pool all sample sources (price isn't outlier-skewed the way DOM is, and
  // many active-facet listings are new-car with no listed price; the slow/fast pulls add coverage).
  const _readPrice = (l: any) => Number(l?.price ?? l?.list_price ?? l?.msrp ?? l?.build?.msrp ?? 0);
  const _readDom = (l: any) => Number(l?.dom ?? l?.days_on_market ?? 0);

  const trimStats: Record<string, { doms: number[]; prices: number[] }> = {};
  for (const l of (api?.activeFacets?.listings ?? [])) {
    const k = _trimKey(l?.build?.trim ?? l?.trim);
    if (!k) continue;
    if (!trimStats[k]) trimStats[k] = { doms: [], prices: [] };
    const dom = _readDom(l);
    if (dom > 0 && dom < 730) trimStats[k].doms.push(dom);
    const price = _readPrice(l);
    if (price > 1000) trimStats[k].prices.push(price);
  }
  for (const l of [...(api?.slowMovers?.listings ?? []), ...(api?.fastMovers?.listings ?? [])]) {
    const k = _trimKey(l?.build?.trim ?? l?.trim);
    if (!k) continue;
    if (!trimStats[k]) trimStats[k] = { doms: [], prices: [] };
    const price = _readPrice(l);
    if (price > 1000) trimStats[k].prices.push(price);
  }
  const median = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? Math.round((s[m - 1] + s[m]) / 2) : s[m];
  };

  const trims: TrimRow[] = trimFacet.slice(0, 12).map(tf => {
    const k = _trimKey(tf.name);
    const activeShare = totalActive ? (tf.count / totalActive) * 100 : 0;
    const demandShare = totalSold ? ((recentTrimCounts[k] ?? 0) / totalSold) * 100 : 0;
    const imbalanceBps = Math.round((activeShare - demandShare) * 100);
    const stats = trimStats[k];
    const avgDom = stats ? median(stats.doms) : 0;
    const avgPrice = stats ? median(stats.prices) : 0;
    return {
      trim: tf.name, activeCount: tf.count, activeShare, demandShare, imbalanceBps,
      avgPrice, avgDom, status: _classifyImbalance(imbalanceBps),
    };
  });

  // Body types: combine active facet + sold-summary rankings (Enterprise)
  const soldRankings: any[] = api?.soldByBody?.rankings ?? api?.soldByBody?.results ?? [];
  const totalSoldBody = soldRankings.reduce((s, r) => s + Number(r.sold_count ?? r.count ?? 0), 0) || 1;
  const totalActiveBody = bodyFacet.reduce((s, b) => s + b.count, 0) || 1;
  const bodyTypes: BodyTypeRow[] = bodyFacet.slice(0, 6).map(bf => {
    const bk = _trimKey(bf.name);
    const sr = soldRankings.find(r => _trimKey(r.body_type ?? r.dimension ?? r.value ?? r.item) === bk);
    const soldCount = Number(sr?.sold_count ?? sr?.count ?? 0);
    return {
      body: bf.name,
      activeCount: bf.count,
      soldCount,
      activeShare: (bf.count / totalActiveBody) * 100,
      demandShare: (soldCount / totalSoldBody) * 100,
    };
  });

  // Fast / slow mover trims from listing samples
  const slow0 = api?.slowMovers?.listings?.[0];
  const fast0 = api?.fastMovers?.listings?.[0];
  const slowMoverTrim = {
    trim: String(api?.slowSpec?.trim ?? slow0?.build?.trim ?? "—"),
    dom: Number(slow0?.dom ?? slow0?.days_on_market ?? 0),
    price: Number(slow0?.price ?? 0),
  };
  const fastMoverTrim = {
    trim: String(api?.fastSpec?.trim ?? fast0?.build?.trim ?? "—"),
    dom: Number(fast0?.dom ?? fast0?.days_on_market ?? 0),
    price: Number(fast0?.price ?? 0),
  };

  // Feature comparison from decoded specs
  const fs = api?.fastSpec ?? {};
  const ss = api?.slowSpec ?? {};
  const fcRows: [string, any, any][] = [
    ["Drivetrain",    fs.drivetrain,    ss.drivetrain],
    ["Engine",        fs.engine,        ss.engine],
    ["Transmission",  fs.transmission,  ss.transmission],
    ["Body Type",     fs.body_type,     ss.body_type],
    ["Fuel Type",     fs.fuel_type,     ss.fuel_type],
    ["Cylinders",     fs.engine_size ?? fs.cylinders, ss.engine_size ?? ss.cylinders],
    ["Doors",         fs.doors,         ss.doors],
    ["MSRP",          fs.msrp,          ss.msrp],
  ];
  const featureComparison: FeatureRow[] = fcRows
    .filter(([, a, b]) => a != null || b != null)
    .map(([feat, a, b]) => ({
      feature: feat,
      fast: a != null ? String(a) : "—",
      slow: b != null ? String(b) : "—",
      same: String(a ?? "") === String(b ?? "") && a != null,
    }));

  const totalImb = trims.reduce((s, t) => s + Math.abs(t.imbalanceBps), 0);
  const contentingScore = trims.length === 0 ? 0 : Math.max(0, Math.min(100, Math.round(100 - totalImb / 60)));
  const imbalancedTrims = trims.filter(t => t.status !== "BALANCED").length;

  const insights: string[] = [];
  const under = trims.filter(t => t.status === "UNDERSUPPLIED").sort((a, b) => a.imbalanceBps - b.imbalanceBps)[0];
  const over = trims.filter(t => t.status === "OVERSUPPLIED").sort((a, b) => b.imbalanceBps - a.imbalanceBps)[0];
  if (under) insights.push(`${under.trim} is undersupplied — ${under.demandShare.toFixed(1)}% of demand but only ${under.activeShare.toFixed(1)}% of inventory. Consider increasing allocation.`);
  if (over) insights.push(`${over.trim} is oversupplied — ${over.activeShare.toFixed(1)}% of inventory vs ${over.demandShare.toFixed(1)}% of demand. Average DOM ${over.avgDom || "—"} days.`);
  if (fastMoverTrim.dom && slowMoverTrim.dom && slowMoverTrim.dom > fastMoverTrim.dom * 2) {
    insights.push(`Fast-mover (${fastMoverTrim.trim}) sells in ${fastMoverTrim.dom} days vs ${slowMoverTrim.dom} days for slow-mover (${slowMoverTrim.trim}) — content choices matter.`);
  }

  return {
    make, model, year, state,
    totalActive, totalSold: recentList.length, trimCount: trims.length,
    contentingScore, imbalancedTrims,
    trims, bodyTypes, fastMoverTrim, slowMoverTrim, featureComparison,
    insights,
  };
}

// ── Render Helpers ─────────────────────────────────────────────────────
const fmt$ = (n: number) => n > 0 ? "$" + Math.round(n).toLocaleString() : "—";
const fmtPct = (n: number) => n.toFixed(1) + "%";
const fmtBps = (n: number) => (n > 0 ? "+" : "") + n.toLocaleString() + " bps";

const STATUS_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  OVERSUPPLIED:  { bg: "#dc262622", fg: "#fca5a5", border: "#dc262644" },
  BALANCED:      { bg: "#0ea5e922", fg: "#7dd3fc", border: "#0ea5e944" },
  UNDERSUPPLIED: { bg: "#10b98122", fg: "#6ee7b7", border: "#10b98144" },
};
const PIE_PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#a855f7"];

function drawPieChart(canvas: HTMLCanvasElement, data: { label: string; value: number }[]) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(rect.width, canvas.clientWidth, 280);
  const h = Math.max(rect.height, canvas.clientHeight, 200);
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const isNarrow = w < 480;
  const legendFont = isNarrow ? "13px" : "12px";

  ctx.font = `${legendFont} -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textBaseline = "middle";

  // Estimate widest legend entry to decide layout
  const maxLabelW = Math.max(...data.map(d => {
    const pct = ((d.value / total) * 100).toFixed(1);
    return ctx.measureText(`${d.label} — ${pct}%`).width;
  }));
  const legendItemW = 18 + maxLabelW + 12;
  const sideLegendX0 = h + 16;
  const fitsBeside = w - sideLegendX0 >= legendItemW;

  let r: number, cx: number, cy: number;
  if (fitsBeside) {
    r = h / 2 - 12;
    cx = h / 2 + 8;
    cy = h / 2;
  } else {
    // Stacked: pie on top, legend below
    const cols = Math.max(1, Math.floor(w / legendItemW));
    const rows = Math.ceil(data.length / cols);
    const legendH = rows * 20 + 8;
    r = Math.max(40, Math.min((h - legendH) / 2 - 8, w / 2 - 12));
    cx = w / 2;
    cy = r + 8;
  }

  let start = -Math.PI / 2;
  data.forEach((d, i) => {
    const angle = (d.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = PIE_PALETTE[i % PIE_PALETTE.length];
    ctx.fill();
    start += angle;
  });

  // Legend
  if (fitsBeside) {
    const legendX = sideLegendX0;
    data.forEach((d, i) => {
      const y = 16 + i * 22;
      if (y > h - 6) return;
      ctx.fillStyle = PIE_PALETTE[i % PIE_PALETTE.length];
      ctx.fillRect(legendX, y - 6, 12, 12);
      ctx.fillStyle = "#e2e8f0";
      const pct = ((d.value / total) * 100).toFixed(1);
      ctx.fillText(`${d.label} — ${pct}%`, legendX + 18, y);
    });
  } else {
    const cols = Math.max(1, Math.floor(w / legendItemW));
    const colW = w / cols;
    const startY = cy + r + 14;
    data.forEach((d, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 4 + col * colW;
      const y = startY + row * 20;
      if (y > h - 4) return;
      ctx.fillStyle = PIE_PALETTE[i % PIE_PALETTE.length];
      ctx.fillRect(x, y - 6, 12, 12);
      ctx.fillStyle = "#e2e8f0";
      const pct = ((d.value / total) * 100).toFixed(1);
      ctx.fillText(`${d.label} — ${pct}%`, x + 18, y);
    });
  }
}

function drawBarChart(canvas: HTMLCanvasElement, data: { label: string; value: number; color?: string }[], unit: string) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(rect.width, canvas.clientWidth, 280);
  const h = Math.max(rect.height, canvas.clientHeight, 200);
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const isNarrow = w < 480;
  const fontPx = isNarrow ? "13px" : "12px";
  ctx.font = `${fontPx} -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textBaseline = "middle";
  const padL = Math.min(110, Math.max(70, w * 0.32));
  const padT = 8, padB = 16;
  // Reserve space on the right for the longest value label
  const valueWidths = data.map(d => ctx.measureText(`${Math.round(d.value).toLocaleString()} ${unit}`).width);
  const valueW = Math.max(...valueWidths, 0) + 8;
  const padR = valueW + 4;
  const max = Math.max(...data.map(d => d.value), 1);
  const innerW = Math.max(20, w - padL - padR);
  const rowH = (h - padT - padB) / Math.max(1, data.length);
  data.forEach((d, i) => {
    const y = padT + i * rowH + rowH / 2;
    ctx.fillStyle = "#cbd5e1";
    ctx.textAlign = "right";
    const lbl = d.label.length > 14 ? d.label.slice(0, 13) + "…" : d.label;
    ctx.fillText(lbl, padL - 8, y);
    const barW = (d.value / max) * innerW;
    ctx.fillStyle = d.color ?? "#3b82f6";
    const barH = Math.max(8, rowH - 8);
    ctx.fillRect(padL, y - barH / 2, barW, barH);
    ctx.fillStyle = "#f1f5f9";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(d.value).toLocaleString()} ${unit}`, w - 4, y);
  });
}

function drawScatter(canvas: HTMLCanvasElement, points: { x: number; y: number; label: string }[], xLabel: string, yLabel: string) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(rect.width, canvas.clientWidth, 280);
  const h = Math.max(rect.height, canvas.clientHeight, 200);
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const isNarrow = w < 480;
  const fontSm = isNarrow ? "12px" : "11px";
  const fontMd = isNarrow ? "13px" : "12px";
  const fontLg = isNarrow ? "13px" : "12px";

  if (points.length === 0) {
    ctx.fillStyle = "#64748b"; ctx.font = `13px sans-serif`; ctx.textAlign = "center";
    ctx.fillText("No data available", w / 2, h / 2); return;
  }
  const padL = 60, padR = 16, padT = 16, padB = 40;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  // Tighter axis padding so few-point scatters don't have huge empty space
  const xRange = Math.max(...xs) - Math.min(...xs);
  const yRange = Math.max(...ys) - Math.min(...ys);
  const xPad = xRange < 5 ? 2 : xRange * 0.1;
  const yPad = yRange < 1000 ? 500 : yRange * 0.1;
  const xMin = Math.max(0, Math.min(...xs) - xPad);
  const xMax = Math.max(...xs) + xPad;
  const yMin = Math.max(0, Math.min(...ys) - yPad);
  const yMax = Math.max(...ys) + yPad;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  // axes
  ctx.strokeStyle = "#334155"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, h - padB); ctx.lineTo(w - padR, h - padB); ctx.stroke();
  // grid + labels
  ctx.font = `${fontSm} -apple-system, sans-serif`; ctx.fillStyle = "#94a3b8"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i++) {
    const yv = yMin + (yMax - yMin) * (i / 4);
    const yPx = h - padB - (yv - yMin) / (yMax - yMin) * innerH;
    ctx.strokeStyle = "#1e293b"; ctx.beginPath(); ctx.moveTo(padL, yPx); ctx.lineTo(w - padR, yPx); ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("$" + Math.round(yv / 1000) + "k", padL - 6, yPx);
  }
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (let i = 0; i <= 4; i++) {
    const xv = xMin + (xMax - xMin) * (i / 4);
    const xPx = padL + (xv - xMin) / (xMax - xMin) * innerW;
    ctx.fillText(Math.round(xv) + "d", xPx, h - padB + 6);
  }
  // points
  points.forEach((p, i) => {
    const xPx = padL + (p.x - xMin) / (xMax - xMin) * innerW;
    const yPx = h - padB - (p.y - yMin) / (yMax - yMin) * innerH;
    ctx.fillStyle = PIE_PALETTE[i % PIE_PALETTE.length];
    ctx.beginPath(); ctx.arc(xPx, yPx, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e2e8f0"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.font = `${fontMd} -apple-system, sans-serif`;
    // Shift label down/up if too close to chart edge
    const labelX = xPx + 10;
    const labelY = yPx + (yPx < padT + 14 ? 14 : 0);
    ctx.fillText(p.label, labelX, labelY);
  });
  // axis labels
  ctx.fillStyle = "#94a3b8"; ctx.font = `${fontLg} -apple-system, sans-serif`; ctx.textAlign = "center";
  ctx.fillText(xLabel, padL + innerW / 2, h - 6);
  ctx.save(); ctx.translate(14, padT + innerH / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, 0); ctx.restore();
}

// ── Render ─────────────────────────────────────────────────────────────
function renderResult(container: HTMLElement, r: AnalysisResult) {
  const scoreColor = r.contentingScore >= 75 ? "#10b981" : r.contentingScore >= 50 ? "#f59e0b" : "#ef4444";
  const subtitle = [r.year, r.state ? `(${r.state})` : ""].filter(Boolean).join(" ");

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr;gap:16px;">
      <div style="background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid #334155;border-radius:14px;padding:24px;">
        <div style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:6px;">Model Contenting Analysis</div>
        <div style="font-size:26px;font-weight:700;color:#f8fafc;margin-bottom:4px;">${r.make} ${r.model}${subtitle ? " " + subtitle : ""}</div>
        <div style="font-size:13px;color:#94a3b8;">Trim & body-type demand vs supply — what to produce more of, what to de-emphasize.</div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
        <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Active Inventory</div>
          <div style="font-size:24px;font-weight:700;color:#f8fafc;">${r.totalActive.toLocaleString()}</div>
          <div style="font-size:11px;color:#64748b;margin-top:4px;">listings on lots today</div>
        </div>
        <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Recent Sold (90d)</div>
          <div style="font-size:24px;font-weight:700;color:#f8fafc;">${r.totalSold.toLocaleString()}</div>
          <div style="font-size:11px;color:#64748b;margin-top:4px;">demand signal sample</div>
        </div>
        <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Trims Tracked</div>
          <div style="font-size:24px;font-weight:700;color:#f8fafc;">${r.trimCount}</div>
          <div style="font-size:11px;color:#64748b;margin-top:4px;">${r.imbalancedTrims} imbalanced</div>
        </div>
        <div style="background:#1e293b;border:1px solid ${scoreColor}55;border-radius:12px;padding:16px;">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Contenting Score</div>
          <div style="font-size:24px;font-weight:700;color:${scoreColor};">${r.contentingScore}<span style="font-size:14px;color:#64748b;font-weight:500;"> / 100</span></div>
          <div style="font-size:11px;color:#64748b;margin-top:4px;">${r.contentingScore >= 75 ? "Aligned with demand" : r.contentingScore >= 50 ? "Some imbalance" : "Significant imbalance"}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;">
          <div style="font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:8px;">Active Inventory by Trim</div>
          <canvas id="_pie_trim" style="width:100%;height:240px;"></canvas>
        </div>
        <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;">
          <div style="font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:8px;">Days on Market by Trim</div>
          <canvas id="_bar_dom" style="width:100%;height:240px;"></canvas>
        </div>
      </div>

      <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;">
        <div style="font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:8px;">Price vs DOM by Trim</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:12px;">Each dot is a trim — bottom-left dots are fast-moving and affordable; top-right dots are expensive and slow.</div>
        <canvas id="_scatter" style="width:100%;height:280px;"></canvas>
      </div>

      <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;overflow-x:auto;">
        <div style="font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:12px;">Supply vs Demand Mismatch</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#e2e8f0;">
          <thead>
            <tr style="border-bottom:1px solid #334155;color:#94a3b8;text-transform:uppercase;font-size:11px;letter-spacing:0.5px;">
              <th style="text-align:left;padding:8px;">Trim</th>
              <th style="text-align:right;padding:8px;">Active</th>
              <th style="text-align:right;padding:8px;">Active Share</th>
              <th style="text-align:right;padding:8px;">Demand Share</th>
              <th style="text-align:right;padding:8px;">Imbalance</th>
              <th style="text-align:right;padding:8px;">Avg Price</th>
              <th style="text-align:right;padding:8px;">Avg DOM</th>
              <th style="text-align:center;padding:8px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${r.trims.map(t => {
              const c = STATUS_COLORS[t.status];
              return `<tr style="border-bottom:1px solid #1e293b;">
                <td style="padding:10px 8px;font-weight:600;">${t.trim}</td>
                <td style="text-align:right;padding:10px 8px;">${t.activeCount.toLocaleString()}</td>
                <td style="text-align:right;padding:10px 8px;">${fmtPct(t.activeShare)}</td>
                <td style="text-align:right;padding:10px 8px;">${fmtPct(t.demandShare)}</td>
                <td style="text-align:right;padding:10px 8px;color:${t.imbalanceBps > 0 ? "#fca5a5" : t.imbalanceBps < 0 ? "#6ee7b7" : "#94a3b8"};">${fmtBps(t.imbalanceBps)}</td>
                <td style="text-align:right;padding:10px 8px;">${fmt$(t.avgPrice)}</td>
                <td style="text-align:right;padding:10px 8px;">${t.avgDom > 0 ? t.avgDom + "d" : "—"}</td>
                <td style="text-align:center;padding:10px 8px;">
                  <span style="display:inline-block;padding:3px 10px;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:0.5px;background:${c.bg};color:${c.fg};border:1px solid ${c.border};">${t.status}</span>
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>

      ${r.bodyTypes.length > 1 ? `
      <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;overflow-x:auto;">
        <div style="font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:4px;">Body Type Demand</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:12px;">Active inventory share vs sold share, sourced from the Sold Vehicle Summary API.</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#e2e8f0;">
          <thead>
            <tr style="border-bottom:1px solid #334155;color:#94a3b8;text-transform:uppercase;font-size:11px;letter-spacing:0.5px;">
              <th style="text-align:left;padding:8px;">Body Type</th>
              <th style="text-align:right;padding:8px;">Active</th>
              <th style="text-align:right;padding:8px;">Sold</th>
              <th style="text-align:right;padding:8px;">Active Share</th>
              <th style="text-align:right;padding:8px;">Demand Share</th>
            </tr>
          </thead>
          <tbody>
            ${r.bodyTypes.map(b => `<tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 8px;font-weight:600;">${b.body}</td>
              <td style="text-align:right;padding:10px 8px;">${b.activeCount.toLocaleString()}</td>
              <td style="text-align:right;padding:10px 8px;">${b.soldCount.toLocaleString()}</td>
              <td style="text-align:right;padding:10px 8px;">${fmtPct(b.activeShare)}</td>
              <td style="text-align:right;padding:10px 8px;">${fmtPct(b.demandShare)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
      ` : ""}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div style="background:#1e293b;border:1px solid #10b98144;border-radius:12px;padding:16px;">
          <div style="font-size:11px;font-weight:700;color:#10b981;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">Fast Mover</div>
          <div style="font-size:18px;font-weight:700;color:#f8fafc;margin-bottom:4px;">${r.fastMoverTrim.trim}</div>
          <div style="font-size:13px;color:#94a3b8;">${fmt$(r.fastMoverTrim.price)} · ${r.fastMoverTrim.dom > 0 ? r.fastMoverTrim.dom + " days on market" : ""}</div>
        </div>
        <div style="background:#1e293b;border:1px solid #ef444444;border-radius:12px;padding:16px;">
          <div style="font-size:11px;font-weight:700;color:#fca5a5;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">Slow Mover</div>
          <div style="font-size:18px;font-weight:700;color:#f8fafc;margin-bottom:4px;">${r.slowMoverTrim.trim}</div>
          <div style="font-size:13px;color:#94a3b8;">${fmt$(r.slowMoverTrim.price)} · ${r.slowMoverTrim.dom > 0 ? r.slowMoverTrim.dom + " days on market" : ""}</div>
        </div>
      </div>

      ${r.featureComparison.length > 0 ? `
      <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;overflow-x:auto;">
        <div style="font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:4px;">Feature Comparison: Fast vs Slow</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:12px;">Decoded specs of the fastest- and slowest-moving sample listings. Differences flag the content driving demand.</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#e2e8f0;">
          <thead>
            <tr style="border-bottom:1px solid #334155;color:#94a3b8;text-transform:uppercase;font-size:11px;letter-spacing:0.5px;">
              <th style="text-align:left;padding:8px;">Feature</th>
              <th style="text-align:left;padding:8px;color:#10b981;">Fast Mover</th>
              <th style="text-align:left;padding:8px;color:#fca5a5;">Slow Mover</th>
              <th style="text-align:center;padding:8px;">Match</th>
            </tr>
          </thead>
          <tbody>
            ${r.featureComparison.map(f => `<tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:8px;font-weight:600;color:#cbd5e1;">${f.feature}</td>
              <td style="padding:8px;">${f.fast}</td>
              <td style="padding:8px;">${f.slow}</td>
              <td style="text-align:center;padding:8px;">${f.same ? '<span style="color:#64748b;">=</span>' : '<span style="color:#f59e0b;font-weight:700;">&#x25C7;</span>'}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
      ` : ""}

      ${r.insights.length > 0 ? `
      <div style="background:linear-gradient(135deg,#1e3a8a22,#0f172a);border:1px solid #3b82f644;border-radius:12px;padding:16px;">
        <div style="font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:10px;">Insights</div>
        <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px;">
          ${r.insights.map(i => `<li style="font-size:13px;color:#cbd5e1;line-height:1.55;display:flex;gap:8px;"><span style="color:#60a5fa;">&#9656;</span><span>${i}</span></li>`).join("")}
        </ul>
      </div>
      ` : ""}
    </div>
  `;

  // Draw charts after layout is complete; redraw on resize so mobile rotation / breakpoint changes don't leave stale canvases
  const drawAll = () => {
    const pie = document.getElementById("_pie_trim") as HTMLCanvasElement | null;
    if (pie) drawPieChart(pie, r.trims.map(t => ({ label: t.trim, value: t.activeCount })));
    const bar = document.getElementById("_bar_dom") as HTMLCanvasElement | null;
    if (bar) drawBarChart(bar, r.trims.filter(t => t.avgDom > 0).map(t => ({
      label: t.trim, value: t.avgDom, color: t.status === "OVERSUPPLIED" ? "#ef4444" : t.status === "UNDERSUPPLIED" ? "#10b981" : "#3b82f6",
    })), "days");
    const sc = document.getElementById("_scatter") as HTMLCanvasElement | null;
    if (sc) drawScatter(sc, r.trims.filter(t => t.avgPrice > 0 && t.avgDom > 0).map(t => ({
      x: t.avgDom, y: t.avgPrice, label: t.trim,
    })), "Avg DOM (days)", "Avg Price ($)");
  };
  requestAnimationFrame(() => requestAnimationFrame(drawAll));
  // Single shared resize listener — replace any previous handler so we don't leak listeners across renders
  (window as any)._mca_redraw = drawAll;
  if (!(window as any)._mca_resize_bound) {
    (window as any)._mca_resize_bound = true;
    let resizeTimer: any;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => (window as any)._mca_redraw?.(), 150);
    });
  }
}

// ── Main ───────────────────────────────────────────────────────────────
function main() {
  document.body.style.cssText = "background:#0a0e1a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:20px;min-height:100vh;";

  const wrap = document.createElement("div");
  wrap.style.cssText = "max-width:1200px;margin:0 auto;";
  document.body.appendChild(wrap);

  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;gap:12px;margin-bottom:16px;";
  header.innerHTML = `
    <div>
      <div style="font-size:20px;font-weight:700;color:#f8fafc;">Model Contenting Analyzer</div>
      <div style="font-size:12px;color:#94a3b8;">Which trims and configs are the market buying?</div>
    </div>
  `;
  wrap.appendChild(header);
  _addSettingsBar(header);

  // Demo banner
  if (_detectAppMode() === "demo") {
    const db = document.createElement("div");
    db.id = "_demo_banner";
    db.style.cssText = "background:linear-gradient(135deg,#92400e22,#f59e0b11);border:1px solid #f59e0b44;border-radius:10px;padding:14px 20px;margin-bottom:12px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;";
    db.innerHTML = `
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
    wrap.appendChild(db);
    db.querySelector("#_banner_save")!.addEventListener("click", () => {
      const k = (db.querySelector("#_banner_key") as HTMLInputElement).value.trim();
      if (!k) return;
      localStorage.setItem("mc_api_key", k);
      db.innerHTML = '<div style="font-size:13px;font-weight:700;color:#10b981;">&#10003; API key saved — reloading...</div>';
      setTimeout(() => location.reload(), 600);
    });
    db.querySelector("#_banner_key")!.addEventListener("keydown", (e: any) => {
      if (e.key === "Enter") (db.querySelector("#_banner_save") as HTMLButtonElement).click();
    });
  }

  // Enterprise notice
  const notice = document.createElement("div");
  notice.style.cssText = "background:#fffbeb11;border:1px solid #fde68a44;border-radius:10px;padding:10px 16px;margin-bottom:12px;font-size:12px;color:#fde68a;";
  notice.innerHTML = `&#9888; <strong>Enterprise API:</strong> Body-type demand uses the Sold Vehicle Summary endpoint, which requires an Enterprise subscription. Trim-level analysis works with any key.`;
  wrap.appendChild(notice);

  // Input form
  const urlP = _getUrlParams();
  const form = document.createElement("div");
  form.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;margin-bottom:16px;display:grid;grid-template-columns:repeat(5,1fr);gap:10px;align-items:end;";
  form.innerHTML = `
    <div>
      <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Make *</label>
      <input id="_in_make" type="text" placeholder="Honda" value="${urlP.make ?? "Honda"}"
        style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;box-sizing:border-box;" />
    </div>
    <div>
      <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Model *</label>
      <input id="_in_model" type="text" placeholder="CR-V" value="${urlP.model ?? "CR-V"}"
        style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;box-sizing:border-box;" />
    </div>
    <div>
      <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Year</label>
      <input id="_in_year" type="text" placeholder="2024" value="${urlP.year ?? ""}"
        style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;box-sizing:border-box;" />
    </div>
    <div>
      <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">State</label>
      <input id="_in_state" type="text" placeholder="CA" maxlength="2" value="${urlP.state ?? ""}"
        style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;box-sizing:border-box;text-transform:uppercase;" />
    </div>
    <button id="_btn_run" style="padding:10px 16px;border-radius:6px;border:none;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:0.3px;">Analyze &rarr;</button>
  `;
  wrap.appendChild(form);

  const out = document.createElement("div");
  out.id = "_out";
  wrap.appendChild(out);

  async function run() {
    const make = (form.querySelector("#_in_make") as HTMLInputElement).value.trim() || "Honda";
    const model = (form.querySelector("#_in_model") as HTMLInputElement).value.trim() || "CR-V";
    const year = (form.querySelector("#_in_year") as HTMLInputElement).value.trim();
    const state = (form.querySelector("#_in_state") as HTMLInputElement).value.trim().toUpperCase();
    const args: any = { make, model };
    if (year) args.year = year;
    if (state) args.state = state;

    out.innerHTML = `<div style="text-align:center;padding:48px;color:#94a3b8;font-size:14px;">
      <div style="display:inline-block;width:32px;height:32px;border:3px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
      <div style="margin-top:12px;">Analyzing trim-level demand patterns…</div>
    </div>
    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>`;

    let result: AnalysisResult;
    const tool = await _callTool("analyze_model_contenting", args);
    if (tool && tool.content && tool.content[0] && tool.content[0].text) {
      try {
        const api = JSON.parse(tool.content[0].text);
        result = transformApiResult(api, make, model, year, state);
        if (result.trims.length === 0) {
          // Fall back to mock for empty results
          result = getMockData(make, model, year, state);
        }
      } catch (e) {
        console.warn("Parse failed, using mock:", e);
        result = getMockData(make, model, year, state);
      }
    } else {
      result = getMockData(make, model, year, state);
    }
    renderResult(out, result);
  }

  (form.querySelector("#_btn_run") as HTMLButtonElement).addEventListener("click", run);
  ["_in_make", "_in_model", "_in_year", "_in_state"].forEach(id => {
    (form.querySelector("#" + id) as HTMLInputElement).addEventListener("keydown", (e: any) => {
      if (e.key === "Enter") run();
    });
  });

  // Auto-run on load (always, with sensible defaults)
  run();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
