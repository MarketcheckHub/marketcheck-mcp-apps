/**
 * Auction Dealer Targeting
 * Identify high-volume buyers in your target market.
 * Uses active listing facets to find high-volume dealers,
 * categorizes by type (franchise vs independent), and assesses
 * buying capacity based on inventory size, mix, and turnover.
 */

import { App } from "@modelcontextprotocol/ext-apps";

let _safeApp: any = null;
try { _safeApp = new App({ name: "auction-dealer-targeting" }); } catch {}

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
  for (const key of ["zip", "radius", "make"]) {
    const v = params.get(key);
    if (v) result[key] = v;
  }
  return result;
}

function _proxyBase(): string {
  return location.protocol.startsWith("http") ? "" : "http://localhost:3001";
}

// ── Direct MarketCheck API Client ──────────────────────────────────────
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

function _mcActive(p: Record<string, any>) { return _mcApi("/search/car/active", p); }

// ── Types ──────────────────────────────────────────────────────────────

interface DealerTarget {
  dealerId: string;
  dealerName: string;
  city: string;
  state: string;
  sellerType: string; // "franchise" | "independent" | "dealer"
  inventoryCount: number;
  avgPrice: number;
  avgDom: number;
  topMakes: string[];
  buyingCapacity: number; // estimated monthly purchases
  segmentMatch: number; // 0-100 how well dealer matches market demand
}

interface MarketSegment {
  name: string;
  count: number;
  pct: number;
}

interface TargetingData {
  dealers: DealerTarget[];
  marketMakeMix: MarketSegment[];
  marketBodyMix: MarketSegment[];
  summary: {
    totalDealers: number;
    totalInventory: number;
    franchiseCount: number;
    independentCount: number;
    avgInventorySize: number;
  };
}

// ── Business Logic ─────────────────────────────────────────────────────

function calcBuyingCapacity(inventoryCount: number, avgDom: number): number {
  // Estimate monthly purchases: inventory / (avgDom / 30)
  // Higher inventory + lower DOM = more active buyer
  if (avgDom <= 0) return 0;
  const turnoverRate = 30 / avgDom; // fraction of inventory turning over per month
  return Math.round(inventoryCount * turnoverRate);
}

function calcSegmentMatch(dealerMakes: Record<string, number>, marketMakes: Record<string, number>): number {
  // Cosine-like similarity: how closely dealer's make mix matches market demand
  const allMakes = new Set([...Object.keys(dealerMakes), ...Object.keys(marketMakes)]);
  let dotProduct = 0;
  let dealerMag = 0;
  let marketMag = 0;
  for (const make of allMakes) {
    const d = dealerMakes[make] ?? 0;
    const m = marketMakes[make] ?? 0;
    dotProduct += d * m;
    dealerMag += d * d;
    marketMag += m * m;
  }
  const denominator = Math.sqrt(dealerMag) * Math.sqrt(marketMag);
  if (denominator === 0) return 0;
  return Math.round((dotProduct / denominator) * 100);
}

// ── Data Orchestration (Live Mode) ─────────────────────────────────────

async function _fetchDirect(zip: string, radius: number, make?: string): Promise<TargetingData> {
  // Step 1: Market Inventory with Dealer Facets
  const searchParams: Record<string, any> = {
    zip,
    radius,
    rows: 50,
    stats: "price,miles,dom_active",
    facets: "dealer_id,make,body_type",
    seller_type: "dealer",
  };
  if (make) searchParams.make = make;

  const searchResult = await _mcActive(searchParams);
  const listings = searchResult?.listings ?? [];
  const facets = searchResult?.facets ?? {};

  // Extract market-level make and body type distribution from facets
  const makeFacets: MarketSegment[] = (facets.make ?? []).slice(0, 15).map((f: any) => ({
    name: f.item ?? f.value ?? "Unknown",
    count: f.count ?? 0,
    pct: 0,
  }));
  const totalMakeFacets = makeFacets.reduce((s, m) => s + m.count, 0);
  for (const m of makeFacets) m.pct = totalMakeFacets > 0 ? Math.round((m.count / totalMakeFacets) * 100) : 0;

  const bodyFacets: MarketSegment[] = (facets.body_type ?? []).slice(0, 10).map((f: any) => ({
    name: f.item ?? f.value ?? "Unknown",
    count: f.count ?? 0,
    pct: 0,
  }));
  const totalBodyFacets = bodyFacets.reduce((s, b) => s + b.count, 0);
  for (const b of bodyFacets) b.pct = totalBodyFacets > 0 ? Math.round((b.count / totalBodyFacets) * 100) : 0;

  // Build market make distribution for segment matching
  const marketMakes: Record<string, number> = {};
  for (const m of makeFacets) marketMakes[m.name.toLowerCase()] = m.count;

  // Get top dealers from facets (facets show ALL dealers, not just ones in 50 rows)
  const dealerFacets = (facets.dealer_id ?? []).slice(0, 20);

  // Fetch one listing per top dealer to get dealer details (name, city, dealer_type) and sample inventory
  const dealerDetails = await Promise.all(
    dealerFacets.map(async (f: any) => {
      const dealerId = f.item ?? f.value ?? "";
      const inventoryCount = f.count ?? 0;
      try {
        const dRes = await _mcActive({
          dealer_id: dealerId,
          rows: 10,
          stats: "price,dom_active",
          facets: "make",
        });
        const dListings = dRes?.listings ?? [];
        const dStats = dRes?.stats ?? {};
        const dMakeFacets = dRes?.facets?.make ?? [];
        const dealer = dListings[0]?.dealer;

        // Dealer's make mix from its own facets
        const dealerMakes: Record<string, number> = {};
        for (const mf of dMakeFacets) {
          const name = (mf.item ?? mf.value ?? "").toLowerCase();
          if (name) dealerMakes[name] = mf.count ?? 0;
        }
        const topMakes = Object.entries(dealerMakes).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => m.charAt(0).toUpperCase() + m.slice(1));

        const avgPrice = Math.round(dStats.price?.mean ?? dStats.price?.avg ?? 0);
        const avgDom = Math.round(dStats.dom_active?.mean ?? dStats.dom_active?.avg ?? dStats.dom?.mean ?? 60);

        return {
          dealerId,
          dealerName: dealer?.name ?? "Unknown Dealer",
          city: dealer?.city ?? "",
          state: dealer?.state ?? "",
          sellerType: dealer?.dealer_type ?? "dealer",
          inventoryCount,
          avgPrice,
          avgDom,
          topMakes,
          buyingCapacity: calcBuyingCapacity(inventoryCount, avgDom),
          segmentMatch: calcSegmentMatch(dealerMakes, marketMakes),
        } as DealerTarget;
      } catch {
        return null;
      }
    })
  );

  const dealers = dealerDetails.filter((d): d is DealerTarget => d !== null);

  // Sort by inventory volume descending
  dealers.sort((a, b) => b.inventoryCount - a.inventoryCount);

  const franchiseCount = dealers.filter((d) => d.sellerType === "franchise").length;
  const independentCount = dealers.filter((d) => d.sellerType === "independent").length;
  const totalInventory = dealers.reduce((s, d) => s + d.inventoryCount, 0);

  return {
    dealers,
    marketMakeMix: makeFacets,
    marketBodyMix: bodyFacets,
    summary: {
      totalDealers: dealers.length,
      totalInventory,
      franchiseCount,
      independentCount,
      avgInventorySize: dealers.length > 0 ? Math.round(totalInventory / dealers.length) : 0,
    },
  };
}

// ── _callTool (MCP → Direct → Proxy → Mock) ───────────────────────────

async function _callTool(args: { zip: string; radius: number; make?: string }): Promise<TargetingData | null> {
  // 1. MCP mode
  if (_safeApp && window.parent !== window) {
    try {
      const r = await _safeApp.callServerTool({ name: "auction-dealer-targeting", arguments: args });
      const parsed = JSON.parse(typeof r === "string" ? r : r?.content?.[0]?.text ?? "{}");
      if (parsed.dealers) return parsed as TargetingData;
    } catch (e) { console.warn("MCP failed:", e); }
  }

  // 2. Direct API
  const auth = _getAuth();
  if (auth.value) {
    try {
      return await _fetchDirect(args.zip, args.radius, args.make);
    } catch (e) { console.warn("Direct API failed, trying proxy:", e); }

    // 3. Proxy fallback
    try {
      const r = await fetch((_proxyBase()) + "/api/proxy/auction-dealer-targeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...args, _auth_mode: auth.mode, _auth_value: auth.value }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.dealers) return d as TargetingData;
      }
    } catch {}
  }

  // 4. Demo mode
  return null;
}

// ── Mock Data ──────────────────────────────────────────────────────────

function getMockData(): TargetingData {
  const dealers: DealerTarget[] = [
    { dealerId: "d1", dealerName: "Coulter Cadillac Phoenix", city: "Phoenix", state: "AZ", sellerType: "franchise", inventoryCount: 245, avgPrice: 52400, avgDom: 38, topMakes: ["Cadillac", "Chevrolet", "GMC"], buyingCapacity: 0, segmentMatch: 0 },
    { dealerId: "d2", dealerName: "San Tan Ford", city: "Gilbert", state: "AZ", sellerType: "franchise", inventoryCount: 198, avgPrice: 44200, avgDom: 42, topMakes: ["Ford", "Lincoln"], buyingCapacity: 0, segmentMatch: 0 },
    { dealerId: "d3", dealerName: "Earnhardt Toyota", city: "Mesa", state: "AZ", sellerType: "franchise", inventoryCount: 312, avgPrice: 36800, avgDom: 35, topMakes: ["Toyota"], buyingCapacity: 0, segmentMatch: 0 },
    { dealerId: "d4", dealerName: "AutoNation Honda Chandler", city: "Chandler", state: "AZ", sellerType: "franchise", inventoryCount: 176, avgPrice: 31200, avgDom: 45, topMakes: ["Honda", "Acura"], buyingCapacity: 0, segmentMatch: 0 },
    { dealerId: "d5", dealerName: "Courtesy CDJR", city: "Tempe", state: "AZ", sellerType: "franchise", inventoryCount: 220, avgPrice: 41500, avgDom: 48, topMakes: ["Jeep", "Ram", "Dodge"], buyingCapacity: 0, segmentMatch: 0 },
    { dealerId: "d6", dealerName: "FastLane Auto Sales", city: "Phoenix", state: "AZ", sellerType: "independent", inventoryCount: 85, avgPrice: 18900, avgDom: 62, topMakes: ["Nissan", "Toyota", "Honda"], buyingCapacity: 0, segmentMatch: 0 },
    { dealerId: "d7", dealerName: "Arizona Auto Exchange", city: "Scottsdale", state: "AZ", sellerType: "independent", inventoryCount: 64, avgPrice: 22400, avgDom: 55, topMakes: ["BMW", "Mercedes-Benz", "Audi"], buyingCapacity: 0, segmentMatch: 0 },
    { dealerId: "d8", dealerName: "Budget Wheels Inc", city: "Glendale", state: "AZ", sellerType: "independent", inventoryCount: 42, avgPrice: 12600, avgDom: 78, topMakes: ["Chevrolet", "Ford", "Hyundai"], buyingCapacity: 0, segmentMatch: 0 },
    { dealerId: "d9", dealerName: "Desert Ridge Motors", city: "Scottsdale", state: "AZ", sellerType: "independent", inventoryCount: 38, avgPrice: 35800, avgDom: 68, topMakes: ["Land Rover", "Porsche", "BMW"], buyingCapacity: 0, segmentMatch: 0 },
    { dealerId: "d10", dealerName: "Valley Auto Group", city: "Mesa", state: "AZ", sellerType: "independent", inventoryCount: 112, avgPrice: 21300, avgDom: 52, topMakes: ["Toyota", "Honda", "Kia"], buyingCapacity: 0, segmentMatch: 0 },
  ];

  // Market make mix for segment matching
  const marketMakes: Record<string, number> = { toyota: 18, ford: 15, chevrolet: 14, honda: 10, jeep: 8, nissan: 7, ram: 6, bmw: 5, hyundai: 5, kia: 4 };
  const marketMakeMix: MarketSegment[] = Object.entries(marketMakes).map(([name, count]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    count: count * 100,
    pct: count,
  }));

  const marketBodyMix: MarketSegment[] = [
    { name: "SUV", count: 3800, pct: 38 },
    { name: "Pickup", count: 2200, pct: 22 },
    { name: "Sedan", count: 2000, pct: 20 },
    { name: "Coupe", count: 800, pct: 8 },
    { name: "Hatchback", count: 500, pct: 5 },
    { name: "Van", count: 400, pct: 4 },
    { name: "Convertible", count: 300, pct: 3 },
  ];

  // Calculate buying capacity and segment match for mock dealers
  for (const d of dealers) {
    d.buyingCapacity = calcBuyingCapacity(d.inventoryCount, d.avgDom);
    const dealerMakes: Record<string, number> = {};
    for (const m of d.topMakes) dealerMakes[m.toLowerCase()] = 1;
    d.segmentMatch = calcSegmentMatch(dealerMakes, marketMakes);
  }

  dealers.sort((a, b) => b.inventoryCount - a.inventoryCount);

  const franchiseCount = dealers.filter((d) => d.sellerType === "franchise").length;
  const independentCount = dealers.filter((d) => d.sellerType === "independent").length;
  const totalInventory = dealers.reduce((s, d) => s + d.inventoryCount, 0);

  return {
    dealers,
    marketMakeMix,
    marketBodyMix,
    summary: {
      totalDealers: dealers.length,
      totalInventory,
      franchiseCount,
      independentCount,
      avgInventorySize: Math.round(totalInventory / dealers.length),
    },
  };
}

// ── Settings Bar ───────────────────────────────────────────────────────

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

// ── Responsive CSS ─────────────────────────────────────────────────────

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

// ── Formatting Helpers ─────────────────────────────────────────────────

function fmtDollar(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

function typeBadge(sellerType: string): string {
  const isFranchise = sellerType === "franchise";
  const bg = isFranchise ? "#1e3a5f" : "#3b1f5e";
  const text = isFranchise ? "#93c5fd" : "#c4b5fd";
  const label = isFranchise ? "FRANCHISE" : "INDEPENDENT";
  return `<span style="display:inline-block;padding:3px 10px;border-radius:9999px;font-size:10px;font-weight:700;letter-spacing:0.5px;background:${bg};color:${text}">${label}</span>`;
}

function capacityBadge(capacity: number): string {
  const color = capacity >= 50 ? { bg: "#166534", text: "#86efac" } : capacity >= 20 ? { bg: "#854d0e", text: "#fde68a" } : { bg: "#991b1b", text: "#fca5a5" };
  const label = capacity >= 50 ? "HIGH" : capacity >= 20 ? "MEDIUM" : "LOW";
  return `<span style="display:inline-block;padding:3px 10px;border-radius:9999px;font-size:10px;font-weight:700;letter-spacing:0.5px;background:${color.bg};color:${color.text}">${label} (${capacity}/mo)</span>`;
}

// ── Canvas: Inventory Mix by Make ──────────────────────────────────────

function drawMakeMixChart(canvas: HTMLCanvasElement, segments: MarketSegment[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const padding = { top: 10, right: 16, bottom: 50, left: 50 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const sorted = [...segments].sort((a, b) => b.count - a.count).slice(0, 10);
  const maxCount = Math.max(...sorted.map((s) => s.count), 1);
  const barCount = sorted.length;
  if (barCount === 0) return;
  const barW = Math.min(40, (chartW - (barCount - 1) * 4) / barCount);
  const gap = 4;
  const totalBarsW = barCount * barW + (barCount - 1) * gap;
  const offsetX = padding.left + (chartW - totalBarsW) / 2;

  // Axes
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartH);
  ctx.lineTo(w - padding.right, padding.top + chartH);
  ctx.stroke();

  // Bars
  const colors = ["#3b82f6", "#60a5fa", "#93c5fd", "#818cf8", "#a78bfa", "#c084fc", "#e879f9", "#f472b6", "#fb7185", "#fbbf24"];
  sorted.forEach((s, i) => {
    const x = offsetX + i * (barW + gap);
    const barH = (s.count / maxCount) * chartH;
    const y = padding.top + chartH - barH;
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(x, y, barW, barH);

    // Percentage on top
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(s.pct + "%", x + barW / 2, y - 4);

    // Label
    ctx.fillStyle = "#94a3b8";
    ctx.font = "9px -apple-system, sans-serif";
    ctx.save();
    ctx.translate(x + barW / 2, padding.top + chartH + 8);
    ctx.rotate(Math.PI / 4);
    ctx.fillText(s.name.substring(0, 10), 0, 0);
    ctx.restore();
  });
}

// ── Canvas: Body Type Mix ──────────────────────────────────────────────

function drawBodyMixChart(canvas: HTMLCanvasElement, segments: MarketSegment[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const padding = { top: 10, right: 16, bottom: 50, left: 50 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const sorted = [...segments].sort((a, b) => b.count - a.count).slice(0, 8);
  const maxCount = Math.max(...sorted.map((s) => s.count), 1);
  const barCount = sorted.length;
  if (barCount === 0) return;
  const barW = Math.min(50, (chartW - (barCount - 1) * 6) / barCount);
  const gap = 6;
  const totalBarsW = barCount * barW + (barCount - 1) * gap;
  const offsetX = padding.left + (chartW - totalBarsW) / 2;

  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartH);
  ctx.lineTo(w - padding.right, padding.top + chartH);
  ctx.stroke();

  const colors = ["#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444", "#ec4899", "#8b5cf6", "#06b6d4"];
  sorted.forEach((s, i) => {
    const x = offsetX + i * (barW + gap);
    const barH = (s.count / maxCount) * chartH;
    const y = padding.top + chartH - barH;
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(x, y, barW, barH);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(s.pct + "%", x + barW / 2, y - 4);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "9px -apple-system, sans-serif";
    ctx.save();
    ctx.translate(x + barW / 2, padding.top + chartH + 8);
    ctx.rotate(Math.PI / 4);
    ctx.fillText(s.name.substring(0, 12), 0, 0);
    ctx.restore();
  });
}

// ── Render: Summary Cards ──────────────────────────────────────────────

function renderSummary(summary: TargetingData["summary"]): string {
  const cards = [
    { label: "Total Dealers", value: String(summary.totalDealers), color: "#93c5fd" },
    { label: "Total Inventory", value: summary.totalInventory.toLocaleString(), color: "#c4b5fd" },
    { label: "Franchise", value: String(summary.franchiseCount), color: "#93c5fd" },
    { label: "Independent", value: String(summary.independentCount), color: "#c4b5fd" },
    { label: "Avg Inventory", value: String(summary.avgInventorySize) + " units", color: "#fde68a" },
  ];

  return `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px;">
    ${cards.map((c) => `
      <div style="background:#1e293b;border-radius:10px;border:1px solid #334155;padding:14px 12px;text-align:center;">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${c.label}</div>
        <div style="font-size:20px;font-weight:800;color:${c.color};">${c.value}</div>
      </div>
    `).join("")}
  </div>`;
}

// ── Render: Dealer Prospect Table ──────────────────────────────────────

function renderDealerTable(dealers: DealerTarget[]): string {
  const thStyle = `padding:10px 12px;text-align:left;font-weight:600;color:#94a3b8;border-bottom:2px solid #334155;font-size:11px;text-transform:uppercase;letter-spacing:0.5px`;
  const thRight = `${thStyle};text-align:right`;

  const headers = `<tr>
    <th style="${thStyle}">Dealer</th>
    <th style="${thStyle}">Location</th>
    <th style="${thStyle};text-align:center">Type</th>
    <th style="${thRight}">Inventory</th>
    <th style="${thRight}">Avg Price</th>
    <th style="${thRight}">Avg DOM</th>
    <th style="${thStyle}">Top Makes</th>
    <th style="${thStyle};text-align:center">Buying Capacity</th>
    <th style="${thRight}">Segment Match</th>
  </tr>`;

  let rows = "";
  for (const d of dealers) {
    const cellStyle = `padding:9px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:13px`;
    const cellRight = `${cellStyle};text-align:right`;
    const domColor = d.avgDom <= 45 ? "#86efac" : d.avgDom <= 75 ? "#fde68a" : "#fca5a5";
    const matchColor = d.segmentMatch >= 60 ? "#86efac" : d.segmentMatch >= 30 ? "#fde68a" : "#fca5a5";

    rows += `<tr>
      <td style="${cellStyle};font-weight:600;">${d.dealerName}</td>
      <td style="${cellStyle};color:#94a3b8;">${d.city}, ${d.state}</td>
      <td style="${cellStyle};text-align:center">${typeBadge(d.sellerType)}</td>
      <td style="${cellRight};font-weight:700;">${d.inventoryCount.toLocaleString()}</td>
      <td style="${cellRight}">${fmtDollar(d.avgPrice)}</td>
      <td style="${cellRight};color:${domColor}">${d.avgDom}d</td>
      <td style="${cellStyle};font-size:12px;color:#94a3b8;">${d.topMakes.join(", ")}</td>
      <td style="${cellStyle};text-align:center">${capacityBadge(d.buyingCapacity)}</td>
      <td style="${cellRight};font-weight:700;color:${matchColor}">${d.segmentMatch}%</td>
    </tr>`;
  }

  return `
    <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;overflow:hidden;margin-bottom:24px;">
      <div style="padding:14px 16px;border-bottom:1px solid #334155;">
        <h2 style="font-size:18px;font-weight:700;color:#e2e8f0;margin-bottom:2px;">Dealer Prospects</h2>
        <p style="font-size:12px;color:#64748b;">Dealers ranked by inventory volume — higher inventory + lower DOM = more active buyer</p>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>${headers}</thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const root = document.createElement("div");
  root.id = "app-root";
  root.style.cssText = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:24px;";
  document.body.style.background = "#0f172a";
  document.body.style.margin = "0";
  document.body.appendChild(root);

  // ── Demo banner ──
  if (_detectAppMode() === "demo") {
    const _db = document.createElement("div");
    _db.id = "_demo_banner";
    _db.style.cssText = "background:linear-gradient(135deg,#92400e22,#f59e0b11);border:1px solid #f59e0b44;border-radius:10px;padding:14px 20px;margin-bottom:12px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;";
    _db.innerHTML = `
      <div style="flex:1;min-width:200px;">
        <div style="font-size:13px;font-weight:700;color:#fbbf24;margin-bottom:2px;">&#9888; Demo Mode — Showing sample data</div>
        <div style="font-size:12px;color:#d97706;">Enter your MarketCheck API key for real data. <a href="https://developers.marketcheck.com" target="_blank" style="color:#fbbf24;text-decoration:underline;">Get a free key</a></div>
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
    _db.querySelector("#_banner_key")!.addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Enter") (_db.querySelector("#_banner_save") as HTMLButtonElement).click(); });
  }

  const urlParams = _getUrlParams();

  function renderApp(data: TargetingData | null) {
    const zipValue = urlParams.zip ?? (_detectAppMode() === "demo" ? "85260" : "");
    const radiusValue = urlParams.radius ?? "50";
    const makeValue = urlParams.make ?? "";

    root.innerHTML = `
      <div style="max-width:1400px;margin:0 auto;">
        <!-- Header -->
        <div id="app-header" style="margin-bottom:24px;display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            <h1 style="font-size:26px;font-weight:800;color:#e2e8f0;margin-bottom:4px;">Auction Dealer Targeting</h1>
            <p style="font-size:13px;color:#64748b;">Identify high-volume buyers in your target market</p>
          </div>
        </div>

        <!-- Input Form -->
        <div style="background:#1e293b;border-radius:12px;border:1px solid #334155;padding:20px;margin-bottom:24px;">
          <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;">
            <div>
              <label style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Target ZIP (required)</label>
              <input id="zip-input" type="text" placeholder="e.g. 85260" value="${zipValue}" style="padding:10px 12px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:8px;font-size:14px;outline:none;width:140px;" />
            </div>
            <div>
              <label style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Radius (miles)</label>
              <input id="radius-input" type="number" placeholder="50" value="${radiusValue}" style="padding:10px 12px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:8px;font-size:14px;outline:none;width:100px;" />
            </div>
            <div>
              <label style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Make (optional)</label>
              <input id="make-input" type="text" placeholder="e.g. Toyota" value="${makeValue}" style="padding:10px 12px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:8px;font-size:14px;outline:none;width:140px;" />
            </div>
            <button id="search-btn" style="background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:12px 24px;font-size:14px;font-weight:700;cursor:pointer;transition:background 0.15s;">Find Dealers</button>
            <div id="search-status" style="font-size:12px;color:#64748b;"></div>
          </div>
        </div>

        <!-- Results -->
        <div id="results-container">
          ${data ? renderResults(data) : '<div style="text-align:center;padding:60px 20px;color:#475569;">Enter a target ZIP code and click Find Dealers to identify high-volume buyers.</div>'}
        </div>
      </div>`;

    _addSettingsBar(document.getElementById("app-header") as HTMLElement);

    // Wire search button
    const searchBtn = document.getElementById("search-btn") as HTMLButtonElement;
    const zipInput = document.getElementById("zip-input") as HTMLInputElement;
    const radiusInput = document.getElementById("radius-input") as HTMLInputElement;
    const makeInput = document.getElementById("make-input") as HTMLInputElement;
    const status = document.getElementById("search-status") as HTMLElement;

    searchBtn.addEventListener("click", async () => {
      const zip = zipInput.value.trim();
      const radius = parseInt(radiusInput.value) || 50;
      const make = makeInput.value.trim() || undefined;

      if (!zip || zip.length < 5) {
        status.textContent = "Please enter a valid ZIP code.";
        status.style.color = "#fbbf24";
        return;
      }

      status.textContent = "Searching for dealers...";
      status.style.color = "#64748b";
      searchBtn.disabled = true;
      searchBtn.style.opacity = "0.6";

      let result: TargetingData;
      if (_detectAppMode() === "demo") {
        result = getMockData();
      } else {
        const liveResult = await _callTool({ zip, radius, make });
        result = liveResult ?? getMockData();
      }

      const savedZip = zipInput.value;
      const savedRadius = radiusInput.value;
      const savedMake = makeInput.value;
      renderApp(result);
      (document.getElementById("zip-input") as HTMLInputElement).value = savedZip;
      (document.getElementById("radius-input") as HTMLInputElement).value = savedRadius;
      (document.getElementById("make-input") as HTMLInputElement).value = savedMake;
      drawCanvases(result);
    });
  }

  function drawCanvases(data: TargetingData) {
    requestAnimationFrame(() => {
      const makeCanvas = document.getElementById("make-canvas") as HTMLCanvasElement;
      const bodyCanvas = document.getElementById("body-canvas") as HTMLCanvasElement;
      if (makeCanvas) drawMakeMixChart(makeCanvas, data.marketMakeMix);
      if (bodyCanvas) drawBodyMixChart(bodyCanvas, data.marketBodyMix);
    });
  }

  function renderResults(data: TargetingData): string {
    return `
      ${renderSummary(data.summary)}

      <!-- Charts Row -->
      <div style="display:flex;gap:20px;margin-bottom:24px;flex-wrap:wrap;">
        <div style="flex:1;min-width:280px;background:#1e293b;border-radius:12px;border:1px solid #334155;padding:16px;">
          <h3 style="font-size:14px;font-weight:700;color:#e2e8f0;margin-bottom:12px;">Market Make Mix</h3>
          <canvas id="make-canvas" style="width:100%;height:200px;"></canvas>
        </div>
        <div style="flex:1;min-width:280px;background:#1e293b;border-radius:12px;border:1px solid #334155;padding:16px;">
          <h3 style="font-size:14px;font-weight:700;color:#e2e8f0;margin-bottom:12px;">Market Body Type Mix</h3>
          <canvas id="body-canvas" style="width:100%;height:200px;"></canvas>
        </div>
      </div>

      ${renderDealerTable(data.dealers)}
    `;
  }

  // Auto-search if URL params provided
  if (urlParams.zip) {
    const zip = urlParams.zip;
    const radius = parseInt(urlParams.radius ?? "50");
    const make = urlParams.make;

    root.innerHTML = `<div style="text-align:center;padding:80px 20px;">
      <div style="font-size:24px;font-weight:700;color:#e2e8f0;margin-bottom:12px;">Auction Dealer Targeting</div>
      <div style="color:#64748b;">Searching for dealers near ${zip}...</div>
    </div>`;

    const liveResult = await _callTool({ zip, radius, make });
    const data = liveResult ?? getMockData();
    renderApp(data);
    drawCanvases(data);
    return;
  }

  // Default: show empty form
  renderApp(null);
}

main();
