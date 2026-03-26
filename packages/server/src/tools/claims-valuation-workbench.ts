import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";

export function registerClaimsValuationWorkbench(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "claims-valuation",
    title: "Claims Valuation Workbench",
    description: "Total-loss determination with defensible market evidence, settlement range, comparable citations, and replacement options.",
    htmlFileName: "claims-valuation-workbench",
    inputSchema: {
      type: "object",
      properties: {
        vin: { type: "string" },
        miles: { type: "number" },
        zip: { type: "string" },
        condition: { type: "string", enum: ["excellent", "good", "fair", "poor"] },
        damageSeverity: { type: "string", enum: ["minor", "moderate", "severe", "total"] },
        totalLossThresholdPct: { type: "number", description: "Default 0.75" },
      },
      required: ["vin", "miles", "zip"],
    },
    handler: async (args: any) => {
      try {
        const decode = await client.decodeVin(args.vin);
        const make = decode?.make;
        const model = decode?.model;
        const year = decode?.year;

        const [fmvResult, soldComps, regionalData, replacements] = await Promise.all([
          client.predictPrice({
            vin: args.vin, miles: args.miles, dealer_type: "franchise", zip: args.zip,
          }),
          client.searchPast90Days({
            make, model, year: year ? `${year - 1}-${year + 1}` : undefined,
            state: undefined, zip: args.zip, radius: 100,
            rows: 10, stats: "price",
          }),
          client.getSoldSummary({
            make, model, summary_by: "state",
          }),
          client.searchActiveCars({
            make, model, year: year ? `${year - 1}-${year + 1}` : undefined,
            zip: args.zip, radius: 50, rows: 5, sort_by: "price", sort_order: "asc",
          }),
        ]);

        const result = { decode, fmvResult, soldComps, regionalData, replacements };
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
      }
    },
  });
}
