import type { HealthScore, Signal, DealVerdict, LTVRisk, TotalLossDetermination } from "./types.js";

export function formatCurrency(value: number | undefined, compact = false): string {
  if (value == null) return "N/A";
  if (compact && Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (compact && Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function formatPercent(value: number | undefined, decimals = 1): string {
  if (value == null) return "N/A";
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number | undefined, compact = false): string {
  if (value == null) return "N/A";
  if (compact && Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (compact && Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

export function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function classifySignal(metrics: { volumeChangePct?: number; aspChangePct?: number; domChange?: number }): Signal {
  let bullCount = 0;
  let bearCount = 0;

  if (metrics.volumeChangePct != null) {
    if (metrics.volumeChangePct > 3) bullCount++;
    else if (metrics.volumeChangePct < -3) bearCount++;
  }
  if (metrics.aspChangePct != null) {
    if (metrics.aspChangePct > 1) bullCount++;
    else if (metrics.aspChangePct < -1) bearCount++;
  }
  if (metrics.domChange != null) {
    if (metrics.domChange < -2) bullCount++;
    else if (metrics.domChange > 2) bearCount++;
  }

  const total = bullCount + bearCount;
  if (total === 0) return { direction: "NEUTRAL", strength: "WEAK", color: "#6b7280" };
  if (bullCount > 0 && bearCount > 0) return { direction: "MIXED", strength: total >= 4 ? "STRONG" : "MODERATE", color: "#f59e0b" };
  if (bullCount > bearCount) return { direction: "BULLISH", strength: bullCount >= 3 ? "STRONG" : bullCount >= 2 ? "MODERATE" : "WEAK", color: "#10b981" };
  return { direction: "BEARISH", strength: bearCount >= 3 ? "STRONG" : bearCount >= 2 ? "MODERATE" : "WEAK", color: "#ef4444" };
}

export function classifyHealth(score: number): HealthScore {
  if (score >= 80) return { score, label: "STRONG", color: "#10b981" };
  if (score >= 60) return { score, label: "STABLE", color: "#3b82f6" };
  if (score >= 40) return { score, label: "WATCH", color: "#f59e0b" };
  return { score, label: "WEAK", color: "#ef4444" };
}

export function classifyDeal(askingPrice: number, predictedPrice: number, percentile: number): DealVerdict {
  if (percentile <= 20) return { label: "GREAT_DEAL", color: "#10b981", title: "Great Deal", description: "Buy with confidence" };
  if (percentile <= 60) return { label: "FAIR_DEAL", color: "#f59e0b", title: "Fair Deal", description: "Room to negotiate" };
  if (percentile <= 85) return { label: "ABOVE_MARKET", color: "#f97316", title: "Above Market", description: "Negotiate hard or walk away" };
  return { label: "OVERPRICED", color: "#ef4444", title: "Overpriced", description: "Pass on this one" };
}

export function classifyLTV(ltv: number): LTVRisk {
  if (ltv <= 100) return { label: "ACCEPTABLE", color: "#10b981", ltv };
  if (ltv <= 120) return { label: "WARNING", color: "#f59e0b", ltv };
  if (ltv <= 140) return { label: "HIGH_RISK", color: "#f97316", ltv };
  return { label: "UNDERWATER", color: "#ef4444", ltv };
}

export function classifyTotalLoss(fmv: number, repairEstimate: number, thresholdPct = 0.75): TotalLossDetermination {
  const threshold = fmv * thresholdPct;
  if (repairEstimate < threshold * 0.8) return { label: "NOT_TOTAL_LOSS", color: "#10b981", fmv, threshold };
  if (repairEstimate < threshold) return { label: "LIKELY_TOTAL_LOSS", color: "#f59e0b", fmv, threshold };
  return { label: "TOTAL_LOSS", color: "#ef4444", fmv, threshold };
}

export function trendArrow(change: number): string {
  if (change > 0) return "▲";
  if (change < 0) return "▼";
  return "—";
}

export function trendColor(change: number): string {
  if (change > 0) return "#10b981";
  if (change < 0) return "#ef4444";
  return "#6b7280";
}
