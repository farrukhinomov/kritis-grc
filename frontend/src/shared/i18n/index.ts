import deDE from "antd/locale/de_DE";
import i18n, { type BackendModule, type i18n as I18n } from "i18next";
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
          // `true` lets i18next retry: most failures are a brief network blip.
          callback(error instanceof Error ? error : new Error(String(error)), true);
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
});

/**
 * Switches only once the language is loaded. i18next's own `changeLanguage` switches
 * even when the load failed, leaving the page English in name and German in text, and
 * never tries a failed language again; this forces a fresh attempt every time.
 * Resolves to whether the switch happened, so the caller can tell the user.
 */
export async function selectLanguage(language: Language, instance: I18n = i18n): Promise<boolean> {
  if (!instance.hasResourceBundle(language, "translation")) {
    await instance.reloadResources([language], ["translation"]);
  }
  if (!instance.hasResourceBundle(language, "translation")) {
    return false;
  }
  await instance.changeLanguage(language);
  if (instance === i18n) {
    rememberLanguage(language);
  }
  return true;
}

/**
 * Starts in German, which is bundled, then switches to the remembered language once it
 * has loaded. Rendering waits for this, so an English user never sees German flash by;
 * if English can't load, the app stays German and the choice is kept for next time.
 */
export async function initI18n(instance: I18n, loaders: Loaders = LOADERS): Promise<void> {
  await instance
    .use(lazyLanguages(loaders))
    .use(initReactI18next)
    .init({
      resources: { de: { translation: de } },
      partialBundledLanguages: true,
      lng: DEFAULT_LANGUAGE,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: SUPPORTED_LANGUAGES,
      // Two quick retries cover a blip without keeping a slow start waiting for long.
      maxRetries: 2,
      retryTimeout: 300,
      // React already escapes output, so double escaping would show entities literally.
      interpolation: { escapeValue: false },
      returnNull: false,
    });
  const remembered = storedLanguage();
  if (remembered !== DEFAULT_LANGUAGE) {
    await selectLanguage(remembered, instance);
  }
}

export const i18nReady = initI18n(i18n);

export default i18n;
