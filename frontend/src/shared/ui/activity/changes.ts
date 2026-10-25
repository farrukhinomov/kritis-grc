import type { TFunction } from "i18next";

import { formatDate } from "@/shared/lib/format";
import { THEME_NAMES, type ThemeName } from "@/shared/theme/semantic";

const FIELDS = [
  "status",
  "owner",
  "due_date",
  "note_de",
  "theme",
  "inherent_likelihood",
  "inherent_impact",
  "target_likelihood",
  "target_impact",
] as const;
export type ShownField = (typeof FIELDS)[number];

/** Each kind of object has its own statuses; the same word means different things. */
const STATUS_KEYS: Partial<Record<string, { prefix: string; values: Set<string> }>> = {
  implementation: {
    prefix: "implementationStatus",
    values: new Set(["open", "partial", "implemented", "not_applicable"]),
  },
  mapping_suggestion: {
    prefix: "suggestions.status",
    values: new Set(["pending", "approved", "rejected"]),
  },
  risk_assessment: {
    prefix: "approvals.status",
    values: new Set(["submitted", "approved", "rejected"]),
  },
};

/** Only fields a reader can make sense of are shown; internal ones stay in the record. */
export const isShownField = (field: string): field is ShownField =>
  FIELDS.some((item) => item === field);

/** A changed value as the reader knows it: translated statuses and Themes, local dates. */
export function display(
  field: ShownField,
  value: string | null,
  objectType: string,
  t: TFunction,
  language: string,
): string {
  if (value === null || value === "") {
    return t("history.empty");
  }
  const statuses = STATUS_KEYS[objectType];
  if (field === "status" && statuses?.values.has(value)) {
    // The key is built from a known prefix and one of that object's own statuses.
    return t(`${statuses.prefix}.${value}` as "implementationStatus.open");
  }
  if (field === "theme" && THEME_NAMES.some((name) => name === value)) {
    return t(`settings.themes.${value as ThemeName}.name`);
  }
  if (field === "due_date") {
    return formatDate(value, language);
  }
  return value;
}
