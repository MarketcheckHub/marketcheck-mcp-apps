/**
 * "Should I Buy This Car?" Deal Evaluator — Server tool
 * Registers the "evaluate-deal" MCP tool.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MarketCheckClient } from "@mcp-apps/shared";

export function registerDealEvaluator(server: McpServer) {
  const mc = new MarketCheckClient();

  server.tool(
    "evaluate-deal",
    "Evaluate whether a car is a good deal based on VIN, price, mileage and ZIP code. Returns vehicle details, predicted fair-market value, market stats, similar alternatives, price history and negotiation leverage points.",
    {
      vin: z.string().describe("17-character Vehicle Identification Number"),
      askingPrice: z.number().optional().describe("The dealer's asking price in dollars"),
      miles: z.number().optional().describe("Current mileage of the vehicle"),
      zip: z.string().optional().describe("ZIP code for local market comparison"),
    },
    async ({ vin, askingPrice, miles, zip }) => {
      try {
        // 1. Decode VIN to get vehicle specs
        const vinData = await mc.decodeVin(vin);

        const vehicle = {
          vin,
          year: vinData.year ?? 0,
          make: vinData.make ?? "Unknown",
          model: vinData.model ?? "Unknown",
          trim: vinData.trim ?? "",
          bodyType: vinData.body_type ?? "",
          engine: vinData.engine ?? "",
          transmission: vinData.transmission ?? "",
          drivetrain: vinData.drivetrain ?? "",
          fuelType: vinData.fuel_type ?? "",
          msrp: vinData.msrp ?? 0,
        };

        // 2. Predict price (franchise dealer type for used car pricing)
        const predictArgs: { vin: string; miles?: number; dealer_type?: string; zip?: string } = {
          vin,
          dealer_type: "franchise",
        };
        if (miles) predictArgs.miles = miles;
        if (zip) predictArgs.zip = zip;

        const priceResult = await mc.predictPrice(predictArgs);
        const predictedPrice = priceResult.predicted_price ?? priceResult.price ?? 0;
        const priceLow = priceResult.price_range?.low ?? predictedPrice * 0.85;
        const priceHigh = priceResult.price_range?.high ?? predictedPrice * 1.15;

        // 3. Search active cars (same Year/Make/Model/Trim, near ZIP)
        const searchParams: Record<string, any> = {
          year: String(vehicle.year),
          make: vehicle.make,
          model: vehicle.model,
          rows: 10,
          stats: "price,miles,dom",
        };
        if (vehicle.trim) searchParams.trim = vehicle.trim;
        if (zip) {
          searchParams.zip = zip;
          searchParams.radius = 75;
        }

        const searchResult = await mc.searchActiveCars(searchParams);

        const stats = searchResult.stats ?? {};
        const priceStats = stats.price ?? {};
        const milesStats = stats.miles ?? {};
        const domStats = stats.dom ?? {};

        const marketStats = {
          count: searchResult.num_found ?? 0,
          medianPrice: priceStats.median ?? priceStats.avg ?? predictedPrice,
          avgPrice: priceStats.avg ?? predictedPrice,
          minPrice: priceStats.min ?? priceLow,
          maxPrice: priceStats.max ?? priceHigh,
          avgMiles: milesStats.avg ?? miles ?? 0,
          avgDom: domStats.avg ?? 0,
          priceStd: priceStats.std ?? 0,
        };

        // Compute asking price (use provided or fallback to predicted)
        const effectiveAskingPrice = askingPrice ?? predictedPrice;

        // Compute percentile: where does asking price fall within the market?
        const range = marketStats.maxPrice - marketStats.minPrice;
        let percentile = 50;
        if (range > 0) {
          percentile = Math.max(0, Math.min(100,
            ((effectiveAskingPrice - marketStats.minPrice) / range) * 100
          ));
        }

        // 4. Get car history
        let priceHistory: Array<{ date: string; price: number; dealer: string }> = [];
        try {
          const historyResult = await mc.getCarHistory({ vin, sort_order: "asc" });
          if (historyResult.listings && Array.isArray(historyResult.listings)) {
            priceHistory = historyResult.listings
              .filter((h: any) => h.price)
              .map((h: any) => ({
                date: h.first_seen ?? h.last_seen ?? "",
                price: h.price ?? 0,
                dealer: h.dealer?.name ?? "Unknown",
              }));
          }
        } catch {
          // History may not be available for all VINs
        }

        // 5. Build alternatives from search results
        const listings = searchResult.listings ?? [];
        const alternatives = listings
          .filter((l: any) => l.vin !== vin)
          .slice(0, 8)
          .map((l: any) => ({
            year: l.year ?? vehicle.year,
            make: l.make ?? vehicle.make,
            model: l.model ?? vehicle.model,
            trim: l.trim ?? "",
            price: l.price ?? 0,
            miles: l.miles ?? 0,
            city: l.dealer?.city ?? l.location?.city ?? "",
            state: l.dealer?.state ?? l.location?.state ?? "",
            dom: l.days_on_market ?? 0,
            dealerName: l.dealer?.name ?? "Unknown",
            vdpUrl: l.vdp_url ?? "",
            isBelowPredicted: (l.price ?? Infinity) < predictedPrice,
          }));

        // 6. Build leverage points
        const leveragePoints: Array<{ icon: string; label: string; detail: string }> = [];

        // Find the subject listing's DOM from history or search
        const subjectListing = listings.find((l: any) => l.vin === vin);
        const dom = subjectListing?.days_on_market ?? domStats.avg ?? 0;
        const dealerName = subjectListing?.dealer?.name ?? (priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].dealer : "Unknown");

        if (dom > 30) {
          leveragePoints.push({
            icon: "clock",
            label: "High Days on Market",
            detail: `This car has been listed for ${dom}+ days — dealer is motivated to sell.`,
          });
        }

        if (priceHistory.length >= 2) {
          const firstPrice = priceHistory[0].price;
          const lastPrice = priceHistory[priceHistory.length - 1].price;
          const drop = firstPrice - lastPrice;
          if (drop > 0) {
            leveragePoints.push({
              icon: "chart-down",
              label: "Price Dropped",
              detail: `Price has dropped $${Math.round(drop).toLocaleString()} since first listed. Momentum is in your favor.`,
            });
          }
        }

        if (marketStats.count > 50) {
          leveragePoints.push({
            icon: "inventory",
            label: "High Local Inventory",
            detail: `${marketStats.count} similar vehicles within 75 miles. Dealer has competition.`,
          });
        }

        const effectiveMiles = miles ?? 0;
        if (effectiveMiles > 0 && marketStats.avgMiles > 0) {
          if (effectiveMiles < marketStats.avgMiles) {
            leveragePoints.push({
              icon: "miles",
              label: "Below-Average Mileage",
              detail: `This car has fewer miles than the market average (${Math.round(effectiveMiles / 1000)}K vs ${Math.round(marketStats.avgMiles / 1000)}K avg). Good value.`,
            });
          } else if (effectiveMiles > marketStats.avgMiles * 1.15) {
            leveragePoints.push({
              icon: "miles",
              label: "Above-Average Mileage",
              detail: `This car has more miles than the market average (${Math.round(effectiveMiles / 1000)}K vs ${Math.round(marketStats.avgMiles / 1000)}K avg). Use this to negotiate.`,
            });
          }
        }

        // If no leverage points found, add a generic one
        if (leveragePoints.length === 0) {
          leveragePoints.push({
            icon: "info",
            label: "Standard Market Conditions",
            detail: "No strong leverage points identified. Consider negotiating based on comparable listings.",
          });
        }

        const result = {
          vehicle,
          askingPrice: effectiveAskingPrice,
          miles: effectiveMiles,
          predictedPrice,
          percentile,
          marketStats,
          alternatives,
          priceHistory,
          leveragePoints,
          dealerName,
          dom,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (err: any) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: true,
              message: `Failed to evaluate deal: ${err.message}`,
            }),
          }],
        };
      }
    },
  );
}
