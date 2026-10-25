import { http, HttpResponse } from "msw";

import type { SystemStatus } from "@/features/status/api";

/**
 * Mock API used by the prototype and the tests. Responses follow the real API contract,
 * so screens can switch to the backend one endpoint at a time.
 */
export const handlers = [
  http.get("/api/v1/status", () =>
    HttpResponse.json<SystemStatus>({
      status: "ok",
      checks: { database: "ok", risk_engine: "ok", storage: "ok" },
    }),
  ),
];
