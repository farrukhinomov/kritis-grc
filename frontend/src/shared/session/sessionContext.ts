import { createContext, useContext } from "react";

import { DEMO_SESSION, type Membership, type Session } from "./session";

export const SessionContext = createContext<Session>(DEMO_SESSION);

export function useSession(): Session {
  return useContext(SessionContext);
}

/** The Membership for a Tenant slug, or undefined when the user has no access to it. */
export function useMembership(tenantSlug: string | undefined): Membership | undefined {
  return useSession().memberships.find((membership) => membership.tenant.slug === tenantSlug);
}
