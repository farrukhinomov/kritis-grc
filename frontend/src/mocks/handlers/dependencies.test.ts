import type { Rating, Risk } from "@/shared/api/types";

import { highestResidual } from "./dependencies";

const rated = (score: number, category: Rating["category"]) =>
  ({ residual: { likelihood: 1, impact: score, score, category } }) as unknown as Risk;
const pending = { residual: null } as unknown as Risk;

describe("the highest Residual Rating of an Asset's Risks", () => {
  it("is the highest one", () => {
    expect(highestResidual([rated(3, "low"), rated(9, "critical")])?.category).toBe("critical");
  });

  it("is unknown while any of them is still being calculated, never low", () => {
    expect(highestResidual([rated(2, "low"), pending])).toBeNull();
  });

  it("is unknown without Risks", () => {
    expect(highestResidual([])).toBeNull();
  });
});
