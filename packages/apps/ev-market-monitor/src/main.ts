import { App } from "@modelcontextprotocol/ext-apps";

const _safeApp = (() => { try { return new App({ name: "ev-market-monitor" });

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
      const r = await _safeApp.callServerTool({ name: toolName, arguments: args }); return r;
            
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
      if (r.ok) { const d = await r.json(); return { content: [{ type: "text", text: JSON.stringify(d) }] }; }
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

(_safeApp as any)?.connect?.();

// ─── Colors ────────────────────────────────────────────────────────────────

const C = {
  bg: "#0f172a",
  surface: "#1e293b",
  surfaceLight: "#334155",
  border: "#475569",
  text: "#f1f5f9",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  blue: "#3b82f6",
  blueLight: "#60a5fa",
  green: "#22c55e",
  greenLight: "#4ade80",
  orange: "#f97316",
  orangeLight: "#fb923c",
  red: "#ef4444",
  gray: "#6b7280",
  grayLight: "#9ca3af",
  purple: "#a855f7",
  yellow: "#eab308",
  cyan: "#06b6d4",
  white: "#ffffff",
};

// ─── Mock Data ─────────────────────────────────────────────────────────────

const MONTHS = [
  "Apr 25", "May 25", "Jun 25", "Jul 25", "Aug 25", "Sep 25",
  "Oct 25", "Nov 25", "Dec 25", "Jan 26", "Feb 26", "Mar 26",
];

// EV adoption % rising from 6% to 9%
const evAdoptionPct = [6.0, 6.2, 6.5, 6.7, 7.0, 7.3, 7.5, 7.8, 8.1, 8.4, 8.7, 9.0];
// Hybrid rising from 8% to 11%
const hybridAdoptionPct = [8.0, 8.2, 8.5, 8.7, 8.9, 9.2, 9.5, 9.7, 10.0, 10.3, 10.6, 11.0];
// ICE declining (remainder ballpark for trend)
const iceAdoptionPct = [86.0, 85.6, 85.0, 84.6, 84.1, 83.5, 83.0, 82.5, 81.9, 81.3, 80.7, 80.0];

// Price Parity data (EV vs ICE by body type)
const priceParityData = [
  { bodyType: "SUV", evPrice: 52400, icePrice: 42800 },
  { bodyType: "Sedan", evPrice: 41200, icePrice: 34600 },
  { bodyType: "Truck", evPrice: 62800, icePrice: 49200 },
  { bodyType: "Hatchback", evPrice: 33800, icePrice: 27400 },
];

// Brand EV Leaderboard
const brandLeaderboard = [
  { rank: 1, make: "Tesla", volume: 184250, evShare: 100.0, avgPrice: 44800, deprecRate: 28.2, daysSupply: 18, trend: "up" },
  { rank: 2, make: "Ford", volume: 42800, evShare: 12.4, avgPrice: 48200, deprecRate: 24.6, daysSupply: 32, trend: "up" },
  { rank: 3, make: "GM", volume: 38600, evShare: 10.8, avgPrice: 46500, deprecRate: 22.8, daysSupply: 28, trend: "up" },
  { rank: 4, make: "Hyundai", volume: 31400, evShare: 14.2, avgPrice: 39800, deprecRate: 20.4, daysSupply: 24, trend: "up" },
  { rank: 5, make: "BMW", volume: 22800, evShare: 9.6, avgPrice: 62400, deprecRate: 26.8, daysSupply: 36, trend: "flat" },
  { rank: 6, make: "Mercedes", volume: 18200, evShare: 8.2, avgPrice: 68200, deprecRate: 30.2, daysSupply: 42, trend: "down" },
  { rank: 7, make: "VW", volume: 16800, evShare: 7.4, avgPrice: 38600, deprecRate: 22.0, daysSupply: 30, trend: "up" },
  { rank: 8, make: "Kia", volume: 15400, evShare: 11.8, avgPrice: 42200, deprecRate: 19.6, daysSupply: 22, trend: "up" },
  { rank: 9, make: "Rivian", volume: 12200, evShare: 100.0, avgPrice: 74600, deprecRate: 34.8, daysSupply: 44, trend: "flat" },
  { rank: 10, make: "Lucid", volume: 4800, evShare: 100.0, avgPrice: 82400, deprecRate: 38.4, daysSupply: 62, trend: "down" },
];

// State Adoption Table
const stateAdoption = [
  { state: "California", penetration: 18.2, volume: 142800, yoyChange: 3.4 },
  { state: "Washington", penetration: 12.4, volume: 28600, yoyChange: 2.8 },
  { state: "New Jersey", penetration: 10.2, volume: 32400, yoyChange: 2.2 },
  { state: "Oregon", penetration: 9.8, volume: 14200, yoyChange: 2.6 },
  { state: "Colorado", penetration: 9.4, volume: 18800, yoyChange: 2.4 },
  { state: "Massachusetts", penetration: 9.0, volume: 22600, yoyChange: 1.8 },
  { state: "Connecticut", penetration: 8.6, volume: 11200, yoyChange: 1.6 },
  { state: "Maryland", penetration: 8.2, volume: 16400, yoyChange: 1.9 },
  { state: "New York", penetration: 7.8, volume: 48200, yoyChange: 1.5 },
  { state: "Vermont", penetration: 7.6, volume: 2400, yoyChange: 2.0 },
  { state: "Nevada", penetration: 7.2, volume: 8600, yoyChange: 2.1 },
  { state: "Arizona", penetration: 6.8, volume: 19400, yoyChange: 1.7 },
  { state: "Hawaii", penetration: 6.6, volume: 3200, yoyChange: 1.4 },
  { state: "Virginia", penetration: 6.4, volume: 21800, yoyChange: 1.3 },
  { state: "Florida", penetration: 6.2, volume: 52600, yoyChange: 1.1 },
];

// Depreciation curves over 12 months (% of original value remaining)
const evDepreciation = [100, 94, 88, 83, 78, 74, 70, 67, 64, 61, 59, 57];
const iceDepreciation = [100, 96, 93, 90, 87, 85, 83, 81, 79, 78, 76, 75];

// KPI Scorecard data
const kpiData = {
  evPenetration: { value: 9.0, trend: 3.0, label: "EV Penetration %" },
  priceGap: { value: 8460, label: "EV-to-ICE Price Gap" },
  deprecRatio: { value: 1.72, label: "EV-to-ICE Depreciation Ratio" },
  avgDaysSupply: { value: 28, label: "EV Avg Days Supply" },
  avgDOM: { value: 34, label: "EV Avg DOM" },
};

// ─── Render ────────────────────────────────────────────────────────────────

function render() {
  document.body.style.background = C.bg;
  document.body.style.color = C.text;
  document.body.style.fontFamily =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  document.body.style.padding = "16px";
  document.body.style.minHeight = "100vh";

  document.body.innerHTML = `
    <div id="app" style="max-width:1440px;margin:0 auto;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
        <div style="width:10px;height:32px;background:${C.blue};border-radius:4px;"></div>
        <h1 style="font-size:24px;font-weight:700;color:${C.text};">EV Market Monitor</h1>
        <span style="font-size:13px;color:${C.textDim};margin-left:auto;">Updated Mar 26, 2026</span>
      </div>

      <!-- KPI Scorecard Ribbon -->
      <div id="kpi-ribbon" style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:20px;"></div>

      <!-- Top Row: Adoption Trend + Price Parity -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
        <div style="background:${C.surface};border-radius:12px;border:1px solid ${C.border};padding:16px;">
          <h3 style="font-size:14px;font-weight:600;color:${C.textMuted};margin-bottom:12px;">Adoption Trend (12 Months)</h3>
          <canvas id="adoption-chart" width="640" height="320" style="width:100%;height:auto;"></canvas>
        </div>
        <div style="background:${C.surface};border-radius:12px;border:1px solid ${C.border};padding:16px;">
          <h3 style="font-size:14px;font-weight:600;color:${C.textMuted};margin-bottom:12px;">Price Parity Tracker</h3>
          <canvas id="parity-chart" width="640" height="320" style="width:100%;height:auto;"></canvas>
        </div>
      </div>

      <!-- Brand EV Leaderboard -->
      <div style="background:${C.surface};border-radius:12px;border:1px solid ${C.border};padding:16px;margin-bottom:16px;">
        <h3 style="font-size:14px;font-weight:600;color:${C.textMuted};margin-bottom:12px;">Brand EV Leaderboard</h3>
        <div id="leaderboard-table"></div>
      </div>

      <!-- Bottom Row: State Adoption + Depreciation -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div style="background:${C.surface};border-radius:12px;border:1px solid ${C.border};padding:16px;">
          <h3 style="font-size:14px;font-weight:600;color:${C.textMuted};margin-bottom:12px;">State EV Adoption (Top 15)</h3>
          <div id="state-table"></div>
        </div>
        <div style="background:${C.surface};border-radius:12px;border:1px solid ${C.border};padding:16px;">
          <h3 style="font-size:14px;font-weight:600;color:${C.textMuted};margin-bottom:12px;">Depreciation Comparison (12 Months)</h3>
          <canvas id="depreciation-chart" width="640" height="360" style="width:100%;height:auto;"></canvas>
        </div>
      </div>
    </div>
  `;

  renderKPIRibbon();
  renderAdoptionChart();
  renderParityChart();
  renderLeaderboardTable();
  renderStateTable();
  renderDepreciationChart();
}

// ─── KPI Scorecard Ribbon ──────────────────────────────────────────────────

function renderKPIRibbon() {
  const container = document.getElementById("kpi-ribbon")!;

  const cards = [
    {
      label: kpiData.evPenetration.label,
      value: `${kpiData.evPenetration.value}%`,
      sub: `+${kpiData.evPenetration.trend}% YoY`,
      color: C.blue,
      icon: "trending_up",
    },
    {
      label: kpiData.priceGap.label,
      value: `$${kpiData.priceGap.value.toLocaleString()}`,
      sub: "Avg across segments",
      color: C.orange,
      icon: "gap",
    },
    {
      label: kpiData.deprecRatio.label,
      value: `${kpiData.deprecRatio.value}x`,
      sub: "EV depreciates faster",
      color: C.red,
      icon: "ratio",
    },
    {
      label: kpiData.avgDaysSupply.label,
      value: `${kpiData.avgDaysSupply.value}`,
      sub: "Days of inventory",
      color: C.green,
      icon: "supply",
    },
    {
      label: kpiData.avgDOM.label,
      value: `${kpiData.avgDOM.value}`,
      sub: "Days on market",
      color: C.cyan,
      icon: "dom",
    },
  ];

  container.innerHTML = cards
    .map(
      (c) => `
    <div style="background:${C.surface};border-radius:10px;border:1px solid ${C.border};padding:16px;position:relative;overflow:hidden;">
      <div style="position:absolute;top:0;left:0;width:4px;height:100%;background:${c.color};"></div>
      <div style="padding-left:8px;">
        <div style="font-size:11px;font-weight:600;color:${C.textDim};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${c.label}</div>
        <div style="font-size:26px;font-weight:700;color:${C.text};margin-bottom:4px;">${c.value}</div>
        <div style="font-size:12px;color:${c.color === C.red ? C.red : C.green};font-weight:500;">${c.sub}</div>
      </div>
    </div>
  `
    )
    .join("");
}

// ─── Adoption Trend Chart (Canvas 2D Line Chart) ──────────────────────────

function renderAdoptionChart() {
  const canvas = document.getElementById("adoption-chart") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;

  // Clear
  ctx.fillStyle = C.surface;
  ctx.fillRect(0, 0, W, H);

  const padL = 55;
  const padR = 20;
  const padT = 20;
  const padB = 50;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const yMin = 0;
  const yMax = 100;

  function xPos(i: number) {
    return padL + (i / (MONTHS.length - 1)) * chartW;
  }
  function yPos(val: number) {
    return padT + chartH - ((val - yMin) / (yMax - yMin)) * chartH;
  }

  // Grid lines
  ctx.strokeStyle = C.surfaceLight;
  ctx.lineWidth = 0.5;
  const yTicks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  for (const t of yTicks) {
    ctx.beginPath();
    ctx.moveTo(padL, yPos(t));
    ctx.lineTo(padL + chartW, yPos(t));
    ctx.stroke();
  }

  // Y-axis labels
  ctx.fillStyle = C.textDim;
  ctx.font = "11px sans-serif";
  ctx.textAlign = "right";
  for (const t of yTicks) {
    ctx.fillText(`${t}%`, padL - 8, yPos(t) + 4);
  }

  // X-axis labels
  ctx.textAlign = "center";
  for (let i = 0; i < MONTHS.length; i++) {
    ctx.fillText(MONTHS[i], xPos(i), H - padB + 20);
  }

  // Draw line helper
  function drawLine(data: number[], color: string, lineWidth: number) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = xPos(i);
      const y = yPos(data[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Dots
    for (let i = 0; i < data.length; i++) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(xPos(i), yPos(data[i]), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw ICE first (bottom layer)
  drawLine(iceAdoptionPct, C.grayLight, 2);
  // Hybrid
  drawLine(hybridAdoptionPct, C.green, 2.5);
  // EV on top
  drawLine(evAdoptionPct, C.blue, 2.5);

  // End-of-line value labels
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "left";

  ctx.fillStyle = C.blue;
  ctx.fillText(`${evAdoptionPct[11]}%`, xPos(11) + 8, yPos(evAdoptionPct[11]) + 4);

  ctx.fillStyle = C.green;
  ctx.fillText(`${hybridAdoptionPct[11]}%`, xPos(11) + 8, yPos(hybridAdoptionPct[11]) + 4);

  ctx.fillStyle = C.grayLight;
  ctx.fillText(`${iceAdoptionPct[11]}%`, xPos(11) + 8, yPos(iceAdoptionPct[11]) + 4);

  // Legend
  const legendY = padT + 4;
  const legendX = padL + 10;

  function drawLegendItem(x: number, color: string, label: string) {
    ctx.fillStyle = color;
    ctx.fillRect(x, legendY, 14, 3);
    ctx.fillStyle = C.textMuted;
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 18, legendY + 5);
  }

  drawLegendItem(legendX, C.blue, "EV %");
  drawLegendItem(legendX + 80, C.green, "Hybrid %");
  drawLegendItem(legendX + 180, C.grayLight, "ICE %");
}

// ─── Price Parity Tracker (Canvas 2D Grouped Bar Chart) ────────────────────

function renderParityChart() {
  const canvas = document.getElementById("parity-chart") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = C.surface;
  ctx.fillRect(0, 0, W, H);

  const padL = 65;
  const padR = 20;
  const padT = 20;
  const padB = 50;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const maxPrice = 70000;

  function yPos(val: number) {
    return padT + chartH - (val / maxPrice) * chartH;
  }

  // Grid
  ctx.strokeStyle = C.surfaceLight;
  ctx.lineWidth = 0.5;
  const yTicks = [0, 10000, 20000, 30000, 40000, 50000, 60000, 70000];
  for (const t of yTicks) {
    ctx.beginPath();
    ctx.moveTo(padL, yPos(t));
    ctx.lineTo(padL + chartW, yPos(t));
    ctx.stroke();
  }

  // Y-axis labels
  ctx.fillStyle = C.textDim;
  ctx.font = "11px sans-serif";
  ctx.textAlign = "right";
  for (const t of yTicks) {
    ctx.fillText(`$${(t / 1000).toFixed(0)}K`, padL - 8, yPos(t) + 4);
  }

  const groupCount = priceParityData.length;
  const groupWidth = chartW / groupCount;
  const barWidth = groupWidth * 0.28;
  const gap = 6;

  for (let i = 0; i < groupCount; i++) {
    const d = priceParityData[i];
    const groupCenterX = padL + groupWidth * i + groupWidth / 2;

    // EV bar (left)
    const evBarX = groupCenterX - barWidth - gap / 2;
    const evBarH = (d.evPrice / maxPrice) * chartH;
    const evBarY = yPos(d.evPrice);

    // Rounded top for EV bar
    ctx.fillStyle = C.blue;
    roundedRect(ctx, evBarX, evBarY, barWidth, evBarH, 4);

    // ICE bar (right)
    const iceBarX = groupCenterX + gap / 2;
    const iceBarH = (d.icePrice / maxPrice) * chartH;
    const iceBarY = yPos(d.icePrice);

    ctx.fillStyle = C.orange;
    roundedRect(ctx, iceBarX, iceBarY, barWidth, iceBarH, 4);

    // Gap annotation
    const priceDiff = d.evPrice - d.icePrice;
    const midY = (evBarY + iceBarY) / 2;

    // Bracket line
    ctx.strokeStyle = C.textDim;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(evBarX + barWidth + 2, evBarY);
    ctx.lineTo(groupCenterX, evBarY);
    ctx.lineTo(groupCenterX, iceBarY);
    ctx.lineTo(iceBarX - 2, iceBarY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Gap label
    ctx.fillStyle = C.yellow;
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`+$${(priceDiff / 1000).toFixed(1)}K`, groupCenterX, midY - 4);

    // Body type label
    ctx.fillStyle = C.textMuted;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(d.bodyType, groupCenterX, H - padB + 20);
  }

  // Legend
  const legendY = padT + 4;
  ctx.fillStyle = C.blue;
  ctx.fillRect(padL + 10, legendY, 14, 10);
  ctx.fillStyle = C.textMuted;
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("EV Avg Price", padL + 28, legendY + 9);

  ctx.fillStyle = C.orange;
  ctx.fillRect(padL + 130, legendY, 14, 10);
  ctx.fillStyle = C.textMuted;
  ctx.fillText("ICE Avg Price", padL + 148, legendY + 9);
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

// ─── Brand EV Leaderboard Table ────────────────────────────────────────────

function renderLeaderboardTable() {
  const container = document.getElementById("leaderboard-table")!;

  const trendArrow = (t: string) => {
    if (t === "up") return `<span style="color:${C.green};">&#9650;</span>`;
    if (t === "down") return `<span style="color:${C.red};">&#9660;</span>`;
    return `<span style="color:${C.textDim};">&#9654;</span>`;
  };

  const headerStyle = `font-size:11px;font-weight:600;color:${C.textDim};text-transform:uppercase;letter-spacing:0.5px;padding:8px 12px;border-bottom:1px solid ${C.border};text-align:left;`;
  const cellStyle = `font-size:13px;padding:10px 12px;border-bottom:1px solid ${C.surfaceLight};`;

  let html = `<table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr>
        <th style="${headerStyle}">Rank</th>
        <th style="${headerStyle}">Make</th>
        <th style="${headerStyle}text-align:right;">EV Volume</th>
        <th style="${headerStyle}text-align:right;">EV Share %</th>
        <th style="${headerStyle}text-align:right;">Avg Price</th>
        <th style="${headerStyle}text-align:right;">Depreciation</th>
        <th style="${headerStyle}text-align:right;">Days Supply</th>
        <th style="${headerStyle}text-align:center;">Trend</th>
      </tr>
    </thead>
    <tbody>`;

  for (const row of brandLeaderboard) {
    const rowBg = row.rank % 2 === 0 ? C.surface : "transparent";
    html += `<tr style="background:${rowBg};">
      <td style="${cellStyle}color:${C.textDim};font-weight:600;">${row.rank}</td>
      <td style="${cellStyle}font-weight:600;color:${C.text};">${row.make}</td>
      <td style="${cellStyle}text-align:right;color:${C.text};">${row.volume.toLocaleString()}</td>
      <td style="${cellStyle}text-align:right;color:${row.evShare >= 50 ? C.blue : C.textMuted};">${row.evShare.toFixed(1)}%</td>
      <td style="${cellStyle}text-align:right;color:${C.text};">$${row.avgPrice.toLocaleString()}</td>
      <td style="${cellStyle}text-align:right;color:${row.deprecRate > 30 ? C.red : row.deprecRate > 25 ? C.orange : C.green};">${row.deprecRate.toFixed(1)}%</td>
      <td style="${cellStyle}text-align:right;color:${row.daysSupply > 40 ? C.red : row.daysSupply > 30 ? C.orange : C.green};">${row.daysSupply}</td>
      <td style="${cellStyle}text-align:center;">${trendArrow(row.trend)}</td>
    </tr>`;
  }

  html += `</tbody></table>`;
  container.innerHTML = html;
}

// ─── State Adoption Table ──────────────────────────────────────────────────

function renderStateTable() {
  const container = document.getElementById("state-table")!;

  const maxPen = stateAdoption[0].penetration;

  function penColor(pen: number): string {
    const intensity = pen / maxPen;
    if (intensity > 0.7) return `rgba(59,130,246,0.18)`;
    if (intensity > 0.5) return `rgba(59,130,246,0.12)`;
    if (intensity > 0.3) return `rgba(59,130,246,0.07)`;
    return "transparent";
  }

  const headerStyle = `font-size:11px;font-weight:600;color:${C.textDim};text-transform:uppercase;letter-spacing:0.5px;padding:7px 10px;border-bottom:1px solid ${C.border};text-align:left;`;
  const cellStyle = `font-size:12px;padding:7px 10px;border-bottom:1px solid ${C.surfaceLight};`;

  let html = `<div style="max-height:440px;overflow-y:auto;">
  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr>
        <th style="${headerStyle}">State</th>
        <th style="${headerStyle}text-align:right;">EV Penetration %</th>
        <th style="${headerStyle}text-align:right;">EV Volume</th>
        <th style="${headerStyle}text-align:right;">YoY Change</th>
      </tr>
    </thead>
    <tbody>`;

  for (const row of stateAdoption) {
    const bg = penColor(row.penetration);
    html += `<tr style="background:${bg};">
      <td style="${cellStyle}font-weight:600;color:${C.text};">${row.state}</td>
      <td style="${cellStyle}text-align:right;color:${C.blue};font-weight:600;">${row.penetration.toFixed(1)}%</td>
      <td style="${cellStyle}text-align:right;color:${C.text};">${row.volume.toLocaleString()}</td>
      <td style="${cellStyle}text-align:right;color:${C.green};font-weight:500;">+${row.yoyChange.toFixed(1)}%</td>
    </tr>`;
  }

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

// ─── Depreciation Comparison Chart (Canvas 2D) ────────────────────────────

function renderDepreciationChart() {
  const canvas = document.getElementById("depreciation-chart") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = C.surface;
  ctx.fillRect(0, 0, W, H);

  const padL = 55;
  const padR = 20;
  const padT = 20;
  const padB = 50;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const yMin = 50;
  const yMax = 105;

  function xPos(i: number) {
    return padL + (i / (MONTHS.length - 1)) * chartW;
  }
  function yPos(val: number) {
    return padT + chartH - ((val - yMin) / (yMax - yMin)) * chartH;
  }

  // Grid
  ctx.strokeStyle = C.surfaceLight;
  ctx.lineWidth = 0.5;
  const yTicks = [50, 60, 70, 80, 90, 100];
  for (const t of yTicks) {
    ctx.beginPath();
    ctx.moveTo(padL, yPos(t));
    ctx.lineTo(padL + chartW, yPos(t));
    ctx.stroke();
  }

  // Y-axis labels
  ctx.fillStyle = C.textDim;
  ctx.font = "11px sans-serif";
  ctx.textAlign = "right";
  for (const t of yTicks) {
    ctx.fillText(`${t}%`, padL - 8, yPos(t) + 4);
  }

  // X-axis labels
  ctx.textAlign = "center";
  for (let i = 0; i < MONTHS.length; i++) {
    ctx.fillText(MONTHS[i], xPos(i), H - padB + 20);
  }

  // Fill area between the two curves (depreciation gap)
  ctx.beginPath();
  // ICE top edge (left to right)
  for (let i = 0; i < iceDepreciation.length; i++) {
    const x = xPos(i);
    const y = yPos(iceDepreciation[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  // EV bottom edge (right to left)
  for (let i = evDepreciation.length - 1; i >= 0; i--) {
    ctx.lineTo(xPos(i), yPos(evDepreciation[i]));
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(239, 68, 68, 0.12)";
  ctx.fill();

  // Draw ICE line
  ctx.strokeStyle = C.orange;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i < iceDepreciation.length; i++) {
    const x = xPos(i);
    const y = yPos(iceDepreciation[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Draw EV line
  ctx.strokeStyle = C.blue;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i < evDepreciation.length; i++) {
    const x = xPos(i);
    const y = yPos(evDepreciation[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Dots on both lines
  for (let i = 0; i < MONTHS.length; i++) {
    ctx.fillStyle = C.orange;
    ctx.beginPath();
    ctx.arc(xPos(i), yPos(iceDepreciation[i]), 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = C.blue;
    ctx.beginPath();
    ctx.arc(xPos(i), yPos(evDepreciation[i]), 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // End labels
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = C.orange;
  ctx.fillText(`${iceDepreciation[11]}%`, xPos(11) + 8, yPos(iceDepreciation[11]) + 4);
  ctx.fillStyle = C.blue;
  ctx.fillText(`${evDepreciation[11]}%`, xPos(11) + 8, yPos(evDepreciation[11]) + 4);

  // Gap annotation in middle
  const midIdx = 6;
  const midGap = iceDepreciation[midIdx] - evDepreciation[midIdx];
  const midGapY = (yPos(iceDepreciation[midIdx]) + yPos(evDepreciation[midIdx])) / 2;

  // Arrow lines
  ctx.strokeStyle = C.red;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(xPos(midIdx), yPos(iceDepreciation[midIdx]));
  ctx.lineTo(xPos(midIdx), yPos(evDepreciation[midIdx]));
  ctx.stroke();
  ctx.setLineDash([]);

  // Gap label background
  const gapLabel = `${midGap}pt gap`;
  ctx.font = "bold 11px sans-serif";
  const gapLabelW = ctx.measureText(gapLabel).width + 12;
  ctx.fillStyle = "rgba(239, 68, 68, 0.25)";
  roundedRect(ctx, xPos(midIdx) - gapLabelW / 2, midGapY - 10, gapLabelW, 20, 4);
  ctx.fillStyle = C.red;
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(gapLabel, xPos(midIdx), midGapY + 4);

  // End gap annotation
  const endGap = iceDepreciation[11] - evDepreciation[11];
  const endGapY = (yPos(iceDepreciation[11]) + yPos(evDepreciation[11])) / 2;

  ctx.strokeStyle = C.red;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(xPos(11), yPos(iceDepreciation[11]));
  ctx.lineTo(xPos(11), yPos(evDepreciation[11]));
  ctx.stroke();
  ctx.setLineDash([]);

  const endLabel = `${endGap}pt gap (widening)`;
  ctx.font = "bold 11px sans-serif";
  const endLabelW = ctx.measureText(endLabel).width + 12;
  ctx.fillStyle = "rgba(239, 68, 68, 0.25)";
  roundedRect(ctx, xPos(11) - endLabelW - 4, endGapY - 10, endLabelW, 20, 4);
  ctx.fillStyle = C.red;
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(endLabel, xPos(11) - endLabelW / 2 - 4 + endLabelW / 2, endGapY + 4);

  // Legend
  const legendY = padT + 4;
  const legendX = padL + 10;

  ctx.fillStyle = C.blue;
  ctx.fillRect(legendX, legendY, 14, 3);
  ctx.fillStyle = C.textMuted;
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("EV Value Retained %", legendX + 18, legendY + 5);

  ctx.fillStyle = C.orange;
  ctx.fillRect(legendX + 160, legendY, 14, 3);
  ctx.fillStyle = C.textMuted;
  ctx.fillText("ICE Value Retained %", legendX + 178, legendY + 5);

  // Shaded area label
  ctx.fillStyle = "rgba(239, 68, 68, 0.5)";
  ctx.fillRect(legendX + 340, legendY - 2, 14, 8);
  ctx.fillStyle = C.textMuted;
  ctx.fillText("Depreciation Gap", legendX + 358, legendY + 5);
}

// ─── Boot ──────────────────────────────────────────────────────────────────

render();
