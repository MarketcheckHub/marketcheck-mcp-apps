/**
 * Incentive Deal Finder
 * MCP App — Search ALL OEM incentives nationwide by budget, not by brand.
 * Dark-themed with canvas bar chart, sortable table, savings calculator.
 */
import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "incentive-deal-finder" }); } catch {}

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
  for (const key of ["vin", "zip", "make", "model", "miles", "state", "dealer_id", "ticker", "price", "offer_type", "max_monthly", "min_cashback"]) {
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

async function _fetchDirect(args) {
  const makes = (args.makes??"Toyota,Honda,Ford,Chevrolet,Hyundai,Kia,Nissan,BMW,Mercedes-Benz,Volkswagen").split(",");
  const results = await Promise.all(makes.map(async (make) => {
    try { const data = await _mcIncentives({oem:make.trim(), zip:args.zip}); return {make:make.trim(),data}; }
    catch (e) { console.warn(`[incentive-deal-finder] direct fetch make=${make} failed:`, (e as Error)?.message); return {make:make.trim(),data:null}; }
  }));
  return {results};
}

async function _callTool(toolName, args) {
  const auth = _getAuth();
  if (auth.value) {
    // 1. Proxy (same-origin, reliable) — network errors fall through, non-ok HTTP throws
    try {
      const r = await fetch((_proxyBase()) + "/api/proxy/" + toolName, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, _auth_mode: auth.mode, _auth_value: auth.value }),
      });
      if (r.ok) { const d = await r.json(); return { content: [{ type: "text", text: JSON.stringify(d) }] }; }
      // Proxy responded but not OK — fall through to direct API.
    } catch {
      // Proxy unreachable — fall through to direct API.
    }
    // 2. Direct API — errors propagate so caller can surface them in live mode
    const data = await _fetchDirect(args);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
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
  const badge = document.createElement("span");
  badge.id = "_mode_badge";
  badge.style.cssText = `padding:3px 10px;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:0.5px;background:${c.bg};color:${c.fg};border:1px solid ${c.fg}33;`;
  badge.textContent = c.label;
  bar.appendChild(badge);
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


// ── Types ──────────────────────────────────────────────────────────────────────

type OfferType = "cashback" | "apr" | "lease";

interface IncentiveOffer {
  id: string;
  make: string;
  model: string;
  offerType: OfferType;
  title: string;
  amount: number;          // dollar amount for cashback, rate for APR, monthly for lease
  amountDisplay: string;
  term: number;            // months
  expirationDate: string;  // ISO date
  dueAtSigning?: number;
  region: string;
  stackable: boolean;
  finePrint: string;
}

interface SearchFilters {
  offerType: OfferType | "all";
  maxMonthly: number;
  minCashback: number;
  makes: string[];
  zip: string;
}

type SortKey = "make" | "model" | "offerType" | "amount" | "term" | "expirationDate";
type SortDir = "asc" | "desc";

// ── Constants ──────────────────────────────────────────────────────────────────

const ALL_MAKES = [
  "Toyota", "Honda", "Ford", "Chevrolet", "Hyundai",
  "Kia", "Nissan", "BMW", "Mercedes-Benz", "Volkswagen",
  "Subaru", "Mazda", "Jeep", "Ram", "GMC",
];

const OFFER_TYPE_COLORS: Record<OfferType, { color: string; bg: string; label: string }> = {
  cashback: { color: "#22c55e", bg: "rgba(34,197,94,0.15)", label: "CASH BACK" },
  apr:      { color: "#3b82f6", bg: "rgba(59,130,246,0.15)", label: "LOW APR" },
  lease:    { color: "#a855f7", bg: "rgba(168,85,247,0.15)", label: "LEASE" },
};

// ── Mock Data ──────────────────────────────────────────────────────────────────

function generateMockOffers(): IncentiveOffer[] {
  return [
    // Toyota
    { id: "t1", make: "Toyota", model: "Camry", offerType: "cashback", title: "Spring Sales Event Cash Back", amount: 2500, amountDisplay: "$2,500 Cash Back", term: 0, expirationDate: "2026-04-30", region: "National", stackable: true, finePrint: "Must take delivery from dealer stock by 04/30. See dealer for details." },
    { id: "t2", make: "Toyota", model: "RAV4", offerType: "apr", title: "RAV4 Low APR Financing", amount: 1.9, amountDisplay: "1.9% APR / 60 mo", term: 60, expirationDate: "2026-04-15", region: "National", stackable: false, finePrint: "$17.48/mo per $1,000 financed. Toyota Financial Services. Tier 1+ credit." },
    { id: "t3", make: "Toyota", model: "Highlander", offerType: "lease", title: "Highlander XLE Lease", amount: 349, amountDisplay: "$349/mo / 36 mo", term: 36, expirationDate: "2026-04-30", dueAtSigning: 3499, region: "National", stackable: false, finePrint: "$3,499 due at signing. 10k mi/yr. $0.25/mi over." },
    { id: "t4", make: "Toyota", model: "Corolla", offerType: "cashback", title: "Corolla Customer Cash", amount: 1500, amountDisplay: "$1,500 Cash Back", term: 0, expirationDate: "2026-04-02", region: "National", stackable: true, finePrint: "On select 2025-2026 models. Dealer participation may vary." },
    // Honda
    { id: "h1", make: "Honda", model: "CR-V", offerType: "apr", title: "CR-V Special APR", amount: 2.9, amountDisplay: "2.9% APR / 60 mo", term: 60, expirationDate: "2026-04-30", region: "National", stackable: false, finePrint: "Honda Financial Services. Well-qualified buyers." },
    { id: "h2", make: "Honda", model: "Civic", offerType: "lease", title: "Civic Sport Lease", amount: 259, amountDisplay: "$259/mo / 36 mo", term: 36, expirationDate: "2026-04-30", dueAtSigning: 2999, region: "National", stackable: false, finePrint: "$2,999 due at signing. 12k mi/yr." },
    { id: "h3", make: "Honda", model: "Accord", offerType: "cashback", title: "Accord Bonus Cash", amount: 2000, amountDisplay: "$2,000 Cash Back", term: 0, expirationDate: "2026-05-15", region: "National", stackable: true, finePrint: "Available on 2025-2026 Accord EX and above." },
    { id: "h4", make: "Honda", model: "HR-V", offerType: "apr", title: "HR-V 0% Event", amount: 0.0, amountDisplay: "0.0% APR / 48 mo", term: 48, expirationDate: "2026-04-15", region: "National", stackable: false, finePrint: "$20.83/mo per $1,000 financed. Tier 1 credit." },
    // Ford
    { id: "f1", make: "Ford", model: "F-150", offerType: "cashback", title: "F-150 Customer Cash", amount: 3500, amountDisplay: "$3,500 Cash Back", term: 0, expirationDate: "2026-04-30", region: "National", stackable: true, finePrint: "On XLT, Lariat, King Ranch models. Not available on Raptor." },
    { id: "f2", make: "Ford", model: "Escape", offerType: "lease", title: "Escape SE Lease Deal", amount: 279, amountDisplay: "$279/mo / 36 mo", term: 36, expirationDate: "2026-04-30", dueAtSigning: 3199, region: "National", stackable: false, finePrint: "$3,199 due at signing. 10.5k mi/yr. Ford Credit." },
    { id: "f3", make: "Ford", model: "Bronco Sport", offerType: "apr", title: "Bronco Sport 0.9% APR", amount: 0.9, amountDisplay: "0.9% APR / 60 mo", term: 60, expirationDate: "2026-04-02", region: "National", stackable: false, finePrint: "Ford Credit financing. Tier 1 credit required." },
    { id: "f4", make: "Ford", model: "Explorer", offerType: "cashback", title: "Explorer Cash Allowance", amount: 4000, amountDisplay: "$4,000 Cash Back", term: 0, expirationDate: "2026-05-31", region: "National", stackable: true, finePrint: "On 2025 Explorer XLT and above. Dealer stock only." },
    // Chevrolet
    { id: "c1", make: "Chevrolet", model: "Equinox", offerType: "cashback", title: "Equinox Cash Allowance", amount: 3000, amountDisplay: "$3,000 Cash Back", term: 0, expirationDate: "2026-04-30", region: "National", stackable: true, finePrint: "On 2025-2026 Equinox LT and RS. Excludes EV models." },
    { id: "c2", make: "Chevrolet", model: "Silverado 1500", offerType: "apr", title: "Silverado 1.9% APR", amount: 1.9, amountDisplay: "1.9% APR / 72 mo", term: 72, expirationDate: "2026-04-15", region: "National", stackable: false, finePrint: "GM Financial. Select 2025 models. Not all buyers qualify." },
    { id: "c3", make: "Chevrolet", model: "Trax", offerType: "lease", title: "Trax LT Lease", amount: 199, amountDisplay: "$199/mo / 36 mo", term: 36, expirationDate: "2026-04-30", dueAtSigning: 2499, region: "National", stackable: false, finePrint: "$2,499 due at signing. 10k mi/yr. Tax, title extra." },
    { id: "c4", make: "Chevrolet", model: "Blazer", offerType: "cashback", title: "Blazer Bonus Cash", amount: 2500, amountDisplay: "$2,500 Cash Back", term: 0, expirationDate: "2026-04-02", region: "National", stackable: true, finePrint: "2025-2026 Blazer 2LT and above. Not available on EV." },
    // Hyundai
    { id: "hy1", make: "Hyundai", model: "Tucson", offerType: "cashback", title: "Tucson Customer Cash", amount: 2000, amountDisplay: "$2,000 Cash Back", term: 0, expirationDate: "2026-04-30", region: "National", stackable: true, finePrint: "2025-2026 Tucson SEL and above." },
    { id: "hy2", make: "Hyundai", model: "Elantra", offerType: "apr", title: "Elantra 0% APR", amount: 0.0, amountDisplay: "0.0% APR / 48 mo", term: 48, expirationDate: "2026-04-30", region: "National", stackable: false, finePrint: "Hyundai Motor Finance. Tier 1 credit required." },
    { id: "hy3", make: "Hyundai", model: "Santa Fe", offerType: "lease", title: "Santa Fe SEL Lease", amount: 329, amountDisplay: "$329/mo / 36 mo", term: 36, expirationDate: "2026-04-30", dueAtSigning: 3299, region: "National", stackable: false, finePrint: "$3,299 due at signing. 10k mi/yr." },
    // Kia
    { id: "k1", make: "Kia", model: "Sportage", offerType: "cashback", title: "Sportage Cash Bonus", amount: 2500, amountDisplay: "$2,500 Cash Back", term: 0, expirationDate: "2026-05-15", region: "National", stackable: true, finePrint: "2025-2026 Sportage LX and above." },
    { id: "k2", make: "Kia", model: "Forte", offerType: "lease", title: "Forte LXS Lease", amount: 219, amountDisplay: "$219/mo / 36 mo", term: 36, expirationDate: "2026-04-30", dueAtSigning: 2699, region: "National", stackable: false, finePrint: "$2,699 due at signing. 10k mi/yr." },
    { id: "k3", make: "Kia", model: "Telluride", offerType: "apr", title: "Telluride 2.9% APR", amount: 2.9, amountDisplay: "2.9% APR / 60 mo", term: 60, expirationDate: "2026-04-30", region: "National", stackable: false, finePrint: "Kia Financial. Select trims. Well-qualified buyers." },
    // Nissan
    { id: "n1", make: "Nissan", model: "Rogue", offerType: "cashback", title: "Rogue Customer Cash", amount: 3000, amountDisplay: "$3,000 Cash Back", term: 0, expirationDate: "2026-04-30", region: "National", stackable: true, finePrint: "On 2025-2026 Rogue SV and above." },
    { id: "n2", make: "Nissan", model: "Altima", offerType: "apr", title: "Altima 0.9% APR", amount: 0.9, amountDisplay: "0.9% APR / 60 mo", term: 60, expirationDate: "2026-04-15", region: "National", stackable: false, finePrint: "NMAC financing. Tier 1 credit." },
    { id: "n3", make: "Nissan", model: "Kicks", offerType: "lease", title: "Kicks S Lease", amount: 209, amountDisplay: "$209/mo / 36 mo", term: 36, expirationDate: "2026-04-02", dueAtSigning: 2299, region: "National", stackable: false, finePrint: "$2,299 due at signing. 10k mi/yr." },
    // BMW
    { id: "b1", make: "BMW", model: "3 Series", offerType: "lease", title: "330i xDrive Lease", amount: 449, amountDisplay: "$449/mo / 36 mo", term: 36, expirationDate: "2026-04-30", dueAtSigning: 4499, region: "National", stackable: false, finePrint: "$4,499 due at signing. 10k mi/yr. BMW FS." },
    { id: "b2", make: "BMW", model: "X3", offerType: "apr", title: "X3 Special APR", amount: 3.9, amountDisplay: "3.9% APR / 60 mo", term: 60, expirationDate: "2026-04-30", region: "National", stackable: false, finePrint: "BMW Financial Services. Tier 1 credit." },
    { id: "b3", make: "BMW", model: "X1", offerType: "cashback", title: "X1 Loyalty Credit", amount: 1500, amountDisplay: "$1,500 Cash Back", term: 0, expirationDate: "2026-05-31", region: "National", stackable: true, finePrint: "Current BMW owners/lessees. Proof required." },
    // Mercedes
    { id: "m1", make: "Mercedes-Benz", model: "GLC", offerType: "lease", title: "GLC 300 Lease", amount: 499, amountDisplay: "$499/mo / 36 mo", term: 36, expirationDate: "2026-04-30", dueAtSigning: 4999, region: "National", stackable: false, finePrint: "$4,999 due at signing. 10k mi/yr. MBFS." },
    { id: "m2", make: "Mercedes-Benz", model: "C-Class", offerType: "apr", title: "C 300 Special Rate", amount: 4.9, amountDisplay: "4.9% APR / 60 mo", term: 60, expirationDate: "2026-04-30", region: "National", stackable: false, finePrint: "Mercedes-Benz Financial Services. Excellent credit." },
  ];
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function fmtCurrency(v: number): string {
  return "$" + Math.round(v).toLocaleString();
}

function fmtNum(v: number): string {
  return Math.round(v).toLocaleString();
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function filterOffers(offers: IncentiveOffer[], filters: SearchFilters): IncentiveOffer[] {
  return offers.filter(o => {
    if (filters.offerType !== "all" && o.offerType !== filters.offerType) return false;
    if (filters.makes.length > 0 && !filters.makes.includes(o.make)) return false;
    if (o.offerType === "cashback" && o.amount < filters.minCashback) return false;
    if (o.offerType === "lease" && o.amount > filters.maxMonthly && filters.maxMonthly > 0) return false;
    return true;
  });
}

function sortOffers(offers: IncentiveOffer[], key: SortKey, dir: SortDir): IncentiveOffer[] {
  const sorted = [...offers];
  sorted.sort((a, b) => {
    let va: any, vb: any;
    switch (key) {
      case "make": va = a.make; vb = b.make; break;
      case "model": va = a.model; vb = b.model; break;
      case "offerType": va = a.offerType; vb = b.offerType; break;
      case "amount": va = a.amount; vb = b.amount; break;
      case "term": va = a.term; vb = b.term; break;
      case "expirationDate": va = a.expirationDate; vb = b.expirationDate; break;
      default: va = a.amount; vb = b.amount;
    }
    if (typeof va === "string") {
      const cmp = va.localeCompare(vb as string);
      return dir === "asc" ? cmp : -cmp;
    }
    return dir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });
  return sorted;
}

// ── Canvas: Top 10 Cashback Bar Chart ──────────────────────────────────────────

function drawCashbackChart(canvas: HTMLCanvasElement, offers: IncentiveOffer[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, w, h);

  // Get top 10 cashback offers
  const cashbackOffers = offers
    .filter(o => o.offerType === "cashback")
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  if (cashbackOffers.length === 0) {
    ctx.fillStyle = "#64748b";
    ctx.font = "14px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No cashback offers match current filters", w / 2, h / 2);
    return;
  }

  const marginLeft = 140;
  const marginRight = 70;
  const marginTop = 40;
  const marginBottom = 20;
  const chartW = w - marginLeft - marginRight;
  const chartH = h - marginTop - marginBottom;
  const barH = Math.min(28, (chartH / cashbackOffers.length) - 6);
  const gap = (chartH - barH * cashbackOffers.length) / (cashbackOffers.length + 1);

  const maxVal = Math.max(...cashbackOffers.map(o => o.amount));

  // Title
  ctx.fillStyle = "#f1f5f9";
  ctx.font = "bold 14px -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Top 10 Cashback Offers Across Brands", marginLeft, 24);

  // Grid lines
  const gridSteps = 5;
  for (let i = 0; i <= gridSteps; i++) {
    const x = marginLeft + (chartW * i) / gridSteps;
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, marginTop);
    ctx.lineTo(x, marginTop + chartH);
    ctx.stroke();

    ctx.fillStyle = "#64748b";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(fmtCurrency(Math.round((maxVal * i) / gridSteps)), x, marginTop + chartH + 14);
  }

  // Bars
  const brandColors: Record<string, string> = {
    Toyota: "#ef4444", Honda: "#3b82f6", Ford: "#2563eb", Chevrolet: "#f59e0b",
    Hyundai: "#06b6d4", Kia: "#8b5cf6", Nissan: "#ec4899", BMW: "#0ea5e9",
    "Mercedes-Benz": "#64748b", Volkswagen: "#22c55e", Subaru: "#14b8a6",
    Mazda: "#f43f5e", Jeep: "#84cc16", Ram: "#d97706", GMC: "#e11d48",
  };

  cashbackOffers.forEach((offer, i) => {
    const y = marginTop + gap + i * (barH + gap);
    const barW = (offer.amount / maxVal) * chartW;
    const color = brandColors[offer.make] || "#60a5fa";

    // Bar
    const grad = ctx.createLinearGradient(marginLeft, 0, marginLeft + barW, 0);
    grad.addColorStop(0, color + "cc");
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(marginLeft, y, barW, barH, 4);
    ctx.fill();

    // Label
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "12px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${offer.make} ${offer.model}`, marginLeft - 8, y + barH / 2 + 4);

    // Value
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 11px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(fmtCurrency(offer.amount), marginLeft + barW + 6, y + barH / 2 + 4);
  });
}

// ── Canvas: APR Comparison Chart ───────────────────────────────────────────────

function drawAprChart(canvas: HTMLCanvasElement, offers: IncentiveOffer[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const aprOffers = offers
    .filter(o => o.offerType === "apr")
    .sort((a, b) => a.amount - b.amount)
    .slice(0, 10);

  if (aprOffers.length === 0) {
    ctx.fillStyle = "#64748b";
    ctx.font = "14px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No APR offers match current filters", w / 2, h / 2);
    return;
  }

  const marginLeft = 140;
  const marginRight = 70;
  const marginTop = 40;
  const marginBottom = 20;
  const chartW = w - marginLeft - marginRight;
  const chartH = h - marginTop - marginBottom;
  const barH = Math.min(28, (chartH / aprOffers.length) - 6);
  const gap = (chartH - barH * aprOffers.length) / (aprOffers.length + 1);

  const maxVal = Math.max(...aprOffers.map(o => o.amount), 5.0);

  ctx.fillStyle = "#f1f5f9";
  ctx.font = "bold 14px -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Best APR Offers (Lowest First)", marginLeft, 24);

  // Average market rate line
  const avgRate = 6.5;
  const avgX = marginLeft + (avgRate / maxVal) * chartW;
  if (avgX <= marginLeft + chartW) {
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(avgX, marginTop);
    ctx.lineTo(avgX, marginTop + chartH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ef4444";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Avg 6.5%", avgX, marginTop - 4);
  }

  aprOffers.forEach((offer, i) => {
    const y = marginTop + gap + i * (barH + gap);
    const barW = Math.max(4, (offer.amount / maxVal) * chartW);

    const green = Math.max(0, Math.min(255, Math.round(255 - (offer.amount / 5) * 200)));
    const red = Math.max(0, Math.min(255, Math.round((offer.amount / 5) * 200)));
    const color = `rgb(${red},${green},100)`;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(marginLeft, y, barW, barH, 4);
    ctx.fill();

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "12px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${offer.make} ${offer.model}`, marginLeft - 8, y + barH / 2 + 4);

    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 11px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${offer.amount.toFixed(1)}% / ${offer.term}mo`, marginLeft + barW + 6, y + barH / 2 + 4);
  });
}

// ── API Response Parser ────────────────────────────────────────────────────────
// Handles both shapes we see in practice:
//   • MCP server tool find-incentive-deals → {offers: [{make, ...flat}, ...]}
//   • Direct _fetchDirect fallback         → {results: [{make, data: {listings: [{offer: {...}}]}}]}

function normalizeOfferType(raw: any): OfferType {
  const s = String(raw || "").toLowerCase();
  if (s.startsWith("cash")) return "cashback";
  if (s.startsWith("finance") || s === "apr") return "apr";
  if (s.startsWith("lease")) return "lease";
  return "cashback";
}

function coerceIncentive(rawItem: any, fallbackMake: string): IncentiveOffer | null {
  if (!rawItem || typeof rawItem !== "object") return null;
  // Raw API case: the incentive lives under rawItem.offer. Pre-normalized proxy case: rawItem IS the flat offer.
  const o = rawItem.offer || {};
  const v = (o.vehicles?.[0] as any) || {};
  const amt = (o.amounts?.[0] as any) || {};

  const offerType = normalizeOfferType(rawItem.offerType ?? rawItem.type ?? rawItem.offer_type ?? o.offer_type);

  // Prefer the top-level pre-normalized amount (set by the proxy's transformIncentiveListings);
  // fall back to the raw-API nested paths.
  let amount: number;
  if (typeof rawItem.amount === "number") {
    amount = rawItem.amount;
  } else if (offerType === "cashback") {
    amount = Number(o.cashback_amount ?? o.cash_amount ?? amt.cashback ?? 0);
  } else if (offerType === "apr") {
    amount = Number(amt.apr ?? o.apr ?? 0);
  } else {
    amount = Number(amt.monthly ?? o.monthly_payment ?? 0);
  }
  if (!isFinite(amount)) amount = 0;

  const term = Number(rawItem.term ?? amt.term ?? o.term ?? 0) || 0;
  const make = rawItem.make || v.make || fallbackMake || "";
  const model = rawItem.model || v.model || "";
  if (!make) return null;

  const amountDisplay = rawItem.amountDisplay
    || (offerType === "cashback"
      ? `$${amount.toLocaleString()} Cash Back`
      : offerType === "apr"
        ? `${amount.toFixed(1)}% APR${term ? ` / ${term}mo` : ""}`
        : `$${amount.toLocaleString()}/mo${term ? ` / ${term}mo` : ""}`);

  const title = (rawItem.title || o.titles?.[0] || o.oem_program_name || `${make} ${model} ${offerType}`).toString().slice(0, 120);
  const expiration = rawItem.expirationDate || o.valid_through || o.expiration_date || rawItem.valid_through || "";
  const disclaimer = rawItem.finePrint || rawItem.description || o.disclaimers?.[0] || o.fine_print || o.offers?.[0] || "";

  return {
    id: rawItem.id || `${make}-${model}-${Math.random().toString(36).slice(2, 6)}`,
    make,
    model,
    offerType,
    title,
    amount,
    amountDisplay,
    term,
    expirationDate: expiration,
    dueAtSigning: Number(rawItem.dueAtSigning ?? o.due_at_signing ?? amt.due_at_signing ?? 0) || undefined,
    region: rawItem.region || rawItem.state || rawItem.city || o.region || "National",
    stackable: Boolean(rawItem.stackable ?? o.stackable ?? false),
    finePrint: String(disclaimer || "").substring(0, 200),
  };
}

function parseOffersFromResponse(parsed: any): IncentiveOffer[] {
  if (!parsed || typeof parsed !== "object") return [];
  const out: IncentiveOffer[] = [];

  // Shape 1: MCP server — {offers: [...flat items with make]}
  if (Array.isArray(parsed.offers)) {
    for (const item of parsed.offers) {
      const o = coerceIncentive(item, item?.make);
      if (o) out.push(o);
    }
  }

  // Shape 2: Direct fetch fallback — {results: [{make, data: {listings|incentives: [...]}}]}
  // Also handles the edge case where the raw API response is passed through directly.
  const resultsArr = parsed.results
    || (parsed.num_found != null || Array.isArray(parsed.listings) ? [{ make: "", data: parsed }] : []);
  for (const entry of resultsArr) {
    const items = entry?.data?.listings || entry?.data?.incentives || (Array.isArray(entry?.data) ? entry.data : []);
    for (const item of items) {
      const o = coerceIncentive(item, entry?.make);
      if (o) out.push(o);
    }
  }

  return out;
}

// ── App State ──────────────────────────────────────────────────────────────────

let allOffers: IncentiveOffer[] = [];
let filteredOffers: IncentiveOffer[] = [];
let sortKey: SortKey = "amount";
let sortDir: SortDir = "desc";
let currentFilters: SearchFilters = {
  offerType: "all",
  maxMonthly: 500,
  minCashback: 0,
  makes: [],
  zip: "90210",
};
type ApiErrorKind = "empty" | "threw";
let apiError: { kind: ApiErrorKind; message: string } | null = null;

// ── Build UI ───────────────────────────────────────────────────────────────────

document.body.style.cssText =
  "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;overflow-x:hidden;min-height:100vh;";

const container = document.createElement("div");
container.style.cssText = "max-width:1400px;margin:0 auto;padding:16px 20px;";
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

// ── Header ─────────────────────────────────────────────────────────────────────

const headerPanel = document.createElement("div");
headerPanel.style.cssText = "background:#1e293b;border-radius:10px;padding:16px 20px;margin-bottom:16px;border:1px solid #334155;";

const titleRow = document.createElement("div");
titleRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;";
titleRow.innerHTML = `<h1 style="font-size:20px;font-weight:700;color:#f1f5f9;letter-spacing:-0.3px;margin:0;">Incentive Deal Finder</h1>`;
_addSettingsBar(titleRow);
headerPanel.appendChild(titleRow);

const subtitle = document.createElement("div");
subtitle.style.cssText = "font-size:12px;color:#94a3b8;margin-bottom:14px;";
subtitle.textContent = "Search all OEM incentives nationwide -- find the best deals by budget, not by brand.";
headerPanel.appendChild(subtitle);

// Search form
const formRow1 = document.createElement("div");
formRow1.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:10px;";

function makeFormField(label: string, inputHtml: string): HTMLDivElement {
  const d = document.createElement("div");
  d.style.cssText = "display:flex;flex-direction:column;gap:4px;";
  d.innerHTML = `<label style="font-size:11px;color:#94a3b8;font-weight:600;">${label}</label>${inputHtml}`;
  return d;
}

const inputStyle = "padding:7px 10px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;min-width:120px;";

formRow1.appendChild(makeFormField("Offer Type",
  `<select id="offerTypeSelect" style="${inputStyle}">
    <option value="all">All Types</option>
    <option value="cashback">Cash Back</option>
    <option value="apr">Low APR</option>
    <option value="lease">Lease Specials</option>
  </select>`));

formRow1.appendChild(makeFormField("Max Monthly (Lease)",
  `<input id="maxMonthlyInput" type="number" value="500" min="0" step="50" style="${inputStyle}width:100px;" />`));

formRow1.appendChild(makeFormField("Min Cashback",
  `<input id="minCashbackInput" type="number" value="0" min="0" step="500" style="${inputStyle}width:100px;" />`));

formRow1.appendChild(makeFormField("ZIP Code",
  `<input id="zipInput" type="text" value="90210" maxlength="5" style="${inputStyle}width:80px;" />`));

headerPanel.appendChild(formRow1);

// Make filter row
const formRow2 = document.createElement("div");
formRow2.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;";

const makeLabel = document.createElement("span");
makeLabel.style.cssText = "font-size:11px;color:#94a3b8;font-weight:600;";
makeLabel.textContent = "Filter by Makes:";
formRow2.appendChild(makeLabel);

const makeCheckboxes: HTMLInputElement[] = [];
ALL_MAKES.forEach(make => {
  const wrap = document.createElement("label");
  wrap.style.cssText = "display:flex;align-items:center;gap:3px;font-size:11px;color:#cbd5e1;cursor:pointer;";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.value = make;
  cb.style.cssText = "accent-color:#3b82f6;";
  makeCheckboxes.push(cb);
  wrap.appendChild(cb);
  wrap.appendChild(document.createTextNode(make));
  formRow2.appendChild(wrap);
});

headerPanel.appendChild(formRow2);

// Search button
const btnRow = document.createElement("div");
btnRow.style.cssText = "display:flex;gap:10px;align-items:center;";
const searchBtn = document.createElement("button");
searchBtn.textContent = "Search Incentives";
searchBtn.style.cssText = "padding:9px 24px;border-radius:6px;border:none;background:#3b82f6;color:#fff;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.2s;";
searchBtn.addEventListener("mouseenter", () => { searchBtn.style.background = "#2563eb"; });
searchBtn.addEventListener("mouseleave", () => { searchBtn.style.background = "#3b82f6"; });

const clearBtn = document.createElement("button");
clearBtn.textContent = "Clear Filters";
clearBtn.style.cssText = "padding:9px 16px;border-radius:6px;border:1px solid #334155;background:transparent;color:#94a3b8;font-size:13px;cursor:pointer;";

btnRow.appendChild(searchBtn);
btnRow.appendChild(clearBtn);
headerPanel.appendChild(btnRow);
container.appendChild(headerPanel);

// ── KPI Cards ──────────────────────────────────────────────────────────────────

const kpiRow = document.createElement("div");
kpiRow.style.cssText = "display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;";
container.appendChild(kpiRow);

function makeKpiCard(label: string, value: string, color: string): HTMLDivElement {
  const card = document.createElement("div");
  card.style.cssText = `background:#1e293b;border-radius:10px;padding:16px;border:1px solid #334155;text-align:center;`;
  card.innerHTML = `
    <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${label}</div>
    <div style="font-size:24px;font-weight:700;color:${color};">${value}</div>
  `;
  return card;
}

// ── Expiring Soon Alerts ───────────────────────────────────────────────────────

const alertPanel = document.createElement("div");
alertPanel.style.cssText = "display:none;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:14px 18px;margin-bottom:16px;";
container.appendChild(alertPanel);

// ── Deals Table ────────────────────────────────────────────────────────────────

const tablePanel = document.createElement("div");
tablePanel.style.cssText = "background:#1e293b;border-radius:10px;padding:16px;border:1px solid #334155;margin-bottom:16px;";

const tableTitle = document.createElement("div");
tableTitle.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;";
tableTitle.innerHTML = `<h2 style="font-size:16px;font-weight:600;color:#f1f5f9;margin:0;">All Matching Deals</h2>
  <span id="dealCount" style="font-size:12px;color:#64748b;">0 offers</span>`;
tablePanel.appendChild(tableTitle);

const tableWrap = document.createElement("div");
tableWrap.style.cssText = "overflow-x:auto;";
const table = document.createElement("table");
table.style.cssText = "width:100%;border-collapse:collapse;font-size:13px;";
tableWrap.appendChild(table);
tablePanel.appendChild(tableWrap);
container.appendChild(tablePanel);

// ── Charts ─────────────────────────────────────────────────────────────────────

const chartsRow = document.createElement("div");
chartsRow.style.cssText = "display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;";

const cashbackChartPanel = document.createElement("div");
cashbackChartPanel.style.cssText = "flex:1;min-width:300px;background:#1e293b;border-radius:10px;padding:16px;border:1px solid #334155;";
const cashbackCanvas = document.createElement("canvas");
cashbackCanvas.style.cssText = "width:100%;height:360px;";
cashbackChartPanel.appendChild(cashbackCanvas);
chartsRow.appendChild(cashbackChartPanel);

const aprChartPanel = document.createElement("div");
aprChartPanel.style.cssText = "flex:1;min-width:300px;background:#1e293b;border-radius:10px;padding:16px;border:1px solid #334155;";
const aprCanvas = document.createElement("canvas");
aprCanvas.style.cssText = "width:100%;height:360px;";
aprChartPanel.appendChild(aprCanvas);
chartsRow.appendChild(aprChartPanel);

container.appendChild(chartsRow);

// ── Savings Calculator ─────────────────────────────────────────────────────────

const savingsPanel = document.createElement("div");
savingsPanel.style.cssText = "background:#1e293b;border-radius:10px;padding:16px 20px;border:1px solid #334155;margin-bottom:16px;";
savingsPanel.innerHTML = `<h2 style="font-size:16px;font-weight:600;color:#f1f5f9;margin:0 0 12px 0;">Savings Calculator</h2>`;

const savingsForm = document.createElement("div");
savingsForm.style.cssText = "display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin-bottom:14px;";

savingsForm.appendChild(makeFormField("Vehicle Price",
  `<input id="savVehiclePrice" type="number" value="35000" style="${inputStyle}width:110px;" />`));
savingsForm.appendChild(makeFormField("Loan Amount",
  `<input id="savLoanAmt" type="number" value="30000" style="${inputStyle}width:110px;" />`));
savingsForm.appendChild(makeFormField("Average Market APR %",
  `<input id="savMarketApr" type="number" value="6.5" step="0.1" style="${inputStyle}width:90px;" />`));
savingsForm.appendChild(makeFormField("Incentive APR %",
  `<input id="savIncentiveApr" type="number" value="1.9" step="0.1" style="${inputStyle}width:90px;" />`));
savingsForm.appendChild(makeFormField("Term (months)",
  `<input id="savTerm" type="number" value="60" style="${inputStyle}width:70px;" />`));

const calcBtn = document.createElement("button");
calcBtn.textContent = "Calculate Savings";
calcBtn.style.cssText = "padding:9px 20px;border-radius:6px;border:none;background:#22c55e;color:#fff;font-size:13px;font-weight:600;cursor:pointer;";
savingsForm.appendChild(calcBtn);
savingsPanel.appendChild(savingsForm);

const savingsResult = document.createElement("div");
savingsResult.style.cssText = "display:none;";
savingsPanel.appendChild(savingsResult);

container.appendChild(savingsPanel);

// ── Render Functions ───────────────────────────────────────────────────────────

function renderKpis() {
  kpiRow.innerHTML = "";
  const totalOffers = filteredOffers.length;
  const cashbacks = filteredOffers.filter(o => o.offerType === "cashback");
  const aprs = filteredOffers.filter(o => o.offerType === "apr");
  const leases = filteredOffers.filter(o => o.offerType === "lease");

  const bestCashback = cashbacks.length > 0 ? Math.max(...cashbacks.map(o => o.amount)) : 0;
  const lowestApr = aprs.length > 0 ? Math.min(...aprs.map(o => o.amount)) : 0;
  const avgLease = leases.length > 0 ? Math.round(leases.reduce((s, o) => s + o.amount, 0) / leases.length) : 0;

  kpiRow.appendChild(makeKpiCard("Total Offers", fmtNum(totalOffers), "#60a5fa"));
  kpiRow.appendChild(makeKpiCard("Best Cashback", bestCashback > 0 ? fmtCurrency(bestCashback) : "N/A", "#22c55e"));
  kpiRow.appendChild(makeKpiCard("Lowest APR", aprs.length > 0 ? lowestApr.toFixed(1) + "%" : "N/A", "#a855f7"));
  kpiRow.appendChild(makeKpiCard("Avg Lease Payment", avgLease > 0 ? fmtCurrency(avgLease) + "/mo" : "N/A", "#f59e0b"));
}

function renderAlerts() {
  const expiring = filteredOffers.filter(o => {
    const d = daysUntil(o.expirationDate);
    return d >= 0 && d <= 7;
  });
  if (expiring.length === 0) {
    alertPanel.style.display = "none";
    return;
  }
  alertPanel.style.display = "block";
  alertPanel.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <span style="font-size:18px;">&#9888;</span>
      <span style="font-size:14px;font-weight:600;color:#ef4444;">Expiring Within 7 Days</span>
      <span style="font-size:12px;color:#fca5a5;">${expiring.length} offer${expiring.length > 1 ? "s" : ""}</span>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      ${expiring.map(o => {
        const d = daysUntil(o.expirationDate);
        return `<div style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.25);border-radius:8px;padding:10px 14px;min-width:200px;">
          <div style="font-size:13px;font-weight:600;color:#fca5a5;">${o.make} ${o.model}</div>
          <div style="font-size:12px;color:#f87171;">${o.amountDisplay}</div>
          <div style="font-size:11px;color:#ef4444;margin-top:4px;">${d === 0 ? "Expires TODAY" : d === 1 ? "Expires TOMORROW" : `Expires in ${d} days`}</div>
        </div>`;
      }).join("")}
    </div>
  `;
}

function renderTable() {
  const sorted = sortOffers(filteredOffers, sortKey, sortDir);
  const countEl = document.getElementById("dealCount");
  if (countEl) countEl.textContent = `${sorted.length} offers`;

  const headers: { key: SortKey; label: string; width: string }[] = [
    { key: "make", label: "Make", width: "10%" },
    { key: "model", label: "Model", width: "12%" },
    { key: "offerType", label: "Type", width: "10%" },
    { key: "amount", label: "Amount / Rate", width: "14%" },
    { key: "term", label: "Term", width: "8%" },
    { key: "expirationDate", label: "Expires", width: "10%" },
  ];

  const arrow = (k: SortKey) => sortKey === k ? (sortDir === "asc" ? " &#9650;" : " &#9660;") : "";

  table.innerHTML = `
    <thead>
      <tr>
        ${headers.map(h => `<th data-key="${h.key}" style="text-align:left;padding:10px 12px;border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;cursor:pointer;user-select:none;white-space:nowrap;width:${h.width};">${h.label}${arrow(h.key)}</th>`).join("")}
        <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;width:22%;">Title</th>
        <th style="text-align:center;padding:10px 12px;border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;width:8%;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${sorted.map((o, i) => {
        const d = daysUntil(o.expirationDate);
        const typeConf = OFFER_TYPE_COLORS[o.offerType];
        const isExpiring = d >= 0 && d <= 7;
        const isExpired = d < 0;
        const rowBg = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)";
        let statusBadge = "";
        if (isExpired) {
          statusBadge = `<span style="padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600;background:rgba(239,68,68,0.2);color:#ef4444;">EXPIRED</span>`;
        } else if (isExpiring) {
          statusBadge = `<span style="padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600;background:rgba(249,115,22,0.2);color:#f97316;">${d}d LEFT</span>`;
        } else {
          statusBadge = `<span style="padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600;background:rgba(34,197,94,0.2);color:#22c55e;">ACTIVE</span>`;
        }
        return `<tr style="background:${rowBg};${isExpired ? 'opacity:0.5;' : ''}" title="${o.finePrint}">
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;font-weight:600;color:#f1f5f9;">${o.make}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#cbd5e1;">${o.model}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;"><span style="padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600;background:${typeConf.bg};color:${typeConf.color};">${typeConf.label}</span></td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#f8fafc;font-weight:600;">${o.amountDisplay}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;">${o.term > 0 ? o.term + " mo" : "--"}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:${isExpiring ? '#f97316' : '#94a3b8'};">${o.expirationDate}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#cbd5e1;font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${o.title}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;text-align:center;">${statusBadge}</td>
        </tr>`;
      }).join("")}
    </tbody>
  `;

  // Attach sort handlers
  table.querySelectorAll("th[data-key]").forEach(th => {
    th.addEventListener("click", () => {
      const k = (th as HTMLElement).dataset.key as SortKey;
      if (sortKey === k) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        sortKey = k;
        sortDir = k === "amount" ? "desc" : "asc";
      }
      renderTable();
    });
  });
}

function renderCharts() {
  drawCashbackChart(cashbackCanvas, filteredOffers);
  drawAprChart(aprCanvas, filteredOffers);
}

function renderApiErrorBanner() {
  const existing = document.getElementById("_api_error_banner");
  if (existing) existing.remove();
  const badge = document.getElementById("_mode_badge");
  if (!apiError) {
    if (badge && _detectAppMode() === "live") {
      badge.textContent = "LIVE";
      badge.style.background = "#05966922";
      badge.style.color = "#34d399";
      badge.style.borderColor = "#34d39933";
    }
    return;
  }
  if (badge) {
    badge.textContent = "API ERROR";
    badge.style.background = "#7f1d1d88";
    badge.style.color = "#fca5a5";
    badge.style.borderColor = "#fca5a566";
  }

  const banner = document.createElement("div");
  banner.id = "_api_error_banner";
  banner.style.cssText = "background:linear-gradient(135deg,#7f1d1d22,#ef444411);border:1px solid #ef444466;border-radius:10px;padding:14px 20px;margin-bottom:12px;display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;";

  const textWrap = document.createElement("div");
  textWrap.style.cssText = "flex:1;min-width:200px;";
  const titleEl = document.createElement("div");
  titleEl.style.cssText = "font-size:13px;font-weight:700;color:#fca5a5;margin-bottom:4px;";
  titleEl.textContent = apiError.kind === "empty"
    ? "⚠ Live API returned no offers — showing sample data"
    : "⚠ Live API request failed — showing sample data";
  const msgEl = document.createElement("div");
  msgEl.style.cssText = "font-size:12px;color:#fda4af;line-height:1.5;margin-bottom:6px;";
  msgEl.textContent = apiError.message;
  const helpEl = document.createElement("div");
  helpEl.style.cssText = "font-size:11px;color:#f87171;line-height:1.5;";
  helpEl.appendChild(document.createTextNode(
    "Common causes: invalid or expired API key, missing subscription tier for the incentives endpoint, or a temporary service outage. Check your key at "
  ));
  const link = document.createElement("a");
  link.href = "https://developers.marketcheck.com";
  link.target = "_blank";
  link.style.cssText = "color:#fca5a5;text-decoration:underline;";
  link.textContent = "developers.marketcheck.com";
  helpEl.appendChild(link);
  helpEl.appendChild(document.createTextNode("."));
  textWrap.appendChild(titleEl);
  textWrap.appendChild(msgEl);
  textWrap.appendChild(helpEl);

  const clearBtn = document.createElement("button");
  clearBtn.textContent = "Clear Key";
  clearBtn.style.cssText = "padding:8px 14px;border-radius:6px;border:1px solid #ef444466;background:transparent;color:#fca5a5;font-size:12px;font-weight:600;cursor:pointer;";
  clearBtn.addEventListener("click", () => {
    localStorage.removeItem("mc_api_key");
    localStorage.removeItem("mc_access_token");
    const url = new URL(location.href);
    url.searchParams.delete("api_key");
    location.href = url.toString();
  });

  banner.appendChild(textWrap);
  banner.appendChild(clearBtn);
  container.insertBefore(banner, container.firstChild);
}

function renderAll() {
  renderApiErrorBanner();
  renderKpis();
  renderAlerts();
  renderTable();
  renderCharts();
}

// ── Savings Calculator Logic ───────────────────────────────────────────────────

function calculateSavings() {
  const loanAmt = parseFloat((document.getElementById("savLoanAmt") as HTMLInputElement)?.value) || 30000;
  const marketApr = parseFloat((document.getElementById("savMarketApr") as HTMLInputElement)?.value) || 6.5;
  const incentiveApr = parseFloat((document.getElementById("savIncentiveApr") as HTMLInputElement)?.value) || 1.9;
  const term = parseInt((document.getElementById("savTerm") as HTMLInputElement)?.value) || 60;

  function monthlyPayment(principal: number, annualRate: number, months: number): number {
    if (annualRate === 0) return principal / months;
    const r = annualRate / 100 / 12;
    return principal * (r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  }

  const marketMonthly = monthlyPayment(loanAmt, marketApr, term);
  const incentiveMonthly = monthlyPayment(loanAmt, incentiveApr, term);
  const monthlySavings = marketMonthly - incentiveMonthly;
  const totalSavings = monthlySavings * term;
  const marketTotal = marketMonthly * term;
  const incentiveTotal = incentiveMonthly * term;

  savingsResult.style.display = "block";
  savingsResult.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
      <div style="background:#0f172a;border-radius:8px;padding:14px;text-align:center;">
        <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Market Rate Payment</div>
        <div style="font-size:20px;font-weight:700;color:#ef4444;">${fmtCurrency(marketMonthly)}/mo</div>
        <div style="font-size:11px;color:#64748b;margin-top:4px;">Total: ${fmtCurrency(marketTotal)}</div>
      </div>
      <div style="background:#0f172a;border-radius:8px;padding:14px;text-align:center;">
        <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Incentive Rate Payment</div>
        <div style="font-size:20px;font-weight:700;color:#22c55e;">${fmtCurrency(incentiveMonthly)}/mo</div>
        <div style="font-size:11px;color:#64748b;margin-top:4px;">Total: ${fmtCurrency(incentiveTotal)}</div>
      </div>
      <div style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:8px;padding:14px;text-align:center;">
        <div style="font-size:11px;color:#22c55e;margin-bottom:4px;">YOUR SAVINGS</div>
        <div style="font-size:24px;font-weight:700;color:#22c55e;">${fmtCurrency(totalSavings)}</div>
        <div style="font-size:11px;color:#34d399;margin-top:4px;">${fmtCurrency(monthlySavings)}/mo x ${term} months</div>
      </div>
    </div>
  `;
}

// ── Event Handlers ─────────────────────────────────────────────────────────────

function gatherFilters(): SearchFilters {
  const offerType = (document.getElementById("offerTypeSelect") as HTMLSelectElement)?.value as any || "all";
  const maxMonthly = parseFloat((document.getElementById("maxMonthlyInput") as HTMLInputElement)?.value) || 500;
  const minCashback = parseFloat((document.getElementById("minCashbackInput") as HTMLInputElement)?.value) || 0;
  const zip = (document.getElementById("zipInput") as HTMLInputElement)?.value || "90210";
  const makes = makeCheckboxes.filter(cb => cb.checked).map(cb => cb.value);
  return { offerType, maxMonthly, minCashback, makes, zip };
}

async function doSearch() {
  searchBtn.textContent = "Searching...";
  searchBtn.style.background = "#1e40af";

  currentFilters = gatherFilters();
  apiError = null;

  const mode = _detectAppMode();
  if (mode === "mcp" || mode === "live") {
    try {
      const toolResult = await _callTool("find-incentive-deals", {
        offer_type: currentFilters.offerType === "all" ? undefined : currentFilters.offerType,
        max_monthly_payment: currentFilters.maxMonthly,
        min_cashback: currentFilters.minCashback,
        makes: currentFilters.makes.length > 0 ? currentFilters.makes.join(",") : undefined,
        zip: currentFilters.zip,
      });
      if (toolResult?.content?.[0]?.text) {
        const parsed = JSON.parse(toolResult.content[0].text);
        const offers = parseOffersFromResponse(parsed);
        if (offers.length > 0) {
          allOffers = offers;
          filteredOffers = filterOffers(allOffers, currentFilters);
          renderAll();
          searchBtn.textContent = "Search Incentives";
          searchBtn.style.background = "#3b82f6";
          return;
        }
      }
      // Live mode with a key but got nothing back — surface this instead of silently showing mock.
      if (mode === "live") {
        apiError = {
          kind: "empty",
          message: "The incentives API returned no offers for the requested filters. This can happen if your key lacks access to the /v2/search/car/incentive/oem endpoint, or the endpoint returned an empty listings array.",
        };
      }
    } catch (e) {
      if (mode === "live") {
        apiError = {
          kind: "threw",
          message: `Live API call failed: ${(e as Error)?.message || "unknown error"}.`,
        };
      }
    }
  }

  allOffers = generateMockOffers();
  filteredOffers = filterOffers(allOffers, currentFilters);
  renderAll();

  searchBtn.textContent = "Search Incentives";
  searchBtn.style.background = "#3b82f6";
}

searchBtn.addEventListener("click", doSearch);

clearBtn.addEventListener("click", () => {
  (document.getElementById("offerTypeSelect") as HTMLSelectElement).value = "all";
  (document.getElementById("maxMonthlyInput") as HTMLInputElement).value = "500";
  (document.getElementById("minCashbackInput") as HTMLInputElement).value = "0";
  (document.getElementById("zipInput") as HTMLInputElement).value = "90210";
  makeCheckboxes.forEach(cb => { cb.checked = false; });
  currentFilters = { offerType: "all", maxMonthly: 500, minCashback: 0, makes: [], zip: "90210" };
  filteredOffers = allOffers;
  renderAll();
});

calcBtn.addEventListener("click", calculateSavings);

// Resize handler for canvas
window.addEventListener("resize", () => {
  renderCharts();
});

// ── Initial Load ───────────────────────────────────────────────────────────────

(async function init() {
  const params = _getUrlParams();
  if (params.zip) {
    (document.getElementById("zipInput") as HTMLInputElement).value = params.zip;
  }
  if (params.offer_type && ["all", "cashback", "apr", "lease"].includes(params.offer_type)) {
    (document.getElementById("offerTypeSelect") as HTMLSelectElement).value = params.offer_type;
  }
  if (params.max_monthly && !isNaN(+params.max_monthly)) {
    (document.getElementById("maxMonthlyInput") as HTMLInputElement).value = params.max_monthly;
  }
  if (params.min_cashback && !isNaN(+params.min_cashback)) {
    (document.getElementById("minCashbackInput") as HTMLInputElement).value = params.min_cashback;
  }
  if (params.make) {
    const makeNames = params.make.split(",").map(m => m.trim().toLowerCase());
    makeCheckboxes.forEach(cb => {
      if (makeNames.includes(cb.value.toLowerCase())) cb.checked = true;
    });
  }

  await doSearch();
})();
