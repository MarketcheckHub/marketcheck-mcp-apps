/**
 * Subprime Opportunity Finder
 * MCP App — Identify dealers serving subprime buyers for lending product outreach
 */
import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "subprime-opportunity-finder" }); } catch {}

// ── Auth & Mode ────────────────────────────────────────────────────────
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
  for (const key of ["zip", "radius", "state"]) {
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

async function _fetchDirect(args: { zip: string; radius: number; state?: string }) {
  // Step 1: Search active inventory filtered by older vehicles (5+ years) with dealer facets
  // Use year range parameter; price filtering done in code (no max_price API param)
  const cutoffYear = CURRENT_YEAR - 5;
  const inventory = await _mcActive({
    zip: args.zip,
    radius: args.radius,
    year: `2000-${cutoffYear}`,
    rows: 50,
    facets: "dealer_id,make",
    stats: "price,miles,dom",
    sort_by: "price",
    sort_order: "asc",
  });

  // Step 2: Sold demand context (Enterprise API)
  let soldSummary: any = null;
  try {
    soldSummary = await _mcSold({
      ranking_dimensions: "make",
      ranking_measure: "sold_count",
      ranking_order: "desc",
      top_n: 10,
      ...(args.state ? { state: args.state } : {}),
      inventory_type: "Used",
    });
  } catch { /* Enterprise API — graceful failure */ }

  return { inventory, soldSummary };
}

async function _callTool(toolName: string, args: Record<string, any>) {
  const auth = _getAuth();
  if (auth.value) {
    try {
      const data = await _fetchDirect(args as any);
      if (data) return { content: [{ type: "text", text: JSON.stringify(data) }] };
    } catch {}
    try {
      const r = await fetch((_proxyBase()) + "/api/proxy/" + toolName, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, _auth_mode: auth.mode, _auth_value: auth.value }),
      });
      if (r.ok) { const d = await r.json(); return { content: [{ type: "text", text: JSON.stringify(d) }] }; }
    } catch {}
  }
  if (_safeApp && window.parent !== window) {
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
    const panel = document.createElement("div"); panel.style.cssText = "display:none;position:fixed;top:50px;right:16px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;z-index:1000;min-width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.12);";
    panel.innerHTML = `<div style="font-size:13px;font-weight:600;color:#0f172a;margin-bottom:12px;">API Configuration</div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:4px;">MarketCheck API Key</label><input id="_mc_key_inp" type="password" placeholder="Enter your API key" value="${_getAuth().mode === 'api_key' ? _getAuth().value ?? '' : ''}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;color:#0f172a;font-size:13px;margin-bottom:8px;box-sizing:border-box;" /><div style="font-size:10px;color:#94a3b8;margin-bottom:12px;">Get a free key at <a href="https://developers.marketcheck.com" target="_blank" style="color:#3b82f6;">developers.marketcheck.com</a></div><div style="display:flex;gap:8px;"><button id="_mc_save" style="flex:1;padding:8px;border-radius:6px;border:none;background:#3b82f6;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Save & Reload</button><button id="_mc_clear" style="padding:8px 12px;border-radius:6px;border:1px solid #e2e8f0;background:transparent;color:#64748b;font-size:13px;cursor:pointer;">Clear</button></div>`;
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
  s.textContent = `@media(max-width:768px){body{font-size:13px!important}[style*="display:flex"][style*="gap"],[style*="display: flex"][style*="gap"]{flex-wrap:wrap!important}[style*="grid-template-columns"]{grid-template-columns:1fr!important}}@media(max-width:480px){body{padding:8px!important}}`;
  document.head.appendChild(s);
})();

// ── Types ──────────────────────────────────────────────────────────────
interface SubprimeDealer {
  dealerId: string;
  dealerName: string;
  city: string;
  state: string;
  totalUnits: number;
  oldVehicleUnits: number;    // 5+ years old
  oldVehiclePct: number;
  avgPrice: number;
  avgDom: number;
  isBhph: boolean;            // estimated BHPH signal
  dealerType: string;         // "BHPH" | "Independent" | "Franchise"
  dealerAvgAge: number;       // avg vehicle age for this dealer's inventory
  subprimeScore: number;      // 0–100
  lendingOpportunity: number; // est monthly $ opportunity
}

interface PriceBucket {
  label: string;
  count: number;
}

interface ScanResult {
  territory: string;
  totalDealers: number;
  bhphCount: number;
  avgVehicleAge: number;
  prospects: SubprimeDealer[];
  priceBuckets: PriceBucket[];
  hasSoldData: boolean;
}

const CURRENT_YEAR = new Date().getFullYear();

// ── Mock Data ──────────────────────────────────────────────────────────
function generateMockData(): ScanResult {
  const prospects: SubprimeDealer[] = [
    {
      dealerId: "EZ-AUTO-SALES-TX", dealerName: "EZ Auto Sales",
      city: "Dallas", state: "TX",
      totalUnits: 47, oldVehicleUnits: 42, oldVehiclePct: 89,
      avgPrice: 12000, avgDom: 44, isBhph: true, dealerType: "BHPH", dealerAvgAge: 9.4,
      subprimeScore: 92, lendingOpportunity: 185000,
    },
    {
      dealerId: "DRIVE-NOW-MOTORS-TX", dealerName: "Drive Now Motors",
      city: "Garland", state: "TX",
      totalUnits: 61, oldVehicleUnits: 50, oldVehiclePct: 82,
      avgPrice: 10400, avgDom: 51, isBhph: true, dealerType: "BHPH", dealerAvgAge: 10.1,
      subprimeScore: 88, lendingOpportunity: 220000,
    },
    {
      dealerId: "BUDGET-CARS-LLC-TX", dealerName: "Budget Cars LLC",
      city: "Irving", state: "TX",
      totalUnits: 38, oldVehicleUnits: 30, oldVehiclePct: 78,
      avgPrice: 11200, avgDom: 38, isBhph: false, dealerType: "Independent", dealerAvgAge: 8.2,
      subprimeScore: 74, lendingOpportunity: 140000,
    },
    {
      dealerId: "VALUE-AUTO-GROUP-TX", dealerName: "Value Auto Group",
      city: "Mesquite", state: "TX",
      totalUnits: 55, oldVehicleUnits: 39, oldVehiclePct: 71,
      avgPrice: 13800, avgDom: 35, isBhph: false, dealerType: "Independent", dealerAvgAge: 7.6,
      subprimeScore: 66, lendingOpportunity: 165000,
    },
    {
      dealerId: "FAMILY-FIRST-AUTOS-TX", dealerName: "Family First Autos",
      city: "Plano", state: "TX",
      totalUnits: 29, oldVehicleUnits: 19, oldVehiclePct: 65,
      avgPrice: 15200, avgDom: 29, isBhph: false, dealerType: "Franchise", dealerAvgAge: 6.3,
      subprimeScore: 58, lendingOpportunity: 95000,
    },
  ];

  return {
    territory: "75201 / 50mi",
    totalDealers: 18,
    bhphCount: 12,
    avgVehicleAge: 7.2,
    prospects,
    priceBuckets: [
      { label: "<$8K", count: 28 },
      { label: "$8-10K", count: 47 },
      { label: "$10-12K", count: 52 },
      { label: "$12-15K", count: 61 },
      { label: "$15-18K", count: 38 },
      { label: ">$18K", count: 19 },
    ],
    hasSoldData: false,
  };
}

// ── Parse API Response ─────────────────────────────────────────────────
function parseApiResponse(raw: any, args: { zip: string; radius: number }): ScanResult {
  const inventory = raw?.inventory ?? raw;
  const listings: any[] = inventory?.listings ?? [];
  const facets = inventory?.facets ?? {};

  const dealerFacets: any[] = facets?.dealer_id ?? [];
  const dealerTotalMap: Record<string, number> = {};
  for (const f of dealerFacets) dealerTotalMap[String(f.item)] = f.count ?? 0;

  // Year extraction: try l.build?.year, l.year, or VIN char 10 as fallback
  const extractYear = (l: any): number => {
    const y = parseInt(l.build?.year ?? l.year ?? "0", 10);
    if (y > 1990) return y;
    const vin: string = l.vin ?? "";
    if (vin.length >= 10) {
      const map: Record<string, number> = { A:2010,B:2011,C:2012,D:2013,E:2014,F:2015,G:2016,H:2017,J:2018,K:2019,L:2020,M:2021,N:2022,P:2023,R:2024,S:2025 };
      const mapped = map[vin[9].toUpperCase()];
      if (mapped) return mapped;
    }
    return 0;
  };

  // Group listings by dealer
  // All listings are pre-filtered to older vehicles (year range in API call),
  // so every listing counts as an "old unit" — no client-side year re-check needed.
  const dealerMap: Record<string, {
    name: string; city: string; state: string;
    isFranchise: boolean;
    unitCount: number; prices: number[]; doms: number[]; years: number[];
  }> = {};

  for (const l of listings) {
    const did = l.dealer?.id ?? "unknown";
    const name = l.dealer?.name ?? did;
    const city = l.dealer?.city ?? "";
    const state = l.dealer?.state ?? "";
    const price = l.price ?? 0;
    const dom = l.dom ?? l.days_on_market ?? 0;
    const isFranchise = !!(l.dealer?.franchise_id);
    const year = extractYear(l);
    if (!dealerMap[did]) dealerMap[did] = { name, city, state, isFranchise, unitCount: 0, prices: [], doms: [], years: [] };
    dealerMap[did].unitCount++;
    dealerMap[did].isFranchise = dealerMap[did].isFranchise || isFranchise;
    if (price > 0) dealerMap[did].prices.push(price);
    dealerMap[did].doms.push(dom);
    if (year > 0) dealerMap[did].years.push(year);
  }

  const prospects: SubprimeDealer[] = Object.entries(dealerMap).map(([did, d]) => {
    const totalUnits = dealerTotalMap[did] ?? d.unitCount;
    const oldUnits = d.unitCount;
    const oldPct = 100;
    const avgPrice = d.prices.length > 0 ? Math.round(d.prices.reduce((s, v) => s + v, 0) / d.prices.length) : 0;
    const avgDom = d.doms.length > 0 ? Math.round(d.doms.reduce((s, v) => s + v, 0) / d.doms.length) : 0;
    const dealerAvgAge = d.years.length > 0
      ? Math.round((d.years.reduce((s, y) => s + (CURRENT_YEAR - y), 0) / d.years.length) * 10) / 10
      : 0;

    // Subprime score: weighted combo of avg price (lower = higher score) + DOM
    const priceScore = avgPrice > 0 ? Math.max(0, 100 - Math.round(avgPrice / 250)) : 50;
    const domScore = Math.min(avgDom, 100);
    const subprimeScore = Math.round(priceScore * 0.6 + domScore * 0.4);

    // BHPH signal: avg price < $12K
    const isBhph = avgPrice > 0 && avgPrice < 12000;
    const dealerType = isBhph ? "BHPH" : d.isFranchise ? "Franchise" : "Independent";
    const lendingOpportunity = Math.round(totalUnits * (avgPrice || 10000) * 0.65);

    return {
      dealerId: did, dealerName: d.name, city: d.city, state: d.state,
      totalUnits, oldVehicleUnits: oldUnits, oldVehiclePct: oldPct,
      avgPrice, avgDom, isBhph, dealerType, dealerAvgAge, subprimeScore, lendingOpportunity,
    };
  }).filter(d => d.oldVehicleUnits >= 1);

  prospects.sort((a, b) => b.subprimeScore - a.subprimeScore);

  // Price buckets from all listings
  const allPrices = listings.map((l: any) => l.price ?? 0).filter((p: number) => p > 0);
  const priceBuckets: PriceBucket[] = [
    { label: "<$8K", count: allPrices.filter(p => p < 8000).length },
    { label: "$8-10K", count: allPrices.filter(p => p >= 8000 && p < 10000).length },
    { label: "$10-12K", count: allPrices.filter(p => p >= 10000 && p < 12000).length },
    { label: "$12-15K", count: allPrices.filter(p => p >= 12000 && p < 15000).length },
    { label: "$15-18K", count: allPrices.filter(p => p >= 15000 && p < 18000).length },
    { label: ">$18K", count: allPrices.filter(p => p >= 18000).length },
  ];

  const allYears = listings.map(extractYear).filter(y => y > 1990);
  const avgVehicleAge = allYears.length > 0
    ? Math.round((allYears.reduce((s, y) => s + (CURRENT_YEAR - y), 0) / allYears.length) * 10) / 10
    : Math.round((CURRENT_YEAR - 2016) * 10) / 10; // fallback: ~9 yrs if no year data

  return {
    territory: `${args.zip} / ${args.radius}mi`,
    totalDealers: Object.keys(dealerMap).length,
    bhphCount: prospects.filter(d => d.isBhph).length,
    avgVehicleAge,
    prospects,
    priceBuckets,
    hasSoldData: !!(raw?.soldSummary?.rankings?.length),
  };
}

// ── Formatters ─────────────────────────────────────────────────────────
function fmtPrice(v: number): string {
  if (v >= 1000) return "$" + Math.round(v / 1000) + "K";
  return "$" + v;
}

// ── State ──────────────────────────────────────────────────────────────
let currentData: ScanResult | null = null;

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  document.body.style.cssText = "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;color:#1e293b;overflow-x:hidden;";
  renderInputForm();
}

function el(tag: string, attrs?: Record<string, string>): HTMLElement {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === "style") e.style.cssText = v; else e.setAttribute(k, v);
  }
  return e;
}

// ── Input Form ─────────────────────────────────────────────────────────
function renderInputForm() {
  document.body.innerHTML = "";

  const header = el("div", { style: "background:#fff;border-bottom:1px solid #e2e8f0;padding:14px 24px;display:flex;align-items:center;gap:14px;" });
  const iconBox = el("div", { style: "width:40px;height:40px;background:linear-gradient(135deg,#10b981,#059669);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;" });
  iconBox.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`;
  header.appendChild(iconBox);
  const hTitle = el("div", { style: "flex:1;" });
  hTitle.innerHTML = `<div style="font-size:17px;font-weight:700;color:#0f172a;">Subprime Opportunity Finder</div>
    <div style="font-size:12px;color:#64748b;margin-top:1px;">Identify subprime-heavy dealers for lending products</div>`;
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
      db.innerHTML = '<div style="font-size:13px;font-weight:700;color:#059669;">&#10003; API key saved — reloading...</div>';
      setTimeout(() => location.reload(), 800);
    });
    (db.querySelector("#_banner_key") as HTMLInputElement).addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Enter") (db.querySelector("#_banner_save") as HTMLButtonElement).click(); });
  }

  const content = el("div", { style: "padding:24px;max-width:640px;margin:0 auto;" });
  document.body.appendChild(content);

  const descPanel = el("div", { style: "background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:20px;" });
  descPanel.innerHTML = `
    <div style="font-size:14px;font-weight:600;color:#0f172a;margin-bottom:8px;">Find Subprime & BHPH Dealer Prospects</div>
    <div style="font-size:13px;color:#64748b;line-height:1.6;">
      Identifies dealers likely serving subprime buyers by analyzing inventory patterns: high percentage of
      older vehicles (5+ years), lower price points, and high DOM. These signals indicate dealers who may
      need subprime lending products or BHPH financing partnerships.
    </div>
    <div style="margin-top:10px;padding:8px 12px;background:#fffbeb;border-radius:6px;border:1px solid #fde68a;font-size:12px;color:#b45309;">
      <strong>&#9888; Enterprise API:</strong> Sold vehicle demand context requires an Enterprise API subscription.
      Inventory scan works with any API key.
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

  const stateWrap = el("div", { style: "flex:1;" });
  const stateLabel = el("label", { style: "font-size:12px;color:#64748b;display:block;margin-bottom:4px;font-weight:500;" });
  stateLabel.textContent = "State (for demand data)";
  stateWrap.appendChild(stateLabel);
  const stateInput = document.createElement("input");
  stateInput.id = "state-input"; stateInput.type = "text"; stateInput.placeholder = "e.g. TX";
  stateInput.value = urlParams.state ?? "";
  stateInput.maxLength = 2;
  stateInput.style.cssText = "width:100%;padding:10px 12px;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;color:#0f172a;font-size:13px;box-sizing:border-box;text-transform:uppercase;";
  stateWrap.appendChild(stateInput);
  twoCol.appendChild(stateWrap);

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
  demoBtn.addEventListener("click", () => { currentData = generateMockData(); renderDashboard(currentData); });
  buttonRow.appendChild(demoBtn);

  formPanel.appendChild(buttonRow);
  content.appendChild(formPanel);
}

// ── Handle Scan ────────────────────────────────────────────────────────
async function handleScan() {
  const zip = (document.getElementById("zip-input") as HTMLInputElement)?.value?.trim() || "75201";
  const radius = parseInt((document.getElementById("radius-input") as HTMLSelectElement)?.value || "50", 10);
  const state = (document.getElementById("state-input") as HTMLInputElement)?.value?.trim().toUpperCase() || undefined;

  document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px;">
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="width:20px;height:20px;border:2px solid #e2e8f0;border-top-color:#059669;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      <span style="color:#475569;">Scanning ${radius}-mile radius around ${zip}...</span>
    </div>
    <div style="font-size:12px;color:#94a3b8;">Identifying subprime-signal inventory patterns</div>
  </div>`;

  try {
    const result = await _callTool("subprime-opportunity-finder", { zip, radius, state });
    const text = result?.content?.find((c: any) => c.type === "text")?.text;
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed.prospects) {
        currentData = parsed as ScanResult;
      } else {
        currentData = parseApiResponse(parsed, { zip, radius });
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
function renderDashboard(data: ScanResult) {
  document.body.style.cssText = "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;color:#1e293b;overflow-x:hidden;";
  document.body.innerHTML = "";

  const wrap = el("div", { style: "min-height:100vh;display:flex;flex-direction:column;" });
  document.body.appendChild(wrap);

  // ── Top Bar ─────────────────────────────────────────────────────────
  const topBar = el("div", { style: "background:#fff;border-bottom:1px solid #e2e8f0;padding:14px 24px;display:flex;align-items:center;gap:14px;" });
  const iconBox = el("div", { style: "width:40px;height:40px;background:linear-gradient(135deg,#10b981,#059669);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;" });
  iconBox.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`;
  topBar.appendChild(iconBox);
  const titleBlock = el("div", { style: "flex:1;" });
  titleBlock.innerHTML = `<div style="font-size:17px;font-weight:700;color:#0f172a;">Subprime Opportunity Finder</div>
    <div style="font-size:12px;color:#64748b;margin-top:1px;">Identify subprime-heavy dealers for lending products</div>`;
  topBar.appendChild(titleBlock);
  const rightBar = el("div", { style: "display:flex;align-items:center;gap:10px;" });
  const mode = _detectAppMode();
  const modeColors: Record<string, string> = { mcp: "#3b82f6", live: "#10b981", demo: "#f59e0b" };
  rightBar.innerHTML = `<span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;border:1px solid ${modeColors[mode]}33;color:${modeColors[mode]};background:${modeColors[mode]}11;">${mode.toUpperCase()}</span>`;
  if (!_isEmbedMode()) {
    const backBtn = document.createElement("button");
    backBtn.textContent = "New Scan";
    backBtn.style.cssText = "padding:6px 14px;border-radius:6px;border:1px solid #e2e8f0;background:#fff;color:#64748b;font-size:12px;cursor:pointer;font-family:inherit;";
    backBtn.addEventListener("click", () => renderInputForm());
    rightBar.appendChild(backBtn);
  }
  topBar.appendChild(rightBar);
  wrap.appendChild(topBar);

  // Demo banner
  if (mode === "demo" && !_isEmbedMode()) {
    const db = document.createElement("div");
    db.style.cssText = "background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 20px;margin:12px 24px 0;";
    db.innerHTML = `<span style="font-size:12px;font-weight:700;color:#b45309;">&#9888; Demo Mode</span> <span style="font-size:12px;color:#92400e;">— Sample data. Enter your API key via &#9881; to scan real inventory.</span>`;
    wrap.appendChild(db);
  }

  // ── Main Content ─────────────────────────────────────────────────────
  const content = el("div", { style: "flex:1;padding:20px 24px;" });
  wrap.appendChild(content);

  // ── Main Row: Prospects List + Stats ─────────────────────────────────
  const mainRow = el("div", { style: "display:flex;gap:16px;flex-wrap:wrap;" });
  content.appendChild(mainRow);

  // Left: Dealer Prospects List
  const prospectsPanel = el("div", { style: "background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px;flex:1.6;min-width:280px;" });
  mainRow.appendChild(prospectsPanel);
  prospectsPanel.innerHTML = `<div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:14px;">Subprime Dealer Prospects</div>`;

  const dotColors = ["#10b981", "#10b981", "#f59e0b", "#f59e0b", "#94a3b8"];
  for (let i = 0; i < Math.min(data.prospects.length, 8); i++) {
    const d = data.prospects[i];
    const dot = dotColors[i] ?? "#94a3b8";
    const typeTag = d.dealerType === "BHPH"
      ? ` <span style="font-size:10px;font-weight:700;background:#fef3c7;color:#92400e;padding:1px 5px;border-radius:3px;vertical-align:middle;">BHPH</span>`
      : d.dealerType === "Independent"
        ? ` <span style="font-size:10px;font-weight:700;background:#eff6ff;color:#1d4ed8;padding:1px 5px;border-radius:3px;vertical-align:middle;">INDEP</span>`
        : "";
    const row = el("div", { style: `display:flex;align-items:center;gap:10px;padding:8px 0;${i < data.prospects.length - 1 ? "border-bottom:1px solid #f1f5f9;" : ""}` });
    row.innerHTML = `
      <span style="width:8px;height:8px;border-radius:50%;background:${dot};flex-shrink:0;display:inline-block;"></span>
      <span style="font-size:13px;color:#1e293b;flex:1;line-height:1.4;">
        <strong>${d.dealerName}</strong>${typeTag} — <span style="color:#64748b;">${d.dealerAvgAge > 0 ? d.dealerAvgAge + " yr avg age" : d.oldVehiclePct + "% older"}</span> — <span style="color:#475569;">Avg ${fmtPrice(d.avgPrice)}</span>
      </span>`;
    prospectsPanel.appendChild(row);
  }

  if (data.prospects.length === 0) {
    const empty = el("div", { style: "font-size:13px;color:#94a3b8;padding:16px 0;text-align:center;" });
    empty.textContent = "No subprime-signal dealers found in this territory.";
    prospectsPanel.appendChild(empty);
  }

  // Right side: 3 stat cards stacked vertically
  const rightCol = el("div", { style: "display:flex;flex-direction:column;gap:12px;flex:1;min-width:160px;" });
  mainRow.appendChild(rightCol);

  // Stat card: BHPH Dealers
  const bhphCard = el("div", { style: "background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;" });
  bhphCard.innerHTML = `
    <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:8px;">BHPH Dealers</div>
    <div style="font-size:44px;font-weight:800;color:#0f172a;line-height:1.1;">${data.bhphCount}</div>
    <div style="font-size:11px;color:#64748b;margin-top:6px;">in target area</div>`;
  rightCol.appendChild(bhphCard);

  // Stat card: Avg Vehicle Age
  const ageCard = el("div", { style: "background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;" });
  ageCard.innerHTML = `
    <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:8px;">Avg Vehicle Age</div>
    <div style="font-size:36px;font-weight:800;color:#0f172a;line-height:1.1;">${data.avgVehicleAge} <span style="font-size:20px;font-weight:600;">yrs</span></div>
    <div style="font-size:11px;font-weight:600;color:#f59e0b;margin-top:6px;">across prospects</div>`;
  rightCol.appendChild(ageCard);

  // Price Distribution Panel
  const pricePanel = el("div", { style: "background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px;flex:1.4;min-width:200px;" });
  mainRow.appendChild(pricePanel);
  pricePanel.innerHTML = `
    <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:4px;">Price Point Distribution</div>
    <div style="font-size:11px;color:#94a3b8;margin-bottom:14px;">Vehicle price distribution across subprime-signal dealers</div>`;

  const chartCanvas = document.createElement("canvas");
  const CHART_H = 90;
  chartCanvas.width = 240; chartCanvas.height = CHART_H + 20;
  chartCanvas.style.cssText = "width:100%;max-width:240px;display:block;";
  pricePanel.appendChild(chartCanvas);

  requestAnimationFrame(() => {
    const ctx = chartCanvas.getContext("2d");
    if (!ctx) return;
    const buckets = data.priceBuckets;
    const maxVal = Math.max(...buckets.map(b => b.count), 1);
    const gap = 4;
    const barW = Math.floor((chartCanvas.width - (buckets.length - 1) * gap) / buckets.length);
    ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
    buckets.forEach((b, i) => {
      const barH = Math.round((b.count / maxVal) * CHART_H);
      const x = i * (barW + gap);
      const y = CHART_H - barH;
      const grad = ctx.createLinearGradient(x, y, x, CHART_H);
      grad.addColorStop(0, "#93c5fd");
      grad.addColorStop(1, "#3b82f6");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 4);
      ctx.fill();
      ctx.fillStyle = "#94a3b8";
      ctx.font = "8px -apple-system,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(b.label, x + barW / 2, CHART_H + 14);
    });
  });

  // ── Second Row: Detailed Scoring Table ──────────────────────────────
  if (data.prospects.length > 0) {
    const tableSection = el("div", { style: "margin-top:16px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px;overflow-x:auto;" });
    content.appendChild(tableSection);
    tableSection.innerHTML = `<div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:12px;">Prospect Scoring Detail</div>`;

    const table = document.createElement("table");
    table.style.cssText = "width:100%;border-collapse:collapse;font-size:12px;";
    table.innerHTML = `
      <thead>
        <tr style="border-bottom:2px solid #f1f5f9;">
          <th style="text-align:left;padding:6px 10px;color:#94a3b8;font-weight:600;font-size:11px;">Dealer</th>
          <th style="text-align:right;padding:6px 10px;color:#94a3b8;font-weight:600;font-size:11px;">Units</th>
          <th style="text-align:right;padding:6px 10px;color:#94a3b8;font-weight:600;font-size:11px;">Avg Age</th>
          <th style="text-align:right;padding:6px 10px;color:#94a3b8;font-weight:600;font-size:11px;">Avg Price</th>
          <th style="text-align:right;padding:6px 10px;color:#94a3b8;font-weight:600;font-size:11px;">Avg DOM</th>
          <th style="text-align:right;padding:6px 10px;color:#94a3b8;font-weight:600;font-size:11px;">Score</th>
          <th style="text-align:right;padding:6px 10px;color:#94a3b8;font-weight:600;font-size:11px;">Lending Opp.</th>
        </tr>
      </thead>`;
    const tbody = document.createElement("tbody");
    for (let i = 0; i < Math.min(data.prospects.length, 10); i++) {
      const d = data.prospects[i];
      const scoreColor = d.subprimeScore >= 80 ? "#ef4444" : d.subprimeScore >= 65 ? "#f59e0b" : "#64748b";
      const tr = document.createElement("tr");
      tr.style.cssText = `border-bottom:1px solid #f8fafc;${i % 2 === 0 ? "" : "background:#fafafa;"}`;
      tr.innerHTML = `
        <td style="padding:8px 10px;font-weight:600;color:#0f172a;">
          ${d.dealerName}
          ${d.dealerType === "BHPH" ? ' <span style="font-size:9px;background:#fef3c7;color:#92400e;padding:1px 4px;border-radius:3px;">BHPH</span>' : d.dealerType === "Independent" ? ' <span style="font-size:9px;background:#eff6ff;color:#1d4ed8;padding:1px 4px;border-radius:3px;">INDEP</span>' : ""}
          <div style="font-size:10px;color:#94a3b8;font-weight:400;">${d.city}, ${d.state}</div>
        </td>
        <td style="padding:8px 10px;text-align:right;color:#475569;">${d.totalUnits}</td>
        <td style="padding:8px 10px;text-align:right;color:#f59e0b;font-weight:600;">${d.dealerAvgAge > 0 ? d.dealerAvgAge + " yrs" : "—"}</td>
        <td style="padding:8px 10px;text-align:right;color:#475569;">${fmtPrice(d.avgPrice)}</td>
        <td style="padding:8px 10px;text-align:right;color:#475569;">${d.avgDom}d</td>
        <td style="padding:8px 10px;text-align:right;font-weight:700;color:${scoreColor};">${d.subprimeScore}</td>
        <td style="padding:8px 10px;text-align:right;color:#10b981;font-weight:600;">${fmtPrice(d.lendingOpportunity)}</td>`;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tableSection.appendChild(table);
  }

  // ── Footer ───────────────────────────────────────────────────────────
  const footer = el("div", { style: "background:#fff;border-top:1px solid #e2e8f0;padding:12px 24px;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#94a3b8;" });
  footer.innerHTML = `<span>Powered by MarketCheck APIs</span><span>apps.marketcheck.com</span>`;
  wrap.appendChild(footer);
}

main();
