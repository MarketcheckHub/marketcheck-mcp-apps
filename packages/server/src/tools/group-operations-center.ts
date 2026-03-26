import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";

export function registerGroupOperationsCenter(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "group-operations-center",
    title: "Group Operations Center",
    description: "Multi-location dealer group dashboard showing per-store health, aging alerts, and cross-location transfer recommendations.",
    htmlFileName: "group-operations-center",
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
          description: "Array of dealer locations",
        },
      },
      required: ["locations"],
    },
    handler: async (args: { locations: Array<{ name: string; dealerId: string; zip: string; state: string }> }) => {
      try {
        const locationData = await Promise.all(
          args.locations.map(async (loc) => {
            const inventory = await client.searchActiveCars({
              dealer_id: loc.dealerId,
              rows: 0,
              stats: "price,miles,dom",
              facets: "body_type,make",
            });
            return { ...loc, inventory };
          })
        );

        const result = { locations: locationData };
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
      }
    },
  });
}
