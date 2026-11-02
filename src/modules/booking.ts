import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { AppError, conflict, invalid, notFound } from "@/lib/errors";
import { fmt } from "@/lib/i18n/format";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { BOOK_CALL_LANGUAGES, BOOK_CALL_TYPES, BOOK_EXPERIENCE, BOOK_PAYMENT, BOOK_PROGRAMS, BOOK_SCHEDULE, BOOK_START, BOOK_VISA } from "@/lib/booking-options";
import type { BookingPage, CalendarConnection, Funding, Prisma, Program } from "@/generated/prisma/client";
import { ensure, isManager, leadScope, type AccessContext } from "@/modules/access";
import { DEFAULT_HOURS, formatCallTime, formatDay, formatTime, generateSlots, isFree, parseHours, rankHosts, tzAbbr, type Interval, type WeeklyHours } from "@/modules/booking-slots";
import { CalendarUnavailableError, type CalendarProvider } from "@/modules/google-calendar";
import { newToken } from "@/modules/integrations";
import { ingest, RateLimitedError } from "@/modules/intake";
import { normalizePhone } from "@/modules/leads";
import { timeZoneSchema } from "@/modules/orgs";

/**
 * "Book a call": a public page (/book/<slug>) where website visitors answer a few questions and book a
 * call with whichever host is free. Each booking lands in the CRM like any other website lead (merged
 * by email/phone, IntakeEvent logged), owned by the host, with the call on the host's Google Calendar
 * (Meet link, invitation to the visitor), a timeline entry and a task at the call time.
 *
 * Double-booking guard: hosts are tried in round-robin order; for each, a transaction locks the host's
 * membership row, checks for overlapping confirmed calls, and inserts. The unique (hostId, activeStart)
 * index backs that up at the database level.
 */

const dict = (locale: string) => (locale === "es" ? es : en);

// ---------------------------------------------------------------------------
// Page settings (owners/managers)
// ---------------------------------------------------------------------------

export function getBookingPage(db: Db, orgId: string) {
  return db.bookingPage.findFirst({ where: { orgId }, orderBy: { createdAt: "asc" } });
}

const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** Create the school's booking page (off until hosts are picked), with its intake source. */
export async function createBookingPage(db: Db, ctx: AccessContext) {
  ensure(isManager(ctx));
  const existing = await getBookingPage(db, ctx.orgId);
  if (existing) return existing;
  const org = await db.organization.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { name: true, timeZone: true, locale: true } });
  const base = slugify(org.name).padEnd(3, "x") || "book";
  let slug = base;
  for (let i = 2; RESERVED_SLUGS.includes(slug) || (await db.bookingPage.findUnique({ where: { slug } })); i++) slug = `${base.slice(0, 55)}-${i}`;
  return db.$transaction(async (tx) => {
    const integration = await tx.integration.create({
      data: { orgId: ctx.orgId, kind: "BOOKING", name: dict(org.locale).booking.title, token: newToken(), defaultSource: "WEBSITE" },
    });
    return tx.bookingPage.create({
      data: {
        orgId: ctx.orgId,
        integrationId: integration.id,
        slug,
        title: dict(org.locale).book.defaultTitle,
        timeZone: org.timeZone,
        hours: DEFAULT_HOURS,
        hostIds: [],
      },
    });
  });
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Would collide with /api/book/cancel. */
const RESERVED_SLUGS = ["cancel"];

export const pageInput = z.object({
  title: z.string().trim().min(1, "bookingSettingsInvalid").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,58})[a-z0-9]$/, "slugInvalid")
    .refine((v) => !RESERVED_SLUGS.includes(v), "slugTaken"),
  durationMin: z.number("bookingSettingsInvalid").int("bookingSettingsInvalid").min(10, "bookingSettingsInvalid").max(240, "bookingSettingsInvalid"),
  bufferMin: z.number("bookingSettingsInvalid").int("bookingSettingsInvalid").min(0, "bookingSettingsInvalid").max(120, "bookingSettingsInvalid"),
  minNoticeMin: z.number("bookingSettingsInvalid").int("bookingSettingsInvalid").min(0, "bookingSettingsInvalid").max(720 * 60, "bookingSettingsInvalid"),
  daysAhead: z.number("bookingSettingsInvalid").int("bookingSettingsInvalid").min(1, "bookingSettingsInvalid").max(60, "bookingSettingsInvalid"),
  timeZone: timeZoneSchema,
  hours: z.record(z.string().regex(/^[0-6]$/), z.array(z.tuple([z.string().regex(TIME, "hoursInvalid"), z.string().regex(TIME, "hoursInvalid")])).max(4)),
  hostIds: z.array(z.string().uuid()).max(20),
  enabled: z.boolean(),
});
export type PageInput = z.input<typeof pageInput>;

export async function updateBookingPage(db: Db, ctx: AccessContext, pageId: string, input: PageInput) {
  ensure(isManager(ctx));
  const page = await db.bookingPage.findFirst({ where: { id: pageId, orgId: ctx.orgId } });
  if (!page) throw notFound();
  const data = pageInput.parse(input);
  for (const ranges of Object.values(data.hours)) for (const [a, b] of ranges) if (a >= b) throw invalid("hoursInvalid");
  const hostIds = [...new Set(data.hostIds)];
  const members = await db.membership.findMany({ where: { id: { in: hostIds }, orgId: ctx.orgId, active: true }, select: { id: true, calendar: { select: { status: true } } } });
  for (const id of hostIds) {
    const m = members.find((x) => x.id === id);
    if (!m) throw notFound();
    // New hosts need a working calendar; existing ones whose calendar broke stay listed (skipped until they reconnect).
    if (!m.calendar || (m.calendar.status !== "ACTIVE" && !page.hostIds.includes(id))) throw invalid("hostNeedsCalendar");
  }
  if (data.enabled && hostIds.length === 0) throw invalid("bookingNeedsHost");
  const taken = await db.bookingPage.findUnique({ where: { slug: data.slug } });
  if (taken && taken.id !== page.id) throw conflict("slugTaken");
  await db.bookingPage.update({ where: { id: page.id }, data: { ...data, hours: parseHours(data.hours), hostIds } });
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

type Host = { id: string; name: string; conn: CalendarConnection };

/** Hosts that can take calls right now: listed on the page, active, calendar connected and working. */
async function loadHosts(db: Db, page: BookingPage): Promise<Host[]> {
  const rows = await db.membership.findMany({
    where: { id: { in: page.hostIds }, orgId: page.orgId, active: true, calendar: { status: "ACTIVE" } },
    orderBy: { createdAt: "asc" },
    include: { calendar: true, user: { select: { name: true } } },
  });
  return rows.filter((m) => m.calendar).map((m) => ({ id: m.id, name: m.user.name, conn: m.calendar! }));
}

/** Busy times for one host: Google free/busy plus confirmed calls in the CRM. Null = calendar unusable. */
async function hostBusy(db: Db, provider: CalendarProvider, host: Host, range: Interval): Promise<Interval[] | null> {
  let google: Interval[];
  try {
    google = await provider.freeBusy(host.conn, range.start, range.end);
  } catch (e) {
    if (!(e instanceof CalendarUnavailableError) && !(e instanceof AppError)) console.error("[booking] free/busy failed:", e instanceof Error ? e.message : e);
    return null;
  }
  const calls = await db.callBooking.findMany({
    where: { hostId: host.id, status: "CONFIRMED", startAt: { lt: range.end }, endAt: { gt: range.start } },
    select: { startAt: true, endAt: true },
  });
  return [...google, ...calls.map((c) => ({ start: c.startAt, end: c.endAt }))];
}

const pad = (i: Interval, min: number) => ({ start: new Date(i.start.getTime() - min * 60_000), end: new Date(i.end.getTime() + min * 60_000) });

function rulesOf(page: BookingPage, now: Date) {
  return { now, timeZone: page.timeZone, hours: parseHours(page.hours) as WeeklyHours, durationMin: page.durationMin, minNoticeMin: page.minNoticeMin, daysAhead: page.daysAhead };
}

/** Bookable start times (at least one host free). Never says which host. */
export async function availableSlots(db: Db, page: BookingPage, provider: CalendarProvider, now = new Date()): Promise<Interval[]> {
  const slots = generateSlots(rulesOf(page, now));
  if (!slots.length) return [];
  const hosts = await loadHosts(db, page);
  const range = pad({ start: slots[0].start, end: slots[slots.length - 1].end }, page.bufferMin);
  const busy = (await Promise.all(hosts.map((h) => hostBusy(db, provider, h, range)))).filter((b): b is Interval[] => b !== null);
  return slots.filter((s) => busy.some((b) => isFree(s, b, page.bufferMin)));
}

export type PublicDay = { date: string; label: string; abbr: string; slots: { start: string; label: string }[] };

/** Slots grouped by day with labels in the visitor's language, for the public page. */
export async function publicAvailability(db: Db, page: BookingPage, provider: CalendarProvider, locale: string, now = new Date()) {
  const slots = await availableSlots(db, page, provider, now);
  const days: PublicDay[] = [];
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: page.timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  for (const s of slots) {
    const date = dayKey.format(s.start);
    let day = days[days.length - 1];
    if (!day || day.date !== date) days.push((day = { date, label: formatDay(s.start, locale, page.timeZone), abbr: tzAbbr(s.start, page.timeZone), slots: [] }));
    day.slots.push({ start: s.start.toISOString(), label: formatTime(s.start, locale, page.timeZone) });
  }
  return { timeZone: page.timeZone, days };
}

export function findPublicPage(db: Db, slug: string) {
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return null;
  return db.bookingPage.findFirst({ where: { slug, enabled: true }, include: { org: { select: { name: true, locale: true } }, integration: true } });
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export const bookingInput = z.object({
  program: z.enum(BOOK_PROGRAMS, "program"),
  experience: z.enum(BOOK_EXPERIENCE, "experience"),
  hours: z.number("hours").int("hours").min(0, "hours").max(30000, "hours").nullable().optional(),
  start: z.enum(BOOK_START, "start"),
  schedule: z.enum(BOOK_SCHEDULE, "schedule"),
  payment: z.enum(BOOK_PAYMENT, "payment"),
  location: z.string("location").trim().min(2, "location").max(120, "location"),
  visa: z.enum(BOOK_VISA, "visa"),
  /** Phone call (we ring them, no Meet link) or Google Meet video. */
  callType: z.enum(BOOK_CALL_TYPES, "callType").default("video"),
  /** Language they want to talk in; defaults to the page language. */
  callLanguage: z.enum(BOOK_CALL_LANGUAGES, "callLanguage").optional(),
  firstName: z.string("firstName").trim().min(1, "firstName").max(80, "firstName"),
  lastName: z.string("lastName").trim().min(1, "lastName").max(80, "lastName"),
  email: z.email("email").max(200, "email").transform((v) => v.toLowerCase()),
  phone: z
    .string("phone")
    .max(40, "phone")
    .refine((v) => normalizePhone(v) !== null, "phone"),
  startAt: z.iso.datetime({ offset: true, message: "startAt" }),
  language: z.enum(["en", "es"]).default("en"),
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(120).optional(),
});
export type BookingInput = z.input<typeof bookingInput>;
type Answers = z.output<typeof bookingInput>;

/** The program the lead goes in; "not sure" becomes the next rating after their experience. */
export function leadProgram(a: Pick<Answers, "program" | "experience">): Program {
  if (a.program === "private") return "PRIVATE";
  if (a.program === "instrument") return "INSTRUMENT";
  if (a.program === "commercial") return "COMMERCIAL";
  return ({ none: "PRIVATE", discovery: "PRIVATE", student: "PRIVATE", private: "INSTRUMENT", instrument: "COMMERCIAL", commercial: "OTHER" } as const)[a.experience];
}

export const leadFunding = (p: Answers["payment"]): Funding => ({ self: "SELF_PAY", loan: "LOAN", va: "VA", sponsor: "EMPLOYER", not_sure: "UNKNOWN" } as const)[p];

/** The questions and answers as readable lines, in `locale`. */
export function answerLines(a: Answers, locale: string): string[] {
  const t = dict(locale).book;
  const o = t.options;
  return [
    `${t.program} ${o.program[a.program]}`,
    `${t.experience}: ${o.experience[a.experience]}${a.hours != null ? ` · ${t.hours}: ${a.hours}` : ""}`,
    `${t.start} ${o.start[a.start]} · ${t.schedule}: ${o.schedule[a.schedule]}`,
    `${t.payment} ${o.payment[a.payment]}`,
    `${t.location} ${a.location}`,
    `${t.visa} ${o.visa[a.visa]}`,
    `${t.callType} ${o.callType[a.callType]}`,
    `${t.callLanguage} ${o.callLanguage[a.callLanguage ?? a.language]}`,
  ];
}

export class SlotTakenError extends AppError {
  constructor() {
    super("CONFLICT", "slotUnavailable");
  }
}

/** Max bookings per page per minute (a bot can't fill everyone's calendar). */
export const BOOKINGS_PER_MINUTE = 10;

export type BookingResult = {
  bookingId: string;
  startAt: string;
  endAt: string;
  hostFirstName: string;
  meetLink: string | null;
  callType: "phone" | "video";
  /** The number the host will ring, for phone calls. */
  phone: string | null;
  cancelToken: string;
  leadId: string | null;
};

/**
 * Book `input.startAt` on the page: recheck who is free right now (Google + CRM), pick the host by
 * round-robin, claim the slot, create/merge the lead, put the event (with Meet) on the host's calendar.
 * Throws SlotTakenError when nobody is free any more.
 */
export async function bookCall(db: Db, slug: string, raw: BookingInput, opts: { provider: CalendarProvider; now?: Date }): Promise<BookingResult> {
  const now = opts.now ?? new Date();
  const page = await findPublicPage(db, slug);
  if (!page || !page.integration.active) throw notFound("bookingUnavailable");
  const a = bookingInput.parse(raw);

  const recent = await db.callBooking.count({ where: { pageId: page.id, createdAt: { gt: new Date(now.getTime() - 60_000) } } });
  if (recent >= BOOKINGS_PER_MINUTE) throw new RateLimitedError();

  const start = new Date(a.startAt);
  const slot = generateSlots(rulesOf(page, now)).find((s) => s.start.getTime() === start.getTime());
  if (!slot) throw new SlotTakenError();

  // Fresh check of every host for this one slot.
  const hosts = await loadHosts(db, page);
  const window = pad(slot, page.bufferMin);
  const free: Host[] = [];
  for (const h of hosts) {
    const busy = await hostBusy(db, opts.provider, h, window);
    if (busy && isFree(slot, busy, page.bufferMin)) free.push(h);
  }
  if (!free.length) throw new SlotTakenError();

  const ids = free.map((h) => h.id);
  const [upcoming, last] = await Promise.all([
    db.callBooking.groupBy({ by: ["hostId"], where: { hostId: { in: ids }, status: "CONFIRMED", startAt: { gte: now } }, _count: { _all: true } }),
    db.callBooking.groupBy({ by: ["hostId"], where: { hostId: { in: ids } }, _max: { createdAt: true } }),
  ]);
  const order = rankHosts(
    ids.map((id) => ({
      id,
      upcoming: upcoming.find((u) => u.hostId === id)?._count._all ?? 0,
      lastAssignedAt: last.find((l) => l.hostId === id)?._max.createdAt ?? null,
    })),
  );

  const visitorName = `${a.firstName} ${a.lastName}`.trim();
  const phoneCall = a.callType === "phone";
  const callLanguage = a.callLanguage ?? a.language;
  const answers = { ...a } as Prisma.InputJsonValue;
  let claimed: { id: string; host: Host } | null = null;
  for (const hostId of order) {
    const id = await claim(db, page, hostId, slot, { visitorName, email: a.email, phone: normalizePhone(a.phone), language: a.language, answers });
    if (id) {
      claimed = { id, host: free.find((h) => h.id === hostId)! };
      break;
    }
  }
  if (!claimed) throw new SlotTakenError();
  const { host } = claimed;

  // The lead: same pipeline as every other website lead, owned by the host.
  const org = page.org;
  const st = dict(org.locale).book.system;
  const ot = dict(org.locale).book.options;
  const callTimeOrg = formatCallTime(slot.start, org.locale, page.timeZone);
  const release = () => db.callBooking.update({ where: { id: claimed.id }, data: { status: "CANCELED", activeStart: null, canceledAt: now } });
  const intake = await ingest(
    db,
    page.integration,
    { first_name: a.firstName, last_name: a.lastName, email: a.email, phone: a.phone, language: callLanguage, utm_source: a.utmSource, utm_medium: a.utmMedium, utm_campaign: a.utmCampaign },
    {
      externalId: `booking:${claimed.id}`,
      source: "WEBSITE",
      via: page.title,
      ownerId: host.id,
      skipTask: true,
      extraNote: [`${st.answers}:`, ...answerLines(a, org.locale)].join("\n"),
      fields: {
        program: leadProgram(a),
        funding: leadFunding(a.payment),
        timeline: `${ot.start[a.start]}, ${ot.schedule[a.schedule].toLowerCase()}`,
        isInternational: a.visa === "yes",
      },
      now,
    },
  ).catch(async (e) => {
    await release();
    throw e;
  });
  const leadId = intake.leadId;

  // The calendar event, in the visitor's language (they get the invitation).
  const vt = dict(a.language).book;
  let event: { id: string; meetLink: string | null };
  try {
    event = await opts.provider.insertEvent(host.conn, {
      requestId: claimed.id,
      summary: fmt(vt.system.eventSummary, { school: org.name, name: visitorName, program: vt.options.program[a.program] }),
      description: [
        fmt(vt.system.eventIntro, { page: page.title }),
        ...(phoneCall ? [fmt(vt.system.callPhone, { phone: a.phone })] : []),
        "",
        `${vt.system.name}: ${visitorName}`,
        `${vt.email}: ${a.email}`,
        `${vt.phone}: ${a.phone}`,
        "",
        ...answerLines(a, a.language),
      ].join("\n"),
      start: slot.start,
      end: slot.end,
      timeZone: page.timeZone,
      attendee: { email: a.email, name: visitorName },
      meet: !phoneCall,
      location: phoneCall ? a.phone : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : "unknown error";
    console.error("[booking] event insert failed:", msg);
    await release();
    if (leadId) await db.callBooking.update({ where: { id: claimed.id }, data: { leadId } });
    if (leadId) await db.activity.create({ data: { orgId: page.orgId, leadId, type: "CALL_CANCELED", body: fmt(st.eventFailed, { error: msg }), meta: { bookingId: claimed.id } } });
    throw new AppError("PROVIDER", "bookingFailed");
  }

  await db.$transaction(async (tx) => {
    let taskId: string | null = null;
    if (leadId) {
      const task = await tx.task.create({ data: { orgId: page.orgId, leadId, title: phoneCall ? fmt(st.taskTitlePhone, { name: visitorName, phone: a.phone }) : fmt(st.taskTitle, { name: visitorName }), dueAt: slot.start, assigneeId: host.id } });
      taskId = task.id;
      await tx.activity.create({
        data: {
          orgId: page.orgId,
          leadId,
          type: "CALL_BOOKED",
          body: [fmt(st.activityBooked, { time: callTimeOrg, host: host.name }), phoneCall ? fmt(st.callPhone, { phone: a.phone }) : event.meetLink && `${st.meet}: ${event.meetLink}`].filter(Boolean).join("\n"),
          meta: { bookingId: claimed.id, startAt: slot.start.toISOString(), hostId: host.id, meetLink: event.meetLink, callType: a.callType, callLanguage },
        },
      });
    }
    await tx.callBooking.update({ where: { id: claimed.id }, data: { googleEventId: event.id, meetLink: event.meetLink, leadId, taskId } });
  });

  return {
    bookingId: claimed.id,
    startAt: slot.start.toISOString(),
    endAt: slot.end.toISOString(),
    hostFirstName: host.name.split(/\s+/)[0] ?? host.name,
    meetLink: event.meetLink,
    callType: a.callType,
    phone: phoneCall ? a.phone : null,
    cancelToken: cancelToken(claimed.id),
    leadId,
  };
}

/**
 * Take the slot for one host, or return null if they got another call in the meantime. The host's
 * membership row is locked so concurrent bookings for the same host run one after the other; the
 * unique (hostId, activeStart) index is the last line of defence.
 */
async function claim(
  db: Db,
  page: BookingPage,
  hostId: string,
  slot: Interval,
  v: { visitorName: string; email: string; phone: string | null; language: string; answers: Prisma.InputJsonValue },
): Promise<string | null> {
  const window = pad(slot, page.bufferMin);
  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Membership" WHERE id = ${hostId}::uuid FOR UPDATE`;
      const clash = await tx.callBooking.findFirst({
        where: { hostId, status: "CONFIRMED", startAt: { lt: window.end }, endAt: { gt: window.start } },
        select: { id: true },
      });
      if (clash) return null;
      const b = await tx.callBooking.create({
        data: {
          orgId: page.orgId,
          pageId: page.id,
          hostId,
          startAt: slot.start,
          endAt: slot.end,
          activeStart: slot.start,
          visitorName: v.visitorName,
          visitorEmail: v.email,
          visitorPhone: v.phone,
          language: v.language,
          answers: v.answers,
        },
      });
      return b.id;
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return null;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

function cancelSecret() {
  const s = process.env.BETTER_AUTH_SECRET || process.env.TOKEN_ENCRYPTION_KEY;
  if (!s) throw new Error("BETTER_AUTH_SECRET is required to sign cancel links");
  return s;
}

/** Signed token for the visitor's cancel link (no login). */
export const cancelToken = (bookingId: string) => createHmac("sha256", cancelSecret()).update(`cancel-call:${bookingId}`).digest("base64url");

export function verifyCancelToken(bookingId: string, token: string) {
  const a = Buffer.from(cancelToken(bookingId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

const bookingWithHost = { host: { include: { calendar: true, user: { select: { name: true } } } }, page: { select: { timeZone: true } }, org: { select: { locale: true } } } as const;
type FullBooking = Prisma.CallBookingGetPayload<{ include: typeof bookingWithHost }>;

async function doCancel(db: Db, b: FullBooking, actorId: string | null, provider: CalendarProvider, now: Date) {
  if (!isCancelable(b, now)) throw invalid("callNotCancelable");
  const st = dict(b.org.locale).book.system;
  let eventGone = true;
  if (b.googleEventId) {
    try {
      if (!b.host.calendar) throw new Error("no calendar");
      await provider.deleteEvent(b.host.calendar, b.googleEventId);
    } catch (e) {
      console.error("[booking] event delete failed:", e instanceof Error ? e.message : e);
      eventGone = false;
    }
  }
  await db.$transaction(async (tx) => {
    const res = await tx.callBooking.updateMany({
      where: { id: b.id, status: "CONFIRMED" },
      data: { status: "CANCELED", activeStart: null, canceledAt: now, canceledById: actorId },
    });
    if (res.count === 0) return; // someone else canceled it a moment ago
    if (b.taskId) await tx.task.deleteMany({ where: { id: b.taskId, orgId: b.orgId, completedAt: null } });
    if (b.leadId) {
      const lines = [fmt(st.activityCanceled, { time: formatCallTime(b.startAt, b.org.locale, b.page.timeZone), host: b.host.user.name })];
      if (!actorId) lines.push(st.byVisitor);
      if (!eventGone) lines.push(st.eventNotDeleted);
      await tx.activity.create({ data: { orgId: b.orgId, leadId: b.leadId, actorId, type: "CALL_CANCELED", body: lines.join("\n"), meta: { bookingId: b.id } } });
    }
  });
}

/** Staff cancel from the lead page: anyone who can see the lead (or the host). */
export async function cancelBooking(db: Db, ctx: AccessContext, bookingId: string, provider: CalendarProvider, now = new Date()) {
  const b = await db.callBooking.findFirst({ where: { id: bookingId, orgId: ctx.orgId }, include: bookingWithHost });
  if (!b) throw notFound();
  const canSee = b.hostId === ctx.membershipId || isManager(ctx) || (b.leadId && (await db.lead.count({ where: { id: b.leadId, ...leadScope(ctx) } })) > 0);
  if (!canSee) throw notFound();
  await doCancel(db, b, ctx.membershipId, provider, now);
}

/** Look up a booking for the visitor's cancel page. Null when the token doesn't match. */
export async function bookingForVisitor(db: Db, bookingId: string, token: string) {
  if (!/^[0-9a-f-]{36}$/.test(bookingId) || !verifyCancelToken(bookingId, token)) return null;
  return db.callBooking.findUnique({ where: { id: bookingId }, include: { ...bookingWithHost, page: { select: { timeZone: true, slug: true, title: true } } } });
}

/** True while the visitor can still cancel (confirmed, not over yet). */
export const isCancelable = (b: { status: string; endAt: Date }, now = new Date()) => b.status === "CONFIRMED" && b.endAt.getTime() > now.getTime();

export async function cancelBookingAsVisitor(db: Db, bookingId: string, token: string, provider: CalendarProvider, now = new Date()) {
  const b = await bookingForVisitor(db, bookingId, token);
  if (!b) throw notFound();
  await doCancel(db, b, null, provider, now);
}

/** Calls booked for a lead (lead page), newest first, with `past` worked out. */
export async function listLeadBookings(db: Db, ctx: AccessContext, leadId: string, now = new Date()) {
  const lead = await db.lead.findFirst({ where: { id: leadId, ...leadScope(ctx) }, select: { id: true } });
  if (!lead) throw notFound();
  const rows = await db.callBooking.findMany({
    where: { orgId: ctx.orgId, leadId },
    orderBy: { startAt: "desc" },
    take: 10,
    include: { host: { select: { user: { select: { name: true } } } }, page: { select: { timeZone: true } } },
  });
  return rows.map((b) => ({ ...b, past: b.endAt.getTime() <= now.getTime() }));
}
