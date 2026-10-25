/**
 * Query keys start with the Tenant, so switching Tenants never shows another Tenant's
 * cached data, and everything of one Tenant can be invalidated at once.
 */
export const tenantKey = (tenant: string) => ["tenants", tenant] as const;

export const resourceKey = (tenant: string, resource: string, ...rest: unknown[]) =>
  [...tenantKey(tenant), resource, ...rest] as const;
