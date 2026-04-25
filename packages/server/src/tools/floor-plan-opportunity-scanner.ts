import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";

const BURN_RATE = 35; // $35/day per aged unit

export function registerFloorPlanOpportunityScanner(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "scan-floor-plan-opportunities",
    title: "Floor Plan Opportunity Scanner",
    description:
      "Scans a territory for dealers with high days-on-market inventory — a signal they may need floor plan financing. Calculates estimated floor plan burn per dealer ($35/day/unit), ranks dealers by opportunity size, and flags those with 90+ DOM inventory exceeding 30% of their lot.",
    htmlFileName: "floor-plan-opportunity-scanner",
    inputSchema: {
      type: "object",
      properties: {
        zip: {
          type: "string",
          description: "Territory center ZIP code",
        },
        radius: {
          type: "number",
          description: "Search radius in miles (default: 50)",
        },
        min_dom: {
          type: "number",
          description: "Minimum DOM threshold for aged inventory (default: 60)",
        },
      },
      required: ["zip"],
    },
    handler: async (args: { zip: string; radius?: number; min_dom?: number }) => {
      try {
        const radius = args.radius ?? 50;
        const minDom = args.min_dom ?? 60;

        // Step 1: Parallel — aged listings (burn calc) + total inventory counts (agedPct denominator)
        const [agedResult, totalResult] = await Promise.allSettled([
          client.searchActiveCars({
            zip: args.zip,
            radius,
            min_dom: minDom,
            rows: 50,
            facets: "dealer_id,make",
            stats: "price,miles,dom",
            sort_by: "dom",
            sort_order: "desc",
          } as any),
          client.searchActiveCars({ zip: args.zip, radius, rows: 1, facets: "dealer_id" } as any),
        ]);
        const agedInventory = agedResult.status === "fulfilled" ? agedResult.value : null;
        const totalInventory = totalResult.status === "fulfilled" ? totalResult.value : null;

        const listings: any[] = agedInventory?.listings ?? [];
        const facets = agedInventory?.facets ?? {};
        const numFound = agedInventory?.num_found ?? listings.length;

        // agedFacetMap: count of aged units per dealer (from aged query facets)
        const agedFacets: any[] = facets?.dealer_id ?? [];
        const agedFacetMap: Record<string, number> = {};
        for (const f of agedFacets) agedFacetMap[String(f.item)] = f.count ?? 0;

        // totalFacetMap: total lot size per dealer — correct denominator for agedPct
        const totalFacets: any[] = (totalInventory as any)?.facets?.dealer_id ?? [];
        const totalFacetMap: Record<string, number> = {};
        for (const f of totalFacets) totalFacetMap[String(f.item)] = f.count ?? 0;

        // Build per-dealer aggregates
        const dealerMap: Record<string, {
          name: string; city: string; state: string;
          doms: number[]; prices: number[];
          allMakes: Record<string, number>;
          agedMakes: Record<string, number>;
        }> = {};

        for (const l of listings) {
          const did = l.dealer?.id ?? "unknown";
          const name = l.dealer?.name ?? did;
          const city = l.dealer?.city ?? "";
          const state = l.dealer?.state ?? "";
          const dom = l.dom ?? l.days_on_market ?? 0;
          const price = l.price ?? 0;
          const make = l.build?.make ?? l.make ?? "Other";
          if (!dealerMap[did]) {
            dealerMap[did] = { name, city, state, doms: [], prices: [], allMakes: {}, agedMakes: {} };
          }
          dealerMap[did].doms.push(dom);
          if (price > 0) dealerMap[did].prices.push(price);
          dealerMap[did].allMakes[make] = (dealerMap[did].allMakes[make] ?? 0) + 1;
          // Track make breakdown for aged units only (for demand cross-reference)
          if (dom >= minDom) {
            dealerMap[did].agedMakes[make] = (dealerMap[did].agedMakes[make] ?? 0) + 1;
          }
        }

        const dealers = Object.entries(dealerMap).map(([did, d]) => {
          const agedDoms = d.doms.filter(dom => dom >= minDom);
          const veryAgedDoms = d.doms.filter(dom => dom >= 90);
          // Use facet counts for accuracy (not sample-limited d.doms.length)
          const agedUnits = agedFacetMap[did] ?? agedDoms.length;
          // totalFacetMap gives true lot size — correct denominator for agedPct
          const totalUnits = totalFacetMap[did] ?? agedUnits;
          const avgDom = d.doms.length > 0 ? Math.round(d.doms.reduce((s, v) => s + v, 0) / d.doms.length) : 0;
          const maxDom = d.doms.length > 0 ? Math.max(...d.doms) : 0;
          const avgPrice = d.prices.length > 0 ? Math.round(d.prices.reduce((s, v) => s + v, 0) / d.prices.length) : 0;
          const veryAgedUnits = veryAgedDoms.length;
          const agedPct = totalUnits > 0 ? Math.round((agedUnits / totalUnits) * 1000) / 10 : 0;
          const veryAgedPct = totalUnits > 0 ? Math.round((veryAgedUnits / totalUnits) * 1000) / 10 : 0;
          const topMakes = Object.entries(d.allMakes).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => m);

          return {
            dealerId: did,
            dealerName: d.name,
            city: d.city,
            state: d.state,
            totalUnits,
            agedUnits,
            veryAgedUnits,
            avgDom,
            maxDom,
            avgPrice,
            estimatedBurnPerDay: agedUnits * BURN_RATE,
            estimatedMonthlyBurn: agedUnits * BURN_RATE * 30,
            agedPct,
            veryAgedPct,
            hotProspect: veryAgedPct >= 30,
            topMakes,
            agedMakeBreakdown: d.agedMakes,
            domBuckets: [
              { label: `${minDom}-89d`, count: agedDoms.filter(dom => dom < 90).length, color: "#f59e0b" },
              { label: "90-119d", count: agedDoms.filter(dom => dom >= 90 && dom < 120).length, color: "#ef4444" },
              { label: "120+d", count: agedDoms.filter(dom => dom >= 120).length, color: "#7c3aed" },
            ],
          };
        }).filter(d => d.agedUnits > 0);

        dealers.sort((a, b) => b.estimatedMonthlyBurn - a.estimatedMonthlyBurn);

        // Step 2: Get sold demand context (Enterprise API — graceful failure)
        let marketDemand: Array<{ make: string; soldCount: number }> = [];
        try {
          const soldSummary = await client.getSoldSummary({
            ranking_dimensions: "make",
            ranking_measure: "sold_count",
            ranking_order: "desc",
            top_n: 10,
            inventory_type: "Used",
          } as any);
          marketDemand = (soldSummary?.rankings ?? []).slice(0, 5).map((r: any) => ({
            make: r.make ?? r.dimension_value ?? "",
            soldCount: r.sold_count ?? 0,
          }));
        } catch {
          // Enterprise API not available — omit demand data
        }

        // Build DOM distribution from all listings (aged only, 3-bucket — matches frontend)
        const allDoms: number[] = listings.map((l: any) => l.dom ?? l.days_on_market ?? 0).filter((d: number) => d > 0);
        const marketAvgDom = allDoms.length > 0 ? Math.round(allDoms.reduce((s, v) => s + v, 0) / allDoms.length) : 0;

        const domDistribution = [
          { label: `${minDom}-89d`, count: allDoms.filter(d => d >= minDom && d < 90).length, color: "#f59e0b" },
          { label: "90-119d", count: allDoms.filter(d => d >= 90 && d < 120).length, color: "#ef4444" },
          { label: "120+d", count: allDoms.filter(d => d >= 120).length, color: "#7c3aed" },
        ];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                territory: `${args.zip} / ${radius}mi`,
                totalListings: numFound,
                agedListings: listings.filter((l: any) => (l.dom ?? l.days_on_market ?? 0) >= minDom).length,
                dealers: dealers.slice(0, 20),
                marketDemand,
                domDistribution,
                marketAvgDom,
                totalEstMonthlyBurn: dealers.reduce((s, d) => s + d.estimatedMonthlyBurn, 0),
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
