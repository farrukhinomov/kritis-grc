import { queryOptions } from "@tanstack/react-query";

import { apiGet, tenantPath } from "./client";
import { resourceKey } from "./keys";
import type { Hazard, Page, PageParams, RatingKind, Risk, RiskCategory, RiskMatrix } from "./types";

export const hazardsQuery = (tenant: string) =>
  queryOptions({
    queryKey: resourceKey(tenant, "hazards"),
    queryFn: ({ signal }) => apiGet<Page<Hazard>>(tenantPath(tenant, ["hazards"]), signal),
  });

export interface RiskFilter extends PageParams {
  scope?: string;
  /** Highest Residual Rating first; risks not yet rated follow, by inherent score. */
  ordering?: "-residual_score";
  /** Which rating `category`, `likelihood` and `impact` refer to; residual by default. */
  rating?: RatingKind;
  /** "pending" means no Residual Rating yet; only the residual rating can be pending. */
  category?: RiskCategory | "pending";
  likelihood?: number;
  impact?: number;
}

export const risksQuery = (tenant: string, filter: RiskFilter = {}) =>
  queryOptions({
    queryKey: resourceKey(tenant, "risks", filter),
    queryFn: ({ signal }) =>
      apiGet<Page<Risk>>(tenantPath(tenant, ["risks"], { ...filter }), signal),
  });

export interface RiskMatrixFilter {
  rating?: RatingKind;
  scope?: string;
}

/** Counted by the server over every Risk, so the matrix never misses one past a page. */
export const riskMatrixQuery = (tenant: string, filter: RiskMatrixFilter = {}) =>
  queryOptions({
    queryKey: resourceKey(tenant, "risks", "matrix", filter),
    queryFn: ({ signal }) =>
      apiGet<RiskMatrix>(tenantPath(tenant, ["risk-matrix"], { ...filter }), signal),
  });

export const riskQuery = (tenant: string, id: string) =>
  queryOptions({
    queryKey: resourceKey(tenant, "risks", id),
    queryFn: ({ signal }) => apiGet<Risk>(tenantPath(tenant, ["risks", id]), signal),
  });
