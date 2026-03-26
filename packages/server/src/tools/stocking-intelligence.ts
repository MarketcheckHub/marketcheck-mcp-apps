import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";

export function registerStockingIntelligence(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "stocking-intelligence",
    title: "Stocking Intelligence",
    description: "Know what to buy at auction. Demand heatmap, hot list, avoid list, and VIN checker for auction run lists.",
    htmlFileName: "stocking-intelligence",
    inputSchema: {
      type: "object",
      properties: {
        state: { type: "string", description: "State for demand analysis" },
        zip: { type: "string", description: "ZIP code" },
        vins: { type: "array", items: { type: "string" }, description: "Optional VINs from auction run list to check" },
      },
      required: ["state"],
    },
    handler: async (args: { state: string; zip?: string; vins?: string[] }) => {
      try {
        const [demandData, supplyData] = await Promise.all([
          client.getSoldSummary({
            state: args.state,
            ranking_dimensions: "make,model",
            ranking_measure: "sold_count",
            ranking_order: "desc",
            top_n: 30,
          }),
          client.searchActiveCars({
            state: args.state,
            rows: 0,
            stats: "price,miles,dom",
            facets: "body_type,make",
          }),
        ]);

        const segmentDemand = await client.getSoldSummary({
          state: args.state,
          ranking_dimensions: "body_type",
          ranking_measure: "sold_count,average_sale_price,average_days_on_market",
        });

        let vinChecks: any[] = [];
        if (args.vins?.length) {
          vinChecks = await Promise.all(
            args.vins.slice(0, 10).map(async (vin) => {
              try {
                const [decode, retail, wholesale] = await Promise.all([
                  client.decodeVin(vin),
                  client.predictPrice({ vin, dealer_type: "franchise", zip: args.zip }),
                  client.predictPrice({ vin, dealer_type: "independent", zip: args.zip }),
                ]);
                return { vin, decode, retail, wholesale, error: null };
              } catch (e: any) {
                return { vin, error: e.message };
              }
            })
          );
        }

        const result = { demandData, supplyData, segmentDemand, vinChecks };
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
      }
    },
  });
}
