import { z } from "zod";
import type { Db } from "@/lib/db";
import { conflict, invalid, notFound } from "@/lib/errors";
import type { StageKind } from "@/generated/prisma/client";
import { ensure, permissions, type AccessContext } from "@/modules/access";
import { SUGGESTED_PLAYBOOKS } from "@/modules/playbooks";

/** Default pipeline for a new school, in the owner's language. */
const DEFAULT_STAGES: Record<"en" | "es", { name: string; kind: StageKind; color: string }[]> = {
  en: [
    { name: "New inquiry", kind: "OPEN", color: "sky" },
    { name: "Contacted", kind: "OPEN", color: "indigo" },
    { name: "Discovery flight booked", kind: "OPEN", color: "violet" },
    { name: "Discovery flight done", kind: "OPEN", color: "amber" },
    { name: "Application / funding", kind: "OPEN", color: "orange" },
    { name: "Enrolled", kind: "WON", color: "emerald" },
    { name: "Lost", kind: "LOST", color: "rose" },
  ],
  es: [
    { name: "Nueva consulta", kind: "OPEN", color: "sky" },
    { name: "Contactado", kind: "OPEN", color: "indigo" },
    { name: "Vuelo de descubrimiento agendado", kind: "OPEN", color: "violet" },
    { name: "Vuelo de descubrimiento hecho", kind: "OPEN", color: "amber" },
    { name: "Solicitud / financiamiento", kind: "OPEN", color: "orange" },
    { name: "Inscrito", kind: "WON", color: "emerald" },
    { name: "Perdido", kind: "LOST", color: "rose" },
  ],
};

export const STAGE_COLORS = ["slate", "sky", "indigo", "violet", "amber", "orange", "emerald", "rose", "teal", "pink"] as const;

const timeZoneSchema = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "invalidTimeZone");

export const createOrgInput = z.object({
  name: z.string().trim().min(2, "orgNameRequired").max(120),
  timeZone: timeZoneSchema,
  locale: z.enum(["en", "es"]).default("en"),
});

/** Create a school with its owner and the default pipeline. Used by sign-up. */
export async function createOrganization(db: Db, userId: string, input: z.input<typeof createOrgInput>) {
  const data = createOrgInput.parse(input);
  return db.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: data.name, timeZone: data.timeZone, locale: data.locale } });
    await tx.membership.create({ data: { orgId: org.id, userId, role: "OWNER" } });
    await tx.pipelineStage.createMany({
      data: DEFAULT_STAGES[data.locale].map((s, i) => ({ orgId: org.id, position: i, ...s, ...SUGGESTED_PLAYBOOKS[data.locale][i] })),
    });
    return org;
  });
}

export const orgSettingsInput = z.object({
  name: z.string().trim().min(2, "orgNameRequired").max(120),
  timeZone: timeZoneSchema,
  agentsSeeAll: z.boolean(),
  requireNextStep: z.boolean(),
});

export async function updateOrgSettings(db: Db, ctx: AccessContext, input: z.input<typeof orgSettingsInput>) {
  ensure(permissions.manageOrg(ctx));
  const data = orgSettingsInput.parse(input);
  await db.organization.update({ where: { id: ctx.orgId }, data });
}

// ---------------------------------------------------------------------------
// Pipeline stages
// ---------------------------------------------------------------------------

export function listStages(db: Db, ctx: AccessContext) {
  return db.pipelineStage.findMany({ where: { orgId: ctx.orgId }, orderBy: { position: "asc" } });
}

const stageInput = z.object({
  name: z.string().trim().min(1, "stageNameRequired").max(60),
  kind: z.enum(["OPEN", "WON", "LOST"]),
  color: z.enum(STAGE_COLORS),
});

export async function addStage(db: Db, ctx: AccessContext, input: z.input<typeof stageInput>) {
  ensure(permissions.manageOrg(ctx));
  const data = stageInput.parse(input);
  const last = await db.pipelineStage.aggregate({ where: { orgId: ctx.orgId }, _max: { position: true } });
  return db.pipelineStage.create({ data: { ...data, orgId: ctx.orgId, position: (last._max.position ?? -1) + 1 } });
}

export async function updateStage(db: Db, ctx: AccessContext, stageId: string, input: z.input<typeof stageInput>) {
  ensure(permissions.manageOrg(ctx));
  const data = stageInput.parse(input);
  const stage = await db.pipelineStage.findFirst({ where: { id: stageId, orgId: ctx.orgId } });
  if (!stage) throw notFound();
  if (stage.kind !== data.kind) await assertKindRemains(db, ctx.orgId, stage.kind, stageId);
  await db.pipelineStage.update({ where: { id: stageId }, data });
}

/** Move a stage one step left (-1) or right (+1). */
export async function moveStage(db: Db, ctx: AccessContext, stageId: string, dir: -1 | 1) {
  ensure(permissions.manageOrg(ctx));
  const stages = await listStages(db, ctx);
  const i = stages.findIndex((s) => s.id === stageId);
  if (i < 0) throw notFound();
  const j = i + dir;
  if (j < 0 || j >= stages.length) return;
  [stages[i], stages[j]] = [stages[j], stages[i]];
  await db.$transaction(stages.map((s, pos) => db.pipelineStage.update({ where: { id: s.id }, data: { position: pos } })));
}

export async function deleteStage(db: Db, ctx: AccessContext, stageId: string) {
  ensure(permissions.manageOrg(ctx));
  const stage = await db.pipelineStage.findFirst({ where: { id: stageId, orgId: ctx.orgId }, include: { _count: { select: { leads: true } } } });
  if (!stage) throw notFound();
  if (stage._count.leads > 0) throw conflict("stageNotEmpty");
  await assertKindRemains(db, ctx.orgId, stage.kind, stageId);
  await db.pipelineStage.delete({ where: { id: stageId } });
}

/** The board needs at least one OPEN, one WON and one LOST stage. */
async function assertKindRemains(db: Db, orgId: string, kind: StageKind, excludingId: string) {
  const others = await db.pipelineStage.count({ where: { orgId, kind, id: { not: excludingId } } });
  if (others === 0) throw invalid("stageKindRequired");
}

// ---------------------------------------------------------------------------
// Playbooks
// ---------------------------------------------------------------------------

const playbookInput = z.object({
  playbook: z.string().max(10_000).transform((v) => v.trim() || null),
  checklist: z
    .array(z.string().trim().max(200))
    .max(20)
    .transform((items) => [...new Set(items.filter(Boolean))]),
});

export async function updatePlaybook(db: Db, ctx: AccessContext, stageId: string, input: z.input<typeof playbookInput>) {
  ensure(permissions.manageOrg(ctx));
  const data = playbookInput.parse(input);
  const res = await db.pipelineStage.updateMany({ where: { id: stageId, orgId: ctx.orgId }, data });
  if (res.count === 0) throw notFound();
}

/**
 * Fill stages that have no playbook yet with the suggested text, matching default stage names in
 * either language. Returns how many stages were filled. Never overwrites a school's own playbook.
 */
export async function applySuggestedPlaybooks(db: Db, ctx: AccessContext) {
  ensure(permissions.manageOrg(ctx));
  const stages = await listStages(db, ctx);
  let filled = 0;
  for (const stage of stages) {
    if (stage.playbook || stage.checklist.length) continue;
    for (const locale of ["en", "es"] as const) {
      const i = DEFAULT_STAGES[locale].findIndex((d) => d.name.toLowerCase() === stage.name.trim().toLowerCase());
      if (i < 0) continue;
      await db.pipelineStage.update({ where: { id: stage.id }, data: SUGGESTED_PLAYBOOKS[locale][i] });
      filled++;
      break;
    }
  }
  return filled;
}
