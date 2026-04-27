import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "lender-portfolio-stress-test" }); } catch {}

function _getAuth(): { mode: "api_key" | "oauth_token" | null; value: string | null } {
  const params = new URLSearchParams(location.search);
  const token = params.get("access_token") ?? localStorage.getItem("mc_access_token");
  if (token) return { mode: "oauth_token", value: token };
  const key = params.get("api_key") ?? localStorage.getItem("mc_api_key");
  if (key) return { mode: "api_key", value: key };
  return { mode: null, value: null };
}
function _detectAppMode(): "mcp" | "live" | "demo" { if (_getAuth().value) return "live"; if (_safeApp && window.parent !== window) return "mcp"; return "demo"; }
function _isEmbedMode(): boolean { return new URLSearchParams(location.search).has("embed"); }
function _getUrlParams(): Record<string, string> { const params = new URLSearchParams(location.search); const result: Record<string, string> = {}; for (const key of ["vin","vins","zip","make","model","miles","state","dealer_id","ticker","price","scenario"]) { const v = params.get(key); if (v) result[key] = v; } return result; }
function _proxyBase(): string { return location.protocol.startsWith("http") ? "" : "http://localhost:3001"; }

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
  const vinEntries: Array<{vin: string; loanAmount: number}> = Array.isArray(args.vins)
    ? args.vins
    : (args.vins ?? "").split(",").map((v: string) => ({ vin: v.trim(), loanAmount: 0 })).filter((e: any) => e.vin);
  const portfolio = await Promise.all(vinEntries.map(async (entry) => {
    try {
      const [decode, priceData] = await Promise.all([
        _mcDecode(entry.vin),
        _mcPredict({ vin: entry.vin, dealer_type: "franchise", zip: args.zip }),
      ]);
      return { vin: entry.vin, loanAmount: entry.loanAmount, decode, price: priceData };
    } catch {
      return { vin: entry.vin, loanAmount: entry.loanAmount, decode: null, price: null };
    }
  }));
  return { portfolio: portfolio.filter(p => p.decode || p.loanAmount > 0) };
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
(function injectResponsiveStyles() { const s = document.createElement("style"); s.textContent = `@media(max-width:768px){body{font-size:13px!important}table{font-size:12px!important}th,td{padding:6px 8px!important}h1{font-size:18px!important}h2{font-size:15px!important}canvas{max-width:100%!important}input,select,button{font-size:14px!important}[style*="display:flex"][style*="gap"],[style*="display: flex"][style*="gap"]{flex-wrap:wrap!important}[style*="grid-template-columns: repeat"]{grid-template-columns:1fr!important}[style*="grid-template-columns:repeat"]{grid-template-columns:1fr!important}table{min-width:600px}[style*="width:35%"],[style*="width:40%"],[style*="width:25%"],[style*="width:50%"],[style*="width:60%"],[style*="width:65%"],[style*="width: 35%"],[style*="width: 40%"],[style*="width: 25%"],[style*="width: 50%"],[style*="width: 60%"],[style*="width: 65%"]{width:100%!important;min-width:0!important}}@media(max-width:480px){body{padding:8px!important}h1{font-size:16px!important}th,td{padding:4px 6px!important;font-size:11px!important}input,select{max-width:100%!important;width:100%!important;box-sizing:border-box!important}}`; document.head.appendChild(s); })();


// ── Types ──────────────────────────────────────────────────────────────
type Scenario = "ev_drop_20" | "trucks_drop_15" | "market_wide_10" | "custom";
type Segment = "SUV" | "Sedan" | "Truck" | "EV" | "Luxury" | "Other";

interface LoanEntry {
  vin: string;
  year: number;
  make: string;
  model: string;
  segment: Segment;
  loanAmount: number;
  currentValue: number;
  stressedValue: number;
  currentLTV: number;
  stressedLTV: number;
  fuelType: string;
}

interface SegmentExposure {
  segment: Segment;
  color: string;
  count: number;
  currentAvgLTV: number;
  stressedAvgLTV: number;
  underwaterCount: number;
  underwaterCountStressed: number;
}

interface StressResult {
  loans: LoanEntry[];
  segments: SegmentExposure[];
  scenario: Scenario;
  customPct: number;
  totalLoans: number;
  totalCollateral: number;
  avgLTV: number;
  underwaterCount: number;
  stressedUnderwaterCount: number;
  totalValueAtRisk: number;
  worstHitSegments: string[];
}

// ── Constants ──────────────────────────────────────────────────────────
const BG = "#0f172a";
const SURFACE = "#1e293b";
const BORDER = "#334155";
const TEXT = "#e2e8f0";
const TEXT_SEC = "#94a3b8";
const TEXT_MUTED = "#64748b";
const ACCENT = "#3b82f6";
const RED = "#ef4444";
const GREEN = "#22c55e";
const YELLOW = "#eab308";
const ORANGE = "#f97316";
const CYAN = "#06b6d4";
const PURPLE = "#a78bfa";

const SEGMENT_COLORS: Record<Segment, string> = {
  SUV: ACCENT, Sedan: CYAN, Truck: ORANGE, EV: GREEN, Luxury: PURPLE, Other: TEXT_SEC,
};

const SCENARIO_LABELS: Record<Scenario, string> = {
  ev_drop_20: "EV Values Drop 20%",
  trucks_drop_15: "Trucks Drop 15%",
  market_wide_10: "Market-Wide 10% Decline",
  custom: "Custom Scenario",
};

// ── Utility ────────────────────────────────────────────────────────────
function fmt$(v: number): string { return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 }); }
function fmtPct(v: number): string { return v.toFixed(1) + "%"; }

function getStressMultiplier(segment: Segment, fuelType: string, scenario: Scenario, customPct: number): number {
  switch (scenario) {
    case "ev_drop_20":
      return fuelType === "Electric" || segment === "EV" ? 0.80 : 0.97;
    case "trucks_drop_15":
      return segment === "Truck" ? 0.85 : 0.97;
    case "market_wide_10":
      return 0.90;
    case "custom":
      return 1 - customPct / 100;
    default:
      return 0.90;
  }
}

function getLTVBadge(ltv: number): { label: string; color: string; bg: string } {
  if (ltv >= 120) return { label: "DEEP UNDERWATER", color: "#fef2f2", bg: RED };
  if (ltv >= 100) return { label: "UNDERWATER", color: "#fff7ed", bg: ORANGE };
  if (ltv >= 90) return { label: "AT RISK", color: "#fefce8", bg: YELLOW };
  return { label: "HEALTHY", color: "#f0fdf4", bg: GREEN };
}

// ── Mock Data ──────────────────────────────────────────────────────────
const MOCK_PORTFOLIO = [
  { vin: "KNDCB3LC9L5359658", loanAmount: 20000, make: "Kia", model: "Forte", year: 2020, segment: "Sedan" as Segment, fuelType: "Gas", baseValue: 18500 },
  { vin: "1HGCV1F34LA000001", loanAmount: 25000, make: "Honda", model: "Accord", year: 2020, segment: "Sedan" as Segment, fuelType: "Gas", baseValue: 27200 },
  { vin: "5YJSA1E26MF000001", loanAmount: 52000, make: "Tesla", model: "Model S", year: 2021, segment: "EV" as Segment, fuelType: "Electric", baseValue: 48500 },
  { vin: "1FTFW1E85MFA00001", loanAmount: 42000, make: "Ford", model: "F-150", year: 2021, segment: "Truck" as Segment, fuelType: "Gas", baseValue: 44800 },
  { vin: "4T1BF1FK5CU500000", loanAmount: 22000, make: "Toyota", model: "Camry", year: 2021, segment: "Sedan" as Segment, fuelType: "Gas", baseValue: 24500 },
  { vin: "WBAJB9C51KB500000", loanAmount: 45000, make: "BMW", model: "X5", year: 2019, segment: "Luxury" as Segment, fuelType: "Gas", baseValue: 48200 },
  { vin: "2HGFC2F59MH500000", loanAmount: 21000, make: "Honda", model: "Civic", year: 2021, segment: "Sedan" as Segment, fuelType: "Gas", baseValue: 23100 },
  { vin: "1FMCU9J94MU500000", loanAmount: 30000, make: "Ford", model: "Escape", year: 2021, segment: "SUV" as Segment, fuelType: "Gas", baseValue: 28900 },
];

function generateMockStressResult(scenario: Scenario, customPct: number): StressResult {
  const loans: LoanEntry[] = MOCK_PORTFOLIO.map(p => {
    const multiplier = getStressMultiplier(p.segment, p.fuelType, scenario, customPct);
    const stressedValue = Math.round(p.baseValue * multiplier);
    const currentLTV = (p.loanAmount / p.baseValue) * 100;
    const stressedLTV = (p.loanAmount / stressedValue) * 100;
    return {
      vin: p.vin, year: p.year, make: p.make, model: p.model, segment: p.segment,
      loanAmount: p.loanAmount, currentValue: p.baseValue, stressedValue,
      currentLTV, stressedLTV, fuelType: p.fuelType,
    };
  });
  return buildStressResult(loans, scenario, customPct);
}

function buildStressResult(loans: LoanEntry[], scenario: Scenario, customPct: number): StressResult {
  const segmentMap = new Map<Segment, LoanEntry[]>();
  loans.forEach(l => { const arr = segmentMap.get(l.segment) || []; arr.push(l); segmentMap.set(l.segment, arr); });

  const segments: SegmentExposure[] = Array.from(segmentMap.entries()).map(([seg, items]) => ({
    segment: seg, color: SEGMENT_COLORS[seg], count: items.length,
    currentAvgLTV: items.reduce((s, l) => s + l.currentLTV, 0) / items.length,
    stressedAvgLTV: items.reduce((s, l) => s + l.stressedLTV, 0) / items.length,
    underwaterCount: items.filter(l => l.currentLTV > 100).length,
    underwaterCountStressed: items.filter(l => l.stressedLTV > 100).length,
  }));

  const currentUnderwater = loans.filter(l => l.currentLTV > 100).length;
  const stressedUnderwater = loans.filter(l => l.stressedLTV > 100).length;
  const valueAtRisk = loans.filter(l => l.stressedLTV > 100).reduce((s, l) => s + Math.max(0, l.loanAmount - l.stressedValue), 0);
  const worstHit = [...segments].sort((a, b) => (b.stressedAvgLTV - b.currentAvgLTV) - (a.stressedAvgLTV - a.currentAvgLTV)).slice(0, 2).map(s => s.segment);

  return {
    loans, segments, scenario, customPct,
    totalLoans: loans.length,
    totalCollateral: loans.reduce((s, l) => s + l.currentValue, 0),
    avgLTV: loans.reduce((s, l) => s + l.currentLTV, 0) / loans.length,
    underwaterCount: currentUnderwater,
    stressedUnderwaterCount: stressedUnderwater,
    totalValueAtRisk: Math.max(0, valueAtRisk),
    worstHitSegments: worstHit,
  };
}

// ── Rendering ──────────────────────────────────────────────────────────
function renderHeader(): string {
  return `<div id="app-header" style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <div>
      <h1 style="font-size:22px;font-weight:700;color:${TEXT};margin:0;">Lender Portfolio Stress Test</h1>
      <p style="font-size:12px;color:${TEXT_MUTED};margin:4px 0 0 0;">Model what-if depreciation scenarios against your loan portfolio</p>
    </div>
  </div>`;
}

function renderVINInput(): string {
  const urlParams = _getUrlParams();
  let defaultVINs = MOCK_PORTFOLIO.map(p => `${p.vin},${p.loanAmount}`).join("\n");
  if (urlParams.vins) {
    defaultVINs = urlParams.vins.split(";").map(s => s.trim()).filter(Boolean).join("\n");
  }
  return `<div style="background:${SURFACE};border-radius:10px;padding:16px;margin-bottom:20px;border:1px solid ${BORDER};">
    <h3 style="color:${TEXT};font-size:14px;margin-bottom:10px;">Portfolio VIN Input</h3>
    <div style="display:flex;gap:12px;">
      <div style="flex:1;">
        <label style="font-size:11px;color:${TEXT_SEC};display:block;margin-bottom:4px;">Enter VINs with loan amounts (one per line: VIN,LoanAmount)</label>
        <textarea id="vin-input" rows="6" placeholder="5YJSA1E26MF100001,38000&#10;1FTFW1E85MFA00002,42000&#10;..." style="width:100%;background:${BG};border:1px solid ${BORDER};border-radius:6px;padding:10px;color:${TEXT};font-family:monospace;font-size:11px;resize:vertical;box-sizing:border-box;">${defaultVINs}</textarea>
        <div style="font-size:10px;color:${TEXT_MUTED};margin-top:4px;">Up to 20 VINs supported. Use URL param <code style="color:${CYAN};">vins=VIN1,Loan1;VIN2,Loan2</code> to deep-link.</div>
      </div>
    </div>
  </div>`;
}

function renderScenarioSelector(selected: Scenario, customPct: number): string {
  const scenarios: { key: Scenario; label: string; desc: string }[] = [
    { key: "ev_drop_20", label: "EV Values Drop 20%", desc: "Electric vehicle market correction" },
    { key: "trucks_drop_15", label: "Trucks Drop 15%", desc: "Truck/pickup segment decline" },
    { key: "market_wide_10", label: "Market-Wide 10%", desc: "Broad market downturn" },
    { key: "custom", label: "Custom", desc: "Set your own percentage" },
  ];

  return `<div style="background:${SURFACE};border-radius:10px;padding:16px;margin-bottom:20px;border:1px solid ${BORDER};">
    <h3 style="color:${TEXT};font-size:14px;margin-bottom:12px;">Stress Scenario</h3>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
      ${scenarios.map(s => `
        <label style="flex:1;min-width:140px;cursor:pointer;">
          <input type="radio" name="scenario" value="${s.key}" ${s.key === selected ? "checked" : ""} style="display:none;" />
          <div class="scenario-card" data-scenario="${s.key}" style="padding:12px;border-radius:8px;border:2px solid ${s.key === selected ? ACCENT : BORDER};background:${s.key === selected ? ACCENT + "15" : BG};text-align:center;transition:all 0.2s;">
            <div style="font-size:13px;font-weight:600;color:${s.key === selected ? ACCENT : TEXT};">${s.label}</div>
            <div style="font-size:10px;color:${TEXT_MUTED};margin-top:4px;">${s.desc}</div>
          </div>
        </label>
      `).join("")}
      <div id="custom-slider-wrap" style="min-width:180px;${selected !== "custom" ? "opacity:0.4;pointer-events:none;" : ""}">
        <label style="font-size:11px;color:${TEXT_SEC};display:block;margin-bottom:4px;">Custom Drop: <span id="custom-pct-label" style="color:${CYAN};">${customPct}%</span></label>
        <input id="inp-custom-pct" type="range" min="5" max="30" step="1" value="${customPct}" style="width:100%;accent-color:${CYAN};" />
      </div>
      <button id="btn-stress" style="padding:10px 24px;border-radius:6px;border:none;background:${RED};color:#fff;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap;">Run Stress Test</button>
    </div>
  </div>`;
}

function renderPortfolioSummary(data: StressResult): string {
  const kpis = [
    { label: "Total Loans", value: data.totalLoans.toString(), color: ACCENT },
    { label: "Total Collateral", value: fmt$(data.totalCollateral), color: CYAN },
    { label: "Avg LTV (Current)", value: fmtPct(data.avgLTV), color: data.avgLTV > 100 ? RED : GREEN },
    { label: "Currently Underwater", value: data.underwaterCount.toString(), color: data.underwaterCount > 0 ? ORANGE : GREEN },
  ];
  return `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
    ${kpis.map(k => `
      <div style="background:${SURFACE};border-radius:10px;padding:16px;text-align:center;border-left:4px solid ${k.color};border:1px solid ${BORDER};">
        <div style="font-size:11px;color:${TEXT_SEC};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${k.label}</div>
        <div style="font-size:22px;font-weight:700;color:${k.color};">${k.value}</div>
      </div>
    `).join("")}
  </div>`;
}

function renderStressImpactSummary(data: StressResult): string {
  const newUnderwater = data.stressedUnderwaterCount - data.underwaterCount;
  return `<div style="background:${SURFACE};border-radius:10px;padding:16px;margin-bottom:20px;border:1px solid ${BORDER};">
    <h3 style="color:${TEXT};font-size:14px;margin-bottom:12px;display:flex;align-items:center;gap:6px;">
      <span style="color:${RED};">&#9888;</span> Stress Impact: ${SCENARIO_LABELS[data.scenario]}
    </h3>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
      <div style="background:${BG};border-radius:8px;padding:14px;text-align:center;">
        <div style="font-size:10px;color:${TEXT_MUTED};text-transform:uppercase;margin-bottom:6px;">New Underwater Loans</div>
        <div style="font-size:28px;font-weight:700;color:${RED};">+${Math.max(0, newUnderwater)}</div>
        <div style="font-size:11px;color:${TEXT_SEC};">${data.underwaterCount} &rarr; ${data.stressedUnderwaterCount} total</div>
      </div>
      <div style="background:${BG};border-radius:8px;padding:14px;text-align:center;">
        <div style="font-size:10px;color:${TEXT_MUTED};text-transform:uppercase;margin-bottom:6px;">Total Value at Risk</div>
        <div style="font-size:28px;font-weight:700;color:${ORANGE};">${fmt$(data.totalValueAtRisk)}</div>
        <div style="font-size:11px;color:${TEXT_SEC};">Shortfall on underwater loans</div>
      </div>
      <div style="background:${BG};border-radius:8px;padding:14px;text-align:center;">
        <div style="font-size:10px;color:${TEXT_MUTED};text-transform:uppercase;margin-bottom:6px;">Worst-Hit Segments</div>
        <div style="font-size:20px;font-weight:700;color:${PURPLE};">${data.worstHitSegments.join(", ")}</div>
        <div style="font-size:11px;color:${TEXT_SEC};">Highest LTV increase</div>
      </div>
    </div>
  </div>`;
}

function renderSegmentExposureTable(segments: SegmentExposure[]): string {
  const rows = segments.map(s => {
    const ltvChange = s.stressedAvgLTV - s.currentAvgLTV;
    const changeColor = ltvChange > 10 ? RED : ltvChange > 5 ? ORANGE : YELLOW;
    return `<tr style="border-bottom:1px solid ${BORDER};">
      <td style="padding:10px 12px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.color};margin-right:8px;"></span><span style="color:${TEXT};font-weight:600;">${s.segment}</span></td>
      <td style="padding:10px 12px;text-align:center;color:${TEXT};">${s.count}</td>
      <td style="padding:10px 12px;text-align:right;color:${s.currentAvgLTV > 100 ? ORANGE : TEXT};">${fmtPct(s.currentAvgLTV)}</td>
      <td style="padding:10px 12px;text-align:right;font-weight:700;color:${s.stressedAvgLTV > 100 ? RED : ORANGE};">${fmtPct(s.stressedAvgLTV)}</td>
      <td style="padding:10px 12px;text-align:right;color:${changeColor};">+${fmtPct(ltvChange)}</td>
      <td style="padding:10px 12px;text-align:center;color:${s.underwaterCountStressed > s.underwaterCount ? RED : TEXT};">${s.underwaterCount} &rarr; ${s.underwaterCountStressed}</td>
    </tr>`;
  }).join("");

  return `<div style="background:${SURFACE};border-radius:10px;padding:16px;margin-bottom:20px;border:1px solid ${BORDER};">
    <h3 style="color:${TEXT};font-size:14px;margin-bottom:12px;">Segment Exposure Analysis</h3>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="border-bottom:2px solid ${BORDER};">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Segment</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Loans</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Current Avg LTV</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Stressed Avg LTV</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Change</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Underwater</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

function renderLoanDetailTable(loans: LoanEntry[]): string {
  const sorted = [...loans].sort((a, b) => b.stressedLTV - a.stressedLTV);
  const rows = sorted.map((l, i) => {
    const badge = getLTVBadge(l.stressedLTV);
    return `<tr style="border-bottom:1px solid ${BORDER};${i % 2 === 0 ? `background:${BG}22;` : ""}">
      <td style="padding:8px 10px;font-family:monospace;font-size:11px;color:#93c5fd;">${l.vin.slice(0, 6)}...${l.vin.slice(-4)}</td>
      <td style="padding:8px 10px;color:${TEXT};">${l.year} ${l.make} ${l.model}</td>
      <td style="padding:8px 10px;text-align:right;color:${TEXT};">${fmt$(l.loanAmount)}</td>
      <td style="padding:8px 10px;text-align:right;color:${TEXT_SEC};">${fmt$(l.currentValue)}</td>
      <td style="padding:8px 10px;text-align:right;color:${l.stressedValue < l.currentValue ? RED : TEXT_SEC};">${fmt$(l.stressedValue)}</td>
      <td style="padding:8px 10px;text-align:right;color:${l.currentLTV > 100 ? ORANGE : TEXT_SEC};">${fmtPct(l.currentLTV)}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;color:${l.stressedLTV > 100 ? RED : TEXT_SEC};">${fmtPct(l.stressedLTV)}</td>
      <td style="padding:8px 10px;text-align:center;"><span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:700;color:${badge.color};background:${badge.bg};">${badge.label}</span></td>
    </tr>`;
  }).join("");

  return `<div style="background:${SURFACE};border-radius:10px;padding:16px;margin-bottom:20px;border:1px solid ${BORDER};">
    <h3 style="color:${TEXT};font-size:14px;margin-bottom:12px;">Individual Loan Detail</h3>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="border-bottom:2px solid ${BORDER};">
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">VIN</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Vehicle</th>
          <th style="padding:8px 10px;text-align:right;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Loan Amt</th>
          <th style="padding:8px 10px;text-align:right;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Current Val</th>
          <th style="padding:8px 10px;text-align:right;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Stressed Val</th>
          <th style="padding:8px 10px;text-align:right;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Current LTV</th>
          <th style="padding:8px 10px;text-align:right;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Stressed LTV</th>
          <th style="padding:8px 10px;text-align:center;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

function drawLTVHistogram(canvasId: string, data: StressResult): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  const pad = { top: 45, right: 30, bottom: 55, left: 55 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const buckets = [
    { label: "<80%", min: 0, max: 80 },
    { label: "80-90%", min: 80, max: 90 },
    { label: "90-100%", min: 90, max: 100 },
    { label: "100-110%", min: 100, max: 110 },
    { label: "110-120%", min: 110, max: 120 },
    { label: ">120%", min: 120, max: 999 },
  ];

  const currentCounts = buckets.map(b => data.loans.filter(l => l.currentLTV >= b.min && l.currentLTV < b.max).length);
  const stressedCounts = buckets.map(b => data.loans.filter(l => l.stressedLTV >= b.min && l.stressedLTV < b.max).length);
  const maxCount = Math.max(...currentCounts, ...stressedCounts, 1);

  // Grid
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 0.5;
  ctx.fillStyle = TEXT_MUTED;
  ctx.font = "11px system-ui";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const val = Math.round((maxCount / 4) * i);
    const y = pad.top + plotH - (val / maxCount) * plotH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    ctx.fillText(val.toString(), pad.left - 8, y + 4);
  }

  const groupW = plotW / buckets.length;
  const barW = groupW * 0.35;
  const gap = groupW * 0.05;

  buckets.forEach((b, i) => {
    const x = pad.left + i * groupW;

    const cH = (currentCounts[i] / maxCount) * plotH;
    ctx.fillStyle = ACCENT + "aa";
    ctx.fillRect(x + gap, pad.top + plotH - cH, barW, cH);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + gap, pad.top + plotH - cH, barW, cH);

    const sH = (stressedCounts[i] / maxCount) * plotH;
    ctx.fillStyle = RED + "aa";
    ctx.fillRect(x + barW + gap * 2, pad.top + plotH - sH, barW, sH);
    ctx.strokeStyle = RED;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + barW + gap * 2, pad.top + plotH - sH, barW, sH);

    if (currentCounts[i] > 0) {
      ctx.fillStyle = ACCENT; ctx.font = "bold 11px system-ui"; ctx.textAlign = "center";
      ctx.fillText(currentCounts[i].toString(), x + gap + barW / 2, pad.top + plotH - cH - 4);
    }
    if (stressedCounts[i] > 0) {
      ctx.fillStyle = RED;
      ctx.fillText(stressedCounts[i].toString(), x + barW + gap * 2 + barW / 2, pad.top + plotH - sH - 4);
    }

    ctx.fillStyle = b.min >= 100 ? ORANGE : TEXT_SEC;
    ctx.font = "11px system-ui"; ctx.textAlign = "center";
    ctx.fillText(b.label, x + groupW / 2, pad.top + plotH + 18);
  });

  // Danger zone shading
  const dangerStartIdx = buckets.findIndex(b => b.min >= 100);
  if (dangerStartIdx >= 0) {
    ctx.fillStyle = RED + "08";
    const dangerX = pad.left + dangerStartIdx * groupW;
    ctx.fillRect(dangerX, pad.top, plotW - dangerStartIdx * groupW, plotH);
    ctx.strokeStyle = RED + "40"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(dangerX, pad.top); ctx.lineTo(dangerX, pad.top + plotH); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = RED; ctx.font = "10px system-ui"; ctx.textAlign = "left";
    ctx.fillText("UNDERWATER ZONE", dangerX + 4, pad.top + 14);
  }

  ctx.fillStyle = TEXT_SEC; ctx.font = "11px system-ui"; ctx.textAlign = "center";
  ctx.fillText("Loan-to-Value Ratio", W / 2, H - 6);

  ctx.fillStyle = TEXT; ctx.font = "bold 13px system-ui"; ctx.textAlign = "left";
  ctx.fillText("LTV Distribution: Current vs Stressed", pad.left, pad.top - 20);

  // Legend
  const legX = W - pad.right - 200;
  const legY = pad.top - 20;
  ctx.fillStyle = ACCENT + "aa"; ctx.fillRect(legX, legY - 4, 12, 12);
  ctx.fillStyle = TEXT_SEC; ctx.font = "11px system-ui"; ctx.textAlign = "left";
  ctx.fillText("Current", legX + 16, legY + 6);
  ctx.fillStyle = RED + "aa"; ctx.fillRect(legX + 80, legY - 4, 12, 12);
  ctx.fillStyle = TEXT_SEC; ctx.fillText("Stressed", legX + 96, legY + 6);
}

function renderLTVHistogramContainer(): string {
  return `<div style="background:${SURFACE};border-radius:10px;padding:16px;margin-bottom:20px;border:1px solid ${BORDER};">
    <canvas id="ltv-histogram" style="width:100%;height:350px;border-radius:8px;"></canvas>
  </div>`;
}

function drawSegmentDonut(canvasId: string, data: StressResult): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  const cx = W * 0.35;
  const cy = H / 2;
  const outerR = Math.min(cx - 30, cy - 40);
  const innerR = outerR * 0.55;
  const total = data.loans.reduce((s, l) => s + l.loanAmount, 0);

  // Group by segment
  const segTotals = new Map<string, { amount: number; count: number; color: string }>();
  data.loans.forEach(l => {
    const cur = segTotals.get(l.segment) || { amount: 0, count: 0, color: SEGMENT_COLORS[l.segment] };
    cur.amount += l.loanAmount;
    cur.count++;
    segTotals.set(l.segment, cur);
  });

  let startAngle = -Math.PI / 2;
  const entries = Array.from(segTotals.entries());
  entries.forEach(([seg, d]) => {
    const sliceAngle = (d.amount / total) * Math.PI * 2;
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
    ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
    ctx.closePath();
    ctx.fill();
    startAngle += sliceAngle;
  });

  // Center text
  ctx.fillStyle = TEXT;
  ctx.font = "bold 16px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(fmt$(total), cx, cy - 4);
  ctx.fillStyle = TEXT_MUTED;
  ctx.font = "11px system-ui";
  ctx.fillText("Total Loan Value", cx, cy + 14);

  // Legend
  const legX = W * 0.65;
  entries.forEach(([seg, d], i) => {
    const y = 40 + i * 32;
    ctx.fillStyle = d.color;
    ctx.fillRect(legX, y, 14, 14);
    ctx.fillStyle = TEXT;
    ctx.font = "12px system-ui";
    ctx.textAlign = "left";
    ctx.fillText(`${seg} (${d.count} loans)`, legX + 20, y + 11);
    ctx.fillStyle = TEXT_SEC;
    ctx.font = "11px system-ui";
    ctx.fillText(fmt$(d.amount) + ` (${fmtPct((d.amount / total) * 100)})`, legX + 20, y + 26);
  });

  // Title
  ctx.fillStyle = TEXT;
  ctx.font = "bold 13px system-ui";
  ctx.textAlign = "left";
  ctx.fillText("Portfolio Exposure by Segment", 16, 22);
}

function renderCollateralWaterfall(data: StressResult): string {
  const totalLoan = data.loans.reduce((s, l) => s + l.loanAmount, 0);
  const totalCurrentVal = data.loans.reduce((s, l) => s + l.currentValue, 0);
  const totalStressedVal = data.loans.reduce((s, l) => s + l.stressedValue, 0);
  const currentCoverage = (totalCurrentVal / totalLoan) * 100;
  const stressedCoverage = (totalStressedVal / totalLoan) * 100;
  const collateralLoss = totalCurrentVal - totalStressedVal;

  const items = [
    { label: "Total Loan Balance", value: fmt$(totalLoan), color: TEXT },
    { label: "Current Collateral Value", value: fmt$(totalCurrentVal), color: GREEN, sub: `Coverage: ${fmtPct(currentCoverage)}` },
    { label: "Stress Impact", value: `-${fmt$(collateralLoss)}`, color: RED, sub: `${SCENARIO_LABELS[data.scenario]}` },
    { label: "Stressed Collateral Value", value: fmt$(totalStressedVal), color: stressedCoverage < 100 ? RED : ORANGE, sub: `Coverage: ${fmtPct(stressedCoverage)}` },
    { label: "Coverage Shortfall", value: stressedCoverage < 100 ? fmt$(totalLoan - totalStressedVal) : "None", color: stressedCoverage < 100 ? RED : GREEN },
  ];

  return `<div style="background:${SURFACE};border-radius:10px;padding:16px;margin-bottom:20px;border:1px solid ${BORDER};">
    <h3 style="color:${TEXT};font-size:14px;margin-bottom:12px;">Collateral Coverage Waterfall</h3>
    <div style="display:flex;flex-direction:column;gap:6px;">
      ${items.map((item, i) => {
        const barPct = i === 0 ? 100 : i === 1 ? currentCoverage : i === 2 ? (collateralLoss / totalLoan) * 100 : i === 3 ? stressedCoverage : Math.max(0, 100 - stressedCoverage);
        return `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;">
          <div style="width:200px;font-size:12px;color:${TEXT_SEC};text-align:right;">${item.label}</div>
          <div style="flex:1;position:relative;">
            <div style="height:28px;background:${item.color}22;border-radius:4px;width:${Math.min(100, barPct)}%;min-width:2px;">
              <div style="height:100%;background:${item.color}44;border-radius:4px;border-left:3px solid ${item.color};"></div>
            </div>
          </div>
          <div style="width:120px;text-align:right;">
            <div style="font-size:14px;font-weight:700;color:${item.color};">${item.value}</div>
            ${(item as any).sub ? `<div style="font-size:10px;color:${TEXT_MUTED};">${(item as any).sub}</div>` : ""}
          </div>
        </div>`;
      }).join("")}
    </div>
  </div>`;
}

function renderScenarioComparison(data: StressResult): string {
  const scenarios: { key: Scenario; label: string }[] = [
    { key: "ev_drop_20", label: "EV Drop 20%" },
    { key: "trucks_drop_15", label: "Trucks Drop 15%" },
    { key: "market_wide_10", label: "Market-Wide 10%" },
  ];

  const comparisons = scenarios.map(s => {
    const testLoans = data.loans.map(l => {
      const mult = getStressMultiplier(l.segment, l.fuelType, s.key, 0);
      const sv = Math.round(l.currentValue * mult);
      const sLTV = (l.loanAmount / sv) * 100;
      return { ...l, stressedValue: sv, stressedLTV: sLTV };
    });
    const underwater = testLoans.filter(l => l.stressedLTV > 100).length;
    const valAtRisk = testLoans.filter(l => l.stressedLTV > 100).reduce((sum, l) => sum + Math.max(0, l.loanAmount - l.stressedValue), 0);
    const avgSLTV = testLoans.reduce((sum, l) => sum + l.stressedLTV, 0) / testLoans.length;
    return { label: s.label, underwater, valAtRisk, avgSLTV, isActive: s.key === data.scenario };
  });

  const rows = comparisons.map(c => `
    <tr style="border-bottom:1px solid ${BORDER};${c.isActive ? `background:${ACCENT}11;` : ""}">
      <td style="padding:10px 12px;color:${c.isActive ? ACCENT : TEXT};font-weight:${c.isActive ? "700" : "400"};">
        ${c.label} ${c.isActive ? "(current)" : ""}
      </td>
      <td style="padding:10px 12px;text-align:center;color:${c.underwater > 0 ? RED : GREEN};font-weight:700;">${c.underwater}</td>
      <td style="padding:10px 12px;text-align:right;color:${c.valAtRisk > 0 ? ORANGE : GREEN};">${fmt$(c.valAtRisk)}</td>
      <td style="padding:10px 12px;text-align:right;color:${c.avgSLTV > 100 ? RED : TEXT_SEC};">${fmtPct(c.avgSLTV)}</td>
    </tr>
  `).join("");

  return `<div style="background:${SURFACE};border-radius:10px;padding:16px;margin-bottom:20px;border:1px solid ${BORDER};">
    <h3 style="color:${TEXT};font-size:14px;margin-bottom:12px;">Scenario Comparison Matrix</h3>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="border-bottom:2px solid ${BORDER};">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Scenario</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Underwater Loans</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Value at Risk</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;">Avg Stressed LTV</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

function renderLoading(): string {
  return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;">
    <div style="width:48px;height:48px;border:4px solid ${BORDER};border-top:4px solid ${RED};border-radius:50%;animation:spin 1s linear infinite;"></div>
    <div style="color:${TEXT_SEC};font-size:14px;margin-top:16px;">Running stress test...</div>
    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
  </div>`;
}

// ── Main Application ───────────────────────────────────────────────────
let currentData: StressResult | null = null;
let currentScenario: Scenario = "ev_drop_20";
let currentCustomPct = 15;

function parseVINInput(): Array<{ vin: string; loanAmount: number }> {
  const textarea = document.getElementById("vin-input") as HTMLTextAreaElement;
  if (!textarea) return [];
  return textarea.value.trim().split("\n").filter(Boolean).map(line => {
    const parts = line.trim().split(",");
    return { vin: parts[0]?.trim() || "", loanAmount: parseFloat(parts[1]?.trim() || "0") };
  }).filter(v => v.vin.length >= 10 && v.loanAmount > 0).slice(0, 20);
}

const LUXURY_MAKES = ["BMW", "Mercedes", "Mercedes-Benz", "Audi", "Lexus", "Cadillac", "Lincoln", "Infiniti", "Acura", "Porsche", "Jaguar", "Land Rover", "Bentley", "Maserati", "Genesis"];
function categorizeSegment(bodyType: string | undefined, fuelType: string | undefined, make?: string): Segment {
  if (fuelType?.toLowerCase().includes("electric")) return "EV";
  if (make && LUXURY_MAKES.some(lm => lm.toLowerCase() === make.toLowerCase())) return "Luxury";
  const bt = (bodyType || "").toLowerCase();
  if (bt.includes("suv") || bt.includes("crossover")) return "SUV";
  if (bt.includes("truck") || bt.includes("pickup")) return "Truck";
  if (bt.includes("sedan") || bt.includes("coupe") || bt.includes("hatchback")) return "Sedan";
  return "Other";
}

async function loadData(scenario: Scenario, customPct: number): Promise<StressResult> {
  if (_detectAppMode() === "demo") return generateMockStressResult(scenario, customPct);
  const vins = parseVINInput();
  const urlZip = _getUrlParams().zip;
  const result = await _callTool("stress-test-portfolio", { vins, scenario, customDropPct: customPct, zip: urlZip });

  if (result?.content?.[0]?.text) {
    try {
      const parsed = JSON.parse(result.content[0].text);
      if (parsed.portfolio && Array.isArray(parsed.portfolio)) {
        const loans: LoanEntry[] = parsed.portfolio.map((p: any) => {
          const raw = p.decode || {};
          // neovin /specs response — fields at top level; some API versions nest under "specs"
          const decode = raw.specs ?? raw;
          const make = decode.make ?? decode.Make ?? "";
          const model = decode.model ?? decode.Model ?? "";
          const year = decode.year ?? decode.Year ?? 2022;
          const bodyType = decode.body_type ?? decode.bodyType ?? decode.body ?? "";
          const fuelType = decode.fuel_type ?? decode.fuelType ?? decode.fuel ?? "Gas";
          const predicted = Math.max(1000, p.price?.predicted_price ?? p.price?.marketcheck_price ?? p.price?.price ?? p.loanAmount * 0.9);
          const segment: Segment = categorizeSegment(bodyType, fuelType, make);
          const multiplier = getStressMultiplier(segment, fuelType, scenario, customPct);
          const stressedValue = Math.max(1000, Math.round(predicted * multiplier));
          return {
            vin: p.vin, year, make: make || "Unknown", model: model || "Unknown", segment,
            loanAmount: p.loanAmount, currentValue: Math.round(predicted),
            stressedValue, currentLTV: (p.loanAmount / predicted) * 100,
            stressedLTV: (p.loanAmount / stressedValue) * 100,
            fuelType,
          };
        });
        return buildStressResult(loans, scenario, customPct);
      }
    } catch {}
  }

  return generateMockStressResult(scenario, customPct);
}

function renderResults(data: StressResult): void {
  const container = document.getElementById("results-container");
  if (!container) return;

  container.innerHTML = `
    ${renderPortfolioSummary(data)}
    ${renderStressImpactSummary(data)}
    ${renderLTVHistogramContainer()}
    ${renderCollateralWaterfall(data)}
    <div style="display:flex;gap:16px;">
      <div style="flex:1;">${renderSegmentExposureTable(data.segments)}</div>
      <div style="flex:1;">
        <div style="background:${SURFACE};border-radius:10px;padding:16px;margin-bottom:20px;border:1px solid ${BORDER};">
          <canvas id="segment-donut" style="width:100%;height:300px;border-radius:8px;"></canvas>
        </div>
      </div>
    </div>
    ${renderScenarioComparison(data)}
    ${renderLoanDetailTable(data.loans)}
  `;

  requestAnimationFrame(() => {
    drawLTVHistogram("ltv-histogram", data);
    drawSegmentDonut("segment-donut", data);
  });
}

function bindScenarioCards(): void {
  document.querySelectorAll(".scenario-card").forEach(card => {
    card.addEventListener("click", () => {
      const scenario = card.getAttribute("data-scenario") as Scenario;
      currentScenario = scenario;
      document.querySelectorAll(".scenario-card").forEach(c => {
        const s = c.getAttribute("data-scenario");
        (c as HTMLElement).style.borderColor = s === scenario ? ACCENT : BORDER;
        (c as HTMLElement).style.background = s === scenario ? ACCENT + "15" : BG;
      });
      const radio = card.querySelector("input[type=radio]") as HTMLInputElement;
      if (radio) radio.checked = true;
      const customWrap = document.getElementById("custom-slider-wrap");
      if (customWrap) {
        customWrap.style.opacity = scenario === "custom" ? "1" : "0.4";
        customWrap.style.pointerEvents = scenario === "custom" ? "auto" : "none";
      }
    });
  });
}

function initApp(): void {
  const urlParams = _getUrlParams();
  if (urlParams.scenario && ["ev_drop_20","trucks_drop_15","market_wide_10","custom"].includes(urlParams.scenario)) {
    currentScenario = urlParams.scenario as Scenario;
  }

  document.body.style.cssText = `margin:0;padding:20px;background:${BG};color:${TEXT};font-family:system-ui,-apple-system,sans-serif;min-height:100vh;`;

  document.body.innerHTML = `
    ${renderHeader()}
    ${renderVINInput()}
    ${renderScenarioSelector(currentScenario, currentCustomPct)}
    <div id="results-container">${renderLoading()}</div>
  `;

  const header = document.getElementById("app-header");
  if (header) _addSettingsBar(header);

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
    _db.querySelector("#_banner_save")!.addEventListener("click", () => {
      const k = (_db.querySelector("#_banner_key") as HTMLInputElement).value.trim();
      if (!k) return;
      localStorage.setItem("mc_api_key", k);
      _db.style.background = "linear-gradient(135deg,#05966922,#10b98111)";
      _db.style.borderColor = "#10b98144";
      _db.innerHTML = '<div style="font-size:13px;font-weight:700;color:#10b981;">&#10003; API key saved — reloading with live data...</div>';
      setTimeout(() => location.reload(), 800);
    });
    (_db.querySelector("#_banner_key") as HTMLInputElement).addEventListener("keydown", (e) => { if (e.key === "Enter") (_db.querySelector("#_banner_save") as HTMLButtonElement).click(); });
  }

  bindScenarioCards();

  const customSlider = document.getElementById("inp-custom-pct") as HTMLInputElement;
  const customLabel = document.getElementById("custom-pct-label");
  customSlider?.addEventListener("input", () => {
    currentCustomPct = parseInt(customSlider.value);
    if (customLabel) customLabel.textContent = currentCustomPct + "%";
  });

  const stressBtn = document.getElementById("btn-stress");
  stressBtn?.addEventListener("click", async () => {
    const container = document.getElementById("results-container");
    if (container) container.innerHTML = renderLoading();
    try {
      currentData = await loadData(currentScenario, currentCustomPct);
      renderResults(currentData);
    } catch {
      currentData = generateMockStressResult(currentScenario, currentCustomPct);
      renderResults(currentData);
    }
  });

  (async () => {
    try {
      currentData = await loadData(currentScenario, currentCustomPct);
    } catch {
      currentData = generateMockStressResult(currentScenario, currentCustomPct);
    }
    renderResults(currentData);
  })();
}

window.addEventListener("resize", () => {
  if (currentData) requestAnimationFrame(() => {
    drawLTVHistogram("ltv-histogram", currentData!);
    drawSegmentDonut("segment-donut", currentData!);
  });
});

initApp();
