import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";
import { generateMonthlyRanges } from "@mcp-apps/shared";

export function registerMarketTrendsDashboard(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "market-trends-dashboard",
    title: "Market Trends Dashboard",
    description: "Macro market view — fastest/slowest movers, segment mix, brand residuals, state rankings, markup/discount tracker.",
    htmlFileName: "market-trends-dashboard",
    inputSchema: {
      type: "object",
      properties: {
        state: { type: "string" },
        inventoryType: { type: "string", enum: ["New", "Used", ""] },
        bodyType: { type: "string" },
        fuelType: { type: "string" },
      },
    },
    handler: async (args: any) => {
      try {
        const ranges = generateMonthlyRanges(2);
        const base = { state: args.state, inventory_type: args.inventoryType || undefined, body_type: args.bodyType, fuel_type_category: args.fuelType };

        const [currentMovers, priorMovers, segmentMix, brandResiduals, stateData, activeStats] = await Promise.all([
          client.getSoldSummary({ ...base, date_from: ranges[1].dateFrom, date_to: ranges[1].dateTo, ranking_dimensions: "make,model", ranking_measure: "sold_count,average_sale_price,average_days_on_market", ranking_order: "desc", top_n: 20 }),
          client.getSoldSummary({ ...base, date_from: ranges[0].dateFrom, date_to: ranges[0].dateTo, ranking_dimensions: "make,model", ranking_measure: "sold_count,average_sale_price,average_days_on_market", ranking_order: "desc", top_n: 20 }),
          client.getSoldSummary({ ...base, ranking_dimensions: "body_type", ranking_measure: "sold_count,average_sale_price" }),
          client.getSoldSummary({ ...base, inventory_type: "Used", ranking_dimensions: "make", ranking_measure: "average_sale_price,sold_count", top_n: 20 }),
          client.getSoldSummary({ ...base, summary_by: "state" }),
          client.searchActiveCars({ state: args.state, rows: 0, stats: "price,dom" }),
        ]);

        return { content: [{ type: "text", text: JSON.stringify({ currentMovers, priorMovers, segmentMix, brandResiduals, stateData, activeStats }) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
      }
    },
  });
}
