import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";
import { generateMonthlyRanges } from "@mcp-apps/shared";

export function registerDepreciationAnalyzer(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "depreciation-analyzer",
    title: "Depreciation Analyzer",
    description: "Track depreciation curves by model, compare segments, analyze brand residuals, and geographic variance.",
    htmlFileName: "depreciation-analyzer",
    inputSchema: {
      type: "object",
      properties: {
        models: { type: "array", items: { type: "object", properties: { make: { type: "string" }, model: { type: "string" } } } },
        timeRange: { type: "string", enum: ["3M", "6M", "1Y", "2Y"] },
        state: { type: "string" },
      },
      required: ["models"],
    },
    handler: async (args: { models: Array<{ make: string; model: string }>; timeRange?: string; state?: string }) => {
      try {
        const months = args.timeRange === "2Y" ? 24 : args.timeRange === "1Y" ? 12 : args.timeRange === "3M" ? 3 : 6;
        const ranges = generateMonthlyRanges(months);

        const modelSeries = await Promise.all(
          args.models.slice(0, 4).map(async (m) => {
            const series: any[] = [];
            for (const r of ranges) {
              const data = await client.getSoldSummary({ make: m.make, model: m.model, state: args.state, date_from: r.dateFrom, date_to: r.dateTo, inventory_type: "Used", ranking_dimensions: "make,model", ranking_measure: "average_sale_price,sold_count" });
              series.push({ date: r.date, data });
            }
            return { make: m.make, model: m.model, series };
          })
        );

        const [segmentData, geoData] = await Promise.all([
          client.getSoldSummary({ state: args.state, ranking_dimensions: "body_type", ranking_measure: "average_sale_price,sold_count", inventory_type: "Used" }),
          client.getSoldSummary({ make: args.models[0].make, model: args.models[0].model, summary_by: "state", inventory_type: "Used" }),
        ]);

        return { content: [{ type: "text", text: JSON.stringify({ modelSeries, segmentData, geoData }) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
      }
    },
  });
}
