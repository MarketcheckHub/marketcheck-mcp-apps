/**
 * Dealer Inventory Fit Scorer
 * MCP App — Enter dealership info + candidate VINs to see which cars match the dealer's sales DNA.
 * Dark-themed with canvas scatter plot, fit score table, top acquisitions, reject pile.
 */
import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "dealer-inventory-fit-scorer" }); } catch {}

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
  return {dealerId:args.dealer_id,results};
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

type FitBadge = "BUY" | "CONSIDER" | "PASS";

interface CandidateVehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  bodyType: string;
  miles: number;
  exteriorColor: string;
  engine: string;
  drivetrain: string;
  fitScore: number;
  predictedPrice: number;
  estimatedCost: number;
  marginEstimate: number;
  marginPercent: number;
  badge: FitBadge;
  reason: string;
}

interface DealerProfile {
  dealerId: string;
  dealerName: string;
  franchise: string;
  city: string;
  state: string;
  avgInventory: number;
  topMakes: string[];
  topBodyTypes: string[];
}

interface FitScorerResult {
  dealer: DealerProfile;
  candidates: CandidateVehicle[];
}

type SortKey = "fitScore" | "make" | "model" | "predictedPrice" | "marginEstimate" | "badge";
type SortDir = "asc" | "desc";

// ── Mock Data ──────────────────────────────────────────────────────────────────

function generateMockData(dealerId: string, vins: string[]): FitScorerResult {
  const dealer: DealerProfile = {
    dealerId: dealerId || "toyota-sunnyvale-123",
    dealerName: "Sunnyvale Toyota",
    franchise: "Toyota",
    city: "Sunnyvale",
    state: "CA",
    avgInventory: 185,
    topMakes: ["Toyota", "Lexus", "Honda"],
    topBodyTypes: ["SUV", "Sedan", "Truck"],
  };

  const candidateSpecs: Record<string, Omit<CandidateVehicle, "fitScore" | "predictedPrice" | "estimatedCost" | "marginEstimate" | "marginPercent" | "badge" | "reason">> = {
    "JTDKN3DU5A0123456": { vin: "JTDKN3DU5A0123456", year: 2023, make: "Toyota", model: "RAV4", trim: "XLE Premium AWD", bodyType: "SUV", miles: 15200, exteriorColor: "Lunar Rock", engine: "2.5L Hybrid", drivetrain: "AWD" },
    "2T1BURHE7HC654321": { vin: "2T1BURHE7HC654321", year: 2022, make: "Toyota", model: "Corolla", trim: "SE CVT", bodyType: "Sedan", miles: 22400, exteriorColor: "Celestite Gray", engine: "2.0L I4", drivetrain: "FWD" },
    "5TFCZ5AN1NX987654": { vin: "5TFCZ5AN1NX987654", year: 2022, make: "Toyota", model: "Tacoma", trim: "TRD Off-Road", bodyType: "Truck", miles: 28900, exteriorColor: "Army Green", engine: "3.5L V6", drivetrain: "4WD" },
    "4T1BF1FK5HU111222": { vin: "4T1BF1FK5HU111222", year: 2023, make: "Toyota", model: "Camry", trim: "XSE V6", bodyType: "Sedan", miles: 11800, exteriorColor: "Wind Chill Pearl", engine: "3.5L V6", drivetrain: "FWD" },
    "WBAPH5C55BA234567": { vin: "WBAPH5C55BA234567", year: 2022, make: "BMW", model: "X5", trim: "xDrive40i", bodyType: "SUV", miles: 32100, exteriorColor: "Alpine White", engine: "3.0L I6 Turbo", drivetrain: "AWD" },
    "JTHBJ46G072222333": { vin: "JTHBJ46G072222333", year: 2022, make: "Lexus", model: "RX 350", trim: "Premium", bodyType: "SUV", miles: 24600, exteriorColor: "Eminent White Pearl", engine: "3.5L V6", drivetrain: "AWD" },
    "1HGBH41JXMN444555": { vin: "1HGBH41JXMN444555", year: 2021, make: "Honda", model: "Accord", trim: "Sport 2.0T", bodyType: "Sedan", miles: 34200, exteriorColor: "Radiant Red", engine: "2.0L Turbo I4", drivetrain: "FWD" },
    "WBA3A5C55FK666777": { vin: "WBA3A5C55FK666777", year: 2021, make: "BMW", model: "3 Series", trim: "330i xDrive", bodyType: "Sedan", miles: 38500, exteriorColor: "Black Sapphire", engine: "2.0L Turbo I4", drivetrain: "AWD" },
  };

  // Scoring logic: Toyota franchise dealer
  const candidates = vins.map(vin => {
    const spec = candidateSpecs[vin] || {
      vin,
      year: 2022,
      make: "Unknown",
      model: "Vehicle",
      trim: "Base",
      bodyType: "Sedan",
      miles: 30000,
      exteriorColor: "Unknown",
      engine: "N/A",
      drivetrain: "FWD",
    };

    // Calculate fit score based on brand alignment
    let fitScore = 50;
    let reason = "";

    // Brand fit
    if (spec.make === dealer.franchise) {
      fitScore += 30;
      reason = "Perfect brand match for franchise dealer.";
    } else if (dealer.topMakes.includes(spec.make)) {
      fitScore += 15;
      reason = `${spec.make} sells well as complementary inventory.`;
    } else {
      fitScore -= 15;
      reason = `${spec.make} is not a natural fit for a ${dealer.franchise} franchise.`;
    }

    // Body type fit
    if (dealer.topBodyTypes.includes(spec.bodyType)) {
      fitScore += 10;
    } else {
      fitScore -= 5;
      reason += ` ${spec.bodyType} not in top-selling body types.`;
    }

    // Mileage factor
    if (spec.miles < 20000) fitScore += 8;
    else if (spec.miles < 35000) fitScore += 3;
    else fitScore -= 5;

    // Year factor
    const currentYear = 2026;
    const age = currentYear - spec.year;
    if (age <= 2) fitScore += 5;
    else if (age > 4) fitScore -= 8;

    // Clamp
    fitScore = Math.max(10, Math.min(98, fitScore));

    // Predicted price
    const basePrices: Record<string, number> = {
      "Toyota RAV4": 32500, "Toyota Corolla": 21800, "Toyota Tacoma": 35200,
      "Toyota Camry": 28500, "BMW X5": 44800, "Lexus RX 350": 38200,
      "Honda Accord": 25600, "BMW 3 Series": 33400,
    };
    const baseP = basePrices[`${spec.make} ${spec.model}`] || 27000;
    const mileAdj = Math.floor(spec.miles / 1000) * 120;
    const predictedPrice = baseP - mileAdj;

    // Cost and margin estimates
    const estimatedCost = Math.round(predictedPrice * (0.82 + Math.random() * 0.08));
    const marginEstimate = predictedPrice - estimatedCost;
    const marginPercent = Math.round((marginEstimate / estimatedCost) * 100 * 10) / 10;

    // Badge
    let badge: FitBadge = "CONSIDER";
    if (fitScore >= 75) badge = "BUY";
    else if (fitScore < 45) badge = "PASS";

    return {
      ...spec,
      fitScore,
      predictedPrice,
      estimatedCost,
      marginEstimate,
      marginPercent,
      badge,
      reason: reason.trim(),
    };
  });

  return { dealer, candidates };
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function fmtCurrency(v: number): string {
  return "$" + Math.round(v).toLocaleString();
}

function fmtNum(v: number): string {
  return Math.round(v).toLocaleString();
}

function badgeColor(badge: FitBadge): { bg: string; fg: string } {
  switch (badge) {
    case "BUY": return { bg: "rgba(34,197,94,0.2)", fg: "#22c55e" };
    case "CONSIDER": return { bg: "rgba(245,158,11,0.2)", fg: "#f59e0b" };
    case "PASS": return { bg: "rgba(239,68,68,0.2)", fg: "#ef4444" };
  }
}

function scoreColor(score: number): string {
  if (score >= 75) return "#22c55e";
  if (score >= 45) return "#f59e0b";
  return "#ef4444";
}

function scoreBg(score: number): string {
  if (score >= 75) return "rgba(34,197,94,0.15)";
  if (score >= 45) return "rgba(245,158,11,0.15)";
  return "rgba(239,68,68,0.15)";
}

// ── Canvas: Scatter Plot (Fit Score vs Profit Margin) ──────────────────────────

function drawScatterPlot(canvas: HTMLCanvasElement, candidates: CandidateVehicle[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  if (candidates.length === 0) {
    ctx.fillStyle = "#64748b";
    ctx.font = "14px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No candidates to display", w / 2, h / 2);
    return;
  }

  const marginLeft = 60;
  const marginRight = 30;
  const marginTop = 40;
  const marginBottom = 50;
  const chartW = w - marginLeft - marginRight;
  const chartH = h - marginTop - marginBottom;

  // Data ranges
  const scores = candidates.map(c => c.fitScore);
  const margins = candidates.map(c => c.marginEstimate);
  const minScore = Math.max(0, Math.min(...scores) - 10);
  const maxScore = Math.min(100, Math.max(...scores) + 10);
  const minMargin = Math.min(...margins) - 500;
  const maxMargin = Math.max(...margins) + 500;

  // Title
  ctx.fillStyle = "#f1f5f9";
  ctx.font = "bold 14px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Fit Score vs. Estimated Profit Margin", w / 2, 24);

  // Background quadrants
  const midX = marginLeft + ((60 - minScore) / (maxScore - minScore)) * chartW;
  const midY = marginTop + chartH - ((3000 - minMargin) / (maxMargin - minMargin)) * chartH;

  // Top-right quadrant (high fit, high margin) - green tint
  if (midX < marginLeft + chartW && midY > marginTop) {
    ctx.fillStyle = "rgba(34,197,94,0.05)";
    ctx.fillRect(midX, marginTop, marginLeft + chartW - midX, midY - marginTop);
  }

  // Bottom-left quadrant (low fit, low margin) - red tint
  if (midX > marginLeft && midY < marginTop + chartH) {
    ctx.fillStyle = "rgba(239,68,68,0.05)";
    ctx.fillRect(marginLeft, midY, midX - marginLeft, marginTop + chartH - midY);
  }

  // Grid lines
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;

  // X-axis grid (score)
  for (let s = Math.ceil(minScore / 10) * 10; s <= maxScore; s += 10) {
    const x = marginLeft + ((s - minScore) / (maxScore - minScore)) * chartW;
    ctx.beginPath();
    ctx.moveTo(x, marginTop);
    ctx.lineTo(x, marginTop + chartH);
    ctx.stroke();

    ctx.fillStyle = "#64748b";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(s), x, marginTop + chartH + 16);
  }

  // Y-axis grid (margin)
  const marginStep = Math.max(1000, Math.ceil((maxMargin - minMargin) / 5 / 1000) * 1000);
  for (let m = Math.ceil(minMargin / marginStep) * marginStep; m <= maxMargin; m += marginStep) {
    const y = marginTop + chartH - ((m - minMargin) / (maxMargin - minMargin)) * chartH;
    ctx.beginPath();
    ctx.moveTo(marginLeft, y);
    ctx.lineTo(marginLeft + chartW, y);
    ctx.stroke();

    ctx.fillStyle = "#64748b";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(fmtCurrency(m), marginLeft - 6, y + 4);
  }

  // Axis labels
  ctx.fillStyle = "#94a3b8";
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Fit Score", marginLeft + chartW / 2, marginTop + chartH + 38);

  ctx.save();
  ctx.translate(14, marginTop + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Profit Margin", 0, 0);
  ctx.restore();

  // Plot points
  candidates.forEach(c => {
    const x = marginLeft + ((c.fitScore - minScore) / (maxScore - minScore)) * chartW;
    const y = marginTop + chartH - ((c.marginEstimate - minMargin) / (maxMargin - minMargin)) * chartH;
    const color = scoreColor(c.fitScore);
    const radius = 8;

    // Glow
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
    ctx.fillStyle = color + "33";
    ctx.fill();

    // Point
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Label
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    const label = `${c.make} ${c.model}`;
    ctx.fillText(label.length > 16 ? label.substring(0, 14) + ".." : label, x, y - radius - 6);
  });

  // Legend
  const legendX = marginLeft + chartW - 180;
  const legendY = marginTop + 8;
  ctx.fillStyle = "rgba(15,23,42,0.9)";
  ctx.fillRect(legendX, legendY, 170, 60);
  ctx.strokeStyle = "#334155";
  ctx.strokeRect(legendX, legendY, 170, 60);

  [
    { color: "#22c55e", label: "BUY (75+)" },
    { color: "#f59e0b", label: "CONSIDER (45-74)" },
    { color: "#ef4444", label: "PASS (<45)" },
  ].forEach((item, i) => {
    const y = legendY + 14 + i * 18;
    ctx.beginPath();
    ctx.arc(legendX + 12, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = item.color;
    ctx.fill();
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(item.label, legendX + 22, y + 4);
  });
}

// ── Canvas: Fit Score Bar Chart ────────────────────────────────────────────────

function drawFitBars(canvas: HTMLCanvasElement, candidates: CandidateVehicle[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const sorted = [...candidates].sort((a, b) => b.fitScore - a.fitScore);
  if (sorted.length === 0) return;

  const marginLeft = 140;
  const marginRight = 60;
  const marginTop = 40;
  const marginBottom = 20;
  const chartW = w - marginLeft - marginRight;
  const chartH = h - marginTop - marginBottom;
  const barH = Math.min(28, (chartH / sorted.length) - 6);
  const gap = (chartH - barH * sorted.length) / (sorted.length + 1);

  ctx.fillStyle = "#f1f5f9";
  ctx.font = "bold 13px -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Candidate Fit Scores (Sorted)", marginLeft, 24);

  // Threshold lines
  [45, 75].forEach(thresh => {
    const x = marginLeft + (thresh / 100) * chartW;
    ctx.strokeStyle = thresh === 75 ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, marginTop);
    ctx.lineTo(x, marginTop + chartH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = thresh === 75 ? "rgba(34,197,94,0.5)" : "rgba(245,158,11,0.5)";
    ctx.font = "9px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(thresh === 75 ? "BUY" : "CONSIDER", x, marginTop - 4);
  });

  sorted.forEach((c, i) => {
    const y = marginTop + gap + i * (barH + gap);
    const barW = (c.fitScore / 100) * chartW;
    const color = scoreColor(c.fitScore);

    const grad = ctx.createLinearGradient(marginLeft, 0, marginLeft + barW, 0);
    grad.addColorStop(0, color + "88");
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(marginLeft, y, barW, barH, 4);
    ctx.fill();

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${c.make} ${c.model}`, marginLeft - 8, y + barH / 2 + 4);

    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 11px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${c.fitScore} - ${c.badge}`, marginLeft + barW + 6, y + barH / 2 + 4);
  });
}

// ── App State ──────────────────────────────────────────────────────────────────

let result: FitScorerResult | null = null;
let sortKey: SortKey = "fitScore";
let sortDir: SortDir = "desc";

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
titleRow.innerHTML = `<h1 style="font-size:20px;font-weight:700;color:#f1f5f9;letter-spacing:-0.3px;margin:0;">Dealer Inventory Fit Scorer</h1>`;
_addSettingsBar(titleRow);
headerPanel.appendChild(titleRow);

const subtitle = document.createElement("div");
subtitle.style.cssText = "font-size:12px;color:#94a3b8;margin-bottom:14px;";
subtitle.textContent = "Enter your dealership info and candidate VINs to see which cars match your sales DNA.";
headerPanel.appendChild(subtitle);

// Input form
const inputStyle = "padding:7px 10px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;";

const formRow1 = document.createElement("div");
formRow1.style.cssText = "display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin-bottom:12px;";

function makeField(label: string, html: string): HTMLDivElement {
  const d = document.createElement("div");
  d.style.cssText = "display:flex;flex-direction:column;gap:4px;";
  d.innerHTML = `<label style="font-size:11px;color:#94a3b8;font-weight:600;">${label}</label>${html}`;
  return d;
}

formRow1.appendChild(makeField("Dealer ID / Domain",
  `<input id="dealerIdInput" type="text" value="toyota-sunnyvale-123" placeholder="e.g. dealer ID or domain" style="${inputStyle}width:200px;" />`));
formRow1.appendChild(makeField("ZIP Code",
  `<input id="zipInput" type="text" value="94087" maxlength="5" style="${inputStyle}width:80px;" />`));
headerPanel.appendChild(formRow1);

const vinRow = document.createElement("div");
vinRow.style.cssText = "display:flex;gap:12px;flex-wrap:wrap;align-items:start;margin-bottom:12px;";

const vinGroup = document.createElement("div");
vinGroup.style.cssText = "flex:1;min-width:300px;display:flex;flex-direction:column;gap:4px;";
vinGroup.innerHTML = `<label style="font-size:11px;color:#94a3b8;font-weight:600;">Candidate VINs (one per line)</label>`;
const vinTextarea = document.createElement("textarea");
vinTextarea.id = "vinInput";
vinTextarea.placeholder = "Paste VINs to evaluate...";
vinTextarea.style.cssText = `${inputStyle}width:100%;height:100px;resize:vertical;box-sizing:border-box;font-family:monospace;`;
vinTextarea.value = "JTDKN3DU5A0123456\n2T1BURHE7HC654321\n5TFCZ5AN1NX987654\n4T1BF1FK5HU111222\nWBAPH5C55BA234567\nJTHBJ46G072222333\n1HGBH41JXMN444555\nWBA3A5C55FK666777";
vinGroup.appendChild(vinTextarea);
vinRow.appendChild(vinGroup);
headerPanel.appendChild(vinRow);

const btnRow = document.createElement("div");
btnRow.style.cssText = "display:flex;gap:10px;";

const scoreBtn = document.createElement("button");
scoreBtn.textContent = "Score Candidates";
scoreBtn.style.cssText = "padding:10px 24px;border-radius:6px;border:none;background:#3b82f6;color:#fff;font-size:13px;font-weight:600;cursor:pointer;";
scoreBtn.addEventListener("mouseenter", () => { scoreBtn.style.background = "#2563eb"; });
scoreBtn.addEventListener("mouseleave", () => { scoreBtn.style.background = "#3b82f6"; });
btnRow.appendChild(scoreBtn);
headerPanel.appendChild(btnRow);
container.appendChild(headerPanel);

// ── Status ─────────────────────────────────────────────────────────────────────

const statusBar = document.createElement("div");
statusBar.style.cssText = "display:none;background:#1e293b;border-radius:10px;padding:14px 18px;border:1px solid #334155;margin-bottom:16px;text-align:center;";
container.appendChild(statusBar);

// ── Dealer Profile Card ────────────────────────────────────────────────────────

const dealerCard = document.createElement("div");
dealerCard.style.cssText = "display:none;background:#1e293b;border-radius:10px;padding:16px 20px;border:1px solid #334155;margin-bottom:16px;";
container.appendChild(dealerCard);

// ── Fit Score Table ────────────────────────────────────────────────────────────

const tablePanel = document.createElement("div");
tablePanel.style.cssText = "display:none;background:#1e293b;border-radius:10px;padding:16px;border:1px solid #334155;margin-bottom:16px;";
container.appendChild(tablePanel);

// ── Charts Row ─────────────────────────────────────────────────────────────────

const chartsRow = document.createElement("div");
chartsRow.style.cssText = "display:none;display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;";

const scatterPanel = document.createElement("div");
scatterPanel.style.cssText = "flex:1;min-width:400px;background:#1e293b;border-radius:10px;padding:16px;border:1px solid #334155;";
const scatterCanvas = document.createElement("canvas");
scatterCanvas.style.cssText = "width:100%;height:380px;";
scatterPanel.appendChild(scatterCanvas);
chartsRow.appendChild(scatterPanel);

const barsPanel = document.createElement("div");
barsPanel.style.cssText = "flex:1;min-width:350px;background:#1e293b;border-radius:10px;padding:16px;border:1px solid #334155;";
const barsCanvas = document.createElement("canvas");
barsCanvas.style.cssText = "width:100%;height:380px;";
barsPanel.appendChild(barsCanvas);
chartsRow.appendChild(barsPanel);

container.appendChild(chartsRow);

// ── Top Acquisitions ───────────────────────────────────────────────────────────

const topAcqPanel = document.createElement("div");
topAcqPanel.style.cssText = "display:none;background:#1e293b;border-radius:10px;padding:16px 20px;border:1px solid #334155;margin-bottom:16px;";
container.appendChild(topAcqPanel);

// ── Reject Pile ────────────────────────────────────────────────────────────────

const rejectPanel = document.createElement("div");
rejectPanel.style.cssText = "display:none;background:#1e293b;border-radius:10px;padding:16px 20px;border:1px solid #334155;margin-bottom:16px;";
container.appendChild(rejectPanel);

// ── Render Functions ───────────────────────────────────────────────────────────

function renderDealerProfile() {
  if (!result) {
    dealerCard.style.display = "none";
    return;
  }
  dealerCard.style.display = "block";
  const d = result.dealer;

  dealerCard.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <h2 style="font-size:16px;font-weight:600;color:#f1f5f9;margin:0;">Dealer Profile</h2>
      <span style="font-size:12px;color:#64748b;">ID: ${d.dealerId}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;">
      <div style="background:#0f172a;border-radius:8px;padding:12px;">
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Name</div>
        <div style="font-size:14px;font-weight:600;color:#f1f5f9;margin-top:4px;">${d.dealerName}</div>
      </div>
      <div style="background:#0f172a;border-radius:8px;padding:12px;">
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Franchise</div>
        <div style="font-size:14px;font-weight:600;color:#3b82f6;margin-top:4px;">${d.franchise}</div>
      </div>
      <div style="background:#0f172a;border-radius:8px;padding:12px;">
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Location</div>
        <div style="font-size:14px;font-weight:600;color:#f1f5f9;margin-top:4px;">${d.city}, ${d.state}</div>
      </div>
      <div style="background:#0f172a;border-radius:8px;padding:12px;">
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Avg Inventory</div>
        <div style="font-size:14px;font-weight:600;color:#f1f5f9;margin-top:4px;">${d.avgInventory} units</div>
      </div>
      <div style="background:#0f172a;border-radius:8px;padding:12px;">
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Top Makes</div>
        <div style="font-size:14px;font-weight:600;color:#f1f5f9;margin-top:4px;">${d.topMakes.join(", ")}</div>
      </div>
      <div style="background:#0f172a;border-radius:8px;padding:12px;">
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Top Body Types</div>
        <div style="font-size:14px;font-weight:600;color:#f1f5f9;margin-top:4px;">${d.topBodyTypes.join(", ")}</div>
      </div>
    </div>
  `;
}

function renderFitTable() {
  if (!result || result.candidates.length === 0) {
    tablePanel.style.display = "none";
    return;
  }
  tablePanel.style.display = "block";

  const sorted = [...result.candidates].sort((a, b) => {
    let va: any, vb: any;
    switch (sortKey) {
      case "fitScore": va = a.fitScore; vb = b.fitScore; break;
      case "make": va = a.make; vb = b.make; break;
      case "model": va = a.model; vb = b.model; break;
      case "predictedPrice": va = a.predictedPrice; vb = b.predictedPrice; break;
      case "marginEstimate": va = a.marginEstimate; vb = b.marginEstimate; break;
      case "badge": va = a.badge; vb = b.badge; break;
      default: va = a.fitScore; vb = b.fitScore;
    }
    if (typeof va === "string") {
      const cmp = va.localeCompare(vb as string);
      return sortDir === "asc" ? cmp : -cmp;
    }
    return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });

  const headers: { key: SortKey; label: string }[] = [
    { key: "make", label: "Make" },
    { key: "model", label: "Model" },
    { key: "fitScore", label: "Fit Score" },
    { key: "predictedPrice", label: "Predicted Price" },
    { key: "marginEstimate", label: "Est. Margin" },
    { key: "badge", label: "Action" },
  ];

  const arrow = (k: SortKey) => sortKey === k ? (sortDir === "asc" ? " &#9650;" : " &#9660;") : "";

  tablePanel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <h2 style="font-size:16px;font-weight:600;color:#f1f5f9;margin:0;">Fit Score Table</h2>
      <span style="font-size:12px;color:#64748b;">${sorted.length} candidates</span>
    </div>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">VIN</th>
            <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Year</th>
            ${headers.map(h => `<th data-key="${h.key}" style="text-align:${h.key === "fitScore" || h.key === "badge" ? 'center' : h.key === "predictedPrice" || h.key === "marginEstimate" ? 'right' : 'left'};padding:10px 12px;border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;cursor:pointer;user-select:none;">${h.label}${arrow(h.key)}</th>`).join("")}
            <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Reason</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map((c, i) => {
            const rowBg = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)";
            const bc = badgeColor(c.badge);
            const marginColor = c.marginEstimate >= 3000 ? "#22c55e" : c.marginEstimate >= 1500 ? "#f59e0b" : "#ef4444";
            return `<tr style="background:${rowBg};">
              <td style="padding:10px 12px;border-bottom:1px solid #1e293b;font-family:monospace;font-size:10px;color:#64748b;">${c.vin.substring(0, 11)}...</td>
              <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;">${c.year}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #1e293b;font-weight:600;color:#f1f5f9;">${c.make}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#cbd5e1;">${c.model} <span style="color:#64748b;font-size:11px;">${c.trim}</span></td>
              <td style="padding:10px 12px;border-bottom:1px solid #1e293b;text-align:center;">
                <span style="display:inline-block;padding:3px 10px;border-radius:8px;font-weight:700;font-size:13px;background:${scoreBg(c.fitScore)};color:${scoreColor(c.fitScore)};">${c.fitScore}</span>
              </td>
              <td style="padding:10px 12px;border-bottom:1px solid #1e293b;text-align:right;font-weight:600;color:#f1f5f9;">${fmtCurrency(c.predictedPrice)}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #1e293b;text-align:right;font-weight:600;color:${marginColor};">${fmtCurrency(c.marginEstimate)} <span style="font-size:10px;color:#64748b;">(${c.marginPercent}%)</span></td>
              <td style="padding:10px 12px;border-bottom:1px solid #1e293b;text-align:center;">
                <span style="padding:3px 12px;border-radius:6px;font-size:11px;font-weight:700;background:${bc.bg};color:${bc.fg};">${c.badge}</span>
              </td>
              <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:11px;max-width:200px;">${c.reason}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  // Attach sort handlers
  tablePanel.querySelectorAll("th[data-key]").forEach(th => {
    th.addEventListener("click", () => {
      const k = (th as HTMLElement).dataset.key as SortKey;
      if (sortKey === k) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        sortKey = k;
        sortDir = k === "fitScore" || k === "marginEstimate" || k === "predictedPrice" ? "desc" : "asc";
      }
      renderFitTable();
    });
  });
}

function renderCharts() {
  if (!result || result.candidates.length === 0) {
    chartsRow.style.display = "none";
    return;
  }
  chartsRow.style.display = "flex";
  drawScatterPlot(scatterCanvas, result.candidates);
  drawFitBars(barsCanvas, result.candidates);
}

function renderTopAcquisitions() {
  if (!result) {
    topAcqPanel.style.display = "none";
    return;
  }

  const buys = result.candidates.filter(c => c.badge === "BUY").sort((a, b) => b.fitScore - a.fitScore).slice(0, 5);

  if (buys.length === 0) {
    topAcqPanel.style.display = "none";
    return;
  }

  topAcqPanel.style.display = "block";
  const totalMargin = buys.reduce((s, c) => s + c.marginEstimate, 0);

  topAcqPanel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <h2 style="font-size:16px;font-weight:600;color:#22c55e;margin:0;">Top ${buys.length} Recommended Acquisitions</h2>
      <span style="font-size:12px;color:#94a3b8;">Combined margin: <strong style="color:#22c55e;">${fmtCurrency(totalMargin)}</strong></span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;">
      ${buys.map((c, i) => `
        <div style="background:#0f172a;border-radius:10px;padding:14px;border:1px solid rgba(34,197,94,0.3);">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
            <div>
              <div style="font-size:10px;color:#22c55e;font-weight:700;">#${i + 1} RECOMMENDED</div>
              <div style="font-size:15px;font-weight:700;color:#f1f5f9;margin-top:2px;">${c.year} ${c.make} ${c.model}</div>
              <div style="font-size:11px;color:#94a3b8;">${c.trim}</div>
            </div>
            <span style="padding:4px 10px;border-radius:8px;font-weight:700;font-size:16px;background:${scoreBg(c.fitScore)};color:${scoreColor(c.fitScore)};">${c.fitScore}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;">
            <div><span style="color:#64748b;">Price:</span> <span style="color:#f1f5f9;font-weight:600;">${fmtCurrency(c.predictedPrice)}</span></div>
            <div><span style="color:#64748b;">Margin:</span> <span style="color:#22c55e;font-weight:600;">${fmtCurrency(c.marginEstimate)}</span></div>
            <div><span style="color:#64748b;">Miles:</span> <span style="color:#cbd5e1;">${fmtNum(c.miles)}</span></div>
            <div><span style="color:#64748b;">Color:</span> <span style="color:#cbd5e1;">${c.exteriorColor}</span></div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderRejectPile() {
  if (!result) {
    rejectPanel.style.display = "none";
    return;
  }

  const passes = result.candidates.filter(c => c.badge === "PASS").sort((a, b) => a.fitScore - b.fitScore);

  if (passes.length === 0) {
    rejectPanel.style.display = "none";
    return;
  }

  rejectPanel.style.display = "block";

  rejectPanel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <h2 style="font-size:16px;font-weight:600;color:#ef4444;margin:0;">Reject Pile (${passes.length})</h2>
      <span style="font-size:11px;color:#94a3b8;">Low fit score vehicles not recommended for acquisition</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;">
      ${passes.map(c => `
        <div style="background:#0f172a;border-radius:10px;padding:14px;border:1px solid rgba(239,68,68,0.3);opacity:0.85;">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px;">
            <div>
              <div style="font-size:14px;font-weight:600;color:#f1f5f9;">${c.year} ${c.make} ${c.model}</div>
              <div style="font-size:11px;color:#94a3b8;">${c.trim}</div>
            </div>
            <span style="padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;background:rgba(239,68,68,0.2);color:#ef4444;">PASS (${c.fitScore})</span>
          </div>
          <div style="font-size:12px;color:#f87171;margin-top:6px;padding:8px;background:rgba(239,68,68,0.08);border-radius:6px;">
            <strong>Why:</strong> ${c.reason}
          </div>
          <div style="display:flex;gap:12px;font-size:11px;color:#64748b;margin-top:6px;">
            <span>Price: ${fmtCurrency(c.predictedPrice)}</span>
            <span>Miles: ${fmtNum(c.miles)}</span>
            <span>Margin: ${fmtCurrency(c.marginEstimate)}</span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderAll() {
  renderDealerProfile();
  renderFitTable();
  renderCharts();
  renderTopAcquisitions();
  renderRejectPile();
}

// ── Event Handlers ─────────────────────────────────────────────────────────────

async function doScore() {
  const dealerId = (document.getElementById("dealerIdInput") as HTMLInputElement)?.value?.trim() || "";
  const zip = (document.getElementById("zipInput") as HTMLInputElement)?.value?.trim() || "94087";
  const vinText = (document.getElementById("vinInput") as HTMLTextAreaElement)?.value || "";

  const vins = vinText
    .split(/[\n,]+/)
    .map(v => v.trim().toUpperCase())
    .filter(v => v.length >= 11)
    .slice(0, 20);

  if (vins.length === 0) {
    statusBar.style.display = "block";
    statusBar.innerHTML = `<span style="color:#f97316;">Please enter at least one valid candidate VIN.</span>`;
    return;
  }

  if (!dealerId) {
    statusBar.style.display = "block";
    statusBar.innerHTML = `<span style="color:#f97316;">Please enter a dealer ID or domain.</span>`;
    return;
  }

  scoreBtn.textContent = "Scoring...";
  scoreBtn.style.background = "#1e40af";
  statusBar.style.display = "block";
  statusBar.innerHTML = `<span style="color:#60a5fa;">Analyzing ${vins.length} candidate VIN${vins.length > 1 ? "s" : ""} against dealer profile...</span>`;

  // Try live data
  const mode = _detectAppMode();
  if (mode === "mcp" || mode === "live") {
    try {
      const toolResult = await _callTool("score-dealer-fit", {
        dealer_id: dealerId,
        zip,
        vins: vins.join(","),
      });
      if (toolResult?.content?.[0]?.text) {
        const parsed = JSON.parse(toolResult.content[0].text);
        if (parsed.dealer && parsed.candidates) {
          result = parsed;
          statusBar.style.display = "none";
          renderAll();
          scoreBtn.textContent = "Score Candidates";
          scoreBtn.style.background = "#3b82f6";
          return;
        }
      }
    } catch {}
  }

  // Fall back to mock data
  result = generateMockData(dealerId, vins);
  statusBar.style.display = "none";
  renderAll();

  scoreBtn.textContent = "Score Candidates";
  scoreBtn.style.background = "#3b82f6";
}

scoreBtn.addEventListener("click", doScore);

window.addEventListener("resize", () => {
  renderCharts();
});

// ── Initial Load ───────────────────────────────────────────────────────────────

(async function init() {
  const params = _getUrlParams();
  if (params.dealer_id) {
    (document.getElementById("dealerIdInput") as HTMLInputElement).value = params.dealer_id;
  }
  if (params.zip) {
    (document.getElementById("zipInput") as HTMLInputElement).value = params.zip;
  }
  if (params.vin) {
    (document.getElementById("vinInput") as HTMLTextAreaElement).value = params.vin.replace(/,/g, "\n");
  }

  await doScore();
})();
