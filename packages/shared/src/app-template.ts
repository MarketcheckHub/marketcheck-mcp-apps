/**
 * Shared UI utilities for MCP App frontends.
 * These run in the browser iframe, not on the server.
 */

/** Create a standard app shell with header and content area */
export function createAppShell(title: string): { header: HTMLElement; content: HTMLElement } {
  document.body.innerHTML = "";
  document.body.style.cssText = "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;overflow-x:hidden;";

  const header = document.createElement("div");
  header.style.cssText = "background:#1e293b;padding:12px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:12px;flex-wrap:wrap;";
  header.innerHTML = `<h1 style="margin:0;font-size:16px;font-weight:600;color:#f8fafc;white-space:nowrap;">${title}</h1>`;

  const content = document.createElement("div");
  content.style.cssText = "padding:16px 20px;";

  document.body.appendChild(header);
  document.body.appendChild(content);
  return { header, content };
}

/** Create a KPI card */
export function createKpiCard(label: string, value: string, change?: string, changeColor?: string): HTMLElement {
  const card = document.createElement("div");
  card.style.cssText = "background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px 16px;min-width:140px;";
  card.innerHTML = `
    <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">${label}</div>
    <div style="font-size:22px;font-weight:700;color:#f8fafc;margin-top:4px;">${value}</div>
    ${change ? `<div style="font-size:12px;color:${changeColor ?? '#94a3b8'};margin-top:2px;">${change}</div>` : ""}
  `;
  return card;
}

/** Create a ribbon of KPI cards */
export function createKpiRibbon(cards: Array<{ label: string; value: string; change?: string; changeColor?: string }>): HTMLElement {
  const ribbon = document.createElement("div");
  ribbon.style.cssText = "display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;margin-bottom:16px;";
  for (const c of cards) {
    ribbon.appendChild(createKpiCard(c.label, c.value, c.change, c.changeColor));
  }
  return ribbon;
}

/** Create a sortable data table */
export function createDataTable(
  headers: string[],
  rows: string[][],
  options?: { rowColors?: string[]; onRowClick?: (idx: number) => void }
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "overflow-x:auto;border:1px solid #334155;border-radius:8px;";
  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;font-size:13px;";

  const thead = document.createElement("thead");
  thead.innerHTML = `<tr>${headers.map(h => `<th style="padding:8px 12px;text-align:left;background:#1e293b;color:#94a3b8;font-weight:600;border-bottom:1px solid #334155;position:sticky;top:0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">${h}</th>`).join("")}</tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((row, idx) => {
    const tr = document.createElement("tr");
    tr.style.cssText = `border-bottom:1px solid #1e293b;cursor:${options?.onRowClick ? "pointer" : "default"};${options?.rowColors?.[idx] ? `background:${options.rowColors[idx]}` : ""}`;
    tr.addEventListener("mouseenter", () => { tr.style.background = "#1e293b"; });
    tr.addEventListener("mouseleave", () => { tr.style.background = options?.rowColors?.[idx] ?? ""; });
    if (options?.onRowClick) tr.addEventListener("click", () => options.onRowClick!(idx));
    tr.innerHTML = row.map(cell => `<td style="padding:8px 12px;color:#e2e8f0;">${cell}</td>`).join("");
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

/** Create a colored badge */
export function createBadge(text: string, color: string): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${color}22;color:${color};border:1px solid ${color}44;">${text}</span>`;
}

/** Create a horizontal range bar visualization */
export function createRangeBar(low: number, mid: number, high: number, marker?: number, label?: string): HTMLElement {
  const bar = document.createElement("div");
  bar.style.cssText = "position:relative;height:28px;background:#1e293b;border-radius:6px;overflow:hidden;border:1px solid #334155;";

  const range = high - low || 1;
  const midPct = ((mid - low) / range) * 100;
  const markerPct = marker != null ? ((marker - low) / range) * 100 : null;

  bar.innerHTML = `
    <div style="position:absolute;left:0;top:0;height:100%;width:${midPct}%;background:linear-gradient(90deg,#10b98133,#10b98166);"></div>
    <div style="position:absolute;left:${midPct}%;top:0;height:100%;width:2px;background:#10b981;"></div>
    ${markerPct != null ? `<div style="position:absolute;left:${Math.min(Math.max(markerPct, 2), 98)}%;top:0;height:100%;width:3px;background:#f59e0b;border-radius:2px;"></div>` : ""}
    <div style="position:absolute;left:4px;top:50%;transform:translateY(-50%);font-size:10px;color:#94a3b8;">$${Math.round(low / 1000)}K</div>
    <div style="position:absolute;right:4px;top:50%;transform:translateY(-50%);font-size:10px;color:#94a3b8;">$${Math.round(high / 1000)}K</div>
    ${label ? `<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:11px;font-weight:600;color:#f8fafc;">${label}</div>` : ""}
  `;
  return bar;
}

/** Create a section with title */
export function createSection(title: string): { container: HTMLElement; body: HTMLElement } {
  const container = document.createElement("div");
  container.style.cssText = "margin-bottom:20px;";
  container.innerHTML = `<h2 style="font-size:14px;font-weight:600;color:#f8fafc;margin:0 0 10px 0;">${title}</h2>`;
  const body = document.createElement("div");
  container.appendChild(body);
  return { container, body };
}

/** Create a panel grid layout */
export function createPanelGrid(columns: number): HTMLElement {
  const grid = document.createElement("div");
  grid.style.cssText = `display:grid;grid-template-columns:repeat(${columns},1fr);gap:16px;margin-bottom:16px;`;
  return grid;
}

/** Create a loading spinner */
export function showLoading(container: HTMLElement, message = "Loading...") {
  container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:40px;color:#94a3b8;">
    <div style="width:20px;height:20px;border:2px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:12px;"></div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    ${message}
  </div>`;
}

/** Create a button */
export function createButton(text: string, onClick: () => void, variant: "primary" | "secondary" = "primary"): HTMLElement {
  const btn = document.createElement("button");
  btn.textContent = text;
  const isPrimary = variant === "primary";
  btn.style.cssText = `padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid ${isPrimary ? "#3b82f6" : "#334155"};background:${isPrimary ? "#3b82f6" : "transparent"};color:${isPrimary ? "#fff" : "#e2e8f0"};`;
  btn.addEventListener("click", onClick);
  btn.addEventListener("mouseenter", () => { btn.style.opacity = "0.85"; });
  btn.addEventListener("mouseleave", () => { btn.style.opacity = "1"; });
  return btn;
}

/** Create an input field */
export function createInput(placeholder: string, opts?: { type?: string; value?: string; width?: string }): HTMLInputElement {
  const input = document.createElement("input");
  input.type = opts?.type ?? "text";
  input.placeholder = placeholder;
  if (opts?.value) input.value = opts.value;
  input.style.cssText = `padding:8px 12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;outline:none;width:${opts?.width ?? "160px"};`;
  input.addEventListener("focus", () => { input.style.borderColor = "#3b82f6"; });
  input.addEventListener("blur", () => { input.style.borderColor = "#334155"; });
  return input;
}

/** Create a select dropdown */
export function createSelect(options: Array<{ value: string; label: string }>, selected?: string): HTMLSelectElement {
  const sel = document.createElement("select");
  sel.style.cssText = "padding:8px 12px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:13px;outline:none;";
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === selected) o.selected = true;
    sel.appendChild(o);
  }
  return sel;
}

/** Create a chip toggle group */
export function createChipGroup(chips: string[], selected?: string[], onToggle?: (active: string[]) => void): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;";
  const activeSet = new Set(selected ?? []);

  for (const chip of chips) {
    const el = document.createElement("button");
    el.textContent = chip;
    const setStyle = () => {
      const active = activeSet.has(chip);
      el.style.cssText = `padding:4px 12px;border-radius:14px;font-size:12px;cursor:pointer;border:1px solid ${active ? "#3b82f6" : "#334155"};background:${active ? "#3b82f622" : "transparent"};color:${active ? "#60a5fa" : "#94a3b8"};font-weight:${active ? "600" : "400"};`;
    };
    setStyle();
    el.addEventListener("click", () => {
      if (activeSet.has(chip)) activeSet.delete(chip); else activeSet.add(chip);
      setStyle();
      onToggle?.([...activeSet]);
    });
    container.appendChild(el);
  }
  return container;
}

/** Format currency for display (browser-side) */
export function fmtCurrency(v: number | undefined): string {
  if (v == null) return "N/A";
  return "$" + Math.round(v).toLocaleString();
}

/** Format percent for display */
export function fmtPct(v: number | undefined, decimals = 1): string {
  if (v == null) return "N/A";
  return (v >= 0 ? "+" : "") + v.toFixed(decimals) + "%";
}

/** Format number with commas */
export function fmtNum(v: number | undefined): string {
  if (v == null) return "N/A";
  return Math.round(v).toLocaleString();
}
