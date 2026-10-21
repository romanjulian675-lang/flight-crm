import { beforeEach, describe, expect, it } from "vitest";
import { ctxFor, makeSchool, prisma, resetDb } from "../helpers";
import { createRule, deleteRule, moveRule, pickOwner, rotate, ruleMatches, setAcceptsLeads, updateRule } from "@/modules/assignment";
import { createIntegration } from "@/modules/integrations";
import { ingest } from "@/modules/intake";
import { createLead, getLead, listLeads, logActivity, moveLead, setChecklistItem } from "@/modules/leads";
import { applySuggestedPlaybooks, listStages, updatePlaybook } from "@/modules/orgs";
import { median, teamStats } from "@/modules/stats";
import { getDashboard } from "@/modules/dashboard";

beforeEach(resetDb);

const ownerOf = async (leadId: string | null) => (await prisma.lead.findUniqueOrThrow({ where: { id: leadId! } })).ownerId;

describe("assignment rules", () => {
  it("pure helpers", () => {
    expect(rotate(["a", "b", "c"], null)).toBe("a");
    expect(rotate(["a", "b", "c"], "c")).toBe("a");
    expect(rotate(["a", "b"], "gone")).toBe("a");
    expect(rotate([], "a")).toBeNull();
    expect(ruleMatches({ language: "es", program: null, source: null }, { language: "es", program: "CAREER", source: "WEBSITE" })).toBe(true);
    expect(ruleMatches({ language: "es", program: "CFI", source: null }, { language: "es", program: "CAREER", source: "WEBSITE" })).toBe(false);
  });

  it("routes matching leads to the rule's people, in turn; the rest follow the default", async () => {
    const s = await makeSchool();
    await createRule(prisma, s.manager, { name: "Spanish", language: "es", program: null, source: null, memberIds: [s.agent2.membershipId, s.manager.membershipId] });
    const form = await createIntegration(prisma, s.owner, { kind: "WEB_FORM", name: "Web" });
    const es1 = await ingest(prisma, form, { name: "Ana", email: "a@x.com", language: "es" });
    const es2 = await ingest(prisma, form, { name: "Beto", email: "b@x.com", language: "español" });
    const en1 = await ingest(prisma, form, { name: "Cal", email: "c@x.com", language: "en" });
    expect(await ownerOf(es1.leadId)).toBe(s.agent2.membershipId);
    expect(await ownerOf(es2.leadId)).toBe(s.manager.membershipId);
    expect(await ownerOf(en1.leadId)).toBe(s.agent.membershipId); // default rotation starts at first agent
  });

  it("skips paused people, and falls through when a whole rule is away", async () => {
    const s = await makeSchool();
    await createRule(prisma, s.manager, { name: "Career", language: null, program: "CAREER", source: null, memberIds: [s.agent2.membershipId] });
    await setAcceptsLeads(prisma, s.agent2, s.agent2.membershipId, false); // agents can pause themselves
    const form = await createIntegration(prisma, s.owner, { kind: "WEB_FORM", name: "Web" });
    const r1 = await ingest(prisma, form, { name: "Dee", email: "d@x.com", program: "airline career" });
    const r2 = await ingest(prisma, form, { name: "Eve", email: "e@x.com" });
    // Rule's only member is paused → default rotation, which also skips agent2.
    expect(await ownerOf(r1.leadId)).toBe(s.agent.membershipId);
    expect(await ownerOf(r2.leadId)).toBe(s.agent.membershipId);
  });

  it("only managers edit rules; members must belong to the school; order can change", async () => {
    const s = await makeSchool();
    const other = await makeSchool("Other");
    await expect(createRule(prisma, s.agent, { name: "X", language: null, program: null, source: null, memberIds: [s.agent.membershipId] })).rejects.toThrow();
    await expect(createRule(prisma, s.manager, { name: "X", language: null, program: null, source: null, memberIds: [other.agent.membershipId] })).rejects.toThrow();
    await expect(createRule(prisma, s.manager, { name: "X", language: null, program: null, source: null, memberIds: [] })).rejects.toThrow();
    const a = await createRule(prisma, s.manager, { name: "A", language: "es", program: null, source: null, memberIds: [s.agent.membershipId] });
    const b = await createRule(prisma, s.manager, { name: "B", language: null, program: null, source: "INSTAGRAM", memberIds: [s.agent2.membershipId] });
    await moveRule(prisma, s.manager, b.id, -1);
    expect((await prisma.assignmentRule.findMany({ orderBy: { position: "asc" } })).map((r) => r.name)).toEqual(["B", "A"]);
    await updateRule(prisma, s.manager, a.id, { name: "A2", active: false, language: "es", program: null, source: null, memberIds: [s.agent.membershipId] });
    await deleteRule(prisma, s.owner, b.id);
    await expect(deleteRule(prisma, other.owner, a.id)).rejects.toThrow();
    // Inactive rule is ignored.
    const pick = await prisma.$transaction((tx) => pickOwner(tx, s.org.id, { language: "es", program: "PRIVATE", source: "WEBSITE" }));
    expect(pick).toBe(s.agent.membershipId);
  });

  it("an agent can't pause someone else; a manager can pause agents", async () => {
    const s = await makeSchool();
    await expect(setAcceptsLeads(prisma, s.agent, s.agent2.membershipId, false)).rejects.toThrow();
    await setAcceptsLeads(prisma, s.manager, s.agent2.membershipId, false);
    await expect(setAcceptsLeads(prisma, s.manager, s.owner.membershipId, false)).rejects.toThrow();
  });
});

describe("required next step", () => {
  it("blocks a touch on an open lead with nothing scheduled, and accepts it with a follow-up", async () => {
    const s = await makeSchool();
    const lead = await createLead(prisma, s.agent, { firstName: "Fay" });
    await expect(logActivity(prisma, s.agent, lead.id, { type: "CALL", outcome: "CONNECTED" })).rejects.toThrow("nextStepRequired");
    // Notes never require one.
    await logActivity(prisma, s.agent, lead.id, { type: "NOTE", body: "Prefers evenings" });
    await logActivity(prisma, s.agent, lead.id, { type: "CALL", outcome: "CONNECTED", followUp: { title: "Book discovery flight", date: "2026-10-22", time: "17:30" } });
    const full = await getLead(prisma, s.agent, lead.id);
    expect(full.tasks.map((x) => x.title)).toEqual(["Book discovery flight"]);
    expect(full.tasks[0].dueAt.toISOString()).toBe("2026-10-22T21:30:00.000Z"); // 17:30 New York
    // With a task now open, another call doesn't need a new one.
    await logActivity(prisma, s.agent, lead.id, { type: "SMS", body: "Sent times" });
    expect(await listLeads(prisma, s.agent, { noNext: "1" })).toHaveLength(0);
  });

  it("can be turned off, and never applies to closed leads", async () => {
    const s = await makeSchool();
    const lead = await createLead(prisma, s.owner, { firstName: "Gus" });
    const won = (await listStages(prisma, s.owner)).find((x) => x.kind === "WON")!;
    await moveLead(prisma, s.owner, lead.id, won.id, null);
    await logActivity(prisma, s.owner, lead.id, { type: "CALL", outcome: "CONNECTED" });
    await prisma.organization.update({ where: { id: s.org.id }, data: { requireNextStep: false } });
    const open = await createLead(prisma, s.owner, { firstName: "Hal" });
    await logActivity(prisma, s.owner, open.id, { type: "EMAIL" });
    expect((await listLeads(prisma, s.owner, { noNext: "1" })).map((l) => l.firstName)).toEqual(["Hal"]);
    expect((await getDashboard(prisma, s.owner)).noNextStep).toBe(1);
  });
});

describe("playbooks", () => {
  it("new schools get the suggested playbook; checklist ticks are per lead and per stage", async () => {
    const s = await makeSchool();
    const [first] = await listStages(prisma, s.owner);
    expect(first.playbook).toContain("5 minutes");
    expect(first.checklist.length).toBeGreaterThan(2);

    const lead = await createLead(prisma, s.agent, { firstName: "Ivy" });
    await setChecklistItem(prisma, s.agent, lead.id, first.id, first.checklist[0], true);
    await setChecklistItem(prisma, s.agent, lead.id, first.id, first.checklist[1], true);
    await setChecklistItem(prisma, s.agent, lead.id, first.id, first.checklist[0], false);
    expect(((await getLead(prisma, s.agent, lead.id)).checklist as Record<string, string[]>)[first.id]).toEqual([first.checklist[1]]);
    await expect(setChecklistItem(prisma, s.agent, lead.id, first.id, "Not an item", true)).rejects.toThrow();
    await expect(setChecklistItem(prisma, s.agent2, lead.id, first.id, first.checklist[1], true)).rejects.toThrow();
  });

  it("owners edit playbooks; suggested text only fills empty stages", async () => {
    const s = await makeSchool();
    const stages = await listStages(prisma, s.owner);
    await expect(updatePlaybook(prisma, s.manager, stages[0].id, { playbook: "x", checklist: [] })).rejects.toThrow();
    await updatePlaybook(prisma, s.owner, stages[0].id, { playbook: "  Our own script  ", checklist: ["A", "", "A", "B"] });
    await updatePlaybook(prisma, s.owner, stages[1].id, { playbook: "", checklist: [] });
    expect(await applySuggestedPlaybooks(prisma, s.owner)).toBe(1);
    const after = await listStages(prisma, s.owner);
    expect(after[0]).toMatchObject({ playbook: "Our own script", checklist: ["A", "B"] });
    expect(after[1].playbook).toContain("discovery flight");
  });
});

describe("team stats", () => {
  it("median", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("credits speed-to-lead, calls, milestones and enrollments to the right person; agents see only themselves", async () => {
    const s = await makeSchool();
    const stages = await listStages(prisma, s.owner);
    const now = new Date();
    const mk = async (ownerCtx: typeof s.agent, minutesToContact: number | null) => {
      const lead = await createLead(prisma, ownerCtx, { firstName: "L" });
      const created = new Date(now.getTime() - 3 * 3_600_000);
      await prisma.lead.update({
        where: { id: lead.id },
        data: { createdAt: created, firstContactAt: minutesToContact == null ? null : new Date(created.getTime() + minutesToContact * 60_000) },
      });
      return lead;
    };
    const a1 = await mk(s.agent, 4);
    await mk(s.agent, 30);
    await mk(s.agent, null);
    await mk(s.agent2, 200);

    await logActivity(prisma, s.agent, a1.id, { type: "CALL", outcome: "CONNECTED", followUp: { title: "x", date: "2030-01-01" } });
    await logActivity(prisma, s.agent, a1.id, { type: "CALL", outcome: "VOICEMAIL" });
    await moveLead(prisma, s.agent, a1.id, stages[2].id, null); // milestone (3rd stage)
    await moveLead(prisma, s.agent, a1.id, stages.find((x) => x.kind === "WON")!.id, null);

    const { rows, totals, milestone } = await teamStats(prisma, s.manager, 30);
    expect(milestone?.id).toBe(stages[2].id);
    const ana = rows.find((r) => r.membershipId === s.agent.membershipId)!;
    expect(ana).toMatchObject({ newLeads: 3, contacted: 2, medianResponseMin: 17, calls: 2, connectedCalls: 1, milestone: 1, enrolled: 1 });
    expect(ana.within1h).toBeCloseTo(2 / 3);
    const luis = rows.find((r) => r.membershipId === s.agent2.membershipId)!;
    expect(luis).toMatchObject({ newLeads: 1, contacted: 1, medianResponseMin: 200, within1h: 0, enrolled: 0 });
    expect(totals).toMatchObject({ newLeads: 4, contacted: 3, enrolled: 1, medianResponseMin: 30 });

    const mine = await teamStats(prisma, await ctxFor(s.agent2.userId), 30);
    expect(mine.rows.map((r) => r.membershipId)).toEqual([s.agent2.membershipId]);
  });
});
