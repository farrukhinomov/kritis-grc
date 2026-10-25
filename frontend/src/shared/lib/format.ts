const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole calendar days from today to a plain date: 0 is today, negative is overdue.
 * Deadlines are dates without a time, so both sides are compared as UTC midnights.
 */
export function daysUntil(isoDate: string, now: Date = new Date()): number {
  const [year = 0, month = 1, day = 1] = isoDate.split("-").map(Number);
  const due = Date.UTC(year, month - 1, day);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due - today) / DAY_MS);
}

/**
 * Share of the applicable Implementations that are fully implemented, in whole percent.
 * Rounded down: 199 of 200 must never read as 100 %.
 */
export function implementedPercent(implemented: number, applicable: number): number {
  return applicable === 0 ? 0 : Math.floor((implemented / applicable) * 100);
}

export function formatDate(isoDate: string, language: string): string {
  // Midday UTC keeps the calendar day the same in every time zone.
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${isoDate.slice(0, 10)}T12:00:00Z`),
  );
}

/** "vor 3 Stunden": the largest unit that keeps the number readable. */
export function formatRelative(isoDateTime: string, language: string, now: Date = new Date()) {
  const seconds = Math.round((new Date(isoDateTime).getTime() - now.getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return format.format(Math.round(seconds / size), unit);
    }
  }
  return format.format(0, "minute");
}

/** A moment with date and time, in the user's locale and time zone. */
export function formatDateTime(isoDateTime: string, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(isoDateTime),
  );
}
