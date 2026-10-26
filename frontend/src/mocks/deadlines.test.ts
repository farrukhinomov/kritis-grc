import { deadlinesFor } from "./deadlines";

describe("deadlinesFor", () => {
  it("projects the duties from a planned Registration without making them binding", () => {
    expect(deadlinesFor({ status: "planned", date: "2027-01-15" }, "water")).toEqual([
      { citation: "§ 12", due_date: "2027-10-15", binding: false },
      { citation: "§ 13", due_date: "2027-11-15", binding: false },
      { citation: "§ 18", due_date: "2027-11-15", binding: false },
      { citation: "§ 20", due_date: "2027-11-15", binding: false },
    ]);
  });

  it("makes them binding once the Registration is confirmed", () => {
    const deadlines = deadlinesFor({ status: "confirmed", date: "2027-01-15" }, "water");

    expect(deadlines.every((deadline) => deadline.binding)).toBe(true);
  });

  it("leaves out risk analysis and measures where the sector is exempt", () => {
    for (const sector of ["finance", "it_telecom"] as const) {
      const citations = deadlinesFor({ status: "planned", date: "2027-01-15" }, sector).map(
        (deadline) => deadline.citation,
      );

      expect(citations).toEqual(["§ 18", "§ 20"]);
    }
  });
});
