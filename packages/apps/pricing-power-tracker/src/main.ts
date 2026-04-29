import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "pricing-power-tracker" }); } catch {}

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

function _getUrlParams(): Record<string, string> {
  const params = new URLSearchParams(location.search);
  const out: Record<string, string> = {};
  for (const k of ["state"]) {
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
    }
    @media (max-width: 480px) {
      body { padding: 8px !important; }
      h1 { font-size: 16px !important; }
      input, select { width: 100% !important; box-sizing: border-box !important; }
    }
  `;
  document.head.appendChild(s);
})();

// ── Types ──────────────────────────────────────────────────────────────
type MarginHealth = "Premium" | "At Sticker" | "Discount";

interface MakeRow {
  make: string;
  volume: number;
  avgPrice: number;
  priceOverMsrp: number;
  health: MarginHealth;
}

interface SegmentRow {
  bodyType: string;
  volume: number;
  avgPrice: number;
  priceOverMsrp: number;
  health: MarginHealth;
}

interface DashboardData {
  makes: MakeRow[];
  segments: SegmentRow[];
}

// ── Health classification ─────────────────────────────────────────────
function classify(pct: number): MarginHealth {
  if (pct >= 2) return "Premium";
  if (pct <= -1) return "Discount";
  return "At Sticker";
}

function healthColor(h: MarginHealth): string {
  return h === "Premium" ? "#22c55e" : h === "Discount" ? "#ef4444" : "#94a3b8";
}

function healthBg(h: MarginHealth): string {
  return h === "Premium" ? "rgba(34,197,94,0.15)" : h === "Discount" ? "rgba(239,68,68,0.15)" : "rgba(148,163,184,0.12)";
}

// ── Mock Data ──────────────────────────────────────────────────────────
function getMockData(): DashboardData {
  const makeSeed: { make: string; vol: number; asp: number; pct: number }[] = [
    { make: "Toyota",     vol: 215000, asp: 32400, pct:  3.8 },
    { make: "Honda",      vol: 168000, asp: 31200, pct:  2.6 },
    { make: "Ford",       vol: 192000, asp: 41100, pct: -0.4 },
    { make: "Chevrolet",  vol: 178000, asp: 39800, pct: -0.1 },
    { make: "Tesla",      vol:  84000, asp: 47200, pct:  6.2 },
    { make: "Nissan",     vol:  92000, asp: 27600, pct: -2.3 },
    { make: "Hyundai",    vol:  88000, asp: 28100, pct:  1.4 },
    { make: "Kia",        vol:  79000, asp: 27300, pct:  0.8 },
    { make: "Jeep",       vol:  71000, asp: 38500, pct: -3.2 },
    { make: "Subaru",     vol:  62000, asp: 30400, pct:  4.1 },
    { make: "Lexus",      vol:  41000, asp: 51200, pct:  5.5 },
    { make: "BMW",        vol:  54000, asp: 56800, pct:  2.8 },
    { make: "Mercedes",   vol:  49000, asp: 62100, pct:  3.4 },
    { make: "GMC",        vol:  58000, asp: 49300, pct:  1.1 },
    { make: "Ram",        vol:  64000, asp: 47600, pct: -1.8 },
    { make: "Mazda",      vol:  46000, asp: 28900, pct:  3.0 },
    { make: "Volkswagen", vol:  37000, asp: 31800, pct: -0.6 },
    { make: "Audi",       vol:  39000, asp: 53400, pct:  1.9 },
    { make: "Cadillac",   vol:  28000, asp: 58300, pct:  0.4 },
    { make: "Acura",      vol:  31000, asp: 41700, pct:  2.2 },
    { make: "Buick",      vol:  24000, asp: 33500, pct: -1.2 },
    { make: "Lincoln",    vol:  18000, asp: 51900, pct:  0.7 },
    { make: "Volvo",      vol:  22000, asp: 47800, pct:  2.3 },
    { make: "Infiniti",   vol:  16000, asp: 44200, pct: -2.0 },
    { make: "Mitsubishi", vol:  14000, asp: 24600, pct: -3.5 },
  ];
  const makes: MakeRow[] = makeSeed.map((m) => ({
    make: m.make, volume: m.vol, avgPrice: m.asp, priceOverMsrp: m.pct, health: classify(m.pct),
  }));

  const segSeed: { bodyType: string; vol: number; asp: number; pct: number }[] = [
    { bodyType: "SUV",      vol: 412000, asp: 41800, pct:  2.4 },
    { bodyType: "Sedan",    vol: 287000, asp: 28900, pct: -0.6 },
    { bodyType: "Truck",    vol: 318000, asp: 47300, pct: -1.4 },
    { bodyType: "Crossover",vol: 246000, asp: 36100, pct:  3.1 },
    { bodyType: "Coupe",    vol:  48000, asp: 49600, pct:  4.2 },
    { bodyType: "Hatchback",vol:  62000, asp: 24800, pct:  1.0 },
    { bodyType: "Van",      vol:  41000, asp: 38400, pct: -2.7 },
    { bodyType: "Convertible", vol: 18000, asp: 56900, pct: 5.6 },
    { bodyType: "Wagon",    vol:  12000, asp: 32100, pct:  0.3 },
  ];
  const segments: SegmentRow[] = segSeed.map((s) => ({
    bodyType: s.bodyType, volume: s.vol, avgPrice: s.asp, priceOverMsrp: s.pct, health: classify(s.pct),
  }));

  return { makes, segments };
}

// ── Live API Orchestration ─────────────────────────────────────────────
async function _fetchDirect(stateCode?: string): Promise<DashboardData> {
  // Per the How-to-Build spec: 2× soldSummary in parallel — by make (top 25) and by body_type.
  // price_over_msrp_percentage is read from each returned row (it is not a valid ranking_measure).
  const [makeRes, segmentRes] = await Promise.all([
    _mcSold({
      ranking_dimensions: "make",
      ranking_measure: "sold_count",
      ranking_order: "desc",
      top_n: 25,
      inventory_type: "Used",
      state: stateCode,
    }),
    _mcSold({
      ranking_dimensions: "body_type",
      ranking_measure: "sold_count",
      ranking_order: "desc",
      inventory_type: "Used",
      state: stateCode,
    }),
  ]);

  const rowsOf = (r: any): any[] => r?.data ?? r?.rankings ?? r?.results ?? [];

  const makes: MakeRow[] = rowsOf(makeRes)
    .map((x: any) => {
      const make = String(x.make ?? x.dimension_value ?? "").trim();
      const volume = Number(x.sold_count) || 0;
      const avgPrice = Number(x.average_sale_price) || 0;
      const priceOverMsrp = Number(x.price_over_msrp_percentage) || 0;
      return { make, volume, avgPrice, priceOverMsrp, health: classify(priceOverMsrp) };
    })
    .filter((m) => m.make);

  const segments: SegmentRow[] = rowsOf(segmentRes)
    .map((x: any) => {
      const bodyType = String(x.body_type ?? x.dimension_value ?? "").trim();
      const volume = Number(x.sold_count) || 0;
      const avgPrice = Number(x.average_sale_price) || 0;
      const priceOverMsrp = Number(x.price_over_msrp_percentage) || 0;
      return { bodyType, volume, avgPrice, priceOverMsrp, health: classify(priceOverMsrp) };
    })
    .filter((s) => s.bodyType);

  return { makes, segments };
}

// ── State ──────────────────────────────────────────────────────────────
const _urlParams = _getUrlParams();
let state = {
  stateCode: _urlParams.state ?? "",
  data: null as DashboardData | null,
  loading: false,
  error: null as string | null,
};

// ── Loading ───────────────────────────────────────────────────────────
async function loadData(): Promise<void> {
  state.loading = true;
  state.error = null;
  render();
  try {
    const mode = _detectAppMode();
    if (mode === "live") {
      state.data = await _fetchDirect(state.stateCode || undefined);
    } else {
      state.data = getMockData();
    }
  } catch (err: any) {
    state.error = err?.message ?? "Failed to load data";
    state.data = null;
  } finally {
    state.loading = false;
    render();
  }
}

// ── Canvas helpers ────────────────────────────────────────────────────
function setupCanvas(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext("2d");
  ctx?.scale(dpr, dpr);
  return ctx;
}

function drawScatterPlot(canvas: HTMLCanvasElement, makes: MakeRow[]): void {
  const w = 720;
  const h = 360;
  const ctx = setupCanvas(canvas, w, h);
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);

  if (makes.length === 0) return;

  // Padding for axes/labels
  const padL = 56, padR = 24, padT = 20, padB = 44;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const volumes = makes.map((m) => Math.max(1, m.volume));
  const minVol = Math.min(...volumes);
  const maxVol = Math.max(...volumes);
  const logMin = Math.log10(minVol);
  const logMax = Math.log10(maxVol);
  const logRange = (logMax - logMin) || 1;

  const pcts = makes.map((m) => m.priceOverMsrp);
  const minPct = Math.min(...pcts, -2);
  const maxPct = Math.max(...pcts, 5);
  const pctRange = (maxPct - minPct) || 1;

  const xOf = (v: number) => padL + ((Math.log10(Math.max(1, v)) - logMin) / logRange) * plotW;
  const yOf = (p: number) => padT + (1 - (p - minPct) / pctRange) * plotH;

  // Grid + zero line
  ctx.strokeStyle = "rgba(148,163,184,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (i / 4) * plotH;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
  }
  for (let i = 0; i <= 4; i++) {
    const x = padL + (i / 4) * plotW;
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
  }
  // Y-axis "at sticker" (0%) line
  if (minPct < 0 && maxPct > 0) {
    ctx.strokeStyle = "rgba(148,163,184,0.35)";
    ctx.setLineDash([4, 4]);
    const y0 = yOf(0);
    ctx.beginPath(); ctx.moveTo(padL, y0); ctx.lineTo(padL + plotW, y0); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#64748b";
    ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("at sticker", padL + 4, y0 - 4);
  }

  // Axis labels
  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Sold Volume (log scale)", padL + plotW / 2, h - 10);
  ctx.save();
  ctx.translate(14, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Price-over-MSRP %", 0, 0);
  ctx.restore();

  // Y-axis tick labels
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const pctVal = minPct + (1 - i / 4) * pctRange;
    const y = padT + (i / 4) * plotH;
    ctx.fillStyle = "#64748b";
    ctx.fillText(`${pctVal >= 0 ? "+" : ""}${pctVal.toFixed(1)}%`, padL - 6, y + 3);
  }

  // X-axis tick labels (log scale)
  ctx.textAlign = "center";
  for (let i = 0; i <= 4; i++) {
    const logVal = logMin + (i / 4) * logRange;
    const v = Math.pow(10, logVal);
    const x = padL + (i / 4) * plotW;
    ctx.fillStyle = "#64748b";
    ctx.fillText(v >= 1000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`, x, h - 26);
  }

  // Dots + labels
  for (const m of makes) {
    const cx = xOf(m.volume);
    const cy = yOf(m.priceOverMsrp);
    const color = healthColor(m.health);

    ctx.fillStyle = color + "44";
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(m.make, cx + 6, cy - 6);
  }
}

function drawSegmentBars(canvas: HTMLCanvasElement, segments: SegmentRow[]): void {
  const rowH = 30;
  const w = 720;
  const h = Math.max(120, segments.length * rowH + 24);
  const ctx = setupCanvas(canvas, w, h);
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);

  if (segments.length === 0) return;

  const labelW = 110;
  const valueW = 80;
  const barW = w - labelW - valueW - 24;
  const pcts = segments.map((s) => s.priceOverMsrp);
  const maxAbs = Math.max(Math.abs(Math.min(...pcts)), Math.abs(Math.max(...pcts)), 5);

  // Center line (zero)
  const centerX = labelW + barW / 2;
  ctx.strokeStyle = "rgba(148,163,184,0.25)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(centerX, 8);
  ctx.lineTo(centerX, h - 8);
  ctx.stroke();
  ctx.setLineDash([]);

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const y = 12 + i * rowH;
    const cy = y + rowH / 2;

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "13px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(s.bodyType, labelW - 10, cy + 4);

    const color = healthColor(s.health);
    const pixelsPerPct = (barW / 2) / maxAbs;
    const barLen = Math.abs(s.priceOverMsrp) * pixelsPerPct;
    const barX = s.priceOverMsrp >= 0 ? centerX : centerX - barLen;
    ctx.fillStyle = color + "55";
    ctx.fillRect(barX, y + 6, barLen, rowH - 12);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(barX + 0.5, y + 6.5, Math.max(0, barLen - 1), rowH - 13);

    ctx.fillStyle = color;
    ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${s.priceOverMsrp >= 0 ? "+" : ""}${s.priceOverMsrp.toFixed(1)}%`, w - valueW - 10, cy + 4);
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
    <div style="font-size:22px;font-weight:700;color:#f1f5f9;margin-bottom:4px;">Pricing Power Tracker</div>
    <div style="font-size:13px;color:#94a3b8;">Discount-to-MSRP trends as margin signals</div>
  `;
  header.appendChild(titleBlock);

  const mode = _detectAppMode();
  const chipColors: Record<string, { bg: string; fg: string; label: string }> = {
    mcp: { bg: "#1e40af22", fg: "#60a5fa", label: "MCP" },
    live: { bg: "#05966922", fg: "#34d399", label: "LIVE" },
    demo: { bg: "#92400e88", fg: "#fbbf24", label: "DEMO" },
  };
  const c = chipColors[mode];
  const modeChip = document.createElement("div");
  modeChip.innerHTML = `<span style="padding:3px 10px;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:0.5px;background:${c.bg};color:${c.fg};border:1px solid ${c.fg}33;">${c.label}</span>`;
  header.appendChild(modeChip);
  root.appendChild(header);

  // ── Input bar ──
  const inputBar = document.createElement("div");
  inputBar.style.cssText = "display:flex;align-items:center;gap:12px;background:#1e293b;border:1px solid rgba(148,163,184,0.15);border-radius:10px;padding:14px 18px;margin-bottom:18px;flex-wrap:wrap;";
  const stateLabel = document.createElement("label");
  stateLabel.textContent = "State";
  stateLabel.style.cssText = "font-size:13px;font-weight:600;color:#94a3b8;white-space:nowrap;";
  const stateInput = document.createElement("input");
  stateInput.type = "text";
  stateInput.value = state.stateCode;
  stateInput.placeholder = "(optional, e.g. CA)";
  stateInput.maxLength = 2;
  stateInput.style.cssText = "background:#0f172a;color:#e2e8f0;border:1px solid rgba(148,163,184,0.25);border-radius:6px;padding:8px 12px;font-size:14px;width:160px;outline:none;text-transform:uppercase;";
  const analyzeBtn = document.createElement("button");
  analyzeBtn.textContent = state.loading ? "Loading..." : "Analyze";
  analyzeBtn.disabled = state.loading;
  analyzeBtn.style.cssText = `background:${state.loading ? "#1e40af" : "#3b82f6"};color:#fff;border:none;border-radius:6px;padding:8px 22px;font-size:14px;font-weight:600;cursor:${state.loading ? "wait" : "pointer"};`;
  analyzeBtn.addEventListener("click", () => {
    state.stateCode = stateInput.value.toUpperCase();
    loadData();
  });
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
  if (!state.data) {
    const empty = document.createElement("div");
    empty.style.cssText = "background:#1e293b;border:1px solid rgba(148,163,184,0.15);border-radius:10px;padding:60px 20px;text-align:center;";
    empty.innerHTML = state.loading
      ? `<div style="font-size:15px;color:#94a3b8;">Loading pricing-power data...</div>`
      : `<div style="font-size:16px;color:#64748b;font-weight:500;">Click Analyze to load pricing power across brands and segments</div><div style="font-size:13px;color:#475569;margin-top:8px;">Optional: pass a 2-letter state code to scope regionally.</div>`;
    root.appendChild(empty);
    document.body.appendChild(root);
    return;
  }

  const { makes, segments } = state.data;

  // ── Above / At / Below sticker distribution ──
  const counts = {
    Premium: makes.filter((m) => m.health === "Premium").length,
    "At Sticker": makes.filter((m) => m.health === "At Sticker").length,
    Discount: makes.filter((m) => m.health === "Discount").length,
  };
  const totalMakes = makes.length || 1;

  const distCard = document.createElement("div");
  distCard.style.cssText = "background:#1e293b;border:1px solid rgba(148,163,184,0.15);border-radius:10px;padding:18px 20px;margin-bottom:16px;";
  distCard.innerHTML = `<div style="font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:14px;">Above / At / Below Sticker — ${totalMakes} brands</div>`;
  const segBar = document.createElement("div");
  segBar.style.cssText = "display:flex;height:28px;border-radius:6px;overflow:hidden;border:1px solid rgba(148,163,184,0.15);margin-bottom:12px;";
  const segs: { label: MarginHealth; color: string }[] = [
    { label: "Premium", color: "#22c55e" },
    { label: "At Sticker", color: "#94a3b8" },
    { label: "Discount", color: "#ef4444" },
  ];
  for (const s of segs) {
    const part = document.createElement("div");
    const w = (counts[s.label] / totalMakes) * 100;
    part.style.cssText = `width:${w}%;background:${s.color};display:flex;align-items:center;justify-content:center;color:#0f172a;font-size:11px;font-weight:700;`;
    part.textContent = counts[s.label] > 0 ? `${counts[s.label]}` : "";
    segBar.appendChild(part);
  }
  distCard.appendChild(segBar);

  const legend = document.createElement("div");
  legend.style.cssText = "display:flex;gap:18px;flex-wrap:wrap;font-size:12px;color:#94a3b8;";
  for (const s of segs) {
    const item = document.createElement("div");
    item.style.cssText = "display:flex;align-items:center;gap:6px;";
    item.innerHTML = `<span style="width:10px;height:10px;border-radius:2px;background:${s.color};display:inline-block;"></span><span>${s.label} <span style="color:#cbd5e1;font-weight:600;">${counts[s.label]}</span></span>`;
    legend.appendChild(item);
  }
  distCard.appendChild(legend);
  root.appendChild(distCard);

  // ── Brand pricing-power scatter ──
  const scatterCard = document.createElement("div");
  scatterCard.style.cssText = "background:#1e293b;border:1px solid rgba(148,163,184,0.15);border-radius:10px;padding:18px 20px;margin-bottom:16px;overflow-x:auto;";
  scatterCard.innerHTML = `<div style="font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:14px;">Brand Pricing Power — Volume vs MSRP Premium</div>`;
  const scatterCanvas = document.createElement("canvas");
  scatterCanvas.style.cssText = "display:block;";
  scatterCard.appendChild(scatterCanvas);
  root.appendChild(scatterCard);
  requestAnimationFrame(() => drawScatterPlot(scatterCanvas, makes));

  // ── Brand table with margin-health badges ──
  const tableCard = document.createElement("div");
  tableCard.style.cssText = "background:#1e293b;border:1px solid rgba(148,163,184,0.15);border-radius:10px;margin-bottom:16px;overflow:hidden;";
  tableCard.innerHTML = `<div style="font-size:14px;font-weight:700;color:#f1f5f9;padding:16px 20px;border-bottom:1px solid rgba(148,163,184,0.1);">Brands — Sorted by Pricing Power</div>`;
  const tableWrap = document.createElement("div");
  tableWrap.style.cssText = "overflow-x:auto;";
  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;";
  const thead = document.createElement("thead");
  const tr = document.createElement("tr");
  for (const h of ["Make", "Sold Volume", "Avg Sale Price", "Price-over-MSRP", "Margin Health"]) {
    const th = document.createElement("th");
    th.textContent = h;
    th.style.cssText = `text-align:left;padding:10px 16px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:1px solid rgba(148,163,184,0.1);background:rgba(15,23,42,0.5);${h === "Margin Health" ? "text-align:center;" : ""}`;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const sortedMakes = [...makes].sort((a, b) => b.priceOverMsrp - a.priceOverMsrp);
  for (let i = 0; i < sortedMakes.length; i++) {
    const m = sortedMakes[i];
    const row = document.createElement("tr");
    row.style.cssText = `border-bottom:1px solid rgba(148,163,184,0.06);${i % 2 === 1 ? "background:rgba(15,23,42,0.3);" : ""}`;
    const color = healthColor(m.health);

    const tdMake = document.createElement("td");
    tdMake.textContent = m.make;
    tdMake.style.cssText = "padding:10px 16px;font-size:14px;font-weight:600;color:#f1f5f9;";
    row.appendChild(tdMake);

    const tdVol = document.createElement("td");
    tdVol.textContent = m.volume.toLocaleString();
    tdVol.style.cssText = "padding:10px 16px;font-size:13px;color:#cbd5e1;font-variant-numeric:tabular-nums;";
    row.appendChild(tdVol);

    const tdAsp = document.createElement("td");
    tdAsp.textContent = m.avgPrice > 0 ? `$${m.avgPrice.toLocaleString()}` : "n/a";
    tdAsp.style.cssText = "padding:10px 16px;font-size:13px;color:#cbd5e1;font-variant-numeric:tabular-nums;";
    row.appendChild(tdAsp);

    const tdPct = document.createElement("td");
    tdPct.textContent = `${m.priceOverMsrp >= 0 ? "+" : ""}${m.priceOverMsrp.toFixed(1)}%`;
    tdPct.style.cssText = `padding:10px 16px;font-size:13px;font-weight:600;color:${color};font-variant-numeric:tabular-nums;`;
    row.appendChild(tdPct);

    const tdHealth = document.createElement("td");
    tdHealth.style.cssText = "padding:10px 16px;text-align:center;";
    tdHealth.innerHTML = `<span style="display:inline-block;padding:3px 12px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:0.5px;color:${color};background:${healthBg(m.health)};border:1px solid ${color}44;">${m.health.toUpperCase()}</span>`;
    row.appendChild(tdHealth);

    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  tableCard.appendChild(tableWrap);
  root.appendChild(tableCard);

  // ── Body-type segment bars ──
  const segCard = document.createElement("div");
  segCard.style.cssText = "background:#1e293b;border:1px solid rgba(148,163,184,0.15);border-radius:10px;padding:18px 20px;margin-bottom:16px;overflow-x:auto;";
  segCard.innerHTML = `<div style="font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:14px;">Pricing Power by Body Type</div>`;
  const segCanvas = document.createElement("canvas");
  segCanvas.style.cssText = "display:block;";
  segCard.appendChild(segCanvas);
  root.appendChild(segCard);
  const sortedSegs = [...segments].sort((a, b) => b.priceOverMsrp - a.priceOverMsrp);
  requestAnimationFrame(() => drawSegmentBars(segCanvas, sortedSegs));

  document.body.appendChild(root);
}

// ── Init ──────────────────────────────────────────────────────────────
render();
loadData();
