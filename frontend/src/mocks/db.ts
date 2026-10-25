import type { ActivityEntry, Evidence } from "@/shared/api/types";

import { DEMO_ACCOUNTS, SHOWCASE_TENANTS } from "./accounts";
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
 * the full seed; the showcase Tenants exist with the shared catalogues (Frameworks,
 * Platform Mappings, Hazards) but none of their own data, which shows the empty states.
 */
export function resetDb(): void {
  tenants.clear();
  tenants.set(SEED.tenant.slug, { ...structuredClone(SEED), idempotency: new Map() });
  for (const { slug, name, theme } of SHOWCASE_TENANTS) {
    tenants.set(slug, { ...structuredClone(empty(slug, name, theme)), idempotency: new Map() });
  }
}

export function tenantData(slug: string): TenantData | undefined {
  return tenants.get(slug);
}

/**
 * Who performs the mock's writes. Only GRC Managers may write, and the demo signs in as
 * one of them, so this stays fixed rather than following the session.
 */
export const ACTOR_ID = DEMO_ACCOUNTS.grc_manager;

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
