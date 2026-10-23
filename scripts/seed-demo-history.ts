/**
 * Adds a year of realistic history to the DEMO school so the Reports screen has something to show:
 * ~320 leads with channel and agent differences, stage moves with real timestamps, calls, losses
 * with reasons, and open leads with next steps.
 *
 *   npx tsx scripts/seed-demo-history.ts
 *
 * Safety: refuses to run in production, only touches a school whose name ends in "(demo)" and whose
 * members all use @demo.local addresses, and runs once (re-running is a no-op).
 */
import "dotenv/config";
import { hashPassword } from "better-auth/crypto";
import { createPrisma } from "../src/lib/db";

const DAY = 86_400_000;
const MARK = "demo-history";

// Channel profile: share of volume and how well its leads move through the funnel (1 = average).
const CHANNELS = [
  { source: "WEBSITE", weight: 24, quality: 1.0 },
  { source: "INSTAGRAM", weight: 22, quality: 0.6 },
  { source: "FACEBOOK", weight: 11, quality: 0.65 },
  { source: "TIKTOK", weight: 10, quality: 0.4 },
  { source: "GOOGLE", weight: 12, quality: 1.1 },
  { source: "PHONE", weight: 9, quality: 1.35 },
  { source: "REFERRAL", weight: 7, quality: 1.9 },
  { source: "WALK_IN", weight: 5, quality: 1.7 },
] as const;

// Base chance of moving on from each step (New → Contacted → DF booked → DF done → Application → Enrolled).
const PASS = [0.8, 0.52, 0.82, 0.6, 0.58];
const LOST_REASONS = [
  ["Too expensive", 30],
  ["Chose another school", 18],
  ["No response after 5 attempts", 22],
  ["Timing: will start next year", 12],
  ["Financing denied", 10],
  ["Medical issue", 8],
] as const;
const PROGRAMS = ["DISCOVERY", "PRIVATE", "PRIVATE", "PRIVATE", "CAREER", "CAREER", "CAREER", "INSTRUMENT", "COMMERCIAL", "CFI"] as const;
const FIRST = ["Carlos", "Emily", "Jake", "Sofia", "Daniel", "Mia", "Andrés", "Olivia", "Ethan", "Valentina", "Noah", "Camila", "Liam", "Isabella", "Mateo", "Ava", "Diego", "Chloe", "Ryan", "Lucía", "Tyler", "Gabriela", "Brandon", "Mariana", "Kevin", "Paula", "Jason", "Natalia", "Chris", "Elena", "Santiago", "Hannah", "Luis", "Grace", "Juan", "Zoe", "Miguel", "Lily", "Sebastián", "Nora"];
const LAST = ["Ramirez", "Johnson", "Smith", "Garcia", "Lee", "Martinez", "Lopez", "Brown", "Davis", "Rodriguez", "Wilson", "Torres", "Anderson", "Hernandez", "Moore", "Castro", "Nguyen", "Patel", "Reyes", "Clark"];

// Extra demo agents so the ranking has a spread. skill moves pass rates; reply = typical minutes to first contact.
const EXTRA_AGENTS = [
  { email: "camila@demo.local", name: "Camila Agent" },
  { email: "diego@demo.local", name: "Diego Agent" },
];
const PROFILE: Record<string, { skill: number; reply: number }> = {
  "ana@demo.local": { skill: 1.12, reply: 25 },
  "luis@demo.local": { skill: 0.85, reply: 300 },
  "camila@demo.local": { skill: 1.3, reply: 8 },
  "diego@demo.local": { skill: 0.75, reply: 900 },
};

let seed = 20261023;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
const weighted = <T,>(xs: readonly (readonly [T, number])[]) => {
  let n = rnd() * xs.reduce((a, [, w]) => a + w, 0);
  for (const [v, w] of xs) if ((n -= w) <= 0) return v;
  return xs[xs.length - 1][0];
};

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to add demo data in production.");
  const db = createPrisma();
  try {
    const org = await db.organization.findFirst({ where: { name: { endsWith: "(demo)" } }, include: { memberships: { include: { user: true } } } });
    if (!org) throw new Error('No demo school found (name ending in "(demo)"). Run `npm run db:seed` first.');
    if (org.memberships.some((m) => !m.user.email.endsWith("@demo.local"))) throw new Error("The demo school has real members; refusing to add fake data to it.");
    if (await db.lead.count({ where: { orgId: org.id, sourceDetail: MARK } })) {
      console.log("[demo-history] already added; nothing to do.");
      return;
    }

    for (const a of EXTRA_AGENTS) {
      if (org.memberships.some((m) => m.user.email === a.email)) continue;
      const user = await db.user.create({ data: { email: a.email, name: a.name, emailVerified: true } });
      await db.account.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", password: await hashPassword("demo-password-2026") } });
      await db.membership.create({ data: { orgId: org.id, userId: user.id, role: "AGENT" } });
    }
    const members = await db.membership.findMany({ where: { orgId: org.id }, include: { user: true } });
    const agents = members.filter((m) => PROFILE[m.user.email]).map((m) => ({ id: m.id, ...PROFILE[m.user.email] }));
    const manager = members.find((m) => m.role === "MANAGER") ?? members[0];
    const stages = await db.pipelineStage.findMany({ where: { orgId: org.id }, orderBy: { position: "asc" } });
    const steps = stages.filter((s) => s.kind !== "LOST");
    const lost = stages.find((s) => s.kind === "LOST")!;
    const now = Date.now();

    // Volume grows through the year (the Meta campaign), with a dip around the holidays.
    const days = Array.from({ length: 365 }, (_, i) => {
      const at = new Date(now - (364 - i) * DAY);
      const growth = 0.45 + (i / 364) * 0.9;
      const season = at.getMonth() === 11 ? 0.6 : at.getMonth() === 0 || at.getMonth() === 5 ? 1.25 : 1;
      return { at, w: growth * season };
    });
    const total = 320;
    const wsum = days.reduce((a, d) => a + d.w, 0);

    let made = 0;
    for (const d of days) {
      let n = Math.floor((d.w / wsum) * total + rnd());
      while (n-- > 0) {
        made++;
        const ch = weighted(CHANNELS.map((c) => [c, c.weight] as const));
        const agent = rnd() < 0.05 ? null : pick(agents);
        const createdAt = new Date(d.at.getTime() - rnd() * DAY * 0.9);
        const ageDays = (now - createdAt.getTime()) / DAY;

        // Walk the funnel. Each step takes 2-9 days; recent leads haven't had time to get far.
        let reached = 0;
        let t = createdAt.getTime();
        const times: number[] = [];
        for (let i = 0; i < PASS.length; i++) {
          const p = Math.min(0.95, PASS[i] * ch.quality ** 0.5 * (agent?.skill ?? 0.7));
          const gap = (i === 0 ? 0.2 + rnd() * 2 : 2 + rnd() * 7) * DAY;
          if (t + gap > now || rnd() > p) break;
          t += gap;
          times.push(t);
          reached = i + 1;
        }
        const endedOpen = reached < steps.length - 1;
        const goesLost = endedOpen && (now - t) / DAY > 12 && rnd() < 0.75;
        const lostAt = goesLost ? Math.min(now - DAY, t + (5 + rnd() * 20) * DAY) : null;

        const first = pick(FIRST);
        const last = pick(LAST);
        const finalStage = goesLost ? lost : steps[reached];
        const firstContactAt = reached >= 1 ? new Date(createdAt.getTime() + Math.min(times[0] - createdAt.getTime(), (agent?.reply ?? 600) * 60_000 * (0.3 + rnd() * 1.4))) : null;
        const changedAt = new Date(lostAt ?? times[times.length - 1] ?? createdAt.getTime());

        const lead = await db.lead.create({
          data: {
            orgId: org.id,
            firstName: first,
            lastName: last,
            phone: `1407${String(5550000 + made * 37).slice(-7)}`,
            email: rnd() < 0.7 ? `${first.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}.${last.toLowerCase()}${made}@example.com` : null,
            language: rnd() < 0.35 ? "es" : "en",
            source: ch.source,
            sourceDetail: MARK,
            program: pick(PROGRAMS),
            isInternational: rnd() < 0.3,
            stageId: finalStage.id,
            position: -made,
            ownerId: agent?.id ?? null,
            lostReason: goesLost ? weighted(LOST_REASONS) : null,
            firstContactAt,
            lastContactAt: firstContactAt ? changedAt : null,
            stageChangedAt: changedAt,
            createdAt,
          },
        });

        const actorId = agent?.id ?? manager.id;
        const acts: { type: "CREATED" | "CALL" | "STAGE_CHANGE"; createdAt: Date; actorId: string | null; meta?: object; body?: string }[] = [
          { type: "CREATED", createdAt, actorId: null, meta: { source: ch.source } },
        ];
        if (firstContactAt) acts.push({ type: "CALL", createdAt: firstContactAt, actorId, meta: { direction: "OUT", outcome: "CONNECTED" }, body: "Intro call: program, costs, timeline." });
        else if (ageDays > 1) acts.push({ type: "CALL", createdAt: new Date(createdAt.getTime() + 3 * 3_600_000), actorId, meta: { direction: "OUT", outcome: rnd() < 0.5 ? "VOICEMAIL" : "NO_ANSWER" } });
        times.forEach((at, i) => {
          const from = steps[i];
          const to = steps[i + 1];
          acts.push({ type: "STAGE_CHANGE", createdAt: new Date(at), actorId, meta: { from: from.name, to: to.name, fromId: from.id, toId: to.id, toKind: to.kind } });
        });
        if (goesLost) {
          const from = steps[reached];
          acts.push({ type: "STAGE_CHANGE", createdAt: new Date(lostAt!), actorId, body: lead.lostReason ?? undefined, meta: { from: from.name, to: lost.name, fromId: from.id, toId: lost.id, toKind: "LOST" } });
        }
        await db.activity.createMany({ data: acts.map((a) => ({ orgId: org.id, leadId: lead.id, actorId: a.actorId, type: a.type, meta: a.meta, body: a.body ?? null, createdAt: a.createdAt })) });

        // Most open leads have a next step; a few are overdue, a few have none.
        if (finalStage.kind === "OPEN" && agent && rnd() < 0.8) {
          await db.task.create({
            data: { orgId: org.id, leadId: lead.id, title: pick(["Call back", "Send pricing sheet", "Confirm discovery flight", "Check on financing", "Follow up on application"]), dueAt: new Date(now + (rnd() * 8 - 2) * DAY), assigneeId: agent.id, createdById: agent.id },
          });
        }
      }
    }
    console.log(`[demo-history] added ${made} leads with a year of history to "${org.name}".`);
    console.log("New demo agents (password demo-password-2026): " + EXTRA_AGENTS.map((a) => a.email).join(", "));
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
