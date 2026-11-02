import { zonedTimeString, zonedToUtc } from "@/lib/dates";

/**
 * Pure scheduling math for the booking page (no database, no network): which start times exist,
 * which hosts are free for one, and who gets the call. Unit-tested, including DST changes.
 */

/** { "0".."6" (Sunday..Saturday, like Date#getDay): [["09:00","17:00"], …] } in the page's zone. */
export type WeeklyHours = Record<string, [string, string][]>;

export const DEFAULT_HOURS: WeeklyHours = {
  "0": [],
  "1": [["09:00", "17:00"]],
  "2": [["09:00", "17:00"]],
  "3": [["09:00", "17:00"]],
  "4": [["09:00", "17:00"]],
  "5": [["09:00", "17:00"]],
  "6": [["10:00", "14:00"]],
};

export type Interval = { start: Date; end: Date };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Read stored hours defensively (bad entries are dropped, not fatal). */
export function parseHours(raw: unknown): WeeklyHours {
  const out: WeeklyHours = {};
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  for (let d = 0; d < 7; d++) {
    const list = Array.isArray(obj[String(d)]) ? (obj[String(d)] as unknown[]) : [];
    out[String(d)] = list
      .filter((r): r is [string, string] => Array.isArray(r) && r.length === 2 && TIME.test(String(r[0])) && TIME.test(String(r[1])))
      .filter(([a, b]) => minutes(a) < minutes(b));
  }
  return out;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

export type SlotRules = {
  now: Date;
  timeZone: string;
  hours: WeeklyHours;
  durationMin: number;
  minNoticeMin: number;
  daysAhead: number;
};

/**
 * Candidate start times: each working-hours window stepped by the call length, for today and the next
 * `daysAhead - 1` days (in the page's zone), no earlier than now + minimum notice. Wall-clock times
 * that don't exist (spring-forward gap) are skipped.
 */
export function generateSlots(r: SlotRules): Interval[] {
  const out: Interval[] = [];
  const earliest = r.now.getTime() + r.minNoticeMin * 60_000;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: r.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(r.now);
  const step = Math.max(5, r.durationMin);
  for (let i = 0; i < r.daysAhead; i++) {
    const date = addDays(today, i);
    for (const [from, to] of r.hours[String(weekday(date))] ?? []) {
      for (let m = minutes(from); m + r.durationMin <= minutes(to); m += step) {
        const start = zonedToUtc(date, hhmm(m), r.timeZone);
        if (zonedTimeString(start, r.timeZone) !== hhmm(m)) continue; // DST gap
        if (start.getTime() < earliest) continue;
        out.push({ start, end: new Date(start.getTime() + r.durationMin * 60_000) });
      }
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export const overlaps = (a: Interval, b: Interval) => a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();

/** Is the host free for `slot`, keeping `bufferMin` clear before and after? */
export function isFree(slot: Interval, busy: Interval[], bufferMin: number) {
  const padded = { start: new Date(slot.start.getTime() - bufferMin * 60_000), end: new Date(slot.end.getTime() + bufferMin * 60_000) };
  return !busy.some((b) => overlaps(padded, b));
}

export type HostLoad = { id: string; upcoming: number; lastAssignedAt: Date | null };

/**
 * Round-robin order among the hosts free for a slot: fewest upcoming calls first, then whoever was
 * given a call least recently (never = first), then id so the result is deterministic.
 */
export function rankHosts(hosts: HostLoad[]): string[] {
  return [...hosts]
    .sort(
      (a, b) =>
        a.upcoming - b.upcoming ||
        (a.lastAssignedAt?.getTime() ?? -Infinity) - (b.lastAssignedAt?.getTime() ?? -Infinity) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .map((h) => h.id);
}

/** "EST" / "EDT" (English abbreviations read best in both languages). */
export function tzAbbr(at: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}

const intlLocale = (locale: string) => (locale === "es" ? "es-US" : "en-US");

/** "9:30 AM" in the page's zone. */
export function formatTime(at: Date, locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone, hour: "numeric", minute: "2-digit" }).format(at);
}

/** "Tue, Nov 4" in the page's zone. */
export function formatDay(at: Date, locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone, weekday: "short", month: "short", day: "numeric" }).format(at);
}

/** "Tuesday, November 4, 9:30 AM EST". */
export function formatCallTime(at: Date, locale: string, timeZone: string) {
  const day = new Intl.DateTimeFormat(intlLocale(locale), { timeZone, weekday: "long", month: "long", day: "numeric" }).format(at);
  return `${day}, ${formatTime(at, locale, timeZone)} ${tzAbbr(at, timeZone)}`;
}
