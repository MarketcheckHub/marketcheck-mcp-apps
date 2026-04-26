import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "auction-arbitrage-finder" }); } catch {}

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
function _getUrlParams(): Record<string, string> { const params = new URLSearchParams(location.search); const result: Record<string, string> = {}; for (const key of ["vin","vins","zip","make","model","miles","state","dealer_id","ticker","price","postal_code"]) { const v = params.get(key); if (v) result[key] = v; } return result; }
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
  const vins = (args.vins??"").split(/[\s,]+/).map((v:string)=>v.trim()).filter(Boolean);
  const results = await Promise.all(vins.map(async (vin) => {
    const decode = await _mcDecode(vin).catch(() => null);
    const history = await _mcHistory(vin).catch(() => null);
    const lastMiles = Array.isArray(history) ? (history.find((h:any) => h?.miles)?.miles) : undefined;
    const miles = args.miles ?? lastMiles ?? 50000;
    const [retail, wholesale] = await Promise.all([
      _mcPredict({ vin, miles, dealer_type: "franchise", zip: args.zip }).catch(() => null),
      _mcPredict({ vin, miles, dealer_type: "independent", zip: args.zip }).catch(() => null),
    ]);
    return { vin, decode, retail, wholesale };
  }));
  return { results };
}

function _transformResults(parsed: any): AppData {
  const rows = parsed?.vehicles ?? parsed?.results ?? [];
  const vehicles: ArbitrageVehicle[] = rows.map((r: any) => {
    if (r?.wholesalePrice !== undefined) return r as ArbitrageVehicle;
    const specs = r?.decode?.generic?.[0]?.USA?.[0] ?? {};
    const retailPrice = Number(r?.retail?.marketcheck_price) || 0;
    const wholesalePrice = Number(r?.wholesale?.marketcheck_price) || 0;
    const reconEstimate = 1500;
    const grossProfit = retailPrice - wholesalePrice - reconEstimate;
    const profitMargin = retailPrice > 0 ? (grossProfit / retailPrice) * 100 : 0;
    const comps = r?.retail?.comparables?.listings ?? [];
    const doms = comps.map((l: any) => l?.dom ?? l?.days_on_market ?? 0).filter((d: number) => d > 0);
    const avgDom = doms.length ? doms.reduce((s: number, d: number) => s + d, 0) / doms.length : 0;
    const milesArr = comps.map((l: any) => l?.miles).filter((m: number) => m > 0).sort((a: number, b: number) => a - b);
    const medianMiles = milesArr.length ? milesArr[Math.floor(milesArr.length / 2)] : 0;
    return {
      vin: r?.vin ?? "",
      year: parseInt(specs.year) || 0,
      make: specs.make ?? "Unknown",
      model: specs.model ?? "",
      trim: specs.trim ?? "",
      bodyType: specs.body_type ?? "",
      engine: specs.engine ?? "",
      drivetrain: specs.drivetrain ?? "",
      miles: medianMiles,
      wholesalePrice,
      retailPrice,
      reconEstimate,
      grossProfit,
      profitMargin,
      activeCount: Number(r?.retail?.comparables?.num_found) || 0,
      avgDom,
      compCount: comps.length,
    };
  }).filter((v: ArbitrageVehicle) => v.retailPrice > 0 && v.wholesalePrice > 0);
  vehicles.sort((a, b) => b.profitMargin - a.profitMargin);
  return { vehicles };
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
interface ArbitrageVehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  bodyType: string;
  engine: string;
  drivetrain: string;
  miles: number;
  wholesalePrice: number;
  retailPrice: number;
  reconEstimate: number;
  grossProfit: number;
  profitMargin: number;
  activeCount: number;
  avgDom: number;
  compCount: number;
}

interface AppData {
  vehicles: ArbitrageVehicle[];
}

// ── Mock Data ──────────────────────────────────────────────────────────
function generateMockData(): AppData {
  const vehicles: ArbitrageVehicle[] = [
    {
      vin: "2T3P1RFV5MW123456",
      year: 2021, make: "Toyota", model: "RAV4", trim: "XLE Premium",
      bodyType: "SUV", engine: "2.5L 4-Cyl", drivetrain: "AWD", miles: 32450,
      wholesalePrice: 26800, retailPrice: 32400, reconEstimate: 1500,
      grossProfit: 4100, profitMargin: 12.7,
      activeCount: 148, avgDom: 22, compCount: 35,
    },
    {
      vin: "1FTFW1E85LFA78901",
      year: 2020, make: "Ford", model: "F-150", trim: "XLT SuperCrew",
      bodyType: "Truck", engine: "3.5L V6 EcoBoost", drivetrain: "4WD", miles: 41200,
      wholesalePrice: 32500, retailPrice: 39800, reconEstimate: 1500,
      grossProfit: 5800, profitMargin: 14.6,
      activeCount: 203, avgDom: 18, compCount: 52,
    },
    {
      vin: "19XFC2F69NE234567",
      year: 2022, make: "Honda", model: "Civic", trim: "Sport",
      bodyType: "Sedan", engine: "2.0L 4-Cyl", drivetrain: "FWD", miles: 18900,
      wholesalePrice: 22300, retailPrice: 27500, reconEstimate: 1500,
      grossProfit: 3700, profitMargin: 13.5,
      activeCount: 112, avgDom: 15, compCount: 28,
    },
    {
      vin: "5UXTY5C09L9B45678",
      year: 2019, make: "BMW", model: "X3", trim: "sDrive30i",
      bodyType: "SUV", engine: "2.0L Turbo 4-Cyl", drivetrain: "RWD", miles: 52800,
      wholesalePrice: 24200, retailPrice: 28900, reconEstimate: 1500,
      grossProfit: 3200, profitMargin: 11.1,
      activeCount: 67, avgDom: 34, compCount: 18,
    },
    {
      vin: "KM8K62AG7PU567890",
      year: 2023, make: "Hyundai", model: "Tucson", trim: "SEL",
      bodyType: "SUV", engine: "2.5L 4-Cyl", drivetrain: "FWD", miles: 12400,
      wholesalePrice: 25600, retailPrice: 31200, reconEstimate: 1500,
      grossProfit: 4100, profitMargin: 13.1,
      activeCount: 89, avgDom: 20, compCount: 24,
    },
  ];
  // Sort by profit margin desc
  vehicles.sort((a, b) => b.profitMargin - a.profitMargin);
  return { vehicles };
}

// ── Formatters ─────────────────────────────────────────────────────────
function fmtCurrency(v: number): string {
  return "$" + Math.round(v).toLocaleString();
}
function fmtPct(v: number): string {
  return v.toFixed(1) + "%";
}
function fmtNum(v: number): string {
  return Math.round(v).toLocaleString();
}

// ── State ──────────────────────────────────────────────────────────────
let currentData: AppData | null = null;
let sortColumn = 5; // default: profit margin
let sortAsc = false;

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  document.body.style.cssText =
    "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;overflow-x:hidden;";

  renderInputForm();

  const params = _getUrlParams();
  const autoVins = params.vins ?? (_getAuth().value ? "KNDCB3LC9L5359658,1HGCV1F34LA000001,5YJSA1E26MF000001,1FTFW1E85MFA00001" : "");
  if (autoVins) {
    const ta = document.getElementById("vin-input") as HTMLTextAreaElement;
    const zi = document.getElementById("zip-input") as HTMLInputElement;
    if (ta) ta.value = autoVins.split(",").map(v => v.trim()).join("\n");
    if (zi && params.zip) zi.value = params.zip;
    handleAnalyze();
  }
}

// ── Input Form ─────────────────────────────────────────────────────────
function renderInputForm() {
  document.body.innerHTML = "";

  // Header
  const header = el("div", {
    style: "background:#1e293b;padding:12px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:12px;",
  });
  header.innerHTML = `<h1 style="margin:0;font-size:16px;font-weight:600;color:#f8fafc;">Auction Arbitrage Finder</h1>
    <span style="font-size:12px;color:#64748b;">Wholesale vs Retail Profit Analysis</span>`;
  _addSettingsBar(header);
  document.body.appendChild(header);

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
    document.body.appendChild(_db);
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

  const content = el("div", { style: "padding:24px 20px;max-width:900px;margin:0 auto;" });
  document.body.appendChild(content);

  // Description panel
  const descPanel = el("div", {
    style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:20px;",
  });
  descPanel.innerHTML = `
    <div style="font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:8px;">How it works</div>
    <div style="font-size:13px;color:#94a3b8;line-height:1.6;">
      Enter up to 10 VINs from an auction lot. This tool decodes each vehicle, predicts wholesale
      (independent dealer) and retail (franchise dealer) prices, estimates reconditioning cost,
      and calculates gross profit potential. Vehicles are ranked by profit margin to help you
      prioritize auction bids.
    </div>
  `;
  content.appendChild(descPanel);

  // VIN input
  const formPanel = el("div", {
    style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:20px;margin-bottom:16px;",
  });

  const formTitle = el("div", {
    style: "font-size:13px;font-weight:600;color:#f8fafc;margin-bottom:12px;",
  });
  formTitle.textContent = "Enter VINs (one per line, up to 10)";
  formPanel.appendChild(formTitle);

  const textarea = document.createElement("textarea");
  textarea.id = "vin-input";
  textarea.rows = 8;
  textarea.placeholder = "KNDCB3LC9L5359658\n1HGCV1F34LA000001\n5YJSA1E26MF000001\n1FTFW1E85MFA00001";
  const urlVins = _getUrlParams().vins;
  if (urlVins) textarea.value = urlVins.split(",").map(v => v.trim()).join("\n");
  textarea.style.cssText = "width:100%;padding:12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;font-family:monospace;resize:vertical;box-sizing:border-box;line-height:1.6;";
  formPanel.appendChild(textarea);

  const zipRow = el("div", {
    style: "display:flex;gap:12px;align-items:center;margin-top:12px;",
  });

  const zipLabel = el("label", { style: "font-size:12px;color:#94a3b8;" });
  zipLabel.textContent = "ZIP Code:";
  zipRow.appendChild(zipLabel);

  const zipInput = document.createElement("input");
  zipInput.id = "zip-input";
  zipInput.type = "text";
  zipInput.placeholder = "80202";
  zipInput.value = _getUrlParams().zip ?? "";
  zipInput.style.cssText = "padding:8px 12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;width:120px;";
  zipRow.appendChild(zipInput);

  formPanel.appendChild(zipRow);

  const buttonRow = el("div", {
    style: "display:flex;gap:12px;margin-top:16px;align-items:center;",
  });

  const analyzeBtn = document.createElement("button");
  analyzeBtn.textContent = "Analyze Arbitrage";
  analyzeBtn.style.cssText = "padding:10px 24px;border-radius:6px;border:none;background:#3b82f6;color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;";
  analyzeBtn.addEventListener("click", () => handleAnalyze());
  buttonRow.appendChild(analyzeBtn);

  const demoBtn = document.createElement("button");
  demoBtn.textContent = "Load Demo Data";
  demoBtn.style.cssText = "padding:10px 24px;border-radius:6px;border:1px solid #334155;background:transparent;color:#94a3b8;font-size:14px;cursor:pointer;font-family:inherit;";
  demoBtn.addEventListener("click", () => {
    currentData = generateMockData();
    renderDashboard(currentData);
  });
  buttonRow.appendChild(demoBtn);

  formPanel.appendChild(buttonRow);
  content.appendChild(formPanel);

  // Sample VINs reference
  const samplePanel = el("div", {
    style: "background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px;",
  });
  samplePanel.innerHTML = `
    <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Sample VINs for testing</div>
    <div style="font-size:12px;color:#94a3b8;font-family:monospace;line-height:1.8;">
      KNDCB3LC9L5359658 — 2020 Kia Niro<br>
      1HGCV1F34LA000001 — Honda Civic<br>
      5YJSA1E26MF000001 — Tesla Model S<br>
      1FTFW1E85MFA00001 — Ford F-150
    </div>
  `;
  content.appendChild(samplePanel);
}

// ── Handle Analyze ─────────────────────────────────────────────────────
async function handleAnalyze() {
  const textarea = document.getElementById("vin-input") as HTMLTextAreaElement;
  const zipInput = document.getElementById("zip-input") as HTMLInputElement;
  const vins = textarea?.value?.trim() ?? "";
  const zip = (zipInput?.value?.trim() || "80202");

  if (!vins) {
    currentData = generateMockData();
    renderDashboard(currentData);
    return;
  }

  // Show loading
  document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#94a3b8;">
    <div style="width:20px;height:20px;border:2px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:12px;"></div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    Analyzing ${vins.split("\n").filter(Boolean).length} VINs for arbitrage opportunities...
  </div>`;

  try {
    const result = await _callTool("find-auction-arbitrage", { vins, zip });
    const text = result?.content?.find((c: any) => c.type === "text")?.text;
    if (text) {
      const transformed = _transformResults(JSON.parse(text));
      currentData = transformed.vehicles.length > 0 ? transformed : generateMockData();
    } else {
      currentData = generateMockData();
    }
  } catch {
    currentData = generateMockData();
  }

  renderDashboard(currentData);
}

// ── Render Dashboard ───────────────────────────────────────────────────
function renderDashboard(data: AppData) {
  document.body.innerHTML = "";
  const vehicles = data.vehicles;

  // Header
  const header = el("div", {
    style: "background:#1e293b;padding:12px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:12px;",
  });
  header.innerHTML = `<h1 style="margin:0;font-size:16px;font-weight:600;color:#f8fafc;">Auction Arbitrage Finder</h1>
    <span style="font-size:12px;color:#64748b;">${vehicles.length} vehicles analyzed</span>`;

  const backBtn = document.createElement("button");
  backBtn.textContent = "New Search";
  backBtn.style.cssText = "margin-left:auto;padding:6px 14px;border-radius:6px;border:1px solid #334155;background:transparent;color:#94a3b8;font-size:12px;cursor:pointer;font-family:inherit;";
  backBtn.addEventListener("click", () => renderInputForm());
  header.appendChild(backBtn);

  _addSettingsBar(header);
  document.body.appendChild(header);

  const content = el("div", { style: "padding:16px 20px;" });
  document.body.appendChild(content);

  // ── KPI Summary ──────────────────────────────────────────────────
  const totalWholesale = vehicles.reduce((s, v) => s + v.wholesalePrice, 0);
  const totalRetail = vehicles.reduce((s, v) => s + v.retailPrice, 0);
  const totalRecon = vehicles.reduce((s, v) => s + v.reconEstimate, 0);
  const totalProfit = vehicles.reduce((s, v) => s + v.grossProfit, 0);
  const avgMargin = vehicles.length > 0
    ? vehicles.reduce((s, v) => s + v.profitMargin, 0) / vehicles.length
    : 0;
  const bestDeal = vehicles.length > 0 ? vehicles[0] : null;

  const kpiRibbon = el("div", {
    style: "display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;margin-bottom:16px;flex-wrap:wrap;",
  });

  const kpiCards = [
    { label: "Vehicles", value: String(vehicles.length), trend: "batch analyzed", color: "#94a3b8" },
    { label: "Total Wholesale", value: fmtCurrency(totalWholesale), trend: "acquisition cost", color: "#f59e0b" },
    { label: "Total Retail", value: fmtCurrency(totalRetail), trend: "projected revenue", color: "#10b981" },
    { label: "Total Gross Profit", value: fmtCurrency(totalProfit), trend: `after ${fmtCurrency(totalRecon)} recon`, color: totalProfit > 0 ? "#10b981" : "#ef4444" },
    { label: "Avg Profit Margin", value: fmtPct(avgMargin), trend: avgMargin > 15 ? "strong" : avgMargin > 8 ? "moderate" : "thin", color: avgMargin > 15 ? "#10b981" : avgMargin > 8 ? "#f59e0b" : "#ef4444" },
    { label: "Best Opportunity", value: bestDeal ? `${bestDeal.year} ${bestDeal.make}` : "N/A", trend: bestDeal ? `${fmtPct(bestDeal.profitMargin)} margin` : "", color: "#60a5fa" },
  ];

  for (const k of kpiCards) {
    const card = el("div", {
      style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px 16px;min-width:150px;flex:1;",
    });
    card.innerHTML = `
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">${k.label}</div>
      <div style="font-size:22px;font-weight:700;color:#f8fafc;margin-top:4px;">${k.value}</div>
      <div style="font-size:12px;color:${k.color};margin-top:2px;">${k.trend}</div>
    `;
    kpiRibbon.appendChild(card);
  }
  content.appendChild(kpiRibbon);

  // ── Vehicle Cards ────────────────────────────────────────────────
  const cardsTitle = el("h2", {
    style: "font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:12px;",
  });
  cardsTitle.textContent = "Vehicle Details & Price Comparison";
  content.appendChild(cardsTitle);

  const cardsGrid = el("div", {
    style: "display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:16px;margin-bottom:24px;",
  });

  for (const v of vehicles) {
    const card = el("div", {
      style: "background:#1e293b;border:1px solid #334155;border-radius:8px;overflow:hidden;",
    });

    // Card header
    const cardHeader = el("div", {
      style: "padding:14px 16px;border-bottom:1px solid #334155;display:flex;justify-content:space-between;align-items:center;",
    });

    const marginColor = v.profitMargin > 15 ? "#10b981" : v.profitMargin > 8 ? "#f59e0b" : "#ef4444";
    const marginLabel = v.profitMargin > 15 ? "STRONG" : v.profitMargin > 8 ? "MODERATE" : "THIN";

    cardHeader.innerHTML = `
      <div>
        <div style="font-size:15px;font-weight:600;color:#f8fafc;">${v.year} ${v.make} ${v.model}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:2px;">${v.trim} | ${v.bodyType} | ${v.engine} | ${v.drivetrain}</div>
      </div>
      <span style="padding:4px 10px;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:0.5px;background:${marginColor}22;color:${marginColor};border:1px solid ${marginColor}33;">${marginLabel}</span>
    `;
    card.appendChild(cardHeader);

    // Card body
    const cardBody = el("div", { style: "padding:14px 16px;" });

    // VIN & Miles row
    cardBody.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
        <span style="font-size:11px;color:#64748b;">VIN: <span style="font-family:monospace;color:#94a3b8;">${v.vin}</span></span>
        <span style="font-size:11px;color:#64748b;">${fmtNum(v.miles)} miles</span>
      </div>
    `;

    // Two-column price table
    const priceTable = el("div", {
      style: "display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;",
    });
    priceTable.innerHTML = `
      <div style="background:#0f172a;border:1px solid #334155;border-radius:6px;padding:12px;text-align:center;">
        <div style="font-size:10px;color:#f59e0b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Wholesale (Buy)</div>
        <div style="font-size:20px;font-weight:700;color:#f59e0b;">${fmtCurrency(v.wholesalePrice)}</div>
        <div style="font-size:10px;color:#64748b;margin-top:2px;">Independent dealer price</div>
      </div>
      <div style="background:#0f172a;border:1px solid #334155;border-radius:6px;padding:12px;text-align:center;">
        <div style="font-size:10px;color:#10b981;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Retail (Sell)</div>
        <div style="font-size:20px;font-weight:700;color:#10b981;">${fmtCurrency(v.retailPrice)}</div>
        <div style="font-size:10px;color:#64748b;margin-top:2px;">Franchise dealer price</div>
      </div>
    `;
    cardBody.appendChild(priceTable);

    // Economics row
    const econRow = el("div", {
      style: "display:flex;justify-content:space-between;align-items:center;background:#0f172a;border:1px solid #334155;border-radius:6px;padding:10px 14px;margin-bottom:12px;",
    });
    econRow.innerHTML = `
      <div style="text-align:center;">
        <div style="font-size:10px;color:#64748b;">Recon Est.</div>
        <div style="font-size:14px;font-weight:600;color:#ef4444;">${fmtCurrency(v.reconEstimate)}</div>
      </div>
      <div style="color:#334155;font-size:18px;">&#8594;</div>
      <div style="text-align:center;">
        <div style="font-size:10px;color:#64748b;">Gross Profit</div>
        <div style="font-size:14px;font-weight:600;color:${v.grossProfit > 0 ? '#10b981' : '#ef4444'};">${fmtCurrency(v.grossProfit)}</div>
      </div>
      <div style="color:#334155;font-size:18px;">&#8594;</div>
      <div style="text-align:center;">
        <div style="font-size:10px;color:#64748b;">Margin</div>
        <div style="font-size:14px;font-weight:600;color:${marginColor};">${fmtPct(v.profitMargin)}</div>
      </div>
    `;
    cardBody.appendChild(econRow);

    // Local demand row
    const demandRow = el("div", {
      style: "display:flex;gap:16px;",
    });
    demandRow.innerHTML = `
      <div style="font-size:11px;color:#64748b;">Local Active Listings: <span style="color:#e2e8f0;font-weight:600;">${fmtNum(v.activeCount)}</span></div>
      <div style="font-size:11px;color:#64748b;">Avg DOM: <span style="color:#e2e8f0;font-weight:600;">${v.avgDom}d</span></div>
      <div style="font-size:11px;color:#64748b;">Comps: <span style="color:#e2e8f0;font-weight:600;">${v.compCount}</span></div>
    `;
    cardBody.appendChild(demandRow);

    card.appendChild(cardBody);
    cardsGrid.appendChild(card);
  }
  content.appendChild(cardsGrid);

  // ── Waterfall Chart ──────────────────────────────────────────────
  const chartTitle = el("h2", {
    style: "font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:12px;",
  });
  chartTitle.textContent = "Profit Waterfall by Vehicle";
  content.appendChild(chartTitle);

  const chartContainer = el("div", {
    style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:20px;margin-bottom:24px;overflow-x:auto;",
  });

  const canvas = document.createElement("canvas");
  const chartWidth = Math.max(700, vehicles.length * 160);
  canvas.width = chartWidth;
  canvas.height = 380;
  canvas.style.cssText = `width:${chartWidth}px;height:380px;max-width:100%;`;
  chartContainer.appendChild(canvas);
  content.appendChild(chartContainer);

  drawWaterfallChart(canvas, vehicles);

  // ── Arbitrage Ranking Table ──────────────────────────────────────
  const rankTitle = el("h2", {
    style: "font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:12px;",
  });
  rankTitle.textContent = "Arbitrage Ranking";
  content.appendChild(rankTitle);

  renderRankingTable(content, vehicles);

  // ── Local Retail Demand Table ────────────────────────────────────
  const demandTitle = el("h2", {
    style: "font-size:14px;font-weight:600;color:#f8fafc;margin-bottom:12px;margin-top:24px;",
  });
  demandTitle.textContent = "Local Retail Demand";
  content.appendChild(demandTitle);

  renderDemandTable(content, vehicles);
}

// ── Waterfall Chart ────────────────────────────────────────────────────
function drawWaterfallChart(canvas: HTMLCanvasElement, vehicles: ArbitrageVehicle[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width;
  const h = canvas.height;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.scale(dpr, dpr);

  // Chart area
  const padLeft = 70;
  const padRight = 20;
  const padTop = 30;
  const padBottom = 70;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  // Find max price for scaling
  const maxPrice = Math.max(...vehicles.map(v => v.retailPrice)) * 1.1;

  // Background
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, w, h);

  // Grid lines
  const gridCount = 5;
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 0.5;
  ctx.fillStyle = "#64748b";
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textAlign = "right";

  for (let i = 0; i <= gridCount; i++) {
    const y = padTop + (chartH / gridCount) * i;
    const val = maxPrice - (maxPrice / gridCount) * i;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + chartW, y);
    ctx.stroke();
    ctx.fillText("$" + Math.round(val / 1000) + "K", padLeft - 8, y + 4);
  }

  // Bars for each vehicle
  const groupWidth = chartW / vehicles.length;
  const barWidth = Math.min(28, groupWidth * 0.22);
  const barGap = 4;

  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    const centerX = padLeft + groupWidth * i + groupWidth / 2;

    // Wholesale bar (amber)
    const whY = padTop + chartH * (1 - v.wholesalePrice / maxPrice);
    const whH = chartH * (v.wholesalePrice / maxPrice);
    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(centerX - barWidth * 1.5 - barGap, whY, barWidth, whH);

    // Recon bar (red, stacked on wholesale)
    const reconH = chartH * (v.reconEstimate / maxPrice);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(centerX - barWidth * 0.5, whY - reconH, barWidth, reconH);

    // Retail bar (green)
    const rtY = padTop + chartH * (1 - v.retailPrice / maxPrice);
    const rtH = chartH * (v.retailPrice / maxPrice);
    ctx.fillStyle = "#10b981";
    ctx.fillRect(centerX + barWidth * 0.5 + barGap, rtY, barWidth, rtH);

    // Profit annotation
    const profitColor = v.grossProfit > 0 ? "#10b981" : "#ef4444";
    ctx.fillStyle = profitColor;
    ctx.font = "bold 11px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(fmtCurrency(v.grossProfit), centerX, rtY - 8);

    // Vehicle label
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "center";

    ctx.save();
    ctx.translate(centerX, padTop + chartH + 14);
    ctx.fillText(`${v.year} ${v.make}`, 0, 0);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.fillText(v.model, 0, 14);
    ctx.fillText(fmtPct(v.profitMargin) + " margin", 0, 28);
    ctx.restore();
  }

  // Legend
  const legendY = 12;
  const legendItems = [
    { color: "#f59e0b", label: "Wholesale Buy" },
    { color: "#ef4444", label: "Recon ($1,500)" },
    { color: "#10b981", label: "Retail Sell" },
  ];
  let legendX = padLeft;
  ctx.font = "11px -apple-system, sans-serif";
  for (const item of legendItems) {
    ctx.fillStyle = item.color;
    ctx.fillRect(legendX, legendY - 8, 12, 12);
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText(item.label, legendX + 16, legendY + 2);
    legendX += ctx.measureText(item.label).width + 36;
  }
}

// ── Ranking Table ──────────────────────────────────────────────────────
function renderRankingTable(container: HTMLElement, vehicles: ArbitrageVehicle[]) {
  // Sort vehicles
  const sorted = [...vehicles];
  const sortKeys: Array<(v: ArbitrageVehicle) => number | string> = [
    v => `${v.year} ${v.make} ${v.model}`,
    v => v.wholesalePrice,
    v => v.retailPrice,
    v => v.reconEstimate,
    v => v.grossProfit,
    v => v.profitMargin,
  ];

  sorted.sort((a, b) => {
    const av = sortKeys[sortColumn](a);
    const bv = sortKeys[sortColumn](b);
    if (typeof av === "number" && typeof bv === "number") return sortAsc ? av - bv : bv - av;
    return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });

  const tableWrapper = el("div", {
    style: "overflow-x:auto;border:1px solid #334155;border-radius:8px;",
  });

  const table = el("table", {
    style: "width:100%;border-collapse:collapse;font-size:12px;",
  });

  const headers = ["Vehicle", "Wholesale", "Retail", "Recon", "Gross Profit", "Margin"];
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  headers.forEach((h, idx) => {
    const th = document.createElement("th");
    th.style.cssText = "padding:10px 12px;text-align:left;background:#1e293b;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;cursor:pointer;white-space:nowrap;user-select:none;";
    const arrow = sortColumn === idx ? (sortAsc ? " ▲" : " ▼") : "";
    th.textContent = h + arrow;
    th.addEventListener("click", () => {
      if (sortColumn === idx) sortAsc = !sortAsc;
      else { sortColumn = idx; sortAsc = false; }
      // Re-render just the ranking section
      const existing = container.querySelector("[data-ranking-table]");
      if (existing) {
        const newWrapper = el("div", {});
        newWrapper.setAttribute("data-ranking-table", "1");
        existing.replaceWith(newWrapper);
        renderRankingTableInner(newWrapper, vehicles);
      }
    });
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (let i = 0; i < sorted.length; i++) {
    const v = sorted[i];
    const tr = document.createElement("tr");

    const marginColor = v.profitMargin > 15 ? "#10b981" : v.profitMargin > 8 ? "#f59e0b" : "#ef4444";
    const marginLabel = v.profitMargin > 15 ? "STRONG" : v.profitMargin > 8 ? "OK" : "THIN";
    const badgeBg = v.profitMargin > 15 ? "#10b98122" : v.profitMargin > 8 ? "#f59e0b22" : "#ef444422";

    const rowBg = i % 2 === 0 ? "transparent" : "rgba(30,41,59,0.5)";
    tr.style.cssText = `border-bottom:1px solid #1e293b;background:${rowBg};`;
    tr.addEventListener("mouseenter", () => { tr.style.background = "#1e293b"; });
    tr.addEventListener("mouseleave", () => { tr.style.background = rowBg; });

    const cells = [
      `<div style="font-weight:600;color:#f8fafc;">${v.year} ${v.make} ${v.model}</div><div style="font-size:10px;color:#64748b;">${v.trim}</div>`,
      `<span style="color:#f59e0b;">${fmtCurrency(v.wholesalePrice)}</span>`,
      `<span style="color:#10b981;">${fmtCurrency(v.retailPrice)}</span>`,
      `<span style="color:#ef4444;">${fmtCurrency(v.reconEstimate)}</span>`,
      `<span style="color:${v.grossProfit > 0 ? '#10b981' : '#ef4444'};font-weight:600;">${fmtCurrency(v.grossProfit)}</span>`,
      `<span style="padding:3px 8px;border-radius:8px;font-size:10px;font-weight:700;background:${badgeBg};color:${marginColor};border:1px solid ${marginColor}33;">${fmtPct(v.profitMargin)} ${marginLabel}</span>`,
    ];

    for (const cellHtml of cells) {
      const td = document.createElement("td");
      td.style.cssText = "padding:10px 12px;white-space:nowrap;";
      td.innerHTML = cellHtml;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tableWrapper.appendChild(table);

  const wrapper = el("div", {});
  wrapper.setAttribute("data-ranking-table", "1");
  wrapper.appendChild(tableWrapper);
  container.appendChild(wrapper);
}

function renderRankingTableInner(container: HTMLElement, vehicles: ArbitrageVehicle[]) {
  const sorted = [...vehicles];
  const sortKeys: Array<(v: ArbitrageVehicle) => number | string> = [
    v => `${v.year} ${v.make} ${v.model}`,
    v => v.wholesalePrice,
    v => v.retailPrice,
    v => v.reconEstimate,
    v => v.grossProfit,
    v => v.profitMargin,
  ];

  sorted.sort((a, b) => {
    const av = sortKeys[sortColumn](a);
    const bv = sortKeys[sortColumn](b);
    if (typeof av === "number" && typeof bv === "number") return sortAsc ? av - bv : bv - av;
    return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });

  const tableWrapper = el("div", {
    style: "overflow-x:auto;border:1px solid #334155;border-radius:8px;",
  });

  const table = el("table", {
    style: "width:100%;border-collapse:collapse;font-size:12px;",
  });

  const headers = ["Vehicle", "Wholesale", "Retail", "Recon", "Gross Profit", "Margin"];
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  headers.forEach((h, idx) => {
    const th = document.createElement("th");
    th.style.cssText = "padding:10px 12px;text-align:left;background:#1e293b;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;cursor:pointer;white-space:nowrap;user-select:none;";
    const arrow = sortColumn === idx ? (sortAsc ? " ▲" : " ▼") : "";
    th.textContent = h + arrow;
    th.addEventListener("click", () => {
      if (sortColumn === idx) sortAsc = !sortAsc;
      else { sortColumn = idx; sortAsc = false; }
      renderRankingTableInner(container, vehicles);
    });
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (let i = 0; i < sorted.length; i++) {
    const v = sorted[i];
    const tr = document.createElement("tr");

    const marginColor = v.profitMargin > 15 ? "#10b981" : v.profitMargin > 8 ? "#f59e0b" : "#ef4444";
    const marginLabel = v.profitMargin > 15 ? "STRONG" : v.profitMargin > 8 ? "OK" : "THIN";
    const badgeBg = v.profitMargin > 15 ? "#10b98122" : v.profitMargin > 8 ? "#f59e0b22" : "#ef444422";

    const rowBg = i % 2 === 0 ? "transparent" : "rgba(30,41,59,0.5)";
    tr.style.cssText = `border-bottom:1px solid #1e293b;background:${rowBg};`;
    tr.addEventListener("mouseenter", () => { tr.style.background = "#1e293b"; });
    tr.addEventListener("mouseleave", () => { tr.style.background = rowBg; });

    const cells = [
      `<div style="font-weight:600;color:#f8fafc;">${v.year} ${v.make} ${v.model}</div><div style="font-size:10px;color:#64748b;">${v.trim}</div>`,
      `<span style="color:#f59e0b;">${fmtCurrency(v.wholesalePrice)}</span>`,
      `<span style="color:#10b981;">${fmtCurrency(v.retailPrice)}</span>`,
      `<span style="color:#ef4444;">${fmtCurrency(v.reconEstimate)}</span>`,
      `<span style="color:${v.grossProfit > 0 ? '#10b981' : '#ef4444'};font-weight:600;">${fmtCurrency(v.grossProfit)}</span>`,
      `<span style="padding:3px 8px;border-radius:8px;font-size:10px;font-weight:700;background:${badgeBg};color:${marginColor};border:1px solid ${marginColor}33;">${fmtPct(v.profitMargin)} ${marginLabel}</span>`,
    ];

    for (const cellHtml of cells) {
      const td = document.createElement("td");
      td.style.cssText = "padding:10px 12px;white-space:nowrap;";
      td.innerHTML = cellHtml;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tableWrapper.appendChild(table);

  container.innerHTML = "";
  container.appendChild(tableWrapper);
}

// ── Demand Table ───────────────────────────────────────────────────────
function renderDemandTable(container: HTMLElement, vehicles: ArbitrageVehicle[]) {
  const tableWrapper = el("div", {
    style: "overflow-x:auto;border:1px solid #334155;border-radius:8px;margin-bottom:24px;",
  });

  const table = el("table", {
    style: "width:100%;border-collapse:collapse;font-size:12px;",
  });

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const headers = ["Vehicle", "Active Listings (Local)", "Avg Days on Market", "Price Comps", "Demand Signal"];

  for (const h of headers) {
    const th = document.createElement("th");
    th.style.cssText = "padding:10px 12px;text-align:left;background:#1e293b;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;";
    th.textContent = h;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    const tr = document.createElement("tr");
    const rowBg = i % 2 === 0 ? "transparent" : "rgba(30,41,59,0.5)";
    tr.style.cssText = `border-bottom:1px solid #1e293b;background:${rowBg};`;
    tr.addEventListener("mouseenter", () => { tr.style.background = "#1e293b"; });
    tr.addEventListener("mouseleave", () => { tr.style.background = rowBg; });

    // Demand signal based on active count and DOM
    let demandSignal = "MODERATE";
    let signalColor = "#f59e0b";
    if (v.activeCount < 80 && v.avgDom < 25) {
      demandSignal = "HIGH";
      signalColor = "#10b981";
    } else if (v.activeCount > 150 || v.avgDom > 40) {
      demandSignal = "LOW";
      signalColor = "#ef4444";
    }

    const cells = [
      `<span style="font-weight:600;color:#f8fafc;">${v.year} ${v.make} ${v.model}</span>`,
      `<span style="color:#e2e8f0;">${fmtNum(v.activeCount)}</span>`,
      `<span style="color:${v.avgDom < 25 ? '#10b981' : v.avgDom < 40 ? '#f59e0b' : '#ef4444'};">${v.avgDom}d</span>`,
      `<span style="color:#e2e8f0;">${v.compCount}</span>`,
      `<span style="padding:3px 8px;border-radius:8px;font-size:10px;font-weight:700;background:${signalColor}22;color:${signalColor};border:1px solid ${signalColor}33;">${demandSignal}</span>`,
    ];

    for (const cellHtml of cells) {
      const td = document.createElement("td");
      td.style.cssText = "padding:10px 12px;white-space:nowrap;";
      td.innerHTML = cellHtml;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  container.appendChild(tableWrapper);

  // Summary
  const summary = el("div", {
    style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:16px;",
  });
  const highDemand = vehicles.filter(v => v.activeCount < 80 && v.avgDom < 25).length;
  const avgDomAll = vehicles.length > 0 ? Math.round(vehicles.reduce((s, v) => s + v.avgDom, 0) / vehicles.length) : 0;
  summary.innerHTML = `
    <div style="font-size:13px;font-weight:600;color:#f8fafc;margin-bottom:8px;">Demand Summary</div>
    <div style="display:flex;gap:24px;flex-wrap:wrap;">
      <div style="font-size:12px;color:#94a3b8;">High Demand Vehicles: <span style="color:#10b981;font-weight:600;">${highDemand} of ${vehicles.length}</span></div>
      <div style="font-size:12px;color:#94a3b8;">Avg Local DOM: <span style="color:#e2e8f0;font-weight:600;">${avgDomAll} days</span></div>
      <div style="font-size:12px;color:#94a3b8;">Avg Active Listings: <span style="color:#e2e8f0;font-weight:600;">${fmtNum(Math.round(vehicles.reduce((s, v) => s + v.activeCount, 0) / Math.max(vehicles.length, 1)))}</span></div>
    </div>
  `;
  container.appendChild(summary);
}

// ── Helpers ────────────────────────────────────────────────────────────
function el(tag: string, attrs?: Record<string, string>): HTMLElement {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "style") e.style.cssText = v;
      else e.setAttribute(k, v);
    }
  }
  return e;
}

main();
