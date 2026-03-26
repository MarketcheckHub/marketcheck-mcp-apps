/**
 * Car Search & Compare tools.
 * 1. "search-cars" — search active car listings with filters, returns listings + stats + facets
 * 2. "compare-cars" — decode VINs and predict prices for side-by-side comparison
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MarketCheckClient } from "@mcp-apps/shared";

const mc = new MarketCheckClient();

export function registerCarSearchCompare(server: McpServer) {
  // ── Tool 1: search-cars ──────────────────────────────────────────────────
  server.tool(
    "search-cars",
    "Search active car listings with filters for make, body type, price, year, mileage, fuel type, location, and more. Returns listings, stats, and facets.",
    {
      makes: z.string().optional().describe("Comma-separated list of makes, e.g. 'Toyota,Honda,Ford'"),
      bodyTypes: z.string().optional().describe("Comma-separated body types, e.g. 'SUV,Sedan,Truck'"),
      fuelTypes: z.string().optional().describe("Comma-separated fuel types, e.g. 'Gas,Electric,Hybrid'"),
      yearRange: z.string().optional().describe("Year range, e.g. '2020-2024'"),
      priceRange: z.string().optional().describe("Price range, e.g. '15000-45000'"),
      milesMax: z.number().optional().describe("Maximum mileage filter"),
      zip: z.string().optional().describe("ZIP code for location-based search"),
      radius: z.number().optional().describe("Search radius in miles from ZIP"),
      sort_by: z.string().optional().describe("Sort field: price, miles, year, dom"),
      sort_order: z.string().optional().describe("Sort order: asc or desc"),
      rows: z.number().optional().describe("Number of results to return (default 12)"),
      start: z.number().optional().describe("Offset for pagination"),
      stats: z.string().optional().describe("Comma-separated stat fields, e.g. 'price,miles'"),
    },
    async (args) => {
      try {
        // Build params for MarketCheck API
        const params: Record<string, any> = {
          car_type: "used",
          rows: args.rows ?? 12,
          start: args.start ?? 0,
          include_dealer_object: true,
        };

        if (args.makes) params.make = args.makes;
        if (args.bodyTypes) params.body_type = args.bodyTypes;
        if (args.fuelTypes) params.fuel_type = args.fuelTypes;
        if (args.priceRange) params.price_range = args.priceRange;
        if (args.milesMax) params.miles_range = `0-${args.milesMax}`;
        if (args.zip) params.zip = args.zip;
        if (args.radius) params.radius = args.radius;
        if (args.sort_by) params.sort_by = args.sort_by;
        if (args.sort_order) params.sort_order = args.sort_order;
        if (args.stats) params.stats = args.stats;

        // Parse year range into the API year param
        if (args.yearRange) {
          const [yearMin, yearMax] = args.yearRange.split("-");
          if (yearMin && yearMax) {
            // Build comma-separated year list or use range syntax
            params.year = args.yearRange;
          }
        }

        // Request facets for body_type and fuel_type
        params.facets = "body_type,fuel_type,make";

        const result = await mc.searchActiveCars(params);

        // Normalize response
        const listings = (result.listings ?? []).map((l: any) => ({
          vin: l.vin,
          year: l.year,
          make: l.make,
          model: l.model,
          trim: l.trim ?? "",
          price: l.price ?? 0,
          miles: l.miles ?? 0,
          body_type: l.body_type ?? "",
          fuel_type: l.fuel_type ?? "",
          engine: l.engine ?? "",
          transmission: l.transmission ?? "",
          drivetrain: l.drivetrain ?? "",
          exterior_color: l.exterior_color ?? "",
          interior_color: l.interior_color ?? "",
          is_certified: l.is_certified ?? false,
          days_on_market: l.days_on_market ?? 0,
          dealer_name: l.dealer?.name ?? "",
          dealer_city: l.dealer?.city ?? l.location?.city ?? "",
          dealer_state: l.dealer?.state ?? l.location?.state ?? "",
        }));

        const response = {
          listings,
          num_found: result.num_found ?? listings.length,
          stats: result.stats,
          facets: result.facets,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(response) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: err.message }) }],
        };
      }
    },
  );

  // ── Tool 2: compare-cars ─────────────────────────────────────────────────
  server.tool(
    "compare-cars",
    "Compare 2-3 cars side-by-side. Decodes VINs for full specs and predicts fair market prices for each.",
    {
      vins: z.array(z.string()).min(2).max(3).describe("Array of 2 or 3 VINs to compare"),
    },
    async (args) => {
      try {
        const cars = await Promise.all(
          args.vins.map(async (vin) => {
            // Decode VIN for specs
            let decoded: any = {};
            try {
              decoded = await mc.decodeVin(vin);
            } catch (_e) {
              // VIN decode may fail; continue with partial data
            }

            // Predict price
            let pricing: any = {};
            try {
              pricing = await mc.predictPrice({ vin });
            } catch (_e) {
              // Price prediction may fail; continue without it
            }

            return {
              vin,
              year: decoded.year,
              make: decoded.make,
              model: decoded.model,
              trim: decoded.trim ?? "",
              body_type: decoded.body_type ?? "",
              engine: decoded.engine ?? "",
              transmission: decoded.transmission ?? "",
              drivetrain: decoded.drivetrain ?? "",
              fuel_type: decoded.fuel_type ?? "",
              mpg_city: decoded.city_mpg,
              mpg_highway: decoded.highway_mpg,
              msrp: decoded.msrp,
              predicted_price: pricing.predicted_price,
              price_range: pricing.price_range,
            };
          }),
        );

        return {
          content: [{ type: "text", text: JSON.stringify({ cars }) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: err.message }) }],
        };
      }
    },
  );
}
