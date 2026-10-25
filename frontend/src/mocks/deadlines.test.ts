import { deadlinesFor } from "./deadlines";

describe("deadlinesFor", () => {
  it("projects the duties from a planned Registration without making them binding", () => {
    expect(deadlinesFor({ status: "planned", date: "2027-01-15" })).toEqual([
      { citation: "§ 12", due_date: "2027-10-15", binding: false },
      { citation: "§ 13", due_date: "2027-11-15", binding: false },
      { citation: "§ 18", due_date: "2027-11-15", binding: false },
      { citation: "§ 20", due_date: "2027-11-15", binding: false },
    ]);
  });

  it("makes them binding once the Registration is confirmed", () => {
    const deadlines = deadlinesFor({ status: "confirmed", date: "2027-01-15" });

    expect(deadlines.every((deadline) => deadline.binding)).toBe(true);
  });
});
