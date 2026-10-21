import { z } from "zod";
import type { Db, Tx } from "@/lib/db";
import { notFound } from "@/lib/errors";
import type { LeadSource, Program } from "@/generated/prisma/client";
import { PROGRAM_VALUES, SOURCE_VALUES } from "@/lib/enums";
import { ensure, isManager, permissions, type AccessContext } from "@/modules/access";

/**
 * Who gets a lead that arrives automatically:
 *   1. the integration's fixed owner (handled by the caller), else
 *   2. the first active rule whose conditions match (rotating between its members), else
 *   3. the school default: rotate between agents, or leave unassigned.
 * Members with "receiving leads" off are skipped everywhere.
 */

export type LeadTraits = { language: string; program: Program; source: LeadSource };

/** Next member after `cursor` in `pool` (wrapping), or null when the pool is empty. */
export function rotate(pool: string[], cursor: string | null): string | null {
  if (!pool.length) return null;
  const i = cursor ? pool.indexOf(cursor) : -1;
  return pool[(i + 1) % pool.length];
}

export function ruleMatches(rule: { language: string | null; program: Program | null; source: LeadSource | null }, lead: LeadTraits) {
  return (!rule.language || rule.language === lead.language) && (!rule.program || rule.program === lead.program) && (!rule.source || rule.source === lead.source);
}

/** Pick an owner. Locks the school row so two leads arriving together don't land on the same person. */
export async function pickOwner(tx: Tx, orgId: string, lead: LeadTraits): Promise<string | null> {
  const [org] = await tx.$queryRaw<{ assignMode: string; rrCursorId: string | null }[]>`
    SELECT "assignMode", "rrCursorId" FROM "Organization" WHERE id = ${orgId}::uuid FOR UPDATE`;
  if (!org) return null;
  const members = await tx.membership.findMany({
    where: { orgId, active: true, acceptsLeads: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true },
  });
  const available = new Set(members.map((m) => m.id));

  const rules = await tx.assignmentRule.findMany({ where: { orgId, active: true }, orderBy: { position: "asc" } });
  for (const rule of rules) {
    if (!ruleMatches(rule, lead)) continue;
    const next = rotate(rule.memberIds.filter((id) => available.has(id)), rule.cursorId);
    if (!next) continue; // everyone in this rule is away: fall through to the next rule/default
    await tx.assignmentRule.update({ where: { id: rule.id }, data: { cursorId: next } });
    return next;
  }

  if (org.assignMode !== "ROUND_ROBIN") return null;
  const agents = members.filter((m) => m.role === "AGENT").map((m) => m.id);
  const next = rotate(agents.length ? agents : members.map((m) => m.id), org.rrCursorId);
  if (next) await tx.organization.update({ where: { id: orgId }, data: { rrCursorId: next } });
  return next;
}

// ---------------------------------------------------------------------------
// Rule management (owners and managers)
// ---------------------------------------------------------------------------

export function listRules(db: Db, ctx: AccessContext) {
  return db.assignmentRule.findMany({ where: { orgId: ctx.orgId }, orderBy: { position: "asc" } });
}

const ruleInput = z.object({
  name: z.string().trim().min(1, "ruleNameRequired").max(80),
  active: z.boolean().default(true),
  language: z.enum(["en", "es"]).nullable(),
  program: z.enum(PROGRAM_VALUES).nullable(),
  source: z.enum(SOURCE_VALUES).nullable(),
  memberIds: z.array(z.string().uuid()).min(1, "ruleMembersRequired").max(50),
});
export type RuleInput = z.input<typeof ruleInput>;

async function validMembers(db: Db, ctx: AccessContext, ids: string[]) {
  const found = await db.membership.findMany({ where: { orgId: ctx.orgId, id: { in: ids }, active: true }, select: { id: true } });
  if (found.length !== new Set(ids).size) throw notFound();
  return [...new Set(ids)];
}

export async function createRule(db: Db, ctx: AccessContext, input: RuleInput) {
  ensure(isManager(ctx));
  const data = ruleInput.parse(input);
  const memberIds = await validMembers(db, ctx, data.memberIds);
  const last = await db.assignmentRule.aggregate({ where: { orgId: ctx.orgId }, _max: { position: true } });
  return db.assignmentRule.create({ data: { ...data, memberIds, orgId: ctx.orgId, position: (last._max.position ?? -1) + 1 } });
}

export async function updateRule(db: Db, ctx: AccessContext, id: string, input: RuleInput) {
  ensure(isManager(ctx));
  const rule = await db.assignmentRule.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!rule) throw notFound();
  const data = ruleInput.parse(input);
  const memberIds = await validMembers(db, ctx, data.memberIds);
  await db.assignmentRule.update({ where: { id }, data: { ...data, memberIds } });
}

export async function deleteRule(db: Db, ctx: AccessContext, id: string) {
  ensure(isManager(ctx));
  const res = await db.assignmentRule.deleteMany({ where: { id, orgId: ctx.orgId } });
  if (res.count === 0) throw notFound();
}

export async function moveRule(db: Db, ctx: AccessContext, id: string, dir: -1 | 1) {
  ensure(isManager(ctx));
  const rules = await listRules(db, ctx);
  const i = rules.findIndex((r) => r.id === id);
  if (i < 0) throw notFound();
  const j = i + dir;
  if (j < 0 || j >= rules.length) return;
  [rules[i], rules[j]] = [rules[j], rules[i]];
  await db.$transaction(rules.map((r, pos) => db.assignmentRule.update({ where: { id: r.id }, data: { position: pos } })));
}

/** "Receiving leads" switch: people can pause themselves; managers can pause anyone they manage. */
export async function setAcceptsLeads(db: Db, ctx: AccessContext, membershipId: string, on: boolean) {
  const target = await db.membership.findFirst({ where: { id: membershipId, orgId: ctx.orgId } });
  if (!target) throw notFound();
  const self = membershipId === ctx.membershipId;
  ensure(self || ctx.role === "OWNER" || (permissions.manageMembers(ctx) && target.role === "AGENT"));
  await db.membership.update({ where: { id: membershipId }, data: { acceptsLeads: on } });
}
