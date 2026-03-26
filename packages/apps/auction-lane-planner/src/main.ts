/**
 * Auction Lane Planner — MCP App 21
 * Dark-themed dashboard for planning auction lanes, sourcing consignment
 * inventory, targeting buyers, and pricing run lists.
 */
import { App } from "@modelcontextprotocol/ext-apps";

const _safeApp = (() => { try { return new App({ name: "auction-lane-planner" });

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

interface LaneRow {
  segment: string;
  unitCount: number;
  avgExpectedHammer: number;
  dsRatio: number;
  sellThroughPct: number;
  revenueEstimate: number;
}

interface ConsignmentProspect {
  dealerName: string;
  vinLast6: string;
  make: string;
  model: string;
  dom: number;
  listedPrice: number;
  expectedHammer: number;
  marginForSeller: number;
}

interface BuyerTarget {
  dealerName: string;
  location: string;
  inventoryGap: string;
}

interface RunListResult {
  vin: string;
  year: number;
  make: string;
  model: string;
  expectedHammer: number;
  priceRangeLow: number;
  priceRangeHigh: number;
  compCount: number;
  sellThroughConfidence: string;
}

interface AuctionLaneData {
  lanes: LaneRow[];
  consignmentPipeline: ConsignmentProspect[];
  buyerTargets: BuyerTarget[];
  runListResults: RunListResult[];
}

// ── Mock Data ──────────────────────────────────────────────────────────────────

function getMockLaneData(): AuctionLaneData {
  const lanes: LaneRow[] = [
    { segment: "Luxury SUV", unitCount: 24, avgExpectedHammer: 41250, dsRatio: 1.9, sellThroughPct: 87, revenueEstimate: 990000 },
    { segment: "Compact SUV", unitCount: 38, avgExpectedHammer: 22800, dsRatio: 2.1, sellThroughPct: 92, revenueEstimate: 866400 },
    { segment: "Full-size Truck", unitCount: 31, avgExpectedHammer: 34500, dsRatio: 2.4, sellThroughPct: 89, revenueEstimate: 1069500 },
    { segment: "Midsize Sedan", unitCount: 29, avgExpectedHammer: 17600, dsRatio: 1.3, sellThroughPct: 72, revenueEstimate: 510400 },
    { segment: "Economy", unitCount: 22, avgExpectedHammer: 12400, dsRatio: 0.9, sellThroughPct: 55, revenueEstimate: 272800 },
    { segment: "Specialty", unitCount: 12, avgExpectedHammer: 58700, dsRatio: 1.1, sellThroughPct: 63, revenueEstimate: 704400 },
  ];

  const consignmentPipeline: ConsignmentProspect[] = [
    { dealerName: "Premier Auto Group", vinLast6: "A78234", make: "BMW", model: "X5 xDrive40i", dom: 142, listedPrice: 48900, expectedHammer: 38200, marginForSeller: -10700 },
    { dealerName: "Sunset Motors", vinLast6: "K91827", make: "Chevrolet", model: "Tahoe LT", dom: 128, listedPrice: 42500, expectedHammer: 35800, marginForSeller: -6700 },
    { dealerName: "Valley Ford Lincoln", vinLast6: "F33419", make: "Lincoln", model: "Navigator Reserve", dom: 119, listedPrice: 62300, expectedHammer: 51400, marginForSeller: -10900 },
    { dealerName: "AutoNation Honda", vinLast6: "H55612", make: "Honda", model: "Passport Elite", dom: 112, listedPrice: 34200, expectedHammer: 27600, marginForSeller: -6600 },
    { dealerName: "CrossTown Chevrolet", vinLast6: "C82901", make: "Chevrolet", model: "Silverado 1500 LTZ", dom: 105, listedPrice: 46800, expectedHammer: 38900, marginForSeller: -7900 },
    { dealerName: "Lone Star Toyota", vinLast6: "T66478", make: "Toyota", model: "4Runner TRD Pro", dom: 98, listedPrice: 51200, expectedHammer: 45600, marginForSeller: -5600 },
    { dealerName: "Heritage Chrysler", vinLast6: "J22510", make: "Jeep", model: "Grand Cherokee L", dom: 94, listedPrice: 44100, expectedHammer: 35700, marginForSeller: -8400 },
    { dealerName: "Metro Nissan", vinLast6: "N17834", make: "Nissan", model: "Armada Platinum", dom: 91, listedPrice: 49600, expectedHammer: 39200, marginForSeller: -10400 },
    { dealerName: "Greenfield Hyundai", vinLast6: "U40293", make: "Hyundai", model: "Palisade Calligraphy", dom: 87, listedPrice: 41800, expectedHammer: 34500, marginForSeller: -7300 },
    { dealerName: "Capital Buick GMC", vinLast6: "G51884", make: "GMC", model: "Sierra 1500 Denali", dom: 83, listedPrice: 55400, expectedHammer: 46100, marginForSeller: -9300 },
    { dealerName: "Riverside Subaru", vinLast6: "S29475", make: "Subaru", model: "Ascent Touring", dom: 79, listedPrice: 37600, expectedHammer: 29800, marginForSeller: -7800 },
    { dealerName: "Westside Kia", vinLast6: "W88321", make: "Kia", model: "Telluride SX", dom: 74, listedPrice: 43200, expectedHammer: 37400, marginForSeller: -5800 },
    { dealerName: "Parkway Dodge", vinLast6: "D63027", make: "Ram", model: "1500 Laramie", dom: 71, listedPrice: 48100, expectedHammer: 40200, marginForSeller: -7900 },
    { dealerName: "Empire Lexus", vinLast6: "L44519", make: "Lexus", model: "RX 350 F Sport", dom: 68, listedPrice: 44700, expectedHammer: 37800, marginForSeller: -6900 },
    { dealerName: "Summit Volkswagen", vinLast6: "V73206", make: "Volkswagen", model: "Atlas SEL Premium", dom: 65, listedPrice: 38900, expectedHammer: 30100, marginForSeller: -8800 },
  ];

  const buyerTargets: BuyerTarget[] = [
    { dealerName: "FastLane Auto Sales", location: "Dallas, TX", inventoryGap: "Compact SUV" },
    { dealerName: "Budget Wheels Inc.", location: "Fort Worth, TX", inventoryGap: "Economy" },
    { dealerName: "Prestige Motor Cars", location: "Plano, TX", inventoryGap: "Luxury SUV" },
    { dealerName: "Hill Country Motors", location: "Austin, TX", inventoryGap: "Full-size Truck" },
    { dealerName: "Bayou City Autos", location: "Houston, TX", inventoryGap: "Midsize Sedan" },
    { dealerName: "Pinnacle Automotive", location: "San Antonio, TX", inventoryGap: "Luxury SUV" },
    { dealerName: "RedLine Used Cars", location: "Arlington, TX", inventoryGap: "Specialty" },
    { dealerName: "Magnolia Auto Group", location: "Irving, TX", inventoryGap: "Compact SUV" },
    { dealerName: "Clearwater Motors", location: "Frisco, TX", inventoryGap: "Full-size Truck" },
    { dealerName: "Southfork Dealership", location: "McKinney, TX", inventoryGap: "Midsize Sedan" },
  ];

  const runListResults: RunListResult[] = [
    { vin: "1FTFW1E86NFA12345", year: 2022, make: "Ford", model: "F-150 XLT", expectedHammer: 33200, priceRangeLow: 30800, priceRangeHigh: 35600, compCount: 47, sellThroughConfidence: "High" },
    { vin: "5TDGZRAH1NS234567", year: 2022, make: "Toyota", model: "Highlander XLE", expectedHammer: 34800, priceRangeLow: 32100, priceRangeHigh: 37500, compCount: 32, sellThroughConfidence: "High" },
    { vin: "WBA53BH06NCK34567", year: 2022, make: "BMW", model: "530i xDrive", expectedHammer: 37400, priceRangeLow: 34200, priceRangeHigh: 40600, compCount: 18, sellThroughConfidence: "Medium" },
    { vin: "3N1AB8CV7NY456789", year: 2022, make: "Nissan", model: "Sentra SV", expectedHammer: 16200, priceRangeLow: 14800, priceRangeHigh: 17600, compCount: 61, sellThroughConfidence: "Low" },
    { vin: "1C4RJXF65NC567890", year: 2022, make: "Jeep", model: "Grand Cherokee Limited", expectedHammer: 38900, priceRangeLow: 36200, priceRangeHigh: 41600, compCount: 29, sellThroughConfidence: "High" },
  ];

  return { lanes, consignmentPipeline, buyerTargets, runListResults };
}

function getMockRunListResults(vins: string[]): RunListResult[] {
  const mockDb: Record<string, Omit<RunListResult, "vin">> = {
    "1FTFW1E86NFA12345": { year: 2022, make: "Ford", model: "F-150 XLT", expectedHammer: 33200, priceRangeLow: 30800, priceRangeHigh: 35600, compCount: 47, sellThroughConfidence: "High" },
    "5TDGZRAH1NS234567": { year: 2022, make: "Toyota", model: "Highlander XLE", expectedHammer: 34800, priceRangeLow: 32100, priceRangeHigh: 37500, compCount: 32, sellThroughConfidence: "High" },
    "WBA53BH06NCK34567": { year: 2022, make: "BMW", model: "530i xDrive", expectedHammer: 37400, priceRangeLow: 34200, priceRangeHigh: 40600, compCount: 18, sellThroughConfidence: "Medium" },
    "3N1AB8CV7NY456789": { year: 2022, make: "Nissan", model: "Sentra SV", expectedHammer: 16200, priceRangeLow: 14800, priceRangeHigh: 17600, compCount: 61, sellThroughConfidence: "Low" },
    "1C4RJXF65NC567890": { year: 2022, make: "Jeep", model: "Grand Cherokee Limited", expectedHammer: 38900, priceRangeLow: 36200, priceRangeHigh: 41600, compCount: 29, sellThroughConfidence: "High" },
    "1GNSCJKC0NR678901": { year: 2022, make: "Chevrolet", model: "Suburban RST", expectedHammer: 48200, priceRangeLow: 45100, priceRangeHigh: 51300, compCount: 14, sellThroughConfidence: "High" },
    "JTDKN3DU5A5789012": { year: 2023, make: "Toyota", model: "Prius LE", expectedHammer: 24600, priceRangeLow: 22800, priceRangeHigh: 26400, compCount: 38, sellThroughConfidence: "Medium" },
    "2T1BURHE0KC890123": { year: 2022, make: "Toyota", model: "Corolla SE", expectedHammer: 19800, priceRangeLow: 18200, priceRangeHigh: 21400, compCount: 53, sellThroughConfidence: "Medium" },
    "1HGBH41JXMN901234": { year: 2021, make: "Honda", model: "Civic EX", expectedHammer: 21400, priceRangeLow: 19600, priceRangeHigh: 23200, compCount: 44, sellThroughConfidence: "Medium" },
    "WAUANAF42LN012345": { year: 2020, make: "Audi", model: "A4 Premium", expectedHammer: 28600, priceRangeLow: 26100, priceRangeHigh: 31100, compCount: 21, sellThroughConfidence: "Medium" },
  };

  return vins.map((vin) => {
    const cleaned = vin.trim().toUpperCase();
    const known = mockDb[cleaned];
    if (known) return { vin: cleaned, ...known };

    const hammer = 15000 + Math.floor(Math.random() * 35000);
    const spread = Math.round(hammer * 0.08);
    const compCount = 5 + Math.floor(Math.random() * 55);
    let confidence: string;
    if (hammer > 28000 && compCount > 20) confidence = "High";
    else if (compCount < 10 || hammer < 15000) confidence = "Low";
    else confidence = "Medium";

    return {
      vin: cleaned,
      year: 2019 + Math.floor(Math.random() * 5),
      make: "Unknown",
      model: "Decoded Model",
      expectedHammer: hammer,
      priceRangeLow: hammer - spread,
      priceRangeHigh: hammer + spread,
      compCount,
      sellThroughConfidence: confidence,
    };
  });
}

// ── Formatting Helpers ─────────────────────────────────────────────────────────

function fmtDollar(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

function fmtPct(n: number): string {
  return n.toFixed(0) + "%";
}

function sellThroughColor(pct: number): { bg: string; text: string } {
  if (pct > 80) return { bg: "#166534", text: "#86efac" };
  if (pct >= 60) return { bg: "#854d0e", text: "#fde68a" };
  return { bg: "#991b1b", text: "#fca5a5" };
}

function confidenceBadge(confidence: string): string {
  const colors: Record<string, { bg: string; text: string }> = {
    High: { bg: "#166534", text: "#86efac" },
    Medium: { bg: "#854d0e", text: "#fde68a" },
    Low: { bg: "#991b1b", text: "#fca5a5" },
  };
  const c = colors[confidence] ?? { bg: "#334155", text: "#e2e8f0" };
  return `<span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:700;letter-spacing:0.5px;background:${c.bg};color:${c.text}">${confidence}</span>`;
}

function targetBadge(): string {
  return `<span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:700;letter-spacing:0.5px;background:#1e3a5f;color:#93c5fd">Target</span>`;
}

function prospectButton(index: number): string {
  return `<button class="prospect-btn" data-index="${index}" style="background:#3b82f6;color:#fff;border:none;border-radius:6px;padding:4px 14px;font-size:12px;font-weight:600;cursor:pointer;transition:background 0.15s;white-space:nowrap">Prospect</button>`;
}

// ── Render: Lane Overview Grid ─────────────────────────────────────────────────

function renderLaneOverview(lanes: LaneRow[]): string {
  const thStyle = `padding:10px 14px;text-align:left;font-weight:600;color:#94a3b8;border-bottom:2px solid #334155;font-size:12px;text-transform:uppercase;letter-spacing:0.5px`;
  const thRight = `${thStyle};text-align:right`;

  const headers = `
    <tr>
      <th style="${thStyle}">Segment</th>
      <th style="${thRight}">Unit Count</th>
      <th style="${thRight}">Avg Expected Hammer</th>
      <th style="${thRight}">D/S Ratio</th>
      <th style="${thRight}">Sell-Through %</th>
      <th style="${thRight}">Revenue Estimate</th>
    </tr>`;

  let rows = "";
  for (const lane of lanes) {
    const stColors = sellThroughColor(lane.sellThroughPct);
    const cellStyle = `padding:10px 14px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:13px`;
    const cellRight = `${cellStyle};text-align:right`;

    rows += `<tr>
      <td style="${cellStyle};font-weight:600">${lane.segment}</td>
      <td style="${cellRight}">${lane.unitCount}</td>
      <td style="${cellRight}">${fmtDollar(lane.avgExpectedHammer)}</td>
      <td style="${cellRight};font-weight:700">${lane.dsRatio.toFixed(1)}</td>
      <td style="${cellRight}">
        <span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:12px;font-weight:700;background:${stColors.bg};color:${stColors.text}">${fmtPct(lane.sellThroughPct)}</span>
      </td>
      <td style="${cellRight};font-weight:700;color:#93c5fd">${fmtDollar(lane.revenueEstimate)}</td>
    </tr>`;
  }

  // Summary row
  const totalUnits = lanes.reduce((s, l) => s + l.unitCount, 0);
  const totalRevenue = lanes.reduce((s, l) => s + l.revenueEstimate, 0);
  const avgHammer = Math.round(lanes.reduce((s, l) => s + l.avgExpectedHammer, 0) / lanes.length);
  const avgSellThrough = Math.round(lanes.reduce((s, l) => s + l.sellThroughPct, 0) / lanes.length);
  const avgDs = (lanes.reduce((s, l) => s + l.dsRatio, 0) / lanes.length).toFixed(1);
  const summaryStyle = `padding:10px 14px;border-top:2px solid #334155;color:#e2e8f0;font-size:13px;font-weight:700;background:#1a2538`;
  const summaryRight = `${summaryStyle};text-align:right`;

  rows += `<tr>
    <td style="${summaryStyle}">TOTAL / AVG</td>
    <td style="${summaryRight}">${totalUnits}</td>
    <td style="${summaryRight}">${fmtDollar(avgHammer)}</td>
    <td style="${summaryRight}">${avgDs}</td>
    <td style="${summaryRight}">${fmtPct(avgSellThrough)}</td>
    <td style="${summaryRight};color:#93c5fd">${fmtDollar(totalRevenue)}</td>
  </tr>`;

  return `
    <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden;margin-bottom:24px">
      <div style="padding:14px 16px;border-bottom:1px solid #334155;display:flex;align-items:center;justify-content:space-between">
        <div>
          <h2 style="font-size:18px;font-weight:700;color:#e2e8f0;margin-bottom:2px">Lane Overview</h2>
          <p style="font-size:12px;color:#64748b">Planned auction lanes by vehicle segment</p>
        </div>
        <div style="display:flex;gap:12px;font-size:11px">
          <span style="color:#86efac">&#9679; &gt;80% sell-through</span>
          <span style="color:#fde68a">&#9679; 60-80%</span>
          <span style="color:#fca5a5">&#9679; &lt;60%</span>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>${headers}</thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Render: Consignment Pipeline ───────────────────────────────────────────────

function renderConsignmentPipeline(prospects: ConsignmentProspect[]): string {
  const thStyle = `padding:8px 12px;text-align:left;font-weight:600;color:#94a3b8;border-bottom:2px solid #334155;font-size:11px;text-transform:uppercase;letter-spacing:0.5px`;
  const thRight = `${thStyle};text-align:right`;

  const headers = `
    <tr>
      <th style="${thStyle}">Dealer Name</th>
      <th style="${thStyle}">VIN (last 6)</th>
      <th style="${thStyle}">Make/Model</th>
      <th style="${thRight}">DOM</th>
      <th style="${thRight}">Listed Price</th>
      <th style="${thRight}">Exp. Hammer</th>
      <th style="${thRight}">Margin for Seller</th>
      <th style="${thStyle};text-align:center">Action</th>
    </tr>`;

  let rows = "";
  prospects.forEach((p, i) => {
    const cellStyle = `padding:7px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:12px`;
    const cellRight = `${cellStyle};text-align:right`;
    const marginColor = p.marginForSeller >= 0 ? "#86efac" : "#fca5a5";
    const domColor = p.dom > 90 ? "#fca5a5" : p.dom > 60 ? "#fde68a" : "#e2e8f0";

    rows += `<tr>
      <td style="${cellStyle};font-weight:600;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.dealerName}</td>
      <td style="${cellStyle};font-family:monospace;font-size:11px;color:#94a3b8">${p.vinLast6}</td>
      <td style="${cellStyle}">${p.make} ${p.model}</td>
      <td style="${cellRight};color:${domColor};font-weight:700">${p.dom}d</td>
      <td style="${cellRight}">${fmtDollar(p.listedPrice)}</td>
      <td style="${cellRight}">${fmtDollar(p.expectedHammer)}</td>
      <td style="${cellRight};color:${marginColor};font-weight:700">${p.marginForSeller >= 0 ? "+" : ""}${fmtDollar(p.marginForSeller)}</td>
      <td style="${cellStyle};text-align:center">${prospectButton(i)}</td>
    </tr>`;
  });

  return `
    <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden;flex:1;min-width:0">
      <div style="padding:14px 16px;border-bottom:1px solid #334155">
        <h3 style="font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:2px">Consignment Pipeline</h3>
        <p style="font-size:12px;color:#64748b">Aged dealer inventory to source as consignment &middot; Sorted by days on market</p>
      </div>
      <div style="overflow-x:auto;max-height:520px;overflow-y:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead style="position:sticky;top:0;z-index:1;background:#1e293b">${headers}</thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Render: Buyer Targeting ────────────────────────────────────────────────────

function renderBuyerTargeting(targets: BuyerTarget[]): string {
  const thStyle = `padding:8px 12px;text-align:left;font-weight:600;color:#94a3b8;border-bottom:2px solid #334155;font-size:11px;text-transform:uppercase;letter-spacing:0.5px`;

  const headers = `
    <tr>
      <th style="${thStyle}">Dealer Name</th>
      <th style="${thStyle}">Location</th>
      <th style="${thStyle}">Inventory Gap</th>
      <th style="${thStyle};text-align:center">Status</th>
    </tr>`;

  let rows = "";
  for (const t of targets) {
    const cellStyle = `padding:8px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:12px`;
    rows += `<tr>
      <td style="${cellStyle};font-weight:600">${t.dealerName}</td>
      <td style="${cellStyle};color:#94a3b8">${t.location}</td>
      <td style="${cellStyle}">
        <span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;background:#1e293b;border:1px solid #475569;color:#cbd5e1">${t.inventoryGap}</span>
      </td>
      <td style="${cellStyle};text-align:center">${targetBadge()}</td>
    </tr>`;
  }

  return `
    <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden;flex:1;min-width:0">
      <div style="padding:14px 16px;border-bottom:1px solid #334155">
        <h3 style="font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:2px">Buyer Targeting</h3>
        <p style="font-size:12px;color:#64748b">Dealers who need inventory in specific segments</p>
      </div>
      <div style="overflow-x:auto;max-height:520px;overflow-y:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead style="position:sticky;top:0;z-index:1;background:#1e293b">${headers}</thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Render: Run List Pricer ────────────────────────────────────────────────────

function renderRunListPricer(results: RunListResult[] | null): string {
  let resultsHtml = "";
  if (results && results.length > 0) {
    const thStyle = `padding:8px 12px;text-align:left;font-weight:600;color:#94a3b8;border-bottom:2px solid #334155;font-size:11px;text-transform:uppercase;letter-spacing:0.5px`;
    const thRight = `${thStyle};text-align:right`;

    const headers = `
      <tr>
        <th style="${thStyle}">VIN</th>
        <th style="${thStyle}">Year/Make/Model</th>
        <th style="${thRight}">Expected Hammer</th>
        <th style="${thRight}">Price Range</th>
        <th style="${thRight}">Comp Count</th>
        <th style="${thStyle};text-align:center">Sell-Through Confidence</th>
      </tr>`;

    let rows = "";
    for (const r of results) {
      const cellStyle = `padding:8px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:13px`;
      const cellRight = `${cellStyle};text-align:right`;
      rows += `<tr>
        <td style="${cellStyle};font-family:monospace;font-size:11px;color:#94a3b8">${r.vin}</td>
        <td style="${cellStyle};font-weight:600">${r.year} ${r.make} ${r.model}</td>
        <td style="${cellRight};font-weight:700;color:#93c5fd">${fmtDollar(r.expectedHammer)}</td>
        <td style="${cellRight}">${fmtDollar(r.priceRangeLow)} - ${fmtDollar(r.priceRangeHigh)}</td>
        <td style="${cellRight}">${r.compCount}</td>
        <td style="${cellStyle};text-align:center">${confidenceBadge(r.sellThroughConfidence)}</td>
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
        <h3 style="font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:2px">Run List Pricer</h3>
        <p style="font-size:12px;color:#64748b">Paste up to 15 VINs to get expected hammer prices and sell-through confidence</p>
      </div>
      <div style="padding:16px">
        <textarea id="runlist-input" placeholder="Paste VINs here, one per line...&#10;e.g.&#10;1FTFW1E86NFA12345&#10;5TDGZRAH1NS234567&#10;WBA53BH06NCK34567" style="width:100%;min-height:110px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:8px;padding:12px;font-family:monospace;font-size:13px;resize:vertical;outline:none"></textarea>
        <div style="margin-top:12px;display:flex;align-items:center;gap:12px">
          <button id="runlist-btn" style="background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:10px 24px;font-size:14px;font-weight:600;cursor:pointer;transition:background 0.15s">Price Run List</button>
          <span id="runlist-status" style="font-size:12px;color:#64748b"></span>
        </div>
        <div id="runlist-results">${resultsHtml}</div>
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
      <div style="font-size:24px;font-weight:700;color:#e2e8f0;margin-bottom:12px">Auction Lane Planner</div>
      <div style="color:#64748b">Loading auction data...</div>
    </div>`;

  // ── Fetch data ──
  let data: AuctionLaneData;
  try {
    const result = await _callTool("auction-lane-planner", { state: "TX", zip: "75201" });
    data = JSON.parse(
      typeof result === "string"
        ? result
        : (result as { content?: Array<{ text?: string }> })?.content?.[0]?.text ?? "{}"
    );
    if (!data.lanes || !data.consignmentPipeline || !data.buyerTargets) {
      data = getMockLaneData();
    }
  } catch {
    data = getMockLaneData();
  }

  // ── Render full UI ──
  function renderUI(runListResults: RunListResult[] | null = null) {
    // Use pre-loaded results on first render if no run-list results provided yet
    const displayResults = runListResults ?? data.runListResults;

    root.innerHTML = `
      <div style="max-width:1500px;margin:0 auto">
        <!-- Header -->
        <div style="margin-bottom:24px;display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div>
            <h1 style="font-size:26px;font-weight:800;color:#e2e8f0;margin-bottom:4px">Auction Lane Planner</h1>
            <p style="font-size:13px;color:#64748b">Plan lanes, source consignment inventory, target buyers, and price run lists</p>
          </div>
          <div style="display:flex;gap:16px;font-size:12px;color:#94a3b8">
            <span>Region: <strong style="color:#e2e8f0">Dallas-Fort Worth, TX</strong></span>
            <span>Sale Date: <strong style="color:#e2e8f0">Next Tuesday</strong></span>
          </div>
        </div>

        <!-- Lane Overview Grid (top) -->
        ${renderLaneOverview(data.lanes)}

        <!-- Middle row: Consignment Pipeline + Buyer Targeting -->
        <div style="display:flex;gap:20px;margin-bottom:24px;flex-wrap:wrap">
          <div style="flex:1;min-width:500px">
            ${renderConsignmentPipeline(data.consignmentPipeline)}
          </div>
          <div style="flex:1;min-width:360px">
            ${renderBuyerTargeting(data.buyerTargets)}
          </div>
        </div>

        <!-- Run List Pricer (bottom) -->
        ${renderRunListPricer(displayResults)}
      </div>`;

    // Wire up Prospect buttons
    document.querySelectorAll(".prospect-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const el = e.target as HTMLButtonElement;
        el.textContent = "Sent";
        el.style.background = "#166534";
        el.style.cursor = "default";
        el.disabled = true;
      });
    });

    // Wire up Run List button
    const runBtn = document.getElementById("runlist-btn") as HTMLButtonElement | null;
    const runTextarea = document.getElementById("runlist-input") as HTMLTextAreaElement | null;
    const runStatus = document.getElementById("runlist-status") as HTMLSpanElement | null;

    runBtn?.addEventListener("click", async () => {
      const raw = runTextarea?.value ?? "";
      const vins = raw
        .split("\n")
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
        .slice(0, 15);

      if (vins.length === 0) {
        if (runStatus) runStatus.textContent = "Please enter at least one VIN.";
        return;
      }

      if (runStatus) runStatus.textContent = `Pricing ${vins.length} VIN${vins.length > 1 ? "s" : ""}...`;
      runBtn.disabled = true;
      runBtn.style.opacity = "0.6";

      let results: RunListResult[];
      try {
        const res = await _callTool("auction-lane-planner", { state: "TX", zip: "75201", runListVins: vins });
        const parsed = JSON.parse(
          typeof res === "string"
            ? res
            : (res as { content?: Array<{ text?: string }> })?.content?.[0]?.text ?? "{}"
        );
        results =
          parsed.runListResults && parsed.runListResults.length > 0
            ? parsed.runListResults
            : getMockRunListResults(vins);
      } catch {
        results = getMockRunListResults(vins);
      }

      const savedText = runTextarea?.value ?? "";
      renderUI(results);
      const newTextarea = document.getElementById("runlist-input") as HTMLTextAreaElement | null;
      if (newTextarea) newTextarea.value = savedText;
    });
  }

  renderUI();
}

main();
