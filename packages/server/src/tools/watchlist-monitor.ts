import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";
import { generateMonthlyRanges } from "@mcp-apps/shared";

export function registerWatchlistMonitor(server: McpServer) {
  const client = new MarketCheckClient();

  registerApp({
    server,
    toolName: "watchlist-monitor",
    title: "Watchlist Monitor",
    description: "Morning signal scan across tracked automotive tickers. Volume, ASP, and days supply alerts.",
    htmlFileName: "watchlist-monitor",
    inputSchema: {
      type: "object",
      properties: {
        tickers: { type: "array", items: { type: "string" }, description: "Stock tickers to scan (e.g., F, GM, TM, AN, LAD)" },
      },
      required: ["tickers"],
    },
    handler: async (args: { tickers: string[] }) => {
      const tickerToMakes: Record<string, string[]> = {
        F: ["Ford", "Lincoln"], GM: ["Chevrolet", "GMC", "Buick", "Cadillac"],
        TM: ["Toyota", "Lexus"], HMC: ["Honda", "Acura"], STLA: ["Chrysler", "Dodge", "Jeep", "Ram"],
        TSLA: ["Tesla"], RIVN: ["Rivian"], LCID: ["Lucid"],
        HYMTF: ["Hyundai", "Genesis"], NSANY: ["Nissan", "Infiniti"],
        AN: ["AutoNation"], LAD: ["Lithia Motors"], KMX: ["CarMax"], CVNA: ["Carvana"],
      };

      try {
        const ranges = generateMonthlyRanges(2);
        const results = await Promise.all(
          args.tickers.map(async (ticker) => {
            const makes = tickerToMakes[ticker] ?? [ticker];
            const current = await client.getSoldSummary({
              make: makes[0], date_from: ranges[1].dateFrom, date_to: ranges[1].dateTo,
              ranking_dimensions: "make", ranking_measure: "sold_count,average_sale_price,average_days_on_market",
            });
            const prior = await client.getSoldSummary({
              make: makes[0], date_from: ranges[0].dateFrom, date_to: ranges[0].dateTo,
              ranking_dimensions: "make", ranking_measure: "sold_count,average_sale_price,average_days_on_market",
            });
            return { ticker, makes, current, prior };
          })
        );
        return { content: [{ type: "text", text: JSON.stringify({ tickers: results }) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
      }
    },
  });
}
