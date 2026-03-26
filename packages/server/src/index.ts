console.log("Starting MarketCheck MCP Apps server...");

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import express from "express";
import path from "node:path";
import { registerProxy } from "./proxy.js";

// Import all app registrations
import { registerUsedCarMarketIndex } from "./tools/used-car-market-index.js";
import { registerTradeInEstimator } from "./tools/trade-in-estimator.js";
import { registerDealEvaluator } from "./tools/deal-evaluator.js";
import { registerCarSearchCompare } from "./tools/car-search-compare.js";
import { registerLotPricingDashboard } from "./tools/lot-pricing-dashboard.js";
import { registerStockingIntelligence } from "./tools/stocking-intelligence.js";
import { registerOemIncentivesExplorer } from "./tools/oem-incentives-explorer.js";
import { registerAppraiserWorkbench } from "./tools/appraiser-workbench.js";
import { registerClaimsValuationWorkbench } from "./tools/claims-valuation-workbench.js";
import { registerGroupOperationsCenter } from "./tools/group-operations-center.js";
import { registerInventoryBalancer } from "./tools/inventory-balancer.js";
import { registerLocationBenchmarking } from "./tools/location-benchmarking.js";
import { registerWatchlistMonitor } from "./tools/watchlist-monitor.js";
import { registerEarningsSignalDashboard } from "./tools/earnings-signal-dashboard.js";
import { registerDealerGroupScorecard } from "./tools/dealer-group-scorecard.js";
import { registerPortfolioRiskMonitor } from "./tools/portfolio-risk-monitor.js";
import { registerEvCollateralRisk } from "./tools/ev-collateral-risk.js";
import { registerBrandCommandCenter } from "./tools/brand-command-center.js";
import { registerRegionalDemandAllocator } from "./tools/regional-demand-allocator.js";
import { registerEvMarketMonitor } from "./tools/ev-market-monitor.js";
import { registerAuctionLanePlanner } from "./tools/auction-lane-planner.js";
import { registerTerritoryPipeline } from "./tools/territory-pipeline.js";
import { registerComparablesExplorer } from "./tools/comparables-explorer.js";
import { registerDepreciationAnalyzer } from "./tools/depreciation-analyzer.js";
import { registerMarketTrendsDashboard } from "./tools/market-trends-dashboard.js";

const server = new McpServer({
  name: "MarketCheck MCP Apps",
  version: "1.0.0",
});

// Register all 25 apps
registerUsedCarMarketIndex(server);
registerTradeInEstimator(server);
registerDealEvaluator(server);
registerCarSearchCompare(server);
registerLotPricingDashboard(server);
registerStockingIntelligence(server);
registerOemIncentivesExplorer(server);
registerAppraiserWorkbench(server);
registerClaimsValuationWorkbench(server);
registerGroupOperationsCenter(server);
registerInventoryBalancer(server);
registerLocationBenchmarking(server);
registerWatchlistMonitor(server);
registerEarningsSignalDashboard(server);
registerDealerGroupScorecard(server);
registerPortfolioRiskMonitor(server);
registerEvCollateralRisk(server);
registerBrandCommandCenter(server);
registerRegionalDemandAllocator(server);
registerEvMarketMonitor(server);
registerAuctionLanePlanner(server);
registerTerritoryPipeline(server);
registerComparablesExplorer(server);
registerDepreciationAnalyzer(server);
registerMarketTrendsDashboard(server);

console.log("Registered 25 MCP App tools.");

// Expose over HTTP
const app = express();
app.use(cors());
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// CORS proxy for standalone/embed mode
registerProxy(app);

// Static file serving for gallery + apps
const rootDir = path.join(import.meta.dirname, "..", "..", "..");
app.use("/apps", express.static(path.join(rootDir, "packages", "apps")));
app.use("/", express.static(path.join(rootDir, "packages", "gallery", "dist")));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", apps: 25, modes: ["mcp", "gallery", "embed", "demo"] });
});

const PORT = parseInt(process.env.PORT ?? "3001", 10);
app.listen(PORT, () => {
  console.log(`MarketCheck MCP Apps server listening on http://localhost:${PORT}`);
  console.log(`  Gallery:      http://localhost:${PORT}/`);
  console.log(`  MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`  API proxy:    http://localhost:${PORT}/api/proxy/`);
  console.log(`  Health:       http://localhost:${PORT}/health`);
});
