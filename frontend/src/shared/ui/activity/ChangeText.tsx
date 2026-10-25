import { useTranslation } from "react-i18next";

import type { FieldChange } from "@/shared/api/types";

import { display, isShownField } from "./changes";

/** "Status: offen → teilweise umgesetzt", for one changed field. */
export function ChangeText({ change }: { change: FieldChange }) {
  const { t, i18n } = useTranslation();
  if (!isShownField(change.field)) {
    return null;
  }
  const field = change.field;

  return (
    <>
      {t(`history.fields.${field}`)}: {display(field, change.from, t, i18n.language)} →{" "}
      {display(field, change.to, t, i18n.language)}
    </>
  );
}
