import { theme } from "antd";

import { antdTheme } from "./antdTheme";
import { semanticTokens } from "./semantic";

const DESKTOP = { coarsePointer: false, reducedMotion: false };
const MIN_TAP_TARGET = 44;

describe("antdTheme", () => {
  it("maps the semantic tokens of the chosen Theme and mode", () => {
    const tokens = semanticTokens("blue", "dark");

    const config = antdTheme("blue", "dark", DESKTOP);

    expect(config.token).toMatchObject({
      colorPrimary: tokens.primary,
      colorText: tokens.text,
      colorBgContainer: tokens.surface,
      colorBgLayout: tokens.page,
      colorBorder: tokens.controlBorder,
      colorErrorText: tokens.status.danger.text,
    });
    expect(config.components?.Layout?.headerBg).toBe(tokens.surface);
  });

  it("starts dark mode from antd's dark algorithm and light mode from the default one", () => {
    expect(antdTheme("saar-green", "dark", DESKTOP).algorithm).toBe(theme.darkAlgorithm);
    expect(antdTheme("saar-green", "light", DESKTOP).algorithm).toBe(theme.defaultAlgorithm);
  });

  it("makes every control size at least 44 px tall on touch screens", () => {
    const { token } = antdTheme("saar-green", "light", { ...DESKTOP, coarsePointer: true });

    expect(token?.controlHeightSM).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
    expect(token?.controlHeight).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
    expect(token?.controlHeightLG).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
  });

  it("keeps antd's denser controls for mouse users", () => {
    expect(antdTheme("saar-green", "light", DESKTOP).token?.controlHeight).toBeUndefined();
  });

  it("switches antd's own animations off when the user asks for reduced motion", () => {
    const config = antdTheme("saar-green", "light", { ...DESKTOP, reducedMotion: true });

    expect(config.token?.motion).toBe(false);
  });
});
