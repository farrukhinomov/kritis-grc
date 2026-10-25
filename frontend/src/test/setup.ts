import "@testing-library/jest-dom/vitest";
import "@/shared/i18n";

import { cleanup } from "@testing-library/react";
import i18n from "i18next";

import { server } from "@/mocks/server";

// Ant Design reads media queries for responsive behavior; jsdom doesn't provide them.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

// Any request without a mock fails the test instead of silently hitting the network.
beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});
afterEach(async () => {
  cleanup();
  server.resetHandlers();
  await i18n.changeLanguage("de");
});
afterAll(() => {
  server.close();
});
