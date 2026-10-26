import type {
  Deadline,
  DeadlineItem,
  DeadlineObligation,
  Registration,
  Sector,
} from "@/shared/api/types";
import { addMonths } from "@/shared/lib/dates";

import type { TenantData } from "./db";

/**
 * Legal deadlines that follow from a Critical Facility's Registration (§ 8 Abs. 7
 * KRITIS-DachG): the risk analysis applies nine months after it, resilience measures,
 * incident reporting and management duties ten months after it. A planned Registration
 * only projects them; a confirmed one makes them binding.
 */
const OBLIGATIONS = [
  { citation: "§ 12", obligation: "risk_analysis", months: 9, exemptable: true },
  { citation: "§ 13", obligation: "resilience_measures", months: 10, exemptable: true },
  { citation: "§ 18", obligation: "incident_reporting", months: 10, exemptable: false },
  { citation: "§ 20", obligation: "management_duties", months: 10, exemptable: false },
] as const satisfies readonly {
  citation: string;
  obligation: DeadlineObligation;
  months: number;
  exemptable: boolean;
}[];

/**
 * Finance and IT/telecommunications follow their own resilience rules (DORA, the BSIG), so
 * the law spares them the risk analysis and resilience measures (§ 4 Abs. 2), and with it
 * the Risk Assessment's renewal.
 */
const EXEMPT_SECTORS: readonly Sector[] = ["finance", "it_telecom"];

const owed = (sector: Sector) =>
  OBLIGATIONS.filter((item) => !(item.exemptable && EXEMPT_SECTORS.includes(sector)));

/** The law asks for a new Risk Assessment at least every four years. */
export const RISK_ASSESSMENT_VALID_MONTHS = 48;

export function deadlinesFor(registration: Registration, sector: Sector): Deadline[] {
  return owed(sector).map(({ citation, months }) => ({
    citation,
    due_date: addMonths(registration.date, months),
    binding: registration.status === "confirmed",
  }));
}

/**
 * Every deadline of every Critical Facility of the Tenant, soonest first: the duties that
 * start with the Registration, and the renewal of the latest approved Risk Assessment. A
 * renewal binds only as much as the facility's duties do, so it follows the Registration.
 */
export function tenantDeadlines(data: TenantData): DeadlineItem[] {
  const items = data.scopes.flatMap((scope): DeadlineItem[] => {
    const facility = scope.critical_facility;
    if (!facility) {
      return [];
    }
    const binding = facility.registration.status === "confirmed";
    const fromRegistration = owed(facility.sector).map(
      ({ citation, obligation, months }): DeadlineItem => ({
        scope_id: scope.id,
        scope_name: scope.name,
        citation,
        obligation,
        due_date: addMonths(facility.registration.date, months),
        binding,
        basis: binding ? "confirmed_registration" : "planned_registration",
      }),
    );
    const latest = data.riskAssessments
      .filter((item) => item.scope_id === scope.id && item.status === "approved")
      .map((item) => item.assessed_on)
      .toSorted()
      .at(-1);
    const renewal: DeadlineItem[] =
      latest && !EXEMPT_SECTORS.includes(facility.sector)
        ? [
            {
              scope_id: scope.id,
              scope_name: scope.name,
              citation: "§ 12",
              obligation: "risk_assessment_renewal",
              due_date: addMonths(latest, RISK_ASSESSMENT_VALID_MONTHS),
              binding,
              basis: "approved_risk_assessment",
            },
          ]
        : [];
    return [...fromRegistration, ...renewal];
  });
  return items.toSorted(
    (a, b) => a.due_date.localeCompare(b.due_date) || a.scope_name.localeCompare(b.scope_name),
  );
}
