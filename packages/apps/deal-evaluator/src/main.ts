/**
 * "Should I Buy This Car?" Deal Evaluator
 * MCP App 5 — Dark-themed single-page evaluator with Canvas gauge
 */
import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
if (typeof window !== "undefined" && window.parent !== window) {
  try { _safeApp = new App({ name: "deal-evaluator" }); } catch {}
}

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
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`MC API ${res.status} @ ${path}${body ? ": " + body.slice(0, 200) : ""}`);
  }
  return res.json();
}
function _mcDecode(vin) { return _mcApi("/decode/car/neovin/" + vin + "/specs"); }
function _mcPredict(p) { return _mcApi("/predict/car/us/marketcheck_price/comparables", p); }
function _mcActive(p) { return _mcApi("/search/car/active", p); }
function _mcRecent(p) { return _mcApi("/search/car/recents", p); }
function _mcHistory(vin) { return _mcApi("/history/car/" + vin, { sort_order: "desc" }); }
function _mcSold(p) { return _mcApi("/api/v1/sold-vehicles/summary", p); }
function _mcIncentives(p) { const q={...p}; if(q.oem&&!q.make){q.make=q.oem;delete q.oem;} return _mcApi("/search/car/incentive/oem", q); }
function _mcUkActive(p) { return _mcApi("/search/car/uk/active", p); }
function _mcUkRecent(p) { return _mcApi("/search/car/uk/recents", p); }

async function _fetchDirect(args) {
  const decode = await _mcDecode(args.vin);
  // Whitelist params per endpoint — the MarketCheck API rejects unknown query params with 400.
  // Client-only fields like `askingPrice` must not be forwarded upstream.
  const predictParams: Record<string, any> = { vin: args.vin, dealer_type: "franchise" };
  if (args.miles) predictParams.miles = args.miles;
  if (args.zip) predictParams.zip = args.zip;
  const [prediction, history] = await Promise.all([_mcPredict(predictParams), _mcHistory(args.vin)]);
  const activeComps = await _mcActive({ make: decode?.make, model: decode?.model, year: decode?.year ? `${decode.year - 1}-${decode.year + 1}` : undefined, zip: args.zip, radius: 75, stats: "price,miles,dom", rows: 50, sort_by: "price", sort_order: "asc" });
  return { decode, prediction, activeComps, history };
}

// Maps raw MarketCheck API responses to the EvalResult shape the renderer expects.
// The MCP server normally does this transform server-side; in direct-API mode we do it here.
function _transformToEvalResult(raw: any, args: Record<string, any>): any {
  const { decode = {}, prediction = {}, activeComps = {}, history } = raw ?? {};
  const listings: any[] = Array.isArray(activeComps?.listings) ? activeComps.listings : [];
  const priceStats = activeComps?.stats?.price ?? {};
  const milesStats = activeComps?.stats?.miles ?? {};
  const domStats = activeComps?.stats?.dom ?? activeComps?.stats?.days_on_market ?? {};

  const histArr: any[] = Array.isArray(history) ? history : (history?.listings ?? []);
  const current = histArr[0] ?? null;

  const predictedPrice = prediction?.marketcheck_price ?? prediction?.price ?? prediction?.predicted_price ?? 0;
  const askingPrice = Number(args.askingPrice) || current?.price || predictedPrice || decode?.msrp || 0;
  const miles = Number(args.miles) || current?.miles || 0;

  const pricesSorted = listings.map(l => Number(l.price) || 0).filter(p => p > 0).sort((a, b) => a - b);
  let percentile = 50;
  if (pricesSorted.length > 0 && askingPrice > 0) {
    const below = pricesSorted.filter(p => p <= askingPrice).length;
    percentile = Math.round((below / pricesSorted.length) * 100);
  }

  const marketStats = {
    count: activeComps?.num_found ?? listings.length,
    medianPrice: priceStats.median ?? priceStats.mean ?? priceStats.avg ?? 0,
    avgPrice: priceStats.avg ?? priceStats.mean ?? 0,
    minPrice: priceStats.min ?? 0,
    maxPrice: priceStats.max ?? 0,
    avgMiles: milesStats.avg ?? milesStats.mean ?? 0,
    avgDom: domStats.avg ?? domStats.mean ?? 0,
    priceStd: priceStats.stddev ?? priceStats.std ?? 0,
  };

  // Keep all filtered listings so the distribution histogram has a rich sample;
  // the Similar Cars carousel slices to the top 8 at render time.
  const alternatives = listings
    .filter(l => (l.vin ?? l.vehicle?.vin) !== args.vin)
    .map(l => {
      const build = l.build ?? l.vehicle ?? {};
      const dealer = l.dealer ?? {};
      const price = Number(l.price) || 0;
      return {
        year: build.year ?? decode?.year ?? 0,
        make: build.make ?? decode?.make ?? "",
        model: build.model ?? decode?.model ?? "",
        trim: build.trim ?? "",
        price,
        miles: Number(l.miles) || 0,
        city: dealer.city ?? l.city ?? "",
        state: dealer.state ?? l.state ?? "",
        dom: l.dom ?? l.days_on_market ?? 0,
        dealerName: dealer.name ?? l.dealer_name ?? "",
        vdpUrl: l.vdp_url ?? l.vdpUrl ?? "#",
        isBelowPredicted: price > 0 && predictedPrice > 0 && price < predictedPrice,
      };
    });

  // History entries from MarketCheck expose both Unix-seconds (`last_seen_at`) and
  // ISO-string (`last_seen_at_date`) variants. Prefer the string variant when available.
  const toIsoDate = (iso: unknown, unixSecs: unknown): string => {
    if (typeof iso === "string" && iso) return iso;
    if (typeof unixSecs === "number") {
      const ms = unixSecs < 10_000_000_000 ? unixSecs * 1000 : unixSecs;
      return new Date(ms).toISOString();
    }
    return "";
  };

  const priceHistory = histArr
    .slice(0, 12)
    .map((h: any) => ({
      date: toIsoDate(h.last_seen_at_date ?? h.scraped_at_date ?? h.first_seen_at_date,
                       h.last_seen_at ?? h.scraped_at ?? h.first_seen_at),
      price: Number(h.price) || 0,
      dealer: h.dealer?.name ?? h.dealer?.dealer_name ?? h.dealer_name ?? h.seller_name ?? "",
    }))
    .filter(h => h.date && h.price > 0)
    .reverse();

  let currentDom = current?.dom ?? current?.days_on_market ?? 0;
  if (!currentDom && current?.last_seen_at && current?.first_seen_at) {
    const diff = (Number(current.last_seen_at) - Number(current.first_seen_at));
    if (diff > 0) currentDom = Math.round(diff / 86400); // unix seconds → days
  }
  const leveragePoints: any[] = [];
  if (currentDom >= 30) {
    leveragePoints.push({ icon: "clock", label: "High Days on Market", detail: `This car has been listed for ${currentDom} days — dealer is motivated to sell.` });
  }
  if (priceHistory.length >= 2) {
    const first = priceHistory[0].price;
    const last = priceHistory[priceHistory.length - 1].price;
    if (last < first) {
      leveragePoints.push({ icon: "chart-down", label: "Price Dropped", detail: `Price has dropped $${(first - last).toLocaleString()} since first listed. Momentum is in your favor.` });
    }
  }
  if (marketStats.count >= 50) {
    leveragePoints.push({ icon: "inventory", label: "High Local Inventory", detail: `${marketStats.count} similar vehicles available nearby. Dealer has competition.` });
  }
  if (marketStats.avgMiles > 0 && miles > 0 && miles < marketStats.avgMiles) {
    leveragePoints.push({ icon: "miles", label: "Below-Average Mileage", detail: `This car has fewer miles than the market average (${Math.round(miles / 1000)}K vs ${Math.round(marketStats.avgMiles / 1000)}K avg).` });
  }

  return {
    vehicle: {
      vin: args.vin ?? decode?.vin ?? "",
      year: decode?.year ?? 0,
      make: decode?.make ?? "",
      model: decode?.model ?? "",
      trim: decode?.trim ?? "",
      bodyType: decode?.body_type ?? decode?.bodyType ?? "",
      engine: decode?.engine ?? decode?.powertrain?.engine ?? "",
      transmission: decode?.transmission ?? "",
      drivetrain: decode?.drivetrain ?? decode?.driven_wheels ?? "",
      fuelType: decode?.fuel_type ?? decode?.fuelType ?? "",
      msrp: decode?.msrp ?? 0,
    },
    askingPrice,
    miles,
    predictedPrice,
    percentile,
    marketStats,
    alternatives,
    priceHistory,
    leveragePoints,
    dealerName: current?.dealer?.name ?? current?.dealer?.dealer_name ?? current?.dealer_name ?? current?.seller_name ?? "",
    dom: currentDom,
  };
}

async function _callTool(toolName, args) {
  // 1. MCP mode (Claude, VS Code, etc.)
  if (_safeApp) {
    try { const r = _safeApp.callServerTool({ name: toolName, arguments: args }); return r; } catch {}
  }
  // 2. Direct API mode (browser → api.marketcheck.com)
  const auth = _getAuth();
  if (auth.value) {
    try {
      const raw = await _fetchDirect(args);
      if (raw) {
        const transformed = _transformToEvalResult(raw, args);
        return { content: [{ type: "text", text: JSON.stringify(transformed) }] };
      }
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
    @keyframes _mc_fadeInUp {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes _mc_pulseBadge {
      0%, 100% { box-shadow: 0 0 0 0 currentColor; opacity: 1; }
      50% { box-shadow: 0 0 0 6px transparent; opacity: 0.7; }
    }
    .mc-reveal {
      animation: _mc_fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
    }
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

interface VehicleInfo {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  bodyType: string;
  engine: string;
  transmission: string;
  drivetrain: string;
  fuelType: string;
  msrp: number;
}

interface MarketStats {
  count: number;
  medianPrice: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  avgMiles: number;
  avgDom: number;
  priceStd: number;
}

interface Alternative {
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  miles: number;
  city: string;
  state: string;
  dom: number;
  dealerName: string;
  vdpUrl: string;
  isBelowPredicted: boolean;
}

interface PriceHistoryEntry {
  date: string;
  price: number;
  dealer: string;
}

interface LeveragePoint {
  icon: string;
  label: string;
  detail: string;
}

interface EvalResult {
  vehicle: VehicleInfo;
  askingPrice: number;
  miles: number;
  predictedPrice: number;
  percentile: number;
  marketStats: MarketStats;
  alternatives: Alternative[];
  priceHistory: PriceHistoryEntry[];
  leveragePoints: LeveragePoint[];
  dealerName: string;
  dom: number;
}

// ── Mock Data ──────────────────────────────────────────────────────────────────

function getMockData(vin: string, askingPrice?: number, miles?: number): EvalResult {
  const ap = askingPrice ?? 28500;
  const ml = miles ?? 34200;
  return {
    vehicle: {
      vin,
      year: 2021,
      make: "Toyota",
      model: "RAV4",
      trim: "XLE Premium",
      bodyType: "SUV",
      engine: "2.5L 4-Cylinder",
      transmission: "8-Speed Automatic",
      drivetrain: "AWD",
      fuelType: "Gasoline",
      msrp: 33450,
    },
    askingPrice: ap,
    miles: ml,
    predictedPrice: 27200,
    percentile: 62,
    marketStats: {
      count: 147,
      medianPrice: 27400,
      avgPrice: 27650,
      minPrice: 22100,
      maxPrice: 34900,
      avgMiles: 38500,
      avgDom: 32,
      priceStd: 2800,
    },
    alternatives: [
      { year: 2021, make: "Toyota", model: "RAV4", trim: "XLE", price: 25900, miles: 41200, city: "Denver", state: "CO", dom: 18, dealerName: "Mile High Toyota", vdpUrl: "#", isBelowPredicted: true },
      { year: 2021, make: "Toyota", model: "RAV4", trim: "XLE Premium", price: 26800, miles: 36800, city: "Boulder", state: "CO", dom: 24, dealerName: "Boulder Toyota", vdpUrl: "#", isBelowPredicted: true },
      { year: 2022, make: "Toyota", model: "RAV4", trim: "LE", price: 27100, miles: 28500, city: "Aurora", state: "CO", dom: 12, dealerName: "AutoNation Toyota", vdpUrl: "#", isBelowPredicted: true },
      { year: 2021, make: "Toyota", model: "RAV4", trim: "XLE Premium", price: 27900, miles: 32100, city: "Lakewood", state: "CO", dom: 45, dealerName: "Larry H. Miller Toyota", vdpUrl: "#", isBelowPredicted: false },
      { year: 2020, make: "Toyota", model: "RAV4", trim: "XLE Premium", price: 25200, miles: 48700, city: "Fort Collins", state: "CO", dom: 55, dealerName: "Pedersen Toyota", vdpUrl: "#", isBelowPredicted: true },
      { year: 2021, make: "Toyota", model: "RAV4", trim: "Limited", price: 29400, miles: 29800, city: "Colorado Springs", state: "CO", dom: 8, dealerName: "Springs Toyota", vdpUrl: "#", isBelowPredicted: false },
      { year: 2022, make: "Toyota", model: "RAV4", trim: "XLE", price: 28200, miles: 22100, city: "Pueblo", state: "CO", dom: 30, dealerName: "Pueblo Toyota", vdpUrl: "#", isBelowPredicted: false },
      { year: 2021, make: "Toyota", model: "RAV4", trim: "XSE Hybrid", price: 29800, miles: 31400, city: "Longmont", state: "CO", dom: 14, dealerName: "Longmont Toyota", vdpUrl: "#", isBelowPredicted: false },
    ],
    priceHistory: [
      { date: "2025-12-01", price: 30200, dealer: "First Auto" },
      { date: "2026-01-15", price: 29500, dealer: "CarMax Denver" },
      { date: "2026-02-20", price: 28500, dealer: "Current Dealer" },
    ],
    leveragePoints: [
      { icon: "clock", label: "High Days on Market", detail: "This car has been listed for 45+ days — dealer is motivated to sell." },
      { icon: "chart-down", label: "Price Dropped", detail: "Price has dropped $1,700 since first listed. Momentum is in your favor." },
      { icon: "inventory", label: "High Local Inventory", detail: "147 similar vehicles within 75 miles. Dealer has competition." },
      { icon: "miles", label: "Above-Average Mileage", detail: "This car has fewer miles than the market average (34.2K vs 38.5K avg)." },
    ],
    dealerName: "Colorado Auto Group",
    dom: 45,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtCurrency(v: number | undefined): string {
  if (v == null) return "N/A";
  return "$" + Math.round(v).toLocaleString();
}

function fmtNumber(v: number | undefined): string {
  if (v == null) return "N/A";
  return Math.round(v).toLocaleString();
}

function getVerdict(percentile: number): { label: string; icon: string; title: string; subtitle: string; color: string; bgColor: string } {
  if (percentile <= 20) return { label: "GREAT DEAL", icon: "\u2713", title: "GREAT DEAL", subtitle: "Buy with confidence", color: "#10b981", bgColor: "#10b98120" };
  if (percentile <= 60) return { label: "FAIR DEAL", icon: "\u26A0", title: "FAIR DEAL", subtitle: "Room to negotiate", color: "#f59e0b", bgColor: "#f59e0b20" };
  if (percentile <= 85) return { label: "ABOVE MARKET", icon: "\u26A0", title: "ABOVE MARKET", subtitle: "Negotiate hard", color: "#f97316", bgColor: "#f9731620" };
  return { label: "OVERPRICED", icon: "\u2717", title: "OVERPRICED", subtitle: "Pass", color: "#ef4444", bgColor: "#ef444420" };
}

function getLeverageIcon(iconName: string): string {
  switch (iconName) {
    case "clock": return "\u23F0";
    case "chart-down": return "\uD83D\uDCC9";
    case "inventory": return "\uD83D\uDCE6";
    case "miles": return "\uD83D\uDEE3\uFE0F";
    default: return "\u2139\uFE0F";
  }
}

// ── Canvas Gauge ───────────────────────────────────────────────────────────────

function drawGauge(canvas: HTMLCanvasElement, data: {
  minPrice: number;
  maxPrice: number;
  askingPrice: number;
  predictedPrice: number;
  percentile: number;
}) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  const cx = w / 2;
  const cy = h - 30;
  const radius = Math.min(cx - 30, cy - 20);
  const startAngle = Math.PI;
  const endAngle = 2 * Math.PI;

  // Color segments: green -> yellow -> orange -> red
  const segments = [
    { start: 0, end: 0.20, color: "#10b981" },
    { start: 0.20, end: 0.40, color: "#22c55e" },
    { start: 0.40, end: 0.60, color: "#f59e0b" },
    { start: 0.60, end: 0.75, color: "#f97316" },
    { start: 0.75, end: 0.85, color: "#ef4444" },
    { start: 0.85, end: 1.0, color: "#dc2626" },
  ];

  // Draw arc segments
  const arcWidth = 20;
  for (const seg of segments) {
    const a1 = startAngle + seg.start * Math.PI;
    const a2 = startAngle + seg.end * Math.PI;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, a1, a2);
    ctx.strokeStyle = seg.color;
    ctx.lineWidth = arcWidth;
    ctx.lineCap = "butt";
    ctx.stroke();
  }

  // Draw thin outer arc border
  ctx.beginPath();
  ctx.arc(cx, cy, radius + arcWidth / 2 + 1, startAngle, endAngle);
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, radius - arcWidth / 2 - 1, startAngle, endAngle);
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Tick marks
  for (let i = 0; i <= 10; i++) {
    const angle = startAngle + (i / 10) * Math.PI;
    const innerR = radius - arcWidth / 2 - 6;
    const outerR = radius - arcWidth / 2 - 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
    ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = i % 5 === 0 ? 2 : 1;
    ctx.stroke();
  }

  // Predicted price marker (triangle on the arc)
  const range = data.maxPrice - data.minPrice || 1;
  const predictedPct = Math.max(0, Math.min(1, (data.predictedPrice - data.minPrice) / range));
  const predictedAngle = startAngle + predictedPct * Math.PI;
  const markerR = radius + arcWidth / 2 + 8;
  const markerX = cx + Math.cos(predictedAngle) * markerR;
  const markerY = cy + Math.sin(predictedAngle) * markerR;

  ctx.save();
  ctx.translate(markerX, markerY);
  ctx.rotate(predictedAngle + Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(-5, 6);
  ctx.lineTo(5, 6);
  ctx.closePath();
  ctx.fillStyle = "#3b82f6";
  ctx.fill();
  ctx.restore();

  // Fair market value label
  const fmvLabelR = radius + arcWidth / 2 + 22;
  const fmvLabelX = cx + Math.cos(predictedAngle) * fmvLabelR;
  const fmvLabelY = cy + Math.sin(predictedAngle) * fmvLabelR;
  ctx.font = "bold 10px -apple-system, sans-serif";
  ctx.fillStyle = "#3b82f6";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("FMV", fmvLabelX, fmvLabelY);

  // Needle for asking price
  const askingPct = Math.max(0, Math.min(1, (data.askingPrice - data.minPrice) / range));
  const needleAngle = startAngle + askingPct * Math.PI;
  const needleLen = radius - arcWidth / 2 - 12;

  // Needle shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  // Draw needle
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(
    cx + Math.cos(needleAngle) * needleLen,
    cy + Math.sin(needleAngle) * needleLen,
  );
  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();

  // Needle tip
  const tipX = cx + Math.cos(needleAngle) * needleLen;
  const tipY = cy + Math.sin(needleAngle) * needleLen;
  ctx.beginPath();
  ctx.arc(tipX, tipY, 3, 0, 2 * Math.PI);
  ctx.fillStyle = "#f8fafc";
  ctx.fill();

  // Center hub
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, 2 * Math.PI);
  ctx.fillStyle = "#1e293b";
  ctx.fill();
  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Min/Max labels at the ends
  ctx.font = "bold 12px -apple-system, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(fmtCurrency(data.minPrice), cx - radius - 10, cy + 6);

  ctx.textAlign = "right";
  ctx.fillText(fmtCurrency(data.maxPrice), cx + radius + 10, cy + 6);

  // Asking price value in center
  ctx.font = "bold 20px -apple-system, sans-serif";
  ctx.fillStyle = "#f8fafc";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(fmtCurrency(data.askingPrice), cx, cy - 18);

  ctx.font = "11px -apple-system, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("Asking Price", cx, cy - 4);
}

// ── Price-history line chart (Canvas) ───────────────────────────────────────────

function drawPriceHistoryChart(
  canvas: HTMLCanvasElement,
  history: PriceHistoryEntry[],
  fmv: number,
) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  if (history.length < 2) {
    ctx.fillStyle = "#64748b";
    ctx.font = "12px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Not enough price history to plot", w / 2, h / 2);
    return;
  }

  const padL = 56, padR = 16, padT = 20, padB = 32;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const times = history.map(p => new Date(p.date).getTime());
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const tRange = Math.max(1, maxT - minT);

  const prices = history.map(p => p.price);
  let minP = Math.min(...prices);
  let maxP = Math.max(...prices);
  if (fmv > 0) { minP = Math.min(minP, fmv); maxP = Math.max(maxP, fmv); }
  const pad = (maxP - minP) * 0.12 || maxP * 0.1;
  minP = Math.max(0, minP - pad);
  maxP = maxP + pad;
  const pRange = Math.max(1, maxP - minP);

  const xAt = (t: number) => padL + ((t - minT) / tRange) * plotW;
  const yAt = (p: number) => padT + (1 - (p - minP) / pRange) * plotH;

  // Y grid lines + labels (4 divisions)
  ctx.strokeStyle = "#1e293b";
  ctx.fillStyle = "#64748b";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (i / 4) * plotH;
    const price = maxP - (i / 4) * pRange;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.fillText(fmtCurrency(price), padL - 8, y);
  }

  // X-axis date labels (first, middle, last)
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#94a3b8";
  const fmtShort = (t: number) => {
    const d = new Date(t);
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  };
  ctx.fillText(fmtShort(minT), padL, h - padB + 6);
  ctx.fillText(fmtShort((minT + maxT) / 2), padL + plotW / 2, h - padB + 6);
  ctx.fillText(fmtShort(maxT), w - padR, h - padB + 6);

  // FMV reference line (dashed blue)
  if (fmv > 0 && fmv >= minP && fmv <= maxP) {
    const y = yAt(fmv);
    ctx.strokeStyle = "#3b82f688";
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#60a5fa";
    ctx.font = "bold 10px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`FMV ${fmtCurrency(fmv)}`, padL + 6, y - 9);
  }

  // Area fill under line (gradient)
  const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
  grad.addColorStop(0, "rgba(59,130,246,0.28)");
  grad.addColorStop(1, "rgba(59,130,246,0.02)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(xAt(times[0]), padT + plotH);
  for (let i = 0; i < history.length; i++) ctx.lineTo(xAt(times[i]), yAt(prices[i]));
  ctx.lineTo(xAt(times[times.length - 1]), padT + plotH);
  ctx.closePath();
  ctx.fill();

  // Line
  ctx.strokeStyle = "#60a5fa";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i < history.length; i++) {
    const x = xAt(times[i]);
    const y = yAt(prices[i]);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Points
  for (let i = 0; i < history.length; i++) {
    const x = xAt(times[i]);
    const y = yAt(prices[i]);
    const isLast = i === history.length - 1;
    ctx.beginPath();
    ctx.arc(x, y, isLast ? 5 : 3, 0, 2 * Math.PI);
    ctx.fillStyle = isLast ? "#f59e0b" : "#60a5fa";
    ctx.fill();
    if (isLast) {
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 2;
      ctx.stroke();
      // label
      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 11px -apple-system, sans-serif";
      ctx.textAlign = x > w - 80 ? "right" : "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(fmtCurrency(prices[i]), x + (x > w - 80 ? -8 : 8), y - 6);
    }
  }
}

// ── Market distribution histogram (Canvas) ──────────────────────────────────────

function drawMarketHistogram(
  canvas: HTMLCanvasElement,
  listings: Alternative[],
  minPrice: number,
  maxPrice: number,
  askingPrice: number,
  fmv: number,
) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const padL = 12, padR = 12, padT = 12, padB = 28;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const buckets = 12;
  const range = Math.max(1, maxPrice - minPrice);
  const bucketW = plotW / buckets;
  const counts = new Array(buckets).fill(0);
  for (const l of listings) {
    if (!l.price || l.price <= 0) continue;
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor(((l.price - minPrice) / range) * buckets)));
    counts[idx]++;
  }
  const maxCount = Math.max(1, ...counts);

  // Bars
  for (let i = 0; i < buckets; i++) {
    const c = counts[i];
    if (c === 0) continue;
    const barH = (c / maxCount) * plotH;
    const x = padL + i * bucketW + 1;
    const y = padT + plotH - barH;
    const bw = bucketW - 2;

    // Color ramp: left = green, middle = amber, right = red
    const pct = i / (buckets - 1);
    const color = pct < 0.4 ? "#10b981" : pct < 0.7 ? "#f59e0b" : "#ef4444";
    ctx.fillStyle = color + "33";
    ctx.fillRect(x, y, bw, barH);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, bw, 2);
  }

  // FMV marker (blue dashed)
  if (fmv > 0 && fmv >= minPrice && fmv <= maxPrice) {
    const x = padL + ((fmv - minPrice) / range) * plotW;
    ctx.strokeStyle = "#3b82f6";
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Asking price marker (amber solid)
  if (askingPrice > 0) {
    const clamped = Math.max(minPrice, Math.min(maxPrice, askingPrice));
    const x = padL + ((clamped - minPrice) / range) * plotW;
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
    // small diamond marker at top
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.moveTo(x, padT - 4);
    ctx.lineTo(x + 4, padT);
    ctx.lineTo(x, padT + 4);
    ctx.lineTo(x - 4, padT);
    ctx.closePath();
    ctx.fill();
  }

  // X-axis min/max labels
  ctx.fillStyle = "#64748b";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(fmtCurrency(minPrice), padL, padT + plotH + 6);
  ctx.textAlign = "right";
  ctx.fillText(fmtCurrency(maxPrice), w - padR, padT + plotH + 6);
  ctx.textAlign = "center";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(`${listings.length} listings`, w / 2, padT + plotH + 6);
}

// ── Animated number counter ─────────────────────────────────────────────────────

function animateCount(
  el: HTMLElement,
  from: number,
  to: number,
  duration: number,
  formatter: (n: number) => string,
) {
  if (!el) return;
  const start = performance.now();
  const diff = to - from;
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out-cubic
    el.textContent = formatter(from + diff * eased);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ── Main App ───────────────────────────────────────────────────────────────────

async function main() {
  let serverAvailable = !!_safeApp;
  try {
    (_safeApp as any)?.connect?.();
  } catch {
    serverAvailable = false;
  }

  // ── Shell Setup ──
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
  header.style.cssText = "background:#1e293b;padding:16px 20px;border-radius:10px;margin-bottom:16px;border:1px solid #334155;display:flex;align-items:center;gap:16px;";
  const titleBlock = document.createElement("div");
  titleBlock.style.cssText = "flex:1;min-width:0;";
  titleBlock.innerHTML = `<h1 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#f8fafc;letter-spacing:-0.01em;">Should I Buy This Car?</h1>
    <p style="margin:0;font-size:13px;color:#94a3b8;">Real-time deal evaluation powered by 95% of US dealer inventory</p>`;
  header.appendChild(titleBlock);
  container.appendChild(header);
  _addSettingsBar(header);

  // ── Input Area ──
  const inputArea = document.createElement("div");
  inputArea.style.cssText = "background:#1e293b;padding:16px 20px;border-radius:10px;margin-bottom:16px;border:1px solid #334155;display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;";

  function makeField(label: string, placeholder: string, opts?: { width?: string; type?: string }): HTMLInputElement {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    wrap.innerHTML = `<label style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">${label}</label>`;
    const input = document.createElement("input");
    input.type = opts?.type ?? "text";
    input.placeholder = placeholder;
    input.style.cssText = `padding:10px 14px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;outline:none;width:${opts?.width ?? "180px"};`;
    input.addEventListener("focus", () => { input.style.borderColor = "#3b82f6"; });
    input.addEventListener("blur", () => { input.style.borderColor = "#334155"; });
    wrap.appendChild(input);
    inputArea.appendChild(wrap);
    return input;
  }

  const urlParams = _getUrlParams();
  const urlSearch = new URLSearchParams(location.search);
  const urlAsking = urlSearch.get("askingPrice") ?? urlSearch.get("asking_price");

  const vinInput = makeField("VIN", "Enter 17-character VIN", { width: "240px" });
  vinInput.value = urlParams.vin || "KNDCB3LC9L5359658";
  const priceInput = makeField("Asking Price (optional)", "$0", { width: "140px", type: "number" });
  if (urlAsking) priceInput.value = urlAsking;
  const milesInput = makeField("Mileage (optional)", "e.g. 35000", { width: "140px", type: "number" });
  if (urlParams.miles) milesInput.value = urlParams.miles;
  const zipInput = makeField("ZIP Code (optional)", "e.g. 80202", { width: "120px" });
  if (urlParams.zip) zipInput.value = urlParams.zip;

  const evalBtn = document.createElement("button");
  evalBtn.textContent = "Evaluate";
  evalBtn.style.cssText = "padding:10px 28px;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;border:none;background:#3b82f6;color:#fff;height:42px;align-self:flex-end;transition:background 0.15s;";
  evalBtn.addEventListener("mouseenter", () => { evalBtn.style.background = "#2563eb"; });
  evalBtn.addEventListener("mouseleave", () => { evalBtn.style.background = "#3b82f6"; });
  inputArea.appendChild(evalBtn);

  container.appendChild(inputArea);

  // ── Results Container ──
  const results = document.createElement("div");
  results.id = "results";
  container.appendChild(results);

  // ── Evaluate Handler ──
  evalBtn.addEventListener("click", async () => {
    const vin = vinInput.value.trim();
    if (!vin) {
      alert("Please enter a VIN.");
      return;
    }

    evalBtn.disabled = true;
    evalBtn.textContent = "Evaluating...";
    evalBtn.style.opacity = "0.7";
    results.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:60px;color:#94a3b8;">
      <div style="width:24px;height:24px;border:3px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:14px;"></div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      Analyzing market data for ${vin}...
    </div>`;

    let data: EvalResult | null = null;

    const fallbackToMock = () => getMockData(
      vin,
      priceInput.value ? Number(priceInput.value) : undefined,
      milesInput.value ? Number(milesInput.value) : undefined,
    );

    try {
      const args: Record<string, unknown> = { vin };
      if (priceInput.value) args.askingPrice = Number(priceInput.value);
      if (milesInput.value) args.miles = Number(milesInput.value);
      if (zipInput.value) args.zip = zipInput.value;

      // _callTool handles the fallback chain: MCP → direct API → proxy → null.
      // null means "no auth available" (demo mode).
      const response = await _callTool("evaluate-deal", args);
      if (response?.content) {
        const textContent = response.content.find((c: any) => c.type === "text");
        const parsed = JSON.parse(textContent?.text ?? "{}");
        data = parsed?.vehicle ? parsed : null;
      }

      if (!data) {
        await new Promise(r => setTimeout(r, 600));
        data = fallbackToMock();
      }

      renderResults(data);
    } catch (err: any) {
      console.warn("Evaluation threw, falling back to mock:", err);
      await new Promise(r => setTimeout(r, 400));
      renderResults(fallbackToMock());
    }

    evalBtn.disabled = false;
    evalBtn.textContent = "Evaluate";
    evalBtn.style.opacity = "1";
  });

  // ── Render ───────────────────────────────────────────────────────────────────

  function renderResults(data: EvalResult) {
    results.innerHTML = "";

    const verdict = getVerdict(data.percentile);
    const priceDiff = data.askingPrice - data.predictedPrice;
    const priceDiffAbs = Math.abs(priceDiff);
    const diffSign = priceDiff >= 0 ? "above" : "below";

    // ── Verdict Banner ──
    const banner = document.createElement("div");
    banner.className = "mc-reveal";
    banner.style.cssText = `background:${verdict.bgColor};border:1px solid ${verdict.color}55;border-radius:12px;padding:20px 24px;margin-bottom:16px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;box-shadow:0 12px 40px -12px ${verdict.color}55, 0 0 0 1px ${verdict.color}22 inset;position:relative;overflow:hidden;`;
    banner.innerHTML = `
      <div style="width:56px;height:56px;border-radius:50%;background:${verdict.color};display:flex;align-items:center;justify-content:center;font-size:28px;color:#fff;font-weight:bold;flex-shrink:0;box-shadow:0 6px 16px -4px ${verdict.color}aa;">${verdict.icon}</div>
      <div style="flex:1;min-width:200px;">
        <div style="font-size:26px;font-weight:800;color:${verdict.color};letter-spacing:-0.01em;line-height:1.1;">${verdict.title}</div>
        <div style="font-size:13px;color:#cbd5e1;margin-top:4px;">${verdict.subtitle} · <span style="color:#94a3b8;">${data.percentile}th percentile</span></div>
      </div>
      <div style="display:flex;gap:28px;flex-wrap:wrap;">
        <div style="text-align:center;">
          <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:2px;">Asking Price</div>
          <div data-count="ask" style="font-size:20px;font-weight:700;color:#f8fafc;font-variant-numeric:tabular-nums;">$0</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:2px;">Fair Market Value</div>
          <div data-count="fmv" style="font-size:20px;font-weight:700;color:#60a5fa;font-variant-numeric:tabular-nums;">$0</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:2px;">Difference</div>
          <div data-count="diff" style="font-size:20px;font-weight:700;color:${priceDiff >= 0 ? "#ef4444" : "#10b981"};font-variant-numeric:tabular-nums;">-</div>
        </div>
      </div>
    `;
    results.appendChild(banner);
    {
      const signPrefix = priceDiff >= 0 ? "+" : "-";
      const askEl = banner.querySelector('[data-count="ask"]') as HTMLElement;
      const fmvEl = banner.querySelector('[data-count="fmv"]') as HTMLElement;
      const diffEl = banner.querySelector('[data-count="diff"]') as HTMLElement;
      if (askEl) animateCount(askEl, 0, data.askingPrice, 900, fmtCurrency);
      if (fmvEl) animateCount(fmvEl, 0, data.predictedPrice, 900, fmtCurrency);
      if (diffEl) animateCount(diffEl, 0, priceDiffAbs, 900, (n) => `${signPrefix}${fmtCurrency(n)} ${diffSign}`);
    }

    // ── Gauge ──
    const gaugeSection = document.createElement("div");
    gaugeSection.className = "mc-reveal";
    gaugeSection.style.animationDelay = "80ms";
    gaugeSection.style.cssText += "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:16px;text-align:center;animation-delay:80ms;";
    gaugeSection.innerHTML = `<h3 style="font-size:11px;color:#94a3b8;margin:0 0 12px 0;text-transform:uppercase;letter-spacing:0.6px;font-weight:600;">Price Position in Market</h3>`;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:100%;max-width:500px;height:220px;";
    gaugeSection.appendChild(canvas);

    // Legend row
    const legend = document.createElement("div");
    legend.style.cssText = "display:flex;justify-content:center;gap:16px;margin-top:10px;flex-wrap:wrap;";
    legend.innerHTML = `
      <span style="font-size:11px;color:#94a3b8;display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;background:#f8fafc;border-radius:50%;display:inline-block;"></span> Asking Price (needle)</span>
      <span style="font-size:11px;color:#94a3b8;display:flex;align-items:center;gap:4px;"><span style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:10px solid #3b82f6;display:inline-block;"></span> Fair Market Value</span>
    `;
    gaugeSection.appendChild(legend);
    results.appendChild(gaugeSection);

    // Draw gauge after it's in the DOM
    requestAnimationFrame(() => {
      drawGauge(canvas, {
        minPrice: data.marketStats.minPrice,
        maxPrice: data.marketStats.maxPrice,
        askingPrice: data.askingPrice,
        predictedPrice: data.predictedPrice,
        percentile: data.percentile,
      });
    });

    // ── Three-Column Detail Row ──
    const detailGrid = document.createElement("div");
    detailGrid.className = "mc-reveal";
    detailGrid.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:16px;animation-delay:160ms;";

    // 1. This Car
    const thisCarPanel = createPanel("This Car");
    const specs = [
      ["Year/Make/Model", `${data.vehicle.year} ${data.vehicle.make} ${data.vehicle.model}`],
      ["Trim", data.vehicle.trim],
      ["Body Type", data.vehicle.bodyType],
      ["Engine", data.vehicle.engine],
      ["Transmission", data.vehicle.transmission],
      ["Drivetrain", data.vehicle.drivetrain],
      ["Mileage", `${fmtNumber(data.miles)} mi`],
      ["Dealer", data.dealerName],
      ["Days on Market", `${data.dom} days`],
      ["MSRP (new)", fmtCurrency(data.vehicle.msrp)],
    ];
    for (const [k, v] of specs) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #1e293b;";
      row.innerHTML = `<span style="font-size:12px;color:#94a3b8;">${k}</span><span style="font-size:12px;color:#e2e8f0;font-weight:600;">${v}</span>`;
      thisCarPanel.body.appendChild(row);
    }
    detailGrid.appendChild(thisCarPanel.container);

    // 2. Market Context
    const marketPanel = createPanel("Market Context");
    const mStats = [
      ["Similar Cars", `${data.marketStats.count} within 75 mi`],
      ["Median Price", fmtCurrency(data.marketStats.medianPrice)],
      ["Avg Price", fmtCurrency(data.marketStats.avgPrice)],
      ["Price Range", `${fmtCurrency(data.marketStats.minPrice)} - ${fmtCurrency(data.marketStats.maxPrice)}`],
      ["Avg Mileage", `${fmtNumber(data.marketStats.avgMiles)} mi`],
      ["Avg Days on Market", `${data.marketStats.avgDom} days`],
    ];
    for (const [k, v] of mStats) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #1e293b;";
      row.innerHTML = `<span style="font-size:12px;color:#94a3b8;">${k}</span><span style="font-size:12px;color:#e2e8f0;font-weight:600;">${v}</span>`;
      marketPanel.body.appendChild(row);
    }

    // Distribution histogram (Canvas)
    const distLabel = document.createElement("div");
    distLabel.style.cssText = "margin-top:14px;font-size:10px;color:#94a3b8;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.6px;font-weight:600;";
    distLabel.textContent = "Price Distribution";
    marketPanel.body.appendChild(distLabel);

    const distCanvas = document.createElement("canvas");
    distCanvas.style.cssText = "width:100%;height:120px;display:block;";
    marketPanel.body.appendChild(distCanvas);

    const distLegend = document.createElement("div");
    distLegend.style.cssText = "display:flex;gap:18px;margin-top:6px;justify-content:center;";
    distLegend.innerHTML = `
      <span style="font-size:10px;color:#94a3b8;display:inline-flex;align-items:center;gap:5px;"><span style="width:10px;height:2px;background:#3b82f6;display:inline-block;"></span> FMV</span>
      <span style="font-size:10px;color:#94a3b8;display:inline-flex;align-items:center;gap:5px;"><span style="width:2px;height:10px;background:#f59e0b;display:inline-block;"></span> Asking</span>
    `;
    marketPanel.body.appendChild(distLegend);

    requestAnimationFrame(() => {
      drawMarketHistogram(
        distCanvas,
        data.alternatives,
        data.marketStats.minPrice,
        data.marketStats.maxPrice,
        data.askingPrice,
        data.predictedPrice,
      );
    });

    detailGrid.appendChild(marketPanel.container);

    // 3. Negotiation Toolkit
    const negoPanel = createPanel("Negotiation Toolkit");

    // Suggested offer
    const suggestedOffer = Math.round(data.predictedPrice * 0.95);
    const offerBox = document.createElement("div");
    offerBox.style.cssText = "background:#10b98115;border:1px solid #10b98140;border-radius:8px;padding:12px;margin-bottom:12px;text-align:center;";
    offerBox.innerHTML = `
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Suggested Opening Offer</div>
      <div style="font-size:24px;font-weight:800;color:#10b981;margin-top:4px;">${fmtCurrency(suggestedOffer)}</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px;">5% below fair market value</div>
    `;
    negoPanel.body.appendChild(offerBox);

    // Leverage points
    const leverageTitle = document.createElement("div");
    leverageTitle.style.cssText = "font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;";
    leverageTitle.textContent = "Leverage Points";
    negoPanel.body.appendChild(leverageTitle);

    for (const lp of data.leveragePoints) {
      const lpEl = document.createElement("div");
      lpEl.style.cssText = "background:#0f172a;border:1px solid #334155;border-radius:6px;padding:10px 12px;margin-bottom:6px;";
      lpEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:16px;">${getLeverageIcon(lp.icon)}</span>
          <span style="font-size:12px;font-weight:600;color:#e2e8f0;">${lp.label}</span>
        </div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px;padding-left:28px;">${lp.detail}</div>
      `;
      negoPanel.body.appendChild(lpEl);
    }

    detailGrid.appendChild(negoPanel.container);
    results.appendChild(detailGrid);

    // ── Similar Cars Section ──
    const altSection = document.createElement("div");
    altSection.className = "mc-reveal";
    altSection.style.cssText = "margin-bottom:20px;animation-delay:240ms;";
    altSection.innerHTML = `<h3 style="font-size:14px;font-weight:600;color:#f8fafc;margin:0 0 12px 0;letter-spacing:-0.01em;">Similar Cars to Consider</h3>`;

    const scrollRow = document.createElement("div");
    scrollRow.style.cssText = "display:flex;gap:12px;overflow-x:auto;padding-bottom:12px;";
    scrollRow.style.scrollbarWidth = "thin";

    for (const alt of data.alternatives.slice(0, 8)) {
      const card = document.createElement("div");
      card.style.cssText = "min-width:220px;max-width:240px;background:#1e293b;border:1px solid #334155;border-radius:10px;padding:14px;flex-shrink:0;cursor:pointer;transition:border-color 0.15s;";
      card.addEventListener("mouseenter", () => { card.style.borderColor = "#3b82f6"; });
      card.addEventListener("mouseleave", () => { card.style.borderColor = "#334155"; });

      const badgeHtml = alt.isBelowPredicted
        ? `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:#10b98122;color:#10b981;border:1px solid #10b98144;margin-top:6px;">Below Market</span>`
        : "";

      card.innerHTML = `
        <div style="font-size:14px;font-weight:700;color:#f8fafc;">${alt.year} ${alt.make} ${alt.model}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:2px;">${alt.trim}</div>
        <div style="font-size:20px;font-weight:800;color:#f8fafc;margin-top:8px;">${fmtCurrency(alt.price)}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px;">${fmtNumber(alt.miles)} mi</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:2px;">${alt.city}, ${alt.state}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">${alt.dealerName}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">${alt.dom} days on market</div>
        ${badgeHtml}
      `;

      if (alt.vdpUrl && alt.vdpUrl !== "#") {
        card.addEventListener("click", () => window.open(alt.vdpUrl, "_blank"));
      }
      scrollRow.appendChild(card);
    }

    altSection.appendChild(scrollRow);
    results.appendChild(altSection);

    // ── Price History ──
    if (data.priceHistory.length > 0) {
      const histSection = document.createElement("div");
      histSection.className = "mc-reveal";
      histSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px 20px;margin-bottom:16px;animation-delay:320ms;";
      histSection.innerHTML = `<h3 style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;font-weight:600;margin:0 0 12px 0;">Price History</h3>`;

      // Chart above the table — tells the price-journey story at a glance.
      const chartCanvas = document.createElement("canvas");
      chartCanvas.style.cssText = "width:100%;height:200px;display:block;margin-bottom:18px;";
      histSection.appendChild(chartCanvas);
      requestAnimationFrame(() => {
        drawPriceHistoryChart(chartCanvas, data.priceHistory, data.predictedPrice);
      });

      const table = document.createElement("table");
      table.style.cssText = "width:100%;border-collapse:collapse;font-size:13px;";
      table.innerHTML = `
        <thead>
          <tr>
            <th style="padding:6px 10px;text-align:left;color:#94a3b8;font-size:11px;text-transform:uppercase;border-bottom:1px solid #334155;">Date</th>
            <th style="padding:6px 10px;text-align:left;color:#94a3b8;font-size:11px;text-transform:uppercase;border-bottom:1px solid #334155;">Price</th>
            <th style="padding:6px 10px;text-align:left;color:#94a3b8;font-size:11px;text-transform:uppercase;border-bottom:1px solid #334155;">Dealer</th>
          </tr>
        </thead>
        <tbody>
          ${data.priceHistory.map((h, i) => {
            const prevPrice = i > 0 ? data.priceHistory[i - 1].price : h.price;
            const diff = h.price - prevPrice;
            const diffStr = i === 0 ? "" : ` <span style="color:${diff <= 0 ? "#10b981" : "#ef4444"};font-size:11px;">(${diff < 0 ? "-" : "+"}${fmtCurrency(Math.abs(diff))})</span>`;
            return `<tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:6px 10px;color:#e2e8f0;">${new Date(h.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
              <td style="padding:6px 10px;color:#e2e8f0;font-weight:600;">${fmtCurrency(h.price)}${diffStr}</td>
              <td style="padding:6px 10px;color:#94a3b8;">${h.dealer}</td>
            </tr>`;
          }).join("")}
        </tbody>
      `;
      histSection.appendChild(table);
      results.appendChild(histSection);
    }
  }

  function createPanel(title: string): { container: HTMLElement; body: HTMLElement } {
    const container = document.createElement("div");
    container.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px;";
    container.innerHTML = `<h3 style="font-size:13px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 12px 0;">${title}</h3>`;
    const body = document.createElement("div");
    container.appendChild(body);
    return { container, body };
  }

  // ── Responsive ──
  const style = document.createElement("style");
  style.textContent = `
    @media (max-width: 900px) {
      #results > div:nth-child(3) {
        grid-template-columns: 1fr !important;
      }
    }
    ::-webkit-scrollbar { height: 6px; }
    ::-webkit-scrollbar-track { background: #1e293b; border-radius: 3px; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #475569; }
  `;
  document.head.appendChild(style);

  if (urlParams.vin) {
    setTimeout(() => evalBtn.click(), 100);
  }
}

main();
