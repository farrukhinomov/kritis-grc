import "@fontsource-variable/inter";
import "@/shared/theme/global.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/app/App";
import { i18nReady } from "@/shared/i18n";

// Decided at build time: the prototype is deliberately deployed with mock data, while a
// build without the flag drops the mock code from the bundle entirely.
async function enableMocking() {
  if (import.meta.env.VITE_API_MOCKING !== "enabled") {
    return;
  }
  const { worker } = await import("@/mocks/browser");
  // Requests without a mock (fonts, assets) go to the network unchanged.
  await worker.start({ onUnhandledFrame: "bypass" });
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element in index.html");
}

function render(container: HTMLElement) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// Rendering must never depend on the mock worker starting: a failure there shows up as
// failed requests in the app, not as a blank page.
// The remembered language loads in parallel. Rendering waits for it at most a few
// seconds: a stalled request must never leave a blank page, and if English arrives
// later the app switches by itself.
const LANGUAGE_WAIT_MS = 3000;

void Promise.all([
  enableMocking().catch((error: unknown) => {
    // eslint-disable-next-line no-console -- the only signal a developer gets in the browser
    console.error("Mock API could not be started", error);
  }),
  Promise.race([
    i18nReady.catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, LANGUAGE_WAIT_MS)),
  ]),
]).finally(() => {
  render(root);
});
