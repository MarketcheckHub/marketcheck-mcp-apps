import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";

export function registerTerritoryPipeline(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "territory-pipeline",
    title: "Territory Pipeline",
    description: "Lender sales territory scanner. Find dealers who need floor plan, rank by opportunity, generate call prep.",
    htmlFileName: "territory-pipeline",
    inputSchema: {
      type: "object",
      properties: {
        states: { type: "array", items: { type: "string" }, description: "States in territory" },
      },
      required: ["states"],
    },
    handler: async (args: { states: string[] }) => {
      try {
        const stateData = await Promise.all(
          args.states.map(async (state) => {
            const data = await client.searchActiveCars({ state, dealer_type: "independent", rows: 0, facets: "dealer_id" });
            return { state, data };
          })
        );
        return { content: [{ type: "text", text: JSON.stringify({ territory: stateData }) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
      }
    },
  });
}
