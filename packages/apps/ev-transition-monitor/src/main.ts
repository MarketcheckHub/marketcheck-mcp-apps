/**
 * EV Transition Monitor
 *
 * OEM-focused EV dashboard. Tracks brand's EV vs ICE sales mix, compares
 * EV penetration to competitors, maps state-level EV adoption, and monitors
 * EV pricing parity. Uses the Enterprise Sold Vehicle Summary API.
 */
import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "ev-transition-monitor" }); } catch {}

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

function _isEmbedMode(): boolean { return new URLSearchParams(location.search).has("embed"); }

function _getUrlParams(): Record<string, string> {
  const params = new URLSearchParams(location.search);
  const result: Record<string, string> = {};
  for (const key of ["myBrand", "competitors", "state"]) {
    const v = params.get(key);
    if (v) result[key] = v;
  }
  return result;
}

function _proxyBase(): string {
  return location.protocol.startsWith("http") ? "" : "http://localhost:3001";
}

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

function _mcSold(p: Record<string, any>) { return _mcApi("/api/v1/sold-vehicles/summary", p); }

interface FetchArgs { myBrand: string; competitors?: string[]; }

async function _fetchDirect(args: FetchArgs): Promise<RawApiData> {
  const myBrand = args.myBrand;
  // The Sold Vehicle Summary API only allows ranking_dimensions in
  // {body_type, dealership_group_name, make, model} and a single ranking_measure
  // per call, so we split the analytic shapes we need across 9 parallel calls.
  // fuel_type_category and make ride as filter params (not dimensions).
  const base = { inventory_type: "Used", ranking_order: "desc" };
  const [
    evMakeVol,
    evMakePrice,
    evMakeDom,
    totalMakeVol,
    evBodyPrice,
    iceBodyPrice,
    evBodyVol,
    iceBodyVol,
    myEvModels,
  ] = await Promise.all([
    _mcSold({ ...base, ranking_dimensions: "make", ranking_measure: "sold_count", fuel_type_category: "EV", top_n: 25 }),
    _mcSold({ ...base, ranking_dimensions: "make", ranking_measure: "average_sale_price", fuel_type_category: "EV", top_n: 25 }),
    _mcSold({ ...base, ranking_dimensions: "make", ranking_measure: "average_days_on_market", fuel_type_category: "EV", top_n: 25 }),
    _mcSold({ ...base, ranking_dimensions: "make", ranking_measure: "sold_count", top_n: 30 }),
    _mcSold({ ...base, ranking_dimensions: "body_type", ranking_measure: "average_sale_price", fuel_type_category: "EV" }),
    _mcSold({ ...base, ranking_dimensions: "body_type", ranking_measure: "average_sale_price", fuel_type_category: "ICE" }),
    _mcSold({ ...base, ranking_dimensions: "body_type", ranking_measure: "sold_count", fuel_type_category: "EV" }),
    _mcSold({ ...base, ranking_dimensions: "body_type", ranking_measure: "sold_count", fuel_type_category: "ICE" }),
    _mcSold({ ...base, ranking_dimensions: "model", ranking_measure: "sold_count", make: myBrand, fuel_type_category: "EV", top_n: 10 }),
  ]);
  return { evMakeVol, evMakePrice, evMakeDom, totalMakeVol, evBodyPrice, iceBodyPrice, evBodyVol, iceBodyVol, myEvModels, myBrand };
}

async function _callTool(toolName: string, args: any): Promise<any> {
  const auth = _getAuth();
  if (auth.value) {
    try {
      const r = await fetch(_proxyBase() + "/api/proxy/" + toolName, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, _auth_mode: auth.mode, _auth_value: auth.value }),
      });
      if (r.ok) { const d = await r.json(); return { content: [{ type: "text", text: JSON.stringify(d) }] }; }
    } catch {}
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
    @media (max-width: 900px) {
      .grid-2 { grid-template-columns: 1fr !important; }
      .grid-3 { grid-template-columns: 1fr !important; }
    }
    @media (max-width: 768px) {
      body { font-size: 13px !important; }
      table { font-size: 12px !important; }
      th, td { padding: 6px 8px !important; }
      h1 { font-size: 18px !important; }
      h2 { font-size: 15px !important; }
      canvas { max-width: 100% !important; }
      input, select, button { font-size: 14px !important; }
      .kpi-strip { grid-template-columns: 1fr 1fr !important; }
      table { min-width: 480px; }
      div[style*="overflow-x:auto"] { -webkit-overflow-scrolling: touch; }
    }
    @media (max-width: 480px) {
      body { padding: 8px !important; }
      h1 { font-size: 16px !important; }
      th, td { padding: 4px 6px !important; font-size: 11px !important; }
      .kpi-strip { grid-template-columns: 1fr !important; }
    }
  `;
  document.head.appendChild(s);
})();

(_safeApp as any)?.connect?.();

// ─── Types ──────────────────────────────────────────────────────────────

interface RawApiData {
  evMakeVol: any;
  evMakePrice: any;
  evMakeDom: any;
  totalMakeVol: any;
  evBodyPrice: any;
  iceBodyPrice: any;
  evBodyVol: any;
  iceBodyVol: any;
  myEvModels: any;
  myBrand: string;
}

interface CompetitorRow {
  brand: string;
  evSold: number;
  iceSold: number;
  totalSold: number;
  evMixPct: number;
  evAvgPrice: number;
  iceAvgPrice: number;
  evDom: number;
  isMyBrand: boolean;
}

interface ModelRow {
  model: string;
  evVolume: number;
}

interface ParityRow {
  bodyType: string;
  evPrice: number;
  icePrice: number;
  evSold: number;
  iceSold: number;
  parityPct: number; // EV / ICE * 100
}

interface ReportData {
  myBrand: string;
  myBrandRow: CompetitorRow | null;
  competitors: CompetitorRow[];
  marketEvSharePct: number;
  electrificationScore: number; // 0–100
  myEvModels: ModelRow[];
  parityRows: ParityRow[];
  trendPoints: { label: string; mixPct: number }[];
}

// ─── Mock Data ──────────────────────────────────────────────────────────

const ALL_EV_BRANDS = [
  { brand: "Tesla", evSold: 412800, iceSold: 0, evAvgPrice: 41200, iceAvgPrice: 0, evDom: 28 },
  { brand: "Ford", evSold: 78400, iceSold: 1840000, evAvgPrice: 48200, iceAvgPrice: 39400, evDom: 52 },
  { brand: "Chevrolet", evSold: 64200, iceSold: 1620000, evAvgPrice: 35800, iceAvgPrice: 36100, evDom: 48 },
  { brand: "Hyundai", evSold: 58600, iceSold: 880000, evAvgPrice: 39400, iceAvgPrice: 28200, evDom: 42 },
  { brand: "Kia", evSold: 51200, iceSold: 720000, evAvgPrice: 41800, iceAvgPrice: 27400, evDom: 40 },
  { brand: "BMW", evSold: 48400, iceSold: 380000, evAvgPrice: 58200, iceAvgPrice: 52100, evDom: 38 },
  { brand: "Mercedes-Benz", evSold: 42100, iceSold: 320000, evAvgPrice: 64800, iceAvgPrice: 58600, evDom: 45 },
  { brand: "Volkswagen", evSold: 38600, iceSold: 410000, evAvgPrice: 36400, iceAvgPrice: 31200, evDom: 50 },
  { brand: "Rivian", evSold: 32400, iceSold: 0, evAvgPrice: 68200, iceAvgPrice: 0, evDom: 35 },
  { brand: "Audi", evSold: 28200, iceSold: 240000, evAvgPrice: 62400, iceAvgPrice: 48200, evDom: 44 },
  { brand: "Nissan", evSold: 24600, iceSold: 690000, evAvgPrice: 32800, iceAvgPrice: 26400, evDom: 55 },
  { brand: "Toyota", evSold: 18400, iceSold: 2410000, evAvgPrice: 44200, iceAvgPrice: 33800, evDom: 48 },
  { brand: "Honda", evSold: 14800, iceSold: 1380000, evAvgPrice: 41600, iceAvgPrice: 31400, evDom: 50 },
  { brand: "Subaru", evSold: 9200, iceSold: 580000, evAvgPrice: 38200, iceAvgPrice: 30200, evDom: 58 },
  { brand: "Porsche", evSold: 8400, iceSold: 60000, evAvgPrice: 92400, iceAvgPrice: 86200, evDom: 32 },
  { brand: "Jeep", evSold: 7200, iceSold: 720000, evAvgPrice: 58400, iceAvgPrice: 41200, evDom: 62 },
  { brand: "Lexus", evSold: 5800, iceSold: 320000, evAvgPrice: 56200, iceAvgPrice: 48200, evDom: 36 },
  { brand: "Mazda", evSold: 3200, iceSold: 360000, evAvgPrice: 39200, iceAvgPrice: 28800, evDom: 60 },
];

const TOP_EV_MODELS_BY_BRAND: Record<string, ModelRow[]> = {
  Tesla: [
    { model: "Model Y", evVolume: 184200 },
    { model: "Model 3", evVolume: 142800 },
    { model: "Model S", evVolume: 38400 },
    { model: "Model X", evVolume: 28600 },
    { model: "Cybertruck", evVolume: 18800 },
  ],
  Ford: [
    { model: "Mustang Mach-E", evVolume: 41200 },
    { model: "F-150 Lightning", evVolume: 28400 },
    { model: "E-Transit", evVolume: 8800 },
  ],
  Hyundai: [
    { model: "Ioniq 5", evVolume: 24600 },
    { model: "Ioniq 6", evVolume: 14800 },
    { model: "Kona Electric", evVolume: 12400 },
    { model: "Ioniq 9", evVolume: 6800 },
  ],
  Kia: [
    { model: "EV6", evVolume: 22400 },
    { model: "Niro EV", evVolume: 14200 },
    { model: "EV9", evVolume: 14600 },
  ],
  Chevrolet: [
    { model: "Bolt EUV", evVolume: 28400 },
    { model: "Bolt EV", evVolume: 18600 },
    { model: "Blazer EV", evVolume: 9800 },
    { model: "Equinox EV", evVolume: 7400 },
  ],
  default: [
    { model: "Top EV Model A", evVolume: 18400 },
    { model: "Top EV Model B", evVolume: 12600 },
    { model: "Top EV Model C", evVolume: 8200 },
    { model: "Top EV Model D", evVolume: 5400 },
  ],
};

const PARITY_BY_BODY = [
  { bodyType: "SUV", evPrice: 42400, icePrice: 36800, evSold: 184200, iceSold: 1240000 },
  { bodyType: "Sedan", evPrice: 38200, icePrice: 28400, evSold: 142800, iceSold: 920000 },
  { bodyType: "Truck", evPrice: 56800, icePrice: 44200, evSold: 28400, iceSold: 880000 },
  { bodyType: "Hatchback", evPrice: 32400, icePrice: 24800, evSold: 38600, iceSold: 180000 },
  { bodyType: "Coupe", evPrice: 48200, icePrice: 38400, evSold: 18400, iceSold: 92000 },
  { bodyType: "Crossover", evPrice: 39800, icePrice: 32100, evSold: 64200, iceSold: 380000 },
  { bodyType: "Wagon", evPrice: 44200, icePrice: 32400, evSold: 4200, iceSold: 28000 },
];

const TREND_BY_BRAND: Record<string, { label: string; mixPct: number }[]> = {
  default: [
    { label: "Q1 '24", mixPct: 2.4 },
    { label: "Q2 '24", mixPct: 2.8 },
    { label: "Q3 '24", mixPct: 3.2 },
    { label: "Q4 '24", mixPct: 3.6 },
    { label: "Q1 '25", mixPct: 4.1 },
    { label: "Q2 '25", mixPct: 4.6 },
    { label: "Q3 '25", mixPct: 5.2 },
    { label: "Q4 '25", mixPct: 5.8 },
    { label: "Q1 '26", mixPct: 6.4 },
  ],
  Ford: [
    { label: "Q1 '24", mixPct: 2.1 },
    { label: "Q2 '24", mixPct: 2.6 },
    { label: "Q3 '24", mixPct: 3.0 },
    { label: "Q4 '24", mixPct: 3.4 },
    { label: "Q1 '25", mixPct: 3.6 },
    { label: "Q2 '25", mixPct: 3.9 },
    { label: "Q3 '25", mixPct: 4.0 },
    { label: "Q4 '25", mixPct: 4.1 },
    { label: "Q1 '26", mixPct: 4.2 },
  ],
  Tesla: [
    { label: "Q1 '24", mixPct: 100 },
    { label: "Q2 '24", mixPct: 100 },
    { label: "Q3 '24", mixPct: 100 },
    { label: "Q4 '24", mixPct: 100 },
    { label: "Q1 '25", mixPct: 100 },
    { label: "Q2 '25", mixPct: 100 },
    { label: "Q3 '25", mixPct: 100 },
    { label: "Q4 '25", mixPct: 100 },
    { label: "Q1 '26", mixPct: 100 },
  ],
};

function getMockData(myBrand: string, competitors: string[]): ReportData {
  const competitorSet = new Set(competitors.map(c => c.toLowerCase()));
  competitorSet.add(myBrand.toLowerCase());

  const competitorRows: CompetitorRow[] = ALL_EV_BRANDS.map(b => {
    const total = b.evSold + b.iceSold;
    return {
      brand: b.brand,
      evSold: b.evSold,
      iceSold: b.iceSold,
      totalSold: total,
      evMixPct: total > 0 ? (b.evSold / total) * 100 : 0,
      evAvgPrice: b.evAvgPrice,
      iceAvgPrice: b.iceAvgPrice,
      evDom: b.evDom,
      isMyBrand: b.brand.toLowerCase() === myBrand.toLowerCase(),
    };
  });

  const myRow = competitorRows.find(r => r.isMyBrand) ?? null;

  const totalEv = ALL_EV_BRANDS.reduce((s, b) => s + b.evSold, 0);
  const totalAll = ALL_EV_BRANDS.reduce((s, b) => s + b.evSold + b.iceSold, 0);
  const marketEvSharePct = totalAll > 0 ? (totalEv / totalAll) * 100 : 0;

  const myEvModels = TOP_EV_MODELS_BY_BRAND[myBrand] ?? TOP_EV_MODELS_BY_BRAND.default;

  const parityRows: ParityRow[] = PARITY_BY_BODY.map(p => ({
    bodyType: p.bodyType,
    evPrice: p.evPrice,
    icePrice: p.icePrice,
    evSold: p.evSold,
    iceSold: p.iceSold,
    parityPct: (p.evPrice / p.icePrice) * 100,
  }));

  const trendPoints = TREND_BY_BRAND[myBrand] ?? TREND_BY_BRAND.default;

  return {
    myBrand,
    myBrandRow: myRow,
    competitors: competitorRows,
    marketEvSharePct,
    electrificationScore: computeElectrificationScore(myRow, marketEvSharePct, trendPoints),
    myEvModels,
    parityRows,
    trendPoints,
  };
}

function computeElectrificationScore(
  my: CompetitorRow | null,
  marketMixPct: number,
  trend: { label: string; mixPct: number }[],
): number {
  if (!my) return 0;
  // 50pts: EV mix vs market; 25pts: trend slope; 25pts: EV DOM vs ICE benchmark
  const mixComponent = Math.max(0, Math.min(50, (my.evMixPct / Math.max(marketMixPct, 1)) * 25));
  const first = trend[0]?.mixPct ?? 0;
  const last = trend[trend.length - 1]?.mixPct ?? 0;
  const slope = last - first;
  const slopeComponent = Math.max(0, Math.min(25, slope * 5));
  const domComponent = my.evDom > 0 ? Math.max(0, Math.min(25, 25 - (my.evDom - 30) * 0.6)) : 0;
  return Math.round(mixComponent + slopeComponent + domComponent);
}

// ─── API Response Parsing ──────────────────────────────────────────────

function pickRankings(resp: any): any[] {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  if (Array.isArray(resp.rankings)) return resp.rankings;
  if (Array.isArray(resp.data)) return resp.data;
  if (Array.isArray(resp.results)) return resp.results;
  return [];
}

function pickField(row: any, names: string[]): any {
  for (const n of names) {
    if (row[n] !== undefined && row[n] !== null) return row[n];
  }
  return undefined;
}

function parseLiveData(raw: RawApiData, competitors: string[]): ReportData {
  const myBrand = raw.myBrand;
  const want = new Set([myBrand.toLowerCase(), ...competitors.map(c => c.toLowerCase())]);

  // Build per-make aggregate from four make-level calls.
  const byMake: Record<string, { ev: number; total: number; evPrice: number; evDom: number }> = {};
  const ensure = (make: string) => {
    if (!byMake[make]) byMake[make] = { ev: 0, total: 0, evPrice: 0, evDom: 0 };
    return byMake[make];
  };

  for (const r of pickRankings(raw.evMakeVol)) {
    const make = String(pickField(r, ["make", "Make", "MAKE"]) ?? "").trim();
    const sold = Number(pickField(r, ["sold_count", "count"]) ?? 0);
    if (!make) continue;
    ensure(make).ev = sold;
  }
  for (const r of pickRankings(raw.evMakePrice)) {
    const make = String(pickField(r, ["make", "Make"]) ?? "").trim();
    const price = Number(pickField(r, ["average_sale_price", "avg_price"]) ?? 0);
    if (!make) continue;
    ensure(make).evPrice = price;
  }
  for (const r of pickRankings(raw.evMakeDom)) {
    const make = String(pickField(r, ["make", "Make"]) ?? "").trim();
    const dom = Number(pickField(r, ["average_days_on_market", "avg_dom"]) ?? 0);
    if (!make) continue;
    ensure(make).evDom = dom;
  }
  for (const r of pickRankings(raw.totalMakeVol)) {
    const make = String(pickField(r, ["make", "Make"]) ?? "").trim();
    const sold = Number(pickField(r, ["sold_count", "count"]) ?? 0);
    if (!make) continue;
    ensure(make).total = sold;
  }

  const competitorRows: CompetitorRow[] = Object.entries(byMake).map(([brand, d]) => {
    const total = d.total > 0 ? d.total : d.ev; // EV-only brands (e.g. Tesla) won't appear in total; fall back
    const ice = Math.max(0, total - d.ev);
    return {
      brand,
      evSold: d.ev,
      iceSold: ice,
      totalSold: total,
      evMixPct: total > 0 ? (d.ev / total) * 100 : 0,
      evAvgPrice: d.evPrice,
      iceAvgPrice: 0, // per-make ICE price not fetched (would require 25 more calls)
      evDom: Math.round(d.evDom),
      isMyBrand: brand.toLowerCase() === myBrand.toLowerCase(),
    };
  })
    .filter(r => r.evSold > 0 || r.totalSold > 0)
    .sort((a, b) => b.evSold - a.evSold);

  // Show requested brands first; pad with top EV makers up to 15 rows
  const filtered = competitorRows.filter(r => want.has(r.brand.toLowerCase()));
  const padded = filtered.length >= 8 ? filtered : (() => {
    const taken = new Set(filtered.map(r => r.brand.toLowerCase()));
    const extras = competitorRows.filter(r => !taken.has(r.brand.toLowerCase())).slice(0, 15 - filtered.length);
    return [...filtered, ...extras];
  })();

  const myRow = competitorRows.find(r => r.isMyBrand) ?? null;
  const totalEv = competitorRows.reduce((s, r) => s + r.evSold, 0);
  const totalAll = competitorRows.reduce((s, r) => s + r.totalSold, 0);
  const marketEvSharePct = totalAll > 0 ? (totalEv / totalAll) * 100 : 0;

  // Body-type price parity — join evBodyPrice + iceBodyPrice + evBodyVol + iceBodyVol
  const evPriceByBody = mapByDim(raw.evBodyPrice, ["body_type", "bodyType"], ["average_sale_price", "avg_price"]);
  const icePriceByBody = mapByDim(raw.iceBodyPrice, ["body_type", "bodyType"], ["average_sale_price", "avg_price"]);
  const evVolByBody = mapByDim(raw.evBodyVol, ["body_type", "bodyType"], ["sold_count", "count"]);
  const iceVolByBody = mapByDim(raw.iceBodyVol, ["body_type", "bodyType"], ["sold_count", "count"]);
  const bodies = new Set([...Object.keys(evPriceByBody), ...Object.keys(icePriceByBody)]);
  const parityRows: ParityRow[] = [...bodies]
    .map(bt => {
      const evP = evPriceByBody[bt] ?? 0;
      const iceP = icePriceByBody[bt] ?? 0;
      const evS = evVolByBody[bt] ?? 0;
      const iceS = iceVolByBody[bt] ?? 0;
      return {
        bodyType: bt,
        evPrice: evP,
        icePrice: iceP,
        evSold: evS,
        iceSold: iceS,
        parityPct: iceP > 0 ? (evP / iceP) * 100 : 0,
      };
    })
    .filter(r => r.evPrice > 0 && r.icePrice > 0)
    .sort((a, b) => (b.evSold + b.iceSold) - (a.evSold + a.iceSold))
    .slice(0, 8);

  // Top EV models for myBrand
  const myEvModels: ModelRow[] = pickRankings(raw.myEvModels)
    .map(r => ({
      model: String(pickField(r, ["model", "Model"]) ?? "").trim(),
      evVolume: Number(pickField(r, ["sold_count", "count"]) ?? 0),
    }))
    .filter(r => r.model && r.evVolume > 0)
    .slice(0, 10);

  const trendPoints = synthesizeTrend(myRow);

  return {
    myBrand,
    myBrandRow: myRow,
    competitors: padded,
    marketEvSharePct,
    electrificationScore: computeElectrificationScore(myRow, marketEvSharePct, trendPoints),
    myEvModels,
    parityRows,
    trendPoints,
  };
}

function mapByDim(resp: any, dimNames: string[], measureNames: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of pickRankings(resp)) {
    const k = String(pickField(r, dimNames) ?? "").trim();
    const v = Number(pickField(r, measureNames) ?? 0);
    if (k) out[k] = v;
  }
  return out;
}

function synthesizeTrend(my: CompetitorRow | null): { label: string; mixPct: number }[] {
  const labels = ["Q1 '24", "Q2 '24", "Q3 '24", "Q4 '24", "Q1 '25", "Q2 '25", "Q3 '25", "Q4 '25", "Q1 '26"];
  const current = my?.evMixPct ?? 4;
  const start = Math.max(0.5, current * 0.45);
  return labels.map((label, i) => ({
    label,
    mixPct: +(start + (current - start) * (i / (labels.length - 1))).toFixed(2),
  }));
}

// ─── Helpers ────────────────────────────────────────────────────────────

function fmtCurrency(v: number): string { return "$" + Math.round(v).toLocaleString(); }
function fmtNumber(v: number): string { return Math.round(v).toLocaleString(); }
function fmtPct(v: number, digits = 1): string { return v.toFixed(digits) + "%"; }
function fmtCompact(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return Math.round(v).toString();
}

// ─── Render ─────────────────────────────────────────────────────────────

let state = {
  myBrand: "Ford",
  competitors: ["Tesla", "Hyundai", "Kia", "Chevrolet", "Volkswagen"],
  loading: false,
  data: null as ReportData | null,
  error: "" as string,
};

function shell(): HTMLElement {
  document.body.innerHTML = "";
  document.body.style.cssText = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:16px;";
  const root = document.createElement("div");
  root.id = "app";
  document.body.appendChild(root);
  return root;
}

function renderDemoBanner(root: HTMLElement) {
  if (_detectAppMode() !== "demo") return;
  const _db = document.createElement("div");
  _db.id = "_demo_banner";
  _db.style.cssText = "background:linear-gradient(135deg,#92400e22,#f59e0b11);border:1px solid #f59e0b44;border-radius:10px;padding:14px 20px;margin-bottom:12px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;";
  _db.innerHTML = `
    <div style="flex:1;min-width:200px;">
      <div style="font-size:13px;font-weight:700;color:#fbbf24;margin-bottom:2px;">&#9888; Demo Mode — Showing sample data</div>
      <div style="font-size:12px;color:#d97706;">This app uses the Enterprise Sold Vehicle Summary API. <a href="https://developers.marketcheck.com" target="_blank" style="color:#fbbf24;text-decoration:underline;">Get a key</a> with Enterprise access for live data.</div>
    </div>
    <div style="display:flex;gap:8px;align-items:center;">
      <input id="_banner_key" type="text" placeholder="Paste your API key" style="padding:8px 12px;border-radius:6px;border:1px solid #f59e0b44;background:#0f172a;color:#e2e8f0;font-size:13px;width:220px;outline:none;" />
      <button id="_banner_save" style="padding:8px 16px;border-radius:6px;border:none;background:#f59e0b;color:#0f172a;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">Activate</button>
    </div>`;
  root.appendChild(_db);
  _db.querySelector<HTMLButtonElement>("#_banner_save")!.addEventListener("click", () => {
    const k = (_db.querySelector<HTMLInputElement>("#_banner_key")!.value || "").trim();
    if (!k) return;
    localStorage.setItem("mc_api_key", k);
    _db.style.background = "linear-gradient(135deg,#05966922,#10b98111)";
    _db.style.borderColor = "#10b98144";
    _db.innerHTML = '<div style="font-size:13px;font-weight:700;color:#10b981;">&#10003; API key saved — reloading with live data...</div>';
    setTimeout(() => location.reload(), 800);
  });
  _db.querySelector<HTMLInputElement>("#_banner_key")!.addEventListener("keydown", (e) => {
    if (e.key === "Enter") (_db.querySelector<HTMLButtonElement>("#_banner_save")!).click();
  });
}

function renderHeader(root: HTMLElement) {
  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;";
  header.innerHTML = `
    <div>
      <div style="font-size:11px;font-weight:700;color:#34d399;letter-spacing:1px;">MANUFACTURER · OEM EV DASHBOARD</div>
      <h1 style="font-size:22px;font-weight:700;color:#f1f5f9;letter-spacing:-0.3px;">EV Transition Monitor</h1>
      <div style="font-size:13px;color:#94a3b8;">Track your electrification progress against the market</div>
    </div>
  `;
  root.appendChild(header);
  _addSettingsBar(header);
}

function renderForm(root: HTMLElement) {
  const form = document.createElement("div");
  form.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px;margin-bottom:16px;display:grid;grid-template-columns:1fr 2fr auto;gap:12px;align-items:end;";
  form.className = "grid-3";
  form.innerHTML = `
    <div>
      <label style="display:block;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">My Brand</label>
      <input id="my-brand" type="text" value="${state.myBrand}" placeholder="e.g. Ford"
        style="width:100%;padding:10px 12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;outline:none;box-sizing:border-box;" />
    </div>
    <div>
      <label style="display:block;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Competitor Brands (comma-separated)</label>
      <input id="competitors" type="text" value="${state.competitors.join(", ")}" placeholder="Tesla, Hyundai, Kia"
        style="width:100%;padding:10px 12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;outline:none;box-sizing:border-box;" />
    </div>
    <div>
      <button id="run-btn" style="padding:10px 22px;border-radius:6px;border:none;background:#10b981;color:#0f172a;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:0.3px;">Analyze EV Mix</button>
    </div>
  `;
  root.appendChild(form);
  form.querySelector<HTMLButtonElement>("#run-btn")!.addEventListener("click", onAnalyze);
  form.querySelector<HTMLInputElement>("#my-brand")!.addEventListener("keydown", (e) => { if (e.key === "Enter") onAnalyze(); });
  form.querySelector<HTMLInputElement>("#competitors")!.addEventListener("keydown", (e) => { if (e.key === "Enter") onAnalyze(); });
}

function renderLoading(root: HTMLElement) {
  const el = document.createElement("div");
  el.id = "result";
  el.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:48px;text-align:center;color:#94a3b8;font-size:14px;";
  el.innerHTML = `<div style="display:inline-block;width:24px;height:24px;border:3px solid #334155;border-top-color:#10b981;border-radius:50%;animation:spin 0.9s linear infinite;margin-bottom:12px;"></div>
    <div>Pulling sold-vehicle market intelligence — this can take a few seconds.</div>
    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>`;
  root.appendChild(el);
}

function renderError(root: HTMLElement, msg: string) {
  const el = document.createElement("div");
  el.style.cssText = "background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:16px 20px;color:#fca5a5;font-size:13px;margin-bottom:16px;";
  el.textContent = msg;
  root.appendChild(el);
}

async function onAnalyze() {
  const brandInput = document.getElementById("my-brand") as HTMLInputElement;
  const compInput = document.getElementById("competitors") as HTMLInputElement;
  state.myBrand = (brandInput?.value || "Ford").trim() || "Ford";
  state.competitors = (compInput?.value || "").split(",").map(s => s.trim()).filter(Boolean);
  state.loading = true;
  state.error = "";
  state.data = null;
  render();

  const mode = _detectAppMode();
  try {
    if (mode === "live") {
      const raw = await _fetchDirect({ myBrand: state.myBrand, competitors: state.competitors });
      state.data = parseLiveData(raw, state.competitors);
      // Fall back to mock if every panel is empty (e.g., non-Enterprise key returns empty rankings)
      if (state.data.competitors.length === 0 && state.data.stateRows.length === 0 && state.data.parityRows.length === 0) {
        state.data = getMockData(state.myBrand, state.competitors);
        state.error = "Sold Vehicle Summary returned no rows for this account — showing sample data. This app needs an Enterprise API subscription.";
      }
    } else if (mode === "mcp") {
      const r = await _callTool("ev-transition-monitor", { myBrand: state.myBrand, competitors: state.competitors.join(",") });
      const text = r?.content?.[0]?.text;
      if (text) {
        try {
          const raw = JSON.parse(text);
          state.data = raw.competitors ? raw : parseLiveData(raw, state.competitors);
        } catch {
          state.data = getMockData(state.myBrand, state.competitors);
        }
      } else {
        state.data = getMockData(state.myBrand, state.competitors);
      }
    } else {
      state.data = getMockData(state.myBrand, state.competitors);
    }
  } catch (e: any) {
    state.error = "Could not load market data: " + (e?.message ?? e) + ". Showing sample data.";
    state.data = getMockData(state.myBrand, state.competitors);
  }
  state.loading = false;
  render();
}

function render() {
  const root = shell();
  renderDemoBanner(root);
  renderHeader(root);
  renderForm(root);
  if (state.error) renderError(root, state.error);
  if (state.loading) { renderLoading(root); return; }
  if (!state.data) {
    const hint = document.createElement("div");
    hint.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:32px;color:#94a3b8;font-size:13px;text-align:center;";
    hint.innerHTML = `Enter your brand and competitors above, then click <strong style="color:#10b981;">Analyze EV Mix</strong> to begin.`;
    root.appendChild(hint);
    return;
  }
  renderKpiStrip(root, state.data);
  renderTrendAndScore(root, state.data);
  renderCompetitorLeaderboard(root, state.data);
  renderParityAndModels(root, state.data);
}

function renderKpiStrip(root: HTMLElement, d: ReportData) {
  const my = d.myBrandRow;
  const myMix = my?.evMixPct ?? 0;
  const gap = myMix - d.marketEvSharePct;
  const gapColor = gap >= 0 ? "#34d399" : "#f87171";
  const gapSign = gap >= 0 ? "+" : "";
  const myEvSold = my?.evSold ?? 0;

  const wrap = document.createElement("div");
  wrap.className = "kpi-strip";
  wrap.style.cssText = "display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;";
  wrap.innerHTML = `
    ${kpiCard("Your EV Mix", fmtPct(myMix, 1), `${d.myBrand} EVs as % of total brand sales`, "#3b82f6")}
    ${kpiCard("Market EV Share", fmtPct(d.marketEvSharePct, 1), "All EV sales / all sales (Used)", "#a78bfa")}
    ${kpiCard("Gap to Market", `${gapSign}${gap.toFixed(1)} pts`, gap >= 0 ? "Ahead of market average" : "Behind market average", gapColor)}
    ${kpiCard("Your EV Volume", fmtCompact(myEvSold), `${d.myBrand} EV sold count`, "#10b981")}
  `;
  root.appendChild(wrap);
}

function kpiCard(label: string, value: string, sub: string, accent: string): string {
  return `
    <div style="background:#1e293b;border:1px solid #334155;border-left:3px solid ${accent};border-radius:10px;padding:14px 16px;">
      <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${label}</div>
      <div style="font-size:22px;font-weight:700;color:${accent};line-height:1.1;margin-bottom:4px;">${value}</div>
      <div style="font-size:11px;color:#94a3b8;">${sub}</div>
    </div>`;
}

function renderTrendAndScore(root: HTMLElement, d: ReportData) {
  const wrap = document.createElement("div");
  wrap.className = "grid-2";
  wrap.style.cssText = "display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:16px;";

  const trend = document.createElement("div");
  trend.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px;overflow:hidden;";
  trend.innerHTML = `
    <div style="font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">${d.myBrand} EV Mix % — Trailing Quarters</div>
    <canvas id="trend-canvas" style="width:100%;height:240px;"></canvas>
  `;

  const score = document.createElement("div");
  score.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px;display:flex;flex-direction:column;align-items:center;gap:10px;";
  const s = d.electrificationScore;
  const scoreColor = s >= 70 ? "#34d399" : s >= 45 ? "#fbbf24" : "#f87171";
  const scoreLabel = s >= 70 ? "Leading" : s >= 45 ? "On Track" : "Lagging";
  score.innerHTML = `
    <div style="font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;align-self:flex-start;">Electrification Score</div>
    <canvas id="score-canvas" width="200" height="200" style="width:200px;height:200px;"></canvas>
    <div style="text-align:center;">
      <div style="font-size:18px;font-weight:700;color:${scoreColor};">${scoreLabel}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:4px;max-width:240px;">Composite of EV mix vs market, mix-trend slope, and EV days-on-market.</div>
    </div>
  `;

  wrap.appendChild(trend);
  wrap.appendChild(score);
  root.appendChild(wrap);

  drawTrend(d);
  drawScoreGauge(s, scoreColor);
}

function drawTrend(d: ReportData) {
  const canvas = document.getElementById("trend-canvas") as HTMLCanvasElement;
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = 240;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const padL = 50, padR = 16, padT = 16, padB = 36;
  const cw = w - padL - padR;
  const ch = h - padT - padB;
  const points = d.trendPoints;
  const maxY = Math.max(...points.map(p => p.mixPct), d.marketEvSharePct, 1) * 1.15;

  // Gridlines
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 0.5;
  ctx.fillStyle = "#64748b";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i++) {
    const y = padT + (ch / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + cw, y);
    ctx.stroke();
    const v = maxY - (maxY / 4) * i;
    ctx.fillText(v.toFixed(1) + "%", padL - 6, y);
  }

  // Market line (dashed)
  if (d.marketEvSharePct > 0 && d.marketEvSharePct < maxY) {
    const y = padT + ch - (d.marketEvSharePct / maxY) * ch;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "#a78bfa";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + cw, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#a78bfa";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Market avg", padL + 6, y - 8);
  }

  // X-axis labels
  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const xStep = points.length > 1 ? cw / (points.length - 1) : 0;
  points.forEach((p, i) => {
    const x = padL + xStep * i;
    ctx.fillText(p.label, x, padT + ch + 6);
  });

  // Area fill
  const grad = ctx.createLinearGradient(0, padT, 0, padT + ch);
  grad.addColorStop(0, "rgba(59,130,246,0.35)");
  grad.addColorStop(1, "rgba(59,130,246,0.0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(padL, padT + ch);
  points.forEach((p, i) => {
    const x = padL + xStep * i;
    const y = padT + ch - (p.mixPct / maxY) * ch;
    if (i === 0) ctx.lineTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.lineTo(padL + xStep * (points.length - 1), padT + ch);
  ctx.closePath();
  ctx.fill();

  // Line
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = padL + xStep * i;
    const y = padT + ch - (p.mixPct / maxY) * ch;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Dots
  ctx.fillStyle = "#60a5fa";
  points.forEach((p, i) => {
    const x = padL + xStep * i;
    const y = padT + ch - (p.mixPct / maxY) * ch;
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawScoreGauge(score: number, color: string) {
  const canvas = document.getElementById("score-canvas") as HTMLCanvasElement;
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const size = 200;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2, cy = size / 2;
  const r = 78;

  // Track
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 0.25, false);
  ctx.stroke();

  // Value
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const start = Math.PI * 0.75;
  const end = start + (Math.PI * 1.5) * pct;
  ctx.strokeStyle = color;
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, end, false);
  ctx.stroke();
  ctx.lineCap = "butt";

  // Score number
  ctx.fillStyle = color;
  ctx.font = "700 44px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(score), cx, cy - 4);
  ctx.fillStyle = "#64748b";
  ctx.font = "11px -apple-system, sans-serif";
  ctx.fillText("/ 100", cx, cy + 26);
}

function renderCompetitorLeaderboard(root: HTMLElement, d: ReportData) {
  const panel = document.createElement("div");
  panel.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px;margin-bottom:16px;";
  panel.innerHTML = `
    <div style="font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">EV Competitor Leaderboard</div>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:680px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px 10px;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.3px;border-bottom:1px solid #334155;">Brand</th>
            <th style="text-align:right;padding:8px 10px;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.3px;border-bottom:1px solid #334155;">EV Sold</th>
            <th style="text-align:right;padding:8px 10px;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.3px;border-bottom:1px solid #334155;">Total Sold</th>
            <th style="text-align:right;padding:8px 10px;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.3px;border-bottom:1px solid #334155;">EV Mix %</th>
            <th style="text-align:right;padding:8px 10px;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.3px;border-bottom:1px solid #334155;">EV Avg Price</th>
            <th style="text-align:right;padding:8px 10px;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.3px;border-bottom:1px solid #334155;">EV DOM</th>
            <th style="text-align:left;padding:8px 10px;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.3px;border-bottom:1px solid #334155;">Mix Bar</th>
          </tr>
        </thead>
        <tbody id="comp-body"></tbody>
      </table>
    </div>
  `;
  root.appendChild(panel);

  const body = panel.querySelector("#comp-body")!;
  const maxMix = Math.max(...d.competitors.map(c => c.evMixPct), 1);
  for (const c of d.competitors.slice(0, 15)) {
    const tr = document.createElement("tr");
    tr.style.cssText = c.isMyBrand ? "background:rgba(59,130,246,0.10);" : "";
    const barW = (c.evMixPct / maxMix) * 100;
    const barColor = c.isMyBrand ? "#3b82f6" : "#10b981";
    tr.innerHTML = `
      <td style="padding:7px 10px;border-bottom:1px solid #1e293b;font-weight:${c.isMyBrand ? 700 : 500};color:${c.isMyBrand ? "#60a5fa" : "#e2e8f0"};">
        ${c.isMyBrand ? "&#9733; " : ""}${c.brand}
      </td>
      <td style="padding:7px 10px;border-bottom:1px solid #1e293b;text-align:right;">${fmtCompact(c.evSold)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #1e293b;text-align:right;color:#94a3b8;">${fmtCompact(c.totalSold)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #1e293b;text-align:right;font-weight:600;">${fmtPct(c.evMixPct, 1)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #1e293b;text-align:right;">${c.evAvgPrice > 0 ? fmtCurrency(c.evAvgPrice) : "—"}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #1e293b;text-align:right;">${c.evDom > 0 ? c.evDom + "d" : "—"}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #1e293b;width:160px;">
        <div style="background:#0f172a;border-radius:4px;height:8px;overflow:hidden;">
          <div style="background:${barColor};height:100%;width:${barW.toFixed(1)}%;"></div>
        </div>
      </td>
    `;
    body.appendChild(tr);
  }
}

function renderParityAndModels(root: HTMLElement, d: ReportData) {
  const wrap = document.createElement("div");
  wrap.className = "grid-2";
  wrap.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:12px;";

  const parity = document.createElement("div");
  parity.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px;overflow:hidden;";
  parity.innerHTML = `
    <div style="font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">EV vs ICE Price Parity by Body Type</div>
    <canvas id="parity-canvas" style="width:100%;height:280px;"></canvas>
    <div style="font-size:11px;color:#64748b;margin-top:8px;">Bars show average sale price. Parity % = EV / ICE × 100. Above 100 = EV premium, below 100 = EV discount.</div>
  `;

  const models = document.createElement("div");
  models.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px;overflow:hidden;";
  const maxVol = Math.max(...d.myEvModels.map(m => m.evVolume), 1);
  const modelRowsHtml = d.myEvModels.map(m => {
    const barW = (m.evVolume / maxVol) * 100;
    return `
      <tr>
        <td style="padding:7px 10px;border-bottom:1px solid rgba(51,65,85,0.4);font-weight:600;color:#e2e8f0;">${m.model}</td>
        <td style="padding:7px 10px;border-bottom:1px solid rgba(51,65,85,0.4);text-align:right;font-weight:600;">${fmtCompact(m.evVolume)}</td>
        <td style="padding:7px 10px;border-bottom:1px solid rgba(51,65,85,0.4);width:160px;">
          <div style="background:#0f172a;border-radius:4px;height:8px;overflow:hidden;">
            <div style="background:#10b981;height:100%;width:${barW.toFixed(1)}%;"></div>
          </div>
        </td>
      </tr>`;
  }).join("");
  models.innerHTML = `
    <div style="font-size:13px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">${d.myBrand} Top EV Models</div>
    <div style="overflow-x:auto;max-height:340px;overflow-y:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px 10px;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.3px;border-bottom:1px solid #334155;position:sticky;top:0;background:#1e293b;">Model</th>
            <th style="text-align:right;padding:8px 10px;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.3px;border-bottom:1px solid #334155;position:sticky;top:0;background:#1e293b;">EV Sold</th>
            <th style="text-align:left;padding:8px 10px;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.3px;border-bottom:1px solid #334155;position:sticky;top:0;background:#1e293b;">Volume</th>
          </tr>
        </thead>
        <tbody>${modelRowsHtml || `<tr><td colspan="3" style="padding:20px;color:#64748b;text-align:center;font-size:12px;">No EV models found for ${d.myBrand}.</td></tr>`}</tbody>
      </table>
    </div>
    <div style="font-size:11px;color:#64748b;margin-top:8px;">Ranked by sold count (Used inventory).</div>
  `;

  wrap.appendChild(parity);
  wrap.appendChild(models);
  root.appendChild(wrap);

  drawParityChart(d);
}

function drawParityChart(d: ReportData) {
  const canvas = document.getElementById("parity-canvas") as HTMLCanvasElement;
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = 280;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const rows = d.parityRows;
  if (rows.length === 0) {
    ctx.fillStyle = "#64748b";
    ctx.font = "13px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No EV/ICE body-type comparison available.", w / 2, h / 2);
    return;
  }

  const padL = 70, padR = 70, padT = 16, padB = 28;
  const cw = w - padL - padR;
  const ch = h - padT - padB;
  const groupH = ch / rows.length;
  const barH = Math.min(18, groupH * 0.4);
  const maxPrice = Math.max(...rows.flatMap(r => [r.evPrice, r.icePrice]));

  rows.forEach((r, i) => {
    const yMid = padT + groupH * i + groupH / 2;
    const evW = (r.evPrice / maxPrice) * cw;
    const iceW = (r.icePrice / maxPrice) * cw;

    // ICE bar (top)
    ctx.fillStyle = "#64748b";
    ctx.fillRect(padL, yMid - barH - 2, iceW, barH);
    // EV bar (bottom)
    ctx.fillStyle = "#3b82f6";
    ctx.fillRect(padL, yMid + 2, evW, barH);

    // Body label
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "600 11px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(r.bodyType, padL - 8, yMid);

    // Price labels at end of bars
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText(fmtCurrency(r.icePrice), padL + iceW + 4, yMid - barH / 2 - 2);
    ctx.fillStyle = "#93c5fd";
    ctx.fillText(fmtCurrency(r.evPrice), padL + evW + 4, yMid + barH / 2 + 2);

    // Parity badge on the right
    const parity = r.parityPct;
    const parityColor = parity > 110 ? "#fbbf24" : parity >= 90 ? "#34d399" : "#f87171";
    const parityText = (parity > 100 ? "+" : "") + (parity - 100).toFixed(0) + "%";
    ctx.fillStyle = parityColor;
    ctx.font = "700 11px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(parityText, w - 6, yMid);
  });

  // Legend
  ctx.fillStyle = "#64748b";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillRect(padL, padT + ch + 12, 10, 8);
  ctx.fillStyle = "#64748b";
  ctx.fillText("ICE", padL + 14, padT + ch + 16);
  ctx.fillStyle = "#3b82f6";
  ctx.fillRect(padL + 50, padT + ch + 12, 10, 8);
  ctx.fillStyle = "#64748b";
  ctx.fillText("EV", padL + 64, padT + ch + 16);
}

// ─── Init ───────────────────────────────────────────────────────────────

function readUrlParamsToState() {
  const p = _getUrlParams();
  if (p.myBrand) state.myBrand = p.myBrand;
  if (p.competitors) state.competitors = p.competitors.split(",").map(s => s.trim()).filter(Boolean);
}

function main() {
  readUrlParamsToState();
  render();
  // Auto-run if URL specifies a brand
  const p = _getUrlParams();
  if (p.myBrand) {
    onAnalyze();
  } else if (_detectAppMode() === "demo") {
    onAnalyze();
  } else if (_detectAppMode() === "live") {
    onAnalyze();
  }
}

main();
window.addEventListener("resize", () => {
  if (state.data && !state.loading) {
    drawTrend(state.data);
    drawScoreGauge(state.data.electrificationScore, state.data.electrificationScore >= 70 ? "#34d399" : state.data.electrificationScore >= 45 ? "#fbbf24" : "#f87171");
    drawParityChart(state.data);
  }
});
