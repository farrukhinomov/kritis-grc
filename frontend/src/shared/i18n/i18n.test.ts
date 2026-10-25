import deDE from "antd/locale/de_DE";
import i18n, { createInstance } from "i18next";

import { antdLocale, i18nReady, lazyLanguages } from ".";

describe("the UI languages", () => {
  it("start with German only; English isn't part of the first download", async () => {
    await i18nReady;

    expect(i18n.language).toBe("de");
    expect(i18n.hasResourceBundle("en", "translation")).toBe(false);
    expect(antdLocale("en")).toBe(deDE);
  });

  it("load English texts and Ant Design's English together, before the switch", async () => {
    await i18n.changeLanguage("en");

    expect(i18n.t("nav.dashboard")).toBe("Overview");
    expect(antdLocale("en").locale).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("stay usable in German when English can't be loaded", async () => {
    const instance = createInstance();
    await instance.use(lazyLanguages({ en: () => Promise.reject(new Error("offline")) })).init({
      resources: { de: { translation: { nav: { dashboard: "Übersicht" } } } },
      partialBundledLanguages: true,
      lng: "de",
      fallbackLng: "de",
      supportedLngs: ["de", "en"],
      backend: { maxRetries: 0 },
    });

    await instance.changeLanguage("en");

    expect(instance.t("nav.dashboard")).toBe("Übersicht");
  });
});

describe("a reload with English remembered", () => {
  it("is ready in English before anything renders", async () => {
    vi.resetModules();
    localStorage.setItem("grc.language", "en");

    const fresh = await import(".");
    await fresh.i18nReady;

    expect(fresh.default.language).toBe("en");
    expect(fresh.default.t("nav.dashboard")).toBe("Overview");
  });
});
