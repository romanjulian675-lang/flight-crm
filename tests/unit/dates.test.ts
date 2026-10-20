import { describe, expect, it } from "vitest";
import { todayBounds, zonedDateString, zonedTimeString, zonedToUtc } from "@/lib/dates";
import { normalizePhone } from "@/modules/leads";

describe("zoned dates", () => {
  it("converts wall-clock time in the school's zone, across DST", () => {
    expect(zonedToUtc("2026-07-01", "09:00", "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedToUtc("2026-12-01", "09:00", "America/New_York").toISOString()).toBe("2026-12-01T14:00:00.000Z");
    // DST ends 2026-11-01 at 02:00 EDT
    expect(zonedToUtc("2026-11-01", "12:00", "America/New_York").toISOString()).toBe("2026-11-01T17:00:00.000Z");
    expect(zonedToUtc("2026-10-19", "09:00", "Asia/Seoul").toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });

  it("round-trips", () => {
    const at = zonedToUtc("2026-03-08", "15:45", "America/Chicago");
    expect(zonedDateString(at, "America/Chicago")).toBe("2026-03-08");
    expect(zonedTimeString(at, "America/Chicago")).toBe("15:45");
  });

  it("gives the school's day, not the server's", () => {
    // 02:00 UTC on the 20th is still the 19th in New York
    const { today, start, end } = todayBounds(new Date("2026-10-20T02:00:00Z"), "America/New_York");
    expect(today).toBe("2026-10-19");
    expect(start.toISOString()).toBe("2026-10-19T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-20T04:00:00.000Z");
  });
});

describe("normalizePhone", () => {
  it("keeps digits and assumes +1 for 10 digits", () => {
    expect(normalizePhone("(407) 555-0123")).toBe("14075550123");
    expect(normalizePhone("+1 407 555 0123")).toBe("14075550123");
    expect(normalizePhone("+57 300 123 4567")).toBe("573001234567");
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});
