import { z } from "zod";
import type { Db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { todayBounds, zonedToUtc } from "@/lib/dates";
import { leadScope, permissions, type AccessContext } from "@/modules/access";

export const taskInput = z.object({
  title: z.string().trim().min(1, "taskTitleRequired").max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateInvalid"),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("09:00"),
  assigneeId: z.string().uuid().optional().nullable(),
});

/** Schedule a follow-up on a lead. Agents can only assign tasks to themselves. */
export async function createTask(db: Db, ctx: AccessContext, leadId: string, input: z.input<typeof taskInput>) {
  const data = taskInput.parse(input);
  const lead = await db.lead.findFirst({ where: { id: leadId, ...leadScope(ctx) }, select: { id: true } });
  if (!lead) throw notFound();
  let assigneeId = ctx.membershipId;
  if (data.assigneeId && permissions.assignLeads(ctx)) {
    const m = await db.membership.findFirst({ where: { id: data.assigneeId, orgId: ctx.orgId, active: true } });
    if (!m) throw notFound();
    assigneeId = m.id;
  }
  return db.task.create({
    data: {
      orgId: ctx.orgId,
      leadId,
      title: data.title,
      dueAt: zonedToUtc(data.date, data.time, ctx.timeZone),
      assigneeId,
      createdById: ctx.membershipId,
    },
  });
}

/** Tasks the caller may change: their own, or any in the school for managers. */
async function getScopedTask(db: Db, ctx: AccessContext, taskId: string) {
  const task = await db.task.findFirst({
    where: { id: taskId, orgId: ctx.orgId, ...(permissions.seeAllLeads(ctx) ? {} : { OR: [{ assigneeId: ctx.membershipId }, { lead: { ownerId: ctx.membershipId } }] }) },
  });
  if (!task) throw notFound();
  return task;
}

export async function completeTask(db: Db, ctx: AccessContext, taskId: string) {
  const task = await getScopedTask(db, ctx, taskId);
  if (task.completedAt) return;
  await db.$transaction([
    db.task.update({ where: { id: taskId }, data: { completedAt: new Date(), completedById: ctx.membershipId } }),
    db.activity.create({ data: { orgId: ctx.orgId, leadId: task.leadId, actorId: ctx.membershipId, type: "TASK_DONE", body: task.title } }),
  ]);
}

export async function reopenTask(db: Db, ctx: AccessContext, taskId: string) {
  await getScopedTask(db, ctx, taskId);
  await db.task.update({ where: { id: taskId }, data: { completedAt: null, completedById: null } });
}

export async function deleteTask(db: Db, ctx: AccessContext, taskId: string) {
  await getScopedTask(db, ctx, taskId);
  await db.task.delete({ where: { id: taskId } });
}

/** Open tasks for one person, split into overdue / today / upcoming in the school's time zone. */
export async function myTasks(db: Db, ctx: AccessContext, now = new Date(), assigneeId = ctx.membershipId) {
  const { start, end } = todayBounds(now, ctx.timeZone);
  const tasks = await db.task.findMany({
    where: { orgId: ctx.orgId, assigneeId, completedAt: null },
    orderBy: { dueAt: "asc" },
    take: 300,
    include: { lead: { select: { id: true, firstName: true, lastName: true, phone: true, stage: { select: { name: true } } } } },
  });
  return {
    overdue: tasks.filter((t) => t.dueAt < start),
    today: tasks.filter((t) => t.dueAt >= start && t.dueAt < end),
    upcoming: tasks.filter((t) => t.dueAt >= end),
  };
}
