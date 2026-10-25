import { App } from "antd";
import { useTranslation } from "react-i18next";

import { type Language, selectLanguage } from "@/shared/i18n";

/** Switches the UI language, and says so when it can't be loaded instead of doing nothing. */
export function useSelectLanguage() {
  const { t } = useTranslation();
  const { message } = App.useApp();

  return async (language: Language) => {
    if (!(await selectLanguage(language))) {
      void message.error(t("app.languageUnavailable"));
    }
  };
}
