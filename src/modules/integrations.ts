import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import type { Integration } from "@/generated/prisma/client";
import { PROGRAM_VALUES, SOURCE_VALUES } from "@/lib/enums";
import { ensure, isManager, type AccessContext } from "@/modules/access";
import { ingest } from "@/modules/intake";

export const newToken = () => randomBytes(24).toString("base64url");

/** Owners and managers set up where leads come from. */
export const canManageIntegrations = isManager;

export function listIntegrations(db: Db, ctx: AccessContext) {
  return db.integration.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "asc" },
    include: {
      metaPages: { select: { id: true, pageName: true, messengerEnabled: true, instagramEnabled: true, subscribed: true, lastError: true } },
      _count: { select: { events: true } },
    },
  });
}

export function recentEvents(db: Db, ctx: AccessContext, take = 50) {
  return db.intakeEvent.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    take,
    include: { integration: { select: { name: true, kind: true } }, lead: { select: { id: true, firstName: true, lastName: true } } },
  });
}

const createInput = z.object({
  kind: z.enum(["WEB_FORM", "WEBHOOK", "GOOGLE_ADS"]),
  name: z.string().trim().min(1, "integrationNameRequired").max(80),
});

const DEFAULT_SOURCE = { WEB_FORM: "WEBSITE", WEBHOOK: "OTHER", GOOGLE_ADS: "GOOGLE" } as const;

export async function createIntegration(db: Db, ctx: AccessContext, input: z.input<typeof createInput>) {
  ensure(canManageIntegrations(ctx));
  const data = createInput.parse(input);
  return db.integration.create({
    data: {
      orgId: ctx.orgId,
      kind: data.kind,
      name: data.name,
      token: newToken(),
      defaultSource: DEFAULT_SOURCE[data.kind],
      // Google Ads asks for a "key" it sends back with every lead; we generate it.
      config: data.kind === "GOOGLE_ADS" ? { googleKey: randomBytes(16).toString("hex") } : undefined,
    },
  });
}

const updateInput = z.object({
  name: z.string().trim().min(1, "integrationNameRequired").max(80),
  active: z.boolean(),
  defaultSource: z.enum(SOURCE_VALUES),
  defaultProgram: z.enum(PROGRAM_VALUES),
  defaultOwnerId: z.string().uuid().nullable(),
});

async function scoped(db: Db, ctx: AccessContext, id: string): Promise<Integration> {
  ensure(canManageIntegrations(ctx));
  const i = await db.integration.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!i) throw notFound();
  return i;
}

export async function updateIntegration(db: Db, ctx: AccessContext, id: string, input: z.input<typeof updateInput>) {
  await scoped(db, ctx, id);
  const data = updateInput.parse(input);
  if (data.defaultOwnerId) {
    const m = await db.membership.findFirst({ where: { id: data.defaultOwnerId, orgId: ctx.orgId, active: true } });
    if (!m) throw notFound();
  }
  await db.integration.update({ where: { id }, data });
}

/** New secret URL; the old one stops working immediately. */
export async function rotateToken(db: Db, ctx: AccessContext, id: string) {
  await scoped(db, ctx, id);
  await db.integration.update({ where: { id }, data: { token: newToken() } });
}

export async function deleteIntegration(db: Db, ctx: AccessContext, id: string) {
  await scoped(db, ctx, id);
  await db.integration.delete({ where: { id } });
}

/** Push a clearly-labelled sample lead through the real pipeline, so the school can see it work. */
export async function sendTestLead(db: Db, ctx: AccessContext, id: string) {
  const integration = await scoped(db, ctx, id);
  const stamp = Date.now().toString().slice(-6);
  return ingest(db, { ...integration, active: true }, {
    first_name: "Test",
    last_name: `Lead ${stamp}`,
    email: `test+${stamp}@example.com`,
    message: "This is a test lead. You can delete it.",
  }, { via: `${integration.name} (test)` });
}

export async function setAssignMode(db: Db, ctx: AccessContext, mode: "NONE" | "ROUND_ROBIN") {
  ensure(canManageIntegrations(ctx));
  await db.organization.update({ where: { id: ctx.orgId }, data: { assignMode: mode } });
}

/** Look up an active-or-not integration by its URL token (public endpoints). */
export function findByToken(db: Db, token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return db.integration.findUnique({ where: { token } });
}
