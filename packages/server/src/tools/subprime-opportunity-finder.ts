import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";

const CURRENT_YEAR = new Date().getFullYear();

export function registerSubprimeOpportunityFinder(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "subprime-opportunity-finder",
    title: "Subprime Opportunity Finder",
    description:
      "Identifies dealers likely serving subprime buyers by analyzing inventory patterns: high percentage of older vehicles (5+ years), lower price points, independent dealer type, and high DOM. These signals indicate dealers who may need subprime lending products or BHPH financing partnerships.",
    htmlFileName: "subprime-opportunity-finder",
    inputSchema: {
      type: "object",
      properties: {
        zip: {
          type: "string",
          description: "Target market ZIP code",
        },
        radius: {
          type: "number",
          description: "Search radius in miles (default: 50)",
        },
        state: {
          type: "string",
          description: "2-letter state code for sold demand context (Enterprise API)",
        },
      },
      required: ["zip"],
    },
    handler: async (args: { zip: string; radius?: number; state?: string }) => {
      try {
        const radius = args.radius ?? 50;
        const cutoffYear = CURRENT_YEAR - 5;

        // Step 1: Search active inventory filtered by older vehicles using year range
        // Price filtering done in code — no supported max_price API param
        const inventory = await client.searchActiveCars({
          zip: args.zip,
          radius,
          year: `2000-${cutoffYear}`,
          rows: 50,
          facets: "dealer_id,make",
          stats: "price,miles,dom",
          sort_by: "price",
          sort_order: "asc",
        } as any);

        const listings: any[] = inventory?.listings ?? [];
        const facets = inventory?.facets ?? {};

        const dealerFacets: any[] = facets?.dealer_id ?? [];
        const dealerTotalMap: Record<string, number> = {};
        for (const f of dealerFacets) dealerTotalMap[String(f.item)] = f.count ?? 0;

        // Year extraction with rich fallback chain
        const extractYear = (l: any): number => {
          const y = parseInt(l.build?.year ?? l.year ?? "0", 10);
          if (y > 1990) return y;
          const vin: string = l.vin ?? "";
          if (vin.length >= 10) {
            const map: Record<string, number> = { A:2010,B:2011,C:2012,D:2013,E:2014,F:2015,G:2016,H:2017,J:2018,K:2019,L:2020,M:2021,N:2022,P:2023,R:2024,S:2025 };
            const mapped = map[vin[9].toUpperCase()];
            if (mapped) return mapped;
          }
          return 0;
        };

        // Group by dealer — all listings are pre-filtered to old vehicles via year range API param
        const dealerMap: Record<string, {
          name: string; city: string; state: string;
          isFranchise: boolean;
          unitCount: number; prices: number[]; doms: number[]; years: number[];
        }> = {};

        for (const l of listings) {
          const did = l.dealer?.id ?? "unknown";
          const name = l.dealer?.name ?? did;
          const city = l.dealer?.city ?? "";
          const state = l.dealer?.state ?? "";
          const price = l.price ?? 0;
          const dom = l.dom ?? l.days_on_market ?? 0;
          const isFranchise = !!(l.dealer?.franchise_id);
          const year = extractYear(l);
          if (!dealerMap[did]) dealerMap[did] = { name, city, state, isFranchise, unitCount: 0, prices: [], doms: [], years: [] };
          dealerMap[did].unitCount++;
          dealerMap[did].isFranchise = dealerMap[did].isFranchise || isFranchise;
          if (price > 0) dealerMap[did].prices.push(price);
          dealerMap[did].doms.push(dom);
          if (year > 0) dealerMap[did].years.push(year);
        }

        const prospects = Object.entries(dealerMap).map(([did, d]) => {
          const totalUnits = dealerTotalMap[did] ?? d.unitCount;
          const oldUnits = d.unitCount;
          const oldPct = 100;
          const avgPrice = d.prices.length > 0 ? Math.round(d.prices.reduce((s, v) => s + v, 0) / d.prices.length) : 0;
          const avgDom = d.doms.length > 0 ? Math.round(d.doms.reduce((s, v) => s + v, 0) / d.doms.length) : 0;
          const dealerAvgAge = d.years.length > 0
            ? Math.round((d.years.reduce((s, y) => s + (CURRENT_YEAR - y), 0) / d.years.length) * 10) / 10
            : 0;

          const priceScore = avgPrice > 0 ? Math.max(0, 100 - Math.round(avgPrice / 250)) : 50;
          const domScore = Math.min(avgDom, 100);
          const subprimeScore = Math.round(priceScore * 0.6 + domScore * 0.4);
          const isBhph = avgPrice > 0 && avgPrice < 12000;
          const dealerType = isBhph ? "BHPH" : d.isFranchise ? "Franchise" : "Independent";
          const lendingOpportunity = Math.round(totalUnits * (avgPrice || 10000) * 0.65);

          return {
            dealerId: did, dealerName: d.name, city: d.city, state: d.state,
            totalUnits, oldVehicleUnits: oldUnits, oldVehiclePct: oldPct,
            avgPrice, avgDom, isBhph, dealerType, dealerAvgAge, subprimeScore, lendingOpportunity,
          };
        }).filter(d => d.oldVehicleUnits >= 1);

        prospects.sort((a, b) => b.subprimeScore - a.subprimeScore);

        // Step 2: Sold demand context (Enterprise API — graceful failure)
        let hasSoldData = false;
        try {
          const soldSummary = await client.getSoldSummary({
            ranking_dimensions: "make",
            ranking_measure: "sold_count",
            ranking_order: "desc",
            top_n: 10,
            ...(args.state ? { state: args.state } : {}),
            inventory_type: "Used",
          } as any);
          hasSoldData = !!(soldSummary as any)?.rankings?.length;
        } catch { /* Enterprise API not available */ }

        // Price buckets
        const allPrices = listings.map((l: any) => l.price ?? 0).filter((p: number) => p > 0);
        const priceBuckets = [
          { label: "<$8K", count: allPrices.filter(p => p < 8000).length },
          { label: "$8-10K", count: allPrices.filter(p => p >= 8000 && p < 10000).length },
          { label: "$10-12K", count: allPrices.filter(p => p >= 10000 && p < 12000).length },
          { label: "$12-15K", count: allPrices.filter(p => p >= 12000 && p < 15000).length },
          { label: "$15-18K", count: allPrices.filter(p => p >= 15000 && p < 18000).length },
          { label: ">$18K", count: allPrices.filter(p => p >= 18000).length },
        ];

        const allYears = listings.map(extractYear).filter(y => y > 1990);
        const avgVehicleAge = allYears.length > 0
          ? Math.round((allYears.reduce((s, y) => s + (CURRENT_YEAR - y), 0) / allYears.length) * 10) / 10
          : 0;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                territory: `${args.zip} / ${radius}mi`,
                totalDealers: Object.keys(dealerMap).length,
                bhphCount: prospects.filter(d => d.isBhph).length,
                avgVehicleAge,
                prospects: prospects.slice(0, 20),
                priceBuckets,
                hasSoldData,
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
