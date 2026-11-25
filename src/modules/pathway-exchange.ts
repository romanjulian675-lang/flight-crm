import { z } from "zod";
import type { Db } from "@/lib/db";
import { ensure, leadScope, type AccessContext } from "@/modules/access";

export const partnerInput = z.object({
  name: z.string().trim().min(2).max(120),
  country: z.string().trim().min(2).max(80),
  type: z.enum(["UNIVERSITY", "FLIGHT_SCHOOL", "LICENSING_AUTHORITY", "LANGUAGE_SCHOOL", "OTHER"]),
  website: z.string().trim().max(240).nullable(),
  contactEmail: z.string().trim().email().max(160).nullable(),
  notes: z.string().trim().max(500).nullable(),
});

export const profileInput = z.object({
  targetCountry: z.string().trim().max(80).nullable(),
  targetProgram: z.string().trim().max(120).nullable(),
  currentHours: z.number().int().min(0).max(10000).nullable(),
  currentLicense: z.string().trim().max(120).nullable(),
  englishLevel: z.string().trim().max(40).nullable(),
});

export const referralStatuses = ["DRAFT", "CONSENT_PENDING", "SENT", "ACCEPTED", "DECLINED", "CONVERTED"] as const;

export async function createPathwayPartner(db: Db, ctx: AccessContext, raw: unknown) {
  return db.pathwayPartner.create({ data: { orgId: ctx.orgId, ...partnerInput.parse(raw) } });
}

export async function upsertPathwayProfile(db: Db, ctx: AccessContext, leadId: string, raw: unknown) {
  const lead = await db.lead.findFirst({ where: { id: leadId, ...leadScope(ctx) }, select: { id: true } });
  ensure(!!lead, "LEAD_NOT_FOUND");
  return db.pathwayProfile.upsert({
    where: { leadId },
    create: { orgId: ctx.orgId, leadId, ...profileInput.parse(raw) },
    update: profileInput.parse(raw),
  });
}

export async function createPathwayReferral(db: Db, ctx: AccessContext, raw: { leadId: string; partnerId: string; status: typeof referralStatuses[number]; note: string | null }) {
  const status = z.enum(referralStatuses).parse(raw.status);
  const [lead, partner] = await Promise.all([
    db.lead.findFirst({ where: { id: raw.leadId, ...leadScope(ctx) }, select: { id: true } }),
    db.pathwayPartner.findFirst({ where: { id: raw.partnerId, orgId: ctx.orgId, active: true }, select: { id: true, name: true } }),
  ]);
  ensure(!!lead, "LEAD_NOT_FOUND");
  ensure(!!partner, "PARTNER_NOT_FOUND");
  const now = status === "SENT" ? new Date() : null;
  const referral = await db.pathwayReferral.create({ data: { orgId: ctx.orgId, leadId: raw.leadId, partnerId: raw.partnerId, status, note: raw.note, sentAt: now, consentAt: status === "SENT" ? now : null } });
  await db.activity.create({ data: { orgId: ctx.orgId, leadId: raw.leadId, actorId: ctx.membershipId, type: "NOTE", body: `Pathway referral created for ${partner!.name} (${status}).`, meta: { referralId: referral.id, partnerId: raw.partnerId } } });
  return referral;
}

export async function updatePathwayReferral(db: Db, ctx: AccessContext, id: string, status: typeof referralStatuses[number], outcome: string | null) {
  status = z.enum(referralStatuses).parse(status);
  const existing = await db.pathwayReferral.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true, leadId: true, partner: { select: { name: true } } } });
  ensure(!!existing, "REFERRAL_NOT_FOUND");
  const now = new Date();
  const referral = await db.pathwayReferral.update({ where: { id }, data: { status, outcome, sentAt: status === "SENT" ? now : undefined, consentAt: status === "SENT" ? now : undefined } });
  await db.activity.create({ data: { orgId: ctx.orgId, leadId: existing!.leadId, actorId: ctx.membershipId, type: "NOTE", body: `Pathway referral to ${existing!.partner.name} moved to ${status}.`, meta: { referralId: id, status } } });
  return referral;
}
