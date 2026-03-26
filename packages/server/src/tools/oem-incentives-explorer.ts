import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";

export function registerOemIncentivesExplorer(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "oem-incentives-explorer",
    title: "OEM Incentives Explorer",
    description: "Search and compare manufacturer incentives (cash back, APR, lease deals) by ZIP code.",
    htmlFileName: "oem-incentives-explorer",
    inputSchema: {
      type: "object",
      properties: {
        make: { type: "string", description: "Vehicle make (e.g., Toyota)" },
        model: { type: "string", description: "Optional model filter" },
        zip: { type: "string", description: "ZIP code for regional incentives" },
        compareMakes: { type: "array", items: { type: "string" }, description: "Additional makes to compare" },
      },
      required: ["make", "zip"],
    },
    handler: async (args: { make: string; model?: string; zip: string; compareMakes?: string[] }) => {
      try {
        const incentives = await client.searchOemIncentivesByZip({
          oem: args.make,
          zip: args.zip,
          model: args.model,
        });

        let compareIncentives: any[] = [];
        if (args.compareMakes?.length) {
          compareIncentives = await Promise.all(
            args.compareMakes.map(async (make) => {
              const data = await client.searchOemIncentivesByZip({ oem: make, zip: args.zip });
              return { make, data };
            })
          );
        }

        const result = { make: args.make, incentives, compareIncentives };
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
      }
    },
  });
}
