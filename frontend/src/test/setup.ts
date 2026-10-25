import "@testing-library/jest-dom/vitest";
import "@/shared/i18n";

import { cleanup, configure } from "@testing-library/react";
import i18n from "i18next";

import { setMockSession } from "@/mocks/accounts";
import { resetDb } from "@/mocks/db";
import { server } from "@/mocks/server";
import { resetSimulation } from "@/mocks/simulation";

import { installMatchMedia, installResizeObserver, resetMediaQueries } from "./media";

installMatchMedia();
installResizeObserver();
// jsdom lays nothing out, so it has no scrolling; components may still ask for it.
Element.prototype.scrollIntoView = () => undefined;

// Routes load their code lazily; the first test to reach a chunk waits for it to be
// transformed, which under coverage instrumentation can take longer than the 1 s default.
configure({ asyncUtilTimeout: 3000 });

// Any request without a mock fails the test instead of silently hitting the network.
beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});
// Most tests look at the signed-in app; the ones about signing in start signed out.
beforeEach(() => {
  setMockSession("grc_manager");
});
afterEach(async () => {
  cleanup();
  // Spies must not outlive their test: a stubbed API call would leak into the next one.
  vi.restoreAllMocks();
  resetMediaQueries();
  resetSimulation();
  resetDb();
  localStorage.clear();
  sessionStorage.clear();
  server.resetHandlers();
  await i18n.changeLanguage("de");
});
afterAll(() => {
  server.close();
});
