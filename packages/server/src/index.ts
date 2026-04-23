console.log("Starting MarketCheck MCP Apps server...");

import cors from "cors";
import express from "express";
import path from "node:path";
import { registerProxy } from "./proxy.js";
import { setMcApiKeyOverride } from "@mcp-apps/shared";

const app = express();
app.use(cors());
app.use(express.json());

// ── CORS Proxy for standalone/embed mode ────────────────────────────────
registerProxy(app);

// ── MCP endpoint (graceful — if SDK schema issues, skip MCP but keep serving) ──
let mcpReady = false;
try {
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");

  const server = new McpServer({ name: "MarketCheck MCP Apps", version: "1.0.0" });

  // Try registering all tools — if inputSchema format is wrong, catch per-tool
  const toolModules = [
    "./tools/used-car-market-index.js", "./tools/trade-in-estimator.js",
    "./tools/deal-evaluator.js", "./tools/car-search-compare.js",
    "./tools/lot-pricing-dashboard.js", "./tools/stocking-intelligence.js",
    "./tools/oem-incentives-explorer.js", "./tools/appraiser-workbench.js",
    "./tools/claims-valuation-workbench.js", "./tools/group-operations-center.js",
    "./tools/inventory-balancer.js", "./tools/location-benchmarking.js",
    "./tools/watchlist-monitor.js", "./tools/earnings-signal-dashboard.js",
    "./tools/dealer-group-scorecard.js", "./tools/portfolio-risk-monitor.js",
    "./tools/ev-collateral-risk.js", "./tools/brand-command-center.js",
    "./tools/regional-demand-allocator.js", "./tools/ev-market-monitor.js",
    "./tools/auction-lane-planner.js", "./tools/territory-pipeline.js",
    "./tools/comparables-explorer.js", "./tools/depreciation-analyzer.js",
    "./tools/market-trends-dashboard.js",
    // ── New Apps ──
    "./tools/vin-market-report.js", "./tools/vin-history-detective.js",
    "./tools/pricing-transparency-report.js", "./tools/incentive-deal-finder.js",
    "./tools/wholesale-vehicle-router.js", "./tools/dealer-inventory-fit-scorer.js",
    "./tools/uk-market-explorer.js", "./tools/uk-market-trends.js",
    "./tools/underwriting-decision-support.js", "./tools/insurance-premium-benchmarker.js",
    "./tools/incentive-adjusted-deal-eval.js", "./tools/auto-journalist-briefing.js",
    "./tools/auction-arbitrage-finder.js", "./tools/uk-dealer-pricing.js",
    "./tools/dealer-conquest-analyzer.js", "./tools/market-anomaly-detector.js",
    "./tools/lender-portfolio-stress-test.js", "./tools/rental-fleet-valuator.js",
    "./tools/fleet-lifecycle-manager.js",
    "./tools/floor-plan-opportunity-scanner.js",
  ];

  let registered = 0;
  for (const mod of toolModules) {
    try {
      const m = await import(mod);
      const fn = Object.values(m)[0] as (s: any) => void;
      fn(server);
      registered++;
    } catch (e: any) {
      console.warn(`  ⚠ Skipped ${mod}: ${e.message?.slice(0, 80)}`);
    }
  }

  if (registered > 0) {
    // GET /mcp — required by MCP clients for endpoint discovery / SSE session init
    app.get("/mcp", (_req, res) => {
      res.writeHead(405, { Allow: "POST" }).end(JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Use POST for MCP requests" },
        id: null,
      }));
    });

    // DELETE /mcp — session cleanup (no-op for stateless mode)
    app.delete("/mcp", (_req, res) => {
      res.status(200).json({ ok: true });
    });

    app.post("/mcp", async (req, res) => {
      // Support API key via query param: /mcp?api_key=YOUR_KEY
      const qKey = req.query.api_key as string | undefined;
      if (qKey) setMcApiKeyOverride(qKey);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => {
        transport.close();
        // Reset override after request so env var is used for next client
        if (qKey) setMcApiKeyOverride(null);
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });
    mcpReady = true;
    console.log(`  MCP: ${registered}/44 tools registered.`);
  }
} catch (e: any) {
  console.warn(`  MCP disabled: ${e.message?.slice(0, 100)}`);
}

// ── Static file serving for gallery + apps + assets ─────────────────────
const rootDir = path.join(import.meta.dirname, "..", "..", "..");
app.use("/assets", express.static(path.join(rootDir, "static")));
app.use("/apps", express.static(path.join(rootDir, "packages", "apps")));
app.use("/app", express.static(path.join(rootDir, "public", "app")));
app.use("/docs", express.static(path.join(rootDir, "public", "docs")));
app.use("/", express.static(path.join(rootDir, "packages", "gallery", "dist")));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", apps: 44, mcp: mcpReady });
});

const PORT = parseInt(process.env.PORT ?? "3001", 10);
app.listen(PORT, () => {
  console.log(`\nMarketCheck MCP Apps server on http://localhost:${PORT}`);
  console.log(`  Gallery:    http://localhost:${PORT}/`);
  console.log(`  Apps:       http://localhost:${PORT}/apps/{app-name}/dist/index.html`);
  console.log(`  Proxy:      http://localhost:${PORT}/api/proxy/`);
  if (mcpReady) console.log(`  MCP:        http://localhost:${PORT}/mcp`);
  console.log(`  Health:     http://localhost:${PORT}/health`);
});
