import type { Db, Tx } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Integration, IntakeStatus, LeadSource, Prisma, Program } from "@/generated/prisma/client";
import { insertLead, leadInput, normalizePhone } from "@/modules/leads";

/**
 * Automatic lead intake: website forms, webhooks (Zapier/Make/…), Google Ads and Meta lead ads all
 * end up here. Each submission is normalized, matched against existing leads (email/phone), turned
 * into a new lead or merged into the existing one, assigned, given a "contact now" task, and logged
 * as an IntakeEvent.
 */

/** Max submissions per integration per minute (a form under attack can't flood the school). */
export const RATE_LIMIT_PER_MINUTE = 30;

export type RawFields = Record<string, unknown>;

export type Normalized = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  program: Program | null;
  source: LeadSource | null;
  language: "en" | "es" | null;
  timeline: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  /** Answers we don't have a column for (custom form questions), kept in the note. */
  extra: [string, string][];
  /** Values that looked wrong (bad email/phone), kept in the note instead of being lost. */
  invalid: [string, string][];
};

const key = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

const ALIASES: Record<string, keyof Omit<Normalized, "extra" | "invalid"> | "fullName" | "ignore"> = {
  firstname: "firstName", fname: "firstName", nombre: "firstName", givenname: "firstName",
  lastname: "lastName", lname: "lastName", surname: "lastName", apellido: "lastName", apellidos: "lastName", familyname: "lastName",
  name: "fullName", fullname: "fullName", yourname: "fullName", nombrecompleto: "fullName", contactname: "fullName",
  email: "email", emailaddress: "email", mail: "email", correo: "email", correoelectronico: "email", youremail: "email",
  phone: "phone", phonenumber: "phone", mobile: "phone", mobilephone: "phone", cell: "phone", cellphone: "phone", tel: "phone", telephone: "phone", telefono: "phone", celular: "phone", whatsapp: "phone", yourphone: "phone",
  message: "message", comments: "message", comment: "message", notes: "message", note: "message", question: "message", questions: "message", mensaje: "message", comentarios: "message", howcanwehelp: "message", details: "message",
  program: "program", interest: "program", interestedin: "program", course: "program", training: "program", programa: "program", trainingtype: "program", certificate: "program",
  source: "source", leadsource: "source", platform: "source", origen: "source",
  language: "language", lang: "language", idioma: "language", preferredlanguage: "language",
  timeline: "timeline", whentostart: "timeline", startdate: "timeline", whenwouldyouliketostart: "timeline", cuando: "timeline",
  utmsource: "utmSource", utmmedium: "utmMedium", utmcampaign: "utmCampaign",
  // Plumbing fields some tools send along; not useful to a person reading the lead.
  hp: "ignore", gotcha: "ignore", redirect: "ignore", formid: "ignore", submit: "ignore", token: "ignore",
};

function text(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(", ");
  if (typeof v === "object") return "";
  return String(v).trim();
}

export function parseProgram(raw: string): Program | null {
  const s = raw.toLowerCase();
  if (!s) return null;
  if (/discover|intro|demo|descubr|prueba/.test(s)) return "DISCOVERY";
  if (/cfii?\b|instructor/.test(s)) return "CFI";
  if (/career|airline|zero|hero|profesional|carrera|aerol/.test(s)) return "CAREER";
  if (/instrument|\bifr\b|\bir\b/.test(s)) return "INSTRUMENT";
  if (/commercial|comercial|\bcpl\b/.test(s)) return "COMMERCIAL";
  if (/private|privad|\bppl\b|recreational|sport/.test(s)) return "PRIVATE";
  return null;
}

export function parseSource(raw: string): LeadSource | null {
  const s = raw.toLowerCase();
  if (!s) return null;
  if (/instagram|\big\b/.test(s)) return "INSTAGRAM";
  if (/facebook|\bfb\b|meta/.test(s)) return "FACEBOOK";
  if (/tiktok/.test(s)) return "TIKTOK";
  if (/youtube/.test(s)) return "YOUTUBE";
  if (/google|adwords/.test(s)) return "GOOGLE";
  if (/refer/.test(s)) return "REFERRAL";
  if (/phone|call|llamada/.test(s)) return "PHONE";
  if (/web|site|form/.test(s)) return "WEBSITE";
  return null;
}

/** Map whatever field names a form/tool uses onto lead fields. Pure; unit-tested. */
export function normalizeFields(raw: RawFields): Normalized {
  const out: Normalized = {
    firstName: "", lastName: "", email: null, phone: null, message: null, program: null, source: null, language: null,
    timeline: null, utmSource: null, utmMedium: null, utmCampaign: null, extra: [], invalid: [],
  };
  let fullName = "";
  for (const [k, v] of Object.entries(raw)) {
    const value = text(v).slice(0, 2000);
    if (!value || k.startsWith("_")) continue;
    const field = ALIASES[key(k)];
    switch (field) {
      case "ignore":
        break;
      case "fullName":
        fullName = value;
        break;
      case "firstName":
      case "lastName":
        out[field] = value.slice(0, 80);
        break;
      case "email": {
        const e = value.toLowerCase();
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) out.email = e;
        else out.invalid.push([k, value]);
        break;
      }
      case "phone": {
        const p = normalizePhone(value);
        if (p) out.phone = p;
        else out.invalid.push([k, value]);
        break;
      }
      case "program":
        out.program = parseProgram(value);
        if (!out.program) out.extra.push([k, value]);
        break;
      case "source":
        out.source = parseSource(value);
        break;
      case "language":
        out.language = /^(es|spa|español|espanol|spanish)/i.test(value) ? "es" : /^(en|eng|english|inglés|ingles)/i.test(value) ? "en" : null;
        break;
      case "message":
        out.message = out.message ? `${out.message}\n${value}` : value;
        break;
      case "timeline":
      case "utmSource":
      case "utmMedium":
      case "utmCampaign":
        out[field] = value.slice(0, 120);
        break;
      default:
        if (out.extra.length < 25) out.extra.push([k.replace(/_/g, " ").slice(0, 80), value.slice(0, 500)]);
    }
  }
  if (fullName && !out.firstName) {
    const parts = fullName.split(/\s+/);
    out.firstName = parts[0].slice(0, 80);
    if (!out.lastName) out.lastName = parts.slice(1).join(" ").slice(0, 80);
  }
  return out;
}

function noteFor(n: Normalized, via: string, extraNote?: string | null) {
  const lines: string[] = [];
  if (n.message) lines.push(n.message);
  if (n.extra.length) lines.push(...n.extra.map(([k, v]) => `${k}: ${v}`));
  if (n.invalid.length) lines.push(...n.invalid.map(([k, v]) => `${k} (unrecognized): ${v}`));
  if (extraNote) lines.push(extraNote);
  return lines.length ? `[${via}]\n${lines.join("\n")}` : null;
}

const TASK_TITLE = {
  en: { new: "Contact new lead", again: "Lead submitted again — follow up" },
  es: { new: "Contactar nuevo prospecto", again: "El prospecto volvió a escribir — dar seguimiento" },
};

/**
 * Next owner under the school's rule. Rotates through active agents (managers/owners when there are
 * no agents). The org row is locked so two leads arriving at once don't go to the same person.
 */
export async function nextOwner(tx: Tx, orgId: string): Promise<string | null> {
  const [org] = await tx.$queryRaw<{ assignMode: string; rrCursorId: string | null }[]>`
    SELECT "assignMode", "rrCursorId" FROM "Organization" WHERE id = ${orgId}::uuid FOR UPDATE`;
  if (!org || org.assignMode !== "ROUND_ROBIN") return null;
  const members = await tx.membership.findMany({ where: { orgId, active: true }, orderBy: { createdAt: "asc" }, select: { id: true, role: true } });
  const agents = members.filter((m) => m.role === "AGENT");
  const pool = agents.length ? agents : members;
  if (!pool.length) return null;
  const i = pool.findIndex((m) => m.id === org.rrCursorId);
  const next = pool[(i + 1) % pool.length];
  await tx.organization.update({ where: { id: orgId }, data: { rrCursorId: next.id } });
  return next.id;
}

export type IngestOptions = {
  /** Provider's id for this submission; a repeat is ignored (providers retry). */
  externalId?: string | null;
  /** Source decided by the integration (e.g. Meta says "ig"), wins over the payload. */
  source?: LeadSource | null;
  /** Extra text for the note (e.g. ad/campaign name). */
  extraNote?: string | null;
  /** Human-readable channel name shown in the timeline, e.g. "Website form". */
  via?: string;
  now?: Date;
};

export type IngestResult = { status: IntakeStatus; leadId: string | null; eventId: string | null; error?: string };

export class RateLimitedError extends AppError {
  constructor() {
    super("RATE_LIMITED", "Too many submissions. Try again in a minute.");
  }
}

export async function ingest(db: Db, integration: Integration, raw: RawFields, opts: IngestOptions = {}): Promise<IngestResult> {
  const now = opts.now ?? new Date();
  const via = opts.via ?? integration.name;
  const log = (status: IntakeStatus, data: { leadId?: string | null; summary?: Prisma.InputJsonValue; error?: string; externalId?: string | null }) =>
    db.$transaction(async (tx) => {
      const ev = await tx.intakeEvent.create({
        data: { orgId: integration.orgId, integrationId: integration.id, status, leadId: data.leadId ?? null, summary: data.summary, error: data.error, externalId: data.externalId ?? null },
      });
      await tx.integration.update({ where: { id: integration.id }, data: { lastEventAt: now } });
      return ev.id;
    });

  if (!integration.active) {
    return { status: "REJECTED", leadId: null, eventId: await log("REJECTED", { error: "Integration is turned off." }), error: "inactive" };
  }
  const recent = await db.intakeEvent.count({ where: { integrationId: integration.id, createdAt: { gt: new Date(now.getTime() - 60_000) } } });
  if (recent >= RATE_LIMIT_PER_MINUTE) throw new RateLimitedError();

  if (opts.externalId) {
    const seen = await db.intakeEvent.findUnique({ where: { integrationId_externalId: { integrationId: integration.id, externalId: opts.externalId } } });
    if (seen) return { status: "DUPLICATE", leadId: seen.leadId, eventId: seen.id };
  }

  const n = normalizeFields(raw);
  const summary = {
    name: `${n.firstName} ${n.lastName}`.trim() || null,
    email: n.email,
    phone: n.phone,
    program: n.program,
    source: opts.source ?? n.source ?? integration.defaultSource,
  } satisfies Prisma.InputJsonValue;

  if (!n.firstName && !n.email && !n.phone) {
    const err = "No name, email or phone in the submission.";
    return { status: "REJECTED", leadId: null, eventId: await log("REJECTED", { summary, error: err, externalId: opts.externalId }), error: err };
  }

  const org = await db.organization.findUniqueOrThrow({ where: { id: integration.orgId }, select: { locale: true } });
  const titles = TASK_TITLE[org.locale === "es" ? "es" : "en"];
  const note = noteFor(n, via, opts.extraNote);

  try {
    const result = await db.$transaction(async (tx) => {
      const or: Prisma.LeadWhereInput[] = [];
      if (n.email) or.push({ email: n.email });
      if (n.phone) or.push({ phone: n.phone });
      const existing = or.length
        ? await tx.lead.findFirst({ where: { orgId: integration.orgId, OR: or }, orderBy: { createdAt: "desc" }, select: { id: true, ownerId: true } })
        : null;

      if (existing) {
        await tx.activity.create({
          data: { orgId: integration.orgId, leadId: existing.id, type: "FORM_SUBMITTED", body: note, meta: { via, source: summary.source } },
        });
        await addContactTask(tx, integration.orgId, existing.id, existing.ownerId, titles.again, now);
        return { status: "MERGED" as const, leadId: existing.id };
      }

      const data = leadInput.parse({
        firstName: n.firstName || n.email?.split("@")[0] || "?",
        lastName: n.lastName,
        email: n.email,
        phone: n.phone,
        language: n.language ?? (org.locale === "es" ? "es" : "en"),
        source: summary.source,
        sourceDetail: via.slice(0, 200),
        program: n.program ?? integration.defaultProgram,
        timeline: n.timeline,
        utmSource: n.utmSource,
        utmMedium: n.utmMedium,
        utmCampaign: n.utmCampaign,
      });
      let ownerId: string | null = null;
      if (integration.defaultOwnerId) {
        const m = await tx.membership.findFirst({ where: { id: integration.defaultOwnerId, orgId: integration.orgId, active: true }, select: { id: true } });
        ownerId = m?.id ?? null;
      }
      ownerId ??= await nextOwner(tx, integration.orgId);
      const lead = await insertLead(tx, integration.orgId, data, { ownerId, actorId: null, note, createdMeta: { source: data.source, via } });
      if (ownerId) await tx.activity.create({ data: { orgId: integration.orgId, leadId: lead.id, type: "ASSIGNED", meta: { from: null, to: ownerId, auto: true } } });
      await addContactTask(tx, integration.orgId, lead.id, ownerId, titles.new, now);
      return { status: "CREATED" as const, leadId: lead.id };
    });
    const eventId = await log(result.status, { leadId: result.leadId, summary, externalId: opts.externalId });
    return { ...result, eventId };
  } catch (e) {
    const err = e instanceof Error ? e.message.slice(0, 300) : "Unknown error";
    console.error("[intake] failed:", err);
    // Logged without the external id so a provider retry can still succeed.
    return { status: "ERROR", leadId: null, eventId: await log("ERROR", { summary, error: err }), error: err };
  }
}

/** A "contact now" task for the owner (or unassigned for a manager to pick up). */
async function addContactTask(tx: Tx, orgId: string, leadId: string, assigneeId: string | null, title: string, now: Date) {
  const open = await tx.task.findFirst({ where: { orgId, leadId, completedAt: null, dueAt: { lte: now } } });
  if (open) return;
  await tx.task.create({ data: { orgId, leadId, title, dueAt: now, assigneeId } });
}
