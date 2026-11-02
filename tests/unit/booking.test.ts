import { describe, expect, it } from "vitest";
import { zonedTimeString } from "@/lib/dates";
import { BOOK_EXPERIENCE, BOOK_PAYMENT, BOOK_PROGRAMS, BOOK_SCHEDULE, BOOK_START, BOOK_VISA, programFromQuery } from "@/lib/booking-options";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { DEFAULT_HOURS, formatCallTime, generateSlots, isFree, parseHours, rankHosts, tzAbbr } from "@/modules/booking-slots";
import { leadFunding, leadProgram } from "@/modules/booking";

const NY = "America/New_York";
const rules = (now: string, over: Partial<Parameters<typeof generateSlots>[0]> = {}) =>
  generateSlots({ now: new Date(now), timeZone: NY, hours: DEFAULT_HOURS, durationMin: 30, minNoticeMin: 240, daysAhead: 14, ...over });
const local = (d: Date) => zonedTimeString(d, NY);

describe("generateSlots", () => {
  it("steps working hours by the call length and respects the minimum notice", () => {
    // Monday 2026-11-02 07:00 EST: 4 h notice → first slot 11:00, last 16:30.
    const today = rules("2026-11-02T12:00:00Z", { daysAhead: 1 });
    expect(today.map((s) => local(s.start))).toEqual(["11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"]);
    expect(today[0].start.toISOString()).toBe("2026-11-02T16:00:00.000Z");
    expect(today.every((s) => s.end.getTime() - s.start.getTime() === 30 * 60_000)).toBe(true);
  });

  it("allows a slot exactly at now + notice", () => {
    const s = rules("2026-11-02T10:00:00Z", { daysAhead: 1 }); // 05:00 EST + 4 h = 09:00
    expect(local(s[0].start)).toBe("09:00");
  });

  it("covers today plus the next 13 days: Mon–Fri 9–17, Sat 10–14, Sunday closed", () => {
    const s = rules("2026-11-02T12:00:00Z");
    // Today (12) + 9 more weekdays × 16 + 2 Saturdays × 8.
    expect(s).toHaveLength(12 + 9 * 16 + 2 * 8);
    const days = new Set(s.map((x) => new Intl.DateTimeFormat("en-CA", { timeZone: NY }).format(x.start)));
    expect(days.has("2026-11-08")).toBe(false); // Sunday
    expect(days.has("2026-11-16")).toBe(false); // day 15 is out of range
    const sat = s.filter((x) => new Intl.DateTimeFormat("en-CA", { timeZone: NY }).format(x.start) === "2026-11-07");
    expect(sat.map((x) => local(x.start))).toEqual(["10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30"]);
    expect(local(s[s.length - 1].start)).toBe("13:30");
  });

  it("keeps wall-clock hours across the fall-back DST change (Nov 1 2026)", () => {
    const s = rules("2026-10-30T12:00:00Z", { daysAhead: 4, minNoticeMin: 0 }); // Fri 08:00 EDT → Mon
    const fri = s.find((x) => x.start.toISOString().startsWith("2026-10-30"))!;
    const mon = s.find((x) => x.start.toISOString().startsWith("2026-11-02"))!;
    expect(fri.start.toISOString()).toBe("2026-10-30T13:00:00.000Z"); // 09:00 EDT
    expect(mon.start.toISOString()).toBe("2026-11-02T14:00:00.000Z"); // 09:00 EST
    expect(s.every((x) => /^(09|1[0-6]):(00|30)$/.test(local(x.start)))).toBe(true);
    expect(tzAbbr(fri.start, NY)).toBe("EDT");
    expect(tzAbbr(mon.start, NY)).toBe("EST");
  });

  it("skips wall-clock times that don't exist when clocks spring forward (Mar 14 2027)", () => {
    const hours = { ...parseHours({}), "0": [["01:00", "04:00"]] as [string, string][] };
    const s = rules("2027-03-14T05:00:00Z", { daysAhead: 1, minNoticeMin: 0, hours }); // midnight EST
    expect(s.map((x) => x.start.toISOString())).toEqual(["2027-03-14T06:00:00.000Z", "2027-03-14T06:30:00.000Z", "2027-03-14T07:00:00.000Z", "2027-03-14T07:30:00.000Z"]);
    expect(s.map((x) => local(x.start))).toEqual(["01:00", "01:30", "03:00", "03:30"]);
  });

  it("drops malformed stored hours instead of failing", () => {
    expect(parseHours({ "1": [["17:00", "09:00"], ["bad", "x"], ["09:00", "12:00"]], "9": [["09:00", "10:00"]] })).toEqual({ "0": [], "1": [["09:00", "12:00"]], "2": [], "3": [], "4": [], "5": [], "6": [] });
  });
});

describe("isFree", () => {
  const slot = { start: new Date("2026-11-03T15:30:00Z"), end: new Date("2026-11-03T16:00:00Z") };
  const busy = [{ start: new Date("2026-11-03T15:00:00Z"), end: new Date("2026-11-03T15:30:00Z") }];
  it("treats back-to-back as free, but not with a buffer", () => {
    expect(isFree(slot, busy, 0)).toBe(true);
    expect(isFree(slot, busy, 10)).toBe(false);
    expect(isFree({ start: new Date("2026-11-03T15:15:00Z"), end: new Date("2026-11-03T15:45:00Z") }, busy, 0)).toBe(false);
  });
});

describe("rankHosts", () => {
  it("prefers fewer upcoming calls, then least recently assigned (never first), then id", () => {
    expect(rankHosts([{ id: "b", upcoming: 2, lastAssignedAt: null }, { id: "a", upcoming: 1, lastAssignedAt: new Date(5) }])).toEqual(["a", "b"]);
    expect(rankHosts([{ id: "a", upcoming: 1, lastAssignedAt: new Date(10) }, { id: "b", upcoming: 1, lastAssignedAt: new Date(5) }])).toEqual(["b", "a"]);
    expect(rankHosts([{ id: "a", upcoming: 0, lastAssignedAt: new Date(1) }, { id: "b", upcoming: 0, lastAssignedAt: null }])).toEqual(["b", "a"]);
    expect(rankHosts([{ id: "b", upcoming: 0, lastAssignedAt: null }, { id: "a", upcoming: 0, lastAssignedAt: null }])).toEqual(["a", "b"]);
  });
});

describe("answer mapping", () => {
  it("maps program, 'not sure' by experience, and funding", () => {
    expect(leadProgram({ program: "instrument", experience: "none" })).toBe("INSTRUMENT");
    expect(leadProgram({ program: "not_sure", experience: "student" })).toBe("PRIVATE");
    expect(leadProgram({ program: "not_sure", experience: "private" })).toBe("INSTRUMENT");
    expect(leadProgram({ program: "not_sure", experience: "instrument" })).toBe("COMMERCIAL");
    expect(leadFunding("va")).toBe("VA");
    expect(leadFunding("sponsor")).toBe("EMPLOYER");
    expect(leadFunding("not_sure")).toBe("UNKNOWN");
    expect(programFromQuery("commercial")).toBe("commercial");
    expect(programFromQuery("PPL")).toBe("private");
    expect(programFromQuery("helicopter")).toBeNull();
  });

  it("formats call times with the zone abbreviation in both languages", () => {
    const at = new Date("2026-11-03T15:00:00Z");
    expect(formatCallTime(at, "en", NY)).toBe("Tuesday, November 3, 10:00 AM EST");
    expect(formatCallTime(at, "es", NY)).toMatch(/^martes, 3 de noviembre, 10:00\sa\.\s?m\. EST$/);
  });
});

describe("i18n", () => {
  const keys = (o: unknown, prefix = ""): string[] =>
    o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => keys(v, `${prefix}${k}.`)) : [prefix.slice(0, -1)];
  const get = (o: unknown, path: string) => path.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown>)?.[k], o);

  it("has the same keys in English and Spanish, none empty", () => {
    const enKeys = keys(en).sort();
    expect(keys(es).sort()).toEqual(enKeys);
    for (const k of enKeys.filter((k) => /^(book|booking|calendar|calls)\./.test(k))) {
      expect(String(get(en, k)).trim(), `en ${k}`).not.toBe("");
      expect(String(get(es, k)).trim(), `es ${k}`).not.toBe("");
    }
  });

  it("has a label for every answer choice and the new activity/source kinds", () => {
    for (const d of [en, es]) {
      const o = d.book.options;
      for (const [list, labels] of [
        [BOOK_PROGRAMS, o.program],
        [BOOK_EXPERIENCE, o.experience],
        [BOOK_START, o.start],
        [BOOK_SCHEDULE, o.schedule],
        [BOOK_PAYMENT, o.payment],
        [BOOK_VISA, o.visa],
      ] as const) {
        for (const v of list) expect((labels as Record<string, string>)[v]).toBeTruthy();
      }
      expect(d.activity.CALL_BOOKED && d.activity.CALL_CANCELED && d.integrations.kinds.BOOKING.title).toBeTruthy();
      for (const e of ["slotUnavailable", "hostNeedsCalendar", "bookingNeedsHost", "slugTaken", "slugInvalid", "calendarScopesMissing", "bookingSettingsInvalid", "callNotCancelable"]) {
        expect((d.errors as Record<string, string>)[e]).toBeTruthy();
      }
    }
  });
});
