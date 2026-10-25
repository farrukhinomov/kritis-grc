import activity from "@seed/activity.json";
import assets from "@seed/assets.json";
import evidence from "@seed/evidence.json";
import frameworks from "@seed/frameworks.json";
import hazards from "@seed/hazards.json";
import implementations from "@seed/implementations.json";
import mappingSuggestions from "@seed/mapping-suggestions.json";
import mappings from "@seed/mappings.json";
import requirements from "@seed/requirements.json";
import risks from "@seed/risks.json";
import scopes from "@seed/scopes.json";
import tenant from "@seed/tenant.json";
import users from "@seed/users.json";

import type {
  ActivityEntry,
  Asset,
  CriticalFacilityDetails,
  Evidence,
  Framework,
  Hazard,
  Implementation,
  Mapping,
  MappingSuggestion,
  Member,
  Requirement,
  Risk,
  Scope,
  Tenant,
  Treatment,
} from "@/shared/api/types";

/** The owner's name is looked up on every read, as the backend joins it. */
export type StoredImplementation = Omit<Implementation, "owner_name">;

/** The name is looked up on every read, as the backend joins it. */
export type StoredActivity = Omit<ActivityEntry, "actor_name">;

/**
 * The demo fixtures, typed as what the server stores. Values the server calculates
 * (deadlines, scores, residual ratings) are not in the files; the mock API derives them
 * on every read, as the backend will.
 */

export type StoredScope = Omit<Scope, "critical_facility"> & {
  critical_facility: Omit<CriticalFacilityDetails, "deadlines"> | null;
};

export interface StoredRating {
  likelihood: number;
  impact: number;
}

/** Names (Hazard, Assets, owner) are joined in on every read, as the backend does. */
export type StoredRisk = Omit<
  Risk,
  | "inherent"
  | "target"
  | "residual"
  | "treatments"
  | "hazard"
  | "assets"
  | "owner_name"
  | "scope_name"
> & {
  inherent: StoredRating;
  target: StoredRating;
  treatments: Treatment[];
};

export interface SeedData {
  tenant: Tenant;
  members: Member[];
  frameworks: Framework[];
  requirements: Requirement[];
  scopes: StoredScope[];
  assets: Asset[];
  mappings: Mapping[];
  mappingSuggestions: MappingSuggestion[];
  implementations: StoredImplementation[];
  evidence: Evidence[];
  hazards: Hazard[];
  risks: StoredRisk[];
  activity: StoredActivity[];
}

// JSON imports widen string unions to `string`. The cast is checked where it matters:
// the seed tests validate every enum value and every reference in these files.
export const SEED = {
  tenant,
  members: users,
  frameworks,
  requirements,
  scopes,
  assets,
  mappings,
  mappingSuggestions,
  implementations,
  evidence,
  hazards,
  risks,
  activity,
} as unknown as SeedData;
