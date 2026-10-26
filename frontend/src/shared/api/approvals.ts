import { queryOptions } from "@tanstack/react-query";

import { apiGet, apiRequest, tenantPath } from "./client";
import { resourceKey } from "./keys";
import type { Approvals, Page, RiskAssessment, RiskAssessmentStatus } from "./types";

/**
 * What the current user may approve now. The shell's badge reads the same query, so it
 * is kept briefly fresh rather than refetched on every page.
 */
export const approvalsQuery = (tenant: string) =>
  queryOptions({
    queryKey: resourceKey(tenant, "approvals"),
    queryFn: ({ signal }) => apiGet<Approvals>(tenantPath(tenant, ["approvals"]), signal),
    staleTime: 30_000,
  });

export interface RiskAssessmentFilter {
  status?: RiskAssessmentStatus;
  scope?: string;
}

export const riskAssessmentsQuery = (tenant: string, filter: RiskAssessmentFilter = {}) =>
  queryOptions({
    queryKey: resourceKey(tenant, "risk-assessments", filter),
    queryFn: ({ signal }) =>
      apiGet<Page<RiskAssessment>>(tenantPath(tenant, ["risk-assessments"], { ...filter }), signal),
  });

export function approveRiskAssessment(tenant: string, id: string): Promise<RiskAssessment> {
  return apiRequest<RiskAssessment>(tenantPath(tenant, ["risk-assessments", id, "approve"]), {
    method: "POST",
  });
}

/** A rejection says why, so the author knows what to rework. */
export function rejectRiskAssessment(
  tenant: string,
  id: string,
  note: string,
): Promise<RiskAssessment> {
  return apiRequest<RiskAssessment>(tenantPath(tenant, ["risk-assessments", id, "reject"]), {
    method: "POST",
    body: { note_de: note },
  });
}
