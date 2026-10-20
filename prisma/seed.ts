/**
 * Local demo data: one school with an owner, a manager and two agents, and ~30 realistic leads
 * spread across the pipeline with calls, notes and follow-ups.
 *
 *   npm run db:seed
 */
import "dotenv/config";
import { hashPassword } from "better-auth/crypto";
import { createPrisma } from "../src/lib/db";
import { loadAccessContext } from "../src/modules/access";
import { createLead, logActivity, moveLead } from "../src/modules/leads";
import { createOrganization } from "../src/modules/orgs";
import { createTask } from "../src/modules/tasks";
import { zonedDateString } from "../src/lib/dates";

export const DEMO_USERS = [
  { email: "owner@demo.local", name: "Olivia Owner", password: "demo-password-2026", role: "OWNER" as const },
  { email: "manager@demo.local", name: "Marco Manager", password: "demo-password-2026", role: "MANAGER" as const },
  { email: "ana@demo.local", name: "Ana Agent", password: "demo-password-2026", role: "AGENT" as const },
  { email: "luis@demo.local", name: "Luis Agent", password: "demo-password-2026", role: "AGENT" as const },
];

const FIRST = ["Carlos", "Emily", "Jake", "Sofia", "Daniel", "Mia", "Andrés", "Olivia", "Ethan", "Valentina", "Noah", "Camila", "Liam", "Isabella", "Mateo", "Ava", "Diego", "Chloe", "Ryan", "Lucía", "Tyler", "Gabriela", "Brandon", "Mariana", "Kevin", "Paula", "Jason", "Natalia", "Chris", "Elena"];
const LAST = ["Ramirez", "Johnson", "Smith", "Garcia", "Lee", "Martinez", "Lopez", "Brown", "Davis", "Rodriguez", "Wilson", "Torres", "Anderson", "Hernandez", "Moore"];
const SOURCES = ["WEBSITE", "WEBSITE", "WEBSITE", "PHONE", "PHONE", "INSTAGRAM", "INSTAGRAM", "FACEBOOK", "TIKTOK", "REFERRAL", "WALK_IN"] as const;
const PROGRAMS = ["DISCOVERY", "PRIVATE", "PRIVATE", "PRIVATE", "CAREER", "CAREER", "INSTRUMENT", "COMMERCIAL", "CFI"] as const;
const NOTES = [
  "Saw our reel, wants to know total cost to PPL.",
  "Asked about financing options and weekend availability.",
  "Career changer, 32, wants to go airline. Has savings.",
  "High-school senior, parents will call back.",
  "Already has 12 hours from another school.",
  "Wants a discovery flight as a birthday gift.",
];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production.");
  const db = createPrisma();
  try {
    if ((await db.organization.count()) > 0) {
      console.log("[seed] a school already exists; nothing to do.");
      return;
    }
    const users = [];
    for (const u of DEMO_USERS) {
      const user = await db.user.create({ data: { email: u.email, name: u.name, emailVerified: true } });
      await db.account.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", password: await hashPassword(u.password) } });
      users.push({ ...u, id: user.id });
    }
    const org = await createOrganization(db, users[0].id, { name: "Sunrise Aviation Academy (demo)", timeZone: "America/New_York", locale: "en" });
    for (const u of users.slice(1)) await db.membership.create({ data: { orgId: org.id, userId: u.id, role: u.role } });
    const [, manager, ana, luis] = await Promise.all(users.map((u) => loadAccessContext(db, u.id)));
    const agents = [ana!, luis!];
    const stages = await db.pipelineStage.findMany({ where: { orgId: org.id }, orderBy: { position: "asc" } });

    let rnd = 7;
    const rand = (n: number) => (rnd = (rnd * 9301 + 49297) % 233280) % n;
    const today = (offset: number) => zonedDateString(new Date(Date.now() + offset * 86_400_000), org.timeZone);

    for (let i = 0; i < 30; i++) {
      const agent = agents[i % 2];
      const actor = i % 5 === 0 ? manager! : agent;
      const lead = await createLead(db, actor, {
        firstName: FIRST[i],
        lastName: LAST[rand(LAST.length)],
        phone: `407555${String(1000 + i * 37).slice(-4)}`,
        email: i % 3 === 0 ? null : `${FIRST[i].toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}${i}@example.com`,
        source: SOURCES[rand(SOURCES.length)],
        program: PROGRAMS[rand(PROGRAMS.length)],
        language: i % 4 === 1 ? "es" : "en",
        ownerId: i % 7 === 6 ? null : agent.membershipId,
        note: NOTES[rand(NOTES.length)],
      });
      // Age the lead a bit so the dashboard and "days in stage" have something to show.
      const createdAt = new Date(Date.now() - rand(20) * 86_400_000 - rand(20) * 3_600_000);
      await db.lead.update({ where: { id: lead.id }, data: { createdAt, stageChangedAt: createdAt } });

      const stageIdx = [0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6][rand(14)];
      const ctx = lead.ownerId ? agent : manager!;
      if (stageIdx > 0) {
        await logActivity(db, ctx, lead.id, { type: "CALL", outcome: "CONNECTED", body: "Intro call. Explained the program, costs and timeline." });
        await moveLead(db, ctx, lead.id, stages[stageIdx].id, null, stages[stageIdx].kind === "LOST" ? ["Too expensive", "Chose another school", "Medical issue"][rand(3)] : null);
        const movedAt = new Date(Math.min(Date.now(), createdAt.getTime() + rand(5) * 86_400_000));
        await db.lead.update({ where: { id: lead.id }, data: { stageChangedAt: movedAt } });
      } else if (rand(2)) {
        await logActivity(db, ctx, lead.id, { type: "CALL", outcome: "VOICEMAIL" });
      }
      if (stages[stageIdx].kind === "OPEN" && rand(4) > 0) {
        await createTask(db, ctx, lead.id, { title: ["Call back", "Send pricing sheet", "Confirm discovery flight", "Check on financing"][rand(4)], date: today(rand(6) - 2), time: "10:00" });
      }
    }
    console.log(`[seed] "${org.name}" with ${DEMO_USERS.length} users and 30 leads. Sign in with:`);
    for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(7)} ${u.email} / ${u.password}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
