/**
 * Market Comparables Explorer
 * MCP App 2 -- Dark-themed comparables analysis with Canvas histogram & scatter
 */
import { App } from "@modelcontextprotocol/ext-apps";

const _safeApp = (() => { try { return new App({ name: "comparables-explorer" });

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

interface CompListing {
  price: number;
  miles: number;
  trim: string;
  dealer_name: string;
  city: string;
  state: string;
  dom: number;
  vdp_url?: string;
}

interface ComparablesResult {
  target: {
    make: string;
    model: string;
    year: number;
    trim: string;
    price: number;
    miles: number;
  };
  listings: CompListing[];
  stats: {
    count: number;
    mean_price: number;
    median_price: number;
    std_dev: number;
    min_price: number;
    max_price: number;
    avg_dom: number;
  };
}

type SortKey = "price" | "miles" | "trim" | "dealer_name" | "city" | "dom" | "priceVsMedian";
type SortDir = "asc" | "desc";

// ── Mock Data Generator ────────────────────────────────────────────────────────

function generateMockData(): ComparablesResult {
  const dealers = [
    { name: "AutoNation Toyota", city: "Denver", state: "CO" },
    { name: "Larry H. Miller Toyota", city: "Boulder", state: "CO" },
    { name: "Mountain States Toyota", city: "Aurora", state: "CO" },
    { name: "Peak Toyota", city: "Littleton", state: "CO" },
    { name: "Stevinson Toyota West", city: "Lakewood", state: "CO" },
    { name: "Empire Toyota", city: "Westminster", state: "CO" },
    { name: "Groove Toyota", city: "Englewood", state: "CO" },
    { name: "John Elway Toyota", city: "Thornton", state: "CO" },
    { name: "Al Serra Toyota", city: "Arvada", state: "CO" },
    { name: "Fowler Toyota", city: "Longmont", state: "CO" },
    { name: "Pedersen Toyota", city: "Fort Collins", state: "CO" },
    { name: "Liberty Toyota", city: "Colorado Springs", state: "CO" },
    { name: "Patriot Toyota", city: "Parker", state: "CO" },
    { name: "Freedom Toyota", city: "Golden", state: "CO" },
    { name: "Centennial Toyota", city: "Centennial", state: "CO" },
  ];
  const trims = ["LE", "XLE", "XLE Premium", "SE", "Limited"];

  // Use seeded pseudo-random for reproducibility
  let seed = 42;
  function rand(): number {
    seed = (seed * 16807 + 0) % 2147483647;
    return seed / 2147483647;
  }

  // Normal distribution via Box-Muller
  function normalRand(mean: number, std: number): number {
    const u1 = rand();
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * std;
  }

  const listings: CompListing[] = [];
  for (let i = 0; i < 50; i++) {
    const price = Math.round(normalRand(28000, 3000) / 100) * 100;
    // Negative correlation between price and miles
    const baseMiles = 45000 - (price - 22000) * 0.6;
    const miles = Math.round(Math.max(5000, normalRand(baseMiles, 8000)));
    const d = dealers[Math.floor(rand() * dealers.length)];
    const dom = Math.max(1, Math.round(normalRand(25, 15)));
    const hasVdp = rand() > 0.3;
    listings.push({
      price: Math.max(19000, Math.min(38000, price)),
      miles: Math.max(3000, Math.min(85000, miles)),
      trim: trims[Math.floor(rand() * trims.length)],
      dealer_name: d.name,
      city: d.city,
      state: d.state,
      dom,
      vdp_url: hasVdp ? `https://www.example.com/listing/${100000 + i}` : undefined,
    });
  }

  const prices = listings.map((l) => l.price);
  prices.sort((a, b) => a - b);
  const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
  const median = prices.length % 2 === 0
    ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
    : prices[Math.floor(prices.length / 2)];
  const variance = prices.reduce((s, p) => s + (p - mean) ** 2, 0) / prices.length;
  const stdDev = Math.sqrt(variance);
  const avgDom = Math.round(listings.reduce((s, l) => s + l.dom, 0) / listings.length);

  return {
    target: {
      make: "Toyota",
      model: "RAV4",
      year: 2022,
      trim: "XLE",
      price: 27500,
      miles: 35000,
    },
    listings,
    stats: {
      count: listings.length,
      mean_price: Math.round(mean),
      median_price: Math.round(median),
      std_dev: Math.round(stdDev),
      min_price: Math.min(...prices),
      max_price: Math.max(...prices),
      avg_dom: avgDom,
    },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function fmtCurrency(v: number): string {
  return "$" + Math.round(v).toLocaleString();
}

function fmtNum(v: number): string {
  return Math.round(v).toLocaleString();
}

function computePercentile(prices: number[], value: number): number {
  const sorted = [...prices].sort((a, b) => a - b);
  let count = 0;
  for (const p of sorted) {
    if (p < value) count++;
    else break;
  }
  return Math.round((count / sorted.length) * 100);
}

// ── App Init ───────────────────────────────────────────────────────────────────


document.body.style.cssText =
  "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;overflow-x:hidden;min-height:100vh;";

// ── State ──────────────────────────────────────────────────────────────────────

let result: ComparablesResult | null = null;
let sortKey: SortKey = "price";
let sortDir: SortDir = "asc";
let useMock = true;

// Form state
let formMake = "Toyota";
let formModel = "RAV4";
let formYear = "2022";
let formTrim = "XLE";
let formVin = "";
let formZip = "80202";
let formRadius = 100;
let formMileMin = "";
let formMileMax = "";

// ── Build UI ───────────────────────────────────────────────────────────────────

const container = document.createElement("div");
container.style.cssText = "max-width:1400px;margin:0 auto;padding:16px 20px;";
document.body.appendChild(container);

// ── Top Bar ────────────────────────────────────────────────────────────────────

const topBar = document.createElement("div");
topBar.style.cssText =
  "background:#1e293b;border-radius:10px;padding:16px 20px;margin-bottom:16px;border:1px solid #334155;";

const titleRow = document.createElement("div");
titleRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;";
titleRow.innerHTML = `<h1 style="font-size:20px;font-weight:700;color:#f1f5f9;letter-spacing:-0.3px;">Market Comparables Explorer</h1>
  <span style="font-size:12px;color:#64748b;">Powered by MarketCheck</span>`;
topBar.appendChild(titleRow);

// Row 1: Make / Model / Year / Trim / VIN
const row1 = document.createElement("div");
row1.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:10px;";

function makeField(label: string, type: "select" | "input", opts?: string[]): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "display:flex;flex-direction:column;gap:3px;";
  const lbl = document.createElement("label");
  lbl.style.cssText = "font-size:11px;color:#94a3b8;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;";
  lbl.textContent = label;
  wrapper.appendChild(lbl);

  if (type === "select" && opts) {
    const sel = document.createElement("select");
    sel.style.cssText =
      "background:#0f172a;color:#e2e8f0;border:1px solid #475569;border-radius:6px;padding:7px 10px;font-size:13px;outline:none;min-width:110px;cursor:pointer;";
    for (const o of opts) {
      const option = document.createElement("option");
      option.value = o;
      option.textContent = o;
      sel.appendChild(option);
    }
    wrapper.appendChild(sel);
  } else {
    const inp = document.createElement("input");
    inp.type = "text";
    inp.style.cssText =
      "background:#0f172a;color:#e2e8f0;border:1px solid #475569;border-radius:6px;padding:7px 10px;font-size:13px;outline:none;min-width:110px;";
    wrapper.appendChild(inp);
  }
  return wrapper;
}

const makeSelect = makeField("Make", "select", ["Toyota", "Honda", "Ford", "Chevrolet", "BMW", "Mercedes-Benz", "Nissan", "Hyundai", "Kia", "Subaru"]);
const modelSelect = makeField("Model", "select", ["RAV4", "Camry", "Corolla", "Highlander", "Tacoma", "4Runner", "Tundra", "Prius"]);
const yearSelect = makeField("Year", "select", ["2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018"]);
const trimSelect = makeField("Trim", "select", ["LE", "XLE", "XLE Premium", "SE", "Limited", "TRD Off-Road", "TRD Pro"]);

const vinField = makeField("VIN (auto-fill)", "input");
const vinInput = vinField.querySelector("input")!;
vinInput.placeholder = "Enter VIN...";
vinInput.style.minWidth = "180px";

// Divider label
const orLabel = document.createElement("div");
orLabel.style.cssText = "display:flex;align-items:end;padding-bottom:9px;font-size:12px;color:#64748b;font-weight:600;";
orLabel.textContent = "OR";

row1.append(makeSelect, modelSelect, yearSelect, trimSelect, orLabel, vinField);
topBar.appendChild(row1);

// Row 2: ZIP / Radius / Mileage Range / Search
const row2 = document.createElement("div");
row2.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;align-items:end;";

const zipField = makeField("ZIP Code", "input");
const zipInput = zipField.querySelector("input")!;
zipInput.value = "80202";
zipInput.style.minWidth = "80px";
zipInput.style.maxWidth = "90px";

// Radius slider
const radiusWrapper = document.createElement("div");
radiusWrapper.style.cssText = "display:flex;flex-direction:column;gap:3px;";
const radiusLbl = document.createElement("label");
radiusLbl.style.cssText = "font-size:11px;color:#94a3b8;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;";
radiusLbl.textContent = "RADIUS";
const radiusVal = document.createElement("span");
radiusVal.style.cssText = "font-size:11px;color:#60a5fa;font-weight:600;";
radiusVal.textContent = "100 mi";
const radiusLblRow = document.createElement("div");
radiusLblRow.style.cssText = "display:flex;gap:6px;align-items:center;";
radiusLblRow.append(radiusLbl, radiusVal);
const radiusSlider = document.createElement("input");
radiusSlider.type = "range";
radiusSlider.min = "25";
radiusSlider.max = "200";
radiusSlider.step = "25";
radiusSlider.value = "100";
radiusSlider.style.cssText = "width:140px;accent-color:#3b82f6;cursor:pointer;";
radiusSlider.addEventListener("input", () => {
  formRadius = parseInt(radiusSlider.value);
  radiusVal.textContent = `${formRadius} mi`;
});
radiusWrapper.append(radiusLblRow, radiusSlider);

const mileMinField = makeField("Mileage Min", "input");
const mileMinInput = mileMinField.querySelector("input")!;
mileMinInput.placeholder = "0";
mileMinInput.style.minWidth = "80px";
mileMinInput.style.maxWidth = "90px";

const mileMaxField = makeField("Mileage Max", "input");
const mileMaxInput = mileMaxField.querySelector("input")!;
mileMaxInput.placeholder = "100,000";
mileMaxInput.style.minWidth = "80px";
mileMaxInput.style.maxWidth = "90px";

// Search button
const searchBtn = document.createElement("button");
searchBtn.textContent = "Search";
searchBtn.style.cssText =
  "background:#3b82f6;color:white;border:none;border-radius:8px;padding:8px 28px;font-size:14px;font-weight:600;cursor:pointer;align-self:end;transition:background 0.15s;letter-spacing:0.3px;";
searchBtn.addEventListener("mouseenter", () => (searchBtn.style.background = "#2563eb"));
searchBtn.addEventListener("mouseleave", () => (searchBtn.style.background = "#3b82f6"));
searchBtn.addEventListener("click", handleSearch);

row2.append(zipField, radiusWrapper, mileMinField, mileMaxField, searchBtn);
topBar.appendChild(row2);
container.appendChild(topBar);

// Set initial dropdown values
(makeSelect.querySelector("select") as HTMLSelectElement).value = formMake;
(modelSelect.querySelector("select") as HTMLSelectElement).value = formModel;
(yearSelect.querySelector("select") as HTMLSelectElement).value = formYear;
(trimSelect.querySelector("select") as HTMLSelectElement).value = formTrim;

// ── Charts Row ─────────────────────────────────────────────────────────────────

const chartsRow = document.createElement("div");
chartsRow.style.cssText = "display:flex;gap:16px;margin-bottom:16px;";

// Histogram container
const histBox = document.createElement("div");
histBox.style.cssText =
  "flex:1;background:#1e293b;border-radius:10px;padding:14px;border:1px solid #334155;min-width:0;";
const histTitle = document.createElement("div");
histTitle.style.cssText = "font-size:13px;font-weight:600;color:#94a3b8;margin-bottom:8px;";
histTitle.textContent = "Price Distribution";
histBox.appendChild(histTitle);
const histCanvas = document.createElement("canvas");
histCanvas.style.cssText = "width:100%;height:280px;display:block;";
histBox.appendChild(histCanvas);

// Scatter container
const scatterBox = document.createElement("div");
scatterBox.style.cssText =
  "flex:1;background:#1e293b;border-radius:10px;padding:14px;border:1px solid #334155;min-width:0;";
const scatterTitle = document.createElement("div");
scatterTitle.style.cssText = "font-size:13px;font-weight:600;color:#94a3b8;margin-bottom:8px;";
scatterTitle.textContent = "Price vs Mileage";
scatterBox.appendChild(scatterTitle);
const scatterCanvas = document.createElement("canvas");
scatterCanvas.style.cssText = "width:100%;height:280px;display:block;";
scatterBox.appendChild(scatterCanvas);

chartsRow.append(histBox, scatterBox);
container.appendChild(chartsRow);

// ── Stats Bar ──────────────────────────────────────────────────────────────────

const statsBar = document.createElement("div");
statsBar.style.cssText =
  "display:grid;grid-template-columns:repeat(7,1fr);gap:10px;margin-bottom:16px;";
container.appendChild(statsBar);

function buildStatCard(label: string, value: string): HTMLDivElement {
  const card = document.createElement("div");
  card.style.cssText =
    "background:#1e293b;border-radius:8px;padding:12px 14px;border:1px solid #334155;text-align:center;";
  card.innerHTML = `<div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-weight:500;">${label}</div>
    <div style="font-size:18px;font-weight:700;color:#f1f5f9;">${value}</div>`;
  return card;
}

// ── Listings Table ─────────────────────────────────────────────────────────────

const tableWrapper = document.createElement("div");
tableWrapper.style.cssText =
  "background:#1e293b;border-radius:10px;border:1px solid #334155;overflow:hidden;";
const tableHeader = document.createElement("div");
tableHeader.style.cssText = "padding:12px 16px;border-bottom:1px solid #334155;display:flex;align-items:center;justify-content:space-between;";
tableHeader.innerHTML = `<span style="font-size:14px;font-weight:600;color:#f1f5f9;">Comparable Listings</span>
  <span id="table-count" style="font-size:12px;color:#64748b;">0 results</span>`;
tableWrapper.appendChild(tableHeader);

const tableScroll = document.createElement("div");
tableScroll.style.cssText = "overflow-x:auto;max-height:600px;overflow-y:auto;";
const table = document.createElement("table");
table.style.cssText = "width:100%;border-collapse:collapse;font-size:13px;";
tableScroll.appendChild(table);
tableWrapper.appendChild(tableScroll);
container.appendChild(tableWrapper);

// ── Empty State ────────────────────────────────────────────────────────────────

const emptyState = document.createElement("div");
emptyState.style.cssText =
  "text-align:center;padding:60px 20px;color:#64748b;";
emptyState.innerHTML = `<div style="font-size:48px;margin-bottom:12px;opacity:0.5;">&#128269;</div>
  <div style="font-size:16px;font-weight:500;margin-bottom:6px;">Search for Market Comparables</div>
  <div style="font-size:13px;">Select make, model, year and click Search to find comparable listings</div>`;

// Insert empty state initially in the charts/stats/table areas
chartsRow.style.display = "none";
statsBar.style.display = "none";
tableWrapper.style.display = "none";
container.appendChild(emptyState);

// ── Search Handler ─────────────────────────────────────────────────────────────

async function handleSearch(): Promise<void> {
  formMake = (makeSelect.querySelector("select") as HTMLSelectElement).value;
  formModel = (modelSelect.querySelector("select") as HTMLSelectElement).value;
  formYear = (yearSelect.querySelector("select") as HTMLSelectElement).value;
  formTrim = (trimSelect.querySelector("select") as HTMLSelectElement).value;
  formVin = vinInput.value.trim();
  formZip = zipInput.value.trim();
  formMileMin = mileMinInput.value.trim();
  formMileMax = mileMaxInput.value.trim();

  searchBtn.textContent = "Searching...";
  searchBtn.style.opacity = "0.7";
  searchBtn.disabled = true;

  try {
    let data: ComparablesResult;

    if (useMock) {
      // Simulate delay
      await new Promise((r) => setTimeout(r, 400));
      data = generateMockData();
    } else {
      const args: Record<string, unknown> = {
        make: formMake,
        model: formModel,
        year: parseInt(formYear),
        zip: formZip,
        radius: formRadius,
      };
      if (formVin) args.vin = formVin;
      if (formTrim) args.trim = formTrim;
      if (formMileMin) args.mileage_min = parseInt(formMileMin.replace(/,/g, ""));
      if (formMileMax) args.mileage_max = parseInt(formMileMax.replace(/,/g, ""));

      data = await _callTool("comparables-explorer", args);
    }

    result = data;
    sortKey = "price";
    sortDir = "asc";

    // Show sections
    emptyState.style.display = "none";
    chartsRow.style.display = "flex";
    statsBar.style.display = "grid";
    tableWrapper.style.display = "block";

    renderAll();
  } catch (err) {
    console.error("Search failed:", err);
    // Fall back to mock
    result = generateMockData();
    emptyState.style.display = "none";
    chartsRow.style.display = "flex";
    statsBar.style.display = "grid";
    tableWrapper.style.display = "block";
    renderAll();
  } finally {
    searchBtn.textContent = "Search";
    searchBtn.style.opacity = "1";
    searchBtn.disabled = false;
  }
}

// ── Render All ─────────────────────────────────────────────────────────────────

function renderAll(): void {
  if (!result) return;
  renderHistogram();
  renderScatter();
  renderStats();
  renderTable();
}

// ── Histogram ──────────────────────────────────────────────────────────────────

function renderHistogram(): void {
  if (!result) return;
  const canvas = histCanvas;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;

  ctx.clearRect(0, 0, W, H);

  const prices = result.listings.map((l) => l.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const targetPrice = result.target.price;
  const meanPrice = result.stats.mean_price;
  const medianPrice = result.stats.median_price;

  // Create buckets ($2K wide)
  const bucketWidth = 2000;
  const bucketStart = Math.floor(minP / bucketWidth) * bucketWidth;
  const bucketEnd = Math.ceil(maxP / bucketWidth) * bucketWidth;
  const numBuckets = (bucketEnd - bucketStart) / bucketWidth;
  const buckets: number[] = new Array(numBuckets).fill(0);

  for (const p of prices) {
    const idx = Math.min(Math.floor((p - bucketStart) / bucketWidth), numBuckets - 1);
    buckets[idx]++;
  }

  const maxCount = Math.max(...buckets, 1);

  // Chart area
  const padL = 50;
  const padR = 20;
  const padT = 40;
  const padB = 50;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  // Grid lines
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const y = padT + (chartH / yTicks) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
  }

  // Y-axis labels
  ctx.fillStyle = "#64748b";
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= yTicks; i++) {
    const val = Math.round(maxCount * (1 - i / yTicks));
    const y = padT + (chartH / yTicks) * i;
    ctx.fillText(String(val), padL - 8, y);
  }

  // Bars
  const barGap = 2;
  const barW = (chartW - barGap * numBuckets) / numBuckets;

  for (let i = 0; i < numBuckets; i++) {
    const barH = (buckets[i] / maxCount) * chartH;
    const x = padL + i * (barW + barGap);
    const y = padT + chartH - barH;

    // Gradient bar
    const grad = ctx.createLinearGradient(x, y, x, padT + chartH);
    grad.addColorStop(0, "#3b82f6");
    grad.addColorStop(1, "#1d4ed8");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, [3, 3, 0, 0]);
    ctx.fill();
  }

  // X-axis labels
  ctx.fillStyle = "#64748b";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i <= numBuckets; i++) {
    const val = bucketStart + i * bucketWidth;
    const x = padL + i * (barW + barGap) - barGap / 2;
    if (i % 2 === 0 || numBuckets <= 8) {
      ctx.fillText(`$${(val / 1000).toFixed(0)}K`, x, padT + chartH + 6);
    }
  }

  // X-axis title
  ctx.fillStyle = "#64748b";
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Price", W / 2, H - 6);

  // Y-axis title
  ctx.save();
  ctx.translate(12, padT + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Count", 0, 0);
  ctx.restore();

  // Helper: price to x position
  function priceToX(price: number): number {
    const frac = (price - bucketStart) / (bucketEnd - bucketStart);
    return padL + frac * chartW;
  }

  // Mean line (dashed green)
  const meanX = priceToX(meanPrice);
  ctx.strokeStyle = "#22c55e";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(meanX, padT);
  ctx.lineTo(meanX, padT + chartH);
  ctx.stroke();
  ctx.setLineDash([]);

  // Mean label
  ctx.fillStyle = "#22c55e";
  ctx.font = "bold 10px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Mean ${fmtCurrency(meanPrice)}`, meanX, padT + chartH + 22);

  // Median line (dashed yellow)
  const medianX = priceToX(medianPrice);
  ctx.strokeStyle = "#eab308";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(medianX, padT);
  ctx.lineTo(medianX, padT + chartH);
  ctx.stroke();
  ctx.setLineDash([]);

  // Median label
  ctx.fillStyle = "#eab308";
  ctx.font = "bold 10px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Median ${fmtCurrency(medianPrice)}`, medianX, padT + chartH + 36);

  // Target price bold RED line
  const targetX = priceToX(targetPrice);
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(targetX, padT - 5);
  ctx.lineTo(targetX, padT + chartH);
  ctx.stroke();

  // Percentile label
  const percentile = computePercentile(prices, targetPrice);
  ctx.fillStyle = "#ef4444";
  ctx.font = "bold 13px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${percentile}th percentile`, targetX, padT - 14);

  // Target price label
  ctx.font = "bold 10px -apple-system, sans-serif";
  ctx.fillText(`This Car: ${fmtCurrency(targetPrice)}`, targetX, padT - 2);
}

// ── Scatter Plot ───────────────────────────────────────────────────────────────

function renderScatter(): void {
  if (!result) return;
  const canvas = scatterCanvas;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;

  ctx.clearRect(0, 0, W, H);

  const listings = result.listings;
  const allMiles = listings.map((l) => l.miles);
  const allPrices = listings.map((l) => l.price);

  const minMiles = Math.min(...allMiles, result.target.miles);
  const maxMiles = Math.max(...allMiles, result.target.miles);
  const minPrice = Math.min(...allPrices, result.target.price);
  const maxPrice = Math.max(...allPrices, result.target.price);

  // Compute medians
  const sortedMiles = [...allMiles].sort((a, b) => a - b);
  const sortedPrices = [...allPrices].sort((a, b) => a - b);
  const medianMiles = sortedMiles.length % 2 === 0
    ? (sortedMiles[sortedMiles.length / 2 - 1] + sortedMiles[sortedMiles.length / 2]) / 2
    : sortedMiles[Math.floor(sortedMiles.length / 2)];
  const medianPrice = sortedPrices.length % 2 === 0
    ? (sortedPrices[sortedPrices.length / 2 - 1] + sortedPrices[sortedPrices.length / 2]) / 2
    : sortedPrices[Math.floor(sortedPrices.length / 2)];

  // Chart area
  const padL = 60;
  const padR = 20;
  const padT = 20;
  const padB = 50;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  // Add margin to data range
  const mileRange = maxMiles - minMiles || 10000;
  const priceRange = maxPrice - minPrice || 5000;
  const mileMin = minMiles - mileRange * 0.05;
  const mileMax = maxMiles + mileRange * 0.05;
  const priceMin = minPrice - priceRange * 0.05;
  const priceMax = maxPrice + priceRange * 0.05;

  function milesToX(m: number): number {
    return padL + ((m - mileMin) / (mileMax - mileMin)) * chartW;
  }
  function priceToY(p: number): number {
    return padT + chartH - ((p - priceMin) / (priceMax - priceMin)) * chartH;
  }

  // Grid
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 5; i++) {
    const y = padT + (chartH / 5) * i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    const x = padL + (chartW / 5) * i;
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + chartH); ctx.stroke();
  }

  // Quadrant lines at median price and mileage
  const medMX = milesToX(medianMiles);
  const medPY = priceToY(medianPrice);

  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  // Vertical median mileage
  ctx.beginPath();
  ctx.moveTo(medMX, padT);
  ctx.lineTo(medMX, padT + chartH);
  ctx.stroke();
  // Horizontal median price
  ctx.beginPath();
  ctx.moveTo(padL, medPY);
  ctx.lineTo(W - padR, medPY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Quadrant labels
  // Canvas Y is inverted: small Y = high price (top), large Y = low price (bottom)
  // X: left = low mileage, right = high mileage
  ctx.font = "bold 10px -apple-system, sans-serif";
  ctx.textAlign = "center";

  const qLabelOffsetY = chartH * 0.08;
  const leftCenterX = padL + (medMX - padL) / 2;
  const rightCenterX = medMX + (W - padR - medMX) / 2;

  // Above median price, left of median mileage = high price, low miles = "Premium Low-Mile" (blue)
  ctx.fillStyle = "#60a5fa";
  ctx.fillText("Premium Low-Mile", leftCenterX, medPY - qLabelOffsetY);

  // Above median price, right of median mileage = high price, high miles = "Overpriced High-Mile" (red)
  ctx.fillStyle = "#ef4444";
  ctx.fillText("Overpriced High-Mile", rightCenterX, medPY - qLabelOffsetY);

  // Below median price, left of median mileage = low price, low miles = "Underpriced Low-Mile" (green)
  ctx.fillStyle = "#22c55e";
  ctx.fillText("Underpriced Low-Mile", leftCenterX, medPY + qLabelOffsetY);

  // Below median price, right of median mileage = low price, high miles = "Cheap High-Mile" (yellow/amber)
  ctx.fillStyle = "#f59e0b";
  ctx.fillText("Cheap High-Mile", rightCenterX, medPY + qLabelOffsetY);

  // Scatter dots
  for (const l of listings) {
    const x = milesToX(l.miles);
    const y = priceToY(l.price);
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(96,165,250,0.7)";
    ctx.fill();
    ctx.strokeStyle = "rgba(96,165,250,0.9)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Target vehicle - large red dot
  const tx = milesToX(result.target.miles);
  const ty = priceToY(result.target.price);
  ctx.beginPath();
  ctx.arc(tx, ty, 9, 0, Math.PI * 2);
  ctx.fillStyle = "#ef4444";
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Target label
  ctx.fillStyle = "#ef4444";
  ctx.font = "bold 11px -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("This Car", tx + 14, ty - 2);
  ctx.font = "10px -apple-system, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(`${fmtNum(result.target.miles)} mi / ${fmtCurrency(result.target.price)}`, tx + 14, ty + 12);

  // X-axis labels
  ctx.fillStyle = "#64748b";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i <= 5; i++) {
    const mileVal = mileMin + ((mileMax - mileMin) / 5) * i;
    const x = padL + (chartW / 5) * i;
    ctx.fillText(`${(mileVal / 1000).toFixed(0)}K`, x, padT + chartH + 6);
  }

  // X-axis title
  ctx.fillStyle = "#64748b";
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Mileage", W / 2, H - 6);

  // Y-axis labels
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 5; i++) {
    const priceVal = priceMin + ((priceMax - priceMin) / 5) * (5 - i);
    const y = padT + (chartH / 5) * i;
    ctx.fillText(`$${(priceVal / 1000).toFixed(0)}K`, padL - 8, y);
  }

  // Y-axis title
  ctx.save();
  ctx.translate(12, padT + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "#64748b";
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Price", 0, 0);
  ctx.restore();
}

// ── Stats Bar Render ───────────────────────────────────────────────────────────

function renderStats(): void {
  if (!result) return;
  statsBar.innerHTML = "";
  const s = result.stats;
  const cards: [string, string][] = [
    ["Total Listings", String(s.count)],
    ["Mean Price", fmtCurrency(s.mean_price)],
    ["Median Price", fmtCurrency(s.median_price)],
    ["Std Dev", fmtCurrency(s.std_dev)],
    ["Min Price", fmtCurrency(s.min_price)],
    ["Max Price", fmtCurrency(s.max_price)],
    ["Avg DOM", `${s.avg_dom} days`],
  ];
  for (const [label, value] of cards) {
    statsBar.appendChild(buildStatCard(label, value));
  }
}

// ── Table Render ───────────────────────────────────────────────────────────────

function renderTable(): void {
  if (!result) return;
  const listings = [...result.listings];
  const median = result.stats.median_price;

  // Sort
  listings.sort((a, b) => {
    let va: string | number;
    let vb: string | number;
    switch (sortKey) {
      case "price": va = a.price; vb = b.price; break;
      case "miles": va = a.miles; vb = b.miles; break;
      case "trim": va = a.trim; vb = b.trim; break;
      case "dealer_name": va = a.dealer_name; vb = b.dealer_name; break;
      case "city": va = `${a.city}, ${a.state}`; vb = `${b.city}, ${b.state}`; break;
      case "dom": va = a.dom; vb = b.dom; break;
      case "priceVsMedian": va = a.price - median; vb = b.price - median; break;
      default: va = a.price; vb = b.price;
    }
    if (typeof va === "string" && typeof vb === "string") {
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });

  const countEl = tableWrapper.querySelector("#table-count");
  if (countEl) countEl.textContent = `${listings.length} results`;

  const cols: { label: string; key: SortKey; align: string }[] = [
    { label: "Price", key: "price", align: "right" },
    { label: "Miles", key: "miles", align: "right" },
    { label: "Trim", key: "trim", align: "left" },
    { label: "Dealer", key: "dealer_name", align: "left" },
    { label: "City/State", key: "city", align: "left" },
    { label: "DOM", key: "dom", align: "right" },
    { label: "Price vs Median", key: "priceVsMedian", align: "right" },
  ];

  let html = "<thead><tr>";
  for (const col of cols) {
    const arrow = sortKey === col.key ? (sortDir === "asc" ? " ▲" : " ▼") : "";
    html += `<th data-key="${col.key}" style="padding:10px 14px;text-align:${col.align};font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;cursor:pointer;border-bottom:1px solid #334155;white-space:nowrap;user-select:none;transition:color 0.15s;">${col.label}${arrow}</th>`;
  }
  html += "</tr></thead><tbody>";

  for (const l of listings) {
    const diff = l.price - median;
    const diffStr = diff >= 0 ? `+${fmtCurrency(diff)}` : `-${fmtCurrency(Math.abs(diff))}`;
    const diffColor = diff > 0 ? "#ef4444" : diff < 0 ? "#22c55e" : "#94a3b8";
    const rowLink = l.vdp_url
      ? ` onclick="window.open('${l.vdp_url}','_blank')" style="cursor:pointer;"`
      : "";

    html += `<tr${rowLink} onmouseenter="this.style.background='#1e293b'" onmouseleave="this.style.background='transparent'">`;
    html += `<td style="padding:9px 14px;text-align:right;font-weight:600;color:#f1f5f9;border-bottom:1px solid #1e293b;white-space:nowrap;">${fmtCurrency(l.price)}</td>`;
    html += `<td style="padding:9px 14px;text-align:right;color:#cbd5e1;border-bottom:1px solid #1e293b;white-space:nowrap;">${fmtNum(l.miles)}</td>`;
    html += `<td style="padding:9px 14px;text-align:left;color:#cbd5e1;border-bottom:1px solid #1e293b;white-space:nowrap;">${l.trim}</td>`;
    html += `<td style="padding:9px 14px;text-align:left;color:#cbd5e1;border-bottom:1px solid #1e293b;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;">${l.dealer_name}</td>`;
    html += `<td style="padding:9px 14px;text-align:left;color:#cbd5e1;border-bottom:1px solid #1e293b;white-space:nowrap;">${l.city}, ${l.state}</td>`;
    html += `<td style="padding:9px 14px;text-align:right;color:#cbd5e1;border-bottom:1px solid #1e293b;">${l.dom}</td>`;
    html += `<td style="padding:9px 14px;text-align:right;font-weight:600;color:${diffColor};border-bottom:1px solid #1e293b;white-space:nowrap;">${diffStr}</td>`;
    html += "</tr>";
  }

  html += "</tbody>";
  table.innerHTML = html;

  // Add sort handlers
  table.querySelectorAll("th").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key as SortKey;
      if (sortKey === key) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        sortKey = key;
        sortDir = "asc";
      }
      renderTable();
    });
    th.addEventListener("mouseenter", () => (th.style.color = "#f1f5f9"));
    th.addEventListener("mouseleave", () => (th.style.color = "#94a3b8"));
  });
}

// ── Resize Handler ─────────────────────────────────────────────────────────────

let resizeTimer: ReturnType<typeof setTimeout>;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (result) {
      renderHistogram();
      renderScatter();
    }
  }, 150);
});

// ── Auto-load mock data on start ───────────────────────────────────────────────

handleSearch();
