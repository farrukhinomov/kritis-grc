import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { de } from "./locales/de";
import { en } from "./locales/en";

export const SUPPORTED_LANGUAGES = ["de", "en"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = "de";

const STORAGE_KEY = "grc.language";

export const resources = { de: { translation: de }, en: { translation: en } } as const;

export function currentLanguage(candidate: string | null | undefined): Language {
  return SUPPORTED_LANGUAGES.find((language) => language === candidate) ?? DEFAULT_LANGUAGE;
}

// The choice is a per-browser convenience. Storage can be unavailable (private mode,
// blocked site data), which must never break the app.
function storedLanguage(): Language {
  try {
    return currentLanguage(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function rememberLanguage(language: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Not remembering the choice is acceptable; failing to switch is not.
  }
}

// Registered before init so the initial language is applied too. Screen readers and the
// browser's hyphenation follow the document language.
i18n.on("languageChanged", (language) => {
  document.documentElement.lang = language;
  rememberLanguage(language);
});

void i18n.use(initReactI18next).init({
  resources,
  lng: storedLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  // React already escapes output, so double escaping would show entities literally.
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
