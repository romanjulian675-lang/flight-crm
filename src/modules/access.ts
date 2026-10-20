import type { Db } from "@/lib/db";
import { forbidden } from "@/lib/errors";
import type { Role } from "@/generated/prisma/client";

/**
 * Who is calling and in which school. Every service takes this and filters by `orgId`, so a
 * caller can never read or change another school's data.
 */
export type AccessContext = {
  userId: string;
  name: string;
  email: string;
  membershipId: string;
  orgId: string;
  orgName: string;
  timeZone: string;
  role: Role;
  agentsSeeAll: boolean;
  /** Every school this user belongs to (for the switcher). */
  orgs: { orgId: string; name: string; role: Role }[];
};

/**
 * Build the context for a user. `preferredOrgId` (from the school-switcher cookie) wins when the
 * user is an active member there; otherwise the oldest active membership is used. Returns null
 * when the user belongs to no school.
 */
export async function loadAccessContext(db: Db, userId: string, preferredOrgId?: string | null): Promise<AccessContext | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      memberships: {
        where: { active: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, org: { select: { id: true, name: true, timeZone: true, agentsSeeAll: true } } },
      },
    },
  });
  if (!user || user.memberships.length === 0) return null;
  const m = user.memberships.find((x) => x.org.id === preferredOrgId) ?? user.memberships[0];
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    membershipId: m.id,
    orgId: m.org.id,
    orgName: m.org.name,
    timeZone: m.org.timeZone,
    role: m.role,
    agentsSeeAll: m.org.agentsSeeAll,
    orgs: user.memberships.map((x) => ({ orgId: x.org.id, name: x.org.name, role: x.role })),
  };
}

export const isManager = (ctx: AccessContext) => ctx.role === "OWNER" || ctx.role === "MANAGER";

export const permissions = {
  /** School settings, pipeline stages, billing. */
  manageOrg: (ctx: AccessContext) => ctx.role === "OWNER",
  /** Invite people and change their role/status. Managers may only manage agents. */
  manageMembers: isManager,
  /** See every lead in the school, not only the ones assigned to them. */
  seeAllLeads: (ctx: AccessContext) => isManager(ctx) || ctx.agentsSeeAll,
  /** Give a lead to someone else. */
  assignLeads: isManager,
  /** Permanently delete a lead and its history. */
  deleteLeads: (ctx: AccessContext) => ctx.role === "OWNER",
  /** Team-wide reports. */
  viewTeam: isManager,
};

export function ensure(ok: boolean, msg?: string) {
  if (!ok) throw forbidden(msg);
}

/** Prisma `where` that limits leads to what the caller may see. */
export function leadScope(ctx: AccessContext) {
  return permissions.seeAllLeads(ctx) ? { orgId: ctx.orgId } : { orgId: ctx.orgId, ownerId: ctx.membershipId };
}
