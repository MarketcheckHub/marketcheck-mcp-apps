/**
 * Incentive Effectiveness Dashboard — OEM incentive ROI analysis.
 * Correlates active incentive programs with model-level sales velocity (DOM)
 * and volume to recommend Increase / Reduce / On-track per model. Manufacturer segment.
 */
import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "incentive-effectiveness-dashboard" }); } catch {}

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
  for (const key of ["make", "brand", "state"]) {
    const v = params.get(key);
    if (v) result[key] = v;
  }
  // Alias: brand → make
  if (!result.make && result.brand) result.make = result.brand;
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

// ── _fetchDirect — single parallel wave (catalog apiFlow Step 1) ────────
async function _fetchDirect(args: { make: string; state?: string }): Promise<any> {
  const state = args.state && args.state !== "National" ? args.state : undefined;
  const ranges = generateMonthlyRanges(1);
  const cur = ranges[0];

  // All four MC calls fire in parallel. .catch(() => null) per-call so a 401/403
  // on the Enterprise sold-summary endpoint still lets the page render with whatever came back.
  const [incentives, soldByModel, soldByBodyType, activeInv] = await Promise.all([
    _mcIncentives({ oem: args.make }).catch(() => null),
    _mcSold({
      state, make: args.make,
      date_from: cur.dateFrom, date_to: cur.dateTo,
      ranking_dimensions: "make,model",
      ranking_measure: "sold_count",
      ranking_order: "desc", top_n: 25,
    }).catch(() => null),
    _mcSold({
      state, make: args.make,
      date_from: cur.dateFrom, date_to: cur.dateTo,
      ranking_dimensions: "body_type",
      ranking_measure: "sold_count",
      ranking_order: "desc", top_n: 10,
    }).catch(() => null),
    _mcActive({
      make: args.make, state,
      rows: 50, stats: "price,miles,dom",
      facets: "model,body_type",
    }).catch(() => null),
  ]);

  return {
    make: args.make,
    state: state ?? null,
    month: cur.date,
    incentives, soldByModel, soldByBodyType, activeInv,
  };
}

// ── _callTool — 4-step fallback: MCP → direct → proxy → null (→ mock) ─
async function _callTool(toolName: string, args: any): Promise<any> {
  const mode = _detectAppMode();

  // 1. MCP mode — only when actually in MCP host
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
      [style*="width:60%"], [style*="width:40%"], [style*="width:65%"], [style*="width:35%"],
      [style*="width: 60%"], [style*="width: 40%"], [style*="width: 65%"], [style*="width: 35%"] { width: 100% !important; min-width: 0 !important; }
    }
    @media (max-width: 480px) {
      body { padding: 8px !important; }
      h1 { font-size: 16px !important; }
      th, td { padding: 4px 6px !important; font-size: 11px !important; }
      input, select { max-width: 100% !important; width: 100% !important; box-sizing: border-box !important; }
    }
    @keyframes spin { to { transform: rotate(360deg); } }
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
function fmtDays(v: number): string {
  if (!isFinite(v)) return "—";
  return Math.round(v) + " days";
}
function trendArrow(v: number): string {
  if (!isFinite(v) || v === 0) return "—";
  return v > 0 ? "▲" : "▼";
}
function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}
function daysUntil(iso: string): number {
  if (!iso) return 9999;
  const t = Date.parse(iso);
  if (isNaN(t)) return 9999;
  return Math.max(0, Math.ceil((t - Date.now()) / 86400000));
}

// ── Constants ──────────────────────────────────────────────────────────
const STATES = [
  "National","AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY",
  "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];
const BRAND_OPTIONS = [
  "Acura","Audi","BMW","Buick","Cadillac","Chevrolet","Chrysler","Dodge",
  "Fiat","Ford","Genesis","GMC","Honda","Hyundai","Infiniti","Jaguar",
  "Jeep","Kia","Land Rover","Lexus","Lincoln","Mazda","Mini","Mitsubishi",
  "Nissan","Porsche","RAM","Subaru","Toyota","Volvo",
];
const DEFAULT_BRAND = "Toyota";

type IncentiveType = "CASH_BACK" | "LOW_APR" | "LEASE_SPECIAL" | "LOYALTY" | "CONQUEST" | "OFFER";

const TYPE_CONFIG: Record<IncentiveType, { label: string; color: string; bg: string }> = {
  CASH_BACK:     { label: "Cash Back",      color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
  LOW_APR:       { label: "Low APR",        color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
  LEASE_SPECIAL: { label: "Lease",          color: "#a855f7", bg: "rgba(168,85,247,0.15)" },
  LOYALTY:       { label: "Loyalty",        color: "#f97316", bg: "rgba(249,115,22,0.15)" },
  CONQUEST:      { label: "Conquest",       color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
  OFFER:         { label: "Offer",          color: "#94a3b8", bg: "rgba(148,163,184,0.15)" },
};

const ROI_BADGE: Record<"INCREASE" | "REDUCE" | "ON_TRACK", { label: string; color: string; bg: string; border: string }> = {
  INCREASE: { label: "Increase Support", color: "#fca5a5", bg: "rgba(239,68,68,0.18)",  border: "#ef4444" },
  REDUCE:   { label: "Reduce Spend",     color: "#fde68a", bg: "rgba(245,158,11,0.18)", border: "#f59e0b" },
  ON_TRACK: { label: "On Track",         color: "#86efac", bg: "rgba(34,197,94,0.18)",  border: "#22c55e" },
};

// ── Types ──────────────────────────────────────────────────────────────
interface NormalizedIncentive {
  id: string;
  make: string;
  model: string;
  type: IncentiveType;
  title: string;
  description: string;
  amount: number;
  amountDisplay: string;
  term: number;
  eligibleModels: string[];
  expirationDate: string;
  finePrint: string;
}

interface ModelRow {
  model: string;
  soldCount: number;
  avgDom: number;
  avgSalePrice: number;
  activeInventoryCount: number;
  hasIncentive: boolean;
  incentiveTypes: IncentiveType[];
  incentiveSummary: { CASH_BACK: string; LOW_APR: string; LEASE_SPECIAL: string };
  domVsBrandAvg: number;
  roiSignal: "INCREASE" | "REDUCE" | "ON_TRACK";
  roiReason: string;
}

interface SegmentRow {
  bodyType: string;
  soldCount: number;
  sharePct: number;
}

interface ReportData {
  make: string;
  state: string | null;
  month: string;
  kpis: {
    activeIncentivePrograms: number;
    modelsCovered: number;
    totalModelsTracked: number;
    coveragePct: number;
    avgDomWithIncentive: number;
    avgDomWithoutIncentive: number;
    avgDomLiftDays: number;
    brandAvgDom: number;
  };
  incentives: NormalizedIncentive[];
  models: ModelRow[];
  segmentMix: SegmentRow[];
  recommendations: Array<{ model: string; action: ModelRow["roiSignal"]; reason: string }>;
  signals: string[];
  partial: boolean;
  mode: "demo" | "live" | "mcp";
}

// ── Inlined: transformIncentiveListings (from packages/server/src/proxy.ts) ─
function transformIncentiveListings(apiResponse: any): NormalizedIncentive[] {
  const listings = apiResponse?.listings || [];
  const typeMap: Record<string, { short: string; long: IncentiveType }> = {
    cash:    { short: "cashback", long: "CASH_BACK" },
    finance: { short: "apr",      long: "LOW_APR" },
    lease:   { short: "lease",    long: "LEASE_SPECIAL" },
  };
  return listings.map((listing: any, idx: number) => {
    const o = listing.offer || {};
    const v = (o.vehicles || [])[0] || {};
    const amt = (o.amounts || [])[0] || {};
    const mapped = typeMap[o.offer_type] || { short: o.offer_type || "offer", long: "OFFER" as IncentiveType };
    const amount = mapped.short === "cashback" ? (o.cashback_amount || 0)
      : mapped.short === "apr" ? (amt.apr || 0)
      : mapped.short === "lease" ? (amt.monthly || 0) : 0;
    const amountDisplay = mapped.short === "cashback" ? `$${(amount as number).toLocaleString()} Cash Back`
      : mapped.short === "apr" ? `${amount}% APR / ${amt.term || 0}mo`
      : mapped.short === "lease" ? `$${amount}/mo / ${amt.term || 0}mo` : "Offer";
    return {
      id: listing.id || `inc-${idx}`,
      make: v.make || "",
      model: v.model || "",
      type: mapped.long,
      title: (o.titles?.[0] || o.oem_program_name || `${v.make || ""} ${o.offer_type || "offer"}`).trim(),
      description: (o.offers?.[0] || "").substring(0, 240),
      amount: amount as number,
      amountDisplay,
      term: amt.term || 0,
      eligibleModels: (o.vehicles || []).map((ve: any) => ve.model).filter(Boolean),
      expirationDate: o.valid_through || "",
      finePrint: (o.disclaimers?.[0] || "").substring(0, 300),
    };
  });
}

// ── _transformToReport — pure function: API payload → ReportData ──────
function _transformToReport(raw: any, args: { make: string; state?: string | null }, mode: "demo" | "live" | "mcp"): ReportData {
  const incentivesRaw = raw?.incentives;
  const soldByModel = raw?.soldByModel;
  const soldByBodyType = raw?.soldByBodyType;
  const activeInv = raw?.activeInv;

  const partial = !incentivesRaw || !soldByModel || !soldByBodyType || !activeInv;

  // Normalize incentives
  const incentives: NormalizedIncentive[] = transformIncentiveListings(incentivesRaw || { listings: [] });

  // Build a quick lookup: model name (lowercased) → IncentiveType[] active
  const modelToTypes = new Map<string, Set<IncentiveType>>();
  const modelToAmounts = new Map<string, { CASH_BACK: number; LOW_APR: number; LEASE_SPECIAL: number }>();
  for (const inc of incentives) {
    const targets = inc.eligibleModels.length ? inc.eligibleModels : (inc.model ? [inc.model] : []);
    for (const m of targets) {
      const key = m.toLowerCase();
      if (!modelToTypes.has(key)) modelToTypes.set(key, new Set());
      modelToTypes.get(key)!.add(inc.type);
      if (!modelToAmounts.has(key)) modelToAmounts.set(key, { CASH_BACK: 0, LOW_APR: 0, LEASE_SPECIAL: 0 });
      const amts = modelToAmounts.get(key)!;
      if (inc.type === "CASH_BACK") amts.CASH_BACK = Math.max(amts.CASH_BACK, inc.amount);
      else if (inc.type === "LOW_APR") amts.LOW_APR = amts.LOW_APR === 0 ? inc.amount : Math.min(amts.LOW_APR, inc.amount);
      else if (inc.type === "LEASE_SPECIAL") amts.LEASE_SPECIAL = amts.LEASE_SPECIAL === 0 ? inc.amount : Math.min(amts.LEASE_SPECIAL, inc.amount);
    }
  }

  // Build active-inventory-by-model lookup from facets
  const activeByModel = new Map<string, number>();
  const facetModel = activeInv?.facets?.model || [];
  for (const f of facetModel) {
    if (f?.item) activeByModel.set(String(f.item).toLowerCase(), Number(f.count) || 0);
  }

  // Brand-level avg DOM (baseline) — try stats first, fall back to active-listing scan
  let brandAvgDom = activeInv?.stats?.dom?.avg ?? activeInv?.stats?.dom?.mean ?? 0;
  if (!brandAvgDom) {
    const lst = activeInv?.listings || [];
    let sum = 0, n = 0;
    for (const l of lst) {
      const d = l.dom ?? l.days_on_market ?? 0;
      if (d > 0) { sum += d; n++; }
    }
    brandAvgDom = n ? sum / n : 0;
  }

  // Build models[] from soldByModel rankings.
  // Response shape: { data: [{ make, model, sold_count, average_sale_price, average_days_on_market, ... }] }
  const soldRows: any[] = Array.isArray(soldByModel?.data) ? soldByModel.data
    : Array.isArray(soldByModel?.rankings) ? soldByModel.rankings : [];

  // DI-1: read make from BOTH the flat shape (`r.make`) and the dimension_values shape
  // (`r.dimension_values[0]`) before deciding to admit a row. The bare `!r.make` clause
  // would otherwise leak rows from other makes when the API returns dimension_values.
  const allModels: ModelRow[] = soldRows
    .filter((r) => {
      const rowMake = String(r.make ?? r.dimension_values?.[0] ?? "").toLowerCase();
      return !rowMake || rowMake === args.make.toLowerCase();
    })
    .map((r) => {
      const modelName = String(r.model ?? r.dimension_values?.[1] ?? r.dimension_value ?? "").trim();
      if (!modelName) return null;
      const soldCount = Number(r.sold_count ?? r.count ?? 0);
      const avgDom = Number(r.average_days_on_market ?? r.avg_days_on_market ?? r.dom ?? 0);
      const avgSalePrice = Number(r.average_sale_price ?? r.avg_sale_price ?? 0);
      const key = modelName.toLowerCase();
      const types = modelToTypes.get(key);
      const incentiveTypes: IncentiveType[] = types ? Array.from(types) : [];
      const amts = modelToAmounts.get(key) || { CASH_BACK: 0, LOW_APR: 0, LEASE_SPECIAL: 0 };
      const summary = {
        CASH_BACK: amts.CASH_BACK ? `$${amts.CASH_BACK.toLocaleString()}` : "",
        LOW_APR: amts.LOW_APR ? `${amts.LOW_APR}% APR` : "",
        LEASE_SPECIAL: amts.LEASE_SPECIAL ? `$${amts.LEASE_SPECIAL}/mo` : "",
      };
      const hasIncentive = incentiveTypes.length > 0;
      const domVsBrandAvg = brandAvgDom > 0 && avgDom > 0 ? avgDom - brandAvgDom : 0;

      let roiSignal: ModelRow["roiSignal"] = "ON_TRACK";
      let roiReason = "Velocity and incentive support balanced";
      if (hasIncentive && domVsBrandAvg < -10 && incentiveTypes.length >= 2) {
        roiSignal = "REDUCE";
        roiReason = `Selling fast (${Math.round(avgDom)}d vs ${Math.round(brandAvgDom)}d baseline) with ${incentiveTypes.length} stacked offers — likely overspending`;
      } else if (domVsBrandAvg > 10 && (!hasIncentive || incentiveTypes.length <= 1)) {
        roiSignal = "INCREASE";
        roiReason = hasIncentive
          ? `Slow turn (${Math.round(avgDom)}d vs ${Math.round(brandAvgDom)}d) with only ${incentiveTypes.length} active offer — consider stacking`
          : `Slow turn (${Math.round(avgDom)}d vs ${Math.round(brandAvgDom)}d) and no active incentive support`;
      }

      return {
        model: modelName,
        soldCount, avgDom, avgSalePrice,
        activeInventoryCount: activeByModel.get(key) || 0,
        hasIncentive,
        incentiveTypes,
        incentiveSummary: summary,
        domVsBrandAvg,
        roiSignal,
        roiReason,
      } as ModelRow;
    })
    .filter((m): m is ModelRow => m !== null);

  // DI-2: keep the full set for honest coverage % and KPI math; slice only for display.
  const models: ModelRow[] = [...allModels].sort((a, b) => b.soldCount - a.soldCount).slice(0, 12);

  // KPIs — coverage and DOM averages computed across ALL tracked models, not just the top-12.
  const totalIncentivePrograms = incentives.length;
  const modelsCovered = allModels.filter((m) => m.hasIncentive).length;
  const totalModelsTracked = allModels.length;
  const coveragePct = totalModelsTracked > 0 ? (modelsCovered / totalModelsTracked) * 100 : 0;

  let withSum = 0, withWeight = 0, withoutSum = 0, withoutWeight = 0;
  for (const m of allModels) {
    if (m.avgDom <= 0) continue;
    if (m.hasIncentive) { withSum += m.avgDom * m.soldCount; withWeight += m.soldCount; }
    else { withoutSum += m.avgDom * m.soldCount; withoutWeight += m.soldCount; }
  }
  const avgDomWithIncentive = withWeight ? withSum / withWeight : 0;
  const avgDomWithoutIncentive = withoutWeight ? withoutSum / withoutWeight : 0;
  const avgDomLiftDays = (avgDomWithoutIncentive && avgDomWithIncentive)
    ? avgDomWithoutIncentive - avgDomWithIncentive : 0;

  // Segment mix from soldByBodyType
  const segRows: any[] = Array.isArray(soldByBodyType?.data) ? soldByBodyType.data
    : Array.isArray(soldByBodyType?.rankings) ? soldByBodyType.rankings : [];
  const segTotal = segRows.reduce((s, r) => s + Number(r.sold_count ?? r.count ?? 0), 0);
  const segmentMix: SegmentRow[] = segRows
    .map((r) => ({
      bodyType: String(r.body_type ?? r.dimension_values?.[0] ?? r.dimension_value ?? "Other"),
      soldCount: Number(r.sold_count ?? r.count ?? 0),
      sharePct: segTotal ? (Number(r.sold_count ?? r.count ?? 0) / segTotal) * 100 : 0,
    }))
    .filter((s) => s.bodyType && s.soldCount > 0)
    .sort((a, b) => b.soldCount - a.soldCount)
    .slice(0, 8);

  const recommendations = models
    .filter((m) => m.roiSignal !== "ON_TRACK")
    .map((m) => ({ model: m.model, action: m.roiSignal, reason: m.roiReason }));

  const signals = generateSignals({ models, incentives, kpis: {
    activeIncentivePrograms: totalIncentivePrograms,
    modelsCovered, totalModelsTracked, coveragePct,
    avgDomWithIncentive, avgDomWithoutIncentive, avgDomLiftDays, brandAvgDom,
  }});

  return {
    make: args.make, state: args.state ?? null, month: raw?.month ?? "",
    kpis: {
      activeIncentivePrograms: totalIncentivePrograms,
      modelsCovered, totalModelsTracked, coveragePct,
      avgDomWithIncentive, avgDomWithoutIncentive, avgDomLiftDays, brandAvgDom,
    },
    incentives, models, segmentMix, recommendations, signals,
    partial, mode,
  };
}

// ── generateSignals — rule-based bullet callouts ───────────────────────
function generateSignals(d: { models: ModelRow[]; incentives: NormalizedIncentive[]; kpis: ReportData["kpis"] }): string[] {
  const out: string[] = [];

  // Coverage
  if (d.kpis.totalModelsTracked > 0) {
    out.push(`<strong>${d.kpis.modelsCovered} of ${d.kpis.totalModelsTracked}</strong> top-volume models currently have at least one active incentive (<strong>${d.kpis.coveragePct.toFixed(0)}% coverage</strong>).`);
  }

  // DOM lift
  if (d.kpis.avgDomLiftDays > 0) {
    out.push(`Models with active incentives turn in <strong>${fmtDays(d.kpis.avgDomWithIncentive)}</strong> on average vs <strong>${fmtDays(d.kpis.avgDomWithoutIncentive)}</strong> without — a <strong>${Math.round(d.kpis.avgDomLiftDays)}-day velocity lift</strong>.`);
  } else if (d.kpis.avgDomWithIncentive > 0 && d.kpis.avgDomWithoutIncentive > 0) {
    out.push(`Incentivized models are <strong>not</strong> turning faster than non-incentivized (${fmtDays(d.kpis.avgDomWithIncentive)} vs ${fmtDays(d.kpis.avgDomWithoutIncentive)}) — review program targeting.`);
  }

  // Biggest red flag — slow mover with no support
  const redFlags = d.models
    .filter((m) => m.roiSignal === "INCREASE" && !m.hasIncentive)
    .sort((a, b) => b.soldCount - a.soldCount);
  if (redFlags.length) {
    const r = redFlags[0];
    out.push(`<strong style="color:#fca5a5;">Red flag:</strong> <strong>${escapeHtml(r.model)}</strong> is selling slow (${fmtDays(r.avgDom)} vs ${fmtDays(d.kpis.brandAvgDom)} baseline) with no active incentive — strong candidate for new program support.`);
  }

  // Over-spend candidate
  const overspend = d.models
    .filter((m) => m.roiSignal === "REDUCE")
    .sort((a, b) => a.avgDom - b.avgDom);
  if (overspend.length) {
    const r = overspend[0];
    out.push(`<strong style="color:#fde68a;">Reallocation candidate:</strong> <strong>${escapeHtml(r.model)}</strong> moves quickly (${fmtDays(r.avgDom)}) but carries ${r.incentiveTypes.length} stacked offers — recover budget for slower models.`);
  }

  // Program breadth
  const counts = { CASH_BACK: 0, LOW_APR: 0, LEASE_SPECIAL: 0, LOYALTY: 0, CONQUEST: 0, OFFER: 0 };
  for (const i of d.incentives) (counts as any)[i.type] = ((counts as any)[i.type] || 0) + 1;
  if (d.incentives.length) {
    const parts: string[] = [];
    if (counts.CASH_BACK)     parts.push(`${counts.CASH_BACK} cash back`);
    if (counts.LOW_APR)       parts.push(`${counts.LOW_APR} low APR`);
    if (counts.LEASE_SPECIAL) parts.push(`${counts.LEASE_SPECIAL} lease`);
    if (counts.LOYALTY)       parts.push(`${counts.LOYALTY} loyalty`);
    if (counts.CONQUEST)      parts.push(`${counts.CONQUEST} conquest`);
    if (parts.length) out.push(`Active program mix: ${parts.join(" · ")}.`);
  }

  // Expiration alert
  const expSoon = d.incentives.filter((i) => {
    const days = daysUntil(i.expirationDate);
    return days > 0 && days <= 14;
  });
  if (expSoon.length) {
    out.push(`<strong style="color:#fbbf24;">Expiring soon:</strong> ${expSoon.length} program${expSoon.length === 1 ? "" : "s"} expire in the next 14 days — review renewals.`);
  }

  return out;
}

// ── Mock Data ──────────────────────────────────────────────────────────

// Shared types for mock presets.
type MockModel = { model: string; soldCount: number; avgDom: number; avgSalePrice: number; active: number };
type MockIncentive = { type: IncentiveType; title: string; amount: number; term: number; models: string[]; desc: string; endDate: string };
type MockPreset = { models: MockModel[]; bodyTypeOf: Record<string, string>; incentives: MockIncentive[] };

// DI-4: derive segments from model totals so the segment-mix breakdown always
// equals the sum of the model rows assigned to each body type. No hand-keyed counts.
function buildSegments(models: MockModel[], bodyTypeOf: Record<string, string>): { bodyType: string; count: number }[] {
  const sums = new Map<string, number>();
  for (const m of models) {
    const bt = bodyTypeOf[m.model] ?? "Other";
    sums.set(bt, (sums.get(bt) ?? 0) + m.soldCount);
  }
  return [...sums.entries()].sort((a, b) => b[1] - a[1]).map(([bodyType, count]) => ({ bodyType, count }));
}

function getMockData(args: { make: string; state?: string | null }): ReportData {
  const make = args.make || DEFAULT_BRAND;

  // Curated mock blocks for the four flagship brands; synthetic fallback for everyone else.
  // DI-5: the per-row `types` and `amts` fields used to live here as scaffolding — they
  // were never read by the transform. The `incentives` block below is the single source
  // of truth for which models have which active offers.
  const TOYOTA: MockPreset = {
    models: [
      { model: "RAV4",       soldCount: 38500, avgDom: 22, avgSalePrice: 32400, active: 4200 },
      { model: "Camry",      soldCount: 31800, avgDom: 28, avgSalePrice: 28100, active: 3550 },
      { model: "Corolla",    soldCount: 22600, avgDom: 31, avgSalePrice: 22800, active: 2900 },
      { model: "Highlander", soldCount: 19200, avgDom: 47, avgSalePrice: 46100, active: 2400 },
      { model: "Tacoma",     soldCount: 17800, avgDom: 19, avgSalePrice: 39400, active: 2050 },
      { model: "Tundra",     soldCount: 11400, avgDom: 52, avgSalePrice: 56800, active: 1800 },
      { model: "4Runner",    soldCount:  8900, avgDom: 41, avgSalePrice: 49200, active: 1400 },
      { model: "Prius",      soldCount:  7600, avgDom: 35, avgSalePrice: 30500, active: 1100 },
      { model: "Sienna",     soldCount:  6200, avgDom: 58, avgSalePrice: 48700, active:  980 },
      { model: "Crown",      soldCount:  3100, avgDom: 64, avgSalePrice: 47800, active:  620 },
    ],
    bodyTypeOf: {
      RAV4: "SUV", Highlander: "SUV", "4Runner": "SUV",
      Camry: "Sedan", Corolla: "Sedan", Prius: "Sedan", Crown: "Sedan",
      Tacoma: "Pickup", Tundra: "Pickup",
      Sienna: "Van",
    },
    incentives: [
      { type: "CASH_BACK",     title: "Spring Sales Event Cash Back", amount: 2500, term: 0,  models: ["Camry","Corolla","Crown"], desc: "Customer cash back on select 2025–2026 models during the Spring Sales Event.", endDate: "2026-05-15" },
      { type: "LOW_APR",       title: "RAV4 Low APR Financing",       amount: 2.9,  term: 60, models: ["RAV4"],                    desc: "Special 2.9% APR for up to 60 months on new 2025–2026 RAV4.", endDate: "2026-05-15" },
      { type: "LEASE_SPECIAL", title: "Camry Lease Special",          amount: 279,  term: 36, models: ["Camry"],                   desc: "Lease a new 2026 Camry SE for $279/month for 36 months.", endDate: "2026-05-30" },
      { type: "LEASE_SPECIAL", title: "RAV4 Lease Deal",              amount: 349,  term: 36, models: ["RAV4"],                    desc: "Lease a new 2026 RAV4 XLE for $349/month for 36 months.", endDate: "2026-05-30" },
      { type: "CASH_BACK",     title: "Highlander Bonus Cash",        amount: 3000, term: 0,  models: ["Highlander"],              desc: "Factory bonus cash on all new 2025 Highlander XLE and Limited.", endDate: "2026-05-08" },
      { type: "LOW_APR",       title: "Corolla 0.9% APR",             amount: 0.9,  term: 48, models: ["Corolla"],                 desc: "0.9% APR for 48 months on new 2025–2026 Corolla.", endDate: "2026-06-15" },
      { type: "LEASE_SPECIAL", title: "Corolla Lease Deal",           amount: 249,  term: 36, models: ["Corolla"],                 desc: "Lease a new 2026 Corolla LE for $249/month for 36 months.", endDate: "2026-05-30" },
      { type: "CASH_BACK",     title: "Tacoma Cash Allowance",        amount: 1500, term: 0,  models: ["Tacoma"],                  desc: "Factory cash allowance on all new 2025 Tacoma SR/SR5/TRD Sport.", endDate: "2026-05-15" },
      { type: "LOW_APR",       title: "Prius 0% APR Event",           amount: 0.0,  term: 48, models: ["Prius"],                   desc: "0% APR for 48 months on new Prius and Prius Prime.", endDate: "2026-06-30" },
      { type: "CASH_BACK",     title: "4Runner Adventure Bonus",      amount: 1250, term: 0,  models: ["4Runner"],                 desc: "Bonus cash on the 2026 4Runner SR5 and Limited.", endDate: "2026-06-15" },
      { type: "LOW_APR",       title: "Tundra Low Rate",              amount: 2.9,  term: 72, models: ["Tundra"],                  desc: "2.9% APR for 72 months on new 2025–2026 Tundra.", endDate: "2026-06-15" },
      { type: "CASH_BACK",     title: "Camry Loyalty Cash",           amount: 750,  term: 0,  models: ["Camry","Corolla","RAV4"],  desc: "Loyalty bonus for current Toyota owners or lessees.", endDate: "2026-06-30" },
    ],
  };

  const HONDA: MockPreset = {
    models: [
      { model: "CR-V",      soldCount: 32100, avgDom: 24, avgSalePrice: 33800, active: 3700 },
      { model: "Civic",     soldCount: 27400, avgDom: 30, avgSalePrice: 25400, active: 3200 },
      { model: "Accord",    soldCount: 24500, avgDom: 33, avgSalePrice: 30200, active: 2900 },
      { model: "Pilot",     soldCount: 14200, avgDom: 51, avgSalePrice: 48900, active: 2100 },
      { model: "Passport",  soldCount:  8900, avgDom: 44, avgSalePrice: 44600, active: 1450 },
      { model: "HR-V",      soldCount:  9800, avgDom: 38, avgSalePrice: 26200, active: 1380 },
      { model: "Odyssey",   soldCount:  6800, avgDom: 56, avgSalePrice: 41200, active: 1100 },
      { model: "Ridgeline", soldCount:  4900, avgDom: 62, avgSalePrice: 43800, active:  890 },
    ],
    bodyTypeOf: {
      "CR-V": "SUV", Pilot: "SUV", Passport: "SUV", "HR-V": "SUV",
      Civic: "Sedan", Accord: "Sedan",
      Ridgeline: "Pickup",
      Odyssey: "Van",
    },
    incentives: [
      { type: "CASH_BACK",     title: "Civic Cash Incentive",   amount: 1500, term: 0,  models: ["Civic"],  desc: "Factory cash back on new 2025–2026 Civic models.", endDate: "2026-05-30" },
      { type: "LOW_APR",       title: "CR-V Low APR Financing", amount: 1.9,  term: 60, models: ["CR-V"],   desc: "Special 1.9% APR for 60 months on new 2025–2026 CR-V.", endDate: "2026-05-30" },
      { type: "LEASE_SPECIAL", title: "CR-V Lease Special",     amount: 339,  term: 36, models: ["CR-V"],   desc: "Lease a new 2026 CR-V EX for $339/month for 36 months.", endDate: "2026-06-15" },
      { type: "LEASE_SPECIAL", title: "Civic Lease Deal",       amount: 269,  term: 36, models: ["Civic"],  desc: "Lease a new 2026 Civic LX for $269/month for 36 months.", endDate: "2026-06-15" },
      { type: "CASH_BACK",     title: "Accord Cash Bonus",      amount: 1750, term: 0,  models: ["Accord"], desc: "Factory cash back on new 2025–2026 Accord models.", endDate: "2026-05-30" },
      { type: "LOW_APR",       title: "Accord Low APR",         amount: 1.9,  term: 60, models: ["Accord"], desc: "1.9% APR for 60 months on new 2025–2026 Accord.", endDate: "2026-05-30" },
      { type: "LEASE_SPECIAL", title: "Accord Lease Deal",      amount: 299,  term: 36, models: ["Accord"], desc: "Lease a new 2026 Accord Sport for $299/month for 36 months.", endDate: "2026-06-15" },
      { type: "CASH_BACK",     title: "Pilot Cash Allowance",   amount: 2500, term: 0,  models: ["Pilot"],  desc: "Factory cash allowance on new 2025 Pilot.", endDate: "2026-06-30" },
      { type: "LEASE_SPECIAL", title: "HR-V Lease",             amount: 249,  term: 36, models: ["HR-V"],   desc: "Lease a new 2026 HR-V LX for $249/month for 36 months.", endDate: "2026-06-15" },
    ],
  };

  const HYUNDAI: MockPreset = {
    models: [
      { model: "Tucson",   soldCount: 22500, avgDom: 33, avgSalePrice: 31200, active: 2900 },
      { model: "Santa Fe", soldCount: 16800, avgDom: 38, avgSalePrice: 38400, active: 2200 },
      { model: "Elantra",  soldCount: 18400, avgDom: 36, avgSalePrice: 23900, active: 2400 },
      { model: "Palisade", soldCount: 11200, avgDom: 41, avgSalePrice: 47600, active: 1700 },
      { model: "Sonata",   soldCount:  9800, avgDom: 44, avgSalePrice: 27800, active: 1500 },
      { model: "Kona",     soldCount:  8900, avgDom: 39, avgSalePrice: 25400, active: 1300 },
      { model: "Venue",    soldCount:  4200, avgDom: 49, avgSalePrice: 21100, active:  720 },
      { model: "IONIQ 5",  soldCount:  6300, avgDom: 56, avgSalePrice: 49200, active: 1100 },
    ],
    bodyTypeOf: {
      Tucson: "SUV", "Santa Fe": "SUV", Palisade: "SUV", Kona: "SUV", Venue: "SUV",
      Elantra: "Sedan", Sonata: "Sedan",
      "IONIQ 5": "EV",
    },
    incentives: [
      { type: "CASH_BACK",     title: "Tucson Spring Cash",     amount: 2000, term: 0,  models: ["Tucson"],   desc: "Factory cash on new 2025–2026 Tucson.", endDate: "2026-05-30" },
      { type: "CASH_BACK",     title: "Santa Fe Bonus Cash",    amount: 2500, term: 0,  models: ["Santa Fe"], desc: "Bonus cash on new 2025 Santa Fe.", endDate: "2026-06-15" },
      { type: "LOW_APR",       title: "Santa Fe Low APR",       amount: 2.9,  term: 60, models: ["Santa Fe"], desc: "2.9% APR for 60 months on new Santa Fe.", endDate: "2026-06-15" },
      { type: "CASH_BACK",     title: "Elantra Cash Incentive", amount: 1500, term: 0,  models: ["Elantra"],  desc: "Cash back on new 2025–2026 Elantra.", endDate: "2026-05-30" },
      { type: "LOW_APR",       title: "Palisade Low APR",       amount: 1.9,  term: 60, models: ["Palisade"], desc: "1.9% APR for 60 months on new Palisade.", endDate: "2026-06-30" },
      { type: "CASH_BACK",     title: "Sonata Cash Bonus",      amount: 2000, term: 0,  models: ["Sonata"],   desc: "Cash back on new 2025–2026 Sonata.", endDate: "2026-05-15" },
      { type: "LEASE_SPECIAL", title: "Tucson Lease Deal",      amount: 269,  term: 36, models: ["Tucson"],   desc: "Lease a new 2026 Tucson SE for $269/month.", endDate: "2026-06-15" },
      { type: "LEASE_SPECIAL", title: "Sonata Lease Special",   amount: 249,  term: 36, models: ["Sonata"],   desc: "Lease a new 2026 Sonata SEL for $249/month.", endDate: "2026-06-15" },
      { type: "LEASE_SPECIAL", title: "Kona Lease",             amount: 219,  term: 36, models: ["Kona"],     desc: "Lease a new 2026 Kona SEL for $219/month.", endDate: "2026-06-15" },
      { type: "CASH_BACK",     title: "IONIQ 5 EV Bonus",       amount: 7500, term: 0,  models: ["IONIQ 5"],  desc: "$7,500 EV bonus cash on new IONIQ 5.", endDate: "2026-05-30" },
    ],
  };

  const FORD_FAMILY: MockPreset = {
    models: [
      { model: "F-150",    soldCount: 51400, avgDom: 28, avgSalePrice: 56800, active: 5800 },
      { model: "Explorer", soldCount: 22800, avgDom: 36, avgSalePrice: 46200, active: 2900 },
      { model: "Escape",   soldCount: 16400, avgDom: 41, avgSalePrice: 32800, active: 2400 },
      { model: "Bronco",   soldCount: 12800, avgDom: 24, avgSalePrice: 49600, active: 1800 },
      { model: "Ranger",   soldCount:  9800, avgDom: 33, avgSalePrice: 40200, active: 1500 },
      { model: "Edge",     soldCount:  7400, avgDom: 52, avgSalePrice: 38900, active: 1200 },
      { model: "Mustang",  soldCount:  6900, avgDom: 47, avgSalePrice: 44200, active: 1100 },
      { model: "Maverick", soldCount:  9100, avgDom: 19, avgSalePrice: 28400, active: 1400 },
    ],
    bodyTypeOf: {
      Explorer: "SUV", Escape: "SUV", Bronco: "SUV", Edge: "SUV",
      "F-150": "Pickup", Ranger: "Pickup", Maverick: "Pickup",
      Mustang: "Coupe",
    },
    incentives: [
      { type: "CASH_BACK",     title: "F-150 Cash Allowance", amount: 2000, term: 0,  models: ["F-150"],    desc: "Factory cash on new 2025 F-150 XL/XLT/Lariat.", endDate: "2026-05-30" },
      { type: "LOW_APR",       title: "F-150 Low APR",        amount: 3.9,  term: 72, models: ["F-150"],    desc: "3.9% APR for 72 months on new F-150.", endDate: "2026-05-30" },
      { type: "CASH_BACK",     title: "Explorer Bonus Cash",  amount: 1500, term: 0,  models: ["Explorer"], desc: "Bonus cash on new 2025 Explorer.", endDate: "2026-06-15" },
      { type: "LEASE_SPECIAL", title: "Explorer Lease",       amount: 389,  term: 36, models: ["Explorer"], desc: "Lease a new 2026 Explorer XLT for $389/mo.", endDate: "2026-06-15" },
      { type: "CASH_BACK",     title: "Escape Cash",          amount: 1500, term: 0,  models: ["Escape"],   desc: "Factory cash on 2025 Escape.", endDate: "2026-05-30" },
      { type: "LOW_APR",       title: "Ranger 2.9% APR",      amount: 2.9,  term: 60, models: ["Ranger"],   desc: "2.9% APR for 60 months on new Ranger.", endDate: "2026-06-30" },
      { type: "CASH_BACK",     title: "Edge Discount Cash",   amount: 2000, term: 0,  models: ["Edge"],     desc: "Cash on 2025 Edge.", endDate: "2026-05-08" },
      { type: "LEASE_SPECIAL", title: "Mustang Lease",        amount: 419,  term: 36, models: ["Mustang"],  desc: "Lease a 2026 Mustang EcoBoost for $419/mo.", endDate: "2026-06-15" },
    ],
  };

  // Pick the right preset, or generate synthetic data parameterized off the brand string.
  const lookup: Record<string, MockPreset> = {
    Toyota: TOYOTA, Honda: HONDA, Hyundai: HYUNDAI, Ford: FORD_FAMILY,
  };
  const preset = lookup[make] ?? makeSyntheticPreset(make);

  // Derive segment counts from the model rows so they always sum correctly.
  const segments = buildSegments(preset.models, preset.bodyTypeOf);

  // Build raw shape that _transformToReport understands (matches the live API response keys).
  const incentives = {
    listings: preset.incentives.map((i, idx) => ({
      id: `mock-${make}-${idx}`,
      offer: {
        offer_type: i.type === "CASH_BACK" ? "cash" : i.type === "LOW_APR" ? "finance" : i.type === "LEASE_SPECIAL" ? "lease" : "offer",
        titles: [i.title],
        offers: [i.desc],
        cashback_amount: i.type === "CASH_BACK" ? i.amount : 0,
        amounts: i.type === "LOW_APR" ? [{ apr: i.amount, term: i.term }]
               : i.type === "LEASE_SPECIAL" ? [{ monthly: i.amount, term: i.term }]
               : [],
        vehicles: i.models.map((m) => ({ make, model: m })),
        valid_through: i.endDate,
        disclaimers: ["Subject to credit approval. See dealer for details."],
      },
    })),
  };

  const soldByModel = {
    data: preset.models.map((m) => ({
      make, model: m.model,
      sold_count: m.soldCount,
      average_sale_price: m.avgSalePrice,
      average_days_on_market: m.avgDom,
    })),
  };

  const soldByBodyType = {
    data: segments.map((s) => ({ body_type: s.bodyType, sold_count: s.count })),
  };

  const totalActive = preset.models.reduce((s, m) => s + m.active, 0);
  const weightedDom = preset.models.reduce((s, m) => s + m.avgDom * m.active, 0) / Math.max(totalActive, 1);
  const activeInv = {
    num_found: totalActive,
    facets: {
      model: preset.models.map((m) => ({ item: m.model, count: m.active })),
      body_type: segments.map((s) => ({ item: s.bodyType, count: Math.round(s.count * 0.12) })),
    },
    stats: {
      price: { min: 18000, max: 78000, avg: preset.models.reduce((s, m) => s + m.avgSalePrice, 0) / preset.models.length },
      miles: { min: 5, max: 200, avg: 25 },
      dom:   { avg: weightedDom, mean: weightedDom },
    },
    listings: [],
  };

  const raw = { make, state: args.state ?? null, month: "", incentives, soldByModel, soldByBodyType, activeInv };
  return _transformToReport(raw, { make, state: args.state }, "demo");
}

function makeSyntheticPreset(make: string): MockPreset {
  // Deterministic synthetic data parametric on the brand string so the same brand always renders identically.
  const seed = Array.from(make).reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rng = (n: number) => {
    let x = (seed * n) >>> 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return ((x >>> 0) % 1000) / 1000;
  };
  // Each family carries its body type explicitly so substring tricks aren't needed.
  const families: Array<{ label: string; bodyType: string }> = [
    { label: "Sedan A", bodyType: "Sedan" },
    { label: "Sedan B", bodyType: "Sedan" },
    { label: "SUV A",   bodyType: "SUV" },
    { label: "SUV B",   bodyType: "SUV" },
    { label: "SUV C",   bodyType: "SUV" },
    { label: "Coupe",   bodyType: "Coupe" },
    { label: "EV",      bodyType: "EV" },
    { label: "Pickup",  bodyType: "Pickup" },
  ];

  const models: MockModel[] = [];
  const bodyTypeOf: Record<string, string> = {};
  const incentives: MockIncentive[] = [];

  families.forEach(({ label, bodyType }, i) => {
    const modelName = `${make} ${label}`;
    const sold = Math.round(8000 + rng(i + 1) * 25000);
    const dom = Math.round(22 + rng(i + 11) * 40);
    const price = Math.round(24000 + rng(i + 21) * 30000);
    const active = Math.round(sold * (0.10 + rng(i + 31) * 0.06));
    models.push({ model: modelName, soldCount: sold, avgDom: dom, avgSalePrice: price, active });
    bodyTypeOf[modelName] = bodyType;

    const hasCash  = rng(i + 41) > 0.4;
    const hasApr   = rng(i + 51) > 0.55;
    const hasLease = rng(i + 61) > 0.6;
    if (hasCash) {
      const amt = Math.round(1000 + rng(i + 71) * 2000);
      incentives.push({ type: "CASH_BACK", title: `${modelName} Cash Bonus`, amount: amt, term: 0, models: [modelName], desc: `Factory cash on new ${modelName}.`, endDate: "2026-05-30" });
    }
    if (hasApr) {
      const apr = Math.round(10 + rng(i + 81) * 30) / 10;
      incentives.push({ type: "LOW_APR", title: `${modelName} Low APR`, amount: apr, term: 60, models: [modelName], desc: `${apr}% APR for 60 months on ${modelName}.`, endDate: "2026-06-15" });
    }
    if (hasLease) {
      const mo = Math.round(229 + rng(i + 91) * 200);
      incentives.push({ type: "LEASE_SPECIAL", title: `${modelName} Lease`, amount: mo, term: 36, models: [modelName], desc: `Lease ${modelName} for $${mo}/mo.`, endDate: "2026-06-15" });
    }
  });

  return { models, bodyTypeOf, incentives };
}

// ── Canvas Charts ──────────────────────────────────────────────────────
function drawDomBars(canvas: HTMLCanvasElement, data: ModelRow[], brandAvgDom: number) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  if (!data.length) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "13px -apple-system, sans-serif";
    ctx.fillText("No model-level sales data", 12, 24);
    return;
  }

  const padTop = 12, padBottom = 24, padLeft = 130, padRight = 80;
  const usableH = h - padTop - padBottom;
  const usableW = w - padLeft - padRight;
  const rowH = Math.max(18, Math.floor(usableH / data.length) - 4);
  const maxSold = Math.max(...data.map((d) => d.soldCount), 1);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textAlign = "right";

  data.forEach((row, i) => {
    const y = padTop + i * (rowH + 4);
    // model label
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "12px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(row.model.substring(0, 14), padLeft - 8, y + rowH * 0.7);

    const barW = (row.soldCount / maxSold) * usableW;
    const fasterThanAvg = row.domVsBrandAvg < 0;
    const color = row.avgDom === 0 ? "#475569" : fasterThanAvg ? "#22c55e" : "#ef4444";
    ctx.fillStyle = color + "cc";
    ctx.fillRect(padLeft, y, barW, rowH);
    ctx.fillStyle = color;
    ctx.fillRect(padLeft, y, 3, rowH);

    // DOM number to the right of bar
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${Math.round(row.avgDom)}d · ${fmtN(row.soldCount)}`, padLeft + barW + 6, y + rowH * 0.7);
  });

  // Brand-avg line
  if (brandAvgDom > 0) {
    ctx.strokeStyle = "#94a3b8";
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop + usableH + 4);
    ctx.lineTo(padLeft + usableW, padTop + usableH + 4);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Brand avg: ${Math.round(brandAvgDom)} days`, padLeft, padTop + usableH + 18);
  }
}

function drawCoverageDonut(canvas: HTMLCanvasElement, models: ModelRow[]) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const withInventory = models.filter((m) => m.activeInventoryCount > 0);
  const data = withInventory.slice(0, 8);
  if (!data.length) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "13px -apple-system, sans-serif";
    ctx.fillText("No active-inventory facet data", 12, 24);
    return;
  }

  // DI-6: when the brand has more models than fit in the donut, label the center honestly.
  const total = data.reduce((s, m) => s + m.activeInventoryCount, 0);
  const centerCaption = withInventory.length > 8 ? "active units (top 8)" : "active units";
  const cx = w * 0.36;
  const cy = h * 0.55;
  const outerR = Math.min(w * 0.30, h * 0.40);
  const innerR = outerR * 0.55;

  let start = -Math.PI / 2;
  const palette = ["#3b82f6", "#22c55e", "#a855f7", "#f59e0b", "#ef4444", "#14b8a6", "#ec4899", "#fb923c"];

  data.forEach((m, i) => {
    const sweep = (m.activeInventoryCount / total) * 2 * Math.PI;
    const end = start + sweep;
    const base = palette[i % palette.length];
    const fill = m.hasIncentive ? base : base + "55";

    ctx.beginPath();
    ctx.arc(cx, cy, outerR, start, end);
    ctx.arc(cx, cy, innerR, end, start, true);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (m.hasIncentive) {
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    start = end;
  });

  // Center label
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "700 18px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(fmtN(total), cx, cy - 2);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.fillText(centerCaption, cx, cy + 14);

  // Legend
  const lx = w * 0.70;
  let ly = 18;
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textAlign = "left";
  data.forEach((m, i) => {
    const base = palette[i % palette.length];
    ctx.fillStyle = m.hasIncentive ? base : base + "55";
    ctx.fillRect(lx, ly, 10, 10);
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`${m.model.substring(0, 10)}${m.hasIncentive ? " ◆" : ""}`, lx + 16, ly + 9);
    ly += 16;
  });
  // Legend caption
  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.fillText("◆ has active incentive", lx, ly + 6);
}

// ── Main App ───────────────────────────────────────────────────────────
async function main() {
  // Only connect when actually inside an MCP host. Outside one, connect() fires
  // an initialize JSON-RPC into the void and the SDK rejects async with
  // "Method not found" — pollutes the console for no benefit.
  if (_detectAppMode() === "mcp") {
    try { (_safeApp as any)?.connect?.()?.catch?.(() => {}); } catch {}
  }

  document.body.style.cssText = "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;overflow-x:hidden;min-height:100vh;";

  const container = document.createElement("div");
  container.style.cssText = "max-width:1280px;margin:0 auto;padding:16px 20px 40px;";
  document.body.appendChild(container);

  // ── Demo banner ──
  if (_detectAppMode() === "demo") {
    const _db = document.createElement("div");
    _db.id = "_demo_banner";
    _db.style.cssText = "background:linear-gradient(135deg,#92400e22,#f59e0b11);border:1px solid #f59e0b44;border-radius:10px;padding:14px 20px;margin-bottom:12px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;";
    _db.innerHTML = `
      <div style="flex:1;min-width:200px;">
        <div style="font-size:13px;font-weight:700;color:#fbbf24;margin-bottom:2px;">&#9888; Demo Mode — Showing sample data</div>
        <div style="font-size:12px;color:#d97706;">Enter your MarketCheck Enterprise API key to see real market data. <a href="https://developers.marketcheck.com" target="_blank" style="color:#fbbf24;text-decoration:underline;">Get a free key</a></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <input id="_banner_key" type="text" placeholder="Paste your API key" style="padding:8px 12px;border-radius:6px;border:1px solid #f59e0b44;background:#0f172a;color:#e2e8f0;font-size:13px;width:220px;outline:none;" />
        <button id="_banner_save" style="padding:8px 16px;border-radius:6px;border:none;background:#f59e0b;color:#0f172a;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">Activate</button>
      </div>`;
    container.appendChild(_db);
    (_db.querySelector("#_banner_save") as HTMLButtonElement).addEventListener("click", () => {
      const k = (_db.querySelector("#_banner_key") as HTMLInputElement).value.trim();
      if (!k) return;
      localStorage.setItem("mc_api_key", k);
      _db.style.background = "linear-gradient(135deg,#05966922,#10b98111)";
      _db.style.borderColor = "#10b98144";
      _db.innerHTML = '<div style="font-size:13px;font-weight:700;color:#10b981;">&#10003; API key saved — reloading with live data...</div>';
      setTimeout(() => location.reload(), 800);
    });
    (_db.querySelector("#_banner_key") as HTMLInputElement).addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") (_db.querySelector("#_banner_save") as HTMLButtonElement).click();
    });
  }

  // ── Header ──
  const header = document.createElement("div");
  header.style.cssText = "background:#1e293b;padding:18px 22px;border-radius:12px;margin-bottom:14px;border:1px solid #334155;display:flex;align-items:center;flex-wrap:wrap;gap:12px;";
  header.innerHTML = `<div style="flex:1;min-width:280px;">
    <h1 style="margin:0;font-size:22px;font-weight:800;color:#f8fafc;letter-spacing:-0.02em;">Incentive Effectiveness Dashboard</h1>
    <div style="margin-top:4px;font-size:13px;color:#94a3b8;">Are your incentives moving metal? Correlate active programs with model-level velocity to optimize spend.</div>
  </div>`;
  container.appendChild(header);
  _addSettingsBar(header);

  // ── Form ──
  const urlP = _getUrlParams();
  const form = document.createElement("div");
  form.style.cssText = "background:#1e293b;padding:14px 18px;border-radius:12px;margin-bottom:14px;border:1px solid #334155;display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;";

  function fieldWrap(label: string): HTMLDivElement {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    wrap.innerHTML = `<label style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">${label}</label>`;
    return wrap;
  }

  // Brand selector
  const brandWrap = fieldWrap("OEM Brand");
  const brandSelect = document.createElement("select");
  brandSelect.style.cssText = "padding:9px 12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;outline:none;width:200px;cursor:pointer;";
  for (const b of BRAND_OPTIONS) {
    const o = document.createElement("option");
    o.value = b; o.textContent = b;
    brandSelect.appendChild(o);
  }
  const otherOpt = document.createElement("option");
  otherOpt.value = "__other__"; otherOpt.textContent = "Other…";
  brandSelect.appendChild(otherOpt);
  brandWrap.appendChild(brandSelect);

  // "Other…" text input
  const otherInput = document.createElement("input");
  otherInput.type = "text";
  otherInput.placeholder = "Enter brand";
  otherInput.style.cssText = "padding:9px 12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;outline:none;width:200px;display:none;margin-top:6px;";
  brandWrap.appendChild(otherInput);
  brandSelect.addEventListener("change", () => {
    otherInput.style.display = brandSelect.value === "__other__" ? "block" : "none";
    if (brandSelect.value === "__other__") otherInput.focus();
  });
  form.appendChild(brandWrap);

  // State selector
  const stateWrap = fieldWrap("State");
  const stateSelect = document.createElement("select");
  stateSelect.style.cssText = "padding:9px 12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;outline:none;width:140px;cursor:pointer;";
  for (const s of STATES) {
    const o = document.createElement("option");
    o.value = s; o.textContent = s;
    stateSelect.appendChild(o);
  }
  stateWrap.appendChild(stateSelect);
  form.appendChild(stateWrap);

  // Apply URL params
  const initialBrand = urlP.make ?? DEFAULT_BRAND;
  if (BRAND_OPTIONS.includes(initialBrand)) {
    brandSelect.value = initialBrand;
  } else {
    brandSelect.value = "__other__";
    otherInput.style.display = "block";
    otherInput.value = initialBrand;
  }
  if (urlP.state && STATES.includes(urlP.state)) stateSelect.value = urlP.state;

  // Submit button
  const submit = document.createElement("button");
  submit.textContent = "Run Report";
  submit.style.cssText = "padding:10px 24px;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;border:none;background:#ef4444;color:#fff;height:40px;align-self:flex-end;transition:background 0.15s;";
  submit.addEventListener("mouseenter", () => { submit.style.background = "#dc2626"; });
  submit.addEventListener("mouseleave", () => { submit.style.background = "#ef4444"; });
  form.appendChild(submit);

  container.appendChild(form);

  // Results container
  const results = document.createElement("div");
  results.id = "results";
  container.appendChild(results);

  // Run handler
  async function runReport() {
    if (submit.disabled) return; // re-entry guard against Enter spam during in-flight runs
    const make = brandSelect.value === "__other__" ? otherInput.value.trim() : brandSelect.value;
    if (!make) { alert("Please select or enter an OEM brand."); return; }
    const state = stateSelect.value;

    // Push URL state
    const sp = new URLSearchParams(location.search);
    sp.set("make", make);
    if (state && state !== "National") sp.set("state", state); else sp.delete("state");
    history.replaceState(null, "", `${location.pathname}?${sp.toString()}`);

    submit.disabled = true;
    submit.textContent = "Running...";
    submit.style.opacity = "0.7";
    results.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:60px;color:#94a3b8;background:#1e293b;border-radius:12px;border:1px solid #334155;">
      <div style="width:24px;height:24px;border:3px solid #334155;border-top-color:#ef4444;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:14px;"></div>
      Analyzing incentive effectiveness for ${escapeHtml(make)}${state !== "National" ? ` in ${escapeHtml(state)}` : ""}...
    </div>`;

    const mode = _detectAppMode();
    let data: ReportData;
    try {
      const resp = await _callTool("incentive-effectiveness-dashboard", { make, state: state === "National" ? undefined : state });
      const block = resp?.content?.[0];
      const raw = block?.text ? JSON.parse(block.text) : (block as any)?.json ?? null;
      data = raw ? _transformToReport(raw, { make, state }, mode) : getMockData({ make, state });
    } catch (e) {
      console.warn("Run failed, falling back to mock:", e);
      data = getMockData({ make, state });
    }

    renderResults(results, data);

    submit.disabled = false;
    submit.textContent = "Run Report";
    submit.style.opacity = "1";
  }

  submit.addEventListener("click", runReport);
  brandSelect.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") runReport(); });
  otherInput.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") runReport(); });
  stateSelect.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") runReport(); });

  // Auto-run on first paint
  setTimeout(runReport, 50);
}

// ── Render ─────────────────────────────────────────────────────────────
function renderResults(container: HTMLElement, data: ReportData) {
  container.innerHTML = "";

  // Partial-mode notice (live mode only)
  if (data.partial && data.mode === "live") {
    const note = document.createElement("div");
    note.style.cssText = "background:linear-gradient(135deg,#92400e22,#f59e0b11);border:1px solid #f59e0b44;border-radius:10px;padding:12px 16px;margin-bottom:14px;color:#fbbf24;font-size:13px;";
    note.innerHTML = `<strong>&#9888; Partial data:</strong> Some Enterprise-API calls returned no data — your key may not have full access to the Sold Vehicle Summary endpoint. Showing what was available.`;
    container.appendChild(note);
  }

  // Title strip with brand + state
  const ctx = document.createElement("div");
  ctx.style.cssText = "font-size:13px;color:#94a3b8;margin-bottom:10px;";
  ctx.innerHTML = `Brand: <strong style="color:#f8fafc;">${escapeHtml(data.make)}</strong> · Region: <strong style="color:#f8fafc;">${escapeHtml(data.state ?? "National")}</strong>${data.month ? ` · Window: <strong style="color:#f8fafc;">${escapeHtml(data.month)}</strong>` : ""}`;
  container.appendChild(ctx);

  // ── Panel 1: KPI Strip ──
  // DI-3: avoid showing "0 days" when one of the buckets is empty (no models with/without incentive).
  const withVal = data.kpis.avgDomWithIncentive > 0 ? fmtDays(data.kpis.avgDomWithIncentive) : "—";
  const woutVal = data.kpis.avgDomWithoutIncentive > 0 ? fmtDays(data.kpis.avgDomWithoutIncentive) : "—";
  const withSub = data.kpis.avgDomWithIncentive > 0
    ? (data.kpis.avgDomLiftDays > 0 ? `${Math.round(data.kpis.avgDomLiftDays)}d faster than baseline` : "no measurable lift")
    : "no models with active incentive";
  const woutSub = data.kpis.avgDomWithoutIncentive > 0
    ? "baseline velocity"
    : "all top-volume models incentivized";
  const withColor = data.kpis.avgDomWithIncentive > 0 && data.kpis.avgDomLiftDays > 0 ? "#22c55e" : null;

  const kpis = document.createElement("div");
  kpis.style.cssText = "display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px;";
  kpis.innerHTML = [
    kpiCard("Active Programs", String(data.kpis.activeIncentivePrograms), "across all models", null),
    kpiCard("Models Covered",  `${data.kpis.modelsCovered} / ${data.kpis.totalModelsTracked}`, `${data.kpis.coveragePct.toFixed(0)}% coverage`, null),
    kpiCard("Avg DOM (w/ incentive)", withVal, withSub, withColor),
    kpiCard("Avg DOM (no incentive)", woutVal, woutSub, "#94a3b8"),
  ].join("");
  container.appendChild(kpis);

  // ── Panel 2: Model × Incentive Matrix ──
  const matrixPanel = panel("Model × Incentive Matrix", "Active offer amounts by model and program type. Rows highlighted by ROI signal.");
  const tbl = document.createElement("table");
  tbl.style.cssText = "width:100%;border-collapse:collapse;font-size:13px;";
  tbl.innerHTML = `<thead>
    <tr style="background:#0f172a;">
      <th style="padding:10px 12px;text-align:left;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;">Model</th>
      <th style="padding:10px 12px;text-align:right;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;">Sold (mo)</th>
      <th style="padding:10px 12px;text-align:right;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;">Avg DOM</th>
      <th style="padding:10px 12px;text-align:center;color:#22c55e;font-weight:600;border-bottom:1px solid #334155;">Cash Back</th>
      <th style="padding:10px 12px;text-align:center;color:#3b82f6;font-weight:600;border-bottom:1px solid #334155;">Low APR</th>
      <th style="padding:10px 12px;text-align:center;color:#a855f7;font-weight:600;border-bottom:1px solid #334155;">Lease</th>
      <th style="padding:10px 12px;text-align:center;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;">ROI Signal</th>
    </tr></thead><tbody>
    ${data.models.length === 0
      ? `<tr><td colspan="7" style="padding:24px;text-align:center;color:#94a3b8;">No model-level sales data available.</td></tr>`
      : data.models.map((m) => {
          const roi = ROI_BADGE[m.roiSignal];
          const borderLeft = m.roiSignal === "INCREASE" ? "border-left:3px solid #ef4444;"
                          : m.roiSignal === "REDUCE"   ? "border-left:3px solid #f59e0b;" : "";
          const trendC = m.domVsBrandAvg < 0 ? "#22c55e" : m.domVsBrandAvg > 0 ? "#ef4444" : "#94a3b8";
          return `<tr style="border-bottom:1px solid #1e293b;${borderLeft}">
            <td style="padding:10px 12px;color:#f8fafc;font-weight:600;">${escapeHtml(m.model)}</td>
            <td style="padding:10px 12px;text-align:right;color:#cbd5e1;">${fmtN(m.soldCount)}</td>
            <td style="padding:10px 12px;text-align:right;color:${trendC};">${trendArrow(m.domVsBrandAvg)} ${fmtDays(m.avgDom)}</td>
            <td style="padding:10px 12px;text-align:center;">${m.incentiveSummary.CASH_BACK ? `<span style="background:${TYPE_CONFIG.CASH_BACK.bg};color:${TYPE_CONFIG.CASH_BACK.color};padding:3px 10px;border-radius:6px;font-weight:600;font-size:12px;">${escapeHtml(m.incentiveSummary.CASH_BACK)}</span>` : `<span style="color:#475569;">—</span>`}</td>
            <td style="padding:10px 12px;text-align:center;">${m.incentiveSummary.LOW_APR ? `<span style="background:${TYPE_CONFIG.LOW_APR.bg};color:${TYPE_CONFIG.LOW_APR.color};padding:3px 10px;border-radius:6px;font-weight:600;font-size:12px;">${escapeHtml(m.incentiveSummary.LOW_APR)}</span>` : `<span style="color:#475569;">—</span>`}</td>
            <td style="padding:10px 12px;text-align:center;">${m.incentiveSummary.LEASE_SPECIAL ? `<span style="background:${TYPE_CONFIG.LEASE_SPECIAL.bg};color:${TYPE_CONFIG.LEASE_SPECIAL.color};padding:3px 10px;border-radius:6px;font-weight:600;font-size:12px;">${escapeHtml(m.incentiveSummary.LEASE_SPECIAL)}</span>` : `<span style="color:#475569;">—</span>`}</td>
            <td style="padding:10px 12px;text-align:center;"><span style="background:${roi.bg};color:${roi.color};padding:4px 10px;border-radius:6px;font-weight:700;font-size:11px;letter-spacing:0.3px;border:1px solid ${roi.border}66;">${roi.label}</span></td>
          </tr>`;
        }).join("")
    }
    </tbody>`;
  matrixPanel.body.style.overflowX = "auto";
  matrixPanel.body.appendChild(tbl);
  container.appendChild(matrixPanel.root);

  // ── Panels 3 + 4: Velocity bars (60%) + Coverage donut (40%) ──
  const row34 = document.createElement("div");
  row34.style.cssText = "display:flex;gap:14px;margin-bottom:14px;flex-wrap:wrap;";

  const velPanel = panel("Velocity by Model", "Bar length = monthly sold volume · color = faster (green) or slower (red) than brand baseline DOM");
  velPanel.root.style.flex = "1 1 60%";
  velPanel.root.style.minWidth = "320px";
  const velCanvas = document.createElement("canvas");
  velCanvas.style.cssText = `width:100%;height:${Math.max(220, data.models.length * 26 + 48)}px;display:block;`;
  velPanel.body.appendChild(velCanvas);
  row34.appendChild(velPanel.root);

  const covPanel = panel("Inventory Coverage", "Active inventory shares · solid slice = model has incentive · faded = uncovered");
  covPanel.root.style.flex = "1 1 35%";
  covPanel.root.style.minWidth = "260px";
  const covCanvas = document.createElement("canvas");
  covCanvas.style.cssText = "width:100%;height:260px;display:block;";
  covPanel.body.appendChild(covCanvas);
  row34.appendChild(covPanel.root);

  container.appendChild(row34);

  // Defer canvas drawing until laid out
  requestAnimationFrame(() => {
    drawDomBars(velCanvas, data.models, data.kpis.brandAvgDom);
    drawCoverageDonut(covCanvas, data.models);
  });

  // ── Panel 5: Active Incentives card grid ──
  const incPanel = panel("Active Incentive Programs", `${data.incentives.length} program${data.incentives.length === 1 ? "" : "s"} live now`);
  if (!data.incentives.length) {
    incPanel.body.innerHTML = `<div style="color:#94a3b8;text-align:center;padding:24px;">No active incentive programs returned for this brand.</div>`;
  } else {
    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;";
    const sorted = [...data.incentives].sort((a, b) => {
      const order: Record<IncentiveType, number> = { CASH_BACK: 0, LOW_APR: 1, LEASE_SPECIAL: 2, LOYALTY: 3, CONQUEST: 4, OFFER: 5 };
      return order[a.type] - order[b.type];
    });
    grid.innerHTML = sorted.map((inc) => {
      const tc = TYPE_CONFIG[inc.type];
      const days = daysUntil(inc.expirationDate);
      const urgent = days <= 7 ? "#ef4444" : days <= 21 ? "#f59e0b" : "#94a3b8";
      return `<div style="background:#0f172a;border:1px solid #334155;border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
          <span style="background:${tc.bg};color:${tc.color};padding:3px 10px;border-radius:6px;font-size:10px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;">${tc.label}</span>
          <span style="font-size:11px;color:${urgent};">${days === 0 ? "Expired" : days >= 9999 ? "—" : `${days}d left`}</span>
        </div>
        <div style="font-size:14px;font-weight:700;color:#f8fafc;line-height:1.3;">${escapeHtml(inc.title)}</div>
        <div style="font-size:18px;font-weight:800;color:${tc.color};">${escapeHtml(inc.amountDisplay)}</div>
        ${inc.description ? `<div style="font-size:12px;color:#94a3b8;line-height:1.4;">${escapeHtml(inc.description)}</div>` : ""}
        ${inc.eligibleModels.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:2px;">${inc.eligibleModels.slice(0, 4).map((m) => `<span style="background:#1e293b;color:#cbd5e1;padding:2px 8px;border-radius:4px;font-size:11px;border:1px solid #334155;">${escapeHtml(m)}</span>`).join("")}${inc.eligibleModels.length > 4 ? `<span style="color:#64748b;font-size:11px;">+${inc.eligibleModels.length - 4}</span>` : ""}</div>` : ""}
        ${inc.expirationDate ? `<div style="font-size:10px;color:#64748b;border-top:1px solid #1e293b;padding-top:6px;">Valid through ${escapeHtml(inc.expirationDate)}</div>` : ""}
      </div>`;
    }).join("");
    incPanel.body.appendChild(grid);
  }
  container.appendChild(incPanel.root);

  // ── Panel 6: Recommendations (left 60%) + Signals (right 40%) ──
  const row6 = document.createElement("div");
  row6.style.cssText = "display:flex;gap:14px;flex-wrap:wrap;";

  const recPanel = panel("Recommendations", `${data.recommendations.length} model${data.recommendations.length === 1 ? "" : "s"} need attention`);
  recPanel.root.style.flex = "1 1 60%";
  recPanel.root.style.minWidth = "320px";
  if (!data.recommendations.length) {
    recPanel.body.innerHTML = `<div style="color:#22c55e;text-align:center;padding:18px;font-weight:600;">&#10003; All models are on track — no programs flagged for change.</div>`;
  } else {
    const list = document.createElement("div");
    list.style.cssText = "display:flex;flex-direction:column;gap:8px;";
    list.innerHTML = data.recommendations.map((r) => {
      const roi = ROI_BADGE[r.action];
      return `<div style="background:#0f172a;border:1px solid #334155;border-left:3px solid ${roi.border};border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span style="background:${roi.bg};color:${roi.color};padding:4px 10px;border-radius:6px;font-weight:700;font-size:11px;letter-spacing:0.3px;border:1px solid ${roi.border}66;white-space:nowrap;">${roi.label}</span>
        <strong style="color:#f8fafc;font-size:14px;">${escapeHtml(r.model)}</strong>
        <span style="color:#94a3b8;font-size:12px;flex:1;min-width:200px;">${escapeHtml(r.reason)}</span>
      </div>`;
    }).join("");
    recPanel.body.appendChild(list);
  }
  row6.appendChild(recPanel.root);

  const sigPanel = panel("Market Signals", "Auto-derived from the data above");
  sigPanel.root.style.flex = "1 1 35%";
  sigPanel.root.style.minWidth = "260px";
  sigPanel.root.style.borderLeft = "3px solid #ef4444";
  if (!data.signals.length) {
    sigPanel.body.innerHTML = `<div style="color:#94a3b8;text-align:center;padding:18px;">No signals to highlight.</div>`;
  } else {
    sigPanel.body.innerHTML = `<ul style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:8px;font-size:13px;color:#cbd5e1;line-height:1.5;">
      ${data.signals.map((s) => `<li>${s}</li>`).join("")}
    </ul>`;
  }
  row6.appendChild(sigPanel.root);

  container.appendChild(row6);
}

// ── Render helpers ─────────────────────────────────────────────────────
function panel(title: string, subtitle?: string): { root: HTMLDivElement; body: HTMLDivElement } {
  const root = document.createElement("div");
  root.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px 18px;margin-bottom:14px;";
  const head = document.createElement("div");
  head.style.cssText = "margin-bottom:10px;";
  head.innerHTML = `<div style="font-size:14px;font-weight:700;color:#f8fafc;">${escapeHtml(title)}</div>${subtitle ? `<div style="font-size:12px;color:#94a3b8;margin-top:2px;">${escapeHtml(subtitle)}</div>` : ""}`;
  const body = document.createElement("div");
  root.appendChild(head);
  root.appendChild(body);
  return { root, body };
}

function kpiCard(label: string, value: string, sub: string, deltaColor: string | null): string {
  return `<div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px 18px;">
    <div style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">${escapeHtml(label)}</div>
    <div style="font-size:26px;font-weight:800;color:#f8fafc;line-height:1;">${escapeHtml(value)}</div>
    <div style="font-size:12px;color:${deltaColor ?? "#94a3b8"};margin-top:4px;font-weight:600;">${escapeHtml(sub)}</div>
  </div>`;
}

main();
