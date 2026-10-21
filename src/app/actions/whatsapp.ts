"use server";

import { prisma } from "@/lib/db";
import { formString, runAction } from "@/lib/action";
import { connectWhatsApp, disconnectWhatsApp, listTemplates, markRead, sendWhatsAppTemplate, sendWhatsAppText, updateAutoReply, type Template } from "@/modules/whatsapp";

export async function connectWhatsAppAction(_prev: unknown, fd: FormData) {
  return runAction(async (ctx) => {
    await connectWhatsApp(prisma, ctx, {
      phoneNumberId: formString(fd, "phoneNumberId"),
      wabaId: formString(fd, "wabaId"),
      accessToken: formString(fd, "accessToken"),
      appSecret: formString(fd, "appSecret"),
    });
  });
}

export async function updateAutoReplyAction(_prev: unknown, fd: FormData) {
  return runAction(async (ctx) => updateAutoReply(prisma, ctx, formString(fd, "autoReply")));
}

export async function disconnectWhatsAppAction() {
  return runAction(async (ctx) => disconnectWhatsApp(prisma, ctx));
}

export async function sendWhatsAppTextAction(leadId: string, _prev: unknown, fd: FormData) {
  return runAction(async (ctx) => {
    await sendWhatsAppText(prisma, ctx, leadId, formString(fd, "text"));
    return "";
  });
}

export async function sendWhatsAppTemplateAction(leadId: string, _prev: unknown, fd: FormData) {
  return runAction(async (ctx) => {
    const [name, language] = formString(fd, "template").split("|");
    await sendWhatsAppTemplate(prisma, ctx, leadId, { name, language, params: fd.getAll("param").map(String) });
    return "";
  });
}

export async function listTemplatesAction() {
  return runAction<Template[]>(async (ctx) => ({ message: "", data: await listTemplates(prisma, ctx) }));
}

export async function markReadAction(leadId: string) {
  return runAction(async (ctx) => {
    await markRead(prisma, ctx, leadId);
    return "";
  });
}
