/**
 * Incentive-Adjusted Deal Evaluator
 * Combines deal evaluation with OEM incentives -- true out-of-pocket cost after rebates.
 */
import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "incentive-adjusted-deal-eval" }); } catch {}

function _getAuth(): { mode: "api_key" | "oauth_token" | null; value: string | null } {
  const params = new URLSearchParams(location.search);
  const token = params.get("access_token") ?? localStorage.getItem("mc_access_token");
  if (token) return { mode: "oauth_token", value: token };
  const key = params.get("api_key") ?? localStorage.getItem("mc_api_key");
  if (key) return { mode: "api_key", value: key };
  return { mode: null, value: null };
}
function _detectAppMode(): "mcp" | "live" | "demo" {
  // Auth (URL or localStorage) takes priority — standalone live mode
  if (_getAuth().value) return "live";
  // Only use MCP mode when no auth AND actually iframed into an MCP host.
  // Without the window.parent guard, a top-level page with no key would still
  // try MCP (the SDK constructs successfully) and hang on a never-resolving
  // postMessage — leaving the demo banner suppressed and the UI stuck.
  if (_safeApp && window.parent !== window) return "mcp";
  return "demo";
}
function _isEmbedMode(): boolean { return new URLSearchParams(location.search).has("embed"); }
function _getUrlParams(): Record<string, string> {
  const params = new URLSearchParams(location.search);
  const result: Record<string, string> = {};
  for (const key of ["vin", "zip", "make", "model", "miles", "state", "dealer_id", "ticker", "askingPrice"]) {
    const v = params.get(key);
    if (v) result[key] = v;
  }
  return result;
}
function _proxyBase(): string { return location.protocol.startsWith("http") ? "" : "http://localhost:3001"; }

// ── Direct MarketCheck API Client (browser → api.marketcheck.com) ──────
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
  if (!res.ok) {
    // Capture response body prefix — blank status-code errors waste hours during live debugging
    let body = "";
    try { body = (await res.text()).slice(0, 200); } catch {}
    throw new Error(`MC API ${res.status} ${path} ${body}`);
  }
  return res.json();
}
function _mcDecode(vin: string) { return _mcApi("/decode/car/neovin/" + vin + "/specs"); }
function _mcPredict(p: Record<string, any>) { return _mcApi("/predict/car/us/marketcheck_price/comparables", p); }
function _mcActive(p: Record<string, any>) { return _mcApi("/search/car/active", p); }
function _mcIncentives(p: Record<string, any>) {
  const q: Record<string, any> = { ...p };
  if (q.oem && !q.make) { q.make = q.oem; delete q.oem; }
  // Incentive data is at MSA/state level — ZIP yields 0 results, so strip it.
  // Matches server-side handleIncentives behavior in packages/server/src/proxy.ts.
  delete q.zip;
  if (!q.rows) q.rows = 50;
  return _mcApi("/search/car/incentive/oem", q);
}

async function _fetchDirect(args: Record<string, any>) {
  const decode = await _mcDecode(args.vin);
  // Whitelist predict params — spreading `args` forwards client-only fields like
  // askingPrice that /predict rejects with 400.
  const predictParams = {
    vin: args.vin,
    zip: args.zip,
    miles: args.miles,
    dealer_type: "franchise",
  };
  const [prediction, rawIncentives, activeComps] = await Promise.all([
    _mcPredict(predictParams),
    _mcIncentives({ oem: decode?.make, model: decode?.model }),
    _mcActive({ make: decode?.make, model: decode?.model, zip: args.zip, radius: 75, rows: 5, stats: "price" }),
  ]);
  return { decode, prediction, rawIncentives, activeComps };
}

// Transform raw MarketCheck API responses into the EvalResult shape the renderer expects.
// Handles BOTH input shapes so we can skip a branch in _callTool:
//   - Proxy (dev) returns { decode, prediction, incentives: [...pre-flattened], activeComps }
//     where each incentive already has { offerType, amount, expirationDate } from
//     server-side transformIncentiveListings (see packages/server/src/proxy.ts).
//   - Direct API (prod) returns { decode, prediction, rawIncentives: {listings:[{offer:{...}}]}, activeComps }
//     — the raw /search/car/incentive/oem payload, needing the same flattening client-side.
function _transformToEvalResult(raw: any, args: Record<string, any>): EvalResult {
  const decode = raw?.decode ?? {};
  const prediction = raw?.prediction ?? {};
  const activeComps = raw?.activeComps ?? {};

  const stickerPrice = Number(decode.msrp ?? prediction.price_range_high ?? 0) || 33000;
  const predictedFMV = Number(prediction.predicted_price ?? prediction.price ?? stickerPrice) || stickerPrice;
  const askingPrice = Number(args.askingPrice ?? args.asking_price ?? predictedFMV) || predictedFMV;

  // Normalize incentives: accept proxy-pre-flattened array OR raw API listings shape
  const typeMap: Record<string, Incentive["type"]> = { cash: "cashback", finance: "apr", lease: "lease" };
  let incentives: Incentive[] = [];
  if (Array.isArray(raw?.incentives)) {
    // Proxy path: already flattened by server-side transformIncentiveListings
    incentives = raw.incentives.slice(0, 8).map((i: any) => {
      const type = (i.offerType as Incentive["type"]) ?? typeMap[i.offer_type] ?? "cashback";
      const value = Number(i.amount ?? 0);
      return {
        type,
        title: String(i.title ?? `${decode.make ?? ""} offer`).slice(0, 80),
        description: String(i.description ?? "").slice(0, 200),
        value,
        term: Number(i.term) || undefined,
        monthlyPayment: type === "lease" ? value : undefined,
        expiration: String(i.expirationDate ?? ""),
      };
    }).filter((i: Incentive) => i.value > 0);
  } else {
    // Direct API path: raw { listings: [{ offer: {...} }] }
    const listings = Array.isArray(raw?.rawIncentives?.listings) ? raw.rawIncentives.listings : [];
    incentives = listings.slice(0, 8).map((listing: any) => {
      const o = listing?.offer ?? {};
      const amt = (o.amounts ?? [])[0] ?? {};
      const type = typeMap[o.offer_type] ?? "cashback";
      const value = type === "cashback" ? Number(o.cashback_amount ?? 0)
        : type === "apr" ? Number(amt.apr ?? 0)
        : Number(amt.monthly ?? 0);
      return {
        type,
        title: (o.titles?.[0] || o.oem_program_name || `${decode.make ?? ""} offer`).slice(0, 80),
        description: (o.offers?.[0] || o.disclaimers?.[0] || "").slice(0, 200),
        value,
        term: Number(amt.term) || undefined,
        monthlyPayment: type === "lease" ? value : undefined,
        expiration: o.valid_through || "",
      };
    }).filter((i: Incentive) => i.value > 0);
  }

  const totalIncentiveSavings = incentives.filter(i => i.type === "cashback").reduce((s, i) => s + i.value, 0);
  const bestApr = incentives.find(i => i.type === "apr");
  const incentiveAdjustedCost = Math.max(0, askingPrice - totalIncentiveSavings);

  // Build buy paths: cashback route vs low-APR route vs lease (if offered)
  const standardApr = 5.9;
  const calcMonthly = (principal: number, annualRate: number, months: number) => {
    if (annualRate <= 0) return Math.round(principal / months);
    const r = annualRate / 12;
    return Math.round(principal * (r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1));
  };
  const loan = Math.max(0, askingPrice - totalIncentiveSavings);
  const cashMonthly = calcMonthly(loan, standardApr / 100, 60);
  const cashTotal = cashMonthly * 60;
  const aprRate = bestApr?.value ?? standardApr;
  const aprMonthly = calcMonthly(askingPrice, aprRate / 100, bestApr?.term ?? 60);
  const aprTotal = aprMonthly * (bestApr?.term ?? 60);
  const preferAPR = bestApr && aprTotal < cashTotal;
  const buyPaths: BuyPath[] = [
    {
      name: "Cash Back + Standard Financing",
      totalCost: cashTotal,
      monthlyCost: cashMonthly,
      totalSavings: totalIncentiveSavings,
      details: `${fmtCurrency(totalIncentiveSavings)} cash back applied. Finance ${fmtCurrency(loan)} at ${standardApr}% APR for 60 months.`,
      recommended: !preferAPR && totalIncentiveSavings > 0,
    },
  ];
  if (bestApr) {
    buyPaths.push({
      name: `Low APR Financing (${aprRate}%)`,
      totalCost: aprTotal,
      monthlyCost: aprMonthly,
      totalSavings: Math.max(0, cashTotal - aprTotal),
      details: `${aprRate}% APR for ${bestApr.term ?? 60} months on ${fmtCurrency(askingPrice)}. Total interest: ${fmtCurrency(Math.max(0, aprTotal - askingPrice))}.`,
      recommended: !!preferAPR,
    });
  }
  const leaseOffer = incentives.find(i => i.type === "lease");
  if (leaseOffer) {
    const termM = leaseOffer.term ?? 36;
    buyPaths.push({
      name: `Lease (${fmtCurrency(leaseOffer.value)}/mo)`,
      totalCost: leaseOffer.value * termM,
      monthlyCost: leaseOffer.value,
      totalSavings: 0,
      details: `${fmtCurrency(leaseOffer.value)}/mo for ${termM} months. No equity at end of term.`,
      recommended: false,
    });
  }

  // Comparables transform
  const compListings = Array.isArray(activeComps?.listings) ? activeComps.listings : [];
  const comparables: Comparable[] = compListings.slice(0, 5).map((l: any) => ({
    year: Number(l.build?.year ?? decode.year ?? 0),
    make: l.build?.make ?? decode.make ?? "",
    model: l.build?.model ?? decode.model ?? "",
    trim: l.build?.trim ?? "",
    price: Number(l.price ?? 0),
    miles: Number(l.miles ?? 0),
    city: l.dealer?.city ?? l.city ?? "",
    state: l.dealer?.state ?? l.state ?? "",
    dealerName: l.dealer?.name ?? l.dealer?.dealer_name ?? "",
  }));

  // Waterfall: MSRP → Dealer Discount → Asking → ML delta → each cashback → Final
  const waterfallSteps: EvalResult["waterfallSteps"] = [
    { label: "MSRP", value: stickerPrice, color: "#94a3b8" },
  ];
  const dealerDiscount = stickerPrice - askingPrice;
  if (Math.abs(dealerDiscount) > 1) {
    waterfallSteps.push({ label: "Dealer Discount", value: -dealerDiscount, color: "#3b82f6" });
  }
  waterfallSteps.push({ label: "Asking Price", value: askingPrice, color: "#f8fafc" });
  const fmvDelta = predictedFMV - askingPrice;
  if (Math.abs(fmvDelta) > 50) {
    waterfallSteps.push({ label: "ML Fair Value", value: fmvDelta, color: "#8b5cf6" });
  }
  for (const inc of incentives.filter(i => i.type === "cashback").slice(0, 3)) {
    waterfallSteps.push({ label: inc.title.slice(0, 18), value: -inc.value, color: "#10b981" });
  }
  waterfallSteps.push({ label: "Final Cost", value: incentiveAdjustedCost, color: "#10b981" });

  return {
    vehicle: {
      vin: decode.vin ?? args.vin ?? "",
      year: Number(decode.year ?? 0),
      make: decode.make ?? "",
      model: decode.model ?? "",
      trim: decode.trim ?? "",
      bodyType: decode.body_type ?? decode.bodyType ?? "",
      fuelType: decode.fuel_type ?? decode.fuelType ?? "",
      msrp: stickerPrice,
    },
    stickerPrice,
    askingPrice,
    predictedFMV,
    incentiveAdjustedCost,
    incentives,
    buyPaths,
    comparables,
    totalIncentiveSavings,
    waterfallSteps,
  };
}

async function _callTool(toolName: string, args: Record<string, any>) {
  const mode = _detectAppMode();
  const auth = _getAuth();
  if (auth.value) {
    // 1. Proxy (same-origin, reliable on localhost dev server). Returns raw
    // {decode, prediction, incentives, activeComps} — we still need the
    // transformer to produce EvalResult for the renderer.
    try {
      const r = await fetch((_proxyBase()) + "/api/proxy/" + toolName, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, _auth_mode: auth.mode, _auth_value: auth.value }),
      });
      if (r.ok) {
        const raw = await r.json();
        const transformed = _transformToEvalResult(raw, args);
        return { content: [{ type: "text", text: JSON.stringify(transformed) }] };
      }
    } catch (e) { console.warn("Proxy failed, trying direct API:", e); }
    // 2. Direct API fallback (production path — apps.marketcheck.com has no proxy)
    try {
      const raw = await _fetchDirect(args);
      if (raw) {
        const transformed = _transformToEvalResult(raw, args);
        return { content: [{ type: "text", text: JSON.stringify(transformed) }] };
      }
    } catch (e) { console.warn("Direct API failed:", e); }
  }
  // 3. MCP mode — only attempt when actually inside a host; otherwise the
  // postMessage to a non-existent parent never resolves and the UI hangs.
  if (mode === "mcp" && _safeApp) {
    try { return await _safeApp.callServerTool({ name: toolName, arguments: args }); } catch (e) { console.warn("MCP call failed:", e); }
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
(function injectResponsiveStyles() { const s = document.createElement("style"); s.textContent = `@media(max-width:768px){body{font-size:13px!important}table{font-size:12px!important}th,td{padding:6px 8px!important}h1{font-size:18px!important}h2{font-size:15px!important}canvas{max-width:100%!important}input,select,button{font-size:14px!important}[style*="display:flex"][style*="gap"],[style*="display: flex"][style*="gap"]{flex-wrap:wrap!important}[style*="grid-template-columns: repeat"]{grid-template-columns:1fr!important}[style*="grid-template-columns:repeat"]{grid-template-columns:1fr!important}div[style*="overflow-x:auto"],div[style*="overflow-x: auto"]{-webkit-overflow-scrolling:touch}table{min-width:600px}[style*="width:35%"],[style*="width:40%"],[style*="width:25%"],[style*="width:50%"],[style*="width:60%"],[style*="width:65%"],[style*="width: 35%"],[style*="width: 40%"],[style*="width: 25%"],[style*="width: 50%"],[style*="width: 60%"],[style*="width: 65%"]{width:100%!important;min-width:0!important}}@media(max-width:480px){body{padding:8px!important}h1{font-size:16px!important}th,td{padding:4px 6px!important;font-size:11px!important}input,select{max-width:100%!important;width:100%!important;box-sizing:border-box!important}}`; document.head.appendChild(s); })();


// ── Types ──────────────────────────────────────────────────────────────────────

interface Vehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  bodyType: string;
  fuelType: string;
  msrp: number;
}

interface Incentive {
  type: "cashback" | "apr" | "lease";
  title: string;
  description: string;
  value: number;
  term?: number;
  monthlyPayment?: number;
  expiration: string;
}

interface BuyPath {
  name: string;
  totalCost: number;
  monthlyCost: number;
  totalSavings: number;
  details: string;
  recommended: boolean;
}

interface Comparable {
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  miles: number;
  city: string;
  state: string;
  dealerName: string;
}

interface EvalResult {
  vehicle: Vehicle;
  stickerPrice: number;
  askingPrice: number;
  predictedFMV: number;
  incentiveAdjustedCost: number;
  incentives: Incentive[];
  buyPaths: BuyPath[];
  comparables: Comparable[];
  totalIncentiveSavings: number;
  waterfallSteps: { label: string; value: number; color: string }[];
}

// ── Mock Data ──────────────────────────────────────────────────────────────────

function getMockData(vin?: string, zip?: string, askingPrice?: number): EvalResult {
  const ap = askingPrice ?? 31500;
  return {
    vehicle: {
      vin: vin ?? "3GNAXKEV5RS123456",
      year: 2024,
      make: "Chevrolet",
      model: "Equinox",
      trim: "LT",
      bodyType: "SUV",
      fuelType: "Gasoline",
      msrp: 33000,
    },
    stickerPrice: 33000,
    askingPrice: ap,
    predictedFMV: 30800,
    incentiveAdjustedCost: 28800,
    incentives: [
      { type: "cashback", title: "Customer Cash", description: "Chevrolet Customer Cash allowance", value: 2000, expiration: "2026-04-30" },
      { type: "apr", title: "Low APR Financing", description: "1.9% APR for qualified buyers through GM Financial", value: 1.9, term: 60, expiration: "2026-04-30" },
      { type: "lease", title: "Lease Special", description: "Ultra-low lease with $2,999 due at signing", value: 299, term: 36, monthlyPayment: 299, expiration: "2026-04-30" },
      { type: "cashback", title: "Conquest Cash", description: "Bonus cash for owners of competitive brands", value: 500, expiration: "2026-04-30" },
      { type: "cashback", title: "First Responder Bonus", description: "Additional cash for first responders", value: 500, expiration: "2026-06-30" },
    ],
    buyPaths: [
      {
        name: "Cash Back + Standard Financing",
        totalCost: 29000,
        monthlyCost: 532,
        totalSavings: 4000,
        details: "$2,500 total cash back applied. Finance remainder at 5.9% APR for 60 months. Total interest: $2,920.",
        recommended: false,
      },
      {
        name: "Low APR Financing (No Cash Back)",
        totalCost: 28300,
        monthlyCost: 538,
        totalSavings: 4700,
        details: "1.9% APR for 60 months on $31,500. Total interest: $1,500. Saves $4,200 in interest vs standard rate.",
        recommended: true,
      },
      {
        name: "Lease ($299/mo)",
        totalCost: 13763,
        monthlyCost: 299,
        totalSavings: 0,
        details: "$299/mo for 36 months, $2,999 due at signing. Total lease cost: $13,763. No equity at end.",
        recommended: false,
      },
    ],
    comparables: [
      { year: 2024, make: "Chevrolet", model: "Equinox", trim: "LT", price: 30200, miles: 8400, city: "Naperville", state: "IL", dealerName: "Chevrolet of Naperville" },
      { year: 2024, make: "Chevrolet", model: "Equinox", trim: "LT", price: 31800, miles: 5200, city: "Schaumburg", state: "IL", dealerName: "Bill Kay Chevrolet" },
      { year: 2024, make: "Chevrolet", model: "Equinox", trim: "RS", price: 32400, miles: 3800, city: "Joliet", state: "IL", dealerName: "Hawk Chevrolet" },
      { year: 2023, make: "Chevrolet", model: "Equinox", trim: "LT", price: 27600, miles: 18200, city: "Aurora", state: "IL", dealerName: "Ron Westphal Chevrolet" },
      { year: 2024, make: "Chevrolet", model: "Equinox", trim: "LS", price: 28900, miles: 12100, city: "Elgin", state: "IL", dealerName: "Biggers Chevrolet" },
    ],
    totalIncentiveSavings: 2500,
    waterfallSteps: [
      { label: "MSRP", value: 33000, color: "#94a3b8" },
      { label: "Dealer Discount", value: -1500, color: "#3b82f6" },
      { label: "Asking Price", value: 31500, color: "#f8fafc" },
      { label: "ML Fair Value", value: -700, color: "#8b5cf6" },
      { label: "Customer Cash", value: -2000, color: "#10b981" },
      { label: "Conquest Cash", value: -500, color: "#10b981" },
      { label: "Final Cost", value: 28800, color: "#10b981" },
    ],
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtCurrency(v: number): string {
  return "$" + Math.round(v).toLocaleString();
}

// Sign-before-dollar formatting — avoids "$-1,200" bug class in signed deltas.
function fmtSigned(v: number): string {
  const sign = v < 0 ? "-" : "+";
  return sign + "$" + Math.abs(Math.round(v)).toLocaleString();
}

function fmtNumber(v: number): string {
  return Math.round(v).toLocaleString();
}

// ── Canvas: Waterfall Chart ─────────────────────────────────────────────────

function drawWaterfall(canvas: HTMLCanvasElement, steps: { label: string; value: number; color: string }[]) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  const padLeft = 70;
  const padRight = 30;
  const padTop = 20;
  const padBottom = 60;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  // We need to track cumulative values for the waterfall
  // Steps: MSRP (absolute), discounts (deltas), final (absolute)
  const maxVal = steps[0].value;
  const minVal = Math.min(...steps.filter(s => s.value > 0 && s.label !== "MSRP").map(s => s.value), steps[0].value);
  const rangeTop = maxVal * 1.05;
  const rangeBottom = Math.min(minVal, steps[steps.length - 1].value) * 0.90;
  const range = rangeTop - rangeBottom;

  const barCount = steps.length;
  const barWidth = chartW / barCount;
  const barGap = 12;

  // Y-axis scale helper
  function yPos(val: number): number {
    return padTop + ((rangeTop - val) / range) * chartH;
  }

  // Grid lines
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 0.5;
  const gridStep = Math.ceil(range / 6 / 1000) * 1000;
  for (let val = Math.floor(rangeBottom / 1000) * 1000; val <= rangeTop; val += gridStep) {
    const y = yPos(val);
    if (y >= padTop && y <= padTop + chartH) {
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();

      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px -apple-system, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(fmtCurrency(val), padLeft - 8, y);
    }
  }

  // Draw waterfall bars
  let runningValue = 0;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const x = padLeft + i * barWidth + barGap / 2;
    const bw = barWidth - barGap;

    let barTop: number, barBottom: number;
    if (i === 0 || step.label === "Asking Price" || step.label === "Final Cost") {
      // Absolute values -- bar from 0 (rangeBottom) to value
      barTop = yPos(step.value);
      barBottom = yPos(rangeBottom);
      runningValue = step.value;
    } else {
      // Delta values
      const prevValue = runningValue;
      runningValue = prevValue + step.value;
      barTop = yPos(Math.max(prevValue, runningValue));
      barBottom = yPos(Math.min(prevValue, runningValue));
    }

    // Draw the bar
    const barH = barBottom - barTop;
    ctx.fillStyle = step.color;
    if (step.value < 0 && i !== 0) {
      ctx.fillStyle = "#10b981";
    }

    const radius = 3;
    ctx.beginPath();
    ctx.moveTo(x + radius, barTop);
    ctx.lineTo(x + bw - radius, barTop);
    ctx.quadraticCurveTo(x + bw, barTop, x + bw, barTop + radius);
    ctx.lineTo(x + bw, barTop + barH);
    ctx.lineTo(x, barTop + barH);
    ctx.lineTo(x, barTop + radius);
    ctx.quadraticCurveTo(x, barTop, x + radius, barTop);
    ctx.fill();

    // Value label
    const labelValue = (i === 0 || step.label === "Asking Price" || step.label === "Final Cost")
      ? fmtCurrency(step.value)
      : (step.value < 0 ? "-" : "+") + fmtCurrency(Math.abs(step.value));
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 11px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(labelValue, x + bw / 2, barTop - 6);

    // Connector line to next bar
    if (i < steps.length - 1 && i !== 0 && steps[i + 1].label !== "Asking Price" && steps[i + 1].label !== "Final Cost") {
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      const nextX = padLeft + (i + 1) * barWidth + barGap / 2;
      ctx.moveTo(x + bw, yPos(runningValue));
      ctx.lineTo(nextX, yPos(runningValue));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // X-axis label
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.save();
    ctx.translate(x + bw / 2, padTop + chartH + 8);
    ctx.rotate(-0.35);
    ctx.fillText(step.label, 0, 0);
    ctx.restore();
  }

  // Axes
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padLeft, padTop);
  ctx.lineTo(padLeft, padTop + chartH);
  ctx.lineTo(w - padRight, padTop + chartH);
  ctx.stroke();
}

// ── Main App ───────────────────────────────────────────────────────────────────

async function main() {
  // Only connect to MCP host when we're actually iframed — otherwise the SDK
  // constructor succeeds but connect() posts to a non-existent parent window
  // and the UI hangs awaiting responses.
  const mode = _detectAppMode();
  if (mode === "mcp") { try { (_safeApp as any)?.connect?.(); } catch {} }
  const canCallServer = mode === "live" || mode === "mcp";

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

  // ── Header ──
  const header = document.createElement("div");
  header.style.cssText = "background:#1e293b;padding:16px 20px;border-radius:10px;margin-bottom:16px;border:1px solid #334155;display:flex;align-items:center;";
  header.innerHTML = `<div><h1 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#f8fafc;">Incentive-Adjusted Deal Evaluator</h1>
    <p style="margin:0;font-size:13px;color:#94a3b8;">True out-of-pocket cost after manufacturer rebates and financing incentives</p></div>`;
  container.appendChild(header);
  _addSettingsBar(header);

  // ── Input Form ──
  const inputPanel = document.createElement("div");
  inputPanel.style.cssText = "background:#1e293b;padding:16px 20px;border-radius:10px;margin-bottom:16px;border:1px solid #334155;display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;";

  function makeField(label: string, placeholder: string, opts?: { width?: string; type?: string; value?: string }): HTMLInputElement {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    wrap.innerHTML = `<label style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">${label}</label>`;
    const input = document.createElement("input");
    input.type = opts?.type ?? "text";
    input.placeholder = placeholder;
    if (opts?.value) input.value = opts.value;
    input.style.cssText = `padding:10px 14px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;outline:none;width:${opts?.width ?? "180px"};`;
    input.addEventListener("focus", () => { input.style.borderColor = "#3b82f6"; });
    input.addEventListener("blur", () => { input.style.borderColor = "#334155"; });
    wrap.appendChild(input);
    inputPanel.appendChild(wrap);
    return input;
  }

  const vinInput = makeField("VIN", "Enter 17-character VIN", { width: "240px", value: "KNDCB3LC9L5359658" });
  const zipInput = makeField("ZIP Code", "e.g. 60601", { width: "120px", value: "60601" });
  const priceInput = makeField("Asking Price (optional)", "$0", { width: "140px", type: "number" });
  // Mileage is required by /v2/predict/... — omitting it triggers 400s in live mode.
  const milesInput = makeField("Mileage (optional)", "e.g. 15000", { width: "140px", type: "number" });

  const evalBtn = document.createElement("button");
  evalBtn.textContent = "Evaluate Deal";
  evalBtn.style.cssText = "padding:10px 28px;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;border:none;background:#3b82f6;color:#fff;height:42px;align-self:flex-end;transition:background 0.15s;";
  evalBtn.addEventListener("mouseenter", () => { evalBtn.style.background = "#2563eb"; });
  evalBtn.addEventListener("mouseleave", () => { evalBtn.style.background = "#3b82f6"; });
  inputPanel.appendChild(evalBtn);
  container.appendChild(inputPanel);

  // ── Results ──
  const results = document.createElement("div");
  results.id = "results";
  container.appendChild(results);

  // ── URL Params ──
  const urlParams = _getUrlParams();
  if (urlParams.vin) vinInput.value = urlParams.vin;
  if (urlParams.zip) zipInput.value = urlParams.zip;
  if (urlParams.askingPrice) priceInput.value = urlParams.askingPrice;
  if (urlParams.miles) milesInput.value = urlParams.miles;

  // ── Evaluate ──
  evalBtn.addEventListener("click", () => runEval());

  async function runEval() {
    const vin = vinInput.value.trim();
    if (!vin) { alert("Please enter a VIN."); return; }

    evalBtn.disabled = true;
    evalBtn.textContent = "Evaluating...";
    evalBtn.style.opacity = "0.7";
    results.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:60px;color:#94a3b8;">
      <div style="width:24px;height:24px;border:3px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:14px;"></div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      Analyzing deal with incentives for ${vin}...
    </div>`;

    let data: EvalResult;

    try {
      if (canCallServer) {
        const args: Record<string, any> = { vin };
        if (zipInput.value.trim()) args.zip = zipInput.value.trim();
        if (priceInput.value) args.askingPrice = Number(priceInput.value);
        if (milesInput.value) args.miles = Number(milesInput.value);

        const response = await _callTool("evaluate-incentive-deal", args);
        if (!response) throw new Error("Tool returned no data");
        const textContent = response.content?.find((c: any) => c.type === "text");
        const parsed = JSON.parse(textContent?.text ?? "{}");
        // Guard against partial responses (e.g. transformer failed upstream)
        if (!parsed?.vehicle) throw new Error("Malformed response: missing vehicle");
        data = parsed as EvalResult;
      } else {
        await new Promise(r => setTimeout(r, 400));
        data = getMockData(vin, zipInput.value.trim(), priceInput.value ? Number(priceInput.value) : undefined);
      }

      renderResults(data);
    } catch (err: any) {
      console.error("Eval failed, falling back to mock:", err);
      await new Promise(r => setTimeout(r, 200));
      data = getMockData(vin, zipInput.value.trim(), priceInput.value ? Number(priceInput.value) : undefined);
      renderResults(data);
    }

    evalBtn.disabled = false;
    evalBtn.textContent = "Evaluate Deal";
    evalBtn.style.opacity = "1";
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  function renderResults(data: EvalResult) {
    results.innerHTML = "";

    // ── Vehicle Info ──
    const vehicleCard = document.createElement("div");
    vehicleCard.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px 20px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;";
    vehicleCard.innerHTML = `<div>
        <div style="font-size:18px;font-weight:700;color:#f8fafc;">${data.vehicle.year} ${data.vehicle.make} ${data.vehicle.model} ${data.vehicle.trim}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px;">VIN: ${data.vehicle.vin} | ${data.vehicle.bodyType} | ${data.vehicle.fuelType}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:12px;color:#94a3b8;">MSRP</div>
        <div style="font-size:20px;font-weight:800;color:#f8fafc;">${fmtCurrency(data.vehicle.msrp)}</div>
      </div>`;
    results.appendChild(vehicleCard);

    // ── Three-Tier Price Comparison ──
    const tierSection = document.createElement("div");
    tierSection.style.cssText = "display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:0;align-items:center;margin-bottom:16px;";

    const tiers = [
      { label: "Sticker Price", value: data.stickerPrice, color: "#94a3b8", sub: "MSRP" },
      { label: "ML Fair Value", value: data.predictedFMV, color: "#8b5cf6", sub: "Predicted" },
      { label: "Incentive-Adjusted", value: data.incentiveAdjustedCost, color: "#10b981", sub: "Your Cost" },
    ];

    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i];
      const card = document.createElement("div");
      card.style.cssText = `background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;text-align:center;${i === 2 ? "border:2px solid #10b981;" : ""}`;
      card.innerHTML = `<div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">${tier.sub}</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:8px;">${tier.label}</div>
        <div style="font-size:26px;font-weight:800;color:${tier.color};">${fmtCurrency(tier.value)}</div>`;
      if (i === 2) {
        const savings = data.stickerPrice - data.incentiveAdjustedCost;
        const savingsTxt = savings >= 0
          ? `Save ${fmtCurrency(savings)} vs MSRP`
          : `${fmtCurrency(Math.abs(savings))} above MSRP`;
        const savingsColor = savings >= 0 ? "#10b981" : "#ef4444";
        card.innerHTML += `<div style="font-size:11px;color:${savingsColor};font-weight:600;margin-top:6px;">${savingsTxt}</div>`;
      }
      tierSection.appendChild(card);

      if (i < 2) {
        const arrow = document.createElement("div");
        arrow.style.cssText = "text-align:center;padding:0 8px;";
        const delta = i === 0 ? data.stickerPrice - data.predictedFMV : data.predictedFMV - data.incentiveAdjustedCost;
        arrow.innerHTML = `<div style="font-size:20px;color:#475569;">&#8594;</div>
          <div style="font-size:11px;color:${delta >= 0 ? "#10b981" : "#ef4444"};font-weight:600;">${fmtSigned(delta)}</div>`;
        tierSection.appendChild(arrow);
      }
    }
    results.appendChild(tierSection);

    // ── Two-Column: Incentives + Buy Paths ──
    const twoCol = document.createElement("div");
    twoCol.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;";

    // ── Applicable Incentives ──
    const incentivePanel = document.createElement("div");
    incentivePanel.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:18px 20px;";
    incentivePanel.innerHTML = `<h2 style="margin:0 0 14px 0;font-size:15px;font-weight:700;color:#f8fafc;">Applicable Incentives</h2>`;

    let incentiveHtml = `<div style="display:flex;flex-direction:column;gap:10px;">`;
    for (const inc of data.incentives) {
      const typeColors: Record<string, { bg: string; fg: string; icon: string }> = {
        cashback: { bg: "#10b98122", fg: "#10b981", icon: "$" },
        apr: { bg: "#3b82f622", fg: "#3b82f6", icon: "%" },
        lease: { bg: "#8b5cf622", fg: "#8b5cf6", icon: "L" },
      };
      const tc = typeColors[inc.type] ?? typeColors.cashback;

      let valueDisplay: string;
      if (inc.type === "cashback") valueDisplay = fmtCurrency(inc.value);
      else if (inc.type === "apr") valueDisplay = inc.value + "% APR";
      else valueDisplay = fmtCurrency(inc.value) + "/mo";

      incentiveHtml += `<div style="background:#0f172a;border-radius:8px;padding:12px 14px;border-left:3px solid ${tc.fg};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
          <div>
            <span style="display:inline-block;width:20px;height:20px;border-radius:4px;background:${tc.bg};color:${tc.fg};font-size:11px;font-weight:700;text-align:center;line-height:20px;margin-right:8px;">${tc.icon}</span>
            <span style="font-weight:600;color:#f8fafc;font-size:13px;">${inc.title}</span>
          </div>
          <span style="font-weight:700;color:${tc.fg};font-size:14px;">${valueDisplay}</span>
        </div>
        <div style="font-size:11px;color:#94a3b8;margin-left:28px;">${inc.description}</div>
        <div style="font-size:10px;color:#64748b;margin-top:4px;margin-left:28px;">Expires: ${inc.expiration}</div>
      </div>`;
    }
    incentiveHtml += `</div>`;
    incentivePanel.innerHTML += incentiveHtml;

    // Total savings callout
    incentivePanel.innerHTML += `<div style="background:#10b98115;border:1px solid #10b98133;border-radius:8px;padding:12px;margin-top:12px;text-align:center;">
      <div style="font-size:11px;color:#10b981;text-transform:uppercase;letter-spacing:0.5px;">Total Cash Incentives Available</div>
      <div style="font-size:22px;font-weight:800;color:#10b981;margin-top:4px;">${fmtCurrency(data.totalIncentiveSavings)}</div>
    </div>`;
    twoCol.appendChild(incentivePanel);

    // ── Best Path to Buy ──
    const pathPanel = document.createElement("div");
    pathPanel.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:18px 20px;";
    pathPanel.innerHTML = `<h2 style="margin:0 0 14px 0;font-size:15px;font-weight:700;color:#f8fafc;">Best Path to Buy</h2>`;

    let pathHtml = `<div style="display:flex;flex-direction:column;gap:10px;">`;
    for (const path of data.buyPaths) {
      const borderColor = path.recommended ? "#10b981" : "#334155";
      const badgeBg = path.recommended ? "#10b981" : "transparent";
      pathHtml += `<div style="background:#0f172a;border-radius:8px;padding:14px;border:${path.recommended ? "2px" : "1px"} solid ${borderColor};position:relative;">
        ${path.recommended ? `<div style="position:absolute;top:-8px;right:12px;background:${badgeBg};color:#fff;font-size:10px;font-weight:700;padding:2px 10px;border-radius:8px;letter-spacing:0.5px;">RECOMMENDED</div>` : ""}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-weight:600;color:#f8fafc;font-size:14px;">${path.name}</div>
          <div style="text-align:right;">
            <div style="font-size:16px;font-weight:700;color:${path.recommended ? "#10b981" : "#f8fafc"};">${fmtCurrency(path.totalCost)}</div>
            <div style="font-size:11px;color:#94a3b8;">${fmtCurrency(path.monthlyCost)}/mo</div>
          </div>
        </div>
        <div style="font-size:12px;color:#94a3b8;line-height:1.4;">${path.details}</div>
        ${path.totalSavings > 0 ? `<div style="font-size:11px;color:#10b981;font-weight:600;margin-top:6px;">Total savings: ${fmtCurrency(path.totalSavings)}</div>` : ""}
      </div>`;
    }
    pathHtml += `</div>`;
    pathPanel.innerHTML += pathHtml;
    twoCol.appendChild(pathPanel);
    results.appendChild(twoCol);

    // ── Waterfall Chart ──
    const waterfallSection = document.createElement("div");
    waterfallSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:18px 20px;margin-bottom:16px;";
    waterfallSection.innerHTML = `<h2 style="margin:0 0 14px 0;font-size:15px;font-weight:700;color:#f8fafc;">Price Waterfall: Sticker to Final Cost</h2>`;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:100%;height:320px;";
    waterfallSection.appendChild(canvas);
    results.appendChild(waterfallSection);

    requestAnimationFrame(() => {
      drawWaterfall(canvas, data.waterfallSteps);
    });

    // ── Active Comparables ──
    const compSection = document.createElement("div");
    compSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:18px 20px;margin-bottom:16px;";
    compSection.innerHTML = `<h2 style="margin:0 0 14px 0;font-size:15px;font-weight:700;color:#f8fafc;">Active Comparables</h2>`;

    const compTableWrap = document.createElement("div");
    compTableWrap.style.cssText = "overflow-x:auto;";
    let compHtml = `<table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr>
        <th style="padding:10px 12px;text-align:left;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;">Vehicle</th>
        <th style="padding:10px 12px;text-align:right;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;">Price</th>
        <th style="padding:10px 12px;text-align:right;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;">Miles</th>
        <th style="padding:10px 12px;text-align:left;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;">Dealer</th>
        <th style="padding:10px 12px;text-align:left;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;">Location</th>
        <th style="padding:10px 12px;text-align:center;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;">vs Your Deal</th>
      </tr></thead><tbody>`;

    for (const comp of data.comparables) {
      const diff = comp.price - data.incentiveAdjustedCost;
      const diffColor = diff > 0 ? "#10b981" : "#ef4444";
      // Sign must prefix the `$` — fmtCurrency otherwise yields "$-1,200"
      const diffLabel = `${diff >= 0 ? "+" : "-"}${fmtCurrency(Math.abs(diff))}`;
      compHtml += `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #1e293b44;color:#f8fafc;font-weight:500;">${comp.year} ${comp.make} ${comp.model} ${comp.trim}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e293b44;text-align:right;color:#f8fafc;font-weight:600;">${fmtCurrency(comp.price)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e293b44;text-align:right;color:#94a3b8;">${fmtNumber(comp.miles)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e293b44;color:#94a3b8;font-size:12px;">${comp.dealerName}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e293b44;color:#94a3b8;">${comp.city}, ${comp.state}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e293b44;text-align:center;">
          <span style="color:${diffColor};font-weight:600;font-size:12px;">${diffLabel}</span>
        </td>
      </tr>`;
    }
    compHtml += `</tbody></table>`;
    compTableWrap.innerHTML = compHtml;
    compSection.appendChild(compTableWrap);
    results.appendChild(compSection);

    // ── Total Savings Calculator ──
    const savingsCalc = document.createElement("div");
    savingsCalc.style.cssText = "background:linear-gradient(135deg,#1e293b,#0f172a);border:2px solid #10b981;border-radius:12px;padding:24px;margin-bottom:16px;text-align:center;";

    const totalSavingsVsMsrp = data.stickerPrice - data.incentiveAdjustedCost;
    const cashBackTotal = data.incentives.filter(i => i.type === "cashback").reduce((sum, i) => sum + i.value, 0);
    const bestApr = data.incentives.find(i => i.type === "apr");
    const standardApr = 5.9;
    const loanAmount = data.askingPrice - cashBackTotal;
    const aprSavings = bestApr ? calculateInterestSavings(loanAmount, standardApr / 100, bestApr.value / 100, bestApr.term ?? 60) : 0;

    // Deltas may be negative when asking price exceeds MSRP/FMV (dealer markup).
    // Use fmtSigned and word the headline so negative values read correctly.
    const dealerDelta = data.stickerPrice - data.askingPrice;
    const vsFmvDelta = data.predictedFMV - data.incentiveAdjustedCost;
    const savingsHeadline = totalSavingsVsMsrp >= 0
      ? fmtCurrency(totalSavingsVsMsrp)
      : `Above MSRP by ${fmtCurrency(Math.abs(totalSavingsVsMsrp))}`;
    savingsCalc.innerHTML = `<div style="font-size:13px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Your Total Savings Breakdown</div>
      <div style="font-size:36px;font-weight:800;color:${totalSavingsVsMsrp >= 0 ? "#10b981" : "#ef4444"};margin-bottom:16px;">${savingsHeadline}</div>
      <div style="display:flex;justify-content:center;gap:24px;flex-wrap:wrap;">
        <div style="text-align:center;">
          <div style="font-size:10px;color:#94a3b8;">Cash Back</div>
          <div style="font-size:16px;font-weight:700;color:#f8fafc;">${fmtCurrency(cashBackTotal)}</div>
        </div>
        <div style="width:1px;background:#334155;"></div>
        <div style="text-align:center;">
          <div style="font-size:10px;color:#94a3b8;">Dealer Discount</div>
          <div style="font-size:16px;font-weight:700;color:${dealerDelta >= 0 ? "#f8fafc" : "#ef4444"};">${fmtSigned(dealerDelta)}</div>
        </div>
        <div style="width:1px;background:#334155;"></div>
        <div style="text-align:center;">
          <div style="font-size:10px;color:#94a3b8;">APR Interest Savings</div>
          <div style="font-size:16px;font-weight:700;color:#f8fafc;">${fmtCurrency(aprSavings)}</div>
        </div>
        <div style="width:1px;background:#334155;"></div>
        <div style="text-align:center;">
          <div style="font-size:10px;color:#94a3b8;">vs Market (FMV)</div>
          <div style="font-size:16px;font-weight:700;color:${vsFmvDelta >= 0 ? "#f8fafc" : "#ef4444"};">${fmtSigned(vsFmvDelta)}</div>
        </div>
      </div>`;
    results.appendChild(savingsCalc);

    // ── Financing Scenarios Detail Table ──
    const financeSection = document.createElement("div");
    financeSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:18px 20px;margin-bottom:16px;";
    financeSection.innerHTML = `<h2 style="margin:0 0 4px 0;font-size:15px;font-weight:700;color:#f8fafc;">Financing Scenario Comparison</h2>
      <p style="margin:0 0 14px 0;font-size:12px;color:#94a3b8;">Side-by-side comparison of monthly payments across different terms and rates</p>`;

    const loanAmountForTable = data.askingPrice - cashBackTotal;
    const rates = [
      { label: "Incentive APR", rate: bestApr?.value ?? 1.9, highlight: true },
      { label: "Excellent Credit", rate: 4.5, highlight: false },
      { label: "Good Credit", rate: 5.9, highlight: false },
      { label: "Average Credit", rate: 7.5, highlight: false },
    ];
    const terms = [36, 48, 60, 72];

    const finTableWrap = document.createElement("div");
    finTableWrap.style.cssText = "overflow-x:auto;";
    let finHtml = `<table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr>
        <th style="padding:10px 12px;text-align:left;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;">Rate</th>`;
    for (const t of terms) {
      finHtml += `<th style="padding:10px 12px;text-align:center;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;">${t} months</th>`;
    }
    finHtml += `<th style="padding:10px 12px;text-align:right;color:#94a3b8;border-bottom:2px solid #334155;font-weight:600;">Total Interest (60mo)</th>
      </tr></thead><tbody>`;

    for (const r of rates) {
      const rowBg = r.highlight ? "background:#10b98108;" : "";
      const rowBorder = r.highlight ? "border-left:3px solid #10b981;" : "";
      finHtml += `<tr style="${rowBg}${rowBorder}">
        <td style="padding:10px 12px;border-bottom:1px solid #1e293b44;">
          <div style="font-weight:600;color:${r.highlight ? "#10b981" : "#f8fafc"};">${r.rate}% APR</div>
          <div style="font-size:10px;color:#64748b;">${r.label}</div>
        </td>`;
      for (const t of terms) {
        const monthly = calcMonthlyPayment(loanAmountForTable, r.rate / 100, t);
        finHtml += `<td style="padding:10px 12px;border-bottom:1px solid #1e293b44;text-align:center;color:${r.highlight ? "#10b981" : "#f8fafc"};font-weight:${r.highlight ? "700" : "500"};">${fmtCurrency(monthly)}/mo</td>`;
      }
      const totalInt60 = calcMonthlyPayment(loanAmountForTable, r.rate / 100, 60) * 60 - loanAmountForTable;
      finHtml += `<td style="padding:10px 12px;border-bottom:1px solid #1e293b44;text-align:right;color:#94a3b8;">${fmtCurrency(totalInt60)}</td>`;
      finHtml += `</tr>`;
    }
    finHtml += `</tbody></table>`;
    finTableWrap.innerHTML = finHtml;
    financeSection.appendChild(finTableWrap);

    // Savings callout
    const incentiveRate = bestApr?.value ?? 1.9;
    const standardRate = 5.9;
    const monthlySavings = calcMonthlyPayment(loanAmountForTable, standardRate / 100, 60) - calcMonthlyPayment(loanAmountForTable, incentiveRate / 100, 60);
    const totalLifeSavings = monthlySavings * 60;
    financeSection.innerHTML += `<div style="background:#10b98110;border:1px solid #10b98133;border-radius:8px;padding:12px 16px;margin-top:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <div style="font-size:13px;color:#10b981;font-weight:600;">Using the ${incentiveRate}% incentive rate vs standard ${standardRate}% saves you ${fmtCurrency(monthlySavings)}/month</div>
      <div style="font-size:16px;font-weight:800;color:#10b981;">${fmtCurrency(totalLifeSavings)} over 60 months</div>
    </div>`;
    results.appendChild(financeSection);

    // ── Incentive Eligibility Checklist ──
    const checklistSection = document.createElement("div");
    checklistSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:18px 20px;margin-bottom:16px;";
    checklistSection.innerHTML = `<h2 style="margin:0 0 14px 0;font-size:15px;font-weight:700;color:#f8fafc;">Incentive Eligibility Checklist</h2>`;

    const checklistItems = [
      { item: "Vehicle must be new and currently in dealer inventory", status: "likely", note: "VIN matches current model year" },
      { item: "Customer Cash: Available to all buyers, no qualification needed", status: "yes", note: "Automatic at point of sale" },
      { item: "Low APR: Requires approved credit through GM Financial", status: "check", note: "Tier 1 credit typically 720+ FICO" },
      { item: "Conquest Cash: Must currently own a competitive brand vehicle", status: "check", note: "Proof of ownership required" },
      { item: "First Responder: Must provide valid employment verification", status: "check", note: "Badge or department letter required" },
      { item: "Cash back and low APR are typically mutually exclusive", status: "warning", note: "Choose one -- our calculator picks the best option" },
      { item: "Incentives may not be combined with negotiated discounts", status: "info", note: "Check with dealer for stackability" },
    ];

    const statusIcons: Record<string, { icon: string; color: string }> = {
      yes: { icon: "OK", color: "#10b981" },
      likely: { icon: "~", color: "#f59e0b" },
      check: { icon: "?", color: "#3b82f6" },
      warning: { icon: "!", color: "#f97316" },
      info: { icon: "i", color: "#94a3b8" },
    };

    let checkHtml = `<div style="display:flex;flex-direction:column;gap:8px;">`;
    for (const ci of checklistItems) {
      const si = statusIcons[ci.status] ?? statusIcons.info;
      checkHtml += `<div style="background:#0f172a;border-radius:6px;padding:10px 14px;display:flex;align-items:flex-start;gap:10px;">
        <div style="min-width:24px;height:24px;border-radius:50%;background:${si.color}22;color:${si.color};font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:1px solid ${si.color}44;flex-shrink:0;">${si.icon}</div>
        <div style="flex:1;">
          <div style="font-size:13px;color:#f8fafc;font-weight:500;margin-bottom:2px;">${ci.item}</div>
          <div style="font-size:11px;color:#64748b;">${ci.note}</div>
        </div>
      </div>`;
    }
    checkHtml += `</div>`;
    checklistSection.innerHTML += checkHtml;
    results.appendChild(checklistSection);

    // ── Negotiation Tips Panel ──
    const tipsSection = document.createElement("div");
    tipsSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:18px 20px;margin-bottom:16px;";
    tipsSection.innerHTML = `<h2 style="margin:0 0 14px 0;font-size:15px;font-weight:700;color:#f8fafc;">Negotiation Tips</h2>`;

    const tips = [
      { title: "Ask about all stackable incentives", detail: "Some dealers will stack multiple incentives. Customer Cash plus Conquest Cash is often allowed. Always ask which incentives can be combined." },
      { title: "Compare the low-APR vs cashback paths", detail: `Our analysis shows the ${(bestApr?.value ?? 1.9)}% APR option saves ${fmtCurrency(totalLifeSavings)} more than the cashback route over 60 months.` },
      { title: "Use comparable pricing as leverage", detail: `The ${data.comparables.length} comparable vehicles in your area range from ${data.comparables.length > 0 ? fmtCurrency(Math.min(...data.comparables.map(c => c.price))) : "N/A"} to ${data.comparables.length > 0 ? fmtCurrency(Math.max(...data.comparables.map(c => c.price))) : "N/A"}. Reference lower-priced comparables when negotiating.` },
      { title: "Check incentive expiration dates", detail: "Current incentives expire as shown above. If you are close to month-end, dealers may be more willing to negotiate to hit volume targets." },
      { title: "Get pre-approved by your own lender first", detail: "Having an outside pre-approval gives you a benchmark to compare the manufacturer's APR offer against. Sometimes credit unions beat even incentive rates." },
    ];

    let tipsHtml = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:10px;">`;
    const tipColors = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#06b6d4"];
    for (let i = 0; i < tips.length; i++) {
      const tip = tips[i];
      const tc = tipColors[i % tipColors.length];
      tipsHtml += `<div style="background:#0f172a;border-radius:8px;padding:14px;border-left:3px solid ${tc};">
        <div style="font-weight:600;color:#f8fafc;font-size:13px;margin-bottom:4px;">${tip.title}</div>
        <div style="font-size:12px;color:#94a3b8;line-height:1.4;">${tip.detail}</div>
      </div>`;
    }
    tipsHtml += `</div>`;
    tipsSection.innerHTML += tipsHtml;
    results.appendChild(tipsSection);

    // ── Quick Summary Card ──
    const summaryCard = document.createElement("div");
    summaryCard.style.cssText = "background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid #334155;border-radius:10px;padding:16px 20px;margin-bottom:16px;";
    const bestPath = data.buyPaths.find(p => p.recommended) ?? data.buyPaths[0];
    // "below" only reads correctly when delta is positive; flip to "above" for markup cases.
    const msrpDelta = data.stickerPrice - data.incentiveAdjustedCost;
    const fmvDelta = data.predictedFMV - data.incentiveAdjustedCost;
    const msrpPhrase = `${fmtCurrency(Math.abs(msrpDelta))} ${msrpDelta >= 0 ? "below" : "above"} MSRP`;
    const fmvPhrase = `${fmtCurrency(Math.abs(fmvDelta))} ${fmvDelta >= 0 ? "below" : "above"} fair market value`;
    summaryCard.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Bottom Line</div>
        <div style="font-size:15px;font-weight:700;color:#f8fafc;margin-top:4px;">The best route for this ${data.vehicle.year} ${data.vehicle.make} ${data.vehicle.model} is <span style="color:#10b981;">${bestPath?.name ?? "Low APR Financing"}</span>.</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px;">Your incentive-adjusted cost of ${fmtCurrency(data.incentiveAdjustedCost)} is ${msrpPhrase} and ${fmvPhrase}.</div>
      </div>
      <div style="text-align:center;background:#10b98115;border:1px solid #10b98133;border-radius:10px;padding:12px 20px;">
        <div style="font-size:10px;color:#10b981;">YOUR PRICE</div>
        <div style="font-size:24px;font-weight:800;color:#10b981;">${fmtCurrency(data.incentiveAdjustedCost)}</div>
      </div>
    </div>`;
    results.appendChild(summaryCard);

    // ── Disclaimer ──
    const disclaimer = document.createElement("div");
    disclaimer.style.cssText = "background:#0f172a;border:1px solid #334155;border-radius:10px;padding:14px 18px;margin-bottom:16px;";
    disclaimer.innerHTML = `<div style="font-size:11px;color:#64748b;line-height:1.5;">
      <strong style="color:#94a3b8;">Disclaimer:</strong> Incentive information is sourced from manufacturer programs and may not reflect all available offers.
      Actual eligibility depends on credit approval, vehicle availability, and dealer participation. ML fair market value is a statistical estimate based on
      comparable vehicle transactions and may differ from actual market conditions. Monthly payment calculations assume standard amortization with no down payment
      beyond noted amounts. Always verify incentive details with your dealer before making a purchase decision. APR offers require credit approval through
      the manufacturer's financial services division. Tax, title, license, and registration fees are not included in pricing calculations.
    </div>`;
    results.appendChild(disclaimer);
  }

  function calculateInterestSavings(principal: number, stdRate: number, lowRate: number, months: number): number {
    const stdInterest = principal * stdRate * (months / 12) * 0.55;
    const lowInterest = principal * lowRate * (months / 12) * 0.55;
    return Math.round(stdInterest - lowInterest);
  }

  function calcMonthlyPayment(principal: number, annualRate: number, months: number): number {
    if (annualRate === 0) return Math.round(principal / months);
    const monthlyRate = annualRate / 12;
    const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
    return Math.round(payment);
  }

  // ── Auto-run on load ──
  runEval();
}

main().catch(console.error);
