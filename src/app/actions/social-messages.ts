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

export async function syncSocialHistoryAction(id: string, _previous: unknown, _fd: FormData) {
  void _previous; void _fd;
  return runAction(async ctx => {
    const { syncSocialHistory } = await import("@/modules/social-messages");
    const result = await syncSocialHistory(prisma, ctx, id);
    return `Recovered ${result.saved} messages. Meta returned ${result.returned} recent messages; older history may be unavailable.`;
  });
}
export async function reconcileContactsAction(_previous: unknown, _fd: FormData) {
  void _previous; void _fd;
  return runAction(async ctx => {
    const { reconcileContactProgress } = await import("@/modules/pipeline-progress");
    const count = await reconcileContactProgress(prisma, ctx);
    return `${count} leads moved to Contacted from verified school replies.`;
  });
}
export async function bookConsultationAction(id: string, _previous: unknown, fd: FormData) {
  return runAction(async ctx => {
    const { bookConsultation } = await import("@/modules/pipeline-progress");
    await bookConsultation(prisma, ctx, id, { title: formString(fd, "title"), date: formString(fd, "date"), time: formString(fd, "time") });
    return "Consultation recorded with a follow-up task.";
  });
}

export async function recoverAllChatsAction(_previous: unknown, _fd: FormData) {
  void _previous; void _fd;
  return runAction(async ctx => {
    const { syncAllSocialHistory } = await import("@/modules/social-messages");
    const result = await syncAllSocialHistory(prisma, ctx);
    return `${result.checked} conversations checked; ${result.saved} messages recovered. ${result.unavailable} conversations unavailable from Meta.${result.limited ? " Only the 20 most recent conversations were checked." : ""} Recovered verified replies update the pipeline automatically.`;
  });
}
