import type { TimeSeriesPoint, MCSoldSummaryItem } from "./types.js";

/**
 * Calculate a volume-weighted price index from sold summary data.
 * Rebased so the first period = 100.
 */
export function calculateIndex(
  monthlySummaries: Array<{ date: string; items: MCSoldSummaryItem[] }>
): TimeSeriesPoint[] {
  if (monthlySummaries.length === 0) return [];

  const points: TimeSeriesPoint[] = [];
  let basePrice: number | null = null;

  for (let i = 0; i < monthlySummaries.length; i++) {
    const { date, items } = monthlySummaries[i];
    let totalVolume = 0;
    let weightedPrice = 0;
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    for (const item of items) {
      const vol = item.sold_count ?? 0;
      const price = item.average_sale_price ?? 0;
      if (vol > 0 && price > 0) {
        totalVolume += vol;
        weightedPrice += vol * price;
        minPrice = Math.min(minPrice, item.min_sale_price ?? price);
        maxPrice = Math.max(maxPrice, item.max_sale_price ?? price);
      }
    }

    if (totalVolume === 0) continue;

    const avgPrice = weightedPrice / totalVolume;
    if (basePrice === null) basePrice = avgPrice;

    const priorClose = i > 0 && points.length > 0 ? points[points.length - 1].close : avgPrice;

    points.push({
      date,
      open: priorClose,
      close: avgPrice,
      high: maxPrice === -Infinity ? avgPrice : maxPrice,
      low: minPrice === Infinity ? avgPrice : minPrice,
      volume: totalVolume,
    });
  }

  return points;
}

/**
 * Normalize a time series so the first point = 100
 */
export function normalizeToIndex(points: TimeSeriesPoint[]): TimeSeriesPoint[] {
  if (points.length === 0) return [];
  const base = points[0].close;
  if (base === 0) return points;
  return points.map(p => ({
    ...p,
    open: (p.open / base) * 100,
    close: (p.close / base) * 100,
    high: (p.high / base) * 100,
    low: (p.low / base) * 100,
  }));
}

/**
 * Calculate depreciation rate between two price points
 */
export function calculateDepreciationRate(
  currentPrice: number,
  priorPrice: number,
  monthsBetween: number
): { monthlyRate: number; annualRate: number; retentionPct: number } {
  if (priorPrice === 0 || monthsBetween === 0) {
    return { monthlyRate: 0, annualRate: 0, retentionPct: 100 };
  }
  const totalChange = (priorPrice - currentPrice) / priorPrice;
  const monthlyRate = totalChange / monthsBetween;
  return {
    monthlyRate: monthlyRate * 100,
    annualRate: monthlyRate * 12 * 100,
    retentionPct: ((currentPrice / priorPrice) * 100),
  };
}

/**
 * Calculate days supply from active inventory and monthly sold volume
 */
export function calculateDaysSupply(activeCount: number, monthlySold: number): number {
  if (monthlySold === 0) return 999;
  return Math.round((activeCount / monthlySold) * 30);
}

/**
 * Calculate demand-to-supply ratio
 */
export function calculateDSRatio(monthlySold: number, activeCount: number): number {
  if (activeCount === 0) return 99;
  return Math.round((monthlySold / activeCount) * 100) / 100;
}

/**
 * Classify days supply into market health categories
 */
export function classifyDaysSupply(daysSupply: number): {
  label: string;
  color: string;
} {
  if (daysSupply < 30) return { label: "HOT — Demand > Supply", color: "#ef4444" };
  if (daysSupply <= 60) return { label: "BALANCED", color: "#10b981" };
  if (daysSupply <= 90) return { label: "SUPPLY BUILDING", color: "#f59e0b" };
  return { label: "GLUT", color: "#6b7280" };
}

/**
 * Generate date ranges for monthly time series queries
 */
export function generateMonthlyRanges(monthsBack: number, fromDate?: Date): Array<{ date: string; dateFrom: string; dateTo: string }> {
  const now = fromDate ?? new Date();
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
