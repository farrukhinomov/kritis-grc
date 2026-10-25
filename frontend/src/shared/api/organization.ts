import { queryOptions } from "@tanstack/react-query";

import { apiGet, apiRequest, tenantPath } from "./client";
import { resourceKey } from "./keys";
import type {
  ApplicabilityQuestion,
  ApplicabilityResult,
  Asset,
  CriticalFacilityDetails,
  CriticalServiceDefinition,
  Member,
  Page,
  PageParams,
  Scope,
  Tenant,
} from "./types";

export const tenantQuery = (tenant: string) =>
  queryOptions({
    queryKey: resourceKey(tenant, "tenant"),
    queryFn: ({ signal }) => apiGet<Tenant>(tenantPath(tenant, []), signal),
  });

export const membersQuery = (tenant: string) =>
  queryOptions({
    queryKey: resourceKey(tenant, "members"),
    queryFn: ({ signal }) => apiGet<Page<Member>>(tenantPath(tenant, ["members"]), signal),
  });

export interface ScopeFilter extends PageParams {
  kind?: Scope["kind"];
}

export const scopesQuery = (tenant: string, filter: ScopeFilter = {}) =>
  queryOptions({
    queryKey: resourceKey(tenant, "scopes", filter),
    queryFn: ({ signal }) =>
      apiGet<Page<Scope>>(tenantPath(tenant, ["scopes"], { ...filter }), signal),
  });

export const scopeQuery = (tenant: string, id: string) =>
  queryOptions({
    queryKey: resourceKey(tenant, "scopes", id),
    queryFn: ({ signal }) => apiGet<Scope>(tenantPath(tenant, ["scopes", id]), signal),
  });

export interface AssetFilter extends PageParams {
  scope?: string;
}

export const assetsQuery = (tenant: string, filter: AssetFilter = {}) =>
  queryOptions({
    queryKey: resourceKey(tenant, "assets", filter),
    queryFn: ({ signal }) =>
      apiGet<Page<Asset>>(tenantPath(tenant, ["assets"], { ...filter }), signal),
  });

export const criticalServicesQuery = (tenant: string) =>
  queryOptions({
    queryKey: resourceKey(tenant, "critical-services"),
    queryFn: ({ signal }) =>
      apiGet<Page<CriticalServiceDefinition>>(tenantPath(tenant, ["critical-services"]), signal),
    // Legal catalogue data, which changes with the law, not during a session.
    staleTime: Infinity,
  });

/** The rule is the server's; the answer is a read, so it is cached per question. */
export const applicabilityCheckQuery = (tenant: string, question: ApplicabilityQuestion) =>
  queryOptions({
    queryKey: resourceKey(tenant, "applicability-check", question),
    queryFn: ({ signal }) =>
      apiGet<ApplicabilityResult>(
        tenantPath(tenant, ["applicability-check"], { ...question }),
        signal,
      ),
  });

export interface NewCriticalFacility {
  name: string;
  location: string;
  critical_facility: Pick<
    CriticalFacilityDetails,
    "sector" | "critical_service" | "people_supplied" | "registration"
  >;
}

/** Creates a Scope of kind Critical Facility; the server adds threshold and deadlines. */
export function createCriticalFacility(
  tenant: string,
  facility: NewCriticalFacility,
  idempotencyKey: string,
): Promise<Scope> {
  return apiRequest<Scope>(tenantPath(tenant, ["scopes"]), {
    method: "POST",
    body: { kind: "critical_facility", ...facility },
    idempotencyKey,
  });
}
