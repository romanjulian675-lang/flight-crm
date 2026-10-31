import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSchool, prisma, resetDb } from "../helpers";
import { configureQuestionnaire, drainProspectEmails, submitQuestionnaire } from "@/modules/questionnaire";
import { deleteLead } from "@/modules/leads";

const config = { enabled: true, emailEnabled: true, meetingUrl: "https://outlook.office.com/bookwithme/user/academy", replyTo: "staff@example.com" };
const input = () => ({ submissionId: randomUUID(), firstName: "Sample", lastName: "Student", email: "student@example.com", city: "Sample city", country: "Sample country", language: "en", path: "LIFE_PROJECT", program: "OTHER", experience: "None yet", timeline: "1–3 months", nextStep: "MEETING", consent: true, questions: "Private question not included in email", utm_source: "instagram" });
beforeEach(async () => { await resetDb(); vi.stubEnv("RESEND_API_KEY", "test-only"); vi.stubEnv("LEAD_ALERT_FROM", "Academy <crm@notify.example.com>"); vi.stubEnv("APP_URL", "https://crm.example.com"); });
afterEach(() => vi.unstubAllEnvs());
async function fixture() {
  const s = await makeSchool();
  const integration = await prisma.integration.create({ data: { orgId: s.org.id, kind: "WEB_FORM", name: "Questionnaire", token: randomUUID() } });
  await configureQuestionnaire(prisma, s.owner, integration.id, config);
  return { ...s, integration: await prisma.integration.findUniqueOrThrow({ where: { id: integration.id } }) };
}
describe("training questionnaire and requested booking email", () => {
  it("requires scoped manager configuration and explicit visitor consent", async () => {
    const s = await fixture(); const other = await makeSchool();
    await expect(configureQuestionnaire(prisma, s.agent, s.integration.id, config)).rejects.toThrow();
    await expect(configureQuestionnaire(prisma, other.owner, s.integration.id, config)).rejects.toThrow();
    await expect(configureQuestionnaire(prisma, s.owner, s.integration.id, { ...config, meetingUrl: "https://outlook.office.com.attacker.test/book" })).rejects.toThrow();
    await expect(submitQuestionnaire(prisma, s.integration, { ...input(), consent: false })).rejects.toThrow();
    await expect(submitQuestionnaire(prisma, { ...s.integration, active: false }, input())).rejects.toThrow();
    expect(await prisma.lead.count()).toBe(0); expect(await prisma.prospectEmail.count()).toBe(0);
  });
  it("saves stated goals and contact fields without claiming a booked meeting or eligibility", async () => {
    const s = await fixture(); const d = input();
    expect(await submitQuestionnaire(prisma, s.integration, d)).toEqual({ ok: true, emailQueued: true });
    const lead = await prisma.lead.findFirstOrThrow({ include: { stage: true } });
    expect(lead).toMatchObject({ program: "CAREER", source: "INSTAGRAM", firstContactAt: null, medical: "UNKNOWN", funding: "UNKNOWN", isInternational: false });
    expect(lead.stage.name).toBe("New inquiry");
    const notes = await prisma.activity.findMany({ where: { leadId: lead.id } });
    expect(JSON.stringify(notes)).toContain("Life Project"); expect(JSON.stringify(notes)).toContain("Sample country");
    expect(await prisma.task.count({ where: { leadId: lead.id, completedAt: null } })).toBeGreaterThan(0);
  });
  it("deduplicates retries and repeated addresses, and never lets a retry redirect the email", async () => {
    const s = await fixture(); const d = input();
    await Promise.all([submitQuestionnaire(prisma, s.integration, d), submitQuestionnaire(prisma, s.integration, d)]);
    await submitQuestionnaire(prisma, s.integration, { ...d, submissionId: randomUUID(), path: "LICENSE", program: "INSTRUMENT" });
    expect(await prisma.lead.count()).toBe(1); expect(await prisma.prospectEmail.count()).toBe(1);
    await expect(submitQuestionnaire(prisma, s.integration, { ...d, email: "another@example.com" })).rejects.toThrow();
    expect((await prisma.prospectEmail.findFirst())?.recipient).toBe(d.email);
  });
  it("sends generic links to the visitor, with one claim across concurrent workers and no stage advancement", async () => {
    const s = await fixture(); await submitQuestionnaire(prisma, s.integration, input());
    const f = vi.fn(async () => Response.json({ id: "provider-test-id" }));
    await Promise.all([drainProspectEmails(prisma, { fetch: f }), drainProspectEmails(prisma, { fetch: f })]);
    expect(f).toHaveBeenCalledTimes(1);
    const call = f.mock.calls[0] as unknown as [string, RequestInit];
    const payload = JSON.parse(String(call[1].body));
    expect(payload.to).toEqual(["student@example.com"]); expect(payload.reply_to).toBe("staff@example.com");
    expect(payload.text).toContain("?step=discovery"); expect(payload.text).toContain("?step=meeting");
    expect(payload.text).not.toContain("Private question"); expect(payload.text).not.toContain("Sample country");
    expect((await prisma.prospectEmail.findFirst())?.status).toBe("SENT");
    expect((await prisma.lead.findFirst({ include: { stage: true } }))?.stage.name).toBe("New inquiry");
    expect(await prisma.activity.count({ where: { type: "MEETING" } })).toBe(0);
  });
  it("retries uncertain sends with unchanged content and stops before provider idempotency expires", async () => {
    const s = await fixture(); await submitQuestionnaire(prisma, s.integration, input());
    const now = new Date(Date.now() + 1000); const f = vi.fn(async () => { throw new Error("private-provider-response"); });
    await drainProspectEmails(prisma, { now, fetch: f });
    await drainProspectEmails(prisma, { now: new Date(+now + 61000), fetch: f });
    const calls = f.mock.calls as unknown as [string, RequestInit][];
    expect(calls).toHaveLength(2); expect(calls[0][1].body).toBe(calls[1][1].body); expect(calls[0][1].headers).toEqual(calls[1][1].headers);
    await drainProspectEmails(prisma, { now: new Date(+now + 24 * 3600_000), fetch: f });
    expect(f).toHaveBeenCalledTimes(2); expect((await prisma.prospectEmail.findFirst())?.status).toBe("FAILED");
    expect((await prisma.prospectEmail.findFirst())?.lastError).not.toContain("private-provider-response");
  });
  it("cancels disabled follow-ups and removes queued visitor information with lead deletion", async () => {
    const s = await fixture(); await submitQuestionnaire(prisma, s.integration, input());
    await configureQuestionnaire(prisma, s.owner, s.integration.id, { ...config, emailEnabled: false });
    const f = vi.fn(async () => Response.json({ id: "must-not-send" }));
    await drainProspectEmails(prisma, { fetch: f }); expect(f).not.toHaveBeenCalled();
    expect((await prisma.prospectEmail.findFirst())?.status).toBe("CANCELLED");
    const lead = await prisma.lead.findFirstOrThrow(); await deleteLead(prisma, s.owner, lead.id);
    expect(await prisma.prospectEmail.count()).toBe(0);
  });
});
