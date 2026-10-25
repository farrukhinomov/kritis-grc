import type { Risk } from "@/shared/api/types";

import { byResidualScore } from "./handlers/risk";

const risk = (id: string, inherent: number, residual: number | null) =>
  ({
    id,
    inherent: { score: inherent },
    residual: residual === null ? null : { score: residual },
  }) as unknown as Risk;

describe("ordering by Residual Rating", () => {
  it("puts unrated risks after every rated one, even a low one, by inherent score", () => {
    const sorted = [
      risk("unrated-low", 4, null),
      risk("rated-low", 9, 1),
      risk("unrated-high", 16, null),
      risk("rated-high", 12, 9),
    ].toSorted(byResidualScore);

    expect(sorted.map(({ id }) => id)).toEqual([
      "rated-high",
      "rated-low",
      "unrated-high",
      "unrated-low",
    ]);
  });

  it("breaks ties by inherent score", () => {
    const sorted = [risk("a", 6, 4), risk("b", 12, 4)].toSorted(byResidualScore);

    expect(sorted.map(({ id }) => id)).toEqual(["b", "a"]);
  });
});
