import type { TFunction } from "i18next";

import type { ImplementationStatus } from "@/shared/api/types";
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

const IMPLEMENTATION_STATUSES = new Set<string>([
  "open",
  "partial",
  "implemented",
  "not_applicable",
]);
const SUGGESTION_STATUSES = new Set<string>(["pending", "approved", "rejected"]);

/** Only fields a reader can make sense of are shown; internal ones stay in the record. */
export const isShownField = (field: string): field is ShownField =>
  FIELDS.some((item) => item === field);

/** A changed value as the reader knows it: translated statuses and Themes, local dates. */
export function display(
  field: ShownField,
  value: string | null,
  t: TFunction,
  language: string,
): string {
  if (value === null || value === "") {
    return t("history.empty");
  }
  if (field === "status" && IMPLEMENTATION_STATUSES.has(value)) {
    return t(`implementationStatus.${value as ImplementationStatus}`);
  }
  if (field === "status" && SUGGESTION_STATUSES.has(value)) {
    return t(`suggestions.status.${value as "pending" | "approved" | "rejected"}`);
  }
  if (field === "theme" && THEME_NAMES.some((name) => name === value)) {
    return t(`settings.themes.${value as ThemeName}.name`);
  }
  if (field === "due_date") {
    return formatDate(value, language);
  }
  return value;
}
