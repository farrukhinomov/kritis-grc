import { contrastRatio, NON_TEXT_CONTRAST, TEXT_CONTRAST } from "./contrast";
import {
  COLOR_MODES,
  RISK_CATEGORIES,
  semanticTokens,
  type SemanticTokens,
  STATUS_TONES,
  THEME_NAMES,
} from "./semantic";

interface Pair {
  label: string;
  foreground: string;
  background: string;
  minimum: number;
}

const SURFACES = ["page", "surface", "surfaceRaised", "surfaceSunken"] as const;

function textPairs(tokens: SemanticTokens): Pair[] {
  const text = (label: string, foreground: string, background: string): Pair => ({
    label,
    foreground,
    background,
    minimum: TEXT_CONTRAST,
  });
  return [
    ...SURFACES.flatMap((surface) => [
      text(`text on ${surface}`, tokens.text, tokens[surface]),
      text(`textSecondary on ${surface}`, tokens.textSecondary, tokens[surface]),
    ]),
    text("link on page", tokens.link, tokens.page),
    text("link on surface", tokens.link, tokens.surface),
    text("onPrimary on primary", tokens.onPrimary, tokens.primary),
    text("onPrimary on primaryHover", tokens.onPrimary, tokens.primaryHover),
    text("sidebar text", tokens.sidebar.text, tokens.sidebar.bg),
    text("sidebar text on hover", tokens.sidebar.text, tokens.sidebar.hoverBg),
    text("sidebar active text", tokens.sidebar.textActive, tokens.sidebar.activeBg),
    ...STATUS_TONES.flatMap((tone) => [
      text(`status.${tone}.text on surface`, tokens.status[tone].text, tokens.surface),
      text(`text on status.${tone}.bg`, tokens.text, tokens.status[tone].bg),
    ]),
    ...RISK_CATEGORIES.map((category) =>
      text(`risk.${category}.text on its bg`, tokens.risk[category].text, tokens.risk[category].bg),
    ),
  ];
}

function nonTextPairs(tokens: SemanticTokens): Pair[] {
  const boundary = (label: string, foreground: string, background: string): Pair => ({
    label,
    foreground,
    background,
    minimum: NON_TEXT_CONTRAST,
  });
  return [
    boundary("controlBorder on surface", tokens.controlBorder, tokens.surface),
    boundary("primary on surface", tokens.primary, tokens.surface),
    boundary("focusRing on page", tokens.focusRing, tokens.page),
    boundary("focusRing on surface", tokens.focusRing, tokens.surface),
    boundary("focusRing on sidebar", tokens.focusRing, tokens.sidebar.bg),
    ...STATUS_TONES.map((tone) =>
      boundary(`status.${tone}.solid on surface`, tokens.status[tone].solid, tokens.surface),
    ),
    ...RISK_CATEGORIES.map((category) =>
      boundary(`risk.${category}.solid on surface`, tokens.risk[category].solid, tokens.surface),
    ),
  ];
}

const COMBINATIONS = THEME_NAMES.flatMap((theme) => COLOR_MODES.map((mode) => ({ theme, mode })));

describe.each(COMBINATIONS)("$theme in $mode mode", ({ theme, mode }) => {
  const tokens = semanticTokens(theme, mode);

  it.each(textPairs(tokens))("$label meets WCAG AA for text", (pair) => {
    expect(contrastRatio(pair.foreground, pair.background)).toBeGreaterThanOrEqual(pair.minimum);
  });

  it.each(nonTextPairs(tokens))("$label meets WCAG AA for non-text", (pair) => {
    expect(contrastRatio(pair.foreground, pair.background)).toBeGreaterThanOrEqual(pair.minimum);
  });
});

describe("semanticTokens", () => {
  it("gives dark mode its own values instead of reusing light ones", () => {
    for (const theme of THEME_NAMES) {
      expect(semanticTokens(theme, "dark").surface).not.toBe(
        semanticTokens(theme, "light").surface,
      );
    }
  });
});
