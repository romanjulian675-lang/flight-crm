import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { makeSchool, prisma, resetDb } from "../helpers";
import { encryptSecret } from "@/lib/crypto";
import { receiveSocialMessages } from "@/modules/social-messages";
import { drainSocialProfiles, refreshSocialProfile, socialTitle } from "@/modules/social-profiles";
beforeAll(() => { process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64"); });
beforeEach(resetDb);
async function fixture(channel = "instagram", asset = "ig-1") {
  const s = await makeSchool();
  const integration = await prisma.integration.create({ data: { orgId: s.org.id, kind: "META", name: "Meta", token: randomUUID() } });
  await prisma.metaPage.create({ data: { orgId: s.org.id, integrationId: integration.id, pageId: "page-1", instagramId: "ig-1", pageName: "School", accessTokenEnc: encryptSecret("test-token"), instagramEnabled: true, messengerEnabled: true } });
  await receiveSocialMessages(prisma, { object: channel, entry: [{ id: asset, messaging: [{ sender: { id: "sender-123456" }, recipient: { id: asset }, timestamp: Date.now(), message: { mid: "one", text: "hello" } }] }] });
  return { ...s, c: await prisma.socialConversation.findFirstOrThrow() };
}
it("uses verified Instagram usernames across chat and default lead names without changing identity", async () => {
  const s = await fixture();
  const f = vi.fn(async (url: unknown, init?: RequestInit) => { expect(String(url)).toContain("/sender-123456?fields=name%2Cusername"); expect(init?.headers).toMatchObject({ Authorization: "Bearer test-token" }); return Response.json({ id: "sender-123456", name: "Student Example", username: "student.example" }); });
  expect(await refreshSocialProfile(prisma, s.owner, s.c.id, { fetch: f })).toBe(true);
  const c = await prisma.socialConversation.findUniqueOrThrow({ where: { id: s.c.id }, include: { lead: true } });
  expect(c).toMatchObject({ username: "student.example", displayName: "Student Example", senderId: "sender-123456", profileLeadName: "@student.example" });
  expect(c.lead).toMatchObject({ firstName: "@student.example", lastName: "", phone: null }); expect(socialTitle(c)).toBe("@student.example");
});
it("updates an automatically applied handle but preserves staff-entered lead names", async () => {
  const s = await fixture(); const f = (username: string) => async () => Response.json({ username });
  await refreshSocialProfile(prisma, s.owner, s.c.id, { fetch: f("first.handle") });
  await refreshSocialProfile(prisma, s.owner, s.c.id, { fetch: f("changed.handle") });
  expect(await prisma.lead.findUnique({ where: { id: s.c.leadId } })).toMatchObject({ firstName: "@changed.handle" });
  await prisma.lead.update({ where: { id: s.c.leadId }, data: { firstName: "Confirmed", lastName: "Student" } });
  await refreshSocialProfile(prisma, s.owner, s.c.id, { fetch: f("latest.handle") });
  expect(await prisma.lead.findUnique({ where: { id: s.c.leadId } })).toMatchObject({ firstName: "Confirmed", lastName: "Student" });
});
it("uses Facebook names, never fabricates a Facebook username", async () => {
  const s = await fixture("page", "page-1");
  await refreshSocialProfile(prisma, s.owner, s.c.id, { fetch: async () => Response.json({ first_name: "Maria", last_name: "Example" }) });
  expect(await prisma.socialConversation.findUnique({ where: { id: s.c.id } })).toMatchObject({ username: null, displayName: "Maria Example" });
  expect(await prisma.lead.findFirst()).toMatchObject({ firstName: "Maria Example" });
});
it("scopes profile refresh to accessible contacts", async () => {
  const s = await fixture(); const other = await makeSchool("Other"); const f = vi.fn();
  await expect(refreshSocialProfile(prisma, other.owner, s.c.id, { fetch: f })).rejects.toThrow();
  await prisma.lead.update({ where: { id: s.c.leadId }, data: { ownerId: s.owner.membershipId } });
  await expect(refreshSocialProfile(prisma, s.agent, s.c.id, { fetch: f })).rejects.toThrow(); expect(f).not.toHaveBeenCalled();
});
it("accepts only the matched contact in a verified participant list", async () => {
  const s = await fixture(); const f = vi.fn().mockResolvedValueOnce(Response.json({ error: {} }, { status: 403 })).mockResolvedValueOnce(Response.json({ data: [{ id: "thread", participants: { data: [{ id: "ig-1", name: "School" }, { id: "sender-123456", name: "Real Student", username: "real.student" }] } }] }));
  expect(await refreshSocialProfile(prisma, s.owner, s.c.id, { fetch: f })).toBe(true);
  expect(await prisma.lead.findFirst()).toMatchObject({ firstName: "@real.student" });
});
it("keeps fallback names on denial and avoids repeated failed scheduled calls", async () => {
  await fixture(); const f = vi.fn(async () => Response.json({ error: {} }, { status: 403 }));
  expect(await drainSocialProfiles(prisma, { fetch: f })).toMatchObject({ checked: 1, updated: 0 });
  expect(await drainSocialProfiles(prisma, { fetch: f })).toMatchObject({ checked: 0 });
  expect(await prisma.lead.findFirst()).toMatchObject({ firstName: "Instagram contact 123456" });
  expect(f).toHaveBeenCalledTimes(2);
});
it("does not accept a mismatched profile identity or unrelated participant", async () => {
  const s = await fixture(); const f = vi.fn().mockResolvedValueOnce(Response.json({ id: "someone-else", username: "wrong" })).mockResolvedValueOnce(Response.json({ data: [{ participants: { data: [{ id: "someone-else", name: "Wrong" }, { id: "ig-1" }] } }] }));
  expect(await refreshSocialProfile(prisma, s.owner, s.c.id, { fetch: f })).toBe(false);
  expect(await prisma.socialConversation.findFirst()).toMatchObject({ username: null, displayName: null });
});
