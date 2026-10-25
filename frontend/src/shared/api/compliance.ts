import { queryOptions } from "@tanstack/react-query";

import { apiGet, apiRequest, tenantPath } from "./client";
import { resourceKey } from "./keys";
import type {
  ComplianceSummary,
  Evidence,
  Framework,
  Implementation,
  ImplementationChange,
  ImplementationStatus,
  Mapping,
  MappingSuggestion,
  NewEvidence,
  Page,
  PageParams,
  Requirement,
  SuggestionStatus,
} from "./types";

export const frameworksQuery = (tenant: string) =>
  queryOptions({
    queryKey: resourceKey(tenant, "frameworks"),
    queryFn: ({ signal }) => apiGet<Page<Framework>>(tenantPath(tenant, ["frameworks"]), signal),
  });

export interface RequirementFilter extends PageParams {
  framework_version?: string;
  paragraph?: string;
  search?: string;
}

export const requirementsQuery = (tenant: string, filter: RequirementFilter = {}) =>
  queryOptions({
    queryKey: resourceKey(tenant, "requirements", filter),
    queryFn: ({ signal }) =>
      apiGet<Page<Requirement>>(tenantPath(tenant, ["requirements"], { ...filter }), signal),
  });

export const requirementQuery = (tenant: string, id: string) =>
  queryOptions({
    queryKey: resourceKey(tenant, "requirements", id),
    queryFn: ({ signal }) => apiGet<Requirement>(tenantPath(tenant, ["requirements", id]), signal),
  });

export interface ImplementationFilter extends PageParams {
  scope?: string;
  framework_version?: string;
  requirement?: string;
  owner?: string;
  /** Several statuses match any of them. */
  status?: ImplementationStatus | readonly ImplementationStatus[];
  ordering?: "due_date" | "-due_date" | "updated_at" | "-updated_at";
}

export const implementationsQuery = (tenant: string, filter: ImplementationFilter = {}) =>
  queryOptions({
    queryKey: resourceKey(tenant, "implementations", filter),
    queryFn: ({ signal }) => {
      const { status, ...rest } = filter;
      // A comma-separated list, the form Django filters accept for "any of".
      // An empty list means no status filter, as for Django; "status=" would match nothing.
      const statuses = typeof status === "string" ? status : status?.join(",");
      const query = { ...rest, status: statuses === "" ? undefined : statuses };
      return apiGet<Page<Implementation>>(tenantPath(tenant, ["implementations"], query), signal);
    },
  });

/** Counted by the server, so the dashboard never pages through every Implementation. */
export const complianceSummaryQuery = (tenant: string) =>
  queryOptions({
    queryKey: resourceKey(tenant, "implementations", "summary"),
    queryFn: ({ signal }) =>
      apiGet<ComplianceSummary>(tenantPath(tenant, ["compliance-summary"]), signal),
  });

export const implementationQuery = (tenant: string, id: string) =>
  queryOptions({
    queryKey: resourceKey(tenant, "implementations", id),
    queryFn: ({ signal }) =>
      apiGet<Implementation>(tenantPath(tenant, ["implementations", id]), signal),
  });

/**
 * `version` is the one the user saw. If someone else saved in between, the server
 * answers 412 `version_conflict` instead of silently overwriting their change.
 */
export function updateImplementation(
  tenant: string,
  id: string,
  version: number,
  change: ImplementationChange,
): Promise<Implementation> {
  return apiRequest<Implementation>(tenantPath(tenant, ["implementations", id]), {
    method: "PATCH",
    body: change,
    ifMatch: version,
  });
}

export const evidenceQuery = (tenant: string, implementationId: string) =>
  queryOptions({
    queryKey: resourceKey(tenant, "implementations", implementationId, "evidence"),
    queryFn: ({ signal }) =>
      apiGet<Page<Evidence>>(
        tenantPath(tenant, ["implementations", implementationId, "evidence"]),
        signal,
      ),
  });

/**
 * Create the key once per user action, outside any retry loop: a retry with the same key
 * returns the first result instead of adding the Evidence twice.
 */
export function addEvidence(
  tenant: string,
  implementationId: string,
  evidence: NewEvidence,
  idempotencyKey: string,
): Promise<Evidence> {
  return apiRequest<Evidence>(
    tenantPath(tenant, ["implementations", implementationId, "evidence"]),
    { method: "POST", body: evidence, idempotencyKey },
  );
}

export function removeEvidence(
  tenant: string,
  implementationId: string,
  evidenceId: string,
): Promise<undefined> {
  return apiRequest<undefined>(
    tenantPath(tenant, ["implementations", implementationId, "evidence", evidenceId]),
    { method: "DELETE" },
  );
}

export interface MappingFilter extends PageParams {
  target_requirement?: string;
  source_requirement?: string;
}

export const mappingsQuery = (tenant: string, filter: MappingFilter = {}) =>
  queryOptions({
    queryKey: resourceKey(tenant, "mappings", filter),
    queryFn: ({ signal }) =>
      apiGet<Page<Mapping>>(tenantPath(tenant, ["mappings"], { ...filter }), signal),
  });

export interface SuggestionFilter extends PageParams {
  status?: SuggestionStatus;
}

export const mappingSuggestionsQuery = (tenant: string, filter: SuggestionFilter = {}) =>
  queryOptions({
    queryKey: resourceKey(tenant, "mapping-suggestions", filter),
    queryFn: ({ signal }) =>
      apiGet<Page<MappingSuggestion>>(
        tenantPath(tenant, ["mapping-suggestions"], { ...filter }),
        signal,
      ),
  });

/** Approving turns the Suggestion into a Tenant Mapping, which the response returns. */
export function approveSuggestion(tenant: string, id: string): Promise<Mapping> {
  return apiRequest<Mapping>(tenantPath(tenant, ["mapping-suggestions", id, "approve"]), {
    method: "POST",
  });
}

export function rejectSuggestion(tenant: string, id: string): Promise<MappingSuggestion> {
  return apiRequest<MappingSuggestion>(tenantPath(tenant, ["mapping-suggestions", id, "reject"]), {
    method: "POST",
  });
}
