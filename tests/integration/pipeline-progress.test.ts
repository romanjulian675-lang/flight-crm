import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, makeSchool, resetDb } from "../helpers";
import { createLead, moveLead } from "@/modules/leads";
import { recordVerifiedContact, bookConsultation, meetingEvidence } from "@/modules/pipeline-progress";
import { receiveSocialMessages, syncSocialHistory, sendSocialReply } from "@/modules/social-messages";
import { encryptSecret } from "@/lib/crypto";
beforeEach(resetDb);
async function setup() {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const s = await makeSchool();
  const integration = await prisma.integration.create({ data: { orgId: s.org.id, kind: "META", name: "Meta", token: randomUUID(), defaultOwnerId: s.owner.membershipId } });
  await prisma.metaPage.create({ data: { orgId: s.org.id, integrationId: integration.id, pageId: "page", instagramId: "ig", pageName: "School", accessTokenEnc: encryptSecret("token"), messengerEnabled: true, instagramEnabled: true } });
  await receiveSocialMessages(prisma, event("in", false));
  const c = await prisma.socialConversation.findFirstOrThrow();
  return { ...s, c };
}
function event(mid: string, out: boolean, at = Date.now()) { return { object: "instagram", entry: [{ id: "ig", messaging: [{ sender: { id: out ? "ig" : "person" }, recipient: { id: out ? "person" : "ig" }, timestamp: at, message: { mid, text: out ? "Hello, how can we help?" : "Hello", is_echo: out } }] }] }; }
describe("evidence-based pipeline progress", () => {
  it("records authentic outside-CRM replies once and never extends the inbound reply window", async () => {
    const s = await setup(); const inbound = s.c.lastInboundAt;
    await Promise.all([receiveSocialMessages(prisma, event("out", true)), receiveSocialMessages(prisma, event("out", true))]);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: s.c.leadId }, include: { stage: true } });
    expect(lead.stage.name).toBe("Contacted"); expect(lead.firstContactAt).not.toBeNull();
    expect(await prisma.socialMessage.count({ where: { direction: "OUT" } })).toBe(1);
    expect((await prisma.socialConversation.findUniqueOrThrow({ where: { id: s.c.id } })).lastInboundAt).toEqual(inbound);
    expect(await prisma.activity.count({ where: { type: "STAGE_CHANGE" } })).toBe(1);
  });
  it("does not advance inbound-only leads, create unsolicited leads, reopen closed leads or regress later stages", async () => {
    const s = await setup();
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: s.c.leadId }, include: { stage: true } })).stage.name).toBe("New inquiry");
    const unsolicited = event("unsolicited", true); unsolicited.entry[0].messaging[0].recipient.id = "stranger";
    await receiveSocialMessages(prisma, unsolicited); expect(await prisma.lead.count()).toBe(1);
    const later = await prisma.pipelineStage.findFirstOrThrow({ where: { orgId: s.org.id, name: "Application / funding" } });
    await moveLead(prisma, s.owner, s.c.leadId, later.id, null);
    await receiveSocialMessages(prisma, event("reply", true));
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: s.c.leadId } })).stageId).toBe(later.id);
    const lost = await prisma.pipelineStage.findFirstOrThrow({ where: { orgId: s.org.id, kind: "LOST" } });
    await moveLead(prisma, s.owner, s.c.leadId, lost.id, null, "test"); await receiveSocialMessages(prisma, event("reply2", true));
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: s.c.leadId } })).stageId).toBe(lost.id);
  });
  it("preserves earliest and latest contact dates and refuses another school's lead", async () => {
    const s = await makeSchool(); const other = await makeSchool("Other"); const l = await createLead(prisma, s.owner, { firstName: "Test" });
    const a = new Date("2026-10-01T15:00Z"), b = new Date("2026-10-02T15:00Z");
    for (const at of [b, a]) await prisma.$transaction(tx => recordVerifiedContact(tx, s.org.id, l.id, at, { source: "TEST" }));
    expect(await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).toMatchObject({ firstContactAt: a, lastContactAt: b });
    expect(await prisma.$transaction(tx => recordVerifiedContact(tx, other.org.id, l.id, b, { source: "TEST" }))).toBe(false);
  });
  it("recovers only the requested contact, with idempotent messages and audited contact movement", async () => {
    const s = await setup();
    const f = async (url: string | URL | Request) => String(url).includes("/page/conversations") ? Response.json({ data: [{ id: "thread", participants: { data: [{ id: "person" }, { id: "ig" }] } }] }) : Response.json({ messages: { data: [{ id: "historic", from: { id: "ig" }, to: { data: [{ id: "person" }] }, created_time: new Date().toISOString(), message: "Our meeting is confirmed tomorrow at 3pm" }, { id: "wrong", from: { id: "other" }, to: { data: [{ id: "ig" }] }, created_time: new Date().toISOString(), message: "Private" }] } });
    await syncSocialHistory(prisma, s.owner, s.c.id, f); await syncSocialHistory(prisma, s.owner, s.c.id, f);
    expect(await prisma.socialMessage.count()).toBe(2); expect(await prisma.lead.count()).toBe(1);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: s.c.leadId }, include: { stage: true } })).stage.name).toBe("Contacted");
    await expect(syncSocialHistory(prisma, s.agent, s.c.id, f)).rejects.toThrow();
    await expect(syncSocialHistory(prisma, s.owner, s.c.id, async () => Response.json({ error: {} }, { status: 403 }))).rejects.toThrow("did not allow");
  });
  it("reconciles an echo arriving before a CRM send finishes without duplicate messages or repeat sends", async () => {
    const s = await setup(); const requestId = randomUUID(); let calls = 0;
    const f = async () => { calls++; await receiveSocialMessages(prisma, event("race", true)); return Response.json({ message_id: "race" }); };
    await sendSocialReply(prisma, s.owner, s.c.id, { text: "Hello", requestId }, f);
    await sendSocialReply(prisma, s.owner, s.c.id, { text: "Hello", requestId }, f);
    expect(calls).toBe(1); expect(await prisma.socialMessage.count({ where: { direction: "OUT" } })).toBe(1);
  });
  it("records a confirmed consultation and task once, without claiming a discovery flight or visa approval", async () => {
    const s = await setup(); const input = { title: "Visa information meeting", date: "2026-11-02", time: "15:00" };
    await expect(bookConsultation(prisma, s.agent, s.c.id, input)).rejects.toThrow();
    await bookConsultation(prisma, s.owner, s.c.id, input); await bookConsultation(prisma, s.owner, s.c.id, input);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: s.c.leadId }, include: { stage: true } });
    expect(lead.stage.name).toBe("Consultation booked");
    expect(await prisma.task.count({ where: { title: input.title } })).toBe(1);
    expect(await prisma.activity.count({ where: { type: "MEETING" } })).toBe(1);
    expect((await prisma.task.findFirstOrThrow({ where: { title: input.title } })).dueAt.toISOString()).toBe("2026-11-02T20:00:00.000Z");
    expect(meetingEvidence([{ direction: "IN", body: "Can I get a visa?" }])).toBeNull();
    expect(meetingEvidence([{ direction: "OUT", body: "Our meeting tomorrow at 3pm is confirmed" }])).toContain("confirmed");
  });
});
