import { overallStatus } from "./status";

const counts = (open: number, partial: number, implemented: number, not_applicable = 0) => ({
  open,
  partial,
  implemented,
  not_applicable,
});

describe("overallStatus", () => {
  it("is implemented only when everything that applies is", () => {
    expect(overallStatus(counts(0, 0, 3, 1))).toBe("implemented");
    expect(overallStatus(counts(1, 0, 3))).toBe("partial");
  });

  it("is open only when nothing has started", () => {
    expect(overallStatus(counts(2, 0, 0, 1))).toBe("open");
  });

  it("is partial in between", () => {
    expect(overallStatus(counts(1, 1, 0))).toBe("partial");
  });

  it("is not applicable when nothing applies", () => {
    expect(overallStatus(counts(0, 0, 0, 2))).toBe("not_applicable");
  });
});
