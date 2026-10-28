import { z } from "zod";
import type { Db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { invalid, notFound } from "@/lib/errors";
import { leadScope, type AccessContext } from "@/modules/access";
import { pickOwner } from "@/modules/assignment";
import { insertLead, leadInput } from "@/modules/leads";

const id = z.string().min(1).max(200);
const event = z.object({
  sender: z.object({ id }), recipient: z.object({ id }), timestamp: z.number().finite().nonnegative(),
  message: z.object({ mid: id, text: z.string().max(20000).optional(), is_echo: z.boolean().optional(),
    attachments: z.array(z.object({ type: z.string().max(80) })).max(50).optional(),
  }).optional(),
});
const envelope = z.object({ object: z.string(), entry: z.array(z.object({ id, messaging: z.array(event).max(100).optional() })).max(100) });
export const SOCIAL_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Persist before acknowledging. No external API is called while processing incoming messages. */
export async function receiveSocialMessages(db: Db, body: unknown) {
  const parsed = envelope.safeParse(body);
  if (!parsed.success) return { invalid: true, unavailable: 0, saved: 0 };
  const channel = parsed.data.object === "page" ? "MESSENGER" : parsed.data.object === "instagram" ? "INSTAGRAM" : null;
  if (!channel) return { invalid: false, unavailable: 0, saved: 0 };
  let unavailable = 0, saved = 0;
  for (const entry of parsed.data.entry) {
    for (const item of entry.messaging ?? []) {
      if (!item.message || item.message.is_echo || item.sender.id === entry.id) continue;
      // The recipient must match the business asset named by the signed envelope.
      if (item.recipient.id !== entry.id) { unavailable++; continue; }
      const page = await db.metaPage.findFirst({ where: channel === "MESSENGER" ? { pageId: entry.id } : { instagramId: entry.id }, include: { integration: true, org: { select: { locale: true } } } });
      if (!page || !page.integration.active || !(channel === "MESSENGER" ? page.messengerEnabled : page.instagramEnabled)) { unavailable++; continue; }
      const timestamp = new Date(item.timestamp);
      if (!Number.isFinite(timestamp.getTime()) || timestamp.getTime() > Date.now() + 300_000) { unavailable++; continue; }
      const message = item.message;
      const label = channel === "MESSENGER" ? "Messenger" : "Instagram";
      const text = message.text?.slice(0, 20000) || null;
      const types = message.attachments?.map(a => a.type) ?? [];
      saved += await db.$transaction(async tx => {
        // Serialize by school: conversation, lead, task and message commit exactly once together.
        await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${page.orgId}::uuid FOR UPDATE`;
        let conversation = await tx.socialConversation.findUnique({ where: { pageId_channel_senderId: { pageId: page.id, channel, senderId: item.sender.id } } });
        if (conversation && await tx.socialMessage.findUnique({ where: { conversationId_providerMessageId: { conversationId: conversation.id, providerMessageId: message.mid } } })) return 0;
        if (!conversation) {
          const source = channel === "INSTAGRAM" ? "INSTAGRAM" : "FACEBOOK";
          const language = page.org.locale === "es" ? "es" : "en";
          const traits = { language, source, program: page.integration.defaultProgram } as const;
          const fixed = page.integration.defaultOwnerId ? await tx.membership.findFirst({ where: { id: page.integration.defaultOwnerId, orgId: page.orgId, active: true, acceptsLeads: true } }) : null;
          const ownerId = fixed?.id ?? await pickOwner(tx, page.orgId, traits);
          const lead = await insertLead(tx, page.orgId, leadInput.parse({ firstName: `${label} contact ${item.sender.id.slice(-6)}`, source, sourceDetail: `${label} · ${page.pageName}`, program: traits.program, language }), { ownerId, actorId: null });
          conversation = await tx.socialConversation.create({ data: { orgId: page.orgId, pageId: page.id, channel, senderId: item.sender.id, leadId: lead.id, lastMessageAt: timestamp, lastInboundAt: timestamp } });
          await tx.task.create({ data: { orgId: page.orgId, leadId: lead.id, assigneeId: ownerId, title: language === "es" ? "Responder nuevo mensaje" : "Reply to new message", dueAt: new Date() } });
        }
        await tx.socialMessage.create({ data: { orgId: page.orgId, conversationId: conversation.id, providerMessageId: message.mid, body: text, attachmentTypes: types, receivedAt: timestamp } });
        await tx.socialConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: timestamp > conversation.lastMessageAt ? timestamp : conversation.lastMessageAt, lastInboundAt: timestamp > conversation.lastInboundAt ? timestamp : conversation.lastInboundAt } });
        await tx.activity.create({ data: { orgId: page.orgId, leadId: conversation.leadId, type: "NOTE", body: `[${label}] ${text ?? `[${types.join(", ") || "Unsupported message"}]`}`.slice(0, 5000), meta: { socialConversationId: conversation.id, direction: "IN" } } });
        return 1;
      });
    }
  }
  return { invalid: false, unavailable, saved };
}

export function socialInbox(db: Db, ctx: AccessContext) {
  return db.socialConversation.findMany({ where: { orgId: ctx.orgId, lead: leadScope(ctx) }, orderBy: { lastMessageAt: "desc" }, take: 100,
    include: { lead: { select: { id: true, firstName: true, lastName: true } }, messages: { orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }], take: 1 }, _count: { select: { messages: { where: { direction: "IN", readAt: null } } } } } });
}
export async function socialConversation(db: Db, ctx: AccessContext, conversationId: string) {
  const conversation = await db.socialConversation.findFirst({ where: { id: conversationId, orgId: ctx.orgId, lead: leadScope(ctx) }, include: { lead: true, page: { select: { pageName: true, messengerEnabled: true, instagramEnabled: true } }, messages: { orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }], take: 100 } } });
  if (!conversation) throw notFound();
  return { ...conversation, replyWindowOpen: Date.now() - conversation.lastInboundAt.getTime() < SOCIAL_WINDOW_MS, messages: conversation.messages.reverse() };
}
export async function readSocialConversation(db: Db, ctx: AccessContext, conversationId: string) {
  await socialConversation(db, ctx, conversationId);
  await db.socialMessage.updateMany({ where: { orgId: ctx.orgId, conversationId, direction: "IN", readAt: null }, data: { readAt: new Date() } });
}

/** Idempotent outbox: uncertain sends are retained, never automatically retried. */
export async function sendSocialReply(db: Db, ctx: AccessContext, conversationId: string, input: { text: string; requestId: string }, f: typeof fetch = fetch) {
  const data = z.object({ text: z.string().trim().min(1).max(1000), requestId: z.uuid() }).parse(input);
  const conversation = await db.socialConversation.findFirst({ where: { id: conversationId, orgId: ctx.orgId, lead: leadScope(ctx) }, include: { page: { include: { integration: true } } } });
  if (!conversation) throw notFound();
  if (!conversation.page.integration.active || !(conversation.channel === "MESSENGER" ? conversation.page.messengerEnabled : conversation.page.instagramEnabled)) throw invalid("Messaging is paused. Reconnect this channel before replying.");
  if (Date.now() - conversation.lastInboundAt.getTime() >= SOCIAL_WINDOW_MS) throw invalid("The 24-hour reply window has closed. Continue in Meta Business Suite.");
  const previous = await db.socialMessage.findUnique({ where: { conversationId_requestId: { conversationId, requestId: data.requestId } } });
  if (previous) {
    if (previous.status !== "SENT") throw invalid("This send is unconfirmed. Check Meta Business Suite before sending again.");
    return previous.id;
  }
  const outgoing = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "SocialConversation" WHERE "id" = ${conversationId}::uuid FOR UPDATE`;
    if (await tx.socialMessage.findUnique({ where: { conversationId_requestId: { conversationId, requestId: data.requestId } } })) return null;
    return tx.socialMessage.create({ data: { orgId: ctx.orgId, conversationId, requestId: data.requestId, direction: "OUT", status: "PENDING", body: data.text, attachmentTypes: [], receivedAt: new Date() } });
  });
  if (!outgoing) throw invalid("This send is already being processed. Check the conversation before sending again.");
  const assetId = conversation.channel === "INSTAGRAM" ? conversation.page.instagramId : conversation.page.pageId;
  try {
    const response = await f(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}/${assetId}/messages`, { method: "POST", signal: AbortSignal.timeout(10_000), headers: { Authorization: `Bearer ${decryptSecret(conversation.page.accessTokenEnc)}`, "Content-Type": "application/json" }, body: JSON.stringify({ recipient: { id: conversation.senderId }, message: { text: data.text }, ...(conversation.channel === "MESSENGER" ? { messaging_type: "RESPONSE" } : {}) }) });
    const result = await response.json() as { message_id?: string; error?: unknown };
    if (!response.ok || result.error || !result.message_id) throw new Error("Send not confirmed");
    await db.$transaction(async tx => {
      await tx.socialMessage.update({ where: { id: outgoing.id }, data: { status: "SENT", providerMessageId: result.message_id } });
      await tx.socialConversation.updateMany({ where: { id: conversationId, lastMessageAt: { lt: outgoing.receivedAt } }, data: { lastMessageAt: outgoing.receivedAt } });
      await tx.lead.update({ where: { id: conversation.leadId }, data: { lastContactAt: outgoing.receivedAt, firstContactAt: (await tx.lead.findUniqueOrThrow({ where: { id: conversation.leadId } })).firstContactAt ?? outgoing.receivedAt } });
      await tx.activity.create({ data: { orgId: ctx.orgId, leadId: conversation.leadId, actorId: ctx.membershipId, type: "NOTE", body: `[${conversation.channel === "INSTAGRAM" ? "Instagram" : "Messenger"} reply] ${data.text}`, meta: { socialConversationId: conversationId, direction: "OUT" } } });
    });
    return outgoing.id;
  } catch {
    await db.socialMessage.update({ where: { id: outgoing.id }, data: { status: "FAILED", error: "Delivery is unconfirmed. Check Meta Business Suite before sending again." } });
    throw invalid("Delivery is unconfirmed. Check Meta Business Suite before sending again.");
  }
}
