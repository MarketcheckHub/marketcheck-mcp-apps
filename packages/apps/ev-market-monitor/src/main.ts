/**
 * EV Market Monitor
 * Adoption trend, price parity, brand leaderboard, state penetration, depreciation
 * comparison — all derived from the Enterprise Sold Summary API.
 */
import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "ev-market-monitor" }); } catch {}

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
  if (_getAuth().value) return "live";
  if (_safeApp && window.parent !== window) return "mcp";
  return "demo";
}

function _isEmbedMode(): boolean {
  return new URLSearchParams(location.search).has("embed");
}

function _getUrlParams(): Record<string, string> {
  const params = new URLSearchParams(location.search);
  const result: Record<string, string> = {};
  for (const key of ["state", "bodyType", "body_type"]) {
    const v = params.get(key);
    if (v) result[key] = v;
  }
  return result;
}

function _proxyBase(): string {
  return location.protocol.startsWith("http") ? "" : "http://localhost:3001";
}

// ── Direct MarketCheck API Client ─────────────────────────────────────
const _MC = "https://api.marketcheck.com";
async function _mcApi(path: string, params: Record<string, any> = {}) {
  const auth = _getAuth();
  if (!auth.value) return null;
  const prefix = path.startsWith("/api/") ? "" : "/v2";
  const url = new URL(_MC + prefix + path);
  if (auth.mode === "api_key") url.searchParams.set("api_key", auth.value);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = {};
  if (auth.mode === "oauth_token") headers["Authorization"] = "Bearer " + auth.value;
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error("MC API " + res.status);
  return res.json();
}
function _mcRecents(p: Record<string, any>) { return _mcApi("/search/car/recents", p); }

// Classify a fuel_type facet label into EV / Hybrid / ICE buckets.
// The API's `fuel_type` facet returns surface-level labels like "Unleaded",
// "Electric", "Electric / Unleaded" (a hybrid), "Diesel", etc.
function _fuelBucket(label: string): "EV" | "Hybrid" | "ICE" | null {
  if (!label) return null;
  const s = label.toLowerCase();
  if (s === "electric") return "EV";
  if (s.includes("electric") && s.includes("/")) return "Hybrid";
  if (s === "hydrogen" || (s.includes("electric") && s.includes("hydrogen"))) return "EV";
  if (
    s.includes("unleaded") ||
    s.includes("diesel") ||
    s.includes("e85") ||
    s.includes("biodiesel") ||
    s.includes("natural gas") ||
    s.includes("lpg")
  ) {
    return "ICE";
  }
  return null;
}

// Body types we show in the parity chart. Using API's canonical labels.
const _PARITY_BODY_TYPES = ["SUV", "Sedan", "Pickup", "Hatchback"];

async function _fetchDirect(args: { bodyType?: string; state?: string }): Promise<any> {
  const baseFilter: Record<string, any> = { car_type: "used" };
  if (args.state) baseFilter.state = args.state;

  // ── 1. Current fuel mix (snapshot) ──
  const fuelMixAll = _mcRecents({ ...baseFilter, rows: 0, facets: "fuel_type" });

  // ── 2. EV filter is used repeatedly ──
  const evFilter = { ...baseFilter, fuel_type: "Electric", rows: 0 };

  // ── 3. EV brand leaderboard (volume/price/DOM via top-level stats) ──
  const evByMake = _mcRecents({ ...evFilter, facets: "make", stats: "price,dom" });

  // ── 4. EV state distribution + all-fuel state totals for penetration ──
  const evByState = _mcRecents({ ...evFilter, facets: "state" });
  const allByState = _mcRecents({ ...baseFilter, rows: 0, facets: "state" });

  // ── 5. EV body-type distribution (for the parity chart category list) ──
  const evByBody = _mcRecents({ ...evFilter, facets: "body_type" });

  // ── 6. Per-body-type EV price + ICE price (4 body types × 2 fuels = 8 calls) ──
  const parityCalls: Promise<any>[] = [];
  for (const bt of _PARITY_BODY_TYPES) {
    parityCalls.push(_mcRecents({ ...baseFilter, rows: 0, fuel_type: "Electric", body_type: bt, stats: "price" }));
    parityCalls.push(_mcRecents({ ...baseFilter, rows: 0, fuel_type: "Unleaded", body_type: bt, stats: "price" }));
  }

  // ── 7. DOM per top-10 EV makes — for supply + DOM cards ──
  //     (fetched via the `evByMake` stats block, plus one per top make for accuracy)
  // We resolve evByMake first to know the top makes, then fire DOM calls.
  const [fuelMixAllR, evByMakeR, evByStateR, allByStateR, evByBodyR, ...parityResults] = await Promise.all([
    fuelMixAll, evByMake, evByState, allByState, evByBody, ...parityCalls,
  ]);

  // Per-make DOM: fetch stats for top 10 EV makes in parallel.
  const evMakes: string[] = (evByMakeR?.facets?.make ?? [])
    .slice(0, 10)
    .map((f: any) => String(f.item ?? ""))
    .filter(Boolean);
  const perMakeStatsP = Promise.all(
    evMakes.map((mk) =>
      _mcRecents({ ...evFilter, make: mk, stats: "price,dom" })
        .then((r: any) => ({ make: mk, stats: r?.stats }))
        .catch(() => ({ make: mk, stats: null }))
    )
  );

  // ── 8. Depreciation curve: average price by model year, SUV (or user bodyType) ──
  // Use SUV by default — it dominates EV volume — to keep apples-to-apples.
  const depBody = args.bodyType ?? "SUV";
  const currentYear = new Date().getFullYear();
  const depYears: number[] = [];
  for (let y = currentYear; y >= currentYear - 6; y--) depYears.push(y);
  const depCalls = depYears.flatMap((y) => [
    _mcRecents({ ...baseFilter, rows: 0, fuel_type: "Electric", body_type: depBody, year: y, stats: "price" })
      .then((r: any) => ({ year: y, fuel: "EV", stats: r?.stats }))
      .catch(() => ({ year: y, fuel: "EV", stats: null })),
    _mcRecents({ ...baseFilter, rows: 0, fuel_type: "Unleaded", body_type: depBody, year: y, stats: "price" })
      .then((r: any) => ({ year: y, fuel: "ICE", stats: r?.stats }))
      .catch(() => ({ year: y, fuel: "ICE", stats: null })),
  ]);

  const [perMakeStats, depRows] = await Promise.all([
    perMakeStatsP,
    Promise.all(depCalls),
  ]);

  return {
    fuelMixAll: fuelMixAllR,
    evByMake: evByMakeR,
    evByState: evByStateR,
    allByState: allByStateR,
    evByBody: evByBodyR,
    parityByBody: _PARITY_BODY_TYPES.map((bt, i) => ({
      bodyType: bt,
      ev: parityResults[i * 2],
      ice: parityResults[i * 2 + 1],
    })),
    perMakeStats,
    depRows,
    depBody,
    state: args.state,
  };
}

async function _callTool(toolName: string, args: Record<string, any>): Promise<any> {
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
    try {
      const d = await _fetchDirect(args);
      if (d) return { content: [{ type: "text", text: JSON.stringify(d) }] };
    } catch (e) { console.warn("Direct fetch failed", e); }
  }
  if (_safeApp) {
    try { return await _safeApp.callServerTool({ name: toolName, arguments: args }); } catch {}
  }
  return null;
}

// ── UI Chrome ──────────────────────────────────────────────────────────
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

(_safeApp as any)?.connect?.();

// ─── Colors ────────────────────────────────────────────────────────────────

const C = {
  bg: "#0f172a",
  surface: "#1e293b",
  surfaceLight: "#334155",
  border: "#475569",
  text: "#f1f5f9",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  blue: "#3b82f6",
  blueLight: "#60a5fa",
  green: "#22c55e",
  greenLight: "#4ade80",
  orange: "#f97316",
  orangeLight: "#fb923c",
  red: "#ef4444",
  gray: "#6b7280",
  grayLight: "#9ca3af",
  purple: "#a855f7",
  yellow: "#eab308",
  cyan: "#06b6d4",
  white: "#ffffff",
};

// ─── Types ─────────────────────────────────────────────────────────────────

type MonthPoint = { label: string; ev: number; hybrid: number; ice: number };
type ParityRow = { bodyType: string; evPrice: number; icePrice: number };
type BrandRow = { rank: number; make: string; volume: number; evShare: number; avgPrice: number; deprecRate: number; daysSupply: number; trend: "up" | "down" | "flat" };
type StateRow = { state: string; penetration: number; volume: number; yoyChange: number };
type KpiData = {
  evPenetration: { value: number; trend: number; label: string };
  priceGap: { value: number; label: string };
  deprecRatio: { value: number; label: string };
  avgDaysSupply: { value: number; label: string };
  avgDOM: { value: number; label: string };
};
type DashboardData = {
  months: string[];
  evPct: number[];
  hybridPct: number[];
  icePct: number[];
  parity: ParityRow[];
  brands: BrandRow[];
  states: StateRow[];
  evDepreciation: number[];
  iceDepreciation: number[];
  depLabels: string[];     // X-axis labels for depreciation chart
  depBodyType: string;     // body type the depreciation curve was computed on
  depIsLive: boolean;      // true when curve derived from live year-price data
  kpis: KpiData;
  reportDate: string;
};

// ─── Mock Data (Demo Mode) ─────────────────────────────────────────────────

function getMockData(): DashboardData {
  return {
    months: [
      "Apr 25", "May 25", "Jun 25", "Jul 25", "Aug 25", "Sep 25",
      "Oct 25", "Nov 25", "Dec 25", "Jan 26", "Feb 26", "Mar 26",
    ],
    evPct:     [6.0, 6.2, 6.5, 6.7, 7.0, 7.3, 7.5, 7.8, 8.1, 8.4, 8.7, 9.0],
    hybridPct: [8.0, 8.2, 8.5, 8.7, 8.9, 9.2, 9.5, 9.7, 10.0, 10.3, 10.6, 11.0],
    icePct:    [86.0, 85.6, 85.0, 84.6, 84.1, 83.5, 83.0, 82.5, 81.9, 81.3, 80.7, 80.0],
    parity: [
      { bodyType: "SUV", evPrice: 52400, icePrice: 42800 },
      { bodyType: "Sedan", evPrice: 41200, icePrice: 34600 },
      { bodyType: "Truck", evPrice: 62800, icePrice: 49200 },
      { bodyType: "Hatchback", evPrice: 33800, icePrice: 27400 },
    ],
    brands: [
      { rank: 1, make: "Tesla", volume: 184250, evShare: 100.0, avgPrice: 44800, deprecRate: 28.2, daysSupply: 18, trend: "up" },
      { rank: 2, make: "Ford", volume: 42800, evShare: 12.4, avgPrice: 48200, deprecRate: 24.6, daysSupply: 32, trend: "up" },
      { rank: 3, make: "GM", volume: 38600, evShare: 10.8, avgPrice: 46500, deprecRate: 22.8, daysSupply: 28, trend: "up" },
      { rank: 4, make: "Hyundai", volume: 31400, evShare: 14.2, avgPrice: 39800, deprecRate: 20.4, daysSupply: 24, trend: "up" },
      { rank: 5, make: "BMW", volume: 22800, evShare: 9.6, avgPrice: 62400, deprecRate: 26.8, daysSupply: 36, trend: "flat" },
      { rank: 6, make: "Mercedes", volume: 18200, evShare: 8.2, avgPrice: 68200, deprecRate: 30.2, daysSupply: 42, trend: "down" },
      { rank: 7, make: "VW", volume: 16800, evShare: 7.4, avgPrice: 38600, deprecRate: 22.0, daysSupply: 30, trend: "up" },
      { rank: 8, make: "Kia", volume: 15400, evShare: 11.8, avgPrice: 42200, deprecRate: 19.6, daysSupply: 22, trend: "up" },
      { rank: 9, make: "Rivian", volume: 12200, evShare: 100.0, avgPrice: 74600, deprecRate: 34.8, daysSupply: 44, trend: "flat" },
      { rank: 10, make: "Lucid", volume: 4800, evShare: 100.0, avgPrice: 82400, deprecRate: 38.4, daysSupply: 62, trend: "down" },
    ],
    states: [
      { state: "California", penetration: 18.2, volume: 142800, yoyChange: 3.4 },
      { state: "Washington", penetration: 12.4, volume: 28600, yoyChange: 2.8 },
      { state: "New Jersey", penetration: 10.2, volume: 32400, yoyChange: 2.2 },
      { state: "Oregon", penetration: 9.8, volume: 14200, yoyChange: 2.6 },
      { state: "Colorado", penetration: 9.4, volume: 18800, yoyChange: 2.4 },
      { state: "Massachusetts", penetration: 9.0, volume: 22600, yoyChange: 1.8 },
      { state: "Connecticut", penetration: 8.6, volume: 11200, yoyChange: 1.6 },
      { state: "Maryland", penetration: 8.2, volume: 16400, yoyChange: 1.9 },
      { state: "New York", penetration: 7.8, volume: 48200, yoyChange: 1.5 },
      { state: "Vermont", penetration: 7.6, volume: 2400, yoyChange: 2.0 },
      { state: "Nevada", penetration: 7.2, volume: 8600, yoyChange: 2.1 },
      { state: "Arizona", penetration: 6.8, volume: 19400, yoyChange: 1.7 },
      { state: "Hawaii", penetration: 6.6, volume: 3200, yoyChange: 1.4 },
      { state: "Virginia", penetration: 6.4, volume: 21800, yoyChange: 1.3 },
      { state: "Florida", penetration: 6.2, volume: 52600, yoyChange: 1.1 },
    ],
    evDepreciation:  [100, 94, 88, 83, 78, 74, 70, 67, 64, 61, 59, 57],
    iceDepreciation: [100, 96, 93, 90, 87, 85, 83, 81, 79, 78, 76, 75],
    depLabels: ["Apr 25","May 25","Jun 25","Jul 25","Aug 25","Sep 25","Oct 25","Nov 25","Dec 25","Jan 26","Feb 26","Mar 26"],
    depBodyType: "All",
    depIsLive: false,
    kpis: {
      evPenetration: { value: 9.0, trend: 3.0, label: "EV Penetration %" },
      priceGap: { value: 8460, label: "EV-to-ICE Price Gap" },
      deprecRatio: { value: 1.72, label: "EV-to-ICE Depreciation Ratio" },
      avgDaysSupply: { value: 28, label: "EV Avg Days Supply" },
      avgDOM: { value: 34, label: "EV Avg DOM" },
    },
    reportDate: "Mar 26, 2026",
  };
}

// ─── Transform Live API Response → DashboardData ───────────────────────────

const _STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

function transformLive(raw: any, fallback: DashboardData): DashboardData {
  try {
    const out: DashboardData = { ...fallback };

    // ── 1. Current fuel mix (snapshot → single-point "trend") ──
    const mixFacets: any[] = raw?.fuelMixAll?.facets?.fuel_type ?? [];
    let ev = 0, hybrid = 0, ice = 0;
    for (const f of mixFacets) {
      const bucket = _fuelBucket(String(f.item ?? ""));
      const n = Number(f.count ?? 0) || 0;
      if (bucket === "EV") ev += n;
      else if (bucket === "Hybrid") hybrid += n;
      else if (bucket === "ICE") ice += n;
    }
    const mixTotal = ev + hybrid + ice;
    if (mixTotal > 0) {
      const evPct = +(ev / mixTotal * 100).toFixed(1);
      const hybPct = +(hybrid / mixTotal * 100).toFixed(1);
      const icePctVal = +(ice / mixTotal * 100).toFixed(1);
      out.months = ["Current Mix"];
      out.evPct = [evPct];
      out.hybridPct = [hybPct];
      out.icePct = [icePctVal];
    }

    // ── 2. Price parity (per-body-type EV vs ICE averages) ──
    const parityRows: ParityRow[] = [];
    for (const row of (raw?.parityByBody ?? [])) {
      const evMean = Number(row?.ev?.stats?.price?.mean ?? 0) || 0;
      const iceMean = Number(row?.ice?.stats?.price?.mean ?? 0) || 0;
      if (evMean > 0 && iceMean > 0) {
        parityRows.push({ bodyType: row.bodyType, evPrice: Math.round(evMean), icePrice: Math.round(iceMean) });
      }
    }
    if (parityRows.length) {
      parityRows.sort((a, b) => b.evPrice - a.evPrice);
      out.parity = parityRows;
    }

    // ── 3. Brand leaderboard ──
    const makeFacets: any[] = raw?.evByMake?.facets?.make ?? [];
    const perMakeStats: Array<{ make: string; stats: any }> = raw?.perMakeStats ?? [];
    const statsByMake: Record<string, any> = {};
    for (const s of perMakeStats) if (s.make) statsByMake[s.make] = s.stats;

    if (makeFacets.length) {
      const top = makeFacets.slice(0, 10);
      const brands: BrandRow[] = top.map((f, i) => {
        const mk = String(f.item ?? "Unknown");
        const volume = Number(f.count ?? 0) || 0;
        const st = statsByMake[mk];
        const price = Number(st?.price?.mean ?? 0) || 0;
        const dom = Number(st?.dom?.mean ?? 0) || 0;
        const daysSupply = dom > 0 ? Math.max(10, Math.round(dom * 0.85)) : 0;
        return {
          rank: i + 1,
          make: mk,
          volume,
          evShare: 100, // filtered to EVs only
          avgPrice: Math.round(price),
          deprecRate: 0,
          daysSupply,
          trend: "up",
        };
      });
      if (brands.length) out.brands = brands;
    }

    // ── 4. State penetration (with real denominator) ──
    const evStates: any[] = raw?.evByState?.facets?.state ?? [];
    const allStates: any[] = raw?.allByState?.facets?.state ?? [];
    const allStateMap: Record<string, number> = {};
    for (const s of allStates) {
      if (s.item) allStateMap[String(s.item).toUpperCase()] = Number(s.count ?? 0) || 0;
    }
    if (evStates.length) {
      const states: StateRow[] = evStates.slice(0, 15).map((s) => {
        const code = String(s.item ?? "").toUpperCase();
        const vol = Number(s.count ?? 0) || 0;
        const total = allStateMap[code] || 0;
        return {
          state: _STATE_NAMES[code] ?? code,
          penetration: total > 0 ? +(vol / total * 100).toFixed(1) : 0,
          volume: vol,
          yoyChange: 0,
        };
      });
      states.sort((a, b) => b.penetration - a.penetration);
      if (states.length) out.states = states;
    }

    // ── 5. KPIs derived from transformed data ──
    const evPenNow = out.evPct[0] ?? fallback.kpis.evPenetration.value;
    const priceGap = out.parity.length
      ? Math.round(out.parity.reduce((s, p) => s + (p.evPrice - p.icePrice), 0) / out.parity.length)
      : fallback.kpis.priceGap.value;
    const domValues = Object.values(statsByMake)
      .map((s) => Number(s?.dom?.mean ?? 0) || 0)
      .filter((v) => v > 0);
    const avgDom = domValues.length
      ? Math.round(domValues.reduce((a, b) => a + b, 0) / domValues.length)
      : fallback.kpis.avgDOM.value;

    out.kpis = {
      evPenetration: { value: +evPenNow.toFixed(1), trend: 0, label: "EV Penetration %" },
      priceGap: { value: priceGap, label: "EV-to-ICE Price Gap" },
      deprecRatio: fallback.kpis.deprecRatio,
      avgDaysSupply: { value: avgDom > 0 ? Math.max(10, Math.round(avgDom * 0.85)) : fallback.kpis.avgDaysSupply.value, label: "EV Avg Days Supply" },
      avgDOM: { value: avgDom, label: "EV Avg DOM" },
    };

    // ── 6. Real depreciation curve (EV vs ICE) by model year ──
    // We compute % of current-model-year price retained for each older year,
    // same body type, for an apples-to-apples comparison.
    const depRows: Array<{ year: number; fuel: "EV" | "ICE"; stats: any }> = raw?.depRows ?? [];
    if (depRows.length) {
      const byYear: Record<number, { ev?: number; ice?: number }> = {};
      for (const r of depRows) {
        const price = Number(r?.stats?.price?.mean ?? 0) || 0;
        if (!price) continue;
        if (!byYear[r.year]) byYear[r.year] = {};
        if (r.fuel === "EV") byYear[r.year].ev = price;
        else byYear[r.year].ice = price;
      }
      const years = Object.keys(byYear).map(Number).sort((a, b) => b - a); // newest first
      // Baseline: newest year with both EV and ICE populated
      const baselineYear = years.find((y) => byYear[y].ev && byYear[y].ice);
      if (baselineYear && years.length >= 2) {
        const evBase = byYear[baselineYear].ev!;
        const iceBase = byYear[baselineYear].ice!;
        const orderedYears = years.filter((y) => byYear[y].ev && byYear[y].ice).reverse()
          // oldest → newest, but we want newest → oldest left-to-right for "time-on-lot ages"
          .reverse();
        // Render as "newest year at left (100%) → oldest year at right"
        const labels: string[] = [];
        const evCurve: number[] = [];
        const iceCurve: number[] = [];
        for (const y of orderedYears) {
          labels.push(`MY ${y}`);
          evCurve.push(Math.round((byYear[y].ev! / evBase) * 1000) / 10);
          iceCurve.push(Math.round((byYear[y].ice! / iceBase) * 1000) / 10);
        }
        if (labels.length >= 2) {
          out.depLabels = labels;
          out.evDepreciation = evCurve;
          out.iceDepreciation = iceCurve;
          out.depBodyType = String(raw?.depBody ?? "SUV");
          out.depIsLive = true;

          // Real depreciation ratio: how many % of value EVs lose per % ICE loses, at the oldest common year
          const oldestIdx = labels.length - 1;
          const evLoss = 100 - evCurve[oldestIdx];
          const iceLoss = 100 - iceCurve[oldestIdx];
          if (iceLoss > 0) {
            out.kpis = {
              ...out.kpis,
              deprecRatio: { value: +(evLoss / iceLoss).toFixed(2), label: "EV-to-ICE Depreciation Ratio" },
            };
          }
        }
      }
    }
    if (!out.depIsLive) {
      // Keep the illustrative curve if we couldn't build a live one.
      out.evDepreciation = fallback.evDepreciation;
      out.iceDepreciation = fallback.iceDepreciation;
      out.depLabels = fallback.depLabels;
      out.depBodyType = fallback.depBodyType;
      out.depIsLive = false;
    }
    out.reportDate = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    return out;
  } catch (e) {
    console.warn("transformLive failed, using mock", e);
    return fallback;
  }
}

// ─── Render ────────────────────────────────────────────────────────────────

function render(data: DashboardData) {
  const app = document.getElementById("app")!;
  app.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;" id="ev-header">
      <div style="width:10px;height:32px;background:${C.blue};border-radius:4px;"></div>
      <h1 style="font-size:24px;font-weight:700;color:${C.text};">EV Market Monitor</h1>
      <span style="font-size:13px;color:${C.textDim};">Updated ${data.reportDate}</span>
    </div>

    <div id="kpi-ribbon" style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:20px;"></div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <div style="background:${C.surface};border-radius:12px;border:1px solid ${C.border};padding:16px;">
        <h3 style="font-size:14px;font-weight:600;color:${C.textMuted};margin-bottom:12px;">${data.months.length <= 1 ? "Fuel Mix Snapshot" : `Adoption Trend (${data.months.length} Months)`}</h3>
        <canvas id="adoption-chart" width="640" height="320" style="width:100%;height:auto;"></canvas>
      </div>
      <div style="background:${C.surface};border-radius:12px;border:1px solid ${C.border};padding:16px;">
        <h3 style="font-size:14px;font-weight:600;color:${C.textMuted};margin-bottom:12px;">Price Parity Tracker</h3>
        <canvas id="parity-chart" width="640" height="320" style="width:100%;height:auto;"></canvas>
      </div>
    </div>

    <div style="background:${C.surface};border-radius:12px;border:1px solid ${C.border};padding:16px;margin-bottom:16px;">
      <h3 style="font-size:14px;font-weight:600;color:${C.textMuted};margin-bottom:12px;">Brand EV Leaderboard</h3>
      <div id="leaderboard-table"></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div style="background:${C.surface};border-radius:12px;border:1px solid ${C.border};padding:16px;">
        <h3 style="font-size:14px;font-weight:600;color:${C.textMuted};margin-bottom:12px;">State EV Adoption (Top 15)</h3>
        <div id="state-table"></div>
      </div>
      <div style="background:${C.surface};border-radius:12px;border:1px solid ${C.border};padding:16px;">
        <h3 style="font-size:14px;font-weight:600;color:${C.textMuted};margin-bottom:12px;">${data.depIsLive ? `Residual Value by Model Year — ${data.depBodyType} (EV vs ICE)` : "Depreciation Comparison (12 Months)"}</h3>
        <canvas id="depreciation-chart" width="640" height="360" style="width:100%;height:auto;"></canvas>
      </div>
    </div>
  `;

  _addSettingsBar(document.getElementById("ev-header") ?? undefined);

  renderKPIRibbon(data);
  renderAdoptionChart(data);
  renderParityChart(data);
  renderLeaderboardTable(data);
  renderStateTable(data);
  renderDepreciationChart(data);
}

// ─── KPI Scorecard Ribbon ──────────────────────────────────────────────────

function renderKPIRibbon(data: DashboardData) {
  const container = document.getElementById("kpi-ribbon")!;
  const kpi = data.kpis;
  const cards = [
    { label: kpi.evPenetration.label, value: `${kpi.evPenetration.value}%`, sub: `${kpi.evPenetration.trend >= 0 ? "+" : ""}${kpi.evPenetration.trend}% since start`, color: C.blue },
    { label: kpi.priceGap.label, value: `$${Math.abs(kpi.priceGap.value).toLocaleString()}`, sub: "Avg across segments", color: C.orange },
    { label: kpi.deprecRatio.label, value: `${kpi.deprecRatio.value}x`, sub: "EV depreciates faster", color: C.red },
    { label: kpi.avgDaysSupply.label, value: `${kpi.avgDaysSupply.value}`, sub: "Days of inventory", color: C.green },
    { label: kpi.avgDOM.label, value: `${kpi.avgDOM.value}`, sub: "Days on market", color: C.cyan },
  ];
  container.innerHTML = cards.map((c) => `
    <div style="background:${C.surface};border-radius:10px;border:1px solid ${C.border};padding:16px;position:relative;overflow:hidden;">
      <div style="position:absolute;top:0;left:0;width:4px;height:100%;background:${c.color};"></div>
      <div style="padding-left:8px;">
        <div style="font-size:11px;font-weight:600;color:${C.textDim};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${c.label}</div>
        <div style="font-size:26px;font-weight:700;color:${C.text};margin-bottom:4px;">${c.value}</div>
        <div style="font-size:12px;color:${c.color === C.red ? C.red : C.green};font-weight:500;">${c.sub}</div>
      </div>
    </div>`).join("");
}

// ─── Adoption Trend Chart ──────────────────────────────────────────────────

function _renderFuelMixSnapshot(ctx: CanvasRenderingContext2D, W: number, H: number, data: DashboardData) {
  const padL = 60, padR = 60, padT = 70, padB = 90;
  const barY = padT + 30;
  const barH = 70;
  const barW = W - padL - padR;

  ctx.fillStyle = C.text;
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Current Fuel Mix — Share of Sold Vehicles", padL, padT - 10);

  const ev = data.evPct[0] ?? 0;
  const hybrid = data.hybridPct[0] ?? 0;
  const ice = data.icePct[0] ?? 0;

  const segments = [
    { label: "EV", pct: ev, color: C.blue },
    { label: "Hybrid", pct: hybrid, color: C.green },
    { label: "ICE", pct: ice, color: C.grayLight },
  ];

  let x = padL;
  for (const seg of segments) {
    const w = (seg.pct / 100) * barW;
    ctx.fillStyle = seg.color;
    ctx.fillRect(x, barY, w, barH);
    if (w > 48) {
      ctx.fillStyle = seg.label === "ICE" ? "#0f172a" : "#ffffff";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${seg.pct.toFixed(1)}%`, x + w / 2, barY + barH / 2 + 5);
    }
    x += w;
  }

  // Legend with counts
  ctx.textAlign = "left";
  const legY = barY + barH + 28;
  let lx = padL;
  for (const seg of segments) {
    ctx.fillStyle = seg.color;
    ctx.fillRect(lx, legY - 10, 14, 14);
    ctx.fillStyle = C.text;
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(`${seg.label}`, lx + 20, legY);
    ctx.fillStyle = C.textMuted;
    ctx.font = "12px sans-serif";
    ctx.fillText(`${seg.pct.toFixed(1)}%`, lx + 20, legY + 16);
    lx += 130;
  }

  // Footnote
  ctx.fillStyle = C.textDim;
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Snapshot of recent sold inventory. Monthly trend requires Enterprise Sold Summary data.", W / 2, H - 20);
}

function renderAdoptionChart(data: DashboardData) {
  const canvas = document.getElementById("adoption-chart") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = C.surface;
  ctx.fillRect(0, 0, W, H);

  // Single-point snapshot (live mode): draw a horizontal stacked bar instead of a line chart.
  if (data.months.length <= 1) {
    _renderFuelMixSnapshot(ctx, W, H, data);
    return;
  }

  const padL = 55, padR = 20, padT = 20, padB = 50;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const yMin = 0, yMax = 100;
  const months = data.months;
  const n = Math.max(months.length, 1);

  const xPos = (i: number) => padL + (n <= 1 ? chartW / 2 : (i / (n - 1)) * chartW);
  const yPos = (v: number) => padT + chartH - ((v - yMin) / (yMax - yMin)) * chartH;

  ctx.strokeStyle = C.surfaceLight;
  ctx.lineWidth = 0.5;
  const yTicks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  for (const t of yTicks) { ctx.beginPath(); ctx.moveTo(padL, yPos(t)); ctx.lineTo(padL + chartW, yPos(t)); ctx.stroke(); }

  ctx.fillStyle = C.textDim;
  ctx.font = "11px sans-serif";
  ctx.textAlign = "right";
  for (const t of yTicks) ctx.fillText(`${t}%`, padL - 8, yPos(t) + 4);

  ctx.textAlign = "center";
  const lastIdx = months.length - 1;
  for (let i = 0; i < months.length; i++) {
    // Skip labels that would overlap (keep first, last, and every other if tight)
    if (n > 10 && i !== 0 && i !== lastIdx && i % 2 !== 0) continue;
    ctx.fillText(months[i], xPos(i), H - padB + 20);
  }

  function drawLine(series: number[], color: string, lineWidth: number) {
    if (!series.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < series.length; i++) {
      const x = xPos(i), y = yPos(series[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (let i = 0; i < series.length; i++) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(xPos(i), yPos(series[i]), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawLine(data.icePct, C.grayLight, 2);
  drawLine(data.hybridPct, C.green, 2.5);
  drawLine(data.evPct, C.blue, 2.5);

  if (lastIdx >= 0) {
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    const lastLabelX = xPos(lastIdx);
    const labelX = lastLabelX > W - 70 ? lastLabelX - 48 : lastLabelX + 8;
    ctx.fillStyle = C.blue; ctx.fillText(`${data.evPct[lastIdx]}%`, labelX, yPos(data.evPct[lastIdx]) + 4);
    ctx.fillStyle = C.green; ctx.fillText(`${data.hybridPct[lastIdx]}%`, labelX, yPos(data.hybridPct[lastIdx]) + 4);
    ctx.fillStyle = C.grayLight; ctx.fillText(`${data.icePct[lastIdx]}%`, labelX, yPos(data.icePct[lastIdx]) + 4);
  }

  const legendY = padT + 4;
  const legendX = padL + 10;
  const drawLegendItem = (x: number, color: string, label: string) => {
    ctx.fillStyle = color; ctx.fillRect(x, legendY, 14, 3);
    ctx.fillStyle = C.textMuted; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(label, x + 18, legendY + 5);
  };
  drawLegendItem(legendX, C.blue, "EV %");
  drawLegendItem(legendX + 80, C.green, "Hybrid %");
  drawLegendItem(legendX + 180, C.grayLight, "ICE %");
}

// ─── Price Parity Tracker ──────────────────────────────────────────────────

function renderParityChart(data: DashboardData) {
  const canvas = document.getElementById("parity-chart") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width, H = canvas.height;

  ctx.fillStyle = C.surface;
  ctx.fillRect(0, 0, W, H);

  const padL = 65, padR = 20, padT = 20, padB = 50;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const parity = data.parity.length ? data.parity : [];
  const maxVal = parity.reduce((m, p) => Math.max(m, p.evPrice, p.icePrice), 10000);
  const maxPrice = Math.max(70000, Math.ceil(maxVal / 10000) * 10000);
  const yPos = (v: number) => padT + chartH - (v / maxPrice) * chartH;

  ctx.strokeStyle = C.surfaceLight;
  ctx.lineWidth = 0.5;
  const step = Math.ceil(maxPrice / 7 / 10000) * 10000;
  const yTicks: number[] = [];
  for (let v = 0; v <= maxPrice; v += step) yTicks.push(v);
  for (const t of yTicks) { ctx.beginPath(); ctx.moveTo(padL, yPos(t)); ctx.lineTo(padL + chartW, yPos(t)); ctx.stroke(); }

  ctx.fillStyle = C.textDim;
  ctx.font = "11px sans-serif";
  ctx.textAlign = "right";
  for (const t of yTicks) ctx.fillText(`$${(t / 1000).toFixed(0)}K`, padL - 8, yPos(t) + 4);

  if (!parity.length) {
    ctx.fillStyle = C.textDim;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No price parity data available", W / 2, H / 2);
    return;
  }

  const groupCount = parity.length;
  const groupWidth = chartW / groupCount;
  const barWidth = groupWidth * 0.28;
  const gap = 6;

  for (let i = 0; i < groupCount; i++) {
    const d = parity[i];
    const groupCenterX = padL + groupWidth * i + groupWidth / 2;

    const evBarX = groupCenterX - barWidth - gap / 2;
    const evBarH = (d.evPrice / maxPrice) * chartH;
    const evBarY = yPos(d.evPrice);
    ctx.fillStyle = C.blue;
    roundedRect(ctx, evBarX, evBarY, barWidth, evBarH, 4);

    const iceBarX = groupCenterX + gap / 2;
    const iceBarH = (d.icePrice / maxPrice) * chartH;
    const iceBarY = yPos(d.icePrice);
    ctx.fillStyle = C.orange;
    roundedRect(ctx, iceBarX, iceBarY, barWidth, iceBarH, 4);

    const priceDiff = d.evPrice - d.icePrice;
    const midY = (evBarY + iceBarY) / 2;

    ctx.strokeStyle = C.textDim;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(evBarX + barWidth + 2, evBarY);
    ctx.lineTo(groupCenterX, evBarY);
    ctx.lineTo(groupCenterX, iceBarY);
    ctx.lineTo(iceBarX - 2, iceBarY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = priceDiff >= 0 ? C.yellow : C.green;
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${priceDiff >= 0 ? "+" : "-"}$${(Math.abs(priceDiff) / 1000).toFixed(1)}K`, groupCenterX, midY - 4);

    ctx.fillStyle = C.textMuted;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(d.bodyType, groupCenterX, H - padB + 20);
  }

  const legendY = padT + 4;
  ctx.fillStyle = C.blue; ctx.fillRect(padL + 10, legendY, 14, 10);
  ctx.fillStyle = C.textMuted; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
  ctx.fillText("EV Avg Price", padL + 28, legendY + 9);

  ctx.fillStyle = C.orange; ctx.fillRect(padL + 130, legendY, 14, 10);
  ctx.fillStyle = C.textMuted;
  ctx.fillText("ICE Avg Price", padL + 148, legendY + 9);
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

// ─── Brand EV Leaderboard Table ────────────────────────────────────────────

function renderLeaderboardTable(data: DashboardData) {
  const container = document.getElementById("leaderboard-table")!;

  const trendArrow = (t: string) => {
    if (t === "up") return `<span style="color:${C.green};">&#9650;</span>`;
    if (t === "down") return `<span style="color:${C.red};">&#9660;</span>`;
    return `<span style="color:${C.textDim};">&#9654;</span>`;
  };

  const headerStyle = `font-size:11px;font-weight:600;color:${C.textDim};text-transform:uppercase;letter-spacing:0.5px;padding:8px 12px;border-bottom:1px solid ${C.border};text-align:left;`;
  const cellStyle = `font-size:13px;padding:10px 12px;border-bottom:1px solid ${C.surfaceLight};`;

  let html = `<table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr>
        <th style="${headerStyle}">Rank</th>
        <th style="${headerStyle}">Make</th>
        <th style="${headerStyle}text-align:right;">EV Volume</th>
        <th style="${headerStyle}text-align:right;">EV Share %</th>
        <th style="${headerStyle}text-align:right;">Avg Price</th>
        <th style="${headerStyle}text-align:right;">Depreciation</th>
        <th style="${headerStyle}text-align:right;">Days Supply</th>
        <th style="${headerStyle}text-align:center;">Trend</th>
      </tr>
    </thead>
    <tbody>`;

  for (const row of data.brands) {
    const rowBg = row.rank % 2 === 0 ? C.surface : "transparent";
    const deprecCell = row.deprecRate > 0
      ? `<span style="color:${row.deprecRate > 30 ? C.red : row.deprecRate > 25 ? C.orange : C.green};">${row.deprecRate.toFixed(1)}%</span>`
      : `<span style="color:${C.textDim};">—</span>`;
    const supplyCell = row.daysSupply > 0
      ? `<span style="color:${row.daysSupply > 40 ? C.red : row.daysSupply > 30 ? C.orange : C.green};">${row.daysSupply}</span>`
      : `<span style="color:${C.textDim};">—</span>`;
    html += `<tr style="background:${rowBg};">
      <td style="${cellStyle}color:${C.textDim};font-weight:600;">${row.rank}</td>
      <td style="${cellStyle}font-weight:600;color:${C.text};">${row.make}</td>
      <td style="${cellStyle}text-align:right;color:${C.text};">${row.volume.toLocaleString()}</td>
      <td style="${cellStyle}text-align:right;color:${row.evShare >= 50 ? C.blue : C.textMuted};">${row.evShare.toFixed(1)}%</td>
      <td style="${cellStyle}text-align:right;color:${C.text};">$${row.avgPrice.toLocaleString()}</td>
      <td style="${cellStyle}text-align:right;">${deprecCell}</td>
      <td style="${cellStyle}text-align:right;">${supplyCell}</td>
      <td style="${cellStyle}text-align:center;">${trendArrow(row.trend)}</td>
    </tr>`;
  }

  html += `</tbody></table>`;
  container.innerHTML = html;
}

// ─── State Adoption Table ──────────────────────────────────────────────────

function renderStateTable(data: DashboardData) {
  const container = document.getElementById("state-table")!;
  const maxPen = data.states.reduce((m, s) => Math.max(m, s.penetration), 0) || 1;

  const penColor = (pen: number): string => {
    const intensity = pen / maxPen;
    if (intensity > 0.7) return `rgba(59,130,246,0.18)`;
    if (intensity > 0.5) return `rgba(59,130,246,0.12)`;
    if (intensity > 0.3) return `rgba(59,130,246,0.07)`;
    return "transparent";
  };

  const headerStyle = `font-size:11px;font-weight:600;color:${C.textDim};text-transform:uppercase;letter-spacing:0.5px;padding:7px 10px;border-bottom:1px solid ${C.border};text-align:left;`;
  const cellStyle = `font-size:12px;padding:7px 10px;border-bottom:1px solid ${C.surfaceLight};`;

  let html = `<div style="max-height:440px;overflow-y:auto;">
  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr>
        <th style="${headerStyle}">State</th>
        <th style="${headerStyle}text-align:right;">EV Penetration %</th>
        <th style="${headerStyle}text-align:right;">EV Volume</th>
        <th style="${headerStyle}text-align:right;">YoY Change</th>
      </tr>
    </thead>
    <tbody>`;

  for (const row of data.states) {
    const bg = penColor(row.penetration);
    const yoy = row.yoyChange > 0
      ? `<span style="color:${C.green};font-weight:500;">+${row.yoyChange.toFixed(1)}%</span>`
      : `<span style="color:${C.textDim};">—</span>`;
    html += `<tr style="background:${bg};">
      <td style="${cellStyle}font-weight:600;color:${C.text};">${row.state}</td>
      <td style="${cellStyle}text-align:right;color:${C.blue};font-weight:600;">${row.penetration.toFixed(1)}%</td>
      <td style="${cellStyle}text-align:right;color:${C.text};">${row.volume.toLocaleString()}</td>
      <td style="${cellStyle}text-align:right;">${yoy}</td>
    </tr>`;
  }

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

// ─── Depreciation Comparison Chart ────────────────────────────────────────

function renderDepreciationChart(data: DashboardData) {
  const canvas = document.getElementById("depreciation-chart") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width, H = canvas.height;

  ctx.fillStyle = C.surface;
  ctx.fillRect(0, 0, W, H);

  const padL = 55, padR = 20, padT = 20, padB = 50;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const labels = data.depLabels;
  const evDep = data.evDepreciation;
  const iceDep = data.iceDepreciation;
  const n = Math.min(labels.length, evDep.length, iceDep.length);
  if (n < 2) return;

  const minVal = Math.min(...evDep.slice(0, n), ...iceDep.slice(0, n));
  const yMin = Math.max(0, Math.floor((minVal - 5) / 10) * 10);
  const yMax = 105;

  const xPos = (i: number) => padL + (i / (n - 1)) * chartW;
  const yPos = (v: number) => padT + chartH - ((v - yMin) / (yMax - yMin)) * chartH;

  ctx.strokeStyle = C.surfaceLight;
  ctx.lineWidth = 0.5;
  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax; v += 10) yTicks.push(v);
  for (const t of yTicks) { ctx.beginPath(); ctx.moveTo(padL, yPos(t)); ctx.lineTo(padL + chartW, yPos(t)); ctx.stroke(); }

  ctx.fillStyle = C.textDim;
  ctx.font = "11px sans-serif";
  ctx.textAlign = "right";
  for (const t of yTicks) ctx.fillText(`${t}%`, padL - 8, yPos(t) + 4);

  ctx.textAlign = "center";
  for (let i = 0; i < n; i++) ctx.fillText(labels[i], xPos(i), H - padB + 20);

  // Fill area between curves (depreciation gap)
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = xPos(i), y = yPos(iceDep[i]);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(xPos(i), yPos(evDep[i]));
  ctx.closePath();
  ctx.fillStyle = "rgba(239, 68, 68, 0.12)";
  ctx.fill();

  // ICE line
  ctx.strokeStyle = C.orange;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = xPos(i), y = yPos(iceDep[i]);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // EV line
  ctx.strokeStyle = C.blue;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = xPos(i), y = yPos(evDep[i]);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Dots
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = C.orange;
    ctx.beginPath(); ctx.arc(xPos(i), yPos(iceDep[i]), 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.blue;
    ctx.beginPath(); ctx.arc(xPos(i), yPos(evDep[i]), 3, 0, Math.PI * 2); ctx.fill();
  }

  // End value labels
  const endIdx = n - 1;
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = C.orange; ctx.fillText(`${iceDep[endIdx].toFixed(1)}%`, xPos(endIdx) - 6, yPos(iceDep[endIdx]) - 6);
  ctx.fillStyle = C.blue; ctx.fillText(`${evDep[endIdx].toFixed(1)}%`, xPos(endIdx) - 6, yPos(evDep[endIdx]) + 14);

  // Mid-gap annotation
  const midIdx = Math.floor(n / 2);
  const midGap = +(iceDep[midIdx] - evDep[midIdx]).toFixed(1);
  const midGapY = (yPos(iceDep[midIdx]) + yPos(evDep[midIdx])) / 2;

  ctx.strokeStyle = C.red;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(xPos(midIdx), yPos(iceDep[midIdx]));
  ctx.lineTo(xPos(midIdx), yPos(evDep[midIdx]));
  ctx.stroke();
  ctx.setLineDash([]);

  const gapLabel = `${midGap}pt gap`;
  ctx.font = "bold 11px sans-serif";
  const gapLabelW = ctx.measureText(gapLabel).width + 12;
  ctx.fillStyle = "rgba(239, 68, 68, 0.25)";
  roundedRect(ctx, xPos(midIdx) - gapLabelW / 2, midGapY - 10, gapLabelW, 20, 4);
  ctx.fillStyle = C.red;
  ctx.textAlign = "center";
  ctx.fillText(gapLabel, xPos(midIdx), midGapY + 4);

  // Legend
  const legendY = padT + 4;
  const legendX = padL + 10;
  ctx.fillStyle = C.blue; ctx.fillRect(legendX, legendY, 14, 3);
  ctx.fillStyle = C.textMuted; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
  ctx.fillText("EV Value Retained %", legendX + 18, legendY + 5);
  ctx.fillStyle = C.orange; ctx.fillRect(legendX + 160, legendY, 14, 3);
  ctx.fillStyle = C.textMuted;
  ctx.fillText("ICE Value Retained %", legendX + 178, legendY + 5);
  ctx.fillStyle = "rgba(239, 68, 68, 0.5)"; ctx.fillRect(legendX + 340, legendY - 2, 14, 8);
  ctx.fillStyle = C.textMuted;
  ctx.fillText("Depreciation Gap", legendX + 358, legendY + 5);

  // Footnote for live mode
  if (data.depIsLive) {
    ctx.fillStyle = C.textDim;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("Avg used listing price indexed to current MY = 100%. Residual-value curve, not single-vehicle depreciation.", W - padR, H - 6);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  document.body.style.background = C.bg;
  document.body.style.color = C.text;
  document.body.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  document.body.style.padding = "16px";
  document.body.style.minHeight = "100vh";

  const container = document.createElement("div");
  container.id = "app";
  container.style.cssText = "max-width:1440px;margin:0 auto;";
  document.body.appendChild(container);

  // Demo banner
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
    _db.querySelector("#_banner_save")!.addEventListener("click", () => {
      const k = (_db.querySelector("#_banner_key") as HTMLInputElement).value.trim();
      if (!k) return;
      localStorage.setItem("mc_api_key", k);
      _db.innerHTML = '<div style="font-size:13px;font-weight:700;color:#10b981;">&#10003; API key saved — reloading with live data...</div>';
      setTimeout(() => location.reload(), 800);
    });
    _db.querySelector("#_banner_key")!.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") (_db.querySelector("#_banner_save") as HTMLButtonElement).click();
    });
  }

  // Initial render with mock so the user sees structure instantly
  const mock = getMockData();
  render(mock);

  const mode = _detectAppMode();
  if (mode === "demo") return;

  // Live / MCP — fetch and re-render
  const urlParams = _getUrlParams();
  const args: { bodyType?: string; state?: string } = {
    bodyType: urlParams.bodyType ?? urlParams.body_type,
    state: urlParams.state?.toUpperCase(),
  };

  // Loading overlay
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;bottom:20px;right:20px;background:#1e293b;border:1px solid #334155;padding:10px 16px;border-radius:8px;font-size:12px;color:#94a3b8;z-index:100;display:flex;align-items:center;gap:10px;";
  overlay.innerHTML = `<div style="width:14px;height:14px;border:2px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:evspin 0.8s linear infinite;"></div>
    <style>@keyframes evspin{to{transform:rotate(360deg)}}</style>
    Loading live market data...`;
  document.body.appendChild(overlay);

  try {
    const resp = await _callTool("ev-market-monitor", args);
    const text = resp?.content?.find((c: any) => c.type === "text")?.text;
    if (text) {
      const raw = JSON.parse(text);
      if (raw && !raw.error) {
        render(transformLive(raw, mock));
      }
    }
  } catch (e) {
    console.warn("Live load failed:", e);
  } finally {
    overlay.remove();
  }
}

main().catch((e) => {
  console.error("EV Market Monitor failed to start:", e);
});
