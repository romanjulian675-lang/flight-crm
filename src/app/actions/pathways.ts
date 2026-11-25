"use server";

import { formOptional, formString, runAction } from "@/lib/action";
import { prisma } from "@/lib/db";
import { createPathwayPartner, createPathwayReferral, referralStatuses, updatePathwayReferral, upsertPathwayProfile } from "@/modules/pathway-exchange";

export async function createPathwayPartnerAction(_prev: unknown, fd: FormData) {
  return runAction(async (ctx) => { await createPathwayPartner(prisma, ctx, {
    name: formString(fd, "name"), country: formString(fd, "country"), type: formString(fd, "type") || "OTHER",
    website: formOptional(fd, "website"), contactEmail: formOptional(fd, "contactEmail"), notes: formOptional(fd, "notes"),
  }); });
}

export async function savePathwayProfileAction(leadId: string, _prev: unknown, fd: FormData) {
  return runAction(async (ctx) => { await upsertPathwayProfile(prisma, ctx, leadId, {
    targetCountry: formOptional(fd, "targetCountry"), targetProgram: formOptional(fd, "targetProgram"),
    currentHours: formString(fd, "currentHours") ? Number(formString(fd, "currentHours")) : null,
    currentLicense: formOptional(fd, "currentLicense"), englishLevel: formOptional(fd, "englishLevel"),
  }); });
}

export async function createPathwayReferralAction(_prev: unknown, fd: FormData) {
  return runAction(async (ctx) => { await createPathwayReferral(prisma, ctx, {
    leadId: formString(fd, "leadId"), partnerId: formString(fd, "partnerId"),
    status: (formString(fd, "status") || "DRAFT") as typeof referralStatuses[number], note: formOptional(fd, "note"),
  }); });
}

export async function updatePathwayReferralAction(id: string, _prev: unknown, fd: FormData) {
  return runAction(async (ctx) => { await updatePathwayReferral(prisma, ctx, id, formString(fd, "status") as typeof referralStatuses[number], formOptional(fd, "outcome")); });
}
