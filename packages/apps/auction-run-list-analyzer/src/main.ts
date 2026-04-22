/**
 * Auction Run List Analyzer
 * Pre-sale VIN evaluation with hammer price predictions.
 * Evaluates a batch of consigned VINs before sale day — decodes specs,
 * predicts retail/wholesale prices, calculates expected hammer price,
 * and produces BUY/CAUTION/PASS verdicts.
 */

import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "auction-run-list-analyzer" }); } catch {}

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
  for (const key of ["vins", "zip"]) {
    const v = params.get(key);
    if (v) result[key] = v;
  }
  return result;
}

function _proxyBase(): string {
  return location.protocol.startsWith("http") ? "" : "http://localhost:3001";
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

function _mcDecode(vin: string) { return _mcApi("/decode/car/neovin/" + vin + "/specs"); }
function _mcPredict(p: Record<string, any>) { return _mcApi("/predict/car/us/marketcheck_price/comparables", p); }
function _mcActive(p: Record<string, any>) { return _mcApi("/search/car/active", p); }
function _mcRecent(p: Record<string, any>) { return _mcApi("/search/car/recents", p); }
function _mcSold(p: Record<string, any>) { return _mcApi("/api/v1/sold-vehicles/summary", p); }

// ── Types ──────────────────────────────────────────────────────────────

interface VinResult {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  retailPrice: number;
  wholesalePrice: number;
  hammerEstimate: number;
  spread: number;
  spreadPct: number;
  compCount: number;
  demandScore: number;
  verdict: "BUY" | "CAUTION" | "PASS";
}

interface RunListData {
  results: VinResult[];
  summary: {
    totalUnits: number;
    avgHammer: number;
    avgSpread: number;
    avgSpreadPct: number;
    buyCount: number;
    cautionCount: number;
    passCount: number;
    totalEstimatedRevenue: number;
  };
}

// ── Data Orchestration (Live Mode) ─────────────────────────────────────

const HAMMER_FACTOR = 0.92;

function computeVerdict(demandScore: number, spreadPct: number): "BUY" | "CAUTION" | "PASS" {
  if (demandScore >= 70 && spreadPct >= 8) return "BUY";
  if (demandScore >= 40 || spreadPct >= 5) return "CAUTION";
  return "PASS";
}

async function _fetchDirect(vins: string[], zip: string): Promise<RunListData> {
  const currentYear = new Date().getFullYear();

  // Step 1: For each VIN in parallel — decode + predict retail + predict wholesale
  const perVin = await Promise.all(
    vins.map(async (vin) => {
      const decode = await _mcDecode(vin).catch(() => null);
      const vehicleYear = decode?.year ?? currentYear - 3;
      const age = Math.max(1, currentYear - vehicleYear);
      const estimatedMiles = age * 12000; // ~12k miles/year average

      const [retailPred, wholesalePred] = await Promise.all([
        _mcPredict({ vin, zip, dealer_type: "franchise", miles: estimatedMiles }).catch(() => null),
        _mcPredict({ vin, zip, dealer_type: "independent", miles: estimatedMiles }).catch(() => null),
      ]);
      return { vin, decode, retailPred, wholesalePred };
    })
  );

  // Step 2: Fetch active listing counts per make/model for demand scoring (sold summary is enterprise-only)
  const demandCounts: Record<string, number> = {};
  const uniqueModels = [...new Set(perVin.map((v) => v.decode ? `${v.decode.make}|${v.decode.model}` : null).filter(Boolean))] as string[];
  await Promise.all(
    uniqueModels.map(async (key) => {
      const [make, model] = key.split("|");
      try {
        const res = await _mcActive({ make, model, zip, radius: 100, rows: 0, stats: "price" });
        demandCounts[key] = res?.num_found ?? 0;
      } catch { demandCounts[key] = 0; }
    })
  );

  // Step 4: Assemble results
  const results: VinResult[] = perVin.map((v) => {
    const year = v.decode?.year ?? 0;
    const make = v.decode?.make ?? "Unknown";
    const model = v.decode?.model ?? "Unknown";
    const trim = v.decode?.trim ?? "";

    // API returns marketcheck_price — fall back between franchise/independent
    const franchisePrice = v.retailPred?.marketcheck_price ?? 0;
    const independentPrice = v.wholesalePred?.marketcheck_price ?? 0;
    const retailPrice = franchisePrice || independentPrice || 0;
    const wholesalePrice = independentPrice || Math.round(retailPrice * 0.82);
    const hammerEstimate = retailPrice > 0 ? Math.round(retailPrice * HAMMER_FACTOR) : 0;
    const spread = hammerEstimate - wholesalePrice;
    const spreadPct = wholesalePrice > 0 ? Math.round((spread / wholesalePrice) * 100) : 0;

    // Comps: comparables is { num_found, listings[], stats }
    const activeComps = v.retailPred?.comparables?.num_found ?? v.retailPred?.comparables?.listings?.length ?? 0;
    const recentComps = v.retailPred?.recent_comparables?.num_found ?? v.retailPred?.recent_comparables?.listings?.length ?? 0;
    const compCount = activeComps + recentComps;

    // Demand score: based on active listing count in market + comp count
    const modelKey = `${make}|${model}`;
    const marketCount = demandCounts[modelKey] ?? 0;
    let demandScore = Math.min(100, Math.round(Math.sqrt(marketCount) * 8));
    if (compCount > 20) demandScore = Math.min(100, demandScore + 15);
    else if (compCount > 5) demandScore = Math.min(100, demandScore + 5);
    else if (compCount === 0 && retailPrice === 0) demandScore = Math.max(10, demandScore - 20);

    const verdict = computeVerdict(demandScore, spreadPct);

    return { vin: v.vin, year, make, model, trim, retailPrice, wholesalePrice, hammerEstimate, spread, spreadPct, compCount, demandScore, verdict };
  });

  const totalUnits = results.length;
  const avgHammer = totalUnits > 0 ? Math.round(results.reduce((s, r) => s + r.hammerEstimate, 0) / totalUnits) : 0;
  const avgSpread = totalUnits > 0 ? Math.round(results.reduce((s, r) => s + r.spread, 0) / totalUnits) : 0;
  const avgSpreadPct = totalUnits > 0 ? Math.round(results.reduce((s, r) => s + r.spreadPct, 0) / totalUnits) : 0;

  return {
    results,
    summary: {
      totalUnits,
      avgHammer,
      avgSpread,
      avgSpreadPct,
      buyCount: results.filter((r) => r.verdict === "BUY").length,
      cautionCount: results.filter((r) => r.verdict === "CAUTION").length,
      passCount: results.filter((r) => r.verdict === "PASS").length,
      totalEstimatedRevenue: results.reduce((s, r) => s + r.hammerEstimate, 0),
    },
  };
}

async function _callTool(args: { vins: string[]; zip: string }): Promise<RunListData | null> {
  const auth = _getAuth();
  if (auth.value) {
    try {
      return await _fetchDirect(args.vins, args.zip);
    } catch (e) {
      console.warn("Direct API failed:", e);
    }
  }
  return null;
}

// ── Mock Data ──────────────────────────────────────────────────────────

function getMockData(vins?: string[]): RunListData {
  const mockResults: VinResult[] = [
    { vin: "KNDCB3LC9L5359658", year: 2020, make: "Kia", model: "Forte", trim: "LXS", retailPrice: 18900, wholesalePrice: 15200, hammerEstimate: 17388, spread: 2188, spreadPct: 14, compCount: 42, demandScore: 72, verdict: "BUY" },
    { vin: "1HGCV1F34LA000001", year: 2020, make: "Honda", model: "Civic", trim: "EX", retailPrice: 23400, wholesalePrice: 19100, hammerEstimate: 21528, spread: 2428, spreadPct: 13, compCount: 56, demandScore: 85, verdict: "BUY" },
    { vin: "5YJSA1E26MF000001", year: 2021, make: "Tesla", model: "Model S", trim: "Long Range", retailPrice: 68500, wholesalePrice: 58200, hammerEstimate: 63020, spread: 4820, spreadPct: 8, compCount: 12, demandScore: 65, verdict: "CAUTION" },
    { vin: "1FTFW1E85MFA00001", year: 2021, make: "Ford", model: "F-150", trim: "XLT", retailPrice: 42800, wholesalePrice: 35600, hammerEstimate: 39376, spread: 3776, spreadPct: 11, compCount: 48, demandScore: 88, verdict: "BUY" },
    { vin: "3N1AB8CV7NY456789", year: 2022, make: "Nissan", model: "Sentra", trim: "SV", retailPrice: 19200, wholesalePrice: 17800, hammerEstimate: 17664, spread: -136, spreadPct: -1, compCount: 61, demandScore: 35, verdict: "PASS" },
    { vin: "WBA53BH06NCK34567", year: 2022, make: "BMW", model: "530i", trim: "xDrive", retailPrice: 44600, wholesalePrice: 37200, hammerEstimate: 41032, spread: 3832, spreadPct: 10, compCount: 18, demandScore: 55, verdict: "CAUTION" },
    { vin: "1C4RJXF65NC567890", year: 2022, make: "Jeep", model: "Grand Cherokee", trim: "Limited", retailPrice: 45200, wholesalePrice: 37800, hammerEstimate: 41584, spread: 3784, spreadPct: 10, compCount: 29, demandScore: 74, verdict: "BUY" },
    { vin: "2T1BURHE0KC890123", year: 2022, make: "Toyota", model: "Corolla", trim: "SE", retailPrice: 22600, wholesalePrice: 19400, hammerEstimate: 20792, spread: 1392, spreadPct: 7, compCount: 53, demandScore: 78, verdict: "CAUTION" },
  ];

  let results: VinResult[];
  if (vins && vins.length > 0) {
    results = vins.map((vin) => {
      const found = mockResults.find((m) => m.vin === vin.trim().toUpperCase());
      if (found) return found;
      // Generate random for unknown VINs
      const retailPrice = 15000 + Math.floor(Math.random() * 45000);
      const wholesalePrice = Math.round(retailPrice * (0.78 + Math.random() * 0.08));
      const hammerEstimate = Math.round(retailPrice * HAMMER_FACTOR);
      const spread = hammerEstimate - wholesalePrice;
      const spreadPct = Math.round((spread / wholesalePrice) * 100);
      const compCount = 5 + Math.floor(Math.random() * 55);
      const demandScore = 20 + Math.floor(Math.random() * 70);
      return {
        vin: vin.trim().toUpperCase(),
        year: 2019 + Math.floor(Math.random() * 5),
        make: "Unknown", model: "Decoded Model", trim: "",
        retailPrice, wholesalePrice, hammerEstimate, spread, spreadPct, compCount, demandScore,
        verdict: computeVerdict(demandScore, spreadPct),
      };
    });
  } else {
    results = mockResults;
  }

  const totalUnits = results.length;
  const avgHammer = Math.round(results.reduce((s, r) => s + r.hammerEstimate, 0) / totalUnits);
  const avgSpread = Math.round(results.reduce((s, r) => s + r.spread, 0) / totalUnits);
  const avgSpreadPct = Math.round(results.reduce((s, r) => s + r.spreadPct, 0) / totalUnits);

  return {
    results,
    summary: {
      totalUnits,
      avgHammer,
      avgSpread,
      avgSpreadPct,
      buyCount: results.filter((r) => r.verdict === "BUY").length,
      cautionCount: results.filter((r) => r.verdict === "CAUTION").length,
      passCount: results.filter((r) => r.verdict === "PASS").length,
      totalEstimatedRevenue: results.reduce((s, r) => s + r.hammerEstimate, 0),
    },
  };
}

// ── Settings Bar ───────────────────────────────────────────────────────

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
      input, select, button, textarea { font-size: 14px !important; }
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
      input, select, textarea { max-width: 100% !important; width: 100% !important; box-sizing: border-box !important; }
    }
  `;
  document.head.appendChild(s);
})();

// ── Formatting Helpers ─────────────────────────────────────────────────

function fmtDollar(n: number): string {
  if (n < 0) return "-$" + Math.abs(n).toLocaleString("en-US");
  return "$" + n.toLocaleString("en-US");
}

function fmtPct(n: number): string {
  return n + "%";
}

function verdictBadge(verdict: "BUY" | "CAUTION" | "PASS"): string {
  const colors: Record<string, { bg: string; text: string }> = {
    BUY: { bg: "#166534", text: "#86efac" },
    CAUTION: { bg: "#854d0e", text: "#fde68a" },
    PASS: { bg: "#991b1b", text: "#fca5a5" },
  };
  const c = colors[verdict];
  return `<span style="display:inline-block;padding:3px 12px;border-radius:9999px;font-size:11px;font-weight:700;letter-spacing:0.5px;background:${c.bg};color:${c.text}">${verdict}</span>`;
}

// ── Canvas: Sell-Through Gauge ─────────────────────────────────────────

function drawSellThroughGauge(canvas: HTMLCanvasElement, buyPct: number, cautionPct: number, passPct: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const cx = w / 2;
  const cy = h - 20;
  const radius = Math.min(cx - 10, cy - 10);
  const lineWidth = 24;

  // Background arc
  ctx.beginPath();
  ctx.arc(cx, cy, radius, Math.PI, 0);
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  // Segments: BUY (green), CAUTION (yellow), PASS (red)
  const total = buyPct + cautionPct + passPct;
  if (total > 0) {
    const segments = [
      { pct: buyPct, color: "#22c55e" },
      { pct: cautionPct, color: "#eab308" },
      { pct: passPct, color: "#ef4444" },
    ];
    let startAngle = Math.PI;
    for (const seg of segments) {
      if (seg.pct <= 0) continue;
      const sweep = (seg.pct / total) * Math.PI;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, startAngle + sweep);
      ctx.strokeStyle = seg.color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "butt";
      ctx.stroke();
      startAngle += sweep;
    }
  }

  // Center text
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "bold 28px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(Math.round(buyPct) + "%", cx, cy - 14);
  ctx.fillStyle = "#64748b";
  ctx.font = "12px -apple-system, sans-serif";
  ctx.fillText("Sell-Through", cx, cy + 2);
}

// ── Canvas: Demand Bar Chart ───────────────────────────────────────────

function drawDemandChart(canvas: HTMLCanvasElement, results: VinResult[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const padding = { top: 10, right: 16, bottom: 40, left: 50 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  // Sort by demand score descending
  const sorted = [...results].sort((a, b) => b.demandScore - a.demandScore);
  const barCount = sorted.length;
  if (barCount === 0) return;
  const barW = Math.min(40, (chartW - (barCount - 1) * 4) / barCount);
  const gap = 4;
  const totalBarsW = barCount * barW + (barCount - 1) * gap;
  const offsetX = padding.left + (chartW - totalBarsW) / 2;

  // Y axis
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartH);
  ctx.lineTo(w - padding.right, padding.top + chartH);
  ctx.stroke();

  // Y labels
  ctx.fillStyle = "#64748b";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const val = i * 25;
    const y = padding.top + chartH - (val / 100) * chartH;
    ctx.fillText(String(val), padding.left - 6, y + 3);
    if (i > 0) {
      ctx.strokeStyle = "#1e293b";
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
    }
  }

  // Bars
  sorted.forEach((r, i) => {
    const x = offsetX + i * (barW + gap);
    const barH = (r.demandScore / 100) * chartH;
    const y = padding.top + chartH - barH;

    const color = r.verdict === "BUY" ? "#22c55e" : r.verdict === "CAUTION" ? "#eab308" : "#ef4444";
    ctx.fillStyle = color;
    ctx.fillRect(x, y, barW, barH);

    // Label
    ctx.fillStyle = "#94a3b8";
    ctx.font = "9px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.save();
    ctx.translate(x + barW / 2, padding.top + chartH + 6);
    ctx.rotate(Math.PI / 4);
    const label = r.make.substring(0, 3).toUpperCase();
    ctx.fillText(label, 0, 0);
    ctx.restore();
  });
}

// ── Render: Summary Cards ──────────────────────────────────────────────

function renderSummary(summary: RunListData["summary"]): string {
  const cards = [
    { label: "Total Units", value: String(summary.totalUnits), color: "#93c5fd" },
    { label: "Avg Hammer", value: fmtDollar(summary.avgHammer), color: "#93c5fd" },
    { label: "Avg Spread", value: fmtDollar(summary.avgSpread), color: summary.avgSpread >= 0 ? "#86efac" : "#fca5a5" },
    { label: "Est. Revenue", value: fmtDollar(summary.totalEstimatedRevenue), color: "#c4b5fd" },
    { label: "BUY", value: String(summary.buyCount), color: "#86efac" },
    { label: "CAUTION", value: String(summary.cautionCount), color: "#fde68a" },
    { label: "PASS", value: String(summary.passCount), color: "#fca5a5" },
  ];

  return `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:12px;margin-bottom:24px;">
    ${cards.map((c) => `
      <div style="background:#1e293b;border-radius:10px;border:1px solid #334155;padding:14px 12px;text-align:center;">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${c.label}</div>
        <div style="font-size:20px;font-weight:800;color:${c.color};">${c.value}</div>
      </div>
    `).join("")}
  </div>`;
}

// ── Render: Run List Table (Sortable) ──────────────────────────────────

type SortKey = "vin" | "vehicle" | "retailPrice" | "wholesalePrice" | "hammerEstimate" | "spread" | "compCount" | "demandScore" | "verdict";
let _sortKey: SortKey = "hammerEstimate";
let _sortAsc = false;
let _lastResults: VinResult[] = [];

function sortResults(results: VinResult[], key: SortKey, asc: boolean): VinResult[] {
  return [...results].sort((a, b) => {
    let va: any, vb: any;
    switch (key) {
      case "vin": va = a.vin; vb = b.vin; break;
      case "vehicle": va = `${a.year} ${a.make} ${a.model}`; vb = `${b.year} ${b.make} ${b.model}`; break;
      case "retailPrice": va = a.retailPrice; vb = b.retailPrice; break;
      case "wholesalePrice": va = a.wholesalePrice; vb = b.wholesalePrice; break;
      case "hammerEstimate": va = a.hammerEstimate; vb = b.hammerEstimate; break;
      case "spread": va = a.spread; vb = b.spread; break;
      case "compCount": va = a.compCount; vb = b.compCount; break;
      case "demandScore": va = a.demandScore; vb = b.demandScore; break;
      case "verdict": { const order = { BUY: 0, CAUTION: 1, PASS: 2 }; va = order[a.verdict]; vb = order[b.verdict]; break; }
    }
    if (typeof va === "string") return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    return asc ? va - vb : vb - va;
  });
}

function renderRunListTable(results: VinResult[]): string {
  _lastResults = results;
  const sorted = sortResults(results, _sortKey, _sortAsc);

  const arrow = (key: SortKey) => _sortKey === key ? (_sortAsc ? " &#9650;" : " &#9660;") : "";
  const thBase = `padding:10px 12px;font-weight:600;color:#94a3b8;border-bottom:2px solid #334155;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;cursor:pointer;user-select:none;white-space:nowrap`;
  const thLeft = `${thBase};text-align:left`;
  const thRight = `${thBase};text-align:right`;
  const activeColor = (key: SortKey) => _sortKey === key ? "color:#e2e8f0;" : "";

  const headers = `<tr>
    <th data-sort="vin" style="${thLeft};${activeColor("vin")}">VIN${arrow("vin")}</th>
    <th data-sort="vehicle" style="${thLeft};${activeColor("vehicle")}">Vehicle${arrow("vehicle")}</th>
    <th data-sort="retailPrice" style="${thRight};${activeColor("retailPrice")}">Retail${arrow("retailPrice")}</th>
    <th data-sort="wholesalePrice" style="${thRight};${activeColor("wholesalePrice")}">Wholesale${arrow("wholesalePrice")}</th>
    <th data-sort="hammerEstimate" style="${thRight};${activeColor("hammerEstimate")}">Hammer Est.${arrow("hammerEstimate")}</th>
    <th data-sort="spread" style="${thRight};${activeColor("spread")}">Spread${arrow("spread")}</th>
    <th data-sort="compCount" style="${thRight};${activeColor("compCount")}">Comps${arrow("compCount")}</th>
    <th data-sort="demandScore" style="${thRight};${activeColor("demandScore")}">Demand${arrow("demandScore")}</th>
    <th data-sort="verdict" style="${thBase};text-align:center;${activeColor("verdict")}">Verdict${arrow("verdict")}</th>
  </tr>`;

  let rows = "";
  for (const r of sorted) {
    const cellStyle = `padding:9px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:13px`;
    const cellRight = `${cellStyle};text-align:right`;
    const spreadColor = r.spread >= 0 ? "#86efac" : "#fca5a5";
    const demandColor = r.demandScore >= 70 ? "#86efac" : r.demandScore >= 40 ? "#fde68a" : "#fca5a5";

    rows += `<tr>
      <td style="${cellStyle};font-family:monospace;font-size:11px;color:#94a3b8;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.vin}</td>
      <td style="${cellStyle};font-weight:600;">${r.year} ${r.make} ${r.model}${r.trim ? " " + r.trim : ""}</td>
      <td style="${cellRight}">${fmtDollar(r.retailPrice)}</td>
      <td style="${cellRight}">${fmtDollar(r.wholesalePrice)}</td>
      <td style="${cellRight};font-weight:700;color:#93c5fd">${fmtDollar(r.hammerEstimate)}</td>
      <td style="${cellRight};font-weight:700;color:${spreadColor}">${fmtDollar(r.spread)} (${fmtPct(r.spreadPct)})</td>
      <td style="${cellRight}">${r.compCount}</td>
      <td style="${cellRight};font-weight:700;color:${demandColor}">${r.demandScore}</td>
      <td style="${cellStyle};text-align:center">${verdictBadge(r.verdict)}</td>
    </tr>`;
  }

  // Summary row
  const totalHammer = results.reduce((s, r) => s + r.hammerEstimate, 0);
  const avgSpread = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.spread, 0) / results.length) : 0;
  const summaryStyle = `padding:10px 12px;border-top:2px solid #334155;color:#e2e8f0;font-size:13px;font-weight:700;background:#1a2538`;
  const summaryRight = `${summaryStyle};text-align:right`;

  rows += `<tr>
    <td style="${summaryStyle}" colspan="2">TOTAL / AVG</td>
    <td style="${summaryRight}"></td>
    <td style="${summaryRight}"></td>
    <td style="${summaryRight};color:#93c5fd">${fmtDollar(totalHammer)}</td>
    <td style="${summaryRight}">${fmtDollar(avgSpread)} avg</td>
    <td style="${summaryRight}"></td>
    <td style="${summaryRight}"></td>
    <td style="${summaryStyle}"></td>
  </tr>`;

  return `
    <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden;margin-bottom:24px;">
      <div style="padding:14px 16px;border-bottom:1px solid #334155;">
        <h2 style="font-size:18px;font-weight:700;color:#e2e8f0;margin-bottom:2px;">Run List Analysis</h2>
        <p style="font-size:12px;color:#64748b;">Per-VIN pricing, spread analysis, and sell-through verdicts — click column headers to sort</p>
      </div>
      <div style="overflow-x:auto;">
        <table id="runlist-table" style="width:100%;border-collapse:collapse;">
          <thead>${headers}</thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const root = document.createElement("div");
  root.id = "app-root";
  root.style.cssText = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:24px;";
  document.body.style.background = "#0f172a";
  document.body.style.margin = "0";
  document.body.appendChild(root);

  // ── Demo banner ──
  if (_detectAppMode() === "demo") {
    const _db = document.createElement("div");
    _db.id = "_demo_banner";
    _db.style.cssText = "background:linear-gradient(135deg,#92400e22,#f59e0b11);border:1px solid #f59e0b44;border-radius:10px;padding:14px 20px;margin-bottom:12px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;";
    _db.innerHTML = `
      <div style="flex:1;min-width:200px;">
        <div style="font-size:13px;font-weight:700;color:#fbbf24;margin-bottom:2px;">&#9888; Demo Mode — Showing sample data</div>
        <div style="font-size:12px;color:#d97706;">Enter your MarketCheck API key for real data. <a href="https://developers.marketcheck.com" target="_blank" style="color:#fbbf24;text-decoration:underline;">Get a free key</a></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <input id="_banner_key" type="text" placeholder="Paste your API key" style="padding:8px 12px;border-radius:6px;border:1px solid #f59e0b44;background:#0f172a;color:#e2e8f0;font-size:13px;width:220px;outline:none;" />
        <button id="_banner_save" style="padding:8px 16px;border-radius:6px;border:none;background:#f59e0b;color:#0f172a;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">Activate</button>
      </div>`;
    document.body.insertBefore(_db, document.body.firstChild);
    _db.querySelector("#_banner_save")!.addEventListener("click", () => {
      const k = (_db.querySelector("#_banner_key") as HTMLInputElement).value.trim();
      if (!k) return;
      localStorage.setItem("mc_api_key", k);
      _db.style.background = "linear-gradient(135deg,#05966922,#10b98111)";
      _db.style.borderColor = "#10b98144";
      _db.innerHTML = '<div style="font-size:13px;font-weight:700;color:#10b981;">&#10003; API key saved — reloading with live data...</div>';
      setTimeout(() => location.reload(), 800);
    });
    _db.querySelector("#_banner_key")!.addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Enter") (_db.querySelector("#_banner_save") as HTMLButtonElement).click(); });
  }

  const urlParams = _getUrlParams();

  const _demoVins = "KNDCB3LC9L5359658\n1HGCV1F34LA000001\n5YJSA1E26MF000001\n1FTFW1E85MFA00001\n3N1AB8CV7NY456789\nWBA53BH06NCK34567\n1C4RJXF65NC567890\n2T1BURHE0KC890123";

  // Render input form + initial state
  function renderApp(data: RunListData | null) {
    const vinsValue = urlParams.vins
      ? urlParams.vins.split(",").join("\n")
      : data ? data.results.map((r) => r.vin).join("\n")
      : _detectAppMode() === "demo" ? _demoVins : "";
    const zipValue = urlParams.zip ?? "90210";

    root.innerHTML = `
      <div style="max-width:1400px;margin:0 auto;">
        <!-- Header -->
        <div id="app-header" style="margin-bottom:24px;display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            <h1 style="font-size:26px;font-weight:800;color:#e2e8f0;margin-bottom:4px;">Auction Run List Analyzer</h1>
            <p style="font-size:13px;color:#64748b;">Pre-sale VIN evaluation with hammer price predictions and sell-through verdicts</p>
          </div>
        </div>

        <!-- Input Form -->
        <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;padding:20px;margin-bottom:24px;">
          <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;">
            <div style="flex:1;min-width:300px;">
              <label style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">VINs (one per line, up to 15)</label>
              <textarea id="vin-input" placeholder="Paste VINs here, one per line...&#10;e.g.&#10;KNDCB3LC9L5359658&#10;1HGCV1F34LA000001&#10;5YJSA1E26MF000001&#10;1FTFW1E85MFA00001" style="width:100%;min-height:140px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:8px;padding:12px;font-family:monospace;font-size:13px;resize:vertical;outline:none;box-sizing:border-box;">${vinsValue}</textarea>
            </div>
            <div style="min-width:160px;">
              <label style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Auction ZIP</label>
              <input id="zip-input" type="text" placeholder="e.g. 90210" value="${zipValue}" style="width:100%;padding:10px 12px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;" />
              <button id="analyze-btn" style="width:100%;margin-top:12px;background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;transition:background 0.15s;">Analyze Run List</button>
              <div id="analyze-status" style="font-size:12px;color:#64748b;margin-top:8px;text-align:center;"></div>
            </div>
          </div>
        </div>

        <!-- Results -->
        <div id="results-container">
          ${data ? renderResults(data) : '<div style="text-align:center;padding:60px 20px;color:#475569;">Enter VINs above and click Analyze to evaluate the run list.</div>'}
        </div>
      </div>`;

    _addSettingsBar(document.getElementById("app-header") as HTMLElement);

    // Wire analyze button
    const analyzeBtn = document.getElementById("analyze-btn") as HTMLButtonElement;
    const vinInput = document.getElementById("vin-input") as HTMLTextAreaElement;
    const zipInput = document.getElementById("zip-input") as HTMLInputElement;
    const status = document.getElementById("analyze-status") as HTMLElement;

    analyzeBtn.addEventListener("click", async () => {
      const raw = vinInput.value;
      const vins = raw.split("\n").map((v) => v.trim()).filter((v) => v.length >= 11).slice(0, 15);
      const zip = zipInput.value.trim() || "90210";

      if (vins.length === 0) {
        status.textContent = "Please enter at least one valid VIN.";
        status.style.color = "#fbbf24";
        return;
      }

      status.textContent = `Analyzing ${vins.length} VIN${vins.length > 1 ? "s" : ""}...`;
      status.style.color = "#64748b";
      analyzeBtn.disabled = true;
      analyzeBtn.style.opacity = "0.6";

      let result: RunListData;
      if (_detectAppMode() === "demo") {
        result = getMockData(vins);
      } else {
        const liveResult = await _callTool({ vins, zip });
        result = liveResult ?? getMockData(vins);
      }

      // Re-render preserving input
      const savedVins = vinInput.value;
      const savedZip = zipInput.value;
      renderApp(result);
      (document.getElementById("vin-input") as HTMLTextAreaElement).value = savedVins;
      (document.getElementById("zip-input") as HTMLInputElement).value = savedZip;
      drawCanvases(result);
      wireSortHandlers();
    });
  }

  function drawCanvases(data: RunListData) {
    requestAnimationFrame(() => {
      const gaugeCanvas = document.getElementById("gauge-canvas") as HTMLCanvasElement;
      const demandCanvas = document.getElementById("demand-canvas") as HTMLCanvasElement;
      const { summary, results } = data;
      const buyPct = summary.totalUnits > 0 ? Math.round((summary.buyCount / summary.totalUnits) * 100) : 0;
      const cautionPct = summary.totalUnits > 0 ? Math.round((summary.cautionCount / summary.totalUnits) * 100) : 0;
      const passPct = summary.totalUnits > 0 ? Math.round((summary.passCount / summary.totalUnits) * 100) : 0;
      if (gaugeCanvas) drawSellThroughGauge(gaugeCanvas, buyPct, cautionPct, passPct);
      if (demandCanvas) drawDemandChart(demandCanvas, results);
    });
  }

  function wireSortHandlers() {
    const table = document.getElementById("runlist-table");
    if (!table) return;
    table.querySelectorAll("th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = (th as HTMLElement).dataset.sort as SortKey;
        if (_sortKey === key) { _sortAsc = !_sortAsc; } else { _sortKey = key; _sortAsc = true; }
        // Re-render just the table in place
        const wrapper = table.closest("div[style*='margin-bottom:24px']");
        if (wrapper) {
          wrapper.outerHTML = renderRunListTable(_lastResults);
          wireSortHandlers();
        }
      });
    });
  }

  function renderResults(data: RunListData): string {
    const { results, summary } = data;
    const buyPct = summary.totalUnits > 0 ? Math.round((summary.buyCount / summary.totalUnits) * 100) : 0;
    const cautionPct = summary.totalUnits > 0 ? Math.round((summary.cautionCount / summary.totalUnits) * 100) : 0;
    const passPct = summary.totalUnits > 0 ? Math.round((summary.passCount / summary.totalUnits) * 100) : 0;

    return `
      ${renderSummary(summary)}

      <!-- Charts Row -->
      <div style="display:flex;gap:20px;margin-bottom:24px;flex-wrap:wrap;">
        <div style="flex:1;min-width:280px;background:#1e293b;border-radius:12px;border:1px solid #334155;padding:16px;">
          <h3 style="font-size:14px;font-weight:700;color:#e2e8f0;margin-bottom:12px;">Sell-Through Probability</h3>
          <canvas id="gauge-canvas" style="width:100%;height:180px;"></canvas>
          <div style="display:flex;justify-content:center;gap:16px;margin-top:8px;font-size:11px;">
            <span style="color:#22c55e;">&#9679; BUY ${buyPct}%</span>
            <span style="color:#eab308;">&#9679; CAUTION ${cautionPct}%</span>
            <span style="color:#ef4444;">&#9679; PASS ${passPct}%</span>
          </div>
        </div>
        <div style="flex:2;min-width:400px;background:#1e293b;border-radius:12px;border:1px solid #334155;padding:16px;">
          <h3 style="font-size:14px;font-weight:700;color:#e2e8f0;margin-bottom:12px;">Demand Score by Vehicle</h3>
          <canvas id="demand-canvas" style="width:100%;height:200px;"></canvas>
        </div>
      </div>

      ${renderRunListTable(results)}
    `;
  }

  // Auto-analyze if URL params provided
  if (urlParams.vins) {
    const vins = urlParams.vins.split(",").map((v) => v.trim()).filter((v) => v.length >= 11).slice(0, 15);
    const zip = urlParams.zip ?? "90210";
    if (vins.length > 0) {
      root.innerHTML = `<div style="text-align:center;padding:80px 20px;">
        <div style="font-size:24px;font-weight:700;color:#e2e8f0;margin-bottom:12px;">Auction Run List Analyzer</div>
        <div style="color:#64748b;">Analyzing ${vins.length} VIN${vins.length > 1 ? "s" : ""}...</div>
      </div>`;
      const liveResult = await _callTool({ vins, zip });
      const data = liveResult ?? getMockData(vins);
      renderApp(data);
      drawCanvases(data);
      wireSortHandlers();
      return;
    }
  }

  // Default: show empty form (both demo and live wait for user to click Analyze)
  renderApp(null);
}

main();
