import { Segmented } from "antd";
import { useTranslation } from "react-i18next";

import { currentLanguage, type Language, SUPPORTED_LANGUAGES } from "@/shared/i18n";

export function LanguageSwitch() {
  const { t, i18n } = useTranslation();

  return (
    <Segmented<Language>
      aria-label={t("app.language")}
      size="small"
      value={currentLanguage(i18n.resolvedLanguage)}
      options={SUPPORTED_LANGUAGES.map((language) => ({
        label: language.toUpperCase(),
        value: language,
      }))}
      onChange={(language) => void i18n.changeLanguage(language)}
    />
  );
}
