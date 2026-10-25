import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    // Same single-origin setup as production: the browser only ever talks to the SPA's
    // origin, and /api is forwarded to Django (a different host inside docker compose).
    proxy: { "/api": process.env.API_PROXY_TARGET ?? "http://localhost:8000" },
    // File change events don't cross into containers from some hosts' bind mounts.
    watch: { usePolling: process.env.VITE_USE_POLLING === "true" },
  },
  build: {
    sourcemap: true,
    rolldownOptions: {
      output: {
        // Module IDs use forward slashes on every OS. Framework and UI-library code changes rarely, so it gets its own long-cached
        // chunks instead of being re-downloaded with every app release.
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules\/(react|react-dom|react-router|scheduler)\// },
            {
              name: "antd",
              test: /node_modules\/(antd|@ant-design|@rc-component|rc-[^/]+)\//,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/mocks/browser.ts", "src/**/*.test.{ts,tsx}", "src/test/**"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
