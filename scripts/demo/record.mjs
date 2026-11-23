// Records the screen part of the demo video against a running stack, reproducibly.
//
//   node scripts/demo/record.mjs http://localhost:5173
//
// Playwright comes with the frontend's dev dependencies. The steps follow the v1 flow in
// docs/demo/script.md; pauses leave time for the narration.
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../../frontend/package.json"));
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:5173";
const out = join(here, "out");
mkdirSync(out, { recursive: true });

const pause = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: out, size: { width: 1440, height: 900 } },
  locale: "de-DE",
});
const page = await context.newPage();
const tenant = () => page.url().replace(/\/t\/([^/]+).*/, "/t/$1");

await page.goto(`${base}/login`);
await pause(8);
await page.getByRole("button", { name: "Als GRC-Manager ansehen" }).click();
await page.waitForURL(/dashboard/);
await pause(25);

await page.goto(`${tenant()}/compliance`);
await pause(30);

await page.goto(`${tenant()}/risks`);
await pause(30);

await page.goto(`${tenant()}/approvals`);
await pause(30);

await page.getByRole("button", { name: /Alex Kramer/ }).click();
await page.getByRole("menuitem", { name: "Abmelden" }).click();
await page.getByRole("button", { name: "Als Auditor ansehen" }).click();
await page.waitForURL(/dashboard/);
await page.goto(`${tenant()}/activity`);
await pause(30);

await page.goto(`${tenant()}/dashboard`);
await pause(15);

const video = page.video();
await context.close();
await browser.close();
console.log(`Recorded ${await video.path()}`);
