import type { Deadline, Registration } from "@/shared/api/types";
import { addMonths } from "@/shared/lib/dates";

/**
 * Legal deadlines that follow from a Critical Facility's Registration (§ 8 Abs. 7
 * KRITIS-DachG): the risk analysis applies nine months after it, resilience measures,
 * incident reporting and management duties ten months after it. A planned Registration
 * only projects them; a confirmed one makes them binding.
 */
const OBLIGATIONS = [
  { citation: "§ 12", months: 9 },
  { citation: "§ 13", months: 10 },
  { citation: "§ 18", months: 10 },
  { citation: "§ 20", months: 10 },
] as const;

export function deadlinesFor(registration: Registration): Deadline[] {
  return OBLIGATIONS.map(({ citation, months }) => ({
    citation,
    due_date: addMonths(registration.date, months),
    binding: registration.status === "confirmed",
  }));
}
