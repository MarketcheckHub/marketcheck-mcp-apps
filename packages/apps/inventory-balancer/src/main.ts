import { App } from "@modelcontextprotocol/ext-apps";

const _safeApp = (() => { try { return new App({ name: "inventory-balancer" });

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

// ── Types ──────────────────────────────────────────────────────────────

interface StoreLocation {
  id: string;
  name: string;
  city: string;
  state: string;
}

type Segment =
  | "Compact SUV"
  | "Midsize SUV"
  | "Full-size Truck"
  | "Midsize Sedan"
  | "Compact Car"
  | "Luxury";

interface SegmentData {
  inventory: number;
  demand: number; // 0-100 demand score
}

interface StoreProfile {
  location: StoreLocation;
  segments: Record<Segment, SegmentData>;
}

interface TransferRecommendation {
  vinLast6: string;
  year: number;
  make: string;
  model: string;
  segment: Segment;
  currentStore: string;
  currentDom: number;
  destStore: string;
  localDemandScore: number;
  estDomReduction: number;
  transportCost: number;
  netBenefit: number;
}

interface BalancerData {
  stores: StoreProfile[];
  recommendations: TransferRecommendation[];
}

// ── Constants ──────────────────────────────────────────────────────────

const SEGMENTS: Segment[] = [
  "Compact SUV",
  "Midsize SUV",
  "Full-size Truck",
  "Midsize Sedan",
  "Compact Car",
  "Luxury",
];

const TRANSPORT_COST = 300;

const STORES: StoreLocation[] = [
  { id: "store-1", name: "Northgate Auto", city: "Dallas", state: "TX" },
  { id: "store-2", name: "Lakeside Motors", city: "Austin", state: "TX" },
  { id: "store-3", name: "Westfield Cars", city: "Houston", state: "TX" },
  { id: "store-4", name: "Riverside Autos", city: "San Antonio", state: "TX" },
  { id: "store-5", name: "Southpark Motors", city: "Fort Worth", state: "TX" },
];

// ── Mock Data ──────────────────────────────────────────────────────────

function generateMockData(): BalancerData {
  // Realistic segment inventory and demand with intentional mismatches
  const storeSegments: Record<string, Record<Segment, SegmentData>> = {
    "store-1": {
      "Compact SUV": { inventory: 18, demand: 85 },
      "Midsize SUV": { inventory: 12, demand: 70 },
      "Full-size Truck": { inventory: 25, demand: 60 },
      "Midsize Sedan": { inventory: 14, demand: 45 },
      "Compact Car": { inventory: 8, demand: 72 },
      "Luxury": { inventory: 6, demand: 30 },
    },
    "store-2": {
      "Compact SUV": { inventory: 10, demand: 90 },
      "Midsize SUV": { inventory: 22, demand: 55 },
      "Full-size Truck": { inventory: 8, demand: 78 },
      "Midsize Sedan": { inventory: 16, demand: 40 },
      "Compact Car": { inventory: 20, demand: 65 },
      "Luxury": { inventory: 12, demand: 88 },
    },
    "store-3": {
      "Compact SUV": { inventory: 24, demand: 50 },
      "Midsize SUV": { inventory: 6, demand: 82 },
      "Full-size Truck": { inventory: 20, demand: 75 },
      "Midsize Sedan": { inventory: 22, demand: 35 },
      "Compact Car": { inventory: 5, demand: 80 },
      "Luxury": { inventory: 15, demand: 42 },
    },
    "store-4": {
      "Compact SUV": { inventory: 7, demand: 68 },
      "Midsize SUV": { inventory: 18, demand: 48 },
      "Full-size Truck": { inventory: 30, demand: 55 },
      "Midsize Sedan": { inventory: 4, demand: 72 },
      "Compact Car": { inventory: 14, demand: 58 },
      "Luxury": { inventory: 3, demand: 65 },
    },
    "store-5": {
      "Compact SUV": { inventory: 15, demand: 62 },
      "Midsize SUV": { inventory: 9, demand: 75 },
      "Full-size Truck": { inventory: 12, demand: 88 },
      "Midsize Sedan": { inventory: 20, demand: 38 },
      "Compact Car": { inventory: 11, demand: 50 },
      "Luxury": { inventory: 10, demand: 35 },
    },
  };

  const stores: StoreProfile[] = STORES.map((loc) => ({
    location: loc,
    segments: storeSegments[loc.id],
  }));

  // Generate transfer recommendations from mismatches
  const recommendations = generateRecommendations(stores);

  return { stores, recommendations };
}

function generateRecommendations(stores: StoreProfile[]): TransferRecommendation[] {
  const makes: Record<Segment, Array<{ make: string; model: string }>> = {
    "Compact SUV": [
      { make: "Toyota", model: "RAV4" },
      { make: "Honda", model: "CR-V" },
      { make: "Hyundai", model: "Tucson" },
      { make: "Nissan", model: "Rogue" },
    ],
    "Midsize SUV": [
      { make: "Toyota", model: "Highlander" },
      { make: "Honda", model: "Pilot" },
      { make: "Chevrolet", model: "Traverse" },
      { make: "Ford", model: "Explorer" },
    ],
    "Full-size Truck": [
      { make: "Ford", model: "F-150" },
      { make: "Chevrolet", model: "Silverado" },
      { make: "Ram", model: "1500" },
      { make: "Toyota", model: "Tundra" },
    ],
    "Midsize Sedan": [
      { make: "Toyota", model: "Camry" },
      { make: "Honda", model: "Accord" },
      { make: "Hyundai", model: "Sonata" },
      { make: "Nissan", model: "Altima" },
    ],
    "Compact Car": [
      { make: "Honda", model: "Civic" },
      { make: "Toyota", model: "Corolla" },
      { make: "Hyundai", model: "Elantra" },
      { make: "Mazda", model: "Mazda3" },
    ],
    "Luxury": [
      { make: "BMW", model: "X3" },
      { make: "Mercedes", model: "GLC" },
      { make: "Lexus", model: "RX" },
      { make: "Audi", model: "Q5" },
    ],
  };

  const recs: TransferRecommendation[] = [];
  let vinCounter = 100000;

  // Find overstocked->understocked pairs per segment
  for (const seg of SEGMENTS) {
    // Compute supply/demand ratio for each store in this segment
    const storeRatios = stores.map((s) => {
      const data = s.segments[seg];
      // Ratio > 1 means oversupplied, < 1 means undersupplied
      // Normalize: ideal inventory = demand * 0.25 (so demand 80 => ideal 20 units)
      const idealInventory = data.demand * 0.25;
      const ratio = idealInventory > 0 ? data.inventory / idealInventory : 1;
      return { store: s, ratio, data };
    });

    // Sort: most overstocked first
    const overstocked = storeRatios.filter((r) => r.ratio > 1.2).sort((a, b) => b.ratio - a.ratio);
    const understocked = storeRatios.filter((r) => r.ratio < 0.8).sort((a, b) => a.ratio - b.ratio);

    for (const over of overstocked) {
      for (const under of understocked) {
        // How many to transfer: min of surplus and deficit, cap at 3
        const surplus = Math.floor(over.data.inventory - over.data.demand * 0.25);
        const deficit = Math.ceil(under.data.demand * 0.25 - under.data.inventory);
        const transferCount = Math.min(surplus, deficit, 3);
        if (transferCount <= 0) continue;

        for (let t = 0; t < transferCount; t++) {
          vinCounter++;
          const vehiclePool = makes[seg];
          const vehicle = vehiclePool[vinCounter % vehiclePool.length];
          const year = 2021 + (vinCounter % 4);
          const currentDom = 30 + Math.floor(Math.random() * 70);

          // DOM reduction estimate: higher demand = faster sell
          const demandFactor = under.data.demand / 100;
          const estDomReduction = Math.round(currentDom * demandFactor * 0.6);

          // Net benefit: DOM reduction * $35/day floor plan savings - transport cost
          const floorPlanSavings = estDomReduction * 35;
          // Additional margin from selling in higher-demand market
          const demandPremium = Math.round((under.data.demand - over.data.demand) * 8);
          const netBenefit = floorPlanSavings + demandPremium - TRANSPORT_COST;

          recs.push({
            vinLast6: String(vinCounter),
            year,
            make: vehicle.make,
            model: vehicle.model,
            segment: seg,
            currentStore: over.store.location.name,
            currentDom,
            destStore: under.store.location.name,
            localDemandScore: under.data.demand,
            estDomReduction,
            transportCost: TRANSPORT_COST,
            netBenefit,
          });
        }
      }
    }
  }

  // Sort by net benefit descending
  recs.sort((a, b) => b.netBenefit - a.netBenefit);

  // Return top 15
  return recs.slice(0, 15);
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

function fmtCurrency(v: number): string {
  return "$" + Math.round(v).toLocaleString();
}

function cellStatus(
  inventory: number,
  demand: number
): "balanced" | "understocked" | "overstocked" {
  const ideal = demand * 0.25;
  const ratio = ideal > 0 ? inventory / ideal : 1;
  if (ratio > 1.2) return "overstocked";
  if (ratio < 0.8) return "understocked";
  return "balanced";
}

function statusColor(status: "balanced" | "understocked" | "overstocked"): string {
  switch (status) {
    case "balanced":
      return "rgba(16,185,129,0.18)";
    case "understocked":
      return "rgba(59,130,246,0.22)";
    case "overstocked":
      return "rgba(249,115,22,0.22)";
  }
}

function statusBorder(status: "balanced" | "understocked" | "overstocked"): string {
  switch (status) {
    case "balanced":
      return "#10b981";
    case "understocked":
      return "#3b82f6";
    case "overstocked":
      return "#f97316";
  }
}

function statusLabel(status: "balanced" | "understocked" | "overstocked"): string {
  switch (status) {
    case "balanced":
      return "Balanced";
    case "understocked":
      return "Understocked - Transfer IN needed";
    case "overstocked":
      return "Overstocked - Transfer OUT needed";
  }
}

// ── Main App ───────────────────────────────────────────────────────────



  // When live data arrives we would parse it; for now mock data is used

async function main() {
  document.body.style.cssText =
    "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;overflow-x:hidden;";

  // Show loading
  document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#94a3b8;">
    <div style="width:20px;height:20px;border:2px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:12px;"></div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    Loading inventory balancer data...
  </div>`;

  let data: BalancerData;
  try {
    const result = await _callTool("inventory-balancer", {
        locations: STORES.map((s) => ({
          id: s.id,
          name: s.name,
          city: s.city,
          state: s.state,
        })),
      });
    const text = result?.content?.find((c: any) => c.type === "text")?.text;
    if (text) {
      data = JSON.parse(text) as BalancerData;
    } else {
      data = generateMockData();
    }
  } catch {
    data = generateMockData();
  }

  render(data);
}

// ── Render ─────────────────────────────────────────────────────────────

function render(data: BalancerData) {
  document.body.innerHTML = "";

  // ── Header ────────────────────────────────────────────────────────
  const header = el("div", {
    style:
      "background:#1e293b;padding:12px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:12px;",
  });
  const totalUnits = data.stores.reduce(
    (sum, s) => sum + SEGMENTS.reduce((ss, seg) => ss + s.segments[seg].inventory, 0),
    0
  );
  header.innerHTML = `
    <h1 style="margin:0;font-size:16px;font-weight:600;color:#f8fafc;">Inventory Balancer</h1>
    <span style="font-size:12px;color:#64748b;margin-left:auto;">${data.stores.length} locations | ${totalUnits} total units | Updated just now</span>
  `;
  document.body.appendChild(header);

  // ── Main layout: sidebar (left) + content (right) ─────────────────
  const outerWrapper = el("div", {
    style: "display:flex;min-height:calc(100vh - 45px);",
  });
  document.body.appendChild(outerWrapper);

  // ── Sidebar: Location Demand Profiles ─────────────────────────────
  const sidebar = el("div", {
    style:
      "width:280px;min-width:280px;background:#1e293b;border-right:1px solid #334155;padding:16px;overflow-y:auto;",
  });
  outerWrapper.appendChild(sidebar);

  sidebar.innerHTML = `<h2 style="font-size:13px;font-weight:600;color:#f8fafc;margin:0 0 16px 0;text-transform:uppercase;letter-spacing:0.5px;">Location Demand Profiles</h2>`;

  for (const store of data.stores) {
    const card = el("div", {
      style:
        "background:#0f172a;border:1px solid #334155;border-radius:8px;padding:12px;margin-bottom:12px;",
    });

    card.innerHTML = `
      <div style="font-size:12px;font-weight:600;color:#f8fafc;margin-bottom:2px;">${store.location.name}</div>
      <div style="font-size:10px;color:#64748b;margin-bottom:10px;">${store.location.city}, ${store.location.state}</div>
    `;

    // Get top 5 segments by demand
    const segEntries = SEGMENTS.map((seg) => ({
      segment: seg,
      ...store.segments[seg],
    }))
      .sort((a, b) => b.demand - a.demand)
      .slice(0, 5);

    for (const entry of segEntries) {
      const maxVal = Math.max(entry.inventory, entry.demand * 0.25) || 1;
      const invWidth = Math.round((entry.inventory / (maxVal * 1.2)) * 100);
      const demandWidth = Math.round(((entry.demand * 0.25) / (maxVal * 1.2)) * 100);
      const status = cellStatus(entry.inventory, entry.demand);
      const isMismatch = status !== "balanced";

      const row = el("div", { style: "margin-bottom:8px;" });
      const labelColor = isMismatch ? "#f59e0b" : "#94a3b8";
      const mismatchIcon = isMismatch
        ? `<span style="color:${status === "understocked" ? "#3b82f6" : "#f97316"};font-size:9px;margin-left:4px;">${status === "understocked" ? "NEED" : "EXCESS"}</span>`
        : "";

      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
          <span style="font-size:10px;color:${labelColor};font-weight:${isMismatch ? "600" : "400"};">${entry.segment}${mismatchIcon}</span>
        </div>
        <div style="position:relative;height:14px;margin-bottom:1px;">
          <div style="position:absolute;top:0;left:0;height:6px;width:${demandWidth}%;background:#3b82f6;border-radius:3px;opacity:0.8;" title="Demand: ${entry.demand} (ideal: ${Math.round(entry.demand * 0.25)} units)"></div>
          <div style="position:absolute;top:8px;left:0;height:6px;width:${invWidth}%;background:#64748b;border-radius:3px;" title="Inventory: ${entry.inventory} units"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:9px;color:#64748b;">
          <span style="color:#60a5fa;">Demand: ${Math.round(entry.demand * 0.25)}</span>
          <span>Inv: ${entry.inventory}</span>
        </div>
      `;
      card.appendChild(row);
    }

    sidebar.appendChild(card);
  }

  // Sidebar legend
  const legend = el("div", {
    style: "margin-top:8px;padding:10px;background:#0f172a;border-radius:6px;border:1px solid #334155;",
  });
  legend.innerHTML = `
    <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Legend</div>
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
      <div style="width:16px;height:5px;background:#3b82f6;border-radius:2px;"></div>
      <span style="font-size:10px;color:#94a3b8;">Ideal inventory (from demand)</span>
    </div>
    <div style="display:flex;align-items:center;gap:6px;">
      <div style="width:16px;height:5px;background:#64748b;border-radius:2px;"></div>
      <span style="font-size:10px;color:#94a3b8;">Actual inventory</span>
    </div>
  `;
  sidebar.appendChild(legend);

  // ── Main content area ──────────────────────────────────────────────
  const content = el("div", {
    style: "flex:1;padding:16px 20px;overflow-y:auto;",
  });
  outerWrapper.appendChild(content);

  // ── Supply/Demand Matrix (60%) ────────────────────────────────────
  const matrixSection = el("div", { style: "margin-bottom:20px;" });
  content.appendChild(matrixSection);

  matrixSection.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <h2 style="font-size:14px;font-weight:600;color:#f8fafc;margin:0;">Supply / Demand Matrix</h2>
      <div style="display:flex;gap:14px;font-size:11px;">
        <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:rgba(16,185,129,0.25);border:1px solid #10b981;"></span><span style="color:#94a3b8;">Balanced</span></span>
        <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:rgba(59,130,246,0.25);border:1px solid #3b82f6;"></span><span style="color:#94a3b8;">Understocked (IN)</span></span>
        <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:rgba(249,115,22,0.25);border:1px solid #f97316;"></span><span style="color:#94a3b8;">Overstocked (OUT)</span></span>
      </div>
    </div>
  `;

  // Build matrix table
  const matrixWrapper = el("div", {
    style: "overflow-x:auto;border:1px solid #334155;border-radius:8px;",
  });
  const matrixTable = el("table", {
    style: "width:100%;border-collapse:collapse;font-size:12px;",
  });

  // Header row
  const mThead = document.createElement("thead");
  const mHeadRow = document.createElement("tr");

  // Corner cell
  const cornerTh = document.createElement("th");
  cornerTh.style.cssText =
    "padding:10px 12px;text-align:left;background:#1e293b;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;position:sticky;left:0;z-index:2;min-width:130px;";
  cornerTh.textContent = "Segment";
  mHeadRow.appendChild(cornerTh);

  for (const store of data.stores) {
    const th = document.createElement("th");
    th.style.cssText =
      "padding:10px 12px;text-align:center;background:#1e293b;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;min-width:140px;";
    th.innerHTML = `${store.location.name}<br><span style="font-size:9px;color:#64748b;font-weight:400;">${store.location.city}, ${store.location.state}</span>`;
    mHeadRow.appendChild(th);
  }
  mThead.appendChild(mHeadRow);
  matrixTable.appendChild(mThead);

  // Body rows: one per segment
  const mTbody = document.createElement("tbody");
  for (const seg of SEGMENTS) {
    const tr = document.createElement("tr");
    tr.style.cssText = "border-bottom:1px solid #1e293b;";

    // Segment label cell
    const labelTd = document.createElement("td");
    labelTd.style.cssText =
      "padding:10px 12px;font-weight:600;color:#e2e8f0;background:#0f172a;position:sticky;left:0;z-index:1;border-right:1px solid #334155;white-space:nowrap;font-size:12px;";
    labelTd.textContent = seg;
    tr.appendChild(labelTd);

    for (const store of data.stores) {
      const segData = store.segments[seg];
      const status = cellStatus(segData.inventory, segData.demand);
      const bgColor = statusColor(status);
      const borderColor = statusBorder(status);

      const td = document.createElement("td");
      td.style.cssText = `padding:10px 12px;text-align:center;background:${bgColor};border-left:1px solid rgba(51,65,85,0.5);position:relative;cursor:default;transition:outline 0.15s;`;

      const ideal = Math.round(segData.demand * 0.25);
      const diff = segData.inventory - ideal;
      const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
      const diffColor = status === "balanced" ? "#10b981" : status === "understocked" ? "#3b82f6" : "#f97316";

      td.innerHTML = `
        <div style="font-size:16px;font-weight:700;color:#f8fafc;">${segData.inventory}</div>
        <div style="font-size:10px;color:#94a3b8;margin-top:1px;">demand: ${segData.demand}</div>
        <div style="font-size:10px;font-weight:600;color:${diffColor};margin-top:2px;">${diffStr} vs ideal</div>
      `;

      // Tooltip
      td.title = `${seg} at ${store.location.name}\nInventory: ${segData.inventory} units\nDemand Score: ${segData.demand}/100\nIdeal Stock: ${ideal} units\nStatus: ${statusLabel(status)}`;

      // Hover outline
      td.addEventListener("mouseenter", () => {
        td.style.outline = `2px solid ${borderColor}`;
        td.style.outlineOffset = "-2px";
        td.style.zIndex = "1";
      });
      td.addEventListener("mouseleave", () => {
        td.style.outline = "none";
        td.style.zIndex = "0";
      });

      tr.appendChild(td);
    }
    mTbody.appendChild(tr);
  }
  matrixTable.appendChild(mTbody);

  // Totals row
  const totalsRow = document.createElement("tr");
  totalsRow.style.cssText = "background:#1e293b;";

  const totalLabel = document.createElement("td");
  totalLabel.style.cssText =
    "padding:10px 12px;font-weight:700;color:#f8fafc;position:sticky;left:0;z-index:1;border-right:1px solid #334155;background:#1e293b;font-size:12px;text-transform:uppercase;";
  totalLabel.textContent = "Total";
  totalsRow.appendChild(totalLabel);

  for (const store of data.stores) {
    const storeTotal = SEGMENTS.reduce((sum, seg) => sum + store.segments[seg].inventory, 0);
    const storeDemandAvg = Math.round(
      SEGMENTS.reduce((sum, seg) => sum + store.segments[seg].demand, 0) / SEGMENTS.length
    );
    const td = document.createElement("td");
    td.style.cssText =
      "padding:10px 12px;text-align:center;border-left:1px solid rgba(51,65,85,0.5);background:#1e293b;";
    td.innerHTML = `
      <div style="font-size:14px;font-weight:700;color:#f8fafc;">${storeTotal}</div>
      <div style="font-size:10px;color:#94a3b8;">avg demand: ${storeDemandAvg}</div>
    `;
    totalsRow.appendChild(td);
  }
  mTbody.appendChild(totalsRow);

  matrixWrapper.appendChild(matrixTable);
  matrixSection.appendChild(matrixWrapper);

  // ── Transfer Recommendations Table (40%) ──────────────────────────
  const recsSection = el("div", { style: "margin-top:4px;" });
  content.appendChild(recsSection);

  recsSection.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <h2 style="font-size:14px;font-weight:600;color:#f8fafc;margin:0;">Transfer Recommendations</h2>
      <div style="font-size:11px;color:#64748b;">${data.recommendations.length} recommended transfers | Transport cost: ${fmtCurrency(TRANSPORT_COST)}/vehicle</div>
    </div>
  `;

  const recsWrapper = el("div", {
    style: "overflow-x:auto;border:1px solid #334155;border-radius:8px;max-height:480px;overflow-y:auto;",
  });
  const recsTable = el("table", {
    style: "width:100%;border-collapse:collapse;font-size:12px;",
  });

  // Header
  const rThead = document.createElement("thead");
  const rHeadRow = document.createElement("tr");
  const recHeaders = [
    "VIN (last 6)",
    "Year/Make/Model",
    "Segment",
    "Current Store",
    "DOM",
    "",
    "Dest Store",
    "Demand",
    "DOM Reduction",
    "Transport",
    "Net Benefit",
  ];
  for (const h of recHeaders) {
    const th = document.createElement("th");
    th.style.cssText =
      "padding:8px 10px;text-align:left;background:#1e293b;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;position:sticky;top:0;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;z-index:1;";
    if (h === "") {
      th.style.textAlign = "center";
      th.style.width = "30px";
    }
    th.textContent = h;
    rHeadRow.appendChild(th);
  }
  rThead.appendChild(rHeadRow);
  recsTable.appendChild(rThead);

  // Body
  const rTbody = document.createElement("tbody");
  for (const rec of data.recommendations) {
    const tr = document.createElement("tr");
    tr.style.cssText = "border-bottom:1px solid #1e293b;";
    tr.addEventListener("mouseenter", () => {
      tr.style.background = "#1e293b";
    });
    tr.addEventListener("mouseleave", () => {
      tr.style.background = "";
    });

    const benefitColor = rec.netBenefit >= 0 ? "#10b981" : "#ef4444";
    const benefitSign = rec.netBenefit >= 0 ? "+" : "";

    // Demand score badge color
    let demandBadgeBg: string;
    let demandBadgeColor: string;
    if (rec.localDemandScore >= 75) {
      demandBadgeBg = "rgba(16,185,129,0.15)";
      demandBadgeColor = "#10b981";
    } else if (rec.localDemandScore >= 55) {
      demandBadgeBg = "rgba(245,158,11,0.15)";
      demandBadgeColor = "#f59e0b";
    } else {
      demandBadgeBg = "rgba(239,68,68,0.15)";
      demandBadgeColor = "#ef4444";
    }

    const cells = [
      `<span style="font-family:'SF Mono',Menlo,monospace;color:#94a3b8;">${rec.vinLast6}</span>`,
      `<span style="color:#e2e8f0;font-weight:500;">${rec.year} ${rec.make} ${rec.model}</span>`,
      `<span style="font-size:11px;color:#94a3b8;">${rec.segment}</span>`,
      `<span style="color:#e2e8f0;">${rec.currentStore}</span>`,
      `<span style="color:${rec.currentDom > 60 ? "#ef4444" : rec.currentDom > 30 ? "#f59e0b" : "#10b981"};font-weight:600;">${rec.currentDom}d</span>`,
      `<span style="color:#3b82f6;font-size:14px;font-weight:700;">&#8594;</span>`,
      `<span style="color:#60a5fa;font-weight:500;">${rec.destStore}</span>`,
      `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${demandBadgeBg};color:${demandBadgeColor};">${rec.localDemandScore}</span>`,
      `<span style="color:#10b981;font-weight:600;">-${rec.estDomReduction}d</span>`,
      `<span style="color:#f59e0b;">${fmtCurrency(rec.transportCost)}</span>`,
      `<span style="color:${benefitColor};font-weight:700;">${benefitSign}${fmtCurrency(rec.netBenefit)}</span>`,
    ];

    tr.innerHTML = cells
      .map((c, i) => {
        const align = i === 5 ? "text-align:center;" : "";
        return `<td style="padding:7px 10px;white-space:nowrap;${align}">${c}</td>`;
      })
      .join("");
    rTbody.appendChild(tr);
  }
  recsTable.appendChild(rTbody);

  // Summary row
  const summaryRow = document.createElement("tr");
  summaryRow.style.cssText = "background:#1e293b;border-top:2px solid #334155;";

  const totalTransportCost = data.recommendations.reduce((s, r) => s + r.transportCost, 0);
  const totalNetBenefit = data.recommendations.reduce((s, r) => s + r.netBenefit, 0);
  const avgDomReduction = Math.round(
    data.recommendations.reduce((s, r) => s + r.estDomReduction, 0) / (data.recommendations.length || 1)
  );

  summaryRow.innerHTML = `
    <td colspan="8" style="padding:10px;text-align:right;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;">
      ${data.recommendations.length} transfers | Avg DOM Reduction: ${avgDomReduction}d
    </td>
    <td style="padding:10px;text-align:left;font-size:12px;font-weight:700;color:#10b981;">-${avgDomReduction}d avg</td>
    <td style="padding:10px;font-size:12px;font-weight:700;color:#f59e0b;">${fmtCurrency(totalTransportCost)}</td>
    <td style="padding:10px;font-size:12px;font-weight:700;color:${totalNetBenefit >= 0 ? "#10b981" : "#ef4444"};">${totalNetBenefit >= 0 ? "+" : ""}${fmtCurrency(totalNetBenefit)}</td>
  `;
  rTbody.appendChild(summaryRow);

  recsWrapper.appendChild(recsTable);
  recsSection.appendChild(recsWrapper);
}

main();
