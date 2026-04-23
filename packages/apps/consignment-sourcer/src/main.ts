/**
 * Consignment Sourcer
 * Find dealers with aged inventory ripe for consignment.
 * Searches active listings filtered by high days-on-market,
 * calculates floor plan burn, and ranks dealers by consignment
 * opportunity score.
 */

import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "consignment-sourcer" }); } catch {}

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
  for (const key of ["zip", "radius", "minDom"]) {
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
function _mcRecent(p: Record<string, any>) { return _mcApi("/search/car/recents", p); }
function _mcSold(p: Record<string, any>) { return _mcApi("/api/v1/sold-vehicles/summary", p); }

// ── Types ──────────────────────────────────────────────────────────────

interface VehicleListing {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  miles: number;
  dom: number;
  dealerId: string;
  dealerName: string;
  dealerCity: string;
  dealerState: string;
  floorPlanBurn: number;
  hasArbitrage: boolean;
}

interface DealerProspect {
  dealerId: string;
  dealerName: string;
  city: string;
  state: string;
  agedUnitCount: number;
  avgDom: number;
  totalListedValue: number;
  totalFloorPlanBurn: number;
  opportunityScore: number;
}

interface ConsignmentData {
  dealers: DealerProspect[];
  vehicles: VehicleListing[];
  summary: {
    totalAgedListings: number;
    totalDealers: number;
    avgDom: number;
    totalFloorPlanBurn: number;
  };
}

// ── Business Logic ─────────────────────────────────────────────────────

const FLOOR_PLAN_RATE = 0.07; // 7% annual rate

function calcFloorPlanBurn(price: number, dom: number): number {
  return Math.round((price * FLOOR_PLAN_RATE / 365) * dom);
}

function calcOpportunityScore(avgDom: number, unitCount: number, totalBurn: number, maxBurn: number): number {
  // DOM score (40%): normalize 60-180 to 0-100
  const domScore = Math.min(100, Math.max(0, ((avgDom - 60) / 120) * 100));
  // Burn score (30%): normalize by max burn in dataset
  const burnScore = maxBurn > 0 ? Math.min(100, (totalBurn / maxBurn) * 100) : 0;
  // Count score (20%): more aged units = more opportunity
  const countScore = Math.min(100, unitCount * 15);
  // Combined
  return Math.round(domScore * 0.4 + burnScore * 0.3 + countScore * 0.2 + 10); // +10 base
}

// ── Data Orchestration (Live Mode) ─────────────────────────────────────

async function _fetchDirect(zip: string, radius: number, minDom: number): Promise<ConsignmentData> {
  // Step 1: Aged Inventory Search — use dom_active (current listing age, not lifetime)
  // Cap at 365 days to exclude specialty/classic inventory that sits intentionally
  const maxDom = 365;
  const searchResult = await _mcActive({
    zip,
    radius,
    sort_by: "dom_active",
    sort_order: "desc",
    rows: 50,
    stats: "price,miles,dom_active",
    facets: "dealer_id",
    seller_type: "dealer",
    dom_active_range: `${minDom}-${maxDom}`,
  });

  const listings = searchResult?.listings ?? [];

  // Filter: require price > 0 (exclude no-price listings)
  const agedListings = listings.filter((l: any) => {
    return (l.price ?? 0) > 0;
  });

  // Step 2: Market Demand Context — try soldSummary (enterprise), fall back to recents
  const demandMakes: Record<string, number> = {};
  try {
    const sold = await _mcSold({
      ranking_dimensions: "make",
      ranking_measure: "count",
      top_n: 20,
      inventory_type: "used",
    });
    if (sold?.rankings) {
      for (const r of sold.rankings) {
        demandMakes[r.make?.toLowerCase()] = r.count ?? 0;
      }
    }
  } catch {
    // Enterprise API not available — use recents as fallback for demand
    const uniqueMakes = [...new Set(agedListings.map((l: any) => l.build?.make ?? l.make).filter(Boolean))];
    await Promise.all(
      uniqueMakes.map(async (make: string) => {
        try {
          const recents = await _mcRecent({ make, zip, radius: 150, rows: 0, stats: "price" });
          demandMakes[make.toLowerCase()] = recents?.num_found ?? 0;
        } catch { demandMakes[make.toLowerCase()] = 0; }
      })
    );
  }

  // Build vehicle listings — vehicle info is in l.build.* (search API uses build object)
  const vehicles: VehicleListing[] = agedListings.map((l: any) => {
    const dom = l.dom_active ?? l.dom ?? l.days_on_market ?? 0;
    const price = l.price ?? 0;
    const make = l.build?.make ?? l.make ?? "Unknown";
    const demandCount = demandMakes[make.toLowerCase()] ?? 0;
    // Arbitrage: vehicle is aged locally but make has high demand (>100 recent sales)
    const hasArbitrage = dom >= 90 && demandCount > 100;

    return {
      vin: l.vin ?? "",
      year: l.build?.year ?? l.year ?? 0,
      make,
      model: l.build?.model ?? l.model ?? "Unknown",
      trim: l.build?.trim ?? l.trim ?? "",
      price,
      miles: l.miles ?? l.mileage ?? 0,
      dom,
      dealerId: l.dealer?.id ?? l.dealer_id ?? "",
      dealerName: l.dealer?.name ?? "Unknown Dealer",
      dealerCity: l.dealer?.city ?? "",
      dealerState: l.dealer?.state ?? "",
      floorPlanBurn: calcFloorPlanBurn(price, dom),
      hasArbitrage,
    };
  });

  // Group by dealer
  const dealerMap: Record<string, VehicleListing[]> = {};
  for (const v of vehicles) {
    if (!dealerMap[v.dealerId]) dealerMap[v.dealerId] = [];
    dealerMap[v.dealerId].push(v);
  }

  // Compute max burn for scoring normalization
  const dealerBurns = Object.values(dealerMap).map((vList) =>
    vList.reduce((s, v) => s + v.floorPlanBurn, 0)
  );
  const maxBurn = Math.max(...dealerBurns, 1);

  // Build dealer prospects
  const dealers: DealerProspect[] = Object.entries(dealerMap).map(([dealerId, vList]) => {
    const first = vList[0];
    const avgDom = Math.round(vList.reduce((s, v) => s + v.dom, 0) / vList.length);
    const totalListedValue = vList.reduce((s, v) => s + v.price, 0);
    const totalFloorPlanBurn = vList.reduce((s, v) => s + v.floorPlanBurn, 0);
    return {
      dealerId,
      dealerName: first.dealerName,
      city: first.dealerCity,
      state: first.dealerState,
      agedUnitCount: vList.length,
      avgDom,
      totalListedValue,
      totalFloorPlanBurn,
      opportunityScore: calcOpportunityScore(avgDom, vList.length, totalFloorPlanBurn, maxBurn),
    };
  });

  // Sort dealers by opportunity score descending
  dealers.sort((a, b) => b.opportunityScore - a.opportunityScore);

  const totalAgedListings = vehicles.length;
  const avgDom = totalAgedListings > 0 ? Math.round(vehicles.reduce((s, v) => s + v.dom, 0) / totalAgedListings) : 0;
  const totalFloorPlanBurn = vehicles.reduce((s, v) => s + v.floorPlanBurn, 0);

  return {
    dealers,
    vehicles,
    summary: { totalAgedListings, totalDealers: dealers.length, avgDom, totalFloorPlanBurn },
  };
}

// ── _callTool (MCP → Direct → Proxy → Mock) ───────────────────────────

async function _callTool(args: { zip: string; radius: number; minDom: number }): Promise<ConsignmentData | null> {
  // 1. MCP mode
  if (_safeApp && window.parent !== window) {
    try {
      const r = await _safeApp.callServerTool({ name: "consignment-sourcer", arguments: args });
      const parsed = JSON.parse(typeof r === "string" ? r : r?.content?.[0]?.text ?? "{}");
      if (parsed.dealers) return parsed as ConsignmentData;
    } catch (e) { console.warn("MCP failed:", e); }
  }

  // 2. Direct API
  const auth = _getAuth();
  if (auth.value) {
    try {
      return await _fetchDirect(args.zip, args.radius, args.minDom);
    } catch (e) { console.warn("Direct API failed, trying proxy:", e); }

    // 3. Proxy fallback
    try {
      const r = await fetch((_proxyBase()) + "/api/proxy/consignment-sourcer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, _auth_mode: auth.mode, _auth_value: auth.value }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.dealers) return d as ConsignmentData;
      }
    } catch {}
  }

  // 4. Demo mode
  return null;
}

// ── Mock Data ──────────────────────────────────────────────────────────

function getMockData(): ConsignmentData {
  const vehicles: VehicleListing[] = [
    { vin: "1FTFW1E85MFA00001", year: 2021, make: "Ford", model: "F-150", trim: "XLT", price: 42800, miles: 35000, dom: 142, dealerId: "d1", dealerName: "Premier Auto Group", dealerCity: "Scottsdale", dealerState: "AZ", floorPlanBurn: 0, hasArbitrage: true },
    { vin: "5TDGZRAH1NS234567", year: 2022, make: "Toyota", model: "Highlander", trim: "XLE", price: 38500, miles: 28000, dom: 128, dealerId: "d1", dealerName: "Premier Auto Group", dealerCity: "Scottsdale", dealerState: "AZ", floorPlanBurn: 0, hasArbitrage: false },
    { vin: "WBA53BH06NCK34567", year: 2022, make: "BMW", model: "530i", trim: "xDrive", price: 44600, miles: 32000, dom: 118, dealerId: "d1", dealerName: "Premier Auto Group", dealerCity: "Scottsdale", dealerState: "AZ", floorPlanBurn: 0, hasArbitrage: false },
    { vin: "1C4RJXF65NC567890", year: 2022, make: "Jeep", model: "Grand Cherokee", trim: "Limited", price: 45200, miles: 26000, dom: 105, dealerId: "d2", dealerName: "Sunset Motors", dealerCity: "Tempe", dealerState: "AZ", floorPlanBurn: 0, hasArbitrage: true },
    { vin: "3GNKBCRS1KS697223", year: 2019, make: "Chevrolet", model: "Blazer", trim: "2LT", price: 28900, miles: 52000, dom: 97, dealerId: "d2", dealerName: "Sunset Motors", dealerCity: "Tempe", dealerState: "AZ", floorPlanBurn: 0, hasArbitrage: false },
    { vin: "KNDCB3LC9L5359658", year: 2020, make: "Kia", model: "Forte", trim: "LXS", price: 18900, miles: 45000, dom: 135, dealerId: "d3", dealerName: "Valley Ford Lincoln", dealerCity: "Mesa", dealerState: "AZ", floorPlanBurn: 0, hasArbitrage: false },
    { vin: "1HGCV1F34LA000001", year: 2020, make: "Honda", model: "Civic", trim: "EX", price: 23400, miles: 38000, dom: 112, dealerId: "d3", dealerName: "Valley Ford Lincoln", dealerCity: "Mesa", dealerState: "AZ", floorPlanBurn: 0, hasArbitrage: true },
    { vin: "5YJSA1E26MF000001", year: 2021, make: "Tesla", model: "Model S", trim: "Long Range", price: 68500, miles: 22000, dom: 165, dealerId: "d4", dealerName: "AutoNation Honda", dealerCity: "Chandler", dealerState: "AZ", floorPlanBurn: 0, hasArbitrage: true },
    { vin: "3FA6P0RU4LR139831", year: 2020, make: "Ford", model: "Fusion Hybrid", trim: "Titanium", price: 22300, miles: 48000, dom: 88, dealerId: "d4", dealerName: "AutoNation Honda", dealerCity: "Chandler", dealerState: "AZ", floorPlanBurn: 0, hasArbitrage: false },
    { vin: "2G1WC5E36G1162532", year: 2016, make: "Chevrolet", model: "Impala", trim: "1LZ", price: 12500, miles: 98000, dom: 175, dealerId: "d5", dealerName: "CrossTown Chevrolet", dealerCity: "Gilbert", dealerState: "AZ", floorPlanBurn: 0, hasArbitrage: false },
    { vin: "2T1BURHE0KC890123", year: 2022, make: "Toyota", model: "Corolla", trim: "SE", price: 22600, miles: 30000, dom: 78, dealerId: "d5", dealerName: "CrossTown Chevrolet", dealerCity: "Gilbert", dealerState: "AZ", floorPlanBurn: 0, hasArbitrage: false },
    { vin: "1N4BL4BV9KC123456", year: 2019, make: "Nissan", model: "Altima", trim: "SR", price: 19800, miles: 55000, dom: 145, dealerId: "d5", dealerName: "CrossTown Chevrolet", dealerCity: "Gilbert", dealerState: "AZ", floorPlanBurn: 0, hasArbitrage: true },
    { vin: "WDBTJ65J85F151105", year: 2005, make: "Mercedes-Benz", model: "CLK-Class", trim: "CLK320", price: 8900, miles: 125000, dom: 198, dealerId: "d6", dealerName: "Lone Star Toyota", dealerCity: "Phoenix", dealerState: "AZ", floorPlanBurn: 0, hasArbitrage: false },
    { vin: "5FNYF6H66KB007326", year: 2019, make: "Honda", model: "Pilot", trim: "Touring", price: 32400, miles: 47000, dom: 92, dealerId: "d6", dealerName: "Lone Star Toyota", dealerCity: "Phoenix", dealerState: "AZ", floorPlanBurn: 0, hasArbitrage: true },
    { vin: "SALWZ2SE7JA198231", year: 2018, make: "Land Rover", model: "Range Rover Sport", trim: "SVR", price: 52600, miles: 42000, dom: 155, dealerId: "d7", dealerName: "Heritage Chrysler", dealerCity: "Glendale", dealerState: "AZ", floorPlanBurn: 0, hasArbitrage: true },
    { vin: "KNAG64J75S5299133", year: 2025, make: "Kia", model: "K5", trim: "GT-Line", price: 28900, miles: 5000, dom: 68, dealerId: "d7", dealerName: "Heritage Chrysler", dealerCity: "Glendale", dealerState: "AZ", floorPlanBurn: 0, hasArbitrage: false },
  ];

  // Calculate floor plan burn for each vehicle
  for (const v of vehicles) {
    v.floorPlanBurn = calcFloorPlanBurn(v.price, v.dom);
  }

  // Group by dealer
  const dealerMap: Record<string, VehicleListing[]> = {};
  for (const v of vehicles) {
    if (!dealerMap[v.dealerId]) dealerMap[v.dealerId] = [];
    dealerMap[v.dealerId].push(v);
  }

  const dealerBurns = Object.values(dealerMap).map((vList) =>
    vList.reduce((s, v) => s + v.floorPlanBurn, 0)
  );
  const maxBurn = Math.max(...dealerBurns, 1);

  const dealers: DealerProspect[] = Object.entries(dealerMap).map(([dealerId, vList]) => {
    const first = vList[0];
    const avgDom = Math.round(vList.reduce((s, v) => s + v.dom, 0) / vList.length);
    const totalListedValue = vList.reduce((s, v) => s + v.price, 0);
    const totalFloorPlanBurn = vList.reduce((s, v) => s + v.floorPlanBurn, 0);
    return {
      dealerId,
      dealerName: first.dealerName,
      city: first.dealerCity,
      state: first.dealerState,
      agedUnitCount: vList.length,
      avgDom,
      totalListedValue,
      totalFloorPlanBurn,
      opportunityScore: calcOpportunityScore(avgDom, vList.length, totalFloorPlanBurn, maxBurn),
    };
  });

  dealers.sort((a, b) => b.opportunityScore - a.opportunityScore);

  const totalAgedListings = vehicles.length;
  const avgDom = Math.round(vehicles.reduce((s, v) => s + v.dom, 0) / totalAgedListings);
  const totalFloorPlanBurn = vehicles.reduce((s, v) => s + v.floorPlanBurn, 0);

  return {
    dealers,
    vehicles,
    summary: { totalAgedListings, totalDealers: dealers.length, avgDom, totalFloorPlanBurn },
  };
}

// ── Settings Bar ───────────────────────────────────────────────────────

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

// ── Responsive CSS ─────────────────────────────────────────────────────

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

// ── Formatting Helpers ─────────────────────────────────────────────────

function fmtDollar(n: number): string {
  if (n < 0) return "-$" + Math.abs(n).toLocaleString("en-US");
  return "$" + n.toLocaleString("en-US");
}

function fmtMiles(n: number): string {
  return n.toLocaleString("en-US") + " mi";
}

function scoreBadge(score: number): string {
  const color = score >= 70 ? { bg: "#166534", text: "#86efac" } : score >= 40 ? { bg: "#854d0e", text: "#fde68a" } : { bg: "#991b1b", text: "#fca5a5" };
  const label = score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW";
  return `<span style="display:inline-block;padding:3px 12px;border-radius:9999px;font-size:11px;font-weight:700;letter-spacing:0.5px;background:${color.bg};color:${color.text}">${label} (${score})</span>`;
}

function arbitrageBadge(): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;background:#1e3a5f;color:#93c5fd;border:1px solid #3b82f644;">ARBITRAGE</span>`;
}

// ── Canvas: Floor Plan Burn by Dealer ──────────────────────────────────

function drawBurnChart(canvas: HTMLCanvasElement, dealers: DealerProspect[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const padding = { top: 10, right: 16, bottom: 50, left: 60 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const sorted = [...dealers].sort((a, b) => b.totalFloorPlanBurn - a.totalFloorPlanBurn).slice(0, 10);
  const maxBurn = Math.max(...sorted.map((d) => d.totalFloorPlanBurn), 1);
  const barCount = sorted.length;
  if (barCount === 0) return;
  const barW = Math.min(50, (chartW - (barCount - 1) * 4) / barCount);
  const gap = 4;
  const totalBarsW = barCount * barW + (barCount - 1) * gap;
  const offsetX = padding.left + (chartW - totalBarsW) / 2;

  // Axes
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartH);
  ctx.lineTo(w - padding.right, padding.top + chartH);
  ctx.stroke();

  // Y labels
  ctx.fillStyle = "#64748b";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const val = Math.round((maxBurn / 4) * i);
    const y = padding.top + chartH - (val / maxBurn) * chartH;
    ctx.fillText("$" + val.toLocaleString(), padding.left - 6, y + 3);
    if (i > 0) {
      ctx.strokeStyle = "#1e293b";
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
    }
  }

  // Bars
  sorted.forEach((d, i) => {
    const x = offsetX + i * (barW + gap);
    const barH = (d.totalFloorPlanBurn / maxBurn) * chartH;
    const y = padding.top + chartH - barH;
    const color = d.opportunityScore >= 70 ? "#ef4444" : d.opportunityScore >= 40 ? "#eab308" : "#22c55e";
    ctx.fillStyle = color;
    ctx.fillRect(x, y, barW, barH);

    // Label
    ctx.fillStyle = "#94a3b8";
    ctx.font = "9px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.save();
    ctx.translate(x + barW / 2, padding.top + chartH + 8);
    ctx.rotate(Math.PI / 4);
    ctx.fillText(d.dealerName.substring(0, 12), 0, 0);
    ctx.restore();
  });
}

// ── Canvas: DOM Distribution ───────────────────────────────────────────

function drawDomHistogram(canvas: HTMLCanvasElement, vehicles: VehicleListing[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const padding = { top: 10, right: 16, bottom: 40, left: 40 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  // Buckets: 60-89, 90-119, 120-149, 150-179, 180+
  const buckets = [
    { label: "60-89d", min: 60, max: 89, count: 0, color: "#eab308" },
    { label: "90-119d", min: 90, max: 119, count: 0, color: "#f97316" },
    { label: "120-149d", min: 120, max: 149, count: 0, color: "#ef4444" },
    { label: "150-179d", min: 150, max: 179, count: 0, color: "#dc2626" },
    { label: "180+d", min: 180, max: 9999, count: 0, color: "#991b1b" },
  ];

  for (const v of vehicles) {
    for (const b of buckets) {
      if (v.dom >= b.min && v.dom <= b.max) { b.count++; break; }
    }
  }

  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const barW = Math.min(60, (chartW - (buckets.length - 1) * 8) / buckets.length);
  const gap = 8;
  const totalBarsW = buckets.length * barW + (buckets.length - 1) * gap;
  const offsetX = padding.left + (chartW - totalBarsW) / 2;

  // Axes
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartH);
  ctx.lineTo(w - padding.right, padding.top + chartH);
  ctx.stroke();

  // Y labels
  ctx.fillStyle = "#64748b";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const val = Math.round((maxCount / 4) * i);
    const y = padding.top + chartH - (val / maxCount) * chartH;
    ctx.fillText(String(val), padding.left - 6, y + 3);
  }

  // Bars
  buckets.forEach((b, i) => {
    const x = offsetX + i * (barW + gap);
    const barH = (b.count / maxCount) * chartH;
    const y = padding.top + chartH - barH;
    ctx.fillStyle = b.color;
    ctx.fillRect(x, y, barW, barH);

    // Count on top
    if (b.count > 0) {
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 11px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(b.count), x + barW / 2, y - 4);
    }

    // Label
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(b.label, x + barW / 2, padding.top + chartH + 16);
  });
}

// ── Render: Summary Cards ──────────────────────────────────────────────

function renderSummary(summary: ConsignmentData["summary"]): string {
  const cards = [
    { label: "Aged Listings", value: String(summary.totalAgedListings), color: "#93c5fd" },
    { label: "Dealers Found", value: String(summary.totalDealers), color: "#c4b5fd" },
    { label: "Avg DOM", value: summary.avgDom + " days", color: "#fde68a" },
    { label: "Total Floor Plan Burn", value: fmtDollar(summary.totalFloorPlanBurn), color: "#fca5a5" },
  ];

  return `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;">
    ${cards.map((c) => `
      <div style="background:#1e293b;border-radius:10px;border:1px solid #334155;padding:14px 12px;text-align:center;">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${c.label}</div>
        <div style="font-size:20px;font-weight:800;color:${c.color};">${c.value}</div>
      </div>
    `).join("")}
  </div>`;
}

// ── Render: Dealer Prospect Table ──────────────────────────────────────

function renderDealerTable(dealers: DealerProspect[]): string {
  const thStyle = `padding:10px 12px;text-align:left;font-weight:600;color:#94a3b8;border-bottom:2px solid #334155;font-size:11px;text-transform:uppercase;letter-spacing:0.5px`;
  const thRight = `${thStyle};text-align:right`;

  const headers = `<tr>
    <th style="${thStyle}">Dealer</th>
    <th style="${thStyle}">Location</th>
    <th style="${thRight}">Aged Units</th>
    <th style="${thRight}">Avg DOM</th>
    <th style="${thRight}">Total Value</th>
    <th style="${thRight}">Floor Plan Burn</th>
    <th style="${thStyle};text-align:center">Opportunity</th>
  </tr>`;

  let rows = "";
  for (const d of dealers) {
    const cellStyle = `padding:9px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:13px`;
    const cellRight = `${cellStyle};text-align:right`;
    const domColor = d.avgDom >= 120 ? "#fca5a5" : d.avgDom >= 90 ? "#fde68a" : "#e2e8f0";

    rows += `<tr>
      <td style="${cellStyle};font-weight:600;">${d.dealerName}</td>
      <td style="${cellStyle};color:#94a3b8;">${d.city}, ${d.state}</td>
      <td style="${cellRight};font-weight:700;">${d.agedUnitCount}</td>
      <td style="${cellRight};color:${domColor};font-weight:700;">${d.avgDom} days</td>
      <td style="${cellRight}">${fmtDollar(d.totalListedValue)}</td>
      <td style="${cellRight};color:#fca5a5;font-weight:700;">${fmtDollar(d.totalFloorPlanBurn)}</td>
      <td style="${cellStyle};text-align:center">${scoreBadge(d.opportunityScore)}</td>
    </tr>`;
  }

  return `
    <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden;margin-bottom:24px;">
      <div style="padding:14px 16px;border-bottom:1px solid #334155;">
        <h2 style="font-size:18px;font-weight:700;color:#e2e8f0;margin-bottom:2px;">Dealer Prospects</h2>
        <p style="font-size:12px;color:#64748b;">Dealers ranked by consignment opportunity score</p>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>${headers}</thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Render: Vehicle Detail Table ───────────────────────────────────────

function renderVehicleTable(vehicles: VehicleListing[]): string {
  const thStyle = `padding:10px 12px;text-align:left;font-weight:600;color:#94a3b8;border-bottom:2px solid #334155;font-size:11px;text-transform:uppercase;letter-spacing:0.5px`;
  const thRight = `${thStyle};text-align:right`;

  const headers = `<tr>
    <th style="${thStyle}">VIN</th>
    <th style="${thStyle}">Vehicle</th>
    <th style="${thStyle}">Dealer</th>
    <th style="${thRight}">Price</th>
    <th style="${thRight}">Miles</th>
    <th style="${thRight}">DOM</th>
    <th style="${thRight}">Floor Plan Burn</th>
    <th style="${thStyle};text-align:center">Arbitrage</th>
  </tr>`;

  // Sort by DOM descending
  const sorted = [...vehicles].sort((a, b) => b.dom - a.dom);

  let rows = "";
  for (const v of sorted) {
    const cellStyle = `padding:9px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:13px`;
    const cellRight = `${cellStyle};text-align:right`;
    const domColor = v.dom >= 120 ? "#fca5a5" : v.dom >= 90 ? "#fde68a" : "#e2e8f0";

    rows += `<tr>
      <td style="${cellStyle};font-family:monospace;font-size:11px;color:#94a3b8;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${v.vin}</td>
      <td style="${cellStyle};font-weight:600;">${v.year} ${v.make} ${v.model}${v.trim ? " " + v.trim : ""}</td>
      <td style="${cellStyle};color:#94a3b8;">${v.dealerName}</td>
      <td style="${cellRight}">${fmtDollar(v.price)}</td>
      <td style="${cellRight}">${fmtMiles(v.miles)}</td>
      <td style="${cellRight};color:${domColor};font-weight:700;">${v.dom}d</td>
      <td style="${cellRight};color:#fca5a5;font-weight:700;">${fmtDollar(v.floorPlanBurn)}</td>
      <td style="${cellStyle};text-align:center">${v.hasArbitrage ? arbitrageBadge() : ""}</td>
    </tr>`;
  }

  return `
    <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden;margin-bottom:24px;">
      <div style="padding:14px 16px;border-bottom:1px solid #334155;">
        <h2 style="font-size:18px;font-weight:700;color:#e2e8f0;margin-bottom:2px;">Aged Inventory Detail</h2>
        <p style="font-size:12px;color:#64748b;">Individual vehicles sorted by days on market — ARBITRAGE badges indicate local stale but in-demand elsewhere</p>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>${headers}</thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const root = document.createElement("div");
  root.id = "app-root";
  root.style.cssText = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:24px;";
  document.body.style.background = "#0f172a";
  document.body.style.margin = "0";
  document.body.appendChild(root);

  // ── Demo banner ──
  if (_detectAppMode() === "demo") {
    const _db = document.createElement("div");
    _db.id = "_demo_banner";
    _db.style.cssText = "background:linear-gradient(135deg,#92400e22,#f59e0b11);border:1px solid #f59e0b44;border-radius:10px;padding:14px 20px;margin-bottom:12px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;";
    _db.innerHTML = `
      <div style="flex:1;min-width:200px;">
        <div style="font-size:13px;font-weight:700;color:#fbbf24;margin-bottom:2px;">&#9888; Demo Mode — Showing sample data</div>
        <div style="font-size:12px;color:#d97706;">Enter your MarketCheck API key for real data. <a href="https://developers.marketcheck.com" target="_blank" style="color:#fbbf24;text-decoration:underline;">Get a free key</a></div>
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
    _db.querySelector("#_banner_key")!.addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Enter") (_db.querySelector("#_banner_save") as HTMLButtonElement).click(); });
  }

  const urlParams = _getUrlParams();

  function renderApp(data: ConsignmentData | null) {
    const zipValue = urlParams.zip ?? (_detectAppMode() === "demo" ? "85260" : "");
    const radiusValue = urlParams.radius ?? "75";
    const minDomValue = urlParams.minDom ?? "60";

    root.innerHTML = `
      <div style="max-width:1400px;margin:0 auto;">
        <!-- Header -->
        <div id="app-header" style="margin-bottom:24px;display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            <h1 style="font-size:26px;font-weight:800;color:#e2e8f0;margin-bottom:4px;">Consignment Sourcer</h1>
            <p style="font-size:13px;color:#64748b;">Find dealers with aged inventory ripe for consignment</p>
          </div>
        </div>

        <!-- Input Form -->
        <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;padding:20px;margin-bottom:24px;">
          <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;">
            <div>
              <label style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Target ZIP (required)</label>
              <input id="zip-input" type="text" placeholder="e.g. 85260" value="${zipValue}" style="padding:10px 12px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:8px;font-size:14px;outline:none;width:140px;" />
            </div>
            <div>
              <label style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Radius (miles)</label>
              <input id="radius-input" type="number" placeholder="75" value="${radiusValue}" style="padding:10px 12px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:8px;font-size:14px;outline:none;width:100px;" />
            </div>
            <div>
              <label style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Min DOM (days)</label>
              <input id="mindom-input" type="number" placeholder="60" value="${minDomValue}" style="padding:10px 12px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:8px;font-size:14px;outline:none;width:100px;" />
            </div>
            <button id="search-btn" style="background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:12px 24px;font-size:14px;font-weight:700;cursor:pointer;transition:background 0.15s;">Search Inventory</button>
            <div id="search-status" style="font-size:12px;color:#64748b;"></div>
          </div>
        </div>

        <!-- Results -->
        <div id="results-container">
          ${data ? renderResults(data) : '<div style="text-align:center;padding:60px 20px;color:#475569;">Enter a target ZIP code and click Search to find dealers with aged inventory.</div>'}
        </div>
      </div>`;

    _addSettingsBar(document.getElementById("app-header") as HTMLElement);

    // Wire search button
    const searchBtn = document.getElementById("search-btn") as HTMLButtonElement;
    const zipInput = document.getElementById("zip-input") as HTMLInputElement;
    const radiusInput = document.getElementById("radius-input") as HTMLInputElement;
    const minDomInput = document.getElementById("mindom-input") as HTMLInputElement;
    const status = document.getElementById("search-status") as HTMLElement;

    searchBtn.addEventListener("click", async () => {
      const zip = zipInput.value.trim();
      const radius = parseInt(radiusInput.value) || 75;
      const minDom = parseInt(minDomInput.value) || 60;

      if (!zip || zip.length < 5) {
        status.textContent = "Please enter a valid ZIP code.";
        status.style.color = "#fbbf24";
        return;
      }

      status.textContent = "Searching for aged inventory...";
      status.style.color = "#64748b";
      searchBtn.disabled = true;
      searchBtn.style.opacity = "0.6";

      let result: ConsignmentData;
      if (_detectAppMode() === "demo") {
        result = getMockData();
      } else {
        const liveResult = await _callTool({ zip, radius, minDom });
        result = liveResult ?? getMockData();
      }

      const savedZip = zipInput.value;
      const savedRadius = radiusInput.value;
      const savedMinDom = minDomInput.value;
      renderApp(result);
      (document.getElementById("zip-input") as HTMLInputElement).value = savedZip;
      (document.getElementById("radius-input") as HTMLInputElement).value = savedRadius;
      (document.getElementById("mindom-input") as HTMLInputElement).value = savedMinDom;
      drawCanvases(result);
    });
  }

  function drawCanvases(data: ConsignmentData) {
    requestAnimationFrame(() => {
      const burnCanvas = document.getElementById("burn-canvas") as HTMLCanvasElement;
      const domCanvas = document.getElementById("dom-canvas") as HTMLCanvasElement;
      if (burnCanvas) drawBurnChart(burnCanvas, data.dealers);
      if (domCanvas) drawDomHistogram(domCanvas, data.vehicles);
    });
  }

  function renderResults(data: ConsignmentData): string {
    return `
      ${renderSummary(data.summary)}

      <!-- Charts Row -->
      <div style="display:flex;gap:20px;margin-bottom:24px;flex-wrap:wrap;">
        <div style="flex:1;min-width:280px;background:#1e293b;border-radius:12px;border:1px solid #334155;padding:16px;">
          <h3 style="font-size:14px;font-weight:700;color:#e2e8f0;margin-bottom:12px;">DOM Distribution</h3>
          <canvas id="dom-canvas" style="width:100%;height:200px;"></canvas>
        </div>
        <div style="flex:1;min-width:280px;background:#1e293b;border-radius:12px;border:1px solid #334155;padding:16px;">
          <h3 style="font-size:14px;font-weight:700;color:#e2e8f0;margin-bottom:12px;">Floor Plan Burn by Dealer</h3>
          <canvas id="burn-canvas" style="width:100%;height:200px;"></canvas>
        </div>
      </div>

      ${renderDealerTable(data.dealers)}
      ${renderVehicleTable(data.vehicles)}
    `;
  }

  // Auto-search if URL params provided
  if (urlParams.zip) {
    const zip = urlParams.zip;
    const radius = parseInt(urlParams.radius ?? "75");
    const minDom = parseInt(urlParams.minDom ?? "60");

    root.innerHTML = `<div style="text-align:center;padding:80px 20px;">
      <div style="font-size:24px;font-weight:700;color:#e2e8f0;margin-bottom:12px;">Consignment Sourcer</div>
      <div style="color:#64748b;">Searching for aged inventory near ${zip}...</div>
    </div>`;

    const liveResult = await _callTool({ zip, radius, minDom });
    const data = liveResult ?? getMockData();
    renderApp(data);
    drawCanvases(data);
    return;
  }

  // Default: show empty form
  renderApp(null);
}

main();
