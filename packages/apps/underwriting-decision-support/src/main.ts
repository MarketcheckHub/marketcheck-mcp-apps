import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "underwriting-decision-support" }); } catch {}

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
  for (const key of ["vin", "zip", "make", "model", "miles", "state", "dealer_id", "ticker", "price", "postal_code", "loan_amount", "loan_term", "interest_rate"]) {
    const v = params.get(key);
    if (v) result[key] = v;
  }
  return result;
}

function _proxyBase(): string {
  return location.protocol.startsWith("http") ? "" : "http://localhost:3001";
}

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

async function _fetchDirect(args): Promise<EvalResult | null> {
  const decode = await _mcDecode(args.vin);
  if (!decode) return null;

  const [retail, wholesale, history, soldCompsRaw] = await Promise.all([
    _mcPredict({ vin: args.vin, miles: args.miles, zip: args.zip, dealer_type: "franchise" }).catch(() => null),
    _mcPredict({ vin: args.vin, miles: args.miles, zip: args.zip, dealer_type: "independent" }).catch(() => null),
    _mcHistory(args.vin).catch(() => null),
    _mcRecent({ make: decode.make, model: decode.model, zip: args.zip, radius: 100, rows: 8, stats: "price" }).catch(() => null),
  ]);

  const retailValue = retail?.predicted_price ?? retail?.marketcheck_price ?? retail?.price ?? 0;
  const wholesaleValue = wholesale?.predicted_price ?? wholesale?.marketcheck_price ?? wholesale?.price ?? 0;
  if (!retailValue) return null;
  const loanAmt = args.loan_amount ?? 0;
  const loanTerm = args.loan_term ?? 60;
  const interestRate = args.interest_rate ?? 6.9;
  const monthlyRate = interestRate / 100 / 12;

  const payment = monthlyRate > 0
    ? (loanAmt * monthlyRate * Math.pow(1 + monthlyRate, loanTerm)) / (Math.pow(1 + monthlyRate, loanTerm) - 1)
    : loanAmt / loanTerm;

  const ltv = retailValue > 0 ? (loanAmt / retailValue) * 100 : 0;

  const annualDepRate = 0.15;
  const monthlyDepRate = annualDepRate / 12;
  const forecast: DepreciationRow[] = [];
  for (const months of [12, 24, 36, 48, 60]) {
    if (months > loanTerm) break;
    const vehicleVal = retailValue * Math.pow(1 - monthlyDepRate, months);
    const powFactor = Math.pow(1 + monthlyRate, months);
    const totalPow = Math.pow(1 + monthlyRate, loanTerm);
    const balance = Math.max(0, loanAmt * (totalPow - powFactor) / (totalPow - 1));
    forecast.push({
      month: months, label: `${months} months`,
      projected_value: Math.round(vehicleVal),
      remaining_balance: Math.round(balance),
      ltv: balance > 0 ? Math.round((balance / vehicleVal) * 100) : 0,
    });
  }

  // Map sold comps from recents API
  const listings = soldCompsRaw?.listings ?? [];
  const soldComps: SoldComp[] = listings.slice(0, 8).map((l: any) => ({
    year: l.build?.year ?? l.year ?? decode.year,
    make: l.build?.make ?? l.make ?? decode.make,
    model: l.build?.model ?? l.model ?? decode.model,
    trim: l.build?.trim ?? l.trim ?? "",
    price: l.price ?? 0,
    miles: l.miles ?? l.mileage ?? 0,
    sold_date: l.last_seen_at_date ?? l.scraped_at ?? "",
    city: l.dealer?.city ?? "",
    state: l.dealer?.state ?? "",
  }));

  // Map VIN price history
  const histListings = history?.listings ?? [];
  const priceHistory: PriceHistoryEntry[] = histListings.slice(0, 6).map((l: any, i: number) => ({
    date: l.first_seen_at_date ?? l.scraped_at ?? "",
    price: l.price ?? 0,
    dealer: l.dealer?.name ?? "Unknown Dealer",
    event: i === 0 ? "Listed" : "Price Change",
  }));

  let risk: "low" | "moderate" | "high" | "very_high" = "low";
  if (ltv > 120) risk = "very_high";
  else if (ltv > 100) risk = "high";
  else if (ltv > 80) risk = "moderate";

  const maxAdvanceRate = 0.85;
  const compCount = retail?.comparables?.length ?? 0;

  return {
    vehicle: {
      vin: decode.vin ?? args.vin,
      year: decode.year ?? 0,
      make: decode.make ?? "",
      model: decode.model ?? "",
      trim: decode.trim ?? "",
      body_type: decode.body_type ?? decode.body ?? "",
      engine: decode.engine ?? "",
      transmission: decode.transmission ?? "",
      drivetrain: decode.drivetrain ?? decode.drive_type ?? "",
      fuel_type: decode.fuel_type ?? "",
    },
    valuation: {
      retail_value: retailValue,
      wholesale_value: wholesaleValue,
      confidence_comps: compCount,
      value_low: retail?.price_range?.low ?? retail?.price_low ?? Math.round(retailValue * 0.92),
      value_high: retail?.price_range?.high ?? retail?.price_high ?? Math.round(retailValue * 1.08),
    },
    ltv_current: Math.round(ltv * 10) / 10,
    monthly_payment: Math.round(payment * 100) / 100,
    depreciation_forecast: forecast,
    sold_comps: soldComps,
    price_history: priceHistory,
    max_advance: maxAdvanceRate * 100,
    max_advance_amount: Math.round(retailValue * maxAdvanceRate),
    risk_rating: risk,
  };
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
      input, select { max-width: 100% !important; width: 100% !important; box-sizing: border-box !important; }
    }
  `;
  document.head.appendChild(s);
})();


// ── Types ──────────────────────────────────────────────────────────────────
interface VehicleSpec {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  body_type: string;
  engine: string;
  transmission: string;
  drivetrain: string;
  fuel_type: string;
}

interface Valuation {
  retail_value: number;
  wholesale_value: number;
  confidence_comps: number;
  value_low: number;
  value_high: number;
}

interface DepreciationRow {
  month: number;
  label: string;
  projected_value: number;
  remaining_balance: number;
  ltv: number;
}

interface SoldComp {
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  miles: number;
  sold_date: string;
  city: string;
  state: string;
}

interface PriceHistoryEntry {
  date: string;
  price: number;
  dealer: string;
  event: string;
}

interface LoanInput {
  vin: string;
  miles: number;
  loan_amount: number;
  loan_term: number;
  interest_rate: number;
  zip: string;
}

interface EvalResult {
  vehicle: VehicleSpec;
  valuation: Valuation;
  ltv_current: number;
  monthly_payment: number;
  depreciation_forecast: DepreciationRow[];
  sold_comps: SoldComp[];
  price_history: PriceHistoryEntry[];
  max_advance: number;
  max_advance_amount: number;
  risk_rating: "low" | "moderate" | "high" | "very_high";
}

// ── Mock Data ──────────────────────────────────────────────────────────────
function getMockResult(input: LoanInput): EvalResult {
  const retailValue = 35200;
  const wholesaleValue = 30800;
  const ltv = (input.loan_amount / retailValue) * 100;
  const monthlyRate = input.interest_rate / 100 / 12;
  const payment = monthlyRate > 0
    ? (input.loan_amount * monthlyRate * Math.pow(1 + monthlyRate, input.loan_term)) / (Math.pow(1 + monthlyRate, input.loan_term) - 1)
    : input.loan_amount / input.loan_term;

  // Annual depreciation rate ~15% per year for trucks
  const annualDepRate = 0.15;
  const monthlyDepRate = annualDepRate / 12;

  const forecast: DepreciationRow[] = [];
  let balance = input.loan_amount;
  let vehicleVal = retailValue;

  for (const months of [12, 24, 36, 48, 60]) {
    if (months > input.loan_term) break;
    vehicleVal = retailValue * Math.pow(1 - monthlyDepRate, months);
    // Remaining balance using amortization formula
    const powFactor = Math.pow(1 + monthlyRate, months);
    const totalPow = Math.pow(1 + monthlyRate, input.loan_term);
    balance = input.loan_amount * (totalPow - powFactor) / (totalPow - 1);
    if (balance < 0) balance = 0;

    forecast.push({
      month: months,
      label: `${months} months`,
      projected_value: Math.round(vehicleVal),
      remaining_balance: Math.round(balance),
      ltv: balance > 0 ? Math.round((balance / vehicleVal) * 100) : 0,
    });
  }

  let risk: "low" | "moderate" | "high" | "very_high" = "low";
  if (ltv > 120) risk = "very_high";
  else if (ltv > 100) risk = "high";
  else if (ltv > 80) risk = "moderate";

  const maxAdvanceRate = 0.85;
  const maxAdvanceAmt = Math.round(retailValue * maxAdvanceRate);

  return {
    vehicle: {
      vin: input.vin || "1FTFW1E87NFA12345",
      year: 2022,
      make: "Ford",
      model: "F-150",
      trim: "XLT SuperCrew",
      body_type: "Truck",
      engine: "3.5L EcoBoost V6",
      transmission: "10-Speed Automatic",
      drivetrain: "4WD",
      fuel_type: "Gas",
    },
    valuation: {
      retail_value: retailValue,
      wholesale_value: wholesaleValue,
      confidence_comps: 6,
      value_low: 32500,
      value_high: 37800,
    },
    ltv_current: Math.round(ltv * 10) / 10,
    monthly_payment: Math.round(payment * 100) / 100,
    depreciation_forecast: forecast,
    sold_comps: [
      { year: 2022, make: "Ford", model: "F-150", trim: "XLT", price: 34800, miles: 26000, sold_date: "2024-01-12", city: "Dallas", state: "TX" },
      { year: 2022, make: "Ford", model: "F-150", trim: "XLT SuperCrew", price: 35600, miles: 30500, sold_date: "2024-01-08", city: "Houston", state: "TX" },
      { year: 2022, make: "Ford", model: "F-150", trim: "XLT", price: 33200, miles: 32100, sold_date: "2024-01-05", city: "Phoenix", state: "AZ" },
      { year: 2022, make: "Ford", model: "F-150", trim: "Lariat", price: 38900, miles: 22000, sold_date: "2023-12-28", city: "Denver", state: "CO" },
      { year: 2022, make: "Ford", model: "F-150", trim: "XLT", price: 34100, miles: 29800, sold_date: "2023-12-20", city: "Atlanta", state: "GA" },
      { year: 2022, make: "Ford", model: "F-150", trim: "STX", price: 31500, miles: 35200, sold_date: "2023-12-15", city: "Chicago", state: "IL" },
    ],
    price_history: [
      { date: "2023-06-15", price: 38500, dealer: "AutoNation Ford", event: "Listed" },
      { date: "2023-09-02", price: 36200, dealer: "AutoNation Ford", event: "Price Drop" },
    ],
    max_advance: maxAdvanceRate * 100,
    max_advance_amount: maxAdvanceAmt,
    risk_rating: risk,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtUSD(v: number | undefined): string {
  if (v == null || isNaN(v)) return "N/A";
  return "$" + Math.round(v).toLocaleString();
}

function fmtPct(v: number): string {
  return v.toFixed(1) + "%";
}

function el(tag: string, props?: Record<string, string>): HTMLElement {
  const e = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (k === "style") e.style.cssText = v;
      else if (k === "textContent") e.textContent = v;
      else e.setAttribute(k, v);
    }
  }
  return e;
}

function makeButton(text: string, onClick: () => void, variant: "primary" | "secondary" | "danger" = "primary"): HTMLElement {
  const btn = document.createElement("button");
  btn.textContent = text;
  const styles: Record<string, string> = {
    primary: "border:1px solid #3b82f6;background:#3b82f6;color:#fff;",
    secondary: "border:1px solid #475569;background:transparent;color:#e2e8f0;",
    danger: "border:1px solid #ef4444;background:#ef444422;color:#fca5a5;",
  };
  btn.style.cssText = `padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;${styles[variant]}transition:opacity 0.15s;`;
  btn.addEventListener("click", onClick);
  btn.addEventListener("mouseenter", () => { btn.style.opacity = "0.85"; });
  btn.addEventListener("mouseleave", () => { btn.style.opacity = "1"; });
  return btn;
}

function ltvColor(ltv: number): string {
  if (ltv < 80) return "#10b981";
  if (ltv < 100) return "#f59e0b";
  if (ltv < 120) return "#f97316";
  return "#ef4444";
}

function riskBadge(risk: string): string {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    low: { bg: "#05966922", fg: "#34d399", label: "LOW RISK" },
    moderate: { bg: "#d9770622", fg: "#fbbf24", label: "MODERATE RISK" },
    high: { bg: "#ea580c22", fg: "#fb923c", label: "HIGH RISK" },
    very_high: { bg: "#dc262622", fg: "#f87171", label: "VERY HIGH RISK" },
  };
  const m = map[risk] || map["moderate"];
  return `<span style="padding:4px 12px;border-radius:10px;font-size:11px;font-weight:700;letter-spacing:0.5px;background:${m.bg};color:${m.fg};border:1px solid ${m.fg}33;">${m.label}</span>`;
}

// ── State ──────────────────────────────────────────────────────────────────
let loanInput: LoanInput = {
  vin: "",
  miles: 28000,
  loan_amount: 32000,
  loan_term: 60,
  interest_rate: 6.9,
  zip: "75201",
};
let evalResult: EvalResult | null = null;
let loading = false;

// ── Data Loading ───────────────────────────────────────────────────────────
async function evaluateLoan() {
  if (!loanInput.vin) {
    loanInput.vin = "1FTFW1E87NFA12345";
  }
  loading = true;
  render();

  const mode = _detectAppMode();

  if (mode === "live") {
    try {
      const data = await _fetchDirect(loanInput);
      if (data) {
        evalResult = data;
        loading = false;
        render();
        return;
      }
    } catch (err) {
      console.error("Direct fetch failed:", err);
    }
  } else if (mode === "mcp" && _safeApp) {
    try {
      const result = await _callTool("evaluate-loan-application", {
        vin: loanInput.vin,
        miles: loanInput.miles,
        loan_amount: loanInput.loan_amount,
        loan_term: loanInput.loan_term,
        interest_rate: loanInput.interest_rate,
        zip: loanInput.zip,
      });
      if (result) {
        const data = JSON.parse(result.content[0].text);
        if (data.vehicle && data.valuation) {
          evalResult = data;
          loading = false;
          render();
          return;
        }
      }
    } catch {}
  }

  // Demo / fallback to mock
  evalResult = getMockResult(loanInput);
  loading = false;
  render();
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  document.body.innerHTML = "";
  document.body.style.cssText = "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;overflow-x:hidden;min-height:100vh;";

  const style = document.createElement("style");
  style.textContent = `
    @keyframes spin { to { transform: rotate(360deg) } }
    input:focus, select:focus { border-color: #3b82f6 !important; outline: none; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #1e293b; }
    ::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
  `;
  document.body.appendChild(style);

  // Header
  const header = el("div", { style: "background:#1e293b;padding:12px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:12px;" });
  const titleArea = el("div", { style: "display:flex;align-items:center;gap:10px;" });
  titleArea.innerHTML = `<span style="font-size:22px;">&#128179;</span><h1 style="margin:0;font-size:18px;font-weight:700;color:#f8fafc;">Underwriting Decision Support</h1>`;
  header.appendChild(titleArea);
  _addSettingsBar(header);
  document.body.appendChild(header);

  const container = el("div", { style: "max-width:1400px;margin:0 auto;padding:20px;" });

  renderLoanForm(container);

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
      const k = (_db.querySelector("#_banner_key") as HTMLInputElement).value.trim();
      if (!k) return;
      localStorage.setItem("mc_api_key", k);
      _db.style.background = "linear-gradient(135deg,#05966922,#10b98111)";
      _db.style.borderColor = "#10b98144";
      _db.innerHTML = '<div style="font-size:13px;font-weight:700;color:#10b981;">&#10003; API key saved — reloading with live data...</div>';
      setTimeout(() => location.reload(), 800);
    });
    _db.querySelector("#_banner_key").addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") (_db.querySelector("#_banner_save") as HTMLButtonElement).click(); });
  }

  if (loading) {
    const spin = el("div", { style: "text-align:center;padding:60px 0;" });
    spin.innerHTML = `<div style="display:inline-block;width:40px;height:40px;border:3px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;"></div><div style="margin-top:12px;color:#94a3b8;font-size:14px;">Evaluating loan application...</div>`;
    container.appendChild(spin);
    document.body.appendChild(container);
    return;
  }

  if (evalResult) {
    renderLTVGauge(container);

    // Two-column: Collateral + LTV KPIs
    const topRow = el("div", { style: "display:flex;flex-wrap:wrap;gap:20px;margin-bottom:24px;" });
    renderCollateralCard(topRow);
    renderLTVRibbon(topRow);
    container.appendChild(topRow);

    renderDepreciationTable(container);
    renderLTVChart(container);
    renderAdvanceRecommendation(container);
    renderSoldComps(container);
    renderPriceHistory(container);
  } else {
    const welcome = el("div", { style: "text-align:center;padding:60px 20px;color:#94a3b8;" });
    welcome.innerHTML = `<div style="font-size:48px;margin-bottom:16px;">&#128202;</div><h2 style="color:#f8fafc;font-size:20px;margin-bottom:8px;">Auto Loan Underwriting Analysis</h2><p style="font-size:14px;">Enter loan details above and click Evaluate to assess collateral risk, LTV trajectory, and advance rate.</p>`;
    container.appendChild(welcome);
  }

  document.body.appendChild(container);
}

// ── Loan Application Form ──────────────────────────────────────────────────
function renderLoanForm(container: HTMLElement) {
  const panel = el("div", { style: "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:20px;" });
  const h2 = el("h2", { style: "margin:0 0 16px 0;font-size:15px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;" });
  h2.textContent = "Loan Application";
  panel.appendChild(h2);

  const grid = el("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;" });

  grid.appendChild(makeFormGroup("VIN", "text", loanInput.vin, "e.g. 1FTFW1E87NFA12345", (v) => { loanInput.vin = v; }));
  grid.appendChild(makeFormGroup("Current Mileage", "number", String(loanInput.miles), "28000", (v) => { loanInput.miles = parseInt(v) || 0; }));
  grid.appendChild(makeFormGroup("Loan Amount ($)", "number", String(loanInput.loan_amount), "32000", (v) => { loanInput.loan_amount = parseInt(v) || 0; }));

  const termGroup = el("div", { style: "display:flex;flex-direction:column;gap:4px;" });
  const termLbl = el("label", { style: "font-size:11px;color:#94a3b8;font-weight:500;" });
  termLbl.textContent = "Loan Term";
  termGroup.appendChild(termLbl);
  const termSel = document.createElement("select");
  termSel.style.cssText = "padding:8px 10px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;";
  for (const t of [24, 36, 48, 60, 72]) {
    const opt = document.createElement("option");
    opt.value = String(t); opt.textContent = `${t} months`;
    if (t === loanInput.loan_term) opt.selected = true;
    termSel.appendChild(opt);
  }
  termSel.addEventListener("change", () => { loanInput.loan_term = parseInt(termSel.value); });
  termGroup.appendChild(termSel);
  grid.appendChild(termGroup);

  grid.appendChild(makeFormGroup("Interest Rate (%)", "number", String(loanInput.interest_rate), "6.9", (v) => { loanInput.interest_rate = parseFloat(v) || 0; }));
  grid.appendChild(makeFormGroup("ZIP Code", "text", loanInput.zip, "75201", (v) => { loanInput.zip = v; }));

  panel.appendChild(grid);

  const btnRow = el("div", { style: "display:flex;gap:10px;margin-top:16px;" });
  const evalBtn = makeButton("Evaluate Application", () => { evaluateLoan(); }, "primary");
  evalBtn.style.cssText += "padding:10px 32px;font-size:14px;";
  btnRow.appendChild(evalBtn);

  const resetBtn = makeButton("Reset", () => {
    loanInput = { vin: "", miles: 28000, loan_amount: 32000, loan_term: 60, interest_rate: 6.9, zip: "75201" };
    evalResult = null;
    render();
  }, "secondary");
  btnRow.appendChild(resetBtn);

  panel.appendChild(btnRow);
  container.appendChild(panel);
}

function makeFormGroup(label: string, type: string, value: string, placeholder: string, onChange: (v: string) => void): HTMLElement {
  const g = el("div", { style: "display:flex;flex-direction:column;gap:4px;" });
  const lbl = el("label", { style: "font-size:11px;color:#94a3b8;font-weight:500;" });
  lbl.textContent = label;
  g.appendChild(lbl);
  const inp = document.createElement("input");
  inp.type = type;
  inp.value = value;
  inp.placeholder = placeholder;
  if (type === "number") inp.step = "any";
  inp.style.cssText = "padding:8px 10px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;";
  inp.addEventListener("input", () => onChange(inp.value));
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") evaluateLoan(); });
  g.appendChild(inp);
  return g;
}

// ── LTV Gauge ──────────────────────────────────────────────────────────────
function renderLTVGauge(container: HTMLElement) {
  if (!evalResult) return;

  const section = el("div", { style: "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:24px;text-align:center;" });

  const hdr = el("div", { style: "display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:16px;" });
  const h2 = el("h2", { style: "margin:0;font-size:16px;font-weight:600;color:#f8fafc;" });
  h2.textContent = "Loan-to-Value Ratio";
  hdr.appendChild(h2);
  hdr.innerHTML += riskBadge(evalResult.risk_rating);
  section.appendChild(hdr);

  // Vehicle info subtitle
  const veh = evalResult.vehicle;
  const subline = el("div", { style: "font-size:13px;color:#94a3b8;margin-bottom:16px;" });
  subline.textContent = `${veh.year} ${veh.make} ${veh.model} ${veh.trim} | ${loanInput.miles.toLocaleString()} mi | VIN: ${veh.vin}`;
  section.appendChild(subline);

  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 230;
  canvas.style.cssText = "max-width:400px;width:100%;height:auto;";
  section.appendChild(canvas);

  container.appendChild(section);
  setTimeout(() => drawGauge(canvas, evalResult!.ltv_current), 0);
}

function drawGauge(canvas: HTMLCanvasElement, ltv: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H - 30;
  const radius = 150;

  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, W, H);

  // Background arc
  ctx.lineWidth = 28;
  ctx.lineCap = "round";

  // Draw colored segments
  const segments = [
    { start: 0, end: 0.4, color: "#10b981" },     // 0-80% = green
    { start: 0.4, end: 0.5, color: "#f59e0b" },    // 80-100% = yellow
    { start: 0.5, end: 0.6, color: "#f97316" },     // 100-120% = orange
    { start: 0.6, end: 1.0, color: "#ef4444" },     // 120%+ = red
  ];

  for (const seg of segments) {
    const startAngle = Math.PI + seg.start * Math.PI;
    const endAngle = Math.PI + seg.end * Math.PI;
    ctx.strokeStyle = seg.color + "44";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.stroke();
  }

  // Value arc
  const clampedLtv = Math.min(Math.max(ltv, 0), 200);
  const ratio = clampedLtv / 200;
  const valueAngle = Math.PI + ratio * Math.PI;
  const valueColor = ltvColor(ltv);

  ctx.strokeStyle = valueColor;
  ctx.lineWidth = 28;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, Math.PI, valueAngle);
  ctx.stroke();

  // Needle
  const needleAngle = valueAngle;
  const needleLen = radius - 20;
  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(needleAngle) * needleLen, cy + Math.sin(needleAngle) * needleLen);
  ctx.stroke();

  // Center dot
  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();

  // Value text
  ctx.fillStyle = valueColor;
  ctx.font = "bold 36px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(fmtPct(ltv), cx, cy - 50);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px sans-serif";
  ctx.fillText("Current LTV", cx, cy - 25);

  // Scale labels
  ctx.fillStyle = "#64748b";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("0%", cx - radius - 5, cy + 18);
  ctx.fillText("80%", cx - radius * 0.31, cy - radius * 0.81);
  ctx.fillText("100%", cx, cy - radius - 8);
  ctx.fillText("120%", cx + radius * 0.31, cy - radius * 0.81);
  ctx.fillText("200%", cx + radius + 5, cy + 18);
}

// ── Collateral Quality Card ────────────────────────────────────────────────
function renderCollateralCard(row: HTMLElement) {
  if (!evalResult) return;
  const val = evalResult.valuation;

  const card = el("div", { style: "flex:1;background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;" });
  const h2 = el("h2", { style: "margin:0 0 16px 0;font-size:16px;font-weight:600;color:#f8fafc;" });
  h2.textContent = "Collateral Quality";
  card.appendChild(h2);

  const rows = [
    { label: "Predicted Retail Value", value: fmtUSD(val.retail_value), color: "#10b981", highlight: true },
    { label: "Predicted Wholesale Value", value: fmtUSD(val.wholesale_value), color: "#f59e0b", highlight: false },
    { label: "Value Range", value: `${fmtUSD(val.value_low)} - ${fmtUSD(val.value_high)}`, color: "#94a3b8", highlight: false },
    { label: "Confidence (Comp Count)", value: `${val.confidence_comps} comps`, color: val.confidence_comps >= 5 ? "#10b981" : "#f59e0b", highlight: false },
  ];

  for (const r of rows) {
    const rowEl = el("div", { style: `display:flex;justify-content:space-between;align-items:center;padding:10px 0;${r.highlight ? "" : "border-top:1px solid #33415544;"}` });
    rowEl.innerHTML = `<span style="font-size:13px;color:#94a3b8;">${r.label}</span><span style="font-size:${r.highlight ? "20px" : "14px"};font-weight:${r.highlight ? "700" : "600"};color:${r.color};">${r.value}</span>`;
    card.appendChild(rowEl);
  }

  // Vehicle details
  const veh = evalResult.vehicle;
  const details = el("div", { style: "margin-top:16px;padding-top:12px;border-top:1px solid #334155;" });
  details.innerHTML = `
    <div style="font-size:12px;color:#64748b;margin-bottom:8px;">Vehicle Details</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px;">
      <div style="color:#94a3b8;">Body: <span style="color:#e2e8f0;">${veh.body_type}</span></div>
      <div style="color:#94a3b8;">Engine: <span style="color:#e2e8f0;">${veh.engine}</span></div>
      <div style="color:#94a3b8;">Trans: <span style="color:#e2e8f0;">${veh.transmission}</span></div>
      <div style="color:#94a3b8;">Drive: <span style="color:#e2e8f0;">${veh.drivetrain}</span></div>
    </div>
  `;
  card.appendChild(details);

  row.appendChild(card);
}

// ── LTV Ribbon KPIs ────────────────────────────────────────────────────────
function renderLTVRibbon(row: HTMLElement) {
  if (!evalResult) return;

  const panel = el("div", { style: "flex:1;display:flex;flex-direction:column;gap:12px;" });

  const kpis = [
    { label: "Current LTV", value: fmtPct(evalResult.ltv_current), color: ltvColor(evalResult.ltv_current), icon: "&#128200;" },
    { label: "Loan Amount", value: fmtUSD(loanInput.loan_amount), color: "#3b82f6", icon: "&#128176;" },
    { label: "Collateral Value", value: fmtUSD(evalResult.valuation.retail_value), color: "#10b981", icon: "&#128663;" },
    { label: "Monthly Payment", value: fmtUSD(evalResult.monthly_payment), color: "#f59e0b", icon: "&#128197;" },
  ];

  for (const kpi of kpis) {
    const card = el("div", { style: `background:#1e293b;border:1px solid #334155;border-radius:10px;padding:14px 16px;display:flex;align-items:center;gap:12px;border-left:3px solid ${kpi.color};` });
    card.innerHTML = `
      <span style="font-size:24px;">${kpi.icon}</span>
      <div>
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">${kpi.label}</div>
        <div style="font-size:20px;font-weight:700;color:${kpi.color};">${kpi.value}</div>
      </div>
    `;
    panel.appendChild(card);
  }

  row.appendChild(panel);
}

// ── Depreciation Forecast Table ────────────────────────────────────────────
function renderDepreciationTable(container: HTMLElement) {
  if (!evalResult || evalResult.depreciation_forecast.length === 0) return;

  const section = el("div", { style: "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:24px;" });
  const h2 = el("h2", { style: "margin:0 0 16px 0;font-size:16px;font-weight:600;color:#f8fafc;" });
  h2.textContent = "Depreciation Forecast & LTV Trajectory";
  section.appendChild(h2);

  const tableWrap = el("div", { style: "overflow-x:auto;" });
  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;font-size:13px;";

  const thead = document.createElement("thead");
  thead.innerHTML = `<tr style="border-bottom:2px solid #334155;">
    <th style="text-align:left;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Period</th>
    <th style="text-align:right;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Projected Value</th>
    <th style="text-align:right;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Remaining Balance</th>
    <th style="text-align:right;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">LTV</th>
    <th style="text-align:center;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Status</th>
  </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  // Current row
  const currentTr = document.createElement("tr");
  currentTr.style.cssText = "border-bottom:1px solid #334155;background:#0f172a;";
  currentTr.innerHTML = `
    <td style="padding:10px 12px;color:#f8fafc;font-weight:600;">Today</td>
    <td style="padding:10px 12px;text-align:right;color:#10b981;font-weight:600;">${fmtUSD(evalResult.valuation.retail_value)}</td>
    <td style="padding:10px 12px;text-align:right;color:#e2e8f0;">${fmtUSD(loanInput.loan_amount)}</td>
    <td style="padding:10px 12px;text-align:right;font-weight:700;color:${ltvColor(evalResult.ltv_current)};">${fmtPct(evalResult.ltv_current)}</td>
    <td style="padding:10px 12px;text-align:center;">${evalResult.ltv_current > 100 ? '<span style="color:#ef4444;">Underwater</span>' : '<span style="color:#10b981;">Positive Equity</span>'}</td>
  `;
  tbody.appendChild(currentTr);

  for (const row of evalResult.depreciation_forecast) {
    const tr = document.createElement("tr");
    tr.style.cssText = "border-bottom:1px solid #334155;";
    const isUnderwater = row.ltv > 100;
    tr.innerHTML = `
      <td style="padding:10px 12px;color:#e2e8f0;">${row.label}</td>
      <td style="padding:10px 12px;text-align:right;color:#10b981;">${fmtUSD(row.projected_value)}</td>
      <td style="padding:10px 12px;text-align:right;color:#e2e8f0;">${fmtUSD(row.remaining_balance)}</td>
      <td style="padding:10px 12px;text-align:right;font-weight:700;color:${ltvColor(row.ltv)};">${fmtPct(row.ltv)}</td>
      <td style="padding:10px 12px;text-align:center;">${isUnderwater ? '<span style="color:#ef4444;">Underwater</span>' : '<span style="color:#10b981;">Positive Equity</span>'}</td>
    `;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  section.appendChild(tableWrap);
  container.appendChild(section);
}

// ── LTV Line Chart ─────────────────────────────────────────────────────────
function renderLTVChart(container: HTMLElement) {
  if (!evalResult || evalResult.depreciation_forecast.length === 0) return;

  const section = el("div", { style: "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:24px;" });
  const h2 = el("h2", { style: "margin:0 0 16px 0;font-size:16px;font-weight:600;color:#f8fafc;" });
  h2.textContent = "Projected LTV Over Loan Life";
  section.appendChild(h2);

  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 360;
  canvas.style.cssText = "width:100%;max-width:800px;height:auto;";
  section.appendChild(canvas);
  container.appendChild(section);

  setTimeout(() => drawLTVChart(canvas), 0);
}

function drawLTVChart(canvas: HTMLCanvasElement) {
  if (!evalResult) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = canvas.width, H = canvas.height;
  const pad = { top: 30, right: 30, bottom: 50, left: 60 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, W, H);

  // Data points: start with current LTV, then forecasted
  const points: { month: number; ltv: number }[] = [
    { month: 0, ltv: evalResult.ltv_current },
    ...evalResult.depreciation_forecast.map(d => ({ month: d.month, ltv: d.ltv })),
  ];

  const maxMonth = Math.max(...points.map(p => p.month));
  const maxLTV = Math.max(150, Math.max(...points.map(p => p.ltv)) * 1.15);
  const minLTV = 0;

  function xPos(m: number): number { return pad.left + (m / maxMonth) * plotW; }
  function yPos(l: number): number { return pad.top + plotH - ((l - minLTV) / (maxLTV - minLTV)) * plotH; }

  // Grid
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = pad.top + (plotH / 5) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    const val = maxLTV - ((maxLTV - minLTV) / 5) * i;
    ctx.fillStyle = "#64748b"; ctx.font = "11px sans-serif"; ctx.textAlign = "right";
    ctx.fillText(Math.round(val) + "%", pad.left - 8, y + 4);
  }

  // X axis labels
  for (const p of points) {
    const x = xPos(p.month);
    ctx.fillStyle = "#64748b"; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(p.month === 0 ? "Now" : p.month + "mo", x, H - pad.bottom + 20);
  }

  // 100% danger line
  const y100 = yPos(100);
  ctx.setLineDash([8, 4]);
  ctx.strokeStyle = "#ef444488";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad.left, y100);
  ctx.lineTo(W - pad.right, y100);
  ctx.stroke();
  ctx.fillStyle = "#ef4444";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("100% LTV (Underwater Threshold)", pad.left + 4, y100 - 8);
  ctx.setLineDash([]);

  // Fill area under the line
  ctx.beginPath();
  ctx.moveTo(xPos(points[0].month), yPos(points[0].ltv));
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(xPos(points[i].month), yPos(points[i].ltv));
  }
  ctx.lineTo(xPos(points[points.length - 1].month), pad.top + plotH);
  ctx.lineTo(xPos(points[0].month), pad.top + plotH);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
  gradient.addColorStop(0, "#3b82f633");
  gradient.addColorStop(1, "#3b82f608");
  ctx.fillStyle = gradient;
  ctx.fill();

  // Line
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(xPos(points[0].month), yPos(points[0].ltv));
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(xPos(points[i].month), yPos(points[i].ltv));
  }
  ctx.stroke();

  // Dots
  for (const p of points) {
    const cx = xPos(p.month);
    const cy = yPos(p.ltv);
    const color = ltvColor(p.ltv);
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(Math.round(p.ltv) + "%", cx, cy - 14);
  }

  // Axis labels
  ctx.fillStyle = "#94a3b8"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("Months from Origination", W / 2, H - 6);
  ctx.save();
  ctx.translate(14, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("LTV Ratio (%)", 0, 0);
  ctx.restore();
}

// ── Advance Rate Recommendation ────────────────────────────────────────────
function renderAdvanceRecommendation(container: HTMLElement) {
  if (!evalResult) return;

  const section = el("div", { style: `background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:24px;border-left:4px solid ${ltvColor(evalResult.ltv_current)};` });

  const willGoUnderwater = evalResult.depreciation_forecast.some(d => d.ltv > 100);
  const underwaterMonth = evalResult.depreciation_forecast.find(d => d.ltv > 100);

  section.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
      <span style="font-size:28px;">&#128161;</span>
      <h2 style="margin:0;font-size:16px;font-weight:600;color:#f8fafc;">Advance Rate Recommendation</h2>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:16px;">
      <div style="background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px;">
        <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Max Advance Rate</div>
        <div style="font-size:22px;font-weight:700;color:#3b82f6;">${evalResult.max_advance}%</div>
      </div>
      <div style="background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px;">
        <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Max Loan Amount</div>
        <div style="font-size:22px;font-weight:700;color:#10b981;">${fmtUSD(evalResult.max_advance_amount)}</div>
      </div>
      <div style="background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px;">
        <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Requested vs Max</div>
        <div style="font-size:22px;font-weight:700;color:${loanInput.loan_amount <= evalResult.max_advance_amount ? "#10b981" : "#ef4444"};">
          ${loanInput.loan_amount <= evalResult.max_advance_amount ? "Within Limit" : "Exceeds Limit"}
        </div>
      </div>
    </div>
    <div style="font-size:13px;color:#94a3b8;line-height:1.6;">
      Based on the depreciation trajectory for this ${evalResult.vehicle.year} ${evalResult.vehicle.make} ${evalResult.vehicle.model},
      the recommended maximum advance is <strong style="color:#f8fafc;">${evalResult.max_advance}% (${fmtUSD(evalResult.max_advance_amount)})</strong>
      of the retail collateral value.
      ${loanInput.loan_amount > evalResult.max_advance_amount
        ? `<br/><span style="color:#ef4444;">The requested loan amount of ${fmtUSD(loanInput.loan_amount)} exceeds the recommended maximum by ${fmtUSD(loanInput.loan_amount - evalResult.max_advance_amount)}.</span>`
        : `<br/><span style="color:#10b981;">The requested loan amount is within acceptable parameters.</span>`}
      ${willGoUnderwater && underwaterMonth
        ? `<br/><span style="color:#f59e0b;">Warning: Loan is projected to go underwater at ${underwaterMonth.label} with an LTV of ${fmtPct(underwaterMonth.ltv)}.</span>`
        : ""}
    </div>
  `;

  container.appendChild(section);
}

// ── Sold Comps Evidence ────────────────────────────────────────────────────
function renderSoldComps(container: HTMLElement) {
  if (!evalResult || evalResult.sold_comps.length === 0) return;

  const section = el("div", { style: "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:24px;" });
  const h2 = el("h2", { style: "margin:0 0 16px 0;font-size:16px;font-weight:600;color:#f8fafc;" });
  h2.textContent = `Sold Comparables (${evalResult.sold_comps.length} comps)`;
  section.appendChild(h2);

  const tableWrap = el("div", { style: "overflow-x:auto;" });
  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;font-size:13px;";

  const thead = document.createElement("thead");
  thead.innerHTML = `<tr style="border-bottom:2px solid #334155;">
    <th style="text-align:left;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Vehicle</th>
    <th style="text-align:right;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Sale Price</th>
    <th style="text-align:right;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Miles</th>
    <th style="text-align:left;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Location</th>
    <th style="text-align:left;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Sold Date</th>
    <th style="text-align:right;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">vs Retail FMV</th>
  </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const comp of evalResult.sold_comps) {
    const diff = comp.price - evalResult.valuation.retail_value;
    const diffPct = ((diff / evalResult.valuation.retail_value) * 100).toFixed(1);
    const diffColor = diff >= 0 ? "#10b981" : "#ef4444";
    const arrow = diff >= 0 ? "+" : "";

    const tr = document.createElement("tr");
    tr.style.cssText = "border-bottom:1px solid #334155;";
    tr.innerHTML = `
      <td style="padding:10px 12px;color:#e2e8f0;">${comp.year} ${comp.make} ${comp.model} ${comp.trim}</td>
      <td style="padding:10px 12px;text-align:right;color:#10b981;font-weight:600;">${fmtUSD(comp.price)}</td>
      <td style="padding:10px 12px;text-align:right;color:#e2e8f0;">${comp.miles.toLocaleString()} mi</td>
      <td style="padding:10px 12px;color:#94a3b8;">${comp.city}, ${comp.state}</td>
      <td style="padding:10px 12px;color:#94a3b8;">${comp.sold_date}</td>
      <td style="padding:10px 12px;text-align:right;color:${diffColor};font-weight:600;">${arrow}${diffPct}%</td>
    `;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  section.appendChild(tableWrap);
  container.appendChild(section);
}

// ── Price History ──────────────────────────────────────────────────────────
function renderPriceHistory(container: HTMLElement) {
  if (!evalResult || evalResult.price_history.length === 0) return;

  const section = el("div", { style: "background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:24px;" });
  const h2 = el("h2", { style: "margin:0 0 16px 0;font-size:16px;font-weight:600;color:#f8fafc;" });
  h2.textContent = "VIN Price History";
  section.appendChild(h2);

  const timeline = el("div", { style: "position:relative;padding-left:24px;" });

  for (let i = 0; i < evalResult.price_history.length; i++) {
    const entry = evalResult.price_history[i];
    const isLast = i === evalResult.price_history.length - 1;
    const priceDrop = i > 0 ? entry.price - evalResult.price_history[i - 1].price : 0;

    const item = el("div", { style: `position:relative;padding-bottom:${isLast ? "0" : "20px"};` });

    // Dot and line
    item.innerHTML = `
      <div style="position:absolute;left:-24px;top:0;width:12px;height:12px;border-radius:50%;background:${entry.event === "Price Drop" ? "#f59e0b" : "#3b82f6"};border:2px solid #1e293b;"></div>
      ${!isLast ? '<div style="position:absolute;left:-19px;top:12px;width:2px;height:calc(100% - 12px);background:#334155;"></div>' : ''}
      <div style="font-size:12px;color:#64748b;margin-bottom:4px;">${entry.date}</div>
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:16px;font-weight:700;color:#f8fafc;">${fmtUSD(entry.price)}</span>
        <span style="font-size:12px;padding:2px 8px;border-radius:8px;background:${entry.event === "Price Drop" ? "#92400e44" : "#1e40af44"};color:${entry.event === "Price Drop" ? "#fbbf24" : "#60a5fa"};font-weight:600;">${entry.event}</span>
        ${priceDrop !== 0 ? `<span style="font-size:12px;color:${priceDrop < 0 ? "#10b981" : "#ef4444"};">${priceDrop < 0 ? "" : "+"}${fmtUSD(priceDrop)}</span>` : ""}
      </div>
      <div style="font-size:12px;color:#94a3b8;margin-top:2px;">${entry.dealer}</div>
    `;

    timeline.appendChild(item);
  }

  section.appendChild(timeline);
  container.appendChild(section);
}

// ── Init ───────────────────────────────────────────────────────────────────
const urlParams = _getUrlParams();
if (urlParams.vin) loanInput.vin = urlParams.vin;
if (urlParams.miles) loanInput.miles = parseInt(urlParams.miles);
if (urlParams.zip) loanInput.zip = urlParams.zip;
if (urlParams.price) loanInput.loan_amount = parseInt(urlParams.price);
if (urlParams.loan_amount) loanInput.loan_amount = parseInt(urlParams.loan_amount);
if (urlParams.loan_term) loanInput.loan_term = parseInt(urlParams.loan_term);
if (urlParams.interest_rate) loanInput.interest_rate = parseFloat(urlParams.interest_rate);

if (loanInput.vin) {
  evaluateLoan();
} else {
  render();
}
