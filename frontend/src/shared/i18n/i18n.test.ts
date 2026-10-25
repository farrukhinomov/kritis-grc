import i18n, { createInstance } from "i18next";

import { antdLocale, initI18n, selectLanguage } from ".";

const offline = () => Promise.reject(new Error("offline"));

async function englishPack() {
  const [{ en }, { default: antd }] = await Promise.all([
    import("./locales/en"),
    import("antd/locale/en_US"),
  ]);
  return { translation: en, antd };
}

/** A separate instance set up exactly like the app's, so no test depends on another. */
async function started(loadEnglish: () => ReturnType<typeof englishPack> = englishPack) {
  const instance = createInstance();
  await initI18n(instance, { en: loadEnglish });
  return instance;
}

describe("the UI languages", () => {
  it("start with German only; English isn't part of the first download", async () => {
    const instance = await started();

    expect(instance.language).toBe("de");
    expect(instance.hasResourceBundle("en", "translation")).toBe(false);
  });

  it("load English texts and Ant Design's English together, before the switch", async () => {
    const localeAtSwitch: string[] = [];
    const listener = (language: string) => localeAtSwitch.push(antdLocale(language).locale);
    i18n.on("languageChanged", listener);

    await expect(selectLanguage("en")).resolves.toBe(true);
    i18n.off("languageChanged", listener);

    expect(i18n.t("nav.dashboard")).toBe("Overview");
    expect(localeAtSwitch).toEqual(["en"]);
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("grc.language")).toBe("en");
  });
});

describe("when English can't be loaded", () => {
  it("stays German in name as well as in text", async () => {
    const instance = await started(offline);

    await expect(selectLanguage("en", instance)).resolves.toBe(false);

    expect(instance.language).toBe("de");
    expect(instance.t("nav.dashboard")).toBe("Übersicht");
  });

  it("rides out a brief network blip by retrying", async () => {
    let attempts = 0;
    const instance = await started(() => {
      attempts += 1;
      return attempts === 1 ? offline() : englishPack();
    });

    await expect(selectLanguage("en", instance)).resolves.toBe(true);

    expect(attempts).toBe(2);
  });

  it("tries again on the next attempt after giving up, instead of staying blocked", async () => {
    let online = false;
    const instance = await started(() => (online ? englishPack() : offline()));

    await expect(selectLanguage("en", instance)).resolves.toBe(false);
    online = true;
    await expect(selectLanguage("en", instance)).resolves.toBe(true);

    expect(instance.t("nav.dashboard")).toBe("Overview");
  });
});

describe("a reload with English remembered", () => {
  beforeEach(() => {
    localStorage.setItem("grc.language", "en");
  });

  it("is ready in English before anything renders", async () => {
    const instance = await started();

    expect(instance.language).toBe("en");
    expect(instance.t("nav.dashboard")).toBe("Overview");
  });

  it("starts in German but keeps the choice when English can't load", async () => {
    const instance = await started(offline);

    expect(instance.language).toBe("de");
    expect(localStorage.getItem("grc.language")).toBe("en");
  });
});
