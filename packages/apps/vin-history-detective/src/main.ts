/**
 * VIN History Detective — Complete Listing Timeline Tracker
 * Enter any VIN and see its complete listing timeline across dealers,
 * price trajectory, dealer hop chain, and red flag alerts.
 */
import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "vin-history-detective" }); } catch {}

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
  for (const key of ["vin", "zip", "make", "model", "miles", "state", "dealer_id", "ticker", "price", "compact"]) {
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

async function _fetchDirect(args: { vin: string; miles?: number | string; zip?: string }) {
  const decode = await _mcDecode(args.vin);
  const history = await _mcHistory(args.vin);
  // Price prediction requires miles AND (zip OR city+state). If caller didn't
  // provide miles, fall back to the most recent priced history entry's miles.
  let miles = args.miles ? Number(args.miles) : 0;
  if (!miles && Array.isArray(history)) {
    const priced = history.filter((h: any) => h.price && h.miles).sort((a: any, b: any) => (b.last_seen_at ?? 0) - (a.last_seen_at ?? 0));
    if (priced.length) miles = Number(priced[0].miles);
  }
  // Derive a zip from the most recent listing if the caller didn't provide one.
  let zip = args.zip || "";
  if (!zip && Array.isArray(history)) {
    const withZip = history.filter((h: any) => h.zip).sort((a: any, b: any) => (b.last_seen_at ?? 0) - (a.last_seen_at ?? 0));
    if (withZip.length) zip = String(withZip[0].zip);
  }
  let prediction: any = null;
  if (miles && zip) {
    try {
      prediction = await _mcPredict({ vin: args.vin, miles, dealer_type: "franchise", zip });
    } catch (e) {
      console.warn("predict failed", e);
    }
  }
  return { decode, history, prediction };
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
      if (r.ok) { const d = await r.json(); return { content: [{ type: "text", text: JSON.stringify(d) }] }; }
    } catch {}
    // 2. Direct API fallback
    try {
      const data = await _fetchDirect(args);
      if (data) return { content: [{ type: "text", text: JSON.stringify(data) }] };
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
      [style*="width:35%"], [style*="width:40%"], [style*="width:25%"],
      [style*="width:50%"], [style*="width:60%"], [style*="width:65%"],
      [style*="width: 35%"], [style*="width: 40%"], [style*="width: 25%"],
      [style*="width: 50%"], [style*="width: 60%"], [style*="width: 65%"] {
        width: 100% !important; min-width: 0 !important;
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

interface VehicleSpec {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  bodyType: string;
  engine: string;
  transmission: string;
  drivetrain: string;
  fuelType: string;
  msrp: number;
}

interface ListingEntry {
  date: string;
  endDate: string;
  price: number;
  dealerName: string;
  city: string;
  state: string;
  miles: number;
  dom: number;
  source: string;
}

interface DealerHop {
  dealerName: string;
  city: string;
  state: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  daysHeld: number;
}

interface RedFlag {
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
}

interface VinHistoryData {
  vehicle: VehicleSpec;
  listings: ListingEntry[];
  dealers: DealerHop[];
  totalListings: number;
  totalDealers: number;
  totalDaysOnMarket: number;
  totalPriceChange: number;
  firstPrice: number;
  lastPrice: number;
  currentFmv: number;
  redFlags: RedFlag[];
}

// ── Live API → VinHistoryData transform ───────────────────────────────────

function _daysBetween(start: string, end: string): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (!isFinite(s) || !isFinite(e) || e < s) return 0;
  return Math.max(1, Math.round((e - s) / 86400000));
}

function _titleCase(s: string): string {
  if (!s) return "";
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function transformLive(raw: { decode: any; history: any; prediction: any }, vin: string): VinHistoryData {
  const decode = raw?.decode ?? {};
  const historyArr: any[] = Array.isArray(raw?.history) ? raw.history : [];

  const vehicle: VehicleSpec = {
    vin: String(decode.vin ?? vin),
    year: Number(decode.year ?? 0) || 0,
    make: String(decode.make ?? ""),
    model: String(decode.model ?? ""),
    trim: String(decode.trim ?? ""),
    bodyType: String(decode.body_type ?? ""),
    engine: String(decode.engine ?? ""),
    transmission: String(decode.transmission_description ?? decode.transmission ?? ""),
    drivetrain: String(decode.drivetrain ?? ""),
    fuelType: String(decode.fuel_type ?? ""),
    msrp: Number(decode.combined_msrp ?? decode.mc_msrp ?? decode.msrp ?? 0) || 0,
  };

  // Filter to priced listings with a valid first-seen date, sort chronologically.
  const priced = historyArr
    .filter((h) => h.price && h.first_seen_at_date)
    .map((h) => ({
      date: String(h.first_seen_at_date),
      endDate: String(h.last_seen_at_date ?? h.first_seen_at_date),
      price: Number(h.price) || 0,
      dealerName: _titleCase(String(h.seller_name ?? "Unknown")),
      city: String(h.city ?? ""),
      state: String(h.state ?? ""),
      miles: Number(h.miles ?? 0) || 0,
      dom: 0,
      source: String(h.source ?? "").replace(/\.com$/, ""),
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Compute dom from first/last seen dates, since the history endpoint doesn't
  // always return a `dom` field.
  for (const l of priced) l.dom = _daysBetween(l.date, l.endDate);

  // Collapse consecutive same-dealer listings into a single dealer hop.
  const dealers: DealerHop[] = [];
  for (const l of priced) {
    const last = dealers[dealers.length - 1];
    if (last && last.dealerName === l.dealerName && last.city === l.city && last.state === l.state) {
      last.exitDate = l.endDate;
      last.exitPrice = l.price;
      last.daysHeld = _daysBetween(last.entryDate, last.exitDate);
    } else {
      dealers.push({
        dealerName: l.dealerName,
        city: l.city,
        state: l.state,
        entryDate: l.date,
        exitDate: l.endDate,
        entryPrice: l.price,
        exitPrice: l.price,
        daysHeld: _daysBetween(l.date, l.endDate),
      });
    }
  }

  const totalListings = priced.length;
  const totalDealers = dealers.length;
  const totalDaysOnMarket = priced.reduce((s, l) => s + (l.dom || 0), 0);
  const firstPrice = priced[0]?.price ?? 0;
  const lastPrice = priced[priced.length - 1]?.price ?? 0;
  const totalPriceChange = lastPrice - firstPrice;
  const currentFmv = Number(raw?.prediction?.marketcheck_price ?? 0) || 0;

  // Red flags
  const redFlags: RedFlag[] = [];
  if (totalDealers >= 4) {
    redFlags.push({
      severity: totalDealers >= 6 ? "high" : "medium",
      title: "Excessive Dealer Transfers",
      detail: `This vehicle has been through ${totalDealers} different dealers. Typical vehicles change hands 1-2 times — repeated transfers may indicate undisclosed issues.`,
    });
  }
  if (totalDaysOnMarket > 180) {
    redFlags.push({
      severity: totalDaysOnMarket > 365 ? "high" : "medium",
      title: "Prolonged Total Market Time",
      detail: `${totalDaysOnMarket} total days on market across all listings. The average vehicle sells within 45 days. Extended market time often signals pricing or condition issues.`,
    });
  }
  if (firstPrice > 0 && totalPriceChange < 0) {
    const dropPct = (Math.abs(totalPriceChange) / firstPrice) * 100;
    if (dropPct >= 10) {
      redFlags.push({
        severity: dropPct >= 20 ? "high" : "medium",
        title: "Significant Price Erosion",
        detail: `Price has dropped ${fmtCurrency(Math.abs(totalPriceChange))} (${dropPct.toFixed(1)}%) from the original listing of ${fmtCurrency(firstPrice)} to ${fmtCurrency(lastPrice)}. Exceeds normal depreciation for this window.`,
      });
    }
  }
  const states = new Set(dealers.map((d) => d.state).filter(Boolean));
  if (states.size >= 2) {
    redFlags.push({
      severity: "medium",
      title: "Cross-State Transfer",
      detail: `Vehicle moved across ${states.size} states (${Array.from(states).join(", ")}). Interstate transfers can indicate attempts to distance the vehicle from its history.`,
    });
  }
  if (currentFmv > 0 && lastPrice > 0) {
    const diff = lastPrice - currentFmv;
    const pctDiff = Math.abs(diff) / currentFmv * 100;
    if (diff < 0 && pctDiff >= 5) {
      redFlags.push({
        severity: "low",
        title: "Current Price Below FMV",
        detail: `Currently listed at ${fmtCurrency(lastPrice)}, which is ${fmtCurrency(Math.abs(diff))} (${pctDiff.toFixed(1)}%) below the predicted fair market value of ${fmtCurrency(currentFmv)}. Could be a deal — or a signal worth investigating.`,
      });
    } else if (diff > 0 && pctDiff >= 10) {
      redFlags.push({
        severity: "medium",
        title: "Current Price Above FMV",
        detail: `Currently listed at ${fmtCurrency(lastPrice)}, which is ${fmtCurrency(diff)} (${pctDiff.toFixed(1)}%) above the predicted fair market value of ${fmtCurrency(currentFmv)}.`,
      });
    }
  }

  return {
    vehicle,
    listings: priced,
    dealers,
    totalListings,
    totalDealers,
    totalDaysOnMarket,
    totalPriceChange,
    firstPrice,
    lastPrice,
    currentFmv: currentFmv || lastPrice, // fall back to last asking price if predict unavailable
    redFlags,
  };
}

// ── Mock Data ──────────────────────────────────────────────────────────────────

function getMockData(vin: string): VinHistoryData {
  return {
    vehicle: {
      vin: vin || "KNDCB3LC9L5359658",
      year: 2020,
      make: "Kia",
      model: "Niro",
      trim: "LX",
      bodyType: "Hatchback",
      engine: "1.6L I4 Hybrid",
      transmission: "6-Speed Dual-Clutch",
      drivetrain: "FWD",
      fuelType: "Hybrid",
      msrp: 25845,
    },
    listings: [
      { date: "2024-09-05", endDate: "2024-10-20", price: 19800, dealerName: "Leader Automotive Group", city: "Chicago", state: "IL", miles: 54600, dom: 45, source: "Dealer Website" },
      { date: "2024-10-28", endDate: "2024-12-15", price: 18900, dealerName: "Toyota of Lincolnwood", city: "Lincolnwood", state: "IL", miles: 55100, dom: 48, source: "AutoTrader" },
      { date: "2025-01-08", endDate: "2025-04-22", price: 17500, dealerName: "CarMax Milwaukee", city: "Milwaukee", state: "WI", miles: 56800, dom: 104, source: "CarMax" },
      { date: "2025-05-01", endDate: "2025-08-10", price: 16200, dealerName: "Sonic Automotive", city: "Madison", state: "WI", miles: 58200, dom: 101, source: "Cars.com" },
      { date: "2025-08-18", endDate: "2025-11-30", price: 15100, dealerName: "AutoNation Kia", city: "Minneapolis", state: "MN", miles: 59400, dom: 104, source: "Dealer Website" },
      { date: "2025-12-10", endDate: "2026-03-26", price: 13900, dealerName: "Twin Cities Auto Exchange", city: "St. Paul", state: "MN", miles: 60800, dom: 106, source: "Dealer Website" },
    ],
    dealers: [
      { dealerName: "Leader Automotive Group", city: "Chicago", state: "IL", entryDate: "2024-09-05", exitDate: "2024-10-20", entryPrice: 19800, exitPrice: 19800, daysHeld: 45 },
      { dealerName: "Toyota of Lincolnwood", city: "Lincolnwood", state: "IL", entryDate: "2024-10-28", exitDate: "2024-12-15", entryPrice: 18900, exitPrice: 18900, daysHeld: 48 },
      { dealerName: "CarMax Milwaukee", city: "Milwaukee", state: "WI", entryDate: "2025-01-08", exitDate: "2025-04-22", entryPrice: 17500, exitPrice: 17500, daysHeld: 104 },
      { dealerName: "Sonic Automotive", city: "Madison", state: "WI", entryDate: "2025-05-01", exitDate: "2025-08-10", entryPrice: 16200, exitPrice: 16200, daysHeld: 101 },
      { dealerName: "AutoNation Kia", city: "Minneapolis", state: "MN", entryDate: "2025-08-18", exitDate: "2025-11-30", entryPrice: 15100, exitPrice: 15100, daysHeld: 104 },
      { dealerName: "Twin Cities Auto Exchange", city: "St. Paul", state: "MN", entryDate: "2025-12-10", exitDate: "2026-03-26", entryPrice: 13900, exitPrice: 13900, daysHeld: 106 },
    ],
    totalListings: 6,
    totalDealers: 6,
    totalDaysOnMarket: 508,
    totalPriceChange: -5900,
    firstPrice: 19800,
    lastPrice: 13900,
    currentFmv: 14600,
    redFlags: [
      { severity: "high", title: "Excessive Dealer Transfers", detail: "This vehicle has been through 6 different dealers in 18 months. Typical vehicles change hands 1-2 times. This pattern may indicate undisclosed issues that prevent a sale." },
      { severity: "high", title: "Prolonged Total Market Time", detail: "508 total days on market across all listings. The average vehicle sells within 45 days. Extended market time strongly suggests pricing or condition issues." },
      { severity: "medium", title: "Significant Price Erosion", detail: "Price has dropped $5,900 (29.8%) from the original listing of $19,800 to $13,900. This exceeds normal depreciation for this period and mileage increase." },
      { severity: "medium", title: "Cross-State Transfer", detail: "Vehicle moved across IL → WI → MN. Interstate transfers sometimes indicate attempts to distance the vehicle from its history." },
      { severity: "low", title: "Current Price Below FMV", detail: "Currently listed at $13,900, which is $700 below the predicted fair market value of $14,600. While this could be a deal, combined with other flags, investigate further." },
    ],
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtCurrency(v: number | undefined): string {
  if (v == null || isNaN(v)) return "N/A";
  return "$" + Math.round(v).toLocaleString();
}

function fmtNumber(v: number | undefined): string {
  if (v == null || isNaN(v)) return "N/A";
  return Math.round(v).toLocaleString();
}

function severityColor(sev: string): string {
  if (sev === "high") return "#ef4444";
  if (sev === "medium") return "#f59e0b";
  return "#3b82f6";
}

function severityBg(sev: string): string {
  if (sev === "high") return "#ef444418";
  if (sev === "medium") return "#f59e0b18";
  return "#3b82f618";
}

function severityIcon(sev: string): string {
  if (sev === "high") return "!!";
  if (sev === "medium") return "!";
  return "i";
}

// ── Canvas: Price Timeline (Stepped Line Chart) ──────────────────────────────

function drawPriceTimeline(canvas: HTMLCanvasElement, listings: ListingEntry[]) {
  if (listings.length < 1) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  const padL = 70, padR = 30, padT = 30, padB = 70;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const prices = listings.map(l => l.price);
  const minP = Math.min(...prices) * 0.92;
  const maxP = Math.max(...prices) * 1.05;
  const pRange = maxP - minP || 1;

  const allDates: number[] = [];
  for (const l of listings) {
    allDates.push(new Date(l.date).getTime());
    allDates.push(new Date(l.endDate).getTime());
  }
  const minD = Math.min(...allDates);
  const maxD = Math.max(...allDates);
  const dRange = maxD - minD || 1;

  function xFromDate(d: string): number {
    return padL + ((new Date(d).getTime() - minD) / dRange) * chartW;
  }
  function yFromPrice(p: number): number {
    return padT + ((maxP - p) / pRange) * chartH;
  }

  // Y-axis grid
  for (let i = 0; i <= 5; i++) {
    const y = padT + (i / 5) * chartH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + chartW, y);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    ctx.stroke();

    const val = maxP - (i / 5) * pRange;
    ctx.font = "11px -apple-system, sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(fmtCurrency(val), padL - 8, y);
  }

  const segColors = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4"];

  for (let i = 0; i < listings.length; i++) {
    const l = listings[i];
    const x1 = xFromDate(l.date);
    const x2 = xFromDate(l.endDate);
    const y = yFromPrice(l.price);
    const color = segColors[i % segColors.length];

    // Horizontal segment
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.stroke();

    // Shaded area under
    ctx.fillStyle = color + "15";
    ctx.fillRect(x1, y, x2 - x1, padT + chartH - y);

    // Dashed connector to next
    if (i < listings.length - 1) {
      const nextY = yFromPrice(listings[i + 1].price);
      const nextX = xFromDate(listings[i + 1].date);
      ctx.beginPath();
      ctx.setLineDash([4, 3]);
      ctx.moveTo(x2, y);
      ctx.lineTo(nextX, nextY);
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Start dot
    ctx.beginPath();
    ctx.arc(x1, y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.stroke();

    // End dot
    ctx.beginPath();
    ctx.arc(x2, y, 4, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Price label
    ctx.font = "bold 10px -apple-system, sans-serif";
    ctx.fillStyle = "#e2e8f0";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(fmtCurrency(l.price), (x1 + x2) / 2, y - 8);

    // Dealer label (rotated)
    ctx.save();
    const labelX = (x1 + x2) / 2;
    ctx.translate(labelX, padT + chartH + 8);
    ctx.rotate(-Math.PI / 6);
    ctx.font = "9px -apple-system, sans-serif";
    ctx.fillStyle = color;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    const shortName = l.dealerName.length > 20 ? l.dealerName.slice(0, 18) + ".." : l.dealerName;
    ctx.fillText(shortName, 0, 0);
    ctx.restore();
  }

  // X-axis line
  ctx.beginPath();
  ctx.moveTo(padL, padT + chartH);
  ctx.lineTo(padL + chartW, padT + chartH);
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Time labels
  const timeLabels = [listings[0].date, listings[Math.floor(listings.length / 2)].date, listings[listings.length - 1].endDate];
  for (const tl of timeLabels) {
    const x = xFromDate(tl);
    ctx.font = "10px -apple-system, sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(new Date(tl).toLocaleDateString("en-US", { month: "short", year: "2-digit" }), x, padT + chartH + 4);
  }
}

// ── Main App ───────────────────────────────────────────────────────────────────

async function main() {
  let serverAvailable = !!_safeApp;
  try {
    (_safeApp as any)?.connect?.();
  } catch {
    serverAvailable = false;
  }

  const urlParams = _getUrlParams();

  document.body.style.cssText = "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;overflow-x:hidden;";

  const container = document.createElement("div");
  container.style.cssText = "max-width:1200px;margin:0 auto;padding:16px 20px;";
  document.body.appendChild(container);

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
    container.appendChild(_db);
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

  // Header
  const header = document.createElement("div");
  header.style.cssText = "background:#1e293b;padding:16px 20px;border-radius:10px;margin-bottom:16px;border:1px solid #334155;display:flex;align-items:center;";
  header.innerHTML = `<div><h1 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#f8fafc;">VIN History Detective</h1>
    <p style="margin:0;font-size:13px;color:#94a3b8;">Trace any vehicle's complete listing history across dealers</p></div>`;
  _addSettingsBar(header);
  container.appendChild(header);

  // Input Area
  const inputArea = document.createElement("div");
  inputArea.style.cssText = "background:#1e293b;padding:16px 20px;border-radius:10px;margin-bottom:16px;border:1px solid #334155;display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;";

  const vinWrap = document.createElement("div");
  vinWrap.style.cssText = "display:flex;flex-direction:column;gap:4px;flex:1;min-width:240px;";
  vinWrap.innerHTML = `<label style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">VIN</label>`;
  const vinInput = document.createElement("input");
  vinInput.type = "text";
  vinInput.placeholder = "Enter 17-character VIN";
  vinInput.value = urlParams.vin || "KNDCB3LC9L5359658";
  vinInput.style.cssText = "padding:10px 14px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;outline:none;width:100%;";
  vinInput.addEventListener("focus", () => { vinInput.style.borderColor = "#8b5cf6"; });
  vinInput.addEventListener("blur", () => { vinInput.style.borderColor = "#334155"; });
  vinWrap.appendChild(vinInput);
  inputArea.appendChild(vinWrap);

  const milesWrap = document.createElement("div");
  milesWrap.style.cssText = "display:flex;flex-direction:column;gap:4px;width:120px;";
  milesWrap.innerHTML = `<label style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Miles <span style="color:#475569;text-transform:none;">(optional)</span></label>`;
  const milesInput = document.createElement("input");
  milesInput.type = "number";
  milesInput.placeholder = "Auto";
  milesInput.value = urlParams.miles || "";
  milesInput.style.cssText = "padding:10px 14px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;outline:none;width:100%;box-sizing:border-box;";
  milesInput.addEventListener("focus", () => { milesInput.style.borderColor = "#8b5cf6"; });
  milesInput.addEventListener("blur", () => { milesInput.style.borderColor = "#334155"; });
  milesWrap.appendChild(milesInput);
  inputArea.appendChild(milesWrap);

  const zipWrap = document.createElement("div");
  zipWrap.style.cssText = "display:flex;flex-direction:column;gap:4px;width:120px;";
  zipWrap.innerHTML = `<label style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">ZIP <span style="color:#475569;text-transform:none;">(optional)</span></label>`;
  const zipInput = document.createElement("input");
  zipInput.type = "text";
  zipInput.placeholder = "Auto";
  zipInput.value = urlParams.zip || "";
  zipInput.maxLength = 5;
  zipInput.style.cssText = "padding:10px 14px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;outline:none;width:100%;box-sizing:border-box;";
  zipInput.addEventListener("focus", () => { zipInput.style.borderColor = "#8b5cf6"; });
  zipInput.addEventListener("blur", () => { zipInput.style.borderColor = "#334155"; });
  zipWrap.appendChild(zipInput);
  inputArea.appendChild(zipWrap);

  const traceBtn = document.createElement("button");
  traceBtn.textContent = "Trace History";
  traceBtn.style.cssText = "padding:10px 28px;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;border:none;background:#8b5cf6;color:#fff;height:42px;align-self:flex-end;transition:background 0.15s;";
  traceBtn.addEventListener("mouseenter", () => { traceBtn.style.background = "#7c3aed"; });
  traceBtn.addEventListener("mouseleave", () => { traceBtn.style.background = "#8b5cf6"; });
  inputArea.appendChild(traceBtn);
  container.appendChild(inputArea);

  const results = document.createElement("div");
  results.id = "results";
  container.appendChild(results);

  const trigger = () => runTrace(vinInput.value.trim(), milesInput.value.trim(), zipInput.value.trim());
  traceBtn.addEventListener("click", trigger);
  [vinInput, milesInput, zipInput].forEach((inp) => inp.addEventListener("keydown", (e) => { if (e.key === "Enter") trigger(); }));

  if (urlParams.vin) {
    runTrace(urlParams.vin, urlParams.miles || "", urlParams.zip || "");
  }

  async function runTrace(vin: string, miles: string, zip: string) {
    if (!vin) { alert("Please enter a VIN."); return; }

    traceBtn.disabled = true;
    traceBtn.textContent = "Tracing...";
    traceBtn.style.opacity = "0.7";
    results.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:60px;color:#94a3b8;">
      <div style="width:24px;height:24px;border:3px solid #334155;border-top-color:#8b5cf6;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:14px;"></div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      Investigating listing history for ${vin}...
    </div>`;

    const mode = _detectAppMode();
    let data: VinHistoryData;
    try {
      if (mode !== "demo") {
        const args = { vin, miles: miles || undefined, zip: zip || undefined };
        const response = await _callTool("trace-vin-history", args);
        const textContent = response?.content?.find((c: any) => c.type === "text");
        const raw = textContent?.text ? JSON.parse(textContent.text) : null;
        if (raw && raw.decode) {
          // Raw direct-fetch shape — transform it.
          data = transformLive(raw, vin);
        } else if (raw && raw.vehicle) {
          // Proxy / MCP already transformed — use as-is.
          data = raw as VinHistoryData;
        } else {
          throw new Error("Empty response");
        }
      } else {
        await new Promise((r) => setTimeout(r, 900));
        data = getMockData(vin);
      }
      renderResults(data);
    } catch (err: any) {
      console.error("Trace failed, using mock:", err);
      await new Promise((r) => setTimeout(r, 400));
      data = getMockData(vin);
      renderResults(data);
    }

    traceBtn.disabled = false;
    traceBtn.textContent = "Trace History";
    traceBtn.style.opacity = "1";
  }

  function renderResults(data: VinHistoryData) {
    results.innerHTML = "";

    // ── Section 1: Vehicle Identity ──
    const idCard = document.createElement("div");
    idCard.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:16px;";
    const ymmt = `${data.vehicle.year} ${data.vehicle.make} ${data.vehicle.model} ${data.vehicle.trim}`;
    idCard.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
        <div>
          <h2 style="margin:0;font-size:22px;font-weight:800;color:#f8fafc;">${ymmt}</h2>
          <div style="font-size:12px;color:#64748b;margin-top:4px;font-family:monospace;">VIN: ${data.vehicle.vin}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px;">
        ${[
          ["Body", data.vehicle.bodyType],
          ["Engine", data.vehicle.engine],
          ["Transmission", data.vehicle.transmission],
          ["Drivetrain", data.vehicle.drivetrain],
          ["Fuel", data.vehicle.fuelType],
          ["MSRP (new)", fmtCurrency(data.vehicle.msrp)],
        ].map(([k, v]) => `<div style="background:#0f172a;border-radius:6px;padding:8px 10px;"><div style="font-size:10px;color:#64748b;text-transform:uppercase;">${k}</div><div style="font-size:12px;color:#e2e8f0;font-weight:600;margin-top:2px;">${v}</div></div>`).join("")}
      </div>
    `;
    results.appendChild(idCard);

    // ── Section 2: Journey Summary KPIs ──
    const kpiSection = document.createElement("div");
    kpiSection.style.cssText = "display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;";

    const kpis = [
      { label: "Total Listings", value: String(data.totalListings), color: "#8b5cf6" },
      { label: "Dealers Visited", value: String(data.totalDealers), color: "#3b82f6" },
      { label: "Total Days on Market", value: String(data.totalDaysOnMarket), color: data.totalDaysOnMarket > 180 ? "#ef4444" : "#f59e0b" },
      { label: "Total Price Change", value: (data.totalPriceChange < 0 ? "-" : "+") + fmtCurrency(Math.abs(data.totalPriceChange)), color: data.totalPriceChange < 0 ? "#ef4444" : "#10b981" },
    ];

    for (const kpi of kpis) {
      const card = document.createElement("div");
      card.style.cssText = `background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px;text-align:center;border-top:3px solid ${kpi.color};`;
      card.innerHTML = `
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">${kpi.label}</div>
        <div style="font-size:28px;font-weight:800;color:${kpi.color};margin-top:6px;">${kpi.value}</div>
      `;
      kpiSection.appendChild(card);
    }
    results.appendChild(kpiSection);

    // ── Section 3: Listing Timeline Canvas ──
    const timelineSection = document.createElement("div");
    timelineSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:16px;";
    timelineSection.innerHTML = `<h3 style="font-size:13px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px 0;">Listing Timeline</h3>
      <p style="font-size:11px;color:#64748b;margin:0 0 12px 0;">Price at each listing period with dealer labels. Each color represents a different dealer.</p>`;

    const timelineCanvas = document.createElement("canvas");
    timelineCanvas.style.cssText = "width:100%;height:320px;";
    timelineSection.appendChild(timelineCanvas);
    results.appendChild(timelineSection);

    requestAnimationFrame(() => {
      drawPriceTimeline(timelineCanvas, data.listings);
    });

    // ── Section 4: Dealer Hop Chain ──
    const chainSection = document.createElement("div");
    chainSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:16px;";
    chainSection.innerHTML = `<h3 style="font-size:13px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 16px 0;">Dealer Hop Chain</h3>`;

    const chainWrap = document.createElement("div");
    chainWrap.style.cssText = "display:flex;align-items:center;gap:0;overflow-x:auto;padding-bottom:12px;scrollbar-width:thin;";

    const chainColors = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4"];

    for (let i = 0; i < data.dealers.length; i++) {
      const d = data.dealers[i];
      const color = chainColors[i % chainColors.length];
      const isCurrent = i === data.dealers.length - 1;

      const node = document.createElement("div");
      node.style.cssText = `min-width:160px;background:#0f172a;border:2px solid ${isCurrent ? color : '#334155'};border-radius:10px;padding:12px;text-align:center;flex-shrink:0;${isCurrent ? `box-shadow:0 0 16px ${color}33;` : ''}`;
      node.innerHTML = `
        <div style="font-size:12px;font-weight:700;color:${color};">${d.dealerName}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px;">${d.city}, ${d.state}</div>
        <div style="font-size:10px;color:#64748b;margin-top:4px;">${new Date(d.entryDate).toLocaleDateString("en-US", { month: "short", year: "2-digit" })} - ${new Date(d.exitDate).toLocaleDateString("en-US", { month: "short", year: "2-digit" })}</div>
        <div style="font-size:13px;font-weight:700;color:#e2e8f0;margin-top:4px;">${fmtCurrency(d.entryPrice)}</div>
        <div style="font-size:10px;color:#64748b;">${d.daysHeld} days</div>
        ${isCurrent ? `<div style="margin-top:6px;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;background:${color}22;color:${color};border:1px solid ${color}44;display:inline-block;">CURRENT</div>` : ''}
      `;
      chainWrap.appendChild(node);

      if (i < data.dealers.length - 1) {
        const arrow = document.createElement("div");
        arrow.style.cssText = "display:flex;flex-direction:column;align-items:center;padding:0 4px;flex-shrink:0;";
        const priceDiff = data.dealers[i + 1].entryPrice - d.entryPrice;
        const diffColor = priceDiff < 0 ? "#ef4444" : "#10b981";
        arrow.innerHTML = `
          <div style="font-size:16px;color:#475569;">&#x2192;</div>
          <div style="font-size:9px;color:${diffColor};font-weight:600;">${priceDiff < 0 ? '' : '+'}${fmtCurrency(priceDiff)}</div>
        `;
        chainWrap.appendChild(arrow);
      }
    }

    chainSection.appendChild(chainWrap);
    results.appendChild(chainSection);

    // ── Section 5: Price Trajectory Analysis ──
    const trajSection = document.createElement("div");
    trajSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:16px;";

    const totalMonths = Math.round(data.totalDaysOnMarket / 30);
    const dropPct = data.firstPrice > 0 ? ((Math.abs(data.totalPriceChange) / data.firstPrice) * 100).toFixed(1) : "0";
    const avgDropPerMonth = totalMonths > 0 ? Math.round(Math.abs(data.totalPriceChange) / totalMonths) : 0;

    trajSection.innerHTML = `
      <h3 style="font-size:13px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 16px 0;">Price Trajectory Analysis</h3>
      <div style="background:#0f172a;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:12px;">
        <div style="font-size:14px;color:#e2e8f0;line-height:1.6;">
          This vehicle has been listed <span style="font-weight:700;color:#8b5cf6;">${data.totalListings} times</span> across
          <span style="font-weight:700;color:#3b82f6;">${data.totalDealers} dealers</span> over
          <span style="font-weight:700;color:#f59e0b;">${totalMonths} months</span>.
          The price has dropped a total of
          <span style="font-weight:700;color:#ef4444;">${fmtCurrency(Math.abs(data.totalPriceChange))} (${dropPct}%)</span>
          from the original listing of ${fmtCurrency(data.firstPrice)} to the current ${fmtCurrency(data.lastPrice)}.
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        <div style="background:#0f172a;border-radius:8px;padding:12px;text-align:center;border:1px solid #334155;">
          <div style="font-size:10px;color:#64748b;text-transform:uppercase;">First Listed Price</div>
          <div style="font-size:20px;font-weight:800;color:#e2e8f0;margin-top:4px;">${fmtCurrency(data.firstPrice)}</div>
        </div>
        <div style="background:#0f172a;border-radius:8px;padding:12px;text-align:center;border:1px solid #334155;">
          <div style="font-size:10px;color:#64748b;text-transform:uppercase;">Current Price</div>
          <div style="font-size:20px;font-weight:800;color:#f59e0b;margin-top:4px;">${fmtCurrency(data.lastPrice)}</div>
        </div>
        <div style="background:#0f172a;border-radius:8px;padding:12px;text-align:center;border:1px solid #334155;">
          <div style="font-size:10px;color:#64748b;text-transform:uppercase;">Avg Drop / Month</div>
          <div style="font-size:20px;font-weight:800;color:#ef4444;margin-top:4px;">-${fmtCurrency(avgDropPerMonth)}</div>
        </div>
      </div>
    `;
    results.appendChild(trajSection);

    // ── Section 6: Red Flag Alerts ──
    if (data.redFlags.length > 0) {
      const flagSection = document.createElement("div");
      flagSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:16px;";
      flagSection.innerHTML = `<h3 style="font-size:13px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px 0;">Red Flag Alerts</h3>
        <p style="font-size:11px;color:#64748b;margin:0 0 12px 0;">Automated analysis of this vehicle's listing history for potential concerns</p>`;

      const highCount = data.redFlags.filter(f => f.severity === "high").length;
      const medCount = data.redFlags.filter(f => f.severity === "medium").length;
      const lowCount = data.redFlags.filter(f => f.severity === "low").length;

      const summaryBar = document.createElement("div");
      summaryBar.style.cssText = "display:flex;gap:12px;margin-bottom:12px;";
      summaryBar.innerHTML = `
        ${highCount > 0 ? `<span style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;background:#ef444422;color:#ef4444;border:1px solid #ef444444;">${highCount} High</span>` : ''}
        ${medCount > 0 ? `<span style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;background:#f59e0b22;color:#f59e0b;border:1px solid #f59e0b44;">${medCount} Medium</span>` : ''}
        ${lowCount > 0 ? `<span style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;background:#3b82f622;color:#3b82f6;border:1px solid #3b82f644;">${lowCount} Low</span>` : ''}
      `;
      flagSection.appendChild(summaryBar);

      for (const flag of data.redFlags) {
        const flagEl = document.createElement("div");
        flagEl.style.cssText = `background:${severityBg(flag.severity)};border:1px solid ${severityColor(flag.severity)}33;border-radius:8px;padding:14px 16px;margin-bottom:8px;display:flex;gap:12px;align-items:flex-start;`;
        flagEl.innerHTML = `
          <div style="width:28px;height:28px;border-radius:50%;background:${severityColor(flag.severity)}22;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:800;color:${severityColor(flag.severity)};border:1px solid ${severityColor(flag.severity)}44;">${severityIcon(flag.severity)}</div>
          <div>
            <div style="font-size:13px;font-weight:700;color:${severityColor(flag.severity)};">${flag.title}</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:4px;line-height:1.5;">${flag.detail}</div>
          </div>
        `;
        flagSection.appendChild(flagEl);
      }
      results.appendChild(flagSection);
    }

    // ── Section 7: Current FMV Comparison ──
    const fmvSection = document.createElement("div");
    fmvSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:16px;";

    const fmvDiff = data.lastPrice - data.currentFmv;
    const fmvDiffColor = fmvDiff <= 0 ? "#10b981" : "#ef4444";
    const fmvDiffLabel = fmvDiff <= 0 ? "below" : "above";
    const fmvPctDiff = data.currentFmv > 0 ? ((Math.abs(fmvDiff) / data.currentFmv) * 100).toFixed(1) : "0";

    fmvSection.innerHTML = `
      <h3 style="font-size:13px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 16px 0;">Current FMV Comparison</h3>
      <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;">
        <div style="flex:1;min-width:200px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <div>
              <div style="font-size:10px;color:#64748b;text-transform:uppercase;">Last Asking Price</div>
              <div style="font-size:24px;font-weight:800;color:#f8fafc;">${fmtCurrency(data.lastPrice)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:10px;color:#64748b;text-transform:uppercase;">Predicted FMV</div>
              <div style="font-size:24px;font-weight:800;color:#3b82f6;">${fmtCurrency(data.currentFmv)}</div>
            </div>
          </div>
          <div style="position:relative;height:28px;background:#0f172a;border-radius:6px;border:1px solid #334155;overflow:hidden;">
            <div style="position:absolute;left:0;top:0;height:100%;width:50%;background:#3b82f622;"></div>
            <div style="position:absolute;left:50%;top:0;height:100%;width:2px;background:#3b82f6;" title="FMV"></div>
            ${(() => {
              const pctPos = data.currentFmv > 0 ? Math.max(5, Math.min(95, (data.lastPrice / data.currentFmv) * 50)) : 50;
              return `<div style="position:absolute;left:${pctPos}%;top:0;height:100%;width:3px;background:#f59e0b;border-radius:1px;transform:translateX(-1.5px);" title="Asking"></div>`;
            })()}
          </div>
          <div style="display:flex;justify-content:center;gap:16px;margin-top:6px;">
            <span style="font-size:10px;color:#3b82f6;">| FMV</span>
            <span style="font-size:10px;color:#f59e0b;">| Asking</span>
          </div>
        </div>
        <div style="background:${fmvDiff <= 0 ? '#10b98118' : '#ef444418'};border:1px solid ${fmvDiffColor}33;border-radius:10px;padding:16px 24px;text-align:center;">
          <div style="font-size:10px;color:#64748b;text-transform:uppercase;">Difference</div>
          <div style="font-size:28px;font-weight:800;color:${fmvDiffColor};margin-top:4px;">${fmvDiff <= 0 ? '-' : '+'}${fmtCurrency(Math.abs(fmvDiff))}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${fmvPctDiff}% ${fmvDiffLabel} FMV</div>
        </div>
      </div>
    `;
    results.appendChild(fmvSection);

    // ── Detailed Listing Table ──
    const tableSection = document.createElement("div");
    tableSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px 20px;margin-bottom:16px;";
    tableSection.innerHTML = `<h3 style="font-size:13px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 12px 0;">Complete Listing History</h3>`;

    const tableWrap = document.createElement("div");
    tableWrap.style.cssText = "overflow-x:auto;";
    const table = document.createElement("table");
    table.style.cssText = "width:100%;border-collapse:collapse;font-size:12px;";
    table.innerHTML = `
      <thead>
        <tr>
          <th style="padding:8px 10px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;border-bottom:1px solid #334155;">#</th>
          <th style="padding:8px 10px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;border-bottom:1px solid #334155;">Period</th>
          <th style="padding:8px 10px;text-align:right;color:#94a3b8;font-size:10px;text-transform:uppercase;border-bottom:1px solid #334155;">Price</th>
          <th style="padding:8px 10px;text-align:right;color:#94a3b8;font-size:10px;text-transform:uppercase;border-bottom:1px solid #334155;">Miles</th>
          <th style="padding:8px 10px;text-align:right;color:#94a3b8;font-size:10px;text-transform:uppercase;border-bottom:1px solid #334155;">DOM</th>
          <th style="padding:8px 10px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;border-bottom:1px solid #334155;">Dealer</th>
          <th style="padding:8px 10px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;border-bottom:1px solid #334155;">Location</th>
          <th style="padding:8px 10px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;border-bottom:1px solid #334155;">Source</th>
        </tr>
      </thead>
      <tbody>
        ${data.listings.map((l, i) => {
          const prevPrice = i > 0 ? data.listings[i - 1].price : l.price;
          const priceDiff = l.price - prevPrice;
          const diffHtml = i === 0 ? "" : ` <span style="color:${priceDiff <= 0 ? '#10b981' : '#ef4444'};font-size:10px;">(${priceDiff <= 0 ? '' : '+'}${fmtCurrency(priceDiff)})</span>`;
          return `<tr style="border-bottom:1px solid #1e293b;">
            <td style="padding:8px 10px;color:#64748b;font-weight:700;">${i + 1}</td>
            <td style="padding:8px 10px;color:#e2e8f0;">${new Date(l.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })} - ${new Date(l.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}</td>
            <td style="padding:8px 10px;text-align:right;color:#e2e8f0;font-weight:600;">${fmtCurrency(l.price)}${diffHtml}</td>
            <td style="padding:8px 10px;text-align:right;color:#94a3b8;">${fmtNumber(l.miles)}</td>
            <td style="padding:8px 10px;text-align:right;color:#94a3b8;">${l.dom}d</td>
            <td style="padding:8px 10px;color:#94a3b8;">${l.dealerName}</td>
            <td style="padding:8px 10px;color:#64748b;">${l.city}, ${l.state}</td>
            <td style="padding:8px 10px;color:#64748b;">${l.source}</td>
          </tr>`;
        }).join("")}
      </tbody>
    `;
    tableWrap.appendChild(table);
    tableSection.appendChild(tableWrap);
    results.appendChild(tableSection);

    // ── Footer ──
    const footer = document.createElement("div");
    footer.style.cssText = "text-align:center;padding:16px;font-size:11px;color:#475569;";
    footer.innerHTML = `Investigation completed ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} | Powered by <span style="color:#8b5cf6;font-weight:600;">MarketCheck</span>`;
    results.appendChild(footer);
  }

  // ── Scrollbar Styles ──
  const style = document.createElement("style");
  style.textContent = `
    @media (max-width: 900px) {
      #results > div:nth-child(2) { grid-template-columns: repeat(2,1fr) !important; }
    }
    ::-webkit-scrollbar { height: 6px; }
    ::-webkit-scrollbar-track { background: #1e293b; border-radius: 3px; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #475569; }
  `;
  document.head.appendChild(style);
}

main();
