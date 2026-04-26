import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "oem-depreciation-tracker" }); } catch {}

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
  for (const key of ["myBrand", "make", "competitors", "bodyType", "body_type", "state"]) {
    const v = params.get(key);
    if (v) result[key] = v;
  }
  return result;
}

function _proxyBase(): string {
  return location.protocol.startsWith("http") ? "" : "http://localhost:3001";
}

const _MC = "https://api.marketcheck.com";
async function _mcApi(path: string, params: Record<string, unknown> = {}) {
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

function _mcSold(p: Record<string, unknown>) { return _mcApi("/api/v1/sold-vehicles/summary", p); }

interface FetchArgs {
  myBrand: string;
  competitors: string[];
  bodyType?: string;
  state?: string;
}

async function _fetchDirect(args: FetchArgs) {
  const { myBrand, bodyType, state } = args;
  const baseFilter: Record<string, unknown> = {};
  if (bodyType) baseFilter.body_type = bodyType;
  if (state) baseFilter.state = state;

  // Step 1 (parallel): used + new for residual computation
  const [usedRanking, newRanking] = await Promise.all([
    _mcSold({ ranking_dimensions: "make,model", ranking_measure: "average_sale_price", inventory_type: "Used", top_n: 200, ...baseFilter }),
    _mcSold({ ranking_dimensions: "make,model", ranking_measure: "average_sale_price", inventory_type: "New", top_n: 200, ...baseFilter }),
  ]);

  // Step 2 (parallel): body-type segment benchmark + state-level regional
  const segmentArgs: Record<string, unknown> = { ranking_dimensions: "body_type", ranking_measure: "average_sale_price", inventory_type: "Used", top_n: 12 };
  const regionalArgs: Record<string, unknown> = { ranking_dimensions: "state", ranking_measure: "average_sale_price", inventory_type: "Used", top_n: 50 };
  if (myBrand) regionalArgs.make = myBrand;
  const [segmentRanking, regionalRanking] = await Promise.all([
    _mcSold(segmentArgs),
    _mcSold(regionalArgs),
  ]);

  return { usedRanking, newRanking, segmentRanking, regionalRanking };
}

async function _callTool(args: FetchArgs) {
  if (_safeApp) {
    try {
      const r = await _safeApp.callServerTool({ name: "oem-depreciation-tracker", arguments: args });
      if (r) return r;
    } catch {}
  }
  const auth = _getAuth();
  if (auth.value) {
    try {
      const data = await _fetchDirect(args);
      if (data) return { content: [{ type: "text", text: JSON.stringify(data) }] };
    } catch (e) { console.warn("Direct API failed:", e); }
    try {
      const r = await fetch((_proxyBase()) + "/api/proxy/oem-depreciation-tracker", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, _auth_mode: auth.mode, _auth_value: auth.value }),
      });
      if (r.ok) { const d = await r.json(); return { content: [{ type: "text", text: JSON.stringify(d) }] }; }
    } catch {}
  }
  return null;
}
// ── End Data Provider ──────────────────────────────────────────────────

// ── Responsive Styles ──────────────────────────────────────────────────
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
      [style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
    }
  `;
  document.head.appendChild(s);
})();

// ── Constants ──────────────────────────────────────────────────────────
const BG = "#0f172a";
const SURFACE = "#1e293b";
const SURFACE_2 = "#0f1729";
const BORDER = "#334155";
const TEXT_PRI = "#f1f5f9";
const TEXT_SEC = "#94a3b8";
const TEXT_MUTED = "#64748b";
const ACCENT = "#38bdf8";
const GREEN = "#22c55e";
const RED = "#ef4444";
const AMBER = "#f59e0b";
const COLORS = ["#38bdf8", "#f472b6", "#a78bfa", "#34d399", "#fb923c", "#fbbf24"];

const BODY_TYPES = ["All", "SUV", "Sedan", "Truck", "Coupe", "Hatchback", "Van"];
const US_STATES = ["National", "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"];
const POPULAR_BRANDS = ["Toyota", "Honda", "Ford", "Chevrolet", "Hyundai", "Kia", "Nissan", "Subaru", "Mazda", "Volkswagen", "Jeep", "Ram", "GMC", "BMW", "Mercedes-Benz", "Audi", "Lexus", "Tesla"];

// ── Data Types ─────────────────────────────────────────────────────────
interface ModelResidual {
  make: string;
  model: string;
  bodyType: string;
  newPrice: number;
  usedPrice: number;
  residualPct: number;
  monthlyDepRate: number;
  soldVolume: number;
  curve: { month: number; pctOfNew: number; price: number }[];
  isMyBrand: boolean;
  alert: "fast" | "slow" | "normal";
}
interface SegmentBench {
  bodyType: string;
  avgResidualPct: number;
  avgUsedPrice: number;
  volume: number;
}
interface StateRetention {
  state: string;
  avgUsedPrice: number;
  volume: number;
  retentionIndex: number;
}
interface TrackerData {
  models: ModelResidual[];
  segments: SegmentBench[];
  states: StateRetention[];
  myBrandResidual: number;
  bestModel: ModelResidual | null;
  worstModel: ModelResidual | null;
}

// ── App State ──────────────────────────────────────────────────────────
const urlParams = _getUrlParams();
let myBrand = urlParams.myBrand || urlParams.make || "Toyota";
let competitors: string[] = (urlParams.competitors || "Honda,Ford,Hyundai,Chevrolet").split(",").map(s => s.trim()).filter(Boolean);
let bodyType = urlParams.bodyType || urlParams.body_type || "All";
let stateFilter = urlParams.state || "National";
const curveAge = 36;
let currentData: TrackerData | null = null;
let isLoading = false;
let errorMsg = "";

let curveCanvas: HTMLCanvasElement;
let segmentCanvas: HTMLCanvasElement;
let hoveredMonth: number | null = null;

// ── Mock Data ──────────────────────────────────────────────────────────
const MOCK_MODELS: { make: string; models: { model: string; bodyType: string; newPrice: number; residualPct: number; volume: number }[] }[] = [
  { make: "Toyota", models: [
    { model: "RAV4", bodyType: "SUV", newPrice: 33450, residualPct: 78.4, volume: 12400 },
    { model: "Camry", bodyType: "Sedan", newPrice: 28855, residualPct: 71.2, volume: 9800 },
    { model: "Highlander", bodyType: "SUV", newPrice: 39520, residualPct: 76.8, volume: 6200 },
    { model: "Tacoma", bodyType: "Truck", newPrice: 34625, residualPct: 82.1, volume: 7400 },
    { model: "Corolla", bodyType: "Sedan", newPrice: 23150, residualPct: 68.4, volume: 8100 },
  ]},
  { make: "Honda", models: [
    { model: "CR-V", bodyType: "SUV", newPrice: 34110, residualPct: 74.6, volume: 10200 },
    { model: "Civic", bodyType: "Sedan", newPrice: 24950, residualPct: 70.8, volume: 8900 },
    { model: "Accord", bodyType: "Sedan", newPrice: 28890, residualPct: 67.2, volume: 6400 },
    { model: "Pilot", bodyType: "SUV", newPrice: 41280, residualPct: 71.4, volume: 4600 },
  ]},
  { make: "Ford", models: [
    { model: "F-150", bodyType: "Truck", newPrice: 38085, residualPct: 72.3, volume: 14800 },
    { model: "Escape", bodyType: "SUV", newPrice: 30495, residualPct: 58.4, volume: 5200 },
    { model: "Explorer", bodyType: "SUV", newPrice: 38545, residualPct: 60.2, volume: 6100 },
    { model: "Bronco", bodyType: "SUV", newPrice: 35900, residualPct: 79.6, volume: 3400 },
  ]},
  { make: "Hyundai", models: [
    { model: "Tucson", bodyType: "SUV", newPrice: 31550, residualPct: 65.8, volume: 5800 },
    { model: "Elantra", bodyType: "Sedan", newPrice: 22845, residualPct: 62.1, volume: 6900 },
    { model: "Santa Fe", bodyType: "SUV", newPrice: 35895, residualPct: 64.7, volume: 4200 },
    { model: "Palisade", bodyType: "SUV", newPrice: 39645, residualPct: 68.9, volume: 3800 },
  ]},
  { make: "Chevrolet", models: [
    { model: "Silverado", bodyType: "Truck", newPrice: 38895, residualPct: 65.4, volume: 11200 },
    { model: "Equinox", bodyType: "SUV", newPrice: 30500, residualPct: 56.8, volume: 5600 },
    { model: "Tahoe", bodyType: "SUV", newPrice: 56200, residualPct: 71.2, volume: 4100 },
    { model: "Malibu", bodyType: "Sedan", newPrice: 26995, residualPct: 54.3, volume: 3900 },
  ]},
  { make: "Kia", models: [
    { model: "Sportage", bodyType: "SUV", newPrice: 27090, residualPct: 67.4, volume: 5400 },
    { model: "Telluride", bodyType: "SUV", newPrice: 36890, residualPct: 76.2, volume: 4200 },
    { model: "Forte", bodyType: "Sedan", newPrice: 21290, residualPct: 63.5, volume: 5100 },
  ]},
  { make: "Nissan", models: [
    { model: "Rogue", bodyType: "SUV", newPrice: 28590, residualPct: 60.8, volume: 7200 },
    { model: "Altima", bodyType: "Sedan", newPrice: 26690, residualPct: 57.4, volume: 5300 },
  ]},
  { make: "Subaru", models: [
    { model: "Outback", bodyType: "SUV", newPrice: 30190, residualPct: 73.6, volume: 6100 },
    { model: "Forester", bodyType: "SUV", newPrice: 28890, residualPct: 71.8, volume: 5400 },
  ]},
];

const MOCK_STATES: { state: string; index: number; volumeBase: number }[] = [
  { state: "CA", index: 108, volumeBase: 5200 }, { state: "TX", index: 102, volumeBase: 4800 },
  { state: "FL", index: 104, volumeBase: 4100 }, { state: "NY", index: 106, volumeBase: 3200 },
  { state: "IL", index: 96, volumeBase: 2400 },  { state: "PA", index: 95, volumeBase: 2200 },
  { state: "OH", index: 93, volumeBase: 2100 },  { state: "GA", index: 99, volumeBase: 2300 },
  { state: "NC", index: 97, volumeBase: 2000 },  { state: "MI", index: 92, volumeBase: 1800 },
  { state: "WA", index: 105, volumeBase: 1900 }, { state: "AZ", index: 98, volumeBase: 1700 },
  { state: "CO", index: 103, volumeBase: 1600 }, { state: "NJ", index: 105, volumeBase: 1700 },
  { state: "VA", index: 100, volumeBase: 1500 },
];

function getMockData(): TrackerData {
  const includeMakes = new Set([myBrand, ...competitors]);
  const filteredBody = bodyType === "All" ? null : bodyType;

  const all: ModelResidual[] = [];
  for (const brand of MOCK_MODELS) {
    if (!includeMakes.has(brand.make)) continue;
    for (const m of brand.models) {
      if (filteredBody && m.bodyType !== filteredBody) continue;
      const stateAdj = stateFilter === "National" ? 1 : (() => {
        const s = MOCK_STATES.find(x => x.state === stateFilter);
        return s ? s.index / 100 : 1;
      })();
      const adjResidual = Math.max(35, Math.min(92, m.residualPct * stateAdj + (Math.random() - 0.5) * 1.5));
      const usedPrice = Math.round(m.newPrice * adjResidual / 100);
      const monthlyRate = (100 - adjResidual) / 36;
      const curve = buildCurve(m.newPrice, adjResidual, curveAge);
      const alert = adjResidual >= 75 ? "slow" : adjResidual <= 60 ? "fast" : "normal";
      all.push({
        make: brand.make, model: m.model, bodyType: m.bodyType,
        newPrice: m.newPrice, usedPrice, residualPct: +adjResidual.toFixed(1),
        monthlyDepRate: +monthlyRate.toFixed(3), soldVolume: m.volume,
        curve, isMyBrand: brand.make === myBrand, alert,
      });
    }
  }

  const segUsed: Record<string, { totalUsed: number; totalNew: number; volume: number }> = {};
  for (const r of all) {
    if (!segUsed[r.bodyType]) segUsed[r.bodyType] = { totalUsed: 0, totalNew: 0, volume: 0 };
    segUsed[r.bodyType].totalUsed += r.usedPrice * r.soldVolume;
    segUsed[r.bodyType].totalNew += r.newPrice * r.soldVolume;
    segUsed[r.bodyType].volume += r.soldVolume;
  }
  const segments: SegmentBench[] = Object.entries(segUsed).map(([bt, v]) => ({
    bodyType: bt,
    avgResidualPct: v.totalNew > 0 ? +(v.totalUsed / v.totalNew * 100).toFixed(1) : 0,
    avgUsedPrice: v.volume > 0 ? Math.round(v.totalUsed / v.volume) : 0,
    volume: v.volume,
  })).sort((a, b) => b.avgResidualPct - a.avgResidualPct);

  const states: StateRetention[] = MOCK_STATES.map(s => ({
    state: s.state,
    avgUsedPrice: Math.round(28000 * s.index / 100 + (Math.random() - 0.5) * 800),
    volume: Math.round(s.volumeBase * (0.7 + Math.random() * 0.6)),
    retentionIndex: s.index,
  })).sort((a, b) => b.retentionIndex - a.retentionIndex);

  const myBrandModels = all.filter(m => m.isMyBrand);
  const myBrandResidual = myBrandModels.length
    ? +(myBrandModels.reduce((s, m) => s + m.residualPct * m.soldVolume, 0) / Math.max(myBrandModels.reduce((s, m) => s + m.soldVolume, 0), 1)).toFixed(1)
    : 0;

  const sorted = [...all].sort((a, b) => b.residualPct - a.residualPct);
  return {
    models: all, segments, states,
    myBrandResidual,
    bestModel: sorted[0] ?? null,
    worstModel: sorted[sorted.length - 1] ?? null,
  };
}

function buildCurve(newPrice: number, currentResidualPct: number, months: number): { month: number; pctOfNew: number; price: number }[] {
  const points: { month: number; pctOfNew: number; price: number }[] = [];
  const targetPct = currentResidualPct;
  const yearsToTarget = 3;
  const monthlyDecay = Math.pow(targetPct / 100, 1 / (yearsToTarget * 12));
  for (let m = 0; m <= months; m++) {
    const pct = Math.pow(monthlyDecay, m) * 100;
    const noise = m === 0 ? 0 : (Math.random() - 0.5) * 0.3;
    const adjPct = Math.max(30, Math.min(100, pct + noise));
    points.push({ month: m, pctOfNew: +adjPct.toFixed(1), price: Math.round(newPrice * adjPct / 100) });
  }
  return points;
}

// ── Transform raw API response → TrackerData ──────────────────────────
function _transformRawToTracker(raw: any): TrackerData | null {
  if (!raw) return null;
  const usedRows = raw.usedRanking?.data ?? [];
  const newRows = raw.newRanking?.data ?? [];
  const segmentRows = raw.segmentRanking?.data ?? [];
  const stateRows = raw.regionalRanking?.data ?? [];
  if (!usedRows.length && !newRows.length) return null;

  const includeMakes = new Set([myBrand, ...competitors]);

  const newPriceMap: Record<string, { price: number; bodyType: string; volume: number }> = {};
  for (const r of newRows) {
    const make = r.make ?? ""; const model = r.model ?? "";
    if (!make || !model) continue;
    const key = `${make}|${model}`;
    const price = r.average_sale_price ?? 0;
    if (price <= 0) continue;
    if (!newPriceMap[key]) newPriceMap[key] = { price, bodyType: r.body_type ?? "Unknown", volume: r.sold_count ?? 0 };
  }

  const models: ModelResidual[] = [];
  const seen = new Set<string>();
  for (const r of usedRows) {
    const make = r.make ?? ""; const model = r.model ?? "";
    if (!make || !model) continue;
    if (!includeMakes.has(make)) continue;
    const key = `${make}|${model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const usedPrice = r.average_sale_price ?? 0;
    const newEntry = newPriceMap[key];
    const newPrice = newEntry?.price ?? Math.round(usedPrice / 0.65);
    const bodyTypeVal = newEntry?.bodyType ?? r.body_type ?? "Unknown";
    if (usedPrice <= 0 || newPrice <= 0) continue;
    const residualPct = +(usedPrice / newPrice * 100).toFixed(1);
    if (residualPct < 25 || residualPct > 110) continue;
    const monthlyRate = +((100 - residualPct) / 36).toFixed(3);
    const curve = buildCurve(newPrice, residualPct, curveAge);
    const alert = residualPct >= 75 ? "slow" : residualPct <= 60 ? "fast" : "normal";
    models.push({
      make, model, bodyType: bodyTypeVal,
      newPrice, usedPrice, residualPct, monthlyDepRate: monthlyRate,
      soldVolume: r.sold_count ?? 0,
      curve, isMyBrand: make === myBrand, alert,
    });
  }

  const filtered = bodyType === "All" ? models : models.filter(m => m.bodyType.toLowerCase() === bodyType.toLowerCase());

  const segMap: Record<string, { totalUsed: number; volume: number; ratioWeighted: number; ratioVolume: number }> = {};
  for (const r of segmentRows) {
    const bt = r.body_type ?? "";
    if (!bt) continue;
    if (!segMap[bt]) segMap[bt] = { totalUsed: 0, volume: 0, ratioWeighted: 0, ratioVolume: 0 };
    segMap[bt].totalUsed += (r.average_sale_price ?? 0) * (r.sold_count ?? 0);
    segMap[bt].volume += r.sold_count ?? 0;
  }
  for (const m of models) {
    if (!segMap[m.bodyType]) segMap[m.bodyType] = { totalUsed: 0, volume: 0, ratioWeighted: 0, ratioVolume: 0 };
    segMap[m.bodyType].ratioWeighted += m.residualPct * m.soldVolume;
    segMap[m.bodyType].ratioVolume += m.soldVolume;
  }
  const segments: SegmentBench[] = Object.entries(segMap).map(([bt, v]) => ({
    bodyType: bt,
    avgResidualPct: v.ratioVolume > 0 ? +(v.ratioWeighted / v.ratioVolume).toFixed(1) : 0,
    avgUsedPrice: v.volume > 0 ? Math.round(v.totalUsed / v.volume) : 0,
    volume: v.volume,
  })).filter(s => s.avgResidualPct > 0).sort((a, b) => b.avgResidualPct - a.avgResidualPct);

  const stateMap: Record<string, { totalPrice: number; volume: number }> = {};
  for (const r of stateRows) {
    const st = r.state ?? "";
    if (!st) continue;
    if (!stateMap[st]) stateMap[st] = { totalPrice: 0, volume: 0 };
    stateMap[st].totalPrice += (r.average_sale_price ?? 0) * (r.sold_count ?? 0);
    stateMap[st].volume += r.sold_count ?? 0;
  }
  const stateEntries = Object.entries(stateMap).map(([st, v]) => ({
    state: st,
    avgUsedPrice: v.volume > 0 ? Math.round(v.totalPrice / v.volume) : 0,
    volume: v.volume,
  })).filter(s => s.avgUsedPrice > 0);
  const totalVolume = stateEntries.reduce((s, x) => s + x.volume, 0);
  const nationalAvg = totalVolume > 0
    ? stateEntries.reduce((s, x) => s + x.avgUsedPrice * x.volume, 0) / totalVolume
    : 0;
  const states: StateRetention[] = stateEntries.map(s => ({
    ...s,
    retentionIndex: nationalAvg > 0 ? +(s.avgUsedPrice / nationalAvg * 100).toFixed(0) : 100,
  })).sort((a, b) => b.retentionIndex - a.retentionIndex).slice(0, 25);

  const myModels = filtered.filter(m => m.isMyBrand);
  const myVol = myModels.reduce((s, m) => s + m.soldVolume, 0);
  const myBrandResidual = myVol > 0
    ? +(myModels.reduce((s, m) => s + m.residualPct * m.soldVolume, 0) / myVol).toFixed(1)
    : (myModels.length ? +(myModels.reduce((s, m) => s + m.residualPct, 0) / myModels.length).toFixed(1) : 0);

  const sorted = [...filtered].sort((a, b) => b.residualPct - a.residualPct);
  return {
    models: filtered, segments, states,
    myBrandResidual,
    bestModel: sorted[0] ?? null,
    worstModel: sorted[sorted.length - 1] ?? null,
  };
}

// ── Initialize ─────────────────────────────────────────────────────────
async function init() {
  buildShell();
  await fetchData();
}

async function fetchData() {
  isLoading = true; errorMsg = "";
  renderResults();
  try {
    const result = await _callTool({
      myBrand, competitors,
      bodyType: bodyType === "All" ? undefined : bodyType,
      state: stateFilter === "National" ? undefined : stateFilter,
    });
    if (result && (result as any).content) {
      try {
        const txt = (result as any).content[0]?.text;
        const parsed = txt ? JSON.parse(txt) : null;
        const transformed = _transformRawToTracker(parsed);
        currentData = transformed ?? getMockData();
      } catch {
        currentData = getMockData();
      }
    } else if (result && typeof result === "object") {
      currentData = result as unknown as TrackerData;
    } else {
      currentData = getMockData();
    }
  } catch (e) {
    console.warn("fetchData error:", e);
    errorMsg = "Failed to load data — showing sample.";
    currentData = getMockData();
  }
  isLoading = false;
  renderResults();
}

// ── Build Shell ────────────────────────────────────────────────────────
function buildShell() {
  document.body.style.cssText = `background:${BG};color:${TEXT_PRI};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;margin:0;padding:0;`;
  document.body.innerHTML = "";

  const container = el("div", { style: "max-width:1400px;margin:0 auto;padding:16px 20px 40px;" });

  const header = el("div", { style: "display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;" });
  const titleBlock = el("div", { style: "flex:1;min-width:240px;" });
  titleBlock.appendChild(el("h1", { textContent: "OEM Depreciation Tracker", style: `font-size:22px;font-weight:700;color:${TEXT_PRI};margin:0 0 4px;` }));
  titleBlock.appendChild(el("div", { textContent: "How fast are your models losing value vs the competition?", style: `font-size:13px;color:${TEXT_SEC};` }));
  header.appendChild(titleBlock);
  header.appendChild(buildModeBadge());
  container.appendChild(header);

  if (_detectAppMode() === "demo" && !_isEmbedMode()) {
    container.appendChild(buildDemoBanner());
  }

  container.appendChild(buildControls());

  const results = el("div", { id: "results-area", style: "margin-top:16px;" });
  container.appendChild(results);

  document.body.appendChild(container);
}

function buildModeBadge(): HTMLElement {
  const mode = _detectAppMode();
  const colors: Record<string, { bg: string; fg: string; label: string }> = {
    mcp: { bg: "#1e40af33", fg: "#60a5fa", label: "MCP" },
    live: { bg: "#05966933", fg: "#34d399", label: "LIVE" },
    demo: { bg: "#92400e44", fg: "#fbbf24", label: "DEMO" },
  };
  const c = colors[mode];
  return el("span", {
    textContent: c.label,
    style: `padding:4px 12px;border-radius:12px;font-size:11px;font-weight:700;letter-spacing:0.5px;background:${c.bg};color:${c.fg};border:1px solid ${c.fg}55;`,
  });
}

function buildDemoBanner(): HTMLElement {
  const _db = el("div", { style: "background:linear-gradient(135deg,#92400e22,#f59e0b11);border:1px solid #f59e0b44;border-radius:10px;padding:14px 20px;margin-bottom:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;" });
  _db.innerHTML = `
    <div style="flex:1;min-width:200px;">
      <div style="font-size:13px;font-weight:700;color:#fbbf24;margin-bottom:2px;">&#9888; Demo Mode — Showing sample data</div>
      <div style="font-size:12px;color:#d97706;">Enter your MarketCheck API key to see real residual value data. <a href="https://developers.marketcheck.com" target="_blank" style="color:#fbbf24;text-decoration:underline;">Get a free key</a> &middot; <strong>Note:</strong> requires Enterprise API access.</div>
    </div>
    <div style="display:flex;gap:8px;align-items:center;">
      <input id="_banner_key" type="text" placeholder="Paste your API key" style="padding:8px 12px;border-radius:6px;border:1px solid #f59e0b44;background:#0f172a;color:#e2e8f0;font-size:13px;width:220px;outline:none;" />
      <button id="_banner_save" style="padding:8px 16px;border-radius:6px;border:none;background:#f59e0b;color:#0f172a;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">Activate</button>
    </div>`;
  setTimeout(() => {
    _db.querySelector("#_banner_save")?.addEventListener("click", () => {
      const k = (_db.querySelector("#_banner_key") as HTMLInputElement).value.trim();
      if (!k) return;
      localStorage.setItem("mc_api_key", k);
      location.reload();
    });
    _db.querySelector("#_banner_key")?.addEventListener("keydown", (e: any) => {
      if (e.key === "Enter") (_db.querySelector("#_banner_save") as HTMLButtonElement)?.click();
    });
  }, 0);
  return _db;
}

function buildControls(): HTMLElement {
  const bar = el("div", { style: `background:${SURFACE};border:1px solid ${BORDER};border-radius:10px;padding:14px 16px;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;` });

  const myWrap = el("div", { style: "display:flex;flex-direction:column;gap:4px;" });
  myWrap.appendChild(el("label", { textContent: "Your Brand", style: `font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;` }));
  const myBrandSel = el<HTMLSelectElement>("select", { style: selectStyle() });
  POPULAR_BRANDS.forEach(b => {
    const opt = el<HTMLOptionElement>("option", { value: b, textContent: b });
    if (b === myBrand) opt.selected = true;
    myBrandSel.appendChild(opt);
  });
  myBrandSel.addEventListener("change", () => {
    myBrand = myBrandSel.value;
    competitors = competitors.filter(c => c !== myBrand);
    buildShell();
    fetchData();
  });
  myWrap.appendChild(myBrandSel);
  bar.appendChild(myWrap);

  const cWrap = el("div", { style: "display:flex;flex-direction:column;gap:4px;flex:1;min-width:240px;" });
  cWrap.appendChild(el("label", { textContent: "Competitors", style: `font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;` }));
  const chips = el("div", { style: "display:flex;flex-wrap:wrap;gap:6px;" });
  POPULAR_BRANDS.filter(b => b !== myBrand).forEach(b => {
    const active = competitors.includes(b);
    const chip = el<HTMLButtonElement>("button", { textContent: b, style: chipStyle(active) });
    chip.addEventListener("click", () => {
      if (competitors.includes(b)) competitors = competitors.filter(c => c !== b);
      else competitors.push(b);
      buildShell();
      fetchData();
    });
    chips.appendChild(chip);
  });
  cWrap.appendChild(chips);
  bar.appendChild(cWrap);

  const btWrap = el("div", { style: "display:flex;flex-direction:column;gap:4px;" });
  btWrap.appendChild(el("label", { textContent: "Body Type", style: `font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;` }));
  const btSel = el<HTMLSelectElement>("select", { style: selectStyle() });
  BODY_TYPES.forEach(b => {
    const opt = el<HTMLOptionElement>("option", { value: b, textContent: b });
    if (b === bodyType) opt.selected = true;
    btSel.appendChild(opt);
  });
  btSel.addEventListener("change", () => { bodyType = btSel.value; fetchData(); });
  btWrap.appendChild(btSel);
  bar.appendChild(btWrap);

  const stWrap = el("div", { style: "display:flex;flex-direction:column;gap:4px;" });
  stWrap.appendChild(el("label", { textContent: "State", style: `font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;` }));
  const stSel = el<HTMLSelectElement>("select", { style: selectStyle() });
  US_STATES.forEach(s => {
    const opt = el<HTMLOptionElement>("option", { value: s, textContent: s });
    if (s === stateFilter) opt.selected = true;
    stSel.appendChild(opt);
  });
  stSel.addEventListener("change", () => { stateFilter = stSel.value; fetchData(); });
  stWrap.appendChild(stSel);
  bar.appendChild(stWrap);

  return bar;
}

// ── Render Results ─────────────────────────────────────────────────────
function renderResults() {
  const results = document.getElementById("results-area");
  if (!results) return;
  results.innerHTML = "";

  if (isLoading) {
    results.appendChild(el("div", { textContent: "Loading depreciation data...", style: `padding:40px;text-align:center;color:${TEXT_SEC};font-size:14px;` }));
    return;
  }
  if (!currentData) {
    results.appendChild(el("div", { textContent: errorMsg || "No data available.", style: `padding:40px;text-align:center;color:${RED};font-size:14px;` }));
    return;
  }
  if (currentData.models.length === 0) {
    results.appendChild(el("div", {
      textContent: "No models match the selected filters. Try adding competitors or removing the body-type filter.",
      style: `padding:40px;text-align:center;color:${TEXT_SEC};font-size:14px;background:${SURFACE};border:1px solid ${BORDER};border-radius:10px;margin-top:16px;`,
    }));
    return;
  }

  results.appendChild(renderKpiStrip());
  results.appendChild(renderCurvesAndAlerts());
  results.appendChild(renderRankingAndSegments());
  results.appendChild(renderGeoHeatmap());
  results.appendChild(renderInsights());

  requestAnimationFrame(() => {
    renderCurveChart();
    renderSegmentChart();
  });
}

function renderKpiStrip(): HTMLElement {
  const data = currentData!;
  const wrap = el("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:16px;" });
  const totalSegVol = data.segments.reduce((s, x) => s + x.volume, 0);
  const segmentAvg = totalSegVol > 0
    ? +(data.segments.reduce((s, x) => s + x.avgResidualPct * x.volume, 0) / totalSegVol).toFixed(1)
    : 0;
  const delta = +(data.myBrandResidual - segmentAvg).toFixed(1);
  const cards = [
    { label: `${myBrand} Avg Residual`, value: `${data.myBrandResidual.toFixed(1)}%`, sub: delta >= 0 ? `+${delta}pp vs market` : `${delta}pp vs market`, color: delta >= 0 ? GREEN : RED },
    { label: "Best Performer", value: data.bestModel ? `${data.bestModel.make} ${data.bestModel.model}` : "—", sub: data.bestModel ? `${data.bestModel.residualPct.toFixed(1)}% residual` : "", color: GREEN },
    { label: "Fastest Depreciator", value: data.worstModel ? `${data.worstModel.make} ${data.worstModel.model}` : "—", sub: data.worstModel ? `${data.worstModel.residualPct.toFixed(1)}% residual` : "", color: RED },
    { label: "Models Tracked", value: data.models.length.toString(), sub: `${data.models.filter(m => m.isMyBrand).length} from ${myBrand}`, color: ACCENT },
  ];
  for (const c of cards) {
    const card = el("div", { style: `background:${SURFACE};border:1px solid ${BORDER};border-radius:10px;padding:14px 16px;` });
    card.appendChild(el("div", { textContent: c.label, style: `font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:6px;` }));
    card.appendChild(el("div", { textContent: c.value, style: `font-size:20px;font-weight:700;color:${TEXT_PRI};margin-bottom:4px;` }));
    if (c.sub) card.appendChild(el("div", { textContent: c.sub, style: `font-size:12px;color:${c.color};font-weight:600;` }));
    wrap.appendChild(card);
  }
  return wrap;
}

function renderCurvesAndAlerts(): HTMLElement {
  const wrap = el("div", { style: "display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-top:16px;" });

  const curvesPanel = el("div", { style: `background:${SURFACE};border:1px solid ${BORDER};border-radius:10px;overflow:hidden;display:flex;flex-direction:column;min-height:380px;` });
  const ch = el("div", { style: `padding:12px 16px;border-bottom:1px solid ${BORDER};display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;` });
  ch.appendChild(el("div", { textContent: "Depreciation Curves", style: `font-size:14px;font-weight:600;color:${TEXT_PRI};` }));
  const legend = el("div", { id: "curve-legend", style: "display:flex;flex-wrap:wrap;gap:10px;" });
  ch.appendChild(legend);
  curvesPanel.appendChild(ch);
  curveCanvas = el<HTMLCanvasElement>("canvas", { style: "width:100%;height:340px;display:block;" });
  curvesPanel.appendChild(curveCanvas);
  wrap.appendChild(curvesPanel);

  const alertsPanel = el("div", { style: `background:${SURFACE};border:1px solid ${BORDER};border-radius:10px;overflow:hidden;display:flex;flex-direction:column;` });
  const ah = el("div", { style: `padding:12px 16px;border-bottom:1px solid ${BORDER};` });
  ah.appendChild(el("div", { textContent: "Value Alerts", style: `font-size:14px;font-weight:600;color:${TEXT_PRI};` }));
  ah.appendChild(el("div", { textContent: "Models flagged for unusual value loss/retention", style: `font-size:11px;color:${TEXT_MUTED};margin-top:2px;` }));
  alertsPanel.appendChild(ah);
  const alertList = el("div", { style: "padding:8px 0;overflow-y:auto;max-height:340px;" });
  const data = currentData!;
  const fast = data.models.filter(m => m.alert === "fast").sort((a, b) => a.residualPct - b.residualPct).slice(0, 4);
  const slow = data.models.filter(m => m.alert === "slow").sort((a, b) => b.residualPct - a.residualPct).slice(0, 3);
  if (fast.length === 0 && slow.length === 0) {
    alertList.appendChild(el("div", { textContent: "No alerts — all models within normal range.", style: `padding:16px;color:${TEXT_MUTED};font-size:13px;text-align:center;` }));
  }
  for (const m of fast) alertList.appendChild(buildAlertRow(m, "fast"));
  for (const m of slow) alertList.appendChild(buildAlertRow(m, "slow"));
  alertsPanel.appendChild(alertList);
  wrap.appendChild(alertsPanel);

  return wrap;
}

function buildAlertRow(m: ModelResidual, type: "fast" | "slow"): HTMLElement {
  const isFast = type === "fast";
  const color = isFast ? RED : GREEN;
  const icon = isFast ? "&#9888;" : "&#9733;";
  const label = isFast ? "Fast Depreciation" : "Strong Retention";
  const row = el("div", { style: `padding:10px 16px;border-bottom:1px solid ${BORDER}33;display:flex;align-items:center;gap:10px;${m.isMyBrand ? `background:${ACCENT}0a;` : ""}` });
  const iconEl = el("div", { style: `width:32px;height:32px;border-radius:6px;background:${color}22;display:flex;align-items:center;justify-content:center;color:${color};font-size:14px;flex-shrink:0;`, innerHTML: icon });
  row.appendChild(iconEl);
  const info = el("div", { style: "flex:1;min-width:0;" });
  info.appendChild(el("div", { textContent: `${m.make} ${m.model}${m.isMyBrand ? " ★" : ""}`, style: `font-size:13px;font-weight:600;color:${TEXT_PRI};` }));
  info.appendChild(el("div", { textContent: `${label} · ${m.bodyType}`, style: `font-size:11px;color:${TEXT_MUTED};` }));
  row.appendChild(info);
  const right = el("div", { style: "text-align:right;" });
  right.appendChild(el("div", { textContent: `${m.residualPct.toFixed(1)}%`, style: `font-size:14px;font-weight:700;color:${color};` }));
  right.appendChild(el("div", { textContent: `$${m.usedPrice.toLocaleString()}`, style: `font-size:11px;color:${TEXT_MUTED};` }));
  row.appendChild(right);
  return row;
}

function renderRankingAndSegments(): HTMLElement {
  const wrap = el("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;" });

  const tablePanel = el("div", { style: `background:${SURFACE};border:1px solid ${BORDER};border-radius:10px;overflow:hidden;` });
  const th = el("div", { style: `padding:12px 16px;border-bottom:1px solid ${BORDER};` });
  th.appendChild(el("div", { textContent: "Model Residual Ranking", style: `font-size:14px;font-weight:600;color:${TEXT_PRI};` }));
  th.appendChild(el("div", { textContent: "Sorted by % of new price retained", style: `font-size:11px;color:${TEXT_MUTED};margin-top:2px;` }));
  tablePanel.appendChild(th);

  const data = currentData!;
  const sorted = [...data.models].sort((a, b) => b.residualPct - a.residualPct);
  const tbl = el("div", { style: "overflow-x:auto;" });
  const inner = el("div", { style: "min-width:520px;" });
  const hr = el("div", { style: `display:grid;grid-template-columns:30px 1fr 70px 90px 90px;padding:8px 16px;border-bottom:1px solid ${BORDER}55;` });
  ["#", "Model", "Body", "Used / New", "Residual"].forEach(c => {
    hr.appendChild(el("span", { textContent: c, style: `font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;` }));
  });
  inner.appendChild(hr);
  sorted.slice(0, 15).forEach((m, i) => {
    const row = el("div", { style: `display:grid;grid-template-columns:30px 1fr 70px 90px 90px;padding:8px 16px;border-bottom:1px solid ${BORDER}22;${i % 2 === 0 ? `background:${SURFACE_2}80;` : ""}${m.isMyBrand ? `border-left:3px solid ${ACCENT};` : ""}` });
    row.appendChild(el("span", { textContent: String(i + 1), style: `font-size:12px;color:${TEXT_MUTED};` }));
    const nameWrap = el("div");
    nameWrap.appendChild(el("div", { textContent: `${m.make} ${m.model}`, style: `font-size:13px;color:${m.isMyBrand ? ACCENT : TEXT_PRI};font-weight:${m.isMyBrand ? "700" : "500"};` }));
    nameWrap.appendChild(el("div", { textContent: `${m.soldVolume.toLocaleString()} sold`, style: `font-size:10px;color:${TEXT_MUTED};` }));
    row.appendChild(nameWrap);
    row.appendChild(el("span", { textContent: m.bodyType, style: `font-size:12px;color:${TEXT_SEC};` }));
    const priceWrap = el("div");
    priceWrap.appendChild(el("div", { textContent: `$${m.usedPrice.toLocaleString()}`, style: `font-size:12px;color:${TEXT_PRI};` }));
    priceWrap.appendChild(el("div", { textContent: `$${m.newPrice.toLocaleString()}`, style: `font-size:10px;color:${TEXT_MUTED};` }));
    row.appendChild(priceWrap);
    const resColor = m.residualPct >= 75 ? GREEN : m.residualPct <= 60 ? RED : AMBER;
    row.appendChild(el("span", {
      textContent: `${m.residualPct.toFixed(1)}%`,
      style: `font-size:12px;font-weight:700;color:${resColor};background:${resColor}1f;padding:3px 8px;border-radius:10px;text-align:center;display:inline-block;height:fit-content;align-self:start;`,
    }));
    inner.appendChild(row);
  });
  tbl.appendChild(inner);
  tablePanel.appendChild(tbl);
  wrap.appendChild(tablePanel);

  const segPanel = el("div", { style: `background:${SURFACE};border:1px solid ${BORDER};border-radius:10px;overflow:hidden;display:flex;flex-direction:column;min-height:300px;` });
  const sh = el("div", { style: `padding:12px 16px;border-bottom:1px solid ${BORDER};` });
  sh.appendChild(el("div", { textContent: "Segment Benchmark", style: `font-size:14px;font-weight:600;color:${TEXT_PRI};` }));
  sh.appendChild(el("div", { textContent: "Avg residual % by body type — your brand position highlighted", style: `font-size:11px;color:${TEXT_MUTED};margin-top:2px;` }));
  segPanel.appendChild(sh);
  segmentCanvas = el<HTMLCanvasElement>("canvas", { style: "width:100%;flex:1;height:240px;display:block;" });
  segPanel.appendChild(segmentCanvas);
  wrap.appendChild(segPanel);

  return wrap;
}

function renderGeoHeatmap(): HTMLElement {
  const data = currentData!;
  const wrap = el("div", { style: `background:${SURFACE};border:1px solid ${BORDER};border-radius:10px;overflow:hidden;margin-top:16px;` });
  const h = el("div", { style: `padding:12px 16px;border-bottom:1px solid ${BORDER};` });
  h.appendChild(el("div", { textContent: "Geographic Retention", style: `font-size:14px;font-weight:600;color:${TEXT_PRI};` }));
  h.appendChild(el("div", { textContent: `State-level price retention for ${myBrand} (100 = national avg)`, style: `font-size:11px;color:${TEXT_MUTED};margin-top:2px;` }));
  wrap.appendChild(h);

  if (data.states.length === 0) {
    wrap.appendChild(el("div", { textContent: "No state-level data available.", style: `padding:24px;color:${TEXT_MUTED};font-size:13px;text-align:center;` }));
    return wrap;
  }

  const grid = el("div", { style: "display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;padding:14px 16px;" });
  for (const s of data.states) {
    const idx = s.retentionIndex;
    let bg = `${TEXT_MUTED}1a`; let fg = TEXT_SEC;
    if (idx >= 105) { bg = `${GREEN}33`; fg = GREEN; }
    else if (idx >= 100) { bg = `${GREEN}1a`; fg = "#86efac"; }
    else if (idx >= 95) { bg = `${AMBER}1a`; fg = "#fcd34d"; }
    else { bg = `${RED}1a`; fg = "#fca5a5"; }
    const cell = el("div", { style: `background:${bg};border:1px solid ${fg}33;border-radius:8px;padding:10px 12px;` });
    cell.appendChild(el("div", { textContent: s.state, style: `font-size:13px;font-weight:700;color:${fg};margin-bottom:2px;` }));
    cell.appendChild(el("div", { textContent: `Index ${idx}`, style: `font-size:11px;color:${TEXT_PRI};font-weight:600;` }));
    cell.appendChild(el("div", { textContent: `$${s.avgUsedPrice.toLocaleString()}`, style: `font-size:11px;color:${TEXT_MUTED};` }));
    cell.appendChild(el("div", { textContent: `${s.volume.toLocaleString()} sold`, style: `font-size:10px;color:${TEXT_MUTED};` }));
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);
  return wrap;
}

function renderInsights(): HTMLElement {
  const data = currentData!;
  const wrap = el("div", { style: `background:${SURFACE};border:1px solid ${BORDER};border-radius:10px;padding:14px 18px;margin-top:16px;` });
  wrap.appendChild(el("div", { textContent: "Insights", style: `font-size:13px;font-weight:600;color:${ACCENT};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;` }));

  const insights: string[] = [];
  const totalSegVol = data.segments.reduce((s, x) => s + x.volume, 0);
  const segmentAvg = totalSegVol > 0
    ? +(data.segments.reduce((s, x) => s + x.avgResidualPct * x.volume, 0) / totalSegVol).toFixed(1)
    : 0;
  const delta = +(data.myBrandResidual - segmentAvg).toFixed(1);
  insights.push(`${myBrand}'s portfolio retains ${data.myBrandResidual.toFixed(1)}% of new value on average — ${delta >= 0 ? `${delta}pp ahead of` : `${Math.abs(delta)}pp behind`} the segment-weighted market.`);
  if (data.bestModel) insights.push(`${data.bestModel.make} ${data.bestModel.model} is the strongest residual in the comparison set at ${data.bestModel.residualPct.toFixed(1)}%.`);
  if (data.worstModel && data.worstModel.alert === "fast") insights.push(`${data.worstModel.make} ${data.worstModel.model} is depreciating fastest at ${data.worstModel.residualPct.toFixed(1)}% — flag for product/pricing intervention.`);
  const myFast = data.models.filter(m => m.isMyBrand && m.alert === "fast");
  if (myFast.length) insights.push(`${myFast.length} ${myBrand} model${myFast.length > 1 ? "s" : ""} flagged for fast depreciation: ${myFast.map(m => m.model).join(", ")}.`);
  const topState = data.states[0];
  if (topState) insights.push(`${topState.state} shows the strongest ${myBrand} price retention at index ${topState.retentionIndex} (avg $${topState.avgUsedPrice.toLocaleString()}).`);

  for (const ins of insights) {
    const row = el("div", { style: `padding:6px 0;font-size:13px;color:${TEXT_PRI};display:flex;gap:8px;line-height:1.5;` });
    row.appendChild(el("span", { textContent: "•", style: `color:${ACCENT};` }));
    row.appendChild(el("span", { textContent: ins }));
    wrap.appendChild(row);
  }
  return wrap;
}

// ── Canvas Rendering ───────────────────────────────────────────────────
function renderCurveChart() {
  if (!currentData || !curveCanvas) return;
  const data = currentData;
  const topModels = [...data.models].sort((a, b) => b.soldVolume - a.soldVolume).slice(0, 6);
  if (!topModels.length) return;

  const rect = curveCanvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  if (w <= 0 || h <= 0) return;
  const dpr = window.devicePixelRatio || 1;
  curveCanvas.width = w * dpr;
  curveCanvas.height = h * dpr;
  const ctx = curveCanvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = { top: 18, right: 28, bottom: 36, left: 60 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  if (chartW <= 0 || chartH <= 0) return;

  const months = curveAge;
  const yMin = 50; const yMax = 105;
  const xScale = (m: number) => pad.left + (m / months) * chartW;
  const yScale = (v: number) => pad.top + chartH - ((v - yMin) / (yMax - yMin)) * chartH;

  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 5; i++) {
    const yVal = yMin + ((yMax - yMin) * i) / 5;
    const y = yScale(yVal);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = "11px -apple-system,sans-serif";
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText(`${yVal.toFixed(0)}%`, pad.left - 6, y);
  }
  ctx.fillStyle = TEXT_MUTED;
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (let m = 0; m <= months; m += 6) {
    ctx.fillText(`${m}mo`, xScale(m), pad.top + chartH + 6);
  }

  topModels.forEach((m, idx) => {
    const color = m.isMyBrand ? COLORS[0] : COLORS[(idx + 1) % COLORS.length];
    const lw = m.isMyBrand ? 3 : 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath();
    m.curve.forEach((p, j) => {
      const x = xScale(p.month);
      const y = yScale(p.pctOfNew);
      if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const last = m.curve[m.curve.length - 1];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(xScale(last.month), yScale(last.pctOfNew), 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  if (hoveredMonth !== null) {
    const hm = hoveredMonth;
    const x = xScale(hm);
    ctx.strokeStyle = TEXT_MUTED;
    ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + chartH); ctx.stroke();
    ctx.setLineDash([]);

    const tipW = 200;
    const tipH = 18 + topModels.length * 16;
    let tx = x + 10;
    if (tx + tipW > w - pad.right) tx = x - tipW - 10;
    const ty = pad.top + 8;
    ctx.fillStyle = "rgba(15,23,42,0.96)";
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    roundRect(ctx, tx, ty, tipW, tipH, 6); ctx.fill(); ctx.stroke();

    ctx.fillStyle = TEXT_PRI;
    ctx.font = "bold 11px -apple-system,sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(`Month ${hm}`, tx + 10, ty + 6);
    topModels.forEach((m, i) => {
      const color = m.isMyBrand ? COLORS[0] : COLORS[(i + 1) % COLORS.length];
      const pt = m.curve[hm];
      if (!pt) return;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(tx + 14, ty + 24 + i * 16, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = TEXT_SEC;
      ctx.font = "11px -apple-system,sans-serif";
      ctx.fillText(`${m.make} ${m.model}: ${pt.pctOfNew.toFixed(1)}%`, tx + 22, ty + 20 + i * 16);
    });
  }

  curveCanvas.onmousemove = (e: MouseEvent) => {
    const r = curveCanvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    if (mx < pad.left || mx > w - pad.right) {
      if (hoveredMonth !== null) { hoveredMonth = null; renderCurveChart(); }
      return;
    }
    const mn = Math.round((mx - pad.left) / chartW * months);
    hoveredMonth = Math.max(0, Math.min(months, mn));
    renderCurveChart();
  };
  curveCanvas.onmouseleave = () => { hoveredMonth = null; renderCurveChart(); };

  const legend = document.getElementById("curve-legend");
  if (legend) {
    legend.innerHTML = "";
    topModels.forEach((m, idx) => {
      const color = m.isMyBrand ? COLORS[0] : COLORS[(idx + 1) % COLORS.length];
      const item = el("div", { style: "display:flex;align-items:center;gap:5px;" });
      item.appendChild(el("span", { style: `width:12px;height:3px;background:${color};border-radius:2px;display:inline-block;` }));
      item.appendChild(el("span", { textContent: `${m.make} ${m.model}${m.isMyBrand ? " ★" : ""}`, style: `font-size:11px;color:${m.isMyBrand ? ACCENT : TEXT_SEC};font-weight:${m.isMyBrand ? "600" : "400"};` }));
      legend.appendChild(item);
    });
  }
}

function renderSegmentChart() {
  if (!currentData || !segmentCanvas) return;
  const data = currentData;
  const segs = data.segments.slice(0, 8);
  if (!segs.length) return;

  const rect = segmentCanvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  if (w <= 0 || h <= 0) return;
  const dpr = window.devicePixelRatio || 1;
  segmentCanvas.width = w * dpr;
  segmentCanvas.height = h * dpr;
  const ctx = segmentCanvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = { top: 14, right: 60, bottom: 14, left: 90 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  if (chartW <= 0 || chartH <= 0) return;

  const maxPct = Math.max(...segs.map(s => s.avgResidualPct), 100);
  const xMax = Math.min(100, Math.ceil(maxPct / 5) * 5 + 5);

  const myBodyTypes = new Set(data.models.filter(m => m.isMyBrand).map(m => m.bodyType));

  const barH = Math.max(16, Math.min(28, (chartH - (segs.length - 1) * 6) / segs.length));
  const gap = (chartH - barH * segs.length) / Math.max(segs.length - 1, 1);

  segs.forEach((s, i) => {
    const y = pad.top + i * (barH + gap);
    const barW = (s.avgResidualPct / xMax) * chartW;
    const isHi = myBodyTypes.has(s.bodyType);

    ctx.fillStyle = isHi ? TEXT_PRI : TEXT_SEC;
    ctx.font = `${isHi ? "600" : "400"} 12px -apple-system,sans-serif`;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText(s.bodyType, pad.left - 8, y + barH / 2);

    ctx.fillStyle = `${BORDER}40`;
    roundRect(ctx, pad.left, y, chartW, barH, 4); ctx.fill();

    const t = s.avgResidualPct / xMax;
    const r = Math.round(239 - t * (239 - 34));
    const g = Math.round(68 + t * (211 - 68));
    const b = Math.round(68 + t * (153 - 68));
    const barColor = `rgb(${r},${g},${b})`;
    ctx.fillStyle = isHi ? barColor : barColor + "aa";
    roundRect(ctx, pad.left, y, barW, barH, 4); ctx.fill();
    if (isHi) {
      ctx.strokeStyle = barColor;
      ctx.lineWidth = 1.5;
      roundRect(ctx, pad.left, y, barW, barH, 4); ctx.stroke();
    }

    ctx.fillStyle = isHi ? TEXT_PRI : TEXT_SEC;
    ctx.font = "11px -apple-system,sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(`${s.avgResidualPct.toFixed(1)}%`, pad.left + barW + 6, y + barH / 2);
  });
}

// ── Helpers ────────────────────────────────────────────────────────────
function el<T extends HTMLElement = HTMLElement>(tag: string, props?: Record<string, unknown>): T {
  const element = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (k === "style" && typeof v === "string") element.style.cssText = v;
      else if (k === "textContent") element.textContent = v as string;
      else if (k === "innerHTML") element.innerHTML = v as string;
      else if (k.startsWith("on") && typeof v === "function") element.addEventListener(k.slice(2), v as EventListener);
      else if (k === "id" || k === "value" || k === "selected") (element as any)[k] = v;
      else element.setAttribute(k, String(v));
    }
  }
  return element as T;
}

function selectStyle(): string {
  return `padding:7px 10px;font-size:13px;background:${SURFACE_2};color:${TEXT_PRI};border:1px solid ${BORDER};border-radius:6px;outline:none;cursor:pointer;min-width:140px;`;
}

function chipStyle(active: boolean): string {
  return `padding:5px 10px;font-size:12px;border:1px solid ${active ? ACCENT : BORDER};border-radius:14px;cursor:pointer;font-weight:500;background:${active ? ACCENT + "22" : "transparent"};color:${active ? ACCENT : TEXT_SEC};transition:all 0.15s;`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

let resizeTimer: ReturnType<typeof setTimeout>;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { renderCurveChart(); renderSegmentChart(); }, 100);
});

init();
