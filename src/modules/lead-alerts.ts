import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Db, Tx } from "@/lib/db";
import { ensure, permissions, type AccessContext } from "@/modules/access";

const recipientsSchema = z.array(z.email()).min(1).max(10);
export function leadAlertConfig() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_ALERT_FROM;
  const origin = process.env.APP_URL;
  if (!key || !from || !origin) return null;
  try { if (new URL(origin).protocol !== "https:") return null; } catch { return null; }
  return { key, from, origin: new URL(origin).origin };
}
export async function updateLeadAlerts(db: Db, ctx: AccessContext, input: { enabled: boolean; recipients: string[] }) {
  ensure(permissions.manageOrg(ctx));
  const recipients = recipientsSchema.parse([...new Set(input.recipients.map(s => s.trim().toLowerCase()).filter(Boolean))]);
  await db.$transaction(async tx => {
    await tx.organization.update({ where: { id: ctx.orgId }, data: { leadAlertEnabled: input.enabled, leadAlertRecipients: recipients } });
    // Cancel previously queued alerts when recipients or enablement change; never send to old recipients.
    await tx.leadAlert.updateMany({ where: { orgId: ctx.orgId, status: "PENDING" }, data: { status: "CANCELLED", lastError: "Notification settings changed." } });
  });
}
export async function queueLeadAlert(tx: Tx, orgId: string, leadId: string) {
  const org = await tx.organization.findUniqueOrThrow({ where: { id: orgId }, select: { leadAlertEnabled: true, leadAlertRecipients: true } });
  if (!org.leadAlertEnabled || !recipientsSchema.safeParse(org.leadAlertRecipients).success) return;
  await tx.leadAlert.create({ data: { orgId, leadId, recipients: org.leadAlertRecipients } });
}
const due = (now: Date) => ({ status: "PENDING", availableAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] });
/** Resend retains idempotency keys for 24h. Never automatically retry after 23h from the first attempt. */
export async function drainLeadAlerts(db: Db, options: { now?: Date; fetch?: typeof fetch } = {}) {
  const config = leadAlertConfig();
  if (!config) return { configured: false, processed: 0 };
  const now = options.now ?? new Date();
  const jobs = await db.leadAlert.findMany({ where: due(now), orderBy: { createdAt: "asc" }, take: 2 });
  let processed = 0;
  for (const job of jobs) {
    const token = randomUUID();
    const claimed = await db.leadAlert.updateMany({ where: { id: job.id, ...due(now) }, data: { leaseToken: token, leaseUntil: new Date(now.getTime() + 60_000), attempts: { increment: 1 }, firstAttemptAt: job.firstAttemptAt ?? now } });
    if (!claimed.count) continue;
    processed++;
    const owned = { id: job.id, leaseToken: token };
    const org = await db.organization.findUnique({ where: { id: job.orgId }, select: { leadAlertEnabled: true, leadAlertRecipients: true } });
    if (!org?.leadAlertEnabled || JSON.stringify(org.leadAlertRecipients) !== JSON.stringify(job.recipients)) {
      await db.leadAlert.updateMany({ where: owned, data: { status: "CANCELLED", leaseToken: null, leaseUntil: null } }); continue;
    }
    if (job.attempts >= 8 || (job.firstAttemptAt && now.getTime() - job.firstAttemptAt.getTime() >= 23 * 60 * 60 * 1000)) {
      await db.leadAlert.updateMany({ where: owned, data: { status: "FAILED", leaseToken: null, leaseUntil: null, lastError: "Delivery unconfirmed. Check the email provider before any manual resend." } }); continue;
    }
    try {
      // Stable content across retries. Contact details stay behind CRM sign-in.
      const response = await (options.fetch ?? fetch)("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(8_000),
        headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json", "Idempotency-Key": `new-lead/${job.id}` },
        body: JSON.stringify({ from: config.from, to: job.recipients, subject: "New lead — Flight school CRM", text: `A new lead is ready for follow-up.\n\nOpen the lead in the CRM (sign-in required):\n${config.origin}/leads/${job.leadId}\n\nThis alert is sent once for each new lead. Replies to this email are not added to the CRM.` }),
      });
      const result = await response.json() as { id?: string };
      if (!response.ok || !result.id) throw new Error("Email not accepted");
      await db.leadAlert.updateMany({ where: owned, data: { status: "SENT", providerId: result.id, sentAt: now, lastError: null, leaseToken: null, leaseUntil: null } });
    } catch {
      await db.leadAlert.updateMany({ where: owned, data: { status: job.attempts + 1 >= 8 ? "FAILED" : "PENDING", availableAt: new Date(now.getTime() + Math.min(60_000 * 2 ** job.attempts, 3_600_000)), leaseToken: null, leaseUntil: null, lastError: "Email delivery unconfirmed. A bounded retry uses the same provider idempotency key." } });
    }
  }
  return { configured: true, processed };
}
