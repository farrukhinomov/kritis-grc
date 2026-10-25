import "@testing-library/jest-dom/vitest";
import "@/shared/i18n";

import { cleanup } from "@testing-library/react";
import i18n from "i18next";

import { server } from "@/mocks/server";

import { installMatchMedia, installResizeObserver, resetMediaQueries } from "./media";

installMatchMedia();
installResizeObserver();

// Any request without a mock fails the test instead of silently hitting the network.
beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});
afterEach(async () => {
  cleanup();
  resetMediaQueries();
  localStorage.clear();
  server.resetHandlers();
  await i18n.changeLanguage("de");
});
afterAll(() => {
  server.close();
});
