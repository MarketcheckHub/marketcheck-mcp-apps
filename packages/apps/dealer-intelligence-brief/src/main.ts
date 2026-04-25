/**
 * Dealer Intelligence Brief
 * MCP App — One-page dealer profile for sales call prep
 */
import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "dealer-intelligence-brief" }); } catch {}

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
  for (const key of ["dealer_id", "zip", "state"]) {
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

async function _fetchDirect(args: { dealer_id: string; zip?: string; state?: string }) {
  // Step 1: Dealer full inventory with facets & stats (neutral sort — representative sample)
  const inventory = await _mcActive({
    dealer_id: args.dealer_id,
    rows: 50,
    facets: "make,body_type",
    stats: "price,miles,dom",
  });

  // Step 2: Parallel — aged count (accurate via num_found) + sold demand + competitor pricing
  const [agedResult, soldSummary, competitors] = await Promise.allSettled([
    _mcActive({ dealer_id: args.dealer_id, min_dom: 60, rows: 1 }), // num_found = exact aged count
    args.state
      ? _mcSold({
          ranking_dimensions: "make",
          ranking_measure: "sold_count",
          ranking_order: "desc",
          top_n: 10,
          state: args.state,
          inventory_type: "Used",
        })
      : Promise.resolve(null),
    args.zip
      ? _mcActive({
          zip: args.zip,
          radius: 25,
          rows: 50,
          stats: "price,miles,dom",
        })
      : Promise.resolve(null),
  ]);

  return {
    inventory,
    agedInventory: agedResult.status === "fulfilled" ? agedResult.value : null,
    soldSummary: soldSummary.status === "fulfilled" ? soldSummary.value : null,
    competitors: competitors.status === "fulfilled" ? competitors.value : null,
  };
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
interface BrandSlice {
  make: string;
  count: number;
  pct: number;
  color: string;
}

interface BodyTypeSlice {
  bodyType: string;
  count: number;
  pct: number;
}

interface DealerBrief {
  dealerName: string;
  dealerCity: string;
  dealerState: string;
  dealerType: string;
  inventoryCount: number;
  avgDom: number;
  agedCount: number;     // 60+ DOM
  agedPct: number;
  avgPrice: number;
  marketAvgPrice: number;
  hasMarketData: boolean;
  estFloorPlanPerMonth: number;
  brandMix: BrandSlice[];
  bodyTypeMix: BodyTypeSlice[];
  talkingPoints: string[];
  hasSoldData: boolean;
  topDemandMake: string;
}

// ── Palette for brand slices ───────────────────────────────────────────
const SLICE_COLORS = ["#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#e9d5ff", "#f5f3ff"];

// ── Mock Data ──────────────────────────────────────────────────────────
function generateMockData(): DealerBrief {
  return {
    dealerName: "Metro Toyota of Dallas",
    dealerCity: "Dallas",
    dealerState: "TX",
    dealerType: "Franchise",
    inventoryCount: 187,
    avgDom: 38,
    agedCount: 45,
    agedPct: 24,
    avgPrice: 28500,
    marketAvgPrice: 27200,
    hasMarketData: true,
    estFloorPlanPerMonth: 52500,
    brandMix: [
      { make: "Toyota", count: 64, pct: 34, color: SLICE_COLORS[0] },
      { make: "Honda", count: 41, pct: 22, color: SLICE_COLORS[1] },
      { make: "Ford", count: 34, pct: 18, color: SLICE_COLORS[2] },
      { make: "Other", count: 48, pct: 26, color: SLICE_COLORS[3] },
    ],
    bodyTypeMix: [
      { bodyType: "Truck", count: 71, pct: 38 },
      { bodyType: "SUV", count: 56, pct: 30 },
      { bodyType: "Sedan", count: 37, pct: 20 },
      { bodyType: "Other", count: 23, pct: 12 },
    ],
    talkingPoints: [
      "24% aged inventory = floor plan pain point",
      "Heavy truck mix aligns with our products",
      "No current floor plan provider detected",
      "Regional demand for trucks at 2.1x D/S",
    ],
    hasSoldData: false,
    topDemandMake: "Toyota",
  };
}

// ── Parse API Response ─────────────────────────────────────────────────
function parseApiResponse(
  raw: any,
  args: { dealer_id: string; zip?: string; state?: string }
): DealerBrief {
  const inventory = raw?.inventory ?? raw;
  const agedInventory = raw?.agedInventory;
  const soldSummary = raw?.soldSummary;
  const competitors = raw?.competitors;

  const listings: any[] = inventory?.listings ?? [];
  const facets = inventory?.facets ?? {};
  const numFound: number = inventory?.num_found ?? listings.length;

  // Dealer info from first listing
  const firstListing = listings[0];
  const dealerName = firstListing?.dealer?.name ?? "Unknown Dealer";
  const dealerCity = firstListing?.dealer?.city ?? "";
  const dealerState = firstListing?.dealer?.state ?? (args.state ?? "");
  const dealerType = firstListing?.dealer?.franchise_id ? "Franchise" : "Independent";

  // Price & DOM stats — use API aggregate stats (covers full inventory, not just 50 rows)
  const apiStats = inventory?.stats ?? {};
  const avgDom = Math.round(apiStats?.dom?.mean ?? apiStats?.dom?.avg ?? 0) ||
    (() => { const d = listings.map((l: any) => l.dom ?? l.days_on_market ?? 0); return d.length > 0 ? Math.round(d.reduce((s, v) => s + v, 0) / d.length) : 0; })();
  const avgPrice = Math.round(apiStats?.price?.mean ?? apiStats?.price?.avg ?? 0) ||
    (() => { const p = listings.map((l: any) => l.price ?? 0).filter((v: number) => v > 0); return p.length > 0 ? Math.round(p.reduce((s: number, v: number) => s + v, 0) / p.length) : 0; })();
  // Accurate aged count: use num_found from the min_dom:60 query (not a biased sample)
  const agedCount = agedInventory?.num_found ?? 0;
  const agedPct = numFound > 0 ? Math.round((agedCount / numFound) * 100) : 0;

  // Floor plan estimate: $35/day per aged unit
  const estFloorPlanPerMonth = agedCount * 35 * 30;

  // Brand mix from facets
  const makeFacets: any[] = facets?.make ?? [];
  const totalMakeCount = makeFacets.reduce((s: number, f: any) => s + (f.count ?? 0), 0) || 1;
  const topMakes = makeFacets.slice(0, 4);
  const otherCount = makeFacets.slice(4).reduce((s: number, f: any) => s + (f.count ?? 0), 0);
  const brandMix: BrandSlice[] = topMakes.map((f: any, i: number) => ({
    make: f.item ?? "Other",
    count: f.count ?? 0,
    pct: Math.round(((f.count ?? 0) / totalMakeCount) * 100),
    color: SLICE_COLORS[i],
  }));
  if (otherCount > 0) {
    brandMix.push({ make: "Other", count: otherCount, pct: Math.round((otherCount / totalMakeCount) * 100), color: SLICE_COLORS[4] });
  }

  // Body type mix from facets
  const bodyFacets: any[] = facets?.body_type ?? [];
  const totalBodyCount = bodyFacets.reduce((s: number, f: any) => s + (f.count ?? 0), 0) || 1;
  const bodyTypeMix: BodyTypeSlice[] = bodyFacets.slice(0, 5).map((f: any) => ({
    bodyType: f.item ?? "Other",
    count: f.count ?? 0,
    pct: Math.round(((f.count ?? 0) / totalBodyCount) * 100),
  }));

  // Market avg price from competitor data
  const compListings: any[] = competitors?.listings ?? [];
  const compPrices = compListings.map((l: any) => l.price ?? 0).filter((p: number) => p > 0);
  const hasMarketData = compPrices.length > 0;
  const marketAvgPrice = hasMarketData
    ? Math.round(compPrices.reduce((s, v) => s + v, 0) / compPrices.length)
    : avgPrice;

  // Top demand make from sold data
  const hasSoldData = !!(soldSummary?.rankings?.length);
  const topDemandMake = hasSoldData ? (soldSummary.rankings[0]?.dimension_value ?? soldSummary.rankings[0]?.make ?? "") : "";

  // Generate talking points
  const talkingPoints: string[] = [];
  if (agedPct >= 20) talkingPoints.push(`${agedPct}% aged inventory = floor plan pain point`);
  const topBodyType = bodyTypeMix[0]?.bodyType ?? "";
  if (topBodyType) talkingPoints.push(`Heavy ${topBodyType.toLowerCase()} mix — high floor plan exposure`);
  if (avgPrice > marketAvgPrice + 1000) talkingPoints.push(`Pricing ${Math.round((avgPrice - marketAvgPrice) / 500) * 500 / 1000}K above market — may slow turns`);
  else if (avgPrice < marketAvgPrice - 500) talkingPoints.push(`Priced competitively vs. market — volume opportunity`);
  if (hasSoldData && topDemandMake) talkingPoints.push(`${topDemandMake} leads regional demand — aligns with inventory`);
  if (talkingPoints.length < 3) talkingPoints.push("No current floor plan provider detected");
  if (talkingPoints.length < 4) talkingPoints.push(`${numFound} active units across ${brandMix.length} brands`);

  return {
    dealerName, dealerCity, dealerState, dealerType,
    inventoryCount: numFound,
    avgDom, agedCount, agedPct, avgPrice, marketAvgPrice, hasMarketData,
    estFloorPlanPerMonth, brandMix, bodyTypeMix, talkingPoints,
    hasSoldData, topDemandMake,
  };
}

// ── Formatters ─────────────────────────────────────────────────────────
function fmtK(v: number): string {
  if (v >= 1000) return "$" + Math.round(v / 1000) + "K";
  return "$" + Math.round(v).toLocaleString();
}

function fmtMo(v: number): string {
  return fmtK(v) + "/mo";
}

// ── State ──────────────────────────────────────────────────────────────
let currentBrief: DealerBrief | null = null;

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
  const iconBox = el("div", { style: "width:40px;height:40px;background:linear-gradient(135deg,#10b981,#059669);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;" });
  iconBox.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`;
  header.appendChild(iconBox);
  const hTitle = el("div", { style: "flex:1;" });
  hTitle.innerHTML = `<div style="font-size:17px;font-weight:700;color:#0f172a;">Dealer Intelligence Brief</div>
    <div style="font-size:12px;color:#64748b;margin-top:1px;">Dealer profile data for pitch prep</div>`;
  header.appendChild(hTitle);
  _addSettingsBar(header);
  document.body.appendChild(header);

  if (_detectAppMode() === "demo") {
    const db = document.createElement("div");
    db.style.cssText = "background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 20px;margin:16px 24px 0;display:flex;align-items:center;gap:14px;flex-wrap:wrap;";
    db.innerHTML = `
      <div style="flex:1;min-width:200px;">
        <div style="font-size:13px;font-weight:700;color:#b45309;margin-bottom:2px;">&#9888; Demo Mode — Showing sample data</div>
        <div style="font-size:12px;color:#92400e;">Enter your MarketCheck API key to pull real dealer data. <a href="https://developers.marketcheck.com" target="_blank" style="color:#b45309;text-decoration:underline;">Get a free key</a></div>
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
    <div style="font-size:14px;font-weight:600;color:#0f172a;margin-bottom:8px;">Sales Call Prep in Seconds</div>
    <div style="font-size:13px;color:#64748b;line-height:1.6;">
      Pulls a dealer's full active inventory and generates a one-page brief: inventory size, brand mix,
      body type distribution, aging health, estimated floor plan exposure, and pricing vs. market.
      Everything a lender sales rep needs before walking in the door.
    </div>
    <div style="margin-top:10px;padding:8px 12px;background:#fffbeb;border-radius:6px;border:1px solid #fde68a;font-size:12px;color:#b45309;">
      <strong>&#9888; Enterprise API:</strong> State-level sold demand data requires an Enterprise API subscription.
      Inventory profile works with any API key.
    </div>
  `;
  content.appendChild(descPanel);

  const formPanel = el("div", { style: "background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:16px;" });

  const urlParams = _getUrlParams();

  const didLabel = el("label", { style: "font-size:12px;color:#64748b;display:block;margin-bottom:4px;font-weight:500;" });
  didLabel.textContent = "Dealer ID *";
  formPanel.appendChild(didLabel);
  const didInput = document.createElement("input");
  didInput.id = "dealer-id-input"; didInput.type = "text"; didInput.placeholder = "e.g. toyota_of_dallas_tx";
  didInput.value = urlParams.dealer_id ?? "";
  didInput.style.cssText = "width:100%;padding:10px 12px;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;color:#0f172a;font-size:13px;margin-bottom:14px;box-sizing:border-box;";
  formPanel.appendChild(didInput);

  const twoCol = el("div", { style: "display:flex;gap:12px;margin-bottom:14px;" });

  const zipWrap = el("div", { style: "flex:1;" });
  const zipLabel = el("label", { style: "font-size:12px;color:#64748b;display:block;margin-bottom:4px;font-weight:500;" });
  zipLabel.textContent = "Dealer ZIP (for market context)";
  zipWrap.appendChild(zipLabel);
  const zipInput = document.createElement("input");
  zipInput.id = "zip-input"; zipInput.type = "text"; zipInput.placeholder = "e.g. 75201";
  zipInput.value = urlParams.zip ?? "";
  zipInput.style.cssText = "width:100%;padding:10px 12px;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;color:#0f172a;font-size:13px;box-sizing:border-box;";
  zipWrap.appendChild(zipInput);
  twoCol.appendChild(zipWrap);

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

  const runBtn = document.createElement("button");
  runBtn.textContent = "Generate Brief";
  runBtn.style.cssText = "padding:10px 24px;border-radius:6px;border:none;background:#059669;color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;";
  runBtn.addEventListener("click", handleGenerate);
  buttonRow.appendChild(runBtn);

  const demoBtn = document.createElement("button");
  demoBtn.textContent = "Load Demo Data";
  demoBtn.style.cssText = "padding:10px 24px;border-radius:6px;border:1px solid #e2e8f0;background:#fff;color:#64748b;font-size:14px;cursor:pointer;font-family:inherit;";
  demoBtn.addEventListener("click", () => {
    currentBrief = generateMockData();
    renderDashboard(currentBrief);
  });
  buttonRow.appendChild(demoBtn);

  formPanel.appendChild(buttonRow);
  content.appendChild(formPanel);

  // Also show demo immediately if URL has dealer_id
  if (urlParams.dealer_id) {
    setTimeout(() => runBtn.click(), 100);
  }
}

// ── Handle Generate ────────────────────────────────────────────────────
async function handleGenerate() {
  const dealer_id = (document.getElementById("dealer-id-input") as HTMLInputElement)?.value?.trim();
  if (!dealer_id) {
    alert("Please enter a Dealer ID");
    return;
  }
  const zip = (document.getElementById("zip-input") as HTMLInputElement)?.value?.trim() || undefined;
  const state = (document.getElementById("state-input") as HTMLInputElement)?.value?.trim().toUpperCase() || undefined;

  document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px;">
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="width:20px;height:20px;border:2px solid #e2e8f0;border-top-color:#059669;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      <span style="color:#475569;">Pulling dealer inventory &amp; market data...</span>
    </div>
    <div style="font-size:12px;color:#94a3b8;">Fetching inventory profile and demand signals in parallel</div>
  </div>`;

  try {
    const result = await _callTool("dealer-intelligence-brief", { dealer_id, zip, state });
    const text = result?.content?.find((c: any) => c.type === "text")?.text;
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed.dealerName) {
        currentBrief = parsed as DealerBrief;
      } else {
        currentBrief = parseApiResponse(parsed, { dealer_id, zip, state });
      }
    } else {
      currentBrief = generateMockData();
    }
  } catch {
    currentBrief = generateMockData();
  }

  renderDashboard(currentBrief!);
}

// ── Render Dashboard ───────────────────────────────────────────────────
function renderDashboard(brief: DealerBrief) {
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
  titleBlock.innerHTML = `<div style="font-size:17px;font-weight:700;color:#0f172a;">Dealer Intelligence Brief</div>
    <div style="font-size:12px;color:#64748b;margin-top:1px;">Dealer profile data for pitch prep</div>`;
  topBar.appendChild(titleBlock);

  const rightBar = el("div", { style: "display:flex;align-items:center;gap:10px;" });
  const mode = _detectAppMode();
  const modeColors: Record<string, string> = { mcp: "#3b82f6", live: "#10b981", demo: "#f59e0b" };
  rightBar.innerHTML = `<span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;border:1px solid ${modeColors[mode]}33;color:${modeColors[mode]};background:${modeColors[mode]}11;">${mode.toUpperCase()}</span>`;
  if (!_isEmbedMode()) {
    const backBtn = document.createElement("button");
    backBtn.textContent = "New Brief";
    backBtn.style.cssText = "padding:6px 14px;border-radius:6px;border:1px solid #e2e8f0;background:#fff;color:#64748b;font-size:12px;cursor:pointer;font-family:inherit;";
    backBtn.addEventListener("click", () => renderInputForm());
    rightBar.appendChild(backBtn);
  }
  topBar.appendChild(rightBar);
  wrap.appendChild(topBar);

  // ── Demo banner if demo mode ─────────────────────────────────────────
  if (mode === "demo" && !_isEmbedMode()) {
    const db = document.createElement("div");
    db.style.cssText = "background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 20px;margin:12px 24px 0;display:flex;align-items:center;gap:14px;flex-wrap:wrap;";
    db.innerHTML = `<div style="flex:1;"><span style="font-size:12px;font-weight:700;color:#b45309;">&#9888; Demo Mode</span> <span style="font-size:12px;color:#92400e;">— Sample data shown. Enter your API key to pull real dealer profiles.</span></div>`;
    wrap.appendChild(db);
  }

  // ── Main content ─────────────────────────────────────────────────────
  const content = el("div", { style: "flex:1;padding:20px 24px;" });
  wrap.appendChild(content);

  // ── Dealer Profile Card ──────────────────────────────────────────────
  const profileCard = el("div", { style: "background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;margin-bottom:16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;" });
  const dealerIcon = el("div", { style: "width:44px;height:44px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;" });
  dealerIcon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`;
  profileCard.appendChild(dealerIcon);
  const profileInfo = el("div", { style: "flex:1;" });
  profileInfo.innerHTML = `
    <div style="font-size:16px;font-weight:700;color:#0f172a;">${brief.dealerName}</div>
    <div style="font-size:12px;color:#64748b;margin-top:2px;">${brief.dealerCity}${brief.dealerState ? ", " + brief.dealerState : ""} · ${brief.dealerType}</div>`;
  profileCard.appendChild(profileInfo);
  // Inventory count badge
  const invBadge = el("div", { style: "text-align:right;flex-shrink:0;" });
  invBadge.innerHTML = `<div style="font-size:24px;font-weight:800;color:#0f172a;">${brief.inventoryCount}</div><div style="font-size:11px;color:#64748b;font-weight:500;">active units</div>`;
  profileCard.appendChild(invBadge);
  content.appendChild(profileCard);

  // ── Metric Cards Row ─────────────────────────────────────────────────
  const metricsRow = el("div", { style: "display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;" });
  content.appendChild(metricsRow);

  function metricCard(label: string, value: string, sub: string, subColor: string): HTMLElement {
    const card = el("div", { style: "background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;flex:1;min-width:130px;" });
    card.innerHTML = `
      <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:8px;">${label}</div>
      <div style="font-size:28px;font-weight:800;color:#0f172a;line-height:1.1;">${value}</div>
      <div style="font-size:11px;font-weight:600;color:${subColor};margin-top:6px;">${sub}</div>`;
    return card;
  }

  const domColor = brief.avgDom > 60 ? "#ef4444" : brief.avgDom > 40 ? "#f59e0b" : "#10b981";
  const agedColor = brief.agedPct >= 30 ? "#ef4444" : brief.agedPct >= 15 ? "#f59e0b" : "#10b981";
  const fpColor = brief.estFloorPlanPerMonth > 75000 ? "#ef4444" : brief.estFloorPlanPerMonth > 30000 ? "#f59e0b" : "#64748b";

  metricsRow.appendChild(metricCard("Inventory Size", String(brief.inventoryCount), "active units", "#64748b"));
  metricsRow.appendChild(metricCard("Avg DOM", String(brief.avgDom), "days", domColor));
  metricsRow.appendChild(metricCard("Aged (60+ DOM)", `${brief.agedPct}%`, `${brief.agedCount} units`, agedColor));
  metricsRow.appendChild(metricCard("Est. Floor Plan", fmtMo(brief.estFloorPlanPerMonth), "exposure", fpColor));

  // ── Bottom Row: Brand Mix + Body Type + Talking Points ──────────────
  const bottomRow = el("div", { style: "display:flex;gap:16px;flex-wrap:wrap;" });
  content.appendChild(bottomRow);

  // ── Brand Mix Donut ──────────────────────────────────────────────────
  const brandPanel = el("div", { style: "background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px;flex:1.2;min-width:220px;" });
  brandPanel.innerHTML = `<div style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:14px;">Brand Mix</div>`;
  bottomRow.appendChild(brandPanel);

  // Donut chart via canvas
  const donutCanvas = document.createElement("canvas");
  donutCanvas.width = 120; donutCanvas.height = 120;
  donutCanvas.style.cssText = "display:block;margin:0 auto 14px;width:120px;height:120px;";
  brandPanel.appendChild(donutCanvas);

  // Legend
  const legend = el("div", { style: "display:flex;flex-direction:column;gap:5px;" });
  for (const slice of brief.brandMix) {
    const row = el("div", { style: "display:flex;align-items:center;gap:8px;" });
    row.innerHTML = `<span style="width:10px;height:10px;border-radius:50%;background:${slice.color};flex-shrink:0;display:inline-block;"></span>
      <span style="font-size:12px;color:#475569;">${slice.make} — <strong>${slice.pct}%</strong></span>`;
    legend.appendChild(row);
  }
  brandPanel.appendChild(legend);

  // Draw donut after layout
  requestAnimationFrame(() => {
    const ctx = donutCanvas.getContext("2d");
    if (!ctx) return;
    const cx = 60, cy = 60, r = 48, inner = 30;
    let start = -Math.PI / 2;
    for (const slice of brief.brandMix) {
      const angle = (slice.pct / 100) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = slice.color;
      ctx.fill();
      start += angle;
    }
    // Cut inner circle
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, 2 * Math.PI);
    ctx.fillStyle = "#fff";
    ctx.fill();
  });

  // ── Aging Health Gauge ───────────────────────────────────────────────
  const gaugePanel = el("div", { style: "background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px;flex:1;min-width:180px;" });
  gaugePanel.innerHTML = `<div style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:14px;">Aging Health</div>`;
  bottomRow.appendChild(gaugePanel);

  const gaugeCanvas = document.createElement("canvas");
  gaugeCanvas.width = 160; gaugeCanvas.height = 96;
  gaugeCanvas.style.cssText = "display:block;margin:0 auto;width:160px;height:96px;";
  gaugePanel.appendChild(gaugeCanvas);

  const gaugeLbl = el("div", { style: "text-align:center;margin-top:8px;" });
  gaugeLbl.innerHTML = `
    <div style="font-size:26px;font-weight:800;color:${agedColor};line-height:1;">${brief.agedPct}%</div>
    <div style="font-size:11px;color:#64748b;margin-top:2px;">${brief.agedCount} of ${brief.inventoryCount} units 60+ days</div>
    <div style="font-size:11px;font-weight:600;color:${agedColor};margin-top:4px;">${brief.agedPct >= 30 ? "Critical" : brief.agedPct >= 15 ? "Watch" : "Healthy"}</div>`;
  gaugePanel.appendChild(gaugeLbl);

  requestAnimationFrame(() => {
    const ctx = gaugeCanvas.getContext("2d");
    if (!ctx) return;
    const cx = 80, cy = 80, r = 56, lw = 13;
    ctx.lineWidth = lw; ctx.lineCap = "round";
    // Background track
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0, false);
    ctx.strokeStyle = "#e2e8f0"; ctx.stroke();
    // Colored fill
    if (brief.agedPct > 0) {
      const sweep = (Math.min(brief.agedPct, 100) / 100) * Math.PI;
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI + sweep, false);
      ctx.strokeStyle = agedColor; ctx.stroke();
    }
    // Scale labels
    ctx.fillStyle = "#94a3b8"; ctx.font = "9px -apple-system,sans-serif"; ctx.textAlign = "center";
    ctx.fillText("0%", cx - r + 2, cy + 16);
    ctx.fillText("50%", cx, cy - r - 6);
    ctx.fillText("100%", cx + r - 2, cy + 16);
  });

  // ── Body Type Distribution ───────────────────────────────────────────
  const bodyPanel = el("div", { style: "background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px;flex:1;min-width:180px;" });
  bodyPanel.innerHTML = `<div style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:14px;">Body Types</div>`;
  bottomRow.appendChild(bodyPanel);

  const bodyTypeColors = ["#8b5cf6", "#60a5fa", "#34d399", "#f59e0b", "#f87171"];
  for (let i = 0; i < brief.bodyTypeMix.length; i++) {
    const bt = brief.bodyTypeMix[i];
    const barColor = bodyTypeColors[i % bodyTypeColors.length];
    const row = el("div", { style: "margin-bottom:12px;" });
    row.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-size:12px;color:#475569;font-weight:500;">${bt.bodyType}</span>
        <span style="font-size:12px;color:#0f172a;font-weight:700;">${bt.pct}%</span>
      </div>
      <div style="height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden;">
        <div style="height:100%;width:${bt.pct}%;background:${barColor};border-radius:3px;transition:width 0.6s ease;"></div>
      </div>`;
    bodyPanel.appendChild(row);
  }

  // ── Key Talking Points ───────────────────────────────────────────────
  const tpPanel = el("div", { style: "background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px;flex:1.2;min-width:220px;" });
  tpPanel.innerHTML = `<div style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:14px;">Key Talking Points</div>`;
  bottomRow.appendChild(tpPanel);

  const tpColors = ["#10b981", "#10b981", "#f59e0b", "#64748b"];
  for (let i = 0; i < brief.talkingPoints.length; i++) {
    const tp = brief.talkingPoints[i];
    const row = el("div", { style: "display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;" });
    row.innerHTML = `
      <span style="width:8px;height:8px;border-radius:50%;background:${tpColors[i] ?? "#94a3b8"};flex-shrink:0;margin-top:4px;display:inline-block;"></span>
      <span style="font-size:13px;color:#334155;line-height:1.5;">${tp}</span>`;
    tpPanel.appendChild(row);
  }

  // ── Pricing vs Market ────────────────────────────────────────────────
  const pricingRow = el("div", { style: "margin-top:16px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;" });
  pricingRow.innerHTML = `<div style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:10px;">Pricing vs. Market</div>`;
  content.appendChild(pricingRow);

  if (!brief.hasMarketData) {
    pricingRow.innerHTML += `<div style="padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;color:#64748b;">
      No market data — provide a <strong>ZIP code</strong> to compare dealer pricing against nearby competitors.
    </div>`;
  } else {
    const priceDiff = brief.avgPrice - brief.marketAvgPrice;
    const priceDiffPct = Math.round((priceDiff / brief.marketAvgPrice) * 100);
    const priceColor = priceDiff > 1000 ? "#f59e0b" : priceDiff < -500 ? "#10b981" : "#64748b";
    const priceLabel = priceDiff > 1000 ? "above market" : priceDiff < -500 ? "below market" : "at market";

    const pRow = el("div", { style: "display:flex;gap:24px;align-items:center;flex-wrap:wrap;" });
    pricingRow.appendChild(pRow);

    const dealerPricePill = el("div", { style: "flex:1;min-width:140px;" });
    dealerPricePill.innerHTML = `
      <div style="font-size:11px;color:#94a3b8;margin-bottom:2px;">Dealer Avg Price</div>
      <div style="font-size:22px;font-weight:800;color:#0f172a;">${fmtK(brief.avgPrice)}</div>`;
    pRow.appendChild(dealerPricePill);

    const mktPricePill = el("div", { style: "flex:1;min-width:140px;" });
    mktPricePill.innerHTML = `
      <div style="font-size:11px;color:#94a3b8;margin-bottom:2px;">Market Avg Price</div>
      <div style="font-size:22px;font-weight:800;color:#0f172a;">${fmtK(brief.marketAvgPrice)}</div>`;
    pRow.appendChild(mktPricePill);

    const diffPill = el("div", { style: "flex:1;min-width:140px;" });
    diffPill.innerHTML = `
      <div style="font-size:11px;color:#94a3b8;margin-bottom:2px;">Delta</div>
      <div style="font-size:22px;font-weight:800;color:${priceColor};">${priceDiff >= 0 ? "+" : ""}${fmtK(priceDiff)}</div>
      <div style="font-size:11px;color:${priceColor};font-weight:600;">${Math.abs(priceDiffPct)}% ${priceLabel}</div>`;
    pRow.appendChild(diffPill);
  }

  // ── Footer ───────────────────────────────────────────────────────────
  const footer = el("div", { style: "background:#fff;border-top:1px solid #e2e8f0;padding:12px 24px;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#94a3b8;" });
  footer.innerHTML = `<span>Powered by MarketCheck APIs</span><span>apps.marketcheck.com</span>`;
  wrap.appendChild(footer);
}

main();
