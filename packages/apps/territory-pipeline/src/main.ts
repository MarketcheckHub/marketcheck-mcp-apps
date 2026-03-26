import { App } from "@modelcontextprotocol/ext-apps";

const _safeApp = (() => { try { return new App({ name: "territory-pipeline" });

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
interface AgedUnit {
  vin: string;
  make: string;
  model: string;
  dom: number;
  price: number;
}

interface InventorySegment {
  segment: string;
  count: number;
  pct: number;
}

interface DealerProspect {
  rank: number;
  name: string;
  city: string;
  state: string;
  totalInventory: number;
  agedUnits: number;
  estFloorPlanBurden: number;
  inventoryFitPct: number;
  volumeTrend: "up" | "down" | "flat";
  score: number;
  segments: InventorySegment[];
  topAgedUnits: AgedUnit[];
  estLendingVolume: number;
  talkingPoints: string[];
  productRecommendations: string[];
  pipelineStage: "prospect" | "contacted" | "proposal" | "closed";
}

interface StateData {
  abbr: string;
  dealerCount: number;
  opportunityDensity: "high" | "medium" | "low";
}

interface TerritoryData {
  states: StateData[];
  dealers: DealerProspect[];
  pipeline: { stage: string; count: number }[];
}

// ── Mock Data ──────────────────────────────────────────────────────────
function generateMockData(): TerritoryData {
  const states: StateData[] = [
    { abbr: "TX", dealerCount: 142, opportunityDensity: "high" },
    { abbr: "OK", dealerCount: 38, opportunityDensity: "medium" },
    { abbr: "AR", dealerCount: 24, opportunityDensity: "low" },
    { abbr: "LA", dealerCount: 51, opportunityDensity: "medium" },
    { abbr: "NM", dealerCount: 19, opportunityDensity: "low" },
  ];

  const dealerNames: { name: string; city: string; state: string }[] = [
    { name: "Lone Star Auto Group", city: "Houston", state: "TX" },
    { name: "Permian Basin Motors", city: "Midland", state: "TX" },
    { name: "Gulf Coast Chevrolet", city: "Corpus Christi", state: "TX" },
    { name: "DFW Premier Auto", city: "Dallas", state: "TX" },
    { name: "Capitol City Ford", city: "Austin", state: "TX" },
    { name: "Rio Grande Toyota", city: "El Paso", state: "TX" },
    { name: "Panhandle Dodge", city: "Amarillo", state: "TX" },
    { name: "Brazos Valley Honda", city: "College Station", state: "TX" },
    { name: "Alamo City Nissan", city: "San Antonio", state: "TX" },
    { name: "Piney Woods Hyundai", city: "Lufkin", state: "TX" },
    { name: "Red River Chrysler", city: "Oklahoma City", state: "OK" },
    { name: "Sooner State Motors", city: "Tulsa", state: "OK" },
    { name: "Prairie Wind Auto", city: "Norman", state: "OK" },
    { name: "Ozark Trail Chevrolet", city: "Fayetteville", state: "AR" },
    { name: "Natural State Toyota", city: "Little Rock", state: "AR" },
    { name: "Diamond Lakes Ford", city: "Hot Springs", state: "AR" },
    { name: "Bayou Country Motors", city: "Lafayette", state: "LA" },
    { name: "Crescent City Auto", city: "New Orleans", state: "LA" },
    { name: "Pelican State Nissan", city: "Baton Rouge", state: "LA" },
    { name: "Cajun Country Kia", city: "Lake Charles", state: "LA" },
    { name: "Delta Buick GMC", city: "Monroe", state: "LA" },
    { name: "Enchantment Motors", city: "Albuquerque", state: "NM" },
    { name: "Desert Sun Auto", city: "Las Cruces", state: "NM" },
    { name: "Sandia Peak Honda", city: "Santa Fe", state: "NM" },
    { name: "Roadrunner Chevrolet", city: "Roswell", state: "NM" },
  ];

  const segmentNames = ["Trucks/SUVs", "Sedans", "Luxury", "Economy", "EV/Hybrid", "Vans/Commercial"];
  const makes = ["Ford", "Toyota", "Chevrolet", "Honda", "Nissan", "RAM", "BMW", "Hyundai", "Kia", "Jeep"];
  const modelsByMake: Record<string, string[]> = {
    Ford: ["F-150", "Explorer", "Escape", "Bronco", "Mustang"],
    Toyota: ["Camry", "RAV4", "Tacoma", "Tundra", "Highlander"],
    Chevrolet: ["Silverado", "Equinox", "Tahoe", "Malibu", "Blazer"],
    Honda: ["Civic", "CR-V", "Accord", "Pilot", "HR-V"],
    Nissan: ["Rogue", "Altima", "Pathfinder", "Frontier", "Sentra"],
    RAM: ["1500", "2500", "3500", "ProMaster"],
    BMW: ["3 Series", "X3", "X5", "5 Series"],
    Hyundai: ["Tucson", "Elantra", "Santa Fe", "Palisade"],
    Kia: ["Sportage", "Telluride", "Forte", "Sorento"],
    Jeep: ["Wrangler", "Grand Cherokee", "Cherokee", "Gladiator"],
  };

  const talkingPointTemplates = [
    "Floor plan costs averaging ${fp}/mo on aged units — our program can reduce by 15-20%",
    "{pct}% of inventory over 60 DOM — our turn optimization can help move these faster",
    "Strong {seg} mix aligns well with our lending sweet spot ($18K-$45K range)",
    "Regional comp analysis shows pricing gap on {n} units vs market median",
    "Dealer volume trending {dir} — {reason}",
    "Recent market shift in {seg} segment creates cross-sell opportunity",
    "Floor plan burden of ${fp}/mo suggests appetite for capital efficiency tools",
    "Inventory fit score of {pct}% indicates strong product alignment",
  ];

  const productRecommendations = [
    "Floor Plan Express — 48hr funding, competitive rates",
    "Aged Inventory Liquidation Program",
    "Dealer Direct Wholesale Channel Access",
    "Smart Stocking Analytics Dashboard",
    "Cross-Dealer Trade Network Membership",
    "Extended Warranty Wrap Program",
    "Digital Retail Integration Suite",
    "F&I Product Bundle (GAP + VSC)",
    "Inventory Acquisition Line of Credit",
    "Market Intelligence Subscription",
  ];

  const dealers: DealerProspect[] = dealerNames.map((d, i) => {
    const totalInventory = 80 + Math.floor(Math.random() * 320);
    const agedPct = 0.08 + Math.random() * 0.35;
    const agedUnits = Math.round(totalInventory * agedPct);
    const avgAgedValue = 22000 + Math.random() * 18000;
    const estFloorPlanBurden = Math.round(agedUnits * avgAgedValue * 0.055 / 12);
    const inventoryFitPct = Math.round(55 + Math.random() * 40);
    const trends: ("up" | "down" | "flat")[] = ["up", "down", "flat"];
    const volumeTrend = trends[Math.floor(Math.random() * 3)];
    const score = Math.round(40 + Math.random() * 55 + (i < 5 ? 15 : i < 15 ? 5 : 0));

    // Generate segments
    const segCount = 4 + Math.floor(Math.random() * 3);
    const rawSegs: InventorySegment[] = [];
    let remaining = totalInventory;
    const usedSegs = new Set<string>();
    for (let s = 0; s < segCount; s++) {
      let seg: string;
      do { seg = segmentNames[Math.floor(Math.random() * segmentNames.length)]; } while (usedSegs.has(seg));
      usedSegs.add(seg);
      const cnt = s === segCount - 1 ? remaining : Math.round(remaining * (0.15 + Math.random() * 0.45));
      remaining -= cnt;
      if (remaining < 0) remaining = 0;
      rawSegs.push({ segment: seg, count: Math.max(cnt, 1), pct: 0 });
    }
    const total = rawSegs.reduce((a, b) => a + b.count, 0);
    rawSegs.forEach(s => { s.pct = Math.round((s.count / total) * 100); });
    rawSegs.sort((a, b) => b.count - a.count);

    // Top 5 aged units
    const topAgedUnits: AgedUnit[] = [];
    for (let u = 0; u < 5; u++) {
      const make = makes[Math.floor(Math.random() * makes.length)];
      const mList = modelsByMake[make];
      const model = mList[Math.floor(Math.random() * mList.length)];
      const dom = 61 + Math.floor(Math.random() * 90);
      const price = 15000 + Math.floor(Math.random() * 40000);
      const vinSuffix = String(Math.floor(Math.random() * 900000) + 100000);
      topAgedUnits.push({
        vin: `...${vinSuffix}`,
        make,
        model,
        dom,
        price,
      });
    }
    topAgedUnits.sort((a, b) => b.dom - a.dom);

    const estLendingVolume = Math.round((totalInventory * 0.3 + agedUnits * 0.5) * (18000 + Math.random() * 12000));

    // Talking points
    const tpIndices = new Set<number>();
    while (tpIndices.size < 3) tpIndices.add(Math.floor(Math.random() * talkingPointTemplates.length));
    const talkingPoints = [...tpIndices].map(idx => {
      let tp = talkingPointTemplates[idx];
      tp = tp.replace("${fp}", String(Math.round(estFloorPlanBurden / 100) * 100));
      tp = tp.replace("{fp}", String(Math.round(estFloorPlanBurden / 100) * 100));
      tp = tp.replace("{pct}", String(Math.round(agedPct * 100)));
      tp = tp.replace("{seg}", rawSegs[0].segment);
      tp = tp.replace("{n}", String(Math.floor(agedUnits * 0.4)));
      tp = tp.replace("{dir}", volumeTrend === "up" ? "upward" : volumeTrend === "down" ? "downward" : "steady");
      tp = tp.replace("{reason}", volumeTrend === "up" ? "good time to expand relationship" : volumeTrend === "down" ? "may need liquidation support" : "stable base for new products");
      return tp;
    });

    // Product recommendations
    const prIndices = new Set<number>();
    const prCount = 2 + Math.floor(Math.random() * 2);
    while (prIndices.size < prCount) prIndices.add(Math.floor(Math.random() * productRecommendations.length));
    const precs = [...prIndices].map(idx => productRecommendations[idx]);

    // Pipeline stage assignment
    let pipelineStage: DealerProspect["pipelineStage"];
    if (i < 2) pipelineStage = "closed";
    else if (i < 7) pipelineStage = "proposal";
    else if (i < 19) pipelineStage = "contacted";
    else pipelineStage = "prospect";

    return {
      rank: 0,
      name: d.name,
      city: d.city,
      state: d.state,
      totalInventory,
      agedUnits,
      estFloorPlanBurden,
      inventoryFitPct,
      volumeTrend,
      score: Math.min(score, 99),
      segments: rawSegs,
      topAgedUnits,
      estLendingVolume,
      talkingPoints,
      productRecommendations: precs,
      pipelineStage,
    };
  });

  // Sort by score descending and assign ranks
  dealers.sort((a, b) => b.score - a.score);
  dealers.forEach((d, i) => { d.rank = i + 1; });

  const pipeline = [
    { stage: "Prospects", count: 25 },
    { stage: "Contacted", count: 12 },
    { stage: "Proposals", count: 5 },
    { stage: "Closed", count: 2 },
  ];

  return { states, dealers, pipeline };
}

// ── Formatting Helpers ─────────────────────────────────────────────────
function fmt$(n: number): string {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(0) + "K";
  return "$" + n.toLocaleString();
}

function fmtNum(n: number): string {
  return n.toLocaleString();
}

function trendArrow(t: "up" | "down" | "flat"): string {
  if (t === "up") return '<span style="color:#22c55e;font-size:16px">&#9650;</span>';
  if (t === "down") return '<span style="color:#ef4444;font-size:16px">&#9660;</span>';
  return '<span style="color:#94a3b8;font-size:14px">&#9654;</span>';
}

function densityColor(d: "high" | "medium" | "low"): string {
  if (d === "high") return "#22c55e";
  if (d === "medium") return "#f59e0b";
  return "#64748b";
}

function tierBg(rank: number): string {
  if (rank <= 5) return "rgba(34,197,94,0.08)";
  if (rank <= 15) return "transparent";
  return "rgba(100,116,139,0.06)";
}

function tierTextOpacity(rank: number): string {
  if (rank <= 5) return "1";
  if (rank <= 15) return "0.92";
  return "0.6";
}

// ── Render ─────────────────────────────────────────────────────────────
function render(root: HTMLElement, data: TerritoryData, selectedStates: Set<string>, selectedDealerIdx: number | null) {
  const filteredDealers = selectedStates.size > 0
    ? data.dealers.filter(d => selectedStates.has(d.state))
    : data.dealers;

  const top25 = filteredDealers.slice(0, 25);
  const selectedDealer = selectedDealerIdx !== null ? data.dealers[selectedDealerIdx] : null;

  root.innerHTML = `
    <style>
      :root {
        --bg: #0f172a;
        --surface: #1e293b;
        --surface2: #334155;
        --border: #334155;
        --text: #f1f5f9;
        --text-dim: #94a3b8;
        --accent: #3b82f6;
        --accent-glow: rgba(59,130,246,0.2);
        --green: #22c55e;
        --amber: #f59e0b;
        --red: #ef4444;
      }
      body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; }
      .app { display: flex; flex-direction: column; min-height: 100vh; padding: 16px 20px; gap: 14px; }

      /* ── Territory Overview ─────── */
      .territory-bar { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--surface); border-radius: 10px; border: 1px solid var(--border); }
      .territory-bar h2 { font-size: 14px; font-weight: 600; color: var(--text-dim); margin-right: 8px; white-space: nowrap; }
      .state-chip {
        display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 20px;
        border: 2px solid var(--border); background: var(--bg); cursor: pointer; transition: all .15s;
        font-size: 13px; font-weight: 600; user-select: none;
      }
      .state-chip:hover { border-color: var(--accent); }
      .state-chip.selected { background: var(--accent-glow); border-color: var(--accent); }
      .state-chip .abbr { font-size: 14px; }
      .state-chip .count { font-size: 11px; color: var(--text-dim); }
      .state-chip .dot { width: 8px; height: 8px; border-radius: 50%; }

      /* ── Main Content ─────── */
      .main-content { display: flex; gap: 14px; flex: 1; min-height: 0; }
      .table-section { flex: 0 0 65%; display: flex; flex-direction: column; background: var(--surface); border-radius: 10px; border: 1px solid var(--border); overflow: hidden; }
      .table-section.full-width { flex: 1; }
      .sidebar { flex: 0 0 35%; background: var(--surface); border-radius: 10px; border: 1px solid var(--border); overflow-y: auto; padding: 16px; }

      .table-header { padding: 12px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
      .table-header h3 { font-size: 15px; font-weight: 600; }
      .table-header .badge { background: var(--accent); color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }

      .table-wrap { flex: 1; overflow-y: auto; }
      table { width: 100%; border-collapse: collapse; }
      thead th {
        position: sticky; top: 0; background: var(--surface); padding: 8px 10px; font-size: 11px;
        text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); font-weight: 600;
        text-align: left; border-bottom: 1px solid var(--border); white-space: nowrap;
      }
      thead th:first-child { padding-left: 16px; }
      tbody tr { cursor: pointer; transition: background .1s; }
      tbody tr:hover { background: rgba(59,130,246,0.08) !important; }
      tbody tr.selected-row { background: rgba(59,130,246,0.15) !important; }
      tbody td { padding: 9px 10px; border-bottom: 1px solid rgba(51,65,85,0.5); white-space: nowrap; }
      tbody td:first-child { padding-left: 16px; }
      .score-cell { font-weight: 700; font-size: 15px; }

      /* ── Sidebar Profile Card ─────── */
      .profile-header { margin-bottom: 16px; }
      .profile-header h3 { font-size: 17px; font-weight: 700; margin-bottom: 2px; }
      .profile-header .sub { color: var(--text-dim); font-size: 12px; }
      .profile-section { margin-bottom: 18px; }
      .profile-section h4 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-dim); margin-bottom: 8px; font-weight: 600; }

      .seg-bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
      .seg-label { width: 110px; font-size: 12px; color: var(--text-dim); text-align: right; flex-shrink: 0; }
      .seg-bar-track { flex: 1; height: 14px; background: var(--bg); border-radius: 4px; overflow: hidden; }
      .seg-bar-fill { height: 100%; border-radius: 4px; transition: width .3s; }
      .seg-pct { width: 36px; font-size: 11px; color: var(--text-dim); }

      .aged-table { width: 100%; border-collapse: collapse; font-size: 12px; }
      .aged-table th { text-align: left; padding: 4px 6px; color: var(--text-dim); font-weight: 600; font-size: 11px; border-bottom: 1px solid var(--border); }
      .aged-table td { padding: 5px 6px; border-bottom: 1px solid rgba(51,65,85,0.3); }

      .talking-points { list-style: none; padding: 0; }
      .talking-points li { padding: 5px 0; font-size: 12.5px; line-height: 1.4; color: var(--text); position: relative; padding-left: 14px; }
      .talking-points li::before { content: "\\2022"; position: absolute; left: 0; color: var(--accent); font-weight: bold; }

      .product-tags { display: flex; flex-wrap: wrap; gap: 6px; }
      .product-tag { background: rgba(59,130,246,0.12); border: 1px solid rgba(59,130,246,0.3); color: var(--accent); padding: 4px 10px; border-radius: 6px; font-size: 11.5px; font-weight: 500; }

      .lending-volume { font-size: 22px; font-weight: 700; color: var(--green); }
      .lending-label { font-size: 11px; color: var(--text-dim); margin-top: 2px; }

      /* ── Pipeline Summary ─────── */
      .pipeline-bar { background: var(--surface); border-radius: 10px; border: 1px solid var(--border); padding: 14px 20px; }
      .pipeline-bar h3 { font-size: 14px; font-weight: 600; margin-bottom: 12px; }
      .funnel { display: flex; align-items: center; gap: 0; }
      .funnel-stage {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 10px 0; position: relative; text-align: center;
      }
      .funnel-stage .stage-bar {
        height: 38px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 16px; color: #fff; width: 100%;
      }
      .funnel-stage .stage-label { font-size: 11px; color: var(--text-dim); margin-top: 4px; font-weight: 500; }
      .funnel-arrow { display: flex; align-items: center; flex-direction: column; padding: 0 4px; }
      .funnel-arrow .arrow-icon { color: var(--text-dim); font-size: 16px; }
      .funnel-arrow .conv-rate { font-size: 10px; color: var(--text-dim); white-space: nowrap; }

      .pipeline-row { display: flex; align-items: center; width: 100%; gap: 0; }

      /* Scrollbar */
      ::-webkit-scrollbar { width: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: var(--surface2); border-radius: 3px; }

      .no-selection-msg { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-dim); font-size: 13px; text-align: center; padding: 40px; }
    </style>

    <div class="app">
      <!-- Territory Overview -->
      <div class="territory-bar">
        <h2>Territory</h2>
        ${data.states.map(s => `
          <div class="state-chip ${selectedStates.has(s.abbr) ? 'selected' : ''}" data-state="${s.abbr}">
            <span class="dot" style="background:${densityColor(s.opportunityDensity)}"></span>
            <span class="abbr">${s.abbr}</span>
            <span class="count">${s.dealerCount}</span>
          </div>
        `).join("")}
      </div>

      <!-- Main Content: Table + Sidebar -->
      <div class="main-content">
        <div class="table-section ${selectedDealer ? '' : 'full-width'}">
          <div class="table-header">
            <h3>Dealer Prospects</h3>
            <span class="badge">Top ${top25.length}</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Dealer Name</th>
                  <th>City / State</th>
                  <th style="text-align:right">Inventory</th>
                  <th style="text-align:right">Aged &gt;60d</th>
                  <th style="text-align:right">Floor Plan $</th>
                  <th style="text-align:right">Fit %</th>
                  <th style="text-align:center">Trend</th>
                  <th style="text-align:right">Score</th>
                </tr>
              </thead>
              <tbody>
                ${top25.map((d, _i) => {
                  const globalIdx = data.dealers.indexOf(d);
                  const isSelected = selectedDealerIdx === globalIdx;
                  return `
                  <tr data-idx="${globalIdx}" class="${isSelected ? 'selected-row' : ''}" style="background:${tierBg(d.rank)};opacity:${tierTextOpacity(d.rank)}">
                    <td style="font-weight:600;color:${d.rank <= 5 ? 'var(--green)' : d.rank <= 15 ? 'var(--text)' : 'var(--text-dim)'}">${d.rank}</td>
                    <td style="font-weight:500">${d.name}</td>
                    <td style="color:var(--text-dim)">${d.city}, ${d.state}</td>
                    <td style="text-align:right">${fmtNum(d.totalInventory)}</td>
                    <td style="text-align:right;color:${d.agedUnits > 40 ? 'var(--red)' : d.agedUnits > 20 ? 'var(--amber)' : 'var(--text)'}">${d.agedUnits}</td>
                    <td style="text-align:right">${fmt$(d.estFloorPlanBurden)}</td>
                    <td style="text-align:right">${d.inventoryFitPct}%</td>
                    <td style="text-align:center">${trendArrow(d.volumeTrend)}</td>
                    <td style="text-align:right" class="score-cell">${d.score}</td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>

        ${selectedDealer ? `
        <div class="sidebar">
          <div class="profile-header">
            <h3>${selectedDealer.name}</h3>
            <div class="sub">${selectedDealer.city}, ${selectedDealer.state} &nbsp;|&nbsp; Rank #${selectedDealer.rank} &nbsp;|&nbsp; Score: ${selectedDealer.score}</div>
          </div>

          <div class="profile-section">
            <h4>Estimated Lending Volume</h4>
            <div class="lending-volume">${fmt$(selectedDealer.estLendingVolume)}</div>
            <div class="lending-label">projected annual opportunity</div>
          </div>

          <div class="profile-section">
            <h4>Inventory Breakdown</h4>
            ${selectedDealer.segments.map((seg, si) => {
              const colors = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];
              return `
              <div class="seg-bar-row">
                <span class="seg-label">${seg.segment}</span>
                <div class="seg-bar-track">
                  <div class="seg-bar-fill" style="width:${seg.pct}%;background:${colors[si % colors.length]}"></div>
                </div>
                <span class="seg-pct">${seg.pct}%</span>
              </div>`;
            }).join("")}
          </div>

          <div class="profile-section">
            <h4>Top 5 Aged Units (&gt;60 DOM)</h4>
            <table class="aged-table">
              <thead><tr><th>VIN</th><th>Make/Model</th><th>DOM</th><th style="text-align:right">Price</th></tr></thead>
              <tbody>
                ${selectedDealer.topAgedUnits.map(u => `
                <tr>
                  <td style="font-family:monospace;font-size:11px;color:var(--text-dim)">${u.vin}</td>
                  <td>${u.make} ${u.model}</td>
                  <td style="color:${u.dom > 100 ? 'var(--red)' : 'var(--amber)'}">${u.dom}d</td>
                  <td style="text-align:right">${fmt$(u.price)}</td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>

          <div class="profile-section">
            <h4>Talking Points</h4>
            <ul class="talking-points">
              ${selectedDealer.talkingPoints.map(tp => `<li>${tp}</li>`).join("")}
            </ul>
          </div>

          <div class="profile-section">
            <h4>Product Recommendations</h4>
            <div class="product-tags">
              ${selectedDealer.productRecommendations.map(pr => `<span class="product-tag">${pr}</span>`).join("")}
            </div>
          </div>
        </div>
        ` : ''}
      </div>

      <!-- Pipeline Summary -->
      <div class="pipeline-bar">
        <h3>Pipeline Summary</h3>
        <div class="pipeline-row">
          ${data.pipeline.map((p, i) => {
            const colors = ["#3b82f6", "#8b5cf6", "#f59e0b", "#22c55e"];
            const widths = [40, 25, 20, 15];
            const next = data.pipeline[i + 1];
            const convRate = next ? Math.round((next.count / p.count) * 100) : null;
            return `
              <div class="funnel-stage" style="flex:${widths[i]}">
                <div class="stage-bar" style="background:${colors[i]}">${p.count}</div>
                <span class="stage-label">${p.stage}</span>
              </div>
              ${convRate !== null ? `
              <div class="funnel-arrow">
                <span class="arrow-icon">&#10132;</span>
                <span class="conv-rate">${convRate}%</span>
              </div>` : ''}
            `;
          }).join("")}
        </div>
      </div>
    </div>
  `;

  // ── Event Handlers ──────────────────────────────────────────────────
  root.querySelectorAll<HTMLElement>(".state-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const st = chip.dataset.state!;
      if (selectedStates.has(st)) {
        selectedStates.delete(st);
      } else {
        selectedStates.add(st);
      }
      render(root, data, selectedStates, selectedDealerIdx);
    });
  });

  root.querySelectorAll<HTMLTableRowElement>("tbody tr[data-idx]").forEach(row => {
    row.addEventListener("click", () => {
      const idx = parseInt(row.dataset.idx!, 10);
      const newIdx = idx === selectedDealerIdx ? null : idx;
      render(root, data, selectedStates, newIdx);
    });
  });
}

// ── Bootstrap ──────────────────────────────────────────────────────────

async function main() {
  let data: TerritoryData;

  try {
    const res = await _safeApp?.callServerTool({
      name: "territory-pipeline",
      arguments: { states: ["TX", "OK", "AR", "LA", "NM"] },
    });

    if (res && typeof res === "object" && "dealers" in (res as TerritoryData)) {
      data = res as TerritoryData;
    } else {
      data = generateMockData();
    }
  } catch {
    data = generateMockData();
  }

  const root = document.createElement("div");
  root.id = "app-root";
  document.body.appendChild(root);

  // Pre-select the first dealer to show profile card
  const selectedStates = new Set<string>();
  render(root, data, selectedStates, 0);
}

main();
