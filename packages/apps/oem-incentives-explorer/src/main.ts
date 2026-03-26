/**
 * OEM Incentives Explorer
 * MCP App 24 — Dark-themed incentive search, comparison, and savings calculator
 */
import { App } from "@modelcontextprotocol/ext-apps";

const _safeApp = (() => { try { return new App({ name: "oem-incentives-explorer" });

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

type IncentiveType = "CASH_BACK" | "LOW_APR" | "LEASE_SPECIAL" | "LOYALTY" | "CONQUEST";

interface Incentive {
  id: string;
  make: string;
  type: IncentiveType;
  title: string;
  description: string;
  amount: number;          // dollar amount for cash back, rate for APR, monthly for lease
  amountDisplay: string;   // formatted display string
  eligibleModels: string[];
  expirationDate: string;  // ISO date
  stackable: boolean;
  finePrint: string;
}

interface IncentiveResult {
  make: string;
  incentives: Incentive[];
}

interface SearchResult {
  results: IncentiveResult[];
  zip: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TOP_20_MAKES = [
  "Acura", "BMW", "Buick", "Cadillac", "Chevrolet",
  "Chrysler", "Dodge", "Ford", "GMC", "Honda",
  "Hyundai", "Jeep", "Kia", "Lexus", "Mazda",
  "Mercedes-Benz", "Nissan", "Ram", "Subaru", "Toyota",
];

const MODELS_BY_MAKE: Record<string, string[]> = {
  Toyota: ["Camry", "Corolla", "RAV4", "Highlander", "Tacoma", "Tundra", "4Runner", "Prius", "GR86", "Crown"],
  Honda: ["Civic", "Accord", "CR-V", "HR-V", "Pilot", "Passport", "Ridgeline", "Odyssey"],
  Hyundai: ["Elantra", "Sonata", "Tucson", "Santa Fe", "Palisade", "Kona", "Ioniq 5", "Ioniq 6"],
  Ford: ["F-150", "Mustang", "Explorer", "Escape", "Bronco", "Edge", "Maverick", "Ranger"],
  Chevrolet: ["Silverado", "Equinox", "Traverse", "Tahoe", "Camaro", "Blazer", "Trax", "Colorado"],
  BMW: ["3 Series", "5 Series", "X3", "X5", "X1", "4 Series", "7 Series", "iX"],
  "Mercedes-Benz": ["C-Class", "E-Class", "GLC", "GLE", "A-Class", "S-Class", "GLA"],
  Nissan: ["Altima", "Sentra", "Rogue", "Pathfinder", "Frontier", "Kicks", "Ariya"],
  Subaru: ["Outback", "Forester", "Crosstrek", "Impreza", "WRX", "Ascent", "BRZ"],
  Kia: ["Forte", "K5", "Sportage", "Telluride", "Seltos", "Sorento", "EV6", "EV9"],
  Jeep: ["Wrangler", "Grand Cherokee", "Cherokee", "Compass", "Gladiator", "Renegade"],
  Dodge: ["Charger", "Durango", "Hornet"],
  Ram: ["1500", "2500", "3500"],
  GMC: ["Sierra", "Terrain", "Acadia", "Yukon", "Canyon"],
  Lexus: ["RX", "NX", "ES", "IS", "GX", "TX", "UX"],
  Mazda: ["CX-5", "CX-50", "CX-90", "Mazda3", "MX-5 Miata"],
  Acura: ["Integra", "TLX", "MDX", "RDX"],
  Buick: ["Encore GX", "Envision", "Enclave", "Envista"],
  Cadillac: ["Escalade", "XT4", "XT5", "XT6", "CT5", "Lyriq"],
  Chrysler: ["Pacifica", "300"],
};

const TYPE_CONFIG: Record<IncentiveType, { label: string; color: string; bg: string }> = {
  CASH_BACK:     { label: "CASH BACK",     color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
  LOW_APR:       { label: "LOW APR",        color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
  LEASE_SPECIAL: { label: "LEASE SPECIAL",  color: "#a855f7", bg: "rgba(168,85,247,0.15)" },
  LOYALTY:       { label: "LOYALTY",        color: "#f97316", bg: "rgba(249,115,22,0.15)" },
  CONQUEST:      { label: "CONQUEST",       color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
};

// ── Mock Data ──────────────────────────────────────────────────────────────────

function getMockIncentives(make: string, _model?: string): Incentive[] {
  const makeData: Record<string, Incentive[]> = {
    Toyota: [
      {
        id: "toy-1", make: "Toyota", type: "CASH_BACK",
        title: "Spring Sales Event Cash Back",
        description: "Customer cash back on select 2025 and 2026 models during the Spring Sales Event.",
        amount: 2000, amountDisplay: "$2,000 Cash Back",
        eligibleModels: ["Camry", "Corolla", "Crown"],
        expirationDate: "2026-04-30", stackable: true,
        finePrint: "Must take new retail delivery from dealer stock by 04/30/2026. Not compatible with special APR offer on Camry Hybrid. See dealer for complete details.",
      },
      {
        id: "toy-2", make: "Toyota", type: "LOW_APR",
        title: "Low APR Financing on RAV4",
        description: "Special 1.9% APR financing for up to 60 months on new 2025-2026 RAV4 models.",
        amount: 1.9, amountDisplay: "1.9% APR for 60 months",
        eligibleModels: ["RAV4"],
        expirationDate: "2026-04-15", stackable: false,
        finePrint: "1.9% Annual Percentage Rate (APR) for 60 months on new 2025-2026 RAV4. $17.48 per month per $1,000 financed. Must be approved through Toyota Financial Services. Not all buyers will qualify. See dealer for details.",
      },
      {
        id: "toy-3", make: "Toyota", type: "LEASE_SPECIAL",
        title: "Highlander Lease Special",
        description: "Lease a new 2026 Highlander XLE for an incredible monthly rate.",
        amount: 349, amountDisplay: "$349/mo for 36 months",
        eligibleModels: ["Highlander"],
        expirationDate: "2026-04-30", stackable: false,
        finePrint: "$349/month for 36 months. $3,499 due at signing. Includes $500 TFS subvention cash. 10,000 miles per year. $0.25/mile over. Security deposit waived. Tax, title, license extra. Tier 1+ credit.",
      },
      {
        id: "toy-4", make: "Toyota", type: "LOYALTY",
        title: "Toyota Owner Loyalty Cash",
        description: "Current Toyota owners or lessees get additional cash toward a new Toyota.",
        amount: 750, amountDisplay: "$750 Loyalty Cash",
        eligibleModels: ["Camry", "Corolla", "RAV4", "Highlander", "Tacoma", "Tundra", "4Runner", "Prius", "Crown"],
        expirationDate: "2026-06-30", stackable: true,
        finePrint: "Must currently own or lease a Toyota vehicle. Proof of ownership required. Can be combined with most other offers. Not available on TRD Pro models.",
      },
      {
        id: "toy-5", make: "Toyota", type: "CONQUEST",
        title: "Competitive Owner Bonus Cash",
        description: "Own a competing brand? Get bonus cash when you switch to Toyota.",
        amount: 1000, amountDisplay: "$1,000 Conquest Cash",
        eligibleModels: ["Camry", "RAV4", "Highlander", "Tundra"],
        expirationDate: "2026-05-31", stackable: true,
        finePrint: "Must currently own or lease a non-Toyota vehicle (1 year minimum). Proof of ownership/registration required. Cannot be combined with Loyalty Cash. Available on select models only.",
      },
      {
        id: "toy-6", make: "Toyota", type: "CASH_BACK",
        title: "Tacoma Cash Allowance",
        description: "Factory cash allowance on all new 2025 Tacoma models.",
        amount: 1500, amountDisplay: "$1,500 Cash Back",
        eligibleModels: ["Tacoma"],
        expirationDate: "2026-04-15", stackable: true,
        finePrint: "Available on new 2025 Tacoma SR, SR5, and TRD Sport. Not available on TRD Off-Road, TRD Pro, or Limited. Must take delivery from dealer stock.",
      },
      {
        id: "toy-7", make: "Toyota", type: "LOW_APR",
        title: "Prius 0% APR Event",
        description: "0% APR for 48 months on all new Prius and Prius Prime models.",
        amount: 0.0, amountDisplay: "0% APR for 48 months",
        eligibleModels: ["Prius"],
        expirationDate: "2026-04-30", stackable: false,
        finePrint: "0% Annual Percentage Rate for 48 months. $20.83 per month per $1,000 financed. Offer through Toyota Financial Services. Tier 1+ credit required.",
      },
      {
        id: "toy-8", make: "Toyota", type: "LEASE_SPECIAL",
        title: "Camry Lease Deal",
        description: "Lease a new 2026 Camry SE for an affordable monthly payment.",
        amount: 279, amountDisplay: "$279/mo for 36 months",
        eligibleModels: ["Camry"],
        expirationDate: "2026-04-30", stackable: false,
        finePrint: "$279/month for 36 months. $2,999 due at signing. 10,000 miles/year allowance. $0.25/mile overage. Tax, title, license, fees extra. Tier 1+ credit through TFS.",
      },
      {
        id: "toy-9", make: "Toyota", type: "CASH_BACK",
        title: "4Runner Adventure Bonus",
        description: "Bonus cash on the rugged 2026 4Runner.",
        amount: 1250, amountDisplay: "$1,250 Cash Back",
        eligibleModels: ["4Runner"],
        expirationDate: "2026-05-15", stackable: true,
        finePrint: "Available on new 2026 4Runner SR5 and Limited models. Not available on TRD Pro or Trailhunter. Dealer participation may vary.",
      },
      {
        id: "toy-10", make: "Toyota", type: "LOW_APR",
        title: "Tundra Low Rate Financing",
        description: "Special 2.9% APR for 72 months on the full-size Tundra.",
        amount: 2.9, amountDisplay: "2.9% APR for 72 months",
        eligibleModels: ["Tundra"],
        expirationDate: "2026-05-31", stackable: false,
        finePrint: "2.9% APR for 72 months on new 2025-2026 Tundra. $15.19 per month per $1,000 financed. TFS approval required.",
      },
    ],
    Honda: [
      {
        id: "hon-1", make: "Honda", type: "CASH_BACK",
        title: "Civic Cash Incentive",
        description: "Factory cash back on new 2025-2026 Civic models.",
        amount: 1500, amountDisplay: "$1,500 Cash Back",
        eligibleModels: ["Civic"],
        expirationDate: "2026-04-30", stackable: true,
        finePrint: "Available on new 2025-2026 Civic Sedan and Hatchback. Must take retail delivery by offer end date.",
      },
      {
        id: "hon-2", make: "Honda", type: "LOW_APR",
        title: "CR-V Special APR",
        description: "2.9% APR for 60 months on the popular CR-V.",
        amount: 2.9, amountDisplay: "2.9% APR for 60 months",
        eligibleModels: ["CR-V"],
        expirationDate: "2026-04-15", stackable: false,
        finePrint: "2.9% APR for 60 months through Honda Financial Services. Tier 1 credit required. Not all buyers qualify.",
      },
      {
        id: "hon-3", make: "Honda", type: "LEASE_SPECIAL",
        title: "Accord Lease Offer",
        description: "Lease a new 2026 Accord Sport for a competitive monthly payment.",
        amount: 299, amountDisplay: "$299/mo for 36 months",
        eligibleModels: ["Accord"],
        expirationDate: "2026-04-30", stackable: false,
        finePrint: "$299/month for 36 months. $3,299 due at signing. 10,000 miles/year. Tax, title, license extra.",
      },
      {
        id: "hon-4", make: "Honda", type: "LOYALTY",
        title: "Honda Loyalty Appreciation",
        description: "Returning Honda customers get bonus cash.",
        amount: 500, amountDisplay: "$500 Loyalty Cash",
        eligibleModels: ["Civic", "Accord", "CR-V", "HR-V", "Pilot", "Passport", "Ridgeline"],
        expirationDate: "2026-06-30", stackable: true,
        finePrint: "Must currently own or lease a Honda vehicle. Proof of ownership required.",
      },
      {
        id: "hon-5", make: "Honda", type: "CASH_BACK",
        title: "Pilot Family Bonus",
        description: "Cash back on the family-friendly Pilot.",
        amount: 2500, amountDisplay: "$2,500 Cash Back",
        eligibleModels: ["Pilot"],
        expirationDate: "2026-05-15", stackable: true,
        finePrint: "Available on new 2025 Pilot Sport, EX-L, and Touring trims. Not valid on Black Edition.",
      },
      {
        id: "hon-6", make: "Honda", type: "CONQUEST",
        title: "Competitive Switch Bonus",
        description: "Switch from a competing brand to Honda and save.",
        amount: 750, amountDisplay: "$750 Conquest Cash",
        eligibleModels: ["Accord", "CR-V", "Pilot"],
        expirationDate: "2026-05-31", stackable: true,
        finePrint: "Must currently own or lease a non-Honda vehicle. Cannot combine with Loyalty Cash.",
      },
    ],
    Hyundai: [
      {
        id: "hyu-1", make: "Hyundai", type: "CASH_BACK",
        title: "Tucson Spring Savings",
        description: "Cash back on the versatile 2025-2026 Tucson.",
        amount: 2000, amountDisplay: "$2,000 Cash Back",
        eligibleModels: ["Tucson"],
        expirationDate: "2026-04-30", stackable: true,
        finePrint: "On select 2025-2026 Tucson models. Must take delivery from dealer stock.",
      },
      {
        id: "hyu-2", make: "Hyundai", type: "LOW_APR",
        title: "Sonata 0.9% APR Special",
        description: "Ultra-low 0.9% APR financing on the refined Sonata.",
        amount: 0.9, amountDisplay: "0.9% APR for 60 months",
        eligibleModels: ["Sonata"],
        expirationDate: "2026-04-15", stackable: false,
        finePrint: "0.9% APR for 60 months through Hyundai Motor Finance. $17.05 per $1,000 financed. Well-qualified buyers only.",
      },
      {
        id: "hyu-3", make: "Hyundai", type: "LEASE_SPECIAL",
        title: "Elantra Lease Event",
        description: "Lease a new 2026 Elantra SEL starting at a low monthly rate.",
        amount: 229, amountDisplay: "$229/mo for 36 months",
        eligibleModels: ["Elantra"],
        expirationDate: "2026-04-30", stackable: false,
        finePrint: "$229/month for 36 months. $2,499 due at signing. 10,000 miles/year. Tax, title, license extra.",
      },
      {
        id: "hyu-4", make: "Hyundai", type: "LOYALTY",
        title: "Hyundai Owner Bonus",
        description: "Current Hyundai owners receive additional savings.",
        amount: 1000, amountDisplay: "$1,000 Loyalty Cash",
        eligibleModels: ["Elantra", "Sonata", "Tucson", "Santa Fe", "Palisade", "Kona", "Ioniq 5", "Ioniq 6"],
        expirationDate: "2026-06-30", stackable: true,
        finePrint: "Must currently own or lease a Hyundai vehicle. Proof of current registration required.",
      },
      {
        id: "hyu-5", make: "Hyundai", type: "CASH_BACK",
        title: "Palisade Premium Bonus",
        description: "Generous cash back on the flagship Palisade SUV.",
        amount: 3000, amountDisplay: "$3,000 Cash Back",
        eligibleModels: ["Palisade"],
        expirationDate: "2026-05-15", stackable: true,
        finePrint: "Available on 2025 Palisade SEL, XRT, and Limited. Not available on Calligraphy.",
      },
      {
        id: "hyu-6", make: "Hyundai", type: "LOW_APR",
        title: "Ioniq 5 EV Rate Special",
        description: "Special low rate on the award-winning Ioniq 5 electric SUV.",
        amount: 1.9, amountDisplay: "1.9% APR for 60 months",
        eligibleModels: ["Ioniq 5"],
        expirationDate: "2026-05-31", stackable: false,
        finePrint: "1.9% APR for 60 months through Hyundai Motor Finance. May be combined with federal EV tax credit where applicable.",
      },
      {
        id: "hyu-7", make: "Hyundai", type: "CONQUEST",
        title: "Brand Switch Savings",
        description: "Trading in from another brand? Extra cash when you go Hyundai.",
        amount: 1500, amountDisplay: "$1,500 Conquest Cash",
        eligibleModels: ["Tucson", "Santa Fe", "Palisade", "Ioniq 5"],
        expirationDate: "2026-05-31", stackable: true,
        finePrint: "Must own or lease a non-Hyundai/Kia/Genesis vehicle. Trade-in not required but proof of ownership is.",
      },
    ],
  };
  let incentives = makeData[make] || [];
  if (_model) {
    incentives = incentives.filter(inc => inc.eligibleModels.includes(_model));
  }
  return incentives;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr);
  const diff = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function formatCurrency(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const CSS = `
:root {
  --bg: #0f172a;
  --surface: #1e293b;
  --surface2: #334155;
  --border: #475569;
  --text: #f1f5f9;
  --text-muted: #94a3b8;
  --accent: #3b82f6;
  --accent-hover: #2563eb;
  --green: #22c55e;
  --red: #ef4444;
  --orange: #f97316;
  --purple: #a855f7;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
}
.app-header {
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  border-bottom: 1px solid var(--border);
  padding: 20px 24px;
}
.app-header h1 {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.3px;
}
.app-header h1 span { color: var(--accent); }
.app-header p { color: var(--text-muted); font-size: 13px; margin-top: 4px; }

/* Search Bar */
.search-section {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 16px 24px;
}
.search-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  flex-wrap: wrap;
}
.field-group { display: flex; flex-direction: column; gap: 4px; }
.field-group label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}
select, input[type="text"] {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 14px;
  min-width: 140px;
  outline: none;
  transition: border-color 0.2s;
}
select:focus, input[type="text"]:focus { border-color: var(--accent); }
.btn-primary {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
  height: 37px;
}
.btn-primary:hover { background: var(--accent-hover); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.compare-section {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.compare-section span {
  font-size: 13px;
  color: var(--text-muted);
  font-weight: 500;
}
.compare-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--surface2);
  border-radius: 16px;
  padding: 4px 12px 4px 14px;
  font-size: 13px;
}
.compare-tag .remove-compare {
  cursor: pointer;
  color: var(--text-muted);
  font-size: 16px;
  line-height: 1;
  transition: color 0.15s;
}
.compare-tag .remove-compare:hover { color: var(--red); }
.btn-add-compare {
  background: transparent;
  color: var(--accent);
  border: 1px dashed var(--accent);
  border-radius: 16px;
  padding: 4px 14px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-add-compare:hover { background: rgba(59,130,246,0.1); }
.btn-add-compare:disabled { opacity: 0.4; cursor: not-allowed; }

/* Main Layout */
.main-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 0;
  min-height: calc(100vh - 160px);
}
.content-area { padding: 20px 24px; overflow-y: auto; }
.sidebar {
  background: var(--surface);
  border-left: 1px solid var(--border);
  padding: 20px;
  overflow-y: auto;
}

/* Section Headers */
.section-header {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-header .icon { font-size: 18px; }

/* Incentive Cards Grid */
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}
.incentive-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  transition: border-color 0.2s, transform 0.15s;
}
.incentive-card:hover { border-color: var(--accent); transform: translateY(-1px); }
.card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.type-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.stackable-badge {
  font-size: 11px;
  color: var(--green);
  display: flex;
  align-items: center;
  gap: 4px;
}
.card-title { font-size: 15px; font-weight: 600; margin-bottom: 6px; }
.card-description { font-size: 13px; color: var(--text-muted); margin-bottom: 12px; line-height: 1.4; }
.card-amount {
  font-size: 24px;
  font-weight: 800;
  margin-bottom: 12px;
  letter-spacing: -0.5px;
}
.card-models {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.model-chip {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 2px 10px;
  font-size: 12px;
  color: var(--text-muted);
}
.card-expiry {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
.expiry-countdown {
  font-weight: 600;
}
.expiry-countdown.urgent { color: var(--red); }
.expiry-countdown.soon { color: var(--orange); }
.fine-print-toggle {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 0;
  transition: color 0.15s;
}
.fine-print-toggle:hover { color: var(--accent-hover); text-decoration: underline; }
.fine-print {
  display: none;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.5;
  margin-top: 8px;
  padding: 10px;
  background: var(--bg);
  border-radius: 6px;
}
.fine-print.expanded { display: block; }

/* Comparison Table */
.comparison-section { margin-top: 8px; }
.comparison-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  margin-bottom: 32px;
}
.comparison-table th {
  text-align: left;
  padding: 10px 12px;
  background: var(--surface2);
  border-bottom: 2px solid var(--border);
  font-weight: 700;
  font-size: 13px;
}
.comparison-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
.comparison-table tr:hover td { background: rgba(59,130,246,0.04); }
.comp-cell-best { font-weight: 700; }
.comp-cell-value { font-size: 14px; font-weight: 600; }
.comp-cell-detail { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.comp-cell-none { color: var(--text-muted); font-style: italic; }

/* Sidebar - Calculator */
.calc-section { margin-bottom: 20px; }
.calc-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.calc-input {
  width: 100%;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 14px;
  outline: none;
  margin-bottom: 12px;
}
.calc-input:focus { border-color: var(--accent); }
.incentive-checks { margin-bottom: 16px; }
.incentive-check-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  cursor: pointer;
}
.incentive-check-item input[type="checkbox"] {
  accent-color: var(--accent);
  width: 16px;
  height: 16px;
}
.incentive-check-item .check-amount {
  margin-left: auto;
  font-weight: 600;
  font-size: 12px;
}
.calc-divider {
  border: none;
  border-top: 1px solid var(--border);
  margin: 16px 0;
}
.calc-summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  font-size: 14px;
}
.calc-summary-row.total {
  font-size: 16px;
  font-weight: 700;
  padding: 10px 0;
}
.calc-summary-row .label { color: var(--text-muted); }
.calc-summary-row .value { font-weight: 600; }
.calc-summary-row .value.savings { color: var(--green); }
.calc-monthly {
  background: var(--bg);
  border-radius: 8px;
  padding: 14px;
  margin-top: 12px;
  text-align: center;
}
.calc-monthly .monthly-label { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
.calc-monthly .monthly-value { font-size: 28px; font-weight: 800; color: var(--accent); }
.calc-monthly .monthly-detail { font-size: 11px; color: var(--text-muted); margin-top: 4px; }

/* Empty/Loading States */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}
.empty-state .icon { font-size: 48px; margin-bottom: 16px; }
.empty-state h3 { font-size: 18px; margin-bottom: 8px; color: var(--text); }
.empty-state p { font-size: 14px; line-height: 1.5; }
.loading-spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 3px solid var(--surface2);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Make header in cards */
.make-group-header {
  font-size: 18px;
  font-weight: 700;
  margin: 24px 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid var(--accent);
  display: flex;
  align-items: center;
  gap: 8px;
}
.make-group-header:first-child { margin-top: 0; }
.incentive-count-badge {
  background: var(--accent);
  color: #fff;
  border-radius: 10px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 600;
}

/* Responsive */
@media (max-width: 900px) {
  .main-layout { grid-template-columns: 1fr; }
  .sidebar { border-left: none; border-top: 1px solid var(--border); }
  .cards-grid { grid-template-columns: 1fr; }
}
`;

// ── App Init ───────────────────────────────────────────────────────────────────


// State
let currentResults: SearchResult | null = null;
let selectedMake = "";
let selectedModel = "";
let zipCode = "";
let compareMakes: string[] = [];
let selectedIncentiveIds: Set<string> = new Set();
let calcMsrp = 35000;
let isLoading = false;

// ── Render ─────────────────────────────────────────────────────────────────────

function render(): void {
  const root = document.getElementById("app-root")!;

  const modelOptions = selectedMake && MODELS_BY_MAKE[selectedMake]
    ? MODELS_BY_MAKE[selectedMake].map(m => `<option value="${escapeHtml(m)}"${m === selectedModel ? " selected" : ""}>${escapeHtml(m)}</option>`).join("")
    : "";

  const compareTags = compareMakes.map((cm, i) =>
    `<span class="compare-tag">${escapeHtml(cm)}<span class="remove-compare" data-idx="${i}">&times;</span></span>`
  ).join("");

  const canAddCompare = compareMakes.length < 2;

  root.innerHTML = `
    <style>${CSS}</style>
    <div class="app-header">
      <h1><span>OEM Incentives</span> Explorer</h1>
      <p>Discover manufacturer incentives, compare brands, and calculate your savings</p>
    </div>

    <div class="search-section">
      <div class="search-row">
        <div class="field-group">
          <label>Make</label>
          <select id="sel-make">
            <option value="">Select Make</option>
            ${TOP_20_MAKES.map(m => `<option value="${m}"${m === selectedMake ? " selected" : ""}>${m}</option>`).join("")}
          </select>
        </div>
        <div class="field-group">
          <label>Model (optional)</label>
          <select id="sel-model"${!selectedMake ? " disabled" : ""}>
            <option value="">All Models</option>
            ${modelOptions}
          </select>
        </div>
        <div class="field-group">
          <label>ZIP Code</label>
          <input type="text" id="inp-zip" placeholder="e.g. 90210" maxlength="5" value="${escapeHtml(zipCode)}" style="width:100px;" />
        </div>
        <button class="btn-primary" id="btn-search"${!selectedMake ? " disabled" : ""}>
          ${isLoading ? '<span class="loading-spinner"></span>' : "Search Incentives"}
        </button>
      </div>
      <div class="compare-section">
        <span>Compare with:</span>
        ${compareTags}
        ${canAddCompare ? `
          <select id="sel-add-compare" class="btn-add-compare" style="appearance:none;-webkit-appearance:none;">
            <option value="">+ Add Brand</option>
            ${TOP_20_MAKES.filter(m => m !== selectedMake && !compareMakes.includes(m)).map(m => `<option value="${m}">${m}</option>`).join("")}
          </select>
        ` : ""}
      </div>
    </div>

    <div class="main-layout">
      <div class="content-area" id="content-area">
        ${renderContent()}
      </div>
      <div class="sidebar" id="sidebar">
        ${renderSidebar()}
      </div>
    </div>
  `;

  bindEvents();
}

function renderContent(): string {
  if (!currentResults) {
    return `
      <div class="empty-state">
        <div class="icon">&#128269;</div>
        <h3>Search for OEM Incentives</h3>
        <p>Select a make and optionally a model and ZIP code, then click "Search Incentives" to discover current manufacturer offers, rebates, and financing deals.</p>
      </div>
    `;
  }

  let html = "";

  // Incentive cards grouped by make
  for (const result of currentResults.results) {
    if (result.incentives.length === 0) continue;

    html += `<div class="make-group-header">${escapeHtml(result.make)} <span class="incentive-count-badge">${result.incentives.length} offers</span></div>`;
    html += `<div class="cards-grid">`;

    for (const inc of result.incentives) {
      const tc = TYPE_CONFIG[inc.type];
      const days = daysUntil(inc.expirationDate);
      let urgencyClass = "";
      if (days <= 7) urgencyClass = "urgent";
      else if (days <= 21) urgencyClass = "soon";

      html += `
        <div class="incentive-card" data-id="${inc.id}">
          <div class="card-top">
            <span class="type-badge" style="color:${tc.color};background:${tc.bg}">${tc.label}</span>
            ${inc.stackable ? `<span class="stackable-badge">&#10003; Stackable</span>` : ""}
          </div>
          <div class="card-title">${escapeHtml(inc.title)}</div>
          <div class="card-description">${escapeHtml(inc.description)}</div>
          <div class="card-amount" style="color:${tc.color}">${escapeHtml(inc.amountDisplay)}</div>
          <div class="card-models">
            ${inc.eligibleModels.map(m => `<span class="model-chip">${escapeHtml(m)}</span>`).join("")}
          </div>
          <div class="card-expiry">
            <span>Expires ${inc.expirationDate}</span>
            <span class="expiry-countdown ${urgencyClass}">${days === 0 ? "Expired" : days + " days left"}</span>
          </div>
          <button class="fine-print-toggle" data-fp="${inc.id}">Show fine print &#9662;</button>
          <div class="fine-print" id="fp-${inc.id}">${escapeHtml(inc.finePrint)}</div>
        </div>
      `;
    }
    html += `</div>`;
  }

  // Comparison table if multiple makes
  if (currentResults.results.length > 1) {
    html += renderComparisonTable(currentResults.results);
  }

  return html;
}

function renderComparisonTable(results: IncentiveResult[]): string {
  const types: IncentiveType[] = ["CASH_BACK", "LOW_APR", "LEASE_SPECIAL", "LOYALTY", "CONQUEST"];
  const makes = results.map(r => r.make);

  let html = `
    <div class="comparison-section">
      <div class="section-header"><span class="icon">&#9878;</span> Brand Comparison</div>
      <table class="comparison-table">
        <thead>
          <tr>
            <th>Incentive Type</th>
            ${makes.map(m => `<th>${escapeHtml(m)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
  `;

  for (const t of types) {
    const tc = TYPE_CONFIG[t];
    html += `<tr><td><span class="type-badge" style="color:${tc.color};background:${tc.bg};font-size:10px;">${tc.label}</span></td>`;

    // Find best offer per type per make
    const offers: { make: string; best: Incentive | null }[] = makes.map(m => {
      const makeResult = results.find(r => r.make === m);
      const typeIncentives = makeResult?.incentives.filter(inc => inc.type === t) || [];
      if (typeIncentives.length === 0) return { make: m, best: null };

      // For cash back / loyalty / conquest, pick highest amount
      // For APR, pick lowest rate
      // For lease, pick lowest monthly
      let best: Incentive;
      if (t === "LOW_APR") {
        best = typeIncentives.reduce((a, b) => a.amount < b.amount ? a : b);
      } else if (t === "LEASE_SPECIAL") {
        best = typeIncentives.reduce((a, b) => a.amount < b.amount ? a : b);
      } else {
        best = typeIncentives.reduce((a, b) => a.amount > b.amount ? a : b);
      }
      return { make: m, best };
    });

    // Determine which is the best across brands
    const nonNull = offers.filter(o => o.best !== null);
    let bestMake = "";
    if (nonNull.length > 0) {
      if (t === "LOW_APR" || t === "LEASE_SPECIAL") {
        bestMake = nonNull.reduce((a, b) => a.best!.amount < b.best!.amount ? a : b).make;
      } else {
        bestMake = nonNull.reduce((a, b) => a.best!.amount > b.best!.amount ? a : b).make;
      }
    }

    for (const o of offers) {
      if (!o.best) {
        html += `<td><span class="comp-cell-none">No offer</span></td>`;
      } else {
        const isBest = o.make === bestMake && nonNull.length > 1;
        html += `<td class="${isBest ? "comp-cell-best" : ""}">
          <div class="comp-cell-value">${escapeHtml(o.best.amountDisplay)}</div>
          <div class="comp-cell-detail">${escapeHtml(o.best.title)}${isBest ? " &#9733;" : ""}</div>
        </td>`;
      }
    }

    html += `</tr>`;
  }

  html += `</tbody></table></div>`;
  return html;
}

function renderSidebar(): string {
  if (!currentResults || currentResults.results.length === 0) {
    return `
      <div class="section-header"><span class="icon">&#128178;</span> Savings Calculator</div>
      <p style="font-size:13px;color:var(--text-muted);">Search for incentives to use the savings calculator.</p>
    `;
  }

  // Gather all stackable cash-type incentives for calculator
  const allIncentives: Incentive[] = [];
  for (const r of currentResults.results) {
    for (const inc of r.incentives) {
      if (inc.type === "CASH_BACK" || inc.type === "LOYALTY" || inc.type === "CONQUEST") {
        allIncentives.push(inc);
      }
    }
  }

  // Find best APR available
  let bestApr = 5.9; // default
  let bestAprLabel = "5.9% (market average)";
  for (const r of currentResults.results) {
    for (const inc of r.incentives) {
      if (inc.type === "LOW_APR" && inc.amount < bestApr) {
        bestApr = inc.amount;
        bestAprLabel = `${inc.amount}% (${inc.make} offer)`;
      }
    }
  }

  const totalSavings = allIncentives
    .filter(inc => selectedIncentiveIds.has(inc.id))
    .reduce((sum, inc) => sum + inc.amount, 0);

  const effectivePrice = calcMsrp - totalSavings;
  const termMonths = 60;
  const monthlyRate = bestApr / 100 / 12;
  const monthlyPayment = monthlyRate > 0
    ? (effectivePrice * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths))
    : effectivePrice / termMonths;

  const checkboxes = allIncentives.map(inc => {
    const checked = selectedIncentiveIds.has(inc.id) ? "checked" : "";
    return `
      <label class="incentive-check-item">
        <input type="checkbox" data-inc-id="${inc.id}" ${checked} />
        <span>${escapeHtml(inc.title)} <span style="font-size:11px;color:var(--text-muted)">(${escapeHtml(inc.make)})</span></span>
        <span class="check-amount" style="color:var(--green)">-${formatCurrency(inc.amount)}</span>
      </label>
    `;
  }).join("");

  return `
    <div class="section-header"><span class="icon">&#128178;</span> Savings Calculator</div>

    <div class="calc-section">
      <div class="calc-label">Vehicle MSRP</div>
      <input type="text" class="calc-input" id="calc-msrp" value="${formatCurrency(calcMsrp)}" />
    </div>

    <div class="calc-section">
      <div class="calc-label">Apply Incentives</div>
      <div class="incentive-checks" id="incentive-checks">
        ${allIncentives.length > 0 ? checkboxes : '<p style="font-size:12px;color:var(--text-muted)">No stackable cash incentives found.</p>'}
      </div>
    </div>

    <hr class="calc-divider" />

    <div class="calc-summary-row">
      <span class="label">MSRP</span>
      <span class="value">${formatCurrency(calcMsrp)}</span>
    </div>
    <div class="calc-summary-row">
      <span class="label">Incentive Savings</span>
      <span class="value savings">${totalSavings > 0 ? "-" + formatCurrency(totalSavings) : "$0"}</span>
    </div>
    <hr class="calc-divider" />
    <div class="calc-summary-row total">
      <span class="label">Effective Price</span>
      <span class="value">${formatCurrency(effectivePrice)}</span>
    </div>

    <div class="calc-monthly">
      <div class="monthly-label">Est. Monthly Payment</div>
      <div class="monthly-value">${formatCurrency(Math.round(monthlyPayment))}</div>
      <div class="monthly-detail">${termMonths} months at ${bestAprLabel}</div>
    </div>
  `;
}

// ── Events ─────────────────────────────────────────────────────────────────────

function bindEvents(): void {
  // Make select
  document.getElementById("sel-make")?.addEventListener("change", (e) => {
    selectedMake = (e.target as HTMLSelectElement).value;
    selectedModel = "";
    render();
  });

  // Model select
  document.getElementById("sel-model")?.addEventListener("change", (e) => {
    selectedModel = (e.target as HTMLSelectElement).value;
  });

  // ZIP input
  document.getElementById("inp-zip")?.addEventListener("input", (e) => {
    zipCode = (e.target as HTMLInputElement).value.replace(/\D/g, "").slice(0, 5);
    (e.target as HTMLInputElement).value = zipCode;
  });

  // Search button
  document.getElementById("btn-search")?.addEventListener("click", doSearch);

  // Add compare
  document.getElementById("sel-add-compare")?.addEventListener("change", (e) => {
    const val = (e.target as HTMLSelectElement).value;
    if (val && compareMakes.length < 2 && !compareMakes.includes(val)) {
      compareMakes.push(val);
      render();
    }
  });

  // Remove compare
  document.querySelectorAll(".remove-compare").forEach(el => {
    el.addEventListener("click", () => {
      const idx = parseInt((el as HTMLElement).dataset.idx || "0", 10);
      compareMakes.splice(idx, 1);
      render();
    });
  });

  // Fine print toggles
  document.querySelectorAll(".fine-print-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLElement).dataset.fp!;
      const fp = document.getElementById("fp-" + id);
      if (fp) {
        const isExpanded = fp.classList.toggle("expanded");
        (btn as HTMLElement).innerHTML = isExpanded ? "Hide fine print &#9652;" : "Show fine print &#9662;";
      }
    });
  });

  // Calculator MSRP
  document.getElementById("calc-msrp")?.addEventListener("blur", (e) => {
    const raw = (e.target as HTMLInputElement).value.replace(/[^0-9]/g, "");
    const val = parseInt(raw, 10);
    if (!isNaN(val) && val > 0) {
      calcMsrp = val;
      updateSidebar();
    }
  });

  document.getElementById("calc-msrp")?.addEventListener("focus", (e) => {
    (e.target as HTMLInputElement).value = String(calcMsrp);
  });

  // Incentive checkboxes
  document.querySelectorAll('#incentive-checks input[type="checkbox"]').forEach(cb => {
    cb.addEventListener("change", () => {
      const id = (cb as HTMLInputElement).dataset.incId!;
      if ((cb as HTMLInputElement).checked) {
        selectedIncentiveIds.add(id);
      } else {
        selectedIncentiveIds.delete(id);
      }
      updateSidebar();
    });
  });
}

function updateSidebar(): void {
  const sidebar = document.getElementById("sidebar");
  if (sidebar) {
    sidebar.innerHTML = renderSidebar();
    // Rebind sidebar events
    document.getElementById("calc-msrp")?.addEventListener("blur", (e) => {
      const raw = (e.target as HTMLInputElement).value.replace(/[^0-9]/g, "");
      const val = parseInt(raw, 10);
      if (!isNaN(val) && val > 0) {
        calcMsrp = val;
        updateSidebar();
      }
    });
    document.getElementById("calc-msrp")?.addEventListener("focus", (e) => {
      (e.target as HTMLInputElement).value = String(calcMsrp);
    });
    document.querySelectorAll('#incentive-checks input[type="checkbox"]').forEach(cb => {
      cb.addEventListener("change", () => {
        const id = (cb as HTMLInputElement).dataset.incId!;
        if ((cb as HTMLInputElement).checked) {
          selectedIncentiveIds.add(id);
        } else {
          selectedIncentiveIds.delete(id);
        }
        updateSidebar();
      });
    });
  }
}

// ── Search ─────────────────────────────────────────────────────────────────────

async function doSearch(): Promise<void> {
  if (!selectedMake || isLoading) return;

  isLoading = true;
  selectedIncentiveIds.clear();
  render();

  const allMakes = [selectedMake, ...compareMakes];

  try {
    const result = await _safeApp?.callServerTool({
      name: "oem-incentives-explorer",
      arguments: {
        make: selectedMake,
        model: selectedModel || undefined,
        zip: zipCode || undefined,
        compareMakes: compareMakes.length > 0 ? compareMakes : undefined,
      },
    });

    // Try to parse server response
    let parsed: SearchResult | null = null;
    if (result && typeof result === "object") {
      const text = "content" in result
        ? (result as any).content?.map((c: any) => c.text || "").join("") || ""
        : JSON.stringify(result);
      try {
        parsed = JSON.parse(text);
      } catch {
        // Response wasn't valid JSON - fall through to mock data
      }
    }

    if (parsed && parsed.results && parsed.results.length > 0) {
      currentResults = parsed;
    } else {
      // Use mock data
      currentResults = {
        zip: zipCode || "00000",
        results: allMakes.map(m => ({
          make: m,
          incentives: getMockIncentives(m, m === selectedMake ? selectedModel : undefined),
        })),
      };
    }
  } catch {
    // Server tool not available, use mock data
    currentResults = {
      zip: zipCode || "00000",
      results: allMakes.map(m => ({
        make: m,
        incentives: getMockIncentives(m, m === selectedMake ? selectedModel : undefined),
      })),
    };
  }

  isLoading = false;
  render();
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────

function bootstrap(): void {
  const root = document.createElement("div");
  root.id = "app-root";
  document.body.appendChild(root);
  render();
}

bootstrap();
