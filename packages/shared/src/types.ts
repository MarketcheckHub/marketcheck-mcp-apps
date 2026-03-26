// Common types for MarketCheck MCP tool results

export interface MCToolResult {
  content: Array<{ type: string; text: string }>;
}

export interface MCListing {
  id?: string;
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  price?: number;
  miles?: number;
  msrp?: number;
  body_type?: string;
  fuel_type?: string;
  transmission?: string;
  drivetrain?: string;
  engine?: string;
  exterior_color?: string;
  interior_color?: string;
  is_certified?: boolean;
  days_on_market?: number;
  seller_type?: string;
  dealer?: {
    dealer_id?: string;
    name?: string;
    city?: string;
    state?: string;
    zip?: string;
    rating?: number;
  };
  location?: {
    zip?: string;
    city?: string;
    state?: string;
    latitude?: number;
    longitude?: number;
  };
  media?: {
    photo_links?: string[];
  };
  vdp_url?: string;
  first_seen?: string;
  last_seen?: string;
  price_change?: number;
  price_change_percent?: number;
}

export interface MCSearchResult {
  num_found: number;
  start: number;
  rows: number;
  listings: MCListing[];
  facets?: Record<string, Array<{ value: string; count: number }>>;
  stats?: {
    price?: MCStatField;
    miles?: MCStatField;
    dom?: MCStatField;
  };
}

export interface MCStatField {
  min: number;
  max: number;
  avg: number;
  median?: number;
  sum?: number;
  std?: number;
  count?: number;
}

export interface MCPriceResult {
  predicted_price?: number;
  msrp?: number;
  price_range?: { low: number; high: number };
  comparables?: MCListing[];
}

export interface MCSoldSummaryItem {
  make?: string;
  model?: string;
  body_type?: string;
  fuel_type_category?: string;
  state?: string;
  city_state?: string;
  dealership_group_name?: string;
  sold_count?: number;
  average_sale_price?: number;
  total_sale_price?: number;
  min_sale_price?: number;
  max_sale_price?: number;
  std_sale_price?: number;
  average_days_on_market?: number;
  median_days_on_market?: number;
  price_over_msrp_percentage?: number;
}

export interface MCSoldSummary {
  items: MCSoldSummaryItem[];
  total_count?: number;
}

export interface MCVinDecode {
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  body_type?: string;
  engine?: string;
  transmission?: string;
  drivetrain?: string;
  fuel_type?: string;
  msrp?: number;
  city_mpg?: number;
  highway_mpg?: number;
  combined_mpg?: number;
  cylinders?: number;
  doors?: number;
  overall_height?: string;
  overall_length?: string;
  overall_width?: string;
  wheelbase?: string;
  curb_weight?: string;
}

export interface MCCarHistoryEntry {
  vin?: string;
  price?: number;
  miles?: number;
  dealer?: { name?: string; city?: string; state?: string };
  first_seen?: string;
  last_seen?: string;
  is_certified?: boolean;
}

export interface MCCarHistory {
  listings: MCCarHistoryEntry[];
}

export interface MCIncentive {
  id?: string;
  type?: string;
  title?: string;
  description?: string;
  amount?: number;
  apr?: number;
  term_months?: number;
  models?: string[];
  start_date?: string;
  end_date?: string;
  stackable?: boolean;
}

// App-level types

export interface TickerData {
  symbol: string;       // e.g., "Toyota:RAV4" or "SUV_INDEX"
  name: string;
  currentPrice: number;
  priorPrice: number;
  change: number;
  changePct: number;
  volume: number;
  volumeChange: number;
  high52w: number;
  low52w: number;
  timeSeries: TimeSeriesPoint[];
}

export interface TimeSeriesPoint {
  date: string;         // YYYY-MM
  open: number;         // prior month close
  close: number;        // avg sale price
  high: number;         // max sale price
  low: number;          // min sale price
  volume: number;       // sold count
}

export interface HealthScore {
  score: number;        // 0-100
  label: "STRONG" | "STABLE" | "WATCH" | "WEAK";
  color: string;
}

export interface Signal {
  direction: "BULLISH" | "BEARISH" | "NEUTRAL" | "MIXED";
  strength: "STRONG" | "MODERATE" | "WEAK";
  color: string;
}

export interface DealVerdict {
  label: "GREAT_DEAL" | "FAIR_DEAL" | "ABOVE_MARKET" | "OVERPRICED";
  color: string;
  title: string;
  description: string;
}

export interface ValuationTier {
  label: string;
  value: number;
  low: number;
  high: number;
}

export interface LTVRisk {
  label: "ACCEPTABLE" | "WARNING" | "HIGH_RISK" | "UNDERWATER";
  color: string;
  ltv: number;
}

export interface TotalLossDetermination {
  label: "NOT_TOTAL_LOSS" | "LIKELY_TOTAL_LOSS" | "TOTAL_LOSS";
  color: string;
  fmv: number;
  threshold: number;
}
