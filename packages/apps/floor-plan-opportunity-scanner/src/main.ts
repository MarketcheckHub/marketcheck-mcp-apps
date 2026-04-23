/**
 * Floor Plan Opportunity Scanner
 * MCP App — Identify dealers with aged inventory who need floor plan financing
 */
import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "floor-plan-opportunity-scanner" }); } catch {}

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
  for (const key of ["zip", "radius", "min_dom"]) {
    const v = params.get(key);
    if (v) result[key] = v;
  }
  return result;
}

function _proxyBase(): string {
  return location.protocol.startsWith("http") ? "" : "http://localhost:3001";
}

// ── Direct MarketCheck API Client ──────────────────────────────────────
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
function _mcActive(p: Record<string, any>) { return _mcApi("/search/car/active", p); }
function _mcSold(p: Record<string, any>) { return _mcApi("/api/v1/sold-vehicles/summary", p); }

async function _fetchDirect(args: { zip: string; radius: number; min_dom: number }) {
  // Step 1: Search high-DOM listings in territory with dealer facets and stats
  const aged = await _mcActive({
    zip: args.zip,
    radius: args.radius,
    min_dom: args.min_dom,
    rows: 50,
    facets: "dealer_id,make",
    stats: "price,miles,dom",
    sort_by: "dom",
    sort_order: "desc",
  });
  // Step 2: Fetch sold demand to identify which aged units have market demand (Enterprise API)
  let soldSummary: any = null;
  try {
    soldSummary = await _mcSold({
      ranking_dimensions: "make",
      ranking_measure: "sold_count",
      ranking_order: "desc",
      top_n: 10,
      inventory_type: "Used",
    });
  } catch { /* Enterprise API — not always available */ }
  return { aged, soldSummary };
}

async function _callTool(toolName: string, args: Record<string, any>) {
  const auth = _getAuth();
  if (auth.value) {
    try {
      const r = await fetch((_proxyBase()) + "/api/proxy/" + toolName, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, _auth_mode: auth.mode, _auth_value: auth.value }),
      });
      if (r.ok) { const d = await r.json(); return { content: [{ type: "text", text: JSON.stringify(d) }] }; }
    } catch {}
    try {
      const data = await _fetchDirect(args as any);
      if (data) return { content: [{ type: "text", text: JSON.stringify(data) }] };
    } catch {}
  }
  if (_safeApp) {
    try { return await _safeApp.callServerTool({ name: toolName, arguments: args }); } catch {}
  }
  return null;
}

function _addSettingsBar(headerEl: HTMLElement) {
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
  s.textContent = `@media(max-width:768px){body{font-size:13px!important}table{font-size:12px!important}th,td{padding:6px 8px!important}h1{font-size:18px!important}h2{font-size:15px!important}input,select,button{font-size:14px!important}[style*="display:flex"][style*="gap"],[style*="display: flex"][style*="gap"]{flex-wrap:wrap!important}[style*="grid-template-columns: repeat"]{grid-template-columns:1fr!important}[style*="grid-template-columns:repeat"]{grid-template-columns:1fr!important}table{min-width:600px}}@media(max-width:480px){body{padding:8px!important}h1{font-size:16px!important}th,td{padding:4px 6px!important;font-size:11px!important}input,select{max-width:100%!important;width:100%!important;box-sizing:border-box!important}}`;
  document.head.appendChild(s);
})();

// ── Types ──────────────────────────────────────────────────────────────
interface DomBucket {
  label: string;
  count: number;
  color: string;
}

interface DealerOpportunity {
  dealerId: string;
  dealerName: string;
  city: string;
  state: string;
  totalUnits: number;
  agedUnits: number;           // units >= minDom
  veryAgedUnits: number;       // units >= 90 DOM
  avgDom: number;
  maxDom: number;
  avgPrice: number;
  estimatedBurnPerDay: number;
  estimatedMonthlyBurn: number;
  agedPct: number;             // % of lot that is aged
  veryAgedPct: number;         // % of lot that is 90+ DOM
  hotProspect: boolean;        // veryAgedPct >= 30%
  topMakes: string[];
  agedMakeBreakdown: Record<string, number>; // make → count among aged units only
  domBuckets: DomBucket[];
}

interface ScanData {
  territory: string;
  totalListings: number;
  agedListings: number;
  dealers: DealerOpportunity[];
  marketDemand: Array<{ make: string; soldCount: number }>;
  domDistribution: DomBucket[];
  marketAvgDom: number;
  totalEstMonthlyBurn: number;
}

const BURN_RATE = 35; // $35 per unit per day

// ── Demand match helpers ───────────────────────────────────────────────
function demandMakes(marketDemand: ScanData["marketDemand"]): Set<string> {
  return new Set(marketDemand.map(m => m.make.toLowerCase()));
}

function demandMatchedUnits(dealer: DealerOpportunity, topMakesSet: Set<string>): number {
  return Object.entries(dealer.agedMakeBreakdown)
    .filter(([make]) => topMakesSet.has(make.toLowerCase()))
    .reduce((s, [, count]) => s + count, 0);
}

// ── Mock Data ──────────────────────────────────────────────────────────
function generateMockData(): ScanData {
  const dealers: DealerOpportunity[] = [
    {
      dealerId: "METRO-AUTO-GROUP-TX",
      dealerName: "Metro Auto Group",
      city: "Dallas", state: "TX",
      totalUnits: 187, agedUnits: 68, veryAgedUnits: 31,
      avgDom: 82, maxDom: 194, avgPrice: 28400,
      estimatedBurnPerDay: 68 * BURN_RATE,
      estimatedMonthlyBurn: 68 * BURN_RATE * 30,
      agedPct: 36.4, veryAgedPct: 16.6, hotProspect: false,
      topMakes: ["Ford", "Chevrolet", "Toyota"],
      agedMakeBreakdown: { "Ford": 28, "Chevrolet": 24, "Toyota": 10, "Dodge": 4, "Ram": 2 },
      domBuckets: [
        { label: "60-89d", count: 37, color: "#f59e0b" },
        { label: "90-119d", count: 18, color: "#ef4444" },
        { label: "120+d", count: 13, color: "#7c3aed" },
      ],
    },
    {
      dealerId: "SUNBELT-MOTORS-TX",
      dealerName: "Sunbelt Motors",
      city: "Fort Worth", state: "TX",
      totalUnits: 142, agedUnits: 71, veryAgedUnits: 52,
      avgDom: 97, maxDom: 212, avgPrice: 22100,
      estimatedBurnPerDay: 71 * BURN_RATE,
      estimatedMonthlyBurn: 71 * BURN_RATE * 30,
      agedPct: 50.0, veryAgedPct: 36.6, hotProspect: true,
      topMakes: ["Nissan", "Kia", "Honda"],
      agedMakeBreakdown: { "Nissan": 29, "Kia": 22, "Honda": 20 },
      domBuckets: [
        { label: "60-89d", count: 19, color: "#f59e0b" },
        { label: "90-119d", count: 28, color: "#ef4444" },
        { label: "120+d", count: 24, color: "#7c3aed" },
      ],
    },
    {
      dealerId: "LONE-STAR-PREOWNED-TX",
      dealerName: "Lone Star Pre-Owned",
      city: "Arlington", state: "TX",
      totalUnits: 98, agedUnits: 44, veryAgedUnits: 38,
      avgDom: 103, maxDom: 241, avgPrice: 18700,
      estimatedBurnPerDay: 44 * BURN_RATE,
      estimatedMonthlyBurn: 44 * BURN_RATE * 30,
      agedPct: 44.9, veryAgedPct: 38.8, hotProspect: true,
      topMakes: ["Chevrolet", "Ford", "Dodge"],
      agedMakeBreakdown: { "Chevrolet": 18, "Ford": 16, "Dodge": 10 },
      domBuckets: [
        { label: "60-89d", count: 6, color: "#f59e0b" },
        { label: "90-119d", count: 16, color: "#ef4444" },
        { label: "120+d", count: 22, color: "#7c3aed" },
      ],
    },
    {
      dealerId: "PREMIER-AUTO-CENTER-TX",
      dealerName: "Premier Auto Center",
      city: "Irving", state: "TX",
      totalUnits: 124, agedUnits: 38, veryAgedUnits: 12,
      avgDom: 74, maxDom: 143, avgPrice: 31800,
      estimatedBurnPerDay: 38 * BURN_RATE,
      estimatedMonthlyBurn: 38 * BURN_RATE * 30,
      agedPct: 30.6, veryAgedPct: 9.7, hotProspect: false,
      topMakes: ["BMW", "Mercedes-Benz", "Lexus"],
      agedMakeBreakdown: { "BMW": 16, "Mercedes-Benz": 14, "Lexus": 8 },
      domBuckets: [
        { label: "60-89d", count: 26, color: "#f59e0b" },
        { label: "90-119d", count: 8, color: "#ef4444" },
        { label: "120+d", count: 4, color: "#7c3aed" },
      ],
    },
    {
      dealerId: "DFW-CAR-WAREHOUSE-TX",
      dealerName: "DFW Car Warehouse",
      city: "Garland", state: "TX",
      totalUnits: 211, agedUnits: 87, veryAgedUnits: 63,
      avgDom: 91, maxDom: 278, avgPrice: 16200,
      estimatedBurnPerDay: 87 * BURN_RATE,
      estimatedMonthlyBurn: 87 * BURN_RATE * 30,
      agedPct: 41.2, veryAgedPct: 29.9, hotProspect: false,
      topMakes: ["Toyota", "Honda", "Ford"],
      agedMakeBreakdown: { "Toyota": 38, "Honda": 26, "Ford": 14, "Chrysler": 5, "Jeep": 4 },
      domBuckets: [
        { label: "60-89d", count: 24, color: "#f59e0b" },
        { label: "90-119d", count: 35, color: "#ef4444" },
        { label: "120+d", count: 28, color: "#7c3aed" },
      ],
    },
    {
      dealerId: "VALUE-MOTORS-TX",
      dealerName: "Value Motors DFW",
      city: "Plano", state: "TX",
      totalUnits: 76, agedUnits: 39, veryAgedUnits: 31,
      avgDom: 108, maxDom: 188, avgPrice: 14900,
      estimatedBurnPerDay: 39 * BURN_RATE,
      estimatedMonthlyBurn: 39 * BURN_RATE * 30,
      agedPct: 51.3, veryAgedPct: 40.8, hotProspect: true,
      topMakes: ["Hyundai", "Kia", "Nissan"],
      agedMakeBreakdown: { "Hyundai": 16, "Kia": 14, "Nissan": 9 },
      domBuckets: [
        { label: "60-89d", count: 8, color: "#f59e0b" },
        { label: "90-119d", count: 14, color: "#ef4444" },
        { label: "120+d", count: 17, color: "#7c3aed" },
      ],
    },
  ];

  dealers.sort((a, b) => b.estimatedMonthlyBurn - a.estimatedMonthlyBurn);

  // Derive DOM distribution from dealer buckets (aged units only — the meaningful view)
  const bucketLabels = ["60-89d", "90-119d", "120+d"];
  const bucketColors = ["#f59e0b", "#ef4444", "#7c3aed"];
  const domDistribution = bucketLabels.map((label, i) => ({
    label,
    count: dealers.reduce((s, d) => s + (d.domBuckets[i]?.count ?? 0), 0),
    color: bucketColors[i],
  }));

  return {
    territory: "75201 / 50mi",
    totalListings: dealers.reduce((s, d) => s + d.totalUnits, 0),
    agedListings: dealers.reduce((s, d) => s + d.agedUnits, 0),
    dealers,
    marketDemand: [
      { make: "Toyota", soldCount: 1842 },
      { make: "Ford", soldCount: 1621 },
      { make: "Chevrolet", soldCount: 1487 },
      { make: "Honda", soldCount: 1344 },
      { make: "Nissan", soldCount: 1102 },
    ],
    domDistribution,
    marketAvgDom: 52,
    totalEstMonthlyBurn: dealers.reduce((s, d) => s + d.estimatedMonthlyBurn, 0),
  };
}

// ── Parse API response into ScanData ──────────────────────────────────
function parseApiResponse(raw: any, args: { zip: string; radius: number; min_dom: number }): ScanData {
  const aged = raw?.aged ?? raw;
  const soldSummary = raw?.soldSummary;
  const listings: any[] = aged?.listings ?? [];
  const facets = aged?.facets ?? {};
  const numFound = aged?.num_found ?? listings.length;

  const dealerFacets: any[] = facets?.dealer_id ?? [];
  const dealerTotalMap: Record<string, number> = {};
  for (const f of dealerFacets) dealerTotalMap[String(f.item)] = f.count ?? 0;

  const dealerMap: Record<string, {
    name: string; city: string; state: string;
    doms: number[]; prices: number[];
    allMakes: Record<string, number>;
    agedMakes: Record<string, number>; // makes of aged units only
  }> = {};

  const minDom = args.min_dom;

  for (const l of listings) {
    const did = l.dealer?.id ?? "unknown";
    const name = l.dealer?.name ?? did;
    const city = l.dealer?.city ?? "";
    const state = l.dealer?.state ?? "";
    const dom = l.dom ?? 0;
    const price = l.price ?? 0;
    const make = l.make ?? "Other";
    if (!dealerMap[did]) dealerMap[did] = { name, city, state, doms: [], prices: [], allMakes: {}, agedMakes: {} };
    dealerMap[did].doms.push(dom);
    if (price > 0) dealerMap[did].prices.push(price);
    dealerMap[did].allMakes[make] = (dealerMap[did].allMakes[make] ?? 0) + 1;
    // Track make breakdown for aged units only
    if (dom >= minDom) {
      dealerMap[did].agedMakes[make] = (dealerMap[did].agedMakes[make] ?? 0) + 1;
    }
  }

  const dealers: DealerOpportunity[] = Object.entries(dealerMap).map(([did, d]) => {
    const agedDoms = d.doms.filter(dom => dom >= minDom);
    const veryAgedDoms = d.doms.filter(dom => dom >= 90);
    const totalUnits = dealerTotalMap[did] ?? d.doms.length;
    const avgDom = d.doms.length > 0 ? Math.round(d.doms.reduce((s, v) => s + v, 0) / d.doms.length) : 0;
    const maxDom = d.doms.length > 0 ? Math.max(...d.doms) : 0;
    const avgPrice = d.prices.length > 0 ? Math.round(d.prices.reduce((s, v) => s + v, 0) / d.prices.length) : 0;
    const agedUnits = agedDoms.length;
    const veryAgedUnits = veryAgedDoms.length;
    const agedPct = totalUnits > 0 ? Math.round((agedUnits / totalUnits) * 1000) / 10 : 0;
    const veryAgedPct = totalUnits > 0 ? Math.round((veryAgedUnits / totalUnits) * 1000) / 10 : 0;
    const topMakes = Object.entries(d.allMakes).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => m);

    return {
      dealerId: did, dealerName: d.name, city: d.city, state: d.state,
      totalUnits, agedUnits, veryAgedUnits, avgDom, maxDom, avgPrice,
      estimatedBurnPerDay: agedUnits * BURN_RATE,
      estimatedMonthlyBurn: agedUnits * BURN_RATE * 30,
      agedPct, veryAgedPct, hotProspect: veryAgedPct >= 30,
      topMakes,
      agedMakeBreakdown: d.agedMakes,
      domBuckets: [
        { label: `${minDom}-89d`, count: agedDoms.filter(dom => dom < 90).length, color: "#f59e0b" },
        { label: "90-119d", count: agedDoms.filter(dom => dom >= 90 && dom < 120).length, color: "#ef4444" },
        { label: "120+d", count: agedDoms.filter(dom => dom >= 120).length, color: "#7c3aed" },
      ],
    };
  }).filter(d => d.agedUnits > 0);

  dealers.sort((a, b) => b.estimatedMonthlyBurn - a.estimatedMonthlyBurn);

  const allDoms: number[] = listings.map((l: any) => l.dom ?? 0).filter((d: number) => d > 0);
  const marketAvgDom = allDoms.length > 0 ? Math.round(allDoms.reduce((s, v) => s + v, 0) / allDoms.length) : 0;

  const marketDemand: Array<{ make: string; soldCount: number }> = (soldSummary?.rankings ?? [])
    .slice(0, 5)
    .map((r: any) => ({ make: r.make ?? r.dimension_value ?? "", soldCount: r.sold_count ?? 0 }));

  return {
    territory: `${args.zip} / ${args.radius}mi`,
    totalListings: numFound,
    agedListings: listings.filter((l: any) => (l.dom ?? 0) >= minDom).length,
    dealers,
    marketDemand,
    domDistribution: [
      { label: `${minDom}-89d`, count: allDoms.filter(d => d >= minDom && d < 90).length, color: "#f59e0b" },
      { label: "90-119d", count: allDoms.filter(d => d >= 90 && d < 120).length, color: "#ef4444" },
      { label: "120+d", count: allDoms.filter(d => d >= 120).length, color: "#7c3aed" },
    ],
    marketAvgDom,
    totalEstMonthlyBurn: dealers.reduce((s, d) => s + d.estimatedMonthlyBurn, 0),
  };
}

// ── Formatters ─────────────────────────────────────────────────────────
function fmtCurrency(v: number): string { return "$" + Math.round(v).toLocaleString(); }

// ── State ──────────────────────────────────────────────────────────────
let currentData: ScanData | null = null;

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  document.body.style.cssText = "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;color:#1e293b;overflow-x:hidden;";
  renderInputForm();
}

// ── Element helper ─────────────────────────────────────────────────────
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

// ── Input Form ─────────────────────────────────────────────────────────
function renderInputForm() {
  document.body.innerHTML = "";

  const header = el("div", { style: "background:#fff;border-bottom:1px solid #e2e8f0;padding:14px 24px;display:flex;align-items:center;gap:14px;" });
  const iconBox2 = el("div", { style: "width:40px;height:40px;background:linear-gradient(135deg,#10b981,#059669);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;" });
  iconBox2.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`;
  header.appendChild(iconBox2);
  const hTitle = el("div", { style: "flex:1;" });
  hTitle.innerHTML = `<div style="font-size:17px;font-weight:700;color:#0f172a;">Floor Plan Opportunity Scanner</div>
    <div style="font-size:12px;color:#64748b;margin-top:1px;">Find dealers with aging inventory who need floor plan financing</div>`;
  header.appendChild(hTitle);
  _addSettingsBar(header);
  document.body.appendChild(header);

  if (_detectAppMode() === "demo") {
    const db = document.createElement("div");
    db.style.cssText = "background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 20px;margin:16px 24px 0;display:flex;align-items:center;gap:14px;flex-wrap:wrap;";
    db.innerHTML = `
      <div style="flex:1;min-width:200px;">
        <div style="font-size:13px;font-weight:700;color:#b45309;margin-bottom:2px;">&#9888; Demo Mode — Showing sample data</div>
        <div style="font-size:12px;color:#92400e;">Enter your MarketCheck API key to scan real dealer inventory. <a href="https://developers.marketcheck.com" target="_blank" style="color:#b45309;text-decoration:underline;">Get a free key</a></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <input id="_banner_key" type="text" placeholder="Paste your API key" style="padding:8px 12px;border-radius:6px;border:1px solid #fde68a;background:#fff;color:#1e293b;font-size:13px;width:220px;outline:none;" />
        <button id="_banner_save" style="padding:8px 16px;border-radius:6px;border:none;background:#f59e0b;color:#fff;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">Activate</button>
      </div>`;
    document.body.appendChild(db);
    db.querySelector("#_banner_save")!.addEventListener("click", () => {
      const k = (db.querySelector("#_banner_key") as HTMLInputElement).value.trim();
      if (!k) return;
      localStorage.setItem("mc_api_key", k);
      db.innerHTML = '<div style="font-size:13px;font-weight:700;color:#059669;">&#10003; API key saved — reloading with live data...</div>';
      setTimeout(() => location.reload(), 800);
    });
    (db.querySelector("#_banner_key") as HTMLInputElement).addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Enter") (db.querySelector("#_banner_save") as HTMLButtonElement).click(); });
  }

  const content = el("div", { style: "padding:24px;max-width:680px;margin:0 auto;" });
  document.body.appendChild(content);

  const descPanel = el("div", { style: "background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:20px;" });
  descPanel.innerHTML = `
    <div style="font-size:14px;font-weight:600;color:#0f172a;margin-bottom:8px;">Identify Floor Plan Financing Prospects</div>
    <div style="font-size:13px;color:#64748b;line-height:1.6;">
      Scans a territory for dealers with high days-on-market inventory — a signal they may need floor plan financing.
      Calculates estimated floor plan burn at <strong style="color:#1e293b;">$35/day per unit</strong>, ranks dealers by opportunity size,
      and flags those with 90+ DOM inventory exceeding 30% of their lot as hot prospects.
      Cross-references aged inventory against sold demand data to identify which dealers hold
      <strong style="color:#1e293b;">units the market actually wants</strong>.
    </div>
    <div style="margin-top:10px;padding:8px 12px;background:#fffbeb;border-radius:6px;border:1px solid #fde68a;font-size:12px;color:#b45309;">
      <strong>&#9888; Enterprise API:</strong> Sold vehicle demand data requires an Enterprise API subscription.
      Active inventory scan works with any API key.
    </div>
  `;
  content.appendChild(descPanel);

  const formPanel = el("div", { style: "background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:16px;" });

  const urlParams = _getUrlParams();

  const zipLabel = el("label", { style: "font-size:12px;color:#64748b;display:block;margin-bottom:4px;font-weight:500;" });
  zipLabel.textContent = "Territory Center ZIP *";
  formPanel.appendChild(zipLabel);
  const zipInput = document.createElement("input");
  zipInput.id = "zip-input"; zipInput.type = "text"; zipInput.placeholder = "e.g. 75201";
  zipInput.value = urlParams.zip ?? "75201";
  zipInput.style.cssText = "width:100%;padding:10px 12px;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;color:#0f172a;font-size:13px;margin-bottom:14px;box-sizing:border-box;";
  formPanel.appendChild(zipInput);

  const twoCol = el("div", { style: "display:flex;gap:12px;margin-bottom:14px;" });

  const radiusWrap = el("div", { style: "flex:1;" });
  const radiusLabel = el("label", { style: "font-size:12px;color:#64748b;display:block;margin-bottom:4px;font-weight:500;" });
  radiusLabel.textContent = "Search Radius";
  radiusWrap.appendChild(radiusLabel);
  const radiusSelect = document.createElement("select");
  radiusSelect.id = "radius-input";
  radiusSelect.style.cssText = "width:100%;padding:10px 12px;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;color:#0f172a;font-size:13px;box-sizing:border-box;";
  for (const r of [25, 50, 100]) {
    const opt = document.createElement("option");
    opt.value = String(r); opt.textContent = `${r} miles`;
    if (r === 50) opt.selected = true;
    radiusSelect.appendChild(opt);
  }
  radiusWrap.appendChild(radiusSelect);
  twoCol.appendChild(radiusWrap);

  const domWrap = el("div", { style: "flex:1;" });
  const domLabel = el("label", { style: "font-size:12px;color:#64748b;display:block;margin-bottom:4px;font-weight:500;" });
  domLabel.textContent = "Minimum DOM Threshold";
  domWrap.appendChild(domLabel);
  const domSelect = document.createElement("select");
  domSelect.id = "dom-input";
  domSelect.style.cssText = "width:100%;padding:10px 12px;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;color:#0f172a;font-size:13px;box-sizing:border-box;";
  for (const d of [30, 45, 60, 90]) {
    const opt = document.createElement("option");
    opt.value = String(d); opt.textContent = `${d}+ days`;
    if (d === 60) opt.selected = true;
    domSelect.appendChild(opt);
  }
  domWrap.appendChild(domSelect);
  twoCol.appendChild(domWrap);

  formPanel.appendChild(twoCol);

  const buttonRow = el("div", { style: "display:flex;gap:12px;margin-top:4px;" });

  const scanBtn = document.createElement("button");
  scanBtn.textContent = "Scan Territory";
  scanBtn.style.cssText = "padding:10px 24px;border-radius:6px;border:none;background:#059669;color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;";
  scanBtn.addEventListener("click", handleScan);
  buttonRow.appendChild(scanBtn);

  const demoBtn = document.createElement("button");
  demoBtn.textContent = "Load Demo Data";
  demoBtn.style.cssText = "padding:10px 24px;border-radius:6px;border:1px solid #e2e8f0;background:#fff;color:#64748b;font-size:14px;cursor:pointer;font-family:inherit;";
  demoBtn.addEventListener("click", () => {
    currentData = generateMockData();
    renderDashboard(currentData);
  });
  buttonRow.appendChild(demoBtn);

  formPanel.appendChild(buttonRow);
  content.appendChild(formPanel);
}

// ── Handle Scan ────────────────────────────────────────────────────────
async function handleScan() {
  const zip = (document.getElementById("zip-input") as HTMLInputElement)?.value?.trim() || "75201";
  const radius = parseInt((document.getElementById("radius-input") as HTMLSelectElement)?.value || "50", 10);
  const min_dom = parseInt((document.getElementById("dom-input") as HTMLSelectElement)?.value || "60", 10);
  document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#64748b;flex-direction:column;gap:16px;">
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="width:20px;height:20px;border:2px solid #e2e8f0;border-top-color:#059669;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      <span style="color:#475569;">Scanning dealer inventory within ${radius} miles of ${zip}...</span>
    </div>
    <div style="font-size:12px;color:#94a3b8;">Fetching aged inventory &amp; sold demand data</div>
  </div>`;

  try {
    const result = await _callTool("scan-floor-plan-opportunities", { zip, radius, min_dom });
    const text = result?.content?.find((c: any) => c.type === "text")?.text;
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed.dealers) {
        currentData = parsed as ScanData;
      } else {
        currentData = parseApiResponse(parsed, { zip, radius, min_dom });
      }
    } else {
      currentData = generateMockData();
    }
  } catch {
    currentData = generateMockData();
  }

  renderDashboard(currentData!);
}

// ── Render Dashboard ───────────────────────────────────────────────────
function renderDashboard(data: ScanData) {
  document.body.style.cssText = "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;color:#1e293b;overflow-x:hidden;";
  document.body.innerHTML = "";

  const topMakesSet = demandMakes(data.marketDemand);
  const hasDemandData = data.marketDemand.length > 0;
  const hotCount = data.dealers.filter(d => d.hotProspect).length;
  const totalBurnK = Math.round(data.totalEstMonthlyBurn / 1000);

  // ── Outer wrapper ──────────────────────────────────────────────────
  const wrap = el("div", { style: "min-height:100vh;display:flex;flex-direction:column;" });
  document.body.appendChild(wrap);

  // ── Top bar ────────────────────────────────────────────────────────
  const topBar = el("div", { style: "background:#fff;border-bottom:1px solid #e2e8f0;padding:14px 24px;display:flex;align-items:center;gap:14px;" });
  // Icon
  const iconBox = el("div", { style: "width:40px;height:40px;background:linear-gradient(135deg,#10b981,#059669);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;" });
  iconBox.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`;
  topBar.appendChild(iconBox);
  // Title block
  const titleBlock = el("div", { style: "flex:1;" });
  titleBlock.innerHTML = `<div style="font-size:17px;font-weight:700;color:#0f172a;">Floor Plan Opportunity Scanner</div>
    <div style="font-size:12px;color:#64748b;margin-top:1px;">Find dealers with aging inventory who need floor plan financing</div>`;
  topBar.appendChild(titleBlock);
  // App badge + back
  const rightBar = el("div", { style: "display:flex;align-items:center;gap:10px;" });
  const modeBadge = _detectAppMode();
  const modeColors: Record<string, string> = { mcp: "#3b82f6", live: "#10b981", demo: "#f59e0b" };
  rightBar.innerHTML = `<span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;border:1px solid ${modeColors[modeBadge]}33;color:${modeColors[modeBadge]};background:${modeColors[modeBadge]}11;">${modeBadge.toUpperCase()}</span>`;
  if (!_isEmbedMode()) {
    const gear = document.createElement("button");
    gear.innerHTML = "&#9881;"; gear.title = "API Settings";
    gear.style.cssText = "background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;padding:4px;";
    const panel = document.createElement("div");
    panel.style.cssText = "display:none;position:fixed;top:60px;right:16px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;z-index:1000;min-width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.12);";
    panel.innerHTML = `<div style="font-size:13px;font-weight:600;color:#0f172a;margin-bottom:12px;">API Configuration</div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:4px;">MarketCheck API Key</label><input id="_mc_key_inp2" type="password" placeholder="Enter your API key" value="${_getAuth().mode === 'api_key' ? _getAuth().value ?? '' : ''}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;color:#0f172a;font-size:13px;margin-bottom:8px;box-sizing:border-box;" /><div style="font-size:10px;color:#94a3b8;margin-bottom:12px;">Get a free key at <a href="https://developers.marketcheck.com" target="_blank" style="color:#3b82f6;">developers.marketcheck.com</a></div><div style="display:flex;gap:8px;"><button id="_mc_save2" style="flex:1;padding:8px;border-radius:6px;border:none;background:#3b82f6;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Save & Reload</button><button id="_mc_clear2" style="padding:8px 12px;border-radius:6px;border:1px solid #e2e8f0;background:transparent;color:#64748b;font-size:13px;cursor:pointer;">Clear</button></div>`;
    gear.addEventListener("click", () => { panel.style.display = panel.style.display === "none" ? "block" : "none"; });
    document.addEventListener("click", (e) => { if (!panel.contains(e.target as Node) && e.target !== gear) panel.style.display = "none"; });
    document.body.appendChild(panel);
    setTimeout(() => {
      document.getElementById("_mc_save2")?.addEventListener("click", () => { const k = (document.getElementById("_mc_key_inp2") as HTMLInputElement)?.value?.trim(); if (k) { localStorage.setItem("mc_api_key", k); location.reload(); } });
      document.getElementById("_mc_clear2")?.addEventListener("click", () => { localStorage.removeItem("mc_api_key"); localStorage.removeItem("mc_access_token"); location.reload(); });
    }, 0);
    rightBar.appendChild(gear);
  }
  const backBtn = document.createElement("button");
  backBtn.textContent = "New Scan";
  backBtn.style.cssText = "padding:6px 14px;border-radius:6px;border:1px solid #e2e8f0;background:#fff;color:#64748b;font-size:12px;cursor:pointer;font-family:inherit;";
  backBtn.addEventListener("click", () => renderInputForm());
  rightBar.appendChild(backBtn);
  topBar.appendChild(rightBar);
  wrap.appendChild(topBar);

  // ── Main content ───────────────────────────────────────────────────
  const content = el("div", { style: "flex:1;padding:20px 24px;" });
  wrap.appendChild(content);

  // ── Four-panel row ─────────────────────────────────────────────────
  const panelRow = el("div", { style: "display:flex;gap:16px;align-items:stretch;flex-wrap:wrap;" });
  content.appendChild(panelRow);

  // Panel 1 — Floor Plan Opportunities list
  const opPanel = el("div", { style: "background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;flex:2;min-width:280px;" });
  panelRow.appendChild(opPanel);
  opPanel.innerHTML = `<div style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:14px;">Floor Plan Opportunities</div>`;

  // Color tiers based on burn ranking
  const dotColors = ["#10b981", "#10b981", "#f59e0b", "#f59e0b", "#94a3b8", "#94a3b8"];
  for (let i = 0; i < Math.min(data.dealers.length, 8); i++) {
    const d = data.dealers[i];
    const dot = dotColors[i] ?? "#94a3b8";
    // Demand match context
    let demandNote = "";
    if (hasDemandData) {
      const matched = demandMatchedUnits(d, topMakesSet);
      if (matched > 0) demandNote = ` · <span style="color:#10b981;">${matched} in-demand units</span>`;
    }
    const hotMark = d.hotProspect ? ` <span style="font-size:10px;color:#ef4444;font-weight:700;">HOT</span>` : "";
    const row = el("div", { style: `display:flex;align-items:center;gap:10px;padding:8px 0;${i < data.dealers.length - 1 ? "border-bottom:1px solid #f1f5f9;" : ""}` });
    row.innerHTML = `
      <span style="width:9px;height:9px;border-radius:50%;background:${dot};flex-shrink:0;display:inline-block;"></span>
      <span style="font-size:13px;color:#1e293b;flex:1;">
        <strong>${d.dealerName}</strong>${hotMark} —
        <span style="color:#10b981;font-weight:600;">${fmtCurrency(d.estimatedMonthlyBurn)}/mo burn</span> —
        <span style="color:#64748b;">${d.agedPct.toFixed(0)}% aged</span>${demandNote}
      </span>`;
    opPanel.appendChild(row);
  }

  // Panel 2 — Hot Prospects
  const hotPanel = el("div", { style: "background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;min-width:160px;flex:1;display:flex;flex-direction:column;justify-content:center;" });
  panelRow.appendChild(hotPanel);
  hotPanel.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:12px;">Hot Prospects</div>
    <div style="font-size:52px;font-weight:800;color:#0f172a;line-height:1;">${hotCount}</div>
    <div style="font-size:12px;color:#ef4444;font-weight:600;margin-top:8px;">90+ DOM &gt; 30%</div>`;

  // Panel 3 — Total Burn
  const burnPanel = el("div", { style: "background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;min-width:160px;flex:1;display:flex;flex-direction:column;justify-content:center;" });
  panelRow.appendChild(burnPanel);
  burnPanel.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:12px;">Total Burn</div>
    <div style="font-size:40px;font-weight:800;color:#0f172a;line-height:1;">$${totalBurnK}K/mo</div>
    <div style="font-size:12px;color:#f59e0b;font-weight:600;margin-top:8px;">across prospects</div>`;

  // Panel 4 — DOM Distribution bar chart
  const domPanel = el("div", { style: "background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;min-width:200px;flex:1.5;" });
  panelRow.appendChild(domPanel);
  domPanel.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:4px;">DOM Distribution</div>
    <div style="font-size:11px;color:#94a3b8;margin-bottom:16px;">Aging inventory distribution across prospect dealers</div>`;

  const canvas = document.createElement("canvas");
  const chartH = 100;
  canvas.width = 260;
  canvas.height = chartH + 24;
  canvas.style.cssText = "width:100%;max-width:260px;display:block;";
  domPanel.appendChild(canvas);

  // Draw bar chart after DOM settles
  requestAnimationFrame(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const buckets = data.domDistribution;
    const maxVal = Math.max(...buckets.map(b => b.count), 1);
    const barW = Math.floor((canvas.width - (buckets.length - 1) * 6) / buckets.length);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    buckets.forEach((b, i) => {
      const barH = Math.round((b.count / maxVal) * chartH);
      const x = i * (barW + 6);
      const y = chartH - barH;
      // Gradient fill: teal for first two, blue shades for rest
      const grad = ctx.createLinearGradient(x, y, x, chartH);
      grad.addColorStop(0, "#60a5fa");
      grad.addColorStop(1, "#3b82f6");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 4);
      ctx.fill();
      // Label
      ctx.fillStyle = "#94a3b8";
      ctx.font = "9px -apple-system,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(b.label.replace("d", ""), x + barW / 2, chartH + 14);
    });
  });

  // ── Second row: demand cross-reference table (if available) ────────
  if (hasDemandData) {
    const demandRow = el("div", { style: "margin-top:16px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;" });
    content.appendChild(demandRow);
    demandRow.innerHTML = `<div style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:4px;">Aged Units vs. Market Demand</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:16px;">Cross-references each dealer's aged inventory against top sold makes — dealers with high demand match have sellable units, indicating a financing/liquidity problem rather than a demand problem.</div>`;

    const demandGrid = el("div", { style: "display:flex;gap:12px;flex-wrap:wrap;" });
    demandRow.appendChild(demandGrid);

    for (const d of data.dealers.slice(0, 6)) {
      const matched = demandMatchedUnits(d, topMakesSet);
      const matchPct = d.agedUnits > 0 ? Math.round((matched / d.agedUnits) * 100) : 0;
      const barColor = matchPct >= 60 ? "#10b981" : matchPct >= 30 ? "#f59e0b" : "#94a3b8";
      const card = el("div", { style: "background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;min-width:160px;flex:1;" });
      card.innerHTML = `
        <div style="font-size:12px;font-weight:600;color:#0f172a;margin-bottom:6px;">${d.dealerName}</div>
        <div style="font-size:11px;color:#64748b;margin-bottom:6px;">${matched} of ${d.agedUnits} aged units in top-demand makes</div>
        <div style="height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${matchPct}%;background:${barColor};border-radius:3px;"></div>
        </div>
        <div style="font-size:11px;color:${barColor};font-weight:600;margin-top:4px;">${matchPct}% demand match</div>`;
      demandGrid.appendChild(card);
    }
  }

  // ── Per-dealer aging heatmap ───────────────────────────────────────
  const heatmapSection = el("div", { style: "margin-top:16px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;" });
  content.appendChild(heatmapSection);
  heatmapSection.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:4px;">Aging Heatmap — Per Dealer</div>
    <div style="font-size:12px;color:#64748b;margin-bottom:16px;">DOM bucket breakdown per dealer — how aged inventory is distributed across time thresholds.</div>`;

  const heatGrid = el("div", { style: "display:flex;flex-direction:column;gap:10px;" });
  heatmapSection.appendChild(heatGrid);

  for (const d of data.dealers.slice(0, 8)) {
    const maxBucket = Math.max(...d.domBuckets.map(b => b.count), 1);
    const hotMark = d.hotProspect ? `<span style="font-size:10px;color:#ef4444;font-weight:700;margin-left:6px;">HOT</span>` : "";
    const heatRow = el("div", { style: "display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #f1f5f9;" });

    const nameEl = el("div", { style: "font-size:12px;font-weight:600;color:#0f172a;min-width:170px;flex-shrink:0;" });
    nameEl.innerHTML = `${d.dealerName}${hotMark}`;
    heatRow.appendChild(nameEl);

    const barsWrap = el("div", { style: "flex:1;display:flex;gap:6px;align-items:flex-end;height:36px;" });
    for (const bucket of d.domBuckets) {
      const barH = Math.max(4, Math.round((bucket.count / maxBucket) * 32));
      const barWrap = el("div", { style: "flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;justify-content:flex-end;height:36px;" });
      const bar = el("div", { style: `height:${barH}px;width:100%;background:${bucket.color};border-radius:3px 3px 0 0;` });
      barWrap.appendChild(bar);
      barsWrap.appendChild(barWrap);
    }
    heatRow.appendChild(barsWrap);

    const labelsWrap = el("div", { style: "display:flex;gap:6px;min-width:240px;" });
    for (const bucket of d.domBuckets) {
      const lbl = el("div", { style: `flex:1;text-align:center;font-size:11px;` });
      lbl.innerHTML = `<span style="color:${bucket.color};font-weight:700;">${bucket.count}</span><br><span style="color:#94a3b8;">${bucket.label}</span>`;
      labelsWrap.appendChild(lbl);
    }
    heatRow.appendChild(labelsWrap);

    heatGrid.appendChild(heatRow);
  }

  // ── Footer ─────────────────────────────────────────────────────────
  const footer = el("div", { style: "background:#fff;border-top:1px solid #e2e8f0;padding:12px 24px;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#94a3b8;" });
  footer.innerHTML = `<span>Powered by MarketCheck APIs</span><span>apps.marketcheck.com</span>`;
  wrap.appendChild(footer);
}

main();
