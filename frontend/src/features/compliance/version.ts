import type { Framework, FrameworkVersion } from "@/shared/api/types";

/**
 * The version in force today: the latest that has taken effect. An announced amendment
 * with a future date must not replace it before then, or the cockpit would show
 * paragraphs nobody has implemented yet. If every version lies ahead, the first one is
 * the one being prepared for.
 */
export function currentVersion(
  framework: Framework,
  today: string = new Date().toISOString().slice(0, 10),
): FrameworkVersion | undefined {
  const byDate = framework.versions.toSorted((a, b) =>
    a.effective_from.localeCompare(b.effective_from),
  );
  return byDate.findLast((version) => version.effective_from <= today) ?? byDate[0];
}
