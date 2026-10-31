import type { Db, Tx } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { ensure, isManager, type AccessContext } from "@/modules/access";
import { notFound } from "@/lib/errors";

export const INSTAGRAM_WELCOME = "Hey, how are you?";
export function instagramWelcomeEnabled(config: unknown) {
  return !!config && typeof config === "object" && !Array.isArray(config) && (config as Record<string, unknown>).instagramWelcomeOnce === true;
}
export function isWelcomeTrigger(text: string | null) {
  return !!text && /^(?:pilot|hi|hello|good (?:morning|afternoon|evening))(?:[\s,.!?]|$)/iu.test(text.trim());
}
export async function configureInstagramWelcome(db: Db, ctx: AccessContext, integrationId: string, enabled: boolean) {
  ensure(isManager(ctx));
  const i = await db.integration.findFirst({ where: { id: integrationId, orgId: ctx.orgId, kind: "META" } });
  if (!i) throw notFound();
  const config = i.config && typeof i.config === "object" && !Array.isArray(i.config) ? i.config : {};
  await db.integration.update({ where: { id: i.id }, data: { config: { ...config, instagramWelcomeOnce: enabled } } });
}
export async function queueInstagramWelcome(tx: Tx, data: { orgId: string; conversationId: string; initialMessageId: string; initialAt: Date }) {
  await tx.instagramWelcome.create({ data });
}

/** No automatic retries: a timeout or crash must never cause a second greeting. */
export async function drainInstagramWelcomes(db: Db, options: { fetch?: typeof fetch; now?: Date } = {}) {
  const now = options.now ?? new Date(); const f = options.fetch ?? fetch;
  const jobs = await db.instagramWelcome.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 1 });
  let processed = 0;
  for (const job of jobs) {
    if (!(await db.instagramWelcome.updateMany({ where: { id: job.id, status: "PENDING" }, data: { status: "PROCESSING", attemptedAt: now } })).count) continue;
    processed++;
    const finish = async (status: string, lastError: string | null = null) => { await db.instagramWelcome.update({ where: { id: job.id }, data: { status, lastError, completedAt: now } }); };
    const c = await db.socialConversation.findFirst({ where: { id: job.conversationId, orgId: job.orgId, channel: "INSTAGRAM" }, include: { page: { include: { integration: true } } } });
    if (!c || !c.page.integration.active || !c.page.instagramEnabled || !c.page.instagramId || !instagramWelcomeEnabled(c.page.integration.config) || +now - +job.initialAt > 5 * 60_000 || +now < +job.initialAt - 300_000) { await finish("SKIPPED", "Welcome disabled, expired or channel unavailable."); continue; }
    if (await db.socialMessage.count({ where: { conversationId: c.id, direction: "OUT" } })) { await finish("SKIPPED", "School has already replied."); continue; }
    // Check Meta as well: returning contacts may predate the CRM connection. If history cannot be
    // verified, stay quiet rather than risk restarting an old conversation with a welcome.
    let headers: { Authorization: string };
    const base = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}`;
    try {
      headers = { Authorization: `Bearer ${decryptSecret(c.page.accessTokenEnc)}` };
      const listResponse = await f(`${base}/${encodeURIComponent(c.page.pageId)}/conversations?${new URLSearchParams({ platform: "instagram", user_id: c.senderId, fields: "id,participants", limit: "10" })}`, { headers, signal: AbortSignal.timeout(5000) });
      const list = await listResponse.json();
      if (!listResponse.ok || !Array.isArray(list.data)) throw new Error();
      const thread = list.data.find((t: { id?: string; participants?: { data?: { id: string }[] } }) => t.id && t.participants?.data?.some(p => p.id === c.senderId) && t.participants?.data?.some(p => p.id === c.page.instagramId || p.id === c.page.pageId));
      if (!thread) throw new Error();
      const historyResponse = await f(`${base}/${encodeURIComponent(thread.id)}?${new URLSearchParams({ fields: "messages.limit(100){id,from,to,created_time}" })}`, { headers, signal: AbortSignal.timeout(5000) });
      const history = await historyResponse.json();
      if (!historyResponse.ok || !Array.isArray(history.messages?.data) || !history.messages.data.some((m: { id?: string }) => m.id === job.initialMessageId)) throw new Error();
      const prior = history.messages.data.some((m: { id: string; from?: { id: string }; to?: { data?: { id: string }[] }; created_time?: string }) => {
        const at = new Date(m.created_time ?? "");
        const sender = m.from?.id;
        const participantsMatch = sender === c.senderId ? m.to?.data?.some(p => p.id === c.page.instagramId || p.id === c.page.pageId) : (sender === c.page.instagramId || sender === c.page.pageId) && m.to?.data?.some(p => p.id === c.senderId);
        return participantsMatch && m.id !== job.initialMessageId && Number.isFinite(+at) && +at <= +job.initialAt;
      });
      if (prior) { await finish("SKIPPED", "Existing Meta conversation; no welcome sent."); continue; }
    } catch { await finish("SKIPPED", "Could not verify a new Meta conversation; no welcome sent."); continue; }
    const outgoing = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${job.orgId}::uuid FOR UPDATE`;
      if (await tx.socialMessage.count({ where: { conversationId: c.id, direction: "OUT" } })) return null;
      const current = await tx.integration.findUnique({ where: { id: c.page.integrationId } });
      if (!current?.active || !instagramWelcomeEnabled(current.config)) return null;
      return tx.socialMessage.create({ data: { orgId: c.orgId, conversationId: c.id, requestId: job.id, body: INSTAGRAM_WELCOME, direction: "OUT", status: "PENDING", attachmentTypes: [], receivedAt: now } });
    });
    if (!outgoing) { await finish("SKIPPED", "School replied or welcome disabled before send."); continue; }
    try {
      const response = await f(`${base}/${encodeURIComponent(c.page.instagramId)}/messages`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, signal: AbortSignal.timeout(8000), body: JSON.stringify({ recipient: { id: c.senderId }, message: { text: INSTAGRAM_WELCOME } }) });
      const result = await response.json();
      if (!response.ok || result.error || typeof result.message_id !== "string") throw new Error();
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${job.orgId}::uuid FOR UPDATE`;
        const echo = await tx.socialMessage.findUnique({ where: { conversationId_providerMessageId: { conversationId: c.id, providerMessageId: result.message_id } } });
        if (echo && echo.id !== outgoing.id) {
          await tx.socialMessage.delete({ where: { id: outgoing.id } });
          await tx.socialMessage.update({ where: { id: echo.id }, data: { requestId: job.id, status: "SENT" } });
        } else await tx.socialMessage.update({ where: { id: outgoing.id }, data: { status: "SENT", providerMessageId: result.message_id } });
        await tx.socialConversation.updateMany({ where: { id: c.id, lastMessageAt: { lt: now } }, data: { lastMessageAt: now } });
        await tx.activity.create({ data: { orgId: c.orgId, leadId: c.leadId, type: "NOTE", body: `[Instagram automatic welcome — once] ${INSTAGRAM_WELCOME}`, meta: { source: "INSTAGRAM_WELCOME", socialConversationId: c.id } } });
        await tx.instagramWelcome.update({ where: { id: job.id }, data: { status: "SENT", completedAt: now, lastError: null } });
      });
    } catch {
      await db.socialMessage.updateMany({ where: { id: outgoing.id, status: "PENDING" }, data: { status: "FAILED", error: "Automatic welcome delivery unconfirmed. Never retried automatically." } });
      await finish("UNCONFIRMED", "Check Meta before any manual reply; no automatic resend.");
    }
  }
  return { processed };
}
