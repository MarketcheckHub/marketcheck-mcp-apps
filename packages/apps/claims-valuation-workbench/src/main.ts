   /**
 * Claims Valuation Workbench
 * MCP App 18 — Dark-themed insurance claims total-loss valuation tool
 */
import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "claims-valuation-workbench" }); } catch {}

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

// Read make/model/year/trim from a listing — recents/active put them under `build`,
// older docs sometimes show them top-level. Try both.
function _listingBuild(l: any) {
  const b = l?.build ?? {};
  return {
    year: b.year ?? l?.year ?? 0,
    make: b.make ?? l?.make ?? "",
    model: b.model ?? l?.model ?? "",
    trim: b.trim ?? l?.trim ?? "",
  };
}

async function _fetchDirect(args) {
  // Decode is required — fail fast if it doesn't return.
  const decode = await _mcDecode(args.vin);
  // Each downstream call degrades independently. Sold Summary (Enterprise) is the
  // most likely to 403; we don't want it to take down FMV / comps / replacements.
  const [fmvResult, soldComps, regionalData, replacements] = await Promise.all([
    _mcPredict({ ...args, dealer_type: "franchise" }).catch(() => null),
    _mcRecent({ make: decode?.make, model: decode?.model, zip: args.zip, radius: 100, rows: 10, stats: "price" }).catch(() => null),
    _mcSold({ make: decode?.make, model: decode?.model, summary_by: "state" }).catch(() => null),
    _mcActive({ make: decode?.make, model: decode?.model, zip: args.zip, radius: 50, rows: 5, sort_by: "price", sort_order: "asc" }).catch(() => null),
  ]);

  // ── FMV: predict's `marketcheck_price` is authoritative; fall back to comp stats ──
  const predictPrice = fmvResult?.marketcheck_price
    ?? fmvResult?.predicted_price
    ?? fmvResult?.price
    ?? fmvResult?.median_price
    ?? fmvResult?.comparables?.stats?.price?.mean
    ?? 0;
  const recentMean = soldComps?.stats?.price?.mean ?? soldComps?.stats?.price?.median ?? 0;
  const fmv = Math.round(predictPrice > 0 ? predictPrice : (recentMean > 0 ? recentMean : 0));

  // Low/high settlement range — should bracket FMV.
  // Use predict's LOCAL-COMPS percentiles (same VIN year/trim/area) when available.
  // Fall back to ±10% of FMV — NEVER use the national recents percentiles here:
  // those describe the broad market and can sit far from a per-VIN predicted price.
  const predictPct = fmvResult?.comparables?.stats?.price?.percentiles ?? {};
  const localLow  = predictPct["25.0"] ?? predictPct["25th"];
  const localHigh = predictPct["75.0"] ?? predictPct["75th"];
  let low  = Math.round(fmvResult?.price_range?.low  ?? localLow  ?? fmv * 0.90);
  let high = Math.round(fmvResult?.price_range?.high ?? localHigh ?? fmv * 1.10);
  // Defensive clamp — if percentiles came from a wider distribution that doesn't
  // contain FMV, fall back to ±10% so the range stays meaningful.
  if (fmv > 0 && (low > fmv || high < fmv)) {
    low  = Math.round(fmv * 0.90);
    high = Math.round(fmv * 1.10);
  }

  // ── Sold comps (recents endpoint) ──
  // The standard MarketCheck tier returns `price: null` on most recents listings;
  // only some have `last_seen_price`. Rather than fake a per-listing price by
  // repeating the response-level mean (which would mislead the user into thinking
  // they're seeing real per-row data), we use 0 as a sentinel and the comps
  // table renders "—" for missing prices. The market mean is still surfaced in
  // the Statistics row at the bottom of the table.
  const rawListings: any[] = soldComps?.listings ?? [];
  const mappedSoldComps = rawListings.slice(0, 10).map((l: any) => {
    const b = _listingBuild(l);
    const rawPrice = l.price ?? l.sale_price ?? l.last_seen_price;
    const salePrice = typeof rawPrice === "number" && rawPrice > 0 ? rawPrice : 0;
    return {
      vin: l.vin ?? "",
      year: b.year || decode?.year || 0,
      make: b.make || decode?.make || "",
      model: b.model || decode?.model || "",
      trim: b.trim || "",
      salePrice,
      miles: l.miles ?? l.mileage ?? 0,
      dateSold: (l.last_seen_at_date ?? l.sold_at ?? "").slice(0, 10),
      state: l.dealer?.state ?? l.seller_info?.state ?? l.state ?? "",
    };
  });

  // ── Replacement options (active endpoint) — listings DO have top-level price ──
  const rawActive: any[] = replacements?.listings ?? [];
  const mappedReplacements = rawActive.slice(0, 5).map((l: any) => {
    const b = _listingBuild(l);
    return {
      year: b.year || decode?.year || 0,
      make: b.make || decode?.make || "",
      model: b.model || decode?.model || "",
      trim: b.trim || "",
      price: l.price ?? 0,
      miles: l.miles ?? l.mileage ?? 0,
      dealer: l.dealer?.name ?? l.seller_info?.name ?? "",
      city: l.dealer?.city ?? l.seller_info?.city ?? "",
      state: l.dealer?.state ?? l.seller_info?.state ?? "",
      distanceMi: Math.round(l.dist ?? l.distance ?? 0),
    };
  });

  // ── Regional variance — Enterprise endpoint; degrades to empty when 403 ──
  const rawRegional: any[] = regionalData?.results ?? regionalData?.data ?? [];
  const mappedRegional = rawRegional.slice(0, 10).map((r: any) => ({
    state: r.state ?? r.dimension_value ?? "",
    avgPrice: r.average_price ?? r.avg_price ?? r.average_sale_price ?? 0,
    count: r.count ?? r.sold_count ?? 0,
  }));

  const nationalAvg = recentMean > 0 ? Math.round(recentMean) : fmv;

  return {
    vin: args.vin,
    year: decode?.year ?? 0,
    make: decode?.make ?? "",
    model: decode?.model ?? "",
    trim: decode?.trim ?? "",
    fmv,
    low,
    high,
    soldComps: mappedSoldComps,
    replacements: mappedReplacements,
    regionalPrices: mappedRegional,
    nationalAvg,
  } as any;
}

async function _callTool(toolName, args) {
  const auth = _getAuth();
  // When the user has provided an API key (LIVE mode), prefer the real API.
  // Trying the MCP path first hangs in a standalone browser because
  // _safeApp.callServerTool returns a Promise that never resolves usefully
  // outside an MCP iframe host — so live-mode users would silently get mock data.
  if (auth.value) {
    // 1. Direct API
    try {
      const data = await _fetchDirect(args);
      if (data) return { content: [{ type: "text", text: JSON.stringify(data) }] };
    } catch (e) { console.warn("Direct API failed, trying proxy:", e); }
    // 2. Proxy fallback
    try {
      const r = await fetch((_proxyBase()) + "/api/proxy/" + toolName, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, _auth_mode: auth.mode, _auth_value: auth.value }),
      });
      if (r.ok) { const d = await r.json(); return { content: [{ type: "text", text: JSON.stringify(d) }] }; }
    } catch {}
  }
  // 3. MCP mode (only when iframed into an MCP host with no auth)
  if (_safeApp && window.parent !== window) {
    try { const r = await _safeApp.callServerTool({ name: toolName, arguments: args }); return r; } catch {}
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
    document.body.insertBefore(_db, document.body.firstChild);
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

// ── Types ──────────────────────────────────────────────────────────────────────

type DamageSeverity = "minor" | "moderate" | "severe" | "total";
type PreLossCondition = "excellent" | "good" | "fair" | "poor";
type Determination = "NOT_TOTAL_LOSS" | "LIKELY_TOTAL_LOSS" | "TOTAL_LOSS";

interface SoldComp {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  salePrice: number;
  miles: number;
  dateSold: string;
  state: string;
}

interface ReplacementOption {
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  miles: number;
  dealer: string;
  city: string;
  state: string;
  distanceMi: number;
}

interface RegionalPrice {
  state: string;
  avgPrice: number;
  count: number;
}

interface ValuationResult {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  fmv: number;
  low: number;
  high: number;
  soldComps: SoldComp[];
  replacements: ReplacementOption[];
  regionalPrices: RegionalPrice[];
  nationalAvg: number;
}

interface AppState {
  vin: string;
  mileage: string;
  zip: string;
  damageSeverity: DamageSeverity;
  condition: PreLossCondition;
  result: ValuationResult | null;
  loading: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CONDITION_ADJ: Record<PreLossCondition, number> = {
  excellent: 0.05,
  good: 0.0,
  fair: -0.08,
  poor: -0.18,
};

const CONDITION_LABELS: Record<PreLossCondition, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

const SEVERITY_LABELS: Record<DamageSeverity, string> = {
  minor: "Minor",
  moderate: "Moderate",
  severe: "Severe",
  total: "Total",
};

const TOTAL_LOSS_THRESHOLD = 0.75;

// ── Mock Data ──────────────────────────────────────────────────────────────────

function getMockData(_vin: string): ValuationResult {
  return {
    vin: _vin || "KNDCB3LC9L5359658",
    year: 2020,
    make: "Kia",
    model: "Forte",
    trim: "LXS",
    fmv: 15800,
    low: 14200,
    high: 17500,
    soldComps: [
      { vin: "1HGCV3F51NA034567", year: 2022, make: "Honda", model: "Accord", trim: "EX-L", salePrice: 27100, miles: 28400, dateSold: "2026-03-12", state: "CA" },
      { vin: "1HGCV3F52NA045678", year: 2022, make: "Honda", model: "Accord", trim: "EX-L", salePrice: 26500, miles: 31200, dateSold: "2026-03-08", state: "TX" },
      { vin: "1HGCV3F53NA056789", year: 2022, make: "Honda", model: "Accord", trim: "EX-L", salePrice: 27800, miles: 22100, dateSold: "2026-03-05", state: "FL" },
      { vin: "1HGCV3F54NA067890", year: 2022, make: "Honda", model: "Accord", trim: "EX-L", salePrice: 25900, miles: 35600, dateSold: "2026-02-28", state: "OH" },
      { vin: "1HGCV3F55NA078901", year: 2022, make: "Honda", model: "Accord", trim: "EX-L", salePrice: 26200, miles: 29800, dateSold: "2026-02-25", state: "NY" },
      { vin: "1HGCV3F56NA089012", year: 2022, make: "Honda", model: "Accord", trim: "EX-L", salePrice: 28100, miles: 19500, dateSold: "2026-02-20", state: "WA" },
      { vin: "1HGCV3F57NA090123", year: 2022, make: "Honda", model: "Accord", trim: "EX-L", salePrice: 26900, miles: 27300, dateSold: "2026-02-18", state: "GA" },
      { vin: "1HGCV3F58NA101234", year: 2022, make: "Honda", model: "Accord", trim: "EX-L", salePrice: 25500, miles: 38400, dateSold: "2026-02-14", state: "IL" },
      { vin: "1HGCV3F59NA112345", year: 2022, make: "Honda", model: "Accord", trim: "EX-L", salePrice: 27400, miles: 24600, dateSold: "2026-02-10", state: "AZ" },
      { vin: "1HGCV3F50NA123456", year: 2022, make: "Honda", model: "Accord", trim: "EX-L", salePrice: 26600, miles: 30100, dateSold: "2026-02-05", state: "NC" },
    ],
    replacements: [
      { year: 2022, make: "Honda", model: "Accord", trim: "EX-L", price: 27200, miles: 26800, dealer: "Capitol Honda", city: "San Jose", state: "CA", distanceMi: 12 },
      { year: 2022, make: "Honda", model: "Accord", trim: "EX-L", price: 26900, miles: 31400, dealer: "Stevens Creek Honda", city: "San Jose", state: "CA", distanceMi: 8 },
      { year: 2022, make: "Honda", model: "Accord", trim: "EX-L", price: 28100, miles: 21200, dealer: "Bay Area Honda", city: "Oakland", state: "CA", distanceMi: 35 },
      { year: 2022, make: "Honda", model: "Accord", trim: "EX", price: 25400, miles: 29600, dealer: "Fremont Honda", city: "Fremont", state: "CA", distanceMi: 22 },
      { year: 2022, make: "Honda", model: "Accord", trim: "EX-L", price: 27600, miles: 24100, dealer: "Premier Honda", city: "Pleasanton", state: "CA", distanceMi: 28 },
    ],
    regionalPrices: [
      { state: "CA", avgPrice: 28200, count: 42 },
      { state: "TX", avgPrice: 26100, count: 38 },
      { state: "FL", avgPrice: 27400, count: 35 },
      { state: "NY", avgPrice: 27800, count: 28 },
      { state: "OH", avgPrice: 25400, count: 22 },
      { state: "IL", avgPrice: 25800, count: 20 },
      { state: "WA", avgPrice: 27900, count: 18 },
      { state: "GA", avgPrice: 26400, count: 16 },
      { state: "AZ", avgPrice: 26700, count: 15 },
      { state: "NC", avgPrice: 26000, count: 14 },
    ],
    nationalAvg: 26800,
  };
}

// ── Calculation Helpers ────────────────────────────────────────────────────────

function adjustFmv(baseFmv: number, condition: PreLossCondition): number {
  return Math.round(baseFmv * (1 + CONDITION_ADJ[condition]));
}

function getRepairThreshold(fmv: number): number {
  return Math.round(fmv * TOTAL_LOSS_THRESHOLD);
}

function getSalvageValue(fmv: number): { low: number; high: number } {
  return { low: Math.round(fmv * 0.15), high: Math.round(fmv * 0.25) };
}

function getDetermination(damageSeverity: DamageSeverity, fmv: number): { verdict: Determination; repairEstimate: number } {
  const threshold = getRepairThreshold(fmv);
  // Simulate repair estimate based on damage severity
  const repairPct: Record<DamageSeverity, number> = {
    minor: 0.15,
    moderate: 0.50,
    severe: 0.80,
    total: 1.10,
  };
  const repairEstimate = Math.round(fmv * repairPct[damageSeverity]);

  let verdict: Determination;
  if (repairEstimate < threshold * 0.85) {
    verdict = "NOT_TOTAL_LOSS";
  } else if (repairEstimate <= threshold * 1.10) {
    verdict = "LIKELY_TOTAL_LOSS";
  } else {
    verdict = "TOTAL_LOSS";
  }
  return { verdict, repairEstimate };
}

function compStats(comps: SoldComp[]): { mean: number; median: number; count: number } {
  // Only include rows with a real positive price — recents listings without
  // a price would otherwise drag the mean toward 0.
  const prices = comps.map(c => c.salePrice).filter(p => p > 0).sort((a, b) => a - b);
  const count = prices.length;
  if (count === 0) return { mean: 0, median: 0, count: 0 };
  const mean = Math.round(prices.reduce((s, p) => s + p, 0) / count);
  const mid = Math.floor(count / 2);
  const median = count % 2 === 0 ? Math.round((prices[mid - 1] + prices[mid]) / 2) : prices[mid];
  return { mean, median, count };
}

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

function fmtPct(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return sign + n.toFixed(1) + "%";
}

// ── App Bootstrap ──────────────────────────────────────────────────────────────


const state: AppState = {
  vin: "KNDCB3LC9L5359658",
  mileage: "32400",
  zip: "95123",
  damageSeverity: "severe",
  condition: "good",
  result: null,
  loading: false,
};

// ── Styles ─────────────────────────────────────────────────────────────────────

function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    :root {
      --bg: #0f1117;
      --surface: #1a1d27;
      --surface2: #232735;
      --border: #2e3347;
      --text: #e8eaf0;
      --text-dim: #8b90a5;
      --accent: #5b9cf6;
      --green: #34d399;
      --green-bg: #0d3326;
      --green-border: #166534;
      --yellow: #fbbf24;
      --yellow-bg: #3b2f08;
      --yellow-border: #854d0e;
      --red: #f87171;
      --red-bg: #3b1111;
      --red-border: #991b1b;
      --radius: 8px;
      --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --mono: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
    }
    body {
      font-family: var(--font);
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 20px;
    }
    .workbench { max-width: 1400px; margin: 0 auto; }
    h1 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    h1 .icon { font-size: 26px; }
    .subtitle { color: var(--text-dim); font-size: 13px; margin-bottom: 20px; }

    /* ── Input Section ─────────────────────── */
    .input-section {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      margin-bottom: 16px;
    }
    .input-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: flex-end;
    }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-dim);
    }
    .field input {
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 12px;
      color: var(--text);
      font-size: 14px;
      font-family: var(--mono);
      width: 180px;
      outline: none;
      transition: border-color 0.15s;
    }
    .field input:focus { border-color: var(--accent); }

    .btn-group {
      display: flex;
      gap: 0;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid var(--border);
    }
    .btn-group button {
      background: var(--surface2);
      border: none;
      border-right: 1px solid var(--border);
      color: var(--text-dim);
      padding: 8px 14px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      font-family: var(--font);
    }
    .btn-group button:last-child { border-right: none; }
    .btn-group button:hover { background: var(--border); color: var(--text); }
    .btn-group button.active {
      background: var(--accent);
      color: #fff;
    }

    .evaluate-btn {
      background: var(--accent);
      border: none;
      border-radius: 6px;
      color: #fff;
      padding: 8px 28px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: opacity 0.15s;
      font-family: var(--font);
      height: 38px;
      white-space: nowrap;
    }
    .evaluate-btn:hover { opacity: 0.85; }
    .evaluate-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    /* ── Determination Banner ──────────────── */
    .banner {
      border-radius: var(--radius);
      padding: 20px 24px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 20px;
      border: 1px solid;
    }
    .banner.not-total {
      background: var(--green-bg);
      border-color: var(--green-border);
    }
    .banner.likely-total {
      background: var(--yellow-bg);
      border-color: var(--yellow-border);
    }
    .banner.total-loss {
      background: var(--red-bg);
      border-color: var(--red-border);
    }
    .banner-icon {
      font-size: 48px;
      flex-shrink: 0;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .banner.not-total .banner-icon { background: rgba(52,211,153,0.15); color: var(--green); }
    .banner.likely-total .banner-icon { background: rgba(251,191,36,0.15); color: var(--yellow); }
    .banner.total-loss .banner-icon { background: rgba(248,113,113,0.15); color: var(--red); }
    .banner-content { flex: 1; }
    .banner-verdict {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: 1px;
    }
    .banner.not-total .banner-verdict { color: var(--green); }
    .banner.likely-total .banner-verdict { color: var(--yellow); }
    .banner.total-loss .banner-verdict { color: var(--red); }
    .banner-amounts {
      display: flex;
      gap: 32px;
      margin-top: 8px;
      font-size: 14px;
    }
    .banner-amounts .label { color: var(--text-dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    .banner-amounts .value { font-size: 20px; font-weight: 700; font-family: var(--mono); }
    .banner-logic {
      margin-top: 8px;
      font-size: 13px;
      color: var(--text-dim);
      line-height: 1.4;
    }

    /* ── Grid ──────────────────────────────── */
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }

    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
    }
    .panel-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-dim);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .panel-title .pt-icon { font-size: 16px; }

    /* ── Settlement Range ──────────────────── */
    .range-display {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 12px;
    }
    .range-val { text-align: center; }
    .range-val.center { flex: 1; }
    .range-val .rlabel {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-dim);
    }
    .range-val .rnum {
      font-size: 16px;
      font-weight: 700;
      font-family: var(--mono);
    }
    .range-val.center .rnum {
      font-size: 28px;
      color: var(--accent);
    }
    .range-bar-container {
      position: relative;
      height: 12px;
      background: var(--surface2);
      border-radius: 6px;
      margin: 8px 0 16px;
      overflow: visible;
    }
    .range-bar-fill {
      position: absolute;
      top: 0;
      height: 100%;
      background: linear-gradient(90deg, var(--text-dim), var(--accent), var(--text-dim));
      border-radius: 6px;
      opacity: 0.6;
    }
    .range-bar-marker {
      position: absolute;
      top: -4px;
      width: 20px;
      height: 20px;
      background: var(--accent);
      border: 3px solid var(--bg);
      border-radius: 50%;
      transform: translateX(-50%);
      box-shadow: 0 0 8px rgba(91,156,246,0.4);
    }
    .salvage-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      background: var(--surface2);
      border-radius: 6px;
      margin-top: 8px;
    }
    .salvage-row .slabel { font-size: 13px; color: var(--text-dim); }
    .salvage-row .sval { font-family: var(--mono); font-weight: 600; font-size: 14px; }
    .condition-note {
      margin-top: 10px;
      font-size: 12px;
      color: var(--text-dim);
      font-style: italic;
    }

    /* ── Table ─────────────────────────────── */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th {
      text-align: left;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-dim);
      padding: 6px 8px;
      border-bottom: 1px solid var(--border);
    }
    td {
      padding: 6px 8px;
      border-bottom: 1px solid var(--surface2);
      font-family: var(--mono);
      font-size: 12px;
    }
    tr:last-child td { border-bottom: none; }
    .stats-row td {
      font-weight: 700;
      color: var(--accent);
      border-top: 2px solid var(--border);
      border-bottom: none;
      padding-top: 10px;
    }

    .delta-pos { color: var(--green); }
    .delta-neg { color: var(--red); }

    /* ── Replacement Cards ─────────────────── */
    .replacement-card {
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .replacement-card:last-child { margin-bottom: 0; }
    .rc-left { flex: 1; }
    .rc-title { font-weight: 700; font-size: 13px; }
    .rc-details { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
    .rc-right { text-align: right; }
    .rc-price { font-family: var(--mono); font-weight: 700; font-size: 16px; }
    .rc-distance { font-size: 11px; color: var(--text-dim); }
    .rc-coverage {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
      margin-top: 4px;
      display: inline-block;
    }
    .rc-coverage.covered { background: var(--green-bg); color: var(--green); border: 1px solid var(--green-border); }
    .rc-coverage.short { background: var(--red-bg); color: var(--red); border: 1px solid var(--red-border); }

    .comp-table-wrap {
      max-height: 340px;
      overflow-y: auto;
    }
    .comp-table-wrap::-webkit-scrollbar { width: 5px; }
    .comp-table-wrap::-webkit-scrollbar-track { background: var(--surface); }
    .comp-table-wrap::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

    .hidden { display: none; }
    .loading-overlay {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 80px 20px;
      color: var(--text-dim);
      font-size: 16px;
    }
    .spinner {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-right: 10px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 900px) {
      .grid-2 { grid-template-columns: 1fr; }
      .input-row { flex-direction: column; align-items: stretch; }
      .field input { width: 100%; }
    }
  `;
  document.head.appendChild(style);
}

// ── Render Functions ───────────────────────────────────────────────────────────

function renderApp(): void {
  const root = document.body;
  root.innerHTML = "";
  injectStyles();

  const wb = document.createElement("div");
  wb.className = "workbench";

  // Header
  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:4px;";
  header.innerHTML = `<h1 style="margin:0;flex:1;"><span class="icon">&#x2696;</span> Claims Valuation Workbench</h1>`;
  wb.appendChild(header);
  const subtitle = document.createElement("div");
  subtitle.className = "subtitle";
  subtitle.textContent = "Insurance total-loss determination with defensible market evidence";
  wb.appendChild(subtitle);
  _addSettingsBar(header);

  // Input Section
  wb.appendChild(buildInputSection());

  // Results area
  const resultsArea = document.createElement("div");
  resultsArea.id = "results-area";
  if (state.result) {
    renderResults(resultsArea);
  }
  wb.appendChild(resultsArea);

  root.appendChild(wb);
}

function buildInputSection(): HTMLElement {
  const section = document.createElement("div");
  section.className = "input-section";

  const row = document.createElement("div");
  row.className = "input-row";

  // VIN
  const vinField = makeInputField("VIN", state.vin, "KNDCB3LC9L5359658", (v) => { state.vin = v; });
  vinField.querySelector("input")!.style.width = "210px";
  row.appendChild(vinField);

  // Mileage
  row.appendChild(makeInputField("Mileage", state.mileage, "32,400", (v) => { state.mileage = v; }));

  // ZIP
  const zipField = makeInputField("ZIP Code", state.zip, "95123", (v) => { state.zip = v; });
  zipField.querySelector("input")!.style.width = "100px";
  row.appendChild(zipField);

  // Damage Severity
  const sevField = document.createElement("div");
  sevField.className = "field";
  sevField.innerHTML = `<label>Damage Severity</label>`;
  const sevGroup = buildButtonGroup(
    ["minor", "moderate", "severe", "total"],
    SEVERITY_LABELS,
    state.damageSeverity,
    (v) => {
      state.damageSeverity = v as DamageSeverity;
      if (state.result) recalcAndRender();
    }
  );
  sevField.appendChild(sevGroup);
  row.appendChild(sevField);

  // Pre-loss Condition
  const condField = document.createElement("div");
  condField.className = "field";
  condField.innerHTML = `<label>Pre-Loss Condition</label>`;
  const condGroup = buildButtonGroup(
    ["excellent", "good", "fair", "poor"],
    CONDITION_LABELS,
    state.condition,
    (v) => {
      state.condition = v as PreLossCondition;
      if (state.result) recalcAndRender();
    }
  );
  condField.appendChild(condGroup);
  row.appendChild(condField);

  // Evaluate Button
  const evalBtn = document.createElement("button");
  evalBtn.className = "evaluate-btn";
  evalBtn.textContent = "Evaluate Claim";
  evalBtn.onclick = () => evaluateClaim();
  row.appendChild(evalBtn);

  section.appendChild(row);
  return section;
}

function makeInputField(label: string, value: string, placeholder: string, onChange: (v: string) => void): HTMLElement {
  const field = document.createElement("div");
  field.className = "field";
  const lbl = document.createElement("label");
  lbl.textContent = label;
  const inp = document.createElement("input");
  inp.type = "text";
  inp.value = value;
  inp.placeholder = placeholder;
  inp.oninput = () => onChange(inp.value);
  field.appendChild(lbl);
  field.appendChild(inp);
  return field;
}

function buildButtonGroup(keys: string[], labels: Record<string, string>, active: string, onSelect: (v: string) => void): HTMLElement {
  const group = document.createElement("div");
  group.className = "btn-group";
  for (const key of keys) {
    const btn = document.createElement("button");
    btn.textContent = labels[key];
    btn.className = key === active ? "active" : "";
    btn.onclick = () => {
      group.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      onSelect(key);
    };
    group.appendChild(btn);
  }
  return group;
}

// ── Results Rendering ──────────────────────────────────────────────────────────

function renderResults(container: HTMLElement): void {
  container.innerHTML = "";
  const r = state.result!;
  const adjFmv = adjustFmv(r.fmv, state.condition);
  const adjLow = adjustFmv(r.low, state.condition);
  const adjHigh = adjustFmv(r.high, state.condition);
  const threshold = getRepairThreshold(adjFmv);
  const { verdict, repairEstimate } = getDetermination(state.damageSeverity, adjFmv);
  const salvage = getSalvageValue(adjFmv);
  const stats = compStats(r.soldComps);

  // Decoded vehicle summary — confirms what the VIN resolved to
  const vehicleLine = [r.year, r.make, r.model, r.trim].filter(Boolean).join(" ").trim();
  if (vehicleLine) {
    const vehicleBar = document.createElement("div");
    vehicleBar.style.cssText = "background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:10px 16px;margin-bottom:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;";
    vehicleBar.innerHTML = `
      <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Vehicle</div>
      <div style="font-size:14px;font-weight:600;color:var(--text);">${vehicleLine}</div>
      ${r.vin ? `<div style="font-size:11px;color:var(--text-dim);font-family:var(--mono);">VIN ending ${r.vin.slice(-6)}</div>` : ""}
    `;
    container.appendChild(vehicleBar);
  }

  // Determination Banner
  container.appendChild(buildBanner(verdict, adjFmv, threshold, repairEstimate));

  // Middle row: Settlement Range + Comparable Evidence
  const midGrid = document.createElement("div");
  midGrid.className = "grid-2";
  midGrid.appendChild(buildSettlementPanel(adjFmv, adjLow, adjHigh, salvage));
  midGrid.appendChild(buildCompsPanel(r.soldComps, stats));
  container.appendChild(midGrid);

  // Bottom row: Regional Variance + Replacement Options
  const botGrid = document.createElement("div");
  botGrid.className = "grid-2";
  botGrid.appendChild(buildRegionalPanel(r.regionalPrices, r.nationalAvg));
  botGrid.appendChild(buildReplacementsPanel(r.replacements, adjFmv));
  container.appendChild(botGrid);
}

function buildBanner(verdict: Determination, fmv: number, threshold: number, repairEstimate: number): HTMLElement {
  const banner = document.createElement("div");
  let bannerClass: string;
  let icon: string;
  let verdictText: string;
  let logicText: string;

  if (verdict === "NOT_TOTAL_LOSS") {
    bannerClass = "not-total";
    icon = "\u2713";
    verdictText = "NOT TOTAL LOSS";
    logicText = `Estimated repair cost (${fmt(repairEstimate)}) is well below the ${(TOTAL_LOSS_THRESHOLD * 100).toFixed(0)}% threshold (${fmt(threshold)}). Vehicle is economically repairable.`;
  } else if (verdict === "LIKELY_TOTAL_LOSS") {
    bannerClass = "likely-total";
    icon = "\u26A0";
    verdictText = "LIKELY TOTAL LOSS";
    logicText = `Estimated repair cost (${fmt(repairEstimate)}) is near the ${(TOTAL_LOSS_THRESHOLD * 100).toFixed(0)}% threshold (${fmt(threshold)}). Detailed inspection recommended to confirm determination.`;
  } else {
    bannerClass = "total-loss";
    icon = "\u2717";
    verdictText = "TOTAL LOSS";
    logicText = `Estimated repair cost (${fmt(repairEstimate)}) exceeds the ${(TOTAL_LOSS_THRESHOLD * 100).toFixed(0)}% threshold (${fmt(threshold)}). Vehicle is not economically repairable.`;
  }

  banner.className = `banner ${bannerClass}`;
  banner.innerHTML = `
    <div class="banner-icon">${icon}</div>
    <div class="banner-content">
      <div class="banner-verdict">${verdictText}</div>
      <div class="banner-amounts">
        <div>
          <div class="label">Fair Market Value</div>
          <div class="value">${fmt(fmv)}</div>
        </div>
        <div>
          <div class="label">Repair Threshold (${(TOTAL_LOSS_THRESHOLD * 100).toFixed(0)}% FMV)</div>
          <div class="value">${fmt(threshold)}</div>
        </div>
        <div>
          <div class="label">Est. Repair Cost</div>
          <div class="value">${fmt(repairEstimate)}</div>
        </div>
      </div>
      <div class="banner-logic">${logicText}</div>
    </div>
  `;
  return banner;
}

function buildSettlementPanel(fmv: number, low: number, high: number, salvage: { low: number; high: number }): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "panel";
  panel.innerHTML = `<div class="panel-title"><span class="pt-icon">&#x1F4B0;</span> Settlement Range</div>`;

  // Three-value display
  const rangeDisplay = document.createElement("div");
  rangeDisplay.className = "range-display";
  rangeDisplay.innerHTML = `
    <div class="range-val">
      <div class="rlabel">Low (25th pctl)</div>
      <div class="rnum">${fmt(low)}</div>
    </div>
    <div class="range-val center">
      <div class="rlabel">Fair Market Value</div>
      <div class="rnum">${fmt(fmv)}</div>
    </div>
    <div class="range-val">
      <div class="rlabel">High (75th pctl)</div>
      <div class="rnum">${fmt(high)}</div>
    </div>
  `;
  panel.appendChild(rangeDisplay);

  // Range bar
  const barContainer = document.createElement("div");
  barContainer.className = "range-bar-container";
  const range = high - low;
  const fillLeft = 0;
  const fillWidth = 100;
  const rawPos = range > 0 ? ((fmv - low) / range) * 100 : 50;
  const markerPos = Math.max(0, Math.min(100, rawPos));
  barContainer.innerHTML = `
    <div class="range-bar-fill" style="left:${fillLeft}%;width:${fillWidth}%"></div>
    <div class="range-bar-marker" style="left:${markerPos}%"></div>
  `;
  panel.appendChild(barContainer);

  // Salvage value
  const salvageRow = document.createElement("div");
  salvageRow.className = "salvage-row";
  salvageRow.innerHTML = `
    <span class="slabel">Salvage Value Estimate (15-25% FMV)</span>
    <span class="sval">${fmt(salvage.low)} &ndash; ${fmt(salvage.high)}</span>
  `;
  panel.appendChild(salvageRow);

  // Condition note
  const condAdj = CONDITION_ADJ[state.condition];
  const condNote = document.createElement("div");
  condNote.className = "condition-note";
  if (condAdj !== 0) {
    const dir = condAdj > 0 ? "+" : "";
    condNote.textContent = `Condition adjustment applied: ${CONDITION_LABELS[state.condition]} (${dir}${(condAdj * 100).toFixed(0)}%) to base FMV`;
  } else {
    condNote.textContent = `Condition: ${CONDITION_LABELS[state.condition]} (no adjustment applied)`;
  }
  panel.appendChild(condNote);

  return panel;
}

function buildCompsPanel(comps: SoldComp[], stats: { mean: number; median: number; count: number }): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "panel";
  panel.innerHTML = `<div class="panel-title"><span class="pt-icon">&#x1F4CA;</span> Comparable Evidence &mdash; Recent Sold</div>`;

  const wrap = document.createElement("div");
  wrap.className = "comp-table-wrap";

  let tableHtml = `<table><thead><tr>
    <th>VIN (last 6)</th><th>Year/Make/Model</th><th>Sale Price</th><th>Miles</th><th>Date Sold</th><th>State</th>
  </tr></thead><tbody>`;

  for (const c of comps) {
    const vinLast6 = c.vin.slice(-6);
    tableHtml += `<tr>
      <td>${vinLast6}</td>
      <td style="font-family:var(--font)">${c.year} ${c.make} ${c.model} ${c.trim}</td>
      <td>${c.salePrice > 0 ? fmt(c.salePrice) : '<span style="color:var(--text-dim)" title="Per-listing price not available in this API tier; market mean shown in Statistics row">&mdash;</span>'}</td>
      <td>${c.miles > 0 ? c.miles.toLocaleString() : '<span style="color:var(--text-dim)">&mdash;</span>'}</td>
      <td>${c.dateSold}</td>
      <td>${c.state}</td>
    </tr>`;
  }

  // Stats row
  tableHtml += `<tr class="stats-row">
    <td></td>
    <td style="font-family:var(--font)">Statistics</td>
    <td>Mean ${fmt(stats.mean)} / Med ${fmt(stats.median)}</td>
    <td colspan="2">${stats.count} comps</td>
    <td></td>
  </tr>`;

  tableHtml += `</tbody></table>`;
  wrap.innerHTML = tableHtml;
  panel.appendChild(wrap);
  return panel;
}

function buildRegionalPanel(prices: RegionalPrice[], nationalAvg: number): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "panel";
  panel.innerHTML = `<div class="panel-title"><span class="pt-icon">&#x1F30E;</span> Regional Variance</div>`;

  // Empty state — Sold Summary endpoint is Enterprise-tier; standard keys 403.
  // Show a friendly notice instead of an empty table.
  if (!prices || prices.length === 0) {
    const notice = document.createElement("div");
    notice.style.cssText = "padding:24px 16px;text-align:center;color:var(--text-dim);font-size:13px;line-height:1.6;";
    notice.innerHTML = `
      <div style="font-size:24px;margin-bottom:8px;opacity:0.5;">&#x1F30E;</div>
      <div style="font-weight:600;color:var(--text);margin-bottom:4px;">Regional pricing unavailable</div>
      <div style="font-size:12px;">State-level pricing requires the MarketCheck <strong>Sold Summary</strong> endpoint (Enterprise tier).</div>
      <div style="font-size:11px;margin-top:8px;"><a href="https://developers.marketcheck.com" target="_blank" style="color:var(--accent);text-decoration:none;">Contact MarketCheck to upgrade &rarr;</a></div>
    `;
    panel.appendChild(notice);
    return panel;
  }

  let tableHtml = `<table><thead><tr>
    <th>State</th><th>Avg Price</th><th>vs National</th><th>Sample</th>
  </tr></thead><tbody>`;

  for (const rp of prices) {
    const delta = ((rp.avgPrice - nationalAvg) / nationalAvg) * 100;
    const cls = delta >= 0 ? "delta-pos" : "delta-neg";
    tableHtml += `<tr>
      <td>${rp.state}</td>
      <td>${fmt(rp.avgPrice)}</td>
      <td class="${cls}">${fmtPct(delta)}</td>
      <td style="color:var(--text-dim)">${rp.count}</td>
    </tr>`;
  }

  tableHtml += `</tbody></table>`;
  panel.innerHTML += tableHtml;
  return panel;
}

function buildReplacementsPanel(replacements: ReplacementOption[], fmv: number): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "panel";
  panel.innerHTML = `<div class="panel-title"><span class="pt-icon">&#x1F697;</span> Replacement Options</div>`;

  for (const rep of replacements) {
    const card = document.createElement("div");
    card.className = "replacement-card";
    const covered = rep.price <= fmv;
    const coverageClass = covered ? "covered" : "short";
    const coverageText = covered
      ? `Covered (${fmt(fmv - rep.price)} under FMV)`
      : `Short ${fmt(rep.price - fmv)}`;

    card.innerHTML = `
      <div class="rc-left">
        <div class="rc-title">${rep.year} ${rep.make} ${rep.model} ${rep.trim}</div>
        <div class="rc-details">${rep.miles.toLocaleString()} mi &bull; ${rep.dealer} &bull; ${rep.city}, ${rep.state}</div>
      </div>
      <div class="rc-right">
        <div class="rc-price">${fmt(rep.price)}</div>
        <div class="rc-distance">${rep.distanceMi} mi away</div>
        <div class="rc-coverage ${coverageClass}">${coverageText}</div>
      </div>
    `;
    panel.appendChild(card);
  }

  return panel;
}

// ── Actions ────────────────────────────────────────────────────────────────────

async function evaluateClaim(): Promise<void> {
  if (state.loading) return;
  state.loading = true;
  const resultsArea = document.getElementById("results-area")!;
  resultsArea.innerHTML = `<div class="loading-overlay"><span class="spinner"></span>Evaluating claim...</div>`;

  try {
    const args = {
      vin: state.vin,
      miles: parseInt(state.mileage.replace(/,/g, ""), 10) || 0,
      zip: state.zip,
      condition: state.condition,
      damageSeverity: state.damageSeverity,
    };

    let result: ValuationResult;
    try {
      const response = await _callTool("claims-valuation", args);
      // _callTool wraps data as { content: [{ type:"text", text: "..." }] }
      // extract and parse that text payload
      const textContent = response?.content?.find((c: any) => c.type === "text");
      const raw = textContent?.text ? JSON.parse(textContent.text) : response;
      // Real data must have a positive FMV from the prediction endpoint.
      // If FMV is 0 (predict call failed) or shape is wrong, fall back to mock.
      const isReal = raw && typeof raw.fmv === "number" && raw.fmv > 0;
      result = isReal ? raw as ValuationResult : getMockData(state.vin);
    } catch {
      // Fallback to mock data
      result = getMockData(state.vin);
    }

    state.result = result;
  } catch {
    state.result = getMockData(state.vin);
  }

  state.loading = false;
  recalcAndRender();
}

function recalcAndRender(): void {
  const resultsArea = document.getElementById("results-area");
  if (!resultsArea || !state.result) return;
  renderResults(resultsArea);
}

// ── Initialize ─────────────────────────────────────────────────────────────────

// Apply URL params to state before rendering
(function applyUrlParams() {
  const p = _getUrlParams();
  if (p.vin) state.vin = p.vin;
  if (p.zip) state.zip = p.zip;
  if (p.miles) state.mileage = p.miles;
})();

// Render the shell UI
renderApp();

// Auto-trigger analysis if API key + VIN are in URL/localStorage
if (_getAuth().value && state.vin) {
  evaluateClaim();
} else {
  // Demo mode — show mock data immediately
  state.result = getMockData(state.vin);
  recalcAndRender();
}
