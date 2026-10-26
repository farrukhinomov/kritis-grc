import { defineConfig, devices } from "@playwright/test";

// Not vite's default preview port, so another preview is never mistaken for this build.
const PORT = 4317;
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
    // Faint borders differ from their background by little, so the per-pixel threshold is
    // strict enough to see one move; a box 8 px narrower then shows as ~240 pixels, while
    // anti-aliasing stays under the 100 pixels allowed.
    toHaveScreenshot: {
      maxDiffPixels: 100,
      threshold: 0.05,
      animations: "disabled",
      caret: "hide",
    },
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
    // Always this checkout's build: a server left running could serve an older one.
    reuseExistingServer: false,
    env: { VITE_API_MOCKING: "enabled" },
    timeout: 180_000,
  },
});
