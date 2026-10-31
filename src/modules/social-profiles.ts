import type { Db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { leadScope, type AccessContext } from "@/modules/access";
import { notFound } from "@/lib/errors";

const clean = (value: unknown) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 160) || null : null;
export function socialTitle(c: { username?: string | null; displayName?: string | null; lead: { firstName: string; lastName: string } }) {
  return c.username ? `@${c.username}` : c.displayName || `${c.lead.firstName} ${c.lead.lastName}`.trim();
}

/** Read-only Meta lookup; scoped IDs continue to identify contacts, never names or handles. */
export async function refreshSocialProfile(db: Db, ctx: AccessContext, conversationId: string, options: { fetch?: typeof fetch; now?: Date } = {}) {
  const c = await db.socialConversation.findFirst({ where: { id: conversationId, orgId: ctx.orgId, lead: leadScope(ctx) }, include: { page: { include: { integration: true } } } });
  if (!c) throw notFound();
  return updateProfile(db, c, options);
}
type ProfileConversation = Awaited<ReturnType<Db["socialConversation"]["findMany"]>>[number];
async function updateProfile(db: Db, initial: ProfileConversation, options: { fetch?: typeof fetch; now?: Date }) {
  const now = options.now ?? new Date(); const f = options.fetch ?? fetch;
  const c = await db.socialConversation.findFirst({ where: { id: initial.id, orgId: initial.orgId }, include: { page: { include: { integration: true } } } });
  if (!c || !c.page.integration.active || !(c.channel === "INSTAGRAM" ? c.page.instagramEnabled : c.page.messengerEnabled)) return false;
  // Claim this refresh to avoid duplicate work from simultaneous webhook/cron requests.
  if (!(await db.socialConversation.updateMany({ where: { id: c.id, profileCheckedAt: c.profileCheckedAt }, data: { profileCheckedAt: now } })).count) return false;
  try {
    const headers = { Authorization: `Bearer ${decryptSecret(c.page.accessTokenEnc)}` };
    const base = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}`;
    const fields = c.channel === "INSTAGRAM" ? "name,username" : "first_name,last_name";
    const r = await f(`${base}/${encodeURIComponent(c.senderId)}?${new URLSearchParams({ fields })}`, { headers, signal: AbortSignal.timeout(5000) });
    const p = await r.json();
    let username: string | null = null, displayName: string | null = null;
    if (r.ok && !p.error && (!p.id || p.id === c.senderId)) {
      username = c.channel === "INSTAGRAM" && typeof p.username === "string" && /^[a-z0-9._]{1,30}$/i.test(p.username) ? p.username : null;
      displayName = clean(p.name) || clean([clean(p.first_name), clean(p.last_name)].filter(Boolean).join(" "));
    }
    if (!username && !displayName) {
      // Some accounts allow participant names but not the separate User Profile endpoint.
      const asset = c.channel === "INSTAGRAM" ? c.page.instagramId : c.page.pageId;
      const response = await f(`${base}/${encodeURIComponent(c.page.pageId)}/conversations?${new URLSearchParams({ platform: c.channel === "INSTAGRAM" ? "instagram" : "messenger", user_id: c.senderId, fields: "id,participants", limit: "10" })}`, { headers, signal: AbortSignal.timeout(5000) });
      const list = await response.json();
      if (!response.ok || list.error || !Array.isArray(list.data)) return false;
      const thread = list.data.find((t: { participants?: { data?: { id: string }[] } }) => t.participants?.data?.some(p => p.id === c.senderId) && t.participants?.data?.some(p => p.id === asset || p.id === c.page.pageId));
      const participant = thread?.participants?.data?.find((p: { id: string }) => p.id === c.senderId);
      username = c.channel === "INSTAGRAM" && typeof participant?.username === "string" && /^[a-z0-9._]{1,30}$/i.test(participant.username) ? participant.username : null;
      displayName = clean(participant?.name);
    }
    if (!username && !displayName) return false;
    const label = (username ? `@${username}` : displayName!).slice(0, 80);
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${c.orgId}::uuid FOR UPDATE`;
      const current = await tx.socialConversation.findUnique({ where: { id: c.id } });
      if (!current) return;
      const fallback = `${c.channel === "INSTAGRAM" ? "Instagram" : "Messenger"} contact ${c.senderId.slice(-6)}`;
      // Compare-and-update preserves any name a staff member has entered manually.
      const renamed = await tx.lead.updateMany({ where: { id: c.leadId, orgId: c.orgId, firstName: { in: [fallback, ...(current.profileLeadName ? [current.profileLeadName] : [])] }, lastName: "" }, data: { firstName: label } });
      await tx.socialConversation.update({ where: { id: c.id }, data: { ...(username ? { username } : {}), ...(displayName ? { displayName } : {}), ...(renamed.count ? { profileLeadName: label } : {}) } });
    });
    return true;
  } catch { return false; } // Leave the last known name intact if Meta is unavailable.
}

/** Refresh a bounded batch; failures wait a day, successful profiles refresh weekly. */
export async function drainSocialProfiles(db: Db, options: { fetch?: typeof fetch; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const conversations = await db.socialConversation.findMany({ where: { page: { integration: { active: true } }, OR: [{ profileCheckedAt: null }, { username: null, displayName: null, profileCheckedAt: { lt: new Date(+now - 86400000) } }, { profileCheckedAt: { lt: new Date(+now - 7 * 86400000) } }] }, orderBy: [{ profileCheckedAt: { sort: "asc", nulls: "first" } }, { lastMessageAt: "desc" }], take: 4 });
  const results = await Promise.all(conversations.map(c => updateProfile(db, c, options)));
  return { checked: conversations.length, updated: results.filter(Boolean).length };
}
export async function refreshAllSocialProfiles(db: Db, ctx: AccessContext) {
  const conversations = await db.socialConversation.findMany({ where: { orgId: ctx.orgId, lead: leadScope(ctx) }, orderBy: { lastMessageAt: "desc" }, take: 20 });
  let updated = 0;
  for (let i = 0; i < conversations.length; i += 4) {
    const results = await Promise.all(conversations.slice(i, i + 4).map(c => updateProfile(db, c, {})));
    updated += results.filter(Boolean).length;
  }
  return { checked: conversations.length, updated };
}
