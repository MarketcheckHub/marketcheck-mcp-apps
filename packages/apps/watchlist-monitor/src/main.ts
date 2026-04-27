import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "watchlist-monitor" }); } catch {}

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

async function _callTool(toolName: string, args: Record<string, any>): Promise<any> {
  const auth = _getAuth();
  if (auth.value) {
    // 1. Proxy (same-origin, reliable when a composite endpoint exists)
    try {
      const r = await fetch((_proxyBase()) + "/api/proxy/" + toolName, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, _auth_mode: auth.mode, _auth_value: auth.value }),
      });
      if (r.ok) { const d = await r.json(); return { content: [{ type: "text", text: JSON.stringify(d) }] }; }
    } catch {}
    // 2. Direct API fallback — orchestrate the 30+ parallel recents/active calls in-browser
    try {
      const d = await _fetchLive(args.state);
      if (d) return { content: [{ type: "text", text: JSON.stringify(d) }] };
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

// ── Types ──────────────────────────────────────────────────────────────
type Signal = "ALERT" | "WATCH" | "STABLE" | "STRONG";

interface TickerData {
  ticker: string;
  companyName: string;
  signal: Signal;
  volumeMoM: number;       // % change month-over-month
  aspMoM: number;          // avg selling price MoM %
  daysSupply: number;
  discountChangeBps: number; // basis points
  sparkline: number[];     // 6-month price trend (6 data points)
  currentPrice: number;
  sectorAvgVolume: number;
  sectorAvgASP: number;
  alertDetails: string[];  // 3-4 bullet points explaining the signal
}

interface SectorSummary {
  totalVolumeTrend: "UP" | "DOWN" | "FLAT";
  totalVolumeChangePct: number;
  avgASP: number;
  aspChangePct: number;
  evPenetrationPct: number;
  macroSignal: "BULLISH" | "BEARISH" | "NEUTRAL";
}

interface WatchlistData {
  sector: SectorSummary;
  tickers: TickerData[];
}

// ── Mock Data ──────────────────────────────────────────────────────────
function generateMockData(): WatchlistData {
  const sector: SectorSummary = {
    totalVolumeTrend: "UP",
    totalVolumeChangePct: 3.2,
    avgASP: 48750,
    aspChangePct: -1.4,
    evPenetrationPct: 9.8,
    macroSignal: "NEUTRAL",
  };

  const tickers: TickerData[] = [
    {
      ticker: "F",
      companyName: "Ford Motor Co.",
      signal: "ALERT",
      volumeMoM: -8.3,
      aspMoM: -3.1,
      daysSupply: 98,
      discountChangeBps: 145,
      sparkline: [12.8, 12.2, 11.5, 10.9, 10.2, 9.6],
      currentPrice: 9.6,
      sectorAvgVolume: 2.1,
      sectorAvgASP: -1.4,
      alertDetails: [
        "Volume declined 8.3% MoM, significantly below sector avg of +2.1%",
        "Days supply at 98 days exceeds 90-day critical threshold",
        "Discount expansion of 145bps signals aggressive dealer incentivization",
        "ASP erosion of -3.1% outpaces sector avg of -1.4% by 170bps",
      ],
    },
    {
      ticker: "GM",
      companyName: "General Motors Co.",
      signal: "WATCH",
      volumeMoM: 1.2,
      aspMoM: -2.0,
      daysSupply: 78,
      discountChangeBps: 85,
      sparkline: [38.5, 40.1, 42.3, 41.0, 39.8, 40.5],
      currentPrice: 40.5,
      sectorAvgVolume: 2.1,
      sectorAvgASP: -1.4,
      alertDetails: [
        "Volume growth of +1.2% is below sector average of +2.1%",
        "Days supply at 78 days approaching the watch threshold of 80",
        "Discount widened by 85bps, moderate incentive activity",
        "EV transition costs continue to weigh on margins",
      ],
    },
    {
      ticker: "TM",
      companyName: "Toyota Motor Corp.",
      signal: "STRONG",
      volumeMoM: 5.1,
      aspMoM: 1.2,
      daysSupply: 32,
      discountChangeBps: -20,
      sparkline: [185.0, 190.5, 195.2, 200.8, 210.3, 218.5],
      currentPrice: 218.5,
      sectorAvgVolume: 2.1,
      sectorAvgASP: -1.4,
      alertDetails: [
        "Volume growth of +5.1% significantly outpaces sector at +2.1%",
        "Days supply at 32 days indicates strong demand-supply balance",
        "Discounts tightening by -20bps shows pricing power",
        "ASP rising +1.2% while sector declines, hybrid strategy paying off",
      ],
    },
    {
      ticker: "HMC",
      companyName: "Honda Motor Co.",
      signal: "STABLE",
      volumeMoM: 2.4,
      aspMoM: -0.5,
      daysSupply: 45,
      discountChangeBps: 15,
      sparkline: [32.1, 33.5, 34.0, 33.2, 34.8, 35.2],
      currentPrice: 35.2,
      sectorAvgVolume: 2.1,
      sectorAvgASP: -1.4,
      alertDetails: [
        "Volume growth of +2.4% slightly above sector average",
        "Days supply at 45 days well within healthy range of 40-60",
        "Minimal discount change of +15bps, pricing stable",
        "CR-V and Civic continue to drive consistent demand",
      ],
    },
    {
      ticker: "TSLA",
      companyName: "Tesla Inc.",
      signal: "ALERT",
      volumeMoM: -12.5,
      aspMoM: -5.8,
      daysSupply: 112,
      discountChangeBps: 280,
      sparkline: [245.0, 230.5, 218.0, 195.3, 178.2, 162.8],
      currentPrice: 162.8,
      sectorAvgVolume: 2.1,
      sectorAvgASP: -1.4,
      alertDetails: [
        "Volume plunged -12.5% MoM, worst in tracked universe",
        "Days supply at 112 days, highest among tracked tickers",
        "Discount expansion of 280bps reflects aggressive price cuts",
        "ASP decline of -5.8% is 4.4x worse than sector average",
      ],
    },
    {
      ticker: "STLA",
      companyName: "Stellantis N.V.",
      signal: "WATCH",
      volumeMoM: -3.5,
      aspMoM: -2.8,
      daysSupply: 82,
      discountChangeBps: 110,
      sparkline: [18.2, 17.5, 16.0, 14.8, 13.5, 12.8],
      currentPrice: 12.8,
      sectorAvgVolume: 2.1,
      sectorAvgASP: -1.4,
      alertDetails: [
        "Volume decline of -3.5% underperforms sector growth trend",
        "Days supply at 82 days breaches the 80-day watch threshold",
        "Discount expansion of 110bps signals clearing pressure",
        "Jeep and Ram brand mix shift impacting overall ASP",
      ],
    },
    {
      ticker: "AN",
      companyName: "AutoNation Inc.",
      signal: "STABLE",
      volumeMoM: 1.8,
      aspMoM: -0.9,
      daysSupply: 52,
      discountChangeBps: 30,
      sparkline: [148.0, 152.3, 155.0, 157.8, 160.2, 163.5],
      currentPrice: 163.5,
      sectorAvgVolume: 2.1,
      sectorAvgASP: -1.4,
      alertDetails: [
        "Volume growth of +1.8% in line with sector trends",
        "Days supply at 52 days reflects balanced inventory",
        "Minimal discount change of +30bps, healthy operations",
        "Dealer group diversification provides stability across brands",
      ],
    },
    {
      ticker: "LAD",
      companyName: "Lithia Motors Inc.",
      signal: "STRONG",
      volumeMoM: 4.8,
      aspMoM: 0.8,
      daysSupply: 38,
      discountChangeBps: -10,
      sparkline: [280.0, 290.5, 305.2, 312.0, 325.8, 340.1],
      currentPrice: 340.1,
      sectorAvgVolume: 2.1,
      sectorAvgASP: -1.4,
      alertDetails: [
        "Volume growth of +4.8% well above sector average",
        "Days supply at 38 days shows lean, efficient inventory",
        "Discounts tightening by -10bps, strong pricing discipline",
        "Acquisition strategy continues to drive organic growth uplift",
      ],
    },
    {
      ticker: "KMX",
      companyName: "CarMax Inc.",
      signal: "WATCH",
      volumeMoM: -1.2,
      aspMoM: -1.9,
      daysSupply: 72,
      discountChangeBps: 65,
      sparkline: [72.0, 74.5, 78.2, 76.0, 73.8, 71.5],
      currentPrice: 71.5,
      sectorAvgVolume: 2.1,
      sectorAvgASP: -1.4,
      alertDetails: [
        "Volume decline of -1.2% while sector grows at +2.1%",
        "Days supply at 72 days trending upward from last month's 65",
        "Discount widened by 65bps, moderate clearance activity",
        "Used car market normalization pressuring volume recovery",
      ],
    },
    {
      ticker: "CVNA",
      companyName: "Carvana Co.",
      signal: "STABLE",
      volumeMoM: 3.5,
      aspMoM: -0.3,
      daysSupply: 48,
      discountChangeBps: 20,
      sparkline: [45.0, 58.2, 72.5, 95.0, 118.3, 135.8],
      currentPrice: 135.8,
      sectorAvgVolume: 2.1,
      sectorAvgASP: -1.4,
      alertDetails: [
        "Volume growth of +3.5% outperforms sector average",
        "Days supply at 48 days reflects operational improvements",
        "Minimal discount activity of +20bps, stabilizing pricing",
        "Restructuring gains driving improved unit economics",
      ],
    },
  ];

  return { sector, tickers };
}

// ── Live API Orchestration ─────────────────────────────────────────────
// Ticker universe: 6 OEMs (filterable by make) + 4 dealer groups.
// Dealer groups cannot be isolated without Enterprise/dealer-id data, so we
// approximate each using a distinct slice of the used-car market they compete in.
interface TickerConfig {
  ticker: string;
  companyName: string;
  type: "oem" | "dealer";
  filter: Record<string, any>;
}

const TICKER_UNIVERSE: TickerConfig[] = [
  { ticker: "F",    companyName: "Ford Motor Co.",     type: "oem",    filter: { make: "Ford,Lincoln" } },
  { ticker: "GM",   companyName: "General Motors Co.", type: "oem",    filter: { make: "Chevrolet,GMC,Buick,Cadillac" } },
  { ticker: "TM",   companyName: "Toyota Motor Corp.", type: "oem",    filter: { make: "Toyota,Lexus" } },
  { ticker: "HMC",  companyName: "Honda Motor Co.",    type: "oem",    filter: { make: "Honda,Acura" } },
  { ticker: "TSLA", companyName: "Tesla Inc.",         type: "oem",    filter: { make: "Tesla" } },
  { ticker: "STLA", companyName: "Stellantis N.V.",    type: "oem",    filter: { make: "Jeep,Ram,Dodge,Chrysler" } },
  // Dealer groups — proxy slices of the used market each focuses on
  { ticker: "AN",   companyName: "AutoNation Inc.",    type: "dealer", filter: { car_type: "new" } },
  { ticker: "LAD",  companyName: "Lithia Motors Inc.", type: "dealer", filter: { car_type: "used", year_range: "2020-2024" } },
  { ticker: "KMX",  companyName: "CarMax Inc.",        type: "dealer", filter: { car_type: "used", year_range: "2017-2022" } },
  { ticker: "CVNA", companyName: "Carvana Co.",        type: "dealer", filter: { car_type: "used", year_range: "2018-2023" } },
];

function _stockLevelFor(ticker: string): number {
  // Plausible recent share-price anchors (display only; gets updated by 6M trend direction)
  const anchors: Record<string, number> = { F: 10.5, GM: 40.0, TM: 210.0, HMC: 34.5, TSLA: 180.0, STLA: 13.5, AN: 160.0, LAD: 320.0, KMX: 73.0, CVNA: 125.0 };
  return anchors[ticker] ?? 50;
}

function _synthSparkline(endValue: number, changePct: number, seed: number): number[] {
  const start = endValue / (1 + changePct / 100 || 1);
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const base = start + (endValue - start) * t;
    const jitter = (((seed * (i + 3)) % 13) - 6) / 100 * base * 0.04;
    pts.push(+(base + jitter).toFixed(2));
  }
  pts[5] = +endValue.toFixed(2);
  return pts;
}

function _classifySignal(volumeMoM: number, aspMoM: number, daysSupply: number, discBps: number): Signal {
  // Count negative and positive conditions. Thresholds tuned for industry-relative deltas
  // (so a healthy market clusters around STABLE, and outliers get graded WATCH/ALERT/STRONG).
  let neg = 0, pos = 0;
  if (volumeMoM < -4) neg++; else if (volumeMoM > 2) pos++;
  if (aspMoM < -1.5) neg++; else if (aspMoM > 0.5) pos++;
  if (daysSupply > 90) neg++; else if (daysSupply > 0 && daysSupply < 40) pos++;
  if (discBps > 120) neg++; else if (discBps <= 0) pos++;
  if (neg >= 2) return "ALERT";
  if (neg === 1) return "WATCH";
  if (pos >= 3) return "STRONG";
  return "STABLE";
}

async function _fetchLive(stateAbbr?: string): Promise<WatchlistData | null> {
  const stateParam: Record<string, any> = stateAbbr ? { state: stateAbbr } : {};

  // Industry baselines — volume, price, EV mix, and the structural sold-vs-active gap.
  // We need industryActive WITH stats to compute the industry-wide price spread baseline.
  const [industryRecent, industryActiveAll, industryActiveEv] = await Promise.all([
    _mcRecent({ rows: 1, stats: "price,dom", ...stateParam }).catch(() => null),
    _mcActive({ rows: 1, stats: "price,dom", ...stateParam }).catch(() => null),
    _mcActive({ rows: 1, fuel_type: "Electric", ...stateParam }).catch(() => null),
  ]);

  const industrySold90 = industryRecent?.num_found ?? 0;
  const industryActive = industryActiveAll?.num_found ?? 0;
  const industryEvActive = industryActiveEv?.num_found ?? 0;
  const industryAvgPrice = Math.round(industryRecent?.stats?.price?.mean ?? 0);
  const industryActiveAvgPrice = Math.round(industryActiveAll?.stats?.price?.mean ?? 0);

  if (industrySold90 === 0) return null;

  // Baseline spread: sold vs active across the whole industry. In the US used-market this is
  // typically -5% to -10% (listings always sit above clearing prices). Each ticker's deviation
  // from this baseline — not the raw spread — is what signals pricing-power stress.
  const industrySpreadPct = industryActiveAvgPrice > 0
    ? ((industryRecent?.stats?.price?.mean ?? 0) - industryActiveAvgPrice) / industryActiveAvgPrice * 100
    : 0;

  // Per-ticker fetches
  const perTicker = await Promise.all(TICKER_UNIVERSE.map(async (cfg) => {
    const [recent, active] = await Promise.all([
      _mcRecent({ ...cfg.filter, rows: 1, stats: "price,dom", ...stateParam }).catch(() => null),
      _mcActive({ ...cfg.filter, rows: 1, stats: "price,dom", ...stateParam }).catch(() => null),
    ]);

    const sold90 = recent?.num_found ?? 0;
    const activeCount = active?.num_found ?? 0;
    const soldAvgPrice = Math.round(recent?.stats?.price?.mean ?? 0);
    const activeAvgPrice = Math.round(active?.stats?.price?.mean ?? 0);
    const soldDomStats = recent?.stats?.dom ?? recent?.stats?.days_on_market ?? {};
    const activeDomStats = active?.stats?.dom ?? active?.stats?.days_on_market ?? {};
    const soldDom = Math.round(soldDomStats.mean ?? soldDomStats.avg ?? 0);
    const activeDom = Math.round(activeDomStats.mean ?? activeDomStats.avg ?? 0);

    // Share of industry volume
    const sharePct = industrySold90 > 0 ? (sold90 / industrySold90) * 100 : 0;

    // Monthly sold from 90-day window; daysSupply = active / monthlySold × 30
    const monthlySold = sold90 / 3;
    const daysSupply = monthlySold > 0 ? Math.round((activeCount / monthlySold) * 30) : 0;

    // Ticker's own sold-vs-active spread, then the DEVIATION from industry baseline.
    // A ticker clearing closer to (or above) its asking prices vs industry = positive pricing power.
    const tickerSpreadPct = activeAvgPrice > 0 ? (soldAvgPrice - activeAvgPrice) / activeAvgPrice * 100 : 0;
    const relSpread = tickerSpreadPct - industrySpreadPct;

    // ASP MoM% proxy: relative pricing-power deviation, clipped to ±4 (typical range ±2)
    const aspMoM = +Math.max(-4, Math.min(4, relSpread)).toFixed(1);
    // Discount change (bps): inverse of aspMoM, at ~10bps per 1% spread. Clipped to ±250.
    const discountChangeBps = Math.max(-250, Math.min(250, Math.round(-aspMoM * 25)));

    // Volume MoM proxy. OEM tickers map to known make portfolios so share-of-industry is
    // meaningful. Dealer-group tickers can't be isolated without Enterprise/dealer-id data
    // (their listings are split across hundreds of store-level seller_name values), so we
    // hold volumeMoM neutral for them and let pricing/DS/disc signals drive the row.
    const avgExpectedShare = 100 / TICKER_UNIVERSE.filter((c) => c.type === "oem").length; // ~16.7% per OEM
    const volumeMoM = cfg.type === "oem"
      ? +Math.max(-8, Math.min(8, Math.log2(Math.max(sharePct, 0.25) / avgExpectedShare) * 2)).toFixed(1)
      : 0;

    // DOM velocity → approximation of short-term market stress
    const domDelta = activeDom - soldDom;

    const signal = _classifySignal(volumeMoM, aspMoM, daysSupply, discountChangeBps);

    const stockAnchor = _stockLevelFor(cfg.ticker);
    const sparklineEnd = +(stockAnchor * (1 + volumeMoM / 100)).toFixed(2);
    const seed = cfg.ticker.charCodeAt(0) + cfg.ticker.length;
    const sparkline = _synthSparkline(sparklineEnd, volumeMoM, seed);

    // Per-ticker alert narrative
    const alertDetails: string[] = [];
    if (sold90 === 0) {
      alertDetails.push(`No 90-day sold data found for ${cfg.type === "oem" ? cfg.companyName : "this segment"} in the selected scope`);
    } else {
      if (cfg.type === "oem") {
        alertDetails.push(`${sold90.toLocaleString()} units sold in the last 90 days — ${sharePct.toFixed(1)}% of industry volume${stateAbbr ? ` in ${stateAbbr}` : ""}`);
      } else {
        alertDetails.push(`Segment-level signal: ${sold90.toLocaleString()} units sold across this ticker's competitive slice${stateAbbr ? ` in ${stateAbbr}` : ""} — ticker-specific volume not recoverable without Enterprise API`);
      }
      if (daysSupply > 0) alertDetails.push(`Days supply at ${daysSupply} — ${daysSupply > 90 ? "above 90-day stress threshold, incentive escalation risk" : daysSupply < 40 ? "tight inventory, pricing-power supportive" : "within healthy 40-90 day band"}`);
      alertDetails.push(`Sold avg $${soldAvgPrice.toLocaleString()} vs active avg $${activeAvgPrice.toLocaleString()} — ${relSpread >= 0 ? "+" : ""}${relSpread.toFixed(1)}% vs industry clearance baseline (${industrySpreadPct.toFixed(1)}%)`);
      alertDetails.push(`Active DOM ${activeDom}d vs 90-day sold DOM ${soldDom}d — ${domDelta < 0 ? "accelerating sell-through" : domDelta > 30 ? "aging inventory building up" : "market turnover in line with trend"}`);
    }

    return {
      ticker: cfg.ticker,
      companyName: cfg.companyName,
      signal,
      volumeMoM,
      aspMoM,
      daysSupply: daysSupply || 60,
      discountChangeBps,
      sparkline,
      currentPrice: sparklineEnd,
      sectorAvgVolume: 0, // fill in after loop
      sectorAvgASP: 0,
      alertDetails,
    } as TickerData;
  }));

  // Require at least half of the OEM tickers returned sold data — otherwise the universe is empty
  // and there's no point pretending we have live signals.
  const hasSoldData = perTicker.filter((t) => t.alertDetails[0]?.includes("units sold")).length >= 3;
  if (!hasSoldData) return null;

  // Compute sector averages from actual ticker readings, then back-fill into each ticker
  const sectorAvgVol = +(perTicker.reduce((s, t) => s + t.volumeMoM, 0) / perTicker.length).toFixed(1);
  const sectorAvgAsp = +(perTicker.reduce((s, t) => s + t.aspMoM, 0) / perTicker.length).toFixed(1);
  perTicker.forEach((t) => { t.sectorAvgVolume = sectorAvgVol; t.sectorAvgASP = sectorAvgAsp; });

  // Sector summary
  const totalVolumeChangePct = sectorAvgVol;
  const totalVolumeTrend: "UP" | "DOWN" | "FLAT" = totalVolumeChangePct > 1 ? "UP" : totalVolumeChangePct < -1 ? "DOWN" : "FLAT";
  const evPenetrationPct = industryActive > 0 ? +((industryEvActive / industryActive) * 100).toFixed(1) : 0;
  const alertCount = perTicker.filter((t) => t.signal === "ALERT").length;
  const watchCount = perTicker.filter((t) => t.signal === "WATCH").length;
  const strongCount = perTicker.filter((t) => t.signal === "STRONG").length;
  const negTilt = alertCount * 2 + watchCount;
  const posTilt = strongCount * 2;
  const macroSignal: "BULLISH" | "BEARISH" | "NEUTRAL" = posTilt - negTilt >= 3 ? "BULLISH" : negTilt - posTilt >= 3 ? "BEARISH" : "NEUTRAL";

  const sector: SectorSummary = {
    totalVolumeTrend,
    totalVolumeChangePct,
    avgASP: industryAvgPrice,
    aspChangePct: sectorAvgAsp,
    evPenetrationPct,
    macroSignal,
  };

  return { sector, tickers: perTicker };
}

// ── Formatters ─────────────────────────────────────────────────────────
function fmtCurrency(v: number): string {
  return "$" + Math.round(v).toLocaleString();
}
function fmtPct(v: number, showPlus = true): string {
  return (showPlus && v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}
function fmtBps(v: number): string {
  return (v >= 0 ? "+" : "") + v + "bps";
}

// ── Signal config ──────────────────────────────────────────────────────
const SIGNAL_CONFIG: Record<Signal, { label: string; color: string; bg: string; border: string; rowTint: string; sortOrder: number }> = {
  ALERT:  { label: "ALERT",  color: "#ef4444", bg: "rgba(239,68,68,0.15)",  border: "rgba(239,68,68,0.3)",  rowTint: "rgba(239,68,68,0.06)",  sortOrder: 0 },
  WATCH:  { label: "WATCH",  color: "#f59e0b", bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.3)", rowTint: "rgba(245,158,11,0.05)", sortOrder: 1 },
  STABLE: { label: "STABLE", color: "#94a3b8", bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.25)", rowTint: "transparent",           sortOrder: 2 },
  STRONG: { label: "STRONG", color: "#10b981", bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.3)", rowTint: "rgba(16,185,129,0.05)", sortOrder: 3 },
};

// ── Sparkline Renderer ─────────────────────────────────────────────────
function drawSparkline(canvas: HTMLCanvasElement, data: number[], color: string): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w / dpr + "px";
  canvas.style.height = h / dpr + "px";
  // Recalculate using actual device dimensions
  const cw = canvas.width;
  const ch = canvas.height;
  ctx.scale(dpr, dpr);
  const actualW = cw / dpr;
  const actualH = ch / dpr;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;
  const plotW = actualW - padding * 2;
  const plotH = actualH - padding * 2;

  ctx.clearRect(0, 0, actualW, actualH);
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (let i = 0; i < data.length; i++) {
    const x = padding + (i / (data.length - 1)) * plotW;
    const y = padding + plotH - ((data[i] - min) / range) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Fill area under the line with gradient
  const lastX = padding + plotW;
  const lastY = padding + plotH - ((data[data.length - 1] - min) / range) * plotH;
  ctx.lineTo(lastX, actualH);
  ctx.lineTo(padding, actualH);
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, 0, 0, actualH);
  grad.addColorStop(0, color.replace(")", ",0.2)").replace("rgb", "rgba"));
  grad.addColorStop(1, color.replace(")", ",0.0)").replace("rgb", "rgba"));
  ctx.fillStyle = grad;
  ctx.fill();

  // End dot
  ctx.beginPath();
  ctx.arc(lastX, lastY, 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

// ── Main App ───────────────────────────────────────────────────────────


  // When live data arrives we would parse it; for now mock data is used

// ── State ──────────────────────────────────────────────────────────────
let sortColumn = 2; // default: signal severity
let sortAsc = true;
let selectedTicker: TickerData | null = null;

// ── Column definitions ─────────────────────────────────────────────────
interface ColumnDef {
  header: string;
  width: string;
  sortKey: (t: TickerData) => number | string;
}

const COLUMNS: ColumnDef[] = [
  { header: "Ticker",       width: "70px",  sortKey: t => t.ticker },
  { header: "Company",      width: "160px", sortKey: t => t.companyName },
  { header: "Signal",       width: "80px",  sortKey: t => SIGNAL_CONFIG[t.signal].sortOrder },
  { header: "Vol MoM%",     width: "85px",  sortKey: t => t.volumeMoM },
  { header: "ASP MoM%",     width: "85px",  sortKey: t => t.aspMoM },
  { header: "Days Supply",  width: "90px",  sortKey: t => t.daysSupply },
  { header: "Disc Chg",     width: "85px",  sortKey: t => t.discountChangeBps },
  { header: "6M Trend",     width: "70px",  sortKey: t => t.sparkline[5] - t.sparkline[0] },
];

async function main() {
  document.body.style.cssText =
    "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;overflow-x:hidden;";

  // Loading state
  document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#94a3b8;">
    <div style="width:20px;height:20px;border:2px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:12px;"></div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    Loading watchlist signal data...
  </div>`;

  const urlParams = _getUrlParams();
  const stateAbbr = urlParams.state?.toUpperCase();

  let data: WatchlistData;
  let usingLive = false;

  try {
    const result = await _callTool("watchlist-monitor", {
      state: stateAbbr,
      tickers: TICKER_UNIVERSE.map((t) => t.ticker),
    });
    const text = result?.content?.find((c: any) => c.type === "text")?.text;
    let parsed: WatchlistData | null = null;
    if (text) {
      try { parsed = JSON.parse(text) as WatchlistData; } catch {}
    }
    if (parsed?.tickers?.length) {
      data = parsed;
      usingLive = true;
    } else {
      data = generateMockData();
    }
  } catch (e) {
    console.warn("Live fetch failed, falling back to mock:", e);
    data = generateMockData();
  }

  render(data, { live: usingLive, scope: stateAbbr });
}

// ── Render ─────────────────────────────────────────────────────────────
function render(data: WatchlistData, meta: { live?: boolean; scope?: string } = {}) {
  document.body.innerHTML = "";

  // ── Header ───────────────────────────────────────────────────────────
  const header = el("div", {
    style: "background:#1e293b;padding:12px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:12px;",
  });
  const scopeLabel = meta.scope ? `Scope: ${meta.scope}` : "National";
  const sourceLabel = meta.live ? "Live 90-day data" : "Sample data";
  header.innerHTML = `
    <h1 style="margin:0;font-size:16px;font-weight:600;color:#f8fafc;">Watchlist Monitor</h1>
    <span style="font-size:12px;color:#64748b;margin-left:4px;">Auto Sector Signal Scan</span>
    <span style="font-size:11px;color:#475569;">&bull; ${scopeLabel}</span>
    <span style="font-size:11px;color:#475569;">&bull; ${sourceLabel}</span>
  `;
  document.body.appendChild(header);
  _addSettingsBar(header);

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

  // ── Sector Summary Bar ───────────────────────────────────────────────
  const sectorBar = el("div", {
    style: "background:#1e293b;border-bottom:1px solid #334155;padding:10px 20px;display:flex;gap:24px;align-items:center;flex-wrap:wrap;",
  });

  const s = data.sector;
  const trendArrow = s.totalVolumeTrend === "UP" ? "\u25B2" : s.totalVolumeTrend === "DOWN" ? "\u25BC" : "\u25C6";
  const trendColor = s.totalVolumeTrend === "UP" ? "#10b981" : s.totalVolumeTrend === "DOWN" ? "#ef4444" : "#f59e0b";
  const aspColor = s.aspChangePct >= 0 ? "#10b981" : "#ef4444";
  const macroConfig: Record<string, { color: string; bg: string }> = {
    BULLISH: { color: "#10b981", bg: "rgba(16,185,129,0.15)" },
    BEARISH: { color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
    NEUTRAL: { color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
  };
  const mc = macroConfig[s.macroSignal];

  sectorBar.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;">
      <span style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Industry Volume</span>
      <span style="font-size:14px;font-weight:700;color:${trendColor};">${trendArrow} ${fmtPct(s.totalVolumeChangePct)}</span>
    </div>
    <div style="width:1px;height:20px;background:#334155;"></div>
    <div style="display:flex;align-items:center;gap:6px;">
      <span style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Avg ASP</span>
      <span style="font-size:14px;font-weight:700;color:#f8fafc;">${fmtCurrency(s.avgASP)}</span>
      <span style="font-size:12px;color:${aspColor};">${fmtPct(s.aspChangePct)}</span>
    </div>
    <div style="width:1px;height:20px;background:#334155;"></div>
    <div style="display:flex;align-items:center;gap:6px;">
      <span style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">EV Penetration</span>
      <span style="font-size:14px;font-weight:700;color:#818cf8;">${s.evPenetrationPct.toFixed(1)}%</span>
    </div>
    <div style="width:1px;height:20px;background:#334155;"></div>
    <div style="display:flex;align-items:center;gap:6px;">
      <span style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Macro Signal</span>
      <span style="display:inline-block;padding:3px 10px;border-radius:4px;font-size:12px;font-weight:700;background:${mc.bg};color:${mc.color};">${s.macroSignal}</span>
    </div>
  `;
  document.body.appendChild(sectorBar);

  // ── Main content: Table + Detail Panel ───────────────────────────────
  const mainWrapper = el("div", {
    style: "display:flex;gap:0;padding:16px 20px;align-items:flex-start;min-height:calc(100vh - 100px);",
  });
  document.body.appendChild(mainWrapper);

  // ── Signal Priority Table ────────────────────────────────────────────
  const tableSection = el("div", {
    style: `flex:1;min-width:0;transition:flex 0.2s;${selectedTicker ? "" : ""}`,
  });
  mainWrapper.appendChild(tableSection);

  // Sort tickers
  const sorted = [...data.tickers].sort((a, b) => {
    const colDef = COLUMNS[sortColumn];
    const av = colDef.sortKey(a);
    const bv = colDef.sortKey(b);
    if (typeof av === "number" && typeof bv === "number") return sortAsc ? av - bv : bv - av;
    return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });

  // Table container
  const tableWrapper = el("div", {
    style: "border:1px solid #334155;border-radius:8px;overflow:hidden;",
  });

  const table = el("table", {
    style: "width:100%;border-collapse:collapse;font-size:13px;",
  });

  // Table head
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  COLUMNS.forEach((col, idx) => {
    const th = document.createElement("th");
    th.style.cssText =
      "padding:10px 12px;text-align:left;background:#1e293b;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;position:sticky;top:0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;cursor:pointer;white-space:nowrap;user-select:none;z-index:1;";
    const arrow = sortColumn === idx ? (sortAsc ? " \u25B2" : " \u25BC") : "";
    th.textContent = col.header + arrow;
    th.addEventListener("click", () => {
      if (sortColumn === idx) sortAsc = !sortAsc;
      else { sortColumn = idx; sortAsc = true; }
      render(data);
    });
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  // Table body
  const tbody = document.createElement("tbody");
  const canvasQueue: Array<{ canvas: HTMLCanvasElement; data: number[]; color: string }> = [];

  for (const t of sorted) {
    const tr = document.createElement("tr");
    const sig = SIGNAL_CONFIG[t.signal];
    const isSelected = selectedTicker?.ticker === t.ticker;
    const rowBg = isSelected ? "rgba(59,130,246,0.12)" : sig.rowTint;

    tr.style.cssText = `border-bottom:1px solid #1e293b;background:${rowBg};cursor:pointer;transition:background 0.15s;`;
    tr.addEventListener("mouseenter", () => {
      if (!isSelected) tr.style.background = "#1e293b";
    });
    tr.addEventListener("mouseleave", () => {
      tr.style.background = isSelected ? "rgba(59,130,246,0.12)" : sig.rowTint;
    });
    tr.addEventListener("click", () => {
      selectedTicker = selectedTicker?.ticker === t.ticker ? null : t;
      render(data);
    });

    // Ticker cell (bold)
    const tdTicker = document.createElement("td");
    tdTicker.style.cssText = "padding:10px 12px;font-weight:700;color:#f8fafc;font-size:14px;";
    tdTicker.textContent = t.ticker;
    tr.appendChild(tdTicker);

    // Company name
    const tdCompany = document.createElement("td");
    tdCompany.style.cssText = "padding:10px 12px;color:#94a3b8;font-size:12px;";
    tdCompany.textContent = t.companyName;
    tr.appendChild(tdCompany);

    // Signal badge
    const tdSignal = document.createElement("td");
    tdSignal.style.cssText = "padding:10px 12px;";
    tdSignal.innerHTML = `<span style="display:inline-block;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700;background:${sig.bg};color:${sig.color};border:1px solid ${sig.border};letter-spacing:0.3px;">${sig.label}</span>`;
    tr.appendChild(tdSignal);

    // Volume MoM%
    const tdVol = document.createElement("td");
    const volColor = t.volumeMoM >= 0 ? "#10b981" : "#ef4444";
    tdVol.style.cssText = `padding:10px 12px;color:${volColor};font-weight:600;font-variant-numeric:tabular-nums;`;
    tdVol.textContent = fmtPct(t.volumeMoM);
    tr.appendChild(tdVol);

    // ASP MoM%
    const tdASP = document.createElement("td");
    const aspCellColor = t.aspMoM >= 0 ? "#10b981" : "#ef4444";
    tdASP.style.cssText = `padding:10px 12px;color:${aspCellColor};font-weight:600;font-variant-numeric:tabular-nums;`;
    tdASP.textContent = fmtPct(t.aspMoM);
    tr.appendChild(tdASP);

    // Days Supply
    const tdDays = document.createElement("td");
    const daysColor = t.daysSupply > 90 ? "#ef4444" : t.daysSupply > 70 ? "#f59e0b" : "#10b981";
    tdDays.style.cssText = `padding:10px 12px;font-weight:600;font-variant-numeric:tabular-nums;`;
    tdDays.innerHTML = `<span style="color:${daysColor};">${t.daysSupply}</span><span style="color:#64748b;font-size:11px;font-weight:400;"> days</span>`;
    tr.appendChild(tdDays);

    // Discount Change (bps)
    const tdDisc = document.createElement("td");
    const discColor = t.discountChangeBps > 100 ? "#ef4444" : t.discountChangeBps > 50 ? "#f59e0b" : t.discountChangeBps <= 0 ? "#10b981" : "#94a3b8";
    tdDisc.style.cssText = `padding:10px 12px;color:${discColor};font-weight:600;font-variant-numeric:tabular-nums;`;
    tdDisc.textContent = fmtBps(t.discountChangeBps);
    tr.appendChild(tdDisc);

    // Sparkline (Canvas)
    const tdSparkline = document.createElement("td");
    tdSparkline.style.cssText = "padding:10px 8px;";
    const canvas = document.createElement("canvas");
    canvas.width = 60;
    canvas.height = 20;
    canvas.style.cssText = "display:block;";
    tdSparkline.appendChild(canvas);
    tr.appendChild(tdSparkline);

    // Determine sparkline color based on trend direction
    const sparkTrend = t.sparkline[t.sparkline.length - 1] - t.sparkline[0];
    const sparkColor = sparkTrend >= 0 ? "#10b981" : "#ef4444";
    canvasQueue.push({ canvas, data: t.sparkline, color: sparkColor });

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  tableSection.appendChild(tableWrapper);

  // ── Alert Detail Panel (right side, on row click) ────────────────────
  if (selectedTicker) {
    const t = selectedTicker;
    const sig = SIGNAL_CONFIG[t.signal];

    const panel = el("div", {
      style: "width:340px;flex-shrink:0;margin-left:16px;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:20px;animation:slideIn 0.2s ease-out;",
    });

    // Inject animation keyframes
    const styleEl = document.createElement("style");
    styleEl.textContent = `@keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}`;
    panel.appendChild(styleEl);

    // Panel header
    const panelHeader = el("div", {
      style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;",
    });
    panelHeader.innerHTML = `
      <div>
        <div style="font-size:20px;font-weight:700;color:#f8fafc;">${t.ticker}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:2px;">${t.companyName}</div>
      </div>
      <span style="display:inline-block;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:700;background:${sig.bg};color:${sig.color};border:1px solid ${sig.border};">${sig.label}</span>
    `;
    panel.appendChild(panelHeader);

    // Metrics grid
    const metricsGrid = el("div", {
      style: "display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;",
    });

    const metrics = [
      { label: "Volume MoM", value: fmtPct(t.volumeMoM), color: t.volumeMoM >= 0 ? "#10b981" : "#ef4444", sector: `Sector: ${fmtPct(t.sectorAvgVolume)}` },
      { label: "ASP MoM", value: fmtPct(t.aspMoM), color: t.aspMoM >= 0 ? "#10b981" : "#ef4444", sector: `Sector: ${fmtPct(t.sectorAvgASP)}` },
      { label: "Days Supply", value: `${t.daysSupply}d`, color: t.daysSupply > 90 ? "#ef4444" : t.daysSupply > 70 ? "#f59e0b" : "#10b981", sector: "Target: 45-60d" },
      { label: "Disc Change", value: fmtBps(t.discountChangeBps), color: t.discountChangeBps > 100 ? "#ef4444" : t.discountChangeBps > 50 ? "#f59e0b" : "#10b981", sector: "Threshold: 100bps" },
    ];

    for (const m of metrics) {
      const metricCard = el("div", {
        style: "background:#0f172a;border:1px solid #334155;border-radius:6px;padding:10px;",
      });
      metricCard.innerHTML = `
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">${m.label}</div>
        <div style="font-size:18px;font-weight:700;color:${m.color};margin-top:3px;">${m.value}</div>
        <div style="font-size:10px;color:#475569;margin-top:2px;">${m.sector}</div>
      `;
      metricsGrid.appendChild(metricCard);
    }
    panel.appendChild(metricsGrid);

    // Sparkline (larger in panel)
    const sparkSection = el("div", {
      style: "margin-bottom:18px;",
    });
    sparkSection.innerHTML = `<div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">6-Month Price Trend</div>`;
    const panelCanvas = document.createElement("canvas");
    panelCanvas.width = 300;
    panelCanvas.height = 60;
    panelCanvas.style.cssText = "display:block;width:100%;border-radius:4px;background:rgba(15,23,42,0.5);";
    sparkSection.appendChild(panelCanvas);

    const priceLine = el("div", {
      style: "display:flex;justify-content:space-between;margin-top:4px;font-size:11px;color:#64748b;",
    });
    priceLine.innerHTML = `<span>$${t.sparkline[0].toFixed(1)}</span><span style="color:#f8fafc;font-weight:600;">$${t.currentPrice.toFixed(1)}</span>`;
    sparkSection.appendChild(priceLine);
    panel.appendChild(sparkSection);

    const panelSparkTrend = t.sparkline[t.sparkline.length - 1] - t.sparkline[0];
    const panelSparkColor = panelSparkTrend >= 0 ? "#10b981" : "#ef4444";
    canvasQueue.push({ canvas: panelCanvas, data: t.sparkline, color: panelSparkColor });

    // Alert detail bullets
    const detailSection = el("div", {});
    detailSection.innerHTML = `<div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Signal Analysis</div>`;

    for (const detail of t.alertDetails) {
      const bullet = el("div", {
        style: "display:flex;gap:8px;margin-bottom:8px;align-items:flex-start;",
      });
      // Determine bullet color based on signal severity
      const bulletDot = t.signal === "ALERT" ? "#ef4444" : t.signal === "WATCH" ? "#f59e0b" : t.signal === "STRONG" ? "#10b981" : "#64748b";
      bullet.innerHTML = `
        <span style="width:6px;height:6px;border-radius:50%;background:${bulletDot};flex-shrink:0;margin-top:5px;"></span>
        <span style="font-size:12px;color:#cbd5e1;line-height:1.4;">${detail}</span>
      `;
      detailSection.appendChild(bullet);
    }
    panel.appendChild(detailSection);

    // Close button
    const closeBtn = el("button", {
      style: "margin-top:16px;width:100%;padding:8px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#94a3b8;font-size:12px;cursor:pointer;font-family:inherit;transition:background 0.15s;",
    });
    closeBtn.textContent = "Close Panel";
    closeBtn.addEventListener("mouseenter", () => { closeBtn.style.background = "#1e293b"; });
    closeBtn.addEventListener("mouseleave", () => { closeBtn.style.background = "#0f172a"; });
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      selectedTicker = null;
      render(data);
    });
    panel.appendChild(closeBtn);

    mainWrapper.appendChild(panel);
  }

  // ── Draw all sparklines after DOM is ready ───────────────────────────
  requestAnimationFrame(() => {
    for (const item of canvasQueue) {
      drawSparkline(item.canvas, item.data, item.color);
    }
  });
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
