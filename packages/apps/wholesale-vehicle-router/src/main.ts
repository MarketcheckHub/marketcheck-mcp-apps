/**
 * Wholesale Vehicle Router
 * MCP App — Paste VINs, get dealer-match rankings showing which dealer should get which car.
 * Dark-themed with canvas bar charts, vehicle cards, route sheet.
 */
import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "wholesale-vehicle-router" }); } catch {}

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
  for (const key of ["vin", "zip", "make", "model", "miles", "state", "dealer_id", "ticker", "price"]) {
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
  const vins = (args.vins??"").split(",").map(v=>v.trim()).filter(Boolean);
  const results = await Promise.all(vins.map(async (vin) => {
    const [decode,prediction] = await Promise.all([_mcDecode(vin),_mcPredict({vin,dealer_type:"franchise",zip:args.zip})]);
    return {vin,decode,prediction};
  }));
  return {results};
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
  drivetrain: string;
  exteriorColor: string;
  miles: number;
}

interface DealerMatch {
  dealerId: string;
  dealerName: string;
  city: string;
  state: string;
  distance: number;
  matchScore: number;
  inventoryFit: string;
  avgDom: number;
  recentSales: number;
}

interface PriceRange {
  predicted: number;
  low: number;
  high: number;
  confidence: number;
}

interface VehicleRouteResult {
  vehicle: VehicleSpec;
  dealers: DealerMatch[];
  priceRange: PriceRange;
  bestDealer: DealerMatch | null;
}

// ── Mock Data ──────────────────────────────────────────────────────────────────

function generateMockData(vins: string[]): VehicleRouteResult[] {
  const vehicleSpecs: Record<string, VehicleSpec> = {
    "1FTFW1E87NFA00001": { vin: "1FTFW1E87NFA00001", year: 2022, make: "Ford", model: "F-150", trim: "XLT SuperCrew", bodyType: "Truck", engine: "3.5L V6 EcoBoost", drivetrain: "4WD", exteriorColor: "Oxford White", miles: 28400 },
    "5TDZA23C06S123456": { vin: "5TDZA23C06S123456", year: 2023, make: "Toyota", model: "Highlander", trim: "XLE AWD", bodyType: "SUV", engine: "2.5L Hybrid", drivetrain: "AWD", exteriorColor: "Blueprint", miles: 18200 },
    "1G1YY22G965789012": { vin: "1G1YY22G965789012", year: 2021, make: "Chevrolet", model: "Corvette", trim: "Stingray 2LT", bodyType: "Coupe", engine: "6.2L V8", drivetrain: "RWD", exteriorColor: "Torch Red", miles: 12500 },
    "WBAPH5C55BA234567": { vin: "WBAPH5C55BA234567", year: 2022, make: "BMW", model: "X5", trim: "xDrive40i", bodyType: "SUV", engine: "3.0L I6 Turbo", drivetrain: "AWD", exteriorColor: "Alpine White", miles: 32100 },
    "19XFC2F59NE345678": { vin: "19XFC2F59NE345678", year: 2022, make: "Honda", model: "Civic", trim: "EX Sedan", bodyType: "Sedan", engine: "1.5L Turbo I4", drivetrain: "FWD", exteriorColor: "Sonic Gray Pearl", miles: 24800 },
  };

  const dealers = [
    { id: "D001", name: "Southwest Auto Group", city: "Phoenix", state: "AZ", distance: 12 },
    { id: "D002", name: "Valley Motors", city: "Tempe", state: "AZ", distance: 18 },
    { id: "D003", name: "Desert Star Autos", city: "Mesa", state: "AZ", distance: 22 },
    { id: "D004", name: "Camelback Motor Sales", city: "Scottsdale", state: "AZ", distance: 15 },
    { id: "D005", name: "Sonoran Imports", city: "Chandler", state: "AZ", distance: 28 },
    { id: "D006", name: "Cactus Jack Auto", city: "Glendale", state: "AZ", distance: 20 },
    { id: "D007", name: "Red Mountain Motors", city: "Gilbert", state: "AZ", distance: 25 },
    { id: "D008", name: "Pinnacle Auto Sales", city: "Peoria", state: "AZ", distance: 30 },
  ];

  // Seeded random
  let seed = 137;
  function rand(): number {
    seed = (seed * 16807 + 0) % 2147483647;
    return seed / 2147483647;
  }

  return vins.map(vin => {
    const spec = vehicleSpecs[vin] || {
      vin,
      year: 2022,
      make: "Unknown",
      model: "Vehicle",
      trim: "Base",
      bodyType: "Sedan",
      engine: "N/A",
      drivetrain: "FWD",
      exteriorColor: "Unknown",
      miles: 30000,
    };

    // Generate dealer matches with varying scores
    const numDealers = 5 + Math.floor(rand() * 4);
    const selectedDealers = [...dealers].sort(() => rand() - 0.5).slice(0, numDealers);

    const matchedDealers: DealerMatch[] = selectedDealers.map(d => {
      let baseScore = 40 + Math.floor(rand() * 50);
      if (spec.bodyType === "Truck" && d.name.includes("Auto Group")) baseScore = Math.min(98, baseScore + 20);
      if (spec.bodyType === "SUV" && d.name.includes("Motors")) baseScore = Math.min(97, baseScore + 15);
      if (spec.make === "BMW" && d.name.includes("Imports")) baseScore = Math.min(95, baseScore + 25);

      const fitLabels = ["Excellent", "Good", "Fair", "Marginal"];
      const fitIndex = baseScore >= 80 ? 0 : baseScore >= 60 ? 1 : baseScore >= 45 ? 2 : 3;

      return {
        dealerId: d.id,
        dealerName: d.name,
        city: d.city,
        state: d.state,
        distance: d.distance + Math.floor(rand() * 10),
        matchScore: baseScore,
        inventoryFit: fitLabels[fitIndex],
        avgDom: 15 + Math.floor(rand() * 40),
        recentSales: 2 + Math.floor(rand() * 12),
      };
    }).sort((a, b) => b.matchScore - a.matchScore);

    const basePrices: Record<string, number> = {
      "Ford F-150": 38500,
      "Toyota Highlander": 36200,
      "Chevrolet Corvette": 58900,
      "BMW X5": 44800,
      "Honda Civic": 22400,
    };
    const basePrice = basePrices[`${spec.make} ${spec.model}`] || 28000;
    const predicted = basePrice - Math.floor(spec.miles / 1000) * 150 + Math.floor(rand() * 2000 - 1000);
    const spread = 1500 + Math.floor(rand() * 2000);

    return {
      vehicle: spec,
      dealers: matchedDealers,
      priceRange: {
        predicted,
        low: predicted - spread,
        high: predicted + spread,
        confidence: 75 + Math.floor(rand() * 20),
      },
      bestDealer: matchedDealers[0] || null,
    };
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function fmtCurrency(v: number): string {
  return "$" + Math.round(v).toLocaleString();
}

function fmtNum(v: number): string {
  return Math.round(v).toLocaleString();
}

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function scoreBg(score: number): string {
  if (score >= 80) return "rgba(34,197,94,0.15)";
  if (score >= 50) return "rgba(245,158,11,0.15)";
  return "rgba(239,68,68,0.15)";
}

// ── Canvas: Dealer Match Scores ────────────────────────────────────────────────

function drawMatchScoreChart(canvas: HTMLCanvasElement, result: VehicleRouteResult) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const dealers = result.dealers.slice(0, 8);
  if (dealers.length === 0) return;

  const marginLeft = 160;
  const marginRight = 60;
  const marginTop = 40;
  const marginBottom = 20;
  const chartW = w - marginLeft - marginRight;
  const chartH = h - marginTop - marginBottom;
  const barH = Math.min(26, (chartH / dealers.length) - 6);
  const gap = (chartH - barH * dealers.length) / (dealers.length + 1);

  // Title
  ctx.fillStyle = "#f1f5f9";
  ctx.font = "bold 13px -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Dealer Match Scores: ${result.vehicle.year} ${result.vehicle.make} ${result.vehicle.model}`, marginLeft, 24);

  // Threshold lines
  [50, 80].forEach(thresh => {
    const x = marginLeft + (thresh / 100) * chartW;
    ctx.strokeStyle = thresh === 80 ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, marginTop);
    ctx.lineTo(x, marginTop + chartH);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // Bars
  dealers.forEach((dealer, i) => {
    const y = marginTop + gap + i * (barH + gap);
    const barW = (dealer.matchScore / 100) * chartW;
    const color = scoreColor(dealer.matchScore);

    const grad = ctx.createLinearGradient(marginLeft, 0, marginLeft + barW, 0);
    grad.addColorStop(0, color + "88");
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(marginLeft, y, barW, barH, 4);
    ctx.fill();

    // Label
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "right";
    const labelText = dealer.dealerName.length > 22 ? dealer.dealerName.substring(0, 20) + "..." : dealer.dealerName;
    ctx.fillText(labelText, marginLeft - 8, y + barH / 2 + 4);

    // Score
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 11px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(String(dealer.matchScore), marginLeft + barW + 6, y + barH / 2 + 4);
  });

  // Legend
  const legendY = marginTop + chartH + 10;
  ctx.fillStyle = "#64748b";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.textAlign = "center";
  [0, 25, 50, 75, 100].forEach(v => {
    const x = marginLeft + (v / 100) * chartW;
    ctx.fillText(String(v), x, legendY);
  });
}

// ── Canvas: Price Range Visualization ──────────────────────────────────────────

function drawPriceRangeChart(canvas: HTMLCanvasElement, results: VehicleRouteResult[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  if (results.length === 0) return;

  const marginLeft = 140;
  const marginRight = 80;
  const marginTop = 40;
  const marginBottom = 30;
  const chartW = w - marginLeft - marginRight;
  const chartH = h - marginTop - marginBottom;

  const allPrices = results.flatMap(r => [r.priceRange.low, r.priceRange.high]);
  const minPrice = Math.min(...allPrices) * 0.95;
  const maxPrice = Math.max(...allPrices) * 1.05;
  const priceRange = maxPrice - minPrice;

  ctx.fillStyle = "#f1f5f9";
  ctx.font = "bold 13px -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Predicted Price Ranges", marginLeft, 24);

  const rowH = Math.min(40, chartH / results.length - 4);
  const rowGap = (chartH - rowH * results.length) / (results.length + 1);

  // Grid
  const gridSteps = 5;
  for (let i = 0; i <= gridSteps; i++) {
    const x = marginLeft + (chartW * i) / gridSteps;
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, marginTop);
    ctx.lineTo(x, marginTop + chartH);
    ctx.stroke();

    ctx.fillStyle = "#64748b";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    const val = minPrice + (priceRange * i) / gridSteps;
    ctx.fillText(fmtCurrency(val), x, marginTop + chartH + 16);
  }

  results.forEach((r, i) => {
    const y = marginTop + rowGap + i * (rowH + rowGap);
    const x1 = marginLeft + ((r.priceRange.low - minPrice) / priceRange) * chartW;
    const x2 = marginLeft + ((r.priceRange.high - minPrice) / priceRange) * chartW;
    const xPred = marginLeft + ((r.priceRange.predicted - minPrice) / priceRange) * chartW;

    // Range bar
    ctx.fillStyle = "rgba(59,130,246,0.3)";
    ctx.beginPath();
    ctx.roundRect(x1, y + rowH * 0.3, x2 - x1, rowH * 0.4, 4);
    ctx.fill();

    // Predicted price marker
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.arc(xPred, y + rowH / 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 7px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("$", xPred, y + rowH / 2 + 3);

    // Label
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${r.vehicle.make} ${r.vehicle.model}`, marginLeft - 8, y + rowH / 2 + 4);

    // Price label
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 10px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(fmtCurrency(r.priceRange.predicted), x2 + 8, y + rowH / 2 + 4);
  });
}

// ── App State ──────────────────────────────────────────────────────────────────

let routeResults: VehicleRouteResult[] = [];
let selectedVehicleIndex = 0;

// ── Build UI ───────────────────────────────────────────────────────────────────

document.body.style.cssText =
  "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;overflow-x:hidden;min-height:100vh;";

const container = document.createElement("div");
container.style.cssText = "max-width:1400px;margin:0 auto;padding:16px 20px;";
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

// ── Header ─────────────────────────────────────────────────────────────────────

const headerPanel = document.createElement("div");
headerPanel.style.cssText = "background:#1e293b;border-radius:10px;padding:16px 20px;margin-bottom:16px;border:1px solid #334155;";

const titleRow = document.createElement("div");
titleRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;";
titleRow.innerHTML = `<h1 style="font-size:20px;font-weight:700;color:#f1f5f9;letter-spacing:-0.3px;margin:0;">Wholesale Vehicle Router</h1>`;
_addSettingsBar(titleRow);
headerPanel.appendChild(titleRow);

const subtitle = document.createElement("div");
subtitle.style.cssText = "font-size:12px;color:#94a3b8;margin-bottom:14px;";
subtitle.textContent = "Paste VINs to find optimal dealer matches for wholesale vehicle distribution.";
headerPanel.appendChild(subtitle);

// Input form
const inputStyle = "padding:7px 10px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;";

const formRow = document.createElement("div");
formRow.style.cssText = "display:flex;gap:12px;flex-wrap:wrap;align-items:start;";

const vinGroup = document.createElement("div");
vinGroup.style.cssText = "flex:1;min-width:300px;display:flex;flex-direction:column;gap:4px;";
vinGroup.innerHTML = `<label style="font-size:11px;color:#94a3b8;font-weight:600;">VINs (one per line, up to 20)</label>`;
const vinTextarea = document.createElement("textarea");
vinTextarea.id = "vinInput";
vinTextarea.placeholder = "Paste VINs here, one per line...\ne.g.\n1FTFW1E87NFA00001\n5TDZA23C06S123456";
vinTextarea.style.cssText = `${inputStyle}width:100%;height:120px;resize:vertical;box-sizing:border-box;font-family:monospace;`;
vinTextarea.value = "1FTFW1E87NFA00001\n5TDZA23C06S123456\n1G1YY22G965789012\nWBAPH5C55BA234567\n19XFC2F59NE345678";
vinGroup.appendChild(vinTextarea);
formRow.appendChild(vinGroup);

const paramGroup = document.createElement("div");
paramGroup.style.cssText = "display:flex;flex-direction:column;gap:10px;";

const zipGroup = document.createElement("div");
zipGroup.style.cssText = "display:flex;flex-direction:column;gap:4px;";
zipGroup.innerHTML = `<label style="font-size:11px;color:#94a3b8;font-weight:600;">ZIP Code</label>
  <input id="zipInput" type="text" value="85001" maxlength="5" style="${inputStyle}width:80px;" />`;
paramGroup.appendChild(zipGroup);

const radiusGroup = document.createElement("div");
radiusGroup.style.cssText = "display:flex;flex-direction:column;gap:4px;";
radiusGroup.innerHTML = `<label style="font-size:11px;color:#94a3b8;font-weight:600;">Radius (mi)</label>
  <input id="radiusInput" type="number" value="50" min="10" max="200" style="${inputStyle}width:80px;" />`;
paramGroup.appendChild(radiusGroup);

const routeBtn = document.createElement("button");
routeBtn.textContent = "Route Vehicles";
routeBtn.style.cssText = "padding:10px 24px;border-radius:6px;border:none;background:#3b82f6;color:#fff;font-size:13px;font-weight:600;cursor:pointer;margin-top:8px;";
routeBtn.addEventListener("mouseenter", () => { routeBtn.style.background = "#2563eb"; });
routeBtn.addEventListener("mouseleave", () => { routeBtn.style.background = "#3b82f6"; });
paramGroup.appendChild(routeBtn);

formRow.appendChild(paramGroup);
headerPanel.appendChild(formRow);
container.appendChild(headerPanel);

// ── Status / Loading ───────────────────────────────────────────────────────────

const statusBar = document.createElement("div");
statusBar.style.cssText = "display:none;background:#1e293b;border-radius:10px;padding:14px 18px;border:1px solid #334155;margin-bottom:16px;text-align:center;";
container.appendChild(statusBar);

// ── Vehicle Cards ──────────────────────────────────────────────────────────────

const vehicleCardsPanel = document.createElement("div");
vehicleCardsPanel.style.cssText = "display:none;margin-bottom:16px;";
container.appendChild(vehicleCardsPanel);

// ── Match Score Chart ──────────────────────────────────────────────────────────

const chartPanel = document.createElement("div");
chartPanel.style.cssText = "display:none;background:#1e293b;border-radius:10px;padding:16px;border:1px solid #334155;margin-bottom:16px;";
const matchCanvas = document.createElement("canvas");
matchCanvas.style.cssText = "width:100%;height:300px;";
chartPanel.appendChild(matchCanvas);
container.appendChild(chartPanel);

// ── Dealer Match Table ─────────────────────────────────────────────────────────

const dealerTablePanel = document.createElement("div");
dealerTablePanel.style.cssText = "display:none;background:#1e293b;border-radius:10px;padding:16px;border:1px solid #334155;margin-bottom:16px;";
container.appendChild(dealerTablePanel);

// ── Price Range Chart ──────────────────────────────────────────────────────────

const priceChartPanel = document.createElement("div");
priceChartPanel.style.cssText = "display:none;background:#1e293b;border-radius:10px;padding:16px;border:1px solid #334155;margin-bottom:16px;";
const priceCanvas = document.createElement("canvas");
priceCanvas.style.cssText = "width:100%;height:260px;";
priceChartPanel.appendChild(priceCanvas);
container.appendChild(priceChartPanel);

// ── Route Sheet Summary ────────────────────────────────────────────────────────

const routeSheetPanel = document.createElement("div");
routeSheetPanel.style.cssText = "display:none;background:#1e293b;border-radius:10px;padding:16px 20px;border:1px solid #334155;margin-bottom:16px;";
container.appendChild(routeSheetPanel);

// ── Render Functions ───────────────────────────────────────────────────────────

function renderVehicleCards() {
  if (routeResults.length === 0) {
    vehicleCardsPanel.style.display = "none";
    return;
  }
  vehicleCardsPanel.style.display = "block";
  vehicleCardsPanel.innerHTML = `<h2 style="font-size:16px;font-weight:600;color:#f1f5f9;margin:0 0 12px 0;">Decoded Vehicles (${routeResults.length})</h2>`;

  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;";

  routeResults.forEach((r, i) => {
    const v = r.vehicle;
    const isSelected = i === selectedVehicleIndex;
    const bestScore = r.bestDealer?.matchScore || 0;

    const card = document.createElement("div");
    card.style.cssText = `background:#0f172a;border-radius:10px;padding:14px;border:2px solid ${isSelected ? '#3b82f6' : '#334155'};cursor:pointer;transition:border-color 0.2s;`;
    card.addEventListener("click", () => {
      selectedVehicleIndex = i;
      renderVehicleCards();
      renderMatchChart();
      renderDealerTable();
    });
    card.addEventListener("mouseenter", () => { if (!isSelected) card.style.borderColor = "#475569"; });
    card.addEventListener("mouseleave", () => { if (!isSelected) card.style.borderColor = "#334155"; });

    const bodyTypeIcons: Record<string, string> = {
      Truck: "&#128666;", SUV: "&#128665;", Sedan: "&#128664;", Coupe: "&#128663;",
    };
    const icon = bodyTypeIcons[v.bodyType] || "&#128663;";

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
        <div>
          <div style="font-size:14px;font-weight:700;color:#f1f5f9;">${icon} ${v.year} ${v.make} ${v.model}</div>
          <div style="font-size:11px;color:#94a3b8;">${v.trim}</div>
        </div>
        <span style="padding:3px 8px;border-radius:6px;font-size:10px;font-weight:700;background:${scoreBg(bestScore)};color:${scoreColor(bestScore)};">Best: ${bestScore}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;">
        <div><span style="color:#64748b;">Miles:</span> <span style="color:#cbd5e1;">${fmtNum(v.miles)}</span></div>
        <div><span style="color:#64748b;">Body:</span> <span style="color:#cbd5e1;">${v.bodyType}</span></div>
        <div><span style="color:#64748b;">Engine:</span> <span style="color:#cbd5e1;">${v.engine}</span></div>
        <div><span style="color:#64748b;">Drive:</span> <span style="color:#cbd5e1;">${v.drivetrain}</span></div>
        <div><span style="color:#64748b;">Color:</span> <span style="color:#cbd5e1;">${v.exteriorColor}</span></div>
        <div><span style="color:#64748b;">Price:</span> <span style="color:#22c55e;font-weight:600;">${fmtCurrency(r.priceRange.predicted)}</span></div>
      </div>
      <div style="font-family:monospace;font-size:10px;color:#475569;margin-top:6px;word-break:break-all;">${v.vin}</div>
    `;
    grid.appendChild(card);
  });

  vehicleCardsPanel.appendChild(grid);
}

function renderMatchChart() {
  if (routeResults.length === 0 || !routeResults[selectedVehicleIndex]) {
    chartPanel.style.display = "none";
    return;
  }
  chartPanel.style.display = "block";
  drawMatchScoreChart(matchCanvas, routeResults[selectedVehicleIndex]);
}

function renderDealerTable() {
  if (routeResults.length === 0 || !routeResults[selectedVehicleIndex]) {
    dealerTablePanel.style.display = "none";
    return;
  }
  dealerTablePanel.style.display = "block";
  const r = routeResults[selectedVehicleIndex];

  dealerTablePanel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <h2 style="font-size:16px;font-weight:600;color:#f1f5f9;margin:0;">Ranked Dealer Matches: ${r.vehicle.year} ${r.vehicle.make} ${r.vehicle.model}</h2>
      <span style="font-size:12px;color:#64748b;">${r.dealers.length} dealers</span>
    </div>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Rank</th>
            <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Dealer</th>
            <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Location</th>
            <th style="text-align:center;padding:10px 12px;border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Score</th>
            <th style="text-align:center;padding:10px 12px;border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Fit</th>
            <th style="text-align:center;padding:10px 12px;border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Avg DOM</th>
            <th style="text-align:center;padding:10px 12px;border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Recent Sales</th>
            <th style="text-align:center;padding:10px 12px;border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Distance</th>
          </tr>
        </thead>
        <tbody>
          ${r.dealers.map((d, i) => {
            const rowBg = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)";
            const fitColors: Record<string, { bg: string; fg: string }> = {
              Excellent: { bg: "rgba(34,197,94,0.2)", fg: "#22c55e" },
              Good: { bg: "rgba(59,130,246,0.2)", fg: "#3b82f6" },
              Fair: { bg: "rgba(245,158,11,0.2)", fg: "#f59e0b" },
              Marginal: { bg: "rgba(239,68,68,0.2)", fg: "#ef4444" },
            };
            const fc = fitColors[d.inventoryFit] || fitColors.Fair;
            return `<tr style="background:${rowBg};">
              <td style="padding:10px 12px;border-bottom:1px solid #1e293b;text-align:center;font-weight:600;color:#f1f5f9;">#${i + 1}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #1e293b;font-weight:600;color:#f1f5f9;">${d.dealerName}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;">${d.city}, ${d.state}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #1e293b;text-align:center;">
                <span style="display:inline-block;padding:3px 10px;border-radius:8px;font-weight:700;font-size:13px;background:${scoreBg(d.matchScore)};color:${scoreColor(d.matchScore)};">${d.matchScore}</span>
              </td>
              <td style="padding:10px 12px;border-bottom:1px solid #1e293b;text-align:center;">
                <span style="padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600;background:${fc.bg};color:${fc.fg};">${d.inventoryFit}</span>
              </td>
              <td style="padding:10px 12px;border-bottom:1px solid #1e293b;text-align:center;color:#cbd5e1;">${d.avgDom}d</td>
              <td style="padding:10px 12px;border-bottom:1px solid #1e293b;text-align:center;color:#cbd5e1;">${d.recentSales}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #1e293b;text-align:center;color:#94a3b8;">${d.distance} mi</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPriceChart() {
  if (routeResults.length === 0) {
    priceChartPanel.style.display = "none";
    return;
  }
  priceChartPanel.style.display = "block";
  drawPriceRangeChart(priceCanvas, routeResults);
}

function renderRouteSheet() {
  if (routeResults.length === 0) {
    routeSheetPanel.style.display = "none";
    return;
  }
  routeSheetPanel.style.display = "block";

  // Optimal assignment: assign each VIN to its top-scoring dealer, avoiding duplicates where possible
  const assignments: { vehicle: VehicleSpec; dealer: DealerMatch; price: number }[] = [];
  const usedDealers = new Set<string>();

  // Sort results by best available score descending
  const sorted = [...routeResults].sort((a, b) => (b.bestDealer?.matchScore || 0) - (a.bestDealer?.matchScore || 0));

  sorted.forEach(r => {
    let assigned = false;
    for (const d of r.dealers) {
      if (!usedDealers.has(d.dealerId)) {
        assignments.push({ vehicle: r.vehicle, dealer: d, price: r.priceRange.predicted });
        usedDealers.add(d.dealerId);
        assigned = true;
        break;
      }
    }
    if (!assigned && r.dealers.length > 0) {
      assignments.push({ vehicle: r.vehicle, dealer: r.dealers[0], price: r.priceRange.predicted });
    }
  });

  const totalValue = assignments.reduce((s, a) => s + a.price, 0);
  const avgScore = assignments.length > 0 ? Math.round(assignments.reduce((s, a) => s + a.dealer.matchScore, 0) / assignments.length) : 0;

  routeSheetPanel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <h2 style="font-size:16px;font-weight:600;color:#f1f5f9;margin:0;">Optimal Route Sheet</h2>
      <div style="display:flex;gap:16px;">
        <span style="font-size:12px;color:#94a3b8;">Total Value: <strong style="color:#22c55e;">${fmtCurrency(totalValue)}</strong></span>
        <span style="font-size:12px;color:#94a3b8;">Avg Match: <strong style="color:${scoreColor(avgScore)};">${avgScore}</strong></span>
      </div>
    </div>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">VIN</th>
            <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Vehicle</th>
            <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Assigned Dealer</th>
            <th style="text-align:center;padding:10px 12px;border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Match</th>
            <th style="text-align:right;padding:10px 12px;border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Predicted Price</th>
          </tr>
        </thead>
        <tbody>
          ${assignments.map((a, i) => {
            const rowBg = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)";
            return `<tr style="background:${rowBg};">
              <td style="padding:10px 12px;border-bottom:1px solid #1e293b;font-family:monospace;font-size:11px;color:#64748b;">${a.vehicle.vin}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #1e293b;font-weight:600;color:#f1f5f9;">${a.vehicle.year} ${a.vehicle.make} ${a.vehicle.model}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#cbd5e1;">${a.dealer.dealerName} <span style="color:#64748b;font-size:11px;">(${a.dealer.city}, ${a.dealer.state})</span></td>
              <td style="padding:10px 12px;border-bottom:1px solid #1e293b;text-align:center;">
                <span style="padding:3px 10px;border-radius:8px;font-weight:700;font-size:12px;background:${scoreBg(a.dealer.matchScore)};color:${scoreColor(a.dealer.matchScore)};">${a.dealer.matchScore}</span>
              </td>
              <td style="padding:10px 12px;border-bottom:1px solid #1e293b;text-align:right;font-weight:600;color:#22c55e;">${fmtCurrency(a.price)}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAll() {
  renderVehicleCards();
  renderMatchChart();
  renderDealerTable();
  renderPriceChart();
  renderRouteSheet();
}

// ── Event Handlers ─────────────────────────────────────────────────────────────

async function doRoute() {
  const vinText = (document.getElementById("vinInput") as HTMLTextAreaElement)?.value || "";
  const zip = (document.getElementById("zipInput") as HTMLInputElement)?.value || "85001";
  const radius = parseInt((document.getElementById("radiusInput") as HTMLInputElement)?.value) || 50;

  const vins = vinText
    .split(/[\n,]+/)
    .map(v => v.trim().toUpperCase())
    .filter(v => v.length >= 11)
    .slice(0, 20);

  if (vins.length === 0) {
    statusBar.style.display = "block";
    statusBar.innerHTML = `<span style="color:#f97316;">Please enter at least one valid VIN.</span>`;
    return;
  }

  routeBtn.textContent = "Routing...";
  routeBtn.style.background = "#1e40af";
  statusBar.style.display = "block";
  statusBar.innerHTML = `<span style="color:#60a5fa;">Processing ${vins.length} VIN${vins.length > 1 ? "s" : ""}... Decoding, matching dealers, predicting prices.</span>`;

  // Try live data
  const mode = _detectAppMode();
  if (mode === "mcp" || mode === "live") {
    try {
      const toolResult = await _callTool("route-wholesale-vehicles", {
        vins: vins.join(","),
        zip,
        radius,
      });
      if (toolResult?.content?.[0]?.text) {
        const parsed = JSON.parse(toolResult.content[0].text);
        if (parsed.results && Array.isArray(parsed.results) && parsed.results.length > 0) {
          routeResults = parsed.results;
          selectedVehicleIndex = 0;
          statusBar.style.display = "none";
          renderAll();
          routeBtn.textContent = "Route Vehicles";
          routeBtn.style.background = "#3b82f6";
          return;
        }
      }
    } catch {}
  }

  // Fall back to mock data
  routeResults = generateMockData(vins);
  selectedVehicleIndex = 0;
  statusBar.style.display = "none";
  renderAll();

  routeBtn.textContent = "Route Vehicles";
  routeBtn.style.background = "#3b82f6";
}

routeBtn.addEventListener("click", doRoute);

window.addEventListener("resize", () => {
  renderMatchChart();
  renderPriceChart();
});

// ── Initial Load ───────────────────────────────────────────────────────────────

(async function init() {
  const params = _getUrlParams();
  if (params.vin) {
    (document.getElementById("vinInput") as HTMLTextAreaElement).value = params.vin.replace(/,/g, "\n");
  }
  if (params.zip) {
    (document.getElementById("zipInput") as HTMLInputElement).value = params.zip;
  }

  await doRoute();
})();
