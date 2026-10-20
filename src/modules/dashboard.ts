import type { Db } from "@/lib/db";
import { startOfDayOffset, todayBounds } from "@/lib/dates";
import { leadScope, type AccessContext } from "@/modules/access";

/** Hours after which a lead nobody has contacted is flagged. Speed-to-lead is the #1 conversion lever. */
export const UNCONTACTED_HOURS = 24;

export async function getDashboard(db: Db, ctx: AccessContext, now = new Date()) {
  const scope = leadScope(ctx);
  const { start: todayStart, end: todayEnd } = todayBounds(now, ctx.timeZone);
  const weekAgo = startOfDayOffset(now, ctx.timeZone, -6);
  const monthAgo = startOfDayOffset(now, ctx.timeZone, -29);
  const staleBefore = new Date(now.getTime() - UNCONTACTED_HOURS * 3_600_000);

  const [stages, byStage, newThisWeek, wonThisMonth, bySource, uncontacted, overdue, dueToday] = await Promise.all([
    db.pipelineStage.findMany({ where: { orgId: ctx.orgId }, orderBy: { position: "asc" } }),
    db.lead.groupBy({ by: ["stageId"], where: scope, _count: { _all: true } }),
    db.lead.count({ where: { ...scope, createdAt: { gte: weekAgo } } }),
    db.lead.count({ where: { ...scope, stage: { kind: "WON" }, stageChangedAt: { gte: monthAgo } } }),
    db.lead.groupBy({ by: ["source"], where: { ...scope, createdAt: { gte: monthAgo } }, _count: { _all: true } }),
    db.lead.findMany({
      where: { ...scope, lastContactAt: null, createdAt: { lt: staleBefore }, stage: { kind: "OPEN" } },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: { id: true, firstName: true, lastName: true, phone: true, source: true, createdAt: true, owner: { select: { user: { select: { name: true } } } } },
    }),
    db.task.count({ where: { orgId: ctx.orgId, assigneeId: ctx.membershipId, completedAt: null, dueAt: { lt: todayStart } } }),
    db.task.count({ where: { orgId: ctx.orgId, assigneeId: ctx.membershipId, completedAt: null, dueAt: { gte: todayStart, lt: todayEnd } } }),
  ]);

  const counts = new Map(byStage.map((r) => [r.stageId, r._count._all]));
  const funnel = stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, color: s.color, count: counts.get(s.id) ?? 0 }));
  const openLeads = funnel.filter((s) => s.kind === "OPEN").reduce((a, s) => a + s.count, 0);

  return {
    openLeads,
    newThisWeek,
    wonThisMonth,
    overdue,
    dueToday,
    funnel,
    bySource: bySource.map((r) => ({ source: r.source, count: r._count._all })).sort((a, b) => b.count - a.count),
    uncontacted,
  };
}
