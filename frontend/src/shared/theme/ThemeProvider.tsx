import { ConfigProvider } from "antd";
import type { Locale } from "antd/es/locale";
import { type ReactNode, useCallback, useLayoutEffect, useMemo, useState } from "react";

import { COARSE_POINTER_QUERY, useMediaQuery } from "@/shared/lib/useMediaQuery";

import { antdTheme } from "./antdTheme";
import {
  type ColorModePreference,
  DARK_SCHEME_QUERY,
  readColorModePreference,
  resolveColorMode,
  storeColorModePreference,
} from "./colorMode";
import { cssVariables } from "./cssVariables";
import { motionVariables } from "./motion";
import { DEFAULT_THEME, semanticTokens, type ThemeName } from "./semantic";
import { ColorModeContext, ThemeContext } from "./themeContext";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * The single source of the active Theme and color mode. It configures antd and mirrors
 * the semantic tokens onto <html> as CSS variables, so portals (drawers, menus) and plain
 * style sheets see the same values as components.
 */
export function ThemeProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [preference, setPreferenceState] = useState(readColorModePreference);
  const [name, setName] = useState<ThemeName>(DEFAULT_THEME);
  const systemPrefersDark = useMediaQuery(DARK_SCHEME_QUERY);
  const coarsePointer = useMediaQuery(COARSE_POINTER_QUERY);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);

  const mode = resolveColorMode(preference, systemPrefersDark);
  const tokens = semanticTokens(name, mode);
  const config = useMemo(
    () => antdTheme(name, mode, { coarsePointer, reducedMotion }),
    [name, mode, coarsePointer, reducedMotion],
  );

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.colorMode = mode;
    root.dataset.theme = name;
    root.style.colorScheme = mode;
    const variables = { ...cssVariables(tokens), ...motionVariables() };
    for (const [variable, value] of Object.entries(variables)) {
      root.style.setProperty(variable, value);
    }
  }, [mode, name, tokens]);

  const setPreference = useCallback((next: ColorModePreference) => {
    storeColorModePreference(next);
    setPreferenceState(next);
  }, []);

  const colorMode = useMemo(
    () => ({ preference, mode, setPreference }),
    [preference, mode, setPreference],
  );
  const theme = useMemo(() => ({ name, tokens, setName }), [name, tokens]);

  return (
    <ColorModeContext value={colorMode}>
      <ThemeContext value={theme}>
        <ConfigProvider theme={config} locale={locale}>
          {children}
        </ConfigProvider>
      </ThemeContext>
    </ColorModeContext>
  );
}
