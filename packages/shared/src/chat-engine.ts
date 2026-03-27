/**
 * Browser-side chat engine for MarketCheck Chat Demo apps.
 * Supports Anthropic Claude, OpenAI GPT, and Google Gemini as LLM providers.
 * Calls MarketCheck API directly for tool execution.
 *
 * Keys and provider are stored in localStorage.
 */

// ── Auth ─────────────────────────────────────────────────────────────────

export type LlmProvider = "anthropic" | "openai" | "gemini";

export function getLlmProvider(): LlmProvider {
  return (localStorage.getItem("mc_llm_provider") as LlmProvider) ?? "anthropic";
}
export function getLlmKey(): string | null {
  return localStorage.getItem("mc_llm_key");
}
export function saveLlmKey(key: string, provider: LlmProvider) {
  localStorage.setItem("mc_llm_key", key);
  localStorage.setItem("mc_llm_provider", provider);
}
/** @deprecated Use getLlmKey() instead */
export function getAnthropicKey(): string | null {
  return getLlmKey();
}
export function getMcApiKey(): string | null {
  return localStorage.getItem("mc_api_key");
}

// ── MarketCheck API ──────────────────────────────────────────────────────

const MC_API = "https://api.marketcheck.com";

async function mcFetch(path: string, apiKey: string, params: Record<string, any> = {}, opts?: { noV2Prefix?: boolean }): Promise<any> {
  const base = opts?.noV2Prefix ? "" : "/v2";
  const url = new URL(`${MC_API}${base}${path}`);
  url.searchParams.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`MarketCheck API ${res.status}`);
  return res.json();
}

// ── Tool Execution ───────────────────────────────────────────────────────

export async function executeTool(name: string, args: Record<string, any>, apiKey: string): Promise<any> {
  switch (name) {
    case "search_cars":
      return mcFetch("/search/car/active", apiKey, {
        make: args.makes, body_type: args.body_types, year: args.year_range,
        price_range: args.price_range, zip: args.zip, radius: args.radius,
        rows: args.rows ?? 10, car_type: "used", stats: "price,miles",
        facets: "make,model,body_type", include_dealer_object: "true",
      });
    case "decode_vin":
      return mcFetch(`/decode/car/neovin/${args.vin}/specs`, apiKey);
    case "predict_price":
      return mcFetch("/predict/car/us/marketcheck_price/comparables", apiKey, {
        vin: args.vin, miles: args.miles, zip: args.zip,
        dealer_type: args.dealer_type ?? "franchise",
      });
    case "get_car_history":
      return mcFetch(`/history/car/${args.vin}`, apiKey, { sort_order: "desc" });
    case "search_incentives":
      return mcFetch("/incentives/by-zip", apiKey, { oem: args.oem, zip: args.zip, model: args.model });
    case "get_sold_summary":
      return mcFetch("/api/v1/sold-vehicles/summary", apiKey, args, { noV2Prefix: true });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Tool Definitions (for Claude API) ────────────────────────────────────

export const CHAT_TOOLS = [
  {
    name: "search_cars",
    description: "Search active used car listings with filters for make, body type, price range, year, location.",
    input_schema: {
      type: "object" as const,
      properties: {
        makes: { type: "string", description: "Comma-separated makes, e.g. 'Toyota,Honda'" },
        body_types: { type: "string", description: "Body types, e.g. 'SUV,Sedan'" },
        year_range: { type: "string", description: "Year range, e.g. '2020-2024'" },
        price_range: { type: "string", description: "Price range, e.g. '15000-45000'" },
        zip: { type: "string", description: "ZIP code" },
        radius: { type: "number", description: "Radius in miles" },
        rows: { type: "number", description: "Results count (default 10)" },
      },
    },
  },
  {
    name: "decode_vin",
    description: "Decode a VIN to get full vehicle specs: year, make, model, trim, engine, transmission, fuel type, MPG, MSRP.",
    input_schema: {
      type: "object" as const,
      properties: { vin: { type: "string", description: "17-character VIN" } },
      required: ["vin"],
    },
  },
  {
    name: "predict_price",
    description: "Predict fair market price for a vehicle using comparable sales data.",
    input_schema: {
      type: "object" as const,
      properties: {
        vin: { type: "string", description: "17-character VIN" },
        miles: { type: "number", description: "Mileage" },
        zip: { type: "string", description: "ZIP for regional pricing" },
        dealer_type: { type: "string", description: "'franchise' for retail, 'independent' for wholesale" },
      },
      required: ["vin"],
    },
  },
  {
    name: "get_car_history",
    description: "Get listing history for a vehicle by VIN \u2014 price changes and dealer transfers over time.",
    input_schema: {
      type: "object" as const,
      properties: { vin: { type: "string", description: "17-character VIN" } },
      required: ["vin"],
    },
  },
  {
    name: "search_incentives",
    description: "Search current OEM incentives/rebates by ZIP \u2014 cash back, APR deals, lease specials.",
    input_schema: {
      type: "object" as const,
      properties: {
        oem: { type: "string", description: "Manufacturer, e.g. 'Toyota'" },
        zip: { type: "string", description: "ZIP code" },
        model: { type: "string", description: "Specific model" },
      },
      required: ["oem", "zip"],
    },
  },
  {
    name: "get_sold_summary",
    description: "Aggregated sold vehicle market data \u2014 rankings by make, body_type, state for market share and demand analysis.",
    input_schema: {
      type: "object" as const,
      properties: {
        ranking_dimensions: { type: "string", description: "Grouping: make, model, body_type, state" },
        ranking_measure: { type: "string", description: "Measures: sold_count, average_sale_price" },
        ranking_order: { type: "string", description: "asc or desc" },
        top_n: { type: "number", description: "Number of top results" },
        state: { type: "string", description: "State abbreviation" },
        inventory_type: { type: "string", description: "'Used' or 'New'" },
      },
    },
  },
];

const SYSTEM_PROMPT = `You are MarketCheck AI, an expert automotive market assistant powered by real-time data from the MarketCheck API covering 95%+ of US dealer inventory.

You have tools to search car listings, decode VINs, predict prices, check incentives, and analyze market data. Always use tools to back claims with real data. Format prices as $XX,XXX and mileage with commas. Be concise but thorough \u2014 lead with key findings, then supporting data. Proactively suggest follow-up analyses.`;

// ── Message Types ────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { name: string; args: any; result?: any; error?: string }[];
}

// ── Streaming Chat ───────────────────────────────────────────────────────

export interface ChatCallbacks {
  onToken: (text: string) => void;
  onToolStart: (name: string, args: any) => void;
  onToolEnd: (name: string, result: any) => void;
  onDone: (fullText: string, toolCalls: ChatMessage["toolCalls"]) => void;
  onError: (error: string) => void;
}

export async function sendMessage(
  messages: ChatMessage[],
  callbacks: ChatCallbacks,
): Promise<void> {
  const llmKey = getLlmKey();
  const mcKey = getMcApiKey();
  const provider = getLlmProvider();

  if (!llmKey) { callbacks.onError("Please set your LLM API key in settings (gear icon)."); return; }
  if (!mcKey) { callbacks.onError("Please set your MarketCheck API key in settings (gear icon)."); return; }

  const allToolCalls: ChatMessage["toolCalls"] = [];
  let fullText = "";

  if (provider === "anthropic") {
    await sendWithAnthropic(messages, llmKey, mcKey, allToolCalls, callbacks, (t) => { fullText += t; });
  } else if (provider === "openai") {
    await sendWithOpenAI(messages, llmKey, mcKey, allToolCalls, callbacks, (t) => { fullText += t; });
  } else if (provider === "gemini") {
    await sendWithGemini(messages, llmKey, mcKey, allToolCalls, callbacks, (t) => { fullText += t; });
  }
}

// ── Anthropic Claude ─────────────────────────────────────────────────────

async function sendWithAnthropic(
  messages: ChatMessage[], llmKey: string, mcKey: string,
  allToolCalls: NonNullable<ChatMessage["toolCalls"]>,
  callbacks: ChatCallbacks, addText: (t: string) => void,
) {
  const apiMessages: any[] = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      apiMessages.push({ role: "user", content: msg.content });
    } else {
      // Assistant message — reconstruct tool_use blocks + text
      if (msg.toolCalls?.length) {
        // First: assistant message with tool_use blocks
        const assistantContent: any[] = [];
        const toolIds: string[] = [];
        for (const tc of msg.toolCalls) {
          const id = `tool_${Math.random().toString(36).slice(2, 10)}`;
          toolIds.push(id);
          assistantContent.push({ type: "tool_use", id, name: tc.name, input: tc.args });
        }
        apiMessages.push({ role: "assistant", content: assistantContent });

        // Second: user message with tool_result blocks (required by Anthropic)
        const toolResults: any[] = [];
        for (let i = 0; i < msg.toolCalls.length; i++) {
          const tc = msg.toolCalls[i];
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolIds[i],
            content: JSON.stringify(tc.result ?? tc.error ?? "ok"),
          });
        }
        apiMessages.push({ role: "user", content: toolResults });

        // Third: if there was also text, add it as a separate assistant message
        if (msg.content) {
          apiMessages.push({ role: "assistant", content: msg.content });
        }
      } else {
        apiMessages.push({ role: "assistant", content: msg.content });
      }
    }
  }

  for (let iter = 0; iter < 5; iter++) {
    let response: any;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": llmKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096, system: SYSTEM_PROMPT, tools: CHAT_TOOLS, messages: apiMessages,
        }),
      });
      if (!res.ok) { callbacks.onError(`Claude API ${res.status}: ${await res.text()}`); return; }
      response = await res.json();
    } catch (e: any) { callbacks.onError(`Network error: ${e.message}`); return; }

    const toolUses = response.content?.filter((b: any) => b.type === "tool_use") ?? [];
    for (const b of response.content?.filter((b: any) => b.type === "text") ?? []) {
      addText(b.text); callbacks.onToken(b.text);
    }
    if (toolUses.length === 0) { callbacks.onDone(allToolCalls.length ? "" : response.content?.map((b: any) => b.text ?? "").join(""), allToolCalls); return; }

    apiMessages.push({ role: "assistant", content: response.content });
    const toolResults: any[] = [];
    for (const tu of toolUses) {
      callbacks.onToolStart(tu.name, tu.input);
      const tc = { name: tu.name, args: tu.input } as any;
      try {
        const result = await executeTool(tu.name, tu.input, mcKey);
        tc.result = result; callbacks.onToolEnd(tu.name, result);
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(result) });
      } catch (e: any) {
        tc.error = e.message; callbacks.onToolEnd(tu.name, { error: e.message });
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify({ error: e.message }), is_error: true });
      }
      allToolCalls.push(tc);
    }
    apiMessages.push({ role: "user", content: toolResults });
  }
  callbacks.onDone("", allToolCalls);
}

// ── OpenAI GPT ───────────────────────────────────────────────────────────

function chatToolsToOpenAI(): any[] {
  return CHAT_TOOLS.map(t => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

async function sendWithOpenAI(
  messages: ChatMessage[], llmKey: string, mcKey: string,
  allToolCalls: NonNullable<ChatMessage["toolCalls"]>,
  callbacks: ChatCallbacks, addText: (t: string) => void,
) {
  const apiMessages: any[] = [{ role: "system", content: SYSTEM_PROMPT }];
  for (const msg of messages) {
    apiMessages.push({ role: msg.role, content: msg.content });
  }

  for (let iter = 0; iter < 5; iter++) {
    let response: any;
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${llmKey}` },
        body: JSON.stringify({
          model: "gpt-4o", max_tokens: 4096,
          messages: apiMessages, tools: chatToolsToOpenAI(),
        }),
      });
      if (!res.ok) { callbacks.onError(`OpenAI API ${res.status}: ${await res.text()}`); return; }
      response = await res.json();
    } catch (e: any) { callbacks.onError(`Network error: ${e.message}`); return; }

    const choice = response.choices?.[0];
    if (!choice) { callbacks.onError("No response from OpenAI"); return; }

    const msg = choice.message;
    if (msg.content) { addText(msg.content); callbacks.onToken(msg.content); }
    if (!msg.tool_calls?.length) { callbacks.onDone(msg.content ?? "", allToolCalls); return; }

    apiMessages.push(msg);
    for (const tc of msg.tool_calls) {
      const args = JSON.parse(tc.function.arguments);
      callbacks.onToolStart(tc.function.name, args);
      const entry = { name: tc.function.name, args } as any;
      try {
        const result = await executeTool(tc.function.name, args, mcKey);
        entry.result = result; callbacks.onToolEnd(tc.function.name, result);
        apiMessages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
      } catch (e: any) {
        entry.error = e.message; callbacks.onToolEnd(tc.function.name, { error: e.message });
        apiMessages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ error: e.message }) });
      }
      allToolCalls.push(entry);
    }
  }
  callbacks.onDone("", allToolCalls);
}

// ── Google Gemini ─────────────────────────────────────────────────────────

function chatToolsToGemini(): any[] {
  return [{
    functionDeclarations: CHAT_TOOLS.map(t => ({
      name: t.name, description: t.description,
      parameters: { type: "OBJECT", properties: t.input_schema.properties, required: t.input_schema.required ?? [] },
    })),
  }];
}

async function sendWithGemini(
  messages: ChatMessage[], llmKey: string, mcKey: string,
  allToolCalls: NonNullable<ChatMessage["toolCalls"]>,
  callbacks: ChatCallbacks, addText: (t: string) => void,
) {
  const contents: any[] = [];
  for (const msg of messages) {
    contents.push({ role: msg.role === "user" ? "user" : "model", parts: [{ text: msg.content }] });
  }

  for (let iter = 0; iter < 5; iter++) {
    let response: any;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${llmKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents, tools: chatToolsToGemini(),
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        }),
      });
      if (!res.ok) { callbacks.onError(`Gemini API ${res.status}: ${await res.text()}`); return; }
      response = await res.json();
    } catch (e: any) { callbacks.onError(`Network error: ${e.message}`); return; }

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const textParts = parts.filter((p: any) => p.text);
    const fnCalls = parts.filter((p: any) => p.functionCall);

    for (const p of textParts) { addText(p.text); callbacks.onToken(p.text); }
    if (fnCalls.length === 0) { callbacks.onDone(textParts.map((p: any) => p.text).join(""), allToolCalls); return; }

    contents.push({ role: "model", parts });
    const fnResponses: any[] = [];
    for (const fc of fnCalls) {
      const { name, args } = fc.functionCall;
      callbacks.onToolStart(name, args);
      const entry = { name, args } as any;
      try {
        const result = await executeTool(name, args, mcKey);
        entry.result = result; callbacks.onToolEnd(name, result);
        fnResponses.push({ functionResponse: { name, response: result } });
      } catch (e: any) {
        entry.error = e.message; callbacks.onToolEnd(name, { error: e.message });
        fnResponses.push({ functionResponse: { name, response: { error: e.message } } });
      }
      allToolCalls.push(entry);
    }
    contents.push({ role: "user", parts: fnResponses });
  }
  callbacks.onDone("", allToolCalls);
}

// ── Settings Panel (dual-key) ────────────────────────────────────────────

export function createChatSettingsBar(onAuthChange?: () => void): HTMLElement {
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;align-items:center;gap:8px;margin-left:auto;";

  const llmKey = getLlmKey();
  const mcKey = getMcApiKey();
  const provider = getLlmProvider();
  const isReady = !!(llmKey && mcKey);

  // Status badge
  const badge = document.createElement("span");
  badge.style.cssText = `padding:3px 10px;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:0.5px;background:${isReady ? "#05966922" : "#a16207aa"};color:${isReady ? "#34d399" : "#fbbf24"};border:1px solid ${isReady ? "#34d39933" : "#fbbf2433"};`;
  badge.textContent = isReady ? "LIVE" : "SETUP";
  bar.appendChild(badge);

  // Gear button
  const gear = document.createElement("button");
  gear.innerHTML = "&#9881;";
  gear.title = "API Settings";
  gear.style.cssText = "background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;padding:4px;";
  gear.addEventListener("mouseenter", () => { gear.style.color = "#e2e8f0"; });
  gear.addEventListener("mouseleave", () => { gear.style.color = "#94a3b8"; });

  const panel = document.createElement("div");
  panel.style.cssText = "display:none;position:fixed;top:50px;right:16px;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;z-index:1000;min-width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.5);";
  const providerLabels: Record<string, { label: string; placeholder: string; hint: string }> = {
    anthropic: { label: "Anthropic API Key", placeholder: "sk-ant-...", hint: '<a href="https://console.anthropic.com/" target="_blank" style="color:#60a5fa;">console.anthropic.com</a>' },
    openai: { label: "OpenAI API Key", placeholder: "sk-...", hint: '<a href="https://platform.openai.com/api-keys" target="_blank" style="color:#60a5fa;">platform.openai.com</a>' },
    gemini: { label: "Google AI API Key", placeholder: "AIza...", hint: '<a href="https://aistudio.google.com/apikey" target="_blank" style="color:#60a5fa;">aistudio.google.com</a>' },
  };
  const pl = providerLabels[provider];
  panel.innerHTML = `
    <div style="font-size:13px;font-weight:600;color:#f8fafc;margin-bottom:12px;">Chat API Configuration</div>
    <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px;">LLM Provider</label>
    <select id="mc-chat-provider" style="width:100%;padding:8px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;margin-bottom:12px;box-sizing:border-box;cursor:pointer;">
      <option value="anthropic"${provider === "anthropic" ? " selected" : ""}>Anthropic (Claude)</option>
      <option value="openai"${provider === "openai" ? " selected" : ""}>OpenAI (GPT-4o)</option>
      <option value="gemini"${provider === "gemini" ? " selected" : ""}>Google (Gemini)</option>
    </select>
    <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px;" id="mc-chat-llm-label">${pl.label} <span style="color:#ef4444;">*</span></label>
    <input id="mc-chat-llm-key" type="password" placeholder="${pl.placeholder}" value="${llmKey ?? ""}"
      style="width:100%;padding:8px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;margin-bottom:4px;box-sizing:border-box;" />
    <div style="font-size:10px;color:#64748b;margin-bottom:12px;" id="mc-chat-llm-hint">
      Get one at ${pl.hint}
    </div>
    <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px;">MarketCheck API Key <span style="color:#ef4444;">*</span></label>
    <input id="mc-chat-mc-key" type="password" placeholder="Enter your MarketCheck API key" value="${mcKey ?? ""}"
      style="width:100%;padding:8px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;margin-bottom:4px;box-sizing:border-box;" />
    <div style="font-size:10px;color:#64748b;margin-bottom:12px;">
      Get one at <a href="https://developers.marketcheck.com" target="_blank" style="color:#60a5fa;">developers.marketcheck.com</a>
    </div>
    <div style="display:flex;gap:8px;">
      <button id="mc-chat-save" style="flex:1;padding:8px;border-radius:6px;border:none;background:#3b82f6;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Save & Reload</button>
      <button id="mc-chat-clear" style="padding:8px 12px;border-radius:6px;border:1px solid #334155;background:transparent;color:#94a3b8;font-size:13px;cursor:pointer;">Clear</button>
    </div>
  `;

  gear.addEventListener("click", () => { panel.style.display = panel.style.display === "none" ? "block" : "none"; });
  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target as Node) && e.target !== gear) panel.style.display = "none";
  });

  setTimeout(() => {
    // Provider switching
    document.getElementById("mc-chat-provider")?.addEventListener("change", (e) => {
      const p = (e.target as HTMLSelectElement).value;
      const cfg = providerLabels[p];
      document.getElementById("mc-chat-llm-label")!.innerHTML = `${cfg.label} <span style="color:#ef4444;">*</span>`;
      (document.getElementById("mc-chat-llm-key") as HTMLInputElement).placeholder = cfg.placeholder;
      document.getElementById("mc-chat-llm-hint")!.innerHTML = `Get one at ${cfg.hint}`;
    });
    document.getElementById("mc-chat-save")?.addEventListener("click", () => {
      const selectedProvider = (document.getElementById("mc-chat-provider") as HTMLSelectElement)?.value as LlmProvider;
      const lKey = (document.getElementById("mc-chat-llm-key") as HTMLInputElement)?.value?.trim();
      const mKey = (document.getElementById("mc-chat-mc-key") as HTMLInputElement)?.value?.trim();
      if (lKey) saveLlmKey(lKey, selectedProvider);
      if (mKey) localStorage.setItem("mc_api_key", mKey);
      panel.style.display = "none";
      onAuthChange?.();
      location.reload();
    });
    document.getElementById("mc-chat-clear")?.addEventListener("click", () => {
      localStorage.removeItem("mc_llm_key");
      localStorage.removeItem("mc_llm_provider");
      localStorage.removeItem("mc_api_key");
      panel.style.display = "none";
      onAuthChange?.();
      location.reload();
    });
  }, 0);

  bar.appendChild(gear);
  document.body.appendChild(panel);
  return bar;
}
