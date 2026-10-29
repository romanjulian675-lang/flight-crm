import { createHmac } from "node:crypto";
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { makeSchool, prisma, resetDb } from "../helpers";
import { encryptSecret } from "@/lib/crypto";
import { enqueueMetaNotification, drainMetaJobs, retryMetaJob, MAX_META_ATTEMPTS, recentMetaJobs } from "@/modules/meta-jobs";
import { ingest } from "@/modules/intake";
import { createIntegration } from "@/modules/integrations";
import { POST as receiveMeta } from "@/app/api/webhooks/meta/route";
import { GET as runJobs } from "@/app/api/jobs/meta/route";
import type { Db, Tx } from "@/lib/db";
import type { Fetch } from "@/modules/meta";

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.META_APP_ID = "test-app";
  process.env.META_APP_SECRET = "test-secret";
  process.env.META_VERIFY_TOKEN = "test-verify";
});
beforeEach(resetDb);
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const body = (id = "lead-1", page = "page-1") => ({ object: "page", entry: [{ id: page, changes: [{ field: "leadgen", value: { leadgen_id: id } }] }] });
const goodFetch: Fetch = async () => new Response(JSON.stringify({ id: "lead-1", platform: "ig", field_data: [{ name: "full_name", values: ["Ada Pilot"] }, { name: "email", values: ["ada@example.com"] }] }));
const badFetch: Fetch = async () => new Response(JSON.stringify({ error: { message: "Temporary provider outage" } }), { status: 503 });
async function fixture() {
  const school = await makeSchool();
  const integration = await prisma.integration.create({ data: { orgId: school.org.id, kind: "META", name: "Meta", token: "q".repeat(32), defaultSource: "FACEBOOK" } });
  await prisma.metaPage.create({ data: { orgId: school.org.id, integrationId: integration.id, pageId: "page-1", pageName: "School", accessTokenEnc: encryptSecret("page-token"), subscribed: true } });
  return { ...school, integration };
}
const signedRequest = (value: unknown) => {
  const raw = JSON.stringify(value);
  return new Request("http://localhost/api/webhooks/meta", { method: "POST", body: raw, headers: { "x-hub-signature-256": "sha256=" + createHmac("sha256", "test-secret").update(raw).digest("hex") } });
};

describe("durable Meta delivery", () => {
  it("persists before fetching and recovers a failed attempt exactly once", async () => {
    await fixture();
    const queued = await enqueueMetaNotification(prisma, body());
    expect(await prisma.lead.count()).toBe(0);
    await drainMetaJobs(prisma, { fetch: badFetch });
    const waiting = await prisma.metaLeadJob.findUniqueOrThrow({ where: { id: queued.ids[0] } });
    expect(waiting).toMatchObject({ status: "PENDING", attempts: 1 });
    expect(waiting.lastError).toBeTruthy();
    const before = vi.fn(goodFetch);
    await drainMetaJobs(prisma, { fetch: before });
    expect(before).not.toHaveBeenCalled(); // backoff is respected
    await drainMetaJobs(prisma, { now: waiting.availableAt, fetch: goodFetch });
    expect(await prisma.metaLeadJob.findUnique({ where: { id: waiting.id } })).toMatchObject({ status: "COMPLETED", attempts: 2, lastError: null });
    await enqueueMetaNotification(prisma, body());
    await drainMetaJobs(prisma, { fetch: goodFetch });
    expect(await prisma.metaLeadJob.count()).toBe(1);
    expect(await prisma.lead.count()).toBe(1);
  });

  it("allows only one worker to process a delivery concurrently", async () => {
    await fixture();
    await enqueueMetaNotification(prisma, body());
    const f = vi.fn(goodFetch);
    await Promise.all([drainMetaJobs(prisma, { fetch: f }), drainMetaJobs(prisma, { fetch: f })]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(await prisma.lead.count()).toBe(1);
  });

  it("recovers expired leases, stops after the retry limit, and scopes manual recovery", async () => {
    const school = await fixture();
    const queued = await enqueueMetaNotification(prisma, body());
    const id = queued.ids[0];
    await prisma.metaLeadJob.update({ where: { id }, data: { status: "PROCESSING", leaseToken: "interrupted", leaseUntil: new Date(0), attempts: MAX_META_ATTEMPTS - 1 } });
    await drainMetaJobs(prisma, { fetch: badFetch });
    expect(await prisma.metaLeadJob.findUnique({ where: { id } })).toMatchObject({ status: "FAILED", attempts: MAX_META_ATTEMPTS });
    const other = await makeSchool("Other");
    await expect(retryMetaJob(prisma, other.owner, id)).rejects.toThrow();
    await expect(retryMetaJob(prisma, school.agent, id)).rejects.toThrow();
    expect(await recentMetaJobs(prisma, other.owner)).toEqual([]);
    vi.stubGlobal("fetch", goodFetch);
    await retryMetaJob(prisma, school.manager, id);
    expect(await prisma.metaLeadJob.findUnique({ where: { id } })).toMatchObject({ status: "COMPLETED", attempts: 1 });
  });

  it("does not steal a live lease on manual retry", async () => {
    const school = await fixture();
    const queued = await enqueueMetaNotification(prisma, body());
    await prisma.metaLeadJob.update({ where: { id: queued.ids[0] }, data: { status: "PROCESSING", leaseToken: "live", leaseUntil: new Date(Date.now() + 60_000) } });
    const f = vi.fn(goodFetch); vi.stubGlobal("fetch", f);
    await retryMetaJob(prisma, school.owner, queued.ids[0]);
    expect(f).not.toHaveBeenCalled();
    expect(await prisma.metaLeadJob.findUnique({ where: { id: queued.ids[0] } })).toMatchObject({ leaseToken: "live", status: "PROCESSING" });
  });

  it("keeps paused or disconnected sources recoverable without creating a lead", async () => {
    const school = await fixture();
    await enqueueMetaNotification(prisma, body());
    await prisma.integration.update({ where: { id: school.integration.id }, data: { active: false } });
    await drainMetaJobs(prisma, { fetch: goodFetch });
    expect(await prisma.lead.count()).toBe(0);
    expect(await prisma.metaLeadJob.findFirst()).toMatchObject({ status: "PENDING", attempts: 1 });
  });

  it("only acknowledges signed, structurally valid, saved notifications", async () => {
    await fixture();
    vi.stubGlobal("fetch", badFetch);
    expect((await receiveMeta(signedRequest(body()))).status).toBe(200);
    expect(await prisma.metaLeadJob.findFirst()).toMatchObject({ status: "PENDING", attempts: 1 });
    expect((await receiveMeta(signedRequest({ object: "page", entry: "invalid" }))).status).toBe(400);
    expect((await receiveMeta(signedRequest(body("other", "missing-page")))).status).toBe(503);
    expect((await receiveMeta(new Request("http://localhost/api/webhooks/meta", { method: "POST", body: JSON.stringify(body()) }))).status).toBe(401);
  });

  it("does not acknowledge a notification when durable storage fails", async () => {
    await fixture();
    const spy = vi.spyOn(prisma.metaLeadJob, "upsert").mockRejectedValueOnce(new Error("Database unavailable"));
    try {
      expect((await receiveMeta(signedRequest(body()))).status).toBe(503);
      expect(await prisma.lead.count()).toBe(0);
    } finally { spy.mockRestore(); }
  });

  it("recovers a crash after intake commits without adding a second timeline entry", async () => {
    const school = await fixture();
    const queued = await enqueueMetaNotification(prisma, body());
    await ingest(prisma, school.integration, { name: "Ada Pilot", email: "ada@example.com" }, { externalId: "fb:lead-1" });
    await prisma.metaLeadJob.update({ where: { id: queued.ids[0] }, data: { status: "PROCESSING", leaseToken: "crashed", leaseUntil: new Date(0), attempts: 1 } });
    await drainMetaJobs(prisma, { fetch: goodFetch });
    expect(await prisma.metaLeadJob.findFirst()).toMatchObject({ status: "COMPLETED", attempts: 2 });
    expect(await prisma.lead.count()).toBe(1);
    expect(await prisma.intakeEvent.count()).toBe(1);
    expect(await prisma.activity.count({ where: { type: "FORM_SUBMITTED" } })).toBe(0);
  });

  it("never labels a previously rejected submission as saved on retry", async () => {
    await fixture();
    await enqueueMetaNotification(prisma, body());
    const empty: Fetch = async () => new Response(JSON.stringify({ id: "lead-1", field_data: [] }));
    await drainMetaJobs(prisma, { fetch: empty });
    const job = await prisma.metaLeadJob.findFirstOrThrow();
    await drainMetaJobs(prisma, { now: job.availableAt, fetch: empty });
    expect(await prisma.metaLeadJob.findFirst()).toMatchObject({ status: "PENDING", attempts: 2 });
    expect(await prisma.lead.count()).toBe(0);
  });

  it("protects the scheduler when its secret is absent or incorrect", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await runJobs(new Request("http://localhost/api/jobs/meta"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "local-test-secret");
    expect((await runJobs(new Request("http://localhost/api/jobs/meta", { headers: { Authorization: "Bearer wrong" } }))).status).toBe(401);
    const response = await runJobs(new Request("http://localhost/api/jobs/meta", { headers: { Authorization: "Bearer local-test-secret" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: 0, alerts: { configured: false, processed: 0 } });
  });
});

describe("atomic intake", () => {
  it("commits one lead and one intake event for concurrent provider retries", async () => {
    const school = await makeSchool();
    const integration = await createIntegration(prisma, school.owner, { kind: "WEBHOOK", name: "Website" });
    const results = await Promise.all(Array.from({ length: 5 }, () => ingest(prisma, integration, { name: "Same Person", email: "same@example.com" }, { externalId: "same-delivery" })));
    expect(results.filter((r) => r.status === "CREATED")).toHaveLength(1);
    expect(results.filter((r) => r.status === "DUPLICATE")).toHaveLength(4);
    expect(await prisma.lead.count()).toBe(1);
    expect(await prisma.intakeEvent.count()).toBe(1);
    expect(await prisma.task.count()).toBe(1);
    expect(await prisma.activity.count({ where: { type: "FORM_SUBMITTED" } })).toBe(0);
  });

  it("matches concurrent submissions from different sources within the same school", async () => {
    const school = await makeSchool();
    const one = await createIntegration(prisma, school.owner, { kind: "WEBHOOK", name: "One" });
    const two = await createIntegration(prisma, school.owner, { kind: "WEBHOOK", name: "Two" });
    const results = await Promise.all([one, two].map((i) => ingest(prisma, i, { name: "Same Person", email: "same@example.com" }, { externalId: "delivery" })));
    expect(results.map((r) => r.status).sort()).toEqual(["CREATED", "MERGED"]);
    expect(await prisma.lead.count()).toBe(1);
    expect(await prisma.intakeEvent.count()).toBe(2);
  });

  it("rolls back lead/task changes if successful event logging fails", async () => {
    const school = await makeSchool();
    const integration = await createIntegration(prisma, school.owner, { kind: "WEBHOOK", name: "Website" });
    const realTransaction = prisma.$transaction.bind(prisma);
    let failOnce = true;
    // Inject a storage fault at the final write, then allow the separate ERROR log to succeed.
    const faulty = new Proxy(prisma, { get(target, key) {
      if (key !== "$transaction") return Reflect.get(target, key);
      return (fn: (tx: Tx) => Promise<unknown>, options?: { timeout: number }) => realTransaction(async (tx) => {
        const wrapped = new Proxy(tx, { get(client, property) {
          if (property !== "intakeEvent") return Reflect.get(client, property);
          return new Proxy(client.intakeEvent, { get(events, method) {
            if (method === "create" && failOnce) return () => { failOnce = false; throw new Error("Injected event write failure"); };
            return Reflect.get(events, method);
          } });
        } });
        return fn(wrapped);
      }, options);
    } }) as Db;
    expect((await ingest(faulty, integration, { name: "Recoverable", email: "recover@example.com" }, { externalId: "fault" })).status).toBe("ERROR");
    expect(await prisma.lead.count()).toBe(0);
    expect(await prisma.task.count()).toBe(0);
    expect(await prisma.activity.count()).toBe(0);
    expect((await ingest(prisma, integration, { name: "Recoverable", email: "recover@example.com" }, { externalId: "fault" })).status).toBe("CREATED");
    expect(await prisma.lead.count()).toBe(1);
  });

  it("maps the existing WordPress contact fields without losing the message", async () => {
    const school = await makeSchool();
    const integration = await createIntegration(prisma, school.owner, { kind: "WEBHOOK", name: "WordPress" });
    const result = await ingest(prisma, integration, { "text-your-name": "Real Inquiry", "email-your-email": "lead@example.com", "textarea-message": "Interested in lessons" });
    expect(result.status).toBe("CREATED");
    expect(await prisma.lead.findUnique({ where: { id: result.leadId! } })).toMatchObject({ firstName: "Real", lastName: "Inquiry", email: "lead@example.com" });
    expect((await prisma.activity.findFirst({ where: { leadId: result.leadId!, type: "NOTE" } }))?.body).toContain("Interested in lessons");
  });
});
