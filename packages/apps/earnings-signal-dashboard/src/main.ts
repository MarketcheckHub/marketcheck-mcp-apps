import { App } from "@modelcontextprotocol/ext-apps";

const _safeApp = (() => { try { return new App({ name: "earnings-signal-dashboard" });

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

// ─── Types ──────────────────────────────────────────────────────────────────

type Signal = "BULL" | "BEAR" | "NEUTRAL";
type CompositeSignal = "BULLISH" | "BEARISH" | "MIXED" | "NEUTRAL";
type SignalStrength = "Strong" | "Moderate" | "Weak";

interface SparklineData {
  label: string;
  values: number[];
}

interface DimensionRow {
  name: string;
  metric: string;
  currentValue: string;
  changeValue: string;
  signal: Signal;
  sparkline: SparklineData;
  sampleSize: string;
}

interface ScenarioPanel {
  bullCase: string[];
  bearCase: string[];
  keyRisk: string;
}

interface TickerData {
  ticker: string;
  companyName: string;
  makes: string[];
  composite: CompositeSignal;
  strength: SignalStrength;
  confidence: number;
  dimensions: DimensionRow[];
  scenario: ScenarioPanel;
}

interface TickerOption {
  ticker: string;
  companyName: string;
  makes: string[];
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

const TICKER_OPTIONS: TickerOption[] = [
  { ticker: "F", companyName: "Ford Motor Company", makes: ["Ford", "Lincoln"] },
  { ticker: "GM", companyName: "General Motors", makes: ["Chevrolet", "GMC", "Buick", "Cadillac"] },
  { ticker: "TM", companyName: "Toyota Motor Corp", makes: ["Toyota", "Lexus"] },
  { ticker: "HMC", companyName: "Honda Motor Co", makes: ["Honda", "Acura"] },
  { ticker: "TSLA", companyName: "Tesla Inc", makes: ["Tesla"] },
  { ticker: "STLA", companyName: "Stellantis NV", makes: ["Jeep", "Ram", "Dodge", "Chrysler"] },
  { ticker: "HYMTF", companyName: "Hyundai Motor Co", makes: ["Hyundai", "Genesis"] },
  { ticker: "NSANY", companyName: "Nissan Motor Co", makes: ["Nissan", "Infiniti"] },
  { ticker: "RIVN", companyName: "Rivian Automotive", makes: ["Rivian"] },
];

function getMockData(ticker: string): TickerData | null {
  const opt = TICKER_OPTIONS.find((t) => t.ticker === ticker);
  if (!opt) return null;

  // GM has specific mock data; others get generated variations
  if (ticker === "GM") {
    return {
      ticker: "GM",
      companyName: "General Motors",
      makes: ["Chevrolet", "GMC", "Buick", "Cadillac"],
      composite: "MIXED",
      strength: "Moderate",
      confidence: 62,
      dimensions: [
        {
          name: "Volume Momentum",
          metric: "Monthly Sales Volume",
          currentValue: "218,450",
          changeValue: "+3.2% MoM",
          signal: "BULL",
          sparkline: { label: "6M Volume", values: [198200, 203400, 207800, 211300, 215600, 218450] },
          sampleSize: "48,200 listings",
        },
        {
          name: "Pricing Power",
          metric: "Avg Selling Price",
          currentValue: "$42,180",
          changeValue: "-0.8% MoM",
          signal: "NEUTRAL",
          sparkline: { label: "6M ASP", values: [43100, 42900, 42650, 42500, 42350, 42180] },
          sampleSize: "36,800 transactions",
        },
        {
          name: "Inventory Health",
          metric: "Days Supply",
          currentValue: "52 days",
          changeValue: "+4 days MoM",
          signal: "NEUTRAL",
          sparkline: { label: "6M Days Supply", values: [41, 44, 46, 48, 50, 52] },
          sampleSize: "12,400 dealer lots",
        },
        {
          name: "DOM Velocity",
          metric: "Avg Days on Market",
          currentValue: "28 days",
          changeValue: "-2 days MoM",
          signal: "BULL",
          sparkline: { label: "6M DOM", values: [35, 33, 32, 31, 30, 28] },
          sampleSize: "41,600 sold units",
        },
        {
          name: "EV Mix",
          metric: "EV % of Sales",
          currentValue: "4.2%",
          changeValue: "+0.6pp MoM",
          signal: "NEUTRAL",
          sparkline: { label: "6M EV Mix", values: [2.1, 2.6, 3.0, 3.4, 3.8, 4.2] },
          sampleSize: "9,170 EV units",
        },
        {
          name: "New/Used Mix",
          metric: "New:Used Ratio",
          currentValue: "35 / 65",
          changeValue: "-1pp new MoM",
          signal: "NEUTRAL",
          sparkline: { label: "6M New %", values: [39, 38, 37, 36, 36, 35] },
          sampleSize: "218,450 total units",
        },
      ],
      scenario: {
        bullCase: [
          "Volume momentum accelerating (+3.2% MoM) with truck/SUV mix strength in Silverado and Equinox",
          "DOM compression (-2 days) signals strong consumer demand pull-through, supporting margin stability",
          "EV ramp on Equinox EV at $33k price point positions well for mass-market adoption curve",
        ],
        bearCase: [
          "ASP erosion (-0.8%) amid rising inventory (52 days) could pressure gross margins in Q2 guidance",
          "New vehicle share declining (35%) suggests used market cannibalization risk to dealer profitability",
          "Days supply trending up 27% from 6-month low; may force incentive spend increase to clear lots",
        ],
        keyRisk:
          "If inventory exceeds 60-day supply threshold, expect 150-200bp margin compression from incremental incentives, potentially shaving $0.15-0.20 from Q2 EPS consensus of $2.45.",
      },
    };
  }

  // Generate realistic variations for other tickers
  const seed = ticker.charCodeAt(0) + ticker.charCodeAt(ticker.length - 1);
  const r = (base: number, range: number) => base + ((seed * 7) % 100) / 100 * range - range / 2;
  const volumeBase = 80000 + (seed % 20) * 12000;
  const aspBase = 35000 + (seed % 15) * 2000;
  const daysSupply = 40 + (seed % 30);
  const dom = 25 + (seed % 15);
  const evMix = 1.5 + (seed % 40) / 10;
  const newPct = 30 + (seed % 20);

  const volChange = r(2, 8);
  const aspChange = r(-1, 4);
  const domChange = r(-1, 4);

  const volSignal: Signal = volChange > 2 ? "BULL" : volChange < -2 ? "BEAR" : "NEUTRAL";
  const aspSignal: Signal = aspChange > 1 ? "BULL" : aspChange < -1.5 ? "BEAR" : "NEUTRAL";
  const invSignal: Signal = daysSupply < 45 ? "BULL" : daysSupply > 65 ? "BEAR" : "NEUTRAL";
  const domSignal: Signal = domChange < -1 ? "BULL" : domChange > 2 ? "BEAR" : "NEUTRAL";
  const evSignal: Signal = evMix > 5 ? "BULL" : evMix < 2 ? "BEAR" : "NEUTRAL";
  const mixSignal: Signal = newPct > 42 ? "BULL" : newPct < 30 ? "BEAR" : "NEUTRAL";

  const signals = [volSignal, aspSignal, invSignal, domSignal, evSignal, mixSignal];
  const bulls = signals.filter((s) => s === "BULL").length;
  const bears = signals.filter((s) => s === "BEAR").length;
  let composite: CompositeSignal = "NEUTRAL";
  let strength: SignalStrength = "Weak";
  let confidence = 45;
  if (bulls >= 4) { composite = "BULLISH"; strength = "Strong"; confidence = 78 + (seed % 12); }
  else if (bears >= 4) { composite = "BEARISH"; strength = "Strong"; confidence = 75 + (seed % 15); }
  else if (bulls >= 3 && bears <= 1) { composite = "BULLISH"; strength = "Moderate"; confidence = 60 + (seed % 15); }
  else if (bears >= 3 && bulls <= 1) { composite = "BEARISH"; strength = "Moderate"; confidence = 58 + (seed % 15); }
  else if (bulls >= 2 || bears >= 2) { composite = "MIXED"; strength = "Moderate"; confidence = 50 + (seed % 18); }
  else { composite = "NEUTRAL"; strength = "Weak"; confidence = 40 + (seed % 15); }

  const mkSparkline = (base: number, trend: number): number[] => {
    const pts: number[] = [];
    for (let i = 0; i < 6; i++) {
      pts.push(Math.round((base + trend * (i - 5) + (((seed * (i + 3)) % 17) - 8) * (base / 200)) * 100) / 100);
    }
    return pts;
  };

  return {
    ticker: opt.ticker,
    companyName: opt.companyName,
    makes: opt.makes,
    composite,
    strength,
    confidence,
    dimensions: [
      {
        name: "Volume Momentum",
        metric: "Monthly Sales Volume",
        currentValue: volumeBase.toLocaleString(),
        changeValue: `${volChange > 0 ? "+" : ""}${volChange.toFixed(1)}% MoM`,
        signal: volSignal,
        sparkline: { label: "6M Volume", values: mkSparkline(volumeBase, volumeBase * volChange / 600) },
        sampleSize: `${Math.round(volumeBase * 0.22).toLocaleString()} listings`,
      },
      {
        name: "Pricing Power",
        metric: "Avg Selling Price",
        currentValue: `$${aspBase.toLocaleString()}`,
        changeValue: `${aspChange > 0 ? "+" : ""}${aspChange.toFixed(1)}% MoM`,
        signal: aspSignal,
        sparkline: { label: "6M ASP", values: mkSparkline(aspBase, aspBase * aspChange / 600) },
        sampleSize: `${Math.round(volumeBase * 0.17).toLocaleString()} transactions`,
      },
      {
        name: "Inventory Health",
        metric: "Days Supply",
        currentValue: `${daysSupply} days`,
        changeValue: `${daysSupply > 48 ? "+" : ""}${Math.round(daysSupply - 48)} days MoM`,
        signal: invSignal,
        sparkline: { label: "6M Days Supply", values: mkSparkline(daysSupply, (daysSupply - 48) / 6) },
        sampleSize: `${(4000 + (seed % 10) * 800).toLocaleString()} dealer lots`,
      },
      {
        name: "DOM Velocity",
        metric: "Avg Days on Market",
        currentValue: `${dom} days`,
        changeValue: `${domChange > 0 ? "+" : ""}${domChange.toFixed(0)} days MoM`,
        signal: domSignal,
        sparkline: { label: "6M DOM", values: mkSparkline(dom, domChange / 6) },
        sampleSize: `${Math.round(volumeBase * 0.19).toLocaleString()} sold units`,
      },
      {
        name: "EV Mix",
        metric: "EV % of Sales",
        currentValue: `${evMix.toFixed(1)}%`,
        changeValue: `+${(evMix * 0.12).toFixed(1)}pp MoM`,
        signal: evSignal,
        sparkline: { label: "6M EV Mix", values: mkSparkline(evMix, evMix * 0.12 / 6) },
        sampleSize: `${Math.round(volumeBase * evMix / 100).toLocaleString()} EV units`,
      },
      {
        name: "New/Used Mix",
        metric: "New:Used Ratio",
        currentValue: `${newPct} / ${100 - newPct}`,
        changeValue: `${newPct > 36 ? "+" : "-"}1pp new MoM`,
        signal: mixSignal,
        sparkline: { label: "6M New %", values: mkSparkline(newPct, (newPct > 36 ? 1 : -1) / 6) },
        sampleSize: `${volumeBase.toLocaleString()} total units`,
      },
    ],
    scenario: {
      bullCase: [
        `${opt.makes[0]} sales volume trending upward with strong retail demand in key segments`,
        `Days on market compressing suggests pricing discipline and healthy sell-through rates`,
        `EV product pipeline and mix growth aligned with regulatory incentive tailwinds`,
      ],
      bearCase: [
        `Average selling price erosion may signal incentive-driven volume rather than organic demand`,
        `Inventory days supply elevated above historical norms, risking margin compression`,
        `New vehicle market share declining as used segment absorbs incremental demand`,
      ],
      keyRisk: `Inventory normalization trajectory is the critical variable for ${opt.ticker} margin guidance. Monitor 60-day supply threshold for incentive escalation risk.`,
    },
  };
}

// ─── State ──────────────────────────────────────────────────────────────────

let state = {
  selectedTicker: null as string | null,
  data: null as TickerData | null,
};

// ─── Rendering ──────────────────────────────────────────────────────────────

function getSignalColor(signal: Signal): string {
  switch (signal) {
    case "BULL": return "#22c55e";
    case "BEAR": return "#ef4444";
    case "NEUTRAL": return "#6b7280";
  }
}

function getSignalBg(signal: Signal): string {
  switch (signal) {
    case "BULL": return "rgba(34,197,94,0.15)";
    case "BEAR": return "rgba(239,68,68,0.15)";
    case "NEUTRAL": return "rgba(107,114,128,0.15)";
  }
}

function getCompositeColor(signal: CompositeSignal): string {
  switch (signal) {
    case "BULLISH": return "#22c55e";
    case "BEARISH": return "#ef4444";
    case "MIXED": return "#eab308";
    case "NEUTRAL": return "#6b7280";
  }
}

function getCompositeBg(signal: CompositeSignal): string {
  switch (signal) {
    case "BULLISH": return "rgba(34,197,94,0.18)";
    case "BEARISH": return "rgba(239,68,68,0.18)";
    case "MIXED": return "rgba(234,179,8,0.18)";
    case "NEUTRAL": return "rgba(107,114,128,0.18)";
  }
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

  // Fill area
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i < values.length; i++) {
    const x = (i / (values.length - 1)) * w;
    const y = padY + usableH - ((values[i] - min) / range) * usableH;
    if (i === 0) ctx.lineTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = color.replace(")", ",0.12)").replace("rgb(", "rgba(").replace("rgba", "rgba");
  // Simple alpha overlay
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1.0;

  // Line
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

  // End dot
  const lastX = w;
  const lastY = padY + usableH - ((values[values.length - 1] - min) / range) * usableH;
  ctx.beginPath();
  ctx.arc(lastX - 1, lastY, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function render(): void {
  document.body.innerHTML = "";

  const root = document.createElement("div");
  root.style.cssText = `
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f172a;
    color: #e2e8f0;
    min-height: 100vh;
    padding: 20px;
  `;

  // ─── Header ─────────────────────────────────────────────────────────
  const header = document.createElement("div");
  header.style.cssText = `
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 20px; padding-bottom: 16px;
    border-bottom: 1px solid rgba(148,163,184,0.15);
  `;

  const titleBlock = document.createElement("div");
  const title = document.createElement("h1");
  title.textContent = "Earnings Signal Dashboard";
  title.style.cssText = "font-size: 22px; font-weight: 700; color: #f1f5f9; margin-bottom: 4px;";
  const subtitle = document.createElement("div");
  subtitle.textContent = "Auto OEM Pre-Earnings Intelligence";
  subtitle.style.cssText = "font-size: 13px; color: #94a3b8;";
  titleBlock.appendChild(title);
  titleBlock.appendChild(subtitle);
  header.appendChild(titleBlock);
  root.appendChild(header);

  // ─── Ticker Input Bar ───────────────────────────────────────────────
  const inputBar = document.createElement("div");
  inputBar.style.cssText = `
    display: flex; align-items: center; gap: 12px;
    background: #1e293b; border: 1px solid rgba(148,163,184,0.15);
    border-radius: 10px; padding: 14px 18px; margin-bottom: 20px;
  `;

  const selectLabel = document.createElement("label");
  selectLabel.textContent = "Ticker";
  selectLabel.style.cssText = "font-size: 13px; font-weight: 600; color: #94a3b8; white-space: nowrap;";

  const select = document.createElement("select");
  select.style.cssText = `
    background: #0f172a; color: #e2e8f0; border: 1px solid rgba(148,163,184,0.25);
    border-radius: 6px; padding: 8px 12px; font-size: 14px; min-width: 140px;
    cursor: pointer; outline: none;
  `;
  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = "Select ticker...";
  select.appendChild(defaultOpt);
  for (const t of TICKER_OPTIONS) {
    const o = document.createElement("option");
    o.value = t.ticker;
    o.textContent = `${t.ticker} - ${t.companyName}`;
    if (t.ticker === state.selectedTicker) o.selected = true;
    select.appendChild(o);
  }
  select.addEventListener("change", () => {
    state.selectedTicker = select.value || null;
    state.data = null;
    render();
  });

  const analyzeBtn = document.createElement("button");
  analyzeBtn.textContent = "Analyze";
  analyzeBtn.style.cssText = `
    background: #3b82f6; color: #fff; border: none; border-radius: 6px;
    padding: 8px 20px; font-size: 14px; font-weight: 600; cursor: pointer;
    transition: background 0.15s;
  `;
  analyzeBtn.addEventListener("mouseenter", () => { analyzeBtn.style.background = "#2563eb"; });
  analyzeBtn.addEventListener("mouseleave", () => { analyzeBtn.style.background = "#3b82f6"; });
  analyzeBtn.addEventListener("click", () => {
    if (state.selectedTicker) {
      state.data = getMockData(state.selectedTicker);
      render();
    }
  });

  const tickerInfo = document.createElement("div");
  tickerInfo.style.cssText = "flex: 1; text-align: right; font-size: 13px; color: #94a3b8;";
  if (state.selectedTicker) {
    const opt = TICKER_OPTIONS.find((t) => t.ticker === state.selectedTicker);
    if (opt) {
      tickerInfo.innerHTML = `<span style="color:#f1f5f9;font-weight:600;">${opt.companyName}</span> <span style="color:#64748b;margin:0 6px;">|</span> Makes: <span style="color:#cbd5e1;">${opt.makes.join(", ")}</span>`;
    }
  }

  inputBar.appendChild(selectLabel);
  inputBar.appendChild(select);
  inputBar.appendChild(analyzeBtn);
  inputBar.appendChild(tickerInfo);
  root.appendChild(inputBar);

  // ─── Main Content (only if data loaded) ─────────────────────────────
  if (state.data) {
    const d = state.data;

    // ─── Composite Signal Banner ────────────────────────────────────
    const banner = document.createElement("div");
    banner.style.cssText = `
      background: #1e293b; border: 1px solid rgba(148,163,184,0.15);
      border-radius: 10px; padding: 20px 24px; margin-bottom: 20px;
      display: flex; align-items: center; gap: 28px;
    `;

    // Composite badge
    const badgeContainer = document.createElement("div");
    badgeContainer.style.cssText = "display: flex; flex-direction: column; align-items: center; gap: 6px;";

    const compositeBadge = document.createElement("div");
    const cColor = getCompositeColor(d.composite);
    compositeBadge.textContent = d.composite;
    compositeBadge.style.cssText = `
      font-size: 22px; font-weight: 800; letter-spacing: 1.5px;
      color: ${cColor}; background: ${getCompositeBg(d.composite)};
      border: 2px solid ${cColor}; border-radius: 10px;
      padding: 10px 28px; text-align: center;
    `;

    const strengthLabel = document.createElement("div");
    strengthLabel.textContent = `${d.strength} Signal`;
    strengthLabel.style.cssText = `font-size: 13px; color: ${cColor}; font-weight: 600;`;

    badgeContainer.appendChild(compositeBadge);
    badgeContainer.appendChild(strengthLabel);
    banner.appendChild(badgeContainer);

    // Confidence bar
    const confSection = document.createElement("div");
    confSection.style.cssText = "flex: 1;";

    const confHeader = document.createElement("div");
    confHeader.style.cssText = "display: flex; justify-content: space-between; margin-bottom: 6px;";
    const confLabel = document.createElement("span");
    confLabel.textContent = "Confidence Score";
    confLabel.style.cssText = "font-size: 12px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;";
    const confValue = document.createElement("span");
    confValue.textContent = `${d.confidence}%`;
    confValue.style.cssText = `font-size: 14px; font-weight: 700; color: ${cColor};`;
    confHeader.appendChild(confLabel);
    confHeader.appendChild(confValue);

    const barTrack = document.createElement("div");
    barTrack.style.cssText = `
      height: 10px; background: rgba(148,163,184,0.12); border-radius: 5px;
      overflow: hidden;
    `;
    const barFill = document.createElement("div");
    barFill.style.cssText = `
      height: 100%; width: ${d.confidence}%; background: ${cColor};
      border-radius: 5px; transition: width 0.6s ease;
    `;
    barTrack.appendChild(barFill);

    confSection.appendChild(confHeader);
    confSection.appendChild(barTrack);
    banner.appendChild(confSection);

    // Signal dimension summary (mini badges)
    const dimSummary = document.createElement("div");
    dimSummary.style.cssText = "display: flex; gap: 6px; flex-wrap: wrap;";
    for (const dim of d.dimensions) {
      const mini = document.createElement("div");
      const sc = getSignalColor(dim.signal);
      mini.textContent = dim.name.split(" ")[0];
      mini.style.cssText = `
        font-size: 10px; font-weight: 600; padding: 3px 8px;
        border-radius: 4px; color: ${sc}; background: ${getSignalBg(dim.signal)};
        border: 1px solid ${sc}33;
      `;
      dimSummary.appendChild(mini);
    }
    banner.appendChild(dimSummary);

    root.appendChild(banner);

    // ─── 6-Dimension Signal Matrix ──────────────────────────────────
    const matrixCard = document.createElement("div");
    matrixCard.style.cssText = `
      background: #1e293b; border: 1px solid rgba(148,163,184,0.15);
      border-radius: 10px; padding: 0; margin-bottom: 20px; overflow: hidden;
    `;

    const matrixTitle = document.createElement("div");
    matrixTitle.textContent = "6-Dimension Signal Matrix";
    matrixTitle.style.cssText = `
      font-size: 15px; font-weight: 700; color: #f1f5f9;
      padding: 16px 20px; border-bottom: 1px solid rgba(148,163,184,0.1);
    `;
    matrixCard.appendChild(matrixTitle);

    const table = document.createElement("table");
    table.style.cssText = "width: 100%; border-collapse: collapse;";

    // Header
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const headers = ["Dimension", "Current Value", "Change", "Trend (6M)", "Signal", "Sample Size"];
    for (const h of headers) {
      const th = document.createElement("th");
      th.textContent = h;
      th.style.cssText = `
        text-align: left; padding: 10px 16px; font-size: 11px;
        font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
        color: #64748b; border-bottom: 1px solid rgba(148,163,184,0.1);
        background: rgba(15,23,42,0.5);
      `;
      if (h === "Trend (6M)") th.style.textAlign = "center";
      if (h === "Signal") th.style.textAlign = "center";
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement("tbody");
    for (let i = 0; i < d.dimensions.length; i++) {
      const dim = d.dimensions[i];
      const tr = document.createElement("tr");
      tr.style.cssText = `border-bottom: 1px solid rgba(148,163,184,0.06);${i % 2 === 1 ? " background: rgba(15,23,42,0.3);" : ""}`;

      // Dimension name
      const tdName = document.createElement("td");
      tdName.style.cssText = "padding: 12px 16px;";
      const nameMain = document.createElement("div");
      nameMain.textContent = dim.name;
      nameMain.style.cssText = "font-size: 14px; font-weight: 600; color: #f1f5f9;";
      const nameSub = document.createElement("div");
      nameSub.textContent = dim.metric;
      nameSub.style.cssText = "font-size: 11px; color: #64748b; margin-top: 2px;";
      tdName.appendChild(nameMain);
      tdName.appendChild(nameSub);
      tr.appendChild(tdName);

      // Current Value
      const tdVal = document.createElement("td");
      tdVal.textContent = dim.currentValue;
      tdVal.style.cssText = "padding: 12px 16px; font-size: 14px; font-weight: 600; color: #e2e8f0; font-variant-numeric: tabular-nums;";
      tr.appendChild(tdVal);

      // Change
      const tdChange = document.createElement("td");
      const changeColor = dim.signal === "BULL" ? "#22c55e" : dim.signal === "BEAR" ? "#ef4444" : "#94a3b8";
      tdChange.textContent = dim.changeValue;
      tdChange.style.cssText = `padding: 12px 16px; font-size: 13px; font-weight: 600; color: ${changeColor}; font-variant-numeric: tabular-nums;`;
      tr.appendChild(tdChange);

      // Sparkline (Canvas)
      const tdSparkline = document.createElement("td");
      tdSparkline.style.cssText = "padding: 12px 16px; text-align: center;";
      const canvas = document.createElement("canvas");
      canvas.width = 60;
      canvas.height = 20;
      canvas.style.cssText = "display: inline-block; vertical-align: middle;";
      tdSparkline.appendChild(canvas);
      tr.appendChild(tdSparkline);

      // Signal badge
      const tdSignal = document.createElement("td");
      tdSignal.style.cssText = "padding: 12px 16px; text-align: center;";
      const badge = document.createElement("span");
      const sColor = getSignalColor(dim.signal);
      badge.textContent = dim.signal;
      badge.style.cssText = `
        display: inline-block; padding: 3px 12px; border-radius: 4px;
        font-size: 11px; font-weight: 700; letter-spacing: 0.5px;
        color: ${sColor}; background: ${getSignalBg(dim.signal)};
        border: 1px solid ${sColor}44;
      `;
      tdSignal.appendChild(badge);
      tr.appendChild(tdSignal);

      // Sample Size
      const tdSample = document.createElement("td");
      tdSample.textContent = dim.sampleSize;
      tdSample.style.cssText = "padding: 12px 16px; font-size: 12px; color: #64748b; font-variant-numeric: tabular-nums;";
      tr.appendChild(tdSample);

      tbody.appendChild(tr);

      // Defer sparkline drawing
      requestAnimationFrame(() => {
        drawSparkline(canvas, dim.sparkline.values, getSignalColor(dim.signal));
      });
    }
    table.appendChild(tbody);
    matrixCard.appendChild(table);
    root.appendChild(matrixCard);

    // ─── Bull/Bear Scenario Panel ───────────────────────────────────
    const scenarioCard = document.createElement("div");
    scenarioCard.style.cssText = `
      background: #1e293b; border: 1px solid rgba(148,163,184,0.15);
      border-radius: 10px; overflow: hidden;
    `;

    const scenarioTitle = document.createElement("div");
    scenarioTitle.textContent = "Bull / Bear Scenario Analysis";
    scenarioTitle.style.cssText = `
      font-size: 15px; font-weight: 700; color: #f1f5f9;
      padding: 16px 20px; border-bottom: 1px solid rgba(148,163,184,0.1);
    `;
    scenarioCard.appendChild(scenarioTitle);

    const scenarioBody = document.createElement("div");
    scenarioBody.style.cssText = "padding: 20px;";

    // Two-column layout
    const columns = document.createElement("div");
    columns.style.cssText = "display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 20px;";

    // Bull Case
    const bullCol = document.createElement("div");
    const bullHeader = document.createElement("div");
    bullHeader.style.cssText = "display: flex; align-items: center; gap: 8px; margin-bottom: 12px;";
    const bullIcon = document.createElement("span");
    bullIcon.textContent = "BULL CASE";
    bullIcon.style.cssText = `
      font-size: 11px; font-weight: 700; letter-spacing: 1px;
      color: #22c55e; background: rgba(34,197,94,0.15);
      padding: 4px 10px; border-radius: 4px;
    `;
    bullHeader.appendChild(bullIcon);
    bullCol.appendChild(bullHeader);

    for (const bullet of d.scenario.bullCase) {
      const item = document.createElement("div");
      item.style.cssText = "display: flex; gap: 8px; margin-bottom: 10px; align-items: flex-start;";
      const dot = document.createElement("span");
      dot.textContent = "+";
      dot.style.cssText = "color: #22c55e; font-weight: 700; font-size: 14px; min-width: 14px; line-height: 1.5;";
      const text = document.createElement("span");
      text.textContent = bullet;
      text.style.cssText = "font-size: 13px; color: #cbd5e1; line-height: 1.5;";
      item.appendChild(dot);
      item.appendChild(text);
      bullCol.appendChild(item);
    }
    columns.appendChild(bullCol);

    // Bear Case
    const bearCol = document.createElement("div");
    const bearHeader = document.createElement("div");
    bearHeader.style.cssText = "display: flex; align-items: center; gap: 8px; margin-bottom: 12px;";
    const bearIcon = document.createElement("span");
    bearIcon.textContent = "BEAR CASE";
    bearIcon.style.cssText = `
      font-size: 11px; font-weight: 700; letter-spacing: 1px;
      color: #ef4444; background: rgba(239,68,68,0.15);
      padding: 4px 10px; border-radius: 4px;
    `;
    bearHeader.appendChild(bearIcon);
    bearCol.appendChild(bearHeader);

    for (const bullet of d.scenario.bearCase) {
      const item = document.createElement("div");
      item.style.cssText = "display: flex; gap: 8px; margin-bottom: 10px; align-items: flex-start;";
      const dot = document.createElement("span");
      dot.textContent = "-";
      dot.style.cssText = "color: #ef4444; font-weight: 700; font-size: 14px; min-width: 14px; line-height: 1.5;";
      const text = document.createElement("span");
      text.textContent = bullet;
      text.style.cssText = "font-size: 13px; color: #cbd5e1; line-height: 1.5;";
      item.appendChild(dot);
      item.appendChild(text);
      bearCol.appendChild(item);
    }
    columns.appendChild(bearCol);

    scenarioBody.appendChild(columns);

    // Key Risk callout
    const riskBox = document.createElement("div");
    riskBox.style.cssText = `
      background: rgba(234,179,8,0.08); border: 1px solid rgba(234,179,8,0.25);
      border-radius: 8px; padding: 14px 18px; display: flex; gap: 10px;
      align-items: flex-start;
    `;
    const riskLabel = document.createElement("div");
    riskLabel.textContent = "KEY RISK";
    riskLabel.style.cssText = `
      font-size: 10px; font-weight: 700; letter-spacing: 1px;
      color: #eab308; background: rgba(234,179,8,0.18);
      padding: 3px 8px; border-radius: 3px; white-space: nowrap; margin-top: 1px;
    `;
    const riskText = document.createElement("div");
    riskText.textContent = d.scenario.keyRisk;
    riskText.style.cssText = "font-size: 13px; color: #fde68a; line-height: 1.5;";
    riskBox.appendChild(riskLabel);
    riskBox.appendChild(riskText);
    scenarioBody.appendChild(riskBox);

    scenarioCard.appendChild(scenarioBody);
    root.appendChild(scenarioCard);
  } else {
    // Empty state
    const empty = document.createElement("div");
    empty.style.cssText = `
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: #1e293b; border: 1px solid rgba(148,163,184,0.15);
      border-radius: 10px; padding: 60px 20px; text-align: center;
    `;
    const emptyIcon = document.createElement("div");
    emptyIcon.textContent = "Select a ticker and click Analyze";
    emptyIcon.style.cssText = "font-size: 16px; color: #64748b; font-weight: 500;";
    const emptyDesc = document.createElement("div");
    emptyDesc.textContent = "Choose an auto OEM stock ticker above to generate pre-earnings signal intelligence across 6 market dimensions.";
    emptyDesc.style.cssText = "font-size: 13px; color: #475569; margin-top: 8px; max-width: 480px; line-height: 1.5;";
    empty.appendChild(emptyIcon);
    empty.appendChild(emptyDesc);
    root.appendChild(empty);
  }

  document.body.appendChild(root);
}

// ─── Initialize ─────────────────────────────────────────────────────────────

render();
