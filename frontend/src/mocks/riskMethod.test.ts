import type { ImplementationStatus, Treatment } from "@/shared/api/types";

import { assess, categorize, METHOD_VERSION } from "./riskMethod";

// The same cases as the risk engine's own tests, so the mock can't drift from it.

const statuses = (map: Record<string, ImplementationStatus>) => (id: string) => map[id] ?? "open";
const treat = (id: string, dimension: Treatment["dimension"], levels: number): Treatment => ({
  implementation_id: id,
  dimension,
  levels,
});

describe("assess", () => {
  it("leaves the inherent rating unchanged without Treatments", () => {
    expect(assess({ likelihood: 3, impact: 4 }, [], statuses({}))).toMatchObject({
      likelihood: 3,
      impact: 4,
      score: 12,
      category: "critical",
    });
  });

  it("lowers a dimension by the full levels of an implemented Treatment", () => {
    const residual = assess(
      { likelihood: 3, impact: 4 },
      [treat("a", "impact", 2)],
      statuses({ a: "implemented" }),
    );

    expect(residual).toMatchObject({ likelihood: 3, impact: 2, score: 6, category: "high" });
  });

  it("counts a partial Implementation at half effect, rounded down", () => {
    const residual = (levels: number) =>
      assess(
        { likelihood: 4, impact: 4 },
        [treat("a", "likelihood", levels)],
        statuses({ a: "partial" }),
      ).likelihood;

    expect(residual(2)).toBe(3);
    expect(residual(1)).toBe(4);
    expect(residual(3)).toBe(3);
  });

  it.each(["open", "not_applicable"] as const)("ignores %s Implementations", (status) => {
    expect(
      assess({ likelihood: 2, impact: 3 }, [treat("a", "impact", 2)], statuses({ a: status })),
    ).toMatchObject({ likelihood: 2, impact: 3 });
  });

  it("adds up effects on the same dimension", () => {
    const residual = assess(
      { likelihood: 4, impact: 2 },
      [treat("a", "likelihood", 1), treat("b", "likelihood", 2)],
      statuses({ a: "implemented", b: "implemented" }),
    );

    expect(residual.likelihood).toBe(1);
  });

  it("never drops below the lowest level", () => {
    const residual = assess(
      { likelihood: 2, impact: 2 },
      [treat("a", "impact", 3)],
      statuses({ a: "implemented" }),
    );

    expect(residual.impact).toBe(1);
  });

  it("explains every Treatment with the levels actually applied", () => {
    const residual = assess(
      { likelihood: 2, impact: 2 },
      [treat("a", "impact", 3), treat("b", "likelihood", 2)],
      statuses({ a: "implemented", b: "partial" }),
    );

    expect(residual.explanation).toEqual([
      { implementation_id: "a", dimension: "impact", status: "implemented", levels_applied: 3 },
      { implementation_id: "b", dimension: "likelihood", status: "partial", levels_applied: 1 },
    ]);
    expect(residual.method_version).toBe(METHOD_VERSION);
  });
});

describe("categorize", () => {
  it.each([
    [1, "low"],
    [2, "low"],
    [3, "medium"],
    [4, "medium"],
    [6, "high"],
    [8, "high"],
    [9, "critical"],
    [16, "critical"],
  ] as const)("puts score %i in %s", (score, category) => {
    expect(categorize(score)).toBe(category);
  });
});
