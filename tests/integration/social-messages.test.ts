import { createHmac, randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { makeSchool, prisma, resetDb } from "../helpers";
import { encryptSecret } from "@/lib/crypto";
import { receiveSocialMessages, socialInbox, socialConversation, readSocialConversation, sendSocialReply, SOCIAL_WINDOW_MS } from "@/modules/social-messages";
import { deleteLead } from "@/modules/leads";
import { POST } from "@/app/api/webhooks/meta/route";
import { connectMetaPages, disconnectMetaPage, metaLoginUrl } from "@/modules/meta";

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.META_APP_ID = "test"; process.env.META_APP_SECRET = "secret"; process.env.META_VERIFY_TOKEN = "verify";
});
beforeEach(resetDb);
afterEach(() => vi.unstubAllGlobals());
const event = (mid = "mid-1", object = "page", asset = "page-1", sender = "sender-1", timestamp = Date.now()) => ({ object, entry: [{ id: asset, messaging: [{ sender: { id: sender }, recipient: { id: asset }, timestamp, message: { mid, text: "Hello school" } }] }] });
async function fixture() {
  const school = await makeSchool();
  const integration = await prisma.integration.create({ data: { orgId: school.org.id, kind: "META", name: "Meta", token: randomUUID(), defaultOwnerId: school.owner.membershipId, defaultProgram: "OTHER" } });
  const page = await prisma.metaPage.create({ data: { orgId: school.org.id, integrationId: integration.id, pageId: "page-1", instagramId: "ig-1", pageName: "School", accessTokenEnc: encryptSecret("token"), subscribed: true, messengerEnabled: true, instagramEnabled: true } });
  return { ...school, page, integration };
}
const signed = (body: unknown, secret = "secret") => { const raw = JSON.stringify(body); return new Request("http://localhost/api/webhooks/meta", { method: "POST", body: raw, headers: { "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}` } }); };
const success = vi.fn(async () => Response.json({ message_id: "out-1" }));

describe("Messenger and Instagram conversations", () => {
  it("saves a signed message, assigned lead, timeline and task; duplicates and concurrent retries are harmless", async () => {
    const s = await fixture(); const body = event();
    expect((await POST(signed(body))).status).toBe(200);
    await Promise.all([receiveSocialMessages(prisma, body), receiveSocialMessages(prisma, body)]);
    expect(await prisma.socialMessage.count()).toBe(1); expect(await prisma.lead.count()).toBe(1); expect(await prisma.task.count()).toBe(1);
    expect(await prisma.lead.findFirst()).toMatchObject({ source: "FACEBOOK", ownerId: s.owner.membershipId, phone: null, email: null, program: "OTHER" });
    await receiveSocialMessages(prisma, event("mid-2"));
    expect(await prisma.lead.count()).toBe(1); expect(await prisma.socialMessage.count()).toBe(2); expect(await prisma.task.count()).toBe(1);
  });
  it("does not fabricate a phone or merge identities across channels/pages", async () => {
    const s = await fixture();
    await receiveSocialMessages(prisma, event());
    await receiveSocialMessages(prisma, event("mid-1", "instagram", "ig-1"));
    await prisma.metaPage.create({ data: { orgId: s.org.id, integrationId: s.integration.id, pageId: "page-2", pageName: "Second", accessTokenEnc: encryptSecret("other"), messengerEnabled: true } });
    await receiveSocialMessages(prisma, event("mid-1", "page", "page-2"));
    expect(await prisma.lead.count()).toBe(3); expect(await prisma.socialConversation.count()).toBe(3);
    expect((await prisma.lead.findMany()).every(l => l.phone === null)).toBe(true);
  });
  it("rejects forged signatures, mismatched recipients, unknown pages, paused sources and unapproved channels", async () => {
    const s = await fixture();
    expect((await POST(signed(event(), "wrong"))).status).toBe(401);
    expect((await receiveSocialMessages(prisma, event("a", "page", "unknown"))).unavailable).toBe(1);
    const wrong = event(); wrong.entry[0].messaging[0].recipient.id = "different";
    expect((await receiveSocialMessages(prisma, wrong)).unavailable).toBe(1);
    await prisma.metaPage.update({ where: { id: s.page.id }, data: { messengerEnabled: false } });
    expect((await POST(signed(event()))).status).toBe(503);
    await prisma.integration.update({ where: { id: s.integration.id }, data: { active: false } });
    expect((await receiveSocialMessages(prisma, event("b", "instagram", "ig-1"))).unavailable).toBe(1);
    expect(await prisma.lead.count()).toBe(0);
  });
  it("keeps attachment types without fetching URLs, ignores echoes, and does not regress the reply window for older events", async () => {
    await fixture(); const now = Date.now();
    const attachment = event("a", "page", "page-1", "sender-1", now);
    Object.assign(attachment.entry[0].messaging[0].message, { text: undefined, attachments: [{ type: "image", payload: { url: "http://private.invalid/secret" } }] });
    await receiveSocialMessages(prisma, attachment);
    await receiveSocialMessages(prisma, event("older", "page", "page-1", "sender-1", now - 60000));
    const echo = event("echo"); Object.assign(echo.entry[0].messaging[0].message, { is_echo: true }); await receiveSocialMessages(prisma, echo);
    const c = await prisma.socialConversation.findFirstOrThrow(); expect(c.lastInboundAt.getTime()).toBe(now);
    expect(await prisma.socialMessage.findFirst({ where: { providerMessageId: "a" } })).toMatchObject({ body: null, attachmentTypes: ["image"] });
    expect(await prisma.socialMessage.count()).toBe(2);
  });
  it("rolls back a partially saved inbound event so Meta can retry", async () => {
    await fixture(); const original = prisma.$transaction.bind(prisma);
    const stub = vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("db unavailable"));
    expect((await POST(signed(event()))).status).toBe(503); stub.mockRestore();
    expect(await prisma.lead.count()).toBe(0);
    expect(original).toBeTruthy(); expect((await POST(signed(event()))).status).toBe(200);
  });
  it("scopes inbox, read state and reply access to school and assigned agent", async () => {
    const s = await fixture(); const other = await makeSchool("Other"); await receiveSocialMessages(prisma, event());
    const c = await prisma.socialConversation.findFirstOrThrow();
    expect(await socialInbox(prisma, other.owner)).toHaveLength(0); expect(await socialInbox(prisma, s.agent)).toHaveLength(0);
    await expect(socialConversation(prisma, other.owner, c.id)).rejects.toThrow();
    await expect(readSocialConversation(prisma, s.agent, c.id)).rejects.toThrow();
    await expect(sendSocialReply(prisma, other.owner, c.id, { text: "No", requestId: randomUUID() }, success)).rejects.toThrow();
    await readSocialConversation(prisma, s.owner, c.id); expect(await prisma.socialMessage.count({ where: { readAt: null } })).toBe(0);
  });
  it("sends one explicit reply to the scoped recipient, records contact and prevents double submission", async () => {
    const s = await fixture(); await receiveSocialMessages(prisma, event()); const c = await prisma.socialConversation.findFirstOrThrow();
    const f = vi.fn(async (_url: unknown, init?: RequestInit) => { expect(JSON.parse(init!.body as string)).toMatchObject({ recipient: { id: "sender-1" }, message: { text: "Hello" }, messaging_type: "RESPONSE" }); expect(init!.headers).toMatchObject({ Authorization: "Bearer token" }); return Response.json({ message_id: "out-1" }); });
    const input = { text: "Hello", requestId: randomUUID() };
    await Promise.allSettled([sendSocialReply(prisma, s.owner, c.id, input, f), sendSocialReply(prisma, s.owner, c.id, input, f)]);
    await sendSocialReply(prisma, s.owner, c.id, input, f); expect(f).toHaveBeenCalledTimes(1);
    expect(await prisma.socialMessage.findFirst({ where: { direction: "OUT" } })).toMatchObject({ status: "SENT", providerMessageId: "out-1" });
    expect((await prisma.lead.findFirstOrThrow()).firstContactAt).not.toBeNull();
  });
  it("uses the Instagram asset endpoint without a Messenger-specific payload", async () => {
    const s = await fixture(); await receiveSocialMessages(prisma, event("ig-mid", "instagram", "ig-1")); const c = await prisma.socialConversation.findFirstOrThrow();
    const f = vi.fn(async (url: unknown, init?: RequestInit) => { expect(String(url)).toContain("/ig-1/messages"); expect(JSON.parse(init!.body as string)).not.toHaveProperty("messaging_type"); return Response.json({ message_id: "ig-out" }); });
    await sendSocialReply(prisma, s.owner, c.id, { text: "Hello", requestId: randomUUID() }, f); expect(f).toHaveBeenCalledOnce();
  });
  it("blocks expired reply windows and preserves ambiguous failures without retrying", async () => {
    const s = await fixture(); await receiveSocialMessages(prisma, event("old", "page", "page-1", "sender-1", Date.now() - SOCIAL_WINDOW_MS - 1)); const c = await prisma.socialConversation.findFirstOrThrow(); const f = vi.fn(async () => { throw new Error("network timeout"); });
    await expect(sendSocialReply(prisma, s.owner, c.id, { text: "Too late", requestId: randomUUID() }, f)).rejects.toThrow("24-hour"); expect(f).not.toHaveBeenCalled();
    await receiveSocialMessages(prisma, event("new")); const input = { text: "Hello", requestId: randomUUID() };
    await expect(sendSocialReply(prisma, s.owner, c.id, input, f)).rejects.toThrow("unconfirmed");
    await expect(sendSocialReply(prisma, s.owner, c.id, input, f)).rejects.toThrow("unconfirmed"); expect(f).toHaveBeenCalledOnce();
    expect(await prisma.socialMessage.findFirst({ where: { direction: "OUT" } })).toMatchObject({ status: "FAILED", body: "Hello" });
  });
  it("verifies granted permissions, subscribes both assets and preserves messaging during a lead-only refresh", async () => {
    const s = await fixture();
    const f = vi.fn(async (input: unknown) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("oauth/access_token")) return Response.json({ access_token: "token" });
      if (url.pathname.endsWith("me/accounts")) return Response.json({ data: [{ id: "page-1", name: "School", access_token: "token", instagram_business_account: { id: "ig-1" } }] });
      if (url.pathname.endsWith("me/permissions")) return Response.json({ data: ["pages_messaging", "pages_manage_metadata", "instagram_basic", "instagram_manage_messages"].map(permission => ({ permission, status: "granted" })) });
      return Response.json({ success: true });
    });
    await connectMetaPages(prisma, s.org.id, "code", f, true);
    expect(await prisma.metaPage.findUnique({ where: { id: s.page.id } })).toMatchObject({ messengerEnabled: true, instagramEnabled: true, instagramId: "ig-1" });
    expect(f.mock.calls.some(([url]) => String(url).includes("page-1/subscribed_apps?subscribed_fields=leadgen%2Cmessages"))).toBe(true);
    expect(f.mock.calls.some(([url]) => String(url).includes("ig-1/subscribed_apps?subscribed_fields=messages"))).toBe(true);
    await connectMetaPages(prisma, s.org.id, "code", f);
    expect(await prisma.metaPage.findUnique({ where: { id: s.page.id } })).toMatchObject({ messengerEnabled: true, instagramEnabled: true });
  });
  it("does not claim a messaging connection without granted permission", async () => {
    const s = await fixture();
    const f = vi.fn(async (input: unknown) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("oauth/access_token")) return Response.json({ access_token: "token" });
      if (url.pathname.endsWith("me/accounts")) return Response.json({ data: [] });
      return Response.json({ data: [] });
    });
    await expect(connectMetaPages(prisma, s.org.id, "code", f, true)).rejects.toThrow("Approve Messenger");
  });
  it("disconnects access without deleting conversation history", async () => {
    const s = await fixture(); await receiveSocialMessages(prisma, event());
    await disconnectMetaPage(prisma, s.org.id, s.page.id, async () => Response.json({ success: true }));
    expect(await prisma.socialMessage.count()).toBe(1);
    expect(await prisma.metaPage.findUnique({ where: { id: s.page.id } })).toMatchObject({ accessTokenEnc: "", messengerEnabled: false, instagramEnabled: false, subscribed: false });
    const c = await prisma.socialConversation.findFirstOrThrow();
    await expect(sendSocialReply(prisma, s.owner, c.id, { text: "No", requestId: randomUUID() }, success)).rejects.toThrow("paused");
  });
  it("deletes conversation content, timeline and tasks with an owner-approved lead deletion without affecting another contact", async () => {
    const s = await fixture();
    await receiveSocialMessages(prisma, event());
    await receiveSocialMessages(prisma, event("other-mid", "instagram", "ig-1", "other-sender"));
    const c = await prisma.socialConversation.findFirstOrThrow({ where: { channel: "MESSENGER" } });
    await sendSocialReply(prisma, s.owner, c.id, { text: "Test reply", requestId: randomUUID() }, async () => Response.json({ message_id: "deleted-out" }));
    await expect(deleteLead(prisma, s.agent, c.leadId)).rejects.toThrow();
    expect(await prisma.socialMessage.count({ where: { conversationId: c.id } })).toBe(2);
    await deleteLead(prisma, s.owner, c.leadId);
    expect(await prisma.socialConversation.findUnique({ where: { id: c.id } })).toBeNull();
    expect(await prisma.socialMessage.count({ where: { conversationId: c.id } })).toBe(0);
    expect(await prisma.activity.count({ where: { leadId: c.leadId } })).toBe(0);
    expect(await prisma.task.count({ where: { leadId: c.leadId } })).toBe(0);
    expect(await prisma.socialConversation.count()).toBe(1);
    expect(await prisma.socialMessage.count()).toBe(1);
  });
  it("asks for messaging scopes only on the explicit messaging connection", () => {
    expect(new URL(metaLoginUrl("state")).searchParams.get("scope")).not.toContain("pages_messaging");
    expect(new URL(metaLoginUrl("state", true)).searchParams.get("scope")).toContain("instagram_manage_messages");
  });
});
