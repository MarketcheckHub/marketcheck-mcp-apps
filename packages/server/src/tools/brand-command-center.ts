import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";
import { generateMonthlyRanges } from "@mcp-apps/shared";

export function registerBrandCommandCenter(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "brand-command-center",
    title: "Brand Command Center",
    description: "OEM competitive intelligence — market share, pricing power, regional demand, and conquest analysis.",
    htmlFileName: "brand-command-center",
    inputSchema: {
      type: "object",
      properties: {
        myBrands: { type: "array", items: { type: "string" }, description: "Your OEM brands" },
        state: { type: "string", description: "Optional state filter" },
      },
      required: ["myBrands"],
    },
    handler: async (args: { myBrands: string[]; state?: string }) => {
      try {
        const ranges = generateMonthlyRanges(2);
        const [currentShare, priorShare, pricingPower, regionalData] = await Promise.all([
          client.getSoldSummary({ state: args.state, date_from: ranges[1].dateFrom, date_to: ranges[1].dateTo, ranking_dimensions: "make", ranking_measure: "sold_count,average_sale_price", top_n: 25 }),
          client.getSoldSummary({ state: args.state, date_from: ranges[0].dateFrom, date_to: ranges[0].dateTo, ranking_dimensions: "make", ranking_measure: "sold_count,average_sale_price", top_n: 25 }),
          client.getSoldSummary({ state: args.state, ranking_dimensions: "make", ranking_measure: "price_over_msrp_percentage,sold_count", top_n: 25 }),
          client.getSoldSummary({ make: args.myBrands[0], summary_by: "state" }),
        ]);

        let modelDrillDown: any = null;
        if (args.myBrands[0]) {
          modelDrillDown = await client.getSoldSummary({ make: args.myBrands[0], state: args.state, ranking_dimensions: "model", ranking_measure: "sold_count,average_sale_price,average_days_on_market", top_n: 20 });
        }

        return { content: [{ type: "text", text: JSON.stringify({ myBrands: args.myBrands, currentShare, priorShare, pricingPower, regionalData, modelDrillDown }) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
      }
    },
  });
}
