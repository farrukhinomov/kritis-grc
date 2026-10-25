import type { Role, Session, TenantSummary } from "@/shared/session/session";

import { SEED } from "./seed";

/**
 * Who is signed in to the mock API. The backend keeps this in an HttpOnly session
 * cookie; the mock keeps it in sessionStorage, which likewise lasts until the browser
 * closes and survives a reload.
 */

/** The Demo Tenant's people the two demo logins sign in as. */
export const DEMO_ACCOUNTS: Record<Role, string> = { grc_manager: "u-kramer", auditor: "u-wolff" };

/**
 * Tenants beside the Demo Tenant, so every Theme can be shown by switching Tenants. For
 * the GRC Manager the hospital is an Auditor Membership: one user can hold different
 * roles in different Tenants, and the UI has to follow the Membership.
 */
export const SHOWCASE_TENANTS: readonly (TenantSummary & { managerRole: Role })[] = [
  {
    slug: "wasserverband-musterland",
    name: "Wasserverband Musterland",
    theme: "blue",
    managerRole: "grc_manager",
  },
  {
    slug: "klinikum-beispielstadt",
    name: "Klinikum Beispielstadt",
    theme: "high-contrast",
    managerRole: "auditor",
  },
];

export function demoSession(role: Role): Session {
  const member = SEED.members.find(({ id }) => id === DEMO_ACCOUNTS[role]);
  if (!member) {
    throw new Error(`The seed has no demo account ${DEMO_ACCOUNTS[role]}.`);
  }
  const { slug, name, theme } = SEED.tenant;
  return {
    user: { id: member.id, display_name: member.display_name, email: member.email },
    memberships: [
      { tenant: { slug, name, theme }, role },
      ...SHOWCASE_TENANTS.map(({ managerRole, ...tenant }) => ({
        tenant,
        role: role === "auditor" ? role : managerRole,
      })),
    ],
  };
}

const STORAGE_KEY = "grc.mockSession";

let current: Role | null = load();

function load(): Role | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored === "grc_manager" || stored === "auditor" ? stored : null;
  } catch {
    return null;
  }
}

export function currentSession(): Session | null {
  return current === null ? null : demoSession(current);
}

/** Signs in as a demo account, or out with null. Tests use it to set the scene. */
export function setMockSession(role: Role | null): void {
  current = role;
  try {
    if (role === null) {
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, role);
    }
  } catch {
    // Storage can be blocked; the session then simply lasts until the next reload.
  }
}
