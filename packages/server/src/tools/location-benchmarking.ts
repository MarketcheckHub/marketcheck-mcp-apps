import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";

export function registerLocationBenchmarking(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "location-benchmarking",
    title: "Location Benchmarking",
    description: "Rank and compare dealership locations across turn rate, aging, pricing efficiency, and DOM metrics.",
    htmlFileName: "location-benchmarking",
    inputSchema: {
      type: "object",
      properties: {
        locations: { type: "array", items: { type: "object", properties: { name: { type: "string" }, dealerId: { type: "string" }, zip: { type: "string" }, state: { type: "string" } } } },
      },
      required: ["locations"],
    },
    handler: async (args: any) => {
      try {
        const data = await Promise.all(
          args.locations.map(async (loc: any) => {
            const [inventory, marketDom] = await Promise.all([
              client.searchActiveCars({ dealer_id: loc.dealerId, rows: 0, stats: "price,dom" }),
              client.getSoldSummary({ state: loc.state, ranking_dimensions: "make", ranking_measure: "average_days_on_market" }),
            ]);
            return { ...loc, inventory, marketDom };
          })
        );
        return { content: [{ type: "text", text: JSON.stringify({ locations: data }) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
      }
    },
  });
}
