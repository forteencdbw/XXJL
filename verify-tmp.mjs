import puppeteer from "puppeteer-core";
import { findBrowserPath } from "./scripts/find-browser.mjs";
const OUT = "C:/Users/DBW";
const browser = await puppeteer.launch({ executablePath: findBrowserPath(), headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2 } });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
const wait = (ms) => new Promise(r => setTimeout(r, ms));
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await wait(900);
const rect = await page.evaluate(() => { const c = document.querySelector("canvas").getBoundingClientRect(); return { x:c.x, y:c.y, w:c.width, h:c.height }; });
const click = async (gx, gy) => { await page.mouse.click(rect.x + gx*rect.w/720, rect.y + gy*rect.h/1280); await wait(300); };
const state = () => page.evaluate(() => { const s = window.__tavern; return { game: s.gameState, settling: s.settling, q: s.queue.length, booths: s.booths.map(b=>b.state), busy: s.playerSeat!==null || s.playerCookingBooth!==null, served: s.sessionServed }; });
const poll = async (fn, timeout=20000) => { const t=Date.now(); while(Date.now()-t<timeout){ const s=await state(); if(fn(s)) return s; await wait(200);} throw new Error("timeout"); };
await click(150, 380); await click(150, 615);
await click(270, 1210); await wait(500); await click(140, 1152);
await poll((s) => s.q > 0);
await click(355, 1210);
await poll((s) => s.booths.includes("awaitingCook"));
await click(86, 1115);
await poll((s) => s.served >= 1, 20000);
console.log("SERVED", JSON.stringify(await state()));
await click(250, 1210); await wait(1200);
await page.screenshot({ path: `${OUT}/P0-settlement.png` });
// 结算卡片「打烊」
await click(145, 548); await wait(1200);
console.log("CLOSED", await page.evaluate(() => window.__tavern.gameState));
// 营造 → 关闭
await click(60, 775); await wait(400);
await page.screenshot({ path: `${OUT}/P1-build.png` });
await click(75, 675); await wait(300);
// 修行 → 关闭
await click(60, 955); await wait(400);
await click(75, 795); await wait(300);
// 玩法 → 关闭
await click(50, 1015); await wait(400);
await click(150, 615); await wait(300);
await page.screenshot({ path: `${OUT}/P2-closed-final.png` });
console.log("FINAL", JSON.stringify({ game: await page.evaluate(() => window.__tavern.gameState), save: await page.evaluate(() => JSON.parse(localStorage.getItem("tavern_save_v1"))) }));
await browser.close();
