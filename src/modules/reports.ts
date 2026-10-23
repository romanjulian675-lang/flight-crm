import type { Db } from "@/lib/db";
import { startOfDayOffset } from "@/lib/dates";
import { leadScope, permissions, type AccessContext } from "@/modules/access";
import { median } from "@/modules/stats";

/**
 * School-level reports for deciding what to fix next. The funnel is a cohort: leads created in the
 * window, and how far each one got (from its stage history, so a lead that reached "Discovery flight
 * booked" and was then lost still counts as having reached it).
 */

export const REPORT_PERIODS = [30, 90, 365] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

/** A lead sitting this many days in an open stage is "stuck". */
export const STUCK_DAYS = 14;

const DAY = 86_400_000;

export async function getReports(db: Db, ctx: AccessContext, days: ReportPeriod, now = new Date()) {
  const scope = leadScope(ctx);
  const since = startOfDayOffset(now, ctx.timeZone, -(days - 1));
  const prevSince = new Date(since.getTime() - days * DAY);

  const stages = await db.pipelineStage.findMany({ where: { orgId: ctx.orgId }, orderBy: { position: "asc" }, select: { id: true, name: true, kind: true, color: true, position: true } });
  const steps = stages.filter((s) => s.kind !== "LOST");
  const won = new Set(stages.filter((s) => s.kind === "WON").map((s) => s.id));
  const lostIds = new Set(stages.filter((s) => s.kind === "LOST").map((s) => s.id));
  const stepIndex = new Map(steps.map((s, i) => [s.id, i]));

  const leadSelect = { id: true, stageId: true, source: true, ownerId: true, createdAt: true, firstContactAt: true, lostReason: true, stageChangedAt: true } as const;
  const [cohort, prevCohort, openNow, wonInPeriod, wonPrev, members] = await Promise.all([
    db.lead.findMany({ where: { ...scope, createdAt: { gte: since } }, select: leadSelect }),
    db.lead.findMany({ where: { ...scope, createdAt: { gte: prevSince, lt: since } }, select: { id: true, stageId: true, createdAt: true, firstContactAt: true } }),
    db.lead.findMany({ where: { ...scope, stage: { kind: "OPEN" } }, select: { stageId: true, stageChangedAt: true } }),
    db.lead.count({ where: { ...scope, stage: { kind: "WON" }, stageChangedAt: { gte: since } } }),
    db.lead.count({ where: { ...scope, stage: { kind: "WON" }, stageChangedAt: { gte: prevSince, lt: since } } }),
    permissions.viewTeam(ctx)
      ? db.membership.findMany({ where: { orgId: ctx.orgId, active: true }, orderBy: { createdAt: "asc" }, select: { id: true, acceptsLeads: true, user: { select: { name: true } } } })
      : Promise.resolve(null),
  ]);

  // Furthest step each cohort lead reached, from its stage moves plus where it is now.
  const moves = cohort.length
    ? await db.activity.findMany({ where: { orgId: ctx.orgId, type: "STAGE_CHANGE", leadId: { in: cohort.map((l) => l.id) } }, select: { leadId: true, meta: true } })
    : [];
  const reached = new Map<string, number>();
  const bump = (leadId: string, stageId: unknown) => {
    const i = typeof stageId === "string" ? stepIndex.get(stageId) : undefined;
    if (i !== undefined && i > (reached.get(leadId) ?? -1)) reached.set(leadId, i);
  };
  for (const l of cohort) {
    reached.set(l.id, 0); // every lead entered at the first step
    bump(l.id, l.stageId);
  }
  for (const m of moves) {
    const meta = (m.meta ?? {}) as Record<string, unknown>;
    bump(m.leadId, meta.fromId);
    bump(m.leadId, meta.toId);
  }

  const funnel = steps.map((s, i) => {
    const count = cohort.filter((l) => (reached.get(l.id) ?? 0) >= i).length;
    return { id: s.id, name: s.name, kind: s.kind, color: s.color, count };
  });
  const funnelSteps = funnel.map((s, i) => {
    const prev = i ? funnel[i - 1].count : s.count;
    return { ...s, ofTop: cohort.length ? s.count / cohort.length : 0, fromPrev: i && prev ? s.count / prev : null, dropped: i ? prev - s.count : 0 };
  });
  // The step that loses the most people (by count; on a tie, the lower pass-through rate): the screen's one finding.
  const worse = (a: (typeof funnelSteps)[number], b: (typeof funnelSteps)[number]) => a.dropped > b.dropped || (a.dropped === b.dropped && (a.fromPrev ?? 1) < (b.fromPrev ?? 1));
  const biggestDrop = funnelSteps.reduce<number | null>((best, s, i) => (i && s.dropped > 0 && (best === null || worse(s, funnelSteps[best])) ? i : best), null);

  const enrolledCohort = cohort.filter((l) => won.has(l.stageId)).length;
  const prevEnrolledCohort = prevCohort.filter((l) => won.has(l.stageId)).length;
  const waits = (rows: { createdAt: Date; firstContactAt: Date | null }[]) =>
    rows.filter((l) => l.firstContactAt).map((l) => Math.max(0, (l.firstContactAt!.getTime() - l.createdAt.getTime()) / 60_000));

  const kpis = {
    newLeads: { now: cohort.length, prev: prevCohort.length },
    enrolled: { now: wonInPeriod, prev: wonPrev },
    conversion: { now: cohort.length ? enrolledCohort / cohort.length : null, prev: prevCohort.length ? prevEnrolledCohort / prevCohort.length : null },
    responseMin: { now: median(waits(cohort)), prev: median(waits(prevCohort)) },
  };

  // Where people are right now, and who is going stale.
  const current = stages
    .filter((s) => s.kind === "OPEN")
    .map((s) => {
      const here = openNow.filter((l) => l.stageId === s.id);
      const ages = here.map((l) => (now.getTime() - l.stageChangedAt.getTime()) / DAY);
      return {
        id: s.id,
        name: s.name,
        color: s.color,
        count: here.length,
        avgDays: ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null,
        stuck: ages.filter((d) => d >= STUCK_DAYS).length,
      };
    });

  // Which channels bring students, not just leads.
  const sourceMap = new Map<string, { leads: number; contacted: number; enrolled: number }>();
  for (const l of cohort) {
    const r = sourceMap.get(l.source) ?? { leads: 0, contacted: 0, enrolled: 0 };
    r.leads++;
    if (l.firstContactAt) r.contacted++;
    if (won.has(l.stageId)) r.enrolled++;
    sourceMap.set(l.source, r);
  }
  const sources = [...sourceMap].map(([source, r]) => ({ source, ...r, conversion: r.leads ? r.enrolled / r.leads : 0 })).sort((a, b) => b.enrolled - a.enrolled || b.leads - a.leads);

  // Why we lose them.
  const lostCohort = cohort.filter((l) => lostIds.has(l.stageId));
  const reasonMap = new Map<string, number>();
  for (const l of lostCohort) {
    const key = (l.lostReason ?? "").trim();
    const label = key ? key[0].toUpperCase() + key.slice(1) : "";
    reasonMap.set(label, (reasonMap.get(label) ?? 0) + 1);
  }
  const reasons = [...reasonMap].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);

  // Ranking by enrolled students, then conversion, then speed.
  const team = members
    ?.map((m) => {
      const mine = cohort.filter((l) => l.ownerId === m.id);
      const w = waits(mine);
      const enrolled = mine.filter((l) => won.has(l.stageId)).length;
      return {
        id: m.id,
        name: m.user.name,
        leads: mine.length,
        enrolled,
        conversion: mine.length ? enrolled / mine.length : null,
        responseMin: median(w),
        within1h: mine.length ? w.filter((x) => x <= 60).length / mine.length : null,
      };
    })
    .filter((r) => r.leads > 0)
    .sort((a, b) => b.enrolled - a.enrolled || (b.conversion ?? 0) - (a.conversion ?? 0) || (a.responseMin ?? Infinity) - (b.responseMin ?? Infinity));
  const unassigned = cohort.filter((l) => !l.ownerId).length;

  // New leads over time: daily for 30 days, weekly for 90, monthly-ish (30-day) for a year.
  const bucketDays = days === 30 ? 1 : days === 90 ? 7 : 30;
  const bucketCount = Math.ceil(days / bucketDays);
  const trend = Array.from({ length: bucketCount }, (_, i) => {
    const start = new Date(since.getTime() + i * bucketDays * DAY);
    const end = new Date(start.getTime() + bucketDays * DAY);
    return { start, count: cohort.filter((l) => l.createdAt >= start && l.createdAt < end).length, enrolled: cohort.filter((l) => l.createdAt >= start && l.createdAt < end && won.has(l.stageId)).length };
  });

  return { since, days, bucketDays, kpis, funnel: funnelSteps, biggestDrop, current, sources, reasons, lostCount: lostCohort.length, team, unassigned, trend, cohortSize: cohort.length };
}

export type Reports = Awaited<ReturnType<typeof getReports>>;

export function parsePeriod(v: unknown): ReportPeriod {
  const n = Number(v);
  return (REPORT_PERIODS as readonly number[]).includes(n) ? (n as ReportPeriod) : 90;
}
