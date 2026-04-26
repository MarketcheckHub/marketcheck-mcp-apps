/**
 * CORS proxy for standalone/embed mode.
 * Routes browser app requests to MarketCheck API with proper auth.
 * Supports both API key (/v2/) and OAuth Bearer token (/oauth/v2/).
 */
import type { Express } from "express";

const MC_API_HOST = "https://api.marketcheck.com";

interface ProxyRequest {
  _auth_mode: "api_key" | "oauth_token";
  _auth_value: string;
  [key: string]: any;
}

async function mcFetch(path: string, authMode: string, authValue: string, params: Record<string, any> = {}, opts?: { noV2Prefix?: boolean }): Promise<any> {
  const basePath = opts?.noV2Prefix ? "" : (authMode === "oauth_token" ? "/oauth/v2" : "/v2");
  const url = new URL(`${MC_API_HOST}${basePath}${path}`);

  if (authMode === "api_key") {
    url.searchParams.set("api_key", authValue);
  }
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = {};
  if (authMode === "oauth_token") {
    headers["Authorization"] = `Bearer ${authValue}`;
  }

  const res = await fetch(url.toString(), { headers });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MC API ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Tool Handlers — correct MarketCheck API endpoints ───────────────────

async function handleDecodeVin(auth: { mode: string; value: string }, args: any) {
  return mcFetch(`/decode/car/neovin/${args.vin}/specs`, auth.mode, auth.value);
}

async function handlePredictPrice(auth: { mode: string; value: string }, args: any) {
  return mcFetch("/predict/car/us/marketcheck_price/comparables", auth.mode, auth.value, {
    vin: args.vin, miles: args.miles, dealer_type: args.dealer_type,
    zip: args.zip, is_certified: args.is_certified,
  });
}

async function handleSearchActive(auth: { mode: string; value: string }, args: any) {
  return mcFetch("/search/car/active", auth.mode, auth.value, args);
}

async function handleSearchPast90(auth: { mode: string; value: string }, args: any) {
  return mcFetch("/search/car/recents", auth.mode, auth.value, args);
}

async function handleCarHistory(auth: { mode: string; value: string }, args: any) {
  return mcFetch(`/history/car/${args.vin}`, auth.mode, auth.value, { sort_order: args.sort_order });
}

async function handleSoldSummary(auth: { mode: string; value: string }, args: any) {
  return mcFetch("/api/v1/sold-vehicles/summary", auth.mode, auth.value, args, { noV2Prefix: true });
}

async function handleIncentives(auth: { mode: string; value: string }, args: any) {
  // Map legacy 'oem' param to 'make' for the correct endpoint
  const params = { ...args };
  if (params.oem && !params.make) { params.make = params.oem; delete params.oem; }
  // Incentive data is at MSA/state level — ZIP yields 0 results, so omit it
  delete params.zip;
  if (!params.rows) params.rows = 50;
  return mcFetch("/search/car/incentive/oem", auth.mode, auth.value, params);
}

/** Transform OEM incentive API listings into the app-friendly format */
function transformIncentiveListings(apiResponse: any): any[] {
  const listings = apiResponse?.listings || [];
  // Map API offer_type to both app formats
  const typeMap: Record<string, { short: string; long: string }> = {
    cash: { short: "cashback", long: "CASH_BACK" },
    finance: { short: "apr", long: "LOW_APR" },
    lease: { short: "lease", long: "LEASE_SPECIAL" },
  };
  return listings.map((listing: any) => {
    const o = listing.offer || {};
    const v = (o.vehicles || [])[0] || {};
    const amt = (o.amounts || [])[0] || {};
    const mapped = typeMap[o.offer_type] || { short: o.offer_type || "cashback", long: "CASH_BACK" };
    const amount = mapped.short === "cashback" ? (o.cashback_amount || 0)
      : mapped.short === "apr" ? (amt.apr || 0) : (amt.monthly || 0);
    const amountDisplay = mapped.short === "cashback" ? `$${amount.toLocaleString()} Cash Back`
      : mapped.short === "apr" ? `${amount}% APR / ${amt.term || 0}mo`
      : `$${amount}/mo / ${amt.term || 0}mo`;
    return {
      id: listing.id || "",
      make: v.make || "",
      model: v.model || "",
      type: mapped.long,        // OEM incentives explorer format
      offerType: mapped.short,  // incentive-deal-finder format
      title: (o.titles?.[0] || o.oem_program_name || `${v.make} ${o.offer_type || "offer"}`),
      description: (o.offers?.[0] || "").substring(0, 300),
      amount,
      amountDisplay,
      term: amt.term || 0,
      eligibleModels: o.vehicles?.map((ve: any) => ve.model).filter(Boolean) || [],
      expirationDate: o.valid_through || "",
      dueAtSigning: o.due_at_signing,
      msrp: o.msrp,
      stackable: false,
      finePrint: (o.disclaimers?.[0] || "").substring(0, 300),
      region: listing.state || listing.city || "National",
    };
  });
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
      include_dealer_object: true, include_build_object: true, fetch_all_photos: true,
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
    if (args.country === "UK") {
      const [active, recent] = await Promise.all([
        mcFetch("/search/car/uk/active", auth.mode, auth.value, { rows: 0, stats: "price,miles", ...(args.make ? { make: args.make } : {}) }),
        mcFetch("/search/car/uk/recents", auth.mode, auth.value, { rows: 0, stats: "price,miles", ...(args.make ? { make: args.make } : {}) }).catch(() => null),
      ]);
      return { uk: true, active, recent };
    }
    // Geography comes as 2-letter state abbreviation or "national"
    const stateParam = args.geography && args.geography !== "national" && args.geography.length <= 2
      ? { state: args.geography }
      : {};
    const [summary, segments] = await Promise.all([
      handleSoldSummary(auth, {
        ranking_dimensions: "make", ranking_measure: "sold_count",
        inventory_type: "Used", top_n: 25, ...stateParam,
      }),
      handleSoldSummary(auth, {
        ranking_dimensions: "body_type", ranking_measure: "sold_count",
        inventory_type: "Used", ...stateParam,
      }),
    ]);
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
    const raw = await handleIncentives(auth, { oem: args.make, zip: args.zip, model: args.model, rows: 50 });
    const incentives = transformIncentiveListings(raw);
    let compareIncentives: any[] = [];
    if (args.compareMakes?.length) {
      compareIncentives = await Promise.all(
        args.compareMakes.map(async (make: string) => {
          const rawC = await handleIncentives(auth, { oem: make, zip: args.zip, rows: 50 });
          return { make, incentives: transformIncentiveListings(rawC) };
        })
      );
    }
    // Return in the format the app expects: {results: [{make, incentives}], zip}
    const results = [{ make: args.make, incentives }];
    for (const ci of compareIncentives) {
      results.push({ make: ci.make, incentives: ci.incentives });
    }
    return { results, zip: args.zip || "" };
  },

  // ── New App Composite Handlers ─────────────────────────────────────────

  "generate-vin-market-report": async (auth, args) => {
    const decode = await handleDecodeVin(auth, args);
    const [retail, wholesale, history] = await Promise.all([
      handlePredictPrice(auth, { ...args, dealer_type: "franchise" }).catch(() => ({})),
      handlePredictPrice(auth, { ...args, dealer_type: "independent" }).catch(() => ({})),
      handleCarHistory(auth, args).catch(() => ({ listings: [] })),
    ]);
    const make = decode?.make; const model = decode?.model;
    const yearRange = decode?.year ? `${decode.year - 1}-${decode.year + 1}` : undefined;
    const [activeComps, soldComps, soldSummary] = await Promise.all([
      handleSearchActive(auth, { make, model, year: yearRange, zip: args.zip, radius: 100, stats: "price,miles,dom", rows: 10 }),
      handleSearchPast90(auth, { make, model, year: yearRange, zip: args.zip, radius: 100, stats: "price", rows: 10 }).catch(() => ({ listings: [], num_found: 0 })),
      handleSoldSummary(auth, { make, model, ranking_dimensions: "make,model", ranking_measure: "sold_count,average_sale_price" }).catch(() => ({})),
    ]);
    let incentives = null;
    if (decode?.year && decode.year >= new Date().getFullYear() - 1) {
      try { incentives = await handleIncentives(auth, { oem: make, zip: args.zip }); } catch {}
    }
    return { decode, retail, wholesale, history, activeComps, soldComps, soldSummary, incentives };
  },

  "trace-vin-history": async (auth, args) => {
    const decode = await handleDecodeVin(auth, args);
    const [history, prediction] = await Promise.all([
      handleCarHistory(auth, { vin: args.vin, sort_order: "asc" }),
      handlePredictPrice(auth, { vin: args.vin, miles: args.miles, dealer_type: "franchise", zip: args.zip }),
    ]);
    return { decode, history, prediction };
  },

  "generate-pricing-report": async (auth, args) => {
    const decode = await handleDecodeVin(auth, args);
    const [prediction, activeComps, soldComps] = await Promise.all([
      handlePredictPrice(auth, { ...args, dealer_type: "franchise" }),
      handleSearchActive(auth, { make: decode?.make, model: decode?.model, zip: args.zip, radius: 75, stats: "price,miles,dom", rows: 10 }),
      handleSearchPast90(auth, { make: decode?.make, model: decode?.model, zip: args.zip, radius: 100, stats: "price", rows: 10 }),
    ]);
    return { decode, prediction, activeComps, soldComps };
  },

  "find-incentive-deals": async (auth, args) => {
    const makes = (args.makes ?? "Toyota,Honda,Ford,Chevrolet,Hyundai,Kia,Nissan,BMW,Mercedes-Benz,Volkswagen").split(",");
    const allOffers: any[] = [];
    await Promise.all(
      makes.map(async (make: string) => {
        try {
          const raw = await handleIncentives(auth, { oem: make.trim(), zip: args.zip, rows: 50 });
          const offers = transformIncentiveListings(raw);
          allOffers.push(...offers);
        } catch {}
      })
    );
    return { offers: allOffers };
  },

  "route-wholesale-vehicles": async (auth, args) => {
    const vins = (args.vins ?? "").split(",").map((v: string) => v.trim()).filter(Boolean);
    const results = await Promise.all(
      vins.map(async (vin: string) => {
        const [decode, prediction] = await Promise.all([
          handleDecodeVin(auth, { vin }),
          handlePredictPrice(auth, { vin, dealer_type: "franchise", zip: args.zip }),
        ]);
        return { vin, decode, prediction };
      })
    );
    return { results };
  },

  "score-dealer-fit": async (auth, args) => {
    const vins = (args.vins ?? "").split(",").map((v: string) => v.trim()).filter(Boolean);
    const results = await Promise.all(
      vins.map(async (vin: string) => {
        const [decode, prediction] = await Promise.all([
          handleDecodeVin(auth, { vin }),
          handlePredictPrice(auth, { vin, dealer_type: "franchise", zip: args.zip }),
        ]);
        return { vin, decode, prediction };
      })
    );
    return { dealerId: args.dealer_id, results };
  },

  "search-uk-cars": async (auth, args) => {
    const active = await mcFetch("/search/car/uk/active", auth.mode, auth.value, {
      make: args.make, model: args.model, year: args.year,
      postal_code: args.postal_code, radius: args.radius,
      price_range: args.price_range, miles_range: args.miles_range,
      rows: args.rows ?? 25, stats: "price,miles", start: args.start,
    });
    let recent = null;
    try { recent = await mcFetch("/search/car/uk/recents", auth.mode, auth.value, { make: args.make, model: args.model, rows: 10, stats: "price" }); } catch {}
    return { active, recent };
  },

  "get-uk-market-trends": async (auth, args) => {
    const active = await mcFetch("/search/car/uk/active", auth.mode, auth.value, {
      rows: 0, stats: "price,miles",
      ...(args.make ? { make: args.make } : {}),
    });
    const recent = await mcFetch("/search/car/uk/recents", auth.mode, auth.value, {
      rows: 0, stats: "price,miles",
      ...(args.make ? { make: args.make } : {}),
    });
    return { active, recent };
  },

  "evaluate-loan-application": async (auth, args) => {
    const decode = await handleDecodeVin(auth, args);
    const [retail, wholesale, history, soldComps] = await Promise.all([
      handlePredictPrice(auth, { ...args, dealer_type: "franchise" }),
      handlePredictPrice(auth, { ...args, dealer_type: "independent" }),
      handleCarHistory(auth, { vin: args.vin, sort_order: "asc" }),
      handleSearchPast90(auth, { make: decode?.make, model: decode?.model, zip: args.zip, radius: 100, rows: 8, stats: "price" }),
    ]);
    return { decode, retail, wholesale, history, soldComps };
  },

  "benchmark-insurance-premiums": async (auth, args) => {
    const [byBodyType, byFuelType, byState] = await Promise.all([
      handleSoldSummary(auth, { ranking_dimensions: "body_type", ranking_measure: "sold_count,average_sale_price", inventory_type: "Used" }),
      handleSoldSummary(auth, { ranking_dimensions: "body_type,fuel_type_category", ranking_measure: "sold_count,average_sale_price", inventory_type: "Used" }),
      handleSoldSummary(auth, { ranking_dimensions: "state", ranking_measure: "sold_count,average_sale_price", inventory_type: "Used", top_n: 15 }),
    ]);
    return { byBodyType, byFuelType, byState };
  },

  "evaluate-incentive-deal": async (auth, args) => {
    const decode = await handleDecodeVin(auth, args);
    const [prediction, rawIncentives, activeComps] = await Promise.all([
      handlePredictPrice(auth, { ...args, dealer_type: "franchise" }),
      handleIncentives(auth, { oem: decode?.make, zip: args.zip, model: decode?.model, rows: 50 }),
      handleSearchActive(auth, { make: decode?.make, model: decode?.model, zip: args.zip, radius: 75, rows: 5, stats: "price" }),
    ]);
    const incentives = transformIncentiveListings(rawIncentives);
    return { decode, prediction, incentives, activeComps };
  },

  "generate-market-briefing": async (auth, args) => {
    const [byMake, byBodyType, byState] = await Promise.all([
      handleSoldSummary(auth, { ranking_dimensions: "make", ranking_measure: "sold_count,average_sale_price", ranking_order: "desc", top_n: 15, inventory_type: "Used" }),
      handleSoldSummary(auth, { ranking_dimensions: "body_type", ranking_measure: "sold_count,average_sale_price", inventory_type: "Used" }),
      handleSoldSummary(auth, { ranking_dimensions: "state", ranking_measure: "average_sale_price", ranking_order: "desc", top_n: 10, inventory_type: "Used" }),
    ]);
    return { byMake, byBodyType, byState };
  },

  "find-auction-arbitrage": async (auth, args) => {
    const vins = (args.vins ?? "").split(/[\s,]+/).map((v: string) => v.trim()).filter(Boolean);
    const results = await Promise.all(
      vins.map(async (vin: string) => {
        const decode = await handleDecodeVin(auth, { vin }).catch(() => null);
        const history = await handleCarHistory(auth, { vin }).catch(() => null);
        const lastMiles = Array.isArray(history) ? (history.find((h: any) => h?.miles)?.miles) : undefined;
        const miles = args.miles ?? lastMiles ?? 50000;
        const [retail, wholesale] = await Promise.all([
          handlePredictPrice(auth, { vin, miles, dealer_type: "franchise", zip: args.zip }).catch(() => null),
          handlePredictPrice(auth, { vin, miles, dealer_type: "independent", zip: args.zip }).catch(() => null),
        ]);
        return { vin, decode, retail, wholesale };
      })
    );
    return { results };
  },

  "scan-uk-lot-pricing": async (auth, args) => {
    const inventory = await mcFetch("/search/car/uk/active", auth.mode, auth.value, {
      dealer_id: args.dealer_id, rows: 30, stats: "price,miles",
    });
    const recent = await mcFetch("/search/car/uk/recents", auth.mode, auth.value, {
      make: args.make, rows: 10, stats: "price",
    });
    return { inventory, recent };
  },

  "analyze-dealer-conquest": async (auth, args) => {
    const myInventory = await handleSearchActive(auth, { dealer_id: args.dealer_id, rows: 50, facets: "make,model,body_type" });
    const marketInventory = await handleSearchActive(auth, { zip: args.zip, radius: args.radius ?? 50, rows: 0, facets: "make,model,body_type" });
    const demand = await handleSoldSummary(auth, { state: args.state, ranking_dimensions: "make,model", ranking_measure: "sold_count", ranking_order: "desc", top_n: 20 });
    return { myInventory, marketInventory, demand };
  },

  "detect-market-anomalies": async (auth, args) => {
    const results = await handleSearchActive(auth, {
      make: args.make, model: args.model, year: args.year, state: args.state,
      rows: 50, stats: "price,miles,dom", sort_by: "price", sort_order: "asc",
    });
    return { results };
  },

  "stress-test-portfolio": async (auth, args) => {
    const vins = (args.vins ?? "").split(",").map((v: string) => v.trim()).filter(Boolean);
    const results = await Promise.all(
      vins.map(async (vin: string) => {
        const [decode, prediction] = await Promise.all([
          handleDecodeVin(auth, { vin }),
          handlePredictPrice(auth, { vin, dealer_type: "franchise", zip: args.zip }),
        ]);
        return { vin, decode, prediction };
      })
    );
    return { results };
  },

  "value-rental-fleet": async (auth, args) => {
    const vins = (args.vins ?? "").split(",").map((v: string) => v.trim()).filter(Boolean);
    const results = await Promise.all(
      vins.map(async (vin: string) => {
        const [decode, prediction] = await Promise.all([
          handleDecodeVin(auth, { vin }),
          handlePredictPrice(auth, { vin, dealer_type: "franchise", zip: args.zip }),
        ]);
        return { vin, decode, prediction };
      })
    );
    return { results };
  },

  "manage-fleet-lifecycle": async (auth, args) => {
    const vins = (args.vins ?? "").split(",").map((v: string) => v.trim()).filter(Boolean);
    const results = await Promise.all(
      vins.map(async (vin: string) => {
        const [decode, prediction] = await Promise.all([
          handleDecodeVin(auth, { vin }),
          handlePredictPrice(auth, { vin, dealer_type: "franchise", zip: args.zip }),
        ]);
        return { vin, decode, prediction };
      })
    );
    const replacements = await handleSearchActive(auth, { zip: args.zip, radius: 50, rows: 10, sort_by: "price", sort_order: "asc" });
    return { results, replacements };
  },
};

// Generic passthrough for tools that just need a single API call
const passthroughTools = [
  "group-operations-center", "inventory-balancer", "location-benchmarking",
  "watchlist-monitor", "earnings-signal-dashboard", "dealer-group-scorecard",
  "portfolio-risk-monitor", "ev-collateral-risk", "brand-command-center",
  "regional-demand-allocator", "ev-market-monitor", "auction-lane-planner",
  "territory-pipeline", "depreciation-analyzer", "market-trends-dashboard",
  // New tools covered by compositeHandlers above (listed for reference only)
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
