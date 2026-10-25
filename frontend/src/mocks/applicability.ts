import type {
  ApplicabilityQuestion,
  ApplicabilityResult,
  CriticalServiceDefinition,
} from "@/shared/api/types";

/**
 * The Critical Services the prototype knows, with their thresholds. The KRITIS-Dachgesetz
 * sets 500,000 people supplied as the default (§ 5 Abs. 2); the ordinance that will set
 * the specific values is still a draft, so every threshold here is that default and no
 * result is binding yet. Until the ordinance is in force there is no duty to register.
 */
export const CRITICAL_SERVICES: readonly CriticalServiceDefinition[] = [
  {
    sector: "water",
    critical_service: "drinking_water_supply",
    measure: "people_supplied",
    threshold: 500000,
    threshold_basis: "statutory_default",
    citation: "§ 5 Abs. 2",
  },
];

const REGISTRATION_WITHIN_MONTHS = 3;

export function serviceFor(sector: unknown, service: unknown) {
  return CRITICAL_SERVICES.find(
    (item) => item.sector === sector && item.critical_service === service,
  );
}

/** Reaching the threshold counts, as thresholds are minimum values of supply. */
export function checkApplicability(
  definition: CriticalServiceDefinition,
  question: ApplicabilityQuestion,
): ApplicabilityResult {
  const binding = definition.threshold_basis === "ordinance";
  return {
    ...question,
    applies: question.people_supplied >= definition.threshold,
    threshold: definition.threshold,
    threshold_basis: definition.threshold_basis,
    binding,
    not_binding_reason: binding ? null : "ordinance_pending",
    registration_within_months: REGISTRATION_WITHIN_MONTHS,
    citations: {
      definition: "§ 2 Nr. 3",
      threshold: definition.citation,
      registration: "§ 8 Abs. 1",
    },
  };
}
