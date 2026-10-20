"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { formBool, formString, runAction } from "@/lib/action";
import { createInvite, revokeInvite, updateMember } from "@/modules/members";
import { addStage, deleteStage, moveStage, updateOrgSettings, updateStage } from "@/modules/orgs";
import type { Role, StageKind } from "@/generated/prisma/client";

export async function updateOrgAction(_prev: unknown, fd: FormData) {
  return runAction(async (ctx) => {
    await updateOrgSettings(prisma, ctx, { name: formString(fd, "name"), timeZone: formString(fd, "timeZone"), agentsSeeAll: formBool(fd, "agentsSeeAll") });
  });
}

/** Returns the full invite link once; it is not stored and can't be shown again. */
export async function createInviteAction(_prev: unknown, fd: FormData) {
  return runAction<{ link: string; email: string }>(async (ctx) => {
    const email = formString(fd, "email");
    const token = await createInvite(prisma, ctx, { email, role: formString(fd, "role") as Role });
    const h = await headers();
    const origin = process.env.BETTER_AUTH_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
    return { data: { link: `${origin}/invite/${token}`, email: email.toLowerCase() } };
  });
}

export async function revokeInviteAction(inviteId: string) {
  return runAction(async (ctx) => revokeInvite(prisma, ctx, inviteId));
}

export async function updateMemberAction(membershipId: string, role: Role, active: boolean) {
  return runAction(async (ctx) => updateMember(prisma, ctx, membershipId, { role, active }));
}

export async function addStageAction(_prev: unknown, fd: FormData) {
  return runAction(async (ctx) => {
    await addStage(prisma, ctx, { name: formString(fd, "name"), kind: formString(fd, "kind") as StageKind, color: formString(fd, "color") as "sky" });
  });
}

export async function updateStageAction(stageId: string, _prev: unknown, fd: FormData) {
  return runAction(async (ctx) => {
    await updateStage(prisma, ctx, stageId, { name: formString(fd, "name"), kind: formString(fd, "kind") as StageKind, color: formString(fd, "color") as "sky" });
  });
}

export async function moveStageAction(stageId: string, dir: -1 | 1) {
  return runAction(async (ctx) => moveStage(prisma, ctx, stageId, dir));
}

export async function deleteStageAction(stageId: string) {
  return runAction(async (ctx) => deleteStage(prisma, ctx, stageId));
}
