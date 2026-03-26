import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";

export function registerAuctionLanePlanner(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "auction-lane-planner",
    title: "Auction Lane Planner",
    description: "Plan auction lanes, price consignments, target buyers, and evaluate run-list VINs.",
    htmlFileName: "auction-lane-planner",
    inputSchema: {
      type: "object",
      properties: {
        state: { type: "string" },
        zip: { type: "string" },
        runListVins: { type: "array", items: { type: "string" } },
      },
      required: ["state"],
    },
    handler: async (args: { state: string; zip?: string; runListVins?: string[] }) => {
      try {
        const [laneDemand, consignmentProspects, buyerTargets] = await Promise.all([
          client.getSoldSummary({ state: args.state, ranking_dimensions: "body_type", ranking_measure: "sold_count,average_sale_price,average_days_on_market" }),
          client.searchActiveCars({ state: args.state, dom_range: ">60", rows: 20, sort_by: "dom", sort_order: "desc" }),
          client.searchActiveCars({ zip: args.zip, radius: 100, rows: 0, facets: "dealer_id,body_type" }),
        ]);

        let runListResults: any[] = [];
        if (args.runListVins?.length) {
          runListResults = await Promise.all(
            args.runListVins.slice(0, 15).map(async (vin) => {
              try {
                const [decode, price] = await Promise.all([
                  client.decodeVin(vin),
                  client.predictPrice({ vin, dealer_type: "independent", zip: args.zip }),
                ]);
                return { vin, decode, price, error: null };
              } catch (e: any) {
                return { vin, error: e.message };
              }
            })
          );
        }

        return { content: [{ type: "text", text: JSON.stringify({ laneDemand, consignmentProspects, buyerTargets, runListResults }) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
      }
    },
  });
}
