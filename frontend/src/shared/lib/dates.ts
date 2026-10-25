/** Calendar months on a plain date; the month end is kept (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(isoDate: string, months: number): string {
  const [year = 0, month = 1, day = 1] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * Today as a plain date in the user's own calendar. Taken from the local clock, not from
 * UTC, which would still say yesterday shortly after midnight in Germany.
 */
export function localToday(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
