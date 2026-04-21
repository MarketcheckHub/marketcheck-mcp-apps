# Review & Build App

Review, test, fix, and polish a MarketCheck app assigned to a developer.

## Arguments
- $ARGUMENTS: The app ID(s) to review (e.g., "deal-evaluator" or "deal-evaluator incentive-adjusted-deal-eval")

## Instructions

You are bootstrapping a developer to review, test, fix, and polish their assigned MarketCheck app(s). Follow these steps exactly:

### Phase 1: Setup & Orientation

1. **Read the developer guide** at `docs/DEVELOPER-GUIDE.md` for full context on the architecture and patterns.

2. **Identify the app(s)** from `$ARGUMENTS`. For each app ID:
   - Check if the app directory exists: `packages/apps/{app-id}/src/main.ts`
   - If it exists → this is a **Fix & Polish** task
   - If it doesn't exist → this is a **Build New** task (Coming Soon app)
   - Read the "How to Build" guide: `public/app/{app-id}/index.html` for API flow, parameters, and rendering specs

3. **Create a branch:**
   ```
   git checkout -b fix/{first-app-id}
   ```

4. **Build everything and start the server:**
   ```
   npm run build
   PORT=4005 npm run serve
   ```
   Tell the developer to open their browser to: `http://localhost:4005/apps/{app-id}/dist/index.html`

5. **Show the developer their app's current state:**
   - Open the app URL in demo mode (no key) — verify the demo banner shows
   - Open with API key: `?api_key=THEIR_KEY` — verify live data works
   - List what the app should do (read from the APPS array in `scripts/generate-how-to-build.mjs`)

### Phase 2: Testing & Issue Discovery

For each assigned app, systematically test:

**A. Mode Detection**
- Open WITHOUT api_key → should show yellow "Demo Mode" banner with key input
- Open WITH api_key → should show "LIVE" badge, real data, no MCP errors in console
- Check `_detectAppMode()` in the app's main.ts — it MUST check auth BEFORE _safeApp:
  ```typescript
  function _detectAppMode(): "mcp" | "live" | "demo" {
    if (_getAuth().value) return "live";
    if (_safeApp && window.parent !== window) return "mcp";
    return "demo";
  }
  ```
  If this is wrong, fix it.

**B. Input Form**
- All fields render and accept input
- URL parameters pre-fill the form (e.g., `?vin=KNDCB3LC9L5359658&zip=90210`)
- Auto-submit when key params are provided via URL
- Test VINs: `KNDCB3LC9L5359658` (Kia Forte), `1HGCV1F34LA000001` (Honda)
- Test ZIPs: `90210`, `10001`, `60601`

**C. Live Data Output**
- All sections populate with real API data (not mock)
- Prices show as `$XX,XXX` (not 0, not NaN)
- Miles show actual values (not 0) — read both `l.dom ?? l.days_on_market`
- DOM shows actual values (not 0) — read both `stats.dom ?? stats.days_on_market`
- Charts/gauges/canvases render correctly
- Comparable vehicles list populated with real nearby cars
- No overlapping text, no clipped content

**D. Error Handling**
- Invalid VIN → user-friendly message, not crash
- Empty results → graceful empty state
- API error → doesn't break the UI
- No `McpError` or `TypeError` in browser console

**E. Responsive**
- Works at 375px mobile viewport
- No horizontal scrollbar on desktop

### Phase 3: Fixes

Make all fixes in `packages/apps/{app-id}/src/main.ts`. After each change:
```
cd packages/apps/{app-id} && npx vite build
```
Then refresh the browser to verify.

**Common fixes to apply:**
1. Fix `_detectAppMode()` if it checks `_safeApp` before `_getAuth()`
2. Add demo banner if missing (use the pattern from the developer guide)
3. Fix DOM reading: `l.dom ?? l.days_on_market ?? 0`
4. Fix stats reading: `stats.dom ?? stats.days_on_market ?? {}`; use `.avg ?? .mean`
5. Fix currency formatting with `Math.abs()` for negative values
6. Add URL parameter support for deep-linking (read from `_getUrlParams()`)

### Phase 4: Landing Page Update

1. Open `scripts/generate-how-to-build.mjs`
2. Find the app's entry in the `APPS` array (search for the app ID)
3. Enhance the `description` — make it detailed and specific about what the app shows
4. Add `useCases` array if missing:
   ```javascript
   useCases: [
     { persona: "Target User Type", desc: "What they do with this app and why it helps them." },
   ],
   ```
5. Add `urlParams` array if missing:
   ```javascript
   urlParams: [
     { name: "api_key", desc: "Your MarketCheck API key" },
     { name: "vin", desc: "17-character VIN — auto-fills form and triggers report" },
     // ... other params the app supports
   ],
   ```
6. Regenerate: `node scripts/generate-how-to-build.mjs`
7. Verify the landing page at `http://localhost:4005/app/{app-id}/`

### Phase 5: Build New App (for Coming Soon apps only)

If the app directory doesn't exist:

1. **Copy scaffold from an existing similar app:**
   ```
   cp -r packages/apps/deal-evaluator packages/apps/{app-id}
   ```
   Then update `package.json` name and `index.html` title.

2. **Read the How to Build guide** at `public/app/{app-id}/index.html` — it specifies:
   - Which API endpoints to call
   - The sequence (what's parallel vs sequential)
   - What parameters to pass
   - What UI components to render

3. **Implement `_fetchDirect()`** following the API flow from the guide

4. **Implement `getMockData()`** with realistic sample data matching the API response structure

5. **Build the render function** — create all the UI sections listed in the guide's "What to Render" section

6. **Follow the tech stack rules:**
   - Vanilla TypeScript only — no React, no frameworks
   - Inline styles via `style.cssText` — no CSS files
   - Canvas API for charts — no Chart.js, no D3
   - Native `fetch()` — no Axios
   - Single-file output via vite-plugin-singlefile

### Phase 6: PR

```
git add packages/apps/{app-id}/ public/app/{app-id}/ scripts/generate-how-to-build.mjs
git commit -m "Fix/Build: {App Name} — description of changes"
git push origin fix/{app-id}
```

Create a PR against `main` with:
- Title: `Fix: {App Name} — brief description`
- Body: What was tested, what was fixed/built, before/after screenshots

### Phase 7: Summary

After completing all work, provide the developer a summary of:
- What was tested
- What was fixed
- What was built (if Coming Soon)
- What the PR contains
- Any remaining issues or notes for the reviewer
