import { randomUUID } from "node:crypto";
import type { Db } from "@/lib/db";
import type { Integration } from "@/generated/prisma/client";
import { ensure, isManager, type AccessContext } from "@/modules/access";
import { invalid, notFound } from "@/lib/errors";
import { questionnaireConfig, questionnaireInput, readQuestionnaireConfig, trainingPaths, nextSteps } from "@/lib/questionnaire";
import { ingest } from "@/modules/intake";
import { leadAlertConfig } from "@/modules/lead-alerts";

export async function configureQuestionnaire(db: Db, ctx: AccessContext, id: string, input: unknown) {
  ensure(isManager(ctx));
  const integration = await db.integration.findFirst({ where: { id, orgId: ctx.orgId, kind: "WEB_FORM" } });
  if (!integration) throw notFound();
  const data = questionnaireConfig.parse(input);
  if (data.enabled && (!data.meetingUrl || !data.replyTo)) throw invalid("Add the academy meeting link and reply-to email before publishing.");
  if (data.emailEnabled && !leadAlertConfig()) throw invalid("Configure the email sender before enabling prospect emails.");
  const config = integration.config && typeof integration.config === "object" && !Array.isArray(integration.config) ? integration.config : {};
  await db.integration.update({ where: { id }, data: { config: { ...config, questionnaire: data } } });
}

/** Explicitly requested, bounded transactional follow-up; no eligibility scoring or marketing drip. */
export async function submitQuestionnaire(db: Db, integration: Integration, raw: unknown) {
  const config = readQuestionnaireConfig(integration.config);
  if (integration.kind !== "WEB_FORM" || !integration.active || !config.enabled) throw notFound();
  const d = questionnaireInput.parse(raw);
  const org = await db.organization.findUniqueOrThrow({ where: { id: integration.orgId }, select: { name: true } });
  const result = await ingest(db, integration, {
    first_name: d.firstName, last_name: d.lastName, email: d.email, phone: d.phone,
    program: d.path === "LIFE_PROJECT" ? "career" : d.path === "LICENSE" ? d.program : "other",
    language: d.language, timeline: d.timeline, message: d.questions,
    training_path: trainingPaths[d.path], city: d.city, country: d.country,
    questionnaire_language: d.language, current_licenses_and_experience: d.experience,
    requested_next_step: nextSteps[d.nextStep], booking_email_requested: "Yes — questionnaire consent",
    utm_source: d.utm_source, utm_medium: d.utm_medium, utm_campaign: d.utm_campaign, utm_content: d.utm_content,
  }, { externalId: `questionnaire/${d.submissionId}`, via: "Training path questionnaire" });
  if (!result.leadId || !["CREATED", "MERGED", "DUPLICATE"].includes(result.status)) throw invalid("We couldn't save your inquiry. Please try again.");
  // Duplicate request IDs return no personal data. Never let retries redirect a saved email to a new address.
  const event = await db.intakeEvent.findUniqueOrThrow({ where: { id: result.eventId! } });
  const summary = event.summary as { email?: string } | null;
  if (summary?.email !== d.email) throw invalid("Please start a new submission.");
  const origin = leadAlertConfig()?.origin;
  let emailQueued = false;
  if (config.emailEnabled && origin) {
    const followup = `${origin}/next/${integration.token}`;
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${integration.orgId}::uuid FOR UPDATE`;
      // A public form may not send repeated messages to the same address. Also caps school-wide volume.
      const since = new Date(Date.now() - 24 * 3600_000);
      const previous = await tx.prospectEmail.findFirst({ where: { orgId: integration.orgId, recipient: d.email, createdAt: { gte: since } } });
      if (previous) { emailQueued = ["PENDING", "SENT"].includes(previous.status); return; }
      if (await tx.prospectEmail.count({ where: { orgId: integration.orgId, createdAt: { gte: since } } }) >= 100) return;
      await tx.prospectEmail.upsert({ where: { submissionId: d.submissionId }, update: {}, create: {
        orgId: integration.orgId, leadId: result.leadId!, integrationId: integration.id, submissionId: d.submissionId,
        recipient: d.email, replyTo: config.replyTo,
        subject: `Your next step with ${org.name}`,
        body: `Thank you for your interest in ${org.name}.\n\nReady to experience flying? Request a discovery flight and our team will confirm aircraft, instructor availability and pricing with you.\n\nRequest your discovery flight:\n${followup}?step=discovery\n\nWant more information? Book a 30-minute online meeting and talk to one of our representatives about your training plans:\n${followup}?step=meeting\n\nA discovery-flight request is not a confirmed reservation. Your meeting is confirmed only when you finish the calendar booking and receive its confirmation.\n\nYou received this one-time email because this address was entered on our training questionnaire with a request for booking information. If that wasn't you, ignore this email; no further automated follow-up is scheduled.\n\n${org.name}\nReply to this email to reach our team.`,
      } });
      emailQueued = true;
    });
  }
  return { ok: true, emailQueued };
}

const due = (now: Date) => ({ status: "PENDING", availableAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] });
export async function drainProspectEmails(db: Db, options: { now?: Date; fetch?: typeof fetch } = {}) {
  const config = leadAlertConfig();
  if (!config) return { configured: false, processed: 0 };
  const now = options.now ?? new Date();
  const jobs = await db.prospectEmail.findMany({ where: due(now), orderBy: { createdAt: "asc" }, take: 2 });
  let processed = 0;
  for (const job of jobs) {
    const token = randomUUID();
    const claimed = await db.prospectEmail.updateMany({ where: { id: job.id, ...due(now) }, data: { leaseToken: token, leaseUntil: new Date(now.getTime() + 60_000), attempts: { increment: 1 }, firstAttemptAt: job.firstAttemptAt ?? now } });
    if (!claimed.count) continue;
    processed++;
    const owned = { id: job.id, leaseToken: token };
    const integration = await db.integration.findFirst({ where: { id: job.integrationId, orgId: job.orgId, active: true, kind: "WEB_FORM" } });
    const settings = readQuestionnaireConfig(integration?.config);
    if (!settings.enabled || !settings.emailEnabled || settings.replyTo !== job.replyTo) {
      await db.prospectEmail.updateMany({ where: owned, data: { status: "CANCELLED", leaseToken: null, leaseUntil: null } }); continue;
    }
    if (job.attempts >= 8 || (job.firstAttemptAt && now.getTime() - job.firstAttemptAt.getTime() >= 23 * 3600_000)) {
      await db.prospectEmail.updateMany({ where: owned, data: { status: "FAILED", leaseToken: null, leaseUntil: null, lastError: "Delivery unconfirmed; automatic retries stopped." } }); continue;
    }
    try {
      const response = await (options.fetch ?? fetch)("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json", "Idempotency-Key": `questionnaire/${job.id}` },
        body: JSON.stringify({ from: config.from, reply_to: job.replyTo, to: [job.recipient], subject: job.subject, text: job.body }),
      });
      const result = await response.json() as { id?: string };
      if (!response.ok || !result.id) throw new Error("Not accepted");
      await db.$transaction(async tx => {
        const sent = await tx.prospectEmail.updateMany({ where: owned, data: { status: "SENT", providerId: result.id, sentAt: now, leaseToken: null, leaseUntil: null, lastError: null } });
        if (sent.count) await tx.activity.create({ data: { orgId: job.orgId, leadId: job.leadId, type: "NOTE", body: "Requested discovery-flight / consultation booking email accepted by email provider.", meta: { source: "QUESTIONNAIRE_EMAIL", providerId: result.id, emailJobId: job.id } } });
      });
    } catch {
      await db.prospectEmail.updateMany({ where: owned, data: { status: job.attempts + 1 >= 8 ? "FAILED" : "PENDING", availableAt: new Date(now.getTime() + Math.min(60_000 * 2 ** job.attempts, 3600_000)), leaseToken: null, leaseUntil: null, lastError: "Delivery unconfirmed; bounded retry uses the same idempotency key." } });
    }
  }
  return { configured: true, processed };
}
