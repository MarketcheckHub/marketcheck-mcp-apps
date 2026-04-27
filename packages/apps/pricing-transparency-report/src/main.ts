/**
 * Pricing Transparency Report — Shareable Market Report for Dealers
 * Generates a professional, printable pricing report showing where a vehicle
 * sits in the market. Designed for dealers to share with buyers.
 */
import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "pricing-transparency-report" }); } catch {}

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
  for (const key of ["vin", "zip", "make", "model", "miles", "state", "dealer_id", "ticker", "price", "compact"]) {
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
  const decode = await _mcDecode(args.vin);
  const [prediction,activeComps,soldComps] = await Promise.all([_mcPredict({...args,dealer_type:"franchise"}),_mcActive({make:decode?.make,model:decode?.model,zip:args.zip,radius:75,stats:"price,miles,dom",rows:10}),_mcRecent({make:decode?.make,model:decode?.model,zip:args.zip,radius:100,stats:"price",rows:10})]);
  return {decode,prediction,activeComps,soldComps};
}

function _str(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") return v.name ?? v.display ?? v.value ?? v.label ?? "";
  return "";
}

function _transformRawToPricingReport(raw: any, args: any): PricingReportData {
  const d = raw.decode ?? {};
  const prediction = raw.prediction ?? {};
  const activeResult = raw.activeComps ?? {};
  const soldResult = raw.soldComps ?? {};

  const askingPrice = Number(args.askingPrice ?? args.price ?? 0);
  const fmv = prediction.predicted_price ?? prediction.marketcheck_price ?? prediction.price ?? 0;
  const confLow = prediction.price_range?.low ?? (fmv > 0 ? Math.round(fmv * 0.9) : 0);
  const confHigh = prediction.price_range?.high ?? (fmv > 0 ? Math.round(fmv * 1.1) : 0);

  const activeListings = activeResult.listings ?? [];
  const priceStats = activeResult.stats?.price ?? {};
  const minPrice = priceStats.min ?? (activeListings.length > 0 ? Math.min(...activeListings.map((l: any) => l.price ?? Infinity)) : Math.round(fmv * 0.85));
  const maxPrice = priceStats.max ?? (activeListings.length > 0 ? Math.max(...activeListings.map((l: any) => l.price ?? 0)) : Math.round(fmv * 1.15));
  const priceRange = maxPrice - minPrice || 1;
  const percentile = Math.max(0, Math.min(100, ((askingPrice - minPrice) / priceRange) * 100));

  let badge: PricingReportData["dealBadge"] = "FAIR PRICE";
  if (percentile <= 20) badge = "GREAT DEAL";
  else if (percentile <= 40) badge = "GOOD VALUE";
  else if (percentile <= 60) badge = "FAIR PRICE";
  else if (percentile <= 80) badge = "ABOVE MARKET";
  else badge = "OVERPRICED";

  const activeComps: ActiveComp[] = activeListings
    .filter((l: any) => (l.price ?? 0) > 0)
    .slice(0, 8)
    .map((l: any) => ({
      year: l.year ?? l.build?.year ?? d.year ?? 0,
      make: _str(l.make ?? l.build?.make ?? d.make),
      model: _str(l.model ?? l.build?.model ?? d.model),
      trim: _str(l.trim ?? l.build?.trim),
      price: l.price ?? 0,
      miles: l.miles ?? 0,
      dealerName: _str(l.dealer?.name ?? l.dealer_name),
      city: _str(l.dealer?.city ?? l.city),
      state: _str(l.dealer?.state ?? l.state),
      distance: l.dist ?? l.distance ?? 0,
      dom: l.dom ?? l.days_on_market ?? 0,
      vdpUrl: l.vdp_url ?? "#",
    }));

  const soldListings = soldResult.listings ?? [];
  const soldComps: SoldComp[] = soldListings
    .filter((l: any) => (l.price ?? 0) > 0)
    .slice(0, 8)
    .map((l: any) => ({
      year: l.year ?? l.build?.year ?? d.year ?? 0,
      make: _str(l.make ?? l.build?.make ?? d.make),
      model: _str(l.model ?? l.build?.model ?? d.model),
      trim: _str(l.trim ?? l.build?.trim),
      soldPrice: l.price ?? 0,
      miles: l.miles ?? 0,
      soldDate: l.last_seen_at_date ?? l.last_seen_at ?? l.scraped_at ?? new Date().toISOString().split("T")[0],
      dealerName: _str(l.dealer?.name ?? l.dealer_name),
      city: _str(l.dealer?.city ?? l.city),
      state: _str(l.dealer?.state ?? l.state),
    }));

  const avgPrice = priceStats.mean ?? priceStats.avg ?? (activeComps.length > 0 ? activeComps.reduce((s, c) => s + c.price, 0) / activeComps.length : fmv);
  const medianPrice = priceStats.median ?? avgPrice;
  const milesStats = activeResult.stats?.miles ?? {};
  const avgMiles = milesStats.mean ?? milesStats.avg ?? (activeComps.length > 0 ? activeComps.reduce((s, c) => s + c.miles, 0) / activeComps.length : 0);
  const domStats = activeResult.stats?.dom ?? activeResult.stats?.days_on_market ?? {};
  const avgDom = domStats.mean ?? domStats.avg ?? (activeComps.length > 0 ? activeComps.reduce((s, c) => s + c.dom, 0) / activeComps.length : 0);

  return {
    vehicle: {
      vin: args.vin ?? d.vin ?? "",
      year: d.year ?? 0,
      make: _str(d.make) || "Unknown",
      model: _str(d.model) || "Unknown",
      trim: _str(d.trim),
      bodyType: _str(d.body_type),
      engine: _str(d.engine),
      transmission: _str(d.transmission),
      drivetrain: _str(d.drivetrain),
      fuelType: _str(d.fuel_type),
      exteriorColor: _str(d.exterior_color) || "N/A",
      miles: Number(args.miles) || 0,
    },
    askingPrice,
    predictedFmv: fmv,
    confidenceLow: confLow,
    confidenceHigh: confHigh,
    percentile,
    dealBadge: badge,
    activeComps,
    soldComps,
    marketSummary: {
      totalSimilar: activeResult.num_found ?? activeComps.length,
      medianPrice: Math.round(medianPrice),
      avgPrice: Math.round(avgPrice),
      minPrice: Math.round(minPrice),
      maxPrice: Math.round(maxPrice),
      avgMiles: Math.round(avgMiles),
      avgDom: Math.round(avgDom),
    },
    reportDate: new Date().toISOString().split("T")[0],
    dealerName: "",
  };
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
      if (r.ok) {
        const raw = await r.json();
        const d = _transformRawToPricingReport(raw, args);
        return { content: [{ type: "text", text: JSON.stringify(d) }] };
      }
    } catch {}
    // 2. Direct API fallback
    try {
      const raw = await _fetchDirect(args);
      if (raw) {
        const d = _transformRawToPricingReport(raw, args);
        return { content: [{ type: "text", text: JSON.stringify(d) }] };
      }
    } catch {}
    return null;
  }
  // 3. MCP mode (Claude, VS Code, etc.) — only when no auth and inside MCP host
  if (_safeApp && window.parent !== window) {
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
    @media print {
      body { background: #0f172a !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
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
  exteriorColor: string;
  miles: number;
}

interface ActiveComp {
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  miles: number;
  dealerName: string;
  city: string;
  state: string;
  distance: number;
  dom: number;
  vdpUrl: string;
}

interface SoldComp {
  year: number;
  make: string;
  model: string;
  trim: string;
  soldPrice: number;
  miles: number;
  soldDate: string;
  dealerName: string;
  city: string;
  state: string;
}

interface MarketSummary {
  totalSimilar: number;
  medianPrice: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  avgMiles: number;
  avgDom: number;
}

interface PricingReportData {
  vehicle: VehicleInfo;
  askingPrice: number;
  predictedFmv: number;
  confidenceLow: number;
  confidenceHigh: number;
  percentile: number;
  dealBadge: "GREAT DEAL" | "GOOD VALUE" | "FAIR PRICE" | "ABOVE MARKET" | "OVERPRICED";
  activeComps: ActiveComp[];
  soldComps: SoldComp[];
  marketSummary: MarketSummary;
  reportDate: string;
  dealerName: string;
}

// ── Mock Data ──────────────────────────────────────────────────────────────────

function getMockData(vin: string, askingPrice?: number, miles?: number, zip?: string): PricingReportData {
  const ap = askingPrice ?? 26900;
  const ml = miles ?? 31500;
  const percentile = Math.max(0, Math.min(100, ((ap - 22800) / (32400 - 22800)) * 100));
  let badge: PricingReportData["dealBadge"] = "FAIR PRICE";
  if (percentile <= 20) badge = "GREAT DEAL";
  else if (percentile <= 40) badge = "GOOD VALUE";
  else if (percentile <= 60) badge = "FAIR PRICE";
  else if (percentile <= 80) badge = "ABOVE MARKET";
  else badge = "OVERPRICED";

  return {
    vehicle: {
      vin: vin || "1HGCV1F34NA012345",
      year: 2022,
      make: "Honda",
      model: "Accord",
      trim: "EX-L",
      bodyType: "Sedan",
      engine: "1.5L Turbo 4-Cylinder",
      transmission: "CVT Automatic",
      drivetrain: "Front-Wheel Drive",
      fuelType: "Gasoline",
      exteriorColor: "Lunar Silver Metallic",
      miles: ml,
    },
    askingPrice: ap,
    predictedFmv: 26400,
    confidenceLow: 24200,
    confidenceHigh: 28600,
    percentile,
    dealBadge: badge,
    activeComps: [
      { year: 2022, make: "Honda", model: "Accord", trim: "EX-L", price: 25400, miles: 38200, dealerName: "Honda of Stevens Creek", city: "San Jose", state: "CA", distance: 12, dom: 22, vdpUrl: "#" },
      { year: 2022, make: "Honda", model: "Accord", trim: "EX-L", price: 26200, miles: 33100, dealerName: "Capitol Honda", city: "San Jose", state: "CA", distance: 15, dom: 18, vdpUrl: "#" },
      { year: 2022, make: "Honda", model: "Accord", trim: "Sport", price: 25800, miles: 29800, dealerName: "Bay Area Honda", city: "Oakland", state: "CA", distance: 28, dom: 35, vdpUrl: "#" },
      { year: 2023, make: "Honda", model: "Accord", trim: "EX", price: 27500, miles: 18400, dealerName: "Dublin Honda", city: "Dublin", state: "CA", distance: 32, dom: 14, vdpUrl: "#" },
      { year: 2022, make: "Honda", model: "Accord", trim: "EX-L", price: 26800, miles: 30500, dealerName: "Fremont Honda", city: "Fremont", state: "CA", distance: 22, dom: 28, vdpUrl: "#" },
      { year: 2021, make: "Honda", model: "Accord", trim: "EX-L", price: 24200, miles: 42100, dealerName: "Palo Alto Honda", city: "Palo Alto", state: "CA", distance: 8, dom: 42, vdpUrl: "#" },
      { year: 2022, make: "Honda", model: "Accord", trim: "Touring", price: 28900, miles: 25600, dealerName: "Santa Cruz Honda", city: "Santa Cruz", state: "CA", distance: 45, dom: 10, vdpUrl: "#" },
      { year: 2022, make: "Honda", model: "Accord", trim: "EX-L", price: 27100, miles: 28900, dealerName: "Concord Honda", city: "Concord", state: "CA", distance: 38, dom: 20, vdpUrl: "#" },
    ],
    soldComps: [
      { year: 2022, make: "Honda", model: "Accord", trim: "EX-L", soldPrice: 25900, miles: 35200, soldDate: "2026-03-15", dealerName: "Sunnyvale Honda", city: "Sunnyvale", state: "CA" },
      { year: 2022, make: "Honda", model: "Accord", trim: "EX-L", soldPrice: 26400, miles: 30800, soldDate: "2026-03-08", dealerName: "Mountain View Honda", city: "Mountain View", state: "CA" },
      { year: 2022, make: "Honda", model: "Accord", trim: "Sport", soldPrice: 25200, miles: 33600, soldDate: "2026-02-28", dealerName: "Gilroy Honda", city: "Gilroy", state: "CA" },
      { year: 2023, make: "Honda", model: "Accord", trim: "EX", soldPrice: 27800, miles: 19200, soldDate: "2026-02-22", dealerName: "Milpitas Honda", city: "Milpitas", state: "CA" },
      { year: 2021, make: "Honda", model: "Accord", trim: "EX-L", soldPrice: 23800, miles: 44500, soldDate: "2026-02-15", dealerName: "San Mateo Honda", city: "San Mateo", state: "CA" },
      { year: 2022, make: "Honda", model: "Accord", trim: "EX-L", soldPrice: 26100, miles: 31200, soldDate: "2026-02-10", dealerName: "Redwood City Honda", city: "Redwood City", state: "CA" },
    ],
    marketSummary: {
      totalSimilar: 89,
      medianPrice: 26200,
      avgPrice: 26450,
      minPrice: 22800,
      maxPrice: 32400,
      avgMiles: 32800,
      avgDom: 26,
    },
    reportDate: new Date().toISOString().split("T")[0],
    dealerName: "Bay Area Certified Motors",
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtCurrency(v: number | undefined): string {
  if (v == null || isNaN(v)) return "N/A";
  return "$" + Math.round(v).toLocaleString();
}

function fmtNumber(v: number | undefined): string {
  if (v == null || isNaN(v)) return "N/A";
  return Math.round(v).toLocaleString();
}

function badgeConfig(badge: string): { color: string; bg: string; border: string; desc: string } {
  switch (badge) {
    case "GREAT DEAL": return { color: "#10b981", bg: "#10b98120", border: "#10b98155", desc: "Priced well below market average" };
    case "GOOD VALUE": return { color: "#22c55e", bg: "#22c55e20", border: "#22c55e55", desc: "Priced below most comparable vehicles" };
    case "FAIR PRICE": return { color: "#3b82f6", bg: "#3b82f620", border: "#3b82f655", desc: "Competitively priced within the market" };
    case "ABOVE MARKET": return { color: "#f59e0b", bg: "#f59e0b20", border: "#f59e0b55", desc: "Priced above the market median" };
    case "OVERPRICED": return { color: "#ef4444", bg: "#ef444420", border: "#ef444455", desc: "Priced significantly above market" };
    default: return { color: "#3b82f6", bg: "#3b82f620", border: "#3b82f655", desc: "" };
  }
}

// ── Main App ───────────────────────────────────────────────────────────────────

async function main() {
  // Only attempt MCP connect when actually inside an MCP host iframe
  if (_safeApp && window.parent !== window) {
    try { (_safeApp as any)?.connect?.(); } catch {}
  }

  const urlParams = _getUrlParams();

  document.body.style.cssText = "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;overflow-x:hidden;";

  const container = document.createElement("div");
  container.style.cssText = "max-width:1100px;margin:0 auto;padding:16px 20px;";
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

  // Header (no-print input section)
  const header = document.createElement("div");
  header.className = "no-print";
  header.style.cssText = "background:#1e293b;padding:16px 20px;border-radius:10px;margin-bottom:16px;border:1px solid #334155;display:flex;align-items:center;";
  header.innerHTML = `<div><h1 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#f8fafc;">Pricing Transparency Report</h1>
    <p style="margin:0;font-size:13px;color:#94a3b8;">Generate a shareable market pricing report for any vehicle</p></div>`;
  _addSettingsBar(header);
  container.appendChild(header);

  // Input Area
  const inputArea = document.createElement("div");
  inputArea.className = "no-print";
  inputArea.style.cssText = "background:#1e293b;padding:16px 20px;border-radius:10px;margin-bottom:16px;border:1px solid #334155;display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;";

  function makeField(label: string, placeholder: string, opts?: { width?: string; type?: string; value?: string }): HTMLInputElement {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    wrap.innerHTML = `<label style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">${label}</label>`;
    const input = document.createElement("input");
    input.type = opts?.type ?? "text";
    input.placeholder = placeholder;
    if (opts?.value) input.value = opts.value;
    input.style.cssText = `padding:10px 14px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;outline:none;width:${opts?.width ?? "180px"};`;
    input.addEventListener("focus", () => { input.style.borderColor = "#3b82f6"; });
    input.addEventListener("blur", () => { input.style.borderColor = "#334155"; });
    wrap.appendChild(input);
    inputArea.appendChild(wrap);
    return input;
  }

  const vinInput = makeField("VIN", "Enter 17-character VIN", { width: "240px", value: urlParams.vin || "1HGCV1F34NA012345" });
  const priceInput = makeField("Your Price", "$0", { width: "130px", type: "number", value: urlParams.price || "" });
  const milesInput = makeField("Mileage", "e.g. 31500", { width: "130px", type: "number", value: urlParams.miles || "" });
  const zipInput = makeField("ZIP Code", "e.g. 95050", { width: "110px", value: urlParams.zip || "" });

  const genBtn = document.createElement("button");
  genBtn.textContent = "Generate Report";
  genBtn.style.cssText = "padding:10px 28px;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;border:none;background:#10b981;color:#fff;height:42px;align-self:flex-end;transition:background 0.15s;";
  genBtn.addEventListener("mouseenter", () => { genBtn.style.background = "#059669"; });
  genBtn.addEventListener("mouseleave", () => { genBtn.style.background = "#10b981"; });
  inputArea.appendChild(genBtn);
  container.appendChild(inputArea);

  const results = document.createElement("div");
  results.id = "results";
  container.appendChild(results);

  genBtn.addEventListener("click", () => runReport(vinInput.value.trim(), priceInput.value, milesInput.value, zipInput.value));

  vinInput.addEventListener("keydown", (e) => { if (e.key === "Enter") genBtn.click(); });

  if (urlParams.vin) {
    runReport(urlParams.vin, urlParams.price || "", urlParams.miles || "", urlParams.zip || "");
  }

  async function runReport(vin: string, price: string, miles: string, zip: string) {
    if (!vin) { alert("Please enter a VIN."); return; }

    genBtn.disabled = true;
    genBtn.textContent = "Generating...";
    genBtn.style.opacity = "0.7";
    results.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:60px;color:#94a3b8;">
      <div style="width:24px;height:24px;border:3px solid #334155;border-top-color:#10b981;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:14px;"></div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      Generating pricing report...
    </div>`;

    let data: PricingReportData;
    const mode = _detectAppMode();
    try {
      if (mode === "live" || mode === "mcp") {
        const args: Record<string, unknown> = { vin };
        if (price) args.askingPrice = Number(price);
        if (miles) args.miles = Number(miles);
        if (zip) args.zip = zip;
        const response = await _callTool("generate-pricing-report", args);
        const textContent = response?.content?.find((c: any) => c.type === "text");
        if (textContent?.text) {
          data = JSON.parse(textContent.text);
        } else {
          throw new Error("No data returned from API");
        }
      } else {
        await new Promise(r => setTimeout(r, 800));
        data = getMockData(vin, price ? Number(price) : undefined, miles ? Number(miles) : undefined, zip);
      }
      renderReport(data);
    } catch (err: any) {
      console.error("Report generation failed, using mock:", err);
      await new Promise(r => setTimeout(r, 400));
      data = getMockData(vin, price ? Number(price) : undefined, miles ? Number(miles) : undefined, zip);
      renderReport(data);
    }

    genBtn.disabled = false;
    genBtn.textContent = "Generate Report";
    genBtn.style.opacity = "1";
  }

  function renderReport(data: PricingReportData) {
    results.innerHTML = "";

    const bc = badgeConfig(data.dealBadge);
    const fmv = data.predictedFmv;
    const diff = data.askingPrice - fmv;

    // ── Section 1: Report Header ──
    const reportHeader = document.createElement("div");
    reportHeader.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:24px;margin-bottom:16px;";
    const ymmt = `${data.vehicle.year} ${data.vehicle.make} ${data.vehicle.model} ${data.vehicle.trim}`;
    reportHeader.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
        <div>
          <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">MarketCheck Pricing Report</div>
          <h2 style="margin:0;font-size:24px;font-weight:800;color:#f8fafc;">${ymmt}</h2>
          <div style="font-size:12px;color:#64748b;margin-top:4px;font-family:monospace;">VIN: ${data.vehicle.vin}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;color:#64748b;">Report Date</div>
          <div style="font-size:14px;font-weight:600;color:#e2e8f0;">${new Date(data.reportDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
          ${data.dealerName ? `<div style="font-size:12px;color:#94a3b8;margin-top:4px;">Prepared by: ${data.dealerName}</div>` : ''}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
        ${[
          ["Body", data.vehicle.bodyType],
          ["Engine", data.vehicle.engine],
          ["Transmission", data.vehicle.transmission],
          ["Drivetrain", data.vehicle.drivetrain],
          ["Fuel", data.vehicle.fuelType],
          ["Exterior", data.vehicle.exteriorColor],
          ["Mileage", fmtNumber(data.vehicle.miles) + " mi"],
          ["Our Price", fmtCurrency(data.askingPrice)],
        ].map(([k, v]) => `<div style="background:#0f172a;border-radius:6px;padding:8px 10px;"><div style="font-size:10px;color:#64748b;text-transform:uppercase;">${k}</div><div style="font-size:12px;color:#e2e8f0;font-weight:600;margin-top:2px;">${v}</div></div>`).join("")}
      </div>
    `;
    results.appendChild(reportHeader);

    // ── Section 2: Fair Price Badge ──
    const badgeSection = document.createElement("div");
    badgeSection.style.cssText = `background:${bc.bg};border:2px solid ${bc.border};border-radius:12px;padding:24px;margin-bottom:16px;display:flex;align-items:center;gap:24px;flex-wrap:wrap;`;

    badgeSection.innerHTML = `
      <div style="width:80px;height:80px;border-radius:50%;background:${bc.color}22;border:3px solid ${bc.color};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <div style="text-align:center;">
          <div style="font-size:11px;font-weight:800;color:${bc.color};letter-spacing:0.5px;line-height:1.2;">${data.dealBadge.replace(" ", "<br>")}</div>
        </div>
      </div>
      <div style="flex:1;min-width:200px;">
        <div style="font-size:22px;font-weight:800;color:${bc.color};">${data.dealBadge}</div>
        <div style="font-size:13px;color:#94a3b8;margin-top:4px;">${bc.desc}</div>
      </div>
      <div style="display:flex;gap:24px;flex-wrap:wrap;">
        <div style="text-align:center;">
          <div style="font-size:10px;color:#64748b;text-transform:uppercase;">Our Price</div>
          <div style="font-size:22px;font-weight:800;color:#f8fafc;">${fmtCurrency(data.askingPrice)}</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:10px;color:#64748b;text-transform:uppercase;">Market Value</div>
          <div style="font-size:22px;font-weight:800;color:#3b82f6;">${fmtCurrency(fmv)}</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:10px;color:#64748b;text-transform:uppercase;">Difference</div>
          <div style="font-size:22px;font-weight:800;color:${diff <= 0 ? '#10b981' : '#f59e0b'};">${diff <= 0 ? '-' : '+'}${fmtCurrency(Math.abs(diff))}</div>
        </div>
      </div>
    `;
    results.appendChild(badgeSection);

    // ── Section 3: Price Position Bar ──
    const posSection = document.createElement("div");
    posSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:16px;";

    const pctile = data.percentile;
    const pctColor = pctile <= 30 ? "#10b981" : pctile <= 50 ? "#22c55e" : pctile <= 65 ? "#3b82f6" : pctile <= 80 ? "#f59e0b" : "#ef4444";
    const priceRange = data.marketSummary.maxPrice - data.marketSummary.minPrice || 1;
    const medianPct = ((data.marketSummary.medianPrice - data.marketSummary.minPrice) / priceRange) * 100;
    const fmvPct = ((fmv - data.marketSummary.minPrice) / priceRange) * 100;

    posSection.innerHTML = `
      <h3 style="font-size:13px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 16px 0;">Price Position in Market</h3>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:6px;">
        <span>Lowest: ${fmtCurrency(data.marketSummary.minPrice)}</span>
        <span>${data.marketSummary.totalSimilar} similar vehicles in area</span>
        <span>Highest: ${fmtCurrency(data.marketSummary.maxPrice)}</span>
      </div>
      <div style="position:relative;height:36px;background:#0f172a;border-radius:8px;border:1px solid #334155;overflow:visible;margin-bottom:8px;">
        <!-- Gradient fill showing distribution -->
        <div style="position:absolute;left:0;top:0;height:100%;width:100%;background:linear-gradient(90deg,#10b98125,#22c55e25,#3b82f625,#f59e0b25,#ef444425);border-radius:8px;"></div>
        <!-- Median marker -->
        <div style="position:absolute;left:${medianPct}%;top:0;height:100%;width:2px;background:#94a3b8;" title="Median: ${fmtCurrency(data.marketSummary.medianPrice)}"></div>
        <!-- FMV marker -->
        <div style="position:absolute;left:${fmvPct}%;top:-4px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #3b82f6;transform:translateX(-6px);" title="FMV: ${fmtCurrency(fmv)}"></div>
        <!-- This car marker -->
        <div style="position:absolute;left:${pctile}%;top:4px;height:28px;width:4px;background:${pctColor};border-radius:2px;transform:translateX(-2px);box-shadow:0 0 8px ${pctColor}66;" title="This Vehicle: ${fmtCurrency(data.askingPrice)}"></div>
      </div>
      <div style="display:flex;justify-content:center;gap:20px;font-size:10px;">
        <span style="color:#94a3b8;display:flex;align-items:center;gap:4px;"><span style="width:10px;height:2px;background:#94a3b8;display:inline-block;"></span> Median</span>
        <span style="color:#3b82f6;display:flex;align-items:center;gap:4px;"><span style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:6px solid #3b82f6;display:inline-block;"></span> Market Value</span>
        <span style="color:${pctColor};display:flex;align-items:center;gap:4px;"><span style="width:4px;height:12px;background:${pctColor};border-radius:1px;display:inline-block;"></span> This Vehicle (${Math.round(pctile)}th %ile)</span>
      </div>
    `;
    results.appendChild(posSection);

    // ── Section 4: Active Comparables Table ──
    if (data.activeComps.length > 0) {
      const activeSection = document.createElement("div");
      activeSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px 20px;margin-bottom:16px;";
      activeSection.innerHTML = `<h3 style="font-size:13px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px 0;">Active Comparables</h3>
        <p style="font-size:11px;color:#64748b;margin:0 0 12px 0;">Similar vehicles currently for sale in the local market</p>`;

      const tableWrap = document.createElement("div");
      tableWrap.style.cssText = "overflow-x:auto;";
      const table = document.createElement("table");
      table.style.cssText = "width:100%;border-collapse:collapse;font-size:12px;";
      table.innerHTML = `
        <thead>
          <tr style="background:#0f172a;">
            <th style="padding:10px 10px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;border-bottom:1px solid #334155;">Vehicle</th>
            <th style="padding:10px 10px;text-align:right;color:#94a3b8;font-size:10px;text-transform:uppercase;border-bottom:1px solid #334155;">Price</th>
            <th style="padding:10px 10px;text-align:right;color:#94a3b8;font-size:10px;text-transform:uppercase;border-bottom:1px solid #334155;">Miles</th>
            <th style="padding:10px 10px;text-align:right;color:#94a3b8;font-size:10px;text-transform:uppercase;border-bottom:1px solid #334155;">Distance</th>
            <th style="padding:10px 10px;text-align:right;color:#94a3b8;font-size:10px;text-transform:uppercase;border-bottom:1px solid #334155;">DOM</th>
            <th style="padding:10px 10px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;border-bottom:1px solid #334155;">Dealer</th>
          </tr>
        </thead>
        <tbody>
          ${data.activeComps.map(c => {
            const priceDiff = c.price - data.askingPrice;
            const priceColor = priceDiff < 0 ? "#10b981" : priceDiff > 0 ? "#f59e0b" : "#e2e8f0";
            const diffStr = priceDiff === 0 ? "" : ` <span style="color:${priceColor};font-size:10px;">(${priceDiff > 0 ? '+' : '-'}${fmtCurrency(Math.abs(priceDiff))})</span>`;
            return `<tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px;color:#e2e8f0;font-weight:600;">${c.year} ${c.make} ${c.model} <span style="color:#94a3b8;font-weight:400;">${c.trim}</span></td>
              <td style="padding:10px;text-align:right;color:#e2e8f0;font-weight:600;">${fmtCurrency(c.price)}${diffStr}</td>
              <td style="padding:10px;text-align:right;color:#94a3b8;">${fmtNumber(c.miles)}</td>
              <td style="padding:10px;text-align:right;color:#94a3b8;">${c.distance} mi</td>
              <td style="padding:10px;text-align:right;color:#94a3b8;">${c.dom}d</td>
              <td style="padding:10px;color:#64748b;">${c.dealerName}<br><span style="font-size:10px;">${c.city}, ${c.state}</span></td>
            </tr>`;
          }).join("")}
        </tbody>
      `;
      tableWrap.appendChild(table);
      activeSection.appendChild(tableWrap);

      // Summary row
      const avgCompPrice = data.activeComps.reduce((s, c) => s + c.price, 0) / data.activeComps.length;
      const cheaperCount = data.activeComps.filter(c => c.price < data.askingPrice).length;
      const summaryRow = document.createElement("div");
      summaryRow.style.cssText = "display:flex;gap:16px;margin-top:12px;flex-wrap:wrap;";
      summaryRow.innerHTML = `
        <div style="background:#0f172a;border-radius:6px;padding:8px 14px;border:1px solid #334155;"><span style="font-size:10px;color:#64748b;">Avg Comp Price</span><div style="font-size:14px;font-weight:700;color:#e2e8f0;">${fmtCurrency(avgCompPrice)}</div></div>
        <div style="background:#0f172a;border-radius:6px;padding:8px 14px;border:1px solid #334155;"><span style="font-size:10px;color:#64748b;">Priced Lower</span><div style="font-size:14px;font-weight:700;color:#10b981;">${cheaperCount} of ${data.activeComps.length}</div></div>
        <div style="background:#0f172a;border-radius:6px;padding:8px 14px;border:1px solid #334155;"><span style="font-size:10px;color:#64748b;">Our Price vs Avg</span><div style="font-size:14px;font-weight:700;color:${data.askingPrice <= avgCompPrice ? '#10b981' : '#f59e0b'};">${data.askingPrice <= avgCompPrice ? '-' : '+'}${fmtCurrency(Math.abs(data.askingPrice - avgCompPrice))}</div></div>
      `;
      activeSection.appendChild(summaryRow);
      results.appendChild(activeSection);
    }

    // ── Section 5: Recent Transactions ──
    if (data.soldComps.length > 0) {
      const soldSection = document.createElement("div");
      soldSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px 20px;margin-bottom:16px;";
      soldSection.innerHTML = `<h3 style="font-size:13px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px 0;">Recent Transactions</h3>
        <p style="font-size:11px;color:#64748b;margin:0 0 12px 0;">Similar vehicles sold in the past 90 days</p>`;

      const tableWrap = document.createElement("div");
      tableWrap.style.cssText = "overflow-x:auto;";
      const table = document.createElement("table");
      table.style.cssText = "width:100%;border-collapse:collapse;font-size:12px;";
      table.innerHTML = `
        <thead>
          <tr style="background:#0f172a;">
            <th style="padding:10px 10px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;border-bottom:1px solid #334155;">Vehicle</th>
            <th style="padding:10px 10px;text-align:right;color:#94a3b8;font-size:10px;text-transform:uppercase;border-bottom:1px solid #334155;">Sold Price</th>
            <th style="padding:10px 10px;text-align:right;color:#94a3b8;font-size:10px;text-transform:uppercase;border-bottom:1px solid #334155;">Miles</th>
            <th style="padding:10px 10px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;border-bottom:1px solid #334155;">Sold Date</th>
            <th style="padding:10px 10px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;border-bottom:1px solid #334155;">Dealer / Location</th>
          </tr>
        </thead>
        <tbody>
          ${data.soldComps.map(s => {
            const sDiff = s.soldPrice - data.askingPrice;
            const sDiffColor = sDiff < 0 ? "#10b981" : sDiff > 0 ? "#f59e0b" : "#e2e8f0";
            const sDiffStr = sDiff === 0 ? "" : ` <span style="color:${sDiffColor};font-size:10px;">(${sDiff > 0 ? '+' : '-'}${fmtCurrency(Math.abs(sDiff))})</span>`;
            return `<tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px;color:#e2e8f0;font-weight:600;">${s.year} ${s.make} ${s.model} <span style="color:#94a3b8;font-weight:400;">${s.trim}</span></td>
              <td style="padding:10px;text-align:right;color:#e2e8f0;font-weight:600;">${fmtCurrency(s.soldPrice)}${sDiffStr}</td>
              <td style="padding:10px;text-align:right;color:#94a3b8;">${fmtNumber(s.miles)}</td>
              <td style="padding:10px;color:#94a3b8;">${new Date(s.soldDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
              <td style="padding:10px;color:#64748b;">${s.dealerName}<br><span style="font-size:10px;">${s.city}, ${s.state}</span></td>
            </tr>`;
          }).join("")}
        </tbody>
      `;
      tableWrap.appendChild(table);
      soldSection.appendChild(tableWrap);

      const avgSoldPrice = data.soldComps.reduce((s, c) => s + c.soldPrice, 0) / data.soldComps.length;
      const soldSummary = document.createElement("div");
      soldSummary.style.cssText = "display:flex;gap:16px;margin-top:12px;flex-wrap:wrap;";
      soldSummary.innerHTML = `
        <div style="background:#0f172a;border-radius:6px;padding:8px 14px;border:1px solid #334155;"><span style="font-size:10px;color:#64748b;">Avg Sold Price</span><div style="font-size:14px;font-weight:700;color:#e2e8f0;">${fmtCurrency(avgSoldPrice)}</div></div>
        <div style="background:#0f172a;border-radius:6px;padding:8px 14px;border:1px solid #334155;"><span style="font-size:10px;color:#64748b;">Our Price vs Avg Sold</span><div style="font-size:14px;font-weight:700;color:${data.askingPrice <= avgSoldPrice ? '#10b981' : '#f59e0b'};">${data.askingPrice <= avgSoldPrice ? '-' : '+'}${fmtCurrency(Math.abs(data.askingPrice - avgSoldPrice))}</div></div>
        <div style="background:#0f172a;border-radius:6px;padding:8px 14px;border:1px solid #334155;"><span style="font-size:10px;color:#64748b;">Transactions (90d)</span><div style="font-size:14px;font-weight:700;color:#e2e8f0;">${data.soldComps.length}</div></div>
      `;
      soldSection.appendChild(soldSummary);
      results.appendChild(soldSection);
    }

    // ── Section 6: Market Summary KPIs ──
    const summarySection = document.createElement("div");
    summarySection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:16px;";
    summarySection.innerHTML = `<h3 style="font-size:13px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 16px 0;">Market Summary</h3>`;

    const kpiGrid = document.createElement("div");
    kpiGrid.style.cssText = "display:grid;grid-template-columns:repeat(4,1fr);gap:12px;";

    const kpis = [
      { label: "Total Similar Vehicles", value: String(data.marketSummary.totalSimilar), color: "#3b82f6" },
      { label: "Median Price", value: fmtCurrency(data.marketSummary.medianPrice), color: "#e2e8f0" },
      { label: "Avg Mileage", value: fmtNumber(data.marketSummary.avgMiles) + " mi", color: "#e2e8f0" },
      { label: "Avg Days on Market", value: data.marketSummary.avgDom + " days", color: "#e2e8f0" },
    ];

    for (const kpi of kpis) {
      const card = document.createElement("div");
      card.style.cssText = "background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px;text-align:center;";
      card.innerHTML = `
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">${kpi.label}</div>
        <div style="font-size:22px;font-weight:800;color:${kpi.color};margin-top:6px;">${kpi.value}</div>
      `;
      kpiGrid.appendChild(card);
    }
    summarySection.appendChild(kpiGrid);

    // Additional detail row
    const detailRow = document.createElement("div");
    detailRow.style.cssText = "display:flex;gap:12px;margin-top:12px;flex-wrap:wrap;";
    detailRow.innerHTML = `
      <div style="flex:1;min-width:150px;background:#0f172a;border-radius:8px;padding:12px;border:1px solid #334155;">
        <div style="font-size:10px;color:#64748b;">Price Range</div>
        <div style="font-size:14px;font-weight:600;color:#e2e8f0;margin-top:4px;">${fmtCurrency(data.marketSummary.minPrice)} - ${fmtCurrency(data.marketSummary.maxPrice)}</div>
      </div>
      <div style="flex:1;min-width:150px;background:#0f172a;border-radius:8px;padding:12px;border:1px solid #334155;">
        <div style="font-size:10px;color:#64748b;">Avg Market Price</div>
        <div style="font-size:14px;font-weight:600;color:#e2e8f0;margin-top:4px;">${fmtCurrency(data.marketSummary.avgPrice)}</div>
      </div>
      <div style="flex:1;min-width:150px;background:#0f172a;border-radius:8px;padding:12px;border:1px solid #334155;">
        <div style="font-size:10px;color:#64748b;">Confidence Range</div>
        <div style="font-size:14px;font-weight:600;color:#3b82f6;margin-top:4px;">${fmtCurrency(data.confidenceLow)} - ${fmtCurrency(data.confidenceHigh)}</div>
      </div>
    `;
    summarySection.appendChild(detailRow);
    results.appendChild(summarySection);

    // ── Print Button (no-print) ──
    const printBar = document.createElement("div");
    printBar.className = "no-print";
    printBar.style.cssText = "display:flex;justify-content:center;gap:12px;margin-bottom:16px;";
    const printBtn = document.createElement("button");
    printBtn.textContent = "Print Report";
    printBtn.style.cssText = "padding:10px 28px;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;border:1px solid #334155;background:#1e293b;color:#e2e8f0;transition:background 0.15s;";
    printBtn.addEventListener("click", () => window.print());
    printBtn.addEventListener("mouseenter", () => { printBtn.style.background = "#334155"; });
    printBtn.addEventListener("mouseleave", () => { printBtn.style.background = "#1e293b"; });

    const shareBtn = document.createElement("button");
    shareBtn.textContent = "Copy Share Link";
    shareBtn.style.cssText = "padding:10px 28px;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;border:none;background:#3b82f6;color:#fff;transition:background 0.15s;";
    shareBtn.addEventListener("click", () => {
      const url = new URL(location.href);
      url.searchParams.set("vin", data.vehicle.vin);
      url.searchParams.set("price", String(data.askingPrice));
      url.searchParams.set("miles", String(data.vehicle.miles));
      navigator.clipboard.writeText(url.toString()).then(() => {
        shareBtn.textContent = "Copied!";
        setTimeout(() => { shareBtn.textContent = "Copy Share Link"; }, 2000);
      });
    });
    shareBtn.addEventListener("mouseenter", () => { shareBtn.style.background = "#2563eb"; });
    shareBtn.addEventListener("mouseleave", () => { shareBtn.style.background = "#3b82f6"; });

    printBar.appendChild(printBtn);
    printBar.appendChild(shareBtn);
    results.appendChild(printBar);

    // ── Section 7: Printable Footer ──
    const footer = document.createElement("div");
    footer.style.cssText = "text-align:center;padding:20px;border-top:1px solid #334155;margin-top:8px;";
    footer.innerHTML = `
      <div style="font-size:12px;color:#94a3b8;font-weight:600;">Powered by <span style="color:#10b981;">MarketCheck</span></div>
      <div style="font-size:10px;color:#475569;margin-top:4px;">Data sourced from ${fmtNumber(data.marketSummary.totalSimilar)} comparable vehicles | Report generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
      <div style="font-size:9px;color:#334155;margin-top:8px;">This report is generated from publicly available market data and ML-predicted values. Actual transaction prices may vary. Not a guarantee of value.</div>
    `;
    results.appendChild(footer);
  }

  // ── Scrollbar Styles ──
  const style = document.createElement("style");
  style.textContent = `
    @media (max-width: 900px) {
      #results [style*="grid-template-columns:repeat(4"] { grid-template-columns: repeat(2,1fr) !important; }
    }
    ::-webkit-scrollbar { height: 6px; }
    ::-webkit-scrollbar-track { background: #1e293b; border-radius: 3px; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #475569; }
  `;
  document.head.appendChild(style);
}

main();
