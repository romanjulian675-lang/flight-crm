import { z } from "zod";
import type { Db, Tx } from "@/lib/db";
import { invalid, notFound } from "@/lib/errors";
import type { ActivityType, Prisma } from "@/generated/prisma/client";
import { CALL_OUTCOME_VALUES as CALL_OUTCOMES, FUNDING_VALUES as FUNDING, MEDICAL_VALUES as MEDICAL, PROGRAM_VALUES as PROGRAMS, SOURCE_VALUES as SOURCES } from "@/lib/enums";
import { zonedToUtc } from "@/lib/dates";
import { ensure, leadScope, permissions, type AccessContext } from "@/modules/access";

/** Digits only; a bare 10-digit number is assumed to be US/Canada (+1). */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.length === 10 ? `1${digits}` : digits;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

export const leadInput = z
  .object({
    firstName: z.string().trim().min(1, "firstNameRequired").max(80),
    lastName: z.string().trim().max(80).default(""),
    email: z
      .union([z.email("emailInvalid"), z.literal("")])
      .optional()
      .nullable()
      .transform((v) => (v ? v.toLowerCase() : null)),
    phone: z
      .string()
      .optional()
      .nullable()
      .transform((v, c) => {
        if (!v?.trim()) return null;
        const p = normalizePhone(v);
        if (!p) c.addIssue({ code: "custom", message: "phoneInvalid" });
        return p;
      }),
    language: z.enum(["en", "es"]).default("en"),
    source: z.enum(SOURCES).default("OTHER"),
    sourceDetail: optionalText(200),
    program: z.enum(PROGRAMS).default("PRIVATE"),
    medical: z.enum(MEDICAL).default("UNKNOWN"),
    funding: z.enum(FUNDING).default("UNKNOWN"),
    timeline: optionalText(120),
    isInternational: z.boolean().default(false),
    utmSource: optionalText(120),
    utmMedium: optionalText(120),
    utmCampaign: optionalText(120),
  });

export type LeadInput = z.input<typeof leadInput>;

const EDITABLE_FIELDS = [
  "firstName", "lastName", "email", "phone", "language", "source", "sourceDetail", "program", "medical", "funding", "timeline", "isInternational",
] as const;

async function getScopedLead(db: Db | Tx, ctx: AccessContext, leadId: string) {
  const lead = await db.lead.findFirst({ where: { id: leadId, ...leadScope(ctx) }, include: { stage: true } });
  if (!lead) throw notFound();
  return lead;
}

function addActivity(db: Db | Tx, ctx: AccessContext | null, orgId: string, leadId: string, type: ActivityType, body?: string | null, meta?: Prisma.InputJsonValue) {
  return db.activity.create({ data: { orgId, leadId, actorId: ctx?.membershipId ?? null, type, body: body ?? null, meta } });
}

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------

/**
 * Leads in the school with the same email or phone. Searches the whole school (not only the caller's
 * leads) so an agent doesn't create a second record for someone a colleague is already working;
 * only name, stage and owner are returned.
 */
export async function findDuplicates(db: Db, ctx: AccessContext, email: string | null, phone: string | null, excludeId?: string) {
  const or: Prisma.LeadWhereInput[] = [];
  if (email) or.push({ email });
  if (phone) or.push({ phone });
  if (or.length === 0) return [];
  return db.lead.findMany({
    where: { orgId: ctx.orgId, OR: or, ...(excludeId ? { id: { not: excludeId } } : {}) },
    take: 5,
    orderBy: { createdAt: "desc" },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, stage: { select: { name: true } }, owner: { select: { user: { select: { name: true } } } } },
  });
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

export async function createLead(
  db: Db,
  ctx: AccessContext,
  input: LeadInput & { ownerId?: string | null; note?: string | null },
) {
  const data = leadInput.parse(input);
  // Agents always own what they create; managers may assign to anyone in the school (or nobody).
  let ownerId: string | null = ctx.membershipId;
  if (permissions.assignLeads(ctx) && input.ownerId !== undefined) ownerId = await assertMember(db, ctx, input.ownerId);
  return db.$transaction((tx) => insertLead(tx, ctx.orgId, data, { ownerId, actorId: ctx.membershipId, note: input.note }));
}

/**
 * Insert a validated lead at the top of the school's first open stage, with its CREATED activity
 * (and an optional first note). Shared by manual entry and automatic intake (actorId null = system).
 */
export async function insertLead(
  tx: Tx,
  orgId: string,
  data: z.output<typeof leadInput>,
  opts: { ownerId: string | null; actorId: string | null; note?: string | null; createdMeta?: Prisma.InputJsonValue },
) {
  const stage = await tx.pipelineStage.findFirst({ where: { orgId, kind: "OPEN" }, orderBy: { position: "asc" } });
  if (!stage) throw invalid("stageKindRequired");
  const top = await tx.lead.aggregate({ where: { orgId, stageId: stage.id }, _min: { position: true } });
  const lead = await tx.lead.create({
    data: { ...data, orgId, stageId: stage.id, ownerId: opts.ownerId, position: (top._min.position ?? 1) - 1 },
  });
  await tx.activity.create({ data: { orgId, leadId: lead.id, actorId: opts.actorId, type: "CREATED", meta: opts.createdMeta ?? { source: data.source } } });
  const note = opts.note?.trim();
  if (note) await tx.activity.create({ data: { orgId, leadId: lead.id, actorId: opts.actorId, type: "NOTE", body: note.slice(0, 5000) } });
  return lead;
}

export async function updateLead(db: Db, ctx: AccessContext, leadId: string, input: LeadInput) {
  const before = await getScopedLead(db, ctx, leadId);
  const data = leadInput.parse(input);
  const changed = EDITABLE_FIELDS.filter((f) => before[f] !== data[f]);
  if (changed.length === 0) return;
  await db.$transaction([
    db.lead.update({ where: { id: leadId }, data }),
    db.activity.create({ data: { orgId: ctx.orgId, leadId, actorId: ctx.membershipId, type: "UPDATED", meta: { fields: [...changed] } } }),
  ]);
}

async function assertMember(db: Db | Tx, ctx: AccessContext, membershipId: string | null) {
  if (!membershipId) return null;
  const m = await db.membership.findFirst({ where: { id: membershipId, orgId: ctx.orgId, active: true }, select: { id: true } });
  if (!m) throw invalid("memberNotFound");
  return m.id;
}

export async function assignLead(db: Db, ctx: AccessContext, leadId: string, ownerId: string | null) {
  ensure(permissions.assignLeads(ctx));
  const lead = await getScopedLead(db, ctx, leadId);
  const newOwner = await assertMember(db, ctx, ownerId);
  if (lead.ownerId === newOwner) return;
  await db.$transaction([
    db.lead.update({ where: { id: leadId }, data: { ownerId: newOwner } }),
    db.activity.create({ data: { orgId: ctx.orgId, leadId, actorId: ctx.membershipId, type: "ASSIGNED", meta: { from: lead.ownerId, to: newOwner } } }),
  ]);
}

/**
 * Move a lead to a stage, above `beforeId` (or to the bottom when null). Positions are fractional
 * so only the moved row is written.
 */
export async function moveLead(db: Db, ctx: AccessContext, leadId: string, stageId: string, beforeId: string | null, lostReason?: string | null) {
  const lead = await getScopedLead(db, ctx, leadId);
  const stage = await db.pipelineStage.findFirst({ where: { id: stageId, orgId: ctx.orgId } });
  if (!stage) throw notFound();

  let position: number;
  const before = beforeId && beforeId !== leadId ? await db.lead.findFirst({ where: { id: beforeId, orgId: ctx.orgId, stageId } }) : null;
  if (before) {
    const above = await db.lead.findFirst({
      where: { orgId: ctx.orgId, stageId, position: { lt: before.position }, id: { not: leadId } },
      orderBy: { position: "desc" },
    });
    position = above ? (above.position + before.position) / 2 : before.position - 1;
  } else {
    const last = await db.lead.aggregate({ where: { orgId: ctx.orgId, stageId, id: { not: leadId } }, _max: { position: true } });
    position = (last._max.position ?? -1) + 1;
  }

  const stageChanged = lead.stageId !== stageId;
  const reason = stage.kind === "LOST" ? lostReason?.trim().slice(0, 200) || null : null;
  await db.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      data: { stageId, position, ...(stageChanged ? { stageChangedAt: new Date(), lostReason: reason } : {}) },
    });
    if (stageChanged) {
      await addActivity(tx, ctx, ctx.orgId, leadId, "STAGE_CHANGE", reason, { from: lead.stage.name, to: stage.name, fromId: lead.stageId, toId: stage.id, toKind: stage.kind });
    }
  });
}

export async function deleteLead(db: Db, ctx: AccessContext, leadId: string) {
  ensure(permissions.deleteLeads(ctx));
  await getScopedLead(db, ctx, leadId);
  await db.lead.delete({ where: { id: leadId } });
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

const followUpInput = z.object({
  title: z.string().trim().min(1, "taskTitleRequired").max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateInvalid"),
  time: z.string().regex(/^\d{2}:\d{2}$/).default("09:00"),
});

export const logInput = z.object({
  type: z.enum(["NOTE", "CALL", "EMAIL", "SMS", "MEETING"]),
  body: z.string().trim().max(5000).default(""),
  outcome: z.enum(CALL_OUTCOMES).optional().nullable(),
  direction: z.enum(["OUT", "IN"]).default("OUT"),
  /** Schedule the next step in the same save (required for open leads when the school says so). */
  followUp: followUpInput.optional().nullable(),
});

export async function logActivity(db: Db, ctx: AccessContext, leadId: string, input: z.input<typeof logInput>, now = new Date()) {
  const lead = await getScopedLead(db, ctx, leadId);
  const data = logInput.parse(input);
  if (data.type === "NOTE" && !data.body) throw invalid("noteRequired");
  const meta = data.type === "NOTE" ? undefined : { direction: data.direction, ...(data.type === "CALL" && data.outcome ? { outcome: data.outcome } : {}) };
  // Only a real two-way touch counts as "contacted" (a voicemail or no-answer does not).
  const touched = data.type !== "NOTE" && !(data.type === "CALL" && data.outcome && data.outcome !== "CONNECTED");

  // Every touch on an open lead must leave a next step behind, so no lead silently goes cold.
  if (data.type !== "NOTE" && lead.stage.kind === "OPEN" && !data.followUp) {
    const org = await db.organization.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { requireNextStep: true } });
    const open = org.requireNextStep && (await db.task.count({ where: { orgId: ctx.orgId, leadId, completedAt: null } }));
    if (org.requireNextStep && !open) throw invalid("nextStepRequired");
  }

  await db.$transaction(async (tx) => {
    await tx.activity.create({ data: { orgId: ctx.orgId, leadId, actorId: ctx.membershipId, type: data.type, body: data.body || null, meta } });
    if (touched) await tx.lead.update({ where: { id: leadId }, data: { lastContactAt: now, ...(lead.firstContactAt ? {} : { firstContactAt: now }) } });
    if (data.followUp) {
      await tx.task.create({
        data: {
          orgId: ctx.orgId,
          leadId,
          title: data.followUp.title,
          dueAt: zonedToUtc(data.followUp.date, data.followUp.time, ctx.timeZone),
          assigneeId: lead.ownerId && lead.ownerId !== ctx.membershipId && permissions.assignLeads(ctx) ? lead.ownerId : ctx.membershipId,
          createdById: ctx.membershipId,
        },
      });
    }
  });
}

/** Tick or untick a playbook checklist item for the lead's stage. */
export async function setChecklistItem(db: Db, ctx: AccessContext, leadId: string, stageId: string, item: string, checked: boolean) {
  const lead = await getScopedLead(db, ctx, leadId);
  const stage = await db.pipelineStage.findFirst({ where: { id: stageId, orgId: ctx.orgId }, select: { checklist: true } });
  if (!stage || !stage.checklist.includes(item)) throw notFound();
  const all = { ...((lead.checklist ?? {}) as Record<string, string[]>) };
  const done = new Set(all[stageId] ?? []);
  if (checked) done.add(item);
  else done.delete(item);
  all[stageId] = [...done];
  await db.lead.update({ where: { id: leadId }, data: { checklist: all } });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const leadFilters = z.object({
  q: z.string().trim().max(100).optional(),
  owner: z.string().optional(), // membership id, "me" or "none"
  source: z.enum(SOURCES).optional(),
  program: z.enum(PROGRAMS).optional(),
  /** Only open leads with no scheduled follow-up. */
  noNext: z.literal("1").optional(),
});
export type LeadFilters = z.infer<typeof leadFilters>;

export function parseFilters(params: Record<string, string | string[] | undefined>): LeadFilters {
  const pick = (k: string) => (typeof params[k] === "string" && params[k] ? (params[k] as string) : undefined);
  const res = leadFilters.safeParse({ q: pick("q"), owner: pick("owner"), source: pick("source"), program: pick("program"), noNext: pick("noNext") });
  return res.success ? res.data : {};
}

/** Open leads with nothing scheduled: the ones about to go cold. */
export const NEEDS_NEXT_STEP = { stage: { kind: "OPEN" }, tasks: { none: { completedAt: null } } } satisfies Prisma.LeadWhereInput;

function filterWhere(ctx: AccessContext, f: LeadFilters): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { ...leadScope(ctx) };
  if (f.owner === "me") where.ownerId = ctx.membershipId;
  else if (f.owner === "none") where.ownerId = permissions.seeAllLeads(ctx) ? null : ctx.membershipId;
  else if (f.owner && permissions.seeAllLeads(ctx)) where.ownerId = f.owner;
  if (f.source) where.source = f.source;
  if (f.program) where.program = f.program;
  if (f.noNext) Object.assign(where, NEEDS_NEXT_STEP);
  if (f.q) {
    const digits = f.q.replace(/\D/g, "");
    where.OR = [
      { firstName: { contains: f.q, mode: "insensitive" } },
      { lastName: { contains: f.q, mode: "insensitive" } },
      { email: { contains: f.q, mode: "insensitive" } },
      ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
    ];
  }
  return where;
}

const cardSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  source: true,
  program: true,
  stageId: true,
  position: true,
  lastContactAt: true,
  stageChangedAt: true,
  createdAt: true,
  owner: { select: { id: true, user: { select: { name: true } } } },
  tasks: { where: { completedAt: null }, orderBy: { dueAt: "asc" }, take: 1, select: { dueAt: true } },
} satisfies Prisma.LeadSelect;

export type LeadCard = Prisma.LeadGetPayload<{ select: typeof cardSelect }>;

/** Pipeline board: every stage with its leads in order. */
export async function getBoard(db: Db, ctx: AccessContext, f: LeadFilters) {
  const [stages, leads] = await Promise.all([
    db.pipelineStage.findMany({ where: { orgId: ctx.orgId }, orderBy: { position: "asc" } }),
    db.lead.findMany({ where: filterWhere(ctx, f), orderBy: { position: "asc" }, select: cardSelect, take: 2000 }),
  ]);
  return stages.map((s) => ({ ...s, leads: leads.filter((l) => l.stageId === s.id) }));
}

export function listLeads(db: Db, ctx: AccessContext, f: LeadFilters) {
  return db.lead.findMany({
    where: filterWhere(ctx, f),
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { ...cardSelect, stage: { select: { name: true, color: true, kind: true } } },
  });
}

export async function getLead(db: Db, ctx: AccessContext, leadId: string) {
  const lead = await db.lead.findFirst({
    where: { id: leadId, ...leadScope(ctx) },
    include: {
      stage: true,
      owner: { select: { id: true, user: { select: { name: true } } } },
      activities: { orderBy: { createdAt: "desc" }, take: 200, include: { actor: { select: { user: { select: { name: true } } } } } },
      tasks: {
        orderBy: [{ completedAt: { sort: "desc", nulls: "first" } }, { dueAt: "asc" }],
        include: { assignee: { select: { id: true, user: { select: { name: true } } } } },
      },
    },
  });
  if (!lead) throw notFound();
  return lead;
}
