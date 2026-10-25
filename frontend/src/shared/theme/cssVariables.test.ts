import { cssVariables } from "./cssVariables";
import { semanticTokens } from "./semantic";

describe("cssVariables", () => {
  const tokens = semanticTokens("saar-green", "light");
  const variables = cssVariables(tokens);

  it("exposes top-level tokens in kebab case", () => {
    expect(variables["--grc-focus-ring"]).toBe(tokens.focusRing);
    expect(variables["--grc-surface-raised"]).toBe(tokens.surfaceRaised);
  });

  it("flattens nested tokens into one name per leaf", () => {
    expect(variables["--grc-sidebar-active-bg"]).toBe(tokens.sidebar.activeBg);
    expect(variables["--grc-risk-critical-solid"]).toBe(tokens.risk.critical.solid);
  });

  it("emits only colors, never objects", () => {
    expect(Object.values(variables).every((value) => value.startsWith("#"))).toBe(true);
  });
});
