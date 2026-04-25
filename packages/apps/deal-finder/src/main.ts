/**
 * Deal Finder
 * Best deals scored by price, DOM, and market position.
 *
 * Three-stage MarketCheck API flow (per How-to-Build guide):
 *   1. searchActive with filters, sorted by price asc — fetch candidate deals
 *   2. predict/comparables per candidate — compute a deal score against
 *      fair-market-value for each VIN
 *   3. history/car/{vin} + sold-summary (Enterprise) in parallel — mine
 *      negotiation leverage from price drops / dealer hops, plus market
 *      timing context
 *
 * Graceful degradation: sold-summary is Enterprise-only and returns 403
 * on free tiers; when that happens we derive market timing advice from
 * the DOM distribution of the candidate set itself.
 */
import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "deal-finder" }); } catch {}

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
  for (const key of ["make", "model", "year", "zip", "radius", "maxPrice", "max_price", "state"]) {
    const v = params.get(key);
    if (v) result[key] = v;
  }
  return result;
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
const _mcActive = (p: any) => _mcApi("/search/car/active", p);
const _mcPredict = (p: any) => _mcApi("/predict/car/us/marketcheck_price/comparables", p);
const _mcHistory = (vin: string) => _mcApi("/history/car/" + vin);
const _mcSold = (p: any) => _mcApi("/api/v1/sold-vehicles/summary", p);

// 3-stage orchestration. The predict calls in stage 2 run in parallel
// across the top N candidates. The history+sold-summary pair in stage 3
// is per-candidate history (parallel) + one market-wide sold summary.
async function _fetchDirect(args: any) {
  const topN = Math.min(args.topN ?? 10, 20);

  // Stage 1 — search
  const search = await _mcActive({
    make: args.make,
    model: args.model,
    year: args.year,
    zip: args.zip,
    radius: args.radius ?? 50,
    price_range: args.maxPrice ? `0-${args.maxPrice}` : undefined,
    rows: topN,
    stats: "price,miles,dom",
    sort_by: "price",
    sort_order: "asc",
  }).catch(() => null);

  const listings: any[] = search?.listings ?? [];
  if (!listings.length) return { search, predictions: [], histories: [], soldSummary: null };

  // Stage 2 — predict per candidate (parallel)
  // Predict requires `miles`; we have it from the listing, so pass it.
  const predictions = await Promise.all(
    listings.map((l) =>
      _mcPredict({
        vin: l.vin,
        miles: l.miles ?? 0,
        zip: args.zip,
        dealer_type: "franchise",
      }).catch(() => null)
    )
  );

  // Stage 3 — history (per candidate, parallel) + sold summary (best-effort)
  const [histories, soldSummary] = await Promise.all([
    Promise.all(listings.map((l) => _mcHistory(l.vin).catch(() => null))),
    args.state
      ? _mcSold({
          state: args.state,
          ranking_dimensions: "make,model",
          ranking_measure: "sold_count,average_days_on_market",
          inventory_type: "Used",
          top_n: 30,
        }).catch(() => null)
      : Promise.resolve(null),
  ]);

  return { search, listings, predictions, histories, soldSummary };
}

async function _callTool(toolName: string, args: any) {
  const auth = _getAuth();
  if (auth.value) {
    // No composite proxy endpoint exists for deal-finder (toolName is null
    // in the landing-page spec), so direct is the only live path. MCP is
    // tried only if the user is inside an MCP host.
    try {
      const data = await _fetchDirect(args);
      if (data) return { content: [{ type: "text", text: JSON.stringify(data) }] };
    } catch {}
  }
  if (_safeApp) {
    try { return await _safeApp.callServerTool({ name: toolName, arguments: args }); } catch {}
  }
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
      <input id="_mc_key_inp" type="password" placeholder="Enter your API key" value="${_getAuth().mode === "api_key" ? _getAuth().value ?? "" : ""}"
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
      document.getElementById("_mc_save")?.addEventListener("click", () => {
        const k = (document.getElementById("_mc_key_inp") as HTMLInputElement)?.value?.trim();
        if (k) { localStorage.setItem("mc_api_key", k); location.reload(); }
      });
      document.getElementById("_mc_clear")?.addEventListener("click", () => {
        localStorage.removeItem("mc_api_key");
        localStorage.removeItem("mc_access_token");
        location.reload();
      });
    }, 0);
    bar.appendChild(gear);
  }
  headerEl.appendChild(bar);
}

// ── Responsive Styles ──────────────────────────────────────────────────
(function injectResponsiveStyles() {
  const s = document.createElement("style");
  s.textContent = `
    @media (max-width: 768px) {
      body { font-size: 13px !important; }
      h1 { font-size: 18px !important; }
      h2 { font-size: 15px !important; }
      input, select, button { font-size: 14px !important; }
      [style*="grid-template-columns: repeat"] { grid-template-columns: 1fr !important; }
      [style*="grid-template-columns:repeat"] { grid-template-columns: 1fr !important; }
      .df-form-row { flex-direction: column !important; align-items: stretch !important; }
      .df-form-row > * { width: 100% !important; min-width: 0 !important; }
      .df-card-body { flex-direction: column !important; }
      .df-card-body > * { width: 100% !important; }
    }
    @media (max-width: 480px) {
      body { padding: 0 !important; }
      h1 { font-size: 16px !important; }
      input, select { max-width: 100% !important; width: 100% !important; box-sizing: border-box !important; }
    }
  `;
  document.head.appendChild(s);
})();

// ── Types ──────────────────────────────────────────────────────────────
type Verdict = "BUY" | "NEGOTIATE" | "PASS";

interface Deal {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  miles: number;
  dom: number;
  city: string;
  state: string;
  dealerName: string;
  vdpUrl: string;
  exteriorColor: string;
  predictedPrice: number;          // Fair-market value per predict endpoint
  priceDelta: number;               // price - predictedPrice (negative = below market = good)
  priceDeltaPct: number;            // priceDelta / predictedPrice * 100
  priceDropCount: number;           // Distinct price drops in history
  priorListings: number;            // # of prior listings (different dealers)
  score: number;                    // 0–100 composite deal score
  verdict: Verdict;
  leveragePoints: string[];         // Human-readable negotiation bullets
}

interface MarketTiming {
  label: string;                    // "Fast market" / "Normal" / "Slow"
  color: string;
  desc: string;
}

interface DealFinderResult {
  filters: { make: string; model: string; year: string; zip: string; radius: number; maxPrice: number };
  deals: Deal[];
  marketStats: {
    candidateCount: number;
    avgPrice: number;
    avgDom: number;
    medianPriceDelta: number;        // How far below/above market the typical deal sits
  };
  timing: MarketTiming;
  dataSource: "live" | "demo";
}

// ── Formatting Helpers ─────────────────────────────────────────────────
const fmtCurrency = (v: number) => "$" + Math.round(v).toLocaleString();
const fmtCurrencyDelta = (v: number) =>
  (v < 0 ? "-" : "+") + "$" + Math.abs(Math.round(v)).toLocaleString();
const fmtNum = (v: number) => Math.round(v).toLocaleString();

// ── Mock Data ──────────────────────────────────────────────────────────
function generateMockData(filters: any): DealFinderResult {
  // A curated spread of deals: 3 BUYs (5–12% below market, some lot-aged),
  // 3 NEGOTIATE (near market, some aged), 2 PASS (above market or fresh).
  const base: Array<Partial<Deal>> = [
    { vin: "2T1BURHE4HC800001", year: 2022, make: "Toyota", model: "Corolla", trim: "LE", price: 17500, predictedPrice: 19800, miles: 41200, dom: 62, city: "Dallas", state: "TX", dealerName: "Midway Auto Group", exteriorColor: "Silver", priceDropCount: 2, priorListings: 0 },
    { vin: "1HGCV1F30LA000002", year: 2020, make: "Honda", model: "Accord", trim: "Sport", price: 21300, predictedPrice: 23900, miles: 38400, dom: 51, city: "Dallas", state: "TX", dealerName: "Park Place Motors", exteriorColor: "Modern Steel", priceDropCount: 1, priorListings: 1 },
    { vin: "5YFB4MDE0SP000003", year: 2023, make: "Toyota", model: "Camry", trim: "LE", price: 22600, predictedPrice: 25300, miles: 29800, dom: 73, city: "Fort Worth", state: "TX", dealerName: "Huffines Used Cars", exteriorColor: "Celestial Silver", priceDropCount: 3, priorListings: 0 },
    { vin: "1FMCU9HD5MUA00004", year: 2021, make: "Ford", model: "Escape", trim: "SE", price: 19900, predictedPrice: 20600, miles: 44100, dom: 34, city: "Arlington", state: "TX", dealerName: "Texas Auto Outlet", exteriorColor: "Oxford White", priceDropCount: 1, priorListings: 0 },
    { vin: "3GNAXKEV1MS000005", year: 2021, make: "Chevrolet", model: "Equinox", trim: "LT", price: 18700, predictedPrice: 19100, miles: 52300, dom: 28, city: "Plano", state: "TX", dealerName: "Classic Chevrolet", exteriorColor: "Summit White", priceDropCount: 0, priorListings: 0 },
    { vin: "JF2SJAEC8JH000006", year: 2019, make: "Subaru", model: "Forester", trim: "Premium", price: 20400, predictedPrice: 20700, miles: 58900, dom: 41, city: "Irving", state: "TX", dealerName: "Five Star Subaru", exteriorColor: "Crystal White", priceDropCount: 0, priorListings: 1 },
    { vin: "1C4PJMDN0MD000007", year: 2021, make: "Jeep", model: "Cherokee", trim: "Latitude", price: 23100, predictedPrice: 22200, miles: 39700, dom: 19, city: "Dallas", state: "TX", dealerName: "AutoNation Jeep", exteriorColor: "Diamond Black", priceDropCount: 0, priorListings: 0 },
    { vin: "KM8K33A3XPU000008", year: 2023, make: "Hyundai", model: "Kona", trim: "SEL", price: 24800, predictedPrice: 23100, miles: 18300, dom: 11, city: "Dallas", state: "TX", dealerName: "Van Hyundai", exteriorColor: "Ecotronic Gray", priceDropCount: 0, priorListings: 0 },
  ];
  const deals: Deal[] = base.map((b) => buildDealFromMock(b as Deal)).sort((a, b) => b.score - a.score);
  const prices = deals.map((d) => d.price);
  const doms = deals.map((d) => d.dom);
  const deltas = deals.map((d) => d.priceDelta).sort((a, b) => a - b);
  const medianDelta = deltas[Math.floor(deltas.length / 2)] ?? 0;
  const avgDom = doms.reduce((s, v) => s + v, 0) / doms.length;
  return {
    filters: {
      make: filters.make ?? "",
      model: filters.model ?? "",
      year: filters.year ?? "",
      zip: filters.zip ?? "75201",
      radius: Number(filters.radius ?? 50),
      maxPrice: Number(filters.maxPrice ?? 0),
    },
    deals,
    marketStats: {
      candidateCount: deals.length,
      avgPrice: prices.reduce((s, v) => s + v, 0) / prices.length,
      avgDom,
      medianPriceDelta: medianDelta,
    },
    timing: deriveTiming(null, avgDom),
    dataSource: "demo",
  };
}

function buildDealFromMock(b: Deal): Deal {
  const priceDelta = b.price - b.predictedPrice;
  const priceDeltaPct = (priceDelta / b.predictedPrice) * 100;
  const { score, verdict } = scoreDeal(priceDeltaPct, b.dom, b.priceDropCount);
  return {
    ...b,
    vdpUrl: "",
    priceDelta,
    priceDeltaPct,
    score,
    verdict,
    leveragePoints: buildLeveragePoints(b, priceDelta),
  };
}

// ── Scoring ────────────────────────────────────────────────────────────
// Composite 0–100 score. Below-market price is the dominant factor; DOM and
// recent price drops add leverage points; above-market asking prices drop
// the score sharply.
//
//   priceDeltaPct: negative = below predicted retail (good).
//     A -10% deal adds +40 points; a +5% deal subtracts 20.
//   dom: longer on lot = more negotiation room.
//     30d: +3, 45d: +8, 60d: +12, 90d+: +15.
//   priceDropCount: each confirmed drop in history suggests dealer
//     willingness to move; +4 per drop, capped at 3.
function scoreDeal(priceDeltaPct: number, dom: number, priceDropCount: number): { score: number; verdict: Verdict } {
  let score = 50;
  score += -priceDeltaPct * 4;
  if (dom >= 90) score += 15;
  else if (dom >= 60) score += 12;
  else if (dom >= 45) score += 8;
  else if (dom >= 30) score += 3;
  else if (dom < 10) score -= 4;
  score += Math.min(3, priceDropCount) * 4;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict: Verdict = score >= 75 ? "BUY" : score >= 45 ? "NEGOTIATE" : "PASS";
  return { score, verdict };
}

function buildLeveragePoints(d: Partial<Deal>, priceDelta: number): string[] {
  const pts: string[] = [];
  if (priceDelta < -500) {
    pts.push(`Listed ${fmtCurrency(Math.abs(priceDelta))} below predicted retail (${fmtCurrency(d.predictedPrice!)})`);
  } else if (priceDelta > 500) {
    pts.push(`Asking ${fmtCurrency(priceDelta)} above predicted retail — target ${fmtCurrency(d.predictedPrice!)}`);
  } else {
    pts.push(`Priced within ±$500 of predicted retail (${fmtCurrency(d.predictedPrice!)})`);
  }
  if ((d.dom ?? 0) >= 60) {
    pts.push(`${d.dom} days on lot — strong negotiating window (dealer likely motivated)`);
  } else if ((d.dom ?? 0) >= 30) {
    pts.push(`${d.dom} days on lot — negotiating room opening up`);
  } else if ((d.dom ?? 0) < 10) {
    pts.push(`Only ${d.dom} days listed — fresh inventory, less negotiating flex`);
  }
  if ((d.priceDropCount ?? 0) >= 2) {
    pts.push(`Price has dropped ${d.priceDropCount} times since listing — dealer actively trimming`);
  } else if ((d.priceDropCount ?? 0) === 1) {
    pts.push(`One price drop recorded — some flexibility demonstrated`);
  }
  if ((d.priorListings ?? 0) >= 1) {
    pts.push(`VIN appeared on ${d.priorListings} prior lot${(d.priorListings ?? 0) > 1 ? "s" : ""} — carried inventory`);
  }
  return pts;
}

// ── Live Data Transformer ──────────────────────────────────────────────
// Turns raw 3-stage API output into a DealFinderResult. Uses listing data
// for identity + miles, prediction for predictedPrice, history for the
// price-drop + prior-listings counts. Sold-summary is best-effort and
// only used for market timing.
function buildLiveResult(raw: any, filters: any): DealFinderResult {
  const listings: any[] = raw?.listings ?? [];
  const predictions: any[] = raw?.predictions ?? [];
  const histories: any[] = raw?.histories ?? [];
  const sold = raw?.soldSummary ?? null;

  const deals: Deal[] = listings.map((l, i) => {
    const pred = predictions[i] ?? null;
    const hist = histories[i] ?? null;
    const predictedPrice = Math.round(Number(pred?.marketcheck_price ?? pred?.price_prediction ?? l.price));
    const { priceDropCount, priorListings } = analyzeHistory(hist, l.price);
    const priceDelta = l.price - predictedPrice;
    const priceDeltaPct = predictedPrice ? (priceDelta / predictedPrice) * 100 : 0;
    const dom = Number(l.dom ?? l.days_on_market ?? 0);
    const { score, verdict } = scoreDeal(priceDeltaPct, dom, priceDropCount);
    const build = l.build ?? {};
    const dealer = l.dealer ?? {};
    const partial: Partial<Deal> = {
      predictedPrice,
      dom,
      priceDropCount,
      priorListings,
    };
    return {
      vin: l.vin,
      year: Number(build.year ?? 0),
      make: build.make ?? "",
      model: build.model ?? "",
      trim: build.trim ?? "",
      price: Number(l.price ?? 0),
      miles: Number(l.miles ?? 0),
      dom,
      city: dealer.city ?? "",
      state: dealer.state ?? "",
      dealerName: dealer.name ?? "",
      vdpUrl: l.vdp_url ?? "",
      exteriorColor: l.exterior_color ?? "",
      predictedPrice,
      priceDelta,
      priceDeltaPct,
      priceDropCount,
      priorListings,
      score,
      verdict,
      leveragePoints: buildLeveragePoints(partial, priceDelta),
    };
  });

  deals.sort((a, b) => b.score - a.score);

  const prices = deals.map((d) => d.price).filter((p) => p > 0);
  const doms = deals.map((d) => d.dom).filter((d) => d > 0);
  const deltas = deals.map((d) => d.priceDelta).sort((a, b) => a - b);
  const avgPrice = prices.length ? prices.reduce((s, v) => s + v, 0) / prices.length : 0;
  const avgDom = doms.length ? doms.reduce((s, v) => s + v, 0) / doms.length : 0;
  const medianDelta = deltas[Math.floor(deltas.length / 2)] ?? 0;

  return {
    filters: {
      make: filters.make ?? "",
      model: filters.model ?? "",
      year: filters.year ?? "",
      zip: filters.zip ?? "",
      radius: Number(filters.radius ?? 50),
      maxPrice: Number(filters.maxPrice ?? 0),
    },
    deals,
    marketStats: {
      candidateCount: deals.length,
      avgPrice,
      avgDom,
      medianPriceDelta: medianDelta,
    },
    timing: deriveTiming(sold, avgDom),
    dataSource: "live",
  };
}

// Walks the /history/car/{vin} response to count distinct price drops and
// the number of prior listings (defined as: listings under a different
// dealer than the current one, or separated from the current one in time).
function analyzeHistory(history: any, currentPrice: number): { priceDropCount: number; priorListings: number } {
  const rows: any[] = history?.listings ?? history ?? [];
  if (!Array.isArray(rows) || rows.length === 0) return { priceDropCount: 0, priorListings: 0 };
  const sorted = [...rows].sort(
    (a, b) => (a.first_seen_at ?? 0) - (b.first_seen_at ?? 0)
  );
  let drops = 0;
  let prev = Number.MAX_SAFE_INTEGER;
  for (const r of sorted) {
    const p = Number(r.price ?? r.ref_price ?? 0);
    if (p && p < prev - 50) drops++;
    if (p) prev = p;
  }
  // Prior listings = distinct dealers excluding the latest one, bounded.
  const dealerIds = new Set<string>();
  for (const r of sorted) {
    const id = r.dealer?.id ?? r.dealer_id;
    if (id) dealerIds.add(String(id));
  }
  const priorListings = Math.max(0, dealerIds.size - 1);
  void currentPrice;
  return { priceDropCount: drops, priorListings };
}

// Derives a market-timing pill. Prefer Enterprise sold-summary avg DOM
// (where available); fall back to the candidate set's avg DOM. A tight
// market (avg DOM < 30) signals buyers need to act fast; a slow market
// (> 60) signals strong buyer leverage across the board.
function deriveTiming(sold: any, fallbackAvgDom: number): MarketTiming {
  let avg = fallbackAvgDom;
  const rows = sold?.data ?? sold?.rankings ?? sold ?? null;
  if (Array.isArray(rows) && rows.length) {
    const doms = rows
      .map((r: any) => Number(r.average_days_on_market ?? r.dom ?? 0))
      .filter((n: number) => n > 0);
    if (doms.length) avg = doms.reduce((s, v) => s + v, 0) / doms.length;
  }
  if (!avg || !isFinite(avg)) {
    return { label: "Market Timing", color: "#94a3b8", desc: "Not enough data to classify market pace" };
  }
  if (avg < 30) return { label: "Fast Market", color: "#ef4444", desc: `Avg ${Math.round(avg)}d on lot — move quickly on BUY-rated deals` };
  if (avg > 60) return { label: "Slow Market", color: "#22c55e", desc: `Avg ${Math.round(avg)}d on lot — strong buyer leverage, negotiate hard` };
  return { label: "Normal Market", color: "#f59e0b", desc: `Avg ${Math.round(avg)}d on lot — standard negotiation window` };
}

// ── UI Shell ───────────────────────────────────────────────────────────
document.body.style.cssText =
  "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;overflow-x:hidden;";

const container = document.createElement("div");
container.style.cssText = "max-width:1100px;margin:0 auto;padding:16px 20px 40px;";
document.body.appendChild(container);

// Header
const headerPanel = document.createElement("div");
headerPanel.style.cssText = "background:#1e293b;border-radius:10px;padding:14px 18px;margin-bottom:16px;border:1px solid #334155;display:flex;align-items:center;";
headerPanel.innerHTML = `<div>
  <h1 style="margin:0;font-size:18px;font-weight:700;color:#f1f5f9;">Deal Finder</h1>
  <div style="font-size:12px;color:#94a3b8;margin-top:2px;">Best deals scored by price, DOM, and market position</div>
</div>`;
_addSettingsBar(headerPanel);
container.appendChild(headerPanel);

// Demo banner (only in demo mode)
if (_detectAppMode() === "demo") {
  const _db = document.createElement("div");
  _db.id = "_demo_banner";
  _db.style.cssText = "background:linear-gradient(135deg,#92400e22,#f59e0b11);border:1px solid #f59e0b44;border-radius:10px;padding:14px 20px;margin-bottom:12px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;";
  _db.innerHTML = `
    <div style="flex:1;min-width:200px;">
      <div style="font-size:13px;font-weight:700;color:#fbbf24;margin-bottom:2px;">&#9888; Demo Mode — Showing sample deals</div>
      <div style="font-size:12px;color:#d97706;">Enter your MarketCheck API key to see real deals. <a href="https://developers.marketcheck.com" target="_blank" style="color:#fbbf24;text-decoration:underline;">Get a free key</a></div>
    </div>
    <div style="display:flex;gap:8px;align-items:center;">
      <input id="_banner_key" type="text" placeholder="Paste your API key" style="padding:8px 12px;border-radius:6px;border:1px solid #f59e0b44;background:#0f172a;color:#e2e8f0;font-size:13px;width:220px;outline:none;" />
      <button id="_banner_save" style="padding:8px 16px;border-radius:6px;border:none;background:#f59e0b;color:#0f172a;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">Activate</button>
    </div>`;
  container.appendChild(_db);
  _db.querySelector("#_banner_save")?.addEventListener("click", () => {
    const k = (_db.querySelector("#_banner_key") as HTMLInputElement)?.value?.trim();
    if (!k) return;
    localStorage.setItem("mc_api_key", k);
    location.reload();
  });
  _db.querySelector("#_banner_key")?.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") (_db.querySelector("#_banner_save") as HTMLButtonElement)?.click();
  });
}

// Filter form
const formPanel = document.createElement("div");
formPanel.style.cssText = "background:#1e293b;border-radius:10px;padding:16px 20px;margin-bottom:16px;border:1px solid #334155;";
const inputStyle = "padding:8px 10px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;box-sizing:border-box;";
formPanel.innerHTML = `
  <div class="df-form-row" style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;">
    <div style="display:flex;flex-direction:column;gap:4px;">
      <label style="font-size:11px;color:#94a3b8;font-weight:600;">Make</label>
      <input id="df-make" type="text" placeholder="e.g. Toyota" style="${inputStyle}width:140px;" />
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;">
      <label style="font-size:11px;color:#94a3b8;font-weight:600;">Model</label>
      <input id="df-model" type="text" placeholder="e.g. Camry" style="${inputStyle}width:140px;" />
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;">
      <label style="font-size:11px;color:#94a3b8;font-weight:600;">Year / Range</label>
      <input id="df-year" type="text" placeholder="2020-2023" style="${inputStyle}width:110px;" />
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;">
      <label style="font-size:11px;color:#94a3b8;font-weight:600;">ZIP *</label>
      <input id="df-zip" type="text" placeholder="75201" maxlength="5" style="${inputStyle}width:90px;" />
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;">
      <label style="font-size:11px;color:#94a3b8;font-weight:600;">Radius</label>
      <select id="df-radius" style="${inputStyle}width:90px;">
        <option value="25">25 mi</option>
        <option value="50" selected>50 mi</option>
        <option value="100">100 mi</option>
        <option value="200">200 mi</option>
      </select>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;">
      <label style="font-size:11px;color:#94a3b8;font-weight:600;">Max Price</label>
      <input id="df-max-price" type="number" placeholder="30000" style="${inputStyle}width:110px;" />
    </div>
    <button id="df-search" style="padding:10px 20px;border-radius:6px;border:none;background:#3b82f6;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Find Deals</button>
  </div>`;
container.appendChild(formPanel);

// Pre-fill from URL params
const urlParams = _getUrlParams();
(document.getElementById("df-make") as HTMLInputElement).value = urlParams.make ?? "";
(document.getElementById("df-model") as HTMLInputElement).value = urlParams.model ?? "";
(document.getElementById("df-year") as HTMLInputElement).value = urlParams.year ?? "";
(document.getElementById("df-zip") as HTMLInputElement).value = urlParams.zip ?? "75201";
(document.getElementById("df-radius") as HTMLSelectElement).value = urlParams.radius ?? "50";
(document.getElementById("df-max-price") as HTMLInputElement).value = urlParams.maxPrice ?? urlParams.max_price ?? "";

// Status bar
const statusBar = document.createElement("div");
statusBar.style.cssText = "display:none;background:#1e293b;border-radius:10px;padding:12px 18px;border:1px solid #334155;margin-bottom:16px;text-align:center;font-size:13px;";
container.appendChild(statusBar);

// Summary ribbon (populated after search)
const summaryRibbon = document.createElement("div");
summaryRibbon.style.cssText = "display:none;flex-wrap:wrap;gap:10px;margin-bottom:16px;";
container.appendChild(summaryRibbon);

// Timing pill (populated after search)
const timingPill = document.createElement("div");
timingPill.style.cssText = "display:none;background:#1e293b;border-radius:10px;padding:12px 16px;border:1px solid #334155;margin-bottom:16px;";
container.appendChild(timingPill);

// Results list
const resultsList = document.createElement("div");
resultsList.style.cssText = "display:flex;flex-direction:column;gap:12px;";
container.appendChild(resultsList);

// ── Render Functions ───────────────────────────────────────────────────
function renderSummary(r: DealFinderResult) {
  summaryRibbon.style.display = "flex";
  const { marketStats, deals } = r;
  const buyCount = deals.filter((d) => d.verdict === "BUY").length;
  const passCount = deals.filter((d) => d.verdict === "PASS").length;
  const cards = [
    { label: "Candidates", value: fmtNum(marketStats.candidateCount), color: "#60a5fa" },
    { label: "BUY", value: String(buyCount), color: "#22c55e" },
    { label: "PASS", value: String(passCount), color: "#ef4444" },
    { label: "Avg Price", value: fmtCurrency(marketStats.avgPrice), color: "#94a3b8" },
    { label: "Avg DOM", value: `${Math.round(marketStats.avgDom)}d`, color: "#94a3b8" },
    { label: "Median vs Market", value: fmtCurrencyDelta(marketStats.medianPriceDelta), color: marketStats.medianPriceDelta < 0 ? "#22c55e" : "#f59e0b" },
  ];
  summaryRibbon.innerHTML = cards
    .map(
      (k) =>
        `<div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 14px;min-width:120px;flex:1;">
          <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">${k.label}</div>
          <div style="font-size:20px;font-weight:700;color:${k.color};margin-top:2px;">${k.value}</div>
        </div>`
    )
    .join("");
}

function renderTiming(t: MarketTiming) {
  timingPill.style.display = "block";
  timingPill.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <span style="padding:4px 10px;border-radius:8px;font-size:11px;font-weight:700;background:${t.color}22;color:${t.color};border:1px solid ${t.color}44;">${t.label}</span>
      <span style="font-size:13px;color:#cbd5e1;">${t.desc}</span>
    </div>`;
}

function verdictColors(v: Verdict): { bg: string; fg: string; border: string } {
  if (v === "BUY") return { bg: "rgba(34,197,94,0.15)", fg: "#22c55e", border: "#22c55e" };
  if (v === "NEGOTIATE") return { bg: "rgba(245,158,11,0.15)", fg: "#f59e0b", border: "#f59e0b" };
  return { bg: "rgba(239,68,68,0.15)", fg: "#ef4444", border: "#ef4444" };
}

function renderDealCard(d: Deal): HTMLElement {
  const vc = verdictColors(d.verdict);
  const card = document.createElement("div");
  card.style.cssText = `background:#1e293b;border-left:4px solid ${vc.border};border-radius:10px;padding:16px 20px;display:flex;gap:20px;align-items:stretch;`;
  card.className = "df-card-body";

  // Left: heading + meta + leverage
  const left = document.createElement("div");
  left.style.cssText = "flex:1;min-width:0;";
  const priceDeltaColor = d.priceDelta < 0 ? "#22c55e" : d.priceDelta > 500 ? "#ef4444" : "#f59e0b";
  left.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;flex-wrap:wrap;">
      <span style="font-size:16px;font-weight:700;color:#f1f5f9;">${d.year || ""} ${d.make} ${d.model}</span>
      <span style="font-size:13px;color:#94a3b8;">${d.trim}</span>
      <span style="padding:2px 10px;border-radius:8px;font-size:11px;font-weight:700;background:${vc.bg};color:${vc.fg};border:1px solid ${vc.fg}44;">${d.verdict}</span>
      <span style="margin-left:auto;font-size:12px;color:#64748b;">Score ${d.score}/100</span>
    </div>
    <div style="font-size:12px;color:#cbd5e1;margin-bottom:10px;">
      ${fmtCurrency(d.price)} · ${fmtNum(d.miles)} mi · ${d.dom} days on lot · ${d.city || "—"}${d.state ? ", " + d.state : ""}${d.dealerName ? " · " + d.dealerName : ""}
    </div>
    ${renderPriceBar(d)}
    <ul style="list-style:none;padding:0;margin:12px 0 0;display:flex;flex-direction:column;gap:4px;">
      ${d.leveragePoints.map((p) => `<li style="font-size:12px;color:#cbd5e1;padding-left:16px;position:relative;"><span style="position:absolute;left:0;color:${priceDeltaColor};">●</span>${p}</li>`).join("")}
    </ul>`;
  card.appendChild(left);

  // Right: verdict block + CTA
  const right = document.createElement("div");
  right.style.cssText = "display:flex;flex-direction:column;justify-content:center;align-items:flex-end;gap:8px;min-width:140px;";
  right.innerHTML = `
    <div style="text-align:right;">
      <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">vs Predicted</div>
      <div style="font-size:18px;font-weight:700;color:${priceDeltaColor};">${fmtCurrencyDelta(d.priceDelta)}</div>
      <div style="font-size:11px;color:#64748b;">${d.priceDeltaPct > 0 ? "+" : ""}${d.priceDeltaPct.toFixed(1)}% vs ${fmtCurrency(d.predictedPrice)}</div>
    </div>
    ${d.vdpUrl ? `<a href="${d.vdpUrl}" target="_blank" rel="noopener" style="padding:6px 12px;border-radius:6px;background:#334155;color:#f1f5f9;font-size:12px;font-weight:600;text-decoration:none;">View Listing &#8599;</a>` : ""}`;
  card.appendChild(right);
  return card;
}

// Horizontal price bar: fairMarketRange is ±10% around predicted; marker
// is the asking price. Green zone = below predicted, red zone = above.
function renderPriceBar(d: Deal): string {
  const low = d.predictedPrice * 0.9;
  const high = d.predictedPrice * 1.1;
  const span = Math.max(1, high - low);
  const clamp = (v: number) => Math.max(low, Math.min(high, v));
  const markerPct = ((clamp(d.price) - low) / span) * 100;
  const midPct = ((d.predictedPrice - low) / span) * 100;
  const markerColor = d.price < d.predictedPrice ? "#22c55e" : d.price > d.predictedPrice * 1.02 ? "#ef4444" : "#f59e0b";
  return `
    <div style="position:relative;height:28px;background:linear-gradient(to right,rgba(34,197,94,0.25),rgba(245,158,11,0.2) 50%,rgba(239,68,68,0.25));border-radius:14px;border:1px solid #334155;">
      <div style="position:absolute;left:${midPct}%;top:-4px;bottom:-4px;width:2px;background:#94a3b8;"></div>
      <div style="position:absolute;left:calc(${markerPct}% - 10px);top:2px;width:20px;height:20px;border-radius:50%;background:${markerColor};border:3px solid #0f172a;"></div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:#64748b;">
      <span>${fmtCurrency(low)}</span>
      <span>predicted ${fmtCurrency(d.predictedPrice)}</span>
      <span>${fmtCurrency(high)}</span>
    </div>`;
}

function renderAll(result: DealFinderResult) {
  renderSummary(result);
  renderTiming(result.timing);
  resultsList.innerHTML = "";
  if (!result.deals.length) {
    const empty = document.createElement("div");
    empty.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:28px;text-align:center;color:#94a3b8;";
    empty.textContent = "No candidates matched these filters. Widen the radius or remove the max-price cap.";
    resultsList.appendChild(empty);
    return;
  }
  for (const d of result.deals) resultsList.appendChild(renderDealCard(d));
}

// ── Search Handler ─────────────────────────────────────────────────────
async function handleSearch() {
  const make = (document.getElementById("df-make") as HTMLInputElement).value.trim();
  const model = (document.getElementById("df-model") as HTMLInputElement).value.trim();
  const year = (document.getElementById("df-year") as HTMLInputElement).value.trim();
  const zip = (document.getElementById("df-zip") as HTMLInputElement).value.trim();
  const radius = Number((document.getElementById("df-radius") as HTMLSelectElement).value);
  const maxPrice = Number((document.getElementById("df-max-price") as HTMLInputElement).value) || 0;
  const filters: any = { make, model, year, zip, radius, maxPrice, state: urlParams.state };

  if (!zip) {
    statusBar.style.display = "block";
    statusBar.innerHTML = `<span style="color:#f97316;">Enter a ZIP code to search.</span>`;
    return;
  }

  const mode = _detectAppMode();
  statusBar.style.display = "block";
  statusBar.innerHTML = `<span style="color:#60a5fa;">Searching deals within ${radius} miles of ${zip}${make ? ` · ${make}${model ? " " + model : ""}` : ""}...</span>`;
  const btn = document.getElementById("df-search") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "Searching...";

  if (mode === "live" || mode === "mcp") {
    try {
      const tool = await _callTool("deal-finder", { ...filters, topN: 10 });
      const text = tool?.content?.find((c: any) => c.type === "text")?.text;
      if (text) {
        const parsed = JSON.parse(text);
        if (parsed.listings || parsed.search) {
          const result = buildLiveResult(parsed, filters);
          if (result.deals.length) {
            statusBar.style.display = "none";
            renderAll(result);
            btn.disabled = false;
            btn.textContent = "Find Deals";
            return;
          }
        }
      }
    } catch {}
    // Live tried and produced nothing — fall through to empty result rather
    // than silently showing mock data (which would mislead in live mode).
    statusBar.innerHTML = `<span style="color:#f97316;">No live candidates matched. Widen filters or check console for API errors.</span>`;
    renderAll({ ...generateMockData(filters), deals: [], marketStats: { candidateCount: 0, avgPrice: 0, avgDom: 0, medianPriceDelta: 0 }, dataSource: "live" });
    btn.disabled = false;
    btn.textContent = "Find Deals";
    return;
  }

  // Demo mode
  const result = generateMockData(filters);
  statusBar.style.display = "none";
  renderAll(result);
  btn.disabled = false;
  btn.textContent = "Find Deals";
}

document.getElementById("df-search")!.addEventListener("click", handleSearch);
document.getElementById("df-zip")!.addEventListener("keydown", (e) => {
  if ((e as KeyboardEvent).key === "Enter") handleSearch();
});

// ── Initial Load ───────────────────────────────────────────────────────
// Auto-submit in demo (so the gallery visitor sees ranked deals
// immediately) OR in live mode when URL deep-link params are present.
// Otherwise leave the form blank for the live user to fill in.
(async function init() {
  const hasDeepLink = !!(urlParams.zip || urlParams.make || urlParams.model);
  const mode = _detectAppMode();
  if (mode === "demo" || hasDeepLink) {
    await handleSearch();
  } else {
    statusBar.style.display = "block";
    statusBar.innerHTML = `<span style="color:#60a5fa;">Enter filters above and click <strong>Find Deals</strong>.</span>`;
  }
})();
