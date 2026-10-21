import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { conflict, invalid, notFound } from "@/lib/errors";
import type { Integration, MessageStatus, Prisma, WhatsAppAccount } from "@/generated/prisma/client";
import { ensure, isManager, leadScope, type AccessContext } from "@/modules/access";
import { newToken } from "@/modules/integrations";
import { ingest } from "@/modules/intake";
import { normalizePhone } from "@/modules/leads";

/**
 * WhatsApp Business via Meta's Cloud API.
 *
 * Per school: a WhatsApp Business Account (WABA) + phone number in Meta Business Manager, a
 * permanent system-user access token with whatsapp_business_messaging + whatsapp_business_management,
 * and the app secret of the Meta app the webhook is configured on. The school pastes those here; we
 * verify them against the API, subscribe the app to the WABA, and give them a webhook URL + verify
 * token to paste into the app's WhatsApp → Configuration (field: messages).
 *
 * Rules from Meta that shape the UI:
 *  - Free-form messages only within 24 h of the customer's last message ("customer service window").
 *  - Outside it, only pre-approved templates.
 */

export type Fetch = typeof fetch;
export const WINDOW_MS = 24 * 3_600_000;

const graphBase = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}`;

async function graph<T>(f: Fetch, path: string, token: string, opts: { method?: "GET" | "POST"; query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
  const url = `${graphBase()}/${path}${opts.query ? `?${new URLSearchParams(opts.query)}` : ""}`;
  const res = await f(url, {
    method: opts.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, ...(opts.body ? { "Content-Type": "application/json" } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; error_user_msg?: string } };
  if (!res.ok || json.error) throw new Error(`WhatsApp: ${json.error?.error_user_msg ?? json.error?.message ?? `HTTP ${res.status}`}`);
  return json;
}

const token = (a: WhatsAppAccount) => decryptSecret(a.accessTokenEnc);

export const windowOpen = (lastInbound: Date | null | undefined, now = new Date()) => !!lastInbound && now.getTime() - lastInbound.getTime() < WINDOW_MS;

// ---------------------------------------------------------------------------
// Connection (owners/managers)
// ---------------------------------------------------------------------------

export const connectInput = z.object({
  phoneNumberId: z.string().trim().regex(/^\d{5,30}$/, "waIdInvalid"),
  wabaId: z.string().trim().regex(/^\d{5,30}$/, "waIdInvalid"),
  accessToken: z.string().trim().min(20, "waTokenInvalid").max(1000),
  appSecret: z.string().trim().regex(/^[0-9a-f]{32}$/i, "waSecretInvalid"),
});

export function getAccount(db: Db, orgId: string) {
  return db.whatsAppAccount.findFirst({ where: { orgId }, include: { integration: true } });
}

/** Verify the credentials against Meta, store them encrypted, and subscribe our app to the WABA. */
export async function connectWhatsApp(db: Db, ctx: AccessContext, input: z.input<typeof connectInput>, f: Fetch = fetch) {
  ensure(isManager(ctx));
  const data = connectInput.parse(input);
  const taken = await db.whatsAppAccount.findUnique({ where: { phoneNumberId: data.phoneNumberId } });
  if (taken && taken.orgId !== ctx.orgId) throw conflict("waNumberTaken");

  let info: { display_phone_number?: string; verified_name?: string };
  try {
    info = await graph(f, data.phoneNumberId, data.accessToken, { query: { fields: "display_phone_number,verified_name" } });
  } catch (e) {
    throw invalid(e instanceof Error ? e.message : "waTokenInvalid");
  }
  let lastError: string | null = null;
  try {
    await graph(f, `${data.wabaId}/subscribed_apps`, data.accessToken, { method: "POST" });
  } catch (e) {
    lastError = e instanceof Error ? e.message : "Subscription failed";
  }

  const existing = await getAccount(db, ctx.orgId);
  const fields = {
    phoneNumberId: data.phoneNumberId,
    wabaId: data.wabaId,
    displayPhone: info.display_phone_number ?? null,
    verifiedName: info.verified_name ?? null,
    accessTokenEnc: encryptSecret(data.accessToken),
    appSecretEnc: encryptSecret(data.appSecret),
    lastError,
  };
  if (existing) {
    await db.whatsAppAccount.update({ where: { id: existing.id }, data: fields });
    return existing.id;
  }
  return db.$transaction(async (tx) => {
    const integration = await tx.integration.create({
      data: { orgId: ctx.orgId, kind: "WHATSAPP", name: "WhatsApp", token: newToken(), defaultSource: "WHATSAPP" },
    });
    const acct = await tx.whatsAppAccount.create({
      data: { ...fields, orgId: ctx.orgId, integrationId: integration.id, verifyToken: randomBytes(16).toString("hex") },
    });
    return acct.id;
  });
}

export async function updateAutoReply(db: Db, ctx: AccessContext, autoReply: string) {
  ensure(isManager(ctx));
  const acct = await getAccount(db, ctx.orgId);
  if (!acct) throw notFound();
  await db.whatsAppAccount.update({ where: { id: acct.id }, data: { autoReply: autoReply.trim().slice(0, 1000) || null } });
}

/** Removes the connection and its stored secrets. Message history stays on the leads. */
export async function disconnectWhatsApp(db: Db, ctx: AccessContext) {
  ensure(isManager(ctx));
  const acct = await getAccount(db, ctx.orgId);
  if (!acct) return;
  // Deleting the integration cascades to the account and its messages; keep messages instead.
  await db.$transaction([
    db.whatsAppAccount.update({ where: { id: acct.id }, data: { accessTokenEnc: "", appSecretEnc: "", lastError: "Disconnected" } }),
    db.integration.update({ where: { id: acct.integrationId }, data: { active: false } }),
  ]);
}

const connected = (a: WhatsAppAccount & { integration: Integration }) => a.integration.active && !!a.accessTokenEnc;

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

async function scopedLead(db: Db, ctx: AccessContext, leadId: string) {
  const lead = await db.lead.findFirst({ where: { id: leadId, ...leadScope(ctx) } });
  if (!lead) throw notFound();
  if (!lead.phone) throw invalid("waNoPhone");
  return lead;
}

async function liveAccount(db: Db, orgId: string) {
  const acct = await getAccount(db, orgId);
  if (!acct || !connected(acct)) throw invalid("waNotConnected");
  return acct;
}

async function send(db: Db, ctx: AccessContext, acct: WhatsAppAccount, leadId: string, to: string, payload: Record<string, unknown>, record: { type: string; body: string; templateName?: string }, f: Fetch) {
  try {
    const res = await graph<{ messages?: { id: string }[] }>(f, `${acct.phoneNumberId}/messages`, token(acct), {
      method: "POST",
      body: { messaging_product: "whatsapp", recipient_type: "individual", to, ...payload },
    });
    return db.whatsAppMessage.create({
      data: { orgId: ctx.orgId, accountId: acct.id, leadId, direction: "OUT", waMessageId: res.messages?.[0]?.id ?? null, status: "SENT", statusAt: new Date(), sentById: ctx.membershipId, ...record },
    });
  } catch (e) {
    const error = e instanceof Error ? e.message.slice(0, 300) : "Send failed";
    await db.whatsAppMessage.create({ data: { orgId: ctx.orgId, accountId: acct.id, leadId, direction: "OUT", status: "FAILED", error, sentById: ctx.membershipId, ...record } });
    throw invalid(error);
  }
}

export async function sendWhatsAppText(db: Db, ctx: AccessContext, leadId: string, text: string, f: Fetch = fetch, now = new Date()) {
  const body = text.trim().slice(0, 4096);
  if (!body) throw invalid("waEmpty");
  const lead = await scopedLead(db, ctx, leadId);
  if (!windowOpen(lead.waLastInboundAt, now)) throw invalid("waWindowClosed");
  const acct = await liveAccount(db, ctx.orgId);
  return send(db, ctx, acct, leadId, lead.phone!, { type: "text", text: { body, preview_url: true } }, { type: "text", body }, f);
}

export type Template = { name: string; language: string; category: string; body: string; params: number };

/** Approved templates for the school's WhatsApp Business Account. */
export async function listTemplates(db: Db, ctx: AccessContext, f: Fetch = fetch): Promise<Template[]> {
  const acct = await liveAccount(db, ctx.orgId);
  const res = await graph<{ data: { name: string; language: string; status: string; category: string; components?: { type: string; text?: string }[] }[] }>(
    f,
    `${acct.wabaId}/message_templates`,
    token(acct),
    { query: { fields: "name,language,status,category,components", limit: "200" } },
  );
  return res.data
    .filter((t) => t.status === "APPROVED")
    .map((t) => {
      const body = t.components?.find((c) => c.type === "BODY")?.text ?? "";
      const params = new Set(body.match(/\{\{\d+\}\}/g) ?? []).size;
      return { name: t.name, language: t.language, category: t.category, body, params };
    });
}

export const fillTemplate = (body: string, params: string[]) => body.replace(/\{\{(\d+)\}\}/g, (m, n) => params[Number(n) - 1] ?? m);

export async function sendWhatsAppTemplate(db: Db, ctx: AccessContext, leadId: string, input: { name: string; language: string; params: string[] }, f: Fetch = fetch) {
  const lead = await scopedLead(db, ctx, leadId);
  const templates = await listTemplates(db, ctx, f);
  const tpl = templates.find((t) => t.name === input.name && t.language === input.language);
  if (!tpl) throw notFound();
  const params = input.params.slice(0, tpl.params).map((p) => p.trim().slice(0, 500));
  if (params.length < tpl.params || params.some((p) => !p)) throw invalid("waParamsRequired");
  const acct = await liveAccount(db, ctx.orgId);
  return send(
    db,
    ctx,
    acct,
    leadId,
    lead.phone!,
    {
      type: "template",
      template: {
        name: tpl.name,
        language: { code: tpl.language },
        ...(params.length ? { components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] } : {}),
      },
    },
    { type: "template", body: fillTemplate(tpl.body, params), templateName: tpl.name },
    f,
  );
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

type WaMessage = {
  id: string;
  from: string;
  timestamp?: string;
  type: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string; filename?: string };
  location?: { latitude?: number; longitude?: number; name?: string };
  reaction?: { emoji?: string };
};
type WaStatus = { id: string; status: string; timestamp?: string; errors?: { title?: string; message?: string }[] };
export type WaWebhookBody = {
  object?: string;
  entry?: { changes?: { field?: string; value?: { metadata?: { phone_number_id?: string }; contacts?: { wa_id?: string; profile?: { name?: string } }[]; messages?: WaMessage[]; statuses?: WaStatus[] } }[] }[];
};

/** Human-readable text for any inbound message type. */
export function messageText(m: WaMessage): string {
  switch (m.type) {
    case "text":
      return m.text?.body ?? "";
    case "button":
      return m.button?.text ?? "";
    case "interactive":
      return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
    case "image":
      return `📷 ${m.image?.caption ?? ""}`.trim();
    case "video":
      return `🎥 ${m.video?.caption ?? ""}`.trim();
    case "audio":
      return "🎤";
    case "document":
      return `📄 ${m.document?.filename ?? m.document?.caption ?? ""}`.trim();
    case "location":
      return `📍 ${m.location?.name ?? `${m.location?.latitude}, ${m.location?.longitude}`}`;
    case "reaction":
      return m.reaction?.emoji ?? "";
    case "sticker":
      return "🙂";
    default:
      return `[${m.type}]`;
  }
}

/**
 * Rough guess at the language of a first message, so Spanish speakers reach the right agent through
 * assignment rules. Only answers when the signal is clear; otherwise the school's default applies.
 */
export function guessLanguage(text: string): "es" | "en" | null {
  const s = ` ${text.toLowerCase()} `;
  if (/[¿¡ñ]/.test(s)) return "es";
  const es = (s.match(/\b(hola|gracias|quiero|cuánto|cuanto|cuesta|precio|clases|licencia|piloto|volar|vuelo|buenas|buenos|información|informacion|por favor|tienen|puedo|necesito)\b/g) ?? []).length;
  const en = (s.match(/\b(hi|hello|thanks|thank you|how much|price|lessons|license|pilot|fly|flight|please|want|need|can i|do you)\b/g) ?? []).length;
  if (es > en) return "es";
  if (en > es) return "en";
  return null;
}

const STATUS_RANK: Record<MessageStatus, number> = { RECEIVED: 0, PENDING: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };
const STATUS_MAP: Record<string, MessageStatus> = { sent: "SENT", delivered: "DELIVERED", read: "READ", failed: "FAILED" };

export async function handleWhatsAppWebhook(db: Db, acct: WhatsAppAccount & { integration: Integration }, body: WaWebhookBody, f: Fetch = fetch, now = new Date()) {
  const out: { id: string; result: string }[] = [];
  if (body.object !== "whatsapp_business_account") return out;
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (change.field !== "messages" || !v) continue;
      // A number belongs to one school: never accept events for another account's number.
      if (v.metadata?.phone_number_id && v.metadata.phone_number_id !== acct.phoneNumberId) continue;

      for (const s of v.statuses ?? []) {
        const next = STATUS_MAP[s.status];
        const msg = next && (await db.whatsAppMessage.findUnique({ where: { waMessageId: s.id } }));
        if (!msg || msg.accountId !== acct.id || STATUS_RANK[next] <= STATUS_RANK[msg.status]) continue;
        const error = s.errors?.[0] ? (s.errors[0].message ?? s.errors[0].title ?? null) : null;
        await db.whatsAppMessage.update({ where: { id: msg.id }, data: { status: next, statusAt: now, ...(error ? { error } : {}) } });
        out.push({ id: s.id, result: next });
      }

      for (const m of v.messages ?? []) {
        if (await db.whatsAppMessage.findUnique({ where: { waMessageId: m.id } })) {
          out.push({ id: m.id, result: "DUPLICATE" });
          continue;
        }
        const phone = normalizePhone(m.from);
        if (!phone) continue;
        const name = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? v.contacts?.[0]?.profile?.name;
        const text = messageText(m);
        let lead = await db.lead.findFirst({ where: { orgId: acct.orgId, phone }, orderBy: { createdAt: "desc" } });
        let isNew = false;
        if (!lead) {
          // First contact: goes through normal intake (assignment rules, "contact now" task, log).
          const res = await ingest(
            db,
            acct.integration,
            { name: name || phone, phone, message: text, language: guessLanguage(text) ?? "" },
            { source: "WHATSAPP", via: "WhatsApp", externalId: `wa:${m.id}` },
          );
          if (!res.leadId) {
            out.push({ id: m.id, result: res.status });
            continue;
          }
          lead = await db.lead.findUniqueOrThrow({ where: { id: res.leadId } });
          isNew = res.status === "CREATED";
        }
        const at = m.timestamp ? new Date(Number(m.timestamp) * 1000) : now;
        await db.$transaction([
          db.whatsAppMessage.create({
            data: { orgId: acct.orgId, accountId: acct.id, leadId: lead.id, direction: "IN", waMessageId: m.id, type: m.type, body: text, status: "RECEIVED", createdAt: at },
          }),
          // A message from them is a real two-way contact.
          db.lead.update({ where: { id: lead.id }, data: { waLastInboundAt: at, lastContactAt: at, ...(lead.firstContactAt ? {} : { firstContactAt: at }) } }),
        ]);
        out.push({ id: m.id, result: isNew ? "NEW_LEAD" : "MESSAGE" });

        if (isNew && acct.autoReply) {
          try {
            const res = await graph<{ messages?: { id: string }[] }>(f, `${acct.phoneNumberId}/messages`, token(acct), {
              method: "POST",
              body: { messaging_product: "whatsapp", to: phone, type: "text", text: { body: acct.autoReply } },
            });
            await db.whatsAppMessage.create({
              data: { orgId: acct.orgId, accountId: acct.id, leadId: lead.id, direction: "OUT", waMessageId: res.messages?.[0]?.id ?? null, type: "text", body: acct.autoReply, status: "SENT", statusAt: now },
            });
          } catch (e) {
            await db.whatsAppAccount.update({ where: { id: acct.id }, data: { lastError: e instanceof Error ? e.message.slice(0, 300) : "Auto-reply failed" } });
          }
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function getConversation(db: Db, ctx: AccessContext, leadId: string) {
  const lead = await db.lead.findFirst({ where: { id: leadId, ...leadScope(ctx) }, select: { id: true, waLastInboundAt: true } });
  if (!lead) throw notFound();
  const messages = await db.whatsAppMessage.findMany({
    where: { orgId: ctx.orgId, leadId },
    orderBy: [{ createdAt: "asc" }, { seq: "asc" }],
    take: 500,
    include: { sentBy: { select: { user: { select: { name: true } } } } },
  });
  return { messages, windowOpen: windowOpen(lead.waLastInboundAt), lastInboundAt: lead.waLastInboundAt };
}

export async function markRead(db: Db, ctx: AccessContext, leadId: string) {
  const lead = await db.lead.findFirst({ where: { id: leadId, ...leadScope(ctx) }, select: { id: true } });
  if (!lead) throw notFound();
  await db.whatsAppMessage.updateMany({ where: { orgId: ctx.orgId, leadId, direction: "IN", readAt: null }, data: { readAt: new Date() } });
}

const unreadWhere = (ctx: AccessContext): Prisma.WhatsAppMessageWhereInput => ({ orgId: ctx.orgId, direction: "IN", readAt: null, lead: leadScope(ctx) });

export function unreadCount(db: Db, ctx: AccessContext) {
  return db.whatsAppMessage.count({ where: unreadWhere(ctx) });
}

/** Conversations, newest first, with each one's last message and unread count. */
export async function inbox(db: Db, ctx: AccessContext) {
  const latest = await db.whatsAppMessage.findMany({
    where: { orgId: ctx.orgId, lead: leadScope(ctx) },
    orderBy: [{ createdAt: "desc" }, { seq: "desc" }],
    distinct: ["leadId"],
    take: 200,
    include: { lead: { select: { id: true, firstName: true, lastName: true, phone: true, waLastInboundAt: true, owner: { select: { user: { select: { name: true } } } }, stage: { select: { name: true, color: true } } } } },
  });
  const unread = await db.whatsAppMessage.groupBy({ by: ["leadId"], where: unreadWhere(ctx), _count: { _all: true } });
  const counts = new Map(unread.map((u) => [u.leadId, u._count._all]));
  return latest.map((m) => ({ ...m, unread: counts.get(m.leadId) ?? 0 }));
}
