import { queryOptions } from "@tanstack/react-query";

import { apiGet, tenantPath } from "./client";
import { resourceKey } from "./keys";
import type { Asset, Member, Page, PageParams, Scope, Tenant } from "./types";

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
