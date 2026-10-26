import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Demo fixtures shared with the backend's seed command; only the mock API reads them.
      "@seed": fileURLToPath(new URL("../seed", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Same single-origin setup as production: the browser only ever talks to the SPA's
    // origin, and /api is forwarded to Django (a different host inside docker compose).
    proxy: { "/api": process.env.API_PROXY_TARGET ?? "http://localhost:8000" },
    // The seed fixtures live next to the frontend, not inside it.
    fs: { allow: [".", "../seed"] },
    // File change events don't cross into containers from some hosts' bind mounts.
    watch: { usePolling: process.env.VITE_USE_POLLING === "true" },
  },
  build: {
    sourcemap: true,
    rolldownOptions: {
      output: {
        // React rarely changes, so it gets its own long-cached chunk instead of being
        // re-downloaded with every release. antd is deliberately not grouped: a fixed group
        // would pull every component any screen uses (tables, forms, date pickers) into the
        // first download, while split by usage each screen loads only what it renders.
        // Module IDs use forward slashes on every OS.
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules\/(react|react-dom|react-router|scheduler)\// },
          ],
        },
      },
    },
  },
  test: {
    // Tests run as the real product, whatever a developer's own .env.local says; a case
    // that needs the prototype switches the flag itself.
    env: { VITE_API_MOCKING: "disabled" },
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // The browser checks in e2e/ run with Playwright, against the built app.
    exclude: [...configDefaults.exclude, "e2e/**"],
    css: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/mocks/browser.ts", "src/**/*.test.{ts,tsx}", "src/test/**"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
