/**
 * Primitive palettes: the only place raw color values live. Nothing outside the theme
 * folder reads these; components use the semantic tokens built from them.
 *
 * Saar Green starts from sampled reference colors. Shades that carry text were darkened
 * (light mode) or lightened (dark mode) until they pass WCAG AA, so they deviate slightly
 * from the samples on purpose.
 */

export const neutral = {
  white: "#FFFFFF",
  50: "#F7F7F8",
  100: "#F2F2F2",
  150: "#EBEBEC",
  200: "#DFE4E8",
  400: "#83899A",
  600: "#545A69",
  800: "#2A2E3D",
  900: "#1B1D2A",
  925: "#16182E",
  950: "#07081D",
} as const;

/** Night neutrals: blue-tinted to sit well next to the navy sidebar. */
export const night = {
  950: "#05060F",
  900: "#0D0F1E",
  850: "#14172A",
  800: "#1B1F35",
  750: "#22273F",
  700: "#2C3149",
  500: "#6A7190",
  300: "#B0B5C7",
  200: "#C9CCD8",
  100: "#E8EAF0",
} as const;

export const green = {
  100: "#DDF1EA",
  300: "#7FD3B5",
  400: "#66BCA0",
  450: "#4FB896",
  500: "#3A8B71",
  600: "#2E7360",
  700: "#245E4C",
  800: "#17614A",
  900: "#123A2E",
  950: "#06130E",
} as const;

export const blue = {
  100: "#DDE6EB",
  200: "#C6DAF7",
  300: "#8DB8F5",
  400: "#6EA3F0",
  500: "#2F6FD6",
  600: "#1F5FBF",
  700: "#184C99",
  800: "#1D5B85",
  900: "#1C3A66",
  950: "#071226",
  sidebar: "#0B1B33",
  sidebarHover: "#13294A",
  sidebarNight: "#060D1C",
  sidebarNightHover: "#0D1A30",
} as const;

export const amber = {
  100: "#FFF1DF",
  200: "#FEE8D2",
  400: "#FFB877",
  500: "#F89838",
  600: "#C46A00",
  700: "#B85A06",
  800: "#8A4300",
  900: "#4A2A0C",
} as const;

export const red = {
  100: "#FDE8E7",
  200: "#FFE1E1",
  400: "#FF9C9C",
  500: "#FB6262",
  600: "#D63B3B",
  700: "#B42318",
  800: "#A11D1D",
  900: "#4D1A1C",
} as const;

export const lime = {
  200: "#E6F2DE",
  400: "#B5D99A",
  500: "#8EBE74",
  600: "#5E8F3E",
  800: "#3E6526",
  900: "#26361A",
} as const;

export const contrast = {
  black: "#000000",
  white: "#FFFFFF",
  grey900: "#141414",
  grey800: "#1F1F1F",
  grey700: "#333333",
  grey500: "#595959",
  grey300: "#A3A3A3",
  grey200: "#D6D6D6",
  grey100: "#F0F0F0",
  navy: "#0A3D91",
  yellow: "#FFD400",
  yellowLight: "#FFE45C",
  orange: "#C2410C",
  greenDark: "#006B3C",
  greenLight: "#5CE6A1",
  redDark: "#A30000",
  redLight: "#FF8A80",
  amberDark: "#7A3E00",
  amberLight: "#FFC266",
  blueDark: "#003F87",
  blueLight: "#8CC4FF",
  greenTint: "#E6F5EC",
  redTint: "#FCE8E8",
  amberTint: "#FFF2DD",
  blueTint: "#E5EEFA",
  greenShade: "#002E1A",
  redShade: "#3A0000",
  amberShade: "#3A2000",
  blueShade: "#001A3D",
} as const;
