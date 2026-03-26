/**
 * CORS proxy for standalone/embed mode.
 * Routes browser app requests to MarketCheck API with proper auth.
 * Supports both API key (/v2/) and OAuth Bearer token (/oauth/v2/).
 */
import type { Express } from "express";

const MC_API_HOST = "https://mc-api.marketcheck.com";

interface ProxyRequest {
  _auth_mode: "api_key" | "oauth_token";
  _auth_value: string;
  [key: string]: any;
}

async function mcFetch(path: string, authMode: string, authValue: string, params: Record<string, any> = {}, method: "GET" | "POST" = "GET", body?: any): Promise<any> {
  const basePath = authMode === "oauth_token" ? "/oauth/v2" : "/v2";
  const url = new URL(`${MC_API_HOST}${basePath}${path}`);

  if (authMode === "api_key") {
    url.searchParams.set("api_key", authValue);
  }
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authMode === "oauth_token") {
    headers["Authorization"] = `Bearer ${authValue}`;
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MC API ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Tool Handlers (reuse server tool logic via direct API calls) ────────

async function handleDecodeVin(auth: { mode: string; value: string }, args: any) {
  return mcFetch("/decode/neovin", auth.mode, auth.value, {}, "POST", { vin: args.vin });
}

async function handlePredictPrice(auth: { mode: string; value: string }, args: any) {
  return mcFetch("/pricing/predict", auth.mode, auth.value, {
    vin: args.vin, miles: args.miles, dealer_type: args.dealer_type,
    zip: args.zip, is_certified: args.is_certified,
  });
}

async function handleSearchActive(auth: { mode: string; value: string }, args: any) {
  return mcFetch("/search/car/active", auth.mode, auth.value, args);
}

async function handleSearchPast90(auth: { mode: string; value: string }, args: any) {
  return mcFetch("/search/car/past90", auth.mode, auth.value, args);
}

async function handleCarHistory(auth: { mode: string; value: string }, args: any) {
  return mcFetch("/history/listings", auth.mode, auth.value, { vin: args.vin, sort_order: args.sort_order });
}

async function handleSoldSummary(auth: { mode: string; value: string }, args: any) {
  return mcFetch("/api/v1/sold-vehicles/summary", auth.mode, auth.value, args);
}

async function handleIncentives(auth: { mode: string; value: string }, args: any) {
  return mcFetch("/incentives/by-zip", auth.mode, auth.value, args);
}

// ── Composite Tool Handlers (orchestrate multiple API calls) ────────────

const compositeHandlers: Record<string, (auth: { mode: string; value: string }, args: any) => Promise<any>> = {

  "estimate-trade-in": async (auth, args) => {
    const decode = await handleDecodeVin(auth, args);
    const [retail, wholesale] = await Promise.all([
      handlePredictPrice(auth, { ...args, dealer_type: "franchise" }),
      handlePredictPrice(auth, { ...args, dealer_type: "independent" }),
    ]);
    const soldComps = await handleSearchPast90(auth, {
      make: decode?.make, model: decode?.model,
      year: decode?.year ? `${decode.year - 1}-${decode.year + 1}` : undefined,
      zip: args.zip, radius: 100, rows: 10, stats: "price",
    });
    return { decode, retail, wholesale, soldComps };
  },

  "evaluate-deal": async (auth, args) => {
    const decode = await handleDecodeVin(auth, args);
    const [prediction, history] = await Promise.all([
      handlePredictPrice(auth, { ...args, dealer_type: "franchise" }),
      handleCarHistory(auth, args),
    ]);
    const activeComps = await handleSearchActive(auth, {
      make: decode?.make, model: decode?.model,
      year: decode?.year ? `${decode.year - 1}-${decode.year + 1}` : undefined,
      zip: args.zip, radius: 75, stats: "price,miles,dom", rows: 10,
      sort_by: "price", sort_order: "asc",
    });
    return { decode, prediction, activeComps, history };
  },

  "search-cars": async (auth, args) => {
    return handleSearchActive(auth, {
      ...args, stats: "price,miles", facets: "make,model,trim,body_type",
      include_dealer_object: true,
    });
  },

  "compare-cars": async (auth, args) => {
    const vins: string[] = args.vins ?? [];
    const results = await Promise.all(vins.map(async (vin: string) => {
      const [decode, price] = await Promise.all([
        handleDecodeVin(auth, { vin }),
        handlePredictPrice(auth, { vin, dealer_type: "franchise", zip: args.zip }),
      ]);
      return { vin, decode, price };
    }));
    return { comparisons: results };
  },

  "appraiser-workbench": async (auth, args) => {
    const decode = await handleDecodeVin(auth, args);
    const [retail, wholesale, history] = await Promise.all([
      handlePredictPrice(auth, { ...args, dealer_type: "franchise" }),
      handlePredictPrice(auth, { ...args, dealer_type: "independent" }),
      handleCarHistory(auth, { vin: args.vin, sort_order: "asc" }),
    ]);
    const [activeComps, soldComps] = await Promise.all([
      handleSearchActive(auth, { make: decode?.make, model: decode?.model, zip: args.zip, radius: 100, stats: "price,miles,dom", rows: 25 }),
      handleSearchPast90(auth, { make: decode?.make, model: decode?.model, zip: args.zip, radius: 100, stats: "price", rows: 25 }),
    ]);
    return { decode, retail, wholesale, activeComps, soldComps, history };
  },

  "claims-valuation": async (auth, args) => {
    const decode = await handleDecodeVin(auth, args);
    const [fmvResult, soldComps, regionalData, replacements] = await Promise.all([
      handlePredictPrice(auth, { ...args, dealer_type: "franchise" }),
      handleSearchPast90(auth, { make: decode?.make, model: decode?.model, zip: args.zip, radius: 100, rows: 10, stats: "price" }),
      handleSoldSummary(auth, { make: decode?.make, model: decode?.model, summary_by: "state" }),
      handleSearchActive(auth, { make: decode?.make, model: decode?.model, zip: args.zip, radius: 50, rows: 5, sort_by: "price", sort_order: "asc" }),
    ]);
    return { decode, fmvResult, soldComps, regionalData, replacements };
  },

  "get-market-index": async (auth, args) => {
    const summary = await handleSoldSummary(auth, {
      ranking_dimensions: "make", ranking_measure: "sold_count,average_sale_price",
      inventory_type: "Used", top_n: 25, ...(args.state ? { state: args.state } : {}),
    });
    const segments = await handleSoldSummary(auth, {
      ranking_dimensions: "body_type", ranking_measure: "sold_count,average_sale_price",
      inventory_type: "Used", ...(args.state ? { state: args.state } : {}),
    });
    return { summary, segments };
  },

  "scan-lot-pricing": async (auth, args) => {
    const inventory = await handleSearchActive(auth, { dealer_id: args.dealerId, rows: 50, stats: "price,miles,dom", facets: "body_type,make" });
    const hotList = await handleSoldSummary(auth, { state: args.state, ranking_dimensions: "make,model", ranking_measure: "sold_count", ranking_order: "desc", top_n: 10 });
    return { inventory, hotList };
  },

  "stocking-intelligence": async (auth, args) => {
    const [demandData, segmentDemand] = await Promise.all([
      handleSoldSummary(auth, { state: args.state, ranking_dimensions: "make,model", ranking_measure: "sold_count", ranking_order: "desc", top_n: 30 }),
      handleSoldSummary(auth, { state: args.state, ranking_dimensions: "body_type", ranking_measure: "sold_count,average_sale_price,average_days_on_market" }),
    ]);
    return { demandData, segmentDemand };
  },

  "comparables-explorer": async (auth, args) => {
    let decode = null;
    if (args.vin) decode = await handleDecodeVin(auth, args);
    const make = args.make ?? decode?.make;
    const model = args.model ?? decode?.model;
    const [activeComps, soldComps] = await Promise.all([
      handleSearchActive(auth, { make, model, year: args.year, zip: args.zip, radius: args.radius ?? 100, stats: "price,miles,dom", rows: 50 }),
      handleSearchPast90(auth, { make, model, year: args.year, zip: args.zip, radius: args.radius ?? 100, stats: "price", rows: 25 }),
    ]);
    const prediction = args.vin ? await handlePredictPrice(auth, { vin: args.vin, zip: args.zip }) : null;
    return { decode, activeComps, soldComps, prediction };
  },

  "oem-incentives-explorer": async (auth, args) => {
    const incentives = await handleIncentives(auth, { oem: args.make, zip: args.zip, model: args.model });
    let compareIncentives: any[] = [];
    if (args.compareMakes?.length) {
      compareIncentives = await Promise.all(
        args.compareMakes.map(async (make: string) => {
          const data = await handleIncentives(auth, { oem: make, zip: args.zip });
          return { make, data };
        })
      );
    }
    return { make: args.make, incentives, compareIncentives };
  },
};

// Generic passthrough for tools that just need a single API call
const passthroughTools = [
  "group-operations-center", "inventory-balancer", "location-benchmarking",
  "watchlist-monitor", "earnings-signal-dashboard", "dealer-group-scorecard",
  "portfolio-risk-monitor", "ev-collateral-risk", "brand-command-center",
  "regional-demand-allocator", "ev-market-monitor", "auction-lane-planner",
  "territory-pipeline", "depreciation-analyzer", "market-trends-dashboard",
];

// ── Register Routes ─────────────────────────────────────────────────────

export function registerProxy(expressApp: Express) {
  expressApp.post("/api/proxy/:toolName", async (req, res) => {
    try {
      const { _auth_mode, _auth_value, ...args } = req.body as ProxyRequest;

      if (!_auth_mode || !_auth_value) {
        res.status(401).json({ error: "Missing authentication" });
        return;
      }

      const auth = { mode: _auth_mode, value: _auth_value };
      const toolName = req.params.toolName;

      if (compositeHandlers[toolName]) {
        const result = await compositeHandlers[toolName](auth, args);
        res.json(result);
      } else if (passthroughTools.includes(toolName)) {
        // For complex tools without a specific proxy handler, return an error
        // suggesting the user use the MCP server mode
        res.status(501).json({
          error: "This tool requires the MCP server. Run: npm run serve",
          tool: toolName,
        });
      } else {
        res.status(404).json({ error: `Unknown tool: ${toolName}` });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // OAuth token generation convenience endpoint
  expressApp.post("/api/auth/token", async (req, res) => {
    try {
      const { client_id, client_secret } = req.body;
      if (!client_id || !client_secret) {
        res.status(400).json({ error: "client_id and client_secret required" });
        return;
      }
      const r = await fetch("https://api.marketcheck.com/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant_type: "client_credentials", client_id, client_secret }),
      });
      const data = await r.json();
      res.status(r.status).json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
