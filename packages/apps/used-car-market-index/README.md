# Used Car Market Index ![Consumer](https://img.shields.io/badge/Consumer-10b981?style=flat-square) ![Enterprise API](https://img.shields.io/badge/Enterprise%20API-f59e0b?style=flat-square)

![Screenshot](../../../static/screenshots/used-car-market-index.png)

## Overview

Stock-ticker-style dashboard that tracks used car market trends. Shows top 25 brands by volume and average sale price, body type segment analysis, demand-to-supply ratios, and price trend indicators. Filterable by state for regional insights.

## Who Is This For

Car shoppers and buyers looking for market intelligence

## MarketCheck API Endpoints Used

| Endpoint | Name | Docs |
|----------|------|------|
| `GET /api/v1/sold-vehicles/summary` | Sold Vehicle Summary | [View docs](https://apidocs.marketcheck.com/#sold-summary) |

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `state` | string | No | US state abbreviation |

## Derivative API Endpoint

**`POST https://apps.marketcheck.com/api/proxy/get-market-index`**

> This is a composite endpoint that orchestrates multiple MarketCheck API calls into a single response. It is provided for reference and experimentation purposes only and is not under LTS (Long-Term Support).

## How to Run

### Browser (standalone)

Open the app directly in a browser with your MarketCheck API key:

```
https://apps.marketcheck.com/app/used-car-market-index/?api_key=YOUR_API_KEY
```

### MCP (Model Context Protocol)

Add to your MCP client configuration (e.g. Claude Desktop):

```json
{
  "mcpServers": {
    "marketcheck": {
      "command": "npx",
      "args": [
        "-y",
        "@anthropic/marketcheck-mcp"
      ],
      "env": {
        "MARKETCHECK_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

### Embed (iframe)

Embed in any webpage:

```html
<iframe src="https://apps.marketcheck.com/app/used-car-market-index/?api_key=YOUR_API_KEY" width="100%" height="800" frameborder="0"></iframe>
```

## API Subscription Requirement

> **This app requires a MarketCheck Enterprise API subscription.** The Sold Vehicle Summary endpoint (`/api/v1/sold-vehicles/summary`) used by this widget is only available on Enterprise plans. [Contact MarketCheck](https://www.marketcheck.com/contact) for Enterprise access.

## Limitations

- Demo mode shows mock data
- Requires MarketCheck **Enterprise** API key for live data
- Browser-based — no server required for standalone use
- Data covers US market only (95%+ of dealer inventory)

## Links

- [MarketCheck Developer Portal](https://developers.marketcheck.com)
- [API Documentation](https://apidocs.marketcheck.com)
- [Used Car Market Index App](https://apps.marketcheck.com/app/used-car-market-index/)
- [GitHub Repository](https://github.com/anthropics/marketcheck-mcp-apps)
