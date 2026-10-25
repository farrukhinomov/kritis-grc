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

export interface Session {
  user: { id: string; displayName: string; email: string };
  memberships: readonly Membership[];
}

/**
 * The prototype runs without sign-in, as this fictional user with one Membership per
 * Theme, so every Theme can be shown by switching Tenants. Sign-in replaces the value,
 * not the shape.
 */
export const DEMO_SESSION: Session = {
  user: { id: "u-kramer", displayName: "Alex Kramer", email: "alex.kramer@example.com" },
  memberships: [
    {
      tenant: {
        slug: "muster-stadtwerke",
        name: "Muster-Stadtwerke Saar GmbH",
        theme: "saar-green",
      },
      role: "grc_manager",
    },
    {
      tenant: { slug: "wasserverband-musterland", name: "Wasserverband Musterland", theme: "blue" },
      role: "grc_manager",
    },
    {
      tenant: {
        slug: "klinikum-beispielstadt",
        name: "Klinikum Beispielstadt",
        theme: "high-contrast",
      },
      role: "auditor",
    },
  ],
};
