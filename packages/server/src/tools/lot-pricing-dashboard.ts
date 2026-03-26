import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";

export function registerLotPricingDashboard(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "scan-lot-pricing",
    title: "Lot Pricing Dashboard",
    description:
      "Analyze dealer lot pricing vs market. Shows overpriced/underpriced units, aging heatmap, floor plan burn, and stocking hot list.",
    htmlFileName: "lot-pricing-dashboard",
    inputSchema: {
      type: "object",
      properties: {
        dealerId: { type: "string", description: "Dealer ID to scan inventory for" },
        zip: { type: "string", description: "ZIP code for market pricing" },
        state: { type: "string", description: "State for sold summary / hot list" },
      },
      required: ["dealerId", "zip", "state"],
    },
    handler: async (args: { dealerId: string; zip: string; state: string }) => {
      try {
        // 1. Fetch full dealer lot
        const lotResult = await client.searchActiveCars({
          dealer_id: args.dealerId,
          rows: 50,
          stats: "price,miles,dom",
          facets: "body_type,make",
        });

        const listings: any[] = lotResult?.listings ?? [];

        // 2. For each vehicle, get predicted market price
        const pricedInventory = await Promise.all(
          listings.slice(0, 50).map(async (listing: any) => {
            const vin = listing.vin ?? "";
            const listedPrice = listing.price ?? 0;
            const miles = listing.miles ?? 0;
            const dom = listing.dom ?? 0;

            let marketPrice = listedPrice;
            let compCount = 0;
            try {
              const prediction = await client.predictPrice({
                vin,
                miles,
                dealer_type: "franchise",
                zip: args.zip,
              });
              marketPrice = prediction?.predicted_price ?? listedPrice;
              compCount = prediction?.comparables_count ?? 0;
            } catch {
              // If predict fails, market price = listed price (gap = 0)
            }

            const gapDollar = listedPrice - marketPrice;
            const gapPct = marketPrice > 0 ? ((listedPrice - marketPrice) / marketPrice) * 100 : 0;

            return {
              stock: listing.stock_no ?? "",
              vin,
              year: listing.year ?? 0,
              make: listing.make ?? "",
              model: listing.model ?? "",
              trim: listing.trim ?? "",
              bodyType: listing.body_type ?? "",
              listedPrice,
              marketPrice: Math.round(marketPrice),
              gapDollar: Math.round(gapDollar),
              gapPct: Math.round(gapPct * 10) / 10,
              miles,
              dom,
              compCount,
            };
          })
        );

        // Sort by urgency (most overpriced first)
        pricedInventory.sort((a, b) => b.gapPct - a.gapPct);

        // 3. Aging buckets
        const agingBuckets = [
          { label: "0-30", min: 0, max: 30, count: 0, color: "#10b981" },
          { label: "31-60", min: 31, max: 60, count: 0, color: "#f59e0b" },
          { label: "61-90", min: 61, max: 90, count: 0, color: "#f97316" },
          { label: "90+", min: 91, max: 9999, count: 0, color: "#ef4444" },
        ];
        for (const v of pricedInventory) {
          for (const b of agingBuckets) {
            if (v.dom >= b.min && v.dom <= b.max) { b.count++; break; }
          }
        }

        // 4. KPIs
        const totalUnits = pricedInventory.length;
        const avgDom = totalUnits > 0
          ? Math.round(pricedInventory.reduce((s, v) => s + v.dom, 0) / totalUnits)
          : 0;
        const agedUnits = pricedInventory.filter(v => v.dom > 60).length;
        const floorPlanBurnPerDay = agedUnits * 35;
        const pctOverpriced = totalUnits > 0
          ? Math.round((pricedInventory.filter(v => v.gapPct > 5).length / totalUnits) * 100)
          : 0;
        const pctUnderpriced = totalUnits > 0
          ? Math.round((pricedInventory.filter(v => v.gapPct < -5).length / totalUnits) * 100)
          : 0;

        // 5. Hot list from sold summary
        let hotList: any[] = [];
        try {
          const soldSummary = await client.getSoldSummary({
            state: args.state,
            ranking_dimensions: "make,model",
            ranking_measure: "sold_count",
            ranking_order: "desc",
            top_n: 10,
          });

          const rankings = soldSummary?.rankings ?? [];
          hotList = rankings.map((r: any) => ({
            make: r.make ?? "",
            model: r.model ?? "",
            dsRatio: r.sold_count ? Math.round((r.sold_count / (r.active_count || 1)) * 10) / 10 : 0,
            avgDom: r.average_days_on_market ?? 0,
            avgPrice: r.average_sale_price ?? 0,
            unitsToStock: r.sold_count && r.active_count
              ? Math.max(0, Math.round((r.sold_count / (r.active_count || 1)) - 1))
              : 0,
          }));
        } catch {
          // Hot list not critical
        }

        const result = {
          inventory: pricedInventory,
          aging: agingBuckets,
          hotList,
          kpis: {
            totalUnits,
            avgDom,
            agedUnits,
            floorPlanBurnPerDay,
            pctOverpriced,
            pctUnderpriced,
          },
        };

        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: e.message }) }],
        };
      }
    },
  });
}
