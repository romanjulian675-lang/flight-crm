import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { makeSchool, prisma, resetDb } from "../helpers";
import { encryptSecret } from "@/lib/crypto";
import { receiveSocialMessages } from "@/modules/social-messages";
import { configureInstagramWelcome, drainInstagramWelcomes, isWelcomeTrigger } from "@/modules/instagram-welcome";

beforeAll(() => { process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64"); });
beforeEach(resetDb);
const event = (mid = "first", text = "Hello", at = Date.now(), object = "instagram", asset = "ig-1") => ({ object, entry: [{ id: asset, messaging: [{ sender: { id: "sender-1" }, recipient: { id: asset }, timestamp: at, message: { mid, text } }] }] });
async function fixture(enabled = true) {
  const s = await makeSchool();
  const integration = await prisma.integration.create({ data: { orgId: s.org.id, kind: "META", name: "Meta", token: randomUUID(), config: { instagramWelcomeOnce: enabled } } });
  await prisma.metaPage.create({ data: { orgId: s.org.id, integrationId: integration.id, pageId: "page-1", instagramId: "ig-1", pageName: "School", accessTokenEnc: encryptSecret("test"), instagramEnabled: true, messengerEnabled: true } });
  return { ...s, integration };
}
function meta(at: number, prior = false, timeout = false) {
  return vi.fn(async (url: unknown, init?: RequestInit) => {
    if (init?.method === "POST") { if (timeout) throw new Error("timeout"); return Response.json({ message_id: "welcome-out" }); }
    if (String(url).includes("/conversations?")) return Response.json({ data: [{ id: "thread", participants: { data: [{ id: "sender-1" }, { id: "ig-1" }] } }] });
    const first = { id: "first", from: { id: "sender-1" }, to: { data: [{ id: "ig-1" }] }, created_time: new Date(at).toISOString() };
    return Response.json({ messages: { data: prior ? [first, { ...first, id: "old", created_time: new Date(at - 86400000).toISOString() }] : [first] } });
  });
}
it("matches opening greetings without matching words containing hi", () => {
  for (const text of ["pilot", "Hi!", "hello there", "Good morning", "good afternoon", "Good evening."]) expect(isWelcomeTrigger(text)).toBe(true);
  for (const text of ["this is my question", "high", "helicopter", "I already said hello", null]) expect(isWelcomeTrigger(text)).toBe(false);
});
it("requires a scoped manager to opt in", async () => {
  const s = await fixture(false); const other = await makeSchool("Other");
  await expect(configureInstagramWelcome(prisma, s.agent, s.integration.id, true)).rejects.toThrow();
  await expect(configureInstagramWelcome(prisma, other.owner, s.integration.id, true)).rejects.toThrow();
  await configureInstagramWelcome(prisma, s.manager, s.integration.id, true);
  expect((await prisma.integration.findUniqueOrThrow({ where: { id: s.integration.id } })).config).toMatchObject({ instagramWelcomeOnce: true });
});
it("queues once and sends once even with concurrent workers, duplicates and a resumed conversation", async () => {
  await fixture(); const at = Date.now(); const body = event("first", "hi", at);
  await Promise.all([receiveSocialMessages(prisma, body, { live: true }), receiveSocialMessages(prisma, body, { live: true })]);
  expect(await prisma.instagramWelcome.count()).toBe(1); const f = meta(at);
  await Promise.all([drainInstagramWelcomes(prisma, { fetch: f }), drainInstagramWelcomes(prisma, { fetch: f })]);
  await receiveSocialMessages(prisma, event("resumed", "hello", at + 86400000), { live: true });
  await drainInstagramWelcomes(prisma, { fetch: f });
  expect(f.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  expect(await prisma.instagramWelcome.findFirst()).toMatchObject({ status: "SENT" });
  expect(await prisma.socialMessage.count({ where: { direction: "OUT" } })).toBe(1);
});
it.each(["history", "disabled", "late", "nontrigger", "messenger"])("does not welcome %s or subsequent greetings", async kind => {
  await fixture(kind !== "disabled");
  await receiveSocialMessages(prisma, event("first", kind === "nontrigger" ? "I need training" : "hi", Date.now() - (kind === "late" ? 600000 : 0), kind === "messenger" ? "page" : "instagram", kind === "messenger" ? "page-1" : "ig-1"), { live: kind !== "history" });
  await receiveSocialMessages(prisma, event("next", "hello"), { live: true });
  expect(await prisma.instagramWelcome.count()).toBe(kind === "messenger" ? 1 : 0);
  // Messenger and Instagram identities are separate; a first IG message may qualify, Messenger never does.
  if (kind === "messenger") expect(await prisma.socialConversation.findFirst({ where: { channel: "MESSENGER" }, include: { instagramWelcome: true } })).toMatchObject({ instagramWelcome: null });
});
it("stays quiet when Meta reveals a prior conversation", async () => {
  await fixture(); const at = Date.now(); await receiveSocialMessages(prisma, event("first", "hi", at), { live: true }); const f = meta(at, true);
  await drainInstagramWelcomes(prisma, { fetch: f });
  expect(f.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  expect(await prisma.instagramWelcome.findFirst()).toMatchObject({ status: "SKIPPED" });
});
it("stays quiet when history is unavailable or cannot confirm the first message", async () => {
  await fixture(); await receiveSocialMessages(prisma, event(), { live: true });
  const f = vi.fn(async () => Response.json({ data: [] })); await drainInstagramWelcomes(prisma, { fetch: f });
  expect(await prisma.instagramWelcome.findFirst()).toMatchObject({ status: "SKIPPED" }); expect(await prisma.socialMessage.count({ where: { direction: "OUT" } })).toBe(0);
});
it("never retries an ambiguous send, including after conversation resumes", async () => {
  await fixture(); const at = Date.now(); await receiveSocialMessages(prisma, event("first", "hi", at), { live: true }); const f = meta(at, false, true);
  await drainInstagramWelcomes(prisma, { fetch: f });
  await receiveSocialMessages(prisma, event("later", "hi"), { live: true }); await drainInstagramWelcomes(prisma, { fetch: f });
  expect(await prisma.instagramWelcome.findFirst()).toMatchObject({ status: "UNCONFIRMED" });
  expect(f.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});
it("skips a welcome if a representative already replied", async () => {
  const s = await fixture(); await receiveSocialMessages(prisma, event(), { live: true }); const c = await prisma.socialConversation.findFirstOrThrow();
  await prisma.socialMessage.create({ data: { orgId: s.org.id, conversationId: c.id, direction: "OUT", status: "SENT", body: "I can help", receivedAt: new Date(), attachmentTypes: [] } });
  const f = meta(Date.now()); await drainInstagramWelcomes(prisma, { fetch: f }); expect(f).not.toHaveBeenCalled();
  expect(await prisma.instagramWelcome.findFirst()).toMatchObject({ status: "SKIPPED" });
});
