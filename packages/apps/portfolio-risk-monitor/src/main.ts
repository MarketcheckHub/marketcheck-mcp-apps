import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "portfolio-risk-monitor" }); } catch {}

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
    document.body.insertBefore(_db, document.body.firstChild);
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
    setTimeout(() => {
      document.getElementById("_mc_save")?.addEventListener("click", () => { const k = (document.getElementById("_mc_key_inp") as HTMLInputElement)?.value?.trim(); if (k) { localStorage.setItem("mc_api_key", k); location.reload(); } });
      document.getElementById("_mc_clear")?.addEventListener("click", () => { localStorage.removeItem("mc_api_key"); localStorage.removeItem("mc_access_token"); location.reload(); });
    }, 0);
    bar.appendChild(gear);
  }
  headerEl.appendChild(bar);
}
// ── End Data Provider ──────────────────────────────────────────────────

// ── Responsive CSS Injection ───────────────────────────────────────────
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
      /* Fix grid/flex layouts to stack on mobile */
      [style*="display:flex"][style*="gap"],
      [style*="display: flex"][style*="gap"] { flex-wrap: wrap !important; }
      [style*="grid-template-columns: repeat"] { grid-template-columns: 1fr !important; }
      [style*="grid-template-columns:repeat"] { grid-template-columns: 1fr !important; }
      /* Ensure tables scroll horizontally */
      div[style*="overflow-x:auto"], div[style*="overflow-x: auto"] { -webkit-overflow-scrolling: touch; }
      table { min-width: 600px; }
      /* Stack panels that use percentage widths */
      [style*="width:35%"], [style*="width:40%"], [style*="width:25%"],
      [style*="width:50%"], [style*="width:60%"], [style*="width:65%"],
      [style*="width: 35%"], [style*="width: 40%"], [style*="width: 25%"],
      [style*="width: 50%"], [style*="width: 60%"], [style*="width: 65%"] {
        width: 100% !important;
        min-width: 0 !important;
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

// ── Types ──────────────────────────────────────────────────────────────
interface Loan {
  vin: string;
  year: number;
  make: string;
  model: string;
  segment: "SUV" | "Sedan" | "Truck" | "EV" | "Other";
  loanBalance: number;
  currentFMV: number;
  ltv: number;
  deprRate: number; // annual depreciation rate %
  loanAge: number; // months
}

interface SegmentData {
  name: string;
  count: number;
  pct: number;
  avgDepr: number;
  color: string;
}

interface HeatmapCell {
  make: string;
  ageBucket: string;
  deprRate: number;
}

// ── Mock Data ──────────────────────────────────────────────────────────
function generateMockLoans(): Loan[] {
  const loans: Loan[] = [
    { vin: "KNDCB3LC9L5359658", year: 2022, make: "Toyota", model: "RAV4", segment: "SUV", loanBalance: 28500, currentFMV: 31200, ltv: 91.3, deprRate: 8.2, loanAge: 18 },
    { vin: "5YJSA1E26MF123456", year: 2021, make: "Tesla", model: "Model 3", segment: "EV", loanBalance: 35200, currentFMV: 29800, ltv: 118.1, deprRate: 18.5, loanAge: 30 },
    { vin: "1FTFW1E85MFA78901", year: 2023, make: "Ford", model: "F-150", segment: "Truck", loanBalance: 42000, currentFMV: 45600, ltv: 92.1, deprRate: 7.1, loanAge: 12 },
    { vin: "1G1ZD5ST7LF234567", year: 2020, make: "GM", model: "Malibu", segment: "Sedan", loanBalance: 18900, currentFMV: 15200, ltv: 124.3, deprRate: 16.8, loanAge: 42 },
    { vin: "2HGFC2F59MH345678", year: 2022, make: "Honda", model: "Civic", segment: "Sedan", loanBalance: 22100, currentFMV: 24500, ltv: 90.2, deprRate: 6.5, loanAge: 20 },
    { vin: "WBAJB9C51KB456789", year: 2019, make: "BMW", model: "X5", segment: "SUV", loanBalance: 38700, currentFMV: 33100, ltv: 116.9, deprRate: 14.2, loanAge: 48 },
    { vin: "4T1BF1FK5CU567890", year: 2023, make: "Toyota", model: "Camry", segment: "Sedan", loanBalance: 24300, currentFMV: 27800, ltv: 87.4, deprRate: 5.8, loanAge: 10 },
    { vin: "1FMCU9J94MUA67890", year: 2021, make: "Ford", model: "Escape", segment: "SUV", loanBalance: 26800, currentFMV: 24100, ltv: 111.2, deprRate: 12.9, loanAge: 32 },
    { vin: "3GNAXUEV5NL789012", year: 2022, make: "GM", model: "Equinox", segment: "SUV", loanBalance: 27500, currentFMV: 29900, ltv: 92.0, deprRate: 9.1, loanAge: 16 },
    { vin: "5YJXCDE20HF890123", year: 2023, make: "Tesla", model: "Model Y", segment: "EV", loanBalance: 48200, currentFMV: 51300, ltv: 94.0, deprRate: 11.4, loanAge: 8 },
    { vin: "1HGCV2F93PA901234", year: 2023, make: "Honda", model: "Accord", segment: "Sedan", loanBalance: 28900, currentFMV: 31600, ltv: 91.5, deprRate: 6.2, loanAge: 14 },
    { vin: "1FTEW1EP2MKA01234", year: 2021, make: "Ford", model: "F-150", segment: "Truck", loanBalance: 39500, currentFMV: 41200, ltv: 95.9, deprRate: 8.8, loanAge: 28 },
    { vin: "JTDKN3DU5A0112345", year: 2020, make: "Toyota", model: "Prius", segment: "Other", loanBalance: 19200, currentFMV: 17800, ltv: 107.9, deprRate: 11.7, loanAge: 44 },
    { vin: "WBA5R1C58KA223456", year: 2019, make: "BMW", model: "3 Series", segment: "Sedan", loanBalance: 29400, currentFMV: 26800, ltv: 109.7, deprRate: 13.5, loanAge: 50 },
    { vin: "1G1YY22G965334567", year: 2022, make: "GM", model: "Tahoe", segment: "SUV", loanBalance: 52100, currentFMV: 56400, ltv: 92.4, deprRate: 7.9, loanAge: 22 },
    { vin: "2T1BURHE7HC445678", year: 2023, make: "Toyota", model: "Corolla", segment: "Sedan", loanBalance: 20500, currentFMV: 23100, ltv: 88.7, deprRate: 5.3, loanAge: 6 },
    { vin: "1FMSK8DH9LGA56789", year: 2020, make: "Ford", model: "Explorer", segment: "SUV", loanBalance: 33600, currentFMV: 36900, ltv: 91.1, deprRate: 9.4, loanAge: 36 },
    { vin: "19XFC2F58NE667890", year: 2022, make: "Honda", model: "CR-V", segment: "SUV", loanBalance: 30200, currentFMV: 33500, ltv: 90.1, deprRate: 6.8, loanAge: 15 },
    { vin: "1N4BL4BV4KC778901", year: 2019, make: "GM", model: "Bolt EV", segment: "EV", loanBalance: 21800, currentFMV: 18500, ltv: 117.8, deprRate: 17.1, loanAge: 52 },
    { vin: "5TDJZRFH8HS889012", year: 2023, make: "Toyota", model: "Highlander", segment: "SUV", loanBalance: 38900, currentFMV: 42100, ltv: 92.4, deprRate: 7.5, loanAge: 11 },
  ];
  return loans;
}

// ── Depreciation Heatmap Data ─────────────────────────────────────────
function generateHeatmapData(): HeatmapCell[] {
  return [
    { make: "Toyota", ageBucket: "0-2yr", deprRate: 4.2 },
    { make: "Toyota", ageBucket: "2-4yr", deprRate: 7.1 },
    { make: "Toyota", ageBucket: "4-6yr", deprRate: 9.8 },
    { make: "Honda", ageBucket: "0-2yr", deprRate: 4.8 },
    { make: "Honda", ageBucket: "2-4yr", deprRate: 7.5 },
    { make: "Honda", ageBucket: "4-6yr", deprRate: 10.2 },
    { make: "Ford", ageBucket: "0-2yr", deprRate: 6.1 },
    { make: "Ford", ageBucket: "2-4yr", deprRate: 10.4 },
    { make: "Ford", ageBucket: "4-6yr", deprRate: 14.2 },
    { make: "GM", ageBucket: "0-2yr", deprRate: 6.8 },
    { make: "GM", ageBucket: "2-4yr", deprRate: 11.2 },
    { make: "GM", ageBucket: "4-6yr", deprRate: 15.5 },
    { make: "Tesla", ageBucket: "0-2yr", deprRate: 9.5 },
    { make: "Tesla", ageBucket: "2-4yr", deprRate: 16.3 },
    { make: "Tesla", ageBucket: "4-6yr", deprRate: 19.1 },
    { make: "BMW", ageBucket: "0-2yr", deprRate: 8.2 },
    { make: "BMW", ageBucket: "2-4yr", deprRate: 13.8 },
    { make: "BMW", ageBucket: "4-6yr", deprRate: 17.4 },
  ];
}

// ── Utility Functions ─────────────────────────────────────────────────
function fmt$(v: number): string {
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtPct(v: number): string {
  return v.toFixed(1) + "%";
}

function getRiskBadge(ltv: number): { label: string; color: string; bg: string } {
  if (ltv >= 120) return { label: "UNDERWATER", color: "#fef2f2", bg: "#dc2626" };
  if (ltv >= 110) return { label: "HIGH RISK", color: "#fff7ed", bg: "#ea580c" };
  if (ltv >= 100) return { label: "WARNING", color: "#fefce8", bg: "#ca8a04" };
  return { label: "ACCEPTABLE", color: "#f0fdf4", bg: "#16a34a" };
}

function deprColor(rate: number): string {
  if (rate < 5) return "#16a34a";
  if (rate < 10) return "#ca8a04";
  if (rate < 15) return "#ea580c";
  return "#dc2626";
}

function deprBg(rate: number): string {
  if (rate < 5) return "rgba(22,163,74,0.18)";
  if (rate < 10) return "rgba(202,138,4,0.18)";
  if (rate < 15) return "rgba(234,88,12,0.18)";
  return "rgba(220,38,38,0.18)";
}

// ── Render Functions ──────────────────────────────────────────────────

function renderKPIs(loans: Loan[]): string {
  const total = loans.length;
  const avgLTV = loans.reduce((s, l) => s + l.ltv, 0) / total;
  const underwater = loans.filter(l => l.ltv > 100).length;
  const highRisk = loans.filter(l => l.ltv > 120).length;
  const avgDepr = loans.reduce((s, l) => s + l.deprRate, 0) / total;
  const retained = loans.filter(l => l.ltv <= 100).length;
  const retentionPct = (retained / total) * 100;

  const kpis = [
    { label: "Total Loans", value: total.toString(), color: "#60a5fa" },
    { label: "Avg LTV", value: fmtPct(avgLTV), color: "#a78bfa" },
    { label: "% Underwater (>100%)", value: fmtPct((underwater / total) * 100), color: "#f97316" },
    { label: "% High Risk (>120%)", value: fmtPct((highRisk / total) * 100), color: "#ef4444" },
    { label: "Avg Depreciation Rate", value: fmtPct(avgDepr), color: "#facc15" },
    { label: "Portfolio Retention %", value: fmtPct(retentionPct), color: "#34d399" },
  ];

  return `<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:20px;">
    ${kpis.map(k => `
      <div style="background:#1e293b;border-radius:10px;padding:16px;text-align:center;border-left:4px solid ${k.color};">
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${k.label}</div>
        <div style="font-size:22px;font-weight:700;color:${k.color};">${k.value}</div>
      </div>
    `).join("")}
  </div>`;
}

function renderVINInput(): string {
  return `<div style="background:#1e293b;border-radius:10px;padding:16px;margin-bottom:20px;">
    <div style="display:flex;align-items:center;gap:12px;">
      <label style="font-size:13px;color:#94a3b8;font-weight:600;white-space:nowrap;">Paste VINs:</label>
      <textarea id="vin-input" rows="2" placeholder="Enter VINs separated by commas or newlines..." style="flex:1;background:#0f172a;border:1px solid #334155;border-radius:6px;padding:10px 12px;color:#e2e8f0;font-family:monospace;font-size:12px;resize:vertical;"></textarea>
      <button id="vin-btn" style="background:#3b82f6;color:#fff;border:none;border-radius:6px;padding:10px 20px;font-weight:600;cursor:pointer;white-space:nowrap;font-size:13px;">Analyze</button>
    </div>
  </div>`;
}

function renderWatchlistTable(loans: Loan[]): string {
  const underwater = loans.filter(l => l.ltv > 100).sort((a, b) => b.ltv - a.ltv);
  const rows = underwater.map(l => {
    const badge = getRiskBadge(l.ltv);
    const vinLast6 = l.vin.slice(-6);
    return `<tr>
      <td style="padding:8px 10px;font-family:monospace;font-size:12px;color:#93c5fd;">${vinLast6}</td>
      <td style="padding:8px 10px;color:#e2e8f0;">${l.year} ${l.make} ${l.model}</td>
      <td style="padding:8px 10px;text-align:right;color:#e2e8f0;">${fmt$(l.loanBalance)}</td>
      <td style="padding:8px 10px;text-align:right;color:#e2e8f0;">${fmt$(l.currentFMV)}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;color:${badge.bg};">${fmtPct(l.ltv)}</td>
      <td style="padding:8px 10px;text-align:right;color:${deprColor(l.deprRate)};">${fmtPct(l.deprRate)}/yr</td>
      <td style="padding:8px 10px;text-align:center;">
        <span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;color:${badge.color};background:${badge.bg};">${badge.label}</span>
      </td>
    </tr>`;
  }).join("");

  return `<div style="background:#1e293b;border-radius:10px;padding:16px;height:100%;display:flex;flex-direction:column;">
    <h3 style="color:#e2e8f0;font-size:14px;margin-bottom:12px;display:flex;align-items:center;gap:6px;">
      <span style="color:#ef4444;">&#9888;</span> Risk Watchlist (LTV > 100%)
    </h3>
    <div style="overflow-y:auto;flex:1;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:2px solid #334155;">
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">VIN</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Vehicle</th>
            <th style="padding:8px 10px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase;">Loan Bal</th>
            <th style="padding:8px 10px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase;">FMV</th>
            <th style="padding:8px 10px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase;">LTV%</th>
            <th style="padding:8px 10px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase;">Depr</th>
            <th style="padding:8px 10px;text-align:center;font-size:11px;color:#64748b;text-transform:uppercase;">Risk</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  </div>`;
}

function renderDepreciationHeatmap(data: HeatmapCell[]): string {
  const makes = ["Toyota", "Honda", "Ford", "GM", "Tesla", "BMW"];
  const buckets = ["0-2yr", "2-4yr", "4-6yr"];

  const lookup: Record<string, number> = {};
  data.forEach(d => { lookup[`${d.make}|${d.ageBucket}`] = d.deprRate; });

  const headerCells = buckets.map(b => `<th style="padding:10px 14px;text-align:center;font-size:11px;color:#64748b;text-transform:uppercase;">${b}</th>`).join("");

  const bodyRows = makes.map(make => {
    const cells = buckets.map(b => {
      const rate = lookup[`${make}|${b}`] ?? 0;
      return `<td style="padding:10px 14px;text-align:center;font-weight:600;color:${deprColor(rate)};background:${deprBg(rate)};border-radius:4px;font-size:13px;">${fmtPct(rate)}/yr</td>`;
    }).join("");
    return `<tr>
      <td style="padding:10px 14px;color:#e2e8f0;font-weight:600;font-size:13px;">${make}</td>
      ${cells}
    </tr>`;
  }).join("");

  return `<div style="background:#1e293b;border-radius:10px;padding:16px;height:100%;display:flex;flex-direction:column;">
    <h3 style="color:#e2e8f0;font-size:14px;margin-bottom:12px;">Depreciation Heatmap</h3>
    <div style="overflow:auto;flex:1;">
      <table style="width:100%;border-collapse:separate;border-spacing:3px;">
        <thead>
          <tr>
            <th style="padding:10px 14px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Make</th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
      </table>
    </div>
  </div>`;
}

// ── Canvas Rendering ──────────────────────────────────────────────────

function drawLTVHistogram(canvas: HTMLCanvasElement, loans: Loan[]): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;

  // Buckets
  const buckets = [
    { label: "60-80%", min: 60, max: 80, color: "#16a34a", loans: [] as Loan[] },
    { label: "80-100%", min: 80, max: 100, color: "#ca8a04", loans: [] as Loan[] },
    { label: "100-120%", min: 100, max: 120, color: "#ea580c", loans: [] as Loan[] },
    { label: "120%+", min: 120, max: 999, color: "#dc2626", loans: [] as Loan[] },
  ];

  loans.forEach(l => {
    for (const b of buckets) {
      if (l.ltv >= b.min && l.ltv < b.max) { b.loans.push(l); break; }
    }
    // catch exactly 120
    if (loans.length === 0) return;
  });
  // Also check 120+
  loans.forEach(l => {
    if (l.ltv >= 120 && !buckets[3].loans.includes(l)) {
      // Already handled by the loop above since max is 999
    }
  });

  const maxCount = Math.max(...buckets.map(b => b.loans.length), 1);

  const padLeft = 50;
  const padRight = 20;
  const padTop = 40;
  const padBottom = 65;
  const chartW = W - padLeft - padRight;
  const chartH = H - padTop - padBottom;
  const barW = chartW / buckets.length;
  const barGap = 12;

  // Background
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.fillText("LTV Distribution", 16, 26);

  // Y-axis grid lines
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  const ySteps = 5;
  for (let i = 0; i <= ySteps; i++) {
    const y = padTop + chartH - (i / ySteps) * chartH;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(W - padRight, y);
    ctx.stroke();

    const val = Math.round((maxCount / ySteps) * i);
    ctx.fillStyle = "#64748b";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(val.toString(), padLeft - 8, y + 4);
  }

  // Bars
  buckets.forEach((b, i) => {
    const x = padLeft + i * barW + barGap / 2;
    const w = barW - barGap;
    const barH = (b.loans.length / maxCount) * chartH;
    const y = padTop + chartH - barH;

    // Bar gradient
    const grad = ctx.createLinearGradient(x, y, x, padTop + chartH);
    grad.addColorStop(0, b.color);
    grad.addColorStop(1, b.color + "44");
    ctx.fillStyle = grad;

    // Rounded top
    const radius = 4;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, padTop + chartH);
    ctx.lineTo(x, padTop + chartH);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.fill();

    // Count label on bar
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    if (b.loans.length > 0) {
      ctx.fillText(b.loans.length.toString(), x + w / 2, y - 8);
    }

    // Exposure amount below count
    const exposure = b.loans.reduce((s, l) => s + l.loanBalance, 0);
    if (b.loans.length > 0) {
      ctx.fillStyle = b.color;
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText(fmt$(exposure), x + w / 2, y - 22 > padTop ? y - 22 : padTop + 12);
    }

    // X-axis label
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(b.label, x + w / 2, padTop + chartH + 18);

    // Zone label
    ctx.fillStyle = b.color;
    ctx.font = "bold 10px system-ui, sans-serif";
    const zoneLabels = ["Safe", "Caution", "At Risk", "Underwater"];
    ctx.fillText(zoneLabels[i], x + w / 2, padTop + chartH + 34);
  });

  // Y-axis label
  ctx.save();
  ctx.translate(14, padTop + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "#64748b";
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Count", 0, 0);
  ctx.restore();
}

function drawSegmentDonut(canvas: HTMLCanvasElement, loans: Loan[]): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;

  // Background
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.fillText("Segment Exposure", 16, 26);

  const segmentColors: Record<string, string> = {
    SUV: "#3b82f6",
    Sedan: "#8b5cf6",
    Truck: "#f59e0b",
    EV: "#10b981",
    Other: "#6b7280",
  };

  const segmentTargets: Record<string, number> = {
    SUV: 35, Sedan: 25, Truck: 20, EV: 15, Other: 5,
  };

  // Calculate segment data
  const segMap: Record<string, { count: number; totalDepr: number }> = {};
  loans.forEach(l => {
    if (!segMap[l.segment]) segMap[l.segment] = { count: 0, totalDepr: 0 };
    segMap[l.segment].count++;
    segMap[l.segment].totalDepr += l.deprRate;
  });

  const segments: SegmentData[] = Object.entries(segmentTargets).map(([name, pct]) => {
    const seg = segMap[name];
    return {
      name,
      count: seg ? seg.count : 0,
      pct,
      avgDepr: seg ? seg.totalDepr / seg.count : 0,
      color: segmentColors[name] || "#6b7280",
    };
  });

  const cx = W * 0.38;
  const cy = H * 0.55;
  const outerR = Math.min(W * 0.30, H * 0.38);
  const innerR = outerR * 0.55;

  let startAngle = -Math.PI / 2;
  const segmentAngles: { seg: SegmentData; start: number; end: number; mid: number }[] = [];

  segments.forEach(seg => {
    const sweep = (seg.pct / 100) * 2 * Math.PI;
    const endAngle = startAngle + sweep;
    const midAngle = startAngle + sweep / 2;
    segmentAngles.push({ seg, start: startAngle, end: endAngle, mid: midAngle });

    // Draw arc
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, startAngle, endAngle);
    ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
    ctx.closePath();

    const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
    grad.addColorStop(0, seg.color + "aa");
    grad.addColorStop(1, seg.color);
    ctx.fillStyle = grad;
    ctx.fill();

    // Separator line
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.stroke();

    startAngle = endAngle;
  });

  // Center text
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "bold 18px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(loans.length.toString(), cx, cy - 8);
  ctx.fillStyle = "#64748b";
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText("Total Loans", cx, cy + 10);

  // Legend on right side
  const legendX = W * 0.68;
  let legendY = H * 0.18;
  const lineH = 38;

  segments.forEach(seg => {
    // Color dot
    ctx.beginPath();
    ctx.arc(legendX, legendY + 2, 5, 0, Math.PI * 2);
    ctx.fillStyle = seg.color;
    ctx.fill();

    // Name and percentage
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`${seg.name} (${seg.pct}%)`, legendX + 14, legendY - 5);

    // Avg depreciation
    ctx.fillStyle = deprColor(seg.avgDepr);
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText(`Avg depr: ${fmtPct(seg.avgDepr)}/yr`, legendX + 14, legendY + 11);

    legendY += lineH;
  });
}

// ── Live Data Fetch ───────────────────────────────────────────────────

async function _fetchDirect(state?: string): Promise<{ heatmapData: HeatmapCell[] } | null> {
  const auth = _getAuth();
  if (!auth.value) return null;

  try {
    const makeParam = `ranking_dimensions=make&ranking_measure=average_sale_price&ranking_order=desc&top_n=10&inventory_type=used`;
    const stateQ = state ? `&state=${encodeURIComponent(state)}` : "";
    const authQ = auth.mode === "api_key" ? `&api_key=${encodeURIComponent(auth.value)}` : `&access_token=${encodeURIComponent(auth.value)}`;
    const base = _proxyBase();

    // Fetch by-make data for 0-2 yr, 2-4 yr, 4-6 yr age buckets
    const [r0, r2, r4] = await Promise.all([
      fetch(`${base}/api/v1/sold-vehicles/summary?${makeParam}&year_min=2023&year_max=2026${stateQ}${authQ}`),
      fetch(`${base}/api/v1/sold-vehicles/summary?${makeParam}&year_min=2021&year_max=2022${stateQ}${authQ}`),
      fetch(`${base}/api/v1/sold-vehicles/summary?${makeParam}&year_min=2019&year_max=2020${stateQ}${authQ}`),
    ]);

    const [d0, d2, d4] = await Promise.all([
      r0.ok ? r0.json() : null,
      r2.ok ? r2.json() : null,
      r4.ok ? r4.json() : null,
    ]);

    // Build heatmap from rankings
    const MAKES = ["Toyota", "Honda", "Ford", "GM", "Tesla", "BMW"];
    const buildMap = (data: any): Record<string, number> => {
      const map: Record<string, number> = {};
      const rows = data?.rankings ?? data?.data ?? [];
      for (const row of rows) {
        const m = row.make ?? row.dimension_value ?? "";
        if (MAKES.includes(m) && row.average_sale_price > 0) {
          map[m] = row.average_sale_price;
        }
      }
      return map;
    };

    const avg0 = buildMap(d0);
    const avg2 = buildMap(d2);
    const avg4 = buildMap(d4);

    const cells: HeatmapCell[] = [];
    for (const make of MAKES) {
      const p0 = avg0[make], p2 = avg2[make], p4 = avg4[make];
      // Approximate annual depreciation rate from price drop between buckets
      if (p0 && p2) {
        const rate = ((p0 - p2) / p0) * 100 / 2; // over ~2yr spread
        cells.push({ make, ageBucket: "0-2yr", deprRate: Math.max(0, rate) });
      } else {
        cells.push(...generateHeatmapData().filter(d => d.make === make && d.ageBucket === "0-2yr"));
      }
      if (p2 && p4) {
        const rate = ((p2 - p4) / p2) * 100 / 2;
        cells.push({ make, ageBucket: "2-4yr", deprRate: Math.max(0, rate) });
      } else {
        cells.push(...generateHeatmapData().filter(d => d.make === make && d.ageBucket === "2-4yr"));
      }
      // 4-6yr: use mock for now
      cells.push(...generateHeatmapData().filter(d => d.make === make && d.ageBucket === "4-6yr"));
    }

    return cells.length > 0 ? { heatmapData: cells } : null;
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────


(async () => {
  const mode = _detectAppMode();
  const urlParams = _getUrlParams();
  const state = urlParams.state;

  const loans = generateMockLoans();
  let heatmapData = generateHeatmapData();

  // Fetch live market data if key is present
  if (mode === "live" || mode === "mcp") {
    const liveData = await _fetchDirect(state);
    if (liveData) heatmapData = liveData.heatmapData;
  }

  const el = document.body;
  el.style.fontFamily = "system-ui, -apple-system, sans-serif";
  el.style.background = "#0f172a";
  el.style.color = "#e2e8f0";
  el.style.padding = "20px";
  el.style.minHeight = "100vh";
  el.style.margin = "0";

  // Header
  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;";
  header.innerHTML = `
    <div>
      <h1 style="font-size:22px;font-weight:700;color:#f1f5f9;margin-bottom:4px;">Portfolio Risk Monitor</h1>
      <p style="font-size:12px;color:#64748b;">Auto Loan Portfolio Health & LTV Analysis</p>
    </div>
  `;
  el.appendChild(header);
  _addSettingsBar(header);

  // VIN Input Area
  const vinSection = document.createElement("div");
  vinSection.innerHTML = renderVINInput();
  el.appendChild(vinSection);

  // Pre-fill VIN from URL params
  const vinInputEl = vinSection.querySelector("#vin-input") as HTMLTextAreaElement | null;
  if (vinInputEl && urlParams.vin) {
    vinInputEl.value = urlParams.vin;
  }

  // KPI Ribbon
  const kpiSection = document.createElement("div");
  kpiSection.innerHTML = renderKPIs(loans);
  el.appendChild(kpiSection);

  // Top row: LTV Histogram (left 50%) + Risk Watchlist (right 50%)
  const topRow = document.createElement("div");
  topRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;";

  // LTV Histogram
  const histContainer = document.createElement("div");
  histContainer.style.cssText = "background:#1e293b;border-radius:10px;padding:0;overflow:hidden;height:320px;";
  const histCanvas = document.createElement("canvas");
  histCanvas.style.cssText = "width:100%;height:100%;display:block;";
  histContainer.appendChild(histCanvas);
  topRow.appendChild(histContainer);

  // Risk Watchlist Table
  const watchContainer = document.createElement("div");
  watchContainer.style.cssText = "height:320px;";
  watchContainer.innerHTML = renderWatchlistTable(loans);
  topRow.appendChild(watchContainer);

  el.appendChild(topRow);

  // Bottom row: Segment Donut (left) + Depreciation Heatmap (right)
  const bottomRow = document.createElement("div");
  bottomRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:16px;";

  // Segment Donut
  const donutContainer = document.createElement("div");
  donutContainer.style.cssText = "background:#1e293b;border-radius:10px;padding:0;overflow:hidden;height:320px;";
  const donutCanvas = document.createElement("canvas");
  donutCanvas.style.cssText = "width:100%;height:100%;display:block;";
  donutContainer.appendChild(donutCanvas);
  bottomRow.appendChild(donutContainer);

  // Depreciation Heatmap
  const heatmapContainer = document.createElement("div");
  heatmapContainer.style.cssText = "height:320px;";
  heatmapContainer.innerHTML = renderDepreciationHeatmap(heatmapData);
  bottomRow.appendChild(heatmapContainer);

  el.appendChild(bottomRow);

  // Draw canvases after DOM attachment
  requestAnimationFrame(() => {
    drawLTVHistogram(histCanvas, loans);
    drawSegmentDonut(donutCanvas, loans);
  });

  // VIN analyze button handler
  const vinBtn = el.querySelector("#vin-btn") as HTMLButtonElement | null;
  const vinInput = el.querySelector("#vin-input") as HTMLTextAreaElement | null;
  if (vinBtn && vinInput) {
    vinBtn.addEventListener("click", () => {
      const raw = vinInput.value.trim();
      if (!raw) return;
      const vins = raw.split(/[,\n\r]+/).map(v => v.trim()).filter(Boolean);
      const matched = loans.filter(l => vins.some(v => l.vin.includes(v)));
      if (matched.length > 0) {
        alert(`Found ${matched.length} loan(s):\n${matched.map(m => `${m.vin.slice(-6)} - ${m.year} ${m.make} ${m.model} - LTV: ${fmtPct(m.ltv)}`).join("\n")}`);
      } else {
        alert(`No matching loans found for the provided VIN(s).`);
      }
    });
  }

  // Handle resize
  window.addEventListener("resize", () => {
    drawLTVHistogram(histCanvas, loans);
    drawSegmentDonut(donutCanvas, loans);
  });
})();
