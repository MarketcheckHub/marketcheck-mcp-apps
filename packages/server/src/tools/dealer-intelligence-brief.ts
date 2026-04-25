import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";

const SLICE_COLORS = ["#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#e9d5ff"];
const BURN_RATE = 35; // $35/day per aged unit

export function registerDealerIntelligenceBrief(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "dealer-intelligence-brief",
    title: "Dealer Intelligence Brief",
    description:
      "One-page dealer intelligence brief for sales call prep. Pulls a dealer's active inventory to analyze size, brand mix, body type mix, pricing patterns, aging health, and estimated floor plan exposure. Everything a lender sales rep needs before walking in the door.",
    htmlFileName: "dealer-intelligence-brief",
    inputSchema: {
      type: "object",
      properties: {
        dealer_id: {
          type: "string",
          description: "Target dealer's MarketCheck ID",
        },
        zip: {
          type: "string",
          description: "Dealer ZIP code for market context (competitor pricing)",
        },
        state: {
          type: "string",
          description: "2-letter state code for demand comparison (Enterprise API)",
        },
      },
      required: ["dealer_id"],
    },
    handler: async (args: { dealer_id: string; zip?: string; state?: string }) => {
      try {
        // Step 1: Fetch dealer full active inventory with stats and facets (neutral sort)
        const inventory = await client.searchActiveCars({
          dealer_id: args.dealer_id,
          rows: 50,
          facets: "make,body_type",
          stats: "price,miles,dom",
        } as any);

        const listings: any[] = inventory?.listings ?? [];
        const facets = inventory?.facets ?? {};
        const numFound: number = inventory?.num_found ?? listings.length;

        // Dealer info from first listing
        const firstListing = listings[0];
        const dealerName = firstListing?.dealer?.name ?? "Unknown Dealer";
        const dealerCity = firstListing?.dealer?.city ?? "";
        const dealerState = firstListing?.dealer?.state ?? (args.state ?? "");
        const dealerType = firstListing?.dealer?.franchise_id ? "Franchise" : "Independent";

        // Step 2: Parallel — exact aged count + sold demand + competitor inventory
        const [agedResult, soldResult, compResult] = await Promise.allSettled([
          client.searchActiveCars({ dealer_id: args.dealer_id, min_dom: 60, rows: 1 } as any), // num_found = exact aged count
          args.state
            ? client.getSoldSummary({
                ranking_dimensions: "make",
                ranking_measure: "sold_count",
                ranking_order: "desc",
                top_n: 10,
                state: args.state,
                inventory_type: "Used",
              } as any)
            : Promise.resolve(null),
          args.zip
            ? client.searchActiveCars({
                zip: args.zip,
                radius: 25,
                rows: 50,
                stats: "price,miles,dom",
              } as any)
            : Promise.resolve(null),
        ]);

        const agedInventory = agedResult.status === "fulfilled" ? agedResult.value : null;

        // Aggregate stats — use API stats object (covers full inventory, not just 50 rows)
        const apiStats = (inventory as any)?.stats ?? {};
        const doms = listings.map((l: any) => l.dom ?? l.days_on_market ?? 0);
        const prices = listings.map((l: any) => l.price ?? 0).filter((p: number) => p > 0);
        const avgDom = Math.round(apiStats?.dom?.mean ?? apiStats?.dom?.avg ?? 0) ||
          (doms.length > 0 ? Math.round(doms.reduce((s: number, v: number) => s + v, 0) / doms.length) : 0);
        const avgPrice = Math.round(apiStats?.price?.mean ?? apiStats?.price?.avg ?? 0) ||
          (prices.length > 0 ? Math.round(prices.reduce((s: number, v: number) => s + v, 0) / prices.length) : 0);
        // Accurate aged count from dedicated min_dom:60 query — no sampling bias
        const agedCount = (agedInventory as any)?.num_found ?? 0;
        const agedPct = numFound > 0 ? Math.round((agedCount / numFound) * 100) : 0;
        const estFloorPlanPerMonth = agedCount * BURN_RATE * 30;

        // Brand mix from facets
        const makeFacets: any[] = facets?.make ?? [];
        const totalMakeCount = makeFacets.reduce((s: number, f: any) => s + (f.count ?? 0), 0) || 1;
        const topMakes = makeFacets.slice(0, 4);
        const otherMakeCount = makeFacets.slice(4).reduce((s: number, f: any) => s + (f.count ?? 0), 0);
        const brandMix = [
          ...topMakes.map((f: any, i: number) => ({
            make: f.item ?? "Other",
            count: f.count ?? 0,
            pct: Math.round(((f.count ?? 0) / totalMakeCount) * 100),
            color: SLICE_COLORS[i],
          })),
          ...(otherMakeCount > 0 ? [{ make: "Other", count: otherMakeCount, pct: Math.round((otherMakeCount / totalMakeCount) * 100), color: SLICE_COLORS[4] }] : []),
        ];

        // Body type mix from facets
        const bodyFacets: any[] = facets?.body_type ?? [];
        const totalBodyCount = bodyFacets.reduce((s: number, f: any) => s + (f.count ?? 0), 0) || 1;
        const bodyTypeMix = bodyFacets.slice(0, 5).map((f: any) => ({
          bodyType: f.item ?? "Other",
          count: f.count ?? 0,
          pct: Math.round(((f.count ?? 0) / totalBodyCount) * 100),
        }));
        const soldSummary = soldResult.status === "fulfilled" ? soldResult.value : null;
        const competitors = compResult.status === "fulfilled" ? compResult.value : null;

        // Competitor market avg price
        const compListings: any[] = (competitors as any)?.listings ?? [];
        const compPrices = compListings.map((l: any) => l.price ?? 0).filter((p: number) => p > 0);
        const hasMarketData = compPrices.length > 0;
        const marketAvgPrice = hasMarketData
          ? Math.round(compPrices.reduce((s: number, v: number) => s + v, 0) / compPrices.length)
          : avgPrice;

        // Demand data
        const hasSoldData = !!(soldSummary as any)?.rankings?.length;
        const topDemandMake = hasSoldData ? ((soldSummary as any).rankings[0]?.dimension_value ?? (soldSummary as any).rankings[0]?.make ?? "") : "";

        // Generate talking points
        const talkingPoints: string[] = [];
        if (agedPct >= 20) talkingPoints.push(`${agedPct}% aged inventory = floor plan pain point`);
        const topBodyType = bodyTypeMix[0]?.bodyType ?? "";
        if (topBodyType) talkingPoints.push(`Heavy ${topBodyType.toLowerCase()} mix — high floor plan exposure`);
        const priceDiff = avgPrice - marketAvgPrice;
        if (priceDiff > 1000) talkingPoints.push(`Pricing ${Math.round(priceDiff / 500) * 500 / 1000}K above market — may slow turns`);
        else if (priceDiff < -500) talkingPoints.push("Priced competitively vs. market — volume opportunity");
        if (hasSoldData && topDemandMake) talkingPoints.push(`${topDemandMake} leads regional demand — aligns with inventory`);
        if (talkingPoints.length < 3) talkingPoints.push("No current floor plan provider detected");
        if (talkingPoints.length < 4 && brandMix.length > 0) talkingPoints.push(`${numFound} active units across ${Math.min(brandMix.length, 5)} brands`);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                dealerName,
                dealerCity,
                dealerState,
                dealerType,
                inventoryCount: numFound,
                avgDom,
                agedCount,
                agedPct,
                avgPrice,
                marketAvgPrice,
                hasMarketData,
                estFloorPlanPerMonth,
                brandMix,
                bodyTypeMix,
                talkingPoints,
                hasSoldData,
                topDemandMake,
              }),
            },
          ],
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: e.message }) }],
        };
      }
    },
  });
}
