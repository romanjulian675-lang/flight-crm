"use server";
import { prisma } from "@/lib/db";
import { formString, runAction } from "@/lib/action";
import { readSocialConversation, sendSocialReply } from "@/modules/social-messages";

export async function readSocialAction(id: string) {
  return runAction(async ctx => { await readSocialConversation(prisma, ctx, id); return ""; });
}
export async function replySocialAction(id: string, _previous: unknown, fd: FormData) {
  return runAction(async ctx => {
    await sendSocialReply(prisma, ctx, id, { text: formString(fd, "text"), requestId: formString(fd, "requestId") });
    return "";
  });
}
