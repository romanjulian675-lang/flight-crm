import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { makeSchool, prisma, resetDb } from "../helpers";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import type { AccessContext } from "@/modules/access";
import {
  availableSlots,
  bookCall,
  cancelBooking,
  cancelBookingAsVisitor,
  cancelToken,
  createBookingPage,
  listLeadBookings,
  publicAvailability,
  SlotTakenError,
  updateBookingPage,
  type BookingInput,
} from "@/modules/booking";
import { DEFAULT_HOURS, type Interval } from "@/modules/booking-slots";
import { connectGoogleCalendar, googleAuthUrl, googleProvider, type CalendarProvider, type Fetch, type NewEvent } from "@/modules/google-calendar";
import { createIntegration } from "@/modules/integrations";
import { ingest } from "@/modules/intake";
import { getLead } from "@/modules/leads";
import { POST as bookPOST } from "@/app/api/book/[slug]/route";

// Monday 2026-11-02 07:00 EST. SLOT = Tuesday 10:00 EST.
const NOW = new Date("2026-11-02T12:00:00Z");
const SLOT = new Date("2026-11-03T15:00:00Z");
const at = (iso: string) => new Date(iso);

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.BETTER_AUTH_SECRET ||= "test-secret-for-cancel-links-0123456789";
  process.env.GOOGLE_CLIENT_ID = "client-123.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "client-secret";
});
beforeEach(resetDb);
afterEach(() => {
  delete process.env.CALENDAR_FAKE;
});

const answers = (over: Partial<BookingInput> = {}): BookingInput => ({
  program: "private",
  experience: "discovery",
  hours: 1,
  start: "1_3_months",
  schedule: "full_time",
  payment: "va",
  location: "Bogotá, Colombia",
  visa: "yes",
  firstName: "Ana",
  lastName: "Pérez",
  email: "ana@example.com",
  phone: "(772) 555-0100",
  startAt: SLOT.toISOString(),
  language: "en",
  ...over,
});

async function connect(m: AccessContext, email: string, expires = new Date("2030-01-01")) {
  return prisma.calendarConnection.create({
    data: { orgId: m.orgId, membershipId: m.membershipId, email, refreshTokenEnc: encryptSecret(`refresh-${email}`), accessTokenEnc: encryptSecret(`access-${email}`), accessTokenExpiresAt: expires },
  });
}

/** School with two hosts (the agents) on a live page using the default hours. */
async function setup() {
  const s = await makeSchool();
  await connect(s.agent, "julian@school.test");
  await connect(s.agent2, "juan@school.test");
  const created = await createBookingPage(prisma, s.owner);
  await updateBookingPage(prisma, s.owner, created.id, {
    title: created.title,
    slug: "test-school",
    durationMin: 30,
    bufferMin: 0,
    minNoticeMin: 240,
    daysAhead: 14,
    timeZone: "America/New_York",
    hours: DEFAULT_HOURS,
    hostIds: [s.agent.membershipId, s.agent2.membershipId],
    enabled: true,
  });
  const page = await prisma.bookingPage.findUniqueOrThrow({ where: { id: created.id } });
  return { s, page };
}

/** Calendar double: busy times per membership id, records inserts/deletes. */
function mockCalendar(busy: Record<string, Interval[]> = {}) {
  const inserted: (NewEvent & { host: string })[] = [];
  const deleted: string[] = [];
  const provider: CalendarProvider = {
    async freeBusy(conn) {
      return busy[conn.membershipId] ?? [];
    },
    async insertEvent(conn, ev) {
      inserted.push({ ...ev, host: conn.membershipId });
      return { id: `ev-${inserted.length}`, meetLink: `https://meet.google.com/abc-defg-hi${inserted.length}` };
    },
    async deleteEvent(_conn, id) {
      deleted.push(id);
    },
  };
  return { provider, inserted, deleted, busy };
}

type Call = { url: string; method: string; body: string; auth: string | null };
/** Fake Google REST endpoints. */
function googleFetch(handler: (c: Call) => { status?: number; json?: unknown } | undefined) {
  const calls: Call[] = [];
  const f: Fetch = async (input, init) => {
    const c = { url: String(input), method: init?.method ?? "GET", body: String(init?.body ?? ""), auth: new Headers(init?.headers).get("authorization") };
    calls.push(c);
    const r = handler(c) ?? { status: 404, json: { error: { message: "unexpected call" } } };
    return new Response(r.status === 204 ? null : JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  };
  return { f, calls };
}

const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.y`;
const SCOPES = "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy";

describe("Google Calendar connection", () => {
  it("builds an offline-access consent URL with the calendar scopes", () => {
    const u = new URL(googleAuthUrl("state123", "a@b.c"));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("redirect_uri")).toMatch(/\/api\/integrations\/google\/callback$/);
    expect(u.searchParams.get("scope")!.split(" ")).toEqual(expect.arrayContaining(["openid", "email", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.freebusy"]));
  });

  it("exchanges the code and stores the tokens encrypted with the account email", async () => {
    const s = await makeSchool();
    const { f, calls } = googleFetch((c) =>
      c.url === "https://oauth2.googleapis.com/token" ? { json: { access_token: "ya29.abc", refresh_token: "1//refresh", expires_in: 3599, scope: SCOPES, id_token: idToken("Julian.Torres@school.test") } } : undefined,
    );
    await connectGoogleCalendar(prisma, s.agent, "auth-code", f, NOW);
    expect(new URLSearchParams(calls[0].body).get("grant_type")).toBe("authorization_code");
    const conn = await prisma.calendarConnection.findUniqueOrThrow({ where: { membershipId: s.agent.membershipId } });
    expect(conn.email).toBe("julian.torres@school.test");
    expect(conn.refreshTokenEnc).not.toContain("1//refresh");
    expect(decryptSecret(conn.refreshTokenEnc)).toBe("1//refresh");
    expect(conn.status).toBe("ACTIVE");
  });

  it("refuses a grant without calendar access", async () => {
    const s = await makeSchool();
    const { f } = googleFetch(() => ({ json: { access_token: "a", refresh_token: "r", scope: "openid email", id_token: idToken("x@y.z") } }));
    await expect(connectGoogleCalendar(prisma, s.agent, "code", f)).rejects.toThrow("calendarScopesMissing");
    expect(await prisma.calendarConnection.count()).toBe(0);
  });

  it("a failed token refresh marks the calendar broken and drops that host from the slots", async () => {
    const { s, page } = await setup();
    await prisma.calendarConnection.update({ where: { membershipId: s.agent.membershipId }, data: { accessTokenExpiresAt: at("2026-01-01T00:00:00Z") } });
    const { f, calls } = googleFetch((c) => {
      if (c.url === "https://oauth2.googleapis.com/token") return { status: 400, json: { error: "invalid_grant", error_description: "Token has been expired or revoked." } };
      if (c.url.endsWith("/freeBusy")) {
        expect(c.auth).toBe("Bearer access-juan@school.test");
        // Juan is busy Tuesday 10:00–11:00.
        return { json: { calendars: { primary: { busy: [{ start: "2026-11-03T15:00:00Z", end: "2026-11-03T16:00:00Z" }] } } } };
      }
    });
    const slots = await availableSlots(prisma, page, googleProvider(prisma, f), NOW);
    const iso = slots.map((x) => x.start.toISOString());
    expect(iso).not.toContain(SLOT.toISOString());
    expect(iso).toContain("2026-11-03T16:00:00.000Z");
    expect(JSON.parse(calls.find((c) => c.url.endsWith("/freeBusy"))!.body).items).toEqual([{ id: "primary" }]);
    const julian = await prisma.calendarConnection.findUniqueOrThrow({ where: { membershipId: s.agent.membershipId } });
    expect(julian.status).toBe("BROKEN");
    expect(julian.lastError).toMatch(/invalid_grant|revoked/);
  });
});

describe("availability", () => {
  it("offers a time when at least one host is free, and never says who", async () => {
    const { s, page } = await setup();
    const one = mockCalendar({ [s.agent.membershipId]: [{ start: SLOT, end: at("2026-11-03T15:30:00Z") }] });
    expect((await availableSlots(prisma, page, one.provider, NOW)).map((x) => x.start.getTime())).toContain(SLOT.getTime());

    const both = mockCalendar({
      [s.agent.membershipId]: [{ start: SLOT, end: at("2026-11-03T15:30:00Z") }],
      [s.agent2.membershipId]: [{ start: at("2026-11-03T14:45:00Z"), end: at("2026-11-03T15:15:00Z") }],
    });
    const slots = await availableSlots(prisma, page, both.provider, NOW);
    expect(slots.map((x) => x.start.getTime())).not.toContain(SLOT.getTime());
    expect(slots[0].start.toISOString()).toBe("2026-11-02T16:00:00.000Z"); // today 11:00 EST (4 h notice)

    const pub = await publicAvailability(prisma, page, one.provider, "es", NOW);
    const text = JSON.stringify(pub);
    for (const id of [s.agent.membershipId, s.agent2.membershipId]) expect(text).not.toContain(id);
    expect(pub.days[0]).toMatchObject({ date: "2026-11-02", abbr: "EST" });
    expect(pub.days[0].label).toMatch(/lun/i);
  });

  it("counts calls already booked in the CRM, with the break between calls", async () => {
    const { s, page } = await setup();
    const cal = mockCalendar();
    await prisma.bookingPage.update({ where: { id: page.id }, data: { hostIds: [s.agent.membershipId], bufferMin: 15 } });
    const p = await prisma.bookingPage.findUniqueOrThrow({ where: { id: page.id } });
    await bookCall(prisma, "test-school", answers(), { provider: cal.provider, now: NOW });
    const iso = (await availableSlots(prisma, p, cal.provider, NOW)).map((x) => x.start.toISOString());
    expect(iso).not.toContain("2026-11-03T14:30:00.000Z"); // ends 10:00, needs 15 min break
    expect(iso).not.toContain(SLOT.toISOString());
    expect(iso).not.toContain("2026-11-03T15:30:00.000Z");
    expect(iso).toContain("2026-11-03T16:00:00.000Z");
  });
});

describe("bookCall", () => {
  it("creates the lead for the host, the Meet event via the Calendar API, the timeline entry, task and intake event", async () => {
    const { s } = await setup();
    const { f, calls } = googleFetch((c) => {
      if (c.url.endsWith("/freeBusy")) return { json: { calendars: { primary: { busy: [] } } } };
      if (c.url.includes("/calendars/primary/events")) return { json: { id: "gev123", hangoutLink: "https://meet.google.com/xyz-abcd-efg" } };
    });
    await prisma.bookingPage.updateMany({ data: { hostIds: [s.agent2.membershipId] } });
    const res = await bookCall(prisma, "test-school", answers(), { provider: googleProvider(prisma, f), now: NOW });
    expect(res).toMatchObject({ startAt: SLOT.toISOString(), hostFirstName: s.agent2.name.split(" ")[0], meetLink: "https://meet.google.com/xyz-abcd-efg" });
    expect(res.cancelToken).toBe(cancelToken(res.bookingId));

    const insert = calls.find((c) => c.method === "POST" && c.url.includes("/calendars/primary/events"))!;
    const url = new URL(insert.url);
    expect(url.searchParams.get("conferenceDataVersion")).toBe("1");
    expect(url.searchParams.get("sendUpdates")).toBe("all");
    expect(insert.auth).toBe("Bearer access-juan@school.test");
    const body = JSON.parse(insert.body);
    expect(body.summary).toBe("Test School call — Ana Pérez (Private Pilot)");
    expect(body.attendees).toEqual([{ email: "ana@example.com", displayName: "Ana Pérez" }]);
    expect(body.conferenceData.createRequest).toEqual({ requestId: res.bookingId, conferenceSolutionKey: { type: "hangoutsMeet" } });
    expect(body.start).toEqual({ dateTime: SLOT.toISOString(), timeZone: "America/New_York" });
    expect(body.end.dateTime).toBe("2026-11-03T15:30:00.000Z");
    expect(body.description).toContain("(772) 555-0100");
    expect(body.description).toContain("VA / GI Bill");
    expect(body.description).toContain("Bogotá, Colombia");

    const lead = await getLead(prisma, s.owner, res.leadId!);
    expect(lead).toMatchObject({
      source: "WEBSITE",
      program: "PRIVATE",
      funding: "VA",
      isInternational: true,
      language: "en",
      email: "ana@example.com",
      phone: "17725550100",
      ownerId: s.agent2.membershipId,
      timeline: "Within 1–3 months, full-time",
    });
    const types = lead.activities.map((a) => a.type);
    expect(types).toEqual(expect.arrayContaining(["CREATED", "NOTE", "ASSIGNED", "CALL_BOOKED"]));
    const note = lead.activities.find((a) => a.type === "NOTE")!.body!;
    expect(note).toContain("Discovery flight only · Total flight hours: 1");
    expect(note).toContain("Do you need a student visa (M-1) to train in the US? Yes");
    const booked = lead.activities.find((a) => a.type === "CALL_BOOKED")!;
    expect(booked.body).toContain("Call booked for Tuesday, November 3, 10:00 AM EST with " + s.agent2.name);
    expect(booked.body).toContain("https://meet.google.com/xyz-abcd-efg");
    expect(lead.tasks).toHaveLength(1); // no generic "contact now" task
    expect(lead.tasks[0]).toMatchObject({ dueAt: SLOT, title: "Call with Ana Pérez (booked online)" });
    expect(lead.tasks[0].assignee?.id).toBe(s.agent2.membershipId);

    const ev = await prisma.intakeEvent.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(ev).toMatchObject({ status: "CREATED", externalId: `booking:${res.bookingId}` });
    const b = await prisma.callBooking.findUniqueOrThrow({ where: { id: res.bookingId } });
    expect(b).toMatchObject({ status: "CONFIRMED", googleEventId: "gev123", meetLink: "https://meet.google.com/xyz-abcd-efg", leadId: lead.id, hostId: s.agent2.membershipId, activeStart: SLOT });

    const shown = await listLeadBookings(prisma, s.agent2, lead.id, NOW);
    expect(shown).toHaveLength(1);
    expect(shown[0].past).toBe(false);
  });

  it("merges a returning visitor into their lead and hands it to the host", async () => {
    const { s } = await setup();
    const form = await createIntegration(prisma, s.owner, { kind: "WEB_FORM", name: "Website" });
    const first = await ingest(prisma, form, { name: "Ana Pérez", email: "ana@example.com" });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: first.leadId! } })).ownerId).toBe(s.agent.membershipId);

    await prisma.bookingPage.updateMany({ data: { hostIds: [s.agent2.membershipId] } });
    const res = await bookCall(prisma, "test-school", answers(), { provider: mockCalendar().provider, now: NOW });
    expect(res.leadId).toBe(first.leadId);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: first.leadId! } });
    expect(lead).toMatchObject({ ownerId: s.agent2.membershipId, funding: "VA", isInternational: true });
    expect(await prisma.lead.count()).toBe(1);
    expect(await prisma.intakeEvent.count({ where: { status: "MERGED" } })).toBe(1);
    expect(await prisma.activity.count({ where: { leadId: lead.id, type: "ASSIGNED", meta: { path: ["to"], equals: s.agent2.membershipId } } })).toBe(1);
  });

  it("round-robin: fewest upcoming calls first, then least recently assigned", async () => {
    const { s } = await setup();
    const cal = mockCalendar();
    const [first, second] = [s.agent.membershipId, s.agent2.membershipId].sort();
    const hosts: string[] = [];
    for (const [i, iso] of ["2026-11-03T15:00:00Z", "2026-11-03T16:00:00Z", "2026-11-03T17:00:00Z", "2026-11-03T18:00:00Z"].entries()) {
      await bookCall(prisma, "test-school", answers({ startAt: iso, email: `v${i}@example.com`, phone: `77255501${10 + i}` }), { provider: cal.provider, now: NOW });
      hosts.push(cal.inserted[cal.inserted.length - 1].host);
    }
    expect(hosts).toEqual([first, second, first, second]);

    // A host with fewer upcoming calls wins even if they had one recently.
    await prisma.callBooking.updateMany({ where: { hostId: second }, data: { status: "CANCELED", activeStart: null } });
    await bookCall(prisma, "test-school", answers({ startAt: "2026-11-04T15:00:00Z", email: "late@example.com", phone: "7725550199" }), { provider: cal.provider, now: NOW });
    expect(cal.inserted[cal.inserted.length - 1].host).toBe(second);
  });

  it("only the free host gets the call", async () => {
    const { s } = await setup();
    const cal = mockCalendar({ [s.agent.membershipId]: [{ start: SLOT, end: at("2026-11-03T16:00:00Z") }] });
    await bookCall(prisma, "test-school", answers(), { provider: cal.provider, now: NOW });
    expect(cal.inserted[0].host).toBe(s.agent2.membershipId);
  });

  it("race: two visitors, one host, same time → one booking, the other is told it was just taken", async () => {
    const { s } = await setup();
    await prisma.bookingPage.updateMany({ data: { hostIds: [s.agent.membershipId] } });
    const cal = mockCalendar();
    const results = await Promise.allSettled([
      bookCall(prisma, "test-school", answers(), { provider: cal.provider, now: NOW }),
      bookCall(prisma, "test-school", answers({ email: "bo@example.com", phone: "7725550111", firstName: "Bo" }), { provider: cal.provider, now: NOW }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(SlotTakenError);
    expect(await prisma.callBooking.count({ where: { status: "CONFIRMED" } })).toBe(1);
    expect(cal.inserted).toHaveLength(1);
  });

  it("race: two visitors, two free hosts, same time → each host gets one", async () => {
    const { s } = await setup();
    const cal = mockCalendar();
    const results = await Promise.all([
      bookCall(prisma, "test-school", answers(), { provider: cal.provider, now: NOW }),
      bookCall(prisma, "test-school", answers({ email: "bo@example.com", phone: "7725550111", firstName: "Bo" }), { provider: cal.provider, now: NOW }),
    ]);
    const hosts = await prisma.callBooking.findMany({ where: { id: { in: results.map((r) => r.bookingId) } }, select: { hostId: true } });
    expect(new Set(hosts.map((h) => h.hostId))).toEqual(new Set([s.agent.membershipId, s.agent2.membershipId]));
  });

  it("the database refuses a second confirmed call for the same host and start", async () => {
    const { s } = await setup();
    await bookCall(prisma, "test-school", answers(), { provider: mockCalendar().provider, now: NOW });
    const b = await prisma.callBooking.findFirstOrThrow();
    const copy = {
      orgId: b.orgId, pageId: b.pageId, hostId: b.hostId, startAt: b.startAt, endAt: b.endAt, activeStart: b.activeStart,
      visitorName: "Someone else", visitorEmail: "else@example.com", answers: {},
    };
    await expect(prisma.callBooking.create({ data: copy })).rejects.toMatchObject({ code: "P2002" });
    expect(b.hostId === s.agent.membershipId || b.hostId === s.agent2.membershipId).toBe(true);
  });

  it("rechecks Google at booking time: a host who got busy since the list was shown is skipped", async () => {
    const { s } = await setup();
    await prisma.bookingPage.updateMany({ data: { hostIds: [s.agent.membershipId] } });
    const cal = mockCalendar();
    const page = await prisma.bookingPage.findFirstOrThrow();
    expect((await availableSlots(prisma, page, cal.provider, NOW)).some((x) => x.start.getTime() === SLOT.getTime())).toBe(true);
    cal.busy[s.agent.membershipId] = [{ start: at("2026-11-03T14:00:00Z"), end: at("2026-11-03T16:00:00Z") }];
    await expect(bookCall(prisma, "test-school", answers(), { provider: cal.provider, now: NOW })).rejects.toBeInstanceOf(SlotTakenError);
    expect(await prisma.lead.count()).toBe(0);
  });

  it("rejects times that aren't offered (too soon, outside hours, off the grid)", async () => {
    await setup();
    const cal = mockCalendar();
    for (const iso of ["2026-11-02T13:00:00Z", "2026-11-03T23:00:00Z", "2026-11-03T15:10:00Z", "2026-11-08T15:00:00Z", "2026-11-17T15:00:00Z"]) {
      await expect(bookCall(prisma, "test-school", answers({ startAt: iso }), { provider: cal.provider, now: NOW })).rejects.toBeInstanceOf(SlotTakenError);
    }
  });

  it("releases the time when Google can't create the event", async () => {
    const { s } = await setup();
    await prisma.bookingPage.updateMany({ data: { hostIds: [s.agent.membershipId] } });
    const cal = mockCalendar();
    const failing: CalendarProvider = { ...cal.provider, insertEvent: async () => Promise.reject(new Error("Google Calendar: backend error")) };
    await expect(bookCall(prisma, "test-school", answers(), { provider: failing, now: NOW })).rejects.toThrow("bookingFailed");
    const b = await prisma.callBooking.findFirstOrThrow();
    expect(b).toMatchObject({ status: "CANCELED", activeStart: null });
    expect(await prisma.activity.count({ where: { leadId: b.leadId!, type: "CALL_CANCELED" } })).toBe(1);
    await bookCall(prisma, "test-school", answers(), { provider: cal.provider, now: NOW });
    expect(await prisma.callBooking.count({ where: { status: "CONFIRMED" } })).toBe(1);
  });

  it("releases the time when the lead can't be recorded (intake rate limit)", async () => {
    const { s, page } = await setup();
    await prisma.intakeEvent.createMany({ data: Array.from({ length: 30 }, () => ({ orgId: s.org.id, integrationId: page.integrationId, status: "CREATED" as const, createdAt: NOW })) });
    const cal = mockCalendar();
    await expect(bookCall(prisma, "test-school", answers(), { provider: cal.provider, now: NOW })).rejects.toThrow("Too many submissions");
    expect(await prisma.callBooking.findFirstOrThrow()).toMatchObject({ status: "CANCELED", activeStart: null });
    expect(cal.inserted).toHaveLength(0);
  });

  it("rejects incomplete answers and closed pages", async () => {
    const { page } = await setup();
    const cal = mockCalendar();
    await expect(bookCall(prisma, "test-school", answers({ visa: undefined as never, email: "nope" }), { provider: cal.provider, now: NOW })).rejects.toBeInstanceOf(ZodError);
    await prisma.bookingPage.update({ where: { id: page.id }, data: { enabled: false } });
    await expect(bookCall(prisma, "test-school", answers(), { provider: cal.provider, now: NOW })).rejects.toThrow("bookingUnavailable");
  });
});

describe("cancel", () => {
  it("staff cancel deletes the Google event with cancellation emails, frees the time, removes the task", async () => {
    const { s } = await setup();
    await prisma.bookingPage.updateMany({ data: { hostIds: [s.agent.membershipId] } });
    const { f, calls } = googleFetch((c) => {
      if (c.url.endsWith("/freeBusy")) return { json: { calendars: { primary: { busy: [] } } } };
      if (c.method === "POST" && c.url.includes("/events")) return { json: { id: "gev9", hangoutLink: "https://meet.google.com/aaa-bbbb-ccc" } };
      if (c.method === "DELETE") return { status: 204 };
    });
    const google = googleProvider(prisma, f);
    const res = await bookCall(prisma, "test-school", answers(), { provider: google, now: NOW });
    await cancelBooking(prisma, s.agent, res.bookingId, google, NOW);

    const del = calls.find((c) => c.method === "DELETE")!;
    expect(del.url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events/gev9?sendUpdates=all");
    expect(await prisma.callBooking.findUniqueOrThrow({ where: { id: res.bookingId } })).toMatchObject({ status: "CANCELED", activeStart: null, canceledById: s.agent.membershipId });
    const lead = await getLead(prisma, s.owner, res.leadId!);
    expect(lead.tasks).toHaveLength(0);
    expect(lead.activities.find((a) => a.type === "CALL_CANCELED")?.body).toContain("Call on Tuesday, November 3, 10:00 AM EST");

    await expect(cancelBooking(prisma, s.agent, res.bookingId, google, NOW)).rejects.toThrow("callNotCancelable");
    // The time is bookable again.
    await bookCall(prisma, "test-school", answers({ email: "next@example.com", phone: "7725550123" }), { provider: google, now: NOW });
  });

  it("visitors cancel with the signed link; a wrong token does nothing", async () => {
    await setup();
    const cal = mockCalendar();
    const res = await bookCall(prisma, "test-school", answers(), { provider: cal.provider, now: NOW });
    await expect(cancelBookingAsVisitor(prisma, res.bookingId, "forged-token", cal.provider, NOW)).rejects.toThrow();
    expect(cal.deleted).toEqual([]);
    await cancelBookingAsVisitor(prisma, res.bookingId, res.cancelToken, cal.provider, NOW);
    expect(cal.deleted).toEqual(["ev-1"]);
    const b = await prisma.callBooking.findUniqueOrThrow({ where: { id: res.bookingId } });
    expect(b).toMatchObject({ status: "CANCELED", canceledById: null });
    const act = await prisma.activity.findFirstOrThrow({ where: { leadId: res.leadId!, type: "CALL_CANCELED" } });
    expect(act.body).toContain("Canceled by the visitor");
  });

  it("another school can't see or cancel the call", async () => {
    await setup();
    const res = await bookCall(prisma, "test-school", answers(), { provider: mockCalendar().provider, now: NOW });
    const other = await makeSchool("Other School");
    await expect(cancelBooking(prisma, other.owner, res.bookingId, mockCalendar().provider, NOW)).rejects.toThrow("Not found");
    await expect(listLeadBookings(prisma, other.owner, res.leadId!)).rejects.toThrow("Not found");
  });
});

describe("booking page settings", () => {
  it("hosts need a connected calendar, a live page needs a host, link names are unique, agents can't edit", async () => {
    const { s, page } = await setup();
    const base = { title: "Call us", slug: "test-school", durationMin: 30, bufferMin: 0, minNoticeMin: 240, daysAhead: 14, timeZone: "America/New_York", hours: DEFAULT_HOURS, enabled: true };
    await expect(updateBookingPage(prisma, s.owner, page.id, { ...base, hostIds: [s.manager.membershipId] })).rejects.toThrow("hostNeedsCalendar");
    await expect(updateBookingPage(prisma, s.owner, page.id, { ...base, hostIds: [] })).rejects.toThrow("bookingNeedsHost");
    await expect(updateBookingPage(prisma, s.agent, page.id, { ...base, hostIds: [s.agent.membershipId] })).rejects.toThrow();
    await expect(updateBookingPage(prisma, s.owner, page.id, { ...base, hostIds: [s.agent.membershipId], hours: { "1": [["17:00", "09:00"]] } })).rejects.toThrow("hoursInvalid");

    const other = await makeSchool("Other School");
    const otherPage = await createBookingPage(prisma, other.owner);
    expect(otherPage.slug).toBe("other-school");
    await expect(updateBookingPage(prisma, other.owner, otherPage.id, { ...base, slug: "test-school", enabled: false, hostIds: [] })).rejects.toThrow("slugTaken");
    await expect(updateBookingPage(prisma, other.owner, page.id, { ...base, hostIds: [] })).rejects.toThrow("Not found");

    const integration = await prisma.integration.findUniqueOrThrow({ where: { id: page.integrationId } });
    expect(integration).toMatchObject({ kind: "BOOKING", defaultSource: "WEBSITE", orgId: s.org.id });
  });
});

describe("POST /api/book/[slug]", () => {
  const post = (slug: string, body: unknown) =>
    bookPOST(new Request(`http://localhost/api/book/${slug}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), {
      params: Promise.resolve({ slug }),
    });

  it("validates, ignores bots, and books with the fake calendar when CALENDAR_FAKE=1", async () => {
    await setup();
    const bad = await post("test-school", { ...answers(), phone: "12", program: "helicopter" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).fields.sort()).toEqual(["phone", "program"]);

    const bot = await post("test-school", { ...answers(), _hp: "http://spam" });
    expect(await bot.json()).toEqual({ ok: true, booking: null });
    expect(await prisma.callBooking.count()).toBe(0);

    expect((await post("nope-page", answers())).status).toBe(404);

    process.env.CALENDAR_FAKE = "1";
    // Real clock here: pick the first slot the page offers now.
    const page = await prisma.bookingPage.findFirstOrThrow();
    await prisma.bookingPage.update({ where: { id: page.id }, data: { hours: { "0": [["00:00", "23:30"]], "1": [["00:00", "23:30"]], "2": [["00:00", "23:30"]], "3": [["00:00", "23:30"]], "4": [["00:00", "23:30"]], "5": [["00:00", "23:30"]], "6": [["00:00", "23:30"]] } } });
    const { calendarProvider } = await import("@/modules/google-calendar");
    const live = await prisma.bookingPage.findFirstOrThrow();
    const first = (await availableSlots(prisma, live, calendarProvider(prisma)))[0];
    const ok = await post("test-school", answers({ startAt: first.start.toISOString() }));
    const json = await ok.json();
    expect(ok.status).toBe(200);
    expect(json.booking.meetLink).toMatch(/^https:\/\/meet\.google\.com\/[a-j]{3}-[a-j]{4}-[a-j]{3}$/);
    expect(json.booking.cancelUrl).toMatch(/^\/book\/test-school\/cancel\?b=[0-9a-f-]{36}&t=/);

    const again = await post("test-school", answers({ startAt: first.start.toISOString(), email: "z@example.com", phone: "7725550177" }));
    // Two hosts: the second visitor still gets the other one; a third would be told it's taken.
    expect(again.status).toBe(200);
    const third = await post("test-school", answers({ startAt: first.start.toISOString(), email: "y@example.com", phone: "7725550178" }));
    expect(third.status).toBe(409);
    expect(await third.json()).toEqual({ ok: false, error: "slot_taken" });
  });
});
