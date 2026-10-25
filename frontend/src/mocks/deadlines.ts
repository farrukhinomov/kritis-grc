import type { Deadline, Registration } from "@/shared/api/types";

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

/** Calendar months on a plain date; the month end is kept (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(isoDate: string, months: number): string {
  const [year = 0, month = 1, day = 1] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export function deadlinesFor(registration: Registration): Deadline[] {
  return OBLIGATIONS.map(({ citation, months }) => ({
    citation,
    due_date: addMonths(registration.date, months),
    binding: registration.status === "confirmed",
  }));
}
