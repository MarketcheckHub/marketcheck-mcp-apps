import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";

export function registerRegionalDemandAllocator(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "regional-demand-allocator",
    title: "Regional Demand Allocator",
    description: "Data-driven inventory allocation recommendations by state/region based on demand-to-supply analysis.",
    htmlFileName: "regional-demand-allocator",
    inputSchema: {
      type: "object",
      properties: {
        make: { type: "string", description: "Your brand" },
        model: { type: "string", description: "Optional model filter" },
        bodyType: { type: "string", description: "Optional body type filter" },
      },
      required: ["make"],
    },
    handler: async (args: { make: string; model?: string; bodyType?: string }) => {
      try {
        const [demand, segmentMix] = await Promise.all([
          client.getSoldSummary({ make: args.make, model: args.model, body_type: args.bodyType, summary_by: "state", ranking_measure: "sold_count,average_sale_price" }),
          client.getSoldSummary({ make: args.make, ranking_dimensions: "model,body_type", summary_by: "state", ranking_measure: "sold_count" }),
        ]);

        // Get supply per state (top 10 states by demand)
        const topStates = (demand?.items ?? []).sort((a: any, b: any) => (b.sold_count ?? 0) - (a.sold_count ?? 0)).slice(0, 15);
        const supplyData = await Promise.all(
          topStates.map(async (s: any) => {
            const supply = await client.searchActiveCars({ make: args.make, model: args.model, state: s.state, rows: 0 });
            return { state: s.state, activeCount: supply?.num_found ?? 0 };
          })
        );

        return { content: [{ type: "text", text: JSON.stringify({ demand, segmentMix, supply: supplyData }) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
      }
    },
  });
}
