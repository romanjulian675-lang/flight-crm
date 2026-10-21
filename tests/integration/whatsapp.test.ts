import { createHmac } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeSchool, prisma, resetDb } from "../helpers";
import {
  connectWhatsApp,
  fillTemplate,
  getAccount,
  getConversation,
  guessLanguage,
  handleWhatsAppWebhook,
  inbox,
  listTemplates,
  markRead,
  messageText,
  sendWhatsAppTemplate,
  sendWhatsAppText,
  unreadCount,
  windowOpen,
  type Fetch,
} from "@/modules/whatsapp";
import { createLead } from "@/modules/leads";
import { GET as waGET, POST as waPOST } from "@/app/api/webhooks/whatsapp/[token]/route";

const SECRET = "0123456789abcdef0123456789abcdef";

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});
beforeEach(resetDb);

type Call = { url: string; method: string; body: unknown; auth: string | null };

/** Fake Graph API. Records every call; `fail` makes sends error out. */
function graph(opts: { fail?: boolean } = {}) {
  const calls: Call[] = [];
  let n = 0;
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/v[\d.]+\//, "");
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url: path, method: init?.method ?? "GET", body, auth: new Headers(init?.headers).get("authorization") });
    const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
    if (path === "109876543210001" || path === "109876543210002") return ok({ display_phone_number: "+1 407-555-0100", verified_name: "Sunrise Aviation" });
    if (path.endsWith("/subscribed_apps")) return ok({ success: true });
    if (path.endsWith("/messages")) {
      if (opts.fail) return new Response(JSON.stringify({ error: { message: "Recipient phone number not in allowed list" } }), { status: 400 });
      return ok({ messages: [{ id: `wamid.OUT${++n}` }] });
    }
    if (path.endsWith("/message_templates"))
      return ok({
        data: [
          { name: "follow_up", language: "en_US", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "Hi {{1}}, still interested in flying? Reply to chat with {{2}}." }] },
          { name: "draft_one", language: "en_US", status: "PENDING", category: "MARKETING", components: [{ type: "BODY", text: "x" }] },
          { name: "hola", language: "es", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "¡Hola! ¿Seguimos?" }] },
        ],
      });
    return new Response(JSON.stringify({ error: { message: `no route ${path}` } }), { status: 404 });
  }) as Fetch;
  return { f, calls };
}

async function connected(autoReply?: string) {
  const s = await makeSchool();
  const g = graph();
  await connectWhatsApp(prisma, s.manager, { phoneNumberId: "109876543210001", wabaId: "200000000000001", accessToken: "EAAG-test-token-123456", appSecret: SECRET }, g.f);
  if (autoReply) await prisma.whatsAppAccount.updateMany({ data: { autoReply } });
  const acct = (await getAccount(prisma, s.org.id))!;
  return { s, acct, g };
}

const inbound = (from: string, id: string, text: string, opts: { name?: string; ts?: number; pn?: string } = {}) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: {
            metadata: { phone_number_id: opts.pn ?? "109876543210001" },
            contacts: [{ wa_id: from, profile: { name: opts.name ?? "Rosa Pilot" } }],
            messages: [{ id, from, timestamp: String(opts.ts ?? Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
          },
        },
      ],
    },
  ],
});
const status = (id: string, s: string, errors?: { message: string }[]) => ({
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "109876543210001" }, statuses: [{ id, status: s, errors }] } }] }],
});

describe("connecting", () => {
  it("verifies credentials with Meta, subscribes the WABA, and stores secrets encrypted", async () => {
    const { acct, g } = await connected();
    expect(acct).toMatchObject({ displayPhone: "+1 407-555-0100", verifiedName: "Sunrise Aviation", lastError: null });
    expect(acct.accessTokenEnc).not.toContain("EAAG");
    expect(acct.appSecretEnc).not.toContain(SECRET);
    expect(g.calls.map((c) => `${c.method} ${c.url}`)).toEqual(["GET 109876543210001", "POST 200000000000001/subscribed_apps"]);
    expect(g.calls[0].auth).toBe("Bearer EAAG-test-token-123456");
  });

  it("only managers connect; a number belongs to one school; bad input is refused", async () => {
    const { s } = await connected();
    const other = await makeSchool("Other");
    const g = graph();
    const input = { phoneNumberId: "109876543210001", wabaId: "200000000000009", accessToken: "EAAG-other-token-12345", appSecret: SECRET };
    await expect(connectWhatsApp(prisma, other.manager, input, g.f)).rejects.toThrow("waNumberTaken");
    await expect(connectWhatsApp(prisma, s.agent, { ...input, phoneNumberId: "109876543210002" }, g.f)).rejects.toThrow();
    await expect(connectWhatsApp(prisma, other.owner, { ...input, phoneNumberId: "109876543210002", appSecret: "short" }, g.f)).rejects.toThrow();
  });
});

describe("incoming messages", () => {
  it("a new number becomes an assigned lead with a task, gets the auto-reply, and counts as contact", async () => {
    const { s, acct, g } = await connected("Hi! We'll reply shortly ✈️");
    const out = await handleWhatsAppWebhook(prisma, acct, inbound("14075550123", "wamid.IN1", "Hola, ¿cuánto cuesta la licencia?"), g.f);
    expect(out).toEqual([{ id: "wamid.IN1", result: "NEW_LEAD" }]);

    const lead = await prisma.lead.findFirstOrThrow({ where: { orgId: s.org.id }, include: { tasks: true } });
    expect(lead).toMatchObject({ firstName: "Rosa", lastName: "Pilot", phone: "14075550123", source: "WHATSAPP", ownerId: s.agent.membershipId });
    expect(lead.firstContactAt).not.toBeNull();
    expect(lead.tasks).toHaveLength(1);

    const conv = await getConversation(prisma, s.agent, lead.id);
    expect(conv.windowOpen).toBe(true);
    expect(conv.messages.map((m) => [m.direction, m.body, m.sentById])).toEqual([
      ["IN", "Hola, ¿cuánto cuesta la licencia?", null],
      ["OUT", "Hi! We'll reply shortly ✈️", null],
    ]);
    expect(g.calls.at(-1)?.body).toMatchObject({ to: "14075550123", type: "text" });
  });

  it("further messages attach to the lead (no auto-reply); retries are ignored; other numbers' events are dropped", async () => {
    const { s, acct, g } = await connected("auto");
    await handleWhatsAppWebhook(prisma, acct, inbound("14075550123", "wamid.IN1", "Hi"), g.f);
    const sends = g.calls.length;
    expect((await handleWhatsAppWebhook(prisma, acct, inbound("14075550123", "wamid.IN2", "Still there?"), g.f))[0].result).toBe("MESSAGE");
    expect((await handleWhatsAppWebhook(prisma, acct, inbound("14075550123", "wamid.IN2", "Still there?"), g.f))[0].result).toBe("DUPLICATE");
    expect(await handleWhatsAppWebhook(prisma, acct, inbound("14075550999", "wamid.X", "hi", { pn: "SOMEONE_ELSE" }), g.f)).toEqual([]);
    expect(g.calls.length).toBe(sends);
    expect(await prisma.lead.count({ where: { orgId: s.org.id } })).toBe(1);
    expect(await prisma.whatsAppMessage.count({ where: { direction: "IN" } })).toBe(2);
  });

  it("matches an existing lead by phone instead of creating a duplicate", async () => {
    const { s, acct, g } = await connected();
    const lead = await createLead(prisma, s.agent2, { firstName: "Known", phone: "(407) 555-0123" });
    expect((await handleWhatsAppWebhook(prisma, acct, inbound("14075550123", "wamid.IN1", "It's me"), g.f))[0].result).toBe("MESSAGE");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).waLastInboundAt).not.toBeNull();
  });

  it("guesses the language of a first message so Spanish rules can route it", async () => {
    expect(guessLanguage("Hola, ¿cuánto cuesta?")).toBe("es");
    expect(guessLanguage("quiero informacion de clases")).toBe("es");
    expect(guessLanguage("Hi, how much is the private pilot license?")).toBe("en");
    expect(guessLanguage("👍")).toBeNull();
    const { s, acct, g } = await connected();
    await handleWhatsAppWebhook(prisma, acct, inbound("14075550301", "wamid.L1", "Hola! Quiero volar"), g.f);
    expect((await prisma.lead.findFirstOrThrow({ where: { orgId: s.org.id } })).language).toBe("es");
  });

  it("describes non-text messages", () => {
    expect(messageText({ id: "1", from: "1", type: "image", image: { caption: "My logbook" } })).toBe("📷 My logbook");
    expect(messageText({ id: "1", from: "1", type: "location", location: { latitude: 28.5, longitude: -81.3 } })).toBe("📍 28.5, -81.3");
    expect(messageText({ id: "1", from: "1", type: "interactive", interactive: { button_reply: { title: "Yes" } } })).toBe("Yes");
  });
});

describe("sending", () => {
  it("free text inside the 24 h window; template only after it", async () => {
    const { s, acct, g } = await connected();
    const lead = await createLead(prisma, s.agent, { firstName: "Sam", phone: "4075550111" });
    await expect(sendWhatsAppText(prisma, s.agent, lead.id, "Hello", g.f)).rejects.toThrow("waWindowClosed");

    await handleWhatsAppWebhook(prisma, acct, inbound("14075550111", "wamid.IN9", "Hi"), g.f);
    const msg = await sendWhatsAppText(prisma, s.agent, lead.id, "Great! When can you fly?", g.f);
    expect(msg).toMatchObject({ direction: "OUT", status: "SENT", waMessageId: "wamid.OUT1", sentById: s.agent.membershipId });

    const later = new Date(Date.now() + 25 * 3_600_000);
    await expect(sendWhatsAppText(prisma, s.agent, lead.id, "Hello?", g.f, later)).rejects.toThrow("waWindowClosed");
    expect(windowOpen(new Date(), later)).toBe(false);
  });

  it("templates: only approved ones, every value required, body rendered for the timeline", async () => {
    const { s, g } = await connected();
    const lead = await createLead(prisma, s.agent, { firstName: "Tom", phone: "4075550112" });
    expect((await listTemplates(prisma, s.agent, g.f)).map((t) => [t.name, t.params])).toEqual([
      ["follow_up", 2],
      ["hola", 0],
    ]);
    await expect(sendWhatsAppTemplate(prisma, s.agent, lead.id, { name: "follow_up", language: "en_US", params: ["Tom"] }, g.f)).rejects.toThrow("waParamsRequired");
    const sent = await sendWhatsAppTemplate(prisma, s.agent, lead.id, { name: "follow_up", language: "en_US", params: ["Tom", "Ana"] }, g.f);
    expect(sent.body).toBe("Hi Tom, still interested in flying? Reply to chat with Ana.");
    expect(g.calls.at(-1)?.body).toMatchObject({ type: "template", template: { name: "follow_up", language: { code: "en_US" }, components: [{ type: "body", parameters: [{ text: "Tom" }, { text: "Ana" }] }] } });
    expect(fillTemplate("{{1}} and {{3}}", ["a"])).toBe("a and {{3}}");
  });

  it("records failures, and respects lead visibility", async () => {
    const { s, acct } = await connected();
    const lead = await createLead(prisma, s.agent, { firstName: "Uma", phone: "4075550113" });
    await handleWhatsAppWebhook(prisma, acct, inbound("14075550113", "wamid.IN5", "hi"), graph().f);
    await expect(sendWhatsAppText(prisma, s.agent, lead.id, "Hello", graph({ fail: true }).f)).rejects.toThrow("not in allowed list");
    expect(await prisma.whatsAppMessage.findFirst({ where: { direction: "OUT" } })).toMatchObject({ status: "FAILED" });
    await expect(sendWhatsAppText(prisma, s.agent2, lead.id, "Hello", graph().f)).rejects.toThrow();
  });

  it("delivery statuses only move forward", async () => {
    const { s, acct, g } = await connected();
    const lead = await createLead(prisma, s.agent, { firstName: "Vic", phone: "4075550114" });
    await handleWhatsAppWebhook(prisma, acct, inbound("14075550114", "wamid.IN6", "hi"), g.f);
    const msg = await sendWhatsAppText(prisma, s.agent, lead.id, "Hey", g.f);
    for (const st of ["delivered", "read", "delivered"]) await handleWhatsAppWebhook(prisma, acct, status(msg.waMessageId!, st), g.f);
    expect((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: msg.id } })).status).toBe("READ");
  });
});

describe("inbox", () => {
  it("lists conversations with unread counts per visible lead and clears them when opened", async () => {
    const { s, acct, g } = await connected();
    await handleWhatsAppWebhook(prisma, acct, inbound("14075550201", "wamid.A1", "one"), g.f); // → agent
    await handleWhatsAppWebhook(prisma, acct, inbound("14075550201", "wamid.A2", "two"), g.f);
    await handleWhatsAppWebhook(prisma, acct, inbound("14075550202", "wamid.B1", "other", { name: "Bea" }), g.f); // → agent2
    expect(await unreadCount(prisma, s.manager)).toBe(3);
    expect(await unreadCount(prisma, s.agent)).toBe(2);
    const rows = await inbox(prisma, s.agent);
    expect(rows.map((r) => [r.body, r.unread])).toEqual([["two", 2]]);
    await markRead(prisma, s.agent, rows[0].leadId);
    expect(await unreadCount(prisma, s.agent)).toBe(0);
    await expect(markRead(prisma, s.agent2, rows[0].leadId)).rejects.toThrow();
  });
});

describe("webhook endpoint", () => {
  it("verifies Meta's handshake and the per-account signature", async () => {
    const { acct } = await connected();
    const token = acct.integration.token;
    const ctx = { params: Promise.resolve({ token }) };
    const ok = await waGET(new Request(`http://x/api/webhooks/whatsapp/${token}?hub.mode=subscribe&hub.verify_token=${acct.verifyToken}&hub.challenge=777`), ctx);
    expect(await ok.text()).toBe("777");
    expect((await waGET(new Request(`http://x/api/webhooks/whatsapp/${token}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`), ctx)).status).toBe(403);

    const body = JSON.stringify(status("wamid.none", "read"));
    const sig = "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
    expect((await waPOST(new Request("http://x", { method: "POST", body }), ctx)).status).toBe(401);
    expect((await waPOST(new Request("http://x", { method: "POST", body, headers: { "x-hub-signature-256": sig } }), ctx)).status).toBe(200);
    expect((await waPOST(new Request("http://x", { method: "POST", body, headers: { "x-hub-signature-256": sig } }), { params: Promise.resolve({ token: "z".repeat(32) }) })).status).toBe(404);
  });
});
