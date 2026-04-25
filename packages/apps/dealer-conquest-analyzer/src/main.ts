import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "dealer-conquest-analyzer" }); } catch {}

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
function _isEmbedMode(): boolean { return new URLSearchParams(location.search).has("embed"); }
function _getUrlParams(): Record<string, string> { const params = new URLSearchParams(location.search); const result: Record<string, string> = {}; for (const key of ["vin","zip","make","model","miles","state","dealer_id","ticker","price","postal_code"]) { const v = params.get(key); if (v) result[key] = v; } return result; }
function _proxyBase(): string { return location.protocol.startsWith("http") ? "" : "http://localhost:3001"; }

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
  // Stage 1 — run the 3 core calls + top-competitor-IDs lookup in parallel.
  // `demand` (sold-summary) is Enterprise-only and returns 403 on free tier;
  // we swallow that error and let buildLiveResult derive a market-count
  // demand proxy instead.
  const radius = args.radius ?? 50;
  const [myInventory, marketInventory, demand, topCompetitorIds] = await Promise.all([
    _mcActive({ dealer_id: args.dealer_id, rows: 0, facets: "make,model,body_type" }).catch(() => null),
    _mcActive({ zip: args.zip, radius, rows: 10, stats: "price,dom", facets: "make,model,body_type" }).catch(() => null),
    _mcSold({
      state: args.state,
      ranking_dimensions: "make,model",
      ranking_measure: "sold_count",
      ranking_order: "desc",
      top_n: 20,
    }).catch(() => null),
    _mcActive({ zip: args.zip, radius, rows: 0, facets: "dealer_id" })
      .then((d: any) => (d?.facets?.dealer_id || []).slice(0, 5).map((f: any) => String(f.item)))
      .catch(() => []),
  ]);

  // Stage 2 — fan out per-competitor make/model facet lookups (5 parallel calls).
  // Filters out the user's own dealer_id so we never compare them to themselves.
  const competitorIds: string[] = (topCompetitorIds || []).filter(
    (id: string) => id && id !== String(args.dealer_id)
  );
  const competitors = await Promise.all(
    competitorIds.map(async (did: string) => {
      const inv = await _mcActive({ dealer_id: did, rows: 0, facets: "make,model" }).catch(
        () => null
      );
      return { dealerId: did, inv };
    })
  );

  return { myInventory, marketInventory, demand, competitors };
}
async function _callTool(toolName, args) {
  const auth = _getAuth();
  if (auth.value) {
    // 1. Direct API first — the shared proxy handler for analyze-dealer-conquest
    // has the same shape that doesn't match the UI and doesn't fetch per-competitor
    // data, so going direct gives us the correct data with no hop. Proxy remains
    // as a fallback in case it's updated server-side.
    try {
      const data = await _fetchDirect(args);
      if (data) return { content: [{ type: "text", text: JSON.stringify(data) }] };
    } catch {}
    // 2. Proxy fallback
    try {
      const r = await fetch((_proxyBase()) + "/api/proxy/" + toolName, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, _auth_mode: auth.mode, _auth_value: auth.value }),
      });
      if (r.ok) { const d = await r.json(); return { content: [{ type: "text", text: JSON.stringify(d) }] }; }
    } catch {}
  }
  // 3. MCP mode (Claude, VS Code, etc.)
  if (_safeApp) {
    try { return await _safeApp.callServerTool({ name: toolName, arguments: args }); } catch {}
  }
  // 4. Demo mode
  return null;
}

function _addSettingsBar(headerEl?: HTMLElement) {
  if (_isEmbedMode() || !headerEl) return;
  const mode = _detectAppMode();
  const bar = document.createElement("div"); bar.style.cssText = "display:flex;align-items:center;gap:8px;margin-left:auto;";
  const colors: Record<string, { bg: string; fg: string; label: string }> = { mcp: { bg: "#1e40af22", fg: "#60a5fa", label: "MCP" }, live: { bg: "#05966922", fg: "#34d399", label: "LIVE" }, demo: { bg: "#92400e88", fg: "#fbbf24", label: "DEMO" } };
  const c = colors[mode];
  bar.innerHTML = `<span style="padding:3px 10px;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:0.5px;background:${c.bg};color:${c.fg};border:1px solid ${c.fg}33;">${c.label}</span>`;
  if (mode !== "mcp") {
    const gear = document.createElement("button"); gear.innerHTML = "&#9881;"; gear.title = "API Settings"; gear.style.cssText = "background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;padding:4px;";
    const panel = document.createElement("div"); panel.style.cssText = "display:none;position:fixed;top:50px;right:16px;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;z-index:1000;min-width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.5);";
    panel.innerHTML = `<div style="font-size:13px;font-weight:600;color:#f8fafc;margin-bottom:12px;">API Configuration</div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px;">MarketCheck API Key</label><input id="_mc_key_inp" type="password" placeholder="Enter your API key" value="${_getAuth().mode === 'api_key' ? _getAuth().value ?? '' : ''}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;margin-bottom:8px;box-sizing:border-box;" /><div style="font-size:10px;color:#64748b;margin-bottom:12px;">Get a free key at <a href="https://developers.marketcheck.com" target="_blank" style="color:#60a5fa;">developers.marketcheck.com</a></div><div style="display:flex;gap:8px;"><button id="_mc_save" style="flex:1;padding:8px;border-radius:6px;border:none;background:#3b82f6;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Save & Reload</button><button id="_mc_clear" style="padding:8px 12px;border-radius:6px;border:1px solid #334155;background:transparent;color:#94a3b8;font-size:13px;cursor:pointer;">Clear</button></div>`;
    gear.addEventListener("click", () => { panel.style.display = panel.style.display === "none" ? "block" : "none"; });
    document.addEventListener("click", (e) => { if (!panel.contains(e.target as Node) && e.target !== gear) panel.style.display = "none"; });
    document.body.appendChild(panel);
    setTimeout(() => { document.getElementById("_mc_save")?.addEventListener("click", () => { const k = (document.getElementById("_mc_key_inp") as HTMLInputElement)?.value?.trim(); if (k) { localStorage.setItem("mc_api_key", k); location.reload(); } }); document.getElementById("_mc_clear")?.addEventListener("click", () => { localStorage.removeItem("mc_api_key"); localStorage.removeItem("mc_access_token"); location.reload(); }); }, 0);
    bar.appendChild(gear);
  }
  headerEl.appendChild(bar);
}
(function injectResponsiveStyles() { const s = document.createElement("style"); s.textContent = `@media(max-width:768px){body{font-size:13px!important}table{font-size:12px!important}th,td{padding:6px 8px!important}h1{font-size:18px!important}h2{font-size:15px!important}canvas{max-width:100%!important}input,select,button{font-size:14px!important}[style*="display:flex"][style*="gap"],[style*="display: flex"][style*="gap"]{flex-wrap:wrap!important}[style*="grid-template-columns: repeat"]{grid-template-columns:1fr!important}[style*="grid-template-columns:repeat"]{grid-template-columns:1fr!important}table{min-width:600px}[style*="width:35%"],[style*="width:40%"],[style*="width:25%"],[style*="width:50%"],[style*="width:60%"],[style*="width:65%"],[style*="width: 35%"],[style*="width: 40%"],[style*="width: 25%"],[style*="width: 50%"],[style*="width: 60%"],[style*="width: 65%"]{width:100%!important;min-width:0!important}}@media(max-width:480px){body{padding:8px!important}h1{font-size:16px!important}th,td{padding:4px 6px!important;font-size:11px!important}input,select{max-width:100%!important;width:100%!important;box-sizing:border-box!important}}`; document.head.appendChild(s); })();


// ── Types ──────────────────────────────────────────────────────────────
interface MakeModelCount {
  make: string;
  model: string;
  count: number;
}

interface CompetitorDetail {
  dealerId: string;
  dealerName: string;
  totalUnits: number;
  topMakes: Array<{ make: string; count: number }>;
  topModels: Array<{ model: string; count: number }>;
}

interface GapModel {
  make: string;
  model: string;
  demandScore: number;
  avgMarketPrice: number;
  potentialVolume: number;
}

interface MarketShareEntry {
  make: string;
  marketCount: number;
  marketPct: number;
  yourCount: number;
  yourPct: number;
}

interface ConquestData {
  yourInventory: {
    totalUnits: number;
    makeModelBreakdown: MakeModelCount[];
  };
  competitors: CompetitorDetail[];
  gapAnalysis: GapModel[];
  acquisitionRecommendations: GapModel[];
  marketShareComparison: MarketShareEntry[];
  marketStats: {
    totalMarketListings: number;
    avgPrice: number;
    avgDom: number;
  };
}

// ── Mock Data ──────────────────────────────────────────────────────────
function generateMockData(): ConquestData {
  // Your dealer: Toyota dealer in Denver
  const yourMakeModel: MakeModelCount[] = [
    { make: "Toyota", model: "Camry", count: 18 },
    { make: "Toyota", model: "RAV4", count: 22 },
    { make: "Toyota", model: "Tacoma", count: 15 },
    { make: "Toyota", model: "Corolla", count: 12 },
    { make: "Toyota", model: "Highlander", count: 10 },
    { make: "Toyota", model: "4Runner", count: 8 },
    { make: "Toyota", model: "Tundra", count: 6 },
    { make: "Toyota", model: "Prius", count: 5 },
    { make: "Honda", model: "Civic", count: 3 },
    { make: "Honda", model: "CR-V", count: 2 },
  ];

  const competitors: CompetitorDetail[] = [
    {
      dealerId: "AN-HONDA-DEN",
      dealerName: "AutoNation Honda",
      totalUnits: 185,
      topMakes: [
        { make: "Honda", count: 142 },
        { make: "Toyota", count: 18 },
        { make: "Hyundai", count: 12 },
        { make: "Nissan", count: 8 },
        { make: "Ford", count: 5 },
      ],
      topModels: [
        { model: "CR-V", count: 38 },
        { model: "Civic", count: 32 },
        { model: "Accord", count: 28 },
        { model: "Pilot", count: 22 },
        { model: "HR-V", count: 14 },
        { model: "Passport", count: 8 },
      ],
    },
    {
      dealerId: "SCHOMP-BMW",
      dealerName: "Schomp BMW",
      totalUnits: 220,
      topMakes: [
        { make: "BMW", count: 178 },
        { make: "Mercedes-Benz", count: 20 },
        { make: "Audi", count: 12 },
        { make: "Lexus", count: 6 },
        { make: "Porsche", count: 4 },
      ],
      topModels: [
        { model: "X3", count: 34 },
        { model: "3 Series", count: 30 },
        { model: "X5", count: 28 },
        { model: "5 Series", count: 22 },
        { model: "X1", count: 18 },
        { model: "4 Series", count: 14 },
        { model: "X7", count: 12 },
        { model: "iX", count: 8 },
      ],
    },
    {
      dealerId: "EMICH-VW",
      dealerName: "Emich VW",
      totalUnits: 145,
      topMakes: [
        { make: "Volkswagen", count: 108 },
        { make: "Audi", count: 18 },
        { make: "Hyundai", count: 10 },
        { make: "Kia", count: 6 },
        { make: "Subaru", count: 3 },
      ],
      topModels: [
        { model: "Tiguan", count: 28 },
        { model: "Jetta", count: 22 },
        { model: "Atlas", count: 20 },
        { model: "Taos", count: 18 },
        { model: "ID.4", count: 12 },
        { model: "Golf GTI", count: 8 },
      ],
    },
    {
      dealerId: "MIKE-SHAW-SUBARU",
      dealerName: "Mike Shaw Subaru",
      totalUnits: 160,
      topMakes: [
        { make: "Subaru", count: 132 },
        { make: "Toyota", count: 12 },
        { make: "Honda", count: 8 },
        { make: "Mazda", count: 5 },
        { make: "Hyundai", count: 3 },
      ],
      topModels: [
        { model: "Outback", count: 34 },
        { model: "Forester", count: 30 },
        { model: "Crosstrek", count: 28 },
        { model: "Impreza", count: 18 },
        { model: "WRX", count: 12 },
        { model: "Ascent", count: 10 },
      ],
    },
    {
      dealerId: "ARAPAHOE-HYUNDAI",
      dealerName: "Arapahoe Hyundai",
      totalUnits: 130,
      topMakes: [
        { make: "Hyundai", count: 102 },
        { make: "Kia", count: 14 },
        { make: "Nissan", count: 8 },
        { make: "Toyota", count: 4 },
        { make: "Honda", count: 2 },
      ],
      topModels: [
        { model: "Tucson", count: 26 },
        { model: "Santa Fe", count: 22 },
        { model: "Elantra", count: 20 },
        { model: "Palisade", count: 14 },
        { model: "Kona", count: 12 },
        { model: "IONIQ 5", count: 8 },
      ],
    },
  ];

  // Gap models: what competitors stock that the Toyota dealer doesn't
  const gapAnalysis: GapModel[] = [
    { make: "Honda", model: "CR-V", demandScore: 892, avgMarketPrice: 32400, potentialVolume: 6 },
    { make: "Subaru", model: "Outback", demandScore: 756, avgMarketPrice: 31200, potentialVolume: 5 },
    { make: "Hyundai", model: "Tucson", demandScore: 714, avgMarketPrice: 29800, potentialVolume: 5 },
    { make: "Honda", model: "Accord", demandScore: 668, avgMarketPrice: 28500, potentialVolume: 4 },
    { make: "Subaru", model: "Forester", demandScore: 632, avgMarketPrice: 29100, potentialVolume: 4 },
    { make: "Hyundai", model: "Santa Fe", demandScore: 598, avgMarketPrice: 33600, potentialVolume: 4 },
    { make: "Volkswagen", model: "Tiguan", demandScore: 542, avgMarketPrice: 30200, potentialVolume: 3 },
    { make: "Subaru", model: "Crosstrek", demandScore: 518, avgMarketPrice: 27400, potentialVolume: 3 },
    { make: "Honda", model: "Pilot", demandScore: 486, avgMarketPrice: 38200, potentialVolume: 3 },
    { make: "Hyundai", model: "Palisade", demandScore: 445, avgMarketPrice: 41500, potentialVolume: 2 },
  ];

  // Market share comparison
  const marketShareComparison: MarketShareEntry[] = [
    { make: "Toyota", marketCount: 480, marketPct: 18.5, yourCount: 96, yourPct: 94.1 },
    { make: "Honda", marketCount: 410, marketPct: 15.8, yourCount: 5, yourPct: 4.9 },
    { make: "BMW", marketCount: 340, marketPct: 13.1, yourCount: 0, yourPct: 0.0 },
    { make: "Subaru", marketCount: 295, marketPct: 11.4, yourCount: 0, yourPct: 0.0 },
    { make: "Hyundai", marketCount: 260, marketPct: 10.0, yourCount: 0, yourPct: 0.0 },
  ];

  return {
    yourInventory: {
      totalUnits: yourMakeModel.reduce((s, m) => s + m.count, 0),
      makeModelBreakdown: yourMakeModel,
    },
    competitors,
    gapAnalysis,
    acquisitionRecommendations: gapAnalysis,
    marketShareComparison,
    marketStats: {
      totalMarketListings: 2595,
      avgPrice: 34200,
      avgDom: 32,
    },
  };
}

// ── Live Data Transformer ──────────────────────────────────────────────
// Transforms the raw proxy/direct response into the UI's expected ConquestData
// shape. Without this, live mode silently fell through to mock because the
// raw {myInventory, marketInventory, demand, competitors?} shape never
// matched the UI's {yourInventory, competitors, gapAnalysis, ...} check.
//
// Notes on derivations:
//  - yourInventory: derived from myInventory.facets.model (joined with make
//    facet so we can attribute each model to a make). If facets are empty,
//    returns a zero-state profile so the UI still renders without crashing.
//  - demand rankings: MarketCheck's sold-summary is an Enterprise endpoint
//    and returns 403 on free-tier keys, so when `demand` is null we derive
//    a demand proxy from marketInventory.facets.model (listing count as a
//    crude but reasonable stand-in for "what's selling").
//  - gap analysis: makes/models prevalent in the market but missing from
//    your inventory. Ranked by demand score, capped at 10.
function buildLiveResult(raw: any): ConquestData {
  const myInv = raw?.myInventory ?? null;
  const marketInv = raw?.marketInventory ?? null;
  const demand = raw?.demand ?? null;
  const rawCompetitors: Array<{ dealerId: string; inv: any }> = raw?.competitors ?? [];

  // ── Your inventory ──────────────────────────────────────────────────
  const myMakeCounts = facetMap(myInv?.facets?.make);
  const myModelFacet: Array<{ item: string; count: number }> = myInv?.facets?.model ?? [];
  const myTotalUnits = myInv?.num_found ?? 0;

  // The API returns model facets as a flat list without the make — we infer
  // the make by scanning the make facet for whichever make has a count ≥
  // this model's count (a reasonable heuristic for franchise-heavy dealers).
  const yourMakeModel: MakeModelCount[] = myModelFacet.slice(0, 15).map((m) => ({
    make: attributeMake(m.item, myMakeCounts),
    model: m.item,
    count: m.count,
  }));

  // ── Market stats ────────────────────────────────────────────────────
  const marketMakeCounts = facetMap(marketInv?.facets?.make);
  const marketModelFacet: Array<{ item: string; count: number }> = marketInv?.facets?.model ?? [];
  const totalMarketListings = marketInv?.num_found ?? 0;
  const priceStats = marketInv?.stats?.price ?? {};
  const domStats = marketInv?.stats?.dom ?? marketInv?.stats?.days_on_market ?? {};
  const avgPrice = Number(priceStats.mean ?? priceStats.avg ?? 0);
  const avgDom = Math.round(Number(domStats.mean ?? domStats.avg ?? 0));

  // ── Demand source ───────────────────────────────────────────────────
  // Prefer Enterprise sold-summary rankings when available, else fall back
  // to market-listing counts as a demand proxy.
  const demandRanks: Array<{ make: string; model: string; score: number }> = [];
  const soldData: any[] = demand?.data ?? demand?.rankings ?? demand ?? [];
  if (Array.isArray(soldData) && soldData.length > 0 && soldData[0]?.sold_count != null) {
    for (const row of soldData) {
      demandRanks.push({
        make: row.make ?? row.dimension_make ?? "",
        model: row.model ?? row.dimension_model ?? "",
        score: Number(row.sold_count ?? row.ranking_value ?? 0),
      });
    }
  } else {
    // Fallback: use market listing counts as a demand proxy.
    for (const m of marketModelFacet.slice(0, 30)) {
      demandRanks.push({
        make: attributeMake(m.item, marketMakeCounts),
        model: m.item,
        score: m.count,
      });
    }
  }

  // ── Gap analysis: what the market stocks that you don't ─────────────
  const yourModelSet = new Set(yourMakeModel.map((m) => `${m.make}|${m.model}`));
  const gapAnalysis: GapModel[] = demandRanks
    .filter((d) => d.make && d.model && !yourModelSet.has(`${d.make}|${d.model}`))
    .slice(0, 10)
    .map((d) => ({
      make: d.make,
      model: d.model,
      demandScore: Math.round(d.score),
      avgMarketPrice: avgPrice > 0 ? avgPrice : 30000,
      potentialVolume: Math.max(1, Math.round(d.score / Math.max(1, demandRanks[0]?.score || 1) * 8)),
    }));

  // ── Competitors ─────────────────────────────────────────────────────
  const competitors: CompetitorDetail[] = rawCompetitors
    .filter((c) => c.inv)
    .map((c) => {
      const inv = c.inv;
      const makeFacet: Array<{ item: string; count: number }> = inv?.facets?.make ?? [];
      const modelFacet: Array<{ item: string; count: number }> = inv?.facets?.model ?? [];
      return {
        dealerId: c.dealerId,
        // The API doesn't return the dealer's display name when querying by
        // dealer_id alone, so we fall back to showing the ID. This is a known
        // tier limitation called out in the PR description.
        dealerName: `Dealer ${c.dealerId}`,
        totalUnits: inv?.num_found ?? 0,
        topMakes: makeFacet.slice(0, 5).map((f) => ({ make: f.item, count: f.count })),
        topModels: modelFacet.slice(0, 6).map((f) => ({ model: f.item, count: f.count })),
      };
    });

  // ── Market share comparison (top 5 makes by market volume) ──────────
  const yourTotal = myTotalUnits || yourMakeModel.reduce((s, m) => s + m.count, 0);
  const marketShareComparison: MarketShareEntry[] = (marketInv?.facets?.make ?? [])
    .slice(0, 5)
    .map((f: any) => {
      const make = f.item as string;
      const marketCount = Number(f.count);
      const yourCount = Number(myMakeCounts[make] ?? 0);
      return {
        make,
        marketCount,
        marketPct: totalMarketListings ? (marketCount / totalMarketListings) * 100 : 0,
        yourCount,
        yourPct: yourTotal ? (yourCount / yourTotal) * 100 : 0,
      };
    });

  return {
    yourInventory: {
      totalUnits: yourTotal,
      makeModelBreakdown: yourMakeModel,
    },
    competitors,
    gapAnalysis,
    acquisitionRecommendations: gapAnalysis,
    marketShareComparison,
    marketStats: {
      totalMarketListings,
      avgPrice,
      avgDom,
    },
  };
}

function facetMap(facet: Array<{ item: string; count: number }> | undefined): Record<string, number> {
  const m: Record<string, number> = {};
  for (const f of facet ?? []) m[f.item] = f.count;
  return m;
}

// Returns the dominant make from a make-facet map (the make with the highest
// listing count).
function dominantMake(makes: Record<string, number>): string | null {
  const makeList = Object.keys(makes).sort((a, b) => makes[b] - makes[a]);
  return makeList[0] ?? null;
}

// The active-search API returns `model` facets as a flat list without the
// parent make, and on the free tier we can't page through enough raw listings
// to rebuild the mapping. This static table covers the most common US models
// across mainstream, luxury, and exotic segments — sufficient for the dealers
// and markets this app targets. For anything unknown, attributeMake falls
// back to dominantMake (useful for single-franchise dealers).
const MODEL_TO_MAKE: Record<string, string> = {
  // Ford
  "F-150": "Ford", "F-250": "Ford", "F-350": "Ford", "Explorer": "Ford",
  "Escape": "Ford", "Mustang": "Ford", "Edge": "Ford", "Bronco": "Ford",
  "Expedition": "Ford", "Ranger": "Ford", "Transit": "Ford", "Fusion": "Ford",
  "Bronco Sport": "Ford", "Maverick": "Ford",
  // Chevrolet
  "Silverado 1500": "Chevrolet", "Silverado 2500": "Chevrolet",
  "Silverado 2500 HD": "Chevrolet", "Equinox": "Chevrolet", "Malibu": "Chevrolet",
  "Traverse": "Chevrolet", "Tahoe": "Chevrolet", "Suburban": "Chevrolet",
  "Corvette": "Chevrolet", "Trax": "Chevrolet", "Trailblazer": "Chevrolet",
  "Colorado": "Chevrolet", "Blazer": "Chevrolet", "Camaro": "Chevrolet",
  // Toyota
  "Camry": "Toyota", "RAV4": "Toyota", "Corolla": "Toyota", "Tacoma": "Toyota",
  "Tundra": "Toyota", "Highlander": "Toyota", "Prius": "Toyota", "4Runner": "Toyota",
  "Sienna": "Toyota", "Avalon": "Toyota", "Grand Highlander": "Toyota",
  "Corolla Cross": "Toyota", "Venza": "Toyota", "Sequoia": "Toyota", "C-HR": "Toyota",
  // Honda
  "CR-V": "Honda", "Accord": "Honda", "Civic": "Honda", "Pilot": "Honda",
  "Odyssey": "Honda", "HR-V": "Honda", "Passport": "Honda", "Ridgeline": "Honda",
  "Insight": "Honda", "Element": "Honda", "Fit": "Honda",
  // Nissan
  "Rogue": "Nissan", "Altima": "Nissan", "Sentra": "Nissan", "Pathfinder": "Nissan",
  "Frontier": "Nissan", "Murano": "Nissan", "Maxima": "Nissan", "Kicks": "Nissan",
  "Versa": "Nissan", "Titan": "Nissan", "Armada": "Nissan", "Leaf": "Nissan",
  "Ariya": "Nissan",
  // Jeep / RAM
  "Compass": "Jeep", "Grand Cherokee": "Jeep", "Wrangler": "Jeep",
  "Wrangler Unlimited": "Jeep", "Cherokee": "Jeep", "Renegade": "Jeep",
  "Gladiator": "Jeep", "Grand Wagoneer": "Jeep", "Wagoneer": "Jeep",
  "Ram 1500 Pickup": "RAM", "Ram 2500 Pickup": "RAM", "Ram 3500 Pickup": "RAM",
  "Ram 3500 Chassis Cab": "RAM", "Ram ProMaster": "RAM",
  // KIA / Hyundai
  "Soul": "KIA", "Sportage": "KIA", "K4": "KIA", "Telluride": "KIA",
  "Forte": "KIA", "Sorento": "KIA", "Seltos": "KIA", "Carnival": "KIA",
  "K5": "KIA", "EV6": "KIA", "Niro": "KIA",
  "Tucson": "Hyundai", "Elantra": "Hyundai", "Santa Fe": "Hyundai",
  "Sonata": "Hyundai", "Kona": "Hyundai", "Palisade": "Hyundai", "Venue": "Hyundai",
  "IONIQ 5": "Hyundai", "IONIQ 6": "Hyundai", "Santa Cruz": "Hyundai",
  // Subaru / Mazda / VW
  "Outback": "Subaru", "Forester": "Subaru", "Crosstrek": "Subaru",
  "Impreza": "Subaru", "WRX": "Subaru", "Ascent": "Subaru", "Legacy": "Subaru",
  "CX-5": "Mazda", "CX-30": "Mazda", "CX-50": "Mazda", "CX-90": "Mazda",
  "Mazda3": "Mazda", "Mazda6": "Mazda", "MX-5 Miata": "Mazda",
  "Tiguan": "Volkswagen", "Jetta": "Volkswagen", "Atlas": "Volkswagen",
  "Taos": "Volkswagen", "ID.4": "Volkswagen", "Golf GTI": "Volkswagen",
  "Passat": "Volkswagen", "Arteon": "Volkswagen",
  // Luxury — German
  "3 Series": "BMW", "5 Series": "BMW", "7 Series": "BMW", "X1": "BMW",
  "X3": "BMW", "X5": "BMW", "X7": "BMW", "4 Series": "BMW", "iX": "BMW",
  "M3": "BMW", "M5": "BMW", "Z4": "BMW", "8 Series": "BMW", "2 Series": "BMW",
  "C-Class": "Mercedes-Benz", "E-Class": "Mercedes-Benz", "S-Class": "Mercedes-Benz",
  "G-Class": "Mercedes-Benz", "GLC": "Mercedes-Benz", "GLE": "Mercedes-Benz",
  "GLS": "Mercedes-Benz", "GLA": "Mercedes-Benz", "GLB": "Mercedes-Benz",
  "CLA": "Mercedes-Benz", "A-Class": "Mercedes-Benz", "EQS": "Mercedes-Benz",
  "EQE": "Mercedes-Benz", "AMG GT": "Mercedes-Benz",
  "A4": "Audi", "A5": "Audi", "New A5": "Audi", "A6": "Audi", "A8": "Audi",
  "Q3": "Audi", "Q5": "Audi", "Q7": "Audi", "Q8": "Audi",
  "e-tron": "Audi", "RS5": "Audi", "S5": "Audi",
  // Luxury — Japanese
  "RX 350": "Lexus", "NX": "Lexus", "GX": "Lexus", "LX": "Lexus",
  "IS": "Lexus", "ES": "Lexus", "LS": "Lexus", "RC": "Lexus", "LC": "Lexus",
  "MDX": "Acura", "RDX": "Acura", "TLX": "Acura", "Integra": "Acura",
  // Luxury — British / ultra
  "Bentayga": "Bentley", "Continental": "Bentley", "Continental GT": "Bentley",
  "Continental GTC": "Bentley", "Flying Spur": "Bentley", "Mulsanne": "Bentley",
  "Cullinan": "Rolls-Royce", "Ghost": "Rolls-Royce", "Phantom": "Rolls-Royce",
  "Dawn": "Rolls-Royce", "Wraith": "Rolls-Royce", "Spectre": "Rolls-Royce",
  // Luxury — sports / exotic
  "911": "Porsche", "Cayenne": "Porsche", "Taycan": "Porsche", "Panamera": "Porsche",
  "Macan": "Porsche", "Cayman": "Porsche", "Boxster": "Porsche", "718 Cayman": "Porsche",
  "Aventador": "Lamborghini", "Huracan": "Lamborghini", "Urus": "Lamborghini",
  "Revuelto": "Lamborghini",
  "F8": "Ferrari", "488": "Ferrari", "Roma": "Ferrari", "Portofino": "Ferrari",
  "SF90": "Ferrari", "812": "Ferrari", "296": "Ferrari",
  "720S": "McLaren", "570S": "McLaren", "GT": "McLaren", "Artura": "McLaren",
  // EV / Tesla
  "Model S": "Tesla", "Model 3": "Tesla", "Model X": "Tesla", "Model Y": "Tesla",
  "Cybertruck": "Tesla",
  // Volvo / Polestar
  "XC90": "Volvo", "XC60": "Volvo", "XC40": "Volvo", "S60": "Volvo", "S90": "Volvo",
  "V60": "Volvo", "V90": "Volvo", "EX30": "Volvo", "EX90": "Volvo",
  "Polestar 2": "Polestar", "Polestar 3": "Polestar",
  // Cadillac / Buick / GMC / Lincoln
  "Escalade": "Cadillac", "XT5": "Cadillac", "XT6": "Cadillac", "CT5": "Cadillac",
  "CT4": "Cadillac", "Lyriq": "Cadillac",
  "Encore GX": "Buick", "Enclave": "Buick", "Envision": "Buick",
  "Sierra 1500": "GMC", "Sierra 2500": "GMC", "Yukon": "GMC", "Acadia": "GMC",
  "Terrain": "GMC", "Canyon": "GMC",
  "Navigator": "Lincoln", "Aviator": "Lincoln", "Corsair": "Lincoln",
  "Nautilus": "Lincoln",
};

// Attributes a model string to a make using the static lookup first, then
// falls back to the dominant make in the current result set (useful for
// single-franchise dealers where the fallback is usually correct).
function attributeMake(model: string, makes: Record<string, number>): string {
  return MODEL_TO_MAKE[model] ?? dominantMake(makes) ?? "Unknown";
}

// ── Formatters ─────────────────────────────────────────────────────────
function fmtCurrency(v: number): string {
  return "$" + Math.round(v).toLocaleString();
}
function fmtPct(v: number): string {
  return v.toFixed(1) + "%";
}
function fmtNum(v: number): string {
  return Math.round(v).toLocaleString();
}

// ── State ──────────────────────────────────────────────────────────────
let currentData: ConquestData | null = null;

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  document.body.style.cssText =
    "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;overflow-x:hidden;";

  renderInputForm();

  // Auto-submit in two cases:
  //  1. Demo mode (no key) — so gallery visitors immediately see a fully
  //     populated dashboard with the yellow banner still accessible via "New
  //     Search".
  //  2. Live mode with a deep-link dealer_id URL param — so shareable URLs
  //     like ?api_key=...&dealer_id=1009280&zip=78216 auto-analyze on load.
  // Otherwise: leave the input form so live users supply their own dealer_id.
  const mode = _detectAppMode();
  const params = _getUrlParams();
  const hasDeepLink = !!params.dealer_id;
  if (mode === "demo") {
    currentData = generateMockData();
    renderDashboard(currentData);
  } else if (hasDeepLink) {
    await handleAnalyze();
  }
}

// ── Input Form ─────────────────────────────────────────────────────────
function renderInputForm() {
  document.body.innerHTML = "";

  const header = el("div", {
    style: "background:#1e293b;padding:12px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:12px;",
  });
  header.innerHTML = `<h1 style="margin:0;font-size:16px;font-weight:600;color:#f8fafc;">Dealer Conquest Analyzer</h1>
    <span style="font-size:12px;color:#64748b;">Competitive Gap Analysis</span>`;
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

  const content = el("div", { style: "padding:24px 20px;max-width:700px;margin:0 auto;" });
  document.body.appendChild(content);

  // Description
  const descPanel = el("div", {
    style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:20px;",
  });
  descPanel.innerHTML = `
    <div style="font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:8px;">Find Your Conquest Opportunities</div>
    <div style="font-size:13px;color:#94a3b8;line-height:1.6;">
      Analyse your inventory against nearby competitors to find which models you should be stocking.
      This tool scans competitor inventory mix, identifies gaps in your lineup, and ranks acquisition
      recommendations by local demand data.
    </div>
  `;
  content.appendChild(descPanel);

  // Form
  const formPanel = el("div", {
    style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:20px;margin-bottom:16px;",
  });

  // Dealer ID
  const dealerLabel = el("label", { style: "font-size:12px;color:#94a3b8;display:block;margin-bottom:4px;" });
  dealerLabel.textContent = "Your Dealer ID";
  formPanel.appendChild(dealerLabel);

  const dealerInput = document.createElement("input");
  dealerInput.id = "dealer-id-input";
  dealerInput.type = "text";
  dealerInput.placeholder = "MarketCheck dealer ID (numeric)";
  dealerInput.value = _getUrlParams().dealer_id ?? "1009280";
  dealerInput.style.cssText = "width:100%;padding:10px 12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;margin-bottom:14px;box-sizing:border-box;";
  formPanel.appendChild(dealerInput);

  // ZIP
  const zipLabel = el("label", { style: "font-size:12px;color:#94a3b8;display:block;margin-bottom:4px;" });
  zipLabel.textContent = "ZIP Code";
  formPanel.appendChild(zipLabel);

  const zipInput = document.createElement("input");
  zipInput.id = "zip-input";
  zipInput.type = "text";
  zipInput.placeholder = "e.g. 78216";
  zipInput.value = _getUrlParams().zip ?? "78216";
  zipInput.style.cssText = "width:100%;padding:10px 12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;margin-bottom:14px;box-sizing:border-box;";
  formPanel.appendChild(zipInput);

  // Radius select
  const radiusLabel = el("label", { style: "font-size:12px;color:#94a3b8;display:block;margin-bottom:4px;" });
  radiusLabel.textContent = "Search Radius";
  formPanel.appendChild(radiusLabel);

  const radiusSelect = document.createElement("select");
  radiusSelect.id = "radius-input";
  radiusSelect.style.cssText = "width:100%;padding:10px 12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;margin-bottom:14px;box-sizing:border-box;";
  for (const r of [25, 50, 100]) {
    const opt = document.createElement("option");
    opt.value = String(r);
    opt.textContent = `${r} miles`;
    if (r === 50) opt.selected = true;
    radiusSelect.appendChild(opt);
  }
  formPanel.appendChild(radiusSelect);

  // Buttons
  const buttonRow = el("div", { style: "display:flex;gap:12px;margin-top:8px;" });

  const analyzeBtn = document.createElement("button");
  analyzeBtn.textContent = "Analyze Competitors";
  analyzeBtn.style.cssText = "padding:10px 24px;border-radius:6px;border:none;background:#3b82f6;color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;";
  analyzeBtn.addEventListener("click", () => handleAnalyze());
  buttonRow.appendChild(analyzeBtn);

  const demoBtn = document.createElement("button");
  demoBtn.textContent = "Load Demo Data";
  demoBtn.style.cssText = "padding:10px 24px;border-radius:6px;border:1px solid #334155;background:transparent;color:#94a3b8;font-size:14px;cursor:pointer;font-family:inherit;";
  demoBtn.addEventListener("click", () => {
    currentData = generateMockData();
    renderDashboard(currentData);
  });
  buttonRow.appendChild(demoBtn);

  formPanel.appendChild(buttonRow);
  content.appendChild(formPanel);
}

// ── Handle Analyze ─────────────────────────────────────────────────────
async function handleAnalyze() {
  const dealerInput = document.getElementById("dealer-id-input") as HTMLInputElement;
  const zipInput = document.getElementById("zip-input") as HTMLInputElement;
  const radiusSelect = document.getElementById("radius-input") as HTMLSelectElement;

  const dealerId = dealerInput?.value?.trim() || "";
  const zip = zipInput?.value?.trim() || "80202";
  const radius = parseInt(radiusSelect?.value || "50", 10);

  // Show loading
  document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#94a3b8;">
    <div style="width:20px;height:20px;border:2px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:12px;"></div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    Scanning competitor inventory within ${radius} miles of ${zip}...
  </div>`;

  // Infer state from URL param or default — MarketCheck sold-summary needs a state
  const stateCode = (_getUrlParams().state || "TX").toUpperCase();

  try {
    const result = await _callTool("analyze-dealer-conquest", {
      dealer_id: dealerId,
      zip,
      radius,
      state: stateCode,
    });
    const text = result?.content?.find((c: any) => c.type === "text")?.text;
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed.yourInventory) {
        // Future composite shape — already transformed server-side.
        currentData = parsed as ConquestData;
      } else if (parsed.myInventory || parsed.marketInventory) {
        // Raw direct/proxy shape — transform client-side.
        currentData = buildLiveResult(parsed);
      } else {
        currentData = generateMockData();
      }
    } else {
      currentData = generateMockData();
    }
  } catch {
    currentData = generateMockData();
  }

  renderDashboard(currentData);
}

// ── Render Dashboard ───────────────────────────────────────────────────
function renderDashboard(data: ConquestData) {
  document.body.innerHTML = "";

  // Header
  const header = el("div", {
    style: "background:#1e293b;padding:12px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:12px;",
  });
  header.innerHTML = `<h1 style="margin:0;font-size:16px;font-weight:600;color:#f8fafc;">Dealer Conquest Analyzer</h1>
    <span style="font-size:12px;color:#64748b;">${fmtNum(data.marketStats.totalMarketListings)} vehicles in market</span>`;

  const backBtn = document.createElement("button");
  backBtn.textContent = "New Search";
  backBtn.style.cssText = "margin-left:auto;padding:6px 14px;border-radius:6px;border:1px solid #334155;background:transparent;color:#94a3b8;font-size:12px;cursor:pointer;font-family:inherit;";
  backBtn.addEventListener("click", () => renderInputForm());
  header.appendChild(backBtn);

  _addSettingsBar(header);
  document.body.appendChild(header);

  // Demo-mode banner stays visible on the dashboard so the gallery visitor
  // always has a clear "activate live data" affordance.
  if (_detectAppMode() === "demo") {
    const _db = document.createElement("div");
    _db.style.cssText = "background:linear-gradient(135deg,#92400e22,#f59e0b11);border:1px solid #f59e0b44;border-radius:10px;padding:14px 20px;margin:12px 20px 0;display:flex;align-items:center;gap:14px;flex-wrap:wrap;";
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

  const content = el("div", { style: "padding:16px 20px;" });
  document.body.appendChild(content);

  // ── KPI Summary ──────────────────────────────────────────────────
  const kpiRibbon = el("div", {
    style: "display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;margin-bottom:16px;flex-wrap:wrap;",
  });

  const kpiCards = [
    { label: "Your Units", value: fmtNum(data.yourInventory.totalUnits), trend: "on the lot", color: "#60a5fa" },
    { label: "Market Listings", value: fmtNum(data.marketStats.totalMarketListings), trend: "in search area", color: "#94a3b8" },
    { label: "Competitors Scanned", value: String(data.competitors.length), trend: "nearby dealers", color: "#f59e0b" },
    { label: "Gap Models Found", value: String(data.gapAnalysis.length), trend: "conquest opportunities", color: "#10b981" },
    { label: "Avg Market Price", value: fmtCurrency(data.marketStats.avgPrice), trend: "local market", color: "#94a3b8" },
    { label: "Avg DOM", value: `${data.marketStats.avgDom}d`, trend: data.marketStats.avgDom < 30 ? "fast market" : "normal", color: data.marketStats.avgDom < 30 ? "#10b981" : "#f59e0b" },
  ];

  for (const k of kpiCards) {
    const card = el("div", {
      style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px 16px;min-width:140px;flex:1;",
    });
    card.innerHTML = `
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">${k.label}</div>
      <div style="font-size:22px;font-weight:700;color:#f8fafc;margin-top:4px;">${k.value}</div>
      <div style="font-size:12px;color:${k.color};margin-top:2px;">${k.trend}</div>
    `;
    kpiRibbon.appendChild(card);
  }
  content.appendChild(kpiRibbon);

  // ── Two-column layout: Your Inventory + Competitor Scan ──────────
  const topRow = el("div", {
    style: "display:flex;gap:16px;margin-bottom:20px;align-items:flex-start;",
  });
  content.appendChild(topRow);

  // ── Your Inventory Summary ───────────────────────────────────────
  const yourSection = el("div", { style: "flex:1;min-width:280px;" });
  topRow.appendChild(yourSection);

  const yourTitle = el("h2", {
    style: "font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:10px;",
  });
  yourTitle.textContent = "Your Inventory Summary";
  yourSection.appendChild(yourTitle);

  const yourPanel = el("div", {
    style: "background:#1e293b;border:1px solid #334155;border-radius:8px;overflow:hidden;",
  });

  const yourTable = el("table", {
    style: "width:100%;border-collapse:collapse;font-size:12px;",
  });
  const yourThead = document.createElement("thead");
  const yourHeadRow = document.createElement("tr");
  for (const h of ["Make", "Model", "Count"]) {
    const th = document.createElement("th");
    th.style.cssText = "padding:8px 12px;text-align:left;background:#0f172a;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;";
    th.textContent = h;
    yourHeadRow.appendChild(th);
  }
  yourThead.appendChild(yourHeadRow);
  yourTable.appendChild(yourThead);

  const yourTbody = document.createElement("tbody");
  for (let i = 0; i < data.yourInventory.makeModelBreakdown.length; i++) {
    const m = data.yourInventory.makeModelBreakdown[i];
    const tr = document.createElement("tr");
    const rowBg = i % 2 === 0 ? "transparent" : "rgba(15,23,42,0.5)";
    tr.style.cssText = `border-bottom:1px solid #1e293b;background:${rowBg};`;

    const pct = data.yourInventory.totalUnits > 0 ? (m.count / data.yourInventory.totalUnits * 100) : 0;

    const cells = [
      `<span style="color:#f8fafc;font-weight:600;">${m.make}</span>`,
      `<span style="color:#e2e8f0;">${m.model}</span>`,
      `<div style="display:flex;align-items:center;gap:8px;">
        <span style="color:#e2e8f0;font-weight:600;">${m.count}</span>
        <div style="flex:1;height:4px;background:#0f172a;border-radius:2px;min-width:40px;">
          <div style="height:100%;width:${pct}%;background:#3b82f6;border-radius:2px;"></div>
        </div>
        <span style="font-size:10px;color:#64748b;">${fmtPct(pct)}</span>
      </div>`,
    ];

    for (const cellHtml of cells) {
      const td = document.createElement("td");
      td.style.cssText = "padding:8px 12px;";
      td.innerHTML = cellHtml;
      tr.appendChild(td);
    }
    yourTbody.appendChild(tr);
  }
  yourTable.appendChild(yourTbody);
  yourPanel.appendChild(yourTable);
  yourSection.appendChild(yourPanel);

  // ── Competitor Inventory Scan ────────────────────────────────────
  const compSection = el("div", { style: "flex:2;min-width:400px;" });
  topRow.appendChild(compSection);

  const compTitle = el("h2", {
    style: "font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:10px;",
  });
  compTitle.textContent = "Competitor Inventory Scan";
  compSection.appendChild(compTitle);

  const compGrid = el("div", {
    style: "display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;",
  });

  for (const comp of data.competitors) {
    const card = el("div", {
      style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:14px;",
    });

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div>
          <div style="font-size:13px;font-weight:600;color:#f8fafc;">${comp.dealerName}</div>
          <div style="font-size:10px;color:#64748b;">${comp.dealerId}</div>
        </div>
        <span style="font-size:18px;font-weight:700;color:#f8fafc;">${comp.totalUnits}</span>
      </div>
    `;

    // Top makes chips
    const makesRow = el("div", {
      style: "display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;",
    });
    for (const m of comp.topMakes.slice(0, 4)) {
      const chip = el("span", {
        style: "padding:2px 8px;border-radius:10px;font-size:10px;background:#0f172a;color:#94a3b8;border:1px solid #334155;",
      });
      chip.textContent = `${m.make} (${m.count})`;
      makesRow.appendChild(chip);
    }
    card.appendChild(makesRow);

    // Top models
    const modelsRow = el("div", { style: "font-size:11px;color:#64748b;" });
    modelsRow.innerHTML = `Top: ${comp.topModels.slice(0, 4).map(m => `<span style="color:#e2e8f0;">${m.model}</span> (${m.count})`).join(", ")}`;
    card.appendChild(modelsRow);

    compGrid.appendChild(card);
  }
  compSection.appendChild(compGrid);

  // ── Gap Analysis Table ───────────────────────────────────────────
  const gapTitle = el("h2", {
    style: "font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:12px;margin-top:8px;",
  });
  gapTitle.textContent = "Gap Analysis: Models You Should Be Stocking";
  content.appendChild(gapTitle);

  const gapDesc = el("div", {
    style: "font-size:12px;color:#94a3b8;margin-bottom:12px;",
  });
  gapDesc.textContent = "Models that competitors stock and sell well in your market, but you currently lack. Ranked by local demand.";
  content.appendChild(gapDesc);

  renderGapTable(content, data.gapAnalysis);

  // ── Canvas Bar Chart: Your Mix vs Market Demand ──────────────────
  const chartTitle = el("h2", {
    style: "font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:12px;margin-top:8px;",
  });
  chartTitle.textContent = "Inventory Mix vs Market Demand";
  content.appendChild(chartTitle);

  const chartContainer = el("div", {
    style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:20px;margin-bottom:20px;overflow-x:auto;",
  });

  const canvas = document.createElement("canvas");
  canvas.width = 700;
  canvas.height = 350;
  canvas.style.cssText = "width:700px;height:350px;max-width:100%;";
  chartContainer.appendChild(canvas);
  content.appendChild(chartContainer);

  drawMixChart(canvas, data.marketShareComparison);

  // ── Acquisition Recommendations ──────────────────────────────────
  const recTitle = el("h2", {
    style: "font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:12px;",
  });
  recTitle.textContent = "Acquisition Recommendations";
  content.appendChild(recTitle);

  renderRecommendations(content, data.acquisitionRecommendations);

  // ── Market Share Comparison ──────────────────────────────────────
  const shareTitle = el("h2", {
    style: "font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:12px;margin-top:8px;",
  });
  shareTitle.textContent = "Market Share Comparison";
  content.appendChild(shareTitle);

  renderMarketShare(content, data.marketShareComparison, data.yourInventory.totalUnits);
}

// ── Gap Analysis Table ─────────────────────────────────────────────────
function renderGapTable(container: HTMLElement, gaps: GapModel[]) {
  const tableWrapper = el("div", {
    style: "overflow-x:auto;border:1px solid #334155;border-radius:8px;margin-bottom:20px;",
  });

  const table = el("table", {
    style: "width:100%;border-collapse:collapse;font-size:12px;",
  });

  const headers = ["Rank", "Make", "Model", "Demand Score", "Avg Market Price", "Suggested Volume", "Priority"];
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const h of headers) {
    const th = document.createElement("th");
    th.style.cssText = "padding:10px 12px;text-align:left;background:#1e293b;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;";
    th.textContent = h;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const maxDemand = gaps.length > 0 ? gaps[0].demandScore : 1;

  for (let i = 0; i < gaps.length; i++) {
    const g = gaps[i];
    const tr = document.createElement("tr");
    const rowBg = i % 2 === 0 ? "transparent" : "rgba(30,41,59,0.5)";
    tr.style.cssText = `border-bottom:1px solid #1e293b;background:${rowBg};`;
    tr.addEventListener("mouseenter", () => { tr.style.background = "#1e293b"; });
    tr.addEventListener("mouseleave", () => { tr.style.background = rowBg; });

    const priority = i < 3 ? "HIGH" : i < 7 ? "MEDIUM" : "LOW";
    const priorityColor = i < 3 ? "#10b981" : i < 7 ? "#f59e0b" : "#94a3b8";
    const priorityBg = i < 3 ? "#10b98122" : i < 7 ? "#f59e0b22" : "#94a3b822";

    const demandPct = (g.demandScore / maxDemand * 100);

    const cells = [
      `<span style="color:#64748b;font-weight:600;">#${i + 1}</span>`,
      `<span style="color:#f8fafc;font-weight:600;">${g.make}</span>`,
      `<span style="color:#e2e8f0;">${g.model}</span>`,
      `<div style="display:flex;align-items:center;gap:8px;">
        <span style="color:#e2e8f0;font-weight:600;">${fmtNum(g.demandScore)}</span>
        <div style="flex:1;height:4px;background:#0f172a;border-radius:2px;min-width:60px;">
          <div style="height:100%;width:${demandPct}%;background:#3b82f6;border-radius:2px;"></div>
        </div>
      </div>`,
      `<span style="color:#e2e8f0;">${fmtCurrency(g.avgMarketPrice)}</span>`,
      `<span style="color:#e2e8f0;font-weight:600;">${g.potentialVolume} units</span>`,
      `<span style="padding:3px 8px;border-radius:8px;font-size:10px;font-weight:700;background:${priorityBg};color:${priorityColor};border:1px solid ${priorityColor}33;">${priority}</span>`,
    ];

    for (const cellHtml of cells) {
      const td = document.createElement("td");
      td.style.cssText = "padding:10px 12px;white-space:nowrap;";
      td.innerHTML = cellHtml;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  container.appendChild(tableWrapper);
}

// ── Mix Chart ──────────────────────────────────────────────────────────
function drawMixChart(canvas: HTMLCanvasElement, shares: MarketShareEntry[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width;
  const h = canvas.height;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, w, h);

  const padLeft = 60;
  const padRight = 20;
  const padTop = 30;
  const padBottom = 60;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  const maxPct = Math.max(...shares.map(s => Math.max(s.marketPct, s.yourPct)), 20);

  // Grid
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 0.5;
  ctx.fillStyle = "#64748b";
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textAlign = "right";

  const gridSteps = 5;
  for (let i = 0; i <= gridSteps; i++) {
    const y = padTop + (chartH / gridSteps) * i;
    const val = maxPct - (maxPct / gridSteps) * i;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + chartW, y);
    ctx.stroke();
    ctx.fillText(fmtPct(val), padLeft - 8, y + 4);
  }

  // Bars
  const groupWidth = chartW / shares.length;
  const barWidth = Math.min(30, groupWidth * 0.3);

  for (let i = 0; i < shares.length; i++) {
    const s = shares[i];
    const centerX = padLeft + groupWidth * i + groupWidth / 2;

    // Market share bar (blue)
    const mH = (s.marketPct / maxPct) * chartH;
    const mY = padTop + chartH - mH;
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.roundRect(centerX - barWidth - 2, mY, barWidth, mH, [3, 3, 0, 0]);
    ctx.fill();

    // Your share bar (green/amber)
    const yH = (s.yourPct / maxPct) * chartH;
    const yY = padTop + chartH - yH;

    // Color based on over/under-indexed
    const isOverIndexed = s.yourPct > s.marketPct * 1.5;
    const isUnderIndexed = s.yourPct < s.marketPct * 0.5;
    ctx.fillStyle = isOverIndexed ? "#f59e0b" : isUnderIndexed ? "#ef4444" : "#10b981";
    ctx.beginPath();
    ctx.roundRect(centerX + 2, yY, barWidth, yH, [3, 3, 0, 0]);
    ctx.fill();

    // Value labels
    ctx.font = "bold 10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#3b82f6";
    ctx.fillText(fmtPct(s.marketPct), centerX - barWidth / 2 - 2, mY - 6);

    ctx.fillStyle = isOverIndexed ? "#f59e0b" : isUnderIndexed ? "#ef4444" : "#10b981";
    if (s.yourPct > 0) {
      ctx.fillText(fmtPct(s.yourPct), centerX + barWidth / 2 + 2, yY - 6);
    }

    // Over/under badge
    if (isOverIndexed) {
      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 9px -apple-system, sans-serif";
      ctx.fillText("OVER", centerX, yY - 18);
    } else if (isUnderIndexed && s.marketPct > 5) {
      ctx.fillStyle = "#ef4444";
      ctx.font = "bold 9px -apple-system, sans-serif";
      ctx.fillText("UNDER", centerX, Math.min(yY, mY) - 18);
    }

    // Make label
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "12px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(s.make, centerX, padTop + chartH + 18);

    // Count label
    ctx.fillStyle = "#64748b";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.fillText(`${s.yourCount} vs ${s.marketCount}`, centerX, padTop + chartH + 34);
  }

  // Legend
  const legendY = 14;
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textAlign = "left";

  ctx.fillStyle = "#3b82f6";
  ctx.fillRect(padLeft, legendY - 8, 12, 12);
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("Market Share %", padLeft + 16, legendY + 2);

  ctx.fillStyle = "#10b981";
  ctx.fillRect(padLeft + 130, legendY - 8, 12, 12);
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("Your Share %", padLeft + 146, legendY + 2);

  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(padLeft + 250, legendY - 8, 12, 12);
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("Over-indexed", padLeft + 266, legendY + 2);

  ctx.fillStyle = "#ef4444";
  ctx.fillRect(padLeft + 370, legendY - 8, 12, 12);
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("Under-indexed", padLeft + 386, legendY + 2);
}

// ── Acquisition Recommendations ────────────────────────────────────────
function renderRecommendations(container: HTMLElement, recs: GapModel[]) {
  const grid = el("div", {
    style: "display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-bottom:20px;",
  });

  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    const priority = i < 3 ? "HIGH" : i < 7 ? "MEDIUM" : "LOW";
    const priorityColor = i < 3 ? "#10b981" : i < 7 ? "#f59e0b" : "#94a3b8";
    const borderColor = i < 3 ? "#10b981" : i < 7 ? "#f59e0b" : "#334155";

    const card = el("div", {
      style: `background:#1e293b;border:1px solid ${borderColor};border-radius:8px;padding:16px;`,
    });

    const totalPotentialRevenue = r.avgMarketPrice * r.potentialVolume;

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <div>
          <div style="font-size:14px;font-weight:600;color:#f8fafc;">${r.make} ${r.model}</div>
          <span style="padding:2px 8px;border-radius:8px;font-size:9px;font-weight:700;background:${priorityColor}22;color:${priorityColor};border:1px solid ${priorityColor}33;">${priority} PRIORITY</span>
        </div>
        <span style="font-size:16px;font-weight:700;color:#f8fafc;">#${i + 1}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
        <div style="background:#0f172a;border-radius:4px;padding:8px;text-align:center;">
          <div style="font-size:9px;color:#64748b;text-transform:uppercase;">Demand Score</div>
          <div style="font-size:14px;font-weight:700;color:#3b82f6;">${fmtNum(r.demandScore)}</div>
        </div>
        <div style="background:#0f172a;border-radius:4px;padding:8px;text-align:center;">
          <div style="font-size:9px;color:#64748b;text-transform:uppercase;">Avg Price</div>
          <div style="font-size:14px;font-weight:700;color:#e2e8f0;">${fmtCurrency(r.avgMarketPrice)}</div>
        </div>
        <div style="background:#0f172a;border-radius:4px;padding:8px;text-align:center;">
          <div style="font-size:9px;color:#64748b;text-transform:uppercase;">Volume</div>
          <div style="font-size:14px;font-weight:700;color:#10b981;">${r.potentialVolume}</div>
        </div>
      </div>
      <div style="margin-top:8px;font-size:11px;color:#64748b;">Potential revenue: <span style="color:#10b981;font-weight:600;">${fmtCurrency(totalPotentialRevenue)}</span></div>
    `;

    grid.appendChild(card);
  }
  container.appendChild(grid);
}

// ── Market Share Comparison Table ───────────────────────────────────────
function renderMarketShare(container: HTMLElement, shares: MarketShareEntry[], yourTotal: number) {
  const tableWrapper = el("div", {
    style: "overflow-x:auto;border:1px solid #334155;border-radius:8px;margin-bottom:20px;",
  });

  const table = el("table", {
    style: "width:100%;border-collapse:collapse;font-size:12px;",
  });

  const headers = ["Make", "Market Units", "Market %", "Your Units", "Your %", "Index"];
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const h of headers) {
    const th = document.createElement("th");
    th.style.cssText = "padding:10px 12px;text-align:left;background:#1e293b;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;";
    th.textContent = h;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (let i = 0; i < shares.length; i++) {
    const s = shares[i];
    const tr = document.createElement("tr");
    const rowBg = i % 2 === 0 ? "transparent" : "rgba(30,41,59,0.5)";
    tr.style.cssText = `border-bottom:1px solid #1e293b;background:${rowBg};`;
    tr.addEventListener("mouseenter", () => { tr.style.background = "#1e293b"; });
    tr.addEventListener("mouseleave", () => { tr.style.background = rowBg; });

    // Index = your % / market %
    const index = s.marketPct > 0 ? s.yourPct / s.marketPct : 0;
    let indexColor = "#10b981";
    let indexLabel = "balanced";
    if (index > 2) { indexColor = "#f59e0b"; indexLabel = "over-indexed"; }
    else if (index < 0.3 && s.marketPct > 5) { indexColor = "#ef4444"; indexLabel = "under-indexed"; }
    else if (index === 0 && s.marketPct > 5) { indexColor = "#ef4444"; indexLabel = "missing"; }

    const cells = [
      `<span style="color:#f8fafc;font-weight:600;">${s.make}</span>`,
      `<span style="color:#e2e8f0;">${fmtNum(s.marketCount)}</span>`,
      `<span style="color:#3b82f6;">${fmtPct(s.marketPct)}</span>`,
      `<span style="color:#e2e8f0;font-weight:600;">${fmtNum(s.yourCount)}</span>`,
      `<span style="color:#10b981;">${fmtPct(s.yourPct)}</span>`,
      `<div style="display:flex;align-items:center;gap:6px;">
        <span style="color:${indexColor};font-weight:600;">${index.toFixed(1)}x</span>
        <span style="font-size:10px;color:${indexColor};">${indexLabel}</span>
      </div>`,
    ];

    for (const cellHtml of cells) {
      const td = document.createElement("td");
      td.style.cssText = "padding:10px 12px;white-space:nowrap;";
      td.innerHTML = cellHtml;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  container.appendChild(tableWrapper);

  // Summary insight panel
  const insightPanel = el("div", {
    style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:24px;",
  });

  const missingMakes = shares.filter(s => s.yourCount === 0 && s.marketPct > 5);
  const underIndexed = shares.filter(s => s.yourPct > 0 && s.yourPct < s.marketPct * 0.5 && s.marketPct > 5);
  const totalGapVolume = generateMockData().gapAnalysis.reduce((s, g) => s + g.potentialVolume, 0);
  const totalGapRevenue = generateMockData().gapAnalysis.reduce((s, g) => s + g.avgMarketPrice * g.potentialVolume, 0);

  insightPanel.innerHTML = `
    <div style="font-size:13px;font-weight:600;color:#f8fafc;margin-bottom:10px;">Conquest Insights</div>
    <div style="display:flex;gap:24px;flex-wrap:wrap;">
      <div>
        <div style="font-size:11px;color:#64748b;">Missing Segments</div>
        <div style="font-size:18px;font-weight:700;color:#ef4444;margin-top:2px;">${missingMakes.length}</div>
        <div style="font-size:10px;color:#64748b;">${missingMakes.map(m => m.make).join(", ") || "none"}</div>
      </div>
      <div>
        <div style="font-size:11px;color:#64748b;">Conquest Volume Potential</div>
        <div style="font-size:18px;font-weight:700;color:#10b981;margin-top:2px;">${totalGapVolume} units</div>
        <div style="font-size:10px;color:#64748b;">across all gap models</div>
      </div>
      <div>
        <div style="font-size:11px;color:#64748b;">Revenue Opportunity</div>
        <div style="font-size:18px;font-weight:700;color:#3b82f6;margin-top:2px;">${fmtCurrency(totalGapRevenue)}</div>
        <div style="font-size:10px;color:#64748b;">projected from conquest additions</div>
      </div>
      <div>
        <div style="font-size:11px;color:#64748b;">Under-indexed Makes</div>
        <div style="font-size:18px;font-weight:700;color:#f59e0b;margin-top:2px;">${underIndexed.length}</div>
        <div style="font-size:10px;color:#64748b;">need more inventory</div>
      </div>
    </div>
  `;
  container.appendChild(insightPanel);
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
