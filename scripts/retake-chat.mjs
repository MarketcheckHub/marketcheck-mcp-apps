import puppeteer from "puppeteer";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] || "/Users/anandmahajan/projects/claude/marketcheck-mcp-apps";
const outDir = join(root, "static", "screenshots");
const PORT = process.argv[3] || "3005";
const BASE = `http://localhost:${PORT}`;

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MC_KEY = process.env.MARKETCHECK_API_KEY;

const APPS = [
  { id: "chat-vercel-ai", queries: [
    "Search for used Honda Accord under $28,000 near ZIP 90210",
    "Decode VIN 5YJSA1DG9DFP14705",
    "What are the top 5 selling used car brands in California?",
  ]},
  { id: "chat-chainlit", queries: [
    "Search for used Toyota Camry under $25,000 near ZIP 60601",
    "What are the best-selling body types nationwide?",
    "Find Honda incentives near ZIP 75201",
  ]},
];

async function waitForResponse(page) {
  await new Promise(r => setTimeout(r, 6000));
  for (let i = 0; i < 30; i++) {
    const btnText = await page.evaluate(() => {
      const btns = document.querySelectorAll("button");
      for (const b of btns) {
        if (b.textContent?.trim() === "Send") return "Send";
        if (b.textContent?.trim() === "...") return "...";
      }
      return "unknown";
    });
    if (btnText === "Send") break;
    await new Promise(r => setTimeout(r, 5000));
  }
  await new Promise(r => setTimeout(r, 3000));
}

async function run() {
  const browser = await puppeteer.launch({
    headless: "shell",
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    protocolTimeout: 300000,
  });

  for (const app of APPS) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

    console.log(`\n━━━ ${app.id} ━━━`);
    await page.goto(`${BASE}/apps/${app.id}/dist/index.html`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.evaluate((aKey, mKey) => {
      localStorage.setItem("mc_llm_key", aKey);
      localStorage.setItem("mc_llm_provider", "anthropic");
      localStorage.setItem("mc_api_key", mKey);
    }, ANTHROPIC_KEY, MC_KEY);
    await page.goto(`${BASE}/apps/${app.id}/dist/index.html`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));

    for (let qi = 0; qi < app.queries.length; qi++) {
      const query = app.queries[qi];
      console.log(`  [${qi+1}] "${query.slice(0,55)}..."`);

      const textarea = await page.waitForSelector("textarea", { timeout: 5000 });
      await textarea.click({ clickCount: 3 });
      await textarea.type(query, { delay: 8 });
      const buttons = await page.$$("button");
      for (const btn of buttons) {
        const text = await btn.evaluate(el => el.textContent);
        if (text?.trim() === "Send") { await btn.click(); break; }
      }
      console.log(`      waiting...`);
      await waitForResponse(page);
      await page.evaluate(() => {
        const el = document.querySelector("[style*='overflow-y:auto']") || document.querySelector("[style*='overflow-y: auto']");
        if (el) el.scrollTop = el.scrollHeight;
      });
      await new Promise(r => setTimeout(r, 1000));

      const suffix = qi === 0 ? "" : `-${qi + 1}`;
      const filename = `${app.id}${suffix}.png`;
      await page.screenshot({ path: join(outDir, filename), clip: { x: 0, y: 0, width: 1280, height: 900 } });
      const size = statSync(join(outDir, filename)).size;
      console.log(`      ✓ ${filename} (${Math.round(size / 1024)}KB)`);
    }
    await page.close();
  }
  await browser.close();
  console.log("\nDone.");
}

run();
