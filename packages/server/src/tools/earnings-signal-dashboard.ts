import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";
import { generateMonthlyRanges } from "@mcp-apps/shared";

export function registerEarningsSignalDashboard(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "earnings-signal-dashboard",
    title: "Earnings Signal Dashboard",
    description: "Pre-earnings channel check for automotive tickers. 6-dimension signal matrix with bull/bear scenarios.",
    htmlFileName: "earnings-signal-dashboard",
    inputSchema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "Stock ticker (e.g., F, GM, TM, TSLA)" },
      },
      required: ["ticker"],
    },
    handler: async (args: { ticker: string }) => {
      const tickerToMakes: Record<string, string[]> = {
        F: ["Ford", "Lincoln"], GM: ["Chevrolet", "GMC", "Buick", "Cadillac"],
        TM: ["Toyota", "Lexus"], HMC: ["Honda", "Acura"],
        TSLA: ["Tesla"], RIVN: ["Rivian"],
        STLA: ["Chrysler", "Dodge", "Jeep", "Ram"],
        HYMTF: ["Hyundai", "Genesis"], NSANY: ["Nissan", "Infiniti"],
      };
      const makes = tickerToMakes[args.ticker] ?? [args.ticker];

      try {
        const ranges = generateMonthlyRanges(3);
        const results: any[] = [];
        for (const make of makes) {
          const [current, prior, activeInventory, evData] = await Promise.all([
            client.getSoldSummary({ make, date_from: ranges[2].dateFrom, date_to: ranges[2].dateTo, ranking_dimensions: "make", ranking_measure: "sold_count,average_sale_price,average_days_on_market" }),
            client.getSoldSummary({ make, date_from: ranges[0].dateFrom, date_to: ranges[0].dateTo, ranking_dimensions: "make", ranking_measure: "sold_count,average_sale_price,average_days_on_market" }),
            client.searchActiveCars({ make, rows: 0, stats: "price,dom" }),
            client.getSoldSummary({ make, fuel_type_category: "EV", date_from: ranges[2].dateFrom, date_to: ranges[2].dateTo, ranking_dimensions: "make", ranking_measure: "sold_count,average_sale_price" }),
          ]);
          results.push({ make, current, prior, activeInventory, evData });
        }
        return { content: [{ type: "text", text: JSON.stringify({ ticker: args.ticker, makes: results }) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
      }
    },
  });
}
