import type { Tx } from "@/lib/db";

const contactedNames = new Set(["contacted", "contactado"]);

/** Only advance the first open stage. Never reopen a closed lead or undo a staff decision. */
export async function recordVerifiedContact(tx: Tx, orgId: string, leadId: string, at: Date, evidence: { source: string; messageId?: string; actorId?: string | null }) {
  await tx.$queryRaw`SELECT "id" FROM "Lead" WHERE "id" = ${leadId}::uuid AND "orgId" = ${orgId}::uuid FOR UPDATE`;
  const lead = await tx.lead.findFirst({ where: { id: leadId, orgId }, include: { stage: true } });
  if (!lead) return false;
  const stages = await tx.pipelineStage.findMany({ where: { orgId, kind: "OPEN" }, orderBy: { position: "asc" } });
  const target = stages.find(s => contactedNames.has(s.name.trim().toLowerCase()));
  const canMove = target && lead.stageId === stages[0]?.id && target.position > lead.stage.position;
  await tx.lead.update({ where: { id: leadId }, data: {
    firstContactAt: !lead.firstContactAt || at < lead.firstContactAt ? at : lead.firstContactAt,
    lastContactAt: !lead.lastContactAt || at > lead.lastContactAt ? at : lead.lastContactAt,
    ...(canMove ? { stageId: target.id, stageChangedAt: new Date(), position: ((await tx.lead.aggregate({ where: { orgId, stageId: target.id }, _max: { position: true } }))._max.position ?? -1) + 1 } : {}),
  } });
  if (lead.stage.kind === "OPEN" && evidence.source !== "STAFF_ACTIVITY") {
    const answered = await tx.task.updateMany({ where: { orgId, leadId, completedAt: null, title: { in: ["Reply to new message", "Responder nuevo mensaje"] } }, data: { completedAt: new Date(), completedById: evidence.actorId ?? null } });
    if (answered.count) await tx.activity.create({ data: { orgId, leadId, actorId: evidence.actorId ?? null, type: "TASK_DONE", body: "Initial chat response verified", meta: { source: evidence.source, messageId: evidence.messageId ?? null } } });
    if (!(await tx.task.count({ where: { orgId, leadId, completedAt: null } }))) await tx.task.create({ data: { orgId, leadId, title: "Follow up after contact", assigneeId: lead.ownerId, dueAt: new Date(Date.now() + 86_400_000) } });
  }
  if (canMove) await tx.activity.create({ data: { orgId, leadId, actorId: evidence.actorId ?? null, type: "STAGE_CHANGE", body: "Verified staff contact", meta: { from: lead.stage.name, to: target.name, fromId: lead.stageId, toId: target.id, toKind: target.kind, source: evidence.source, messageId: evidence.messageId ?? null, evidenceAt: at.toISOString() } } });
  return !!canMove;
}

/** Evidence to review, not proof of a booking: a question or visa mention alone is insufficient. */
export function meetingEvidence(messages: { direction: string; body: string | null }[]) {
  const staff = messages.filter(m => m.direction === "OUT" && m.body);
  const topic = /\b(meeting|appointment|consultation|zoom|video call|visa call|reuni[oó]n|cita|videollamada|consulta)\b/i;
  const schedule = /\b(booked|scheduled|confirmed|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|agendad[ao]|confirmad[ao]|ma[nñ]ana|hoy|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b|\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*(am|pm)\b/i;
  return staff.findLast(m => topic.test(m.body!) && schedule.test(m.body!))?.body ?? null;
}

/** Reconcile persisted, confirmed staff messages. Safe to repeat, scoped by caller's lead access. */
export async function reconcileContactProgress(db: import("@/lib/db").Db, ctx: import("@/modules/access").AccessContext) {
  const { leadScope } = await import("@/modules/access");
  const messages = await db.socialMessage.findMany({ where: { orgId: ctx.orgId, direction: "OUT", status: { in: ["SENT", "DELIVERED", "READ"] }, conversation: { lead: leadScope(ctx) } }, orderBy: { receivedAt: "asc" }, take: 2000, include: { conversation: { select: { leadId: true } } } });
  let moved = 0;
  for (const m of messages) moved += Number(await db.$transaction(tx => recordVerifiedContact(tx, ctx.orgId, m.conversation.leadId, m.receivedAt, { source: "CHAT_REVIEW", messageId: m.id, actorId: ctx.membershipId })));
  return moved;
}

export async function bookConsultation(db: import("@/lib/db").Db, ctx: import("@/modules/access").AccessContext, conversationId: string, input: { title: string; date: string; time: string }) {
  const { z } = await import("zod");
  const { leadScope, isManager, ensure } = await import("@/modules/access");
  const { zonedToUtc } = await import("@/lib/dates");
  const { invalid, notFound } = await import("@/lib/errors");
  ensure(isManager(ctx));
  const data = z.object({ title: z.string().trim().min(1).max(200), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/) }).parse(input);
  const dueAt = zonedToUtc(data.date, data.time, ctx.timeZone);
  if (!Number.isFinite(dueAt.getTime())) throw invalid("dateInvalid");
  const c = await db.socialConversation.findFirst({ where: { id: conversationId, orgId: ctx.orgId, lead: leadScope(ctx) } });
  if (!c) throw notFound();
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${ctx.orgId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Lead" WHERE "id" = ${c.leadId}::uuid FOR UPDATE`;
    const lead = await tx.lead.findUniqueOrThrow({ where: { id: c.leadId }, include: { stage: true } });
    if (lead.stage.kind !== "OPEN") throw invalid("Reopen the lead before recording a new booking.");
    const existing = await tx.task.findFirst({ where: { orgId: ctx.orgId, leadId: lead.id, title: data.title, dueAt } });
    if (existing) return;
    let stage = await tx.pipelineStage.findFirst({ where: { orgId: ctx.orgId, name: { in: ["Consultation booked", "Consulta agendada"] }, kind: "OPEN" } });
    if (!stage) {
      const contacted = await tx.pipelineStage.findFirst({ where: { orgId: ctx.orgId, name: { in: ["Contacted", "Contactado"] }, kind: "OPEN" } });
      if (!contacted) throw invalid("Add a Contacted stage before recording consultation bookings.");
      await tx.pipelineStage.updateMany({ where: { orgId: ctx.orgId, position: { gt: contacted.position } }, data: { position: { increment: 1 } } });
      stage = await tx.pipelineStage.create({ data: { orgId: ctx.orgId, name: "Consultation booked", kind: "OPEN", position: contacted.position + 1, color: "teal" } });
    }
    const task = await tx.task.create({ data: { orgId: ctx.orgId, leadId: lead.id, title: data.title, dueAt, assigneeId: lead.ownerId ?? ctx.membershipId, createdById: ctx.membershipId } });
    await tx.activity.create({ data: { orgId: ctx.orgId, leadId: lead.id, actorId: ctx.membershipId, type: "MEETING", body: data.title, meta: { socialConversationId: c.id, scheduledAt: dueAt.toISOString(), taskId: task.id, status: "BOOKED", source: "STAFF_CONFIRMED_CHAT" } } });
    if (lead.stage.position < stage.position) {
      const last = await tx.lead.aggregate({ where: { orgId: ctx.orgId, stageId: stage.id }, _max: { position: true } });
      await tx.lead.update({ where: { id: lead.id }, data: { stageId: stage.id, stageChangedAt: new Date(), position: (last._max.position ?? -1) + 1 } });
      await tx.activity.create({ data: { orgId: ctx.orgId, leadId: lead.id, actorId: ctx.membershipId, type: "STAGE_CHANGE", body: data.title, meta: { fromId: lead.stageId, toId: stage.id, from: lead.stage.name, to: stage.name, toKind: stage.kind, taskId: task.id, source: "STAFF_CONFIRMED_CHAT" } } });
    }
  });
}
