import type { ThemeName } from "@/shared/theme/semantic";

export const ROLES = ["grc_manager", "auditor"] as const;
export type Role = (typeof ROLES)[number];

export interface TenantSummary {
  slug: string;
  name: string;
  theme: ThemeName;
}

/** A user's access to one Tenant, with exactly one role. */
export interface Membership {
  tenant: TenantSummary;
  role: Role;
}

/** The signed-in user as `GET /api/v1/me` returns it. */
export interface Session {
  user: { id: string; display_name: string; email: string };
  memberships: readonly Membership[];
}
