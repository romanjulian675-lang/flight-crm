import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { ensure, isManager, type AccessContext } from "@/modules/access";
import { notFound } from "@/lib/errors";
import { handleMetaWebhook, type Fetch } from "@/modules/meta";

export const MAX_META_ATTEMPTS = 8;
const LEASE_MS = 60_000;
const notification = z.object({
  object: z.string().optional(),
  entry: z.array(z.object({
    id: z.string().max(100).optional(),
    changes: z.array(z.object({
      field: z.string().optional(),
      value: z.object({ leadgen_id: z.string().min(1).max(100).optional(), page_id: z.string().max(100).optional() }).passthrough().optional(),
    })).max(100).optional(),
  })).max(100).optional(),
});

/** Persist IDs before any Graph API call. A 200 is safe only after this completes. */
export async function enqueueMetaNotification(db: Db, body: unknown) {
  const parsed = notification.safeParse(body);
  if (!parsed.success) return { invalid: true, unknownPages: 0, ids: [] as string[] };
  const ids: string[] = [];
  let unknownPages = 0;
  if (parsed.data.object !== "page") return { invalid: false, unknownPages, ids };
  for (const entry of parsed.data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen" || !change.value?.leadgen_id) continue;
      const page = await db.metaPage.findUnique({ where: { pageId: change.value.page_id ?? entry.id ?? "" } });
      if (!page) { unknownPages++; continue; }
      const job = await db.metaLeadJob.upsert({
        where: { integrationId_leadgenId: { integrationId: page.integrationId, leadgenId: change.value.leadgen_id } },
        create: { orgId: page.orgId, integrationId: page.integrationId, pageId: page.pageId, leadgenId: change.value.leadgen_id },
        update: {}, // Provider retries cannot reset attempts or reopen a completed delivery.
      });
      ids.push(job.id);
    }
  }
  return { invalid: false, unknownPages, ids: [...new Set(ids)] };
}

const due = (now: Date): Prisma.MetaLeadJobWhereInput => ({ OR: [
  { status: "PENDING", availableAt: { lte: now } },
  { status: "PROCESSING", leaseUntil: { lte: now } },
] });

/** Bounded invocation suitable for Vercel. Scheduling is configured separately at deployment. */
export async function drainMetaJobs(db: Db, options: { ids?: string[]; orgId?: string; limit?: number; now?: Date; fetch?: Fetch } = {}) {
  const now = options.now ?? new Date();
  const filter = { ...(options.ids ? { id: { in: options.ids } } : {}), ...(options.orgId ? { orgId: options.orgId } : {}) };
  const candidates = await db.metaLeadJob.findMany({ where: { ...filter, ...due(now) }, orderBy: { availableAt: "asc" }, take: Math.min(options.limit ?? 2, 2) });
  let processed = 0;
  for (const candidate of candidates) {
    const leaseToken = randomUUID();
    const claimed = await db.metaLeadJob.updateMany({
      where: { id: candidate.id, ...due(now) },
      data: { status: "PROCESSING", leaseToken, leaseUntil: new Date(now.getTime() + LEASE_MS), attempts: { increment: 1 } },
    });
    if (!claimed.count) continue;
    processed++;
    const owned = { id: candidate.id, status: "PROCESSING" as const, leaseToken };
    try {
      if (candidate.attempts >= MAX_META_ATTEMPTS) throw new Error("Retry limit reached after interrupted processing.");
      const page = await db.metaPage.findFirst({ where: { pageId: candidate.pageId, orgId: candidate.orgId, integrationId: candidate.integrationId }, include: { integration: true } });
      if (!page) throw new Error("Reconnect the original Facebook page before retrying.");
      if (!page.integration.active) throw new Error("Lead source is paused. Enable it before retrying.");
      const f: Fetch = options.fetch ?? ((input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8_000) }));
      const results = await handleMetaWebhook(db, { object: "page", entry: [{ id: page.pageId, changes: [{ field: "leadgen", value: { leadgen_id: candidate.leadgenId, page_id: page.pageId } }] }] }, f);
      const result = results[0]?.status;
      if (!result || result === "ERROR" || result === "UNKNOWN_PAGE") throw new Error("Could not retrieve or save the Meta lead. Check the connection and lead access.");
      const recorded = await db.intakeEvent.findUnique({ where: { integrationId_externalId: { integrationId: candidate.integrationId, externalId: `fb:${candidate.leadgenId}` } } });
      if (result === "REJECTED" || !recorded?.leadId) throw new Error("Lead was rejected. Review Recent activity before retrying.");
      await db.metaLeadJob.updateMany({ where: owned, data: { status: "COMPLETED", completedAt: new Date(), leaseToken: null, leaseUntil: null, lastError: null } });
    } catch (error) {
      const attempts = candidate.attempts + 1;
      await db.metaLeadJob.updateMany({ where: owned, data: {
        status: attempts >= MAX_META_ATTEMPTS ? "FAILED" : "PENDING",
        availableAt: new Date(now.getTime() + Math.min(60_000 * 2 ** (attempts - 1), 3_600_000)),
        leaseToken: null, leaseUntil: null,
        lastError: error instanceof Error ? error.message.slice(0, 300) : "Processing failed.",
      } });
    }
  }
  return { processed };
}

export function recentMetaJobs(db: Db, ctx: AccessContext) {
  ensure(isManager(ctx));
  return db.metaLeadJob.findMany({ where: { orgId: ctx.orgId }, orderBy: [{ completedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], take: 30,
    select: { id: true, leadgenId: true, status: true, attempts: true, lastError: true, availableAt: true, leaseUntil: true, createdAt: true } });
}

/** Scoped recovery; never steal a live worker's lease or replay completed jobs. */
export async function retryMetaJob(db: Db, ctx: AccessContext, id: string) {
  ensure(isManager(ctx));
  const now = new Date();
  const job = await db.metaLeadJob.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!job) throw notFound();
  await db.metaLeadJob.updateMany({
    where: { id, orgId: ctx.orgId, OR: [{ status: "PENDING" }, { status: "FAILED" }, { status: "PROCESSING", leaseUntil: { lte: now } }] },
    data: { status: "PENDING", availableAt: now, attempts: 0, leaseToken: null, leaseUntil: null, lastError: null },
  });
  return drainMetaJobs(db, { ids: [id], orgId: ctx.orgId });
}
