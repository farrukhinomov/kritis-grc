import "i18next";

import type { de } from "./locales/de";

// Typed keys: `t("status.titel")` is a compile error instead of a missing text at runtime.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof de };
  }
}
