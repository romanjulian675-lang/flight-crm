import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { conflict, invalid, notFound } from "@/lib/errors";
import type { Role } from "@/generated/prisma/client";
import { ensure, permissions, type AccessContext } from "@/modules/access";

const INVITE_DAYS = 7;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function listMembers(db: Db, ctx: AccessContext) {
  return db.membership.findMany({
    where: { orgId: ctx.orgId },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    select: { id: true, role: true, active: true, createdAt: true, user: { select: { name: true, email: true } } },
  });
}

/** Active members, for "assign to" pickers. */
export function listAssignable(db: Db, ctx: AccessContext) {
  return db.membership.findMany({
    where: { orgId: ctx.orgId, active: true },
    orderBy: { user: { name: "asc" } },
    select: { id: true, role: true, user: { select: { name: true } } },
  });
}

/** Owners may grant any role; managers may only bring in agents. */
function canGrant(ctx: AccessContext, role: Role) {
  return ctx.role === "OWNER" || (ctx.role === "MANAGER" && role === "AGENT");
}

export const inviteInput = z.object({
  email: z.email("emailInvalid").trim().toLowerCase(),
  role: z.enum(["OWNER", "MANAGER", "AGENT"]),
});

/** Create an invite link. Returns the raw token once; only its hash is stored. */
export async function createInvite(db: Db, ctx: AccessContext, input: z.input<typeof inviteInput>) {
  ensure(permissions.manageMembers(ctx));
  const data = inviteInput.parse(input);
  ensure(canGrant(ctx, data.role));
  const existing = await db.membership.findFirst({ where: { orgId: ctx.orgId, user: { email: data.email } } });
  if (existing) throw conflict("alreadyMember");
  const token = randomBytes(24).toString("base64url");
  await db.invite.create({
    data: {
      orgId: ctx.orgId,
      email: data.email,
      role: data.role,
      tokenHash: hashToken(token),
      invitedById: ctx.membershipId,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
    },
  });
  return token;
}

export function listPendingInvites(db: Db, ctx: AccessContext) {
  return db.invite.findMany({
    where: { orgId: ctx.orgId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, role: true, expiresAt: true },
  });
}

export async function revokeInvite(db: Db, ctx: AccessContext, inviteId: string) {
  ensure(permissions.manageMembers(ctx));
  const res = await db.invite.updateMany({ where: { id: inviteId, orgId: ctx.orgId, acceptedAt: null }, data: { revokedAt: new Date() } });
  if (res.count === 0) throw notFound();
}

/** Look up a usable invite by its raw token (for the public /invite page). */
export async function findInvite(db: Db, token: string) {
  const invite = await db.invite.findUnique({ where: { tokenHash: hashToken(token) }, include: { org: { select: { name: true } } } });
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= new Date()) return null;
  return invite;
}

/**
 * Join the school. The signed-in user's email must match the invite, so a forwarded link can't be
 * used by someone else.
 */
export async function acceptInvite(db: Db, userId: string, token: string) {
  const invite = await findInvite(db, token);
  if (!invite) throw invalid("inviteInvalid");
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  if (user.email.toLowerCase() !== invite.email.toLowerCase()) throw invalid("inviteEmailMismatch");
  return db.$transaction(async (tx) => {
    const claimed = await tx.invite.updateMany({ where: { id: invite.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
    if (claimed.count === 0) throw invalid("inviteInvalid");
    await tx.membership.upsert({
      where: { orgId_userId: { orgId: invite.orgId, userId } },
      create: { orgId: invite.orgId, userId, role: invite.role },
      update: { role: invite.role, active: true },
    });
    return invite.orgId;
  });
}

export const memberUpdateInput = z.object({
  role: z.enum(["OWNER", "MANAGER", "AGENT"]),
  active: z.boolean(),
});

export async function updateMember(db: Db, ctx: AccessContext, membershipId: string, input: z.input<typeof memberUpdateInput>) {
  ensure(permissions.manageMembers(ctx));
  const data = memberUpdateInput.parse(input);
  const target = await db.membership.findFirst({ where: { id: membershipId, orgId: ctx.orgId } });
  if (!target) throw notFound();
  // Managers can only touch agents, and only keep them agents.
  ensure(canGrant(ctx, target.role) && canGrant(ctx, data.role));
  if (target.role === "OWNER" && (data.role !== "OWNER" || !data.active)) {
    const owners = await db.membership.count({ where: { orgId: ctx.orgId, role: "OWNER", active: true } });
    if (owners <= 1) throw invalid("lastOwner");
  }
  await db.membership.update({ where: { id: membershipId }, data });
}
