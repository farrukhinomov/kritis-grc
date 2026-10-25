import { amber, blue, contrast, green, lime, neutral, night, red } from "./primitives";

/**
 * Semantic tokens: the vocabulary components use. Every Theme provides the same names in
 * light and dark, so a component never knows which Theme or mode is active.
 *
 * Dark values are chosen by hand rather than derived by an algorithm: generated dark
 * palettes make the risk and status colors glaring and drop text contrast on tinted
 * backgrounds.
 */

export const THEME_NAMES = ["saar-green", "blue", "high-contrast"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];
export const DEFAULT_THEME: ThemeName = "saar-green";

export const COLOR_MODES = ["light", "dark"] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

export const STATUS_TONES = ["success", "warning", "danger", "info"] as const;
export type StatusTone = (typeof STATUS_TONES)[number];

/** Same categories, in the same order, as the risk engine's Residual Rating. */
export const RISK_CATEGORIES = ["low", "medium", "high", "critical"] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

/** A colored meaning: `text` on surfaces, `bg` behind body text, `solid` for marks. */
export interface Tone {
  text: string;
  bg: string;
  solid: string;
}

export interface SemanticTokens {
  primary: string;
  primaryHover: string;
  onPrimary: string;
  link: string;
  page: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  text: string;
  textSecondary: string;
  /** Decorative separators that carry no meaning. */
  borderSubtle: string;
  /** Boundaries of inputs and other controls, which must stay visible (3:1). */
  controlBorder: string;
  focusRing: string;
  sidebar: { bg: string; hoverBg: string; text: string; textActive: string; activeBg: string };
  status: Record<StatusTone, Tone>;
  risk: Record<RiskCategory, Tone>;
}

type Accent = Pick<SemanticTokens, "primary" | "primaryHover" | "onPrimary" | "link" | "focusRing">;

const brandLight = {
  page: neutral[100],
  surface: neutral.white,
  surfaceRaised: neutral.white,
  surfaceSunken: neutral[50],
  text: neutral[900],
  textSecondary: neutral[600],
  borderSubtle: neutral[150],
  controlBorder: neutral[400],
  status: {
    success: { text: green[800], bg: green[100], solid: green[600] },
    warning: { text: amber[800], bg: amber[100], solid: amber[700] },
    danger: { text: red[700], bg: red[100], solid: red[600] },
    info: { text: blue[800], bg: blue[100], solid: blue[600] },
  },
  risk: {
    low: { text: green[800], bg: green[100], solid: green[600] },
    medium: { text: lime[800], bg: lime[200], solid: lime[600] },
    high: { text: amber[800], bg: amber[200], solid: amber[700] },
    critical: { text: red[800], bg: red[200], solid: red[600] },
  },
} as const;

const brandDark = {
  page: night[900],
  surface: night[850],
  surfaceRaised: night[800],
  surfaceSunken: night[950],
  text: night[100],
  textSecondary: night[300],
  borderSubtle: night[700],
  controlBorder: night[500],
  status: {
    success: { text: green[300], bg: green[900], solid: green[450] },
    warning: { text: amber[400], bg: amber[900], solid: amber[500] },
    danger: { text: red[400], bg: red[900], solid: red[500] },
    info: { text: blue[300], bg: blue[900], solid: blue[400] },
  },
  risk: {
    low: { text: green[300], bg: green[900], solid: green[450] },
    medium: { text: lime[400], bg: lime[900], solid: lime[500] },
    high: { text: amber[400], bg: amber[900], solid: amber[500] },
    critical: { text: red[400], bg: red[900], solid: red[500] },
  },
} as const;

function brand(
  base: typeof brandLight | typeof brandDark,
  accent: Accent,
  sidebar: SemanticTokens["sidebar"],
): SemanticTokens {
  return { ...base, ...accent, sidebar };
}

const highContrastLight: SemanticTokens = {
  primary: contrast.navy,
  primaryHover: contrast.blueDark,
  onPrimary: contrast.white,
  link: contrast.navy,
  page: contrast.white,
  surface: contrast.white,
  surfaceRaised: contrast.white,
  surfaceSunken: contrast.grey100,
  text: contrast.black,
  textSecondary: contrast.grey700,
  borderSubtle: contrast.grey500,
  controlBorder: contrast.black,
  focusRing: contrast.orange,
  sidebar: {
    bg: contrast.black,
    hoverBg: contrast.grey800,
    text: contrast.white,
    textActive: contrast.black,
    activeBg: contrast.yellow,
  },
  status: {
    success: { text: contrast.greenDark, bg: contrast.greenTint, solid: contrast.greenDark },
    warning: { text: contrast.amberDark, bg: contrast.amberTint, solid: contrast.amberDark },
    danger: { text: contrast.redDark, bg: contrast.redTint, solid: contrast.redDark },
    info: { text: contrast.blueDark, bg: contrast.blueTint, solid: contrast.blueDark },
  },
  risk: {
    low: { text: contrast.greenDark, bg: contrast.greenTint, solid: contrast.greenDark },
    medium: { text: contrast.blueDark, bg: contrast.blueTint, solid: contrast.blueDark },
    high: { text: contrast.amberDark, bg: contrast.amberTint, solid: contrast.amberDark },
    critical: { text: contrast.redDark, bg: contrast.redTint, solid: contrast.redDark },
  },
};

const highContrastDark: SemanticTokens = {
  primary: contrast.yellow,
  primaryHover: contrast.yellowLight,
  onPrimary: contrast.black,
  link: contrast.yellowLight,
  page: contrast.black,
  surface: contrast.black,
  surfaceRaised: contrast.grey900,
  surfaceSunken: contrast.grey800,
  text: contrast.white,
  textSecondary: contrast.grey200,
  borderSubtle: contrast.grey300,
  controlBorder: contrast.white,
  focusRing: contrast.yellow,
  sidebar: {
    bg: contrast.grey900,
    hoverBg: contrast.grey800,
    text: contrast.white,
    textActive: contrast.black,
    activeBg: contrast.yellow,
  },
  status: {
    success: { text: contrast.greenLight, bg: contrast.greenShade, solid: contrast.greenLight },
    warning: { text: contrast.amberLight, bg: contrast.amberShade, solid: contrast.amberLight },
    danger: { text: contrast.redLight, bg: contrast.redShade, solid: contrast.redLight },
    info: { text: contrast.blueLight, bg: contrast.blueShade, solid: contrast.blueLight },
  },
  risk: {
    low: { text: contrast.greenLight, bg: contrast.greenShade, solid: contrast.greenLight },
    medium: { text: contrast.blueLight, bg: contrast.blueShade, solid: contrast.blueLight },
    high: { text: contrast.amberLight, bg: contrast.amberShade, solid: contrast.amberLight },
    critical: { text: contrast.redLight, bg: contrast.redShade, solid: contrast.redLight },
  },
};

const TOKENS: Record<ThemeName, Record<ColorMode, SemanticTokens>> = {
  "saar-green": {
    light: brand(
      brandLight,
      {
        primary: green[600],
        primaryHover: green[700],
        onPrimary: neutral.white,
        link: green[700],
        focusRing: green[500],
      },
      {
        bg: neutral[950],
        hoverBg: neutral[925],
        text: night[200],
        textActive: neutral.white,
        activeBg: green[600],
      },
    ),
    dark: brand(
      brandDark,
      {
        primary: green[450],
        primaryHover: green[400],
        onPrimary: green[950],
        link: green[300],
        focusRing: green[400],
      },
      {
        bg: night[950],
        hoverBg: night[850],
        text: night[200],
        textActive: neutral.white,
        activeBg: green[900],
      },
    ),
  },
  blue: {
    light: brand(
      brandLight,
      {
        primary: blue[600],
        primaryHover: blue[700],
        onPrimary: neutral.white,
        link: blue[700],
        focusRing: blue[500],
      },
      {
        bg: blue.sidebar,
        hoverBg: blue.sidebarHover,
        text: night[200],
        textActive: neutral.white,
        activeBg: blue[600],
      },
    ),
    dark: brand(
      brandDark,
      {
        primary: blue[400],
        primaryHover: blue[300],
        onPrimary: blue[950],
        link: blue[300],
        focusRing: blue[300],
      },
      {
        bg: blue.sidebarNight,
        hoverBg: blue.sidebarNightHover,
        text: night[200],
        textActive: neutral.white,
        activeBg: blue[900],
      },
    ),
  },
  "high-contrast": { light: highContrastLight, dark: highContrastDark },
};

export function semanticTokens(theme: ThemeName, mode: ColorMode): SemanticTokens {
  return TOKENS[theme][mode];
}
