import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";

export function registerDealerGroupScorecard(server: McpServer) {
  const client = new MarketCheckClient();

  const publicGroups = [
    { ticker: "AN", name: "AutoNation" },
    { ticker: "LAD", name: "Lithia Motors" },
    { ticker: "PAG", name: "Penske Automotive" },
    { ticker: "SAH", name: "Sonic Automotive" },
    { ticker: "GPI", name: "Group 1 Automotive" },
    { ticker: "ABG", name: "Asbury Automotive" },
    { ticker: "KMX", name: "CarMax" },
    { ticker: "CVNA", name: "Carvana" },
  ];

  registerApp({
    server,
    toolName: "dealer-group-scorecard",
    title: "Dealer Group Scorecard",
    description: "Benchmark publicly traded dealer groups across volume, pricing, turn rate, and efficiency metrics.",
    htmlFileName: "dealer-group-scorecard",
    inputSchema: {
      type: "object",
      properties: {
        groups: { type: "array", items: { type: "string" }, description: "Dealer group names to compare" },
      },
    },
    handler: async (args: { groups?: string[] }) => {
      try {
        const groups = args.groups?.length ? publicGroups.filter(g => args.groups!.includes(g.ticker)) : publicGroups;
        const data = await Promise.all(
          groups.map(async (g) => {
            const summary = await client.getSoldSummary({
              dealership_group_name: g.name,
              ranking_dimensions: "dealership_group_name",
              ranking_measure: "sold_count,average_sale_price,average_days_on_market",
            });
            return { ...g, summary };
          })
        );
        return { content: [{ type: "text", text: JSON.stringify({ groups: data }) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
      }
    },
  });
}
