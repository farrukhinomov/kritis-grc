import type { ColorMode } from "./semantic";

export const COLOR_MODE_PREFERENCES = ["light", "dark", "system"] as const;
export type ColorModePreference = (typeof COLOR_MODE_PREFERENCES)[number];

/**
 * Also read by public/color-mode.js, which applies the mode before the first paint. The
 * two must agree, and a test runs that script against this key.
 */
export const COLOR_MODE_STORAGE_KEY = "grc.colorMode";
export const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

/**
 * Light until someone chooses otherwise, even on a dark system: the product's palette is
 * designed light first, and a first visit should look the same for everyone. "System" is a
 * choice the user makes in the menu.
 */
const DEFAULT_PREFERENCE: ColorModePreference = "light";

export function resolveColorMode(
  preference: ColorModePreference,
  systemPrefersDark: boolean,
): ColorMode {
  if (preference === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return preference;
}

// The choice is a per-browser convenience until profiles store it. Storage can be
// unavailable (private mode, blocked site data), which must never break the app.
export function readColorModePreference(): ColorModePreference {
  try {
    const stored = localStorage.getItem(COLOR_MODE_STORAGE_KEY);
    return COLOR_MODE_PREFERENCES.find((preference) => preference === stored) ?? DEFAULT_PREFERENCE;
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

export function storeColorModePreference(preference: ColorModePreference): void {
  try {
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, preference);
  } catch {
    // Not remembering the choice is acceptable; failing to switch is not.
  }
}
