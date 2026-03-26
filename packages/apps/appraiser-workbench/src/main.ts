import { App } from "@modelcontextprotocol/ext-apps";

const _safeApp = (() => { try { return new App({ name: "appraiser-workbench" });

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

// ── Types ──────────────────────────────────────────────────────────────────
interface VehicleDecode {
  year: number;
  make: string;
  model: string;
  trim: string;
  engine: string;
  transmission: string;
  drivetrain: string;
  body_type: string;
  fuel_type: string;
  mpg_city: number;
  mpg_highway: number;
  msrp: number;
}

interface PriceEstimate {
  predicted: number;
  low: number;
  high: number;
  confidence: number;
}

interface ActiveComp {
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  miles: number;
  dealer_name: string;
  days_on_market: number;
  distance: number;
}

interface SoldComp {
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  miles: number;
  dealer_name: string;
  days_on_market: number;
  distance: number;
  sold_date: string;
}

interface HistoryEntry {
  dealer_name: string;
  price: number;
  first_seen: string;
  last_seen: string;
}

interface AppraisalResult {
  decode: VehicleDecode;
  retail: PriceEstimate;
  wholesale: PriceEstimate;
  activeComps: ActiveComp[];
  soldComps: SoldComp[];
  history: HistoryEntry[];
}

// ── Mock Data ──────────────────────────────────────────────────────────────
const MOCK_RESULT: AppraisalResult = {
  decode: {
    year: 2022,
    make: "Toyota",
    model: "Camry",
    trim: "XSE V6",
    engine: "3.5L V6 301hp",
    transmission: "8-Speed Automatic",
    drivetrain: "FWD",
    body_type: "Sedan",
    fuel_type: "Gasoline",
    mpg_city: 22,
    mpg_highway: 33,
    msrp: 35720,
  },
  retail: { predicted: 28500, low: 26200, high: 31400, confidence: 0.87 },
  wholesale: { predicted: 24200, low: 22800, high: 25900, confidence: 0.82 },
  activeComps: [
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE V6", price: 27995, miles: 28400, dealer_name: "AutoNation Toyota", days_on_market: 12, distance: 8 },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE V6", price: 29450, miles: 22100, dealer_name: "Larry H Miller Toyota", days_on_market: 5, distance: 15 },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE", price: 26800, miles: 35600, dealer_name: "Peak Toyota", days_on_market: 22, distance: 22 },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE V6", price: 28900, miles: 25300, dealer_name: "Mountain States Toyota", days_on_market: 8, distance: 30 },
    { year: 2023, make: "Toyota", model: "Camry", trim: "XSE V6", price: 31200, miles: 12800, dealer_name: "Stevinson Toyota", days_on_market: 3, distance: 12 },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE V6", price: 27400, miles: 31200, dealer_name: "Phil Long Toyota", days_on_market: 18, distance: 65 },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE", price: 26200, miles: 38900, dealer_name: "Groove Toyota", days_on_market: 30, distance: 10 },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE V6", price: 29100, miles: 24800, dealer_name: "Pedersen Toyota", days_on_market: 7, distance: 45 },
    { year: 2023, make: "Toyota", model: "Camry", trim: "XSE", price: 30500, miles: 15200, dealer_name: "Burt Toyota", days_on_market: 4, distance: 52 },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE V6", price: 28200, miles: 27600, dealer_name: "Empire Toyota", days_on_market: 14, distance: 18 },
    { year: 2021, make: "Toyota", model: "Camry", trim: "XSE V6", price: 25800, miles: 42100, dealer_name: "Prestige Toyota", days_on_market: 25, distance: 28 },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE V6", price: 28750, miles: 26400, dealer_name: "Freedom Toyota", days_on_market: 9, distance: 35 },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE", price: 27100, miles: 33800, dealer_name: "Red McCombs Toyota", days_on_market: 16, distance: 70 },
    { year: 2023, make: "Toyota", model: "Camry", trim: "XSE V6", price: 31800, miles: 9500, dealer_name: "Fowler Toyota", days_on_market: 2, distance: 80 },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE V6", price: 28300, miles: 29100, dealer_name: "Longmont Toyota", days_on_market: 11, distance: 40 },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE V6", price: 27800, miles: 30500, dealer_name: "Centennial Toyota", days_on_market: 19, distance: 14 },
    { year: 2021, make: "Toyota", model: "Camry", trim: "XSE V6", price: 26400, miles: 39800, dealer_name: "Schomp Toyota", days_on_market: 21, distance: 20 },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE V6", price: 29300, miles: 23700, dealer_name: "Arapahoe Toyota", days_on_market: 6, distance: 16 },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE", price: 27600, miles: 31800, dealer_name: "John Elway Toyota", days_on_market: 15, distance: 9 },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE V6", price: 28650, miles: 26900, dealer_name: "Kuni Toyota", days_on_market: 10, distance: 25 },
  ],
  soldComps: [
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE V6", price: 27800, miles: 29400, dealer_name: "AutoNation Toyota", days_on_market: 18, distance: 8, sold_date: "2026-03-10" },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE V6", price: 28200, miles: 26800, dealer_name: "Larry H Miller Toyota", days_on_market: 12, distance: 15, sold_date: "2026-03-08" },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE", price: 26500, miles: 34200, dealer_name: "Peak Toyota", days_on_market: 24, distance: 22, sold_date: "2026-02-28" },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE V6", price: 29000, miles: 22500, dealer_name: "Mountain States Toyota", days_on_market: 9, distance: 30, sold_date: "2026-03-15" },
    { year: 2023, make: "Toyota", model: "Camry", trim: "XSE V6", price: 30800, miles: 14200, dealer_name: "Stevinson Toyota", days_on_market: 6, distance: 12, sold_date: "2026-03-12" },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE V6", price: 27300, miles: 32600, dealer_name: "Phil Long Toyota", days_on_market: 20, distance: 65, sold_date: "2026-02-20" },
    { year: 2021, make: "Toyota", model: "Camry", trim: "XSE V6", price: 25600, miles: 43800, dealer_name: "Groove Toyota", days_on_market: 28, distance: 10, sold_date: "2026-02-15" },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE V6", price: 28500, miles: 25100, dealer_name: "Pedersen Toyota", days_on_market: 11, distance: 45, sold_date: "2026-03-05" },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE V6", price: 27900, miles: 28900, dealer_name: "Empire Toyota", days_on_market: 15, distance: 18, sold_date: "2026-03-01" },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE V6", price: 28100, miles: 27200, dealer_name: "Freedom Toyota", days_on_market: 13, distance: 35, sold_date: "2026-02-25" },
    { year: 2023, make: "Toyota", model: "Camry", trim: "XSE", price: 30200, miles: 16800, dealer_name: "Burt Toyota", days_on_market: 7, distance: 52, sold_date: "2026-03-18" },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE V6", price: 27500, miles: 30900, dealer_name: "Red McCombs Toyota", days_on_market: 22, distance: 70, sold_date: "2026-02-18" },
    { year: 2021, make: "Toyota", model: "Camry", trim: "XSE V6", price: 26100, miles: 41200, dealer_name: "Prestige Toyota", days_on_market: 19, distance: 28, sold_date: "2026-02-22" },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE V6", price: 28400, miles: 27800, dealer_name: "Centennial Toyota", days_on_market: 10, distance: 14, sold_date: "2026-03-14" },
    { year: 2022, make: "Toyota", model: "Camry", trim: "XSE V6", price: 28000, miles: 29600, dealer_name: "Kuni Toyota", days_on_market: 14, distance: 25, sold_date: "2026-03-03" },
  ],
  history: [
    { dealer_name: "Stevinson Toyota", price: 32500, first_seen: "2024-06-15", last_seen: "2024-09-20" },
    { dealer_name: "AutoNation Toyota", price: 30800, first_seen: "2024-10-05", last_seen: "2025-01-12" },
    { dealer_name: "Peak Toyota", price: 29900, first_seen: "2025-02-01", last_seen: "2025-05-18" },
    { dealer_name: "Empire Toyota", price: 29200, first_seen: "2025-06-10", last_seen: "2025-10-25" },
    { dealer_name: "Larry H Miller Toyota", price: 28500, first_seen: "2025-11-15", last_seen: "2026-03-20" },
  ],
};

// ── Utilities ──────────────────────────────────────────────────────────────
function fmt$(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

function fmtMi(n: number): string {
  return n.toLocaleString("en-US");
}

function pctOfMsrp(price: number, msrp: number): string {
  return ((price / msrp) * 100).toFixed(1) + "%";
}

function stddev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sqDiffs = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ── App Init ───────────────────────────────────────────────────────────────

// ── State ──────────────────────────────────────────────────────────────────
let currentResult: AppraisalResult | null = null;
let activeTab: "active" | "sold" | "history" = "active";
let activeSortCol = "price";
let activeSortAsc = true;
let soldSortCol = "price";
let soldSortAsc = true;
let dealerType: "franchise" | "independent" = "franchise";

// ── Styles ─────────────────────────────────────────────────────────────────
const CSS = `
  :root {
    --bg: #0f172a;
    --surface: #1e293b;
    --surface2: #334155;
    --border: #475569;
    --text: #f1f5f9;
    --text-dim: #94a3b8;
    --accent: #38bdf8;
    --accent2: #818cf8;
    --green: #34d399;
    --green-bg: rgba(52,211,153,0.08);
    --red: #f87171;
    --red-bg: rgba(248,113,113,0.08);
    --yellow: #fbbf24;
    --radius: 8px;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
  }

  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  /* ── Top Bar ── */
  .top-bar {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 12px 20px;
    flex-shrink: 0;
  }
  .top-bar-inputs {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .input-group {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .input-group label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-dim);
    font-weight: 600;
  }
  .input-group input {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 7px 10px;
    border-radius: var(--radius);
    font-size: 13px;
    outline: none;
    transition: border-color 0.2s;
  }
  .input-group input:focus {
    border-color: var(--accent);
  }
  .input-group input.vin-input {
    width: 200px;
    font-family: "SF Mono", "Fira Code", monospace;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .input-group input.short-input {
    width: 100px;
  }

  .toggle-group {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .toggle-group label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-dim);
    font-weight: 600;
  }
  .toggle-buttons {
    display: flex;
    border-radius: var(--radius);
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .toggle-buttons button {
    background: var(--bg);
    border: none;
    color: var(--text-dim);
    padding: 7px 14px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .toggle-buttons button.active {
    background: var(--accent);
    color: var(--bg);
    font-weight: 600;
  }
  .toggle-buttons button:not(:last-child) {
    border-right: 1px solid var(--border);
  }

  .cpo-group {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-top: 14px;
  }
  .cpo-group input[type="checkbox"] {
    accent-color: var(--accent);
    width: 16px;
    height: 16px;
    cursor: pointer;
  }
  .cpo-group label {
    font-size: 12px;
    color: var(--text-dim);
    cursor: pointer;
  }

  .appraise-btn {
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    border: none;
    color: #0f172a;
    padding: 8px 24px;
    border-radius: var(--radius);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    margin-top: 14px;
    transition: opacity 0.2s, transform 0.1s;
    letter-spacing: 0.3px;
  }
  .appraise-btn:hover { opacity: 0.9; }
  .appraise-btn:active { transform: scale(0.97); }
  .appraise-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .decode-row {
    margin-top: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 28px;
  }
  .decode-badge {
    background: var(--surface2);
    color: var(--text);
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 600;
  }
  .msrp-badge {
    background: var(--accent);
    color: var(--bg);
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 700;
    margin-left: 8px;
  }

  /* ── Panels ── */
  .panels {
    display: flex;
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  .panel-left {
    width: 35%;
    border-right: 1px solid var(--border);
    padding: 16px;
    overflow-y: auto;
  }
  .panel-center {
    width: 40%;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .panel-right {
    width: 25%;
    padding: 16px;
    overflow-y: auto;
  }

  /* ── Left Panel: Valuation ── */
  .val-section {
    margin-bottom: 20px;
  }
  .val-section h3 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-dim);
    margin-bottom: 8px;
  }
  .val-price {
    font-size: 36px;
    font-weight: 800;
    color: var(--accent);
    letter-spacing: -1px;
  }
  .val-price.wholesale {
    color: var(--yellow);
    font-size: 28px;
  }
  .val-confidence {
    font-size: 11px;
    color: var(--text-dim);
    margin-top: 2px;
  }

  .range-bar-container {
    margin-top: 10px;
    position: relative;
    height: 28px;
  }
  .range-bar-track {
    position: absolute;
    top: 8px;
    left: 0;
    right: 0;
    height: 12px;
    background: var(--surface2);
    border-radius: 6px;
  }
  .range-bar-fill {
    position: absolute;
    top: 8px;
    height: 12px;
    border-radius: 6px;
  }
  .range-bar-fill.retail { background: rgba(56,189,248,0.35); }
  .range-bar-fill.wholesale { background: rgba(251,191,36,0.35); }
  .range-bar-point {
    position: absolute;
    top: 4px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    transform: translateX(-50%);
    border: 3px solid;
  }
  .range-bar-point.retail {
    background: var(--accent);
    border-color: #0f172a;
  }
  .range-bar-point.wholesale {
    background: var(--yellow);
    border-color: #0f172a;
  }
  .range-labels {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--text-dim);
    margin-top: 4px;
  }

  .delta-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px;
    margin-top: 16px;
  }
  .delta-card h4 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-dim);
    margin-bottom: 6px;
  }
  .delta-value {
    font-size: 24px;
    font-weight: 700;
    color: var(--green);
  }
  .pct-msrp-row {
    display: flex;
    gap: 20px;
    margin-top: 16px;
  }
  .pct-msrp-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 14px;
    flex: 1;
  }
  .pct-msrp-item .label {
    font-size: 10px;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .pct-msrp-item .value {
    font-size: 18px;
    font-weight: 700;
    margin-top: 2px;
  }
  .pct-msrp-item .value.retail-color { color: var(--accent); }
  .pct-msrp-item .value.wholesale-color { color: var(--yellow); }

  /* ── Center Panel: Tabs ── */
  .tab-bar {
    display: flex;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .tab-btn {
    flex: 1;
    background: none;
    border: none;
    color: var(--text-dim);
    padding: 10px 0;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
  }
  .tab-btn.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }
  .tab-btn:hover:not(.active) {
    color: var(--text);
  }

  .tab-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: auto;
    min-height: 0;
  }

  /* ── Comps Table ── */
  .stats-summary {
    display: flex;
    gap: 12px;
    padding: 10px 12px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .stat-chip {
    font-size: 11px;
    color: var(--text-dim);
  }
  .stat-chip span {
    color: var(--text);
    font-weight: 600;
  }

  .comps-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .comps-table th {
    background: var(--surface);
    color: var(--text-dim);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 8px 10px;
    text-align: left;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
  }
  .comps-table th:hover {
    color: var(--text);
  }
  .comps-table th .sort-arrow {
    margin-left: 3px;
    font-size: 9px;
  }
  .comps-table td {
    padding: 7px 10px;
    border-bottom: 1px solid rgba(71,85,105,0.3);
    white-space: nowrap;
  }
  .comps-table tr.below-predicted {
    background: var(--green-bg);
  }
  .comps-table tr.above-predicted {
    background: var(--red-bg);
  }
  .comps-table tr:hover {
    background: rgba(56,189,248,0.06);
  }

  /* ── History Chart ── */
  .history-chart-container {
    padding: 16px;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .history-chart-container h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-dim);
    margin-bottom: 12px;
    flex-shrink: 0;
  }
  .history-chart-container canvas {
    flex: 1;
    width: 100%;
    border-radius: var(--radius);
    background: var(--surface);
  }

  /* ── Right Panel: Spec Card ── */
  .spec-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .spec-card-header {
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    color: #0f172a;
    padding: 16px;
  }
  .spec-card-header h2 {
    font-size: 18px;
    font-weight: 800;
    line-height: 1.2;
  }
  .spec-card-header .trim-line {
    font-size: 13px;
    font-weight: 600;
    opacity: 0.8;
    margin-top: 2px;
  }
  .spec-list {
    padding: 4px 0;
  }
  .spec-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    border-bottom: 1px solid rgba(71,85,105,0.3);
  }
  .spec-item:last-child {
    border-bottom: none;
  }
  .spec-item .spec-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-dim);
  }
  .spec-item .spec-value {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    text-align: right;
  }

  /* ── Placeholder ── */
  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-dim);
    gap: 8px;
  }
  .placeholder-icon {
    font-size: 48px;
    opacity: 0.3;
  }
  .placeholder-text {
    font-size: 14px;
  }

  /* scrollbar */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--surface2); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--border); }
`;

// ── Build DOM ──────────────────────────────────────────────────────────────
function buildUI(): void {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const container = document.createElement("div");
  container.className = "app-container";
  container.innerHTML = `
    <div class="top-bar">
      <div class="top-bar-inputs">
        <div class="input-group">
          <label>VIN</label>
          <input type="text" id="vin-input" class="vin-input" maxlength="17" placeholder="Enter 17-char VIN" />
        </div>
        <div class="input-group">
          <label>Mileage</label>
          <input type="number" id="miles-input" class="short-input" placeholder="e.g. 28000" />
        </div>
        <div class="input-group">
          <label>ZIP</label>
          <input type="text" id="zip-input" class="short-input" maxlength="5" placeholder="e.g. 80202" />
        </div>
        <div class="toggle-group">
          <label>Dealer Type</label>
          <div class="toggle-buttons" id="dealer-toggle">
            <button class="active" data-value="franchise">Franchise</button>
            <button data-value="independent">Independent</button>
          </div>
        </div>
        <div class="cpo-group">
          <input type="checkbox" id="cpo-check" />
          <label for="cpo-check">CPO / Certified</label>
        </div>
        <button class="appraise-btn" id="appraise-btn">Appraise</button>
      </div>
      <div class="decode-row" id="decode-row"></div>
    </div>
    <div class="panels">
      <div class="panel-left" id="panel-left">
        <div class="placeholder">
          <div class="placeholder-icon">&#x1F4B0;</div>
          <div class="placeholder-text">Enter a VIN and click Appraise</div>
        </div>
      </div>
      <div class="panel-center" id="panel-center">
        <div class="placeholder">
          <div class="placeholder-icon">&#x1F50D;</div>
          <div class="placeholder-text">Comparables will appear here</div>
        </div>
      </div>
      <div class="panel-right" id="panel-right">
        <div class="placeholder">
          <div class="placeholder-icon">&#x1F697;</div>
          <div class="placeholder-text">Vehicle specs will appear here</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  // Wire events
  document.getElementById("appraise-btn")!.addEventListener("click", doAppraise);

  // Dealer type toggle
  const toggleBtns = document.querySelectorAll("#dealer-toggle button");
  toggleBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      toggleBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      dealerType = (btn as HTMLElement).dataset.value as "franchise" | "independent";
    });
  });

  // Mileage change -> re-appraise if we have data
  document.getElementById("miles-input")!.addEventListener("change", () => {
    if (currentResult) doAppraise();
  });

  // CPO toggle -> re-appraise if we have data
  document.getElementById("cpo-check")!.addEventListener("change", () => {
    if (currentResult) doAppraise();
  });
}

// ── Appraise ───────────────────────────────────────────────────────────────
async function doAppraise(): Promise<void> {
  const vinEl = document.getElementById("vin-input") as HTMLInputElement;
  const milesEl = document.getElementById("miles-input") as HTMLInputElement;
  const zipEl = document.getElementById("zip-input") as HTMLInputElement;
  const cpoEl = document.getElementById("cpo-check") as HTMLInputElement;
  const btn = document.getElementById("appraise-btn") as HTMLButtonElement;

  const vin = vinEl.value.trim().toUpperCase();
  const miles = parseInt(milesEl.value, 10) || 0;
  const zip = zipEl.value.trim();
  const isCertified = cpoEl.checked;

  if (vin.length !== 17) {
    vinEl.style.borderColor = "#f87171";
    setTimeout(() => { vinEl.style.borderColor = ""; }, 2000);
    return;
  }

  btn.disabled = true;
  btn.textContent = "Appraising...";

  let result: AppraisalResult;

  try {
    const response = await _safeApp?.callServerTool({
      name: "appraiser-workbench",
      arguments: { vin, miles, zip, isCertified, dealerType },
    });
    const text = response.content
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text)
      .join("");
    result = JSON.parse(text);
  } catch {
    // Fallback to mock data
    result = MOCK_RESULT;
  }

  currentResult = result;
  renderDecodeRow(result.decode);
  renderLeftPanel(result);
  renderCenterPanel(result);
  renderRightPanel(result.decode);

  btn.disabled = false;
  btn.textContent = "Appraise";
}

// ── Decode Row ─────────────────────────────────────────────────────────────
function renderDecodeRow(d: VehicleDecode): void {
  const row = document.getElementById("decode-row")!;
  row.innerHTML = `
    <span class="decode-badge">${d.year}</span>
    <span class="decode-badge">${d.make}</span>
    <span class="decode-badge">${d.model}</span>
    <span class="decode-badge">${d.trim}</span>
    <span class="msrp-badge">MSRP ${fmt$(d.msrp)}</span>
  `;
}

// ── Left Panel: Valuation Summary ──────────────────────────────────────────
function renderLeftPanel(data: AppraisalResult): void {
  const panel = document.getElementById("panel-left")!;
  const r = data.retail;
  const w = data.wholesale;
  const msrp = data.decode.msrp;
  const delta = r.predicted - w.predicted;

  panel.innerHTML = `
    <div class="val-section">
      <h3>Predicted Retail Price</h3>
      <div class="val-price">${fmt$(r.predicted)}</div>
      <div class="val-confidence">Confidence: ${(r.confidence * 100).toFixed(0)}%</div>
      ${buildRangeBar(r, "retail")}
    </div>

    <div class="val-section">
      <h3>Predicted Wholesale Price</h3>
      <div class="val-price wholesale">${fmt$(w.predicted)}</div>
      <div class="val-confidence">Confidence: ${(w.confidence * 100).toFixed(0)}%</div>
      ${buildRangeBar(w, "wholesale")}
    </div>

    <div class="delta-card">
      <h4>Retail - Wholesale Spread</h4>
      <div class="delta-value">${fmt$(delta)}</div>
    </div>

    <div class="pct-msrp-row">
      <div class="pct-msrp-item">
        <div class="label">Retail % of MSRP</div>
        <div class="value retail-color">${pctOfMsrp(r.predicted, msrp)}</div>
      </div>
      <div class="pct-msrp-item">
        <div class="label">Wholesale % of MSRP</div>
        <div class="value wholesale-color">${pctOfMsrp(w.predicted, msrp)}</div>
      </div>
    </div>
  `;
}

function buildRangeBar(est: PriceEstimate, type: "retail" | "wholesale"): string {
  const range = est.high - est.low;
  const fillLeftPct = 0;
  const fillWidthPct = 100;
  const pointPct = range > 0 ? ((est.predicted - est.low) / range) * 100 : 50;

  return `
    <div class="range-bar-container">
      <div class="range-bar-track"></div>
      <div class="range-bar-fill ${type}" style="left:${fillLeftPct}%;width:${fillWidthPct}%"></div>
      <div class="range-bar-point ${type}" style="left:${pointPct}%"></div>
    </div>
    <div class="range-labels">
      <span>${fmt$(est.low)}</span>
      <span>${fmt$(est.high)}</span>
    </div>
  `;
}

// ── Center Panel: Tabs + Content ───────────────────────────────────────────
function renderCenterPanel(data: AppraisalResult): void {
  const panel = document.getElementById("panel-center")!;
  panel.innerHTML = `
    <div class="tab-bar">
      <button class="tab-btn ${activeTab === "active" ? "active" : ""}" data-tab="active">Active Comps</button>
      <button class="tab-btn ${activeTab === "sold" ? "active" : ""}" data-tab="sold">Sold Comps</button>
      <button class="tab-btn ${activeTab === "history" ? "active" : ""}" data-tab="history">History</button>
    </div>
    <div class="tab-content" id="tab-content"></div>
  `;

  panel.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = (btn as HTMLElement).dataset.tab as "active" | "sold" | "history";
      renderCenterPanel(data);
    });
  });

  renderTabContent(data);
}

function renderTabContent(data: AppraisalResult): void {
  const content = document.getElementById("tab-content")!;

  if (activeTab === "active") {
    renderActiveComps(content, data);
  } else if (activeTab === "sold") {
    renderSoldComps(content, data);
  } else {
    renderHistoryTab(content, data);
  }
}

function renderActiveComps(container: HTMLElement, data: AppraisalResult): void {
  const comps = [...data.activeComps];
  const predicted = data.retail.predicted;

  // Sort
  comps.sort((a, b) => {
    const aVal = (a as Record<string, unknown>)[activeSortCol];
    const bVal = (b as Record<string, unknown>)[activeSortCol];
    if (typeof aVal === "number" && typeof bVal === "number") {
      return activeSortAsc ? aVal - bVal : bVal - aVal;
    }
    return activeSortAsc
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  // Stats
  const prices = comps.map((c) => c.price);
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const med = median(prices);
  const sd = stddev(prices);

  const columns: { key: string; label: string }[] = [
    { key: "ymmt", label: "Vehicle" },
    { key: "price", label: "Price" },
    { key: "miles", label: "Miles" },
    { key: "dealer_name", label: "Dealer" },
    { key: "days_on_market", label: "DOM" },
    { key: "distance", label: "Dist (mi)" },
  ];

  const sortArrow = (col: string) => {
    if (activeSortCol === col) return activeSortAsc ? " &#9650;" : " &#9660;";
    return "";
  };

  container.innerHTML = `
    <div class="stats-summary">
      <div class="stat-chip">Count: <span>${comps.length}</span></div>
      <div class="stat-chip">Mean: <span>${fmt$(Math.round(mean))}</span></div>
      <div class="stat-chip">Median: <span>${fmt$(Math.round(med))}</span></div>
      <div class="stat-chip">StdDev: <span>${fmt$(Math.round(sd))}</span></div>
    </div>
    <table class="comps-table">
      <thead>
        <tr>
          ${columns.map((c) => `<th data-col="${c.key}">${c.label}<span class="sort-arrow">${sortArrow(c.key)}</span></th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${comps
          .map((c) => {
            const cls = c.price < predicted ? "below-predicted" : c.price > predicted ? "above-predicted" : "";
            return `<tr class="${cls}">
              <td>${c.year} ${c.make} ${c.model} ${c.trim}</td>
              <td>${fmt$(c.price)}</td>
              <td>${fmtMi(c.miles)}</td>
              <td>${c.dealer_name}</td>
              <td>${c.days_on_market}</td>
              <td>${c.distance}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;

  // Sort handlers
  container.querySelectorAll(".comps-table th").forEach((th) => {
    th.addEventListener("click", () => {
      const col = (th as HTMLElement).dataset.col!;
      if (col === "ymmt") return;
      if (activeSortCol === col) {
        activeSortAsc = !activeSortAsc;
      } else {
        activeSortCol = col;
        activeSortAsc = true;
      }
      renderActiveComps(container, data);
    });
  });
}

function renderSoldComps(container: HTMLElement, data: AppraisalResult): void {
  const comps = [...data.soldComps];
  const predicted = data.retail.predicted;

  // Sort
  comps.sort((a, b) => {
    const aVal = (a as Record<string, unknown>)[soldSortCol];
    const bVal = (b as Record<string, unknown>)[soldSortCol];
    if (typeof aVal === "number" && typeof bVal === "number") {
      return soldSortAsc ? aVal - bVal : bVal - aVal;
    }
    return soldSortAsc
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  // Stats
  const prices = comps.map((c) => c.price);
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const med = median(prices);
  const sd = stddev(prices);

  const columns: { key: string; label: string }[] = [
    { key: "ymmt", label: "Vehicle" },
    { key: "price", label: "Price" },
    { key: "miles", label: "Miles" },
    { key: "dealer_name", label: "Dealer" },
    { key: "days_on_market", label: "DOM" },
    { key: "distance", label: "Dist (mi)" },
    { key: "sold_date", label: "Sold Date" },
  ];

  const sortArrow = (col: string) => {
    if (soldSortCol === col) return soldSortAsc ? " &#9650;" : " &#9660;";
    return "";
  };

  container.innerHTML = `
    <div class="stats-summary">
      <div class="stat-chip">Count: <span>${comps.length}</span></div>
      <div class="stat-chip">Mean: <span>${fmt$(Math.round(mean))}</span></div>
      <div class="stat-chip">Median: <span>${fmt$(Math.round(med))}</span></div>
      <div class="stat-chip">StdDev: <span>${fmt$(Math.round(sd))}</span></div>
    </div>
    <table class="comps-table">
      <thead>
        <tr>
          ${columns.map((c) => `<th data-col="${c.key}">${c.label}<span class="sort-arrow">${sortArrow(c.key)}</span></th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${comps
          .map((c) => {
            const cls = c.price < predicted ? "below-predicted" : c.price > predicted ? "above-predicted" : "";
            return `<tr class="${cls}">
              <td>${c.year} ${c.make} ${c.model} ${c.trim}</td>
              <td>${fmt$(c.price)}</td>
              <td>${fmtMi(c.miles)}</td>
              <td>${c.dealer_name}</td>
              <td>${c.days_on_market}</td>
              <td>${c.distance}</td>
              <td>${c.sold_date}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;

  // Sort handlers
  container.querySelectorAll(".comps-table th").forEach((th) => {
    th.addEventListener("click", () => {
      const col = (th as HTMLElement).dataset.col!;
      if (col === "ymmt") return;
      if (soldSortCol === col) {
        soldSortAsc = !soldSortAsc;
      } else {
        soldSortCol = col;
        soldSortAsc = true;
      }
      renderSoldComps(container, data);
    });
  });
}

function renderHistoryTab(container: HTMLElement, data: AppraisalResult): void {
  container.innerHTML = `
    <div class="history-chart-container">
      <h3>Price History for this VIN</h3>
      <canvas id="history-canvas"></canvas>
    </div>
  `;

  // Wait a tick for layout
  requestAnimationFrame(() => drawHistoryChart(data.history));
}

// ── History Chart (Canvas 2D) ──────────────────────────────────────────────
function drawHistoryChart(history: HistoryEntry[]): void {
  const canvas = document.getElementById("history-canvas") as HTMLCanvasElement | null;
  if (!canvas) return;

  const parent = canvas.parentElement!;
  const dpr = window.devicePixelRatio || 1;
  const w = parent.clientWidth - 32;
  const h = parent.clientHeight - 50;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";

  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  // Parse dates
  const entries = history.map((e) => ({
    ...e,
    startDate: new Date(e.first_seen),
    endDate: new Date(e.last_seen),
  }));

  if (entries.length === 0) return;

  const allDates = entries.flatMap((e) => [e.startDate.getTime(), e.endDate.getTime()]);
  const minDate = Math.min(...allDates);
  const maxDate = Math.max(...allDates);
  const allPrices = entries.map((e) => e.price);
  const minPrice = Math.min(...allPrices) - 500;
  const maxPrice = Math.max(...allPrices) + 500;

  const pad = { top: 30, right: 30, bottom: 50, left: 70 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const xScale = (d: number) => pad.left + ((d - minDate) / (maxDate - minDate)) * plotW;
  const yScale = (p: number) => pad.top + plotH - ((p - minPrice) / (maxPrice - minPrice)) * plotH;

  // Background
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, w, h);

  // Grid lines
  ctx.strokeStyle = "rgba(71,85,105,0.4)";
  ctx.lineWidth = 0.5;
  const priceStep = Math.ceil((maxPrice - minPrice) / 5 / 500) * 500;
  for (let p = Math.ceil(minPrice / priceStep) * priceStep; p <= maxPrice; p += priceStep) {
    const y = yScale(p);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();

    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(fmt$(p), pad.left - 8, y + 4);
  }

  // X-axis date labels
  const dateRange = maxDate - minDate;
  const monthStep = Math.max(1, Math.round(dateRange / (1000 * 60 * 60 * 24 * 30 * 4)));
  const startMonth = new Date(minDate);
  startMonth.setDate(1);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.textAlign = "center";

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const currentMonth = new Date(startMonth);
  while (currentMonth.getTime() <= maxDate + 30 * 24 * 60 * 60 * 1000) {
    const x = xScale(currentMonth.getTime());
    if (x >= pad.left && x <= w - pad.right) {
      ctx.fillText(
        `${monthNames[currentMonth.getMonth()]} ${currentMonth.getFullYear().toString().slice(2)}`,
        x,
        h - pad.bottom + 18,
      );
      // Tick
      ctx.strokeStyle = "rgba(71,85,105,0.3)";
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, h - pad.bottom);
      ctx.stroke();
    }
    currentMonth.setMonth(currentMonth.getMonth() + monthStep);
  }

  // Stepped line
  const colors = ["#38bdf8", "#818cf8", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#fb923c"];

  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";

  entries.forEach((entry, i) => {
    const x1 = xScale(entry.startDate.getTime());
    const x2 = xScale(entry.endDate.getTime());
    const y = yScale(entry.price);
    const color = colors[i % colors.length];

    // Horizontal line for this dealer period
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();

    // Vertical connector to next entry
    if (i < entries.length - 1) {
      const nextY = yScale(entries[i + 1].price);
      ctx.strokeStyle = "rgba(148,163,184,0.4)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x2, y);
      ctx.lineTo(x2, nextY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 2.5;
    }

    // Start dot
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x1, y, 4, 0, Math.PI * 2);
    ctx.fill();

    // End dot
    ctx.beginPath();
    ctx.arc(x2, y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Dealer label
    ctx.fillStyle = color;
    ctx.font = "bold 10px -apple-system, sans-serif";
    ctx.textAlign = "left";
    const labelX = x1 + 6;
    const labelY = y - 10;
    ctx.fillText(entry.dealer_name, labelX, labelY);

    // Price label
    ctx.fillStyle = "#f1f5f9";
    ctx.font = "bold 11px -apple-system, sans-serif";
    ctx.fillText(fmt$(entry.price), labelX, labelY + 12 < y ? labelY + 12 : y + 18);
  });

  // Axes
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, h - pad.bottom);
  ctx.lineTo(w - pad.right, h - pad.bottom);
  ctx.stroke();
}

// ── Right Panel: Spec Card ─────────────────────────────────────────────────
function renderRightPanel(d: VehicleDecode): void {
  const panel = document.getElementById("panel-right")!;

  const specs: { label: string; value: string }[] = [
    { label: "Engine", value: d.engine },
    { label: "Transmission", value: d.transmission },
    { label: "Drivetrain", value: d.drivetrain },
    { label: "Body Type", value: d.body_type },
    { label: "Fuel Type", value: d.fuel_type },
    { label: "City MPG", value: `${d.mpg_city} mpg` },
    { label: "Highway MPG", value: `${d.mpg_highway} mpg` },
    { label: "MSRP When New", value: fmt$(d.msrp) },
  ];

  panel.innerHTML = `
    <div class="spec-card">
      <div class="spec-card-header">
        <h2>${d.year} ${d.make} ${d.model}</h2>
        <div class="trim-line">${d.trim}</div>
      </div>
      <div class="spec-list">
        ${specs.map((s) => `
          <div class="spec-item">
            <span class="spec-label">${s.label}</span>
            <span class="spec-value">${s.value}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

// ── Bootstrap ──────────────────────────────────────────────────────────────
buildUI();
