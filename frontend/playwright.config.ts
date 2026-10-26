import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const ci = Boolean(process.env.CI);

/**
 * End-to-end checks of the prototype as it is deployed: the production build with the mock
 * API in the browser. One desktop and one phone viewport, both in Chromium, in German and
 * on Berlin time.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: ci,
  // A failure is looked into, not retried away.
  retries: 0,
  reporter: ci ? [["github"], ["html", { open: "never" }]] : "list",
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  expect: {
    // Anti-aliasing differs by a few pixels between machines; a changed layout differs by far more.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide" },
  },
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "phone",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm preview --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: !ci,
    env: { VITE_API_MOCKING: "enabled" },
    timeout: 180_000,
  },
});
