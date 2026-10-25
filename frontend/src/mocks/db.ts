import type { ActivityEntry, Evidence } from "@/shared/api/types";
import { DEMO_SESSION } from "@/shared/session/session";

import { SEED, type SeedData } from "./seed";

interface StoredResponse {
  status: number;
  body: Evidence;
  /** The request body the key was first used with; another body under the same key is refused. */
  fingerprint: string;
}

export interface TenantData extends SeedData {
  idempotency: Map<string, StoredResponse>;
}

const tenants = new Map<string, TenantData>();

function empty(slug: string, name: string, theme: SeedData["tenant"]["theme"]): SeedData {
  return {
    tenant: { slug, name, theme, sector: "water" },
    members: SEED.members,
    frameworks: SEED.frameworks,
    requirements: SEED.requirements,
    scopes: [],
    assets: [],
    mappings: SEED.mappings.filter((mapping) => mapping.kind === "platform"),
    mappingSuggestions: [],
    implementations: [],
    evidence: [],
    hazards: SEED.hazards,
    risks: [],
    activity: [],
  };
}

/**
 * Back to the fixtures, like the nightly reset of the Demo Tenant. The Demo Tenant gets
 * the full seed; the other Tenants of the demo session exist with the shared catalogues
 * (Frameworks, Platform Mappings, Hazards) but none of their own data, which shows the
 * empty states.
 */
export function resetDb(): void {
  tenants.clear();
  for (const { tenant } of DEMO_SESSION.memberships) {
    const data =
      tenant.slug === SEED.tenant.slug
        ? structuredClone(SEED)
        : structuredClone(empty(tenant.slug, tenant.name, tenant.theme));
    tenants.set(tenant.slug, { ...data, idempotency: new Map() });
  }
}

export function tenantData(slug: string): TenantData | undefined {
  return tenants.get(slug);
}

/** The signed-in user, who performs every write in the mock. */
export const ACTOR_ID = DEMO_SESSION.user.id;

let sequence = 0;

export function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${String(sequence)}`;
}

/** Every change lands in the Activity Log, as the backend's database triggers ensure. */
export function logActivity(
  data: TenantData,
  entry: Omit<ActivityEntry, "id" | "occurred_at" | "actor_id">,
  actorId: string = ACTOR_ID,
): void {
  data.activity.push({
    id: nextId("ac"),
    occurred_at: new Date().toISOString(),
    actor_id: actorId,
    ...entry,
  });
}

resetDb();
