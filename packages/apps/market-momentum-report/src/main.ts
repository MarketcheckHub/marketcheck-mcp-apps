/**
 * Market Momentum Report — Monthly OEM executive briefing dashboard.
 * Month-over-month brand momentum, segment mix shifts, pricing power, days-supply,
 * and active incentives. Manufacturer segment.
 */
import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "market-momentum-report" }); } catch {}

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
  for (const key of ["myBrand", "brand", "state", "embed"]) {
    const v = params.get(key);
    if (v) result[key] = v;
  }
  // Alias: brand → myBrand
  if (!result.myBrand && result.brand) result.myBrand = result.brand;
  return result;
}

function _proxyBase(): string {
  return location.protocol.startsWith("http") ? "" : "http://localhost:3001";
}

// ── Direct MarketCheck API Client (browser → api.marketcheck.com) ──────
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
function _mcDecode(vin: string) { return _mcApi("/decode/car/neovin/" + vin + "/specs"); }
function _mcPredict(p: any) { return _mcApi("/predict/car/us/marketcheck_price/comparables", p); }
function _mcActive(p: any) { return _mcApi("/search/car/active", p); }
function _mcRecent(p: any) { return _mcApi("/search/car/recents", p); }
function _mcHistory(vin: string) { return _mcApi("/history/car/" + vin); }
function _mcSold(p: any) { return _mcApi("/api/v1/sold-vehicles/summary", p); }
function _mcIncentives(p: any) { const q: any = { ...p }; if (q.oem && !q.make) { q.make = q.oem; delete q.oem; } return _mcApi("/search/car/incentive/oem", q); }
function _mcUkActive(p: any) { return _mcApi("/search/car/uk/active", p); }
function _mcUkRecent(p: any) { return _mcApi("/search/car/uk/recents", p); }

// ── Inlined: generateMonthlyRanges (from packages/shared/src/index-calculator.ts) ─
function generateMonthlyRanges(monthsBack: number, fromDate?: Date) {
  const now = fromDate ?? new Date();
  const ranges: Array<{ date: string; dateFrom: string; dateTo: string }> = [];
  for (let i = monthsBack; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    ranges.push({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      dateFrom: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
      dateTo: `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`,
    });
  }
  return ranges;
}

// ── Inlined: calculateDaysSupply (from packages/shared/src/index-calculator.ts) ─
function calculateDaysSupply(activeCount: number, monthlySold: number): number {
  if (!monthlySold || monthlySold === 0) return 999;
  return Math.round((activeCount / monthlySold) * 30);
}

// ── _fetchDirect — 2 parallel waves of MC API calls ────────────────────
async function _fetchDirect(args: { myBrand: string; state?: string }): Promise<any> {
  const ranges = generateMonthlyRanges(2); // [prior, current]
  const prior = ranges[0];
  const current = ranges[1];
  const state = args.state && args.state !== "National" ? args.state : undefined;

  // Wave 1: 4 parallel sold-summary calls (current/prior × make/body_type).
  // ranking_measure is SINGULAR per MC API — other fields (avg_sale_price, price_over_msrp_percentage,
  // average_days_on_market) are always present on response rows regardless of what you rank by.
  const [priorMakes, currentMakes, currentSegments, priorSegments] = await Promise.all([
    _mcSold({ state, date_from: prior.dateFrom, date_to: prior.dateTo, ranking_dimensions: "make", ranking_measure: "sold_count", top_n: 25 }).catch(() => null),
    _mcSold({ state, date_from: current.dateFrom, date_to: current.dateTo, ranking_dimensions: "make", ranking_measure: "sold_count", top_n: 25 }).catch(() => null),
    _mcSold({ state, date_from: current.dateFrom, date_to: current.dateTo, ranking_dimensions: "body_type", ranking_measure: "sold_count", top_n: 15 }).catch(() => null),
    _mcSold({ state, date_from: prior.dateFrom, date_to: prior.dateTo, ranking_dimensions: "body_type", ranking_measure: "sold_count", top_n: 15 }).catch(() => null),
  ]);

  // Check myBrand presence in currentMakes + priorMakes. If missing, fire scoped
  // follow-up calls IN PARALLEL with Wave 2 so happy-path latency is unchanged.
  // Promise.all accepts non-Promise values (resolves immediately) → null slots add 0ms.
  const myBrandLower = args.myBrand.toLowerCase();
  const sameBrand = (a: any) => String(a ?? "").toLowerCase() === myBrandLower;
  const curData = Array.isArray((currentMakes as any)?.data) ? (currentMakes as any).data : [];
  const priData = Array.isArray((priorMakes as any)?.data) ? (priorMakes as any).data : [];
  const hasMyBrandCurrent = curData.some((r: any) => sameBrand(r.make));
  const hasMyBrandPrior = priData.some((r: any) => sameBrand(r.make));

  // Wave 2: pricing power + active inventory + incentives (always)
  // + conditional currentMakes/priorMakes scoped to myBrand (only if missing from top-25).
  // Fold all 5 into one Promise.all — max wall-clock = max of whichever real Promises exist.
  const [pricingPower, activeInv, incentives, myBrandCurrent, myBrandPrior] = await Promise.all([
    _mcSold({ state, date_from: current.dateFrom, date_to: current.dateTo, ranking_dimensions: "make", ranking_measure: "price_over_msrp_percentage", ranking_order: "desc", top_n: 25 }).catch(() => null),
    _mcActive({ make: args.myBrand, state, rows: 50, stats: "price,miles,dom", facets: "model,body_type" }).catch(() => null),
    _mcIncentives({ oem: args.myBrand }).catch(() => null),
    hasMyBrandCurrent ? null : _mcSold({ state, date_from: current.dateFrom, date_to: current.dateTo, make: args.myBrand, ranking_dimensions: "make", ranking_measure: "sold_count", top_n: 1 }).catch(() => null),
    hasMyBrandPrior   ? null : _mcSold({ state, date_from: prior.dateFrom,   date_to: prior.dateTo,   make: args.myBrand, ranking_dimensions: "make", ranking_measure: "sold_count", top_n: 1 }).catch(() => null),
  ]);

  // Wave 2b (CONDITIONAL): if myBrand didn't make it into the top-25 pricing-power
  // ranking, fire one more scoped call so the scatter always includes myBrand.
  // Sequential after Wave 2 because we need Wave 2's pricingPower result to decide.
  const ppData = Array.isArray((pricingPower as any)?.data) ? (pricingPower as any).data : [];
  const hasMyBrandPricing = ppData.some((r: any) => sameBrand(r.make));
  let myBrandPricing: any = null;
  if (!hasMyBrandPricing) {
    myBrandPricing = await _mcSold({
      state,
      date_from: current.dateFrom,
      date_to: current.dateTo,
      make: args.myBrand,
      ranking_dimensions: "make",
      ranking_measure: "price_over_msrp_percentage",
      top_n: 1,
    }).catch(() => null);
  }

  return {
    myBrand: args.myBrand,
    state: state ?? null,
    month: current.date,
    priorMakes, currentMakes, currentSegments, priorSegments,
    myBrandCurrent, myBrandPrior,
    pricingPower, myBrandPricing, activeInv, incentives,
  };
}

// ── _callTool — 4-step fallback: MCP → direct → proxy → null (→ mock) ─
async function _callTool(toolName: string, args: any): Promise<any> {
  const mode = _detectAppMode();

  // 1. MCP mode — only when actually in MCP host (gate by mode, and await so rejection is caught)
  if (mode === "mcp" && _safeApp) {
    try {
      const r = await _safeApp.callServerTool({ name: toolName, arguments: args });
      if (r) return r;
    } catch { /* fall through */ }
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
      const r = await fetch(_proxyBase() + "/api/proxy/" + toolName, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, _auth_mode: auth.mode, _auth_value: auth.value }),
      });
      if (r.ok) { const d = await r.json(); return { content: [{ type: "text", text: JSON.stringify(d) }] }; }
    } catch { /* fall through */ }
  }

  // 4. Demo mode — caller falls back to mock
  return null;
}

// ── Settings bar (mode badge + gear + API key panel) ───────────────────
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
      <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px;">MarketCheck Enterprise API Key</label>
      <input id="_mc_key_inp" type="password" placeholder="Enter your API key" value="${_getAuth().mode === "api_key" ? _getAuth().value ?? "" : ""}"
        style="width:100%;padding:8px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;margin-bottom:8px;box-sizing:border-box;" />
      <div style="font-size:10px;color:#64748b;margin-bottom:12px;">Get a free key at <a href="https://developers.marketcheck.com" target="_blank" style="color:#60a5fa;">developers.marketcheck.com</a> — sold-summary requires Enterprise tier.</div>
      <div style="display:flex;gap:8px;">
        <button id="_mc_save" style="flex:1;padding:8px;border-radius:6px;border:none;background:#ef4444;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Save & Reload</button>
        <button id="_mc_clear" style="padding:8px 12px;border-radius:6px;border:1px solid #334155;background:transparent;color:#94a3b8;font-size:13px;cursor:pointer;">Clear</button>
      </div>`;
    gear.addEventListener("click", () => { panel.style.display = panel.style.display === "none" ? "block" : "none"; });
    document.addEventListener("click", (e) => { if (!panel.contains(e.target as Node) && e.target !== gear) panel.style.display = "none"; });
    document.body.appendChild(panel);
    setTimeout(() => {
      document.getElementById("_mc_save")?.addEventListener("click", () => {
        const k = (document.getElementById("_mc_key_inp") as HTMLInputElement)?.value?.trim();
        if (k) { localStorage.setItem("mc_api_key", k); location.reload(); }
      });
      document.getElementById("_mc_clear")?.addEventListener("click", () => {
        localStorage.removeItem("mc_api_key"); localStorage.removeItem("mc_access_token"); location.reload();
      });
    }, 0);
    bar.appendChild(gear);
  }
  headerEl.appendChild(bar);
}

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
      [style*="display:flex"][style*="gap"],
      [style*="display: flex"][style*="gap"] { flex-wrap: wrap !important; }
      [style*="grid-template-columns: repeat"] { grid-template-columns: 1fr !important; }
      [style*="grid-template-columns:repeat"] { grid-template-columns: 1fr !important; }
      div[style*="overflow-x:auto"], div[style*="overflow-x: auto"] { -webkit-overflow-scrolling: touch; }
      table { min-width: 600px; }
      [style*="width:60%"], [style*="width:40%"],
      [style*="width: 60%"], [style*="width: 40%"] { width: 100% !important; min-width: 0 !important; }
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

// ── Formatters ─────────────────────────────────────────────────────────
function fmt$(v: number): string {
  if (!isFinite(v) || v === 0) return "—";
  if (Math.abs(v) >= 1_000_000) return "$" + (v / 1_000_000).toFixed(2) + "M";
  if (Math.abs(v) >= 10_000) return "$" + (v / 1000).toFixed(1) + "K";
  return "$" + Math.round(v).toLocaleString("en-US");
}
function fmtN(v: number): string {
  if (!isFinite(v)) return "—";
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M";
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return v.toLocaleString("en-US");
}
function fmtPct(v: number, decimals = 1): string {
  if (!isFinite(v)) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(decimals) + "%";
}
function fmtBps(v: number): string {
  if (!isFinite(v)) return "— bps";
  const sign = v > 0 ? "+" : "";
  return sign + Math.round(v) + " bps";
}
function trendArrow(v: number): string {
  if (!isFinite(v) || v === 0) return "—";
  return v > 0 ? "▲" : "▼";
}
function trendColor(v: number, invertGood = false): string {
  if (!isFinite(v) || v === 0) return "#94a3b8";
  const positive = invertGood ? v < 0 : v > 0;
  return positive ? "#22c55e" : "#ef4444";
}

// ── Constants ──────────────────────────────────────────────────────────
const STATES = [
  "National","AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY",
  "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

// Canonical list of OEMs that run incentive programs (30 brands).
// Ordered alphabetically. Ford used as the default for first load (common anchor brand).
const BRAND_OPTIONS = [
  "Acura", "Audi", "BMW", "Buick", "Cadillac", "Chevrolet", "Chrysler", "Dodge",
  "Fiat", "Ford", "Genesis", "GMC", "Honda", "Hyundai", "Infiniti", "Jaguar",
  "Jeep", "Kia", "Land Rover", "Lexus", "Lincoln", "Mazda", "Mini", "Mitsubishi",
  "Nissan", "Porsche", "RAM", "Subaru", "Toyota", "Volvo",
];
const DEFAULT_BRAND = "Ford";

const SEGMENT_COLORS: Record<string, string> = {
  "SUV": "#3b82f6",
  "Pickup": "#f59e0b",
  "Sedan": "#8b5cf6",
  "Crossover": "#14b8a6",
  "Coupe": "#ef4444",
  "Van": "#10b981",
  "Truck": "#f59e0b",
  "EV": "#22c55e",
  "Hatchback": "#a78bfa",
  "Convertible": "#f472b6",
  "Wagon": "#fb923c",
  "Other": "#6b7280",
};

const MY_BRAND_COLOR = "#ef4444";
const OTHER_BRAND_COLOR = "#3b82f6";

// ── Types ──────────────────────────────────────────────────────────────
interface BrandRow {
  make: string;
  soldCount: number;
  priorSoldCount: number;
  sharePct: number;
  priorSharePct: number;
  avgSalePrice: number;
  momVolumePctDelta: number;
  momSharebpsDelta: number;
  isMyBrand: boolean;
}

interface SegmentRow {
  bodyType: string;
  currentCount: number;
  priorCount: number;
  currentSharePct: number;
  priorSharePct: number;
  bpsDelta: number;
}

interface PricingRow {
  make: string;
  priceOverMsrpPct: number;
  soldCount: number;
  avgDom: number;
  isMyBrand: boolean;
}

interface Incentive {
  title: string;
  offerType: string;          // "LEASE_SPECIAL" | "LOW_APR" | "CASH_BACK" | "OFFER"
  amount: number;              // $/mo for lease, % APR for finance, $ cashback for cash
  term?: number;               // months — populated for lease + finance
  termUnit?: string;           // "months" / "years"
  msrp?: number;               // vehicle MSRP (from offer) — for richer card display
  endDate: string;
  description: string;
  vehicle?: string;            // "2026 Macan Electric" etc.
}

interface Kpis {
  totalMarketVolume: number;
  myShareBps: number;
  myShareBpsDelta: number;
  pricingPowerPct: number;
  daysSupply: number;
}

interface ReportData {
  myBrand: string;
  state: string | null;
  month: string;
  kpis: Kpis;
  brandMomentum: BrandRow[];
  segmentMix: SegmentRow[];
  pricingPower: PricingRow[];
  activeIncentives: Incentive[];
  signals: string[];
  mode: "demo" | "live" | "mcp";
  partial: boolean; // true if some enterprise calls failed
}

// ── Mock data generator (parametric on myBrand) ────────────────────────
function getMockData(args: { myBrand: string; state?: string | null }): ReportData {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Top brands with baseline current-month volumes (realistic US market shape)
  const baseBrands: Array<{ make: string; curVol: number; priorVol: number; asp: number; pomp: number }> = [
    { make: "Toyota",        curVol: 215_000, priorVol: 207_000, asp: 38500, pomp: 101.2 },
    { make: "Ford",          curVol: 178_000, priorVol: 184_000, asp: 42100, pomp: 97.4 },
    { make: "Chevrolet",     curVol: 156_000, priorVol: 161_000, asp: 40300, pomp: 96.1 },
    { make: "Honda",         curVol: 142_000, priorVol: 135_000, asp: 35200, pomp: 100.5 },
    { make: "Hyundai",       curVol: 102_000, priorVol: 99_500,  asp: 32400, pomp: 98.8 },
    { make: "Kia",           curVol: 92_500,  priorVol: 90_100,  asp: 31100, pomp: 97.6 },
    { make: "Nissan",        curVol: 88_300,  priorVol: 91_800,  asp: 33700, pomp: 95.9 },
    { make: "Jeep",          curVol: 72_100,  priorVol: 76_900,  asp: 44800, pomp: 98.9 },
    { make: "GMC",           curVol: 58_200,  priorVol: 56_400,  asp: 52300, pomp: 99.1 },
    { make: "Ram",           curVol: 56_800,  priorVol: 58_300,  asp: 55100, pomp: 99.8 },
    { make: "Tesla",         curVol: 54_500,  priorVol: 49_300,  asp: 48900, pomp: 103.2 },
    { make: "Subaru",        curVol: 48_700,  priorVol: 47_100,  asp: 34200, pomp: 100.7 },
    { make: "BMW",           curVol: 32_400,  priorVol: 31_900,  asp: 58700, pomp: 104.3 },
    { make: "Mercedes-Benz", curVol: 29_800,  priorVol: 30_200,  asp: 62400, pomp: 103.1 },
    { make: "Volkswagen",    curVol: 27_500,  priorVol: 28_800,  asp: 36800, pomp: 98.2 },
    { make: "Mazda",         curVol: 26_400,  priorVol: 25_800,  asp: 33100, pomp: 99.6 },
    { make: "Audi",          curVol: 18_900,  priorVol: 19_400,  asp: 55200, pomp: 102.4 },
    { make: "Lexus",         curVol: 23_100,  priorVol: 21_800,  asp: 51900, pomp: 102.9 },
  ];

  // GM is not in the raw list (it's a parent co); alias to Chevrolet/GMC combined
  // Otherwise inject myBrand if not present
  const myBrandLower = args.myBrand.toLowerCase();
  let brands = baseBrands.slice();
  if (myBrandLower === "gm") {
    // combine Chevrolet + GMC + Buick + Cadillac visually as "GM" (add GM row + keep children)
    brands.unshift({ make: "GM", curVol: 214_200, priorVol: 217_400, asp: 44800, pomp: 97.6 });
  } else if (!brands.some(b => b.make.toLowerCase() === myBrandLower)) {
    brands.unshift({
      make: args.myBrand,
      curVol: 45_000 + Math.round(Math.random() * 30_000),
      priorVol: 42_000 + Math.round(Math.random() * 30_000),
      asp: 38_000 + Math.round(Math.random() * 18_000),
      pomp: 99 + Math.random() * 4,
    });
  }

  const totalCur = brands.reduce((s, b) => s + b.curVol, 0);
  const totalPrior = brands.reduce((s, b) => s + b.priorVol, 0);

  const brandMomentum: BrandRow[] = brands.map(b => {
    const cur = b.curVol;
    const prior = b.priorVol;
    const sharePct = (cur / totalCur) * 100;
    const priorSharePct = (prior / totalPrior) * 100;
    const bpsDelta = (sharePct - priorSharePct) * 100;
    const volDelta = prior > 0 ? ((cur - prior) / prior) * 100 : 0;
    return {
      make: b.make,
      soldCount: cur,
      priorSoldCount: prior,
      sharePct,
      priorSharePct,
      avgSalePrice: b.asp,
      momVolumePctDelta: volDelta,
      momSharebpsDelta: bpsDelta,
      isMyBrand: b.make.toLowerCase() === myBrandLower,
    };
  });

  // Sort: myBrand first, then by absolute bps delta desc; keep top 15
  const myRow = brandMomentum.find(b => b.isMyBrand);
  const rest = brandMomentum.filter(b => !b.isMyBrand).sort((a, b) => Math.abs(b.momSharebpsDelta) - Math.abs(a.momSharebpsDelta));
  const topBrands = (myRow ? [myRow, ...rest] : rest).slice(0, 15);

  // Segment mix
  const segments: SegmentRow[] = [
    { bodyType: "SUV",        currentCount: 425_000, priorCount: 409_000, currentSharePct: 35.4, priorSharePct: 34.8, bpsDelta: 60 },
    { bodyType: "Pickup",     currentCount: 238_000, priorCount: 246_000, currentSharePct: 19.8, priorSharePct: 20.9, bpsDelta: -110 },
    { bodyType: "Sedan",      currentCount: 265_000, priorCount: 278_000, currentSharePct: 22.1, priorSharePct: 23.6, bpsDelta: -150 },
    { bodyType: "Crossover",  currentCount: 168_000, priorCount: 155_000, currentSharePct: 14.0, priorSharePct: 13.2, bpsDelta: 80 },
    { bodyType: "EV",         currentCount: 78_000,  priorCount: 68_000,  currentSharePct: 6.5,  priorSharePct: 5.8,  bpsDelta: 70 },
    { bodyType: "Other",      currentCount: 26_000,  priorCount: 20_000,  currentSharePct: 2.2,  priorSharePct: 1.7,  bpsDelta: 50 },
  ];

  // Pricing power — use the brands we have with their pomp
  const pricingPower: PricingRow[] = brands.slice(0, 15).map(b => ({
    make: b.make,
    priceOverMsrpPct: b.pomp,
    soldCount: b.curVol,
    avgDom: 22 + Math.round(Math.random() * 40),
    isMyBrand: b.make.toLowerCase() === myBrandLower,
  })).sort((a, b) => b.soldCount - a.soldCount);

  // Incentives — mock in the same shape the real API produces, formatted for display.
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const endDateStr = `${String(endDate.getMonth() + 1).padStart(2, "0")}/${String(endDate.getDate()).padStart(2, "0")}/${endDate.getFullYear()}`;
  const activeIncentives: Incentive[] = [
    { title: `$2,000 Cash Back on new ${args.myBrand} models`, offerType: "CASH_BACK", amount: 2000, endDate: endDateStr, description: "Retail customers only. Must take new retail delivery from dealer stock. Not compatible with special lease or APR offers. See dealer for complete details." },
    { title: `1.9% APR for 60 months`, offerType: "LOW_APR", amount: 1.9, term: 60, termUnit: "months", endDate: endDateStr, description: "Well-qualified buyers through captive finance. Monthly payment is $17.48 per $1,000 financed for 60 months. Down payment may be required. Actual rates, terms may vary." },
    { title: `2026 Lease Special, 36 months`, offerType: "LEASE_SPECIAL", amount: 349, term: 36, termUnit: "months", msrp: 38500, endDate: endDateStr, description: "$2,999 due at signing, 10,000 mi/yr. Closed-end lease offered to qualified lessees. Excess mileage fee of $0.25/mi. Security deposit waived for qualified lessees." },
    { title: `$500 Loyalty Bonus`, offerType: "LOYALTY", amount: 500, endDate: endDateStr, description: `Current ${args.myBrand} owners with active registration. Combinable with most other offers. See dealer for eligibility requirements.` },
    { title: `$1,000 Conquest Offer`, offerType: "CONQUEST", amount: 1000, endDate: endDateStr, description: "Available to buyers trading from a competitor brand. Proof of current vehicle registration required at time of purchase. Not compatible with loyalty programs." },
  ];

  // KPIs
  const myBrandRow = topBrands.find(b => b.isMyBrand);
  const myBrandMonthlySold = myBrandRow?.soldCount ?? 50_000;
  // Realistic mock: active inventory should represent ~30-75 days of supply.
  // Formula: activeInv = monthlySold * (daysTarget / 30) where daysTarget ∈ [30, 75].
  const mockDaysTarget = 30 + Math.round(Math.random() * 45);
  const myBrandActive = Math.round(myBrandMonthlySold * (mockDaysTarget / 30));
  const daysSupply = calculateDaysSupply(myBrandActive, myBrandMonthlySold);

  const kpis: Kpis = {
    totalMarketVolume: totalCur,
    myShareBps: myBrandRow ? myBrandRow.sharePct * 100 : 0,
    myShareBpsDelta: myBrandRow ? myBrandRow.momSharebpsDelta : 0,
    pricingPowerPct: pricingPower.find(p => p.isMyBrand)?.priceOverMsrpPct ?? 100,
    daysSupply,
  };

  const signals = generateSignals({ myBrand: args.myBrand, state: args.state ?? null, kpis, brandMomentum: topBrands, segmentMix: segments, pricingPower, activeIncentives });

  return {
    myBrand: args.myBrand,
    state: args.state ?? null,
    month,
    kpis,
    brandMomentum: topBrands,
    segmentMix: segments,
    pricingPower,
    activeIncentives,
    signals,
    mode: "demo",
    partial: false,
  };
}

// ── Signal generator (rule-based insights) ─────────────────────────────
function generateSignals(d: {
  myBrand: string; state: string | null;
  kpis: Kpis; brandMomentum: BrandRow[];
  segmentMix: SegmentRow[]; pricingPower: PricingRow[];
  activeIncentives: Incentive[];
}): string[] {
  const sigs: string[] = [];
  const scope = d.state ? d.state : "the US";

  // Share direction
  const sd = d.kpis.myShareBpsDelta;
  if (isFinite(sd) && sd !== 0) {
    const dir = sd > 0 ? "up" : "down";
    sigs.push(`Your share is ${dir} ${Math.abs(Math.round(sd))} bps MoM in ${scope}.`);
  }

  // Strongest growth segment
  const gainers = d.segmentMix.filter(s => s.bpsDelta > 0).sort((a, b) => b.bpsDelta - a.bpsDelta);
  if (gainers.length > 0) {
    sigs.push(`Strongest growth segment: ${gainers[0].bodyType} (+${Math.round(gainers[0].bpsDelta)} bps MoM).`);
  }
  const decliners = d.segmentMix.filter(s => s.bpsDelta < 0).sort((a, b) => a.bpsDelta - b.bpsDelta);
  if (decliners.length > 0) {
    sigs.push(`Largest decline: ${decliners[0].bodyType} (${Math.round(decliners[0].bpsDelta)} bps MoM).`);
  }

  // Pricing power
  const pp = d.kpis.pricingPowerPct;
  if (isFinite(pp) && pp > 0) {
    if (pp >= 102) sigs.push(`Pricing power above parity: ${pp.toFixed(1)}% of MSRP — demand premium intact.`);
    else if (pp < 98) sigs.push(`Pricing power below parity: ${pp.toFixed(1)}% of MSRP — discounting pressure detected.`);
    else sigs.push(`Pricing power near parity: ${pp.toFixed(1)}% of MSRP.`);
  }

  // Days of supply
  const ds = d.kpis.daysSupply;
  if (isFinite(ds) && ds > 0 && ds < 999) {
    const label = ds < 45 ? "HEALTHY" : ds <= 75 ? "WATCH" : "GLUT";
    sigs.push(`Days of supply: ${ds} days (${label}).`);
  }

  // Conquest threat
  const threats = d.brandMomentum
    .filter(b => !b.isMyBrand && b.momSharebpsDelta > 20)
    .sort((a, b) => b.momSharebpsDelta - a.momSharebpsDelta);
  if (threats.length > 0) {
    sigs.push(`Conquest threat: ${threats[0].make} gained +${Math.round(threats[0].momSharebpsDelta)} bps.`);
  }

  // Incentives breadth
  if (d.activeIncentives.length > 0) {
    const types = new Set(d.activeIncentives.map(i => i.offerType));
    sigs.push(`${d.activeIncentives.length} active ${d.myBrand} incentive programs (${types.size} offer types).`);
  }

  return sigs;
}

// ── Transform raw API payload → ReportData ─────────────────────────────
function _transformToReport(raw: any, args: { myBrand: string; state?: string | null }): ReportData {
  const myBrandLower = args.myBrand.toLowerCase();
  const month = raw.month ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  let partial = false;

  // ─── Brand momentum ───
  // If myBrand was outside the top-25 in current/prior, the conditional fetch
  // (myBrandCurrent / myBrandPrior) supplies its row. Merge before aggregation so
  // Share KPI, Days-of-Supply denominator, and Brand Momentum table all see myBrand.
  let priorMakeRows: any[] = raw.priorMakes?.data ?? [];
  let currentMakeRows: any[] = raw.currentMakes?.data ?? [];
  if (raw.myBrandCurrent?.data?.length &&
      !currentMakeRows.some((r: any) => String(r.make ?? "").toLowerCase() === myBrandLower)) {
    currentMakeRows = [...currentMakeRows, raw.myBrandCurrent.data[0]];
  }
  if (raw.myBrandPrior?.data?.length &&
      !priorMakeRows.some((r: any) => String(r.make ?? "").toLowerCase() === myBrandLower)) {
    priorMakeRows = [...priorMakeRows, raw.myBrandPrior.data[0]];
  }
  if (!priorMakeRows.length || !currentMakeRows.length) partial = true;

  const priorMakeMap: Record<string, number> = {};
  for (const r of priorMakeRows) {
    const k = (r.make ?? "").toString();
    if (!k) continue;
    priorMakeMap[k] = (priorMakeMap[k] ?? 0) + (r.sold_count ?? 0);
  }
  // currentMakeMap aggregates by make across (possibly state-bucketed) rows. ASP is
  // weighted-averaged by sold_count so the Brand Momentum "Avg Price" column reflects
  // the true national avg, not whichever state was processed last.
  const currentMakeMap: Record<string, { count: number; asp: number; aspWeightedSum: number }> = {};
  for (const r of currentMakeRows) {
    const k = (r.make ?? "").toString();
    if (!k) continue;
    if (!currentMakeMap[k]) currentMakeMap[k] = { count: 0, asp: 0, aspWeightedSum: 0 };
    const cnt = r.sold_count ?? 0;
    currentMakeMap[k].count += cnt;
    if (typeof r.average_sale_price === "number" && isFinite(r.average_sale_price) && cnt > 0) {
      currentMakeMap[k].aspWeightedSum += r.average_sale_price * cnt;
    }
  }
  // Compute weighted-avg ASP after all rows aggregated
  for (const v of Object.values(currentMakeMap)) {
    v.asp = v.count > 0 ? v.aspWeightedSum / v.count : 0;
  }
  const totalCur = Object.values(currentMakeMap).reduce((s, v) => s + v.count, 0) || 1;
  const totalPrior = Object.values(priorMakeMap).reduce((s, v) => s + v, 0) || 1;

  const brandRows: BrandRow[] = Object.entries(currentMakeMap).map(([make, v]) => {
    const prior = priorMakeMap[make] ?? 0;
    const sharePct = (v.count / totalCur) * 100;
    const priorSharePct = (prior / totalPrior) * 100;
    const bpsDelta = (sharePct - priorSharePct) * 100;
    const volDelta = prior > 0 ? ((v.count - prior) / prior) * 100 : 0;
    return {
      make,
      soldCount: v.count,
      priorSoldCount: prior,
      sharePct,
      priorSharePct,
      avgSalePrice: v.asp,
      momVolumePctDelta: volDelta,
      momSharebpsDelta: bpsDelta,
      isMyBrand: make.toLowerCase() === myBrandLower,
    };
  });

  const myRow = brandRows.find(b => b.isMyBrand);
  const rest = brandRows.filter(b => !b.isMyBrand).sort((a, b) => Math.abs(b.momSharebpsDelta) - Math.abs(a.momSharebpsDelta));
  const brandMomentum = (myRow ? [myRow, ...rest] : rest).slice(0, 15);

  // ─── Segment mix ───
  const curSegRows: any[] = raw.currentSegments?.data ?? [];
  const priorSegRows: any[] = raw.priorSegments?.data ?? [];
  if (!curSegRows.length) partial = true;
  const curSegMap: Record<string, number> = {};
  for (const r of curSegRows) {
    const bt = (r.body_type ?? "Other").toString();
    curSegMap[bt] = (curSegMap[bt] ?? 0) + (r.sold_count ?? 0);
  }
  const priorSegMap: Record<string, number> = {};
  for (const r of priorSegRows) {
    const bt = (r.body_type ?? "Other").toString();
    priorSegMap[bt] = (priorSegMap[bt] ?? 0) + (r.sold_count ?? 0);
  }
  const curSegTotal = Object.values(curSegMap).reduce((s, v) => s + v, 0) || 1;
  const priorSegTotal = Object.values(priorSegMap).reduce((s, v) => s + v, 0) || 1;
  const segmentMix: SegmentRow[] = Object.entries(curSegMap)
    .map(([bt, count]) => {
      const prior = priorSegMap[bt] ?? 0;
      const curShare = (count / curSegTotal) * 100;
      const priorShare = (prior / priorSegTotal) * 100;
      return {
        bodyType: bt,
        currentCount: count,
        priorCount: prior,
        currentSharePct: curShare,
        priorSharePct: priorShare,
        bpsDelta: (curShare - priorShare) * 100,
      };
    })
    .sort((a, b) => b.currentCount - a.currentCount)
    .slice(0, 8);

  // ─── Pricing power ───
  // MC's /api/v1/sold-vehicles/summary defaults to summary_by="state", so National
  // queries return one row per (make, state) — multiple rows per brand. Without
  // aggregation, each Toyota state row would render as its own red bubble on the scatter.
  // Mirror the used-car-market-index pattern: accumulate volume-weighted totals by make.
  // Also merge the Wave 2b conditional myBrandPricing row if myBrand wasn't in top-25.
  let ppRows: any[] = raw.pricingPower?.data ?? [];
  if (!ppRows.length) partial = true;
  const myBrandInPp = ppRows.some(r => String(r.make ?? "").toLowerCase() === myBrandLower);
  if (!myBrandInPp && raw.myBrandPricing?.data?.length) {
    ppRows = [...ppRows, raw.myBrandPricing.data[0]];
  }
  // API returns price_over_msrp_percentage as a signed delta from 0 (0.09 = +0.09% over MSRP;
  // -6.0 = 6% below). Weighted-avg these deltas by sold_count, then add 100 to convert to
  // ratio-from-100 so downstream filter/axis/KPI (all 100-centered by design) work unchanged.
  const ppByMake: Record<string, { make: string; ppSum: number; vol: number; domSum: number; domVol: number }> = {};
  for (const r of ppRows) {
    const make = (r.make ?? "").toString();
    if (!make) continue;
    if (!ppByMake[make]) ppByMake[make] = { make, ppSum: 0, vol: 0, domSum: 0, domVol: 0 };
    const pp = r.price_over_msrp_percentage;
    const vol = r.sold_count ?? 0;
    const dom = r.average_days_on_market;
    if (typeof pp === "number" && isFinite(pp) && vol > 0) ppByMake[make].ppSum += pp * vol;
    if (vol > 0) ppByMake[make].vol += vol;
    if (typeof dom === "number" && isFinite(dom) && vol > 0) {
      ppByMake[make].domSum += dom * vol;
      ppByMake[make].domVol += vol;
    }
  }
  // MC's top_n caps rows PER GROUP (per state) not per result, and summary_by=state
  // is the default — so an unfiltered national query aggregates to ~40 unique makes,
  // many of them luxury micro-brands selling <50 units nationally. Keep the scatter
  // focused: top 20 by volume + always pin myBrand (mirrors Brand Momentum's approach).
  const allPricingMakes: PricingRow[] = Object.values(ppByMake)
    .filter(v => v.vol > 0)
    .map(v => ({
      make: v.make,
      priceOverMsrpPct: 100 + v.ppSum / v.vol,
      soldCount: v.vol,
      avgDom: v.domVol > 0 ? v.domSum / v.domVol : 0,
      isMyBrand: v.make.toLowerCase() === myBrandLower,
    }))
    .filter(p => p.make && p.priceOverMsrpPct > 0);
  const topByVol = [...allPricingMakes].sort((a, b) => b.soldCount - a.soldCount).slice(0, 20);
  const myBrandRowPp = allPricingMakes.find(p => p.isMyBrand);
  const topSet = new Set(topByVol.map(p => p.make.toLowerCase()));
  const pricingPower: PricingRow[] =
    myBrandRowPp && !topSet.has(myBrandRowPp.make.toLowerCase())
      ? [...topByVol, myBrandRowPp]
      : topByVol;

  // ─── Active inventory → daysSupply ───
  const activeNumFound = raw.activeInv?.num_found ?? 0;
  const myBrandMonthlySold = currentMakeMap[args.myBrand]?.count ?? myRow?.soldCount ?? 0;
  const daysSupply = calculateDaysSupply(activeNumFound, myBrandMonthlySold);

  // ─── Incentives ───
  // MC /search/car/incentive/oem real shape:
  //   { num_found, listings: [{ id, base_sha, offer: { titles[], offer_type, amounts[{monthly, apr, term, term_unit}],
  //     cashback_amount?, valid_through, offers[], disclaimers[], vehicles[], msrp }, ... }] }
  // Same program appears once per ZIP → dedupe by base_sha to show 1 card per program.
  const listings: any[] = Array.isArray(raw.incentives?.listings) ? raw.incentives.listings : [];
  const seenSha = new Set<string>();
  const uniqueListings = listings.filter((l: any) => {
    const key = l?.base_sha ?? l?.offer?.oem_program_name ?? l?.id;
    if (!key || seenSha.has(key)) return false;
    seenSha.add(key);
    return true;
  });

  const activeIncentives: Incentive[] = uniqueListings.slice(0, 6).map((l: any) => {
    const off = l.offer ?? {};
    const veh = Array.isArray(off.vehicles) && off.vehicles.length > 0 ? off.vehicles[0] : null;
    const amt = Array.isArray(off.amounts) && off.amounts.length > 0 ? off.amounts[0] : null;

    // Title: prefer titles[0] (real data always has it), then program name, then vehicle string
    const vehicleStr = veh ? [veh.year, veh.make, veh.model, veh.trim].filter(Boolean).join(" ") : "";
    const title = (Array.isArray(off.titles) && off.titles[0])
      || off.oem_program_name
      || vehicleStr
      || "Incentive";

    // Map MC's short lowercase types to our display types
    const rawType = String(off.offer_type ?? "").toLowerCase();
    const offerType = rawType === "lease" ? "LEASE_SPECIAL"
      : rawType === "finance" ? "LOW_APR"
      : rawType === "cash" ? "CASH_BACK"
      : rawType === "loyalty" ? "LOYALTY"
      : rawType === "conquest" ? "CONQUEST"
      : rawType ? rawType.toUpperCase().replace(/[\s-]+/g, "_")
      : "OFFER";

    // Amount interpretation is type-dependent:
    //   lease    → monthly payment (from amounts[0].monthly)
    //   finance  → APR (from amounts[0].apr)
    //   cash     → cashback_amount
    //   default  → whatever numeric we can find
    let amount = 0;
    if (rawType === "lease") amount = Number(amt?.monthly ?? 0);
    else if (rawType === "finance") amount = Number(amt?.apr ?? 0);
    else if (rawType === "cash") amount = Number(off.cashback_amount ?? 0);
    else amount = Number(off.cashback_amount ?? amt?.monthly ?? amt?.apr ?? 0);

    const term = amt?.term ? Number(amt.term) : undefined;
    const termUnit = amt?.term_unit ?? undefined;
    const msrp = off.msrp ? Number(off.msrp) : undefined;
    const endDate = String(off.valid_through ?? "");
    // `offers[]` is the human-readable description; `disclaimers[]` is legal fine print
    const description = (Array.isArray(off.offers) && off.offers[0])
      || (Array.isArray(off.disclaimers) && off.disclaimers[0])
      || "";

    return { title, offerType, amount, term, termUnit, msrp, endDate, description: String(description), vehicle: vehicleStr || undefined };
  });

  // ─── KPIs ───
  const kpis: Kpis = {
    totalMarketVolume: totalCur,
    myShareBps: myRow ? myRow.sharePct * 100 : 0,
    myShareBpsDelta: myRow ? myRow.momSharebpsDelta : 0,
    pricingPowerPct: pricingPower.find(p => p.isMyBrand)?.priceOverMsrpPct ?? 100,
    daysSupply,
  };

  const signals = generateSignals({ myBrand: args.myBrand, state: args.state ?? null, kpis, brandMomentum, segmentMix, pricingPower, activeIncentives });

  return {
    myBrand: args.myBrand,
    state: args.state ?? null,
    month,
    kpis,
    brandMomentum,
    segmentMix,
    pricingPower,
    activeIncentives,
    signals,
    mode: "live",
    partial,
  };
}

// ── Canvas helpers ─────────────────────────────────────────────────────
function setupCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  return { ctx, w, h };
}

// ── Canvas: Segment mix horizontal bars ────────────────────────────────
function drawSegmentMix(canvas: HTMLCanvasElement, segments: SegmentRow[]) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);

  if (!segments.length) {
    ctx.fillStyle = "#64748b";
    ctx.font = "13px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No segment data", w / 2, h / 2);
    return;
  }

  const maxPct = Math.max(...segments.flatMap(s => [s.currentSharePct, s.priorSharePct])) * 1.1;
  const padL = 90, padR = 80, padT = 10, padB = 10;
  const chartW = w - padL - padR;
  const rowH = (h - padT - padB) / segments.length;
  const barH = Math.min(18, rowH * 0.4);

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const cy = padT + rowH * i + rowH / 2;
    const color = SEGMENT_COLORS[s.bodyType] ?? "#6b7280";

    // Body-type label
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 12px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(s.bodyType, padL - 8, cy);

    // Prior (thin gray) bar — top half
    const priorW = (s.priorSharePct / maxPct) * chartW;
    ctx.fillStyle = "#334155";
    ctx.fillRect(padL, cy - barH - 1, priorW, barH * 0.55);

    // Current (color) bar — bottom half
    const curW = (s.currentSharePct / maxPct) * chartW;
    ctx.fillStyle = color;
    ctx.fillRect(padL, cy + 1, curW, barH * 0.9);

    // Delta bps label at right
    const bpsText = fmtBps(s.bpsDelta);
    ctx.fillStyle = trendColor(s.bpsDelta);
    ctx.font = "bold 11px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(bpsText, padL + chartW + 6, cy);
  }

  // Legend (tiny, top-right)
  const legendX = padL + 4, legendY = 4;
  ctx.font = "9px -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#64748b";
  ctx.fillRect(legendX, legendY + 2, 10, 3);
  ctx.fillText("prior", legendX + 14, legendY);
  ctx.fillStyle = "#3b82f6";
  ctx.fillRect(legendX + 60, legendY, 10, 6);
  ctx.fillStyle = "#64748b";
  ctx.fillText("current", legendX + 74, legendY);
}

// ── Canvas: Pricing power scatter (soldCount vs priceOverMsrp) ─────────
// Returned value: array of {x, y, size, row} hit-targets so the enclosing panel
// can wire up a hover tooltip for bubble identification.
interface BubbleHit { x: number; y: number; size: number; row: PricingRow; }

function drawPricingScatter(canvas: HTMLCanvasElement, rows: PricingRow[]): BubbleHit[] {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);

  if (!rows.length) {
    ctx.fillStyle = "#64748b";
    ctx.font = "13px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No pricing-power data", w / 2, h / 2);
    return [];
  }

  // Filter rows with obviously-null / impossible pricing-power values. Post-conversion
  // values are ratios centered at 100 (new-car reality: ~90-110% typical, ~85-115% outliers).
  // 50-150 rejects truly broken data while accepting any reasonable brand spread.
  const validRows = rows.filter(r =>
    r.make && isFinite(r.priceOverMsrpPct) && r.priceOverMsrpPct >= 50 && r.priceOverMsrpPct <= 150
  );

  if (validRows.length < 2) {
    ctx.fillStyle = "#64748b";
    ctx.font = "13px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Insufficient pricing-power data — only " + validRows.length + " valid brand(s)", w / 2, h / 2);
    return [];
  }

  // Layout — more left padding for y-axis label, more bottom padding for x-axis title
  const padL = 60, padR = 16, padT = 26, padB = 42;
  const cw = w - padL - padR;
  const chartH = h - padT - padB;

  // Y range — fully adaptive to data with 10% padding. No clamps: the metric could
  // cluster new-car tight (95-105%), used-car loose (40-85%), or anywhere in between,
  // and the axis should show where the data actually lives.
  const pomps = validRows.map(r => r.priceOverMsrpPct);
  const dataMin = Math.min(...pomps);
  const dataMax = Math.max(...pomps);
  const spread = Math.max(2, dataMax - dataMin);
  const padding = Math.max(2, spread * 0.1);
  const yMin = Math.max(0, Math.floor((dataMin - padding) / 5) * 5);
  const yMax = Math.ceil((dataMax + padding) / 5) * 5;

  // X axis — log scale over data range with decade-rounded extremes
  const validVols = validRows.map(r => Math.max(1, r.soldCount));
  const xRawMin = Math.log10(Math.min(...validVols));
  const xRawMax = Math.log10(Math.max(...validVols));
  const xMin = Math.floor(xRawMin);       // round down to decade
  const xMax = Math.ceil(xRawMax + 0.1);  // round up, with margin

  // Y gridlines + labels — tick spacing scales with range: tight → 2%, medium → 5%, wide → 10%
  const yRange = yMax - yMin;
  const yStep = yRange <= 20 ? 2 : yRange <= 50 ? 5 : 10;
  ctx.font = "10px -apple-system, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  for (let yVal = yMin; yVal <= yMax; yVal += yStep) {
    const y = padT + chartH - ((yVal - yMin) / (yMax - yMin)) * chartH;
    const isParityLine = yVal === 100;
    ctx.strokeStyle = isParityLine ? "#475569" : "#1e293b";
    ctx.lineWidth = isParityLine ? 1.5 : 1;
    ctx.setLineDash(isParityLine ? [] : [3, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + cw, y);
    ctx.stroke();
    ctx.fillStyle = isParityLine ? "#f8fafc" : "#64748b";
    ctx.fillText(yVal + "%", padL - 6, y);
  }
  ctx.setLineDash([]);

  // X axis ticks — always show decade labels in range (1K, 10K, 100K, 1M, 10M)
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let decade = xMin; decade <= xMax; decade++) {
    const tickVal = Math.pow(10, decade);
    const x = padL + ((decade - xMin) / Math.max(0.1, xMax - xMin)) * cw;
    ctx.strokeStyle = "#1e293b";
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + chartH);
    ctx.stroke();
    ctx.fillStyle = "#64748b";
    ctx.fillText(fmtN(tickVal), x, padT + chartH + 8);
  }
  ctx.setLineDash([]);

  // Axis titles — y label in TOP-LEFT corner horizontal (not overlaying the parity line)
  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("% of MSRP", 8, 6);
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("Volume (monthly sold)", padL + cw / 2, h - 6);

  // Bubbles — pass 1: compute positions and draw circles
  const maxVol = Math.max(...validVols);
  const xSpan = Math.max(0.1, xMax - xMin);
  const hits: BubbleHit[] = [];
  for (const r of validRows) {
    const lv = Math.log10(Math.max(1, r.soldCount));
    const x = padL + ((lv - xMin) / xSpan) * cw;
    const yC = Math.min(yMax, Math.max(yMin, r.priceOverMsrpPct));
    const y = padT + chartH - ((yC - yMin) / (yMax - yMin)) * chartH;
    const sizeBase = 5 + Math.sqrt(r.soldCount / maxVol) * 12;
    const size = r.isMyBrand ? sizeBase * 1.5 : sizeBase;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = r.isMyBrand ? MY_BRAND_COLOR + "cc" : OTHER_BRAND_COLOR + "77";
    ctx.fill();
    ctx.strokeStyle = r.isMyBrand ? "#fff" : "#1e293b";
    ctx.lineWidth = r.isMyBrand ? 2 : 1;
    ctx.stroke();
    hits.push({ x, y, size, row: r });
  }

  // Pass 2: labels — label myBrand + top N by volume so user can orient without mousing over
  // every dot. Placement: above bubble by default; below if bubble is in top third of chart.
  const labelBudget = 8;
  const labeledByVol = [...validRows].sort((a, b) => b.soldCount - a.soldCount).slice(0, labelBudget);
  const labelSet = new Set(labeledByVol.map(r => r.make.toLowerCase()));
  labelSet.add(validRows.find(r => r.isMyBrand)?.make.toLowerCase() ?? "");

  for (const h of hits) {
    const r = h.row;
    if (!labelSet.has(r.make.toLowerCase())) continue;
    const above = h.y > padT + chartH * 0.35; // place label above unless bubble is too high
    const ly = above ? h.y - h.size - 4 : h.y + h.size + 12;
    ctx.fillStyle = r.isMyBrand ? "#f8fafc" : "#cbd5e1";
    ctx.font = r.isMyBrand ? "bold 11px -apple-system, sans-serif" : "10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = above ? "bottom" : "top";
    ctx.fillText(r.make, h.x, ly);
  }

  return hits;
}

// ── Canvas: Days-supply arc gauge ──────────────────────────────────────
// Layout: arc occupies upper ~70% of canvas; value readout "83 / days of supply"
// sits BELOW the center hub in the lower third. No text overlaps the tick labels.
function drawDaysSupplyGauge(canvas: HTMLCanvasElement, days: number) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);

  const readoutH = 48;              // reserved space below hub for "83 / days of supply"
  const topPad = 16;                // space above arc for safety
  const cx = w / 2;
  const cy = h - readoutH;          // hub above readout band
  const radius = Math.min(cx - 28, cy - topPad);
  const startAngle = Math.PI;
  const endAngle = 2 * Math.PI;
  const arcWidth = 16;
  const maxDays = 180;

  // Zones: 0-45 green, 45-75 yellow, 75+ red
  const segments = [
    { start: 0,            end: 45 / maxDays, color: "#10b981" },
    { start: 45 / maxDays, end: 75 / maxDays, color: "#f59e0b" },
    { start: 75 / maxDays, end: 1.0,          color: "#ef4444" },
  ];
  for (const seg of segments) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle + seg.start * Math.PI, startAngle + seg.end * Math.PI);
    ctx.strokeStyle = seg.color;
    ctx.lineWidth = arcWidth;
    ctx.lineCap = "butt";
    ctx.stroke();
  }

  // Thin border arcs
  for (const r of [radius + arcWidth / 2 + 1, radius - arcWidth / 2 - 1]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Tick labels OUTSIDE arc (clean — no text overlaps possible since readout is below)
  ctx.font = "10px -apple-system, sans-serif";
  ctx.fillStyle = "#94a3b8";
  for (const dv of [0, 45, 75, 120, 180]) {
    const pct = dv / maxDays;
    const angle = startAngle + pct * Math.PI;
    // tick mark on inner edge
    const innerR = radius - arcWidth / 2 - 5;
    const outerR = radius - arcWidth / 2 - 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
    ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // label outside arc, offset radially
    const labR = radius + arcWidth / 2 + 10;
    const lx = cx + Math.cos(angle) * labR;
    const ly = cy + Math.sin(angle) * labR;
    // keep label inside canvas horizontally
    const clampedLx = Math.max(10, Math.min(w - 10, lx));
    ctx.textAlign = dv === 0 ? "left" : dv === 180 ? "right" : "center";
    ctx.textBaseline = ly < cy - radius * 0.6 ? "bottom" : "middle";
    ctx.fillText(String(dv), clampedLx, ly);
  }

  // Needle
  const clamped = Math.min(maxDays, Math.max(0, isFinite(days) ? days : 0));
  const valuePct = clamped / maxDays;
  const needleAngle = startAngle + valuePct * Math.PI;
  const needleLen = radius - arcWidth / 2 - 6;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(needleAngle);
  ctx.beginPath();
  ctx.moveTo(0, -3);
  ctx.lineTo(needleLen, 0);
  ctx.lineTo(0, 3);
  ctx.closePath();
  ctx.fillStyle = "#f8fafc";
  ctx.fill();
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // Center hub
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#f8fafc";
  ctx.fill();
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Value readout — BELOW the hub, not above (no overlap with tick labels)
  const displayColor = clamped < 45 ? "#10b981" : clamped <= 75 ? "#f59e0b" : "#ef4444";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = "bold 30px -apple-system, sans-serif";
  ctx.fillStyle = displayColor;
  ctx.fillText(clamped >= 999 ? "—" : String(clamped), cx, cy + 28);
  ctx.font = "11px -apple-system, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("days of supply", cx, cy + 42);
}

// ── UI section renderers ───────────────────────────────────────────────
function el(tag: string, style?: string, inner?: string): HTMLElement {
  const e = document.createElement(tag);
  if (style) e.style.cssText = style;
  if (inner !== undefined) e.innerHTML = inner;
  return e;
}

function renderKpiStrip(kpis: Kpis, myBrand: string): HTMLElement {
  const wrap = el("div", "display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;");

  const card = (label: string, value: string, sub: string, valueColor: string) => el("div",
    `background:#1e293b;border:1px solid #334155;border-radius:10px;padding:14px 16px;`,
    `<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">${label}</div>
     <div style="font-size:26px;font-weight:700;color:${valueColor};margin-top:4px;line-height:1.1;">${value}</div>
     <div style="font-size:11px;color:#64748b;margin-top:4px;">${sub}</div>`);

  wrap.appendChild(card("Market Volume", fmtN(kpis.totalMarketVolume), "units sold this month", "#f8fafc"));

  const shareVal = isFinite(kpis.myShareBps) ? (kpis.myShareBps / 100).toFixed(1) + "%" : "—";
  const shareDeltaStr = `${trendArrow(kpis.myShareBpsDelta)} ${fmtBps(kpis.myShareBpsDelta)}`;
  wrap.appendChild(card(`${myBrand} Share`, shareVal,
    `<span style="color:${trendColor(kpis.myShareBpsDelta)};">${shareDeltaStr}</span> vs prior month`,
    "#f8fafc"));

  const ppColor = kpis.pricingPowerPct >= 100 ? "#22c55e" : "#f59e0b";
  wrap.appendChild(card("Pricing Power",
    kpis.pricingPowerPct > 0 ? kpis.pricingPowerPct.toFixed(1) + "%" : "—",
    kpis.pricingPowerPct >= 100 ? "above MSRP parity" : "below MSRP parity", ppColor));

  const dsColor = kpis.daysSupply < 45 ? "#22c55e" : kpis.daysSupply <= 75 ? "#f59e0b" : "#ef4444";
  const dsLabel = kpis.daysSupply < 45 ? "HEALTHY" : kpis.daysSupply <= 75 ? "WATCH" : kpis.daysSupply >= 999 ? "n/a" : "GLUT";
  wrap.appendChild(card("Days of Supply",
    kpis.daysSupply >= 999 ? "—" : String(kpis.daysSupply),
    `${myBrand} inventory — ${dsLabel}`, dsColor));

  return wrap;
}

function renderBrandTable(rows: BrandRow[], myBrand: string): HTMLElement {
  const panel = el("div", "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:14px 16px;");
  panel.appendChild(el("div", "font-size:13px;font-weight:700;color:#f8fafc;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;", "Brand Momentum"));
  panel.appendChild(el("div", "font-size:11px;color:#94a3b8;margin-bottom:10px;", "Ranked by |Δ share bps| — who gained and lost the most share this month"));

  const scroll = el("div", "overflow-x:auto;");
  const table = el("table", "width:100%;border-collapse:collapse;font-size:12px;");
  table.innerHTML = `<thead>
    <tr style="background:#0f172a;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;font-size:10px;">
      <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #334155;">#</th>
      <th style="text-align:left;padding:8px 10px;border-bottom:1px solid #334155;">Brand</th>
      <th style="text-align:right;padding:8px 10px;border-bottom:1px solid #334155;">Units</th>
      <th style="text-align:right;padding:8px 10px;border-bottom:1px solid #334155;">Share</th>
      <th style="text-align:right;padding:8px 10px;border-bottom:1px solid #334155;">Δ bps</th>
      <th style="text-align:right;padding:8px 10px;border-bottom:1px solid #334155;">Δ Units %</th>
      <th style="text-align:right;padding:8px 10px;border-bottom:1px solid #334155;">Avg Price</th>
    </tr>
  </thead>`;
  const tbody = document.createElement("tbody");
  rows.forEach((r, i) => {
    const tr = document.createElement("tr");
    tr.style.cssText = r.isMyBrand
      ? `background:#ef444411;border-left:3px solid ${MY_BRAND_COLOR};`
      : "";
    const nameCell = r.isMyBrand ? `<span style="color:${MY_BRAND_COLOR};margin-right:4px;">&#9733;</span> <strong>${r.make}</strong>` : r.make;
    tr.innerHTML = `
      <td style="padding:8px 10px;border-bottom:1px solid #1e293b;color:#94a3b8;">${i + 1}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #1e293b;color:#e2e8f0;">${nameCell}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #1e293b;text-align:right;color:#e2e8f0;">${fmtN(r.soldCount)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #1e293b;text-align:right;color:#e2e8f0;">${r.sharePct.toFixed(2)}%</td>
      <td style="padding:8px 10px;border-bottom:1px solid #1e293b;text-align:right;color:${trendColor(r.momSharebpsDelta)};font-weight:600;">${trendArrow(r.momSharebpsDelta)} ${fmtBps(r.momSharebpsDelta)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #1e293b;text-align:right;color:${trendColor(r.momVolumePctDelta)};">${fmtPct(r.momVolumePctDelta)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #1e293b;text-align:right;color:#94a3b8;">${fmt$(r.avgSalePrice)}</td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  scroll.appendChild(table);
  panel.appendChild(scroll);
  return panel;
}

function renderSegmentMix(segments: SegmentRow[]): HTMLElement {
  // Panel is flex-column so the canvas fills whatever vertical space the grid row gives us
  // (the row is height-stretched to match the Brand Momentum table height — no more void).
  const panel = el("div", "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;min-height:280px;");
  panel.appendChild(el("div", "font-size:13px;font-weight:700;color:#f8fafc;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;", "Segment Mix Shift"));
  panel.appendChild(el("div", "font-size:11px;color:#94a3b8;margin-bottom:10px;", "Current vs prior month — where share is moving"));
  const canvas = document.createElement("canvas");
  canvas.style.cssText = `width:100%;flex:1 1 auto;min-height:${Math.max(240, segments.length * 38)}px;display:block;`;
  panel.appendChild(canvas);
  // Defer to next tick so the flex layout has settled and canvas.clientHeight reflects the row height
  requestAnimationFrame(() => drawSegmentMix(canvas, segments));
  return panel;
}

function renderPricingScatter(rows: PricingRow[]): HTMLElement {
  const panel = el("div", "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:14px 16px;position:relative;");
  panel.appendChild(el("div", "font-size:13px;font-weight:700;color:#f8fafc;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;", "Pricing Power Map"));
  panel.appendChild(el("div", "font-size:11px;color:#94a3b8;margin-bottom:10px;", "% of MSRP vs volume — above 100% = premium demand, below = discounting. Hover any dot for details."));
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width:100%;height:280px;display:block;";
  panel.appendChild(canvas);

  // Tooltip div — positioned absolutely over the panel; shown/hidden on mousemove
  const tooltip = document.createElement("div");
  tooltip.style.cssText = "position:absolute;pointer-events:none;display:none;background:#0f172a;border:1px solid #475569;border-radius:6px;padding:8px 10px;font-size:11px;color:#e2e8f0;z-index:10;box-shadow:0 4px 12px rgba(0,0,0,0.4);white-space:nowrap;line-height:1.5;";
  panel.appendChild(tooltip);

  let hits: BubbleHit[] = [];
  const redraw = () => { hits = drawPricingScatter(canvas, rows); };
  setTimeout(redraw, 0);

  canvas.addEventListener("mousemove", (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.clientWidth / rect.width;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleX;
    // Find closest bubble under cursor (within its hit-radius + 2px for friendliness)
    let closest: BubbleHit | null = null;
    let closestDist = Infinity;
    for (const bh of hits) {
      const dx = bh.x - mx, dy = bh.y - my;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= bh.size + 2 && dist < closestDist) { closest = bh; closestDist = dist; }
    }
    if (closest) {
      const r = closest.row;
      const pRect = panel.getBoundingClientRect();
      tooltip.innerHTML = `
        <div style="font-weight:700;color:${r.isMyBrand ? MY_BRAND_COLOR : "#f8fafc"};margin-bottom:4px;">${r.make}${r.isMyBrand ? " ⭐" : ""}</div>
        <div><span style="color:#64748b;">% of MSRP:</span> <span style="color:${r.priceOverMsrpPct >= 100 ? "#22c55e" : "#f59e0b"};font-weight:600;">${r.priceOverMsrpPct.toFixed(1)}%</span></div>
        <div><span style="color:#64748b;">Volume (monthly):</span> ${fmtN(r.soldCount)}</div>
        <div><span style="color:#64748b;">Avg DOM:</span> ${r.avgDom > 0 ? Math.round(r.avgDom) + " days" : "—"}</div>`;
      tooltip.style.display = "block";
      // Position near cursor but clamped to panel bounds
      const pxIn = e.clientX - pRect.left;
      const pyIn = e.clientY - pRect.top;
      const ttW = tooltip.offsetWidth || 180;
      const ttH = tooltip.offsetHeight || 80;
      const ttX = Math.min(pRect.width - ttW - 6, pxIn + 12);
      const ttY = Math.max(6, pyIn - ttH - 8);
      tooltip.style.left = ttX + "px";
      tooltip.style.top = ttY + "px";
      canvas.style.cursor = "pointer";
    } else {
      tooltip.style.display = "none";
      canvas.style.cursor = "default";
    }
  });
  canvas.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });

  return panel;
}

function renderDaysSupplyPanel(days: number, myBrand: string): HTMLElement {
  const panel = el("div", "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;");
  panel.appendChild(el("div", "font-size:13px;font-weight:700;color:#f8fafc;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;", "Days of Supply"));
  panel.appendChild(el("div", "font-size:11px;color:#94a3b8;margin-bottom:8px;", `${myBrand} inventory velocity — lower is healthier`));
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width:100%;height:220px;display:block;flex:1;";
  panel.appendChild(canvas);
  setTimeout(() => drawDaysSupplyGauge(canvas, days), 0);
  const legend = el("div", "display:flex;justify-content:space-around;font-size:10px;color:#64748b;margin-top:4px;");
  legend.innerHTML = `<span><span style="color:#10b981;">●</span> &lt;45 Healthy</span>
    <span><span style="color:#f59e0b;">●</span> 45–75 Watch</span>
    <span><span style="color:#ef4444;">●</span> &gt;75 Glut</span>`;
  panel.appendChild(legend);
  return panel;
}

function renderIncentives(incentives: Incentive[], myBrand: string): HTMLElement {
  const panel = el("div", "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:14px 16px;margin-bottom:16px;");
  panel.appendChild(el("div", "font-size:13px;font-weight:700;color:#f8fafc;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;", `Active ${myBrand} Incentives`));
  panel.appendChild(el("div", "font-size:11px;color:#94a3b8;margin-bottom:12px;", incentives.length > 0 ? `${incentives.length} programs currently running` : "No active programs returned"));

  if (!incentives.length) {
    panel.appendChild(el("div", "font-size:12px;color:#64748b;padding:20px;text-align:center;border:1px dashed #334155;border-radius:8px;",
      "No incentive programs for this brand in the selected region."));
    return panel;
  }

  const grid = el("div", "display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:12px;");
  const typeColors: Record<string, { bg: string; fg: string; label: string }> = {
    CASH_BACK: { bg: "#0891b222", fg: "#06b6d4", label: "CASH BACK" },
    LOW_APR: { bg: "#16a34a22", fg: "#22c55e", label: "LOW APR" },
    LEASE_SPECIAL: { bg: "#9333ea22", fg: "#a78bfa", label: "LEASE" },
    LOYALTY: { bg: "#eab30822", fg: "#facc15", label: "LOYALTY" },
    CONQUEST: { bg: "#dc262622", fg: "#f87171", label: "CONQUEST" },
    OFFER: { bg: "#33415544", fg: "#94a3b8", label: "OFFER" },
  };

  for (const inc of incentives) {
    const tc = typeColors[inc.offerType] ?? typeColors.OFFER;

    // Amount display — type-aware
    let amtBig = "—", amtSub = "";
    if (inc.offerType === "LEASE_SPECIAL" && inc.amount > 0) {
      amtBig = `$${Math.round(inc.amount).toLocaleString("en-US")}/mo`;
      if (inc.term) amtSub = `${inc.term} ${inc.termUnit ?? "mo"}${inc.msrp ? ` · MSRP ${fmt$(inc.msrp)}` : ""}`;
    } else if (inc.offerType === "LOW_APR" && inc.amount > 0) {
      amtBig = `${inc.amount.toFixed(1)}% APR`;
      if (inc.term) amtSub = `${inc.term} ${inc.termUnit ?? "mo"}`;
    } else if (inc.offerType === "CASH_BACK" && inc.amount > 0) {
      amtBig = `$${Math.round(inc.amount).toLocaleString("en-US")}`;
      amtSub = "cash back";
    } else if (inc.amount > 0) {
      amtBig = `$${Math.round(inc.amount).toLocaleString("en-US")}`;
    }

    const card = el("div",
      `background:#0f172a;border:1px solid #334155;border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:6px;`,
      `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
         <span style="padding:2px 8px;border-radius:10px;font-size:9px;font-weight:700;letter-spacing:0.5px;background:${tc.bg};color:${tc.fg};">${tc.label}</span>
         <span style="font-size:10px;color:#64748b;">ends ${inc.endDate || "—"}</span>
       </div>
       <div style="font-size:13px;font-weight:600;color:#e2e8f0;line-height:1.35;">${inc.title}</div>
       <div style="font-size:22px;font-weight:700;color:#f8fafc;line-height:1.1;">${amtBig}</div>
       ${amtSub ? `<div style="font-size:11px;color:#94a3b8;margin-top:-2px;">${amtSub}</div>` : ""}
       ${inc.description ? `<div style="font-size:10px;color:#64748b;margin-top:4px;border-top:1px solid #1e293b;padding-top:6px;line-height:1.4;">${inc.description.slice(0, 160)}${inc.description.length > 160 ? "…" : ""}</div>` : ""}`);
    grid.appendChild(card);
  }
  panel.appendChild(grid);
  return panel;
}

function renderSignalsPanel(signals: string[]): HTMLElement {
  const panel = el("div", `background:#1e293b;border:1px solid #334155;border-left:4px solid ${MY_BRAND_COLOR};border-radius:10px;padding:14px 20px;margin-bottom:16px;`);
  panel.appendChild(el("div", "font-size:13px;font-weight:700;color:#f8fafc;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;",
    "&#9889; Market Signals"));

  if (!signals.length) {
    panel.appendChild(el("div", "font-size:13px;color:#94a3b8;", "No notable signals this month."));
    return panel;
  }
  const list = el("ul", "list-style:none;padding:0;margin:0;font-size:13px;color:#e2e8f0;");
  for (const s of signals) {
    const li = el("li", `padding:6px 0 6px 18px;position:relative;border-bottom:1px solid #0f172a;`,
      `<span style="position:absolute;left:0;top:8px;width:6px;height:6px;border-radius:50%;background:${MY_BRAND_COLOR};"></span>${s}`);
    list.appendChild(li);
  }
  panel.appendChild(list);
  return panel;
}

// ── Header + form ──────────────────────────────────────────────────────
function renderHeader(root: HTMLElement, currentBrand: string, currentState: string, month: string,
                      onSubmit: (args: { myBrand: string; state?: string }) => void) {
  const header = el("div",
    `display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:16px 20px;background:#0b1222;border-bottom:1px solid #334155;position:sticky;top:0;z-index:50;`);

  const title = el("div", "display:flex;flex-direction:column;gap:2px;");
  title.appendChild(el("div", "font-size:17px;font-weight:700;color:#f8fafc;letter-spacing:0.2px;", "Market Momentum Report"));
  title.appendChild(el("div", "font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;", `Manufacturer &middot; ${month}`));
  header.appendChild(title);

  // Brand selector (dropdown with editable "Other")
  const brandWrap = el("div", "display:flex;flex-direction:column;gap:2px;");
  brandWrap.appendChild(el("label", "font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;", "Brand"));
  const brandSelect = document.createElement("select");
  brandSelect.id = "_brand_sel";
  brandSelect.style.cssText = "padding:8px 12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;outline:none;min-width:140px;";
  for (const b of BRAND_OPTIONS) {
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = b;
    if (b.toLowerCase() === currentBrand.toLowerCase()) opt.selected = true;
    brandSelect.appendChild(opt);
  }
  // Allow "Other" via datalist fallback — simple option for another input
  const otherOpt = document.createElement("option");
  otherOpt.value = "__other__";
  otherOpt.textContent = "Other…";
  if (!BRAND_OPTIONS.some(b => b.toLowerCase() === currentBrand.toLowerCase())) {
    otherOpt.selected = true;
  }
  brandSelect.appendChild(otherOpt);
  brandWrap.appendChild(brandSelect);
  header.appendChild(brandWrap);

  const otherBrandInput = document.createElement("input");
  otherBrandInput.id = "_brand_other_inp";
  otherBrandInput.type = "text";
  otherBrandInput.placeholder = "e.g. Nissan";
  otherBrandInput.style.cssText = "padding:8px 12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;outline:none;width:140px;display:none;";
  if (!BRAND_OPTIONS.some(b => b.toLowerCase() === currentBrand.toLowerCase())) {
    otherBrandInput.value = currentBrand;
    otherBrandInput.style.display = "inline-block";
  }
  brandSelect.addEventListener("change", () => {
    otherBrandInput.style.display = brandSelect.value === "__other__" ? "inline-block" : "none";
  });
  const otherBrandWrap = el("div", "display:flex;flex-direction:column;gap:2px;");
  otherBrandWrap.appendChild(el("label", "font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;visibility:hidden;", "."));
  otherBrandWrap.appendChild(otherBrandInput);
  header.appendChild(otherBrandWrap);

  // State selector
  const stateWrap = el("div", "display:flex;flex-direction:column;gap:2px;");
  stateWrap.appendChild(el("label", "font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;", "State"));
  const stateSelect = document.createElement("select");
  stateSelect.id = "_state_sel";
  stateSelect.style.cssText = "padding:8px 12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;outline:none;min-width:100px;";
  for (const s of STATES) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    if (s === currentState) opt.selected = true;
    stateSelect.appendChild(opt);
  }
  stateWrap.appendChild(stateSelect);
  header.appendChild(stateWrap);

  // Submit button
  const submitBtn = document.createElement("button");
  submitBtn.textContent = "Run Report";
  submitBtn.style.cssText = `padding:10px 18px;border-radius:6px;border:none;background:${MY_BRAND_COLOR};color:#fff;font-size:13px;font-weight:700;cursor:pointer;align-self:end;letter-spacing:0.3px;`;
  submitBtn.addEventListener("click", () => {
    let brand = brandSelect.value;
    if (brand === "__other__") brand = otherBrandInput.value.trim();
    if (!brand) { brand = DEFAULT_BRAND; brandSelect.value = brand; }
    const state = stateSelect.value;
    // Push URL state for deep-linking
    const url = new URL(location.href);
    url.searchParams.set("myBrand", brand);
    if (state && state !== "National") url.searchParams.set("state", state);
    else url.searchParams.delete("state");
    history.replaceState(null, "", url.toString());
    onSubmit({ myBrand: brand, state: state && state !== "National" ? state : undefined });
  });
  header.appendChild(submitBtn);

  // Settings bar (mode badge + gear) on the far right
  _addSettingsBar(header);

  root.appendChild(header);
}

// ── Main render ────────────────────────────────────────────────────────
function renderReport(root: HTMLElement, data: ReportData) {
  // Clear everything except the header (first child)
  while (root.children.length > 1) root.removeChild(root.lastChild!);

  const body = el("div", "padding:16px 20px;");

  // Demo banner
  if (data.mode === "demo" && !_isEmbedMode()) {
    const _db = document.createElement("div");
    _db.id = "_demo_banner";
    _db.style.cssText = "background:linear-gradient(135deg,#92400e22,#f59e0b11);border:1px solid #f59e0b44;border-radius:10px;padding:14px 20px;margin-bottom:16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;";
    _db.innerHTML = `
      <div style="flex:1;min-width:200px;">
        <div style="font-size:13px;font-weight:700;color:#fbbf24;margin-bottom:2px;">&#9888; Demo Mode — Showing sample data</div>
        <div style="font-size:12px;color:#d97706;">Enter your MarketCheck Enterprise API key to see real market data. <a href="https://developers.marketcheck.com" target="_blank" style="color:#fbbf24;text-decoration:underline;">Get a free key</a></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <input id="_banner_key" type="text" placeholder="Paste your API key" style="padding:8px 12px;border-radius:6px;border:1px solid #f59e0b44;background:#0f172a;color:#e2e8f0;font-size:13px;width:220px;outline:none;" />
        <button id="_banner_save" style="padding:8px 16px;border-radius:6px;border:none;background:#f59e0b;color:#0f172a;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">Activate</button>
      </div>`;
    body.appendChild(_db);
    setTimeout(() => {
      const saveBtn = _db.querySelector("#_banner_save") as HTMLButtonElement;
      const inp = _db.querySelector("#_banner_key") as HTMLInputElement;
      saveBtn?.addEventListener("click", () => {
        const k = inp?.value?.trim();
        if (!k) return;
        localStorage.setItem("mc_api_key", k);
        _db.style.background = "linear-gradient(135deg,#05966922,#10b98111)";
        _db.style.borderColor = "#10b98144";
        _db.innerHTML = '<div style="font-size:13px;font-weight:700;color:#10b981;">&#10003; API key saved — reloading with live data...</div>';
        setTimeout(() => location.reload(), 800);
      });
      inp?.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") saveBtn?.click(); });
    }, 0);
  }

  // Partial-data banner (live mode with some enterprise failures)
  if (data.mode === "live" && data.partial) {
    body.appendChild(el("div",
      "background:#1e40af22;border:1px solid #1e40af;border-radius:10px;padding:10px 16px;margin-bottom:16px;font-size:12px;color:#93c5fd;",
      "&#9432; Some Enterprise-API calls returned no data. Showing what's available. Ensure your key has <strong>Sold Vehicle Summary</strong> access."));
  }

  // Row 1: KPI strip
  body.appendChild(renderKpiStrip(data.kpis, data.myBrand));

  // Row 2: Brand momentum (60%) + Segment mix shift (40%)
  const row2 = el("div", "display:grid;grid-template-columns:3fr 2fr;gap:12px;margin-bottom:16px;");
  row2.appendChild(renderBrandTable(data.brandMomentum, data.myBrand));
  row2.appendChild(renderSegmentMix(data.segmentMix));
  body.appendChild(row2);

  // Row 3: Pricing power scatter (60%) + Days supply gauge (40%)
  const row3 = el("div", "display:grid;grid-template-columns:3fr 2fr;gap:12px;margin-bottom:16px;");
  row3.appendChild(renderPricingScatter(data.pricingPower));
  row3.appendChild(renderDaysSupplyPanel(data.kpis.daysSupply, data.myBrand));
  body.appendChild(row3);

  // Row 4: Active incentives
  body.appendChild(renderIncentives(data.activeIncentives, data.myBrand));

  // Row 5: Market Signals
  body.appendChild(renderSignalsPanel(data.signals));

  // Footer
  body.appendChild(el("div", "font-size:10px;color:#64748b;text-align:center;padding:16px 0;",
    `Powered by <a href="https://www.marketcheck.com" target="_blank" style="color:#94a3b8;">MarketCheck</a> &middot; ${data.state ? data.state : "National"} &middot; ${data.month}`));

  root.appendChild(body);
}

// ── Loading state ──────────────────────────────────────────────────────
function showLoading(root: HTMLElement) {
  while (root.children.length > 1) root.removeChild(root.lastChild!);
  const spinner = el("div",
    "display:flex;align-items:center;justify-content:center;padding:60px;color:#94a3b8;font-size:13px;",
    `<div style="width:22px;height:22px;border:2px solid #334155;border-top-color:${MY_BRAND_COLOR};border-radius:50%;animation:mspin 0.8s linear infinite;margin-right:12px;"></div>
     <style>@keyframes mspin{to{transform:rotate(360deg)}}</style>
     Fetching market data…`);
  root.appendChild(spinner);
}

// ── main() ─────────────────────────────────────────────────────────────
async function main() {
  document.body.innerHTML = "";
  document.body.style.cssText = "margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;overflow-x:hidden;";

  const root = document.createElement("div");
  root.id = "mmr-root";
  document.body.appendChild(root);

  const urlParams = _getUrlParams();
  const initialBrand = urlParams.myBrand || DEFAULT_BRAND;
  const initialState = urlParams.state || "National";
  const initialMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  async function runReport(args: { myBrand: string; state?: string }) {
    showLoading(root);
    try {
      const result = await _callTool("market-momentum-report", args);
      let data: ReportData;
      if (result && result.content?.[0]?.text) {
        try {
          const raw = JSON.parse(result.content[0].text);
          if (raw.error) throw new Error(raw.error);
          data = _transformToReport(raw, args);
          data.mode = _detectAppMode() === "live" ? "live" : "mcp";
        } catch (e) {
          console.warn("Parse/transform failed, falling back to mock:", e);
          data = getMockData(args);
        }
      } else {
        data = getMockData(args);
      }
      renderReport(root, data);
    } catch (err: any) {
      console.error("runReport error:", err);
      const data = getMockData(args);
      data.mode = "demo";
      renderReport(root, data);
    }
  }

  renderHeader(root, initialBrand, initialState, initialMonth, runReport);

  // Auto-run if URL param present OR always (initial render)
  await runReport({
    myBrand: initialBrand,
    state: initialState !== "National" ? initialState : undefined,
  });
}

main().catch((e) => {
  console.error("Market Momentum Report failed to start:", e);
  document.body.innerHTML = `<div style="padding:32px;font-family:sans-serif;color:#ef4444;">Error: ${e?.message ?? e}</div>`;
});
