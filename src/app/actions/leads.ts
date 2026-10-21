"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { formBool, formOptional, formString, runAction } from "@/lib/action";
import { getI18n } from "@/lib/i18n";
import { assignLead, createLead, deleteLead, findDuplicates, leadInput, logActivity, moveLead, normalizePhone, setChecklistItem, updateLead, type LeadInput } from "@/modules/leads";
import { requireAccess } from "@/lib/session";

type Duplicate = Awaited<ReturnType<typeof findDuplicates>>[number];
export type CreateLeadData = { leadId?: string; duplicates?: Duplicate[] };

function leadFromForm(fd: FormData): LeadInput {
  return {
    firstName: formString(fd, "firstName"),
    lastName: formString(fd, "lastName"),
    email: formOptional(fd, "email"),
    phone: formOptional(fd, "phone"),
    language: formString(fd, "language") as LeadInput["language"],
    source: formString(fd, "source") as LeadInput["source"],
    sourceDetail: formOptional(fd, "sourceDetail"),
    program: formString(fd, "program") as LeadInput["program"],
    medical: (formString(fd, "medical") || undefined) as LeadInput["medical"],
    funding: (formString(fd, "funding") || undefined) as LeadInput["funding"],
    timeline: formOptional(fd, "timeline"),
    isInternational: formBool(fd, "isInternational"),
  };
}

/** Quick-add. Unless `force` is set, stops and returns possible duplicates first. */
export async function createLeadAction(_prev: unknown, fd: FormData) {
  const { t } = await getI18n();
  return runAction<CreateLeadData>(async (ctx) => {
    const input = leadFromForm(fd);
    if (!formBool(fd, "force")) {
      const parsed = leadInput.parse(input);
      const duplicates = await findDuplicates(prisma, ctx, parsed.email, parsed.phone);
      if (duplicates.length) return { message: "", data: { duplicates } };
    }
    const owner = fd.get("ownerId");
    const lead = await createLead(prisma, ctx, {
      ...input,
      note: formOptional(fd, "note"),
      ...(typeof owner === "string" ? { ownerId: owner || null } : {}),
    });
    return { message: t.lead.created_ok, data: { leadId: lead.id } };
  });
}

export async function updateLeadAction(leadId: string, _prev: unknown, fd: FormData) {
  return runAction(async (ctx) => {
    await updateLead(prisma, ctx, leadId, leadFromForm(fd));
  });
}

export async function moveLeadAction(leadId: string, stageId: string, beforeId: string | null, lostReason?: string | null) {
  return runAction(async (ctx) => {
    await moveLead(prisma, ctx, leadId, stageId, beforeId, lostReason);
  });
}

export async function assignLeadAction(leadId: string, ownerId: string | null) {
  return runAction(async (ctx) => {
    await assignLead(prisma, ctx, leadId, ownerId);
  });
}

export async function logActivityAction(leadId: string, _prev: unknown, fd: FormData) {
  return runAction(async (ctx) => {
    const nextTitle = formString(fd, "nextTitle");
    await logActivity(prisma, ctx, leadId, {
      type: formString(fd, "type") as "NOTE",
      body: formString(fd, "body"),
      outcome: (formOptional(fd, "outcome") as "CONNECTED" | null) ?? null,
      direction: formString(fd, "direction") === "IN" ? "IN" : "OUT",
      followUp: nextTitle ? { title: nextTitle, date: formString(fd, "nextDate"), time: formString(fd, "nextTime") || "09:00" } : null,
    });
  });
}

export async function setChecklistItemAction(leadId: string, stageId: string, item: string, checked: boolean) {
  return runAction(async (ctx) => setChecklistItem(prisma, ctx, leadId, stageId, item, checked));
}

export async function deleteLeadAction(leadId: string) {
  const res = await runAction(async (ctx) => {
    await deleteLead(prisma, ctx, leadId);
  });
  if (res?.ok) redirect("/pipeline");
  return res;
}

/** Live duplicate hint while typing in the quick-add form. */
export async function checkDuplicatesAction(email: string, phone: string) {
  const ctx = await requireAccess();
  const e = email.trim().toLowerCase();
  return findDuplicates(prisma, ctx, /^\S+@\S+\.\S+$/.test(e) ? e : null, normalizePhone(phone));
}
