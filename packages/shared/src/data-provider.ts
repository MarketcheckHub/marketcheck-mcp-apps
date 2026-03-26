/**
 * Dual-mode data provider for MCP Apps.
 * Detects environment (MCP host / standalone / embed / demo) and routes data accordingly.
 * This runs in the BROWSER (bundled into each app via Vite).
 */

// The MCP App instance (null if not in an MCP host)
let _safeApp: any = null;

export function setSafeApp(app: any) {
  _safeApp = app;
}

// ── Auth Detection ─────────────────────────────────────────────────────

export type AuthMode = "api_key" | "oauth_token" | null;

export interface AuthInfo {
  mode: AuthMode;
  value: string | null;
}

export function getAuth(): AuthInfo {
  const params = new URLSearchParams(location.search);
  // Priority: URL access_token > URL api_key > localStorage token > localStorage key
  const token = params.get("access_token") ?? localStorage.getItem("mc_access_token");
  if (token) return { mode: "oauth_token", value: token };
  const key = params.get("api_key") ?? localStorage.getItem("mc_api_key");
  if (key) return { mode: "api_key", value: key };
  return { mode: null, value: null };
}

export function saveApiKey(key: string) {
  localStorage.setItem("mc_api_key", key);
}

export function saveAccessToken(token: string) {
  localStorage.setItem("mc_access_token", token);
}

export function clearAuth() {
  localStorage.removeItem("mc_api_key");
  localStorage.removeItem("mc_access_token");
}

// ── Mode Detection ─────────────────────────────────────────────────────

export type AppMode = "mcp" | "live" | "demo";

export function detectMode(): AppMode {
  if (_safeApp) return "mcp";
  if (getAuth().value) return "live";
  return "demo";
}

export function isEmbedMode(): boolean {
  return new URLSearchParams(location.search).has("embed");
}

// ── URL Params ─────────────────────────────────────────────────────────

export function getUrlParams(): Record<string, string> {
  const params = new URLSearchParams(location.search);
  const result: Record<string, string> = {};
  for (const key of ["vin", "zip", "make", "model", "miles", "state", "dealer_id", "ticker"]) {
    const v = params.get(key);
    if (v) result[key] = v;
  }
  return result;
}

// ── Proxy Base URL ─────────────────────────────────────────────────────

function getProxyBase(): string {
  // If running from a served context (http://), use relative path
  if (location.protocol.startsWith("http")) {
    return "";
  }
  // If running from file://, try localhost
  return "http://localhost:3001";
}

// ── Data Fetching ──────────────────────────────────────────────────────

/**
 * Universal data fetcher. Call this instead of app.callServerTool().
 * Routes to: MCP host → CORS proxy → null (mock fallback).
 */
export async function callTool(toolName: string, args: Record<string, any>): Promise<any> {
  // Mode 1: MCP host — use MCP protocol
  if (_safeApp) {
    try {
      const r = await _safeApp.callServerTool({ name: toolName, arguments: args });
      const text = r?.content?.find((c: any) => c.type === "text")?.text;
      if (text) return JSON.parse(text);
    } catch {
      // Fall through to proxy or mock
    }
  }

  // Mode 2/3: Standalone with auth — use CORS proxy
  const auth = getAuth();
  if (auth.value) {
    try {
      const base = getProxyBase();
      const r = await fetch(`${base}/api/proxy/${toolName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...args,
          _auth_mode: auth.mode,
          _auth_value: auth.value,
        }),
      });
      if (r.ok) return r.json();
    } catch {
      // Fall through to mock
    }
  }

  // Mode 4: No auth — return null (app uses mock data in catch/fallback)
  return null;
}

// ── OAuth Token Generation ─────────────────────────────────────────────

export async function generateOAuthToken(
  clientId: string,
  clientSecret: string,
): Promise<{ access_token: string; expires_in: number } | { error: string }> {
  try {
    const base = getProxyBase();
    const r = await fetch(`${base}/api/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
    });
    return r.json();
  } catch (e: any) {
    return { error: e.message };
  }
}

// ── Settings Bar Component ─────────────────────────────────────────────

export function createSettingsBar(onAuthChange?: () => void): HTMLElement {
  if (isEmbedMode()) {
    // Return empty div in embed mode — no chrome
    return document.createElement("div");
  }

  const mode = detectMode();
  const auth = getAuth();

  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;align-items:center;gap:8px;margin-left:auto;";

  // Mode badge
  const badge = document.createElement("span");
  const badgeColors: Record<AppMode, { bg: string; text: string; label: string }> = {
    mcp: { bg: "#1e40af22", text: "#60a5fa", label: "MCP" },
    live: { bg: "#05966922", text: "#34d399", label: "LIVE" },
    demo: { bg: "#a16207aa", text: "#fbbf24", label: "DEMO" },
  };
  const bc = badgeColors[mode];
  badge.style.cssText = `padding:3px 10px;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:0.5px;background:${bc.bg};color:${bc.text};border:1px solid ${bc.text}33;`;
  badge.textContent = bc.label;
  bar.appendChild(badge);

  // Settings gear (only in demo/live mode)
  if (mode !== "mcp") {
    const gear = document.createElement("button");
    gear.innerHTML = "&#9881;";
    gear.title = "API Settings";
    gear.style.cssText = "background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;padding:4px;";
    gear.addEventListener("mouseenter", () => { gear.style.color = "#e2e8f0"; });
    gear.addEventListener("mouseleave", () => { gear.style.color = "#94a3b8"; });

    // Settings panel (hidden by default)
    const panel = document.createElement("div");
    panel.style.cssText = "display:none;position:fixed;top:50px;right:16px;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;z-index:1000;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.5);";
    panel.innerHTML = `
      <div style="font-size:13px;font-weight:600;color:#f8fafc;margin-bottom:12px;">API Configuration</div>
      <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px;">MarketCheck API Key</label>
      <input id="mc-settings-key" type="password" placeholder="Enter your API key" value="${auth.mode === "api_key" ? auth.value ?? "" : ""}"
        style="width:100%;padding:8px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;margin-bottom:8px;box-sizing:border-box;" />
      <div style="font-size:10px;color:#64748b;margin-bottom:12px;">
        Don't have one? Get a free key at <a href="https://developers.marketcheck.com" target="_blank" style="color:#60a5fa;">developers.marketcheck.com</a>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="mc-settings-save" style="flex:1;padding:8px;border-radius:6px;border:none;background:#3b82f6;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Save & Reload</button>
        <button id="mc-settings-clear" style="padding:8px 12px;border-radius:6px;border:1px solid #334155;background:transparent;color:#94a3b8;font-size:13px;cursor:pointer;">Clear</button>
      </div>
    `;

    gear.addEventListener("click", () => {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    });

    document.body.appendChild(panel);

    // Close panel on outside click
    document.addEventListener("click", (e) => {
      if (!panel.contains(e.target as Node) && e.target !== gear) {
        panel.style.display = "none";
      }
    });

    // Save handler
    setTimeout(() => {
      document.getElementById("mc-settings-save")?.addEventListener("click", () => {
        const key = (document.getElementById("mc-settings-key") as HTMLInputElement)?.value?.trim();
        if (key) {
          saveApiKey(key);
          panel.style.display = "none";
          onAuthChange?.();
          location.reload();
        }
      });
      document.getElementById("mc-settings-clear")?.addEventListener("click", () => {
        clearAuth();
        panel.style.display = "none";
        onAuthChange?.();
        location.reload();
      });
    }, 0);

    bar.appendChild(gear);
  }

  return bar;
}
