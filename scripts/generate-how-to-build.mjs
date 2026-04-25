#!/usr/bin/env node
/**
 * Generates "How to Build" guide pages for all apps under public/app/{id}/index.html
 * Each page explains the API calls, sequencing, parameters, and provides a visual flow diagram.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_APP = path.join(ROOT, "public", "app");

// ── Segment colors (match gallery) ──────────────────────────────────────
const SEGMENT_COLORS = {
  "Consumer": "#10b981",
  "Dealer": "#f59e0b",
  "Appraiser": "#3b82f6",
  "Dealership Group": "#f97316",
  "Lender": "#06b6d4",
  "Analyst": "#8b5cf6",
  "Insurer": "#ec4899",
  "Manufacturer": "#ef4444",
  "Auction House": "#84cc16",
  "Wholesaler": "#78716c",
  "Cross-Segment": "#a78bfa",
  "Consumer (UK)": "#10b981",
  "Dealer (UK)": "#f59e0b",
  "Auto Media": "#d946ef",
  "Fleet Manager": "#059669",
  "Rental/Subscription": "#0ea5e9",
  "Lender Sales": "#14b8a6",
  "Chat Demos": "#6366f1",
};

// ── API Endpoint Reference ──────────────────────────────────────────────
const API_ENDPOINTS = {
  decode: {
    method: "GET",
    path: "/v2/decode/car/neovin/{vin}/specs",
    name: "VIN Decode",
    description: "Decodes a VIN into full vehicle specs — year, make, model, trim, engine, transmission, body type, drivetrain, and 100+ attributes.",
    docUrl: "https://apidocs.marketcheck.com/#decode-vin",
    params: [
      { name: "vin", type: "string", required: true, desc: "17-character Vehicle Identification Number" },
    ],
    returns: "Vehicle specs object: year, make, model, trim, engine, transmission, body_type, drivetrain, fuel_type, etc.",
  },
  predictRetail: {
    method: "GET",
    path: "/v2/predict/car/us/marketcheck_price/comparables",
    name: "Price Prediction (Retail / Franchise)",
    description: "Predicts the fair market price for a used vehicle from franchise dealer perspective. Returns predicted price, confidence interval, price range, and comparable vehicles used in the prediction.",
    docUrl: "https://apidocs.marketcheck.com/#price-prediction",
    params: [
      { name: "vin", type: "string", required: true, desc: "17-character VIN" },
      { name: "miles", type: "number", required: false, desc: "Current mileage" },
      { name: "zip", type: "string", required: false, desc: "ZIP code for local pricing" },
      { name: "dealer_type", type: "string", required: false, desc: "Set to 'franchise' for retail pricing" },
    ],
    returns: "predicted_price, price_range (low/high), comparables[] with vin, price, miles, distance",
  },
  predictWholesale: {
    method: "GET",
    path: "/v2/predict/car/us/marketcheck_price/comparables",
    name: "Price Prediction (Wholesale / Independent)",
    description: "Predicts wholesale/independent dealer price. Same endpoint as retail but with dealer_type=independent. Returns lower price band used for trade-in and wholesale valuations.",
    docUrl: "https://apidocs.marketcheck.com/#price-prediction",
    params: [
      { name: "vin", type: "string", required: true, desc: "17-character VIN" },
      { name: "miles", type: "number", required: false, desc: "Current mileage" },
      { name: "zip", type: "string", required: false, desc: "ZIP code for local pricing" },
      { name: "dealer_type", type: "string", required: false, desc: "Set to 'independent' for wholesale pricing" },
    ],
    returns: "predicted_price, price_range (low/high), comparables[]",
  },
  searchActive: {
    method: "GET",
    path: "/v2/search/car/active",
    name: "Search Active Listings",
    description: "Search currently active car listings across 95%+ of US dealer inventory. Supports filters by make, model, year, ZIP, radius, price range, body type, and more. Returns listing details with photos, dealer info, and computed statistics.",
    docUrl: "https://apidocs.marketcheck.com/#search-active",
    params: [
      { name: "make", type: "string", required: false, desc: "Vehicle make (e.g., Toyota)" },
      { name: "model", type: "string", required: false, desc: "Vehicle model (e.g., Camry)" },
      { name: "year", type: "string", required: false, desc: "Year or range (e.g., 2020-2022)" },
      { name: "zip", type: "string", required: false, desc: "Center ZIP for radius search" },
      { name: "radius", type: "number", required: false, desc: "Search radius in miles" },
      { name: "rows", type: "number", required: false, desc: "Number of results (max 50)" },
      { name: "stats", type: "string", required: false, desc: "Aggregate stats: price,miles,dom" },
      { name: "sort_by", type: "string", required: false, desc: "Sort field: price, miles, dom" },
      { name: "sort_order", type: "string", required: false, desc: "asc or desc" },
      { name: "dealer_id", type: "string", required: false, desc: "Filter by dealer ID" },
      { name: "facets", type: "string", required: false, desc: "Facet fields: make,model,body_type" },
    ],
    returns: "num_found, listings[] with id, vin, price, miles, dom, dealer{}, media{}, stats{}",
  },
  searchRecents: {
    method: "GET",
    path: "/v2/search/car/recents",
    name: "Search Recently Sold (Past 90 Days)",
    description: "Search vehicles sold/delisted in the past 90 days. Essential for market comparables, pricing validation, and trend analysis.",
    docUrl: "https://apidocs.marketcheck.com/#search-recents",
    params: [
      { name: "make", type: "string", required: false, desc: "Vehicle make" },
      { name: "model", type: "string", required: false, desc: "Vehicle model" },
      { name: "year", type: "string", required: false, desc: "Year or range" },
      { name: "zip", type: "string", required: false, desc: "Center ZIP" },
      { name: "radius", type: "number", required: false, desc: "Search radius in miles" },
      { name: "rows", type: "number", required: false, desc: "Number of results" },
      { name: "stats", type: "string", required: false, desc: "Aggregate stats: price" },
    ],
    returns: "num_found, listings[] with sold price, miles, dealer, stats{}",
  },
  carHistory: {
    method: "GET",
    path: "/v2/history/car/{vin}",
    name: "Car History (Listing Timeline)",
    description: "Returns the complete listing history of a VIN — every time it appeared on a dealer lot, with price, mileage, dealer, and dates. Reveals dealer hops, price changes, and time-on-market patterns.",
    docUrl: "https://apidocs.marketcheck.com/#car-history",
    params: [
      { name: "vin", type: "string", required: true, desc: "17-character VIN" },
      { name: "sort_order", type: "string", required: false, desc: "asc (oldest first) or desc" },
    ],
    returns: "listings[] with price, miles, first_seen, last_seen, dealer{name, city, state}",
  },
  soldSummary: {
    method: "GET",
    path: "/api/v1/sold-vehicles/summary",
    name: "Sold Vehicle Summary (Market Intelligence)",
    enterprise: true,
    description: "Aggregated market intelligence from sold vehicle data. Rankings by make, model, body type, state. Returns sold counts, average prices, days-on-market, and market share data.",
    docUrl: "https://apidocs.marketcheck.com/#sold-summary",
    params: [
      { name: "ranking_dimensions", type: "string", required: false, desc: "Dimensions: make, model, body_type, state, fuel_type_category" },
      { name: "ranking_measure", type: "string", required: false, desc: "Measures: sold_count, average_sale_price, average_days_on_market" },
      { name: "ranking_order", type: "string", required: false, desc: "desc or asc" },
      { name: "top_n", type: "number", required: false, desc: "Top N results" },
      { name: "state", type: "string", required: false, desc: "2-letter state code" },
      { name: "inventory_type", type: "string", required: false, desc: "Used or New" },
    ],
    returns: "rankings[] with dimension values, sold_count, average_sale_price, market_share",
  },
  incentives: {
    method: "GET",
    path: "/v2/search/car/incentive/oem",
    name: "OEM Incentives",
    description: "Search OEM incentive programs — cash back, APR specials, lease deals. Filter by make, model, and region. Returns offer details, amounts, terms, and eligibility.",
    docUrl: "https://apidocs.marketcheck.com/#incentives",
    params: [
      { name: "make", type: "string", required: false, desc: "OEM brand (e.g., Toyota)" },
      { name: "model", type: "string", required: false, desc: "Vehicle model" },
      { name: "zip", type: "string", required: false, desc: "ZIP for regional incentives" },
      { name: "rows", type: "number", required: false, desc: "Number of results" },
    ],
    returns: "listings[] with offer{type, amounts[], vehicles[], valid_through, disclaimers[]}",
  },
  searchUkActive: {
    method: "GET",
    path: "/v2/search/car/uk/active",
    name: "Search UK Active Listings",
    description: "Search currently active car listings across UK dealers. Returns listings with prices in GBP, mileage in miles, and UK-specific dealer information.",
    docUrl: "https://apidocs.marketcheck.com/#search-uk-active",
    params: [
      { name: "make", type: "string", required: false, desc: "Vehicle make" },
      { name: "model", type: "string", required: false, desc: "Vehicle model" },
      { name: "postal_code", type: "string", required: false, desc: "UK postal code" },
      { name: "radius", type: "number", required: false, desc: "Search radius in miles" },
      { name: "rows", type: "number", required: false, desc: "Number of results" },
      { name: "stats", type: "string", required: false, desc: "Aggregate stats: price,miles" },
    ],
    returns: "num_found, listings[] with price, miles, dealer{}, stats{}",
  },
  searchUkRecents: {
    method: "GET",
    path: "/v2/search/car/uk/recents",
    name: "Search UK Recently Sold",
    description: "Search recently sold/delisted UK car listings for market comparables and trend analysis.",
    docUrl: "https://apidocs.marketcheck.com/#search-uk-recents",
    params: [
      { name: "make", type: "string", required: false, desc: "Vehicle make" },
      { name: "model", type: "string", required: false, desc: "Vehicle model" },
      { name: "rows", type: "number", required: false, desc: "Number of results" },
      { name: "stats", type: "string", required: false, desc: "Aggregate stats: price" },
    ],
    returns: "num_found, listings[], stats{}",
  },
};

// ── App Definitions ─────────────────────────────────────────────────────
// Each app defines: id, name, tagline, segment, toolName (proxy endpoint),
// description, inputParams, apiFlow (steps with API calls and sequencing),
// and what the app renders from the results.

const APPS = [
  {
    id: "vin-market-report",
    name: "VIN Market Report",
    tagline: "VIN-based market report — embeddable widget like CarStory.ai",
    segment: "Consumer",
    toolName: "generate-vin-market-report",
    description: "The VIN Market Report is a comprehensive, single-page vehicle market intelligence report. Enter a VIN and get an instant analysis covering: vehicle specs decoded from the VIN, ML-predicted fair market value (franchise and independent dealer prices), deal score gauge (Great Deal to Overpriced), market position among comparable vehicles (price/miles/DOM percentiles with cluster visualization), price history timeline across dealers, active and sold comparable listings, depreciation story with 1-year projection, market trend indicators, and applicable OEM incentives for recent models. Designed as an embeddable widget (like CarStory.ai) with full standalone, iframe, and MCP support. Report history is stored in the browser session — users can re-run any previous report with one click.",
    useCases: [
      { persona: "Car Shoppers", desc: "Paste a VIN from any listing to see if it's a good deal — get a Buy/Negotiate/Pass score backed by ML predictions and real comparable data." },
      { persona: "Dealer Websites", desc: "Embed as a widget on your VDP (vehicle detail page) to build buyer trust with transparent market data. Supports iframe embed and compact mode." },
      { persona: "Auto Lenders", desc: "Validate collateral value with franchise and independent dealer FMV predictions, confidence ranges, and comparable evidence." },
      { persona: "Insurance Adjusters", desc: "Use for pre-loss valuation — the report provides market position, comparable sales, and price history needed for settlement documentation." },
      { persona: "Appraisers", desc: "Desktop appraisal in seconds — dual-tier pricing, active and sold comps, depreciation trajectory, and full listing history." },
      { persona: "Auto Media / Content", desc: "Generate market reports for editorial content — the report includes quotable stats, trend data, and shareable visualizations." },
    ],
    urlParams: [
      { name: "api_key", desc: "Your MarketCheck API key (or set via localStorage)" },
      { name: "vin", desc: "17-character VIN — auto-fills the form and triggers report generation" },
      { name: "price", desc: "Asking price — also accepts askingPrice, asking_price" },
      { name: "miles", desc: "Current mileage — also accepts mileage" },
      { name: "zip", desc: "ZIP code for local comps — also accepts zipcode, zip_code" },
      { name: "compact", desc: "Set to 'true' for a narrow 400px widget mode (for iframes)" },
      { name: "embed", desc: "Set to 'true' for embedded mode (hides settings gear)" },
    ],
    inputParams: [
      { name: "vin", type: "string", required: true, desc: "17-character VIN" },
      { name: "price", type: "number", required: false, desc: "Listed/asking price for deal scoring" },
      { name: "miles", type: "number", required: false, desc: "Current mileage" },
      { name: "zip", type: "string", required: false, desc: "ZIP code for local comparables" },
    ],
    apiFlow: [
      { step: 1, label: "Decode VIN", apis: ["decode"], parallel: false, note: "Get year, make, model, trim, engine, transmission, drivetrain, MSRP — needed to drive all subsequent searches" },
      { step: 2, label: "Price + History", apis: ["predictRetail", "predictWholesale", "carHistory"], parallel: true, note: "Three parallel calls: franchise dealer FMV prediction, independent dealer FMV prediction, and full listing history (dealer hops, price changes over time)" },
      { step: 3, label: "Comparables + Market", apis: ["searchActive", "searchRecents", "soldSummary"], parallel: true, note: "Three parallel calls: active comparable listings (year ±1, 100mi radius, with price/miles/DOM stats), recently sold comparables, and sold volume summary for market context" },
      { step: 4, label: "Incentives (conditional)", apis: ["incentives"], parallel: false, note: "Only for vehicles within 1 model year of current — fetch cash back, APR, and lease specials from the OEM" },
    ],
    renders: "Deal score gauge (Great Deal → Overpriced), vehicle spec card (decoded from VIN), market position with 3 range bars (price/miles/DOM percentiles), ML price prediction with confidence band (franchise + independent), comparable cluster strips (dot distribution showing where this vehicle lands), active comparables carousel with VDP links, recently sold comparables table, price history timeline chart (auto-spaced labels for cluttered data), depreciation story with total loss/appreciation and 1-year projection, market trend sparkline, OEM incentive badges, report history sidebar (sessionStorage / max 1000)",
  },
  {
    id: "car-search-compare",
    name: "Car Search & Compare",
    tagline: "Find and compare cars side by side",
    segment: "Consumer",
    toolName: "compare-cars",
    description: "Side-by-side comparison of multiple vehicles. For each VIN, decodes specs and predicts price, then renders a comparison table highlighting differences in price, features, and market position.",
    inputParams: [
      { name: "vins", type: "array", required: true, desc: "Array of VINs to compare" },
      { name: "zip", type: "string", required: false, desc: "ZIP code for local pricing" },
    ],
    apiFlow: [
      { step: 1, label: "For each VIN in parallel", apis: ["decode", "predictRetail"], parallel: true, note: "Decode + predict price for every VIN simultaneously" },
    ],
    renders: "Side-by-side spec comparison table, price position indicators, feature diff highlighting",
  },
  {
    id: "car-search-app",
    name: "Car Search",
    tagline: "Full search with SERP, vehicle details, and natural language search",
    segment: "Consumer",
    toolName: "search-cars",
    description: "Full-featured car search with SERP-style results, vehicle detail pages, filter chips, and deal badges. Supports keyword/natural language search alongside structured filters.",
    inputParams: [
      { name: "make", type: "string", required: false, desc: "Vehicle make (e.g., Toyota)" },
      { name: "model", type: "string", required: false, desc: "Vehicle model (e.g., Camry)" },
      { name: "year", type: "string", required: false, desc: "Year or range (e.g., 2020-2022)" },
      { name: "body_type", type: "string", required: false, desc: "Body type: sedan, suv, truck, etc." },
      { name: "price_range", type: "string", required: false, desc: "Price range: min-max" },
      { name: "miles_range", type: "string", required: false, desc: "Mileage range: min-max" },
      { name: "zip", type: "string", required: false, desc: "ZIP code for local search" },
      { name: "radius", type: "number", required: false, desc: "Search radius in miles" },
      { name: "rows", type: "number", required: false, desc: "Number of results" },
    ],
    apiFlow: [
      { step: 1, label: "Search Active Inventory", apis: ["searchActive"], parallel: false, note: "Search with filters + stats + facets + dealer object + photos" },
    ],
    renders: "SERP card grid with photos, price badges, deal indicators, filter sidebar, pagination, vehicle detail modal",
  },
  {
    id: "deal-evaluator",
    name: "Deal Evaluator",
    tagline: "Should I buy this car? Get a Buy/Negotiate/Pass verdict",
    segment: "Consumer",
    toolName: "evaluate-deal",
    description: "Evaluates whether a car deal is good by combining VIN decode, price prediction, comparable active listings, and listing history. Produces a Buy/Negotiate/Pass verdict with gauge visualization, price percentile ranking, and negotiation leverage points.",
    inputParams: [
      { name: "vin", type: "string", required: true, desc: "17-character VIN" },
      { name: "askingPrice", type: "number", required: false, desc: "Dealer asking price" },
      { name: "miles", type: "number", required: false, desc: "Current mileage" },
      { name: "zip", type: "string", required: false, desc: "Buyer's ZIP code" },
    ],
    apiFlow: [
      { step: 1, label: "Decode VIN", apis: ["decode"], parallel: false, note: "Get vehicle specs to drive comp search" },
      { step: 2, label: "Price + History", apis: ["predictRetail", "carHistory"], parallel: true, note: "Predict fair price and get listing history in parallel" },
      { step: 3, label: "Active Comparables", apis: ["searchActive"], parallel: false, note: "Search similar cars (year ±1) within 75 miles for price comparison" },
    ],
    renders: "Buy/Negotiate/Pass gauge, predicted vs asking price bar, price percentile chart, listing history timeline, comparable vehicles table, negotiation leverage points",
  },
  {
    id: "incentive-adjusted-deal-eval",
    name: "Incentive-Adjusted Deal Evaluator",
    tagline: "True out-of-pocket cost after rebates and APR savings",
    segment: "Consumer",
    toolName: "evaluate-incentive-deal",
    description: "Extends the deal evaluator by also pulling OEM incentives. Shows the true out-of-pocket cost after cash back, APR specials, and lease deals — giving a more accurate deal evaluation.",
    inputParams: [
      { name: "vin", type: "string", required: true, desc: "17-character VIN" },
      { name: "askingPrice", type: "number", required: false, desc: "Dealer asking price" },
      { name: "miles", type: "number", required: false, desc: "Current mileage" },
      { name: "zip", type: "string", required: false, desc: "Buyer's ZIP code" },
    ],
    apiFlow: [
      { step: 1, label: "Decode VIN", apis: ["decode"], parallel: false, note: "Get year/make/model for incentive and comp searches" },
      { step: 2, label: "Price + Incentives + Comps", apis: ["predictRetail", "incentives", "searchActive"], parallel: true, note: "Predict price, fetch OEM incentives for make, and search comps — all in parallel" },
    ],
    renders: "Sticker price vs out-of-pocket waterfall chart, incentive badges, deal gauge (adjusted for incentives), cash back / APR / lease cards, comp vehicle list",
  },
  {
    id: "trade-in-estimator",
    name: "Trade-In Estimator",
    tagline: "What's your car worth? 3-tier instant valuation",
    segment: "Consumer",
    toolName: "estimate-trade-in",
    description: "Produces a 3-tier valuation — private party, dealer trade-in, and instant cash offer — using retail and wholesale price predictions plus recently sold comparable vehicles.",
    inputParams: [
      { name: "vin", type: "string", required: true, desc: "17-character VIN" },
      { name: "miles", type: "number", required: false, desc: "Current mileage" },
      { name: "zip", type: "string", required: false, desc: "Owner's ZIP code" },
      { name: "condition", type: "string", required: false, desc: "Vehicle condition: excellent, good, fair, poor" },
    ],
    apiFlow: [
      { step: 1, label: "Decode VIN", apis: ["decode"], parallel: false, note: "Get year/make/model for comp search" },
      { step: 2, label: "Retail + Wholesale Price", apis: ["predictRetail", "predictWholesale"], parallel: true, note: "Get both franchise (retail) and independent (wholesale) predictions in parallel" },
      { step: 3, label: "Sold Comparables", apis: ["searchRecents"], parallel: false, note: "Search recently sold similar vehicles for market evidence" },
    ],
    renders: "3-tier value gauge (private party / trade-in / cash), range bars, sold comparable evidence table, condition adjustment factors",
  },
  {
    id: "used-car-market-index",
    name: "Used Car Market Index",
    tagline: "Track prices like Wall Street tracks stocks",
    segment: "Consumer",
    toolName: "get-market-index",
    description: "Wall Street-style market index for used cars. Tracks average prices, sold volumes, and market share by make and body type. Supports state-level drill-down for geographic comparison.",
    inputParams: [
      { name: "geography", type: "string", required: false, desc: "2-letter state code or 'national'" },
      { name: "timeRange", type: "string", required: false, desc: "Time range for analysis" },
    ],
    apiFlow: [
      { step: 1, label: "Market Summary + Segments", apis: ["soldSummary", "soldSummary"], parallel: true, note: "Fetch make-level rankings (top 25) and body-type segment rankings in parallel" },
    ],
    renders: "Index ticker display, candlestick-style charts, segment indices (SUV, Sedan, Truck, etc.), top movers table, sector heatmap, geographic comparison map",
  },
  {
    id: "oem-incentives-explorer",
    name: "OEM Incentives Explorer",
    tagline: "Cash back, APR, and lease deals by ZIP",
    segment: "Consumer",
    toolName: "oem-incentives-explorer",
    description: "A dark-themed dashboard for browsing and comparing OEM incentive programs across major brands. Pick a make (and optionally a model and ZIP), then see all active manufacturer offers — cash back, low-APR financing, lease specials, loyalty cash, and conquest bonuses — as color-coded cards with amounts, eligible models, expiration countdowns, and fine print. Add up to two competing brands for a side-by-side comparison table that highlights the best deal per incentive type. A built-in savings calculator lets shoppers stack eligible cash incentives against an MSRP and instantly see the effective price plus an estimated monthly payment at the best APR on offer.",
    useCases: [
      { persona: "Car Shoppers", desc: "Check what manufacturer money is on the hood before walking into a dealership — stack loyalty, cash back, and conquest cash against MSRP to see the real out-the-door price." },
      { persona: "Cross-Shoppers", desc: "Add up to two competing brands (e.g., Toyota vs Honda vs Hyundai) and get an at-a-glance comparison of who offers the best APR, lease, or cash-back deal right now." },
      { persona: "Dealer Sales Staff", desc: "Keep a tab open while working with customers to quickly recall current OEM programs, stackability rules, and expiration dates without digging through bulletin PDFs." },
      { persona: "Auto Journalists & Content Creators", desc: "Pull current incentive data for end-of-month deal roundups, best-lease-deal articles, and holiday sales-event coverage." },
      { persona: "Lenders & Fleet Buyers", desc: "Factor OEM cash and subvented APR into effective loan amounts and fleet acquisition cost comparisons." },
    ],
    urlParams: [
      { name: "api_key", desc: "Your MarketCheck API key (or set via localStorage)" },
      { name: "make", desc: "OEM brand — auto-selects the primary make and triggers a search (case-insensitive, e.g. Toyota, toyota, TOYOTA)" },
      { name: "model", desc: "Vehicle model — pre-fills the model dropdown when a matching make is selected" },
      { name: "zip", desc: "5-digit US ZIP code — pre-fills the ZIP field for region-specific incentives" },
      { name: "embed", desc: "Set to 'true' to hide the settings gear for iframe embeds" },
    ],
    inputParams: [
      { name: "make", type: "string", required: true, desc: "OEM brand (e.g., Toyota)" },
      { name: "model", type: "string", required: false, desc: "Vehicle model" },
      { name: "zip", type: "string", required: false, desc: "ZIP code for regional incentives" },
      { name: "compareMakes", type: "array", required: false, desc: "Additional brands to compare (up to 2)" },
    ],
    apiFlow: [
      { step: 1, label: "Primary Brand Incentives", apis: ["incentives"], parallel: false, note: "Fetch incentive programs for the primary make (optionally scoped by model and ZIP)" },
      { step: 2, label: "Compare Brands (if specified)", apis: ["incentives"], parallel: true, note: "For each compareMake, fetch incentives in parallel — results are used to build the cross-brand comparison table" },
    ],
    renders: "Incentive cards grouped by brand (color-coded by type: cash back, low APR, lease, loyalty, conquest), amount displays, eligible-models chips, expiration countdown with urgency coloring, expandable fine-print disclosures, cross-brand comparison table highlighting the best deal per type, and a savings calculator sidebar that stacks selected cash incentives against MSRP and computes an estimated monthly payment at the best available APR.",
  },
  {
    id: "incentive-deal-finder",
    name: "Incentive Deal Finder",
    tagline: "Search ALL OEM incentives by budget, not by brand",
    segment: "Consumer",
    toolName: "find-incentive-deals",
    description: "A brand-agnostic incentive discovery tool that fans out in parallel across 15 major OEM brands (Toyota, Honda, Ford, Chevrolet, Hyundai, Kia, Nissan, BMW, Mercedes-Benz, Volkswagen, Subaru, Mazda, Jeep, Ram, GMC) and returns every active cashback, low-APR, and lease offer in one ranked table. Instead of picking a brand first, shoppers pick the dollar outcome they want — max cashback, lowest APR, or a lease under a monthly cap — and the app surfaces the best deals across the entire market. Includes KPI cards (best cashback, lowest APR, average lease payment), a sortable deal table with offer-type and status badges, an expiring-soon alert panel for offers ending within 7 days, two canvas-rendered bar charts (top 10 cashback across brands and best APR vs a 6.5% market baseline), and a built-in savings calculator that computes monthly + lifetime savings of an incentive APR against the prevailing market rate.",
    useCases: [
      { persona: "Car Shoppers", desc: "Compare incentives across every brand at once — find the best cashback or lowest APR for your budget without having to shop brand-by-brand." },
      { persona: "Budget-First Buyers", desc: "Filter leases by max monthly payment to find every sub-$300/mo lease nationwide, or filter cashback by minimum amount to see only meaningful offers." },
      { persona: "Dealer F&I Desks", desc: "Pitch stackable manufacturer cashback alongside in-house financing, quantifying total customer savings with the built-in payment calculator." },
      { persona: "Auto Media", desc: "Generate brand-by-brand incentive roundups with accurate expiration dates — the expiring-soon panel flags deals in their last week." },
      { persona: "MarketCheck API Evaluators", desc: "A concrete example of how to fan out the /search/car/incentive/oem endpoint across multiple makes in parallel and normalize the results into a unified offer schema." },
    ],
    urlParams: [
      { name: "api_key", desc: "Your MarketCheck API key (or set via localStorage)" },
      { name: "zip", desc: "ZIP code for regional incentive availability — pre-fills the ZIP input" },
      { name: "make", desc: "Comma-separated brand filter (e.g., Toyota,Honda) — pre-checks the brand checkboxes" },
      { name: "offer_type", desc: "Pre-select offer type: 'all', 'cashback', 'apr', or 'lease'" },
      { name: "max_monthly", desc: "Max lease monthly payment filter (e.g., 400)" },
      { name: "min_cashback", desc: "Min cashback amount filter (e.g., 2000)" },
      { name: "embed", desc: "Set to 'true' for embedded mode (hides settings gear)" },
    ],
    inputParams: [
      { name: "makes", type: "string", required: false, desc: "Comma-separated makes (defaults to top 15)" },
      { name: "zip", type: "string", required: false, desc: "ZIP code for regional incentives" },
      { name: "offer_type", type: "string", required: false, desc: "Filter by offer type: cashback, apr, lease, or omit for all" },
      { name: "max_monthly_payment", type: "number", required: false, desc: "Max monthly lease payment filter" },
      { name: "min_cashback", type: "number", required: false, desc: "Min cashback amount filter" },
    ],
    apiFlow: [
      { step: 1, label: "Scan All OEM Incentives", apis: ["incentives"], parallel: true, note: "Fetch incentives for 15 OEM brands simultaneously in parallel (one call per brand)" },
    ],
    renders: "4 KPI cards (total offers, best cashback, lowest APR, average lease payment), sortable deal table with offer-type + status badges, expiring-soon alert panel, top-10 cashback canvas bar chart, best APR canvas bar chart with 6.5% market baseline, savings calculator (monthly and total savings vs market APR)",
  },
  {
    id: "lot-pricing-dashboard",
    name: "Lot Pricing Dashboard",
    tagline: "See your entire lot priced against the market",
    segment: "Dealer",
    toolName: "scan-lot-pricing",
    description: "Pulls a dealer's entire active inventory and overlays market pricing data — showing price gaps, aging alerts, and a hot seller list from sold volume data.",
    inputParams: [
      { name: "dealerId", type: "string", required: true, desc: "MarketCheck dealer ID" },
      { name: "zip", type: "string", required: false, desc: "Dealer ZIP code" },
      { name: "state", type: "string", required: false, desc: "2-letter state code for demand data" },
    ],
    apiFlow: [
      { step: 1, label: "Dealer Inventory + Hot List", apis: ["searchActive", "soldSummary"], parallel: true, note: "Fetch dealer's active inventory (with stats/facets) and state-level demand rankings in parallel" },
    ],
    renders: "Inventory table with market price gaps, aging heatmap, DOM alerts, body type mix chart, stocking hot list, floor plan burn calculator",
  },
  {
    id: "stocking-intelligence",
    name: "Stocking Intelligence",
    tagline: "Know what to buy at auction",
    segment: "Dealer",
    toolName: "stocking-intelligence",
    description: "Auction stocking guide powered by sold volume data. Shows which make/model combinations are selling fastest and at what prices in your state, broken down by body type segment.",
    inputParams: [
      { name: "state", type: "string", required: true, desc: "2-letter state code" },
      { name: "zip", type: "string", required: false, desc: "ZIP code" },
    ],
    apiFlow: [
      { step: 1, label: "Demand + Segment Data", apis: ["soldSummary", "soldSummary"], parallel: true, note: "Fetch make/model demand rankings (top 30) and body type segment data in parallel" },
    ],
    renders: "Demand heatmap, buy/avoid recommendation cards, segment analysis (SUV vs Sedan vs Truck), avg price and DOM by segment, VIN checker",
  },
  {
    id: "pricing-transparency-report",
    name: "Pricing Transparency Report",
    tagline: "Shareable market report dealers give buyers",
    segment: "Dealer",
    toolName: "generate-pricing-report",
    description: "Generates a professional, shareable pricing report that dealers can give to buyers. Shows predicted fair price, active comparables, and sold comparables — building trust through transparency.",
    inputParams: [
      { name: "vin", type: "string", required: true, desc: "17-character VIN" },
      { name: "miles", type: "number", required: false, desc: "Current mileage" },
      { name: "zip", type: "string", required: false, desc: "Dealer ZIP code" },
    ],
    apiFlow: [
      { step: 1, label: "Decode VIN", apis: ["decode"], parallel: false, note: "Get vehicle specs for the report header" },
      { step: 2, label: "Price + Comps", apis: ["predictRetail", "searchActive", "searchRecents"], parallel: true, note: "Predict price, find active comps within 75mi, and sold comps within 100mi — all in parallel" },
    ],
    renders: "Professional report layout with vehicle specs header, predicted price bar, active comparable grid, sold comparable grid, printable/shareable format",
  },
  {
    id: "dealer-inventory-fit-scorer",
    name: "Dealer Inventory Fit Scorer",
    tagline: "Which cars match your sales DNA?",
    segment: "Dealer",
    toolName: "score-dealer-fit",
    description: "Paste a batch of candidate VINs (up to 20) and a dealer ID; the app decodes each VIN, predicts retail market price, and scores each candidate against the dealer's actual sales DNA — inferred by pulling the dealer's active inventory facets to identify franchise brand, top-selling makes, and top body types. The 10–98 fit score weighs brand alignment (franchise match > complementary > off-brand), body-type match against the dealer's top sellers, mileage tier (fresh/mid/high), and vehicle age, then assigns a BUY / CONSIDER / PASS badge. Output: dealer profile card, sortable candidate table, fit-score-vs-profit-margin scatter plot, sorted fit-score bar chart, top-5 recommended acquisitions, and a reject pile with reasons. Designed for used-car buyers, acquisition managers, and auction pre-bid screening.",
    useCases: [
      { persona: "Used Car Buyers", desc: "Pre-screen a list of auction or trade-in candidates against your rooftop's sales history before you bid. Skip the ones that won't turn on your lot." },
      { persona: "Acquisition Managers", desc: "Batch-evaluate VINs sourced from wholesalers, lease returns, or direct-to-consumer programs. The fit score flags vehicles that fit your franchise profile vs. ones that would sit." },
      { persona: "Dealer Group Buyers", desc: "Compare the same candidate pool against multiple dealer IDs to decide which rooftop should absorb which vehicle based on fit — not just who has the space." },
      { persona: "Auction Runners", desc: "Run an auction run-list through the scorer before lane day so the buyer knows which VINs are priority bids for their dealer's profile." },
    ],
    urlParams: [
      { name: "api_key", desc: "Your MarketCheck API key (or set via localStorage)" },
      { name: "dealer_id", desc: "MarketCheck dealer ID — pre-fills the dealer field and triggers profile inference from active inventory" },
      { name: "zip", desc: "Dealer ZIP — used when predicting regional retail pricing" },
      { name: "vin", desc: "Single VIN to pre-fill the candidate list. For multiple VINs, comma-separate them; the input will expand one per line" },
      { name: "embed", desc: "Set to 'true' to hide the settings gear (for iframe embedding)" },
    ],
    inputParams: [
      { name: "vins", type: "string", required: true, desc: "Comma-separated VINs to evaluate" },
      { name: "dealer_id", type: "string", required: false, desc: "Dealer ID for inventory comparison" },
      { name: "zip", type: "string", required: false, desc: "Dealer ZIP code" },
    ],
    apiFlow: [
      { step: 1, label: "For each VIN in parallel", apis: ["decode", "predictRetail"], parallel: true, note: "Decode and predict price for every VIN simultaneously" },
      { step: 2, label: "Fetch dealer inventory profile", apis: ["searchActive"], parallel: false, note: "Search the dealer's active listings with make/body_type facets to infer franchise brand and top-selling body types" },
    ],
    renders: "Dealer profile card, sortable fit-score table, fit-score vs. profit-margin scatter plot, sorted fit-score bar chart, top-5 recommended acquisitions with margin breakdown, reject pile with rejection reasons",
  },
  {
    id: "dealer-conquest-analyzer",
    name: "Dealer Conquest Analyzer",
    tagline: "Find competitors' best-sellers you should stock",
    segment: "Dealer",
    toolName: "analyze-dealer-conquest",
    description: "Enter your MarketCheck dealer ID, a ZIP, and a competitive radius; the app fans out four parallel MarketCheck queries — your inventory mix (make/model/body facets), the surrounding market's inventory mix, the top-5 competitor dealer IDs by listing volume in the radius, and an Enterprise sold-vehicles demand ranking — then per-competitor make/model facet lookups for the top 5. The dashboard renders a KPI ribbon (your units, market listings, competitors scanned, gap models, average market price, average DOM), a your-inventory breakdown with model-level counts and percentage bars, 5 competitor cards with make chips and top models, a gap-analysis table ranked by demand score with HIGH/MEDIUM/LOW priority badges, an inventory-mix-vs-market canvas bar chart with over-/under-indexed annotations, acquisition recommendation cards with potential revenue, and a market-share comparison table with an index multiplier per make. On a free-tier API key the Enterprise sold-summary call 403s and the app automatically falls back to deriving demand from market listing counts, so the gap analysis keeps working.",
    useCases: [
      { persona: "Used Car Buyers", desc: "Compare your lot's make/model mix against competing rooftops in your market. The gap table tells you which models your competitors stock that you don't — and how much local demand exists for each." },
      { persona: "Dealer Group Strategists", desc: "Run the same zip against multiple owned rooftops to see which one should absorb a given conquest opportunity. Over-indexed stores get visibility; under-indexed segments get priority." },
      { persona: "Franchise Managers", desc: "See whether you're under- or over-indexed against market share for your own franchise brand. A BMW dealer stocking 94% BMW in a market that's 60% BMW + 40% mixed might be missing complementary inventory." },
      { persona: "Market Analysts", desc: "Snapshot a regional competitive landscape — top 5 dealers by listing volume, their brand mix, and which models dominate the area. Useful for M&A due diligence and territory planning." },
    ],
    urlParams: [
      { name: "api_key", desc: "Your MarketCheck API key (or set via localStorage)" },
      { name: "dealer_id", desc: "MarketCheck dealer ID (numeric) — pre-fills the form and triggers auto-analysis" },
      { name: "zip", desc: "ZIP code for the competitive radius (used to find nearby competitor dealers)" },
      { name: "state", desc: "2-letter state code — used for the Enterprise sold-summary demand ranking (optional; defaults to TX)" },
      { name: "embed", desc: "Set to 'true' to hide the settings gear (for iframe embedding)" },
    ],
    inputParams: [
      { name: "dealer_id", type: "string", required: true, desc: "Your MarketCheck dealer ID" },
      { name: "zip", type: "string", required: false, desc: "Dealer ZIP code" },
      { name: "radius", type: "number", required: false, desc: "Competitive radius in miles" },
      { name: "state", type: "string", required: false, desc: "State for demand data" },
    ],
    apiFlow: [
      { step: 1, label: "Your inventory + market + demand + top competitors", apis: ["searchActive", "searchActive", "soldSummary", "searchActive"], parallel: true, note: "4 API calls in parallel: your dealer's facet breakdown, market-wide facets in the radius, Enterprise sold-vehicle demand rankings (graceful 403 fallback to market-listing proxy on free tiers), and top-5 competitor dealer IDs via dealer_id facet" },
      { step: 2, label: "Per-competitor inventory facets", apis: ["searchActive"], parallel: true, note: "For each of the top-5 competitor dealer IDs, fetch their make/model facet breakdown in parallel" },
    ],
    renders: "KPI ribbon (units, listings, competitors, gap models, avg price, avg DOM), your-inventory breakdown with percentage bars, 5 competitor cards with make chips + top models, gap-analysis table ranked by demand with HIGH/MEDIUM/LOW priority, inventory-mix-vs-market canvas bar chart with over-/under-indexed annotations, acquisition recommendation cards with potential revenue, market-share comparison table with index multiplier",
  },
  {
    id: "deal-finder",
    name: "Deal Finder",
    tagline: "Best deals scored by price, DOM, and market position",
    segment: "Dealer",
    toolName: null,
    description: "Paste make/model/year/ZIP/radius/max-price filters and the app fans out a 3-stage MarketCheck pipeline: (1) active search sorted by price ascending with price/miles/DOM stats, (2) per-candidate franchise-retail price prediction, (3) per-candidate listing history plus an Enterprise sold-summary market-timing pull (all in parallel). Each candidate gets a 0–100 composite deal score weighing asking-price delta vs predicted retail, days-on-lot bonus (30d/45d/60d/90d thresholds), and confirmed price-drop count from history — then a BUY / NEGOTIATE / PASS verdict. The dashboard renders a summary ribbon (candidate count, BUY/PASS tallies, avg price, avg DOM, median price-delta), a market-timing pill (Fast / Normal / Slow, Enterprise-API-aware with DOM-distribution fallback on free tiers), and a ranked deal card per candidate with a green→amber→red price-vs-market bar centered on the predicted price, delta callout with percentage, and 2–4 leverage bullets (e.g. 'listed $1,800 below predicted retail', '73 days on lot — dealer likely motivated', 'price dropped 3 times since listing', 'VIN appeared on 2 prior lots'). Built for used-car buyers, retail shoppers, and wholesale sourcing.",
    useCases: [
      { persona: "Used Car Buyers", desc: "Filter by make/model/year/ZIP and surface the top 10 deals ranked by a composite score. The leverage bullets tell you exactly what to say in the negotiation — lot age, price drops, prior listings, and how far below predicted retail the asking price already sits." },
      { persona: "Retail Shoppers", desc: "Set a max price and radius, see the BUY-rated cards, and focus on the ones with the biggest below-predicted delta. The price-vs-market bar makes it immediately obvious whether the dealer is already priced aggressively or leaving room to negotiate." },
      { persona: "Wholesale Sourcers", desc: "Wider radius + higher max price + no make filter surfaces mispriced inventory across segments. The 60+ day DOM signal combined with a multi-drop price history is a strong wholesale acquisition trigger." },
      { persona: "Dealer Acquisition Managers", desc: "Scan competing rooftops' aging inventory within your ZIP radius. Deep-lot-age cards with multiple price drops are candidates for a direct-to-dealer approach or auction lane bidding." },
    ],
    urlParams: [
      { name: "api_key", desc: "Your MarketCheck API key (or set via localStorage)" },
      { name: "make", desc: "Vehicle make (e.g. Toyota) — pre-fills the form" },
      { name: "model", desc: "Vehicle model (e.g. Camry) — pre-fills the form" },
      { name: "year", desc: "Year or range (e.g. 2020-2023)" },
      { name: "zip", desc: "Required search-center ZIP — pre-fills and triggers auto-submit when a deep-link param is present" },
      { name: "radius", desc: "Search radius in miles (default 50; allowed 25 / 50 / 100 / 200)" },
      { name: "maxPrice", desc: "Maximum asking price cap applied via price_range on the active search" },
      { name: "state", desc: "2-letter state code — used for the Enterprise sold-summary demand ranking (optional; degrades gracefully on free tiers)" },
      { name: "embed", desc: "Set to 'true' to hide the settings gear (for iframe embedding)" },
    ],
    inputParams: [
      { name: "make", type: "string", required: false, desc: "Vehicle make" },
      { name: "model", type: "string", required: false, desc: "Vehicle model" },
      { name: "year", type: "string", required: false, desc: "Year or range" },
      { name: "zip", type: "string", required: true, desc: "Search center ZIP" },
      { name: "radius", type: "number", required: false, desc: "Search radius in miles" },
      { name: "maxPrice", type: "number", required: false, desc: "Maximum price" },
    ],
    apiFlow: [
      { step: 1, label: "Search Deals", apis: ["searchActive"], parallel: false, note: "Search active listings sorted by price ascending with stats (price, miles, DOM). price_range applied when maxPrice is supplied" },
      { step: 2, label: "Price Validation", apis: ["predictRetail"], parallel: true, note: "For each top candidate (up to 10), predict franchise-retail price with VIN + miles + ZIP — runs in parallel across all candidates" },
      { step: 3, label: "History + Demand", apis: ["carHistory", "soldSummary"], parallel: true, note: "Per-candidate VIN history fans out in parallel alongside one market-wide Enterprise sold-summary; summary 403s on free tiers are caught and the timing pill falls back to the candidate set's own DOM distribution" },
    ],
    renders: "Summary ribbon (candidate count, BUY/PASS tally, avg price, avg DOM, median vs market), market-timing pill (Fast / Normal / Slow with fallback), 10 ranked deal cards each with year/make/model/trim heading, verdict badge + score, price/miles/DOM/location/dealer line, green→amber→red price-vs-market bar with predicted-price marker, delta callout with percentage, and 2–4 leverage bullets (below-market margin, DOM window, price-drop count, prior-listings count)",
  },
  {
    id: "appraiser-workbench",
    name: "Appraiser Workbench",
    tagline: "Complete vehicle valuation studio",
    segment: "Appraiser",
    toolName: "appraiser-workbench",
    description: "Professional multi-panel valuation studio. Combines VIN decode, dual price predictions (retail + wholesale), listing history, and both active and sold comparables in a single workspace.",
    inputParams: [
      { name: "vin", type: "string", required: true, desc: "17-character VIN" },
      { name: "miles", type: "number", required: false, desc: "Current mileage" },
      { name: "zip", type: "string", required: false, desc: "Appraisal location ZIP" },
    ],
    apiFlow: [
      { step: 1, label: "Decode VIN", apis: ["decode"], parallel: false, note: "Get full vehicle specs" },
      { step: 2, label: "Retail + Wholesale + History", apis: ["predictRetail", "predictWholesale", "carHistory"], parallel: true, note: "Three parallel calls: franchise price, independent price, and listing history" },
      { step: 3, label: "Active + Sold Comps", apis: ["searchActive", "searchRecents"], parallel: true, note: "Search both active and recently sold comparables (100mi radius) in parallel" },
    ],
    renders: "Retail/wholesale price bars with confidence ranges, active comps table, sold comps table, price history chart, vehicle specs panel",
  },
  {
    id: "comparables-explorer",
    name: "Comparables Explorer",
    tagline: "Price distribution and market positioning",
    segment: "Appraiser",
    toolName: "comparables-explorer",
    description: "Deep-dive into comparable vehicles for any VIN or make/model. Shows price distributions, market positioning, and both active and sold comparables with optional price prediction overlay.",
    inputParams: [
      { name: "vin", type: "string", required: false, desc: "VIN (optional — or use make/model)" },
      { name: "make", type: "string", required: false, desc: "Vehicle make" },
      { name: "model", type: "string", required: false, desc: "Vehicle model" },
      { name: "year", type: "string", required: false, desc: "Year or range" },
      { name: "zip", type: "string", required: false, desc: "Center ZIP" },
      { name: "radius", type: "number", required: false, desc: "Search radius (default: 100)" },
    ],
    apiFlow: [
      { step: 1, label: "Decode VIN (if provided)", apis: ["decode"], parallel: false, note: "Optional — only if VIN is provided, to get make/model for search" },
      { step: 2, label: "Active + Sold Comps", apis: ["searchActive", "searchRecents"], parallel: true, note: "Search 50 active and 25 sold comps in parallel" },
      { step: 3, label: "Price Prediction (if VIN)", apis: ["predictRetail"], parallel: false, note: "Optional — predict price for the subject VIN to overlay on comp chart" },
    ],
    renders: "Price distribution histogram, scatter plot (price vs miles), market position indicator, active/sold comp tables, stats summary",
  },
  {
    id: "depreciation-analyzer",
    name: "Depreciation Analyzer",
    tagline: "Track how vehicles lose value over time",
    segment: "Appraiser",
    toolName: null,
    description: "Analyzes depreciation patterns using sold vehicle summary data. Shows how average prices vary by make, model, and age — revealing which vehicles hold value and which depreciate fastest.",
    inputParams: [
      { name: "make", type: "string", required: false, desc: "Vehicle make to analyze" },
      { name: "state", type: "string", required: false, desc: "State for regional analysis" },
    ],
    apiFlow: [
      { step: 1, label: "Sold Summary by Make", apis: ["soldSummary"], parallel: false, note: "Fetch average sale prices and sold counts by make" },
      { step: 2, label: "Sold Summary by Body Type", apis: ["soldSummary"], parallel: false, note: "Fetch segment-level depreciation data" },
    ],
    renders: "Depreciation curves by make, value retention rankings, segment comparison charts, annual depreciation rates",
  },
  {
    id: "market-trends-dashboard",
    name: "Market Trends Dashboard",
    tagline: "The pulse of the automotive market",
    segment: "Appraiser",
    toolName: null,
    description: "Macro-level market trends dashboard using sold vehicle summaries. Shows price trends, volume shifts, and segment dynamics across the automotive market.",
    inputParams: [
      { name: "state", type: "string", required: false, desc: "State for regional trends" },
    ],
    apiFlow: [
      { step: 1, label: "Market Data", apis: ["soldSummary"], parallel: false, note: "Fetch sold summary with make and body type dimensions" },
    ],
    renders: "Price trend charts, volume bars, segment market share pie, top movers, regional comparison",
  },
  {
    id: "group-operations-center",
    name: "Group Operations Center",
    tagline: "Every store, one screen",
    segment: "Dealership Group",
    toolName: null,
    description: "Multi-store dashboard showing inventory, pricing, and performance across all locations. Combines active inventory search per location with demand data for benchmarking.",
    inputParams: [
      { name: "dealerIds", type: "string", required: true, desc: "Comma-separated dealer IDs for each location" },
      { name: "state", type: "string", required: false, desc: "State for demand data" },
    ],
    apiFlow: [
      { step: 1, label: "Per-Location Inventory", apis: ["searchActive"], parallel: true, note: "For each dealer ID, fetch active inventory with stats and facets in parallel" },
      { step: 2, label: "Market Demand", apis: ["soldSummary"], parallel: false, note: "Fetch state-level demand rankings for benchmarking" },
    ],
    renders: "Store-by-store cards with inventory count, avg price, avg DOM, body type mix, combined group metrics, demand overlay",
  },
  {
    id: "inventory-balancer",
    name: "Inventory Balancer",
    tagline: "Move the right cars to the right stores",
    segment: "Dealership Group",
    toolName: null,
    description: "Identifies inter-store transfer opportunities by comparing each location's inventory mix against local demand patterns. Suggests which vehicles to move where.",
    inputParams: [
      { name: "dealerIds", type: "string", required: true, desc: "Comma-separated dealer IDs" },
      { name: "state", type: "string", required: false, desc: "State for demand data" },
    ],
    apiFlow: [
      { step: 1, label: "All Store Inventories", apis: ["searchActive"], parallel: true, note: "Fetch inventory for every location in parallel" },
      { step: 2, label: "Demand Data", apis: ["soldSummary"], parallel: false, note: "Fetch sold demand by make/model and body type" },
    ],
    renders: "Transfer recommendation cards, supply/demand heatmap per location, mismatch alerts, transfer ROI estimate",
  },
  {
    id: "location-benchmarking",
    name: "Location Benchmarking",
    tagline: "Rank and compare your locations",
    segment: "Dealership Group",
    toolName: null,
    description: "Benchmarks dealer group locations against each other and the market. Uses inventory stats and demand data to rank locations by efficiency, pricing, and market alignment.",
    inputParams: [
      { name: "dealerIds", type: "string", required: true, desc: "Comma-separated dealer IDs" },
      { name: "state", type: "string", required: false, desc: "State for market comparison" },
    ],
    apiFlow: [
      { step: 1, label: "All Store Data", apis: ["searchActive"], parallel: true, note: "Fetch inventory with stats for each location" },
      { step: 2, label: "Market Benchmark", apis: ["soldSummary"], parallel: false, note: "Fetch market-wide data for comparison" },
    ],
    renders: "Location ranking table, radar charts (inventory/pricing/DOM/mix), market alignment scores",
  },
  {
    id: "group-health-scorecard",
    name: "Group Health Scorecard",
    tagline: "0-100 health score per rooftop with alerts",
    segment: "Dealership Group",
    toolName: null,
    description: "Calculates a 0-100 health score per rooftop based on aging percentage, average DOM, floor plan burn, and inventory mix alignment. Scores are banded: 80-100 Healthy, 60-79 Watch, 40-59 Concern, 0-39 Critical. Surfaces the top 3 group-level actions by dollar impact.",
    inputParams: [
      { name: "dealerIds", type: "string", required: true, desc: "Comma-separated dealer IDs for each rooftop" },
      { name: "state", type: "string", required: false, desc: "State for demand context" },
    ],
    apiFlow: [
      { step: 1, label: "Per-Location Inventory Scan", apis: ["searchActive"], parallel: true, note: "For each dealer ID, fetch inventory with stats (price, miles, DOM) and facets — all locations in parallel" },
      { step: 2, label: "Market Demand Benchmark", apis: ["soldSummary"], parallel: false, note: "Fetch state-level demand rankings for health score calibration" },
    ],
    renders: "Per-rooftop health score cards (0-100 with color bands), score breakdown (aging penalty / DOM penalty / mix bonus), group-level summary bar, top 3 actions by dollar impact, critical alert badges",
  },
  {
    id: "underwriting-decision-support",
    name: "Underwriting Decision Support",
    tagline: "Single-loan collateral valuation with LTV forecast",
    segment: "Lender",
    toolName: "evaluate-loan-application",
    description: "A complete auto loan underwriting workstation. Enter a VIN, loan amount, term, interest rate, and mileage to instantly receive a full collateral risk assessment. The app decodes the vehicle specs, fetches real-time retail and wholesale valuations from MarketCheck's ML pricing engine, pulls the VIN's full listing history to show price trajectory, and finds recently-sold comparables in the local market. From this data it calculates the current Loan-to-Value (LTV) ratio, projects LTV month-by-month through the loan life using actual depreciation curves, flags when the loan goes underwater, computes the recommended maximum advance amount, and assigns a risk rating (Low / Moderate / High / Very High). The output includes a semi-circular LTV gauge, a depreciation forecast table, a projected-LTV line chart, an advance rate recommendation card, a sold-comps evidence table, and a VIN price history timeline — giving a loan officer everything needed to approve, counter-offer, or decline in seconds.",
    useCases: [
      { persona: "Auto Loan Officers", desc: "Paste a borrower's VIN and requested loan amount to get instant LTV, advance-rate recommendation, and risk rating — replacing manual NADA/KBB lookups with a real-time ML valuation backed by live market comparables." },
      { persona: "Credit Analysts", desc: "Model depreciation trajectories to understand at which month a loan goes underwater, enabling smarter term limits and LTV caps for specific vehicle segments." },
      { persona: "Portfolio Managers", desc: "Spot-check individual loan collateral health by re-running valuations on existing VINs mid-loan to flag at-risk accounts for proactive servicing." },
      { persona: "Dealer Finance Desk", desc: "Quickly verify whether a proposed deal structure keeps LTV within lender guidelines before submitting for approval." },
    ],
    urlParams: [
      { name: "api_key", desc: "Your MarketCheck API key — enables live data mode" },
      { name: "vin", desc: "17-character VIN — auto-fills the form and triggers evaluation" },
      { name: "miles", desc: "Current vehicle mileage — used for pricing accuracy" },
      { name: "zip", desc: "Borrower ZIP code — localizes comparable pricing" },
      { name: "loan_amount", desc: "Requested loan amount in dollars (e.g. 25000)" },
      { name: "loan_term", desc: "Loan term in months (e.g. 60)" },
      { name: "interest_rate", desc: "Annual interest rate as a percentage (e.g. 6.9)" },
    ],
    inputParams: [
      { name: "vin", type: "string", required: true, desc: "17-character VIN" },
      { name: "miles", type: "number", required: false, desc: "Current mileage" },
      { name: "zip", type: "string", required: false, desc: "Borrower ZIP code" },
      { name: "loan_amount", type: "number", required: false, desc: "Requested loan amount for LTV calculation" },
      { name: "loan_term", type: "number", required: false, desc: "Loan term in months (default: 60)" },
      { name: "interest_rate", type: "number", required: false, desc: "Annual interest rate as percent (default: 6.9)" },
    ],
    apiFlow: [
      { step: 1, label: "Decode VIN", apis: ["decode"], parallel: false, note: "Get full vehicle specs for risk assessment" },
      { step: 2, label: "Retail + Wholesale + History + Sold", apis: ["predictRetail", "predictWholesale", "carHistory", "searchRecents"], parallel: true, note: "Four parallel calls: both price tiers, listing history, and sold comps" },
    ],
    renders: "Collateral value banner, LTV gauge (semi-circular canvas), KPI ribbon (current LTV, loan amount, collateral value, monthly payment), depreciation forecast table with underwater flag, projected LTV line chart with 100% threshold line, advance rate recommendation card, sold comparables evidence table, VIN price history timeline",
  },
  {
    id: "portfolio-risk-monitor",
    name: "Portfolio Risk Monitor",
    tagline: "Track collateral health across your loan book",
    segment: "Lender",
    toolName: null,
    description: "Portfolio-level collateral health dashboard. Tracks average values, depreciation rates, and concentration risk across a loan book using sold summary and market trend data.",
    inputParams: [
      { name: "state", type: "string", required: false, desc: "State for regional analysis" },
    ],
    apiFlow: [
      { step: 1, label: "Market Summary", apis: ["soldSummary"], parallel: false, note: "Fetch sold summary by make, body type, and state dimensions" },
    ],
    renders: "Portfolio value index, segment risk heatmap, concentration analysis, depreciation trend overlay",
  },
  {
    id: "lender-portfolio-stress-test",
    name: "Lender Portfolio Stress Test",
    tagline: "What-if depreciation scenarios on your loan book",
    segment: "Lender",
    toolName: "stress-test-portfolio",
    description: "Runs depreciation stress scenarios against a batch of VINs representing an auto loan portfolio. Decodes and prices each VIN using real market data, then models what-if scenarios — EV values drop 20%, trucks drop 15%, market-wide 10% decline, or a custom percentage — to reveal which loans go underwater, by how much, and which vehicle segments carry the most concentrated risk. Outputs an LTV distribution histogram, collateral coverage waterfall, per-segment exposure table, scenario comparison matrix, and a ranked individual loan detail table with HEALTHY / AT RISK / UNDERWATER / DEEP UNDERWATER status badges.",
    inputParams: [
      { name: "vins", type: "string", required: true, desc: "Comma-separated VINs from loan portfolio (up to 20)" },
      { name: "zip", type: "string", required: false, desc: "Central ZIP code for market-based pricing context" },
    ],
    apiFlow: [
      { step: 1, label: "For each VIN in parallel", apis: ["decode", "predictRetail"], parallel: true, note: "Decode specs and predict current market value simultaneously for every VIN" },
    ],
    renders: "Portfolio KPI summary (total loans, total collateral, avg LTV, underwater count), stress impact panel (new underwater loans, total value at risk, worst-hit segments), LTV distribution histogram (current vs stressed), collateral coverage waterfall, segment exposure table, portfolio donut chart, scenario comparison matrix, individual loan detail table",
    useCases: [
      { persona: "Auto Lender / Credit Risk Manager", desc: "Upload a portfolio of VINs and loan balances, run stress scenarios to find which loans flip underwater, and quantify total shortfall exposure before the risk materializes." },
      { persona: "Portfolio Risk Analyst", desc: "Compare EV vs ICE vs Truck concentration risk side by side across multiple depreciation scenarios to identify segment-level vulnerabilities." },
      { persona: "Loan Origination Officer", desc: "Quickly test a new batch of proposed loans against market-wide downturn scenarios to set appropriate LTV limits and reserve requirements." },
      { persona: "Bank Examiner / Auditor", desc: "Generate a stress-tested snapshot of collateral coverage across a dealer floorplan or consumer auto portfolio for regulatory reporting." },
    ],
    urlParams: [
      { name: "api_key", desc: "Your MarketCheck API key — activates live VIN decode and pricing for each portfolio VIN" },
      { name: "zip", desc: "Central ZIP code for localized market pricing context (e.g. 90210, 10001, 60601)" },
      { name: "vins", desc: "Semicolon-separated VIN,LoanAmount pairs to pre-fill the portfolio (e.g. 5YJSA1E26MF100001,38000;1FTFW1E85MFA00002,42000)" },
      { name: "scenario", desc: "Pre-select stress scenario: ev_drop_20 | trucks_drop_15 | market_wide_10 | custom" },
    ],
  },
  {
    id: "ev-collateral-risk",
    name: "EV Collateral Risk Monitor",
    tagline: "EV vs ICE depreciation risk tracking",
    segment: "Lender",
    toolName: null,
    description: "Tracks EV vs ICE depreciation patterns for collateral risk assessment. Uses sold summary data segmented by fuel type to compare value retention across powertrains.",
    inputParams: [
      { name: "state", type: "string", required: false, desc: "State for regional analysis" },
    ],
    apiFlow: [
      { step: 1, label: "EV vs ICE Market Data", apis: ["soldSummary"], parallel: false, note: "Fetch sold summary by body_type and fuel_type_category" },
    ],
    renders: "EV vs ICE depreciation comparison chart, powertrain risk heatmap, collateral value trends, segment analysis",
  },
  {
    id: "earnings-signal-dashboard",
    name: "Earnings Signal Dashboard",
    tagline: "Pre-earnings channel check for auto tickers",
    segment: "Analyst",
    toolName: null,
    description: "Channel check dashboard for financial analysts tracking auto sector stocks. Uses sold volume data as a leading indicator for OEM and dealer group earnings.",
    inputParams: [
      { name: "state", type: "string", required: false, desc: "State for regional signals" },
    ],
    apiFlow: [
      { step: 1, label: "Market Intelligence", apis: ["soldSummary"], parallel: false, note: "Fetch sold summary by make with volume and price measures" },
    ],
    renders: "Ticker-style signal cards, volume momentum charts, price trend indicators, sector comparison, earnings estimate impact",
  },
  {
    id: "watchlist-monitor",
    name: "Watchlist Monitor",
    tagline: "Morning signal scan across your portfolio",
    segment: "Analyst",
    toolName: null,
    description: "Morning scan dashboard for analyst watchlists. Monitors sold volume, pricing, and market share changes for tracked OEMs and dealer groups.",
    inputParams: [
      { name: "makes", type: "string", required: false, desc: "Comma-separated OEM brands to track" },
      { name: "state", type: "string", required: false, desc: "State for regional data" },
    ],
    apiFlow: [
      { step: 1, label: "Watchlist Data", apis: ["soldSummary"], parallel: false, note: "Fetch sold summary for tracked brands" },
    ],
    renders: "Watchlist cards with signal indicators, volume change alerts, price trend sparklines, market share shifts",
  },
  {
    id: "dealer-group-scorecard",
    name: "Dealer Group Scorecard",
    tagline: "Benchmark public dealer groups",
    segment: "Analyst",
    toolName: null,
    description: "Benchmarking dashboard for publicly traded dealer groups (AutoNation, Lithia, Penske, etc.). Uses active inventory and sold data to evaluate operational efficiency.",
    inputParams: [
      { name: "dealerIds", type: "string", required: false, desc: "Dealer IDs for tracked groups" },
      { name: "state", type: "string", required: false, desc: "State for market context" },
    ],
    apiFlow: [
      { step: 1, label: "Group Inventory", apis: ["searchActive"], parallel: true, note: "Fetch inventory for each dealer group location" },
      { step: 2, label: "Market Context", apis: ["soldSummary"], parallel: false, note: "Fetch market-wide data for benchmarking" },
    ],
    renders: "Scorecard comparison table, inventory efficiency metrics, pricing power indicators, market share bars",
  },
  {
    id: "oem-stock-tracker",
    name: "OEM Stock Tracker",
    tagline: "Leading indicators for automotive tickers with buy/sell signals",
    segment: "Analyst",
    toolName: null,
    description: "Leading indicator dashboard for automotive equity research. Maps MarketCheck data to OEM tickers (F, GM, TM, HMC, TSLA, RIVN, STLA) and dealer group tickers (AN, LAD, PAG, KMX, CVNA). Produces BULLISH/BEARISH/NEUTRAL/CAUTION signals per metric: volume momentum, pricing power, inventory health, market share, and EV transition progress.",
    inputParams: [
      { name: "tickers", type: "string", required: true, desc: "Comma-separated tickers (e.g., F,GM,TM,TSLA)" },
      { name: "state", type: "string", required: false, desc: "State for regional signals" },
    ],
    apiFlow: [
      { step: 1, label: "Volume + Pricing + Share", apis: ["soldSummary", "soldSummary", "soldSummary"], parallel: true, note: "Fetch current month volume by make, pricing power (price_over_msrp), and market share rankings — all in parallel" },
      { step: 2, label: "Inventory Health + Prior Month", apis: ["searchActive", "soldSummary"], parallel: true, note: "Fetch current active inventory with DOM stats and prior month volume for momentum calculation" },
    ],
    renders: "Ticker-mapped signal cards with BULLISH/BEARISH badges, volume momentum chart (MoM%), pricing power gauge, days supply indicator, market share trend, composite investment thesis per ticker",
  },
  {
    id: "pricing-power-tracker",
    name: "Pricing Power Tracker",
    tagline: "Discount-to-MSRP trends as margin signals",
    segment: "Analyst",
    toolName: null,
    description: "Tracks discount-to-MSRP trends across OEMs as a proxy for pricing power and dealer margin health. Shows which brands are selling above, at, or below sticker — a leading indicator for OEM profitability and dealer earnings.",
    inputParams: [
      { name: "state", type: "string", required: false, desc: "State for regional analysis" },
    ],
    apiFlow: [
      { step: 1, label: "Pricing Power Data", apis: ["soldSummary", "soldSummary"], parallel: true, note: "Fetch price_over_msrp_percentage by make (top 25) and by body_type segment — in parallel" },
    ],
    renders: "Brand pricing power scatter plot (x=volume, y=MSRP premium), above/at/below sticker distribution, segment pricing power bars, trend arrows vs prior period, margin health badges",
  },
  {
    id: "market-share-analyzer",
    name: "Market Share Analyzer",
    tagline: "Brand share with basis-point changes and conquest analysis",
    segment: "Analyst",
    toolName: null,
    description: "Real-time brand market share dashboard with basis point tracking. Shows current vs prior period share change, segment-level conquest analysis (who is winning in SUVs, sedans, trucks), and regional share heatmaps. Always shows both absolute volume AND share percentage.",
    inputParams: [
      { name: "state", type: "string", required: false, desc: "State for regional analysis" },
      { name: "bodyType", type: "string", required: false, desc: "Filter by segment (suv, sedan, truck)" },
    ],
    apiFlow: [
      { step: 1, label: "Current vs Prior Share", apis: ["soldSummary", "soldSummary"], parallel: true, note: "Fetch current month make rankings and prior month make rankings — in parallel for bps change" },
      { step: 2, label: "Segment + Regional", apis: ["soldSummary", "soldSummary"], parallel: true, note: "Fetch body_type segment breakdown and state-level geographic share — in parallel" },
    ],
    renders: "Brand share ranking table with bps change arrows, segment conquest matrix, geographic share heatmap, volume vs share scatter, momentum badges (gaining/losing/stable)",
  },
  {
    id: "claims-valuation-workbench",
    name: "Claims Valuation Workbench",
    tagline: "Total-loss determination with market evidence",
    segment: "Insurer",
    toolName: "claims-valuation",
    description: "Insurance claims valuation tool for total-loss determinations. Combines VIN decode, fair market value prediction, sold comparables, regional pricing data, and replacement vehicle search.",
    inputParams: [
      { name: "vin", type: "string", required: true, desc: "17-character VIN" },
      { name: "miles", type: "number", required: false, desc: "Pre-loss mileage" },
      { name: "zip", type: "string", required: false, desc: "Loss location ZIP" },
      { name: "condition", type: "string", required: false, desc: "Pre-loss condition" },
      { name: "damageSeverity", type: "string", required: false, desc: "minor, moderate, severe, total" },
    ],
    apiFlow: [
      { step: 1, label: "Decode VIN", apis: ["decode"], parallel: false, note: "Get vehicle specs for claims form" },
      { step: 2, label: "FMV + Sold + Regional + Replacements", apis: ["predictRetail", "searchRecents", "soldSummary", "searchActive"], parallel: true, note: "Four parallel calls: fair market value, sold comps, regional pricing data, and replacement vehicle search" },
    ],
    renders: "Total loss / repair verdict banner, settlement range bar, FMV breakdown, comparable evidence grid, replacement vehicle options, regional pricing context",
  },
  {
    id: "insurance-premium-benchmarker",
    name: "Insurance Premium Benchmarker",
    tagline: "Segment-level replacement cost and risk analysis",
    segment: "Insurer",
    toolName: "benchmark-insurance-premiums",
    description: "Segment-level analysis for insurance premium benchmarking. Breaks down replacement costs and sold volumes by body type, fuel type, and state — giving underwriters data to calibrate premiums.",
    inputParams: [],
    apiFlow: [
      { step: 1, label: "Three-Way Market Breakdown", apis: ["soldSummary", "soldSummary", "soldSummary"], parallel: true, note: "Fetch sold summary by body_type, by body_type+fuel_type, and by state — all in parallel" },
    ],
    renders: "Replacement cost by segment, EV vs ICE cost comparison, state-level risk heatmap, premium adequacy indicators",
  },
  {
    id: "brand-command-center",
    name: "Brand Command Center",
    tagline: "Your brands vs the competition",
    segment: "Manufacturer",
    toolName: null,
    description: "OEM brand intelligence dashboard. Tracks your brand's market share, pricing, and sold volume against competitors using sold vehicle summary data.",
    inputParams: [
      { name: "make", type: "string", required: true, desc: "Your brand (e.g., Toyota)" },
      { name: "state", type: "string", required: false, desc: "State for regional analysis" },
    ],
    apiFlow: [
      { step: 1, label: "Brand + Market Data", apis: ["soldSummary"], parallel: false, note: "Fetch sold summary by make with volume and price measures" },
    ],
    renders: "Brand vs competitor cards, market share bars, price position chart, volume momentum, segment share breakdown",
  },
  {
    id: "regional-demand-allocator",
    name: "Regional Demand Allocator",
    tagline: "Allocate inventory where demand is hottest",
    segment: "Manufacturer",
    toolName: null,
    description: "State-level demand allocation tool for OEMs. Shows where demand is hottest by state and segment, helping guide inventory allocation decisions.",
    inputParams: [
      { name: "make", type: "string", required: false, desc: "Your brand" },
    ],
    apiFlow: [
      { step: 1, label: "State-Level Demand", apis: ["soldSummary"], parallel: false, note: "Fetch sold summary by state with volume rankings" },
      { step: 2, label: "Segment Demand", apis: ["soldSummary"], parallel: false, note: "Fetch sold summary by body type for segment mix" },
    ],
    renders: "Geographic demand heatmap, state ranking table, segment allocation recommendations, supply vs demand indicators",
  },
  {
    id: "oem-depreciation-tracker",
    name: "OEM Depreciation Tracker",
    tagline: "How fast are your models losing value vs the competition?",
    segment: "Manufacturer",
    toolName: null,
    description: "Tracks residual value retention across your brand's models, compares depreciation curves against competitors in the same segments, and highlights models with accelerating or decelerating value loss. Helps product planners and pricing teams see which nameplates hold value and which need intervention.",
    inputParams: [
      { name: "myBrand", type: "string", required: true, desc: "Your OEM brand (e.g., Toyota)" },
      { name: "competitors", type: "string", required: false, desc: "Comma-separated competitor brands" },
      { name: "bodyType", type: "string", required: false, desc: "Filter by body type (sedan, suv, truck)" },
    ],
    apiFlow: [
      { step: 1, label: "Brand + Competitor Residual Data", apis: ["soldSummary", "soldSummary"], parallel: true, note: "Fetch sold summary for your brand and competitors by make+model with average_sale_price and sold_count — in parallel" },
      { step: 2, label: "Segment Benchmark + Regional", apis: ["soldSummary", "soldSummary"], parallel: true, note: "Fetch body-type segment benchmarks and state-level geographic retention data — in parallel" },
    ],
    renders: "Depreciation curves (your models vs competitors over time), model-by-model residual ranking table, body-type segment benchmark comparison, geographic heatmap of price retention by state, Value Alert badges for fast-depreciating models",
  },
  {
    id: "ev-transition-monitor",
    name: "EV Transition Monitor",
    tagline: "Track your electrification progress against the market",
    segment: "Manufacturer",
    toolName: null,
    description: "OEM-focused EV dashboard that tracks your brand's EV vs ICE sales mix, compares EV penetration to competitors, maps state-level EV adoption to guide production allocation, and monitors EV pricing parity. Unlike the cross-segment EV Market Monitor, this is brand-centric: 'How is MY electrification strategy performing?'",
    inputParams: [
      { name: "myBrand", type: "string", required: true, desc: "Your OEM brand (e.g., Ford)" },
      { name: "competitors", type: "string", required: false, desc: "Comma-separated competitor brands" },
    ],
    apiFlow: [
      { step: 1, label: "EV Market Rankings", apis: ["soldSummary", "soldSummary"], parallel: true, note: "Fetch EV sold rankings by make (top 15) and your brand's EV volume by state — in parallel" },
      { step: 2, label: "Price Parity + Segment Mix", apis: ["soldSummary", "soldSummary"], parallel: true, note: "Fetch EV vs ICE price comparison by body_type+fuel_type_category and total brand volume for mix % — in parallel" },
    ],
    renders: "EV mix % trend line for your brand, competitor EV leaderboard with sold count and avg price, state-level EV heatmap for your brand, EV vs ICE price parity chart by body type, Electrification Score KPI card",
  },
  {
    id: "model-contenting-analyzer",
    name: "Model Contenting Analyzer",
    tagline: "Which trims and configs are the market buying?",
    segment: "Manufacturer",
    toolName: null,
    description: "Analyzes trim-level and body-type demand for a specific model, comparing active inventory distribution against sold patterns to identify which configurations are over- or under-supplied. Helps OEM product planners understand which trims to produce more of and which to de-emphasize.",
    inputParams: [
      { name: "make", type: "string", required: true, desc: "Your brand (e.g., Honda)" },
      { name: "model", type: "string", required: true, desc: "Model to analyze (e.g., CR-V)" },
      { name: "year", type: "string", required: false, desc: "Model year or range (e.g., 2024)" },
      { name: "state", type: "string", required: false, desc: "State for regional analysis" },
    ],
    apiFlow: [
      { step: 1, label: "Active Inventory + Sold Performance", apis: ["searchActive", "soldSummary"], parallel: true, note: "Fetch active inventory with trim/body_type/fuel_type facets and stats, plus sold performance by body_type — in parallel" },
      { step: 2, label: "Recent Sold + DOM Extremes", apis: ["searchRecents", "searchActive", "searchActive"], parallel: true, note: "Fetch recently sold pricing, slowest-moving units (high DOM), and fastest-moving units (low DOM) — in parallel" },
      { step: 3, label: "Trim Spec Decode", apis: ["decode", "decode"], parallel: true, note: "Decode sample VINs from fast-moving and slow-moving results to compare trim specs" },
    ],
    renders: "Trim distribution pie chart, DOM-by-trim bar chart (which trims sell fast vs sit), price-by-trim scatter, supply vs demand mismatch table, feature comparison grid for top vs bottom trims, Contenting Score badges (oversupplied / undersupplied)",
  },
  {
    id: "market-momentum-report",
    name: "Market Momentum Report",
    tagline: "Monthly market pulse for strategic planning",
    segment: "Manufacturer",
    toolName: null,
    description: "Monthly strategic briefing for OEM leadership. Shows month-over-month volume changes by brand and segment, pricing power trends, days-supply health, and which competitors are gaining or losing ground. Designed to be the 'one report' an OEM exec reads at the start of each month.",
    inputParams: [
      { name: "myBrand", type: "string", required: true, desc: "Your OEM brand" },
      { name: "state", type: "string", required: false, desc: "State for regional focus" },
    ],
    apiFlow: [
      { step: 1, label: "Current vs Prior Month + Segments", apis: ["soldSummary", "soldSummary", "soldSummary"], parallel: true, note: "Fetch current month make rankings, prior month make rankings, and body-type segment data — all in parallel" },
      { step: 2, label: "Pricing Power + Days Supply + Incentives", apis: ["soldSummary", "searchActive", "incentives"], parallel: true, note: "Fetch pricing power (price_over_msrp), current inventory with DOM stats, and your active incentive programs — all in parallel" },
    ],
    renders: "Executive summary KPI strip (market volume / share change / pricing power), brand momentum table sorted by bps change, segment mix shift chart, pricing power scatter plot, days-supply gauge, active incentive summary cards, Market Signals callout box",
  },
  {
    id: "incentive-effectiveness-dashboard",
    name: "Incentive Effectiveness Dashboard",
    tagline: "Are your incentives moving metal?",
    segment: "Manufacturer",
    toolName: null,
    description: "Correlates OEM incentive programs with actual sales velocity (DOM) and volume changes. Shows which incentive programs are associated with faster turns and higher volumes, and which models might need more (or different) incentive support. Critical for incentive budget optimization.",
    inputParams: [
      { name: "make", type: "string", required: true, desc: "Your OEM brand" },
      { name: "state", type: "string", required: false, desc: "State for regional analysis" },
    ],
    apiFlow: [
      { step: 1, label: "Incentives + Sales + Inventory", apis: ["incentives", "soldSummary", "searchActive"], parallel: true, note: "Fetch all current incentives for your brand, model-level sold performance (volume + DOM), and active inventory with model facets — all in parallel" },
    ],
    renders: "Model-by-model incentive matrix (rows = models / columns = incentive types with amounts), velocity change indicator per model (DOM trend arrow), volume impact chart, Incentive ROI signal badges (Increase support / Reduce spend / On track), active inventory pie with incentive coverage overlay",
  },
  {
    id: "auction-lane-planner",
    name: "Auction Lane Planner",
    tagline: "Plan lanes, price consignments, target buyers",
    segment: "Auction House",
    toolName: null,
    description: "Auction lane planning tool. Uses market data to help auction houses organize lanes, set reserve prices, and identify target buyers based on local demand patterns.",
    inputParams: [
      { name: "state", type: "string", required: true, desc: "Auction state" },
      { name: "zip", type: "string", required: false, desc: "Auction ZIP code" },
    ],
    apiFlow: [
      { step: 1, label: "Demand + Pricing Data", apis: ["soldSummary", "searchActive"], parallel: true, note: "Fetch demand rankings and current market pricing in parallel" },
    ],
    renders: "Lane planning grid, reserve price suggestions, buyer targeting cards, demand-based lane ordering",
  },
  {
    id: "auction-arbitrage-finder",
    name: "Auction Arbitrage Finder",
    tagline: "Wholesale vs retail spread — find profit opportunities",
    segment: "Auction House",
    toolName: "find-auction-arbitrage",
    description: "Finds arbitrage opportunities by comparing wholesale and retail price predictions for a batch of VINs. Highlights the biggest spread opportunities for dealers and wholesalers.",
    inputParams: [
      { name: "vins", type: "string", required: true, desc: "Comma-separated VINs to evaluate" },
      { name: "zip", type: "string", required: false, desc: "Market ZIP code" },
    ],
    apiFlow: [
      { step: 1, label: "For each VIN in parallel", apis: ["decode", "predictRetail", "predictWholesale"], parallel: true, note: "Decode + retail price + wholesale price for every VIN simultaneously" },
    ],
    renders: "Arbitrage opportunity cards sorted by spread, retail vs wholesale waterfall chart, ROI estimates, deal type badges",
  },
  {
    id: "auction-run-list-analyzer",
    name: "Auction Run List Analyzer",
    tagline: "Pre-sale VIN evaluation with hammer price predictions",
    segment: "Auction House",
    toolName: null,
    description: "Evaluates a batch of consigned VINs before sale day. For each VIN, decodes specs, predicts retail and wholesale prices, calculates expected hammer price (0.92x retail factor), and produces a BUY/CAUTION/PASS sell-through prediction based on market demand and pricing position.",
    inputParams: [
      { name: "vins", type: "string", required: true, desc: "Comma-separated VINs on the run list" },
      { name: "zip", type: "string", required: false, desc: "Auction location ZIP" },
    ],
    apiFlow: [
      { step: 1, label: "For each VIN in parallel", apis: ["decode", "predictRetail", "predictWholesale"], parallel: true, note: "Decode specs + predict retail and wholesale prices for every VIN simultaneously" },
      { step: 2, label: "Market Context", apis: ["soldSummary"], parallel: false, note: "Fetch sold demand data to assess sell-through probability per make/model" },
    ],
    renders: "Run list table with expected hammer prices, BUY/CAUTION/PASS verdicts, retail-to-wholesale spread, sell-through probability gauge, make/model demand indicators",
  },
  {
    id: "consignment-sourcer",
    name: "Consignment Sourcer",
    tagline: "Find dealers with aged inventory ripe for consignment",
    segment: "Auction House",
    toolName: null,
    description: "Identifies dealers with aged and overpriced inventory who are prime candidates for consignment. Searches active listings filtered by high days-on-market, calculates floor plan burn, and ranks dealers by consignment opportunity score.",
    inputParams: [
      { name: "zip", type: "string", required: true, desc: "Target market ZIP code" },
      { name: "radius", type: "number", required: false, desc: "Search radius in miles (default: 75)" },
      { name: "minDom", type: "number", required: false, desc: "Minimum days on market threshold (default: 60)" },
    ],
    apiFlow: [
      { step: 1, label: "Aged Inventory Search", apis: ["searchActive"], parallel: false, note: "Search active listings with high DOM, sorted by days on market descending, with dealer facets" },
      { step: 2, label: "Market Demand Context", apis: ["soldSummary"], parallel: false, note: "Fetch demand rankings to identify which aged vehicles have strong market demand elsewhere" },
    ],
    renders: "Dealer prospect list ranked by consignment opportunity, aged inventory count per dealer, floor plan burn estimates, vehicle-level detail table, geographic arbitrage indicators",
  },
  {
    id: "auction-dealer-targeting",
    name: "Auction Dealer Targeting",
    tagline: "Identify high-volume buyers in your target market",
    segment: "Auction House",
    toolName: null,
    description: "Identifies active dealers in a target market by analyzing inventory patterns. Uses active listing facets to find high-volume dealers, categorizes them by type (franchise vs independent), and assesses buying capacity based on inventory size, mix, and turnover patterns.",
    inputParams: [
      { name: "zip", type: "string", required: true, desc: "Target market ZIP code" },
      { name: "radius", type: "number", required: false, desc: "Search radius in miles (default: 50)" },
      { name: "make", type: "string", required: false, desc: "Filter by vehicle make" },
    ],
    apiFlow: [
      { step: 1, label: "Market Inventory with Dealer Facets", apis: ["searchActive"], parallel: false, note: "Search active listings in target area with dealer_id facets to identify all active dealers" },
      { step: 2, label: "Demand + Segment Data", apis: ["soldSummary", "soldSummary"], parallel: true, note: "Fetch sold demand by make/model and body type to assess buyer preferences in the market" },
    ],
    renders: "Dealer prospect table ranked by inventory volume, dealer type badges (franchise/independent), inventory mix charts, buying capacity indicators, segment preference match scores",
  },
  {
    id: "wholesale-vehicle-router",
    name: "Wholesale Vehicle Router",
    tagline: "Paste VINs, get dealer-match rankings",
    segment: "Wholesaler",
    toolName: "route-wholesale-vehicles",
    description: "Routes wholesale vehicles to the best-matching dealers. Decodes and prices each VIN, then matches against dealer profiles based on make/segment alignment and local demand.",
    inputParams: [
      { name: "vins", type: "string", required: true, desc: "Comma-separated VINs" },
      { name: "zip", type: "string", required: false, desc: "Origination ZIP" },
    ],
    apiFlow: [
      { step: 1, label: "For each VIN in parallel", apis: ["decode", "predictRetail"], parallel: true, note: "Decode and price every VIN simultaneously" },
    ],
    renders: "Vehicle cards with decoded specs, predicted values, dealer match rankings, routing recommendations",
  },
  {
    id: "ev-market-monitor",
    name: "EV Market Monitor",
    tagline: "The EV transition in one dashboard",
    segment: "Cross-Segment",
    toolName: null,
    description: "Comprehensive EV market monitoring dashboard. Tracks EV adoption, pricing, and market share using sold summary data segmented by fuel type category.",
    inputParams: [
      { name: "state", type: "string", required: false, desc: "State for regional analysis" },
    ],
    apiFlow: [
      { step: 1, label: "EV Market Data", apis: ["soldSummary"], parallel: false, note: "Fetch sold summary by fuel_type_category with volume and price measures" },
    ],
    renders: "EV penetration gauge, EV vs ICE price comparison, adoption trend chart, segment breakdown, geographic heatmap",
  },
  {
    id: "vin-history-detective",
    name: "VIN History Detective",
    tagline: "Full listing timeline — dealer hops, price changes, red flags",
    segment: "Cross-Segment",
    toolName: "trace-vin-history",
    description: "Investigates a vehicle's complete listing history. Shows every time it appeared on a dealer lot, with price changes, dealer hops, and time-on-market — revealing red flags and market behavior patterns.",
    inputParams: [
      { name: "vin", type: "string", required: true, desc: "17-character VIN" },
      { name: "miles", type: "number", required: false, desc: "Current mileage" },
      { name: "zip", type: "string", required: false, desc: "ZIP code for local context" },
    ],
    apiFlow: [
      { step: 1, label: "Decode VIN", apis: ["decode"], parallel: false, note: "Get vehicle specs" },
      { step: 2, label: "History + Price", apis: ["carHistory", "predictRetail"], parallel: true, note: "Fetch full listing history and current price prediction in parallel" },
    ],
    renders: "Timeline visualization with dealer hops, stepped-line price chart, red flag alerts (excessive relisting, price volatility), current value vs historical range",
  },
  {
    id: "market-anomaly-detector",
    name: "Market Anomaly Detector",
    tagline: "Find underpriced vehicles and pricing outliers",
    segment: "Cross-Segment",
    toolName: "detect-market-anomalies",
    description: "Scans active listings for pricing anomalies — underpriced vehicles, overpriced outliers, and unusual patterns. Uses statistical analysis of search results to identify opportunities.",
    inputParams: [
      { name: "make", type: "string", required: false, desc: "Vehicle make" },
      { name: "model", type: "string", required: false, desc: "Vehicle model" },
      { name: "year", type: "string", required: false, desc: "Year or range" },
      { name: "state", type: "string", required: false, desc: "State to search" },
    ],
    apiFlow: [
      { step: 1, label: "Search with Stats", apis: ["searchActive"], parallel: false, note: "Search active listings with stats (price, miles, DOM) for statistical analysis" },
    ],
    renders: "Anomaly scatter plot (price vs miles), Z-score distribution, underpriced opportunity cards, overpriced alerts, market histogram",
  },
  {
    id: "uk-market-trends",
    name: "UK Market Trends",
    tagline: "Macro UK automotive market intelligence",
    segment: "Cross-Segment",
    toolName: "get-uk-market-trends",
    description: "UK automotive market trends dashboard. Tracks active and recently sold listings across UK dealers with prices in GBP.",
    inputParams: [
      { name: "make", type: "string", required: false, desc: "Filter by make" },
    ],
    apiFlow: [
      { step: 1, label: "UK Active + Recent", apis: ["searchUkActive", "searchUkRecents"], parallel: true, note: "Fetch UK active and recent listings with price/miles stats in parallel" },
    ],
    renders: "UK market overview, price trend charts (GBP), active vs sold comparison, brand market share, segment analysis",
  },
  {
    id: "uk-market-explorer",
    name: "UK Market Explorer",
    tagline: "Search and compare UK car listings in GBP",
    segment: "Consumer",
    toolName: "search-uk-cars",
    description: "UK car search with GBP pricing. Search active UK listings by make, model, postal code, and price range. Also fetches recent sold data for market context.",
    inputParams: [
      { name: "make", type: "string", required: false, desc: "Vehicle make" },
      { name: "model", type: "string", required: false, desc: "Vehicle model" },
      { name: "year", type: "string", required: false, desc: "Year" },
      { name: "postal_code", type: "string", required: false, desc: "UK postal code" },
      { name: "radius", type: "number", required: false, desc: "Search radius in miles" },
      { name: "price_range", type: "string", required: false, desc: "Price range: min-max" },
    ],
    apiFlow: [
      { step: 1, label: "UK Active Listings", apis: ["searchUkActive"], parallel: false, note: "Search UK active listings with filters and stats" },
      { step: 2, label: "UK Sold Context", apis: ["searchUkRecents"], parallel: false, note: "Fetch recently sold for market comparison" },
    ],
    renders: "Search results grid, filter sidebar, price comparison, sold context overlay, GBP pricing throughout",
  },
  {
    id: "uk-dealer-pricing",
    name: "UK Dealer Pricing",
    tagline: "UK lot inventory priced against the market",
    segment: "Dealer",
    toolName: "scan-uk-lot-pricing",
    description: "UK dealer lot pricing dashboard. Fetches dealer inventory from UK active listings and overlays recently sold data for market context.",
    inputParams: [
      { name: "dealer_id", type: "string", required: true, desc: "UK dealer ID" },
      { name: "make", type: "string", required: false, desc: "Filter by make" },
    ],
    apiFlow: [
      { step: 1, label: "UK Inventory + Recent Sold", apis: ["searchUkActive", "searchUkRecents"], parallel: true, note: "Fetch dealer inventory and market sold data in parallel" },
    ],
    renders: "Inventory table with market positioning, price gap indicators, aging analysis, sold comparison overlay",
  },
  {
    id: "auto-journalist-briefing",
    name: "Auto Journalist Briefing",
    tagline: "One-page market briefing with quotable data points",
    segment: "Auto Media",
    toolName: "generate-market-briefing",
    description: "One-page market briefing for auto journalists. Aggregates sold data across makes, body types, and states into quotable data points and trend narratives.",
    inputParams: [],
    apiFlow: [
      { step: 1, label: "Three-Way Market Analysis", apis: ["soldSummary", "soldSummary", "soldSummary"], parallel: true, note: "Fetch by make (top 15), by body type, and by state (top 10) — all in parallel" },
    ],
    renders: "Headline data points, make ranking cards, segment trend bars, geographic price map, quotable stat blocks",
  },
  {
    id: "fleet-lifecycle-manager",
    name: "Fleet Lifecycle Manager",
    tagline: "Fleet values, depreciation, and replacement planning",
    segment: "Fleet Manager",
    toolName: "manage-fleet-lifecycle",
    description: "Fleet lifecycle management tool. Decodes and prices fleet VINs, then searches for replacement vehicles. Provides depreciation tracking and replacement timing recommendations.",
    inputParams: [
      { name: "vins", type: "string", required: true, desc: "Comma-separated fleet VINs" },
      { name: "zip", type: "string", required: false, desc: "Fleet base ZIP" },
    ],
    apiFlow: [
      { step: 1, label: "For each VIN in parallel", apis: ["decode", "predictRetail"], parallel: true, note: "Decode and price every fleet vehicle simultaneously" },
      { step: 2, label: "Replacement Search", apis: ["searchActive"], parallel: false, note: "Search for replacement vehicles near fleet base" },
    ],
    renders: "Fleet valuation summary, per-vehicle depreciation cards, replacement candidate list, lifecycle timeline, budget planning",
  },
  {
    id: "rental-fleet-valuator",
    name: "Rental Fleet Valuator",
    tagline: "Mileage-adjusted fleet valuation with rotation timing",
    segment: "Rental/Subscription",
    toolName: "value-rental-fleet",
    description: "Rental fleet valuation tool. Decodes and prices rental fleet VINs with mileage adjustments, providing rotation timing recommendations based on depreciation curves.",
    inputParams: [
      { name: "vins", type: "string", required: true, desc: "Comma-separated fleet VINs" },
      { name: "zip", type: "string", required: false, desc: "Fleet base ZIP" },
    ],
    apiFlow: [
      { step: 1, label: "For each VIN in parallel", apis: ["decode", "predictRetail"], parallel: true, note: "Decode and price every rental vehicle simultaneously" },
    ],
    renders: "Fleet valuation table, mileage-adjusted values, rotation timing recommendations, depreciation rate cards",
  },
  {
    id: "territory-pipeline",
    name: "Territory Pipeline",
    tagline: "Find dealers who need floor plan",
    segment: "Lender Sales",
    toolName: null,
    description: "Territory pipeline tool for lender sales teams. Uses active inventory data to identify dealers who might benefit from floor plan financing based on inventory size, mix, and aging patterns.",
    inputParams: [
      { name: "zip", type: "string", required: true, desc: "Territory center ZIP" },
      { name: "radius", type: "number", required: false, desc: "Territory radius" },
      { name: "state", type: "string", required: false, desc: "State" },
    ],
    apiFlow: [
      { step: 1, label: "Territory Inventory", apis: ["searchActive"], parallel: false, note: "Search active listings in territory with dealer facets" },
      { step: 2, label: "Demand Context", apis: ["soldSummary"], parallel: false, note: "Fetch sold summary for territory context" },
    ],
    renders: "Dealer prospect list, inventory size indicators, floor plan opportunity scores, territory map",
  },
  {
    id: "floor-plan-opportunity-scanner",
    name: "Floor Plan Opportunity Scanner",
    tagline: "Find dealers with aging inventory who need floor plan financing",
    segment: "Lender Sales",
    toolName: null,
    description: "Scans a territory for dealers with high days-on-market inventory — a signal they may need floor plan financing. Calculates estimated floor plan burn per dealer ($35/day/unit), ranks dealers by opportunity size, and flags those with 90+ DOM inventory exceeding 30% of their lot.",
    inputParams: [
      { name: "zip", type: "string", required: true, desc: "Territory center ZIP" },
      { name: "radius", type: "number", required: false, desc: "Search radius in miles (default: 50)" },
      { name: "minDom", type: "number", required: false, desc: "Minimum DOM threshold (default: 60)" },
    ],
    apiFlow: [
      { step: 1, label: "Aged Inventory by Dealer", apis: ["searchActive"], parallel: false, note: "Search high-DOM listings in territory with dealer facets and stats" },
      { step: 2, label: "Market Demand Context", apis: ["soldSummary"], parallel: false, note: "Fetch sold demand to identify which aged units have market demand" },
    ],
    renders: "Dealer opportunity table ranked by floor plan burn, aging heatmap per dealer, estimated monthly burn ($35/day), DOM distribution chart, hot prospect badges for dealers with 90+ DOM > 30%",
  },
  {
    id: "dealer-intelligence-brief",
    name: "Dealer Intelligence Brief",
    tagline: "Dealer profile data for pitch prep",
    segment: "Lender Sales",
    toolName: null,
    description: "One-page dealer intelligence brief for sales call prep. Pulls a dealer's active inventory to analyze size, brand mix, body type mix, pricing patterns, aging health, and estimated floor plan exposure. Everything a lender sales rep needs before walking in the door.",
    inputParams: [
      { name: "dealer_id", type: "string", required: true, desc: "Target dealer's MarketCheck ID" },
      { name: "zip", type: "string", required: false, desc: "Dealer ZIP for market context" },
      { name: "state", type: "string", required: false, desc: "State for demand comparison" },
    ],
    apiFlow: [
      { step: 1, label: "Dealer Inventory Profile", apis: ["searchActive"], parallel: false, note: "Fetch dealer's full active inventory with stats (price, miles, DOM) and facets (make, model, body_type)" },
      { step: 2, label: "Market Context + Demand", apis: ["soldSummary", "searchActive"], parallel: true, note: "Fetch state-level demand data and nearby competitor inventory for context — in parallel" },
    ],
    renders: "Dealer profile card (name, location, type, inventory count), brand mix pie chart, body type distribution, aging health gauge, estimated floor plan exposure, pricing vs market comparison, key talking points for sales call",
  },
  {
    id: "subprime-opportunity-finder",
    name: "Subprime Opportunity Finder",
    tagline: "Identify subprime-heavy dealers for lending products",
    segment: "Lender Sales",
    toolName: null,
    description: "Identifies dealers likely serving subprime buyers by analyzing inventory patterns: high percentage of older vehicles (5+ years), lower price points, independent dealer type, and high DOM. These signals indicate dealers who may need subprime lending products or BHPH (buy-here-pay-here) financing partnerships.",
    inputParams: [
      { name: "zip", type: "string", required: true, desc: "Target market ZIP" },
      { name: "radius", type: "number", required: false, desc: "Search radius (default: 50)" },
      { name: "state", type: "string", required: false, desc: "State for demand data" },
    ],
    apiFlow: [
      { step: 1, label: "Market Inventory Analysis", apis: ["searchActive"], parallel: false, note: "Search active inventory filtered by older vehicles and lower price points, with dealer facets" },
      { step: 2, label: "Market Demand Context", apis: ["soldSummary"], parallel: false, note: "Fetch sold data for the segment to understand demand dynamics" },
    ],
    renders: "Dealer prospect list ranked by subprime signal score, inventory age distribution per dealer, average price point indicators, dealer type badges (independent/BHPH), estimated lending opportunity size",
  },
  // ── Chat Demos ──────────────────────────────────────────────────────────
  {
    id: "chat-vercel-ai",
    name: "AI Car Advisor (Vercel AI SDK)",
    tagline: "Conversational car shopping with Claude streaming",
    segment: "Chat Demos",
    toolName: null,
    description: "Chat-based car shopping advisor built with Vercel AI SDK and Claude. Users ask questions in natural language and the AI calls MarketCheck APIs via MCP tools to provide real-time market data in conversational responses.",
    inputParams: [],
    apiFlow: [
      { step: 1, label: "User asks a question", apis: [], parallel: false, note: "AI determines which MarketCheck tool(s) to call based on the query" },
      { step: 2, label: "MCP Tool Calls", apis: ["decode", "predictRetail", "searchActive", "carHistory"], parallel: false, note: "AI selects and calls relevant tools — could be any combination depending on the question" },
    ],
    renders: "Streaming chat interface, tool execution indicators, rich markdown responses with data tables and insights",
    isChatApp: true,
    chatSdk: "Vercel AI SDK",
    chatSdkUrl: "https://sdk.vercel.ai",
  },
  {
    id: "chat-copilotkit",
    name: "Dashboard Copilot (CopilotKit)",
    tagline: "AI copilot overlay on existing dashboards",
    segment: "Chat Demos",
    toolName: null,
    description: "AI copilot overlay built with CopilotKit. Adds a chat sidebar to any existing dashboard, allowing users to query MarketCheck data conversationally while viewing visual results.",
    inputParams: [],
    apiFlow: [
      { step: 1, label: "Copilot intercepts user query", apis: [], parallel: false, note: "CopilotKit routes the query to Claude with MarketCheck MCP tools" },
      { step: 2, label: "MCP Tool Calls", apis: ["decode", "predictRetail", "searchActive", "soldSummary"], parallel: false, note: "AI calls relevant MarketCheck tools based on context" },
    ],
    renders: "Copilot sidebar, inline data cards, dashboard integration, conversational data exploration",
    isChatApp: true,
    chatSdk: "CopilotKit",
    chatSdkUrl: "https://www.copilotkit.ai",
  },
  {
    id: "chat-assistant-ui",
    name: "MarketCheck Chat (assistant-ui)",
    tagline: "Custom-branded chat with rich tool result cards",
    segment: "Chat Demos",
    toolName: null,
    description: "Custom-branded chat interface built with assistant-ui. Features rich tool result cards that render MarketCheck data as visual widgets inline within the chat.",
    inputParams: [],
    apiFlow: [
      { step: 1, label: "User sends message", apis: [], parallel: false, note: "assistant-ui routes to Claude with MarketCheck MCP server" },
      { step: 2, label: "MCP Tool Calls with UI", apis: ["decode", "predictRetail", "searchActive"], parallel: false, note: "Tools return data that renders as rich cards in the chat" },
    ],
    renders: "Branded chat UI, rich tool result cards (vehicle cards, price charts, search results), custom styling",
    isChatApp: true,
    chatSdk: "assistant-ui",
    chatSdkUrl: "https://www.assistant-ui.com",
  },
  {
    id: "chat-sdk-bot",
    name: "Multi-Platform Bot (Chat SDK)",
    tagline: "One bot for Slack, Discord, Telegram, and Teams",
    segment: "Chat Demos",
    toolName: null,
    description: "Multi-platform chat bot built with Chat SDK. Single codebase deploys to Slack, Discord, Telegram, and Teams — all with MarketCheck MCP tool access.",
    inputParams: [],
    apiFlow: [
      { step: 1, label: "Message from any platform", apis: [], parallel: false, note: "Chat SDK normalizes the message across platforms" },
      { step: 2, label: "MCP Tool Calls", apis: ["decode", "predictRetail", "searchActive"], parallel: false, note: "AI processes query and calls MarketCheck tools" },
    ],
    renders: "Platform-native message formatting, VIN lookup results, price predictions, search results — across Slack/Discord/Telegram/Teams",
    isChatApp: true,
    chatSdk: "Chat SDK",
    chatSdkUrl: "https://github.com/nichochar/chat-sdk",
  },
  {
    id: "chat-chainlit",
    name: "Market Analyst (Chainlit)",
    tagline: "Python MCP chat with tool execution visualization",
    segment: "Chat Demos",
    toolName: null,
    description: "Python-based chat interface built with Chainlit. Features tool execution visualization showing which MarketCheck APIs are being called and their results in real-time.",
    inputParams: [],
    apiFlow: [
      { step: 1, label: "User asks market question", apis: [], parallel: false, note: "Chainlit routes to Claude with MCP tools" },
      { step: 2, label: "Visible Tool Execution", apis: ["decode", "predictRetail", "soldSummary"], parallel: false, note: "Each tool call is shown as an expandable step in the chat" },
    ],
    renders: "Step-by-step tool execution visualization, expandable tool results, Python-native chat UI, async streaming",
    isChatApp: true,
    chatSdk: "Chainlit",
    chatSdkUrl: "https://docs.chainlit.io",
  },
  {
    id: "chat-streamlit",
    name: "Quick Market Check (Streamlit)",
    tagline: "Lightweight Python chat for data teams",
    segment: "Chat Demos",
    toolName: null,
    description: "Lightweight Python chat built with Streamlit. Minimal setup for data teams who want conversational access to MarketCheck data without complex frontend development.",
    inputParams: [],
    apiFlow: [
      { step: 1, label: "User types query", apis: [], parallel: false, note: "Streamlit chat input routes to Claude" },
      { step: 2, label: "MCP Tool Calls", apis: ["searchActive", "soldSummary", "predictRetail"], parallel: false, note: "AI calls relevant tools, returns formatted results" },
    ],
    renders: "Simple chat interface, markdown-rendered responses, data tables, minimal Python setup",
    isChatApp: true,
    chatSdk: "Streamlit",
    chatSdkUrl: "https://streamlit.io",
  },
  {
    id: "chat-langchain",
    name: "AI Agent Explorer (LangChain)",
    tagline: "Autonomous agent with visible reasoning chains",
    segment: "Chat Demos",
    toolName: null,
    description: "Autonomous AI agent built with LangChain. Shows visible reasoning chains as the agent decides which MarketCheck tools to use, in what order, and how to synthesize the results.",
    inputParams: [],
    apiFlow: [
      { step: 1, label: "Agent receives task", apis: [], parallel: false, note: "LangChain agent plans which tools to use" },
      { step: 2, label: "Reasoning + Tool Calls", apis: ["decode", "predictRetail", "searchActive", "carHistory"], parallel: false, note: "Agent executes multi-step plan with visible reasoning at each step" },
    ],
    renders: "Reasoning chain visualization, tool call/result pairs, autonomous multi-step execution, final synthesis",
    isChatApp: true,
    chatSdk: "LangChain",
    chatSdkUrl: "https://python.langchain.com",
  },
];

// ── HTML Generator ──────────────────────────────────────────────────────

function usesEnterpriseApi(app) {
  for (const step of app.apiFlow) {
    for (const apiKey of step.apis) {
      if (apiKey && API_ENDPOINTS[apiKey]?.enterprise) return true;
    }
  }
  return false;
}

function generateFlowDiagram(app) {
  const steps = app.apiFlow;
  let html = "";

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const apis = step.apis.filter(a => a); // filter empty
    const isParallel = step.parallel && apis.length > 1;

    html += `<div class="flow-step">`;
    html += `<div class="flow-step-header">`;
    html += `<div class="flow-step-num">${step.step}</div>`;
    html += `<div class="flow-step-label">${step.label}</div>`;
    if (isParallel) {
      html += `<span class="flow-parallel-badge">PARALLEL</span>`;
    } else if (apis.length > 0) {
      html += `<span class="flow-sequential-badge">SEQUENTIAL</span>`;
    }
    html += `</div>`; // header

    if (apis.length > 0) {
      html += `<div class="flow-api-cards ${isParallel ? "flow-parallel" : "flow-sequential"}">`;
      for (const apiKey of apis) {
        const api = API_ENDPOINTS[apiKey];
        if (!api) continue;
        html += `
          <div class="flow-api-card${api.enterprise ? " enterprise" : ""}">
            <div class="flow-api-method">${api.method}</div>${api.enterprise ? `<span class="enterprise-badge">Enterprise API</span>` : ""}
            <code class="flow-api-path">${api.path}</code>
            <div class="flow-api-name">${api.name}</div>
          </div>`;
      }
      html += `</div>`;
      if (isParallel) {
        html += `<div class="flow-parallel-line"></div>`;
      }
    }

    html += `<div class="flow-note">${step.note}</div>`;
    html += `</div>`; // flow-step

    if (i < steps.length - 1) {
      html += `<div class="flow-arrow">&#8595;</div>`;
    }
  }

  return html;
}

function generateApiDetailCards(app) {
  // Collect unique APIs used
  const seen = new Set();
  const apis = [];
  for (const step of app.apiFlow) {
    for (const apiKey of step.apis) {
      if (apiKey && !seen.has(apiKey)) {
        seen.add(apiKey);
        apis.push({ key: apiKey, ...API_ENDPOINTS[apiKey] });
      }
    }
  }

  let html = "";
  for (const api of apis) {
    html += `
    <div class="api-detail-card${api.enterprise ? " enterprise" : ""}">
      <div class="api-detail-header">
        <span class="api-method-badge">${api.method}</span>
        <code>${api.path}</code>
        ${api.enterprise ? `<span class="enterprise-badge">Enterprise API</span>` : ""}
      </div>
      <h4>${api.name}</h4>
      <p>${api.description}</p>
      <table class="param-table">
        <thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
        <tbody>
          ${api.params.map(p => `<tr><td><code>${p.name}</code></td><td>${p.type}</td><td>${p.required ? '<span class="required">Yes</span>' : "No"}</td><td>${p.desc}</td></tr>`).join("")}
        </tbody>
      </table>
      <div class="api-returns"><strong>Returns:</strong> ${api.returns}</div>
      <a href="${api.docUrl}" target="_blank" class="api-doc-link">View full API documentation &#8599;</a>
    </div>`;
  }
  return html;
}

function generateParamsTable(app) {
  if (!app.inputParams || app.inputParams.length === 0) {
    return `<p style="color:#64748b;">This app requires no input parameters — it aggregates market-wide data automatically.</p>`;
  }
  return `
    <table class="param-table">
      <thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
      <tbody>
        ${app.inputParams.map(p => `<tr><td><code>${p.name}</code></td><td>${p.type}</td><td>${p.required ? '<span class="required">Yes</span>' : "No"}</td><td>${p.desc}</td></tr>`).join("")}
      </tbody>
    </table>`;
}

function generateCurlExample(app) {
  if (!app.toolName) return "";
  const params = {};
  for (const p of app.inputParams) {
    if (p.name === "vin") params.vin = "KNDCB3LC9L5359658";
    else if (p.name === "miles") params.miles = 45000;
    else if (p.name === "zip") params.zip = "90210";
    else if (p.name === "askingPrice" || p.name === "price") params[p.name] = 22500;
    else if (p.name === "dealerId" || p.name === "dealer_id") params[p.name] = "abc123";
    else if (p.name === "state") params.state = "CA";
    else if (p.name === "make") params.make = "Toyota";
    else if (p.name === "model") params.model = "Camry";
    else if (p.name === "vins") params.vins = "KNDCB3LC9L5359658,1HGCV1F34LA000001";
    else if (p.name === "condition") params.condition = "good";
    else if (p.name === "geography") params.geography = "CA";
    else if (p.name === "radius") params.radius = 50;
    else if (p.name === "postal_code") params.postal_code = "SW1A 1AA";
    else if (p.name === "makes") params.makes = "Toyota,Honda,Ford";
    else if (p.name === "compareMakes") params.compareMakes = ["Honda", "Nissan"];
    else if (p.name === "loanAmount") params.loanAmount = 25000;
    else if (p.name === "damageSeverity") params.damageSeverity = "moderate";
  }
  const body = { _auth_mode: "api_key", _auth_value: "YOUR_API_KEY", ...params };
  return `
    <h3>Try It — cURL Example</h3>
    <pre class="code-block">curl -X POST https://apps.marketcheck.com/api/proxy/${app.toolName} \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(body, null, 2)}'</pre>`;
}

function generateMcpConfig(app) {
  return `
    <h3>2. As an MCP App (AI Assistants)</h3>
    <p>Add the MarketCheck MCP server to Claude Desktop, VS Code, or any MCP-compatible host:</p>
    <pre class="code-block">{
  "mcpServers": {
    "marketcheck-apps": {
      "url": "https://apps.marketcheck.com/mcp?api_key=YOUR_KEY"
    }
  }
}</pre>
    <p>Then ask the AI: <em>"${app.isChatApp ? "How would I build a chat app with MarketCheck data?" : `Use the ${app.toolName || app.id} tool to ${app.tagline.toLowerCase()}`}"</em></p>`;
}

function generatePage(app) {
  const segColor = SEGMENT_COLORS[app.segment] || "#6366f1";
  const screenshotUrl = `/assets/screenshots/${app.id}.png`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-QGPPMDJ4N6"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-QGPPMDJ4N6');
  </script>
  <title>How to Build: ${app.name} — MarketCheck Apps</title>
  <meta name="description" content="Step-by-step guide to build ${app.name} using MarketCheck APIs. Learn the API calls, sequencing, and parameters needed.">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://apps.marketcheck.com/app/${app.id}/">

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="How to Build: ${app.name} — MarketCheck Apps">
  <meta property="og:description" content="${app.description.substring(0, 200)}">
  <meta property="og:url" content="https://apps.marketcheck.com/app/${app.id}/">
  <meta property="og:image" content="https://apps.marketcheck.com/assets/screenshots/${app.id}.png">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="How to Build: ${app.name}">
  <meta name="twitter:description" content="${app.description.substring(0, 200)}">
  <meta name="twitter:image" content="https://apps.marketcheck.com/assets/screenshots/${app.id}.png">

  <!-- Structured Data -->
  <script type="application/ld+json">
  ${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "name": `How to Build: ${app.name}`,
    "description": app.description,
    "url": `https://apps.marketcheck.com/app/${app.id}/`,
    "image": `https://apps.marketcheck.com/assets/screenshots/${app.id}.png`,
    "author": { "@type": "Organization", "name": "MarketCheck", "url": "https://www.marketcheck.com" },
  })}
  </script>

  <style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
html { scroll-behavior:smooth; }
body {
  font-family:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;
  background:#f8fafc; color:#1e293b; line-height:1.6;
}
a { color:#066aab; text-decoration:none; }
a:hover { text-decoration:underline; }
code { font-family:'JetBrains Mono',monospace; font-size:0.875em; }
img { max-width:100%; height:auto; }

/* Nav */
.nav {
  position:sticky; top:0; z-index:100;
  background:rgba(255,255,255,0.95); backdrop-filter:blur(12px);
  border-bottom:1px solid #e2e8f0;
  padding:0 24px; height:56px;
  display:flex; align-items:center; gap:16px;
}
.nav-logo { font-weight:700; font-size:15px; color:#0f172a; white-space:nowrap; display:flex; align-items:center; gap:8px; }
.nav-logo img { height:24px; }
.nav-links { display:flex; gap:4px; margin-left:auto; }
.nav-links a {
  padding:6px 14px; border-radius:6px; font-size:13px; font-weight:500;
  color:#64748b; transition:all 0.2s;
}
.nav-links a:hover { background:#f1f5f9; color:#0f172a; text-decoration:none; }
.nav-links a.active { background:#066aab11; color:#066aab; }
.nav-toggle { display:none; background:none; border:none; font-size:24px; cursor:pointer; color:#64748b; }
@media (max-width:768px) {
  .nav-toggle { display:block; margin-left:auto; }
  .nav-links {
    display:none; position:absolute; top:56px; left:0; right:0;
    background:#fff; border-bottom:1px solid #e2e8f0;
    flex-direction:column; padding:8px;
  }
  .nav-links.open { display:flex; }
  .nav-links a { padding:12px 16px; }
}

/* Hero */
.page-hero {
  padding:48px 24px 32px; max-width:960px; margin:0 auto; position:relative;
}
.page-hero .breadcrumb { font-size:13px; color:#64748b; margin-bottom:16px; }
.page-hero .breadcrumb a { color:#066aab; }
.page-hero h1 { font-size:clamp(24px,3.5vw,36px); font-weight:700; color:#0f172a; line-height:1.15; margin-bottom:4px; }
.page-hero .subtitle { font-size:15px; font-weight:600; color:#066aab; margin-bottom:8px; text-transform:uppercase; letter-spacing:1px; }
.page-hero .tagline { font-size:18px; color:#64748b; margin-bottom:20px; }
.page-hero .segment-badge {
  display:inline-block; padding:4px 12px; border-radius:20px;
  font-size:12px; font-weight:600; letter-spacing:0.5px;
}
.page-hero .ctas { display:flex; gap:12px; margin-top:24px; flex-wrap:wrap; }
.btn {
  display:inline-flex; align-items:center; gap:6px;
  padding:10px 20px; border-radius:8px; font-size:14px; font-weight:600;
  border:none; cursor:pointer; transition:all 0.2s; text-decoration:none;
}
.btn-primary { background:#066aab; color:#fff; }
.btn-primary:hover { background:#055a91; text-decoration:none; }
.btn-secondary { background:#f1f5f9; color:#1e293b; border:1px solid #e2e8f0; }
.btn-secondary:hover { background:#e2e8f0; text-decoration:none; }
.btn-copy {
  position:absolute; top:48px; right:24px;
  background:#fff; color:#066aab;
  padding:10px 20px; border-radius:10px;
  font-size:13px; font-weight:600;
  border:1.5px solid #066aab;
  cursor:pointer; display:flex; align-items:center; gap:7px;
  transition:all 0.25s; z-index:10;
  box-shadow:0 2px 8px rgba(6,106,171,0.10);
}
.btn-copy:hover {
  background:#066aab; color:#fff;
  box-shadow:0 4px 16px rgba(6,106,171,0.22);
  transform:translateY(-2px);
}
.btn-copy.copied {
  background:#059669; color:#fff; border-color:#059669;
  box-shadow:0 4px 16px rgba(5,150,105,0.22);
}

/* Content */
.content { max-width:960px; margin:0 auto; padding:0 24px 64px; }
.section { margin-bottom:48px; }
.section h2 { font-size:22px; font-weight:700; color:#0f172a; margin-bottom:16px; padding-bottom:8px; border-bottom:2px solid #e2e8f0; }
.section h3 { font-size:16px; font-weight:600; color:#0f172a; margin:20px 0 8px; }
.section p { margin-bottom:12px; color:#475569; }

/* Screenshots */
.screenshots { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; margin:16px 0; }
.screenshot { border-radius:12px; overflow:hidden; border:1px solid #e2e8f0; box-shadow:0 2px 8px rgba(0,0,0,0.06); }
.screenshot img { width:100%; display:block; }

/* Flow Diagram */
.flow-diagram { padding:24px 0; }
.flow-step {
  background:#fff; border:1px solid #e2e8f0; border-radius:12px;
  padding:20px; margin-bottom:0; box-shadow:0 1px 3px rgba(0,0,0,0.04);
}
.flow-step-header {
  display:flex; align-items:center; gap:12px; margin-bottom:12px;
}
.flow-step-num {
  width:32px; height:32px; border-radius:50%;
  background:#066aab; color:#fff; font-weight:700; font-size:14px;
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
}
.flow-step-label { font-weight:700; font-size:16px; color:#0f172a; }
.flow-parallel-badge {
  padding:3px 10px; border-radius:12px; font-size:10px; font-weight:700;
  background:#dcfce7; color:#166534; letter-spacing:0.5px;
}
.flow-sequential-badge {
  padding:3px 10px; border-radius:12px; font-size:10px; font-weight:700;
  background:#fef3c7; color:#92400e; letter-spacing:0.5px;
}
.flow-api-cards {
  display:flex; gap:12px; flex-wrap:wrap; margin:8px 0;
}
.flow-api-cards.flow-parallel {
  border-left:3px solid #22c55e; padding-left:16px;
  position:relative;
}
.flow-api-cards.flow-parallel::before {
  content:"runs simultaneously"; position:absolute; top:-14px; left:20px;
  font-size:10px; color:#16a34a; font-weight:600; letter-spacing:0.5px;
}
.flow-api-cards.flow-sequential {
  border-left:3px solid #f59e0b; padding-left:16px;
}
.flow-api-card {
  background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px;
  padding:10px 14px; min-width:200px; flex:1;
}
.flow-api-method {
  display:inline-block; padding:2px 6px; border-radius:3px;
  font-size:10px; font-weight:700; background:#dcfce7; color:#166534;
  letter-spacing:0.5px; margin-bottom:4px;
}
.flow-api-path {
  display:block; font-size:11px; color:#0369a1; margin:4px 0;
  word-break:break-all;
}
.flow-api-name { font-weight:600; font-size:13px; color:#0f172a; }
.flow-note { font-size:13px; color:#64748b; margin-top:8px; font-style:italic; }
.flow-arrow {
  text-align:center; font-size:24px; color:#cbd5e1;
  padding:8px 0; line-height:1;
}

/* API Detail Cards */
.api-detail-card {
  background:#fff; border:1px solid #e2e8f0; border-radius:12px;
  padding:20px; margin-bottom:20px; box-shadow:0 1px 3px rgba(0,0,0,0.04);
}
.api-detail-header {
  display:flex; align-items:center; gap:10px; margin-bottom:8px; flex-wrap:wrap;
}
.api-method-badge {
  padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700;
  background:#dcfce7; color:#166534; letter-spacing:0.5px;
}
.api-detail-card h4 { font-size:16px; font-weight:700; color:#0f172a; margin:8px 0; }
.api-detail-card p { font-size:14px; color:#475569; margin-bottom:12px; }
.api-returns { font-size:13px; color:#475569; margin:12px 0; padding:10px; background:#f8fafc; border-radius:6px; border:1px solid #e2e8f0; }
.api-doc-link { font-size:13px; font-weight:600; }

/* Enterprise API badge */
.enterprise-badge {
  display:inline-flex; align-items:center; gap:4px;
  padding:3px 10px; border-radius:12px; font-size:10px; font-weight:700;
  background:#fef3c7; color:#92400e; border:1px solid #fde68a;
  letter-spacing:0.5px; white-space:nowrap;
}
.flow-api-card.enterprise { border-color:#fde68a; background:#fffbeb; }
.api-detail-card.enterprise { border-color:#fde68a; }
.enterprise-notice {
  background:#fffbeb; border:1px solid #fde68a; border-radius:10px;
  padding:14px 20px; margin-bottom:32px; display:flex; align-items:center; gap:10px;
  font-size:13px; color:#92400e; line-height:1.5;
}
.enterprise-notice strong { font-weight:700; }
.enterprise-notice a { color:#92400e; font-weight:600; text-decoration:underline; }

/* Param table */
.param-table { width:100%; border-collapse:collapse; font-size:14px; margin:12px 0; }
.param-table th { text-align:left; padding:8px 12px; background:#f8fafc; border:1px solid #e2e8f0; font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; }
.param-table td { padding:8px 12px; border:1px solid #e2e8f0; }
.param-table .required { color:#dc2626; font-weight:600; font-size:11px; }

/* Code blocks */
pre.code-block {
  background:#0f172a; color:#e2e8f0; padding:16px; border-radius:8px;
  overflow-x:auto; font-size:13px; line-height:1.5; margin:12px 0;
  position:relative;
}

/* Renders section */
.renders-list {
  display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:12px; margin:16px 0;
}
.render-item {
  background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:12px 16px;
  font-size:13px; color:#334155; display:flex; align-items:center; gap:8px;
}
.render-dot { width:8px; height:8px; border-radius:50%; background:${segColor}; flex-shrink:0; }

/* Footer */
.footer {
  background:#0f172a; color:#94a3b8; padding:48px 24px;
  text-align:center; font-size:13px;
}
.footer a { color:#60a5fa; }
.footer .footer-links { display:flex; gap:24px; justify-content:center; margin-bottom:16px; flex-wrap:wrap; }

/* Toast */
.toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%) translateY(100px); background:#0f172a; color:#fff; padding:12px 24px; border-radius:8px; font-size:14px; font-weight:500; transition:transform 0.3s; z-index:999; pointer-events:none; }
.toast.show { transform:translateX(-50%) translateY(0); }

@media (max-width:768px) {
  .btn-copy { position:static; margin-top:16px; width:100%; justify-content:center; border-radius:10px; }
  .page-hero { padding:32px 16px 24px; }
  .content { padding:0 16px 48px; }
  .flow-api-cards { flex-direction:column; }
  .renders-list { grid-template-columns:1fr; }
}
</style>
</head>
<body>

<nav class="nav">
  <a href="/" class="nav-logo">
    <img src="https://34682200.delivery.rocketcdn.me/wp-content/uploads/2024/05/cropped-MC-Icon.png.webp" alt="MC" width="24" height="24" />
    MarketCheck Apps
  </a>
  <button class="nav-toggle" onclick="document.querySelector('.nav-links').classList.toggle('open')">&#9776;</button>
  <div class="nav-links">
    <a href="/">Gallery</a>
    <a href="/docs/derivative-apis/">Derivative APIs</a>
    <a href="https://apidocs.marketcheck.com" target="_blank">API Docs &#8599;</a>
    <a href="https://developers.marketcheck.com" target="_blank">Get API Key &#8599;</a>
  </div>
</nav>

<div class="page-hero">
  <button class="btn-copy" id="copy-page-btn" title="Copy this guide to clipboard">&#128203; Copy Page</button>
  <div class="breadcrumb"><a href="/">Gallery</a> / <a href="/#${app.segment.toLowerCase().replace(/[^a-z0-9]+/g, "-")}">${app.segment}</a> / ${app.name}</div>
  <div class="subtitle">How to Build</div>
  <h1>${app.name}</h1>
  <p class="tagline">${app.tagline}</p>
  <span class="segment-badge" style="background:${segColor}22;color:${segColor};border:1px solid ${segColor}33;">
    ${app.segment}
  </span>
  <div class="ctas">
    <a href="/apps/${app.id}/dist/index.html" class="btn btn-primary">See Demo &#8594;</a>
    <a href="https://developers.marketcheck.com" target="_blank" class="btn btn-secondary">Get Free API Key</a>
    <a href="https://apidocs.marketcheck.com" target="_blank" class="btn btn-secondary">API Docs &#8599;</a>
  </div>
</div>

<div class="content" id="guide-content">
  ${usesEnterpriseApi(app) ? `<div class="enterprise-notice">
    <span>&#9888;</span>
    <div><strong>Enterprise API subscription required.</strong> This app uses the <a href="https://apidocs.marketcheck.com/#sold-summary">Sold Vehicle Summary API</a> which requires an Enterprise API subscription. <a href="https://developers.marketcheck.com" target="_blank">Contact us</a> for access.</div>
  </div>` : ""}

  <!-- What This App Does -->
  <div class="section">
    <h2>What This App Does</h2>
    <p>${app.description}</p>
  </div>

  ${app.useCases ? `<!-- Who Can Use This -->
  <div class="section">
    <h2>Who Can Use This</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">
      ${app.useCases.map(uc => `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;">
        <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:6px;">${uc.persona}</div>
        <div style="font-size:13px;color:#475569;line-height:1.5;">${uc.desc}</div>
      </div>`).join("")}
    </div>
  </div>` : ""}

  ${app.urlParams ? `<!-- URL Parameters -->
  <div class="section">
    <h2>URL Parameters</h2>
    <p>Pass parameters directly in the URL to pre-fill the form and auto-generate the report:</p>
    <table class="param-table">
      <thead><tr><th>Parameter</th><th>Description</th></tr></thead>
      <tbody>
        ${app.urlParams.map(p => `<tr><td><code>${p.name}</code></td><td>${p.desc}</td></tr>`).join("")}
      </tbody>
    </table>
    <h3>URL Examples</h3>
    <pre class="code-block"># Basic — auto-generate a report for a VIN
https://apps.marketcheck.com/apps/${app.id}/dist/index.html?api_key=YOUR_KEY&amp;vin=KNDCB3LC9L5359658

# Full — with asking price, mileage, and ZIP for deal scoring
https://apps.marketcheck.com/apps/${app.id}/dist/index.html?api_key=YOUR_KEY&amp;vin=KNDCB3LC9L5359658&amp;price=25000&amp;miles=35000&amp;zip=90044

# Compact widget — for iframe embeds (400px width)
https://apps.marketcheck.com/apps/${app.id}/dist/index.html?api_key=YOUR_KEY&amp;vin=KNDCB3LC9L5359658&amp;compact=true&amp;embed=true

# Using aliases
https://apps.marketcheck.com/apps/${app.id}/dist/index.html?api_key=YOUR_KEY&amp;vin=KNDCB3LC9L5359658&amp;askingPrice=25000&amp;mileage=35000&amp;zipcode=90044</pre>
  </div>` : ""}

  <!-- Screenshot -->
  <div class="section">
    <h2>Preview</h2>
    <div class="screenshots">
      <div class="screenshot"><img src="${screenshotUrl}" alt="${app.name} preview" loading="lazy" onerror="this.parentElement.style.display='none'" /></div>
    </div>
  </div>

  <!-- API Call Flow Diagram -->
  <div class="section">
    <h2>API Call Flow</h2>
    <p>Here's the exact sequence of MarketCheck API calls this app makes, and which ones run in parallel:</p>
    <div class="flow-diagram">
      ${generateFlowDiagram(app)}
    </div>
  </div>

  <!-- Input Parameters -->
  <div class="section">
    <h2>Input Parameters</h2>
    <p>${app.inputParams.length > 0 ? `Pass these parameters to build this app${app.toolName ? ` (or call the <code>${app.toolName}</code> composite endpoint)` : ""}:` : ""}</p>
    ${generateParamsTable(app)}
  </div>

  <!-- API Endpoints — Detailed -->
  <div class="section">
    <h2>API Endpoints Used — Full Details</h2>
    <p>Each API call explained with parameters, return values, and documentation links:</p>
    ${generateApiDetailCards(app)}
  </div>

  <!-- What the App Renders -->
  <div class="section">
    <h2>What to Render</h2>
    <p>Once you have the API responses, build these UI components:</p>
    <div class="renders-list">
      ${app.renders.split(", ").map(r => `<div class="render-item"><div class="render-dot"></div>${r}</div>`).join("")}
    </div>
  </div>

  ${app.toolName ? `
  <!-- Composite Endpoint -->
  <div class="section">
    <h2>Shortcut: Composite API Endpoint</h2>
    <p>Instead of calling each API individually, use our composite endpoint that orchestrates all the calls for you:</p>
    <div class="api-detail-card">
      <div class="api-detail-header">
        <span class="api-method-badge" style="background:#dbeafe;color:#1e40af;">POST</span>
        <code>https://apps.marketcheck.com/api/proxy/${app.toolName}</code>
      </div>
      <p>This single endpoint runs all ${app.apiFlow.reduce((sum, s) => sum + s.apis.filter(a => a).length, 0)} API calls in the optimal sequence and returns the combined result.</p>
      <p><a href="/docs/derivative-apis/#${app.toolName}">View full composite endpoint documentation &#8599;</a></p>
    </div>
    ${generateCurlExample(app)}
  </div>` : ""}

  <!-- How to Build -->
  <div class="section">
    <h2>Build It Yourself</h2>

    <h3>1. Get a Free API Key</h3>
    <p>Sign up at <a href="https://developers.marketcheck.com" target="_blank">developers.marketcheck.com</a> to get a free API key.</p>

    ${generateMcpConfig(app)}

    <h3>3. Embed as an iFrame</h3>
    <pre class="code-block">&lt;iframe
  src="https://apps.marketcheck.com/apps/${app.id}/dist/index.html?api_key=YOUR_KEY&amp;embed=true"
  width="100%" height="700"
  style="border:none;border-radius:8px;"
&gt;&lt;/iframe&gt;</pre>

    <h3>4. Build from Scratch</h3>
    <p>Use the API flow diagram above as your implementation blueprint. Call the APIs in the sequence shown, handle parallel calls with <code>Promise.all()</code>, and render the UI components listed in "What to Render".</p>
    <p>Tip: Copy this entire page (button at top) and paste it into your favorite coding agent (Claude, Cursor, Copilot) as a specification to generate the full app.</p>
  </div>

  <!-- Source Code -->
  <div class="section">
    <h2>Source Code</h2>
    <p>This app is open source:</p>
    <p><a href="https://github.com/MarketcheckHub/marketcheck-api-mcp-apps/tree/main/packages/apps/${app.id}" target="_blank">View source on GitHub &#8599;</a></p>
  </div>
</div>

<footer class="footer">
  <div class="footer-links">
    <a href="/">App Gallery</a>
    <a href="/docs/derivative-apis/">Derivative APIs</a>
    <a href="https://apidocs.marketcheck.com" target="_blank">API Documentation</a>
    <a href="https://developers.marketcheck.com" target="_blank">Get Free API Key</a>
    <a href="https://github.com/MarketcheckHub/marketcheck-api-mcp-apps" target="_blank">GitHub</a>
  </div>
  <p>&copy; 2026 MarketCheck. Powered by real-time automotive data covering 95%+ of US dealer inventory.</p>
</footer>

<div class="toast" id="toast"></div>

<script>
// Copy Page button
document.getElementById("copy-page-btn").addEventListener("click", function() {
  const content = document.getElementById("guide-content");
  // Build a clean text version
  const clone = content.cloneNode(true);
  // Remove images for text copy
  clone.querySelectorAll("img").forEach(i => i.remove());
  const text = "HOW TO BUILD: ${app.name.replace(/"/g, '\\"')}\\n${"=".repeat(50)}\\n\\n" + clone.innerText;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById("copy-page-btn");
    btn.innerHTML = "&#10003; Copied!";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.innerHTML = "&#128203; Copy Page";
      btn.classList.remove("copied");
    }, 2000);
  });
});
</script>
</body>
</html>`;
}

// ── Main ────────────────────────────────────────────────────────────────

let generated = 0;
for (const app of APPS) {
  const dir = path.join(PUBLIC_APP, app.id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const html = generatePage(app);
  fs.writeFileSync(path.join(dir, "index.html"), html);
  generated++;
  console.log(`  ${app.id}/index.html`);
}
console.log(`\nGenerated ${generated} "How to Build" guide pages.`);
