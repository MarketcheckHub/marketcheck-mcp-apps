import { App } from "@modelcontextprotocol/ext-apps";

const _safeApp = (() => { try { return new App({ name: "depreciation-analyzer" });

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

// ── Types ──────────────────────────────────────────────────────────────────
interface ModelSelector {
  make: string;
  model: string;
}

interface MonthlyDataPoint {
  month: number;
  avgPrice: number;
  pctOfMsrp: number;
  volume: number;
}

interface SegmentDepreciation {
  bodyType: string;
  monthlyDepreciationPct: number;
}

interface StateVariance {
  state: string;
  avgPrice: number;
  volume: number;
  priceIndex: number;
}

interface DepreciationData {
  model: ModelSelector;
  msrp: number;
  monthlyData: MonthlyDataPoint[];
  segment: string;
}

interface AnalyzerResult {
  models: DepreciationData[];
  segmentComparisons: SegmentDepreciation[];
  stateVariance: StateVariance[];
}

type TimeRange = "3M" | "6M" | "1Y" | "2Y";

// ── Constants ──────────────────────────────────────────────────────────────
const COLORS = ["#38bdf8", "#f472b6", "#a78bfa", "#34d399"];
const BG_COLOR = "#0f172a";
const SURFACE_COLOR = "#1e293b";
const BORDER_COLOR = "#334155";
const TEXT_PRIMARY = "#f1f5f9";
const TEXT_SECONDARY = "#94a3b8";
const TEXT_MUTED = "#64748b";
const ACCENT = "#38bdf8";

const US_STATES = [
  "National", "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI",
  "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND",
  "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA",
  "WA", "WV", "WI", "WY"
];

const MAKES_MODELS: Record<string, string[]> = {
  "Toyota": ["RAV4", "Camry", "Corolla", "Highlander", "Tacoma", "4Runner", "Tundra"],
  "Honda": ["CR-V", "Civic", "Accord", "Pilot", "HR-V", "Odyssey"],
  "Hyundai": ["Tucson", "Elantra", "Santa Fe", "Palisade", "Kona", "Sonata"],
  "Ford": ["F-150", "Escape", "Explorer", "Bronco", "Maverick", "Mustang"],
  "Chevrolet": ["Silverado", "Equinox", "Traverse", "Tahoe", "Malibu", "Camaro"],
  "Nissan": ["Rogue", "Altima", "Sentra", "Pathfinder", "Frontier", "Murano"],
  "Kia": ["Sportage", "Forte", "Telluride", "Seltos", "Sorento", "K5"],
  "Subaru": ["Outback", "Forester", "Crosstrek", "Ascent", "Impreza", "WRX"],
  "BMW": ["X3", "X5", "3 Series", "5 Series", "X1", "4 Series"],
  "Mercedes-Benz": ["GLC", "GLE", "C-Class", "E-Class", "A-Class", "GLA"],
};

// ── Mock Data ──────────────────────────────────────────────────────────────
function generateMockData(
  models: ModelSelector[],
  timeRange: TimeRange,
  _state: string
): AnalyzerResult {
  const months = timeRange === "3M" ? 3 : timeRange === "6M" ? 6 : timeRange === "1Y" ? 12 : 24;

  const msrpMap: Record<string, number> = {
    "Toyota RAV4": 33450,
    "Honda CR-V": 34110,
    "Hyundai Tucson": 31550,
    "Ford Escape": 33495,
    "Chevrolet Equinox": 30500,
    "Toyota Camry": 28855,
    "Honda Civic": 24950,
    "Ford F-150": 36965,
    "Chevrolet Silverado": 37645,
    "Toyota Highlander": 39520,
  };

  // Monthly depreciation rates (lower = retains value better)
  const depRates: Record<string, number> = {
    "Toyota RAV4": 0.0078,
    "Honda CR-V": 0.0085,
    "Hyundai Tucson": 0.0105,
    "Ford Escape": 0.0112,
    "Chevrolet Equinox": 0.0118,
    "Toyota Camry": 0.0092,
    "Honda Civic": 0.0088,
    "Ford F-150": 0.0082,
    "Chevrolet Silverado": 0.0090,
    "Toyota Highlander": 0.0080,
  };

  const segmentMap: Record<string, string> = {
    "Toyota RAV4": "SUV",
    "Honda CR-V": "SUV",
    "Hyundai Tucson": "SUV",
    "Ford Escape": "SUV",
    "Chevrolet Equinox": "SUV",
    "Toyota Camry": "Sedan",
    "Honda Civic": "Sedan",
    "Ford F-150": "Truck",
    "Chevrolet Silverado": "Truck",
    "Toyota Highlander": "SUV",
  };

  const modelData: DepreciationData[] = models.map((m) => {
    const key = `${m.make} ${m.model}`;
    const msrp = msrpMap[key] || 30000;
    const rate = depRates[key] || 0.01;
    const segment = segmentMap[key] || "SUV";

    const monthlyData: MonthlyDataPoint[] = [];
    for (let i = 1; i <= months; i++) {
      const noise = 1 + (Math.random() - 0.5) * 0.008;
      const pct = Math.max(0.5, (1 - rate * i) * noise);
      monthlyData.push({
        month: i,
        avgPrice: Math.round(msrp * pct),
        pctOfMsrp: Math.round(pct * 1000) / 10,
        volume: Math.round(800 + Math.random() * 1200),
      });
    }
    return { model: m, msrp, monthlyData, segment };
  });

  const segmentComparisons: SegmentDepreciation[] = [
    { bodyType: "SUV", monthlyDepreciationPct: 0.92 },
    { bodyType: "Sedan", monthlyDepreciationPct: 1.15 },
    { bodyType: "Truck", monthlyDepreciationPct: 0.85 },
    { bodyType: "Coupe", monthlyDepreciationPct: 1.38 },
    { bodyType: "Van", monthlyDepreciationPct: 1.22 },
    { bodyType: "Hatchback", monthlyDepreciationPct: 1.08 },
  ];

  const stateData: StateVariance[] = [
    { state: "CA", avgPrice: 34200, volume: 4250, priceIndex: 108 },
    { state: "TX", avgPrice: 31800, volume: 3820, priceIndex: 101 },
    { state: "FL", avgPrice: 32600, volume: 3640, priceIndex: 103 },
    { state: "NY", avgPrice: 33800, volume: 2910, priceIndex: 107 },
    { state: "WA", avgPrice: 33400, volume: 1850, priceIndex: 106 },
    { state: "CO", avgPrice: 32900, volume: 1620, priceIndex: 104 },
    { state: "AZ", avgPrice: 31200, volume: 1780, priceIndex: 99 },
    { state: "IL", avgPrice: 30800, volume: 2340, priceIndex: 97 },
    { state: "OH", avgPrice: 29600, volume: 1920, priceIndex: 94 },
    { state: "PA", avgPrice: 30200, volume: 2080, priceIndex: 96 },
    { state: "NC", avgPrice: 30900, volume: 1740, priceIndex: 98 },
    { state: "GA", avgPrice: 31500, volume: 2150, priceIndex: 100 },
    { state: "MI", avgPrice: 29200, volume: 1560, priceIndex: 92 },
    { state: "NJ", avgPrice: 33100, volume: 1680, priceIndex: 105 },
    { state: "VA", avgPrice: 31600, volume: 1520, priceIndex: 100 },
  ];

  return { models: modelData, segmentComparisons, stateVariance: stateData };
}

// ── App State ──────────────────────────────────────────────────────────────
let app: InstanceType<typeof App>;
let compareMode = true;
let modelSelectors: ModelSelector[] = [
  { make: "Toyota", model: "RAV4" },
  { make: "Honda", model: "CR-V" },
  { make: "Hyundai", model: "Tucson" },
];
let timeRange: TimeRange = "1Y";
let selectedState = "National";
let showPctOfMsrp = false;
let showMovingAvg = false;
let currentData: AnalyzerResult | null = null;
let hoveredMonth: number | null = null;

// Canvas refs
let curveCanvas: HTMLCanvasElement;
let segmentCanvas: HTMLCanvasElement;

// ── Initialize ─────────────────────────────────────────────────────────────
async function init() {
  app = new App({ name: "depreciation-analyzer", version: "1.0.0" });
  buildUI();
  await fetchData();
}

// ── Data Fetching ──────────────────────────────────────────────────────────
async function fetchData() {
  const models = compareMode ? modelSelectors.filter((m) => m.make && m.model) : [modelSelectors[0]];
  if (models.length === 0) return;

  try {
    const result = await _callTool("depreciation-analyzer", {
        models: models.map((m) => ({ make: m.make, model: m.model })),
        timeRange,
        state: selectedState,
      });
    if (result && typeof result === "object") {
      currentData = result as unknown as AnalyzerResult;
    } else {
      currentData = generateMockData(models, timeRange, selectedState);
    }
  } catch {
    currentData = generateMockData(models, timeRange, selectedState);
  }

  renderAll();
}

// ── Build UI ───────────────────────────────────────────────────────────────
function buildUI() {
  document.body.style.cssText = `
    background: ${BG_COLOR}; color: ${TEXT_PRIMARY}; font-family: -apple-system, BlinkMacSystemFont,
    'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; height: 100vh;
    overflow: hidden;
  `;

  // Control bar
  const controlBar = el("div", {
    style: `display:flex; align-items:center; gap:12px; padding:12px 20px;
      background:${SURFACE_COLOR}; border-bottom:1px solid ${BORDER_COLOR}; flex-wrap:wrap;
      min-height:56px;`,
  });

  // Mode toggle
  const modeToggle = buildModeToggle();
  controlBar.appendChild(modeToggle);

  // Separator
  controlBar.appendChild(el("div", { style: `width:1px; height:28px; background:${BORDER_COLOR};` }));

  // Model selectors container
  const modelSelectorsContainer = el("div", {
    id: "model-selectors",
    style: "display:flex; gap:8px; flex-wrap:wrap; align-items:center;",
  });
  controlBar.appendChild(modelSelectorsContainer);

  // Separator
  controlBar.appendChild(el("div", { style: `width:1px; height:28px; background:${BORDER_COLOR};` }));

  // Time range pills
  const timeContainer = el("div", { style: "display:flex; gap:4px;" });
  (["3M", "6M", "1Y", "2Y"] as TimeRange[]).forEach((tr) => {
    const pill = el("button", {
      textContent: tr,
      style: pillStyle(tr === timeRange),
      onclick: () => {
        timeRange = tr;
        buildUI();
        fetchData();
      },
    });
    timeContainer.appendChild(pill);
  });
  controlBar.appendChild(timeContainer);

  // State dropdown
  const stateSelect = el("select", {
    style: selectStyle(),
    onchange: (e: Event) => {
      selectedState = (e.target as HTMLSelectElement).value;
      fetchData();
    },
  }) as HTMLSelectElement;
  US_STATES.forEach((s) => {
    const opt = el("option", { value: s, textContent: s }) as HTMLOptionElement;
    if (s === selectedState) opt.selected = true;
    stateSelect.appendChild(opt);
  });
  controlBar.appendChild(stateSelect);

  // Toggle buttons for chart options
  controlBar.appendChild(el("div", { style: `width:1px; height:28px; background:${BORDER_COLOR};` }));

  const msrpToggle = el("button", {
    textContent: showPctOfMsrp ? "% MSRP" : "$ Price",
    style: pillStyle(showPctOfMsrp),
    onclick: () => {
      showPctOfMsrp = !showPctOfMsrp;
      buildUI();
      renderAll();
    },
  });
  controlBar.appendChild(msrpToggle);

  const maToggle = el("button", {
    textContent: "3M Avg",
    style: pillStyle(showMovingAvg),
    onclick: () => {
      showMovingAvg = !showMovingAvg;
      buildUI();
      renderAll();
    },
  });
  controlBar.appendChild(maToggle);

  // Main content area
  const mainArea = el("div", {
    style: "flex:1; display:flex; flex-direction:column; overflow:hidden; padding:12px; gap:12px;",
  });

  // Top section: Depreciation Curve (60%)
  const curveSection = el("div", {
    style: `flex:0 0 60%; background:${SURFACE_COLOR}; border:1px solid ${BORDER_COLOR};
      border-radius:8px; position:relative; overflow:hidden; display:flex; flex-direction:column;`,
  });
  const curveHeader = el("div", {
    style: `padding:10px 16px; border-bottom:1px solid ${BORDER_COLOR}; display:flex;
      justify-content:space-between; align-items:center;`,
  });
  curveHeader.appendChild(
    el("span", {
      textContent: "Depreciation Curve",
      style: `font-size:14px; font-weight:600; color:${TEXT_PRIMARY};`,
    })
  );

  // Legend
  const legend = el("div", { style: "display:flex; gap:12px;" });
  curveHeader.appendChild(legend);
  curveSection.appendChild(curveHeader);

  curveCanvas = el("canvas", {
    style: "flex:1; width:100%;",
  }) as HTMLCanvasElement;
  curveSection.appendChild(curveCanvas);
  mainArea.appendChild(curveSection);

  // Bottom section: Segment + Geographic (40%)
  const bottomRow = el("div", {
    style: "flex:0 0 calc(40% - 12px); display:flex; gap:12px; min-height:0;",
  });

  // Segment Comparison Bars (left 50%)
  const segmentSection = el("div", {
    style: `flex:1; background:${SURFACE_COLOR}; border:1px solid ${BORDER_COLOR};
      border-radius:8px; overflow:hidden; display:flex; flex-direction:column;`,
  });
  const segmentHeader = el("div", {
    style: `padding:10px 16px; border-bottom:1px solid ${BORDER_COLOR};`,
  });
  segmentHeader.appendChild(
    el("span", {
      textContent: "Segment Depreciation Rates",
      style: `font-size:14px; font-weight:600; color:${TEXT_PRIMARY};`,
    })
  );
  segmentSection.appendChild(segmentHeader);
  segmentCanvas = el("canvas", { style: "flex:1; width:100%;" }) as HTMLCanvasElement;
  segmentSection.appendChild(segmentCanvas);
  bottomRow.appendChild(segmentSection);

  // Geographic Variance Table (right 50%)
  const geoSection = el("div", {
    style: `flex:1; background:${SURFACE_COLOR}; border:1px solid ${BORDER_COLOR};
      border-radius:8px; overflow:hidden; display:flex; flex-direction:column;`,
  });
  const geoHeader = el("div", {
    style: `padding:10px 16px; border-bottom:1px solid ${BORDER_COLOR};`,
  });
  geoHeader.appendChild(
    el("span", {
      textContent: "Geographic Variance",
      style: `font-size:14px; font-weight:600; color:${TEXT_PRIMARY};`,
    })
  );
  geoSection.appendChild(geoHeader);
  const geoTable = el("div", {
    id: "geo-table",
    style: "flex:1; overflow-y:auto; padding:4px 0;",
  });
  geoSection.appendChild(geoTable);
  bottomRow.appendChild(geoSection);
  mainArea.appendChild(bottomRow);

  // Insights Ticker (bottom bar)
  const ticker = el("div", {
    id: "insights-ticker",
    style: `padding:10px 20px; background:${SURFACE_COLOR}; border-top:1px solid ${BORDER_COLOR};
      font-size:13px; color:${ACCENT}; white-space:nowrap; overflow:hidden;`,
  });
  ticker.textContent = "Loading depreciation data...";

  // Assemble
  document.body.innerHTML = "";
  document.body.appendChild(controlBar);
  document.body.appendChild(mainArea);
  document.body.appendChild(ticker);

  // Build model selectors
  rebuildModelSelectors();

  // Re-render if we have data
  if (currentData) {
    renderAll();
  }
}

function buildModeToggle(): HTMLElement {
  const container = el("div", {
    style: `display:flex; background:${BG_COLOR}; border-radius:6px; overflow:hidden;
      border:1px solid ${BORDER_COLOR};`,
  });

  const singleBtn = el("button", {
    textContent: "Single Model",
    style: `padding:6px 14px; font-size:12px; border:none; cursor:pointer;
      font-weight:500; transition:all 0.15s;
      background:${!compareMode ? ACCENT : "transparent"};
      color:${!compareMode ? BG_COLOR : TEXT_SECONDARY};`,
    onclick: () => {
      compareMode = false;
      modelSelectors = [modelSelectors[0]];
      buildUI();
      fetchData();
    },
  });

  const compareBtn = el("button", {
    textContent: "Compare Models",
    style: `padding:6px 14px; font-size:12px; border:none; cursor:pointer;
      font-weight:500; transition:all 0.15s;
      background:${compareMode ? ACCENT : "transparent"};
      color:${compareMode ? BG_COLOR : TEXT_SECONDARY};`,
    onclick: () => {
      compareMode = true;
      if (modelSelectors.length < 2) {
        modelSelectors.push({ make: "Honda", model: "CR-V" });
      }
      buildUI();
      fetchData();
    },
  });

  container.appendChild(singleBtn);
  container.appendChild(compareBtn);
  return container;
}

function rebuildModelSelectors() {
  const container = document.getElementById("model-selectors");
  if (!container) return;
  container.innerHTML = "";

  const maxSlots = compareMode ? 4 : 1;
  const slots = Math.min(modelSelectors.length, maxSlots);

  for (let i = 0; i < slots; i++) {
    const wrapper = el("div", {
      style: `display:flex; gap:4px; align-items:center; padding:2px 6px;
        border-radius:6px; border:1px solid ${COLORS[i % COLORS.length]}33;
        background:${COLORS[i % COLORS.length]}0d;`,
    });

    // Color dot
    wrapper.appendChild(
      el("div", {
        style: `width:8px; height:8px; border-radius:50%;
          background:${COLORS[i % COLORS.length]}; flex-shrink:0;`,
      })
    );

    // Make dropdown
    const makeSelect = el("select", {
      style: selectStyle(true),
      onchange: (e: Event) => {
        const val = (e.target as HTMLSelectElement).value;
        modelSelectors[i] = { make: val, model: MAKES_MODELS[val]?.[0] || "" };
        rebuildModelSelectors();
        fetchData();
      },
    }) as HTMLSelectElement;
    makeSelect.appendChild(el("option", { value: "", textContent: "Make..." }));
    Object.keys(MAKES_MODELS).forEach((make) => {
      const opt = el("option", { value: make, textContent: make }) as HTMLOptionElement;
      if (make === modelSelectors[i]?.make) opt.selected = true;
      makeSelect.appendChild(opt);
    });
    wrapper.appendChild(makeSelect);

    // Model dropdown
    const modelSelect = el("select", {
      style: selectStyle(true),
      onchange: (e: Event) => {
        modelSelectors[i] = { ...modelSelectors[i], model: (e.target as HTMLSelectElement).value };
        fetchData();
      },
    }) as HTMLSelectElement;
    modelSelect.appendChild(el("option", { value: "", textContent: "Model..." }));
    const models = MAKES_MODELS[modelSelectors[i]?.make] || [];
    models.forEach((m) => {
      const opt = el("option", { value: m, textContent: m }) as HTMLOptionElement;
      if (m === modelSelectors[i]?.model) opt.selected = true;
      modelSelect.appendChild(opt);
    });
    wrapper.appendChild(modelSelect);

    // Remove button (if compare mode and more than 2)
    if (compareMode && slots > 2) {
      const removeBtn = el("button", {
        textContent: "\u00d7",
        style: `background:none; border:none; color:${TEXT_MUTED}; cursor:pointer;
          font-size:16px; padding:0 4px; line-height:1;`,
        onclick: () => {
          modelSelectors.splice(i, 1);
          rebuildModelSelectors();
          fetchData();
        },
      });
      wrapper.appendChild(removeBtn);
    }

    container.appendChild(wrapper);
  }

  // Add model button
  if (compareMode && slots < 4) {
    const addBtn = el("button", {
      textContent: "+ Add",
      style: `padding:4px 12px; font-size:12px; border:1px dashed ${BORDER_COLOR};
        border-radius:6px; background:transparent; color:${TEXT_SECONDARY};
        cursor:pointer;`,
      onclick: () => {
        modelSelectors.push({ make: "", model: "" });
        rebuildModelSelectors();
      },
    });
    container.appendChild(addBtn);
  }
}

// ── Rendering ──────────────────────────────────────────────────────────────
function renderAll() {
  if (!currentData) return;
  renderCurveChart();
  renderSegmentBars();
  renderGeoTable();
  renderLegend();
  renderTicker();
}

function renderLegend() {
  if (!currentData) return;
  const curveSection = curveCanvas.parentElement;
  if (!curveSection) return;
  const header = curveSection.querySelector("div");
  if (!header) return;
  const legendContainer = header.querySelectorAll("div")[0];
  if (!legendContainer) return;

  // Find the legend div (second child of header)
  const legend = header.children[1] as HTMLElement;
  if (!legend) return;
  legend.innerHTML = "";

  currentData.models.forEach((md, i) => {
    const item = el("div", { style: "display:flex; align-items:center; gap:4px;" });
    item.appendChild(
      el("div", {
        style: `width:12px; height:3px; background:${COLORS[i % COLORS.length]}; border-radius:2px;`,
      })
    );
    item.appendChild(
      el("span", {
        textContent: `${md.model.make} ${md.model.model}`,
        style: `font-size:11px; color:${TEXT_SECONDARY};`,
      })
    );
    legend.appendChild(item);
  });

  if (showMovingAvg) {
    const item = el("div", { style: "display:flex; align-items:center; gap:4px;" });
    item.appendChild(
      el("div", {
        style: `width:12px; height:0; border-top:2px dashed ${TEXT_MUTED}; border-radius:0;`,
      })
    );
    item.appendChild(
      el("span", {
        textContent: "3M Avg",
        style: `font-size:11px; color:${TEXT_SECONDARY};`,
      })
    );
    legend.appendChild(item);
  }
}

function renderCurveChart() {
  if (!currentData || !curveCanvas) return;

  const rect = curveCanvas.parentElement!.getBoundingClientRect();
  const headerH = curveCanvas.parentElement!.querySelector("div")?.getBoundingClientRect().height || 40;
  const w = rect.width;
  const h = rect.height - headerH;

  const dpr = window.devicePixelRatio || 1;
  curveCanvas.width = w * dpr;
  curveCanvas.height = h * dpr;
  curveCanvas.style.width = `${w}px`;
  curveCanvas.style.height = `${h}px`;

  const ctx = curveCanvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = { top: 20, right: 30, bottom: 40, left: 70 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  if (chartW <= 0 || chartH <= 0) return;

  const allPoints = currentData.models.flatMap((md) => md.monthlyData);
  const months = Math.max(...allPoints.map((p) => p.month), 1);

  let yMin: number, yMax: number;
  if (showPctOfMsrp) {
    const vals = allPoints.map((p) => p.pctOfMsrp);
    yMin = Math.floor(Math.min(...vals) / 5) * 5 - 2;
    yMax = 100;
  } else {
    const vals = allPoints.map((p) => p.avgPrice);
    yMin = Math.floor(Math.min(...vals) / 1000) * 1000 - 1000;
    yMax = Math.ceil(Math.max(...vals) / 1000) * 1000 + 1000;
  }

  const xScale = (m: number) => pad.left + ((m - 1) / Math.max(months - 1, 1)) * chartW;
  const yScale = (v: number) => pad.top + chartH - ((v - yMin) / (yMax - yMin)) * chartH;

  // Grid
  ctx.strokeStyle = BORDER_COLOR;
  ctx.lineWidth = 0.5;
  const yTicks = 6;
  for (let i = 0; i <= yTicks; i++) {
    const yVal = yMin + ((yMax - yMin) * i) / yTicks;
    const y = yScale(yVal);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();

    ctx.fillStyle = TEXT_MUTED;
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    if (showPctOfMsrp) {
      ctx.fillText(`${yVal.toFixed(0)}%`, pad.left - 8, y);
    } else {
      ctx.fillText(`$${(yVal / 1000).toFixed(0)}k`, pad.left - 8, y);
    }
  }

  // X-axis labels
  ctx.fillStyle = TEXT_MUTED;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let m = 1; m <= months; m++) {
    const skipStep = months > 12 ? 3 : months > 6 ? 2 : 1;
    if (m % skipStep === 0 || m === 1) {
      ctx.fillText(`${m}mo`, xScale(m), pad.top + chartH + 8);
    }
  }

  // Y-axis label
  ctx.save();
  ctx.translate(14, pad.top + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = TEXT_SECONDARY;
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(showPctOfMsrp ? "% of MSRP" : "Avg Sale Price", 0, 0);
  ctx.restore();

  // Draw lines
  currentData.models.forEach((md, idx) => {
    const color = COLORS[idx % COLORS.length];
    const points = md.monthlyData;

    // Main line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    points.forEach((p, j) => {
      const x = xScale(p.month);
      const y = yScale(showPctOfMsrp ? p.pctOfMsrp : p.avgPrice);
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Gradient fill under line
    ctx.beginPath();
    points.forEach((p, j) => {
      const x = xScale(p.month);
      const y = yScale(showPctOfMsrp ? p.pctOfMsrp : p.avgPrice);
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(xScale(points[points.length - 1].month), pad.top + chartH);
    ctx.lineTo(xScale(points[0].month), pad.top + chartH);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
    grad.addColorStop(0, color + "18");
    grad.addColorStop(1, color + "02");
    ctx.fillStyle = grad;
    ctx.fill();

    // Data points
    points.forEach((p) => {
      const x = xScale(p.month);
      const y = yScale(showPctOfMsrp ? p.pctOfMsrp : p.avgPrice);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // 3-month moving average
    if (showMovingAvg && points.length >= 3) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      let started = false;
      for (let k = 2; k < points.length; k++) {
        const vals = [points[k - 2], points[k - 1], points[k]];
        const avg = showPctOfMsrp
          ? vals.reduce((s, v) => s + v.pctOfMsrp, 0) / 3
          : vals.reduce((s, v) => s + v.avgPrice, 0) / 3;
        const x = xScale(points[k].month);
        const y = yScale(avg);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });

  // Hover crosshair
  if (hoveredMonth !== null) {
    const x = xScale(hoveredMonth);
    ctx.strokeStyle = TEXT_MUTED;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + chartH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Tooltip
    const tooltipW = 160;
    const tooltipH = 20 + currentData.models.length * 18;
    let tx = x + 12;
    if (tx + tooltipW > w - pad.right) tx = x - tooltipW - 12;
    const ty = pad.top + 10;

    ctx.fillStyle = BG_COLOR + "ee";
    ctx.strokeStyle = BORDER_COLOR;
    ctx.lineWidth = 1;
    roundRect(ctx, tx, ty, tooltipW, tooltipH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = "bold 11px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Month ${hoveredMonth}`, tx + 10, ty + 14);

    currentData.models.forEach((md, idx) => {
      const pt = md.monthlyData.find((p) => p.month === hoveredMonth);
      if (!pt) return;
      const color = COLORS[idx % COLORS.length];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(tx + 10, ty + 30 + idx * 18, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = TEXT_SECONDARY;
      ctx.font = "11px -apple-system, sans-serif";
      const label = `${md.model.make} ${md.model.model}`;
      const val = showPctOfMsrp ? `${pt.pctOfMsrp}%` : `$${pt.avgPrice.toLocaleString()}`;
      ctx.fillText(`${label}: ${val}`, tx + 20, ty + 34 + idx * 18);
    });
  }

  // Mouse tracking
  curveCanvas.onmousemove = (e: MouseEvent) => {
    const canvasRect = curveCanvas.getBoundingClientRect();
    const mx = e.clientX - canvasRect.left;
    if (mx < pad.left || mx > w - pad.right || !currentData) {
      hoveredMonth = null;
      renderCurveChart();
      return;
    }
    const maxMonth = Math.max(...currentData.models.flatMap((md) => md.monthlyData.map((p) => p.month)));
    const rawMonth = 1 + ((mx - pad.left) / chartW) * (maxMonth - 1);
    hoveredMonth = Math.max(1, Math.min(maxMonth, Math.round(rawMonth)));
    renderCurveChart();
  };

  curveCanvas.onmouseleave = () => {
    hoveredMonth = null;
    renderCurveChart();
  };
}

function renderSegmentBars() {
  if (!currentData || !segmentCanvas) return;

  const rect = segmentCanvas.parentElement!.getBoundingClientRect();
  const headerH = segmentCanvas.parentElement!.querySelector("div")?.getBoundingClientRect().height || 40;
  const w = rect.width;
  const h = rect.height - headerH;

  const dpr = window.devicePixelRatio || 1;
  segmentCanvas.width = w * dpr;
  segmentCanvas.height = h * dpr;
  segmentCanvas.style.width = `${w}px`;
  segmentCanvas.style.height = `${h}px`;

  const ctx = segmentCanvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = { top: 12, right: 50, bottom: 12, left: 90 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  if (chartW <= 0 || chartH <= 0) return;

  const segments = currentData.segmentComparisons;
  const maxRate = Math.max(...segments.map((s) => s.monthlyDepreciationPct)) * 1.15;
  const barH = Math.min(28, (chartH - (segments.length - 1) * 6) / segments.length);
  const gap = (chartH - barH * segments.length) / Math.max(segments.length - 1, 1);

  // Current model segments
  const modelSegments = currentData.models.map((md) => md.segment);

  segments.forEach((seg, i) => {
    const y = pad.top + i * (barH + gap);
    const barW = (seg.monthlyDepreciationPct / maxRate) * chartW;
    const isHighlighted = modelSegments.includes(seg.bodyType);

    // Label
    ctx.fillStyle = isHighlighted ? TEXT_PRIMARY : TEXT_SECONDARY;
    ctx.font = `${isHighlighted ? "600" : "400"} 12px -apple-system, sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(seg.bodyType, pad.left - 10, y + barH / 2);

    // Bar background
    ctx.fillStyle = BORDER_COLOR + "40";
    roundRect(ctx, pad.left, y, chartW, barH, 4);
    ctx.fill();

    // Bar fill -- green for slow depreciation, red for fast
    const t = seg.monthlyDepreciationPct / maxRate;
    const r = Math.round(34 + t * (239 - 34));
    const g = Math.round(211 - t * (211 - 68));
    const b = Math.round(153 - t * (153 - 68));
    const barColor = `rgb(${r},${g},${b})`;

    ctx.fillStyle = isHighlighted ? barColor : barColor + "88";
    roundRect(ctx, pad.left, y, barW, barH, 4);
    ctx.fill();

    // Highlight border
    if (isHighlighted) {
      ctx.strokeStyle = barColor;
      ctx.lineWidth = 1.5;
      roundRect(ctx, pad.left, y, barW, barH, 4);
      ctx.stroke();
    }

    // Value label
    ctx.fillStyle = isHighlighted ? TEXT_PRIMARY : TEXT_SECONDARY;
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${seg.monthlyDepreciationPct.toFixed(2)}%/mo`, pad.left + barW + 8, y + barH / 2);
  });
}

function renderGeoTable() {
  if (!currentData) return;
  const container = document.getElementById("geo-table");
  if (!container) return;
  container.innerHTML = "";

  // Header row
  const headerRow = el("div", {
    style: `display:grid; grid-template-columns:50px 1fr 80px 80px;
      padding:6px 16px; border-bottom:1px solid ${BORDER_COLOR};`,
  });
  ["State", "Avg Price", "Volume", "Index"].forEach((col) => {
    headerRow.appendChild(
      el("span", {
        textContent: col,
        style: `font-size:11px; font-weight:600; color:${TEXT_MUTED}; text-transform:uppercase;
          letter-spacing:0.5px;`,
      })
    );
  });
  container.appendChild(headerRow);

  // Sort by price index descending
  const sorted = [...currentData.stateVariance].sort((a, b) => b.priceIndex - a.priceIndex);

  sorted.forEach((sv, i) => {
    let indexColor = TEXT_SECONDARY;
    let indexBg = "transparent";
    if (sv.priceIndex > 105) {
      indexColor = "#22c55e";
      indexBg = "#22c55e15";
    } else if (sv.priceIndex < 95) {
      indexColor = "#ef4444";
      indexBg = "#ef444415";
    } else {
      indexColor = TEXT_SECONDARY;
      indexBg = `${TEXT_MUTED}10`;
    }

    const row = el("div", {
      style: `display:grid; grid-template-columns:50px 1fr 80px 80px;
        padding:5px 16px; border-bottom:1px solid ${BORDER_COLOR}20;
        ${i % 2 === 0 ? `background:${BG_COLOR}30;` : ""}`,
    });

    row.appendChild(
      el("span", {
        textContent: sv.state,
        style: `font-size:12px; font-weight:600; color:${TEXT_PRIMARY};`,
      })
    );
    row.appendChild(
      el("span", {
        textContent: `$${sv.avgPrice.toLocaleString()}`,
        style: `font-size:12px; color:${TEXT_SECONDARY};`,
      })
    );
    row.appendChild(
      el("span", {
        textContent: sv.volume.toLocaleString(),
        style: `font-size:12px; color:${TEXT_SECONDARY};`,
      })
    );

    const indexBadge = el("span", {
      textContent: sv.priceIndex.toString(),
      style: `font-size:11px; font-weight:600; color:${indexColor};
        background:${indexBg}; padding:2px 8px; border-radius:10px; text-align:center;
        display:inline-block; min-width:36px;`,
    });
    row.appendChild(indexBadge);
    container.appendChild(row);
  });
}

function renderTicker() {
  if (!currentData) return;
  const ticker = document.getElementById("insights-ticker");
  if (!ticker) return;

  const insights: string[] = [];
  currentData.models.forEach((md) => {
    const last = md.monthlyData[md.monthlyData.length - 1];
    const segment = md.segment;
    const pct = last.pctOfMsrp;

    // Find rank in segment
    const segRate = currentData!.segmentComparisons.find((s) => s.bodyType === segment);
    const allSegRates = currentData!.segmentComparisons
      .slice()
      .sort((a, b) => a.monthlyDepreciationPct - b.monthlyDepreciationPct);
    const rank = segRate ? allSegRates.indexOf(segRate) + 1 : 0;

    insights.push(
      `${md.model.model} retains ${pct}% of MSRP at ${last.month} months` +
        (rank > 0 ? `, ${segment} segment ranks #${rank} in value retention` : "")
    );
  });

  // Rotate through insights
  const bestModel = currentData.models.reduce(
    (best, md) => {
      const last = md.monthlyData[md.monthlyData.length - 1];
      return last.pctOfMsrp > best.pct ? { name: `${md.model.make} ${md.model.model}`, pct: last.pctOfMsrp } : best;
    },
    { name: "", pct: 0 }
  );

  if (currentData.models.length > 1 && bestModel.name) {
    insights.push(
      `${bestModel.name} depreciates slowest among compared models, retaining ${bestModel.pct}% of MSRP`
    );
  }

  const combined = insights.join("  |  ");
  ticker.textContent = combined;

  // Animate scroll for long text
  ticker.style.animation = "none";
  void ticker.offsetHeight;
  if (combined.length > 100) {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes tickerScroll {
        0% { transform: translateX(0); }
        100% { transform: translateX(-50%); }
      }
    `;
    if (!document.getElementById("ticker-style")) {
      style.id = "ticker-style";
      document.head.appendChild(style);
    }
    ticker.innerHTML = `<span style="display:inline-block; animation:tickerScroll 20s linear infinite;">
      ${combined}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${combined}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>`;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function el(tag: string, props?: Record<string, unknown>): HTMLElement {
  const element = document.createElement(tag);
  if (props) {
    Object.entries(props).forEach(([k, v]) => {
      if (k === "style" && typeof v === "string") {
        element.style.cssText = v;
      } else if (k === "textContent") {
        element.textContent = v as string;
      } else if (k.startsWith("on") && typeof v === "function") {
        element.addEventListener(k.slice(2), v as EventListener);
      } else if (k === "value" || k === "selected" || k === "id") {
        (element as unknown as Record<string, unknown>)[k] = v;
      } else {
        element.setAttribute(k, String(v));
      }
    });
  }
  return element;
}

function pillStyle(active: boolean): string {
  return `padding:5px 12px; font-size:12px; border:1px solid ${active ? ACCENT : BORDER_COLOR};
    border-radius:16px; cursor:pointer; font-weight:500; transition:all 0.15s;
    background:${active ? ACCENT + "22" : "transparent"};
    color:${active ? ACCENT : TEXT_SECONDARY};`;
}

function selectStyle(compact = false): string {
  return `padding:${compact ? "4px 6px" : "5px 10px"}; font-size:12px;
    background:${BG_COLOR}; color:${TEXT_PRIMARY}; border:1px solid ${BORDER_COLOR};
    border-radius:6px; outline:none; cursor:pointer;
    ${compact ? "max-width:120px;" : ""}`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Resize Handler ─────────────────────────────────────────────────────────
let resizeTimer: ReturnType<typeof setTimeout>;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (currentData) renderAll();
  }, 100);
});

// ── Start ──────────────────────────────────────────────────────────────────
init();
