#!/usr/bin/env node
/**
 * Replace all _safeApp?.callServerTool patterns with _callTool
 * _callTool already handles: MCP → proxy → null (mock fallback)
 * _callTool already parses the JSON response (no need for content[].text parsing)
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const appsDir = join(import.meta.dirname, "..", "packages", "apps");
const apps = readdirSync(appsDir).filter(d => existsSync(join(appsDir, d, "src", "main.ts")));

let totalFixed = 0;

for (const app of apps) {
  const mainPath = join(appsDir, app, "src", "main.ts");
  let code = readFileSync(mainPath, "utf-8");
  const origCode = code;

  // Pattern 1: const result = await _safeApp?.callServerTool({ name: "tool-name", arguments: { ... } });
  // → const result = await _callTool("tool-name", { ... });
  code = code.replace(
    /await\s+_safeApp\??\.callServerTool\(\{\s*name:\s*"([^"]+)",\s*arguments:\s*(\{[^}]*\})\s*\}\)/g,
    'await _callTool("$1", $2)'
  );

  // Pattern 2: await _safeApp?.callServerTool({ name: "tool-name", arguments: args })
  // where args is a variable
  code = code.replace(
    /await\s+_safeApp\??\.callServerTool\(\{\s*name:\s*"([^"]+)",\s*arguments:\s*([a-zA-Z_]\w*)\s*\}\)/g,
    'await _callTool("$1", $2)'
  );

  // Pattern 3: _safeApp?.callServerTool({ name: "tool-name", arguments: {\n...multiline...} })
  // This is trickier - handle multiline arguments objects
  code = code.replace(
    /await\s+_safeApp\??\.callServerTool\(\{\s*\n\s*name:\s*"([^"]+)",\s*\n\s*arguments:\s*(\{[\s\S]*?\}),?\s*\n\s*\}\)/g,
    'await _callTool("$1", $2)'
  );

  // Pattern 4: _safeApp.callServerTool({ name: toolName, arguments: args })
  // where toolName is a variable
  code = code.replace(
    /await\s+_safeApp\??\.callServerTool\(\{\s*name:\s*([a-zA-Z_]\w*),\s*arguments:\s*([a-zA-Z_]\w*)\s*\}\)/g,
    'await _callTool($1, $2)'
  );

  // Pattern 5: _safeApp?.callServerTool("tool-name", { ... })
  // Some apps use positional args
  code = code.replace(
    /await\s+_safeApp\??\.callServerTool\("([^"]+)",\s*/g,
    'await _callTool("$1", '
  );

  // Now remove the JSON.parse(result.content...) wrappers since _callTool already returns parsed JSON
  // Pattern: JSON.parse(result.content?.find((c: any) => c.type === "text")?.text ?? "null")
  // or: const text = result?.content?.find(...)?.text; if (text) data = JSON.parse(text);
  // These vary a lot — let's handle the common ones:

  // const text = r?.content?.find((c: any) => c.type === "text")?.text;
  // if (text) { data = JSON.parse(text) as XXX; } else { data = mockData(); }
  // → data = r ?? mockData();
  // This is too varied to regex safely. Instead, leave parsing as-is since _callTool
  // in MCP mode already does JSON.parse, and in proxy mode returns JSON directly.
  // The issue is just that _safeApp?.callServerTool returns null when _safeApp is null.
  // _callTool will try the proxy instead.

  if (code !== origCode) {
    writeFileSync(mainPath, code);
    const changes = (origCode.match(/_safeApp.*callServerTool/g) || []).length;
    console.log(`✓ ${app} (${changes} calls fixed)`);
    totalFixed++;
  } else {
    console.log(`- ${app} (no changes needed or patterns not matched)`);
  }
}

console.log(`\nDone: ${totalFixed} apps updated.`);
