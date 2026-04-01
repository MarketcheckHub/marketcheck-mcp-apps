import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "used-car-market-index" }); } catch {}

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
  if (_safeApp) return "mcp";
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

async function _fetchDirect(args) {
  const [summary, segments] = await Promise.all([
    _mcSold({ranking_dimensions:"make",ranking_measure:"sold_count",inventory_type:"Used",top_n:25,...(args.state?{state:args.state}:{})}),
    _mcSold({ranking_dimensions:"body_type",ranking_measure:"sold_count",inventory_type:"Used",...(args.state?{state:args.state}:{})}),
  ]);
  return {summary,segments};
}

function _transformRawToMarketData(raw: any): MarketData | null {
  const summaryRows = raw.summary?.data ?? [];
  const segmentRows = raw.segments?.data ?? [];
  if (!summaryRows.length && !segmentRows.length) return null;

  const months = timeRangeToMonths(state.timeRange);

  // Aggregate make data across states
  const makeMap: Record<string, { sold: number; totalPrice: number; count: number; avgDom: number }> = {};
  for (const r of summaryRows) {
    const make = r.make ?? "";
    if (!make) continue;
    if (!makeMap[make]) makeMap[make] = { sold: 0, totalPrice: 0, count: 0, avgDom: 0 };
    makeMap[make].sold += r.sold_count ?? 0;
    makeMap[make].totalPrice += (r.average_sale_price ?? 0) * (r.sold_count ?? 0);
    makeMap[make].count += r.sold_count ?? 0;
    makeMap[make].avgDom += (r.average_days_on_market ?? 0) * (r.sold_count ?? 0);
  }

  // Build composite from all makes
  let totalVolume = 0;
  let totalPriceWeighted = 0;
  const makeEntries: { make: string; avgPrice: number; volume: number }[] = [];
  for (const [make, v] of Object.entries(makeMap)) {
    const avg = v.count > 0 ? v.totalPrice / v.count : 0;
    totalVolume += v.sold;
    totalPriceWeighted += v.totalPrice;
    makeEntries.push({ make, avgPrice: Math.round(avg), volume: v.sold });
  }
  makeEntries.sort((a, b) => b.volume - a.volume);

  const compositePrice = totalVolume > 0 ? Math.round(totalPriceWeighted / totalVolume) : 28000;
  const compositeTS = _buildTimeSeries(compositePrice, months, 2);

  // Segment indices from body_type data
  const segMap: Record<string, { sold: number; totalPrice: number; count: number }> = {};
  for (const r of segmentRows) {
    const bt = r.body_type ?? "";
    if (!bt) continue;
    if (!segMap[bt]) segMap[bt] = { sold: 0, totalPrice: 0, count: 0 };
    segMap[bt].sold += r.sold_count ?? 0;
    segMap[bt].totalPrice += (r.average_sale_price ?? 0) * (r.sold_count ?? 0);
    segMap[bt].count += r.sold_count ?? 0;
  }
  const segmentIndices: SegmentIndex[] = Object.entries(segMap)
    .sort((a, b) => b[1].sold - a[1].sold)
    .slice(0, 6)
    .map(([name, v]) => {
      const avg = v.count > 0 ? v.totalPrice / v.count : 0;
      const ts = _buildTimeSeries(avg, months, 3);
      const last = ts[ts.length - 1]?.close ?? avg;
      const prev = ts.length >= 2 ? ts[ts.length - 2].close : last;
      return { name: name + " Index", currentPrice: Math.round(avg), change: Math.round(last - prev), changePct: prev ? +((last - prev) / prev * 100).toFixed(1) : 0 };
    });

  // Movers from top makes
  const moversData = makeEntries.slice(0, 20).map(m => {
    const ts = _buildTimeSeries(m.avgPrice, months, 4);
    const last = ts[ts.length - 1]?.close ?? m.avgPrice;
    const prev = ts.length >= 2 ? ts[ts.length - 2].close : last;
    return { symbol: m.make, name: m.make, currentPrice: m.avgPrice, changePct: prev ? +((last - prev) / prev * 100).toFixed(1) : 0, volume: m.volume, timeSeries: ts };
  });
  const gainers = [...moversData].sort((a, b) => +b.changePct - +a.changePct).slice(0, 10);
  const losers = [...moversData].sort((a, b) => +a.changePct - +b.changePct).slice(0, 10);
  const active = [...moversData].sort((a, b) => b.volume - a.volume).slice(0, 10);

  // Geographic data from state-level summary rows
  const stateMap: Record<string, { totalPrice: number; count: number; vol: number }> = {};
  for (const r of summaryRows) {
    const st = r.state ?? "";
    if (!st) continue;
    if (!stateMap[st]) stateMap[st] = { totalPrice: 0, count: 0, vol: 0 };
    stateMap[st].totalPrice += (r.average_sale_price ?? 0) * (r.sold_count ?? 0);
    stateMap[st].count += r.sold_count ?? 0;
    stateMap[st].vol += r.sold_count ?? 0;
  }
  // Map state abbreviations back to full names
  const abbrToFull: Record<string, string> = {};
  for (const [full, abbr] of Object.entries(STATE_ABBR)) abbrToFull[abbr] = full;
  const geographicData: GeoEntry[] = Object.entries(stateMap)
    .map(([st, v]) => ({ state: abbrToFull[st] ?? st, avgPrice: v.count > 0 ? Math.round(v.totalPrice / v.count) : 0, volume: v.vol, changePct: 0 }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 15);

  // Heatmap
  const bodyTypes = Object.keys(segMap).slice(0, 5);
  const priceTiers = ["$0-15K", "$15-25K", "$25-35K", "$35-50K", "$50K+"];
  const sectorHeatmap: HeatmapCell[] = [];
  for (const bt of bodyTypes) {
    for (const pt of priceTiers) sectorHeatmap.push({ bodyType: bt, priceTier: pt, changePct: 0 });
  }

  // Watchlist
  const watchlistSymbols = ["Toyota", "Ford", "Honda", "BMW", "Tesla"];
  const watchlist: TickerEntry[] = watchlistSymbols.map(sym => {
    const found = moversData.find(m => m.symbol === sym);
    if (found) return { ...found, change: Math.round(found.currentPrice * +found.changePct / 100), volumeChangePct: 0 };
    return { symbol: sym, name: sym, currentPrice: 0, change: 0, changePct: 0, volume: 0, volumeChangePct: 0, timeSeries: [] };
  }).filter(w => w.currentPrice > 0);

  const lastC = compositeTS[compositeTS.length - 1]?.close ?? compositePrice;
  const prevC = compositeTS.length >= 2 ? compositeTS[compositeTS.length - 2].close : lastC;

  return {
    compositeIndex: {
      symbol: "MC_USED_CAR_IDX", name: "MC Used Car Index",
      currentPrice: compositePrice, change: Math.round(lastC - prevC),
      changePct: prevC ? +((lastC - prevC) / prevC * 100).toFixed(1) : 0,
      volume: totalVolume, volumeChangePct: 0, timeSeries: compositeTS,
    },
    segmentIndices, totalVolume, volumeMoM: 0,
    movers: { gainers, losers, active },
    sectorHeatmap, geographicData, watchlist,
  };
}

// Build a simple time series that trends toward the target price
function _buildTimeSeries(targetPrice: number, months: number, volatility: number): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = [];
  const startPrice = targetPrice * (1 + (Math.random() - 0.5) * 0.1);
  const now = new Date();
  for (let i = months; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const progress = (months - i) / Math.max(months, 1);
    const price = startPrice + (targetPrice - startPrice) * progress + (Math.random() - 0.5) * volatility * targetPrice * 0.01;
    const rounded = Math.round(price);
    points.push({
      date: d.toISOString().slice(0, 10),
      close: rounded,
      high: Math.round(rounded * 1.02),
      low: Math.round(rounded * 0.98),
      volume: Math.floor(5000 + Math.random() * 15000),
    });
  }
  return points;
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
        const d = _transformRawToMarketData(raw);
        if (d) return { content: [{ type: "text", text: JSON.stringify(d) }] };
      }
    } catch {}
    // 2. Direct API fallback
    try {
      const raw = await _fetchDirect(args);
      if (raw) {
        const d = _transformRawToMarketData(raw);
        if (d) return { content: [{ type: "text", text: JSON.stringify(d) }] };
      }
    } catch {}
    return null;
  }
  // 3. MCP mode — only when no auth
  if (_safeApp) {
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

(_safeApp as any)?.connect?.();

// ─── Types ──────────────────────────────────────────────────────────────────

interface TimeSeriesPoint {
  date: string;
  close: number;
  high: number;
  low: number;
  volume: number;
}

interface TickerEntry {
  symbol: string;
  name: string;
  currentPrice: number;
  change: number;
  changePct: number;
  volume: number;
  volumeChangePct: number;
  timeSeries: TimeSeriesPoint[];
}

interface SegmentIndex {
  name: string;
  currentPrice: number;
  change: number;
  changePct: number;
}

interface MoverEntry {
  symbol: string;
  name: string;
  currentPrice: number;
  changePct: number;
  volume: number;
}

interface HeatmapCell {
  bodyType: string;
  priceTier: string;
  changePct: number;
}

interface GeoEntry {
  state: string;
  avgPrice: number;
  volume: number;
  changePct: number;
}

interface MarketData {
  compositeIndex: TickerEntry;
  segmentIndices: SegmentIndex[];
  totalVolume: number;
  volumeMoM: number;
  movers: { gainers: MoverEntry[]; losers: MoverEntry[]; active: MoverEntry[] };
  sectorHeatmap: HeatmapCell[];
  geographicData: GeoEntry[];
  tickerData?: TickerEntry;
  watchlist: TickerEntry[];
}

// ─── State ──────────────────────────────────────────────────────────────────

let state = {
  country: "US" as "US" | "UK",
  geography: "National",
  timeRange: "6M",
  ticker: null as string | null,
  segment: null as string | null,
  moversTab: "gainers" as "gainers" | "losers" | "active",
  chartMode: "absolute" as "absolute" | "indexed",
  overlayTickers: [] as string[],
  data: null as MarketData | null,
};

// ─── US States ──────────────────────────────────────────────────────────────

const US_STATES = [
  "National","Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas",
  "Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota",
  "Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey",
  "New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon",
  "Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas",
  "Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"
];

const STATE_ABBR: Record<string, string> = {
  "Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO",
  "Connecticut":"CT","Delaware":"DE","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID",
  "Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA",
  "Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN",
  "Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV",
  "New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY",
  "North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR",
  "Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD",
  "Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT","Virginia":"VA",
  "Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY"
};

// ─── Popular makes/models for search ────────────────────────────────────────

const POPULAR_TICKERS = [
  "Toyota","Honda","Ford","Chevrolet","BMW","Mercedes-Benz","Nissan","Hyundai","Kia","Subaru",
  "Volkswagen","Audi","Lexus","Mazda","Jeep","Ram","GMC","Dodge","Tesla","Volvo",
  "Toyota:RAV4","Toyota:Camry","Toyota:Corolla","Toyota:Highlander","Toyota:Tacoma",
  "Honda:CR-V","Honda:Civic","Honda:Accord","Honda:Pilot",
  "Ford:F-150","Ford:Explorer","Ford:Escape","Ford:Bronco",
  "Chevrolet:Silverado","Chevrolet:Equinox","Chevrolet:Tahoe",
  "BMW:3 Series","BMW:X3","BMW:X5",
  "Mercedes-Benz:C-Class","Mercedes-Benz:GLC","Mercedes-Benz:GLE",
  "Tesla:Model 3","Tesla:Model Y","Tesla:Model S",
  "Jeep:Wrangler","Jeep:Grand Cherokee",
  "Nissan:Rogue","Hyundai:Tucson","Kia:Sportage","Subaru:Outback",
];

// ─── Mock Data Generator ────────────────────────────────────────────────────

function generateMockTimeSeries(basePrice: number, months: number, volatility: number, trend: number): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = [];
  let price = basePrice;
  const now = new Date();
  for (let i = months; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const change = (Math.random() - 0.5) * volatility + trend;
    price = Math.max(price * (1 + change / 100), 1000);
    const vol = Math.floor(50000 + Math.random() * 30000);
    points.push({
      date: dateStr,
      close: Math.round(price),
      high: Math.round(price * (1 + Math.random() * 0.05)),
      low: Math.round(price * (1 - Math.random() * 0.05)),
      volume: vol,
    });
  }
  return points;
}

function timeRangeToMonths(range: string): number {
  switch (range) {
    case "1M": return 1;
    case "3M": return 3;
    case "6M": return 6;
    case "1Y": return 12;
    case "2Y": return 24;
    default: return 6;
  }
}

function generateMockData(): MarketData {
  const months = timeRangeToMonths(state.timeRange);
  const compositeTS = generateMockTimeSeries(28500, months, 3, -0.3);
  const lastComposite = compositeTS[compositeTS.length - 1]?.close ?? 28500;
  const prevComposite = compositeTS.length >= 2 ? compositeTS[compositeTS.length - 2].close : lastComposite;
  const compositeChange = lastComposite - prevComposite;
  const compositePct = prevComposite !== 0 ? (compositeChange / prevComposite) * 100 : 0;

  const segmentDefs = [
    { name: "SUV Index", base: 34200, vol: 4, trend: 0.2 },
    { name: "Sedan Index", base: 22800, vol: 3, trend: -0.5 },
    { name: "Truck Index", base: 38500, vol: 5, trend: 0.4 },
    { name: "EV Index", base: 41200, vol: 8, trend: -1.2 },
    { name: "Luxury Index", base: 52800, vol: 6, trend: -0.8 },
  ];

  const segmentIndices: SegmentIndex[] = segmentDefs.map(s => {
    const ts = generateMockTimeSeries(s.base, months, s.vol, s.trend);
    const last = ts[ts.length - 1]?.close ?? s.base;
    const prev = ts.length >= 2 ? ts[ts.length - 2].close : last;
    return {
      name: s.name,
      currentPrice: last,
      change: last - prev,
      changePct: prev !== 0 ? ((last - prev) / prev) * 100 : 0,
    };
  });

  const makeModels = [
    { sym: "Toyota:RAV4", name: "Toyota RAV4", base: 31200 },
    { sym: "Ford:F-150", name: "Ford F-150", base: 42800 },
    { sym: "Honda:CR-V", name: "Honda CR-V", base: 29400 },
    { sym: "Tesla:Model Y", name: "Tesla Model Y", base: 44200 },
    { sym: "Chevrolet:Silverado", name: "Chevy Silverado", base: 41500 },
    { sym: "Toyota:Camry", name: "Toyota Camry", base: 24800 },
    { sym: "Honda:Civic", name: "Honda Civic", base: 22100 },
    { sym: "Jeep:Wrangler", name: "Jeep Wrangler", base: 36700 },
    { sym: "BMW:X3", name: "BMW X3", base: 38900 },
    { sym: "Subaru:Outback", name: "Subaru Outback", base: 28600 },
    { sym: "Nissan:Rogue", name: "Nissan Rogue", base: 27300 },
    { sym: "Hyundai:Tucson", name: "Hyundai Tucson", base: 27800 },
    { sym: "Kia:Sportage", name: "Kia Sportage", base: 26500 },
    { sym: "Mercedes-Benz:GLC", name: "MB GLC", base: 42100 },
    { sym: "Ford:Bronco", name: "Ford Bronco", base: 39800 },
    { sym: "Mazda:CX-5", name: "Mazda CX-5", base: 27200 },
    { sym: "Lexus:RX", name: "Lexus RX", base: 44300 },
    { sym: "Toyota:Tacoma", name: "Toyota Tacoma", base: 35600 },
    { sym: "Dodge:Charger", name: "Dodge Charger", base: 32400 },
    { sym: "Audi:Q5", name: "Audi Q5", base: 40200 },
  ];

  const moversData = makeModels.map(mm => {
    const ts = generateMockTimeSeries(mm.base, months, 5, (Math.random() - 0.5) * 3);
    const last = ts[ts.length - 1]?.close ?? mm.base;
    const prev = ts.length >= 2 ? ts[ts.length - 2].close : last;
    const vol = ts[ts.length - 1]?.volume ?? 50000;
    return {
      symbol: mm.sym,
      name: mm.name,
      currentPrice: last,
      changePct: prev !== 0 ? ((last - prev) / prev) * 100 : 0,
      volume: vol,
      timeSeries: ts,
    };
  });

  const gainers = [...moversData].sort((a, b) => b.changePct - a.changePct).slice(0, 10);
  const losers = [...moversData].sort((a, b) => a.changePct - b.changePct).slice(0, 10);
  const active = [...moversData].sort((a, b) => b.volume - a.volume).slice(0, 10);

  const bodyTypes = ["SUV", "Sedan", "Truck", "Coupe", "Van"];
  const priceTiers = ["$0-15K", "$15-25K", "$25-35K", "$35-50K", "$50K+"];
  const heatmap: HeatmapCell[] = [];
  for (const bt of bodyTypes) {
    for (const pt of priceTiers) {
      heatmap.push({
        bodyType: bt,
        priceTier: pt,
        changePct: (Math.random() - 0.45) * 10,
      });
    }
  }

  const geoStates = ["California","Texas","Florida","New York","Illinois","Pennsylvania","Ohio","Georgia","Michigan","North Carolina","New Jersey","Virginia","Washington","Arizona","Massachusetts"];
  const geoData: GeoEntry[] = geoStates.map(s => ({
    state: s,
    avgPrice: Math.round(24000 + Math.random() * 16000),
    volume: Math.floor(5000 + Math.random() * 25000),
    changePct: (Math.random() - 0.45) * 8,
  })).sort((a, b) => b.volume - a.volume);

  let tickerData: TickerEntry | undefined;
  if (state.ticker) {
    const found = moversData.find(m => m.symbol === state.ticker);
    if (found) {
      tickerData = {
        ...found,
        change: found.currentPrice * found.changePct / 100,
        volumeChangePct: (Math.random() - 0.5) * 20,
      };
    } else {
      const base = 25000 + Math.random() * 20000;
      const ts = generateMockTimeSeries(base, months, 5, (Math.random() - 0.5) * 2);
      const last = ts[ts.length - 1]?.close ?? base;
      const prev = ts.length >= 2 ? ts[ts.length - 2].close : last;
      tickerData = {
        symbol: state.ticker,
        name: state.ticker.replace(":", " "),
        currentPrice: last,
        change: last - prev,
        changePct: prev !== 0 ? ((last - prev) / prev) * 100 : 0,
        volume: Math.floor(30000 + Math.random() * 40000),
        volumeChangePct: (Math.random() - 0.5) * 20,
        timeSeries: ts,
      };
    }
  }

  const totalVol = compositeTS.reduce((sum, p) => sum + p.volume, 0);

  const watchlistSymbols = ["Toyota:RAV4","Ford:F-150","Tesla:Model Y","Honda:CR-V","BMW:X3"];
  const watchlist: TickerEntry[] = watchlistSymbols.map(sym => {
    const found = moversData.find(m => m.symbol === sym);
    if (found) {
      return { ...found, change: found.currentPrice * found.changePct / 100, volumeChangePct: (Math.random() - 0.5) * 15 };
    }
    return {
      symbol: sym, name: sym.replace(":", " "), currentPrice: 30000, change: 200,
      changePct: 0.67, volume: 45000, volumeChangePct: 3.2, timeSeries: generateMockTimeSeries(30000, months, 3, 0.1),
    };
  });

  return {
    compositeIndex: {
      symbol: "MC_USED_CAR_IDX",
      name: "MC Used Car Index",
      currentPrice: lastComposite,
      change: compositeChange,
      changePct: compositePct,
      volume: totalVol,
      volumeChangePct: (Math.random() - 0.5) * 10,
      timeSeries: compositeTS,
    },
    segmentIndices,
    totalVolume: totalVol,
    volumeMoM: (Math.random() - 0.5) * 15,
    movers: { gainers, losers, active },
    sectorHeatmap: heatmap,
    geographicData: geoData,
    tickerData,
    watchlist,
  };
}

// ─── Data Loading ───────────────────────────────────────────────────────────

async function loadData(): Promise<MarketData> {
  try {
    const result = await _callTool("get-market-index", {
      country: state.country,
      geography: state.geography.toLowerCase() === "national" ? "national" : state.geography,
      timeRange: state.timeRange,
      ticker: state.ticker ?? undefined,
      segment: state.segment ?? undefined,
    });
    if (result && typeof result === "object") {
      const text = (result as any).content?.[0]?.text;
      if (text) {
        try {
          const parsed = JSON.parse(text);
          if (parsed.compositeIndex) return parsed as MarketData;
        } catch { /* fall through to mock */ }
      }
    }
  } catch {
    // API not available, fall through
  }
  return generateMockData();
}

// ─── Format helpers ─────────────────────────────────────────────────────────

function fmtCurrency(v: number): string {
  return "$" + Math.round(v).toLocaleString();
}
function fmtCompact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return "$" + (v / 1_000_000).toFixed(1) + "M";
  if (Math.abs(v) >= 1_000) return "$" + (v / 1_000).toFixed(1) + "K";
  return "$" + Math.round(v).toLocaleString();
}
function fmtPct(v: number): string {
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}
function fmtChange(v: number): string {
  return (v >= 0 ? "+" : "") + "$" + Math.abs(Math.round(v)).toLocaleString();
}
function fmtVolume(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return String(v);
}
function changeColor(v: number): string {
  return v >= 0 ? "#10b981" : "#ef4444";
}
function heatColor(pct: number): string {
  if (pct >= 3) return "#166534";
  if (pct >= 1) return "#15803d";
  if (pct >= 0) return "#1e3a2f";
  if (pct >= -1) return "#3b1c1c";
  if (pct >= -3) return "#991b1b";
  return "#7f1d1d";
}

// ─── Canvas Chart ───────────────────────────────────────────────────────────

class MarketChart {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  private data: TimeSeriesPoint[] = [];
  private overlayData: { label: string; color: string; points: TimeSeriesPoint[] }[] = [];
  private mode: "absolute" | "indexed" = "absolute";
  private hoveredIndex: number = -1;
  private animFrame: number = 0;

  private readonly PADDING = { top: 30, right: 80, bottom: 70, left: 70 };
  private readonly CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"];
  private readonly VOLUME_HEIGHT = 60;

  constructor(container: HTMLElement, width: number, height: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "display:block;width:100%;cursor:crosshair;";
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    this.dpr = window.devicePixelRatio || 1;
    this.resize(width, height);

    this.canvas.addEventListener("mousemove", (e) => this.onMouseMove(e));
    this.canvas.addEventListener("mouseleave", () => { this.hoveredIndex = -1; this.scheduleRender(); });
    window.addEventListener("resize", () => {
      const rect = container.getBoundingClientRect();
      this.resize(rect.width, height);
    });
  }

  resize(w: number, h: number) {
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.scheduleRender();
  }

  setData(data: TimeSeriesPoint[], overlays: { label: string; color: string; points: TimeSeriesPoint[] }[] = [], mode: "absolute" | "indexed" = "absolute") {
    this.data = data;
    this.overlayData = overlays;
    this.mode = mode;
    this.hoveredIndex = -1;
    this.scheduleRender();
  }

  private scheduleRender() {
    cancelAnimationFrame(this.animFrame);
    this.animFrame = requestAnimationFrame(() => this.render());
  }

  private getTransformedPoints(pts: TimeSeriesPoint[]): number[] {
    if (this.mode === "indexed" && pts.length > 0) {
      const base = pts[0].close;
      return pts.map(p => base !== 0 ? (p.close / base) * 100 : 100);
    }
    return pts.map(p => p.close);
  }

  private render() {
    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    const { top, right, bottom, left } = this.PADDING;
    const chartW = w - left - right;
    const chartH = h - top - bottom - this.VOLUME_HEIGHT;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, w, h);

    if (this.data.length === 0) {
      ctx.fillStyle = "#64748b";
      ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No data available", w / 2, h / 2);
      return;
    }

    // Compute ranges across all series
    const allSeries = [this.getTransformedPoints(this.data), ...this.overlayData.map(o => this.getTransformedPoints(o.points))];
    let minPrice = Infinity, maxPrice = -Infinity;
    for (const series of allSeries) {
      for (const v of series) {
        if (v < minPrice) minPrice = v;
        if (v > maxPrice) maxPrice = v;
      }
    }
    const pricePad = (maxPrice - minPrice) * 0.08 || 100;
    minPrice -= pricePad;
    maxPrice += pricePad;

    let maxVol = 0;
    for (const p of this.data) {
      if (p.volume > maxVol) maxVol = p.volume;
    }

    const n = this.data.length;
    const xStep = n > 1 ? chartW / (n - 1) : chartW;

    const toX = (i: number) => left + (n > 1 ? i * xStep : chartW / 2);
    const toY = (v: number) => top + chartH - ((v - minPrice) / (maxPrice - minPrice)) * chartH;
    const toVolY = (v: number) => h - bottom + this.VOLUME_HEIGHT - (maxVol > 0 ? (v / maxVol) * this.VOLUME_HEIGHT * 0.8 : 0);

    // Grid lines
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    const numGridLines = 5;
    for (let i = 0; i <= numGridLines; i++) {
      const y = top + (chartH / numGridLines) * i;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(w - right, y);
      ctx.stroke();

      const val = maxPrice - ((maxPrice - minPrice) / numGridLines) * i;
      ctx.fillStyle = "#64748b";
      ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "right";
      if (this.mode === "indexed") {
        ctx.fillText(val.toFixed(1), left - 8, y + 4);
      } else {
        ctx.fillText(fmtCompact(val), left - 8, y + 4);
      }
    }

    // X axis labels
    ctx.fillStyle = "#64748b";
    ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    const labelInterval = Math.max(1, Math.floor(n / 8));
    for (let i = 0; i < n; i += labelInterval) {
      const x = toX(i);
      const label = this.data[i].date;
      const parts = label.split("-");
      const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const dispLabel = monthNames[parseInt(parts[1]) - 1] + " " + parts[0].slice(2);
      ctx.fillText(dispLabel, x, h - bottom + this.VOLUME_HEIGHT + 15);
    }

    // Volume bars
    const barWidth = Math.max(2, xStep * 0.5);
    for (let i = 0; i < n; i++) {
      const x = toX(i);
      const volTop = toVolY(this.data[i].volume);
      const volBot = h - bottom + this.VOLUME_HEIGHT;
      const prevClose = i > 0 ? this.data[i - 1].close : this.data[i].close;
      ctx.fillStyle = this.data[i].close >= prevClose ? "#10b98144" : "#ef444444";
      ctx.fillRect(x - barWidth / 2, volTop, barWidth, volBot - volTop);
    }

    // Area fill + line for primary series
    const drawSeries = (pts: TimeSeriesPoint[], values: number[], color: string, fill: boolean) => {
      if (values.length === 0) return;
      ctx.beginPath();
      ctx.moveTo(toX(0), toY(values[0]));
      for (let i = 1; i < values.length; i++) {
        ctx.lineTo(toX(i), toY(values[i]));
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();

      if (fill) {
        ctx.lineTo(toX(values.length - 1), top + chartH);
        ctx.lineTo(toX(0), top + chartH);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, top, 0, top + chartH);
        grad.addColorStop(0, color + "33");
        grad.addColorStop(1, color + "05");
        ctx.fillStyle = grad;
        ctx.fill();
      }
    };

    const primaryValues = this.getTransformedPoints(this.data);
    drawSeries(this.data, primaryValues, this.CHART_COLORS[0], true);

    this.overlayData.forEach((overlay, idx) => {
      const values = this.getTransformedPoints(overlay.points);
      drawSeries(overlay.points, values, overlay.color || this.CHART_COLORS[(idx + 1) % this.CHART_COLORS.length], false);
    });

    // Legend
    if (this.overlayData.length > 0) {
      let lx = left + 10;
      const ly = top + 12;
      ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
      // Primary
      ctx.fillStyle = this.CHART_COLORS[0];
      ctx.fillRect(lx, ly - 4, 12, 3);
      lx += 16;
      ctx.fillStyle = "#e2e8f0";
      ctx.textAlign = "left";
      ctx.fillText(state.ticker || "MC Index", lx, ly);
      lx += ctx.measureText(state.ticker || "MC Index").width + 16;

      this.overlayData.forEach((overlay, idx) => {
        const c = overlay.color || this.CHART_COLORS[(idx + 1) % this.CHART_COLORS.length];
        ctx.fillStyle = c;
        ctx.fillRect(lx, ly - 4, 12, 3);
        lx += 16;
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(overlay.label, lx, ly);
        lx += ctx.measureText(overlay.label).width + 16;
      });
    }

    // Crosshair
    if (this.hoveredIndex >= 0 && this.hoveredIndex < n) {
      const hx = toX(this.hoveredIndex);
      const hVal = primaryValues[this.hoveredIndex];
      const hy = toY(hVal);

      // Vertical line
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hx, top);
      ctx.lineTo(hx, h - bottom + this.VOLUME_HEIGHT);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(left, hy);
      ctx.lineTo(w - right, hy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Dot
      ctx.fillStyle = this.CHART_COLORS[0];
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Tooltip
      const pt = this.data[this.hoveredIndex];
      const tooltipLines = [
        pt.date,
        this.mode === "indexed" ? `Index: ${hVal.toFixed(1)}` : `Price: ${fmtCurrency(pt.close)}`,
        `Vol: ${fmtVolume(pt.volume)}`,
      ];
      if (this.mode === "absolute") {
        tooltipLines.push(`H: ${fmtCurrency(pt.high)} L: ${fmtCurrency(pt.low)}`);
      }

      const tooltipW = 160;
      const tooltipH = tooltipLines.length * 18 + 16;
      let tx = hx + 15;
      let ty = hy - tooltipH / 2;
      if (tx + tooltipW > w - right) tx = hx - tooltipW - 15;
      if (ty < top) ty = top;
      if (ty + tooltipH > top + chartH) ty = top + chartH - tooltipH;

      ctx.fillStyle = "#1e293bee";
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tx, ty, tooltipW, tooltipH, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      tooltipLines.forEach((line, i) => {
        ctx.fillStyle = i === 0 ? "#94a3b8" : "#e2e8f0";
        ctx.fillText(line, tx + 10, ty + 18 + i * 18);
      });
    }

    // Y-axis label
    ctx.save();
    ctx.translate(14, top + chartH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "#64748b";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(this.mode === "indexed" ? "Index (Base=100)" : "Price ($)", 0, 0);
    ctx.restore();
  }

  private onMouseMove(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const { left, right } = this.PADDING;
    const chartW = rect.width - left - right;
    const n = this.data.length;
    if (n === 0) return;
    const xStep = n > 1 ? chartW / (n - 1) : chartW;
    const idx = Math.round((mx - left) / xStep);
    const newIdx = Math.max(0, Math.min(n - 1, idx));
    if (newIdx !== this.hoveredIndex) {
      this.hoveredIndex = newIdx;
      this.scheduleRender();
    }
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }
}

// ─── UI Components ──────────────────────────────────────────────────────────

function createPill(label: string, isActive: boolean, onClick: () => void): HTMLElement {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.style.cssText = `padding:5px 14px;border-radius:14px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid ${isActive ? "#3b82f6" : "#334155"};background:${isActive ? "#3b82f622" : "transparent"};color:${isActive ? "#60a5fa" : "#94a3b8"};transition:all 0.15s;`;
  btn.addEventListener("click", onClick);
  btn.addEventListener("mouseenter", () => { if (!isActive) btn.style.borderColor = "#475569"; });
  btn.addEventListener("mouseleave", () => { if (!isActive) btn.style.borderColor = "#334155"; });
  return btn;
}

function createToggleButton(label: string, isActive: boolean, onClick: () => void): HTMLElement {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.style.cssText = `padding:6px 16px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid ${isActive ? "#3b82f6" : "#334155"};background:${isActive ? "#3b82f6" : "#1e293b"};color:${isActive ? "#fff" : "#94a3b8"};transition:all 0.15s;`;
  btn.addEventListener("click", onClick);
  return btn;
}

// ─── Render ─────────────────────────────────────────────────────────────────

let chart: MarketChart | null = null;

async function render() {
  const data = await loadData();
  state.data = data;

  document.body.innerHTML = "";
  document.body.style.cssText = "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,monospace;background:#0f172a;color:#e2e8f0;overflow-x:hidden;";

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;min-height:100vh;";
  document.body.appendChild(root);

  // ── Market Selector Bar ──────────────────────────────────────────────
  const selectorBar = document.createElement("div");
  selectorBar.style.cssText = "background:#1e293b;padding:10px 16px;border-bottom:2px solid #334155;display:flex;align-items:center;gap:12px;flex-wrap:wrap;";

  // App title
  const titleEl = document.createElement("div");
  titleEl.style.cssText = "font-size:14px;font-weight:700;color:#f8fafc;margin-right:8px;letter-spacing:0.3px;";
  titleEl.textContent = "MC MARKET INDEX";
  selectorBar.appendChild(titleEl);

  // Separator
  const sep1 = document.createElement("div");
  sep1.style.cssText = "width:1px;height:24px;background:#334155;";
  selectorBar.appendChild(sep1);

  // Country toggle
  const countryGroup = document.createElement("div");
  countryGroup.style.cssText = "display:flex;border-radius:6px;overflow:hidden;";
  const usBtn = createToggleButton("US", state.country === "US", () => { state.country = "US"; render(); });
  usBtn.style.borderRadius = "6px 0 0 6px";
  const ukBtn = createToggleButton("UK", state.country === "UK", () => { state.country = "UK"; render(); });
  ukBtn.style.borderRadius = "0 6px 6px 0";
  countryGroup.appendChild(usBtn);
  countryGroup.appendChild(ukBtn);
  selectorBar.appendChild(countryGroup);

  // Geography dropdown
  const geoSelect = document.createElement("select");
  geoSelect.style.cssText = "padding:6px 10px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:12px;outline:none;max-width:160px;";
  const geoOptions = state.country === "US" ? US_STATES : ["National", "England", "Scotland", "Wales", "Northern Ireland"];
  for (const g of geoOptions) {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    if (g === state.geography) opt.selected = true;
    geoSelect.appendChild(opt);
  }
  geoSelect.addEventListener("change", () => { state.geography = geoSelect.value; render(); });
  selectorBar.appendChild(geoSelect);

  // Time range pills
  const timeGroup = document.createElement("div");
  timeGroup.style.cssText = "display:flex;gap:4px;";
  for (const tr of ["1M", "3M", "6M", "1Y", "2Y"]) {
    timeGroup.appendChild(createPill(tr, state.timeRange === tr, () => { state.timeRange = tr; render(); }));
  }
  selectorBar.appendChild(timeGroup);

  // Separator
  const sep2 = document.createElement("div");
  sep2.style.cssText = "width:1px;height:24px;background:#334155;";
  selectorBar.appendChild(sep2);

  // Search input with datalist
  const searchWrap = document.createElement("div");
  searchWrap.style.cssText = "position:relative;flex:1;min-width:200px;max-width:320px;";
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search Make or Make:Model...";
  searchInput.value = state.ticker || "";
  searchInput.setAttribute("list", "ticker-datalist");
  searchInput.style.cssText = "width:100%;padding:6px 12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:12px;outline:none;";
  searchInput.addEventListener("focus", () => { searchInput.style.borderColor = "#3b82f6"; });
  searchInput.addEventListener("blur", () => { searchInput.style.borderColor = "#334155"; });
  searchInput.addEventListener("change", () => {
    const val = searchInput.value.trim();
    if (val) {
      state.ticker = val;
      _safeApp?.updateModelContext?.({ selectedTicker: val, country: state.country, geography: state.geography });
    } else {
      state.ticker = null;
    }
    render();
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const val = searchInput.value.trim();
      if (val) {
        state.ticker = val;
        _safeApp?.updateModelContext?.({ selectedTicker: val, country: state.country, geography: state.geography });
      } else {
        state.ticker = null;
      }
      render();
    }
  });
  const datalist = document.createElement("datalist");
  datalist.id = "ticker-datalist";
  for (const t of POPULAR_TICKERS) {
    const opt = document.createElement("option");
    opt.value = t;
    datalist.appendChild(opt);
  }
  searchWrap.appendChild(searchInput);
  searchWrap.appendChild(datalist);
  selectorBar.appendChild(searchWrap);

  root.appendChild(selectorBar);

  // ── Market Overview Ribbon ───────────────────────────────────────────
  const ribbon = document.createElement("div");
  ribbon.style.cssText = "background:#111827;padding:12px 16px;border-bottom:1px solid #1e293b;display:flex;align-items:center;gap:16px;overflow-x:auto;";

  // Composite Index - large ticker
  const compositeEl = document.createElement("div");
  compositeEl.style.cssText = "display:flex;align-items:baseline;gap:10px;min-width:280px;padding-right:16px;border-right:1px solid #334155;";
  compositeEl.innerHTML = `
    <div>
      <div style="font-size:10px;color:#64748b;letter-spacing:1px;font-weight:600;">MC USED CAR INDEX</div>
      <div style="display:flex;align-items:baseline;gap:8px;margin-top:2px;">
        <span style="font-size:28px;font-weight:800;color:#f8fafc;font-family:monospace;">${fmtCurrency(data.compositeIndex.currentPrice)}</span>
        <span style="font-size:14px;font-weight:700;color:${changeColor(data.compositeIndex.change)};">${fmtChange(data.compositeIndex.change)}</span>
        <span style="font-size:13px;font-weight:600;color:${changeColor(data.compositeIndex.changePct)};">(${fmtPct(data.compositeIndex.changePct)})</span>
      </div>
    </div>
  `;
  ribbon.appendChild(compositeEl);

  // Segment mini-tickers
  for (const seg of data.segmentIndices) {
    const segEl = document.createElement("div");
    segEl.style.cssText = "min-width:120px;cursor:pointer;padding:4px 8px;border-radius:6px;transition:background 0.15s;";
    segEl.addEventListener("mouseenter", () => { segEl.style.background = "#1e293b"; });
    segEl.addEventListener("mouseleave", () => { segEl.style.background = "transparent"; });
    segEl.addEventListener("click", () => {
      state.segment = seg.name;
      render();
    });
    segEl.innerHTML = `
      <div style="font-size:9px;color:#64748b;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;">${seg.name}</div>
      <div style="font-size:15px;font-weight:700;color:#f8fafc;margin-top:1px;">${fmtCompact(seg.currentPrice)}</div>
      <div style="font-size:11px;font-weight:600;color:${changeColor(seg.changePct)};">${fmtPct(seg.changePct)}</div>
    `;
    ribbon.appendChild(segEl);
  }

  // Volume indicator
  const volEl = document.createElement("div");
  volEl.style.cssText = "min-width:130px;padding-left:16px;border-left:1px solid #334155;";
  volEl.innerHTML = `
    <div style="font-size:9px;color:#64748b;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;">VOLUME</div>
    <div style="font-size:15px;font-weight:700;color:#f8fafc;margin-top:1px;">${fmtVolume(data.totalVolume)}</div>
    <div style="font-size:11px;font-weight:600;color:${changeColor(data.volumeMoM)};">MoM ${fmtPct(data.volumeMoM)}</div>
  `;
  ribbon.appendChild(volEl);

  root.appendChild(ribbon);

  // ── Main Content Area ────────────────────────────────────────────────
  const mainContent = document.createElement("div");
  mainContent.style.cssText = "display:grid;grid-template-columns:1fr 320px;gap:0;flex:1;";

  // Left side: chart + bottom panels
  const leftCol = document.createElement("div");
  leftCol.style.cssText = "display:flex;flex-direction:column;border-right:1px solid #1e293b;";

  // Chart header
  const chartHeader = document.createElement("div");
  chartHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #1e293b;";

  const chartTitle = document.createElement("div");
  chartTitle.style.cssText = "font-size:13px;font-weight:600;color:#f8fafc;";
  chartTitle.textContent = state.ticker ? state.ticker.replace(":", " ") + " - Price History" : "MC Used Car Index - Price History";
  chartHeader.appendChild(chartTitle);

  // Chart mode toggle
  const modeGroup = document.createElement("div");
  modeGroup.style.cssText = "display:flex;border-radius:6px;overflow:hidden;";
  const absBtn = createToggleButton("Absolute $", state.chartMode === "absolute", () => {
    state.chartMode = "absolute";
    renderChart(data);
  });
  absBtn.style.cssText += "font-size:11px;padding:4px 10px;";
  absBtn.style.borderRadius = "6px 0 0 6px";
  const idxBtn = createToggleButton("Indexed (100)", state.chartMode === "indexed", () => {
    state.chartMode = "indexed";
    renderChart(data);
  });
  idxBtn.style.cssText += "font-size:11px;padding:4px 10px;";
  idxBtn.style.borderRadius = "0 6px 6px 0";
  modeGroup.appendChild(absBtn);
  modeGroup.appendChild(idxBtn);
  chartHeader.appendChild(modeGroup);
  leftCol.appendChild(chartHeader);

  // Chart container
  const chartContainer = document.createElement("div");
  chartContainer.style.cssText = "padding:8px 16px;";
  leftCol.appendChild(chartContainer);

  // Create chart
  chart = new MarketChart(chartContainer, 700, 360);
  renderChart(data);

  // Bottom panels in grid
  const bottomGrid = document.createElement("div");
  bottomGrid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:0;border-top:1px solid #1e293b;";

  // ── Sector Heatmap (bottom left) ─────────────────────────────────────
  const heatmapPanel = document.createElement("div");
  heatmapPanel.style.cssText = "padding:12px 16px;border-right:1px solid #1e293b;";
  const heatmapTitle = document.createElement("div");
  heatmapTitle.style.cssText = "font-size:12px;font-weight:700;color:#f8fafc;margin-bottom:10px;letter-spacing:0.5px;text-transform:uppercase;";
  heatmapTitle.textContent = "Sector Heatmap - Price Change %";
  heatmapPanel.appendChild(heatmapTitle);

  const bodyTypes = ["SUV", "Sedan", "Truck", "Coupe", "Van"];
  const priceTiers = ["$0-15K", "$15-25K", "$25-35K", "$35-50K", "$50K+"];

  const heatTable = document.createElement("table");
  heatTable.style.cssText = "width:100%;border-collapse:collapse;font-size:11px;";

  // Header row
  const heatTHead = document.createElement("thead");
  let headerRow = "<tr><th style='padding:4px 6px;text-align:left;color:#64748b;font-weight:600;font-size:10px;'></th>";
  for (const pt of priceTiers) {
    headerRow += `<th style='padding:4px 6px;text-align:center;color:#64748b;font-weight:600;font-size:10px;'>${pt}</th>`;
  }
  headerRow += "</tr>";
  heatTHead.innerHTML = headerRow;
  heatTable.appendChild(heatTHead);

  const heatTBody = document.createElement("tbody");
  for (const bt of bodyTypes) {
    const tr = document.createElement("tr");
    let rowHtml = `<td style="padding:5px 6px;font-weight:600;color:#94a3b8;font-size:11px;">${bt}</td>`;
    for (const pt of priceTiers) {
      const cell = data.sectorHeatmap.find(c => c.bodyType === bt && c.priceTier === pt);
      const pct = cell?.changePct ?? 0;
      const bg = heatColor(pct);
      const textColor = Math.abs(pct) > 1 ? "#f8fafc" : "#94a3b8";
      rowHtml += `<td style="padding:5px 6px;text-align:center;background:${bg};color:${textColor};font-weight:600;border:1px solid #0f172a;border-radius:3px;">${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%</td>`;
    }
    tr.innerHTML = rowHtml;
    heatTBody.appendChild(tr);
  }
  heatTable.appendChild(heatTBody);
  heatmapPanel.appendChild(heatTable);
  bottomGrid.appendChild(heatmapPanel);

  // ── Geographic Comparison (bottom right) ─────────────────────────────
  const geoPanel = document.createElement("div");
  geoPanel.style.cssText = "padding:12px 16px;max-height:260px;overflow-y:auto;";
  const geoTitle = document.createElement("div");
  geoTitle.style.cssText = "font-size:12px;font-weight:700;color:#f8fafc;margin-bottom:10px;letter-spacing:0.5px;text-transform:uppercase;";
  geoTitle.textContent = `Geographic Comparison${state.ticker ? " - " + state.ticker.replace(":", " ") : ""}`;
  geoPanel.appendChild(geoTitle);

  const geoTable = document.createElement("table");
  geoTable.style.cssText = "width:100%;border-collapse:collapse;font-size:11px;";
  const geoTHead = document.createElement("thead");
  geoTHead.innerHTML = `<tr>
    <th style="padding:5px 6px;text-align:left;color:#64748b;font-weight:600;font-size:10px;position:sticky;top:0;background:#0f172a;">STATE</th>
    <th style="padding:5px 6px;text-align:right;color:#64748b;font-weight:600;font-size:10px;position:sticky;top:0;background:#0f172a;">AVG PRICE</th>
    <th style="padding:5px 6px;text-align:right;color:#64748b;font-weight:600;font-size:10px;position:sticky;top:0;background:#0f172a;">VOLUME</th>
    <th style="padding:5px 6px;text-align:right;color:#64748b;font-weight:600;font-size:10px;position:sticky;top:0;background:#0f172a;">CHANGE %</th>
  </tr>`;
  geoTable.appendChild(geoTHead);

  const geoTBody = document.createElement("tbody");
  for (const geo of data.geographicData) {
    const tr = document.createElement("tr");
    tr.style.cssText = "border-bottom:1px solid #1e293b;";
    tr.addEventListener("mouseenter", () => { tr.style.background = "#1e293b"; });
    tr.addEventListener("mouseleave", () => { tr.style.background = ""; });
    tr.innerHTML = `
      <td style="padding:5px 6px;color:#e2e8f0;font-weight:500;">${geo.state}</td>
      <td style="padding:5px 6px;text-align:right;color:#f8fafc;font-weight:600;font-family:monospace;">${fmtCurrency(geo.avgPrice)}</td>
      <td style="padding:5px 6px;text-align:right;color:#94a3b8;font-family:monospace;">${fmtVolume(geo.volume)}</td>
      <td style="padding:5px 6px;text-align:right;color:${changeColor(geo.changePct)};font-weight:600;font-family:monospace;">${fmtPct(geo.changePct)}</td>
    `;
    geoTBody.appendChild(tr);
  }
  geoTable.appendChild(geoTBody);
  geoPanel.appendChild(geoTable);
  bottomGrid.appendChild(geoPanel);

  leftCol.appendChild(bottomGrid);
  mainContent.appendChild(leftCol);

  // ── Right Sidebar: Movers Panel ──────────────────────────────────────
  const rightCol = document.createElement("div");
  rightCol.style.cssText = "display:flex;flex-direction:column;background:#111827;";

  // Movers tabs
  const moversHeader = document.createElement("div");
  moversHeader.style.cssText = "display:flex;border-bottom:2px solid #1e293b;";

  const moversTabDefs: { key: "gainers" | "losers" | "active"; label: string }[] = [
    { key: "gainers", label: "Top Gainers" },
    { key: "losers", label: "Top Losers" },
    { key: "active", label: "Most Active" },
  ];
  function updateTabStyles() {
    const tabs = moversHeader.querySelectorAll("button");
    tabs.forEach((btn, i) => {
      const key = moversTabDefs[i].key;
      const active = state.moversTab === key;
      btn.style.borderBottom = `2px solid ${active ? "#3b82f6" : "transparent"}`;
      btn.style.color = active ? "#f8fafc" : "#64748b";
    });
  }
  for (const tab of moversTabDefs) {
    const tabBtn = document.createElement("button");
    tabBtn.textContent = tab.label;
    const isActive = state.moversTab === tab.key;
    tabBtn.style.cssText = `flex:1;padding:10px 8px;font-size:11px;font-weight:700;cursor:pointer;border:none;border-bottom:2px solid ${isActive ? "#3b82f6" : "transparent"};background:transparent;color:${isActive ? "#f8fafc" : "#64748b"};text-transform:uppercase;letter-spacing:0.5px;transition:all 0.15s;`;
    tabBtn.addEventListener("click", () => {
      state.moversTab = tab.key;
      updateTabStyles();
      renderMovers(data);
    });
    moversHeader.appendChild(tabBtn);
  }
  rightCol.appendChild(moversHeader);

  // Movers list container
  const moversBody = document.createElement("div");
  moversBody.id = "movers-body";
  moversBody.style.cssText = "flex:1;overflow-y:auto;";
  rightCol.appendChild(moversBody);
  mainContent.appendChild(rightCol);

  root.appendChild(mainContent);

  // ── Watchlist Strip (bottom) ─────────────────────────────────────────
  const watchlistStrip = document.createElement("div");
  watchlistStrip.style.cssText = "background:#111827;border-top:2px solid #1e293b;padding:10px 16px;display:flex;gap:12px;overflow-x:auto;align-items:center;";

  const wlLabel = document.createElement("div");
  wlLabel.style.cssText = "font-size:10px;font-weight:700;color:#64748b;letter-spacing:1px;text-transform:uppercase;white-space:nowrap;margin-right:8px;";
  wlLabel.textContent = "WATCHLIST";
  watchlistStrip.appendChild(wlLabel);

  for (const wt of data.watchlist) {
    const wCard = document.createElement("div");
    wCard.style.cssText = "display:flex;align-items:center;gap:10px;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:8px 14px;min-width:200px;cursor:pointer;transition:border-color 0.15s;";
    wCard.addEventListener("mouseenter", () => { wCard.style.borderColor = "#3b82f6"; });
    wCard.addEventListener("mouseleave", () => { wCard.style.borderColor = "#334155"; });
    wCard.addEventListener("click", () => {
      state.ticker = wt.symbol;
      _safeApp?.updateModelContext?.({ selectedTicker: wt.symbol, country: state.country, geography: state.geography });
      render();
    });

    // Mini sparkline
    const sparkCanvas = document.createElement("canvas");
    sparkCanvas.width = 60;
    sparkCanvas.height = 24;
    sparkCanvas.style.cssText = "width:60px;height:24px;";
    drawSparkline(sparkCanvas, wt.timeSeries, wt.changePct >= 0 ? "#10b981" : "#ef4444");

    wCard.innerHTML = `
      <div>
        <div style="font-size:11px;font-weight:700;color:#f8fafc;">${wt.symbol.replace(":", " ")}</div>
        <div style="font-size:10px;color:#64748b;">${fmtCompact(wt.currentPrice)}</div>
      </div>
    `;
    wCard.appendChild(sparkCanvas);
    const changeBadge = document.createElement("div");
    changeBadge.style.cssText = `font-size:11px;font-weight:700;color:${changeColor(wt.changePct)};`;
    changeBadge.textContent = fmtPct(wt.changePct);
    wCard.appendChild(changeBadge);
    watchlistStrip.appendChild(wCard);
  }

  root.appendChild(watchlistStrip);

  // Render movers table
  renderMovers(data);

  // Responsive resize for chart
  setTimeout(() => {
    if (chart && chartContainer.parentElement) {
      const rect = chartContainer.getBoundingClientRect();
      chart.resize(rect.width - 32, 360);
    }
  }, 50);
}

function renderChart(data: MarketData) {
  if (!chart) return;
  const primaryData = data.tickerData?.timeSeries ?? data.compositeIndex.timeSeries;
  const overlays: { label: string; color: string; points: TimeSeriesPoint[] }[] = [];

  // If viewing a ticker, optionally overlay the composite index
  if (data.tickerData && data.compositeIndex.timeSeries.length > 0) {
    overlays.push({
      label: "MC Index",
      color: "#10b981",
      points: data.compositeIndex.timeSeries,
    });
  }

  chart.setData(primaryData, overlays, state.chartMode);
}

function renderMovers(data: MarketData) {
  const body = document.getElementById("movers-body");
  if (!body) return;
  body.innerHTML = "";

  const items = state.moversTab === "gainers" ? data.movers.gainers
    : state.moversTab === "losers" ? data.movers.losers
    : data.movers.active;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const row = document.createElement("div");
    const isGainer = item.changePct >= 0;
    const accentColor = state.moversTab === "losers" ? "#ef4444" : state.moversTab === "gainers" ? "#10b981" : "#3b82f6";
    row.style.cssText = `display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid #1e293b;cursor:pointer;transition:background 0.15s;`;
    row.addEventListener("mouseenter", () => { row.style.background = "#1e293b"; });
    row.addEventListener("mouseleave", () => { row.style.background = ""; });
    row.addEventListener("click", () => {
      state.ticker = item.symbol;
      _safeApp?.updateModelContext?.({ selectedTicker: item.symbol, country: state.country, geography: state.geography });
      render();
    });

    row.innerHTML = `
      <div style="width:24px;font-size:11px;color:#475569;font-weight:600;">${i + 1}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:700;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.symbol.replace(":", " ")}</div>
        <div style="font-size:10px;color:#64748b;margin-top:1px;">Vol: ${fmtVolume(item.volume)}</div>
      </div>
      <div style="text-align:right;margin-left:8px;">
        <div style="font-size:13px;font-weight:700;color:#f8fafc;font-family:monospace;">${fmtCompact(item.currentPrice)}</div>
        <div style="font-size:11px;font-weight:700;color:${changeColor(item.changePct)};font-family:monospace;">${fmtPct(item.changePct)}</div>
      </div>
    `;
    body.appendChild(row);
  }
}

function drawSparkline(canvas: HTMLCanvasElement, series: TimeSeriesPoint[], color: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx || series.length < 2) return;
  const w = canvas.width;
  const h = canvas.height;
  const values = series.map(p => p.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;

  for (let i = 0; i < values.length; i++) {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((values[i] - min) / range) * (h - 4) - 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Subtle area fill
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = color + "18";
  ctx.fill();
}

// ─── Initialize ─────────────────────────────────────────────────────────────

render();
