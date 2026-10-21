"use server";

import { prisma } from "@/lib/db";
import { formString, runAction } from "@/lib/action";
import { getI18n } from "@/lib/i18n";
import { canManageIntegrations, createIntegration, deleteIntegration, rotateToken, sendTestLead, setAssignMode, updateIntegration } from "@/modules/integrations";
import { disconnectMetaPage } from "@/modules/meta";
import { createRule, deleteRule, moveRule, updateRule, type RuleInput } from "@/modules/assignment";
import { ensure } from "@/modules/access";
import type { LeadSource, Program } from "@/generated/prisma/client";

export async function createIntegrationAction(kind: "WEB_FORM" | "WEBHOOK" | "GOOGLE_ADS", name: string) {
  return runAction(async (ctx) => {
    await createIntegration(prisma, ctx, { kind, name });
  });
}

export async function updateIntegrationAction(id: string, _prev: unknown, fd: FormData) {
  return runAction(async (ctx) => {
    await updateIntegration(prisma, ctx, id, {
      name: formString(fd, "name"),
      active: fd.get("active") === "on",
      defaultSource: formString(fd, "defaultSource") as LeadSource,
      defaultProgram: formString(fd, "defaultProgram") as Program,
      defaultOwnerId: formString(fd, "defaultOwnerId") || null,
    });
  });
}

export async function rotateTokenAction(id: string) {
  return runAction(async (ctx) => rotateToken(prisma, ctx, id));
}

export async function deleteIntegrationAction(id: string) {
  return runAction(async (ctx) => deleteIntegration(prisma, ctx, id));
}

export async function sendTestLeadAction(id: string) {
  const { t } = await getI18n();
  return runAction(async (ctx) => {
    const res = await sendTestLead(prisma, ctx, id);
    return res.status === "ERROR" ? `${t.integrations.log.ERROR}: ${res.error}` : t.integrations.testSent;
  });
}

export async function setAssignModeAction(mode: "NONE" | "ROUND_ROBIN") {
  return runAction(async (ctx) => setAssignMode(prisma, ctx, mode));
}

export async function disconnectMetaPageAction(metaPageId: string) {
  return runAction(async (ctx) => {
    ensure(canManageIntegrations(ctx));
    await disconnectMetaPage(prisma, ctx.orgId, metaPageId);
  });
}

function ruleFromForm(fd: FormData): RuleInput {
  return {
    name: formString(fd, "name"),
    active: fd.get("active") === "on",
    language: (formString(fd, "language") || null) as "en" | null,
    program: (formString(fd, "program") || null) as Program | null,
    source: (formString(fd, "source") || null) as LeadSource | null,
    memberIds: fd.getAll("memberIds").map(String),
  };
}

export async function createRuleAction(_prev: unknown, fd: FormData) {
  return runAction(async (ctx) => {
    await createRule(prisma, ctx, ruleFromForm(fd));
  });
}

export async function updateRuleAction(id: string, _prev: unknown, fd: FormData) {
  return runAction(async (ctx) => updateRule(prisma, ctx, id, ruleFromForm(fd)));
}

export async function deleteRuleAction(id: string) {
  return runAction(async (ctx) => deleteRule(prisma, ctx, id));
}

export async function moveRuleAction(id: string, dir: -1 | 1) {
  return runAction(async (ctx) => moveRule(prisma, ctx, id, dir));
}
