/**
 * One-off for schools created before playbooks existed: fill empty stages with the suggested
 * flight-school playbook (same as Settings → Pipeline stages → "Fill empty stages…").
 *
 *   npx tsx scripts/fill-playbooks.ts
 */
import "dotenv/config";
import { createPrisma } from "../src/lib/db";
import { loadAccessContext } from "../src/modules/access";
import { applySuggestedPlaybooks } from "../src/modules/orgs";

async function main() {
  const db = createPrisma();
  try {
    const owners = await db.membership.findMany({ where: { role: "OWNER", active: true }, distinct: ["orgId"], include: { org: { select: { name: true } } } });
    for (const m of owners) {
      const ctx = await loadAccessContext(db, m.userId, m.orgId);
      if (!ctx) continue;
      console.log(`${m.org.name}: filled ${await applySuggestedPlaybooks(db, ctx)} stage(s)`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
