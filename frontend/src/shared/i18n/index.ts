import deDE from "antd/locale/de_DE";
import i18n, { type BackendModule } from "i18next";
import { initReactI18next } from "react-i18next";

import { de, type Translation } from "./locales/de";

export const SUPPORTED_LANGUAGES = ["de", "en"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = "de";

const STORAGE_KEY = "grc.language";

type AntdLocale = typeof deDE;

interface LanguagePack {
  translation: Translation;
  antd: AntdLocale;
}

type Loaders = Partial<Record<string, () => Promise<LanguagePack>>>;

/**
 * Every language but German is fetched when first chosen. German stays in the first
 * download: it is the default, the fallback when a load fails, and the typed source of
 * every key. Each further language would otherwise grow the first download for everyone.
 */
const LOADERS: Loaders = {
  en: async () => {
    const [{ en }, { default: antd }] = await Promise.all([
      import("./locales/en"),
      import("antd/locale/en_US"),
    ]);
    return { translation: en, antd };
  },
};

const antdLocales = new Map<string, AntdLocale>([["de", deDE]]);

/** Ant Design's texts (pagination, date pickers) for a language that has been loaded. */
export function antdLocale(language: string): AntdLocale {
  return antdLocales.get(language) ?? deDE;
}

/**
 * A backend that loads a language's texts and its Ant Design locale together, so both
 * are in place before i18next switches and nothing shows in two languages at once.
 */
export function lazyLanguages(loaders: Loaders = LOADERS): BackendModule {
  return {
    type: "backend",
    init: () => undefined,
    read: (language, _namespace, callback) => {
      const load = loaders[language];
      if (!load) {
        // Bundled languages are already in the store; there is nothing to fetch.
        callback(null, {});
        return;
      }
      load().then(
        ({ translation, antd }) => {
          antdLocales.set(language, antd);
          callback(null, translation);
        },
        (error: unknown) => {
          // i18next then falls back to German, which keeps the UI usable offline.
          callback(error instanceof Error ? error : new Error(String(error)), false);
        },
      );
    },
  };
}

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

/** Resolves once the remembered language is loaded; rendering waits for it, so an English
 * user never sees German flash by after a reload. */
export const i18nReady = i18n
  .use(lazyLanguages())
  .use(initReactI18next)
  .init({
    resources: { de: { translation: de } },
    partialBundledLanguages: true,
    lng: storedLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    // React already escapes output, so double escaping would show entities literally.
    interpolation: { escapeValue: false },
    returnNull: false,
  });

export default i18n;
