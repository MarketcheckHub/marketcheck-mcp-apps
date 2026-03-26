import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";

export function registerAppraiserWorkbench(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "appraiser-workbench",
    title: "Appraiser Workbench",
    description: "Complete vehicle valuation studio with comparable-backed retail and wholesale valuations, active/sold comps, and listing history.",
    htmlFileName: "appraiser-workbench",
    inputSchema: {
      type: "object",
      properties: {
        vin: { type: "string", description: "17-character VIN" },
        miles: { type: "number", description: "Current mileage" },
        zip: { type: "string", description: "ZIP code for local market" },
        isCertified: { type: "boolean", description: "CPO status" },
      },
      required: ["vin"],
    },
    handler: async (args: { vin: string; miles?: number; zip?: string; isCertified?: boolean }) => {
      try {
        const decode = await client.decodeVin(args.vin);
        const make = decode?.make;
        const model = decode?.model;
        const year = decode?.year;

        const [retail, wholesale, history] = await Promise.all([
          client.predictPrice({
            vin: args.vin,
            miles: args.miles,
            dealer_type: "franchise",
            zip: args.zip,
            is_certified: args.isCertified,
          }),
          client.predictPrice({
            vin: args.vin,
            miles: args.miles,
            dealer_type: "independent",
            zip: args.zip,
            is_certified: args.isCertified,
          }),
          client.getCarHistory({ vin: args.vin, sort_order: "asc" }),
        ]);

        const milesRange = args.miles
          ? `${Math.max(0, args.miles - 15000)}-${args.miles + 15000}`
          : undefined;

        const [activeComps, soldComps] = await Promise.all([
          client.searchActiveCars({
            make, model, year: year ? `${year - 1}-${year + 1}` : undefined,
            zip: args.zip, radius: 100,
            miles_range: milesRange,
            stats: "price,miles,dom",
            rows: 25, sort_by: "price", sort_order: "asc",
          }),
          client.searchPast90Days({
            make, model, year: year ? `${year - 1}-${year + 1}` : undefined,
            state: undefined, // will use zip
            zip: args.zip, radius: 100,
            miles_range: milesRange,
            stats: "price",
            rows: 25,
          }),
        ]);

        const result = { decode, retail, wholesale, activeComps, soldComps, history };
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
      }
    },
  });
}
