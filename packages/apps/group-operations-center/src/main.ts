import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "group-operations-center" }); } catch {}

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
  for (const key of ["vin", "zip", "make", "model", "miles", "state", "dealer_id", "dealer_ids", "ticker"]) {
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

// Parse "1071074:Specialty Cars,1037658,1015446:Metro" → [{id,name?}]
function _parseDealerSpec(raw: string): { id: string; name?: string }[] {
  return raw.split(",").map(s => s.trim()).filter(Boolean).map(piece => {
    const colon = piece.indexOf(":");
    if (colon > 0) return { id: piece.slice(0, colon).trim(), name: piece.slice(colon + 1).trim() };
    return { id: piece };
  });
}

async function _fetchDirect(args) {
  const spec: { id: string; name?: string }[] = args?.dealerSpec
    ?? (args?.dealerIds ? _parseDealerSpec(args.dealerIds) : []);
  if (spec.length === 0) return null;
  const results = await Promise.all(spec.map(async (s) => {
    try {
      const data = await _mcActive({
        dealer_id: s.id,
        rows: 25,
        stats: "price,miles,dom",
        facets: "make,body_type",
      });
      return { spec: s, data, error: null as any };
    } catch (e: any) {
      return { spec: s, data: null, error: String(e?.message ?? e) };
    }
  }));
  return { results };
}

async function _callTool(toolName, args) {
  // 1. MCP mode — only attempt when iframed into an MCP host. Calling
  //    callServerTool in a standalone browser tab returns a rejected promise
  //    which would bypass the direct-API path below.
  if (_safeApp && window.parent !== window) {
    try { const r = await _safeApp.callServerTool({ name: toolName, arguments: args }); if (r) return r; } catch {}
  }
  // 2. Direct API mode (browser → api.marketcheck.com)
  const auth = _getAuth();
  if (auth.value) {
    try {
      const data = await _fetchDirect(args);
      if (data) return { content: [{ type: "text", text: JSON.stringify(data) }] };
    } catch (e) { console.warn("Direct API failed, trying proxy:", e); }
    // 3. Proxy fallback
    try {
      const r = await fetch((_proxyBase()) + "/api/proxy/" + toolName, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, _auth_mode: auth.mode, _auth_value: auth.value }),
      });
      if (r.ok) { const d = await r.json(); return { content: [{ type: "text", text: JSON.stringify(d) }] }; }
    } catch {}
  }
  // 4. Demo mode (null → app uses mock data)
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

// ── Types ──────────────────────────────────────────────────────────────
interface Vehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  listedPrice: number;
  marketPrice: number;
  gapPct: number;
  miles: number;
  dom: number;
}

interface LocationData {
  id: string;
  name: string;
  totalUnits: number;
  agedPct: number;
  avgDom: number;
  floorPlanBurnPerDay: number;
  healthScore: number;
  inventory: Vehicle[];
  _meta?: {
    priceMean?: number;
    priceMedian?: number;
    ninetyPlusPct?: number;
    bodyTypeMix?: Array<{ item: string; count: number }>;
    topMakes?: Array<{ item: string; count: number }>;
    error?: string | null;
  };
}

interface Alert {
  severity: "red" | "yellow" | "green";
  message: string;
  location: string;
  timestamp: string;
}

interface TransferRecommendation {
  vinLast6: string;
  yearMakeModel: string;
  currentStore: string;
  currentDom: number;
  recommendedStore: string;
  expectedDomImprovement: number;
  transportCostEst: number;
  netBenefit: number;
}

interface GroupData {
  locations: LocationData[];
  alerts: Alert[];
  transfers: TransferRecommendation[];
  groupKpis: {
    totalInventory: number;
    totalAgedUnits: number;
    totalDailyFloorPlanBurn: number;
    locationsWithAlerts: number;
  };
}

// ── Mock Data ──────────────────────────────────────────────────────────
function generateMockData(): GroupData {
  const makes = ["Toyota", "Honda", "Ford", "Chevrolet", "BMW", "Hyundai", "Kia", "Nissan", "Jeep", "Ram"];
  const models: Record<string, string[]> = {
    Toyota: ["Camry", "RAV4", "Tacoma", "Corolla", "Highlander"],
    Honda: ["Civic", "CR-V", "Accord", "Pilot", "HR-V"],
    Ford: ["F-150", "Explorer", "Escape", "Bronco", "Mustang"],
    Chevrolet: ["Silverado", "Equinox", "Tahoe", "Malibu", "Blazer"],
    BMW: ["3 Series", "X3", "X5", "5 Series", "X1"],
    Hyundai: ["Tucson", "Elantra", "Santa Fe", "Palisade", "Kona"],
    Kia: ["Sportage", "Forte", "Telluride", "Sorento", "Seltos"],
    Nissan: ["Rogue", "Altima", "Pathfinder", "Sentra", "Frontier"],
    Jeep: ["Wrangler", "Grand Cherokee", "Cherokee", "Compass", "Gladiator"],
    Ram: ["1500", "2500", "ProMaster", "1500 Classic", "3500"],
  };
  const trims = ["SE", "LE", "XLE", "Limited", "Sport", "LX", "EX", "Touring", "SXT", "Latitude"];

  function genInventory(count: number, domBias: number, domSpread: number): Vehicle[] {
    const inv: Vehicle[] = [];
    for (let i = 0; i < count; i++) {
      const make = makes[Math.floor(Math.random() * makes.length)];
      const modelList = models[make];
      const model = modelList[Math.floor(Math.random() * modelList.length)];
      const trim = trims[Math.floor(Math.random() * trims.length)];
      const year = 2020 + Math.floor(Math.random() * 5);
      const miles = 5000 + Math.floor(Math.random() * 65000);
      const dom = Math.max(1, Math.round(domBias + (Math.random() - 0.5) * domSpread));
      const marketPrice = 20000 + Math.floor(Math.random() * 35000);
      const gapPctRaw = -12 + Math.random() * 24;
      const listedPrice = Math.round(marketPrice * (1 + gapPctRaw / 100));
      const gapPct = ((listedPrice - marketPrice) / marketPrice) * 100;
      const vin = `1HGCV${String(1000 + i).slice(-4)}${String(Math.floor(Math.random() * 900000) + 100000)}`;
      inv.push({ vin, year, make, model, trim, listedPrice, marketPrice, gapPct, miles, dom });
    }
    return inv;
  }

  // 5 locations with different health profiles
  const mainStreetInv = genInventory(48, 25, 20);
  const highwayInv = genInventory(62, 42, 35);
  const downtownInv = genInventory(35, 65, 40);
  const suburbanInv = genInventory(55, 22, 18);
  const metroInv = genInventory(41, 38, 30);

  function calcLocation(id: string, name: string, inventory: Vehicle[]): LocationData {
    const totalUnits = inventory.length;
    const agedCount = inventory.filter(v => v.dom > 60).length;
    const agedPct = Math.round((agedCount / totalUnits) * 100);
    const avgDom = Math.round(inventory.reduce((s, v) => s + v.dom, 0) / totalUnits);
    const floorPlanBurnPerDay = agedCount * 35;
    // Health score: weighted blend of aging %, avg DOM, pricing alignment
    const domPenalty = Math.min(40, avgDom * 0.6);
    const agingPenalty = Math.min(35, agedPct * 1.4);
    const overpricedPct = inventory.filter(v => v.gapPct > 5).length / totalUnits;
    const pricePenalty = Math.min(25, overpricedPct * 50);
    const healthScore = Math.max(0, Math.min(100, Math.round(100 - domPenalty - agingPenalty - pricePenalty)));
    return { id, name, totalUnits, agedPct, avgDom, floorPlanBurnPerDay, healthScore, inventory };
  }

  const locations: LocationData[] = [
    calcLocation("main-street", "Main Street Motors", mainStreetInv),
    calcLocation("highway", "Highway Auto", highwayInv),
    calcLocation("downtown", "Downtown Dealer", downtownInv),
    calcLocation("suburban", "Suburban Cars", suburbanInv),
    calcLocation("metro", "Metro Motors", metroInv),
  ];

  // Alerts (10 realistic alerts)
  const now = new Date();
  function timeAgo(minutes: number): string {
    const d = new Date(now.getTime() - minutes * 60000);
    const h = d.getHours();
    const m = d.getMinutes();
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  }

  const alerts: Alert[] = [
    { severity: "red", message: "Unit 90+ days: 2024 Ford F-150 (112 DOM)", location: "Downtown Dealer", timestamp: timeAgo(3) },
    { severity: "red", message: "Unit 90+ days: 2022 BMW X5 (98 DOM)", location: "Downtown Dealer", timestamp: timeAgo(8) },
    { severity: "red", message: "Competitor undercut $2.4K on 2024 Toyota RAV4", location: "Highway Auto", timestamp: timeAgo(15) },
    { severity: "red", message: "Unit 90+ days: 2023 Chevrolet Tahoe (95 DOM)", location: "Highway Auto", timestamp: timeAgo(22) },
    { severity: "yellow", message: "5 units approaching 60-day mark", location: "Metro Motors", timestamp: timeAgo(35) },
    { severity: "yellow", message: "3 units approaching 60-day mark", location: "Highway Auto", timestamp: timeAgo(48) },
    { severity: "yellow", message: "Competitor undercut $1.8K on 2024 Honda CR-V", location: "Main Street Motors", timestamp: timeAgo(62) },
    { severity: "green", message: "3 new arrivals received and processed", location: "Suburban Cars", timestamp: timeAgo(75) },
    { severity: "green", message: "2 units sold under 15 DOM", location: "Main Street Motors", timestamp: timeAgo(90) },
    { severity: "green", message: "4 new arrivals received and processed", location: "Metro Motors", timestamp: timeAgo(120) },
  ];

  // Transfer recommendations
  const transfers: TransferRecommendation[] = [
    { vinLast6: "A7F293", yearMakeModel: "2024 Ford F-150 XLT", currentStore: "Downtown Dealer", currentDom: 112, recommendedStore: "Suburban Cars", expectedDomImprovement: 65, transportCostEst: 350, netBenefit: 2800 },
    { vinLast6: "B3K841", yearMakeModel: "2023 Toyota RAV4 LE", currentStore: "Highway Auto", currentDom: 78, recommendedStore: "Main Street Motors", expectedDomImprovement: 40, transportCostEst: 275, netBenefit: 2100 },
    { vinLast6: "C9M512", yearMakeModel: "2022 BMW X5 Sport", currentStore: "Downtown Dealer", currentDom: 98, recommendedStore: "Metro Motors", expectedDomImprovement: 55, transportCostEst: 425, netBenefit: 1950 },
    { vinLast6: "D2R678", yearMakeModel: "2024 Honda CR-V EX", currentStore: "Highway Auto", currentDom: 65, recommendedStore: "Suburban Cars", expectedDomImprovement: 35, transportCostEst: 300, netBenefit: 1650 },
    { vinLast6: "E5T934", yearMakeModel: "2023 Chevy Tahoe LT", currentStore: "Downtown Dealer", currentDom: 95, recommendedStore: "Highway Auto", expectedDomImprovement: 45, transportCostEst: 200, netBenefit: 1400 },
    { vinLast6: "F8W156", yearMakeModel: "2024 Jeep Wrangler", currentStore: "Metro Motors", currentDom: 58, recommendedStore: "Main Street Motors", expectedDomImprovement: 25, transportCostEst: 375, netBenefit: 1100 },
    { vinLast6: "G1Y389", yearMakeModel: "2023 Kia Telluride", currentStore: "Highway Auto", currentDom: 72, recommendedStore: "Suburban Cars", expectedDomImprovement: 38, transportCostEst: 300, netBenefit: 950 },
  ];

  // Group KPIs
  const totalInventory = locations.reduce((s, l) => s + l.totalUnits, 0);
  const totalAgedUnits = locations.reduce((s, l) => s + Math.round(l.totalUnits * l.agedPct / 100), 0);
  const totalDailyFloorPlanBurn = locations.reduce((s, l) => s + l.floorPlanBurnPerDay, 0);
  const locationsWithAlerts = new Set(alerts.filter(a => a.severity === "red").map(a => a.location)).size;

  return {
    locations,
    alerts,
    transfers,
    groupKpis: { totalInventory, totalAgedUnits, totalDailyFloorPlanBurn, locationsWithAlerts },
  };
}

// ── Formatters ─────────────────────────────────────────────────────────
function fmtCurrency(v: number): string {
  return "$" + Math.round(v).toLocaleString();
}
function fmtPct(v: number): string {
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}
function fmtNum(v: number): string {
  return Math.round(v).toLocaleString();
}

// ── Live → GroupData Parser ────────────────────────────────────────────
// Converts the raw _fetchDirect output into the GroupData shape the UI consumes.
// Per-vehicle listings may be unavailable on lower API tiers (only stats come
// back); when that happens we still populate cards/KPIs/alerts from stats and
// leave the inventory table empty.
function parseLiveGroupData(raw: any): GroupData {
  const rows = (raw?.results ?? []) as Array<{ spec: { id: string; name?: string }; data: any; error?: string }>;

  const locations: LocationData[] = rows.map((r) => {
    const data = r.data ?? {};
    const stats = data.stats ?? {};
    const priceStats = stats.price ?? {};
    const domStats = stats.dom ?? {};
    const totalUnits = Number(data.num_found ?? 0);

    // Derive aged share from the DOM percentile distribution.
    const pct = domStats.percentiles ?? {};
    const agedPct = estimateAgedPctFromPercentiles(pct, 60);
    const ninetyPlusPct = estimateAgedPctFromPercentiles(pct, 90);
    const avgDom = Math.round((domStats.mean ?? domStats.median ?? 0) as number);

    // Floor plan burn proxy: aged units × avg daily carry cost ($35).
    const agedCount = Math.round((agedPct / 100) * totalUnits);
    const floorPlanBurnPerDay = agedCount * 35;

    // Health score: lower is worse. Penalty caps keep the score useful even
    // for severely aged groups so different dealers still differentiate
    // (raw real-world inventories often saturate the more aggressive mock
    // formula, leaving every dealer at 0).
    const domPenalty = Math.min(35, avgDom * 0.4);
    const agingPenalty = Math.min(30, agedPct * 1.0);
    const ninetyPenalty = Math.min(20, ninetyPlusPct * 1.2);
    const healthScore = Math.max(0, Math.min(100, Math.round(100 - domPenalty - agingPenalty - ninetyPenalty)));

    // If listings came back, surface them in the detail table; otherwise empty.
    const inventory: Vehicle[] = (data.listings ?? []).map((l: any) => ({
      vin: String(l.vin ?? ""),
      year: Number(l?.build?.year ?? l?.year ?? 0),
      make: String(l?.build?.make ?? l?.make ?? ""),
      model: String(l?.build?.model ?? l?.model ?? ""),
      trim: String(l?.build?.trim ?? l?.trim ?? ""),
      listedPrice: Number(l.price ?? 0),
      marketPrice: Number(l.ref_price ?? l.price ?? 0),
      gapPct: l.ref_price && l.price ? ((l.price - l.ref_price) / l.ref_price) * 100 : 0,
      miles: Number(l.miles ?? 0),
      dom: Number(l.dom ?? l.days_on_market ?? 0),
    }));

    const displayName = r.spec.name ?? (data.listings?.[0]?.dealer?.name) ?? `Dealer #${r.spec.id}`;

    return {
      id: r.spec.id,
      name: displayName,
      totalUnits,
      agedPct: Math.round(agedPct),
      avgDom,
      floorPlanBurnPerDay,
      healthScore,
      inventory,
      // attach extra live-only context via a side map below
      _meta: {
        priceMean: Math.round((priceStats.mean ?? 0) as number),
        priceMedian: Math.round((priceStats.median ?? 0) as number),
        ninetyPlusPct: Math.round(ninetyPlusPct),
        bodyTypeMix: (data.facets?.body_type ?? []).slice(0, 6),
        topMakes: (data.facets?.make ?? []).slice(0, 6),
        error: r.error ?? null,
      },
    } as LocationData & { _meta: any };
  });

  // Generate alerts from real stats. We surface DOM and aging signals as
  // red/yellow/green so the alert feed stays useful in live mode.
  const now = new Date();
  const stamp = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const alerts: Alert[] = [];
  for (const loc of locations) {
    const meta = (loc as any)._meta ?? {};
    if (meta.error) {
      alerts.push({ severity: "red", message: `API error: ${meta.error}`, location: loc.name, timestamp: stamp });
      continue;
    }
    if (loc.totalUnits === 0) {
      alerts.push({ severity: "yellow", message: "No active inventory found for this dealer ID", location: loc.name, timestamp: stamp });
      continue;
    }
    if (meta.ninetyPlusPct >= 15) {
      alerts.push({ severity: "red", message: `${meta.ninetyPlusPct}% of inventory has 90+ DOM`, location: loc.name, timestamp: stamp });
    }
    if (loc.avgDom > 90) {
      alerts.push({ severity: "red", message: `Average DOM is ${loc.avgDom} days — well above healthy benchmark`, location: loc.name, timestamp: stamp });
    } else if (loc.avgDom > 60) {
      alerts.push({ severity: "yellow", message: `Average DOM is ${loc.avgDom} days — approaching stale threshold`, location: loc.name, timestamp: stamp });
    }
    if (loc.agedPct >= 35) {
      alerts.push({ severity: "red", message: `${loc.agedPct}% of inventory aged (>60 DOM)`, location: loc.name, timestamp: stamp });
    } else if (loc.agedPct >= 20) {
      alerts.push({ severity: "yellow", message: `${loc.agedPct}% of inventory aged — monitor pricing`, location: loc.name, timestamp: stamp });
    }
    if (loc.avgDom <= 30 && loc.agedPct < 10) {
      alerts.push({ severity: "green", message: `Healthy turn — avg DOM ${loc.avgDom}d, only ${loc.agedPct}% aged`, location: loc.name, timestamp: stamp });
    }
  }

  // Build pragmatic transfer recommendations: pair each high-aged location
  // with the lowest-aged location in the group. Net benefit is a coarse
  // estimate of avoided floor plan carry over the DOM improvement window.
  const transfers: TransferRecommendation[] = [];
  if (locations.length >= 2) {
    const sortedByAged = [...locations].sort((a, b) => b.agedPct - a.agedPct);
    const healthiest = sortedByAged[sortedByAged.length - 1];
    for (const src of sortedByAged) {
      if (src.id === healthiest.id) continue;
      if (src.agedPct < 15) continue;
      const movableUnits = Math.max(1, Math.round(src.totalUnits * (src.agedPct - healthiest.agedPct) / 200));
      if (movableUnits < 1) continue;
      const domImprovement = Math.max(10, Math.round(src.avgDom - healthiest.avgDom));
      const transportCost = 250 + movableUnits * 50;
      const netBenefit = Math.max(100, movableUnits * domImprovement * 35 - transportCost);
      transfers.push({
        vinLast6: `${movableUnits}-unit lot`,
        yearMakeModel: `Aged stock (${movableUnits} units, avg ${src.avgDom}d DOM)`,
        currentStore: src.name,
        currentDom: src.avgDom,
        recommendedStore: healthiest.name,
        expectedDomImprovement: domImprovement,
        transportCostEst: transportCost,
        netBenefit,
      });
    }
  }

  // Group rollups
  const totalInventory = locations.reduce((s, l) => s + l.totalUnits, 0);
  const totalAgedUnits = locations.reduce((s, l) => s + Math.round(l.totalUnits * l.agedPct / 100), 0);
  const totalDailyFloorPlanBurn = locations.reduce((s, l) => s + l.floorPlanBurnPerDay, 0);
  const locationsWithAlerts = new Set(alerts.filter(a => a.severity === "red").map(a => a.location)).size;

  return {
    locations,
    alerts,
    transfers,
    groupKpis: { totalInventory, totalAgedUnits, totalDailyFloorPlanBurn, locationsWithAlerts },
  };
}

// Linear interpolation against the API's percentile object to estimate the
// share of inventory above a DOM threshold (returns 0–100).
function estimateAgedPctFromPercentiles(percentiles: Record<string, number>, threshold: number): number {
  const points: Array<[number, number]> = [];
  for (const [k, v] of Object.entries(percentiles ?? {})) {
    const p = Number(k);
    const dom = Number(v);
    if (Number.isFinite(p) && Number.isFinite(dom)) points.push([p, dom]);
  }
  if (points.length === 0) return 0;
  points.sort((a, b) => a[0] - b[0]);
  // If threshold is below the 5th percentile, ~100% are above it.
  if (threshold <= points[0][1]) return Math.max(0, 100 - points[0][0]);
  // If threshold is above the 99th percentile, ~0% are above it.
  if (threshold >= points[points.length - 1][1]) return Math.max(0, 100 - points[points.length - 1][0]);
  for (let i = 0; i < points.length - 1; i++) {
    const [p1, d1] = points[i];
    const [p2, d2] = points[i + 1];
    if (threshold >= d1 && threshold <= d2) {
      const frac = d2 === d1 ? 0 : (threshold - d1) / (d2 - d1);
      const pAt = p1 + frac * (p2 - p1);
      return Math.max(0, Math.min(100, 100 - pAt));
    }
  }
  return 0;
}

// ── State ──────────────────────────────────────────────────────────────
let currentView: "group" | "location" = "group";
let selectedLocationId: string | null = null;
let locationSortColumn = 0;
let locationSortAsc = true;

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  document.body.style.cssText =
    "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;overflow-x:hidden;";

  const mode = _detectAppMode();
  const urlParams = _getUrlParams();
  const dealerSpecRaw = urlParams.dealer_ids ?? urlParams.dealer_id ?? "";

  if (mode === "live" && !dealerSpecRaw) {
    renderInputForm();
    return;
  }

  if (mode === "live" && dealerSpecRaw) {
    await loadAndRender(dealerSpecRaw);
    return;
  }

  // Demo + MCP modes load mock data immediately so the UI is never blank.
  renderApp(generateMockData());
}

async function loadAndRender(dealerSpecRaw: string) {
  document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#94a3b8;">
    <div style="width:20px;height:20px;border:2px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:12px;"></div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    Fetching inventory for ${dealerSpecRaw.split(",").length} location(s)...
  </div>`;

  let data: GroupData;
  try {
    const dealerSpec = _parseDealerSpec(dealerSpecRaw);
    const result = await _callTool("group-operations-center", { dealerIds: dealerSpecRaw, dealerSpec });
    const text = result?.content?.find((c: any) => c.type === "text")?.text;
    if (text) {
      const raw = JSON.parse(text);
      // If MCP/proxy already returned a GroupData, use it; otherwise parse our raw shape.
      data = raw?.locations && raw?.alerts ? (raw as GroupData) : parseLiveGroupData(raw);
    } else {
      data = generateMockData();
    }
  } catch (e) {
    console.warn("Live fetch failed, falling back to demo data:", e);
    data = generateMockData();
  }

  if (data.locations.length === 0) {
    renderInputForm("No locations resolved from the dealer IDs you provided. Check the IDs and try again.");
    return;
  }
  renderApp(data);
}

function renderInputForm(errorMsg?: string) {
  document.body.innerHTML = "";
  injectGlobalStyles();

  const header = el("div", {
    style: "background:#1e293b;padding:12px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:12px;",
  });
  header.innerHTML = `
    <div style="width:8px;height:8px;border-radius:50%;background:#10b981;flex-shrink:0;"></div>
    <h1 style="margin:0;font-size:16px;font-weight:600;color:#f8fafc;">Group Operations Center</h1>
    <span style="font-size:12px;color:#64748b;margin-left:auto;">Multi-store dashboard</span>
  `;
  _addSettingsBar(header);
  document.body.appendChild(header);

  const wrap = el("div", { style: "max-width:720px;margin:48px auto;padding:0 20px;" });
  wrap.innerHTML = `
    <h2 style="font-size:20px;font-weight:700;color:#f8fafc;margin:0 0 8px 0;">Connect your locations</h2>
    <p style="font-size:13px;color:#94a3b8;margin:0 0 20px 0;line-height:1.6;">
      Enter the MarketCheck <code style="font-family:monospace;background:#1e293b;padding:2px 6px;border-radius:4px;color:#e2e8f0;">dealer_id</code> for each rooftop in your group, separated by commas. Optionally add a display name after a colon.
    </p>
    ${errorMsg ? `<div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:10px 14px;margin-bottom:16px;color:#fca5a5;font-size:13px;">${errorMsg}</div>` : ""}
    <div style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;">
      <label style="display:block;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Dealer IDs</label>
      <input id="_dealer_ids_input" type="text" placeholder="e.g. 1071074:Specialty Cars, 1037658, 1015446:Metro"
        style="width:100%;padding:10px 12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;font-family:inherit;box-sizing:border-box;outline:none;" />
      <div style="font-size:11px;color:#64748b;margin-top:6px;">Find a dealer's ID in the MarketCheck API response or by searching <a href="https://apidocs.marketcheck.com" target="_blank" style="color:#60a5fa;">api docs</a>.</div>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
        <button id="_dealer_ids_submit" style="padding:10px 20px;border-radius:6px;border:none;background:#3b82f6;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Analyze Group</button>
        <button id="_dealer_ids_demo" style="padding:10px 20px;border-radius:6px;border:1px solid #334155;background:transparent;color:#94a3b8;font-size:13px;font-weight:500;cursor:pointer;">View Demo Data Instead</button>
      </div>
    </div>
    <div style="margin-top:20px;background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px;font-size:12px;color:#94a3b8;line-height:1.6;">
      <div style="font-weight:600;color:#e2e8f0;margin-bottom:6px;">What you'll see</div>
      Per-rooftop health cards (units, avg DOM, aged %, health score), group-wide rollups, alert feed driven by real DOM/aging stats, and transfer suggestions to rebalance the group. Inputs and view state are URL-shareable: append <code style="font-family:monospace;color:#cbd5e1;">?dealer_ids=...</code> to deep-link.
    </div>
  `;
  document.body.appendChild(wrap);

  const submit = () => {
    const v = (document.getElementById("_dealer_ids_input") as HTMLInputElement).value.trim();
    if (!v) return;
    const url = new URL(location.href);
    url.searchParams.set("dealer_ids", v);
    history.replaceState(null, "", url.toString());
    loadAndRender(v);
  };
  document.getElementById("_dealer_ids_submit")?.addEventListener("click", submit);
  document.getElementById("_dealer_ids_input")?.addEventListener("keydown", (e: any) => { if (e.key === "Enter") submit(); });
  document.getElementById("_dealer_ids_demo")?.addEventListener("click", () => renderApp(generateMockData()));
}

// ── Render Router ──────────────────────────────────────────────────────
function renderApp(data: GroupData) {
  if (currentView === "location" && selectedLocationId) {
    renderLocationDetail(data);
  } else {
    renderGroupDashboard(data);
  }
}

// ── Group Dashboard ────────────────────────────────────────────────────
function renderGroupDashboard(data: GroupData) {
  document.body.innerHTML = "";
  injectGlobalStyles();

  // Header
  const header = el("div", {
    style: "background:#1e293b;padding:12px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:12px;",
  });
  header.innerHTML = `
    <div style="width:8px;height:8px;border-radius:50%;background:#10b981;flex-shrink:0;"></div>
    <h1 style="margin:0;font-size:16px;font-weight:600;color:#f8fafc;">Group Operations Center</h1>
    <span style="font-size:12px;color:#64748b;margin-left:auto;">${data.locations.length} locations | ${fmtNum(data.groupKpis.totalInventory)} total units | Updated just now</span>
  `;
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

  const content = el("div", { style: "padding:16px 20px;" });
  document.body.appendChild(content);

  // ── Location Health Cards (top row, horizontal scroll) ──────────────
  const cardSection = el("div", { style: "margin-bottom:16px;" });
  const cardSectionLabel = el("div", {
    style: "font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;font-weight:600;",
  });
  cardSectionLabel.textContent = "Location Health";
  cardSection.appendChild(cardSectionLabel);

  const cardRow = el("div", {
    style: "display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;",
  });

  for (const loc of data.locations) {
    const agedColor = loc.agedPct < 15 ? "#10b981" : loc.agedPct <= 25 ? "#f59e0b" : "#ef4444";
    const scoreColor = loc.healthScore >= 70 ? "#10b981" : loc.healthScore >= 45 ? "#f59e0b" : "#ef4444";

    const card = el("div", {
      style: "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px;min-width:210px;flex:1;cursor:pointer;transition:border-color 0.15s,transform 0.15s;position:relative;",
    });

    // Circular progress indicator for health score
    const circumference = 2 * Math.PI * 28;
    const strokeOffset = circumference - (loc.healthScore / 100) * circumference;

    card.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:700;color:#f8fafc;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${loc.name}</div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <div style="font-size:12px;color:#94a3b8;">Units: <span style="color:#e2e8f0;font-weight:600;">${loc.totalUnits}</span></div>
            <div style="font-size:12px;color:#94a3b8;">Aged: <span style="color:${agedColor};font-weight:600;">${loc.agedPct}%</span></div>
            <div style="font-size:12px;color:#94a3b8;">Avg DOM: <span style="color:#e2e8f0;font-weight:600;">${loc.avgDom}d</span></div>
            <div style="font-size:12px;color:#94a3b8;">Burn: <span style="color:#f97316;font-weight:600;">${fmtCurrency(loc.floorPlanBurnPerDay)}/d</span></div>
          </div>
        </div>
        <div style="flex-shrink:0;position:relative;width:64px;height:64px;">
          <svg width="64" height="64" viewBox="0 0 64 64" style="transform:rotate(-90deg);">
            <circle cx="32" cy="32" r="28" fill="none" stroke="#334155" stroke-width="4" />
            <circle cx="32" cy="32" r="28" fill="none" stroke="${scoreColor}" stroke-width="4"
              stroke-dasharray="${circumference}" stroke-dashoffset="${strokeOffset}"
              stroke-linecap="round" />
          </svg>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;">
            <span style="font-size:16px;font-weight:700;color:${scoreColor};line-height:1;">${loc.healthScore}</span>
          </div>
        </div>
      </div>
      <div style="margin-top:10px;font-size:11px;color:#64748b;text-align:center;">Click to view details</div>
    `;

    card.addEventListener("mouseenter", () => {
      card.style.borderColor = "#3b82f6";
      card.style.transform = "translateY(-2px)";
    });
    card.addEventListener("mouseleave", () => {
      card.style.borderColor = "#334155";
      card.style.transform = "translateY(0)";
    });
    card.addEventListener("click", () => {
      currentView = "location";
      selectedLocationId = loc.id;
      renderApp(data);
    });

    cardRow.appendChild(card);
  }
  cardSection.appendChild(cardRow);
  content.appendChild(cardSection);

  // ── Group KPI Ribbon ────────────────────────────────────────────────
  const kpiRibbon = el("div", {
    style: "display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;",
  });

  const kpis = data.groupKpis;
  const kpiCards = [
    { label: "Total Inventory", value: fmtNum(kpis.totalInventory), sub: `across ${data.locations.length} locations`, color: "#94a3b8" },
    { label: "Total Aged Units", value: fmtNum(kpis.totalAgedUnits), sub: `${Math.round((kpis.totalAgedUnits / kpis.totalInventory) * 100)}% of group inventory`, color: kpis.totalAgedUnits > 30 ? "#ef4444" : "#f59e0b" },
    { label: "Total Daily Floor Plan Burn", value: `${fmtCurrency(kpis.totalDailyFloorPlanBurn)}/day`, sub: `${fmtCurrency(kpis.totalDailyFloorPlanBurn * 30)}/mo projected`, color: "#f97316" },
    { label: "Locations with Alerts", value: String(kpis.locationsWithAlerts), sub: kpis.locationsWithAlerts > 2 ? "attention needed" : "manageable", color: kpis.locationsWithAlerts > 2 ? "#ef4444" : "#f59e0b" },
  ];

  for (const k of kpiCards) {
    const card = el("div", {
      style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px 16px;flex:1;min-width:180px;",
    });
    card.innerHTML = `
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">${k.label}</div>
      <div style="font-size:22px;font-weight:700;color:#f8fafc;margin-top:4px;">${k.value}</div>
      <div style="font-size:12px;color:${k.color};margin-top:2px;">${k.sub}</div>
    `;
    kpiRibbon.appendChild(card);
  }
  content.appendChild(kpiRibbon);

  // ── Bottom Section: Alerts (left 40%) + Transfers (right) ───────────
  const bottomRow = el("div", {
    style: "display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;",
  });
  content.appendChild(bottomRow);

  // ── Alert Feed ──────────────────────────────────────────────────────
  const alertPanel = el("div", {
    style: "flex:2;min-width:320px;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;max-height:420px;display:flex;flex-direction:column;",
  });
  alertPanel.innerHTML = `<h3 style="font-size:13px;font-weight:600;color:#f8fafc;margin:0 0 12px 0;">Alert Feed</h3>`;

  const alertList = el("div", {
    style: "flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;",
  });

  const severityConfig = {
    red: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)", icon: "\u26A0", iconColor: "#ef4444" },
    yellow: { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)", icon: "\u25B2", iconColor: "#f59e0b" },
    green: { bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.25)", icon: "\u2713", iconColor: "#10b981" },
  };

  for (const alert of data.alerts) {
    const cfg = severityConfig[alert.severity];
    const alertItem = el("div", {
      style: `background:${cfg.bg};border:1px solid ${cfg.border};border-radius:6px;padding:10px 12px;display:flex;align-items:flex-start;gap:10px;`,
    });
    alertItem.innerHTML = `
      <span style="font-size:16px;color:${cfg.iconColor};flex-shrink:0;line-height:1;margin-top:1px;">${cfg.icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;color:#e2e8f0;line-height:1.4;">${alert.message}</div>
        <div style="display:flex;gap:12px;margin-top:4px;">
          <span style="font-size:11px;color:#64748b;">${alert.location}</span>
          <span style="font-size:11px;color:#475569;">${alert.timestamp}</span>
        </div>
      </div>
    `;
    alertList.appendChild(alertItem);
  }
  alertPanel.appendChild(alertList);
  bottomRow.appendChild(alertPanel);

  // ── Cross-Location Transfer Panel ───────────────────────────────────
  const transferPanel = el("div", {
    style: "flex:3;min-width:420px;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;max-height:420px;display:flex;flex-direction:column;",
  });
  transferPanel.innerHTML = `<h3 style="font-size:13px;font-weight:600;color:#f8fafc;margin:0 0 12px 0;">Cross-Location Transfer Recommendations</h3>`;

  const transferWrapper = el("div", {
    style: "flex:1;overflow:auto;",
  });

  const transferTable = el("table", {
    style: "width:100%;border-collapse:collapse;font-size:12px;",
  });

  const tHeaders = ["VIN", "Year/Make/Model", "Current Store", "DOM", "\u2192 Recommended", "DOM Improv.", "Transport", "Net Benefit"];
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const h of tHeaders) {
    const th = document.createElement("th");
    th.style.cssText =
      "padding:7px 8px;text-align:left;background:#1e293b;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;position:sticky;top:0;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;z-index:1;";
    th.textContent = h;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  transferTable.appendChild(thead);

  const transferBody = document.createElement("tbody");

  // Sort transfers by net benefit descending
  const sortedTransfers = [...data.transfers].sort((a, b) => b.netBenefit - a.netBenefit);
  const maxBenefit = sortedTransfers.length > 0 ? sortedTransfers[0].netBenefit : 1;

  for (const t of sortedTransfers) {
    const tr = document.createElement("tr");
    tr.style.cssText = "border-bottom:1px solid #1e293b44;";
    tr.addEventListener("mouseenter", () => { tr.style.background = "#0f172a"; });
    tr.addEventListener("mouseleave", () => { tr.style.background = ""; });

    // Color intensity by net benefit
    const benefitIntensity = t.netBenefit / maxBenefit;
    let benefitColor: string;
    if (benefitIntensity > 0.7) benefitColor = "#10b981";
    else if (benefitIntensity > 0.4) benefitColor = "#34d399";
    else benefitColor = "#6ee7b7";

    tr.innerHTML = `
      <td style="padding:7px 8px;color:#94a3b8;font-family:monospace;font-size:11px;">${t.vinLast6}</td>
      <td style="padding:7px 8px;color:#e2e8f0;font-weight:500;white-space:nowrap;">${t.yearMakeModel}</td>
      <td style="padding:7px 8px;color:#e2e8f0;white-space:nowrap;">${t.currentStore}</td>
      <td style="padding:7px 8px;"><span style="color:${t.currentDom > 90 ? "#ef4444" : t.currentDom > 60 ? "#f59e0b" : "#e2e8f0"};font-weight:600;">${t.currentDom}d</span></td>
      <td style="padding:7px 8px;color:#60a5fa;white-space:nowrap;">${t.recommendedStore}</td>
      <td style="padding:7px 8px;color:#10b981;font-weight:600;">-${t.expectedDomImprovement}d</td>
      <td style="padding:7px 8px;color:#f97316;">${fmtCurrency(t.transportCostEst)}</td>
      <td style="padding:7px 8px;"><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:rgba(16,185,129,0.15);color:${benefitColor};border:1px solid rgba(16,185,129,0.2);">${fmtCurrency(t.netBenefit)}</span></td>
    `;
    transferBody.appendChild(tr);
  }
  transferTable.appendChild(transferBody);
  transferWrapper.appendChild(transferTable);
  transferPanel.appendChild(transferWrapper);
  bottomRow.appendChild(transferPanel);
}

// ── Location Detail View ───────────────────────────────────────────────
function renderLocationDetail(data: GroupData) {
  const loc = data.locations.find(l => l.id === selectedLocationId);
  if (!loc) { currentView = "group"; renderApp(data); return; }

  document.body.innerHTML = "";
  injectGlobalStyles();

  // Header with back button
  const header = el("div", {
    style: "background:#1e293b;padding:12px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:12px;",
  });

  const backBtn = el("button", {
    style: "padding:6px 14px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#60a5fa;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:background 0.15s;",
  });
  backBtn.textContent = "\u2190 Back to Group";
  backBtn.addEventListener("mouseenter", () => { backBtn.style.background = "#1e293b"; });
  backBtn.addEventListener("mouseleave", () => { backBtn.style.background = "#0f172a"; });
  backBtn.addEventListener("click", () => {
    currentView = "group";
    selectedLocationId = null;
    locationSortColumn = 0;
    locationSortAsc = true;
    renderApp(data);
  });
  header.appendChild(backBtn);

  const agedColor = loc.agedPct < 15 ? "#10b981" : loc.agedPct <= 25 ? "#f59e0b" : "#ef4444";
  const scoreColor = loc.healthScore >= 70 ? "#10b981" : loc.healthScore >= 45 ? "#f59e0b" : "#ef4444";

  header.innerHTML += `
    <h1 style="margin:0;font-size:16px;font-weight:600;color:#f8fafc;">${loc.name}</h1>
    <span style="font-size:12px;color:#64748b;margin-left:auto;">${loc.totalUnits} units | Avg DOM: ${loc.avgDom}d | Aged: <span style="color:${agedColor}">${loc.agedPct}%</span> | Health: <span style="color:${scoreColor}">${loc.healthScore}</span></span>
  `;
  // Re-append back button since innerHTML clobbered it
  header.prepend(backBtn);
  _addSettingsBar(header);
  document.body.appendChild(header);

  const content = el("div", { style: "padding:16px 20px;" });
  document.body.appendChild(content);

  // KPI mini-ribbon
  const kpiRow = el("div", {
    style: "display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;",
  });
  const agedUnits = loc.inventory.filter(v => v.dom > 60).length;
  const freshUnits = loc.inventory.filter(v => v.dom <= 30).length;
  const overpricedUnits = loc.inventory.filter(v => v.gapPct > 5).length;
  const underpricedUnits = loc.inventory.filter(v => v.gapPct < -5).length;

  const locationKpis = [
    { label: "Total Units", value: String(loc.totalUnits), color: "#94a3b8" },
    { label: "Fresh (<30d)", value: String(freshUnits), color: "#10b981" },
    { label: "Aged (>60d)", value: String(agedUnits), color: "#ef4444" },
    { label: "Avg DOM", value: `${loc.avgDom}d`, color: loc.avgDom > 45 ? "#ef4444" : "#10b981" },
    { label: "Floor Plan Burn", value: `${fmtCurrency(loc.floorPlanBurnPerDay)}/d`, color: "#f97316" },
    { label: "Overpriced", value: String(overpricedUnits), color: overpricedUnits > 5 ? "#ef4444" : "#f59e0b" },
    { label: "Underpriced", value: String(underpricedUnits), color: underpricedUnits > 3 ? "#f59e0b" : "#10b981" },
    { label: "Health Score", value: String(loc.healthScore), color: scoreColor },
  ];

  for (const k of locationKpis) {
    const card = el("div", {
      style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 14px;flex:1;min-width:120px;",
    });
    card.innerHTML = `
      <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">${k.label}</div>
      <div style="font-size:20px;font-weight:700;color:${k.color};margin-top:2px;">${k.value}</div>
    `;
    kpiRow.appendChild(card);
  }
  content.appendChild(kpiRow);

  // Aggregate panel — only meaningful when live API stats came back.
  if (loc._meta) {
    const m = loc._meta;
    const agg = el("div", {
      style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:16px;",
    });
    const bodyMix = (m.bodyTypeMix ?? []).map((b) => `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;background:#0f172a;color:#cbd5e1;border:1px solid #334155;margin-right:6px;margin-bottom:6px;">${b.item} <span style="color:#64748b;">${b.count}</span></span>`).join("");
    const topMakes = (m.topMakes ?? []).map((b) => `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;background:#0f172a;color:#cbd5e1;border:1px solid #334155;margin-right:6px;margin-bottom:6px;">${b.item} <span style="color:#64748b;">${b.count}</span></span>`).join("");
    agg.innerHTML = `
      <h3 style="font-size:13px;font-weight:600;color:#f8fafc;margin:0 0 10px 0;">Inventory Aggregate (live)</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:14px;">
        <div><div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Avg Price</div><div style="font-size:18px;font-weight:700;color:#f8fafc;">${m.priceMean ? fmtCurrency(m.priceMean) : "—"}</div></div>
        <div><div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Median Price</div><div style="font-size:18px;font-weight:700;color:#f8fafc;">${m.priceMedian ? fmtCurrency(m.priceMedian) : "—"}</div></div>
        <div><div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">90+ DOM Share</div><div style="font-size:18px;font-weight:700;color:${(m.ninetyPlusPct ?? 0) > 15 ? "#ef4444" : "#f59e0b"};">${m.ninetyPlusPct ?? 0}%</div></div>
      </div>
      ${bodyMix ? `<div style="margin-bottom:10px;"><div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Body Type Mix</div>${bodyMix}</div>` : ""}
      ${topMakes ? `<div><div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Top Makes</div>${topMakes}</div>` : ""}
    `;
    content.appendChild(agg);
  }

  // Inventory table
  if (loc.inventory.length === 0 && loc._meta) {
    const empty = el("div", {
      style: "background:#1e293b;border:1px dashed #334155;border-radius:8px;padding:18px;text-align:center;color:#94a3b8;font-size:13px;",
    });
    empty.innerHTML = `Per-vehicle listings aren't available with this API tier — aggregate stats above reflect all <strong style="color:#e2e8f0;">${fmtNum(loc.totalUnits)}</strong> units.`;
    content.appendChild(empty);
  }
  const tableWrapper = el("div", {
    style: "overflow-x:auto;border:1px solid #334155;border-radius:8px;max-height:520px;overflow-y:auto;" + (loc.inventory.length === 0 ? "display:none;" : ""),
  });

  const table = el("table", {
    style: "width:100%;border-collapse:collapse;font-size:12px;",
  });

  const headers = ["VIN (last 6)", "Year/Make/Model/Trim", "Listed", "Market", "Gap (%)", "Miles", "DOM", "Action"];
  const sortKeys: Array<(v: Vehicle) => number | string> = [
    v => v.vin.slice(-6),
    v => `${v.year} ${v.make} ${v.model} ${v.trim}`,
    v => v.listedPrice,
    v => v.marketPrice,
    v => v.gapPct,
    v => v.miles,
    v => v.dom,
    v => v.gapPct,
  ];

  const thead2 = document.createElement("thead");
  const headRow2 = document.createElement("tr");
  headers.forEach((h, idx) => {
    const th = document.createElement("th");
    th.style.cssText =
      "padding:8px 10px;text-align:left;background:#1e293b;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;position:sticky;top:0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;cursor:pointer;white-space:nowrap;user-select:none;z-index:1;";
    const arrow = locationSortColumn === idx ? (locationSortAsc ? " \u25B2" : " \u25BC") : "";
    th.textContent = h + arrow;
    th.addEventListener("click", () => {
      if (locationSortColumn === idx) locationSortAsc = !locationSortAsc;
      else { locationSortColumn = idx; locationSortAsc = true; }
      renderApp(data);
    });
    headRow2.appendChild(th);
  });
  thead2.appendChild(headRow2);
  table.appendChild(thead2);

  // Sort inventory
  const sorted = [...loc.inventory].sort((a, b) => {
    const av = sortKeys[locationSortColumn](a);
    const bv = sortKeys[locationSortColumn](b);
    if (typeof av === "number" && typeof bv === "number") return locationSortAsc ? av - bv : bv - av;
    return locationSortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });

  const tbody = document.createElement("tbody");
  for (const v of sorted) {
    const tr = document.createElement("tr");
    let rowBg = "";
    if (v.gapPct > 5) rowBg = "rgba(239,68,68,0.08)";
    else if (v.gapPct < -5) rowBg = "rgba(16,185,129,0.08)";
    tr.style.cssText = `border-bottom:1px solid #1e293b;background:${rowBg};`;
    tr.addEventListener("mouseenter", () => { tr.style.background = "#1e293b"; });
    tr.addEventListener("mouseleave", () => { tr.style.background = rowBg; });

    let badge: string;
    if (v.gapPct > 5) badge = `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);">DROP</span>`;
    else if (v.gapPct < -5) badge = `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);">RAISE</span>`;
    else badge = `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);">HOLD</span>`;

    const gapColor = v.gapPct > 5 ? "#ef4444" : v.gapPct < -5 ? "#10b981" : "#f59e0b";
    const domColor = v.dom > 90 ? "#ef4444" : v.dom > 60 ? "#f97316" : v.dom > 30 ? "#f59e0b" : "#10b981";

    const cells = [
      `<span style="font-family:monospace;color:#94a3b8;">${v.vin.slice(-6)}</span>`,
      `${v.year} ${v.make} ${v.model} ${v.trim}`,
      fmtCurrency(v.listedPrice),
      fmtCurrency(v.marketPrice),
      `<span style="color:${gapColor};font-weight:600;">${fmtPct(v.gapPct)}</span>`,
      fmtNum(v.miles),
      `<span style="color:${domColor};font-weight:600;">${v.dom}d</span>`,
      badge,
    ];

    tr.innerHTML = cells.map(c => `<td style="padding:7px 10px;color:#e2e8f0;white-space:nowrap;">${c}</td>`).join("");
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  content.appendChild(tableWrapper);

  // Location-specific alerts
  const locationAlerts = data.alerts.filter(a => a.location === loc.name);
  if (locationAlerts.length > 0) {
    const alertSection = el("div", {
      style: "margin-top:16px;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;",
    });
    alertSection.innerHTML = `<h3 style="font-size:13px;font-weight:600;color:#f8fafc;margin:0 0 10px 0;">Alerts for ${loc.name}</h3>`;

    const severityConfig = {
      red: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)", icon: "\u26A0", iconColor: "#ef4444" },
      yellow: { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)", icon: "\u25B2", iconColor: "#f59e0b" },
      green: { bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.25)", icon: "\u2713", iconColor: "#10b981" },
    };

    for (const alert of locationAlerts) {
      const cfg = severityConfig[alert.severity];
      const alertItem = el("div", {
        style: `background:${cfg.bg};border:1px solid ${cfg.border};border-radius:6px;padding:10px 12px;display:flex;align-items:flex-start;gap:10px;margin-bottom:6px;`,
      });
      alertItem.innerHTML = `
        <span style="font-size:16px;color:${cfg.iconColor};flex-shrink:0;line-height:1;margin-top:1px;">${cfg.icon}</span>
        <div style="flex:1;">
          <div style="font-size:12px;color:#e2e8f0;">${alert.message}</div>
          <div style="font-size:11px;color:#475569;margin-top:3px;">${alert.timestamp}</div>
        </div>
      `;
      alertSection.appendChild(alertItem);
    }
    content.appendChild(alertSection);
  }

  // Location-specific transfer recommendations
  const locationTransfers = data.transfers.filter(t => t.currentStore === loc.name);
  if (locationTransfers.length > 0) {
    const transferSection = el("div", {
      style: "margin-top:16px;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;",
    });
    transferSection.innerHTML = `<h3 style="font-size:13px;font-weight:600;color:#f8fafc;margin:0 0 10px 0;">Transfer Recommendations from ${loc.name}</h3>`;

    const tTable = el("table", { style: "width:100%;border-collapse:collapse;font-size:12px;" });
    const tHead = document.createElement("thead");
    const tHeadRow = document.createElement("tr");
    for (const h of ["VIN", "Vehicle", "DOM", "\u2192 To", "DOM Improv.", "Cost", "Net Benefit"]) {
      const th = document.createElement("th");
      th.style.cssText = "padding:6px 8px;text-align:left;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;";
      th.textContent = h;
      tHeadRow.appendChild(th);
    }
    tHead.appendChild(tHeadRow);
    tTable.appendChild(tHead);

    const tBody = document.createElement("tbody");
    for (const t of locationTransfers) {
      const tr = document.createElement("tr");
      tr.style.cssText = "border-bottom:1px solid #1e293b44;";
      tr.addEventListener("mouseenter", () => { tr.style.background = "#0f172a"; });
      tr.addEventListener("mouseleave", () => { tr.style.background = ""; });
      tr.innerHTML = `
        <td style="padding:6px 8px;color:#94a3b8;font-family:monospace;font-size:11px;">${t.vinLast6}</td>
        <td style="padding:6px 8px;color:#e2e8f0;font-weight:500;">${t.yearMakeModel}</td>
        <td style="padding:6px 8px;color:${t.currentDom > 90 ? "#ef4444" : "#f59e0b"};font-weight:600;">${t.currentDom}d</td>
        <td style="padding:6px 8px;color:#60a5fa;">${t.recommendedStore}</td>
        <td style="padding:6px 8px;color:#10b981;font-weight:600;">-${t.expectedDomImprovement}d</td>
        <td style="padding:6px 8px;color:#f97316;">${fmtCurrency(t.transportCostEst)}</td>
        <td style="padding:6px 8px;"><span style="color:#10b981;font-weight:700;">${fmtCurrency(t.netBenefit)}</span></td>
      `;
      tBody.appendChild(tr);
    }
    tTable.appendChild(tBody);
    transferSection.appendChild(tTable);
    content.appendChild(transferSection);
  }
}

// ── Inject Global Styles ───────────────────────────────────────────────
function injectGlobalStyles() {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes spin { to { transform: rotate(360deg); } }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #0f172a; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #475569; }
  `;
  document.head.appendChild(style);
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

main();
