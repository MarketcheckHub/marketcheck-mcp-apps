import { App } from "@modelcontextprotocol/ext-apps";

const _safeApp = (() => { try { return new App({ name: "market-trends-dashboard" });

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

// ── Types ──────────────────────────────────────────────────────────────

interface MoverRow {
  rank: number;
  make: string;
  model: string;
  soldCount: number;
  avgPrice: number;
  avgDom: number;
  momChangePct: number;
}

interface PriceMoverRow {
  make: string;
  model: string;
  currentAvgPrice: number;
  priorAvgPrice: number;
  changeDollar: number;
  changePct: number;
}

interface SegmentSlice {
  label: string;
  count: number;
  pct: number;
  color: string;
}

interface BrandResidual {
  brand: string;
  pctMsrpRetained: number;
}

interface StateRankRow {
  state: string;
  avgPrice: number;
  volume: number;
  avgDom: number;
}

interface KpiData {
  totalSoldCount: number;
  soldMomPct: number;
  avgSalePrice: number;
  avgSalePriceDelta: number;
  avgDom: number;
  avgDomTrend: number;
  priceOverMsrpPct: number;
  priceOverMsrpTrend: number;
  evSharePct: number;
  evShareTrend: number;
}

interface DashboardData {
  kpis: KpiData;
  fastestMovers: MoverRow[];
  slowestMovers: MoverRow[];
  priceMovers: PriceMoverRow[];
  segmentMix: SegmentSlice[];
  brandResiduals: BrandResidual[];
  stateRanking: StateRankRow[];
}

// ── Filter State ───────────────────────────────────────────────────────

interface FilterState {
  period: string;
  geography: string;
  inventoryType: string;
  bodyType: string;
  fuelType: string;
  segmentFilter: string | null;
}

const STATES = [
  "National","AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY",
  "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

let filters: FilterState = {
  period: "90d",
  geography: "National",
  inventoryType: "Both",
  bodyType: "All",
  fuelType: "All",
  segmentFilter: null,
};

// ── Mock Data Generator ────────────────────────────────────────────────

function generateMockData(): DashboardData {
  const fastestModels = [
    { make: "Toyota", model: "RAV4" },
    { make: "Honda", model: "CR-V" },
    { make: "Tesla", model: "Model Y" },
    { make: "Toyota", model: "Camry" },
    { make: "Honda", model: "Civic" },
    { make: "Ford", model: "F-150" },
    { make: "Chevrolet", model: "Equinox" },
    { make: "Hyundai", model: "Tucson" },
    { make: "Kia", model: "Sportage" },
    { make: "Subaru", model: "Outback" },
  ];
  const slowestModels = [
    { make: "Chrysler", model: "300" },
    { make: "Buick", model: "Encore" },
    { make: "Dodge", model: "Charger" },
    { make: "Infiniti", model: "QX50" },
    { make: "Lincoln", model: "Corsair" },
    { make: "Acura", model: "TLX" },
    { make: "Cadillac", model: "XT4" },
    { make: "Alfa Romeo", model: "Giulia" },
    { make: "Jaguar", model: "F-PACE" },
    { make: "Maserati", model: "Ghibli" },
  ];

  const fastest: MoverRow[] = fastestModels.map((m, i) => ({
    rank: i + 1,
    make: m.make,
    model: m.model,
    soldCount: 18500 - i * 1200 + Math.floor(Math.random() * 400),
    avgPrice: 28000 + Math.floor(Math.random() * 15000),
    avgDom: 8 + i * 2 + Math.floor(Math.random() * 5),
    momChangePct: 12 - i * 0.8 + Math.random() * 3,
  }));

  const slowest: MoverRow[] = slowestModels.map((m, i) => ({
    rank: i + 1,
    make: m.make,
    model: m.model,
    soldCount: 1200 - i * 80 + Math.floor(Math.random() * 100),
    avgPrice: 32000 + Math.floor(Math.random() * 20000),
    avgDom: 65 + i * 8 + Math.floor(Math.random() * 10),
    momChangePct: -(8 + i * 1.5 + Math.random() * 3),
  }));

  const priceMoversRaw: PriceMoverRow[] = [
    { make: "Toyota", model: "Land Cruiser" },
    { make: "Porsche", model: "Macan" },
    { make: "Tesla", model: "Model 3" },
    { make: "Ford", model: "Bronco" },
    { make: "Toyota", model: "4Runner" },
    { make: "Chevrolet", model: "Corvette" },
    { make: "Jeep", model: "Wrangler" },
    { make: "Honda", model: "Civic Type R" },
    { make: "BMW", model: "X5" },
    { make: "Hyundai", model: "Ioniq 5" },
  ].map((m, i) => {
    const current = 38000 + Math.floor(Math.random() * 25000);
    const changePct = i < 5 ? (8 - i * 1.2 + Math.random() * 2) : -(3 + (i - 5) * 1.5 + Math.random() * 2);
    const prior = Math.round(current / (1 + changePct / 100));
    return {
      make: m.make,
      model: m.model,
      currentAvgPrice: current,
      priorAvgPrice: prior,
      changeDollar: current - prior,
      changePct: +changePct.toFixed(1),
    };
  });

  const segments: SegmentSlice[] = [
    { label: "SUV", count: 425000, pct: 35, color: "#3b82f6" },
    { label: "Sedan", count: 268000, pct: 22, color: "#8b5cf6" },
    { label: "Truck", count: 243000, pct: 20, color: "#f59e0b" },
    { label: "Coupe", count: 97000, pct: 8, color: "#ef4444" },
    { label: "Van", count: 85000, pct: 7, color: "#10b981" },
    { label: "Other", count: 97000, pct: 8, color: "#6b7280" },
  ];

  const brandResiduals: BrandResidual[] = [
    { brand: "Porsche", pctMsrpRetained: 97.2 },
    { brand: "Toyota", pctMsrpRetained: 96.1 },
    { brand: "Lexus", pctMsrpRetained: 95.4 },
    { brand: "Honda", pctMsrpRetained: 94.8 },
    { brand: "Subaru", pctMsrpRetained: 93.5 },
    { brand: "Mazda", pctMsrpRetained: 92.7 },
    { brand: "Hyundai", pctMsrpRetained: 91.3 },
    { brand: "Kia", pctMsrpRetained: 90.8 },
    { brand: "Ford", pctMsrpRetained: 89.4 },
    { brand: "Chevrolet", pctMsrpRetained: 88.2 },
    { brand: "Nissan", pctMsrpRetained: 87.6 },
    { brand: "Volkswagen", pctMsrpRetained: 86.1 },
    { brand: "BMW", pctMsrpRetained: 85.3 },
    { brand: "Audi", pctMsrpRetained: 83.9 },
    { brand: "Mercedes-Benz", pctMsrpRetained: 82.4 },
  ];

  const stateRanking: StateRankRow[] = [
    { state: "TX", avgPrice: 34200, volume: 142000, avgDom: 28 },
    { state: "CA", avgPrice: 38900, volume: 138000, avgDom: 22 },
    { state: "FL", avgPrice: 33500, volume: 118000, avgDom: 25 },
    { state: "NY", avgPrice: 36100, volume: 89000, avgDom: 30 },
    { state: "PA", avgPrice: 31800, volume: 72000, avgDom: 32 },
    { state: "IL", avgPrice: 32400, volume: 68000, avgDom: 29 },
    { state: "OH", avgPrice: 30100, volume: 65000, avgDom: 34 },
    { state: "GA", avgPrice: 33200, volume: 62000, avgDom: 27 },
    { state: "NC", avgPrice: 32700, volume: 58000, avgDom: 26 },
    { state: "MI", avgPrice: 31500, volume: 55000, avgDom: 31 },
    { state: "NJ", avgPrice: 35800, volume: 52000, avgDom: 28 },
    { state: "VA", avgPrice: 34100, volume: 49000, avgDom: 25 },
    { state: "WA", avgPrice: 37200, volume: 45000, avgDom: 23 },
    { state: "AZ", avgPrice: 33800, volume: 43000, avgDom: 24 },
    { state: "CO", avgPrice: 35400, volume: 41000, avgDom: 22 },
  ];

  return {
    kpis: {
      totalSoldCount: 1215000,
      soldMomPct: 4.2,
      avgSalePrice: 34850,
      avgSalePriceDelta: 620,
      avgDom: 28,
      avgDomTrend: -2.1,
      priceOverMsrpPct: 3.8,
      priceOverMsrpTrend: -0.6,
      evSharePct: 9.4,
      evShareTrend: 1.8,
    },
    fastestMovers: fastest,
    slowestMovers: slowest,
    priceMovers: priceMoversRaw,
    segmentMix: segments,
    brandResiduals,
    stateRanking,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

function fmt$(v: number): string {
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtN(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return v.toLocaleString();
}

function fmtPct(v: number): string {
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}

function trendArrow(v: number): string {
  return v > 0 ? "\u25B2" : v < 0 ? "\u25BC" : "\u25CF";
}

function trendColor(v: number, invertGood = false): string {
  if (v === 0) return "#94a3b8";
  const positive = invertGood ? v < 0 : v > 0;
  return positive ? "#22c55e" : "#ef4444";
}

// ── Render ─────────────────────────────────────────────────────────────

let data: DashboardData;
let moverTab: "fastest" | "slowest" = "fastest";
let stateSortCol: keyof StateRankRow = "volume";
let stateSortDir: "asc" | "desc" = "desc";

function render() {
  data = generateMockData();
  document.body.innerHTML = "";

  const root = document.createElement("div");
  root.id = "app";
  root.style.cssText = `
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 20px;
  `;
  document.body.appendChild(root);

  // Title
  const title = document.createElement("h1");
  title.textContent = "Market Trends Dashboard";
  title.style.cssText = `font-size:24px;font-weight:700;margin-bottom:16px;color:#f1f5f9;`;
  root.appendChild(title);

  // Filter Bar
  root.appendChild(buildFilterBar());

  // KPI Ribbon
  root.appendChild(buildKpiRibbon());

  // Middle row: Movers + Price Movers
  const midRow = document.createElement("div");
  midRow.style.cssText = `display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;`;
  midRow.appendChild(buildMoversTable());
  midRow.appendChild(buildPriceMoversTable());
  root.appendChild(midRow);

  // Bottom row: Donut + Bar Chart + State Table
  const botRow = document.createElement("div");
  botRow.style.cssText = `display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;`;
  botRow.appendChild(buildDonutChart());
  botRow.appendChild(buildResidualBarChart());
  botRow.appendChild(buildStateTable());
  root.appendChild(botRow);
}

// ── Filter Bar ─────────────────────────────────────────────────────────

function buildFilterBar(): HTMLElement {
  const bar = document.createElement("div");
  bar.style.cssText = `
    display:flex;flex-wrap:wrap;align-items:center;gap:12px;
    background:#1e293b;border-radius:10px;padding:12px 16px;margin-bottom:16px;
  `;

  // Period pills
  const periodGroup = pillGroup("Period", ["30d", "60d", "90d", "6M", "1Y"], filters.period, (v) => {
    filters.period = v;
    fetchData();
  });
  bar.appendChild(periodGroup);

  // Geography dropdown
  const geoWrap = document.createElement("div");
  geoWrap.style.cssText = `display:flex;align-items:center;gap:6px;`;
  const geoLabel = document.createElement("span");
  geoLabel.textContent = "Geography";
  geoLabel.style.cssText = `font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;`;
  geoWrap.appendChild(geoLabel);
  const sel = document.createElement("select");
  sel.style.cssText = `
    background:#334155;color:#e2e8f0;border:1px solid #475569;border-radius:6px;
    padding:6px 10px;font-size:13px;cursor:pointer;outline:none;
  `;
  STATES.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    if (s === filters.geography) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener("change", () => {
    filters.geography = sel.value;
    fetchData();
  });
  geoWrap.appendChild(sel);
  bar.appendChild(geoWrap);

  // Inventory Type toggle
  bar.appendChild(
    pillGroup("Inventory", ["New", "Used", "Both"], filters.inventoryType, (v) => {
      filters.inventoryType = v;
      fetchData();
    })
  );

  // Body type chips
  bar.appendChild(
    pillGroup("Body Type", ["All", "SUV", "Sedan", "Truck"], filters.bodyType, (v) => {
      filters.bodyType = v;
      filters.segmentFilter = null;
      fetchData();
    })
  );

  // Fuel type chips
  bar.appendChild(
    pillGroup("Fuel", ["All", "ICE", "EV", "Hybrid"], filters.fuelType, (v) => {
      filters.fuelType = v;
      fetchData();
    })
  );

  // Segment filter indicator
  if (filters.segmentFilter) {
    const segBadge = document.createElement("div");
    segBadge.style.cssText = `
      display:flex;align-items:center;gap:4px;background:#3b82f6;color:#fff;
      border-radius:12px;padding:4px 10px;font-size:12px;cursor:pointer;
    `;
    segBadge.innerHTML = `Segment: ${filters.segmentFilter} <span style="margin-left:4px;font-weight:700;">\u00D7</span>`;
    segBadge.addEventListener("click", () => {
      filters.segmentFilter = null;
      render();
    });
    bar.appendChild(segBadge);
  }

  return bar;
}

function pillGroup(
  label: string,
  options: string[],
  active: string,
  onChange: (v: string) => void
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = `display:flex;align-items:center;gap:6px;`;
  const lbl = document.createElement("span");
  lbl.textContent = label;
  lbl.style.cssText = `font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-right:2px;`;
  wrap.appendChild(lbl);

  const pillContainer = document.createElement("div");
  pillContainer.style.cssText = `display:flex;gap:2px;background:#0f172a;border-radius:8px;padding:2px;`;

  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.textContent = opt;
    const isActive = opt === active;
    btn.style.cssText = `
      border:none;border-radius:6px;padding:5px 12px;font-size:12px;font-weight:500;
      cursor:pointer;transition:all 0.15s;
      background:${isActive ? "#3b82f6" : "transparent"};
      color:${isActive ? "#fff" : "#94a3b8"};
    `;
    btn.addEventListener("mouseenter", () => {
      if (!isActive) btn.style.background = "#1e293b";
    });
    btn.addEventListener("mouseleave", () => {
      if (!isActive) btn.style.background = "transparent";
    });
    btn.addEventListener("click", () => onChange(opt));
    pillContainer.appendChild(btn);
  });

  wrap.appendChild(pillContainer);
  return wrap;
}

// ── KPI Ribbon ─────────────────────────────────────────────────────────

function buildKpiRibbon(): HTMLElement {
  const ribbon = document.createElement("div");
  ribbon.style.cssText = `
    display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px;
  `;

  const { kpis } = data;

  const cards: { label: string; value: string; trend: number; trendLabel: string; invertGood?: boolean }[] = [
    { label: "Total Sold Count", value: fmtN(kpis.totalSoldCount), trend: kpis.soldMomPct, trendLabel: fmtPct(kpis.soldMomPct) + " MoM" },
    { label: "Avg Sale Price", value: fmt$(kpis.avgSalePrice), trend: kpis.avgSalePriceDelta, trendLabel: (kpis.avgSalePriceDelta >= 0 ? "+" : "") + fmt$(kpis.avgSalePriceDelta) },
    { label: "Avg DOM", value: kpis.avgDom + " days", trend: kpis.avgDomTrend, trendLabel: fmtPct(kpis.avgDomTrend), invertGood: true },
    { label: "Price over MSRP", value: kpis.priceOverMsrpPct.toFixed(1) + "%", trend: kpis.priceOverMsrpTrend, trendLabel: fmtPct(kpis.priceOverMsrpTrend), invertGood: true },
    { label: "EV Share", value: kpis.evSharePct.toFixed(1) + "%", trend: kpis.evShareTrend, trendLabel: fmtPct(kpis.evShareTrend) },
  ];

  cards.forEach((c) => {
    const card = document.createElement("div");
    card.style.cssText = `
      background:#1e293b;border-radius:10px;padding:16px;
      display:flex;flex-direction:column;gap:6px;
    `;

    const labelEl = document.createElement("div");
    labelEl.textContent = c.label;
    labelEl.style.cssText = `font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;`;

    const valueEl = document.createElement("div");
    valueEl.textContent = c.value;
    valueEl.style.cssText = `font-size:26px;font-weight:700;color:#f1f5f9;`;

    const trendEl = document.createElement("div");
    const tc = trendColor(c.trend, c.invertGood);
    trendEl.innerHTML = `<span style="color:${tc};font-size:13px;">${trendArrow(c.trend)} ${c.trendLabel}</span>`;

    card.appendChild(labelEl);
    card.appendChild(valueEl);
    card.appendChild(trendEl);
    ribbon.appendChild(card);
  });

  return ribbon;
}

// ── Fastest / Slowest Movers Table ─────────────────────────────────────

function buildMoversTable(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = `background:#1e293b;border-radius:10px;padding:16px;display:flex;flex-direction:column;`;

  // Toggle tabs
  const tabs = document.createElement("div");
  tabs.style.cssText = `display:flex;gap:0;margin-bottom:12px;`;

  (["fastest", "slowest"] as const).forEach((t) => {
    const btn = document.createElement("button");
    btn.textContent = t === "fastest" ? "Fastest Movers" : "Slowest Movers";
    const isActive = moverTab === t;
    btn.style.cssText = `
      flex:1;border:none;padding:8px 0;font-size:13px;font-weight:600;cursor:pointer;
      transition:all 0.15s;
      background:${isActive ? (t === "fastest" ? "#166534" : "#991b1b") : "#0f172a"};
      color:${isActive ? "#fff" : "#94a3b8"};
      border-radius:${t === "fastest" ? "8px 0 0 8px" : "0 8px 8px 0"};
    `;
    btn.addEventListener("click", () => {
      moverTab = t;
      render();
    });
    tabs.appendChild(btn);
  });
  wrap.appendChild(tabs);

  const rows = moverTab === "fastest" ? data.fastestMovers : data.slowestMovers;
  const tintBg = moverTab === "fastest" ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)";
  const tintColor = moverTab === "fastest" ? "#22c55e" : "#ef4444";

  const table = document.createElement("table");
  table.style.cssText = `width:100%;border-collapse:collapse;font-size:13px;`;

  const thead = document.createElement("thead");
  thead.innerHTML = `<tr style="border-bottom:1px solid #334155;">
    <th style="text-align:left;padding:8px 6px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">#</th>
    <th style="text-align:left;padding:8px 6px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Make / Model</th>
    <th style="text-align:right;padding:8px 6px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Sold</th>
    <th style="text-align:right;padding:8px 6px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Avg Price</th>
    <th style="text-align:right;padding:8px 6px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Avg DOM</th>
    <th style="text-align:right;padding:8px 6px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">MoM %</th>
  </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.style.cssText = `border-bottom:1px solid #1e293b;background:${tintBg};`;
    tr.addEventListener("mouseenter", () => (tr.style.background = "#334155"));
    tr.addEventListener("mouseleave", () => (tr.style.background = tintBg));
    tr.innerHTML = `
      <td style="padding:7px 6px;color:#64748b;font-weight:600;">${r.rank}</td>
      <td style="padding:7px 6px;color:#f1f5f9;font-weight:500;">${r.make} ${r.model}</td>
      <td style="padding:7px 6px;text-align:right;color:#cbd5e1;">${fmtN(r.soldCount)}</td>
      <td style="padding:7px 6px;text-align:right;color:#cbd5e1;">${fmt$(r.avgPrice)}</td>
      <td style="padding:7px 6px;text-align:right;color:#cbd5e1;">${r.avgDom}d</td>
      <td style="padding:7px 6px;text-align:right;color:${tintColor};font-weight:600;">${fmtPct(r.momChangePct)}</td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);

  return wrap;
}

// ── Price Movers Table ─────────────────────────────────────────────────

function buildPriceMoversTable(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = `background:#1e293b;border-radius:10px;padding:16px;display:flex;flex-direction:column;`;

  const header = document.createElement("div");
  header.textContent = "Price Movers - Top 10 by Price Change";
  header.style.cssText = `font-size:14px;font-weight:600;color:#f1f5f9;margin-bottom:12px;`;
  wrap.appendChild(header);

  const table = document.createElement("table");
  table.style.cssText = `width:100%;border-collapse:collapse;font-size:13px;`;

  const thead = document.createElement("thead");
  thead.innerHTML = `<tr style="border-bottom:1px solid #334155;">
    <th style="text-align:left;padding:8px 6px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Make / Model</th>
    <th style="text-align:right;padding:8px 6px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Curr Avg</th>
    <th style="text-align:right;padding:8px 6px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Prior Avg</th>
    <th style="text-align:right;padding:8px 6px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Change $</th>
    <th style="text-align:right;padding:8px 6px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Change %</th>
  </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  data.priceMovers.forEach((r) => {
    const isPositive = r.changeDollar >= 0;
    const rowTint = isPositive ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)";
    const changeColor = isPositive ? "#22c55e" : "#ef4444";

    const tr = document.createElement("tr");
    tr.style.cssText = `border-bottom:1px solid #1e293b;background:${rowTint};`;
    tr.addEventListener("mouseenter", () => (tr.style.background = "#334155"));
    tr.addEventListener("mouseleave", () => (tr.style.background = rowTint));
    tr.innerHTML = `
      <td style="padding:7px 6px;color:#f1f5f9;font-weight:500;">${r.make} ${r.model}</td>
      <td style="padding:7px 6px;text-align:right;color:#cbd5e1;">${fmt$(r.currentAvgPrice)}</td>
      <td style="padding:7px 6px;text-align:right;color:#64748b;">${fmt$(r.priorAvgPrice)}</td>
      <td style="padding:7px 6px;text-align:right;color:${changeColor};font-weight:600;">${(r.changeDollar >= 0 ? "+" : "") + fmt$(r.changeDollar)}</td>
      <td style="padding:7px 6px;text-align:right;color:${changeColor};font-weight:600;">${fmtPct(r.changePct)}</td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);

  return wrap;
}

// ── Segment Mix Donut Chart (Canvas 2D) ────────────────────────────────

function buildDonutChart(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = `background:#1e293b;border-radius:10px;padding:16px;display:flex;flex-direction:column;`;

  const header = document.createElement("div");
  header.textContent = "Segment Mix";
  header.style.cssText = `font-size:14px;font-weight:600;color:#f1f5f9;margin-bottom:12px;`;
  wrap.appendChild(header);

  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 300;
  canvas.style.cssText = `width:100%;max-width:400px;align-self:center;cursor:pointer;`;
  wrap.appendChild(canvas);

  // Legend
  const legend = document.createElement("div");
  legend.style.cssText = `display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;justify-content:center;`;
  data.segmentMix.forEach((s) => {
    const item = document.createElement("div");
    item.style.cssText = `display:flex;align-items:center;gap:4px;font-size:11px;color:#cbd5e1;cursor:pointer;`;
    const dot = document.createElement("span");
    dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${s.color};display:inline-block;`;
    item.appendChild(dot);
    item.appendChild(document.createTextNode(`${s.label} ${s.pct}% (${fmtN(s.count)})`));
    item.addEventListener("click", () => {
      filters.segmentFilter = filters.segmentFilter === s.label ? null : s.label;
      filters.bodyType = filters.segmentFilter || "All";
      render();
    });
    legend.appendChild(item);
  });
  wrap.appendChild(legend);

  // Draw donut after append
  requestAnimationFrame(() => drawDonut(canvas, data.segmentMix));

  // Click on canvas to filter by segment
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const r = Math.min(cx, cy) - 20;
    const innerR = r * 0.55;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < innerR || dist > r) return;

    let angle = Math.atan2(dy, dx);
    if (angle < -Math.PI / 2) angle += 2 * Math.PI;
    const startOffset = -Math.PI / 2;
    const clickAngle = angle - startOffset;
    const positiveAngle = clickAngle < 0 ? clickAngle + 2 * Math.PI : clickAngle;

    let cumAngle = 0;
    const total = data.segmentMix.reduce((a, s) => a + s.pct, 0);
    for (const seg of data.segmentMix) {
      const segAngle = (seg.pct / total) * 2 * Math.PI;
      if (positiveAngle >= cumAngle && positiveAngle < cumAngle + segAngle) {
        filters.segmentFilter = filters.segmentFilter === seg.label ? null : seg.label;
        filters.bodyType = filters.segmentFilter || "All";
        render();
        return;
      }
      cumAngle += segAngle;
    }
  });

  return wrap;
}

function drawDonut(canvas: HTMLCanvasElement, segments: SegmentSlice[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(cx, cy) - 20;
  const innerR = r * 0.55;

  ctx.clearRect(0, 0, w, h);

  const total = segments.reduce((a, s) => a + s.pct, 0);
  let startAngle = -Math.PI / 2;

  segments.forEach((seg) => {
    const sliceAngle = (seg.pct / total) * 2 * Math.PI;
    const endAngle = startAngle + sliceAngle;

    // Highlight selected segment
    const isSelected = filters.segmentFilter === seg.label;
    const offset = isSelected ? 8 : 0;
    const midAngle = startAngle + sliceAngle / 2;
    const offX = offset * Math.cos(midAngle);
    const offY = offset * Math.sin(midAngle);

    ctx.beginPath();
    ctx.arc(cx + offX, cy + offY, r, startAngle, endAngle);
    ctx.arc(cx + offX, cy + offY, innerR, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = isSelected ? seg.color : seg.color + "cc";
    ctx.fill();

    // Label on slice
    const labelAngle = startAngle + sliceAngle / 2;
    const labelR = innerR + (r - innerR) / 2;
    const lx = cx + offX + labelR * Math.cos(labelAngle);
    const ly = cy + offY + labelR * Math.sin(labelAngle);

    if (seg.pct >= 7) {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${seg.pct}%`, lx, ly);
    }

    startAngle = endAngle;
  });

  // Center text
  ctx.fillStyle = "#f1f5f9";
  ctx.font = "bold 18px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const totalCount = segments.reduce((a, s) => a + s.count, 0);
  ctx.fillText(fmtN(totalCount), cx, cy - 8);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px -apple-system, sans-serif";
  ctx.fillText("Total Units", cx, cy + 12);
}

// ── Brand Residual Bar Chart (Canvas 2D) ───────────────────────────────

function buildResidualBarChart(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = `background:#1e293b;border-radius:10px;padding:16px;display:flex;flex-direction:column;`;

  const header = document.createElement("div");
  header.textContent = "Brand Residual Value (% of MSRP Retained)";
  header.style.cssText = `font-size:14px;font-weight:600;color:#f1f5f9;margin-bottom:12px;`;
  wrap.appendChild(header);

  const canvas = document.createElement("canvas");
  canvas.width = 440;
  canvas.height = 420;
  canvas.style.cssText = `width:100%;`;
  wrap.appendChild(canvas);

  // Legend
  const legendWrap = document.createElement("div");
  legendWrap.style.cssText = `display:flex;gap:12px;margin-top:10px;justify-content:center;flex-wrap:wrap;`;
  const legendItems = [
    { color: "#22c55e", label: ">95%" },
    { color: "#3b82f6", label: "90-95%" },
    { color: "#eab308", label: "85-90%" },
    { color: "#ef4444", label: "<85%" },
  ];
  legendItems.forEach((l) => {
    const item = document.createElement("div");
    item.style.cssText = `display:flex;align-items:center;gap:4px;font-size:11px;color:#cbd5e1;`;
    const dot = document.createElement("span");
    dot.style.cssText = `width:8px;height:8px;border-radius:2px;background:${l.color};display:inline-block;`;
    item.appendChild(dot);
    item.appendChild(document.createTextNode(l.label));
    legendWrap.appendChild(item);
  });
  wrap.appendChild(legendWrap);

  requestAnimationFrame(() => drawResidualBars(canvas, data.brandResiduals));

  return wrap;
}

function drawResidualBars(canvas: HTMLCanvasElement, brands: BrandResidual[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const labelWidth = 110;
  const valueWidth = 50;
  const chartLeft = labelWidth;
  const chartRight = w - valueWidth - 10;
  const chartWidth = chartRight - chartLeft;
  const barHeight = 22;
  const gap = 5;
  const topPad = 5;

  const minVal = 78;
  const maxVal = 100;

  brands.forEach((b, i) => {
    const y = topPad + i * (barHeight + gap);
    const pct = (b.pctMsrpRetained - minVal) / (maxVal - minVal);
    const barW = Math.max(0, pct * chartWidth);

    // Color by retention
    let color: string;
    if (b.pctMsrpRetained > 95) color = "#22c55e";
    else if (b.pctMsrpRetained >= 90) color = "#3b82f6";
    else if (b.pctMsrpRetained >= 85) color = "#eab308";
    else color = "#ef4444";

    // Brand label
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "12px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(b.brand, labelWidth - 10, y + barHeight / 2);

    // Bar
    ctx.beginPath();
    const radius = 4;
    ctx.roundRect(chartLeft, y, barW, barHeight, [0, radius, radius, 0]);
    ctx.fillStyle = color;
    ctx.fill();

    // Value label
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(b.pctMsrpRetained.toFixed(1) + "%", chartLeft + barW + 6, y + barHeight / 2);
  });
}

// ── State Ranking Table ────────────────────────────────────────────────

function buildStateTable(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = `background:#1e293b;border-radius:10px;padding:16px;display:flex;flex-direction:column;`;

  const header = document.createElement("div");
  header.textContent = "State Ranking - Top 15 by Volume";
  header.style.cssText = `font-size:14px;font-weight:600;color:#f1f5f9;margin-bottom:12px;`;
  wrap.appendChild(header);

  // Sort data
  const sorted = [...data.stateRanking].sort((a, b) => {
    const av = a[stateSortCol];
    const bv = b[stateSortCol];
    if (typeof av === "number" && typeof bv === "number") {
      return stateSortDir === "asc" ? av - bv : bv - av;
    }
    return stateSortDir === "asc"
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  const table = document.createElement("table");
  table.style.cssText = `width:100%;border-collapse:collapse;font-size:13px;`;

  const cols: { key: keyof StateRankRow; label: string; align: string }[] = [
    { key: "state", label: "State", align: "left" },
    { key: "avgPrice", label: "Avg Price", align: "right" },
    { key: "volume", label: "Volume", align: "right" },
    { key: "avgDom", label: "Avg DOM", align: "right" },
  ];

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.style.cssText = `border-bottom:1px solid #334155;`;
  cols.forEach((col) => {
    const th = document.createElement("th");
    th.style.cssText = `
      text-align:${col.align};padding:8px 6px;color:#94a3b8;font-weight:600;
      font-size:11px;text-transform:uppercase;cursor:pointer;user-select:none;
    `;
    const sortIndicator =
      stateSortCol === col.key ? (stateSortDir === "asc" ? " \u25B2" : " \u25BC") : "";
    th.textContent = col.label + sortIndicator;
    th.addEventListener("click", () => {
      if (stateSortCol === col.key) {
        stateSortDir = stateSortDir === "asc" ? "desc" : "asc";
      } else {
        stateSortCol = col.key;
        stateSortDir = col.key === "state" ? "asc" : "desc";
      }
      render();
    });
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  sorted.forEach((r) => {
    const tr = document.createElement("tr");
    tr.style.cssText = `border-bottom:1px solid rgba(51,65,85,0.5);`;
    tr.addEventListener("mouseenter", () => (tr.style.background = "#334155"));
    tr.addEventListener("mouseleave", () => (tr.style.background = "transparent"));
    tr.innerHTML = `
      <td style="padding:7px 6px;color:#f1f5f9;font-weight:600;">${r.state}</td>
      <td style="padding:7px 6px;text-align:right;color:#cbd5e1;">${fmt$(r.avgPrice)}</td>
      <td style="padding:7px 6px;text-align:right;color:#cbd5e1;">${fmtN(r.volume)}</td>
      <td style="padding:7px 6px;text-align:right;color:#cbd5e1;">${r.avgDom}d</td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);

  return wrap;
}

// ── MCP Data Fetch ─────────────────────────────────────────────────────


async function fetchData() {
  try {
    await _safeApp?.callServerTool({
      name: "market-trends-dashboard",
      arguments: {
        state: filters.geography,
        inventoryType: filters.inventoryType,
        bodyType: filters.bodyType,
        fuelType: filters.fuelType,
        period: filters.period,
      },
    });
  } catch {
    // Server tool not available; use mock data
  }
  render();
}

// ── Bootstrap ──────────────────────────────────────────────────────────

render();
