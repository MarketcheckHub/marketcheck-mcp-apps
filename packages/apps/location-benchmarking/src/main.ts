import { App } from "@modelcontextprotocol/ext-apps";

const _safeApp = (() => { try { return new App({ name: "location-benchmarking" });

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
interface LocationMetrics {
  name: string;
  turnRate: number;          // units sold/month / avg inventory — higher=better
  agedPct: number;           // % of inventory >60 days — lower=better
  pricingEfficiency: number; // % units within +/-5% of market — higher=better
  domVsMarket: number;       // location DOM / market DOM — lower=better (<1.0=good)
  unitsSoldPerMonth: number;
  avgInventory: number;
  agedUnits: number;
  totalUnits: number;
  avgDom: number;
  marketAvgDom: number;
  avgFloorPlanCostPerUnit: number;
}

interface RankedLocation extends LocationMetrics {
  turnRateRank: number;
  agedPctRank: number;
  pricingEffRank: number;
  domVsMarketRank: number;
  compositeScore: number;
  compositeRank: number;
}

interface BenchmarkData {
  locations: RankedLocation[];
}

// ── Mock Data ──────────────────────────────────────────────────────────
function generateMockData(): BenchmarkData {
  const marketAvgDom = 42;

  const raw: LocationMetrics[] = [
    {
      name: "Downtown Auto Mile",
      turnRate: 2.4,
      agedPct: 8,
      pricingEfficiency: 82,
      domVsMarket: 0.76,
      unitsSoldPerMonth: 96,
      avgInventory: 40,
      agedUnits: 3,
      totalUnits: 40,
      avgDom: 32,
      marketAvgDom,
      avgFloorPlanCostPerUnit: 1050,
    },
    {
      name: "Westside Motors",
      turnRate: 1.8,
      agedPct: 15,
      pricingEfficiency: 68,
      domVsMarket: 1.05,
      unitsSoldPerMonth: 63,
      avgInventory: 35,
      agedUnits: 5,
      totalUnits: 35,
      avgDom: 44,
      marketAvgDom,
      avgFloorPlanCostPerUnit: 1050,
    },
    {
      name: "Northgate Pre-Owned",
      turnRate: 1.2,
      agedPct: 28,
      pricingEfficiency: 55,
      domVsMarket: 1.38,
      unitsSoldPerMonth: 36,
      avgInventory: 30,
      agedUnits: 8,
      totalUnits: 30,
      avgDom: 58,
      marketAvgDom,
      avgFloorPlanCostPerUnit: 1050,
    },
    {
      name: "Lakefront Autos",
      turnRate: 2.1,
      agedPct: 11,
      pricingEfficiency: 76,
      domVsMarket: 0.88,
      unitsSoldPerMonth: 84,
      avgInventory: 40,
      agedUnits: 4,
      totalUnits: 40,
      avgDom: 37,
      marketAvgDom,
      avgFloorPlanCostPerUnit: 1050,
    },
    {
      name: "Eastside Auto Hub",
      turnRate: 1.5,
      agedPct: 20,
      pricingEfficiency: 62,
      domVsMarket: 1.19,
      unitsSoldPerMonth: 45,
      avgInventory: 30,
      agedUnits: 6,
      totalUnits: 30,
      avgDom: 50,
      marketAvgDom,
      avgFloorPlanCostPerUnit: 1050,
    },
    {
      name: "Southpark Dealership",
      turnRate: 0.9,
      agedPct: 35,
      pricingEfficiency: 45,
      domVsMarket: 1.55,
      unitsSoldPerMonth: 23,
      avgInventory: 25,
      agedUnits: 9,
      totalUnits: 25,
      avgDom: 65,
      marketAvgDom,
      avgFloorPlanCostPerUnit: 1050,
    },
  ];

  // Rank each KPI
  const byTurnRate = [...raw].sort((a, b) => b.turnRate - a.turnRate);
  const byAgedPct = [...raw].sort((a, b) => a.agedPct - b.agedPct);
  const byPricingEff = [...raw].sort((a, b) => b.pricingEfficiency - a.pricingEfficiency);
  const byDomVsMarket = [...raw].sort((a, b) => a.domVsMarket - b.domVsMarket);

  const ranked: RankedLocation[] = raw.map((loc) => {
    const turnRateRank = byTurnRate.findIndex((l) => l.name === loc.name) + 1;
    const agedPctRank = byAgedPct.findIndex((l) => l.name === loc.name) + 1;
    const pricingEffRank = byPricingEff.findIndex((l) => l.name === loc.name) + 1;
    const domVsMarketRank = byDomVsMarket.findIndex((l) => l.name === loc.name) + 1;
    // Composite: average of ranks (lower=better)
    const compositeScore = (turnRateRank + agedPctRank + pricingEffRank + domVsMarketRank) / 4;
    return {
      ...loc,
      turnRateRank,
      agedPctRank,
      pricingEffRank,
      domVsMarketRank,
      compositeScore,
      compositeRank: 0, // filled below
    };
  });

  // Sort by composite score to assign composite rank
  ranked.sort((a, b) => a.compositeScore - b.compositeScore);
  ranked.forEach((loc, idx) => {
    loc.compositeRank = idx + 1;
  });

  return { locations: ranked };
}

// ── Formatters ─────────────────────────────────────────────────────────
function fmtCurrency(v: number): string {
  return "$" + Math.round(v).toLocaleString();
}

// ── Canvas Bar Chart ───────────────────────────────────────────────────
function drawHorizontalBarChart(
  canvas: HTMLCanvasElement,
  labels: string[],
  values: number[],
  options: {
    title: string;
    colorFn: (value: number, index: number) => string;
    formatValue: (v: number) => string;
    maxOverride?: number;
  }
) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 320;
  const cssHeight = canvas.clientHeight || 220;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;

  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  // Title
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(options.title, 12, 22);

  const marginLeft = 130;
  const marginRight = 60;
  const marginTop = 38;
  const barAreaWidth = cssWidth - marginLeft - marginRight;
  const barHeight = 22;
  const barGap = 8;
  const maxVal = options.maxOverride ?? Math.max(...values) * 1.15;

  for (let i = 0; i < labels.length; i++) {
    const y = marginTop + i * (barHeight + barGap);
    const barW = maxVal > 0 ? (values[i] / maxVal) * barAreaWidth : 0;
    const color = options.colorFn(values[i], i);

    // Label
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(labels[i], marginLeft - 8, y + barHeight / 2 + 4);

    // Bar background
    ctx.fillStyle = "#334155";
    ctx.beginPath();
    ctx.roundRect(marginLeft, y, barAreaWidth, barHeight, 4);
    ctx.fill();

    // Bar fill
    if (barW > 0) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(marginLeft, y, Math.max(barW, 4), barHeight, 4);
      ctx.fill();
    }

    // Value text
    ctx.fillStyle = "#e2e8f0";
    ctx.textAlign = "left";
    ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(options.formatValue(values[i]), marginLeft + barAreaWidth + 8, y + barHeight / 2 + 4);
  }

  ctx.textAlign = "left";
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
    Loading location benchmarking data...
  </div>`;

  let data: BenchmarkData;
  try {
    const result = await _callTool("location-benchmarking", {
        locations: [
          "Downtown Auto Mile",
          "Westside Motors",
          "Northgate Pre-Owned",
          "Lakefront Autos",
          "Eastside Auto Hub",
          "Southpark Dealership",
        ],
      });
    const text = result?.content?.find((c: any) => c.type === "text")?.text;
    if (text) {
      data = JSON.parse(text) as BenchmarkData;
    } else {
      data = generateMockData();
    }
  } catch {
    data = generateMockData();
  }

  render(data);
}

// ── Render ─────────────────────────────────────────────────────────────
function render(data: BenchmarkData) {
  document.body.innerHTML = "";

  const locations = data.locations;
  const topLocation = locations[0];
  const bottomLocation = locations[locations.length - 1];

  // Header bar
  const header = el("div", {
    style: "background:#1e293b;padding:12px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:12px;",
  });
  header.innerHTML = `<h1 style="margin:0;font-size:16px;font-weight:600;color:#f8fafc;">Location Benchmarking</h1>
    <span style="font-size:12px;color:#64748b;margin-left:auto;">${locations.length} locations | Updated just now</span>`;
  document.body.appendChild(header);

  // Content wrapper
  const content = el("div", { style: "padding:16px 20px;" });
  document.body.appendChild(content);

  // ── Composite Ranking Table ──────────────────────────────────────────
  const tableSection = el("div", { style: "margin-bottom:20px;" });
  content.appendChild(tableSection);

  const tableTitle = el("h2", {
    style: "font-size:14px;font-weight:600;color:#f8fafc;margin:0 0 10px 0;",
  });
  tableTitle.textContent = "Composite Ranking";
  tableSection.appendChild(tableTitle);

  const tableWrapper = el("div", {
    style: "overflow-x:auto;border:1px solid #334155;border-radius:8px;",
  });
  const table = el("table", {
    style: "width:100%;border-collapse:collapse;font-size:12px;",
  });

  // Header
  const headers = ["#", "Location Name", "Composite Score", "Turn Rate Rank", "Aged % Rank", "Pricing Eff. Rank", "DOM vs Market Rank"];
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headers.forEach((h) => {
    const th = document.createElement("th");
    th.style.cssText =
      "padding:8px 12px;text-align:left;background:#1e293b;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;";
    th.textContent = h;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const loc of locations) {
    const tr = document.createElement("tr");

    // Row coloring: top row green, bottom row red
    let rowBg = "";
    if (loc.compositeRank === 1) rowBg = "rgba(16,185,129,0.12)";
    else if (loc.compositeRank === locations.length) rowBg = "rgba(239,68,68,0.12)";
    tr.style.cssText = `border-bottom:1px solid #1e293b;background:${rowBg};`;
    tr.addEventListener("mouseenter", () => { tr.style.background = "#1e293b"; });
    tr.addEventListener("mouseleave", () => { tr.style.background = rowBg; });

    const rankBadgeColor = loc.compositeRank === 1 ? "#10b981" : loc.compositeRank === locations.length ? "#ef4444" : "#94a3b8";

    const cells = [
      `<span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;background:${loc.compositeRank === 1 ? "rgba(16,185,129,0.2)" : loc.compositeRank === locations.length ? "rgba(239,68,68,0.2)" : "rgba(148,163,184,0.1)"};color:${rankBadgeColor};font-weight:700;font-size:12px;">${loc.compositeRank}</span>`,
      `<span style="color:#f8fafc;font-weight:500;">${loc.name}</span>`,
      `<span style="color:#f8fafc;font-weight:700;font-size:14px;">${loc.compositeScore.toFixed(2)}</span>`,
      rankCell(loc.turnRateRank, locations.length),
      rankCell(loc.agedPctRank, locations.length),
      rankCell(loc.pricingEffRank, locations.length),
      rankCell(loc.domVsMarketRank, locations.length),
    ];

    tr.innerHTML = cells
      .map((c) => `<td style="padding:8px 12px;white-space:nowrap;">${c}</td>`)
      .join("");
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  tableSection.appendChild(tableWrapper);

  // ── 4 KPI Bar Charts (middle row) ───────────────────────────────────
  const chartsRow = el("div", {
    style: "display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;",
  });
  content.appendChild(chartsRow);

  const names = locations.map((l) => l.name);

  // Chart 1: Turn Rate
  const canvas1 = createChartCanvas();
  chartsRow.appendChild(wrapCanvas(canvas1));

  // Chart 2: Aged Inventory %
  const canvas2 = createChartCanvas();
  chartsRow.appendChild(wrapCanvas(canvas2));

  // Chart 3: Pricing Efficiency
  const canvas3 = createChartCanvas();
  chartsRow.appendChild(wrapCanvas(canvas3));

  // Chart 4: DOM vs Market
  const canvas4 = createChartCanvas();
  chartsRow.appendChild(wrapCanvas(canvas4));

  // Draw charts after DOM attachment (need computed sizes)
  requestAnimationFrame(() => {
    drawHorizontalBarChart(canvas1, names, locations.map((l) => l.turnRate), {
      title: "Turn Rate (units sold/mo / avg inventory)",
      colorFn: (v) => {
        if (v >= 2.0) return "#10b981";
        if (v >= 1.5) return "#f59e0b";
        return "#ef4444";
      },
      formatValue: (v) => v.toFixed(2),
    });

    drawHorizontalBarChart(canvas2, names, locations.map((l) => l.agedPct), {
      title: "Aged Inventory % (>60 days)",
      colorFn: (v) => {
        if (v <= 10) return "#10b981";
        if (v <= 20) return "#f59e0b";
        return "#ef4444";
      },
      formatValue: (v) => v + "%",
      maxOverride: 50,
    });

    drawHorizontalBarChart(canvas3, names, locations.map((l) => l.pricingEfficiency), {
      title: "Pricing Efficiency (% within +/-5% of market)",
      colorFn: (v) => {
        if (v >= 75) return "#3b82f6";
        if (v >= 60) return "#6366f1";
        return "#8b5cf6";
      },
      formatValue: (v) => v + "%",
      maxOverride: 100,
    });

    drawHorizontalBarChart(canvas4, names, locations.map((l) => l.domVsMarket), {
      title: "DOM vs Market (location DOM / market DOM)",
      colorFn: (v) => {
        if (v < 1.0) return "#10b981";
        if (v < 1.2) return "#f59e0b";
        return "#ef4444";
      },
      formatValue: (v) => v.toFixed(2) + "x",
      maxOverride: 2.0,
    });
  });

  // ── Bottom Row: Best Practices + Improvement Opportunities ──────────
  const bottomRow = el("div", {
    style: "display:flex;gap:16px;flex-wrap:wrap;",
  });
  content.appendChild(bottomRow);

  // ── Best Practices Panel (bottom left) ──────────────────────────────
  const bestCard = el("div", {
    style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:18px;flex:1;min-width:340px;",
  });

  const bestPractices = generateBestPractices(topLocation, locations);

  bestCard.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <div style="width:36px;height:36px;border-radius:50%;background:rgba(16,185,129,0.15);display:flex;align-items:center;justify-content:center;">
        <span style="color:#10b981;font-size:18px;font-weight:700;">1</span>
      </div>
      <div>
        <h3 style="font-size:14px;font-weight:600;color:#f8fafc;margin:0;">Best Practices: ${topLocation.name}</h3>
        <div style="font-size:11px;color:#64748b;margin-top:1px;">Composite Score: ${topLocation.compositeScore.toFixed(2)} (Rank #1)</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
      <div style="background:#0f172a;border:1px solid #334155;border-radius:6px;padding:10px;">
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;">Turn Rate</div>
        <div style="font-size:18px;font-weight:700;color:#10b981;margin-top:2px;">${topLocation.turnRate.toFixed(2)}</div>
      </div>
      <div style="background:#0f172a;border:1px solid #334155;border-radius:6px;padding:10px;">
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;">Aged %</div>
        <div style="font-size:18px;font-weight:700;color:#10b981;margin-top:2px;">${topLocation.agedPct}%</div>
      </div>
      <div style="background:#0f172a;border:1px solid #334155;border-radius:6px;padding:10px;">
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;">Pricing Eff.</div>
        <div style="font-size:18px;font-weight:700;color:#3b82f6;margin-top:2px;">${topLocation.pricingEfficiency}%</div>
      </div>
      <div style="background:#0f172a;border:1px solid #334155;border-radius:6px;padding:10px;">
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;">DOM vs Market</div>
        <div style="font-size:18px;font-weight:700;color:#10b981;margin-top:2px;">${topLocation.domVsMarket.toFixed(2)}x</div>
      </div>
    </div>
    <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;font-weight:600;">What They Do Differently</div>
    <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px;">
      ${bestPractices.map((bp) => `
        <li style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:#e2e8f0;line-height:1.5;">
          <span style="color:#10b981;font-size:10px;margin-top:4px;flex-shrink:0;">&#9679;</span>
          ${bp}
        </li>
      `).join("")}
    </ul>
  `;
  bottomRow.appendChild(bestCard);

  // ── Improvement Opportunities Panel (bottom right) ──────────────────
  const improvCard = el("div", {
    style: "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:18px;flex:1;min-width:340px;",
  });

  const opportunities = generateOpportunities(bottomLocation, topLocation);

  improvCard.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <div style="width:36px;height:36px;border-radius:50%;background:rgba(239,68,68,0.15);display:flex;align-items:center;justify-content:center;">
        <span style="color:#ef4444;font-size:18px;font-weight:700;">${locations.length}</span>
      </div>
      <div>
        <h3 style="font-size:14px;font-weight:600;color:#f8fafc;margin:0;">Improvement Opportunities: ${bottomLocation.name}</h3>
        <div style="font-size:11px;color:#64748b;margin-top:1px;">Composite Score: ${bottomLocation.compositeScore.toFixed(2)} (Rank #${bottomLocation.compositeRank})</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
      <div style="background:#0f172a;border:1px solid #334155;border-radius:6px;padding:10px;">
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;">Turn Rate</div>
        <div style="font-size:18px;font-weight:700;color:#ef4444;margin-top:2px;">${bottomLocation.turnRate.toFixed(2)}</div>
      </div>
      <div style="background:#0f172a;border:1px solid #334155;border-radius:6px;padding:10px;">
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;">Aged %</div>
        <div style="font-size:18px;font-weight:700;color:#ef4444;margin-top:2px;">${bottomLocation.agedPct}%</div>
      </div>
      <div style="background:#0f172a;border:1px solid #334155;border-radius:6px;padding:10px;">
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;">Pricing Eff.</div>
        <div style="font-size:18px;font-weight:700;color:#8b5cf6;margin-top:2px;">${bottomLocation.pricingEfficiency}%</div>
      </div>
      <div style="background:#0f172a;border:1px solid #334155;border-radius:6px;padding:10px;">
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;">DOM vs Market</div>
        <div style="font-size:18px;font-weight:700;color:#ef4444;margin-top:2px;">${bottomLocation.domVsMarket.toFixed(2)}x</div>
      </div>
    </div>
    <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;font-weight:600;">Specific Gaps &amp; $ Impact</div>
    <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px;">
      ${opportunities.map((opp) => `
        <li style="background:#0f172a;border:1px solid #334155;border-radius:6px;padding:10px 12px;">
          <div style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:#e2e8f0;line-height:1.5;">
            <span style="color:#ef4444;font-size:10px;margin-top:4px;flex-shrink:0;">&#9679;</span>
            <div>
              <div style="font-weight:500;">${opp.gap}</div>
              <div style="color:#f59e0b;font-weight:600;margin-top:3px;">${opp.impact}</div>
            </div>
          </div>
        </li>
      `).join("")}
    </ul>
  `;
  bottomRow.appendChild(improvCard);
}

// ── Best Practices Generator ───────────────────────────────────────────
function generateBestPractices(top: RankedLocation, all: RankedLocation[]): string[] {
  const avgTurnRate = all.reduce((s, l) => s + l.turnRate, 0) / all.length;
  const avgAgedPct = all.reduce((s, l) => s + l.agedPct, 0) / all.length;
  const avgPricingEff = all.reduce((s, l) => s + l.pricingEfficiency, 0) / all.length;

  const bullets: string[] = [];

  bullets.push(
    `Turn rate of ${top.turnRate.toFixed(2)}x is ${((top.turnRate / avgTurnRate - 1) * 100).toFixed(0)}% above group average (${avgTurnRate.toFixed(2)}x), indicating faster inventory cycling and better capital efficiency.`
  );

  bullets.push(
    `Only ${top.agedPct}% aged inventory vs group average of ${avgAgedPct.toFixed(0)}%, reflecting disciplined 45-day pricing review cadence and proactive markdowns.`
  );

  bullets.push(
    `${top.pricingEfficiency}% of units priced within +/-5% of market (group avg: ${avgPricingEff.toFixed(0)}%), suggesting systematic competitive price monitoring and rapid adjustments.`
  );

  bullets.push(
    `DOM ratio of ${top.domVsMarket.toFixed(2)}x market means vehicles sell ${Math.round((1 - top.domVsMarket) * top.marketAvgDom)} days faster than market average, reducing floor plan carrying costs by ~${fmtCurrency(Math.round((1 - top.domVsMarket) * top.marketAvgDom * top.avgFloorPlanCostPerUnit / 30))}/unit.`
  );

  bullets.push(
    `Sells ${top.unitsSoldPerMonth} units/month from ${top.avgInventory}-unit lot, maintaining lean inventory that minimizes depreciation exposure.`
  );

  return bullets;
}

// ── Improvement Opportunities Generator ────────────────────────────────
interface Opportunity {
  gap: string;
  impact: string;
}

function generateOpportunities(bottom: RankedLocation, top: RankedLocation): Opportunity[] {
  const opps: Opportunity[] = [];

  // Aged inventory gap
  const agedUnitDiff = bottom.agedUnits - Math.round(bottom.totalUnits * (top.agedPct / 100));
  const floorPlanSaving = agedUnitDiff * bottom.avgFloorPlanCostPerUnit;
  opps.push({
    gap: `Aged inventory at ${bottom.agedPct}% (${bottom.agedUnits} units) vs top performer's ${top.agedPct}% — ${agedUnitDiff} excess aged units sitting on the lot.`,
    impact: `Reducing aged inventory by ${agedUnitDiff} units saves ~${fmtCurrency(floorPlanSaving)}/month in floor plan carrying costs.`,
  });

  // Turn rate gap
  const turnRateGap = top.turnRate - bottom.turnRate;
  const additionalUnits = Math.round(turnRateGap * bottom.avgInventory);
  const avgGrossPerUnit = 2200;
  opps.push({
    gap: `Turn rate of ${bottom.turnRate.toFixed(2)}x vs top performer's ${top.turnRate.toFixed(2)}x — moving inventory ${(turnRateGap / bottom.turnRate * 100).toFixed(0)}% slower.`,
    impact: `Matching top performer's turn rate adds ~${additionalUnits} units/month, generating ~${fmtCurrency(additionalUnits * avgGrossPerUnit)}/month in incremental gross profit.`,
  });

  // Pricing efficiency gap
  const pricingGap = top.pricingEfficiency - bottom.pricingEfficiency;
  const misPricedUnits = Math.round(bottom.totalUnits * (pricingGap / 100));
  const avgPricingLoss = 850;
  opps.push({
    gap: `Only ${bottom.pricingEfficiency}% of units priced within +/-5% of market vs top's ${top.pricingEfficiency}% — ${misPricedUnits} units likely mispriced at any time.`,
    impact: `Correcting pricing on ${misPricedUnits} additional units recovers ~${fmtCurrency(misPricedUnits * avgPricingLoss)}/month in lost margin or missed sales.`,
  });

  // DOM gap
  const domDiff = bottom.avgDom - top.avgDom;
  const carryPerDay = bottom.avgFloorPlanCostPerUnit / 30;
  opps.push({
    gap: `Average DOM of ${bottom.avgDom} days vs top's ${top.avgDom} days — each unit sits ${domDiff} extra days, with DOM/market ratio of ${bottom.domVsMarket.toFixed(2)}x.`,
    impact: `Reducing DOM by ${domDiff} days across ${bottom.totalUnits} units saves ~${fmtCurrency(Math.round(domDiff * carryPerDay * bottom.totalUnits))}/month in carrying costs.`,
  });

  return opps;
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

function rankCell(rank: number, total: number): string {
  let color: string;
  if (rank === 1) color = "#10b981";
  else if (rank === 2) color = "#34d399";
  else if (rank >= total) color = "#ef4444";
  else if (rank >= total - 1) color = "#f97316";
  else color = "#f59e0b";

  return `<span style="display:inline-block;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:700;background:${rank === 1 ? "rgba(16,185,129,0.15)" : rank === total ? "rgba(239,68,68,0.15)" : "rgba(148,163,184,0.08)"};color:${color};border:1px solid ${rank === 1 ? "rgba(16,185,129,0.3)" : rank === total ? "rgba(239,68,68,0.3)" : "rgba(148,163,184,0.15)"};">#${rank}</span>`;
}

function createChartCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width:100%;height:220px;border-radius:8px;display:block;";
  return canvas;
}

function wrapCanvas(canvas: HTMLCanvasElement): HTMLElement {
  const wrapper = el("div", {
    style: "background:#1e293b;border:1px solid #334155;border-radius:8px;overflow:hidden;",
  });
  wrapper.appendChild(canvas);
  return wrapper;
}

main();
