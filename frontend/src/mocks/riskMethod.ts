import type {
  ImplementationStatus,
  Rating,
  ResidualRating,
  RiskCategory,
  RiskDimension,
  Treatment,
  TreatmentEffect,
} from "@/shared/api/types";

/**
 * The risk engine's rating method (`qualitative-4x4/1`), mirrored for the mock API so
 * the prototype behaves like the real system: a Risk moves when an Implementation
 * behind one of its Treatments changes status. The risk engine stays the authority;
 * this copy must follow it, and its tests are the same cases.
 */

export const METHOD_VERSION = "qualitative-4x4/1";
const LOWEST_LEVEL = 1;

export function categorize(score: number): RiskCategory {
  if (score <= 2) {
    return "low";
  }
  if (score <= 4) {
    return "medium";
  }
  if (score <= 8) {
    return "high";
  }
  return "critical";
}

export function rate(likelihood: number, impact: number): Rating {
  const score = likelihood * impact;
  return { likelihood, impact, score, category: categorize(score) };
}

/** Only work that is in place counts: implemented fully, partial at half (rounded down). */
function effect(levels: number, status: ImplementationStatus): number {
  if (status === "implemented") {
    return levels;
  }
  if (status === "partial") {
    return Math.floor(levels / 2);
  }
  return 0;
}

export function assess(
  inherent: { likelihood: number; impact: number },
  treatments: readonly Treatment[],
  statusOf: (implementationId: string) => ImplementationStatus,
): ResidualRating {
  const explanation: TreatmentEffect[] = treatments.map((treatment) => {
    const status = statusOf(treatment.implementation_id);
    return {
      implementation_id: treatment.implementation_id,
      dimension: treatment.dimension,
      status,
      levels_applied: effect(treatment.levels, status),
    };
  });
  const lowered = (level: number, dimension: RiskDimension) =>
    Math.max(
      LOWEST_LEVEL,
      level -
        explanation
          .filter((entry) => entry.dimension === dimension)
          .reduce((sum, entry) => sum + entry.levels_applied, 0),
    );

  return {
    ...rate(lowered(inherent.likelihood, "likelihood"), lowered(inherent.impact, "impact")),
    method_version: METHOD_VERSION,
    explanation,
  };
}
