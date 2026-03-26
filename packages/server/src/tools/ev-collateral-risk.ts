import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";
import { generateMonthlyRanges } from "@mcp-apps/shared";

export function registerEvCollateralRisk(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "ev-collateral-risk",
    title: "EV Collateral Risk Monitor",
    description: "Track EV vs ICE depreciation gap, adoption rates, and state-level penetration for lending risk assessment.",
    htmlFileName: "ev-collateral-risk",
    inputSchema: {
      type: "object",
      properties: {
        timeRange: { type: "string", enum: ["6M", "1Y", "2Y"], description: "Time range for analysis" },
        bodyType: { type: "string", description: "Optional body type filter" },
      },
    },
    handler: async (args: { timeRange?: string; bodyType?: string }) => {
      try {
        const months = args.timeRange === "2Y" ? 24 : args.timeRange === "1Y" ? 12 : 6;
        const ranges = generateMonthlyRanges(months);
        const evSeries: any[] = [];
        const iceSeries: any[] = [];

        for (const r of ranges) {
          const [ev, ice] = await Promise.all([
            client.getSoldSummary({ fuel_type_category: "EV", body_type: args.bodyType, date_from: r.dateFrom, date_to: r.dateTo, ranking_dimensions: "fuel_type_category", ranking_measure: "sold_count,average_sale_price" }),
            client.getSoldSummary({ fuel_type_category: "ICE", body_type: args.bodyType, date_from: r.dateFrom, date_to: r.dateTo, ranking_dimensions: "fuel_type_category", ranking_measure: "sold_count,average_sale_price" }),
          ]);
          evSeries.push({ date: r.date, data: ev });
          iceSeries.push({ date: r.date, data: ice });
        }

        const [evByBrand, evByState] = await Promise.all([
          client.getSoldSummary({ fuel_type_category: "EV", ranking_dimensions: "make", ranking_measure: "sold_count,average_sale_price", top_n: 15 }),
          client.getSoldSummary({ fuel_type_category: "EV", summary_by: "state" }),
        ]);

        return { content: [{ type: "text", text: JSON.stringify({ evSeries, iceSeries, evByBrand, evByState }) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
      }
    },
  });
}
