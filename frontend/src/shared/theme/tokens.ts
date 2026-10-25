import { theme, type ThemeConfig } from "antd";

/**
 * Minimal Saar Green token set for the skeleton. The full design system replaces it with
 * primitive, semantic and component layers for every Theme in light and dark.
 */
const saarGreen = {
  primary: "#3A8B71",
  sidebar: "#07081D",
  pageLight: "#F2F2F2",
} as const;

export type ColorMode = "light" | "dark";

export function antdTheme(mode: ColorMode): ThemeConfig {
  return {
    algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: saarGreen.primary,
      fontFamily: "'Inter Variable', system-ui, sans-serif",
      ...(mode === "light" ? { colorBgLayout: saarGreen.pageLight } : {}),
    },
    components: {
      Layout: { headerBg: saarGreen.sidebar },
    },
  };
}
