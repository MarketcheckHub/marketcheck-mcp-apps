import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";

export function registerInventoryBalancer(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "inventory-balancer",
    title: "Inventory Balancer",
    description: "Cross-location inventory transfer recommendations based on supply/demand mismatch analysis.",
    htmlFileName: "inventory-balancer",
    inputSchema: {
      type: "object",
      properties: {
        locations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              dealerId: { type: "string" },
              zip: { type: "string" },
              state: { type: "string" },
            },
          },
        },
      },
      required: ["locations"],
    },
    handler: async (args: { locations: Array<{ name: string; dealerId: string; zip: string; state: string }> }) => {
      try {
        const data = await Promise.all(
          args.locations.map(async (loc) => {
            const [inventory, demand] = await Promise.all([
              client.searchActiveCars({ dealer_id: loc.dealerId, rows: 0, facets: "body_type,make,model" }),
              client.getSoldSummary({ state: loc.state, ranking_dimensions: "body_type,make", ranking_measure: "sold_count" }),
            ]);
            return { ...loc, inventory, demand };
          })
        );
        return { content: [{ type: "text", text: JSON.stringify({ locations: data }) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
      }
    },
  });
}
