/**
 * Time-zone helpers. Timestamps are stored in UTC; "today", "overdue" and date inputs are
 * interpreted in the school's IANA time zone.
 */

/** Offset (ms) of `tz` from UTC at the instant `at`. */
function tzOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Convert a wall-clock time in `tz` ("2026-10-19", "14:30") to a UTC Date. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes handle the hour around a DST change.
  let utc = guess - tzOffsetMs(new Date(guess), tz);
  utc = guess - tzOffsetMs(new Date(utc), tz);
  return new Date(utc);
}

/** "YYYY-MM-DD" of `at` in `tz`. */
export function zonedDateString(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** "HH:mm" of `at` in `tz`. */
export function zonedTimeString(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** UTC bounds of the school's current day: [start, end). */
export function todayBounds(now: Date, tz: string) {
  const today = zonedDateString(now, tz);
  return { start: zonedToUtc(today, "00:00", tz), end: zonedToUtc(addDays(today, 1), "00:00", tz), today };
}

/** UTC start of the day `days` from today in `tz` (negative for the past). */
export function startOfDayOffset(now: Date, tz: string, days: number) {
  return zonedToUtc(addDays(zonedDateString(now, tz), days), "00:00", tz);
}
