import {
  COLOR_MODE_STORAGE_KEY,
  readColorModePreference,
  resolveColorMode,
  storeColorModePreference,
} from "./colorMode";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("resolveColorMode", () => {
  it("follows an explicit choice regardless of the system setting", () => {
    expect(resolveColorMode("light", true)).toBe("light");
    expect(resolveColorMode("dark", false)).toBe("dark");
  });

  it("follows the system setting when the user chose system", () => {
    expect(resolveColorMode("system", true)).toBe("dark");
    expect(resolveColorMode("system", false)).toBe("light");
  });
});

describe("color mode preference storage", () => {
  it("defaults to system when nothing is stored", () => {
    expect(readColorModePreference()).toBe("system");
  });

  it("round-trips a stored choice", () => {
    storeColorModePreference("dark");

    expect(localStorage.getItem(COLOR_MODE_STORAGE_KEY)).toBe("dark");
    expect(readColorModePreference()).toBe("dark");
  });

  it("ignores unknown stored values", () => {
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, "sepia");

    expect(readColorModePreference()).toBe("system");
  });

  it("survives storage that is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    expect(readColorModePreference()).toBe("system");
    expect(() => {
      storeColorModePreference("dark");
    }).not.toThrow();
  });
});
