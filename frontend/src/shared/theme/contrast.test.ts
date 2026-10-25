import { contrastRatio, relativeLuminance } from "./contrast";

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#FFFFFF")).toBe(1);
  });

  it("accepts the three-digit shorthand", () => {
    expect(relativeLuminance("#fff")).toBe(1);
  });

  it("rejects anything that isn't an opaque hex color", () => {
    expect(() => relativeLuminance("red")).toThrow(/hex color/);
    expect(() => relativeLuminance("#3A8B7180")).toThrow(/hex color/);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white, in either order", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
  });

  it("is 1 for identical colors", () => {
    expect(contrastRatio("#3A8B71", "#3A8B71")).toBe(1);
  });

  it("matches the WCAG reference value for a mid grey on white", () => {
    // #767676 is the lightest grey that still passes AA on white (4.54:1).
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2);
  });
});
