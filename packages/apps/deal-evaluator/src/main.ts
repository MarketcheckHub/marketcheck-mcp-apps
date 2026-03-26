/**
 * "Should I Buy This Car?" Deal Evaluator
 * MCP App 5 — Dark-themed single-page evaluator with Canvas gauge
 */
import { App } from "@modelcontextprotocol/ext-apps";

const _safeApp = (() => { try { return new App({ name: "deal-evaluator" });

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
  if (_safeApp) return "mcp";
  if (_getAuth().value) return "live";
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

async function _callTool(toolName: string, args: Record<string, any>): Promise<any> {
  if (_safeApp) {
    try {
      const r = await _safeApp.callServerTool({ name: toolName, arguments: args });
      const t = r?.content?.find((c: any) => c.type === "text")?.text;
      if (t) return JSON.parse(t);
    } catch {}
  }
  const auth = _getAuth();
  if (auth.value) {
    try {
      const r = await fetch(`${_proxyBase()}/api/proxy/${toolName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, _auth_mode: auth.mode, _auth_value: auth.value }),
      });
      if (r.ok) return r.json();
    } catch {}
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
// ── End Data Provider ──────────────────────────────────────────────────

 } catch { return null; } })();

// ── Types ──────────────────────────────────────────────────────────────────────

interface VehicleInfo {
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

interface MarketStats {
  count: number;
  medianPrice: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  avgMiles: number;
  avgDom: number;
  priceStd: number;
}

interface Alternative {
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  miles: number;
  city: string;
  state: string;
  dom: number;
  dealerName: string;
  vdpUrl: string;
  isBelowPredicted: boolean;
}

interface PriceHistoryEntry {
  date: string;
  price: number;
  dealer: string;
}

interface LeveragePoint {
  icon: string;
  label: string;
  detail: string;
}

interface EvalResult {
  vehicle: VehicleInfo;
  askingPrice: number;
  miles: number;
  predictedPrice: number;
  percentile: number;
  marketStats: MarketStats;
  alternatives: Alternative[];
  priceHistory: PriceHistoryEntry[];
  leveragePoints: LeveragePoint[];
  dealerName: string;
  dom: number;
}

// ── Mock Data ──────────────────────────────────────────────────────────────────

function getMockData(vin: string, askingPrice?: number, miles?: number): EvalResult {
  const ap = askingPrice ?? 28500;
  const ml = miles ?? 34200;
  return {
    vehicle: {
      vin,
      year: 2021,
      make: "Toyota",
      model: "RAV4",
      trim: "XLE Premium",
      bodyType: "SUV",
      engine: "2.5L 4-Cylinder",
      transmission: "8-Speed Automatic",
      drivetrain: "AWD",
      fuelType: "Gasoline",
      msrp: 33450,
    },
    askingPrice: ap,
    miles: ml,
    predictedPrice: 27200,
    percentile: 62,
    marketStats: {
      count: 147,
      medianPrice: 27400,
      avgPrice: 27650,
      minPrice: 22100,
      maxPrice: 34900,
      avgMiles: 38500,
      avgDom: 32,
      priceStd: 2800,
    },
    alternatives: [
      { year: 2021, make: "Toyota", model: "RAV4", trim: "XLE", price: 25900, miles: 41200, city: "Denver", state: "CO", dom: 18, dealerName: "Mile High Toyota", vdpUrl: "#", isBelowPredicted: true },
      { year: 2021, make: "Toyota", model: "RAV4", trim: "XLE Premium", price: 26800, miles: 36800, city: "Boulder", state: "CO", dom: 24, dealerName: "Boulder Toyota", vdpUrl: "#", isBelowPredicted: true },
      { year: 2022, make: "Toyota", model: "RAV4", trim: "LE", price: 27100, miles: 28500, city: "Aurora", state: "CO", dom: 12, dealerName: "AutoNation Toyota", vdpUrl: "#", isBelowPredicted: true },
      { year: 2021, make: "Toyota", model: "RAV4", trim: "XLE Premium", price: 27900, miles: 32100, city: "Lakewood", state: "CO", dom: 45, dealerName: "Larry H. Miller Toyota", vdpUrl: "#", isBelowPredicted: false },
      { year: 2020, make: "Toyota", model: "RAV4", trim: "XLE Premium", price: 25200, miles: 48700, city: "Fort Collins", state: "CO", dom: 55, dealerName: "Pedersen Toyota", vdpUrl: "#", isBelowPredicted: true },
      { year: 2021, make: "Toyota", model: "RAV4", trim: "Limited", price: 29400, miles: 29800, city: "Colorado Springs", state: "CO", dom: 8, dealerName: "Springs Toyota", vdpUrl: "#", isBelowPredicted: false },
      { year: 2022, make: "Toyota", model: "RAV4", trim: "XLE", price: 28200, miles: 22100, city: "Pueblo", state: "CO", dom: 30, dealerName: "Pueblo Toyota", vdpUrl: "#", isBelowPredicted: false },
      { year: 2021, make: "Toyota", model: "RAV4", trim: "XSE Hybrid", price: 29800, miles: 31400, city: "Longmont", state: "CO", dom: 14, dealerName: "Longmont Toyota", vdpUrl: "#", isBelowPredicted: false },
    ],
    priceHistory: [
      { date: "2025-12-01", price: 30200, dealer: "First Auto" },
      { date: "2026-01-15", price: 29500, dealer: "CarMax Denver" },
      { date: "2026-02-20", price: 28500, dealer: "Current Dealer" },
    ],
    leveragePoints: [
      { icon: "clock", label: "High Days on Market", detail: "This car has been listed for 45+ days — dealer is motivated to sell." },
      { icon: "chart-down", label: "Price Dropped", detail: "Price has dropped $1,700 since first listed. Momentum is in your favor." },
      { icon: "inventory", label: "High Local Inventory", detail: "147 similar vehicles within 75 miles. Dealer has competition." },
      { icon: "miles", label: "Above-Average Mileage", detail: "This car has fewer miles than the market average (34.2K vs 38.5K avg)." },
    ],
    dealerName: "Colorado Auto Group",
    dom: 45,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtCurrency(v: number | undefined): string {
  if (v == null) return "N/A";
  return "$" + Math.round(v).toLocaleString();
}

function fmtNumber(v: number | undefined): string {
  if (v == null) return "N/A";
  return Math.round(v).toLocaleString();
}

function getVerdict(percentile: number): { label: string; icon: string; title: string; subtitle: string; color: string; bgColor: string } {
  if (percentile <= 20) return { label: "GREAT DEAL", icon: "\u2713", title: "GREAT DEAL", subtitle: "Buy with confidence", color: "#10b981", bgColor: "#10b98120" };
  if (percentile <= 60) return { label: "FAIR DEAL", icon: "\u26A0", title: "FAIR DEAL", subtitle: "Room to negotiate", color: "#f59e0b", bgColor: "#f59e0b20" };
  if (percentile <= 85) return { label: "ABOVE MARKET", icon: "\u26A0", title: "ABOVE MARKET", subtitle: "Negotiate hard", color: "#f97316", bgColor: "#f9731620" };
  return { label: "OVERPRICED", icon: "\u2717", title: "OVERPRICED", subtitle: "Pass", color: "#ef4444", bgColor: "#ef444420" };
}

function getLeverageIcon(iconName: string): string {
  switch (iconName) {
    case "clock": return "\u23F0";
    case "chart-down": return "\uD83D\uDCC9";
    case "inventory": return "\uD83D\uDCE6";
    case "miles": return "\uD83D\uDEE3\uFE0F";
    default: return "\u2139\uFE0F";
  }
}

// ── Canvas Gauge ───────────────────────────────────────────────────────────────

function drawGauge(canvas: HTMLCanvasElement, data: {
  minPrice: number;
  maxPrice: number;
  askingPrice: number;
  predictedPrice: number;
  percentile: number;
}) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  const cx = w / 2;
  const cy = h - 30;
  const radius = Math.min(cx - 30, cy - 20);
  const startAngle = Math.PI;
  const endAngle = 2 * Math.PI;

  // Color segments: green -> yellow -> orange -> red
  const segments = [
    { start: 0, end: 0.20, color: "#10b981" },
    { start: 0.20, end: 0.40, color: "#22c55e" },
    { start: 0.40, end: 0.60, color: "#f59e0b" },
    { start: 0.60, end: 0.75, color: "#f97316" },
    { start: 0.75, end: 0.85, color: "#ef4444" },
    { start: 0.85, end: 1.0, color: "#dc2626" },
  ];

  // Draw arc segments
  const arcWidth = 20;
  for (const seg of segments) {
    const a1 = startAngle + seg.start * Math.PI;
    const a2 = startAngle + seg.end * Math.PI;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, a1, a2);
    ctx.strokeStyle = seg.color;
    ctx.lineWidth = arcWidth;
    ctx.lineCap = "butt";
    ctx.stroke();
  }

  // Draw thin outer arc border
  ctx.beginPath();
  ctx.arc(cx, cy, radius + arcWidth / 2 + 1, startAngle, endAngle);
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, radius - arcWidth / 2 - 1, startAngle, endAngle);
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Tick marks
  for (let i = 0; i <= 10; i++) {
    const angle = startAngle + (i / 10) * Math.PI;
    const innerR = radius - arcWidth / 2 - 6;
    const outerR = radius - arcWidth / 2 - 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
    ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = i % 5 === 0 ? 2 : 1;
    ctx.stroke();
  }

  // Predicted price marker (triangle on the arc)
  const range = data.maxPrice - data.minPrice || 1;
  const predictedPct = Math.max(0, Math.min(1, (data.predictedPrice - data.minPrice) / range));
  const predictedAngle = startAngle + predictedPct * Math.PI;
  const markerR = radius + arcWidth / 2 + 8;
  const markerX = cx + Math.cos(predictedAngle) * markerR;
  const markerY = cy + Math.sin(predictedAngle) * markerR;

  ctx.save();
  ctx.translate(markerX, markerY);
  ctx.rotate(predictedAngle + Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(-5, 6);
  ctx.lineTo(5, 6);
  ctx.closePath();
  ctx.fillStyle = "#3b82f6";
  ctx.fill();
  ctx.restore();

  // Fair market value label
  const fmvLabelR = radius + arcWidth / 2 + 22;
  const fmvLabelX = cx + Math.cos(predictedAngle) * fmvLabelR;
  const fmvLabelY = cy + Math.sin(predictedAngle) * fmvLabelR;
  ctx.font = "bold 10px -apple-system, sans-serif";
  ctx.fillStyle = "#3b82f6";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("FMV", fmvLabelX, fmvLabelY);

  // Needle for asking price
  const askingPct = Math.max(0, Math.min(1, (data.askingPrice - data.minPrice) / range));
  const needleAngle = startAngle + askingPct * Math.PI;
  const needleLen = radius - arcWidth / 2 - 12;

  // Needle shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  // Draw needle
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(
    cx + Math.cos(needleAngle) * needleLen,
    cy + Math.sin(needleAngle) * needleLen,
  );
  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();

  // Needle tip
  const tipX = cx + Math.cos(needleAngle) * needleLen;
  const tipY = cy + Math.sin(needleAngle) * needleLen;
  ctx.beginPath();
  ctx.arc(tipX, tipY, 3, 0, 2 * Math.PI);
  ctx.fillStyle = "#f8fafc";
  ctx.fill();

  // Center hub
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, 2 * Math.PI);
  ctx.fillStyle = "#1e293b";
  ctx.fill();
  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Min/Max labels at the ends
  ctx.font = "bold 12px -apple-system, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(fmtCurrency(data.minPrice), cx - radius - 10, cy + 6);

  ctx.textAlign = "right";
  ctx.fillText(fmtCurrency(data.maxPrice), cx + radius + 10, cy + 6);

  // Asking price value in center
  ctx.font = "bold 20px -apple-system, sans-serif";
  ctx.fillStyle = "#f8fafc";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(fmtCurrency(data.askingPrice), cx, cy - 18);

  ctx.font = "11px -apple-system, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("Asking Price", cx, cy - 4);
}

// ── Main App ───────────────────────────────────────────────────────────────────

async function main() {
  const app = new App({ name: "deal-evaluator" });
  let serverAvailable = false;
  try {
    await app.init();
    serverAvailable = true;
  } catch {
    serverAvailable = false;
  }

  // ── Shell Setup ──
  document.body.style.cssText = "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;overflow-x:hidden;";

  const container = document.createElement("div");
  container.style.cssText = "max-width:1200px;margin:0 auto;padding:16px 20px;";
  document.body.appendChild(container);

  // ── Header ──
  const header = document.createElement("div");
  header.style.cssText = "background:#1e293b;padding:16px 20px;border-radius:10px;margin-bottom:16px;border:1px solid #334155;";
  header.innerHTML = `<h1 style="margin:0 0 4px 0;font-size:20px;font-weight:700;color:#f8fafc;">Should I Buy This Car?</h1>
    <p style="margin:0;font-size:13px;color:#94a3b8;">Enter a VIN to get a data-driven deal evaluation with market context</p>`;
  container.appendChild(header);

  // ── Input Area ──
  const inputArea = document.createElement("div");
  inputArea.style.cssText = "background:#1e293b;padding:16px 20px;border-radius:10px;margin-bottom:16px;border:1px solid #334155;display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;";

  function makeField(label: string, placeholder: string, opts?: { width?: string; type?: string }): HTMLInputElement {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    wrap.innerHTML = `<label style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">${label}</label>`;
    const input = document.createElement("input");
    input.type = opts?.type ?? "text";
    input.placeholder = placeholder;
    input.style.cssText = `padding:10px 14px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;outline:none;width:${opts?.width ?? "180px"};`;
    input.addEventListener("focus", () => { input.style.borderColor = "#3b82f6"; });
    input.addEventListener("blur", () => { input.style.borderColor = "#334155"; });
    wrap.appendChild(input);
    inputArea.appendChild(wrap);
    return input;
  }

  const vinInput = makeField("VIN", "Enter 17-character VIN", { width: "240px" });
  const priceInput = makeField("Asking Price (optional)", "$0", { width: "140px", type: "number" });
  const milesInput = makeField("Mileage (optional)", "e.g. 35000", { width: "140px", type: "number" });
  const zipInput = makeField("ZIP Code (optional)", "e.g. 80202", { width: "120px" });

  const evalBtn = document.createElement("button");
  evalBtn.textContent = "Evaluate";
  evalBtn.style.cssText = "padding:10px 28px;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;border:none;background:#3b82f6;color:#fff;height:42px;align-self:flex-end;transition:background 0.15s;";
  evalBtn.addEventListener("mouseenter", () => { evalBtn.style.background = "#2563eb"; });
  evalBtn.addEventListener("mouseleave", () => { evalBtn.style.background = "#3b82f6"; });
  inputArea.appendChild(evalBtn);

  container.appendChild(inputArea);

  // ── Results Container ──
  const results = document.createElement("div");
  results.id = "results";
  container.appendChild(results);

  // ── Evaluate Handler ──
  evalBtn.addEventListener("click", async () => {
    const vin = vinInput.value.trim();
    if (!vin) {
      alert("Please enter a VIN.");
      return;
    }

    evalBtn.disabled = true;
    evalBtn.textContent = "Evaluating...";
    evalBtn.style.opacity = "0.7";
    results.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:60px;color:#94a3b8;">
      <div style="width:24px;height:24px;border:3px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:14px;"></div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      Analyzing market data for ${vin}...
    </div>`;

    let data: EvalResult;

    try {
      if (serverAvailable) {
        const args: Record<string, unknown> = { vin };
        if (priceInput.value) args.askingPrice = Number(priceInput.value);
        if (milesInput.value) args.miles = Number(milesInput.value);
        if (zipInput.value) args.zip = zipInput.value;

        const response = await _safeApp?.callServerTool({ name: "evaluate-deal", arguments: args });
        const textContent = response.content.find((c: any) => c.type === "text");
        data = JSON.parse(textContent?.text ?? "{}");
      } else {
        // Use mock data
        await new Promise(r => setTimeout(r, 800));
        data = getMockData(
          vin,
          priceInput.value ? Number(priceInput.value) : undefined,
          milesInput.value ? Number(milesInput.value) : undefined,
        );
      }

      renderResults(data);
    } catch (err: any) {
      console.error("Evaluation failed, falling back to mock:", err);
      await new Promise(r => setTimeout(r, 400));
      data = getMockData(
        vin,
        priceInput.value ? Number(priceInput.value) : undefined,
        milesInput.value ? Number(milesInput.value) : undefined,
      );
      renderResults(data);
    }

    evalBtn.disabled = false;
    evalBtn.textContent = "Evaluate";
    evalBtn.style.opacity = "1";
  });

  // ── Render ───────────────────────────────────────────────────────────────────

  function renderResults(data: EvalResult) {
    results.innerHTML = "";

    const verdict = getVerdict(data.percentile);
    const priceDiff = data.askingPrice - data.predictedPrice;
    const priceDiffAbs = Math.abs(priceDiff);
    const diffSign = priceDiff >= 0 ? "above" : "below";

    // ── Verdict Banner ──
    const banner = document.createElement("div");
    banner.style.cssText = `background:${verdict.bgColor};border:2px solid ${verdict.color};border-radius:12px;padding:20px 24px;margin-bottom:16px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;`;
    banner.innerHTML = `
      <div style="width:56px;height:56px;border-radius:50%;background:${verdict.color};display:flex;align-items:center;justify-content:center;font-size:28px;color:#fff;font-weight:bold;flex-shrink:0;">${verdict.icon}</div>
      <div style="flex:1;min-width:200px;">
        <div style="font-size:24px;font-weight:800;color:${verdict.color};letter-spacing:0.5px;">${verdict.title}</div>
        <div style="font-size:14px;color:#e2e8f0;margin-top:2px;">${verdict.subtitle}</div>
      </div>
      <div style="display:flex;gap:24px;flex-wrap:wrap;">
        <div style="text-align:center;">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">Asking Price</div>
          <div style="font-size:20px;font-weight:700;color:#f8fafc;">${fmtCurrency(data.askingPrice)}</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">Fair Market Value</div>
          <div style="font-size:20px;font-weight:700;color:#3b82f6;">${fmtCurrency(data.predictedPrice)}</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;">Difference</div>
          <div style="font-size:20px;font-weight:700;color:${priceDiff >= 0 ? "#ef4444" : "#10b981"};">${priceDiff >= 0 ? "+" : "-"}${fmtCurrency(priceDiffAbs)} ${diffSign}</div>
        </div>
      </div>
    `;
    results.appendChild(banner);

    // ── Gauge ──
    const gaugeSection = document.createElement("div");
    gaugeSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:16px;text-align:center;";
    gaugeSection.innerHTML = `<h3 style="font-size:13px;color:#94a3b8;margin:0 0 12px 0;text-transform:uppercase;letter-spacing:0.5px;">Price Position in Market</h3>`;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:100%;max-width:500px;height:220px;";
    gaugeSection.appendChild(canvas);

    // Legend row
    const legend = document.createElement("div");
    legend.style.cssText = "display:flex;justify-content:center;gap:16px;margin-top:10px;flex-wrap:wrap;";
    legend.innerHTML = `
      <span style="font-size:11px;color:#94a3b8;display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;background:#f8fafc;border-radius:50%;display:inline-block;"></span> Asking Price (needle)</span>
      <span style="font-size:11px;color:#94a3b8;display:flex;align-items:center;gap:4px;"><span style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:10px solid #3b82f6;display:inline-block;"></span> Fair Market Value</span>
    `;
    gaugeSection.appendChild(legend);
    results.appendChild(gaugeSection);

    // Draw gauge after it's in the DOM
    requestAnimationFrame(() => {
      drawGauge(canvas, {
        minPrice: data.marketStats.minPrice,
        maxPrice: data.marketStats.maxPrice,
        askingPrice: data.askingPrice,
        predictedPrice: data.predictedPrice,
        percentile: data.percentile,
      });
    });

    // ── Three-Column Detail Row ──
    const detailGrid = document.createElement("div");
    detailGrid.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:16px;";

    // 1. This Car
    const thisCarPanel = createPanel("This Car");
    const specs = [
      ["Year/Make/Model", `${data.vehicle.year} ${data.vehicle.make} ${data.vehicle.model}`],
      ["Trim", data.vehicle.trim],
      ["Body Type", data.vehicle.bodyType],
      ["Engine", data.vehicle.engine],
      ["Transmission", data.vehicle.transmission],
      ["Drivetrain", data.vehicle.drivetrain],
      ["Mileage", `${fmtNumber(data.miles)} mi`],
      ["Dealer", data.dealerName],
      ["Days on Market", `${data.dom} days`],
      ["MSRP (new)", fmtCurrency(data.vehicle.msrp)],
    ];
    for (const [k, v] of specs) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #1e293b;";
      row.innerHTML = `<span style="font-size:12px;color:#94a3b8;">${k}</span><span style="font-size:12px;color:#e2e8f0;font-weight:600;">${v}</span>`;
      thisCarPanel.body.appendChild(row);
    }
    detailGrid.appendChild(thisCarPanel.container);

    // 2. Market Context
    const marketPanel = createPanel("Market Context");
    const mStats = [
      ["Similar Cars", `${data.marketStats.count} within 75 mi`],
      ["Median Price", fmtCurrency(data.marketStats.medianPrice)],
      ["Avg Price", fmtCurrency(data.marketStats.avgPrice)],
      ["Price Range", `${fmtCurrency(data.marketStats.minPrice)} - ${fmtCurrency(data.marketStats.maxPrice)}`],
      ["Avg Mileage", `${fmtNumber(data.marketStats.avgMiles)} mi`],
      ["Avg Days on Market", `${data.marketStats.avgDom} days`],
    ];
    for (const [k, v] of mStats) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #1e293b;";
      row.innerHTML = `<span style="font-size:12px;color:#94a3b8;">${k}</span><span style="font-size:12px;color:#e2e8f0;font-weight:600;">${v}</span>`;
      marketPanel.body.appendChild(row);
    }

    // Mini distribution bar
    const distLabel = document.createElement("div");
    distLabel.style.cssText = "margin-top:10px;font-size:11px;color:#94a3b8;margin-bottom:4px;";
    distLabel.textContent = "Price Distribution";
    marketPanel.body.appendChild(distLabel);

    const distBar = document.createElement("div");
    distBar.style.cssText = "position:relative;height:24px;background:#0f172a;border-radius:6px;overflow:hidden;border:1px solid #334155;";
    const priceRange = data.marketStats.maxPrice - data.marketStats.minPrice || 1;
    const medianPct = ((data.marketStats.medianPrice - data.marketStats.minPrice) / priceRange) * 100;
    const askingPct = Math.max(0, Math.min(100, ((data.askingPrice - data.marketStats.minPrice) / priceRange) * 100));
    distBar.innerHTML = `
      <div style="position:absolute;left:0;top:0;height:100%;width:${medianPct}%;background:linear-gradient(90deg,#10b98133,#10b98155);"></div>
      <div style="position:absolute;left:${medianPct}%;top:0;height:100%;width:2px;background:#10b981;" title="Median"></div>
      <div style="position:absolute;left:${askingPct}%;top:0;height:100%;width:3px;background:#f59e0b;border-radius:1px;" title="Asking Price"></div>
      <div style="position:absolute;left:4px;top:50%;transform:translateY(-50%);font-size:9px;color:#64748b;">${fmtCurrency(data.marketStats.minPrice)}</div>
      <div style="position:absolute;right:4px;top:50%;transform:translateY(-50%);font-size:9px;color:#64748b;">${fmtCurrency(data.marketStats.maxPrice)}</div>
    `;
    marketPanel.body.appendChild(distBar);

    const distLegend = document.createElement("div");
    distLegend.style.cssText = "display:flex;gap:12px;margin-top:4px;";
    distLegend.innerHTML = `
      <span style="font-size:10px;color:#10b981;">| Median</span>
      <span style="font-size:10px;color:#f59e0b;">| Asking</span>
    `;
    marketPanel.body.appendChild(distLegend);

    detailGrid.appendChild(marketPanel.container);

    // 3. Negotiation Toolkit
    const negoPanel = createPanel("Negotiation Toolkit");

    // Suggested offer
    const suggestedOffer = Math.round(data.predictedPrice * 0.95);
    const offerBox = document.createElement("div");
    offerBox.style.cssText = "background:#10b98115;border:1px solid #10b98140;border-radius:8px;padding:12px;margin-bottom:12px;text-align:center;";
    offerBox.innerHTML = `
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Suggested Opening Offer</div>
      <div style="font-size:24px;font-weight:800;color:#10b981;margin-top:4px;">${fmtCurrency(suggestedOffer)}</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px;">5% below fair market value</div>
    `;
    negoPanel.body.appendChild(offerBox);

    // Leverage points
    const leverageTitle = document.createElement("div");
    leverageTitle.style.cssText = "font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;";
    leverageTitle.textContent = "Leverage Points";
    negoPanel.body.appendChild(leverageTitle);

    for (const lp of data.leveragePoints) {
      const lpEl = document.createElement("div");
      lpEl.style.cssText = "background:#0f172a;border:1px solid #334155;border-radius:6px;padding:10px 12px;margin-bottom:6px;";
      lpEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:16px;">${getLeverageIcon(lp.icon)}</span>
          <span style="font-size:12px;font-weight:600;color:#e2e8f0;">${lp.label}</span>
        </div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px;padding-left:28px;">${lp.detail}</div>
      `;
      negoPanel.body.appendChild(lpEl);
    }

    detailGrid.appendChild(negoPanel.container);
    results.appendChild(detailGrid);

    // ── Similar Cars Section ──
    const altSection = document.createElement("div");
    altSection.style.cssText = "margin-bottom:20px;";
    altSection.innerHTML = `<h3 style="font-size:14px;font-weight:600;color:#f8fafc;margin:0 0 12px 0;">Similar Cars to Consider</h3>`;

    const scrollRow = document.createElement("div");
    scrollRow.style.cssText = "display:flex;gap:12px;overflow-x:auto;padding-bottom:12px;";
    scrollRow.style.scrollbarWidth = "thin";

    for (const alt of data.alternatives) {
      const card = document.createElement("div");
      card.style.cssText = "min-width:220px;max-width:240px;background:#1e293b;border:1px solid #334155;border-radius:10px;padding:14px;flex-shrink:0;cursor:pointer;transition:border-color 0.15s;";
      card.addEventListener("mouseenter", () => { card.style.borderColor = "#3b82f6"; });
      card.addEventListener("mouseleave", () => { card.style.borderColor = "#334155"; });

      const badgeHtml = alt.isBelowPredicted
        ? `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:#10b98122;color:#10b981;border:1px solid #10b98144;margin-top:6px;">Below Market</span>`
        : "";

      card.innerHTML = `
        <div style="font-size:14px;font-weight:700;color:#f8fafc;">${alt.year} ${alt.make} ${alt.model}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:2px;">${alt.trim}</div>
        <div style="font-size:20px;font-weight:800;color:#f8fafc;margin-top:8px;">${fmtCurrency(alt.price)}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px;">${fmtNumber(alt.miles)} mi</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:2px;">${alt.city}, ${alt.state}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">${alt.dealerName}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">${alt.dom} days on market</div>
        ${badgeHtml}
      `;

      if (alt.vdpUrl && alt.vdpUrl !== "#") {
        card.addEventListener("click", () => window.open(alt.vdpUrl, "_blank"));
      }
      scrollRow.appendChild(card);
    }

    altSection.appendChild(scrollRow);
    results.appendChild(altSection);

    // ── Price History ──
    if (data.priceHistory.length > 0) {
      const histSection = document.createElement("div");
      histSection.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px 20px;margin-bottom:16px;";
      histSection.innerHTML = `<h3 style="font-size:13px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 12px 0;">Price History</h3>`;

      const table = document.createElement("table");
      table.style.cssText = "width:100%;border-collapse:collapse;font-size:13px;";
      table.innerHTML = `
        <thead>
          <tr>
            <th style="padding:6px 10px;text-align:left;color:#94a3b8;font-size:11px;text-transform:uppercase;border-bottom:1px solid #334155;">Date</th>
            <th style="padding:6px 10px;text-align:left;color:#94a3b8;font-size:11px;text-transform:uppercase;border-bottom:1px solid #334155;">Price</th>
            <th style="padding:6px 10px;text-align:left;color:#94a3b8;font-size:11px;text-transform:uppercase;border-bottom:1px solid #334155;">Dealer</th>
          </tr>
        </thead>
        <tbody>
          ${data.priceHistory.map((h, i) => {
            const prevPrice = i > 0 ? data.priceHistory[i - 1].price : h.price;
            const diff = h.price - prevPrice;
            const diffStr = i === 0 ? "" : ` <span style="color:${diff <= 0 ? "#10b981" : "#ef4444"};font-size:11px;">(${diff <= 0 ? "" : "+"}${fmtCurrency(diff)})</span>`;
            return `<tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:6px 10px;color:#e2e8f0;">${new Date(h.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
              <td style="padding:6px 10px;color:#e2e8f0;font-weight:600;">${fmtCurrency(h.price)}${diffStr}</td>
              <td style="padding:6px 10px;color:#94a3b8;">${h.dealer}</td>
            </tr>`;
          }).join("")}
        </tbody>
      `;
      histSection.appendChild(table);
      results.appendChild(histSection);
    }
  }

  function createPanel(title: string): { container: HTMLElement; body: HTMLElement } {
    const container = document.createElement("div");
    container.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px;";
    container.innerHTML = `<h3 style="font-size:13px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 12px 0;">${title}</h3>`;
    const body = document.createElement("div");
    container.appendChild(body);
    return { container, body };
  }

  // ── Responsive ──
  const style = document.createElement("style");
  style.textContent = `
    @media (max-width: 900px) {
      #results > div:nth-child(3) {
        grid-template-columns: 1fr !important;
      }
    }
    ::-webkit-scrollbar { height: 6px; }
    ::-webkit-scrollbar-track { background: #1e293b; border-radius: 3px; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #475569; }
  `;
  document.head.appendChild(style);
}

main();
