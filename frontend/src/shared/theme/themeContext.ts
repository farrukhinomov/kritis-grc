import { createContext, useContext, useLayoutEffect } from "react";

import type { ColorModePreference } from "./colorMode";
import { type ColorMode, DEFAULT_THEME, type SemanticTokens, type ThemeName } from "./semantic";

export interface ColorModeState {
  preference: ColorModePreference;
  mode: ColorMode;
  setPreference: (preference: ColorModePreference) => void;
}

export interface ThemeState {
  name: ThemeName;
  tokens: SemanticTokens;
  setName: (name: ThemeName) => void;
}

export const ColorModeContext = createContext<ColorModeState | null>(null);
export const ThemeContext = createContext<ThemeState | null>(null);

function required<T>(value: T | null, hook: string): T {
  if (value === null) {
    throw new Error(`${hook} must be used inside <ThemeProvider>`);
  }
  return value;
}

export function useColorMode(): ColorModeState {
  return required(useContext(ColorModeContext), "useColorMode");
}

/** For the rare component that draws with raw token values (charts, the risk matrix). */
export function useSemanticTokens(): SemanticTokens {
  return required(useContext(ThemeContext), "useSemanticTokens").tokens;
}

/**
 * Applies a Tenant's Theme while the calling component is mounted, and returns to the
 * default Theme afterwards. A layout effect switches before the browser paints, so the
 * previous Theme never flashes.
 */
export function useTenantTheme(name: ThemeName): void {
  const { setName } = required(useContext(ThemeContext), "useTenantTheme");

  useLayoutEffect(() => {
    setName(name);
    return () => {
      setName(DEFAULT_THEME);
    };
  }, [name, setName]);
}
