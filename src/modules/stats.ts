import type { Db } from "@/lib/db";
import { startOfDayOffset } from "@/lib/dates";
import { NEEDS_NEXT_STEP } from "@/modules/leads";
import { permissions, type AccessContext } from "@/modules/access";

/**
 * Per-person performance for coaching. Lead outcomes are credited to the lead's current owner;
 * activity (calls, stage moves) to whoever did it. Managers see everyone, agents only themselves.
 */

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

export type MemberStats = {
  membershipId: string;
  name: string;
  role: string;
  acceptsLeads: boolean;
  newLeads: number;
  contacted: number;
  /** Median minutes from lead creation to first real contact, for leads contacted. */
  medianResponseMin: number | null;
  /** Share of new leads contacted within 1 hour. */
  within1h: number | null;
  calls: number;
  connectedCalls: number;
  touches: number;
  milestone: number;
  enrolled: number;
  lost: number;
  openNow: number;
  noNextStepNow: number;
  overdueNow: number;
};

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * @param milestoneStageId stage that counts as the key milestone (e.g. "Discovery flight booked");
 *   defaults to the school's third stage.
 */
export async function teamStats(db: Db, ctx: AccessContext, days: Period, milestoneStageId?: string | null, now = new Date()) {
  const since = startOfDayOffset(now, ctx.timeZone, -(days - 1));
  const everyone = permissions.viewTeam(ctx);
  const memberWhere = { orgId: ctx.orgId, ...(everyone ? { active: true } : { id: ctx.membershipId }) };

  const [members, stages] = await Promise.all([
    db.membership.findMany({ where: memberWhere, orderBy: { createdAt: "asc" }, select: { id: true, role: true, acceptsLeads: true, user: { select: { name: true } } } }),
    db.pipelineStage.findMany({ where: { orgId: ctx.orgId }, orderBy: { position: "asc" }, select: { id: true, name: true, kind: true } }),
  ]);
  const ids = members.map((m) => m.id);
  const milestone = stages.find((s) => s.id === milestoneStageId) ?? stages.filter((s) => s.kind === "OPEN")[2] ?? stages[0];

  const [newLeads, activities, closed, open, noNext, overdue] = await Promise.all([
    db.lead.findMany({ where: { orgId: ctx.orgId, ownerId: { in: ids }, createdAt: { gte: since } }, select: { ownerId: true, createdAt: true, firstContactAt: true } }),
    db.activity.findMany({
      where: { orgId: ctx.orgId, actorId: { in: ids }, createdAt: { gte: since }, type: { in: ["CALL", "EMAIL", "SMS", "MEETING", "STAGE_CHANGE"] } },
      select: { actorId: true, type: true, meta: true },
    }),
    db.lead.groupBy({
      by: ["ownerId", "stageId"],
      where: { orgId: ctx.orgId, ownerId: { in: ids }, stageChangedAt: { gte: since }, stage: { kind: { in: ["WON", "LOST"] } } },
      _count: { _all: true },
    }),
    db.lead.groupBy({ by: ["ownerId"], where: { orgId: ctx.orgId, ownerId: { in: ids }, stage: { kind: "OPEN" } }, _count: { _all: true } }),
    db.lead.groupBy({ by: ["ownerId"], where: { orgId: ctx.orgId, ownerId: { in: ids }, ...NEEDS_NEXT_STEP }, _count: { _all: true } }),
    db.task.groupBy({ by: ["assigneeId"], where: { orgId: ctx.orgId, assigneeId: { in: ids }, completedAt: null, dueAt: { lt: now } }, _count: { _all: true } }),
  ]);

  const kindOf = new Map(stages.map((s) => [s.id, s.kind]));
  const count = <K extends string>(rows: ({ _count: { _all: number } } & Record<K, string | null>)[], key: K, id: string) =>
    rows.filter((r) => r[key] === id).reduce((a, r) => a + r._count._all, 0);

  const rows: MemberStats[] = members.map((m) => {
    const mine = newLeads.filter((l) => l.ownerId === m.id);
    const waits = mine.filter((l) => l.firstContactAt).map((l) => (l.firstContactAt!.getTime() - l.createdAt.getTime()) / 60_000);
    const acts = activities.filter((a) => a.actorId === m.id);
    const calls = acts.filter((a) => a.type === "CALL");
    const metaOf = (a: { meta: unknown }) => (a.meta ?? {}) as Record<string, unknown>;
    return {
      membershipId: m.id,
      name: m.user.name,
      role: m.role,
      acceptsLeads: m.acceptsLeads,
      newLeads: mine.length,
      contacted: waits.length,
      medianResponseMin: median(waits.map((w) => Math.max(0, w))),
      within1h: mine.length ? waits.filter((w) => w <= 60).length / mine.length : null,
      calls: calls.length,
      connectedCalls: calls.filter((a) => (metaOf(a).outcome ?? "CONNECTED") === "CONNECTED").length,
      touches: acts.filter((a) => a.type !== "STAGE_CHANGE").length,
      milestone: acts.filter((a) => a.type === "STAGE_CHANGE" && metaOf(a).toId === milestone?.id).length,
      enrolled: closed.filter((r) => r.ownerId === m.id && kindOf.get(r.stageId) === "WON").reduce((a, r) => a + r._count._all, 0),
      lost: closed.filter((r) => r.ownerId === m.id && kindOf.get(r.stageId) === "LOST").reduce((a, r) => a + r._count._all, 0),
      openNow: count(open, "ownerId", m.id),
      noNextStepNow: count(noNext, "ownerId", m.id),
      overdueNow: count(overdue, "assigneeId", m.id),
    };
  });

  const sum = (k: keyof MemberStats) => rows.reduce((a, r) => a + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);
  const allWaits = newLeads.filter((l) => l.firstContactAt).map((l) => (l.firstContactAt!.getTime() - l.createdAt.getTime()) / 60_000);
  const totals = {
    newLeads: sum("newLeads"),
    contacted: sum("contacted"),
    medianResponseMin: median(allWaits.map((w) => Math.max(0, w))),
    within1h: newLeads.length ? allWaits.filter((w) => w <= 60).length / newLeads.length : null,
    calls: sum("calls"),
    connectedCalls: sum("connectedCalls"),
    touches: sum("touches"),
    milestone: sum("milestone"),
    enrolled: sum("enrolled"),
    lost: sum("lost"),
    openNow: sum("openNow"),
    noNextStepNow: sum("noNextStepNow"),
    overdueNow: sum("overdueNow"),
  };

  return { rows, totals, milestone: milestone ? { id: milestone.id, name: milestone.name } : null, stages: stages.filter((s) => s.kind === "OPEN"), since };
}
