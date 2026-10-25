import { http, HttpResponse } from "msw";

import type { SystemStatus } from "@/features/status/api";

export const statusHandlers = [
  http.get("/api/v1/status", () =>
    HttpResponse.json<SystemStatus>({
      status: "ok",
      checks: { database: "ok", risk_engine: "ok", storage: "ok" },
    }),
  ),
];
