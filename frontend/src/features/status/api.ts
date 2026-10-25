import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/shared/api/client";

export const CHECK_NAMES = ["database", "risk_engine", "storage"] as const;
export type CheckName = (typeof CHECK_NAMES)[number];
export type CheckState = "ok" | "unavailable";
/** A check the server didn't report is shown as such, never silently left out. */
export type DisplayedCheckState = CheckState | "unknown";

export interface SystemStatus {
  status: "ok" | "degraded";
  checks: Partial<Record<CheckName, CheckState>>;
}

export const STATUS_PATH = "/api/v1/status";

export function useSystemStatus() {
  return useQuery({
    queryKey: ["system-status"],
    queryFn: ({ signal }) => apiGet<SystemStatus>(STATUS_PATH, signal),
  });
}
