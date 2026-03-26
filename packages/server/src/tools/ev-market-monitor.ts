import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";
import { generateMonthlyRanges } from "@mcp-apps/shared";

export function registerEvMarketMonitor(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "ev-market-monitor",
    title: "EV Market Monitor",
    description: "The EV transition in one dashboard. Adoption trends, pricing parity, depreciation comparison, and state penetration.",
    htmlFileName: "ev-market-monitor",
    inputSchema: {
      type: "object",
      properties: {
        timeRange: { type: "string", enum: ["6M", "1Y", "2Y"] },
        bodyType: { type: "string" },
      },
    },
    handler: async (args: { timeRange?: string; bodyType?: string }) => {
      try {
        const months = args.timeRange === "2Y" ? 24 : args.timeRange === "1Y" ? 12 : 6;
        const ranges = generateMonthlyRanges(months);

        const adoptionSeries: any[] = [];
        for (const r of ranges) {
          const [ev, total] = await Promise.all([
            client.getSoldSummary({ fuel_type_category: "EV", body_type: args.bodyType, date_from: r.dateFrom, date_to: r.dateTo, ranking_dimensions: "fuel_type_category", ranking_measure: "sold_count,average_sale_price" }),
            client.getSoldSummary({ body_type: args.bodyType, date_from: r.dateFrom, date_to: r.dateTo, ranking_dimensions: "fuel_type_category", ranking_measure: "sold_count,average_sale_price" }),
          ]);
          adoptionSeries.push({ date: r.date, ev, total });
        }

        const [priceParity, evBrands, stateAdoption] = await Promise.all([
          client.getSoldSummary({ ranking_dimensions: "body_type,fuel_type_category", ranking_measure: "average_sale_price,sold_count" }),
          client.getSoldSummary({ fuel_type_category: "EV", ranking_dimensions: "make", ranking_measure: "sold_count,average_sale_price,average_days_on_market", top_n: 15 }),
          client.getSoldSummary({ fuel_type_category: "EV", summary_by: "state" }),
        ]);

        return { content: [{ type: "text", text: JSON.stringify({ adoptionSeries, priceParity, evBrands, stateAdoption }) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
      }
    },
  });
}
