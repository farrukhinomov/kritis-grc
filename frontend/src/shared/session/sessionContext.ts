import { createContext, useContext } from "react";

import { can, type Permission } from "./permissions";
import type { Membership, Session } from "./session";

/** Set by the session gate, so every page behind it has a signed-in user. */
export const SessionContext = createContext<Session | null>(null);

/** Set by the Tenant shell: the Membership of the Tenant being shown. */
export const MembershipContext = createContext<Membership | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error("useSession needs a signed-in session; render it behind the session gate.");
  }
  return session;
}

/** The Membership for a Tenant slug, or undefined when the user has no access to it. */
export function useMembership(tenantSlug: string | undefined): Membership | undefined {
  return useSession().memberships.find((membership) => membership.tenant.slug === tenantSlug);
}

/**
 * Whether the current Membership allows an action. Outside a Tenant nothing is allowed,
 * so a write control rendered in the wrong place stays disabled rather than open.
 */
export function useCan(permission: Permission): boolean {
  const membership = useContext(MembershipContext);
  return membership !== null && can(membership.role, permission);
}
