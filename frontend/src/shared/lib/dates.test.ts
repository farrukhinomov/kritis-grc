import { addMonths, localToday } from "./dates";

describe("addMonths", () => {
  it.each([
    ["2027-01-15", 9, "2027-10-15"],
    ["2027-03-01", 10, "2028-01-01"],
    ["2027-01-31", 1, "2027-02-28"],
    ["2028-01-31", 1, "2028-02-29"],
    ["2026-11-30", 3, "2027-02-28"],
  ])("%s plus %i months is %s", (date, months, expected) => {
    expect(addMonths(date, months)).toBe(expected);
  });
});

describe("localToday", () => {
  it("is the local calendar day, also just after midnight", () => {
    expect(localToday(new Date(2026, 9, 26, 0, 30))).toBe("2026-10-26");
    expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
