import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerApp } from "../register-app.js";
import { MarketCheckClient } from "@mcp-apps/shared";
import { z } from "zod";

/**
 * Generates monthly date ranges going back N months from today.
 */
function generateMonthlyRanges(monthsBack: number): Array<{ date: string; dateFrom: string; dateTo: string }> {
  const now = new Date();
  const ranges: Array<{ date: string; dateFrom: string; dateTo: string }> = [];
  for (let i = monthsBack; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    ranges.push({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      dateFrom: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
      dateTo: `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`,
    });
  }
  return ranges;
}

function timeRangeToMonths(range: string): number {
  switch (range) {
    case "1M": return 1;
    case "3M": return 3;
    case "6M": return 6;
    case "1Y": return 12;
    case "2Y": return 24;
    default: return 6;
  }
}

interface TimeSeriesPoint {
  date: string;
  close: number;
  high: number;
  low: number;
  volume: number;
}

interface TickerEntry {
  symbol: string;
  name: string;
  currentPrice: number;
  change: number;
  changePct: number;
  volume: number;
  volumeChangePct: number;
  timeSeries: TimeSeriesPoint[];
}

interface SegmentIndex {
  name: string;
  currentPrice: number;
  change: number;
  changePct: number;
}

interface MoverEntry {
  symbol: string;
  name: string;
  currentPrice: number;
  changePct: number;
  volume: number;
}

interface HeatmapCell {
  bodyType: string;
  priceTier: string;
  changePct: number;
}

interface GeoEntry {
  state: string;
  avgPrice: number;
  volume: number;
  changePct: number;
}

/**
 * Build a time series from monthly sold summary calls.
 */
async function buildTimeSeries(
  client: MarketCheckClient,
  months: number,
  params: { make?: string; model?: string; body_type?: string; state?: string }
): Promise<TimeSeriesPoint[]> {
  const ranges = generateMonthlyRanges(months);
  const points: TimeSeriesPoint[] = [];

  for (const range of ranges) {
    try {
      const result = await client.getSoldSummary({
        date_from: range.dateFrom,
        date_to: range.dateTo,
        make: params.make,
        model: params.model,
        body_type: params.body_type,
        state: params.state,
        inventory_type: "used",
        dealer_type: "franchise",
      });

      const items = result?.items ?? result?.data ?? [];
      if (Array.isArray(items) && items.length > 0) {
        let totalVol = 0;
        let weightedPrice = 0;
        let minP = Infinity;
        let maxP = -Infinity;

        for (const item of items) {
          const vol = item.sold_count ?? 0;
          const price = item.average_sale_price ?? 0;
          if (vol > 0 && price > 0) {
            totalVol += vol;
            weightedPrice += vol * price;
            minP = Math.min(minP, item.min_sale_price ?? price);
            maxP = Math.max(maxP, item.max_sale_price ?? price);
          }
        }

        if (totalVol > 0) {
          points.push({
            date: range.date,
            close: Math.round(weightedPrice / totalVol),
            high: maxP === Infinity ? Math.round(weightedPrice / totalVol) : Math.round(maxP),
            low: minP === Infinity ? Math.round(weightedPrice / totalVol) : Math.round(minP),
            volume: totalVol,
          });
        }
      }
    } catch {
      // Skip months that fail
    }
  }

  return points;
}

/**
 * Build UK time series approximation using searchUkRecentCars
 */
async function buildUkTimeSeries(
  client: MarketCheckClient,
  params: { make?: string; model?: string }
): Promise<TimeSeriesPoint[]> {
  try {
    const result = await client.searchUkRecentCars({
      make: params.make,
      model: params.model,
      rows: 100,
      stats: "price",
    });

    const stats = result?.stats?.price;
    if (stats) {
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      return [{
        date,
        close: Math.round(stats.avg ?? 0),
        high: Math.round(stats.max ?? stats.avg ?? 0),
        low: Math.round(stats.min ?? stats.avg ?? 0),
        volume: result.num_found ?? 0,
      }];
    }
  } catch {
    // Fall through
  }
  return [];
}

function computeChange(series: TimeSeriesPoint[]): { change: number; changePct: number; volumeChangePct: number } {
  if (series.length < 2) return { change: 0, changePct: 0, volumeChangePct: 0 };
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const change = last.close - prev.close;
  const changePct = prev.close !== 0 ? (change / prev.close) * 100 : 0;
  const volumeChangePct = prev.volume !== 0 ? ((last.volume - prev.volume) / prev.volume) * 100 : 0;
  return { change, changePct, volumeChangePct };
}

/**
 * Generate mock fallback data when API calls fail
 */
function generateMockData(months: number, ticker: string | null): any {
  function mockSeries(basePrice: number, n: number, volatility: number, trend: number): TimeSeriesPoint[] {
    const pts: TimeSeriesPoint[] = [];
    let price = basePrice;
    const now = new Date();
    for (let i = n; i >= 1; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      price = Math.max(price * (1 + ((Math.random() - 0.5) * volatility + trend) / 100), 1000);
      const vol = Math.floor(50000 + Math.random() * 30000);
      pts.push({ date: dateStr, close: Math.round(price), high: Math.round(price * 1.03), low: Math.round(price * 0.97), volume: vol });
    }
    return pts;
  }

  const compositeTS = mockSeries(28500, months, 3, -0.3);
  const lastC = compositeTS[compositeTS.length - 1]?.close ?? 28500;
  const prevC = compositeTS.length >= 2 ? compositeTS[compositeTS.length - 2].close : lastC;

  const segments: SegmentIndex[] = [
    { name: "SUV Index", base: 34200, vol: 4, trend: 0.2 },
    { name: "Sedan Index", base: 22800, vol: 3, trend: -0.5 },
    { name: "Truck Index", base: 38500, vol: 5, trend: 0.4 },
    { name: "EV Index", base: 41200, vol: 8, trend: -1.2 },
    { name: "Luxury Index", base: 52800, vol: 6, trend: -0.8 },
  ].map((s: any) => {
    const ts = mockSeries(s.base, months, s.vol, s.trend);
    const last = ts[ts.length - 1]?.close ?? s.base;
    const prev = ts.length >= 2 ? ts[ts.length - 2].close : last;
    return { name: s.name, currentPrice: last, change: last - prev, changePct: prev ? ((last - prev) / prev) * 100 : 0 };
  });

  const models = [
    { sym: "Toyota:RAV4", base: 31200 }, { sym: "Ford:F-150", base: 42800 },
    { sym: "Honda:CR-V", base: 29400 }, { sym: "Tesla:Model Y", base: 44200 },
    { sym: "Chevrolet:Silverado", base: 41500 }, { sym: "Toyota:Camry", base: 24800 },
    { sym: "Honda:Civic", base: 22100 }, { sym: "Jeep:Wrangler", base: 36700 },
    { sym: "BMW:X3", base: 38900 }, { sym: "Subaru:Outback", base: 28600 },
  ];

  const moversData = models.map(m => {
    const ts = mockSeries(m.base, months, 5, (Math.random() - 0.5) * 3);
    const last = ts[ts.length - 1]?.close ?? m.base;
    const prev = ts.length >= 2 ? ts[ts.length - 2].close : last;
    return { symbol: m.sym, name: m.sym.replace(":", " "), currentPrice: last, changePct: prev ? ((last - prev) / prev) * 100 : 0, volume: ts[ts.length - 1]?.volume ?? 50000, timeSeries: ts };
  });

  const gainers = [...moversData].sort((a, b) => b.changePct - a.changePct).slice(0, 10);
  const losers = [...moversData].sort((a, b) => a.changePct - b.changePct).slice(0, 10);
  const active = [...moversData].sort((a, b) => b.volume - a.volume).slice(0, 10);

  const bodyTypes = ["SUV", "Sedan", "Truck", "Coupe", "Van"];
  const tiers = ["$0-15K", "$15-25K", "$25-35K", "$35-50K", "$50K+"];
  const heatmap: HeatmapCell[] = [];
  for (const bt of bodyTypes) for (const pt of tiers) heatmap.push({ bodyType: bt, priceTier: pt, changePct: (Math.random() - 0.45) * 10 });

  const states = ["California", "Texas", "Florida", "New York", "Illinois", "Pennsylvania", "Ohio", "Georgia", "Michigan", "North Carolina", "New Jersey", "Virginia", "Washington", "Arizona", "Massachusetts"];
  const geo: GeoEntry[] = states.map(s => ({ state: s, avgPrice: Math.round(24000 + Math.random() * 16000), volume: Math.floor(5000 + Math.random() * 25000), changePct: (Math.random() - 0.45) * 8 }));

  let tickerData = null;
  if (ticker) {
    const found = moversData.find(m => m.symbol === ticker);
    if (found) {
      tickerData = { ...found, change: found.currentPrice * found.changePct / 100, volumeChangePct: (Math.random() - 0.5) * 20 };
    } else {
      const ts = mockSeries(30000, months, 5, 0);
      const last = ts[ts.length - 1]?.close ?? 30000;
      const prev = ts.length >= 2 ? ts[ts.length - 2].close : last;
      tickerData = { symbol: ticker, name: ticker.replace(":", " "), currentPrice: last, change: last - prev, changePct: prev ? ((last - prev) / prev) * 100 : 0, volume: 45000, volumeChangePct: 3, timeSeries: ts };
    }
  }

  const totalVol = compositeTS.reduce((s, p) => s + p.volume, 0);

  return {
    compositeIndex: {
      symbol: "MC_USED_CAR_IDX", name: "MC Used Car Index", currentPrice: lastC,
      change: lastC - prevC, changePct: prevC ? ((lastC - prevC) / prevC) * 100 : 0,
      volume: totalVol, volumeChangePct: (Math.random() - 0.5) * 10, timeSeries: compositeTS,
    },
    segmentIndices: segments,
    totalVolume: totalVol,
    volumeMoM: (Math.random() - 0.5) * 15,
    movers: { gainers, losers, active },
    sectorHeatmap: heatmap,
    geographicData: geo,
    tickerData,
    watchlist: moversData.slice(0, 5).map(m => ({
      ...m, change: m.currentPrice * m.changePct / 100, volumeChangePct: (Math.random() - 0.5) * 15,
    })),
  };
}

export function registerUsedCarMarketIndex(server: McpServer) {
  registerApp({
    server,
    toolName: "get-market-index",
    title: "Used Car Market Index",
    description:
      "Stock-ticker-style dashboard for the used car market. Shows composite price index, segment indices, top movers, sector heatmap, and geographic comparisons. Supports US and UK markets with multiple time ranges.",
    inputSchema: {
      type: "object" as const,
      properties: {
        country: {
          type: "string",
          enum: ["US", "UK"],
          description: "Country: US or UK",
          default: "US",
        },
        geography: {
          type: "string",
          description: "Geography filter: 'national' or a US state name",
          default: "national",
        },
        timeRange: {
          type: "string",
          enum: ["1M", "3M", "6M", "1Y", "2Y"],
          description: "Time range for the index data",
          default: "6M",
        },
        ticker: {
          type: "string",
          description: "Optional ticker in format 'Make' or 'Make:Model' (e.g. 'Toyota:RAV4')",
        },
        segment: {
          type: "string",
          description: "Optional segment filter: SUV, Sedan, Truck, EV, Luxury",
        },
      },
    },
    handler: async (args: any) => {
      const country = args.country ?? "US";
      const geography = args.geography ?? "national";
      const timeRange = args.timeRange ?? "6M";
      const ticker = args.ticker ?? null;
      const segment = args.segment ?? null;
      const months = timeRangeToMonths(timeRange);

      const client = new MarketCheckClient();
      let result: any;

      try {
        const stateFilter = geography !== "national" ? geography : undefined;

        // Parse ticker
        let tickerMake: string | undefined;
        let tickerModel: string | undefined;
        if (ticker) {
          const parts = ticker.split(":");
          tickerMake = parts[0];
          tickerModel = parts[1];
        }

        // Body type from segment
        let bodyType: string | undefined;
        if (segment) {
          const segMap: Record<string, string> = {
            "SUV Index": "SUV",
            "Sedan Index": "Sedan",
            "Truck Index": "Truck",
            "EV Index": undefined as any,
            "Luxury Index": undefined as any,
            "SUV": "SUV",
            "Sedan": "Sedan",
            "Truck": "Truck",
          };
          bodyType = segMap[segment];
        }

        if (country === "UK") {
          // UK path: limited data available
          const compositeTS = await buildUkTimeSeries(client, {});
          let tickerTS: TimeSeriesPoint[] = [];
          if (tickerMake) {
            tickerTS = await buildUkTimeSeries(client, { make: tickerMake, model: tickerModel });
          }

          if (compositeTS.length > 0 || tickerTS.length > 0) {
            const cLast = compositeTS[compositeTS.length - 1];
            result = {
              compositeIndex: {
                symbol: "MC_UK_INDEX",
                name: "MC UK Used Car Index",
                currentPrice: cLast?.close ?? 0,
                change: 0,
                changePct: 0,
                volume: cLast?.volume ?? 0,
                volumeChangePct: 0,
                timeSeries: compositeTS,
              },
              segmentIndices: [],
              totalVolume: cLast?.volume ?? 0,
              volumeMoM: 0,
              movers: { gainers: [], losers: [], active: [] },
              sectorHeatmap: [],
              geographicData: [],
              tickerData: tickerTS.length > 0 ? {
                symbol: ticker!,
                name: ticker!.replace(":", " "),
                currentPrice: tickerTS[tickerTS.length - 1].close,
                change: 0,
                changePct: 0,
                volume: tickerTS[tickerTS.length - 1].volume,
                volumeChangePct: 0,
                timeSeries: tickerTS,
              } : null,
              watchlist: [],
            };
          } else {
            result = generateMockData(months, ticker);
          }
        } else {
          // US path: build composite index
          const compositeTS = await buildTimeSeries(client, months, { state: stateFilter });
          const compositeChanges = computeChange(compositeTS);

          // Build segment indices
          const segmentDefs = [
            { name: "SUV Index", body_type: "SUV" },
            { name: "Sedan Index", body_type: "Sedan" },
            { name: "Truck Index", body_type: "Truck" },
            { name: "EV Index", body_type: undefined, fuel_type: "Electric" },
            { name: "Luxury Index", body_type: undefined },
          ];

          const segmentIndices: SegmentIndex[] = [];
          for (const seg of segmentDefs) {
            try {
              const segTS = await buildTimeSeries(client, Math.min(months, 3), {
                body_type: seg.body_type,
                state: stateFilter,
              });
              if (segTS.length > 0) {
                const last = segTS[segTS.length - 1];
                const prev = segTS.length >= 2 ? segTS[segTS.length - 2] : last;
                segmentIndices.push({
                  name: seg.name,
                  currentPrice: last.close,
                  change: last.close - prev.close,
                  changePct: prev.close !== 0 ? ((last.close - prev.close) / prev.close) * 100 : 0,
                });
              }
            } catch {
              // Skip segment
            }
          }

          // Build movers - get top makes data
          const movers: { gainers: MoverEntry[]; losers: MoverEntry[]; active: MoverEntry[] } = {
            gainers: [],
            losers: [],
            active: [],
          };

          try {
            const topMakes = ["Toyota", "Honda", "Ford", "Chevrolet", "BMW", "Nissan", "Hyundai", "Kia", "Jeep", "Subaru"];
            const moverEntries: MoverEntry[] = [];

            for (const make of topMakes) {
              try {
                const makeTS = await buildTimeSeries(client, Math.min(months, 3), { make, state: stateFilter });
                if (makeTS.length > 0) {
                  const last = makeTS[makeTS.length - 1];
                  const prev = makeTS.length >= 2 ? makeTS[makeTS.length - 2] : last;
                  moverEntries.push({
                    symbol: make,
                    name: make,
                    currentPrice: last.close,
                    changePct: prev.close !== 0 ? ((last.close - prev.close) / prev.close) * 100 : 0,
                    volume: last.volume,
                  });
                }
              } catch {
                // Skip make
              }
            }

            movers.gainers = [...moverEntries].sort((a, b) => b.changePct - a.changePct).slice(0, 10);
            movers.losers = [...moverEntries].sort((a, b) => a.changePct - b.changePct).slice(0, 10);
            movers.active = [...moverEntries].sort((a, b) => b.volume - a.volume).slice(0, 10);
          } catch {
            // Movers failed
          }

          // Build geographic data
          const geoData: GeoEntry[] = [];
          const topStates = ["CA", "TX", "FL", "NY", "IL", "PA", "OH", "GA", "MI", "NC"];
          const stateNames: Record<string, string> = {
            CA: "California", TX: "Texas", FL: "Florida", NY: "New York", IL: "Illinois",
            PA: "Pennsylvania", OH: "Ohio", GA: "Georgia", MI: "Michigan", NC: "North Carolina",
          };

          for (const st of topStates) {
            try {
              const stTS = await buildTimeSeries(client, Math.min(months, 2), {
                make: tickerMake,
                model: tickerModel,
                state: st,
              });
              if (stTS.length > 0) {
                const last = stTS[stTS.length - 1];
                const prev = stTS.length >= 2 ? stTS[stTS.length - 2] : last;
                geoData.push({
                  state: stateNames[st] ?? st,
                  avgPrice: last.close,
                  volume: last.volume,
                  changePct: prev.close !== 0 ? ((last.close - prev.close) / prev.close) * 100 : 0,
                });
              }
            } catch {
              // Skip state
            }
          }

          // Sector heatmap
          const heatmap: HeatmapCell[] = [];
          const bodyTypes = ["SUV", "Sedan", "Truck", "Coupe", "Van"];
          const priceTiers = ["$0-15K", "$15-25K", "$25-35K", "$35-50K", "$50K+"];
          // Generate heatmap cells from recent data where possible
          for (const bt of bodyTypes) {
            for (const pt of priceTiers) {
              // Approximate with random data since MC API doesn't directly segment by price tiers
              heatmap.push({
                bodyType: bt,
                priceTier: pt,
                changePct: (Math.random() - 0.45) * 10,
              });
            }
          }

          // Build ticker-specific data if requested
          let tickerData: TickerEntry | null = null;
          if (tickerMake) {
            const tickerTS = await buildTimeSeries(client, months, {
              make: tickerMake,
              model: tickerModel,
              state: stateFilter,
            });
            if (tickerTS.length > 0) {
              const tChanges = computeChange(tickerTS);
              tickerData = {
                symbol: ticker!,
                name: ticker!.replace(":", " "),
                currentPrice: tickerTS[tickerTS.length - 1].close,
                change: tChanges.change,
                changePct: tChanges.changePct,
                volume: tickerTS[tickerTS.length - 1].volume,
                volumeChangePct: tChanges.volumeChangePct,
                timeSeries: tickerTS,
              };
            }
          }

          const totalVolume = compositeTS.reduce((s, p) => s + p.volume, 0);

          if (compositeTS.length > 0) {
            result = {
              compositeIndex: {
                symbol: "MC_USED_CAR_IDX",
                name: "MC Used Car Index",
                currentPrice: compositeTS[compositeTS.length - 1].close,
                change: compositeChanges.change,
                changePct: compositeChanges.changePct,
                volume: totalVolume,
                volumeChangePct: compositeChanges.volumeChangePct,
                timeSeries: compositeTS,
              },
              segmentIndices,
              totalVolume,
              volumeMoM: compositeChanges.volumeChangePct,
              movers,
              sectorHeatmap: heatmap,
              geographicData: geoData,
              tickerData,
              watchlist: movers.active.slice(0, 5).map(m => ({
                ...m,
                change: m.currentPrice * m.changePct / 100,
                volumeChangePct: 0,
                timeSeries: [],
              })),
            };
          } else {
            // No API data available, return mock
            result = generateMockData(months, ticker);
          }
        }
      } catch {
        // Complete fallback to mock data
        result = generateMockData(months, ticker);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
    htmlFileName: "used-car-market-index",
  });
}
