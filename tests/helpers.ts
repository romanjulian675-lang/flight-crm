import { prisma } from "@/lib/db";
import { loadAccessContext, type AccessContext } from "@/modules/access";
import { createOrganization } from "@/modules/orgs";
import { truncateAll } from "./db-admin";
import type { Role } from "@/generated/prisma/client";

export { prisma };

export async function resetDb() {
  await truncateAll(process.env.TEST_DATABASE_URL!);
}

let seq = 0;

async function makeUser(label: string) {
  return prisma.user.create({ data: { name: `${label} ${++seq}`, email: `${label.toLowerCase()}${seq}@test.local` } });
}

export async function ctxFor(userId: string, orgId?: string): Promise<AccessContext> {
  return (await loadAccessContext(prisma, userId, orgId))!;
}

export async function addMember(orgId: string, role: Role): Promise<AccessContext> {
  const user = await makeUser(role);
  await prisma.membership.create({ data: { orgId, userId: user.id, role } });
  return ctxFor(user.id, orgId);
}

/** A school with an owner, a manager and two agents. */
export async function makeSchool(name = "Test School") {
  const ownerUser = await makeUser("Owner");
  const org = await createOrganization(prisma, ownerUser.id, { name, timeZone: "America/New_York", locale: "en" });
  const owner = await ctxFor(ownerUser.id, org.id);
  const manager = await addMember(org.id, "MANAGER");
  const agent = await addMember(org.id, "AGENT");
  const agent2 = await addMember(org.id, "AGENT");
  return { org, owner, manager, agent, agent2 };
}
