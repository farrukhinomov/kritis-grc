import type { ImplementationStatus } from "@/shared/api/types";

/**
 * One status for a group of Implementations: implemented only when everything that
 * applies is, open only when nothing has started, partial in between. A group where
 * nothing applies is not applicable.
 */
export function overallStatus(counts: Record<ImplementationStatus, number>): ImplementationStatus {
  const applicable = counts.open + counts.partial + counts.implemented;
  if (applicable === 0) {
    return "not_applicable";
  }
  if (counts.implemented === applicable) {
    return "implemented";
  }
  if (counts.open === applicable) {
    return "open";
  }
  return "partial";
}
