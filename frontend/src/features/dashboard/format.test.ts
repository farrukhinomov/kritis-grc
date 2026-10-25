import { daysUntil, formatDate, formatRelative, implementedPercent } from "./format";

const now = new Date(2026, 9, 25, 18, 30);

describe("daysUntil", () => {
  it("counts calendar days, whatever the time of day", () => {
    expect(daysUntil("2026-10-25", now)).toBe(0);
    expect(daysUntil("2026-10-26", now)).toBe(1);
    expect(daysUntil("2027-10-15", now)).toBe(355);
  });

  it("is negative once a deadline has passed", () => {
    expect(daysUntil("2026-10-20", now)).toBe(-5);
  });
});

describe("implementedPercent", () => {
  it("rounds to whole percent", () => {
    expect(implementedPercent(3, 15)).toBe(20);
    expect(implementedPercent(1, 3)).toBe(33);
  });

  it("is 0 when nothing applies", () => {
    expect(implementedPercent(0, 0)).toBe(0);
  });
});

describe("formatting", () => {
  it("keeps the calendar day of a plain date", () => {
    expect(formatDate("2027-10-15", "de")).toBe("15.10.2027");
  });

  it("says how long ago something happened", () => {
    expect(formatRelative("2026-10-25T15:30:00", "de", now)).toBe("vor 3 Stunden");
    expect(formatRelative("2026-10-24T18:30:00", "de", now)).toBe("gestern");
    expect(formatRelative("2026-10-25T18:30:20", "en", now)).toBe("this minute");
  });
});
