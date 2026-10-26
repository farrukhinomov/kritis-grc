import type { TFunction } from "i18next";

import { LAW_ABBREVIATIONS } from "@/shared/lib/laws";
import type { CoverageCell, CoverageRequirement } from "@/shared/api/types";

/** A cell in one sentence: which pair, how fully it is covered, and whether it is reused. */
export function cellLabel(
  t: TFunction,
  cell: CoverageCell,
  target: CoverageRequirement,
  source: CoverageRequirement,
): string {
  const parts: string[] = [
    t("coverage.pair", {
      target: `${target.citation} ${LAW_ABBREVIATIONS[target.framework_key]}`,
      source: `${source.citation} ${LAW_ABBREVIATIONS[source.framework_key]}`,
    }),
    t(`coverage.levels.${cell.coverage}`),
  ];
  if (cell.reused_in.length > 0) {
    parts.push(t("coverage.reused"));
  }
  return parts.join(", ");
}

/** "§ 30 Abs. 2 Nr. 1" as "30 (2) 1": short enough for a column, with the full name kept. */
export function shortCitation(citation: string): string {
  const [, paragraph = "", section, number] =
    /§\s*(\d+\w*)(?:\s*Abs\.\s*(\d+))?(?:\s*Nr\.\s*(\d+))?/.exec(citation) ?? [];
  return [paragraph, section && `(${section})`, number].filter(Boolean).join(" ");
}
