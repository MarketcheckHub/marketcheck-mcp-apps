import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";

export function registerPortfolioRiskMonitor(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "portfolio-risk-monitor",
    title: "Portfolio Risk Monitor",
    description: "Track collateral health across auto loan portfolio. LTV distribution, underwater alerts, depreciation heatmap.",
    htmlFileName: "portfolio-risk-monitor",
    inputSchema: {
      type: "object",
      properties: {
        vins: { type: "array", items: { type: "object", properties: { vin: { type: "string" }, miles: { type: "number" }, loanBalance: { type: "number" }, zip: { type: "string" } } } },
      },
      required: ["vins"],
    },
    handler: async (args: { vins: Array<{ vin: string; miles: number; loanBalance: number; zip?: string }> }) => {
      try {
        const results = await Promise.all(
          args.vins.slice(0, 25).map(async (v) => {
            try {
              const [decode, price] = await Promise.all([
                client.decodeVin(v.vin),
                client.predictPrice({ vin: v.vin, miles: v.miles, dealer_type: "franchise", zip: v.zip }),
              ]);
              return { ...v, decode, price, error: null };
            } catch (e: any) {
              return { ...v, error: e.message };
            }
          })
        );
        const segmentData = await client.getSoldSummary({ ranking_dimensions: "body_type,fuel_type_category", ranking_measure: "average_sale_price,sold_count" });
        return { content: [{ type: "text", text: JSON.stringify({ portfolio: results, segments: segmentData }) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
      }
    },
  });
}
