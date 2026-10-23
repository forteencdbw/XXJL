---
name: run-app
description: Launch the Phaser xianxia-tavern game's Vite dev server and drive it with a headless browser to verify a change actually works (not just builds). Use when asked to run, verify, or screenshot this game, or before reporting a gameplay/UI change as done for anything beyond a trivial text/style tweak.
---

# Running & verifying this game

This is a Phaser 3 + Vite + TypeScript game (see `GLOSSARY.md`, `docs/adr/`). Verification
means actually driving the running game in a browser, not just `npm run build` passing.

## Dev server

```bash
npm run dev &                      # Vite picks a free port starting at 5173, prints it
timeout 15 bash -c 'until curl -sf http://localhost:5173 >/dev/null || curl -sf http://localhost:5174 >/dev/null; do sleep 1; done'
```

Stop by port: `netstat -ano | grep ":<port>" | grep LISTENING` then `taskkill //F //PID <pid>`
(Windows; `lsof`/`kill` don't exist in this git-bash environment). Always stop the old
server before `npm install` — Vite holds native binaries (esbuild/rollup) open and a
running install will emit (harmless but noisy) `EPERM` cleanup warnings otherwise.

## Driving it: no `chromium-cli`, no `playwright` — use `puppeteer-core`

This machine has neither `chromium-cli` nor `playwright` installed, and `npx playwright
--version` hangs indefinitely rather than failing fast. `puppeteer-core` is a committed
devDependency instead (no bundled Chromium download, works offline once installed) — it
drives whatever browser `scripts/find-browser.mjs` finds on the current machine (Chrome
first, Edge fallback; Windows-only paths for now, see the file's `shortcut:` comment if a
Mac/Linux dev machine ever joins).

Write a throwaway script (don't commit it — it's task-specific) in the repo root or `/tmp`:

```js
import puppeteer from "puppeteer-core";
import { findBrowserPath } from "./scripts/find-browser.mjs";

const browser = await puppeteer.launch({
  executablePath: findBrowserPath(),
  headless: "new",
  args: ["--no-sandbox", "--window-size=780,1360"],
  defaultViewport: { width: 760, height: 1320 },
});
const page = await browser.newPage();
page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));

await page.goto("http://localhost:5174/", { waitUntil: "networkidle0" });
await page.screenshot({ path: "C:/Users/boendeng/shot.png" });
await browser.close();
```

Run with `node scripts/verify-tmp.mjs` (`.mjs` because `package.json` has `"type":
"module"`). Screenshots must go to an absolute Windows path outside the repo (e.g.
`C:/Users/<user>/...`) — writing to a freshly-created `/tmp/<newdir>/...` has failed here
before ("parent-directory symlink resolution changed").

## Gotchas specific to this game

- **`document.body.innerText` is always empty.** Phaser renders everything to a `<canvas>`;
  there is no DOM text to read. Verify state by screenshot, not by querying the DOM.
- **Don't use `--virtual-time-budget` for single-shot `chrome --headless --screenshot`
  calls.** Phaser's `scene.time` runs off real `performance.now()`, which virtual time
  does not advance — you'll get a screenshot of the initial state no matter how large the
  budget is. Launch a persistent session (as above) and use real `await new
  Promise(r => setTimeout(r, ms))` waits instead.
- **Derive click coordinates from the live canvas rect, never by hand.** Print the canvas
  offset once at the start and click through a helper, so the margin can't drift:

  ```js
  const rect = await page.evaluate(() => {
    const c = document.querySelector("canvas").getBoundingClientRect();
    return { x: c.x, y: c.y };
  });
  console.log("CANVAS_ORIGIN", rect);
  const clickCanvas = (x, y) => page.mouse.click(rect.x + x, rect.y + y);
  ```

  A Phaser object at canvas-local `(x, y)` is clicked at screen `(rect.x + x, rect.y + y)`.
  Hand-computing the centering margin has silently produced "clicks that do nothing"
  more than once. Text objects also only accept clicks inside their text bounds — a
  button's colored background is wider than its hit area.

- **A click with no observable change is not evidence.** After each click, screenshot or
  re-read a HUD value. If nothing changed, the click missed — do not conclude the feature
  is broken. Before changing any implementation, add a temporary `console.log` inside the
  handler and confirm whether the event arrives at all. Chasing a "broken button" that
  was never clicked is the most expensive failure mode in this repo.

- **Poll for state instead of sleeping through randomness.** Customers arrive on a random
  4–7s timer and seats fill/free unpredictably, so a fixed `wait()` lands before or after
  the window about half the time. Add a temporary log (or screenshot-check a visible
  condition) and poll until the state you need is true, then click. For money/branching
  changes, also verify the HUD numbers add up, not just that text appeared.
