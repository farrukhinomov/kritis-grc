import { queryOptions } from "@tanstack/react-query";

import { apiGet, tenantPath } from "./client";
import { resourceKey } from "./keys";
import type { Hazard, Page, PageParams, Risk } from "./types";

export const hazardsQuery = (tenant: string) =>
  queryOptions({
    queryKey: resourceKey(tenant, "hazards"),
    queryFn: ({ signal }) => apiGet<Page<Hazard>>(tenantPath(tenant, ["hazards"]), signal),
  });

export interface RiskFilter extends PageParams {
  scope?: string;
  /** Highest Residual Rating first; risks not yet rated follow, by inherent score. */
  ordering?: "-residual_score";
}

export const risksQuery = (tenant: string, filter: RiskFilter = {}) =>
  queryOptions({
    queryKey: resourceKey(tenant, "risks", filter),
    queryFn: ({ signal }) =>
      apiGet<Page<Risk>>(tenantPath(tenant, ["risks"], { ...filter }), signal),
  });

export const riskQuery = (tenant: string, id: string) =>
  queryOptions({
    queryKey: resourceKey(tenant, "risks", id),
    queryFn: ({ signal }) => apiGet<Risk>(tenantPath(tenant, ["risks", id]), signal),
  });
