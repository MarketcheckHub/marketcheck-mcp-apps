/**
 * Helper to register an MCP App tool + resource pair.
 * Each app is a tool that returns data + a ui:// resource that renders the HTML.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import fs from "node:fs/promises";
import path from "node:path";

interface AppRegistration {
  server: McpServer;
  toolName: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: any) => Promise<{ content: Array<{ type: string; text: string }> }>;
  htmlFileName: string; // e.g., "used-car-market-index"
}

export async function registerApp({
  server,
  toolName,
  title,
  description,
  inputSchema,
  handler,
  htmlFileName,
}: AppRegistration) {
  const resourceUri = `ui://marketcheck/${htmlFileName}`;

  registerAppTool(
    server,
    toolName,
    {
      title,
      description,
      inputSchema,
      _meta: { ui: { resourceUri } },
    },
    handler,
  );

  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => {
      const htmlPath = path.join(
        import.meta.dirname,
        "..",
        "..",
        "apps",
        htmlFileName,
        "dist",
        "index.html",
      );
      const html = await fs.readFile(htmlPath, "utf-8");
      return {
        contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }],
      };
    },
  );
}
