import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";

export function registerComparablesExplorer(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "comparables-explorer",
    title: "Market Comparables Explorer",
    description: "Price distribution histogram, price-vs-mileage scatter plot, and percentile positioning for any vehicle.",
    htmlFileName: "comparables-explorer",
    inputSchema: {
      type: "object",
      properties: {
        vin: { type: "string" },
        make: { type: "string" },
        model: { type: "string" },
        year: { type: "string" },
        zip: { type: "string" },
        radius: { type: "number" },
        milesRange: { type: "string" },
      },
    },
    handler: async (args: any) => {
      try {
        let decode: any = null;
        if (args.vin) {
          decode = await client.decodeVin(args.vin);
        }
        const make = args.make ?? decode?.make;
        const model = args.model ?? decode?.model;
        const year = args.year ?? (decode?.year ? `${decode.year - 1}-${decode.year + 1}` : undefined);

        const [activeComps, soldComps, prediction] = await Promise.all([
          client.searchActiveCars({ make, model, year, zip: args.zip, radius: args.radius ?? 100, miles_range: args.milesRange, stats: "price,miles,dom", facets: "trim,dealer_type,base_ext_color", rows: 50 }),
          client.searchPast90Days({ make, model, year, zip: args.zip, radius: args.radius ?? 100, stats: "price", rows: 25 }),
          args.vin ? client.predictPrice({ vin: args.vin, zip: args.zip }) : null,
        ]);

        return { content: [{ type: "text", text: JSON.stringify({ decode, activeComps, soldComps, prediction }) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
      }
    },
  });
}
