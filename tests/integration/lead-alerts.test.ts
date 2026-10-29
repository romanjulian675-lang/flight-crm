import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSchool, prisma, resetDb } from "../helpers";
import { createLead, deleteLead } from "@/modules/leads";
import { drainLeadAlerts, updateLeadAlerts } from "@/modules/lead-alerts";
import { encryptSecret } from "@/lib/crypto";
import { receiveSocialMessages } from "@/modules/social-messages";
import { ingest } from "@/modules/intake";

const recipients = ["juan.chiquiza@cgflightacademy.com", "julian.torres@cgflightacademy.com"];
beforeEach(async () => {
  await resetDb();
  vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("LEAD_ALERT_FROM", "CRM <crm@notify.example.com>"); vi.stubEnv("APP_URL", "https://crm.example.com");
});
afterEach(() => vi.unstubAllEnvs());
const accepted = () => vi.fn(async () => Response.json({ id: randomUUID() }));
async function fixture() {
  const s = await makeSchool(); await updateLeadAlerts(prisma, s.owner, { enabled: true, recipients }); return s;
}
describe("new-lead email alerts", () => {
  it("defaults off, requires an owner, validates addresses and isolates schools", async () => {
    const s = await makeSchool();
    await createLead(prisma, s.owner, { firstName: "Disabled" }); expect(await prisma.leadAlert.count()).toBe(0);
    await expect(updateLeadAlerts(prisma, s.agent, { enabled: true, recipients })).rejects.toThrow();
    await expect(updateLeadAlerts(prisma, s.owner, { enabled: true, recipients: ["bad"] })).rejects.toThrow();
    await updateLeadAlerts(prisma, s.owner, { enabled: true, recipients });
    const other = await makeSchool("Other school"); await createLead(prisma, other.owner, { firstName: "Other" });
    await createLead(prisma, s.owner, { firstName: "Private", email: "private@example.com", note: "Private message" });
    expect(await prisma.leadAlert.count()).toBe(1);
    const f = accepted(); await drainLeadAlerts(prisma, { fetch: f });
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.to).toEqual(recipients); expect(body.text).toContain("https://crm.example.com/leads/");
    expect(JSON.stringify(body)).not.toContain("private@example.com"); expect(JSON.stringify(body)).not.toContain("Private message");
  });
  it("queues only genuinely new leads, not duplicate or merged intake submissions", async () => {
    const s = await fixture();
    const integration = await prisma.integration.create({ data: { orgId: s.org.id, kind: "WEBHOOK", name: "Website", token: randomUUID() } });
    await ingest(prisma, integration, { name: "New inquiry", email: "new@example.com" }, { externalId: "1" });
    await ingest(prisma, integration, { name: "New inquiry", email: "new@example.com" }, { externalId: "1" });
    await ingest(prisma, integration, { name: "New inquiry", email: "new@example.com" }, { externalId: "2" });
    expect(await prisma.lead.count()).toBe(1); expect(await prisma.leadAlert.count()).toBe(1);
  });
  it("alerts on the first social message only, not later messages in the conversation", async () => {
    const s = await fixture(); vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    const integration = await prisma.integration.create({ data: { orgId: s.org.id, kind: "META", name: "Social", token: randomUUID() } });
    await prisma.metaPage.create({ data: { orgId: s.org.id, integrationId: integration.id, pageId: "page-1", pageName: "Academy", accessTokenEnc: encryptSecret("test"), messengerEnabled: true } });
    const message = (mid: string) => ({ object: "page", entry: [{ id: "page-1", messaging: [{ sender: { id: "sender-1" }, recipient: { id: "page-1" }, timestamp: Date.now(), message: { mid, text: "Hello" } }] }] });
    await receiveSocialMessages(prisma, message("first")); await receiveSocialMessages(prisma, message("first")); await receiveSocialMessages(prisma, message("second"));
    expect(await prisma.socialMessage.count()).toBe(2); expect(await prisma.leadAlert.count()).toBe(1);
  });
  it("claims concurrent workers once and never resends an accepted alert", async () => {
    const s = await fixture(); await createLead(prisma, s.owner, { firstName: "New" });
    const f = accepted(); await Promise.all([drainLeadAlerts(prisma, { fetch: f }), drainLeadAlerts(prisma, { fetch: f })]);
    await drainLeadAlerts(prisma, { fetch: f }); expect(f).toHaveBeenCalledTimes(1);
    expect(await prisma.leadAlert.findFirst()).toMatchObject({ status: "SENT", attempts: 1 });
  });
  it("retries uncertain sends with stable content/key, but stops before provider deduplication expires", async () => {
    const s = await fixture(); await createLead(prisma, s.owner, { firstName: "New" });
    const now = new Date(Date.now() + 1000);
    const f = vi.fn(async () => { throw new Error("timeout-with-secret-do-not-store"); });
    await drainLeadAlerts(prisma, { now, fetch: f });
    await drainLeadAlerts(prisma, { now: new Date(now.getTime() + 61000), fetch: f });
    const calls = f.mock.calls as unknown as [string, RequestInit][];
    expect(calls).toHaveLength(2); expect(calls[0][1].body).toBe(calls[1][1].body); expect(calls[0][1].headers).toEqual(calls[1][1].headers);
    await drainLeadAlerts(prisma, { now: new Date(now.getTime() + 24 * 3600000), fetch: f });
    expect(f).toHaveBeenCalledTimes(2);
    expect(await prisma.leadAlert.findFirst()).toMatchObject({ status: "FAILED" });
    expect((await prisma.leadAlert.findFirst())?.lastError).not.toContain("secret");
  });
  it("keeps queued alerts when provider is absent and cancels them when settings change", async () => {
    const s = await fixture(); await createLead(prisma, s.owner, { firstName: "New" });
    vi.stubEnv("RESEND_API_KEY", ""); const f = accepted(); expect(await drainLeadAlerts(prisma, { fetch: f })).toMatchObject({ configured: false });
    expect(f).not.toHaveBeenCalled(); expect((await prisma.leadAlert.findFirst())?.attempts).toBe(0);
    await updateLeadAlerts(prisma, s.owner, { enabled: false, recipients }); vi.stubEnv("RESEND_API_KEY", "test-key");
    await drainLeadAlerts(prisma, { fetch: f }); expect(f).not.toHaveBeenCalled(); expect((await prisma.leadAlert.findFirst())?.status).toBe("CANCELLED");
  });
  it("does not retain an alert after its lead is deleted", async () => {
    const s = await fixture(); const lead = await createLead(prisma, s.owner, { firstName: "New" });
    await deleteLead(prisma, s.owner, lead.id); expect(await prisma.leadAlert.count()).toBe(0);
  });
});
