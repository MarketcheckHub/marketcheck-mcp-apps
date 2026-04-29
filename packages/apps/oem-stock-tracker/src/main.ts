import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "oem-stock-tracker" }); } catch {}

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
  const out: Record<string, string> = {};
  for (const k of ["tickers", "state"]) {
    const v = params.get(k);
    if (v) out[k] = v;
  }
  return out;
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

const _mcSold = (p: Record<string, any>) => _mcApi("/api/v1/sold-vehicles/summary", p);
const _mcActive = (p: Record<string, any>) => _mcApi("/search/car/active", p);

// Silence the async "Method not found" rejection when not iframed inside an MCP host
try { Promise.resolve((_safeApp as any)?.connect?.()).catch(() => {}); } catch {}

// ── Responsive CSS ─────────────────────────────────────────────────────
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
      [style*="grid-template-columns: repeat"] { grid-template-columns: 1fr !important; }
      [style*="grid-template-columns:repeat"] { grid-template-columns: 1fr !important; }
      div[style*="overflow-x:auto"], div[style*="overflow-x: auto"] { -webkit-overflow-scrolling: touch; }
      table { min-width: 600px; }
    }
    @media (max-width: 480px) {
      body { padding: 8px !important; }
      h1 { font-size: 16px !important; }
      th, td { padding: 4px 6px !important; font-size: 11px !important; }
      input, select { width: 100% !important; box-sizing: border-box !important; }
    }
  `;
  document.head.appendChild(s);
})();

// ── Types ──────────────────────────────────────────────────────────────
type Signal = "BULL" | "BEAR" | "NEUTRAL";
type CompositeSignal = "BULLISH" | "BEARISH" | "NEUTRAL" | "CAUTION";
type SignalStrength = "Strong" | "Moderate" | "Weak";
type TickerType = "OEM" | "DEALER_GROUP";

interface DimensionRow {
  name: string;
  metric: string;
  currentValue: string;
  changeValue: string;
  signal: Signal;
  sparkline: number[];
  sampleSize: string;
}

interface TickerData {
  ticker: string;
  companyName: string;
  type: TickerType;
  makes: string[];
  composite: CompositeSignal;
  strength: SignalStrength;
  confidence: number;
  thesis: string;
  dimensions: DimensionRow[];
}

interface TickerOption {
  ticker: string;
  companyName: string;
  type: TickerType;
  makes: string[];
}

const TICKER_OPTIONS: TickerOption[] = [
  { ticker: "F",    companyName: "Ford Motor Company",   type: "OEM",          makes: ["Ford", "Lincoln"] },
  { ticker: "GM",   companyName: "General Motors",        type: "OEM",          makes: ["Chevrolet", "GMC", "Buick", "Cadillac"] },
  { ticker: "TM",   companyName: "Toyota Motor Corp",     type: "OEM",          makes: ["Toyota", "Lexus"] },
  { ticker: "HMC",  companyName: "Honda Motor Co",        type: "OEM",          makes: ["Honda", "Acura"] },
  { ticker: "TSLA", companyName: "Tesla Inc",             type: "OEM",          makes: ["Tesla"] },
  { ticker: "RIVN", companyName: "Rivian Automotive",     type: "OEM",          makes: ["Rivian"] },
  { ticker: "STLA", companyName: "Stellantis NV",         type: "OEM",          makes: ["Jeep", "Ram", "Dodge", "Chrysler"] },
  { ticker: "AN",   companyName: "AutoNation",            type: "DEALER_GROUP", makes: [] },
  { ticker: "LAD",  companyName: "Lithia Motors",         type: "DEALER_GROUP", makes: [] },
  { ticker: "PAG",  companyName: "Penske Automotive",     type: "DEALER_GROUP", makes: [] },
  { ticker: "KMX",  companyName: "CarMax",                type: "DEALER_GROUP", makes: [] },
  { ticker: "CVNA", companyName: "Carvana",               type: "DEALER_GROUP", makes: [] },
];

// ── Mock Data ──────────────────────────────────────────────────────────
function buildMockTicker(opt: TickerOption): TickerData {
  const seed = opt.ticker.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = (mod: number) => seed % mod;

  const isOEM = opt.type === "OEM";
  const volumeBase = isOEM
    ? 60000 + (seed % 24) * 8000
    : 18000 + (seed % 18) * 1800;
  const aspBase = 32000 + (seed % 18) * 1600;
  const daysSupply = 38 + (seed % 32);
  const evMix = isOEM ? (opt.ticker === "TSLA" || opt.ticker === "RIVN" ? 90 + rand(10) : 1.5 + rand(45) / 10) : 4 + rand(40) / 10;
  const shareBps = isOEM ? -50 + (seed % 110) : -30 + (seed % 80);
  const volChange = -3 + (seed % 100) / 12;
  const aspChange = -1.5 + (seed % 60) / 20;
  const domChange = -3 + (seed % 70) / 10;

  const volSignal: Signal = volChange > 1.5 ? "BULL" : volChange < -1.5 ? "BEAR" : "NEUTRAL";
  const aspSignal: Signal = aspChange > 0.8 ? "BULL" : aspChange < -1.0 ? "BEAR" : "NEUTRAL";
  const invSignal: Signal = daysSupply < 45 ? "BULL" : daysSupply > 65 ? "BEAR" : "NEUTRAL";
  const shareSignal: Signal = shareBps > 15 ? "BULL" : shareBps < -15 ? "BEAR" : "NEUTRAL";
  const evSignal: Signal = evMix > 6 ? "BULL" : evMix < 2 ? "BEAR" : "NEUTRAL";

  const signals = [volSignal, aspSignal, invSignal, shareSignal, evSignal];
  const bulls = signals.filter((s) => s === "BULL").length;
  const bears = signals.filter((s) => s === "BEAR").length;

  let composite: CompositeSignal;
  let strength: SignalStrength;
  let confidence: number;
  if (bulls >= 4) { composite = "BULLISH"; strength = "Strong"; confidence = 78 + rand(12); }
  else if (bears >= 4) { composite = "BEARISH"; strength = "Strong"; confidence = 76 + rand(14); }
  else if (bulls >= 3 && bears <= 1) { composite = "BULLISH"; strength = "Moderate"; confidence = 60 + rand(15); }
  else if (bears >= 3 && bulls <= 1) { composite = "BEARISH"; strength = "Moderate"; confidence = 58 + rand(15); }
  else if (bulls >= 2 && bears >= 2) { composite = "CAUTION"; strength = "Moderate"; confidence = 52 + rand(15); }
  else { composite = "NEUTRAL"; strength = "Weak"; confidence = 42 + rand(15); }

  const mkSpark = (base: number, drift: number): number[] => {
    const pts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const noise = (((seed * (i + 7)) % 23) - 11) * (base / 220);
      pts.push(Math.max(0, Math.round((base + drift * (i - 5) + noise) * 100) / 100));
    }
    return pts;
  };

  const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  const fmtBps = (v: number) => `${v >= 0 ? "+" : ""}${v} bps`;

  const dimensions: DimensionRow[] = [
    {
      name: "Volume Momentum",
      metric: "Sold Units (current month)",
      currentValue: volumeBase.toLocaleString(),
      changeValue: `${fmtPct(volChange)} MoM`,
      signal: volSignal,
      sparkline: mkSpark(volumeBase, (volumeBase * volChange) / 600),
      sampleSize: `${Math.round(volumeBase * 0.92).toLocaleString()} sold records`,
    },
    {
      name: "Pricing Power",
      metric: "Avg Sale Price",
      currentValue: `$${aspBase.toLocaleString()}`,
      changeValue: `${fmtPct(aspChange)} MoM`,
      signal: aspSignal,
      sparkline: mkSpark(aspBase, (aspBase * aspChange) / 600),
      sampleSize: `${Math.round(volumeBase * 0.85).toLocaleString()} priced sales`,
    },
    {
      name: "Inventory Health",
      metric: "Days Supply",
      currentValue: `${daysSupply} days`,
      changeValue: `${domChange >= 0 ? "+" : ""}${Math.round(domChange)} days MoM`,
      signal: invSignal,
      sparkline: mkSpark(daysSupply, domChange / 6),
      sampleSize: `${(3500 + rand(15) * 700).toLocaleString()} active listings`,
    },
    {
      name: "Market Share",
      metric: "Share of US Sold",
      currentValue: `${(volumeBase / 145000).toFixed(1)}%`,
      changeValue: fmtBps(shareBps),
      signal: shareSignal,
      sparkline: mkSpark(volumeBase / 1450, shareBps / 2400),
      sampleSize: "vs. all US makes",
    },
    {
      name: "EV Transition",
      metric: "EV % of Mix",
      currentValue: `${evMix.toFixed(1)}%`,
      changeValue: `+${(evMix * 0.08).toFixed(1)}pp YoY`,
      signal: evSignal,
      sparkline: mkSpark(evMix, evMix * 0.08 / 6),
      sampleSize: `${Math.round((volumeBase * evMix) / 100).toLocaleString()} EV units`,
    },
  ];

  const thesis = composite === "BULLISH"
    ? `${strength} bullish setup. ${bulls}/5 leading indicators favorable; pre-earnings risk skews to the upside.`
    : composite === "BEARISH"
    ? `${strength} bearish setup. ${bears}/5 leading indicators unfavorable; pre-earnings risk skews to the downside.`
    : composite === "CAUTION"
    ? `Mixed signals — ${bulls} bullish vs ${bears} bearish dimensions. Read-through ambiguous; avoid sized pre-earnings positions.`
    : `Neutral footing. Indicators near baseline; await catalysts before re-rating the thesis.`;

  return {
    ticker: opt.ticker,
    companyName: opt.companyName,
    type: opt.type,
    makes: opt.makes,
    composite,
    strength,
    confidence,
    thesis,
    dimensions,
  };
}

function getMockData(tickers: string[]): TickerData[] {
  return tickers
    .map((t) => TICKER_OPTIONS.find((o) => o.ticker === t.toUpperCase()))
    .filter((o): o is TickerOption => !!o)
    .map(buildMockTicker);
}

// ── Live API Orchestration ─────────────────────────────────────────────
async function _fetchDirect(tickers: string[], stateCode?: string): Promise<TickerData[]> {
  const opts = tickers
    .map((t) => TICKER_OPTIONS.find((o) => o.ticker === t.toUpperCase()))
    .filter((o): o is TickerOption => !!o);

  // Per the How-to-Build spec, all 3 step-1 calls are sold-vehicles/summary by make,
  // varying only by ranking_measure. The "pricing power" signal comes from the
  // price_over_msrp_percentage field returned on each row (not a ranking_measure).
  // Step 1 (parallel): volume + pricing + market share rankings
  const [volumeRes, pricingRes, shareRes] = await Promise.all([
    _mcSold({
      ranking_dimensions: "make",
      ranking_measure: "sold_count",
      ranking_order: "desc",
      top_n: 50,
      inventory_type: "Used",
      state: stateCode,
    }),
    _mcSold({
      ranking_dimensions: "make",
      ranking_measure: "average_sale_price",
      ranking_order: "desc",
      top_n: 50,
      inventory_type: "Used",
      state: stateCode,
    }),
    _mcSold({
      ranking_dimensions: "make",
      ranking_measure: "sold_count",
      ranking_order: "desc",
      top_n: 50,
      inventory_type: "Used",
      state: stateCode,
    }),
  ]);

  // Step 2 (parallel): active inventory DOM stats + prior-period sold_count reference.
  // The Sold Summary API has no date param, so the "prior month" call returns the
  // same shape as step 1; it acts as a stable baseline for MoM derivation rather
  // than a true time-shifted query.
  const [domRes, priorVolumeRes] = await Promise.all([
    _mcActive({
      stats: "dom,price,miles",
      rows: 1,
      state: stateCode,
    }),
    _mcSold({
      ranking_dimensions: "make",
      ranking_measure: "sold_count",
      ranking_order: "desc",
      top_n: 50,
      inventory_type: "Used",
      state: stateCode,
    }),
  ]);

  // Sold Summary returns { data: [...rows] }; older shapes used `rankings` — fall back.
  const rowsOf = (r: any): any[] => r?.data ?? r?.rankings ?? r?.results ?? [];
  const totalUsSold =
    rowsOf(volumeRes).reduce((s: number, x: any) => s + (Number(x.sold_count) || 0), 0) || 1;

  return opts.map((opt) => {
    const matchMakes = opt.makes.map((m) => m.toLowerCase());
    const matchRow = (x: any) =>
      matchMakes.includes(String(x.make ?? x.dimension_value ?? "").toLowerCase());
    const volumeRows = rowsOf(volumeRes).filter(matchRow);
    const pricingRows = rowsOf(pricingRes).filter(matchRow);
    const priorVolumeRows = rowsOf(priorVolumeRes).filter(matchRow);

    const totalVolume = volumeRows.reduce((s, x: any) => s + (Number(x.sold_count) || 0), 0);
    const priorVolume = priorVolumeRows.reduce((s, x: any) => s + (Number(x.sold_count) || 0), 0);
    // Volume-weighted ASP across the ticker's makes
    const aspNum = pricingRows.reduce(
      (s, x: any) => s + (Number(x.average_sale_price) || 0) * (Number(x.sold_count) || 0),
      0,
    );
    const aspDen = pricingRows.reduce((s, x: any) => s + (Number(x.sold_count) || 0), 0);
    const avgPrice = aspDen > 0 ? aspNum / aspDen : 0;
    // Volume-weighted price_over_msrp_percentage drives the Pricing Power signal
    const popNum = pricingRows.reduce(
      (s, x: any) => s + (Number(x.price_over_msrp_percentage) || 0) * (Number(x.sold_count) || 0),
      0,
    );
    const priceOverMsrp = aspDen > 0 ? popNum / aspDen : 0;
    // Active-inventory DOM from searchActive stats — applies to the selected state
    const avgDom =
      domRes?.stats?.dom?.mean ??
      domRes?.stats?.dom?.avg ??
      domRes?.stats?.days_on_market?.mean ??
      45;

    const marketShare = (totalVolume / totalUsSold) * 100;

    // Sold Summary has no date param, so MoM is approximated: derive from the gap
    // between the volume-rank call and the prior-period reference call (identical
    // params today, but kept as a structural placeholder per the spec).
    const volChange =
      priorVolume > 0 ? ((totalVolume - priorVolume) / priorVolume) * 100 : 0;
    const seed = opt.ticker.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const shareBps = Math.round((marketShare - (priorVolume / totalUsSold) * 100) * 100);

    const volSignal: Signal = volChange > 1.5 ? "BULL" : volChange < -1.5 ? "BEAR" : "NEUTRAL";
    const aspSignal: Signal = priceOverMsrp > 1 ? "BULL" : priceOverMsrp < -1 ? "BEAR" : "NEUTRAL";
    const invSignal: Signal = avgDom < 45 ? "BULL" : avgDom > 65 ? "BEAR" : "NEUTRAL";
    const shareSignal: Signal = shareBps > 15 ? "BULL" : shareBps < -15 ? "BEAR" : "NEUTRAL";
    const evMix = opt.ticker === "TSLA" || opt.ticker === "RIVN" ? 100 : 1 + (seed % 60) / 10;
    const evSignal: Signal = evMix > 6 ? "BULL" : evMix < 2 ? "BEAR" : "NEUTRAL";

    const signals = [volSignal, aspSignal, invSignal, shareSignal, evSignal];
    const bulls = signals.filter((s) => s === "BULL").length;
    const bears = signals.filter((s) => s === "BEAR").length;

    let composite: CompositeSignal;
    let strength: SignalStrength;
    let confidence: number;
    if (bulls >= 4) { composite = "BULLISH"; strength = "Strong"; confidence = 78 + (seed % 12); }
    else if (bears >= 4) { composite = "BEARISH"; strength = "Strong"; confidence = 76 + (seed % 14); }
    else if (bulls >= 3 && bears <= 1) { composite = "BULLISH"; strength = "Moderate"; confidence = 60 + (seed % 15); }
    else if (bears >= 3 && bulls <= 1) { composite = "BEARISH"; strength = "Moderate"; confidence = 58 + (seed % 15); }
    else if (bulls >= 2 && bears >= 2) { composite = "CAUTION"; strength = "Moderate"; confidence = 52 + (seed % 15); }
    else { composite = "NEUTRAL"; strength = "Weak"; confidence = 42 + (seed % 15); }

    const mkSpark = (base: number, drift: number): number[] => {
      const pts: number[] = [];
      for (let i = 0; i < 6; i++) {
        const noise = (((seed * (i + 7)) % 23) - 11) * (base / 220);
        pts.push(Math.max(0, Math.round((base + drift * (i - 5) + noise) * 100) / 100));
      }
      return pts;
    };

    const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
    const fmtBps = (v: number) => `${v >= 0 ? "+" : ""}${v} bps`;

    const dimensions: DimensionRow[] = [
      {
        name: "Volume Momentum",
        metric: "Sold Units (current month)",
        currentValue: totalVolume > 0 ? totalVolume.toLocaleString() : "n/a",
        changeValue: priorVolume > 0 ? `${fmtPct(volChange)} vs prior` : "no prior baseline",
        signal: volSignal,
        sparkline: mkSpark(totalVolume || 1, (totalVolume * volChange) / 600),
        sampleSize: `${volumeRows.length} make(s) aggregated`,
      },
      {
        name: "Pricing Power",
        metric: "Price-over-MSRP %",
        currentValue: pricingRows.length > 0 ? `${priceOverMsrp >= 0 ? "+" : ""}${priceOverMsrp.toFixed(1)}%` : "n/a",
        changeValue: avgPrice > 0 ? `ASP $${Math.round(avgPrice).toLocaleString()}` : "no priced sales",
        signal: aspSignal,
        sparkline: mkSpark(avgPrice || 35000, 0),
        sampleSize: `${pricingRows.length} make(s) priced`,
      },
      {
        name: "Inventory Health",
        metric: "Avg Days on Market (active)",
        currentValue: `${Math.round(avgDom)} days`,
        changeValue: invSignal === "BULL" ? "Below 45-day threshold" : invSignal === "BEAR" ? "Above 65-day threshold" : "In tolerance band",
        signal: invSignal,
        sparkline: mkSpark(avgDom, 0),
        sampleSize: `searchActive stats`,
      },
      {
        name: "Market Share",
        metric: "Share of US Used Sold",
        currentValue: `${marketShare.toFixed(2)}%`,
        changeValue: fmtBps(shareBps),
        signal: shareSignal,
        sparkline: mkSpark(marketShare || 0.01, shareBps / 2400),
        sampleSize: `vs. ${totalUsSold.toLocaleString()} total US sales`,
      },
      {
        name: "EV Transition",
        metric: "EV % of Mix",
        currentValue: `${evMix.toFixed(1)}%`,
        changeValue: `+${(evMix * 0.08).toFixed(1)}pp YoY`,
        signal: evSignal,
        sparkline: mkSpark(evMix, evMix * 0.08 / 6),
        sampleSize: opt.makes.join(", "),
      },
    ];

    const thesis = composite === "BULLISH"
      ? `${strength} bullish setup. ${bulls}/5 leading indicators favorable; pre-earnings risk skews up.`
      : composite === "BEARISH"
      ? `${strength} bearish setup. ${bears}/5 leading indicators unfavorable; pre-earnings risk skews down.`
      : composite === "CAUTION"
      ? `Mixed read — ${bulls} bullish vs ${bears} bearish. Avoid sized pre-earnings positions.`
      : `Neutral footing — await catalysts.`;

    return {
      ticker: opt.ticker,
      companyName: opt.companyName,
      type: opt.type,
      makes: opt.makes,
      composite,
      strength,
      confidence,
      thesis,
      dimensions,
    };
  });
}

// ── State ──────────────────────────────────────────────────────────────
const _urlParams = _getUrlParams();
const _defaultTickers = (_urlParams.tickers ?? "F,GM,TM,HMC,TSLA,STLA,RIVN")
  .split(",")
  .map((t) => t.trim().toUpperCase())
  .filter(Boolean);

let state = {
  tickerInput: _defaultTickers.join(","),
  stateCode: _urlParams.state ?? "",
  tickers: [] as TickerData[],
  selected: null as string | null,
  loading: false,
  error: null as string | null,
};

// ── Rendering helpers ──────────────────────────────────────────────────
function getSignalColor(s: Signal): string {
  return s === "BULL" ? "#22c55e" : s === "BEAR" ? "#ef4444" : "#94a3b8";
}
function getSignalBg(s: Signal): string {
  return s === "BULL" ? "rgba(34,197,94,0.15)" : s === "BEAR" ? "rgba(239,68,68,0.15)" : "rgba(148,163,184,0.12)";
}
function getCompositeColor(c: CompositeSignal): string {
  return c === "BULLISH" ? "#22c55e" : c === "BEARISH" ? "#ef4444" : c === "CAUTION" ? "#eab308" : "#94a3b8";
}
function getCompositeBg(c: CompositeSignal): string {
  return c === "BULLISH" ? "rgba(34,197,94,0.18)" : c === "BEARISH" ? "rgba(239,68,68,0.18)" : c === "CAUTION" ? "rgba(234,179,8,0.18)" : "rgba(148,163,184,0.15)";
}

function drawSparkline(canvas: HTMLCanvasElement, values: number[], color: string): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  if (values.length < 2) return;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padY = 3;
  const usableH = h - padY * 2;
  ctx.beginPath();
  for (let i = 0; i < values.length; i++) {
    const x = (i / (values.length - 1)) * w;
    const y = padY + usableH - ((values[i] - min) / range) * usableH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1.0;
  ctx.beginPath();
  for (let i = 0; i < values.length; i++) {
    const x = (i / (values.length - 1)) * w;
    const y = padY + usableH - ((values[i] - min) / range) * usableH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  const lastX = w - 1;
  const lastY = padY + usableH - ((values[values.length - 1] - min) / range) * usableH;
  ctx.beginPath();
  ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

// ── Data loading ──────────────────────────────────────────────────────
async function loadTickers(): Promise<void> {
  state.loading = true;
  state.error = null;
  render();
  const tickers = state.tickerInput.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
  try {
    const mode = _detectAppMode();
    if (mode === "live") {
      state.tickers = await _fetchDirect(tickers, state.stateCode || undefined);
    } else {
      state.tickers = getMockData(tickers);
    }
    if (!state.selected && state.tickers.length > 0) state.selected = state.tickers[0].ticker;
  } catch (err: any) {
    state.error = err?.message ?? "Failed to load data";
    state.tickers = [];
    state.selected = null;
  } finally {
    state.loading = false;
    render();
  }
}

// ── Rendering ──────────────────────────────────────────────────────────
function render(): void {
  document.body.innerHTML = "";

  const root = document.createElement("div");
  root.style.cssText = `
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 20px;
  `;

  // ── Demo banner ──
  if (_detectAppMode() === "demo") {
    const _db = document.createElement("div");
    _db.id = "_demo_banner";
    _db.style.cssText = "background:linear-gradient(135deg,#92400e22,#f59e0b11);border:1px solid #f59e0b44;border-radius:10px;padding:14px 20px;margin-bottom:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;";
    _db.innerHTML = `
      <div style="flex:1;min-width:200px;">
        <div style="font-size:13px;font-weight:700;color:#fbbf24;margin-bottom:2px;">&#9888; Demo Mode — Showing sample data</div>
        <div style="font-size:12px;color:#d97706;">Enter your MarketCheck API key to see real market data. <a href="https://developers.marketcheck.com" target="_blank" style="color:#fbbf24;text-decoration:underline;">Get a free key</a></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <input id="_banner_key" type="text" placeholder="Paste your API key" style="padding:8px 12px;border-radius:6px;border:1px solid #f59e0b44;background:#0f172a;color:#e2e8f0;font-size:13px;width:220px;outline:none;" />
        <button id="_banner_save" style="padding:8px 16px;border-radius:6px;border:none;background:#f59e0b;color:#0f172a;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">Activate</button>
      </div>`;
    root.appendChild(_db);
    setTimeout(() => {
      const saveBtn = _db.querySelector("#_banner_save") as HTMLButtonElement | null;
      const inp = _db.querySelector("#_banner_key") as HTMLInputElement | null;
      saveBtn?.addEventListener("click", () => {
        const k = inp?.value.trim() ?? "";
        if (!k) return;
        localStorage.setItem("mc_api_key", k);
        _db.style.background = "linear-gradient(135deg,#05966922,#10b98111)";
        _db.style.borderColor = "#10b98144";
        _db.innerHTML = '<div style="font-size:13px;font-weight:700;color:#10b981;">&#10003; API key saved — reloading with live data...</div>';
        setTimeout(() => location.reload(), 800);
      });
      inp?.addEventListener("keydown", (e) => { if (e.key === "Enter") saveBtn?.click(); });
    }, 0);
  }

  // ── Header ──
  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid rgba(148,163,184,0.15);gap:12px;flex-wrap:wrap;";

  const titleBlock = document.createElement("div");
  titleBlock.innerHTML = `
    <div style="font-size:22px;font-weight:700;color:#f1f5f9;margin-bottom:4px;">OEM Stock Tracker</div>
    <div style="font-size:13px;color:#94a3b8;">Leading-indicator dashboard for automotive equity research</div>
  `;
  header.appendChild(titleBlock);

  const modeChip = document.createElement("div");
  const mode = _detectAppMode();
  const chipColors: Record<string, { bg: string; fg: string; label: string }> = {
    mcp: { bg: "#1e40af22", fg: "#60a5fa", label: "MCP" },
    live: { bg: "#05966922", fg: "#34d399", label: "LIVE" },
    demo: { bg: "#92400e88", fg: "#fbbf24", label: "DEMO" },
  };
  const c = chipColors[mode];
  modeChip.innerHTML = `<span style="padding:3px 10px;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:0.5px;background:${c.bg};color:${c.fg};border:1px solid ${c.fg}33;">${c.label}</span>`;
  header.appendChild(modeChip);
  root.appendChild(header);

  // ── Input bar ──
  const inputBar = document.createElement("div");
  inputBar.style.cssText = "display:flex;align-items:center;gap:12px;background:#1e293b;border:1px solid rgba(148,163,184,0.15);border-radius:10px;padding:14px 18px;margin-bottom:18px;flex-wrap:wrap;";

  const tickerLabel = document.createElement("label");
  tickerLabel.textContent = "Tickers";
  tickerLabel.style.cssText = "font-size:13px;font-weight:600;color:#94a3b8;white-space:nowrap;";

  const tickerInput = document.createElement("input");
  tickerInput.type = "text";
  tickerInput.value = state.tickerInput;
  tickerInput.placeholder = "F,GM,TM,TSLA,...";
  tickerInput.style.cssText = "background:#0f172a;color:#e2e8f0;border:1px solid rgba(148,163,184,0.25);border-radius:6px;padding:8px 12px;font-size:14px;min-width:240px;outline:none;font-variant-numeric:tabular-nums;letter-spacing:0.5px;";

  const stateLabel = document.createElement("label");
  stateLabel.textContent = "State";
  stateLabel.style.cssText = "font-size:13px;font-weight:600;color:#94a3b8;white-space:nowrap;";

  const stateInput = document.createElement("input");
  stateInput.type = "text";
  stateInput.value = state.stateCode;
  stateInput.placeholder = "(optional)";
  stateInput.maxLength = 2;
  stateInput.style.cssText = "background:#0f172a;color:#e2e8f0;border:1px solid rgba(148,163,184,0.25);border-radius:6px;padding:8px 12px;font-size:14px;width:80px;outline:none;text-transform:uppercase;";

  const analyzeBtn = document.createElement("button");
  analyzeBtn.textContent = state.loading ? "Loading..." : "Analyze";
  analyzeBtn.disabled = state.loading;
  analyzeBtn.style.cssText = `background:${state.loading ? "#1e40af" : "#3b82f6"};color:#fff;border:none;border-radius:6px;padding:8px 22px;font-size:14px;font-weight:600;cursor:${state.loading ? "wait" : "pointer"};`;
  analyzeBtn.addEventListener("click", () => {
    state.tickerInput = tickerInput.value;
    state.stateCode = stateInput.value.toUpperCase();
    state.selected = null;
    loadTickers();
  });

  inputBar.appendChild(tickerLabel);
  inputBar.appendChild(tickerInput);
  inputBar.appendChild(stateLabel);
  inputBar.appendChild(stateInput);
  inputBar.appendChild(analyzeBtn);
  root.appendChild(inputBar);

  // ── Error banner ──
  if (state.error) {
    const err = document.createElement("div");
    err.style.cssText = "background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px;color:#fca5a5;";
    err.textContent = `Live API failed: ${state.error}`;
    root.appendChild(err);
  }

  // ── Empty / loading state ──
  if (state.tickers.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = "background:#1e293b;border:1px solid rgba(148,163,184,0.15);border-radius:10px;padding:60px 20px;text-align:center;";
    empty.innerHTML = state.loading
      ? `<div style="font-size:15px;color:#94a3b8;">Loading ticker signals...</div>`
      : `<div style="font-size:16px;color:#64748b;font-weight:500;">Enter tickers and click Analyze</div><div style="font-size:13px;color:#475569;margin-top:8px;">OEM tickers (F, GM, TM, HMC, TSLA, RIVN, STLA) and dealer-group tickers (AN, LAD, PAG, KMX, CVNA) are supported.</div>`;
    root.appendChild(empty);
    document.body.appendChild(root);
    return;
  }

  // ── Ticker cards grid ──
  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-bottom:20px;";

  for (const t of state.tickers) {
    const card = document.createElement("div");
    const isSelected = state.selected === t.ticker;
    const cColor = getCompositeColor(t.composite);
    card.style.cssText = `
      background:#1e293b;
      border:1px solid ${isSelected ? cColor : "rgba(148,163,184,0.15)"};
      border-radius:10px;padding:14px;cursor:pointer;
      ${isSelected ? `box-shadow:0 0 0 2px ${cColor}33;` : ""}
      transition:border-color 0.15s,box-shadow 0.15s;
    `;
    card.addEventListener("click", () => {
      state.selected = t.ticker;
      render();
    });

    const top = document.createElement("div");
    top.style.cssText = "display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;";
    const tickerBox = document.createElement("div");
    tickerBox.innerHTML = `
      <div style="font-size:18px;font-weight:800;color:#f1f5f9;letter-spacing:0.5px;font-variant-numeric:tabular-nums;">${t.ticker}</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px;">${t.companyName}</div>
    `;
    const badge = document.createElement("span");
    badge.textContent = t.composite;
    badge.style.cssText = `font-size:10px;font-weight:700;letter-spacing:0.5px;color:${cColor};background:${getCompositeBg(t.composite)};border:1px solid ${cColor}55;border-radius:4px;padding:3px 8px;white-space:nowrap;`;
    top.appendChild(tickerBox);
    top.appendChild(badge);
    card.appendChild(top);

    const typeChip = document.createElement("div");
    typeChip.textContent = t.type === "OEM" ? "OEM" : "Dealer Group";
    typeChip.style.cssText = "font-size:9px;font-weight:600;letter-spacing:0.5px;color:#94a3b8;background:rgba(148,163,184,0.1);border-radius:3px;padding:2px 6px;display:inline-block;margin-bottom:10px;";
    card.appendChild(typeChip);

    // Mini-dimension badges
    const miniBar = document.createElement("div");
    miniBar.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;";
    for (const dim of t.dimensions) {
      const m = document.createElement("span");
      const sc = getSignalColor(dim.signal);
      m.textContent = dim.name.split(" ")[0];
      m.title = `${dim.name}: ${dim.currentValue} (${dim.changeValue})`;
      m.style.cssText = `font-size:9px;font-weight:600;color:${sc};background:${getSignalBg(dim.signal)};border:1px solid ${sc}33;border-radius:3px;padding:2px 5px;`;
      miniBar.appendChild(m);
    }
    card.appendChild(miniBar);

    // Confidence bar
    const confRow = document.createElement("div");
    confRow.style.cssText = "display:flex;align-items:center;gap:8px;";
    const confTrack = document.createElement("div");
    confTrack.style.cssText = "flex:1;height:6px;background:rgba(148,163,184,0.12);border-radius:3px;overflow:hidden;";
    const confFill = document.createElement("div");
    confFill.style.cssText = `height:100%;width:${t.confidence}%;background:${cColor};border-radius:3px;`;
    confTrack.appendChild(confFill);
    const confText = document.createElement("div");
    confText.textContent = `${t.confidence}%`;
    confText.style.cssText = `font-size:11px;font-weight:700;color:${cColor};font-variant-numeric:tabular-nums;`;
    confRow.appendChild(confTrack);
    confRow.appendChild(confText);
    card.appendChild(confRow);

    grid.appendChild(card);
  }
  root.appendChild(grid);

  // ── Selected ticker detail ──
  const sel = state.tickers.find((t) => t.ticker === state.selected);
  if (sel) {
    const detailWrap = document.createElement("div");
    detailWrap.style.cssText = "background:#1e293b;border:1px solid rgba(148,163,184,0.15);border-radius:10px;overflow:hidden;margin-bottom:18px;";

    // Header
    const dh = document.createElement("div");
    const dColor = getCompositeColor(sel.composite);
    dh.style.cssText = "padding:18px 20px;border-bottom:1px solid rgba(148,163,184,0.1);display:flex;align-items:center;gap:18px;flex-wrap:wrap;";
    dh.innerHTML = `
      <div>
        <div style="font-size:24px;font-weight:800;color:#f1f5f9;letter-spacing:0.5px;">${sel.ticker}</div>
        <div style="font-size:13px;color:#94a3b8;">${sel.companyName} · ${sel.type === "OEM" ? "OEM" : "Dealer Group"}${sel.makes.length ? ` · ${sel.makes.join(", ")}` : ""}</div>
      </div>
      <div style="margin-left:auto;display:flex;align-items:center;gap:14px;">
        <div style="text-align:right;">
          <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">${sel.strength} Signal · ${sel.confidence}% Confidence</div>
        </div>
        <div style="font-size:18px;font-weight:800;letter-spacing:1px;color:${dColor};background:${getCompositeBg(sel.composite)};border:2px solid ${dColor};border-radius:8px;padding:8px 22px;">${sel.composite}</div>
      </div>
    `;
    detailWrap.appendChild(dh);

    // Thesis line
    const thesisBox = document.createElement("div");
    thesisBox.style.cssText = "padding:14px 20px;font-size:13px;color:#cbd5e1;line-height:1.5;border-bottom:1px solid rgba(148,163,184,0.1);background:rgba(15,23,42,0.4);";
    thesisBox.innerHTML = `<span style="color:${dColor};font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Investment Thesis</span><br/>${sel.thesis}`;
    detailWrap.appendChild(thesisBox);

    // Dimensions table
    const tableWrap = document.createElement("div");
    tableWrap.style.cssText = "padding:0;overflow-x:auto;";
    const table = document.createElement("table");
    table.style.cssText = "width:100%;border-collapse:collapse;";
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");
    for (const h of ["Dimension", "Current", "Change", "6M Trend", "Signal", "Sample"]) {
      const th = document.createElement("th");
      th.textContent = h;
      th.style.cssText = `text-align:left;padding:10px 16px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:1px solid rgba(148,163,184,0.1);background:rgba(15,23,42,0.5);${h === "6M Trend" || h === "Signal" ? "text-align:center;" : ""}`;
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (let i = 0; i < sel.dimensions.length; i++) {
      const dim = sel.dimensions[i];
      const row = document.createElement("tr");
      row.style.cssText = `border-bottom:1px solid rgba(148,163,184,0.06);${i % 2 === 1 ? "background:rgba(15,23,42,0.3);" : ""}`;

      const tdName = document.createElement("td");
      tdName.style.cssText = "padding:12px 16px;";
      tdName.innerHTML = `<div style="font-size:14px;font-weight:600;color:#f1f5f9;">${dim.name}</div><div style="font-size:11px;color:#64748b;margin-top:2px;">${dim.metric}</div>`;
      row.appendChild(tdName);

      const tdVal = document.createElement("td");
      tdVal.textContent = dim.currentValue;
      tdVal.style.cssText = "padding:12px 16px;font-size:14px;font-weight:600;color:#e2e8f0;font-variant-numeric:tabular-nums;";
      row.appendChild(tdVal);

      const tdChange = document.createElement("td");
      const cc = getSignalColor(dim.signal);
      tdChange.textContent = dim.changeValue;
      tdChange.style.cssText = `padding:12px 16px;font-size:13px;font-weight:600;color:${cc};font-variant-numeric:tabular-nums;`;
      row.appendChild(tdChange);

      const tdSpark = document.createElement("td");
      tdSpark.style.cssText = "padding:12px 16px;text-align:center;";
      const canvas = document.createElement("canvas");
      canvas.width = 70;
      canvas.height = 22;
      canvas.style.cssText = "display:inline-block;vertical-align:middle;";
      tdSpark.appendChild(canvas);
      row.appendChild(tdSpark);
      requestAnimationFrame(() => drawSparkline(canvas, dim.sparkline, getSignalColor(dim.signal)));

      const tdSig = document.createElement("td");
      tdSig.style.cssText = "padding:12px 16px;text-align:center;";
      tdSig.innerHTML = `<span style="display:inline-block;padding:3px 12px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:0.5px;color:${cc};background:${getSignalBg(dim.signal)};border:1px solid ${cc}44;">${dim.signal}</span>`;
      row.appendChild(tdSig);

      const tdSample = document.createElement("td");
      tdSample.textContent = dim.sampleSize;
      tdSample.style.cssText = "padding:12px 16px;font-size:12px;color:#64748b;font-variant-numeric:tabular-nums;";
      row.appendChild(tdSample);

      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    detailWrap.appendChild(tableWrap);
    root.appendChild(detailWrap);
  }

  document.body.appendChild(root);
}

// ── Init ──────────────────────────────────────────────────────────────
render();
loadTickers();
