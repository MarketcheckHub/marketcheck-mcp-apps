/**
 * Stocking Intelligence — Dealer Inventory Advisor
 * MCP App 9 — Dark-themed dashboard with demand heatmap, buy/avoid lists, VIN checker
 */
import { App } from "@modelcontextprotocol/ext-apps";

const _safeApp = (() => { try { return new App({ name: "stocking-intelligence" });

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

// ── Types ──────────────────────────────────────────────────────────────────────

interface HeatmapCell {
  bodyType: string;
  priceTier: string;
  dsRatio: number;
}

interface StockModel {
  make: string;
  model: string;
  dsRatio: number;
  avgSalePrice: number;
  avgDom: number;
  turnRate: number;
  expectedMargin: number;
  verdict: string;
}

interface VinResult {
  vin: string;
  year: number;
  make: string;
  model: string;
  retailPrice: number;
  wholesalePrice: number;
  expectedMargin: number;
  localSupply: number;
  verdict: string;
}

interface StockingData {
  heatmap: HeatmapCell[];
  buyList: StockModel[];
  avoidList: StockModel[];
}

interface VinCheckResponse {
  results: VinResult[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const BODY_TYPES = [
  "Compact SUV",
  "Midsize SUV",
  "Full-Size Truck",
  "Midsize Sedan",
  "Compact",
  "Luxury",
];

const PRICE_TIERS = ["$0-15K", "$15-25K", "$25-35K", "$35-50K", "$50K+"];

// ── Mock Data ──────────────────────────────────────────────────────────────────

function getMockStockingData(): StockingData {
  const heatmap: HeatmapCell[] = [
    // Compact SUV
    { bodyType: "Compact SUV", priceTier: "$0-15K", dsRatio: 2.1 },
    { bodyType: "Compact SUV", priceTier: "$15-25K", dsRatio: 1.8 },
    { bodyType: "Compact SUV", priceTier: "$25-35K", dsRatio: 1.3 },
    { bodyType: "Compact SUV", priceTier: "$35-50K", dsRatio: 0.9 },
    { bodyType: "Compact SUV", priceTier: "$50K+", dsRatio: 0.5 },
    // Midsize SUV
    { bodyType: "Midsize SUV", priceTier: "$0-15K", dsRatio: 2.4 },
    { bodyType: "Midsize SUV", priceTier: "$15-25K", dsRatio: 1.9 },
    { bodyType: "Midsize SUV", priceTier: "$25-35K", dsRatio: 1.6 },
    { bodyType: "Midsize SUV", priceTier: "$35-50K", dsRatio: 1.1 },
    { bodyType: "Midsize SUV", priceTier: "$50K+", dsRatio: 0.7 },
    // Full-Size Truck
    { bodyType: "Full-Size Truck", priceTier: "$0-15K", dsRatio: 2.8 },
    { bodyType: "Full-Size Truck", priceTier: "$15-25K", dsRatio: 2.2 },
    { bodyType: "Full-Size Truck", priceTier: "$25-35K", dsRatio: 1.7 },
    { bodyType: "Full-Size Truck", priceTier: "$35-50K", dsRatio: 1.2 },
    { bodyType: "Full-Size Truck", priceTier: "$50K+", dsRatio: 0.8 },
    // Midsize Sedan
    { bodyType: "Midsize Sedan", priceTier: "$0-15K", dsRatio: 1.6 },
    { bodyType: "Midsize Sedan", priceTier: "$15-25K", dsRatio: 1.2 },
    { bodyType: "Midsize Sedan", priceTier: "$25-35K", dsRatio: 0.9 },
    { bodyType: "Midsize Sedan", priceTier: "$35-50K", dsRatio: 0.6 },
    { bodyType: "Midsize Sedan", priceTier: "$50K+", dsRatio: 0.4 },
    // Compact
    { bodyType: "Compact", priceTier: "$0-15K", dsRatio: 1.9 },
    { bodyType: "Compact", priceTier: "$15-25K", dsRatio: 1.4 },
    { bodyType: "Compact", priceTier: "$25-35K", dsRatio: 1.0 },
    { bodyType: "Compact", priceTier: "$35-50K", dsRatio: 0.6 },
    { bodyType: "Compact", priceTier: "$50K+", dsRatio: 0.3 },
    // Luxury
    { bodyType: "Luxury", priceTier: "$0-15K", dsRatio: 1.1 },
    { bodyType: "Luxury", priceTier: "$15-25K", dsRatio: 0.9 },
    { bodyType: "Luxury", priceTier: "$25-35K", dsRatio: 0.7 },
    { bodyType: "Luxury", priceTier: "$35-50K", dsRatio: 1.0 },
    { bodyType: "Luxury", priceTier: "$50K+", dsRatio: 0.5 },
  ];

  const buyList: StockModel[] = [
    { make: "Ford", model: "F-150", dsRatio: 2.8, avgSalePrice: 22500, avgDom: 12, turnRate: 4.2, expectedMargin: 3200, verdict: "STRONG BUY" },
    { make: "Toyota", model: "4Runner", dsRatio: 2.5, avgSalePrice: 31200, avgDom: 9, turnRate: 4.8, expectedMargin: 4100, verdict: "STRONG BUY" },
    { make: "Chevrolet", model: "Silverado", dsRatio: 2.4, avgSalePrice: 24800, avgDom: 14, turnRate: 3.9, expectedMargin: 2900, verdict: "STRONG BUY" },
    { make: "Toyota", model: "RAV4", dsRatio: 2.2, avgSalePrice: 19500, avgDom: 11, turnRate: 4.5, expectedMargin: 2600, verdict: "STRONG BUY" },
    { make: "Honda", model: "CR-V", dsRatio: 2.1, avgSalePrice: 20100, avgDom: 13, turnRate: 4.3, expectedMargin: 2500, verdict: "STRONG BUY" },
    { make: "Jeep", model: "Grand Cherokee", dsRatio: 1.9, avgSalePrice: 28700, avgDom: 16, turnRate: 3.6, expectedMargin: 2800, verdict: "BUY" },
    { make: "Honda", model: "Civic", dsRatio: 1.8, avgSalePrice: 16200, avgDom: 15, turnRate: 3.8, expectedMargin: 1900, verdict: "BUY" },
    { make: "Toyota", model: "Tacoma", dsRatio: 1.8, avgSalePrice: 27300, avgDom: 10, turnRate: 4.6, expectedMargin: 3500, verdict: "BUY" },
    { make: "Hyundai", model: "Tucson", dsRatio: 1.7, avgSalePrice: 18900, avgDom: 18, turnRate: 3.4, expectedMargin: 2100, verdict: "BUY" },
    { make: "Subaru", model: "Outback", dsRatio: 1.7, avgSalePrice: 22400, avgDom: 17, turnRate: 3.5, expectedMargin: 2200, verdict: "BUY" },
    { make: "Ford", model: "Bronco Sport", dsRatio: 1.6, avgSalePrice: 24100, avgDom: 19, turnRate: 3.3, expectedMargin: 2400, verdict: "BUY" },
    { make: "Mazda", model: "CX-5", dsRatio: 1.6, avgSalePrice: 21600, avgDom: 20, turnRate: 3.2, expectedMargin: 2000, verdict: "BUY" },
    { make: "Kia", model: "Sportage", dsRatio: 1.5, avgSalePrice: 19800, avgDom: 21, turnRate: 3.1, expectedMargin: 1800, verdict: "WATCH" },
    { make: "Toyota", model: "Camry", dsRatio: 1.5, avgSalePrice: 18500, avgDom: 22, turnRate: 3.0, expectedMargin: 1700, verdict: "WATCH" },
    { make: "Chevrolet", model: "Equinox", dsRatio: 1.4, avgSalePrice: 17200, avgDom: 23, turnRate: 2.9, expectedMargin: 1500, verdict: "WATCH" },
  ];

  const avoidList: StockModel[] = [
    { make: "Nissan", model: "Altima", dsRatio: 0.4, avgSalePrice: 15800, avgDom: 62, turnRate: 1.1, expectedMargin: 400, verdict: "AVOID" },
    { make: "Chevrolet", model: "Malibu", dsRatio: 0.4, avgSalePrice: 14200, avgDom: 58, turnRate: 1.2, expectedMargin: 350, verdict: "AVOID" },
    { make: "Dodge", model: "Journey", dsRatio: 0.5, avgSalePrice: 13500, avgDom: 55, turnRate: 1.3, expectedMargin: 500, verdict: "AVOID" },
    { make: "Chrysler", model: "300", dsRatio: 0.5, avgSalePrice: 16900, avgDom: 53, turnRate: 1.3, expectedMargin: 450, verdict: "AVOID" },
    { make: "Buick", model: "Encore", dsRatio: 0.5, avgSalePrice: 15100, avgDom: 51, turnRate: 1.4, expectedMargin: 550, verdict: "AVOID" },
    { make: "Infiniti", model: "QX50", dsRatio: 0.6, avgSalePrice: 24500, avgDom: 48, turnRate: 1.5, expectedMargin: 600, verdict: "SLOW" },
    { make: "Lincoln", model: "MKZ", dsRatio: 0.6, avgSalePrice: 19800, avgDom: 47, turnRate: 1.5, expectedMargin: 550, verdict: "SLOW" },
    { make: "Acura", model: "TLX", dsRatio: 0.7, avgSalePrice: 22300, avgDom: 44, turnRate: 1.6, expectedMargin: 700, verdict: "SLOW" },
    { make: "Cadillac", model: "XT4", dsRatio: 0.7, avgSalePrice: 26100, avgDom: 42, turnRate: 1.7, expectedMargin: 750, verdict: "SLOW" },
    { make: "Volkswagen", model: "Passat", dsRatio: 0.7, avgSalePrice: 16400, avgDom: 41, turnRate: 1.7, expectedMargin: 650, verdict: "SLOW" },
  ];

  return { heatmap, buyList, avoidList };
}

function getMockVinResults(vins: string[]): VinResult[] {
  const mockDb: Record<string, Omit<VinResult, "vin">> = {
    "1FTFW1E82MFA00001": { year: 2021, make: "Ford", model: "F-150 XLT", retailPrice: 36500, wholesalePrice: 30200, expectedMargin: 6300, localSupply: 4, verdict: "BUY" },
    "2T1BURHE0JC000002": { year: 2018, make: "Toyota", model: "Corolla LE", retailPrice: 17200, wholesalePrice: 13800, expectedMargin: 3400, localSupply: 12, verdict: "CAUTION" },
    "5J8TC2H56NL000003": { year: 2022, make: "Acura", model: "RDX SH-AWD", retailPrice: 34800, wholesalePrice: 29500, expectedMargin: 5300, localSupply: 3, verdict: "BUY" },
    "1G1YY22G265000004": { year: 2020, make: "Chevrolet", model: "Corvette", retailPrice: 62500, wholesalePrice: 55800, expectedMargin: 6700, localSupply: 1, verdict: "BUY" },
    "3N1AB7AP5KY000005": { year: 2019, make: "Nissan", model: "Sentra S", retailPrice: 12800, wholesalePrice: 10900, expectedMargin: 1900, localSupply: 22, verdict: "PASS" },
    "WBA5R1C50KA000006": { year: 2019, make: "BMW", model: "330i xDrive", retailPrice: 28900, wholesalePrice: 24100, expectedMargin: 4800, localSupply: 6, verdict: "BUY" },
    "1C4RJFBG5LC000007": { year: 2020, make: "Jeep", model: "Grand Cherokee Limited", retailPrice: 31200, wholesalePrice: 25800, expectedMargin: 5400, localSupply: 5, verdict: "BUY" },
    "JTDKN3DU5A0000008": { year: 2021, make: "Toyota", model: "Prius LE", retailPrice: 22500, wholesalePrice: 18600, expectedMargin: 3900, localSupply: 8, verdict: "CAUTION" },
    "1HGBH41JXMN000009": { year: 2021, make: "Honda", model: "Civic EX", retailPrice: 21800, wholesalePrice: 17500, expectedMargin: 4300, localSupply: 7, verdict: "BUY" },
    "KM8J3CA46MU000010": { year: 2021, make: "Hyundai", model: "Tucson SEL", retailPrice: 24100, wholesalePrice: 19800, expectedMargin: 4300, localSupply: 9, verdict: "CAUTION" },
  };

  return vins.map((vin) => {
    const cleaned = vin.trim().toUpperCase();
    const known = mockDb[cleaned];
    if (known) {
      return { vin: cleaned, ...known };
    }
    // Generate plausible random result for unknown VINs
    const retailPrice = 18000 + Math.floor(Math.random() * 25000);
    const wholesalePrice = Math.round(retailPrice * (0.78 + Math.random() * 0.08));
    const margin = retailPrice - wholesalePrice;
    const supply = 2 + Math.floor(Math.random() * 20);
    let verdict: string;
    if (margin > 4000 && supply < 8) verdict = "BUY";
    else if (margin < 2000 || supply > 15) verdict = "PASS";
    else verdict = "CAUTION";
    return {
      vin: cleaned,
      year: 2018 + Math.floor(Math.random() * 5),
      make: "Unknown",
      model: "Decoded Model",
      retailPrice,
      wholesalePrice,
      expectedMargin: margin,
      localSupply: supply,
      verdict,
    };
  });
}

// ── Formatting Helpers ─────────────────────────────────────────────────────────

function fmtDollar(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

function fmtRatio(n: number): string {
  return n.toFixed(1);
}

function heatColor(dsRatio: number): string {
  if (dsRatio > 1.5) return "#166534"; // green — hot/undersupplied
  if (dsRatio >= 0.8) return "#854d0e"; // yellow — balanced
  return "#991b1b"; // red — oversupplied
}

function heatTextColor(dsRatio: number): string {
  if (dsRatio > 1.5) return "#86efac";
  if (dsRatio >= 0.8) return "#fde68a";
  return "#fca5a5";
}

function verdictBadge(verdict: string): string {
  const colors: Record<string, { bg: string; text: string }> = {
    "STRONG BUY": { bg: "#166534", text: "#86efac" },
    BUY: { bg: "#1e3a5f", text: "#93c5fd" },
    WATCH: { bg: "#854d0e", text: "#fde68a" },
    AVOID: { bg: "#991b1b", text: "#fca5a5" },
    SLOW: { bg: "#9a3412", text: "#fdba74" },
    CAUTION: { bg: "#854d0e", text: "#fde68a" },
    PASS: { bg: "#991b1b", text: "#fca5a5" },
  };
  const c = colors[verdict] ?? { bg: "#334155", text: "#e2e8f0" };
  return `<span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:700;letter-spacing:0.5px;background:${c.bg};color:${c.text}">${verdict}</span>`;
}

// ── Render Functions ───────────────────────────────────────────────────────────

function renderHeatmap(cells: HeatmapCell[]): string {
  const lookup = new Map<string, number>();
  for (const c of cells) {
    lookup.set(`${c.bodyType}|${c.priceTier}`, c.dsRatio);
  }

  let headerCells = `<th style="padding:10px 14px;text-align:left;font-weight:600;color:#94a3b8;border-bottom:2px solid #334155;background:#0f172a">Body Type</th>`;
  for (const tier of PRICE_TIERS) {
    headerCells += `<th style="padding:10px 14px;text-align:center;font-weight:600;color:#94a3b8;border-bottom:2px solid #334155;background:#0f172a">${tier}</th>`;
  }

  let rows = "";
  for (const bt of BODY_TYPES) {
    let tds = `<td style="padding:10px 14px;font-weight:600;color:#e2e8f0;border-bottom:1px solid #1e293b">${bt}</td>`;
    for (const tier of PRICE_TIERS) {
      const ratio = lookup.get(`${bt}|${tier}`) ?? 0;
      const bg = heatColor(ratio);
      const fg = heatTextColor(ratio);
      tds += `<td style="padding:10px 14px;text-align:center;font-weight:700;font-size:16px;border-bottom:1px solid #1e293b;background:${bg};color:${fg};border-radius:0">${fmtRatio(ratio)}</td>`;
    }
    rows += `<tr>${tds}</tr>`;
  }

  return `
    <div style="margin-bottom:24px">
      <h2 style="font-size:18px;font-weight:700;color:#e2e8f0;margin-bottom:4px">Demand / Supply Heatmap</h2>
      <p style="font-size:12px;color:#64748b;margin-bottom:12px">
        <span style="color:#86efac">Green &gt;1.5 = Hot (undersupplied)</span> &nbsp;|&nbsp;
        <span style="color:#fde68a">Yellow 0.8-1.5 = Balanced</span> &nbsp;|&nbsp;
        <span style="color:#fca5a5">Red &lt;0.8 = Oversupplied</span>
      </p>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function renderModelTable(models: StockModel[], title: string, isBuy: boolean): string {
  const headerStyle = `padding:8px 12px;text-align:left;font-weight:600;color:#94a3b8;border-bottom:2px solid #334155;font-size:12px;text-transform:uppercase;letter-spacing:0.5px`;
  const headerRight = `${headerStyle};text-align:right`;
  const headers = `
    <tr>
      <th style="${headerStyle}">Make/Model</th>
      <th style="${headerRight}">D/S Ratio</th>
      <th style="${headerRight}">Avg Sale Price</th>
      <th style="${headerRight}">Avg DOM</th>
      <th style="${headerRight}">Turn Rate</th>
      <th style="${headerRight}">Exp. Margin</th>
      <th style="${headerStyle};text-align:center">Verdict</th>
    </tr>`;

  let rows = "";
  for (const m of models) {
    const cellStyle = `padding:8px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:13px`;
    const cellRight = `${cellStyle};text-align:right`;
    const ratioColor = isBuy ? "#86efac" : "#fca5a5";
    rows += `<tr>
      <td style="${cellStyle};font-weight:600">${m.make} ${m.model}</td>
      <td style="${cellRight};color:${ratioColor};font-weight:700">${fmtRatio(m.dsRatio)}</td>
      <td style="${cellRight}">${fmtDollar(m.avgSalePrice)}</td>
      <td style="${cellRight}">${m.avgDom}d</td>
      <td style="${cellRight}">${m.turnRate.toFixed(1)}x</td>
      <td style="${cellRight};color:${isBuy ? "#86efac" : "#fca5a5"}">${fmtDollar(m.expectedMargin)}</td>
      <td style="${cellStyle};text-align:center">${verdictBadge(m.verdict)}</td>
    </tr>`;
  }

  const borderColor = isBuy ? "#166534" : "#991b1b";
  return `
    <div style="background:#1e293b;border-radius:12px;border:1px solid ${borderColor};overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid #334155">
        <h3 style="font-size:16px;font-weight:700;color:#e2e8f0">${title}</h3>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>${headers}</thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function renderVinChecker(results: VinResult[] | null): string {
  let resultsHtml = "";
  if (results && results.length > 0) {
    const headerStyle = `padding:8px 12px;text-align:left;font-weight:600;color:#94a3b8;border-bottom:2px solid #334155;font-size:12px;text-transform:uppercase;letter-spacing:0.5px`;
    const headerRight = `${headerStyle};text-align:right`;
    const headers = `
      <tr>
        <th style="${headerStyle}">VIN</th>
        <th style="${headerStyle}">Year/Make/Model</th>
        <th style="${headerRight}">Retail Price</th>
        <th style="${headerRight}">Wholesale Price</th>
        <th style="${headerRight}">Exp. Margin</th>
        <th style="${headerRight}">Local Supply</th>
        <th style="${headerStyle};text-align:center">Verdict</th>
      </tr>`;

    let rows = "";
    for (const r of results) {
      const cellStyle = `padding:8px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:13px`;
      const cellRight = `${cellStyle};text-align:right`;
      const marginColor = r.expectedMargin >= 4000 ? "#86efac" : r.expectedMargin >= 2000 ? "#fde68a" : "#fca5a5";
      rows += `<tr>
        <td style="${cellStyle};font-family:monospace;font-size:11px">${r.vin}</td>
        <td style="${cellStyle};font-weight:600">${r.year} ${r.make} ${r.model}</td>
        <td style="${cellRight}">${fmtDollar(r.retailPrice)}</td>
        <td style="${cellRight}">${fmtDollar(r.wholesalePrice)}</td>
        <td style="${cellRight};color:${marginColor};font-weight:700">${fmtDollar(r.expectedMargin)}</td>
        <td style="${cellRight}">${r.localSupply}</td>
        <td style="${cellStyle};text-align:center">${verdictBadge(r.verdict)}</td>
      </tr>`;
    }

    resultsHtml = `
      <div style="margin-top:16px;overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>${headers}</thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  return `
    <div style="margin-top:24px;background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid #334155">
        <h3 style="font-size:16px;font-weight:700;color:#e2e8f0">VIN Checker</h3>
        <p style="font-size:12px;color:#64748b;margin-top:2px">Paste up to 10 VINs, one per line, to evaluate</p>
      </div>
      <div style="padding:16px">
        <textarea id="vin-input" placeholder="Paste VINs here, one per line...&#10;e.g.&#10;1FTFW1E82MFA00001&#10;2T1BURHE0JC000002" style="width:100%;min-height:120px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:8px;padding:12px;font-family:monospace;font-size:13px;resize:vertical;outline:none"></textarea>
        <div style="margin-top:12px;display:flex;align-items:center;gap:12px">
          <button id="vin-check-btn" style="background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:10px 24px;font-size:14px;font-weight:600;cursor:pointer;transition:background 0.15s">Check VINs</button>
          <span id="vin-status" style="font-size:12px;color:#64748b"></span>
        </div>
        <div id="vin-results">${resultsHtml}</div>
      </div>
    </div>`;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const app = new App();

  const root = document.createElement("div");
  root.id = "app-root";
  root.style.cssText = `
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f172a;
    color: #e2e8f0;
    min-height: 100vh;
    padding: 24px;
  `;
  document.body.style.background = "#0f172a";
  document.body.style.margin = "0";
  document.body.appendChild(root);

  // Show loading state
  root.innerHTML = `
    <div style="text-align:center;padding:80px 20px">
      <div style="font-size:24px;font-weight:700;color:#e2e8f0;margin-bottom:12px">Stocking Intelligence</div>
      <div style="color:#64748b">Loading market data...</div>
    </div>`;

  // ── Fetch data ──
  let data: StockingData;
  try {
    const result = await _callTool("stocking-intelligence", { state: "TX", zip: "75201" });
    data = JSON.parse(
      typeof result === "string" ? result : (result as { content?: Array<{ text?: string }> })?.content?.[0]?.text ?? "{}"
    );
    // Validate shape — fall back to mock if missing keys
    if (!data.heatmap || !data.buyList || !data.avoidList) {
      data = getMockStockingData();
    }
  } catch {
    data = getMockStockingData();
  }

  // ── Render full UI ──
  function renderUI(vinResults: VinResult[] | null = null) {
    root.innerHTML = `
      <div style="max-width:1400px;margin:0 auto">
        <!-- Header -->
        <div style="margin-bottom:24px">
          <h1 style="font-size:26px;font-weight:800;color:#e2e8f0;margin-bottom:4px">Stocking Intelligence</h1>
          <p style="font-size:13px;color:#64748b">Dealer inventory recommendations based on local demand/supply analysis</p>
        </div>

        <!-- Demand Heatmap -->
        ${renderHeatmap(data.heatmap)}

        <!-- Buy / Avoid Lists -->
        <div style="display:flex;gap:20px;margin-top:4px;flex-wrap:wrap">
          <div style="flex:6;min-width:320px">
            ${renderModelTable(data.buyList, "Buy List — Top 15 Models to Stock", true)}
          </div>
          <div style="flex:4;min-width:280px">
            ${renderModelTable(data.avoidList, "Avoid List — 10 Models to Skip", false)}
          </div>
        </div>

        <!-- VIN Checker -->
        ${renderVinChecker(vinResults)}
      </div>`;

    // Wire up VIN check button
    const btn = document.getElementById("vin-check-btn") as HTMLButtonElement | null;
    const textarea = document.getElementById("vin-input") as HTMLTextAreaElement | null;
    const status = document.getElementById("vin-status") as HTMLSpanElement | null;

    btn?.addEventListener("click", async () => {
      const raw = textarea?.value ?? "";
      const vins = raw
        .split("\n")
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
        .slice(0, 10);

      if (vins.length === 0) {
        if (status) status.textContent = "Please enter at least one VIN.";
        return;
      }

      if (status) status.textContent = `Checking ${vins.length} VIN${vins.length > 1 ? "s" : ""}...`;
      btn.disabled = true;
      btn.style.opacity = "0.6";

      let results: VinResult[];
      try {
        const res = await _callTool("stocking-intelligence", { state: "TX", zip: "75201", vins });
        const parsed: VinCheckResponse = JSON.parse(
          typeof res === "string" ? res : (res as { content?: Array<{ text?: string }> })?.content?.[0]?.text ?? "{}"
        );
        results = parsed.results && parsed.results.length > 0 ? parsed.results : getMockVinResults(vins);
      } catch {
        results = getMockVinResults(vins);
      }

      // Re-render with results, preserve VIN text
      const savedText = textarea?.value ?? "";
      renderUI(results);
      const newTextarea = document.getElementById("vin-input") as HTMLTextAreaElement | null;
      if (newTextarea) newTextarea.value = savedText;
    });
  }

  renderUI();
}

main();
