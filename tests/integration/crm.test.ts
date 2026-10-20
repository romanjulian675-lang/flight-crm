import { beforeEach, describe, expect, it } from "vitest";
import { addMember, ctxFor, makeSchool, prisma, resetDb } from "../helpers";
import { assignLead, createLead, deleteLead, findDuplicates, getBoard, getLead, listLeads, logActivity, moveLead, updateLead } from "@/modules/leads";
import { completeTask, createTask, myTasks } from "@/modules/tasks";
import { acceptInvite, createInvite, findInvite, updateMember } from "@/modules/members";
import { addStage, deleteStage, listStages, moveStage } from "@/modules/orgs";
import { getDashboard } from "@/modules/dashboard";

beforeEach(resetDb);

describe("tenancy", () => {
  it("never shows one school's leads to another school", async () => {
    const a = await makeSchool("Alpha");
    const b = await makeSchool("Bravo");
    const lead = await createLead(prisma, a.owner, { firstName: "Ana", phone: "(305) 555-0101" });

    expect(await listLeads(prisma, b.owner, {})).toHaveLength(0);
    await expect(getLead(prisma, b.owner, lead.id)).rejects.toThrow();
    await expect(updateLead(prisma, b.owner, lead.id, { firstName: "Hacked" })).rejects.toThrow();
    await expect(logActivity(prisma, b.owner, lead.id, { type: "NOTE", body: "x" })).rejects.toThrow();
    await expect(createTask(prisma, b.owner, lead.id, { title: "x", date: "2026-10-20" })).rejects.toThrow();
    await expect(deleteLead(prisma, b.owner, lead.id)).rejects.toThrow();
    // Duplicate check only looks inside the caller's school.
    expect(await findDuplicates(prisma, b.owner, null, "13055550101")).toHaveLength(0);
    // Moving into another school's stage is refused.
    const bStage = (await listStages(prisma, b.owner))[1];
    await expect(moveLead(prisma, a.owner, lead.id, bStage.id, null)).rejects.toThrow();
  });

  it("refuses assigning a lead to someone from another school", async () => {
    const a = await makeSchool("Alpha");
    const b = await makeSchool("Bravo");
    const lead = await createLead(prisma, a.owner, { firstName: "Ana" });
    await expect(assignLead(prisma, a.owner, lead.id, b.agent.membershipId)).rejects.toThrow();
  });

  it("switches school only to one the user belongs to", async () => {
    const a = await makeSchool("Alpha");
    const b = await makeSchool("Bravo");
    const ctx = await ctxFor(a.agent.userId, b.org.id);
    expect(ctx.orgId).toBe(a.org.id);
  });
});

describe("roles", () => {
  it("agents see only their own leads unless the school allows otherwise", async () => {
    const s = await makeSchool();
    await createLead(prisma, s.agent, { firstName: "Mine" });
    await createLead(prisma, s.agent2, { firstName: "Theirs" });
    expect((await listLeads(prisma, s.agent, {})).map((l) => l.firstName)).toEqual(["Mine"]);
    expect(await listLeads(prisma, s.manager, {})).toHaveLength(2);

    await prisma.organization.update({ where: { id: s.org.id }, data: { agentsSeeAll: true } });
    expect(await listLeads(prisma, await ctxFor(s.agent.userId), {})).toHaveLength(2);
  });

  it("agents cannot assign or delete; managers assign; only owners delete", async () => {
    const s = await makeSchool();
    const lead = await createLead(prisma, s.agent, { firstName: "Bo" });
    await expect(assignLead(prisma, s.agent, lead.id, s.agent2.membershipId)).rejects.toThrow();
    await assignLead(prisma, s.manager, lead.id, s.agent2.membershipId);
    expect((await getLead(prisma, s.manager, lead.id)).owner?.id).toBe(s.agent2.membershipId);
    await expect(deleteLead(prisma, s.manager, lead.id)).rejects.toThrow();
    await deleteLead(prisma, s.owner, lead.id);
  });

  it("an agent creating a lead always owns it", async () => {
    const s = await makeSchool();
    const lead = await createLead(prisma, s.agent, { firstName: "Cy", ownerId: s.agent2.membershipId });
    expect(lead.ownerId).toBe(s.agent.membershipId);
  });

  it("keeps at least one owner and stops managers from promoting", async () => {
    const s = await makeSchool();
    await expect(updateMember(prisma, s.owner, s.owner.membershipId, { role: "AGENT", active: true })).rejects.toThrow();
    await expect(updateMember(prisma, s.manager, s.agent.membershipId, { role: "OWNER", active: true })).rejects.toThrow();
    await expect(updateMember(prisma, s.manager, s.owner.membershipId, { role: "OWNER", active: false })).rejects.toThrow();
    await updateMember(prisma, s.manager, s.agent.membershipId, { role: "AGENT", active: false });
    expect(await ctxFor(s.agent.userId)).toBeNull();
  });
});

describe("invites", () => {
  it("joins with a matching email only, once", async () => {
    const s = await makeSchool();
    const token = await createInvite(prisma, s.owner, { email: "New.Agent@Test.local", role: "AGENT" });
    expect((await findInvite(prisma, token))?.org.name).toBe("Test School");

    const stranger = await prisma.user.create({ data: { name: "X", email: "someone@else.local" } });
    await expect(acceptInvite(prisma, stranger.id, token)).rejects.toThrow();

    const invitee = await prisma.user.create({ data: { name: "N", email: "new.agent@test.local" } });
    expect(await acceptInvite(prisma, invitee.id, token)).toBe(s.org.id);
    expect((await ctxFor(invitee.id))?.role).toBe("AGENT");
    await expect(acceptInvite(prisma, invitee.id, token)).rejects.toThrow();
  });

  it("managers may only invite agents", async () => {
    const s = await makeSchool();
    await expect(createInvite(prisma, s.manager, { email: "m@test.local", role: "MANAGER" })).rejects.toThrow();
    await expect(createInvite(prisma, s.agent, { email: "a@test.local", role: "AGENT" })).rejects.toThrow();
    await createInvite(prisma, s.manager, { email: "a@test.local", role: "AGENT" });
  });
});

describe("leads", () => {
  it("normalizes contact details and finds duplicates across the school", async () => {
    const s = await makeSchool();
    const lead = await createLead(prisma, s.agent, { firstName: "Dee", email: "DEE@Mail.com", phone: "305.555.0199" });
    expect(lead.email).toBe("dee@mail.com");
    expect(lead.phone).toBe("13055550199");
    // agent2 can't see the lead, but is still warned it exists.
    const dups = await findDuplicates(prisma, s.agent2, null, "13055550199");
    expect(dups.map((d) => d.id)).toEqual([lead.id]);
  });

  it("rejects bad input", async () => {
    const s = await makeSchool();
    await expect(createLead(prisma, s.agent, { firstName: " " })).rejects.toThrow();
    await expect(createLead(prisma, s.agent, { firstName: "A", phone: "12" })).rejects.toThrow();
    await expect(createLead(prisma, s.agent, { firstName: "A", email: "nope" })).rejects.toThrow();
  });

  it("puts new leads at the top of the first stage and logs the timeline", async () => {
    const s = await makeSchool();
    await createLead(prisma, s.owner, { firstName: "First" });
    const second = await createLead(prisma, s.owner, { firstName: "Second", note: "Called from Instagram ad" });
    const board = await getBoard(prisma, s.owner, {});
    expect(board[0].leads.map((l) => l.firstName)).toEqual(["Second", "First"]);
    const full = await getLead(prisma, s.owner, second.id);
    expect(full.activities.map((a) => a.type).sort()).toEqual(["CREATED", "NOTE"]);
  });

  it("moves between stages in order, records lost reason and stage history", async () => {
    const s = await makeSchool();
    const [a, b, c] = [await createLead(prisma, s.owner, { firstName: "A" }), await createLead(prisma, s.owner, { firstName: "B" }), await createLead(prisma, s.owner, { firstName: "C" })];
    const stages = await listStages(prisma, s.owner);
    const contacted = stages[1];
    await moveLead(prisma, s.owner, a.id, contacted.id, null);
    await moveLead(prisma, s.owner, b.id, contacted.id, null);
    await moveLead(prisma, s.owner, c.id, contacted.id, b.id); // between A and B
    let board = await getBoard(prisma, s.owner, {});
    expect(board[1].leads.map((l) => l.firstName)).toEqual(["A", "C", "B"]);

    await moveLead(prisma, s.owner, b.id, contacted.id, a.id); // reorder within the column, to top
    board = await getBoard(prisma, s.owner, {});
    expect(board[1].leads.map((l) => l.firstName)).toEqual(["B", "A", "C"]);

    const lost = stages.find((x) => x.kind === "LOST")!;
    await moveLead(prisma, s.owner, c.id, lost.id, null, "Too expensive");
    const full = await getLead(prisma, s.owner, c.id);
    expect(full.lostReason).toBe("Too expensive");
    expect(full.activities.filter((x) => x.type === "STAGE_CHANGE")).toHaveLength(2);
  });

  it("only real conversations count as contact", async () => {
    const s = await makeSchool();
    const lead = await createLead(prisma, s.agent, { firstName: "E" });
    await logActivity(prisma, s.agent, lead.id, { type: "CALL", outcome: "VOICEMAIL" });
    expect((await getLead(prisma, s.agent, lead.id)).lastContactAt).toBeNull();
    await logActivity(prisma, s.agent, lead.id, { type: "CALL", outcome: "CONNECTED", body: "Wants PPL, has medical" });
    expect((await getLead(prisma, s.agent, lead.id)).lastContactAt).not.toBeNull();
  });

  it("logs which fields changed on edit", async () => {
    const s = await makeSchool();
    const lead = await createLead(prisma, s.agent, { firstName: "F", program: "PRIVATE" });
    await updateLead(prisma, s.agent, lead.id, { firstName: "F", program: "CAREER", funding: "LOAN" });
    const upd = (await getLead(prisma, s.agent, lead.id)).activities.find((a) => a.type === "UPDATED");
    expect(upd?.meta).toEqual({ fields: ["program", "funding"] });
  });
});

describe("tasks & dashboard", () => {
  it("buckets tasks by the school's day and completes them into the timeline", async () => {
    const s = await makeSchool();
    const lead = await createLead(prisma, s.agent, { firstName: "G" });
    // 2026-10-19 14:00 New York (EDT, UTC-4)
    const now = new Date("2026-10-19T18:00:00Z");
    await createTask(prisma, s.agent, lead.id, { title: "Old", date: "2026-10-18", time: "23:30" });
    await createTask(prisma, s.agent, lead.id, { title: "Today early", date: "2026-10-19", time: "00:15" });
    await createTask(prisma, s.agent, lead.id, { title: "Today late", date: "2026-10-19", time: "23:45" });
    const later = await createTask(prisma, s.agent, lead.id, { title: "Tomorrow", date: "2026-10-20", time: "08:00" });
    const t = await myTasks(prisma, s.agent, now);
    expect(t.overdue.map((x) => x.title)).toEqual(["Old"]);
    expect(t.today.map((x) => x.title)).toEqual(["Today early", "Today late"]);
    expect(t.upcoming.map((x) => x.title)).toEqual(["Tomorrow"]);

    await completeTask(prisma, s.agent, later.id);
    expect((await myTasks(prisma, s.agent, now)).upcoming).toHaveLength(0);
    await expect(completeTask(prisma, s.agent2, t.overdue[0].id)).rejects.toThrow();
  });

  it("agents can't hand tasks to others", async () => {
    const s = await makeSchool();
    const lead = await createLead(prisma, s.agent, { firstName: "H" });
    const task = await createTask(prisma, s.agent, lead.id, { title: "x", date: "2026-10-20", assigneeId: s.agent2.membershipId });
    expect(task.assigneeId).toBe(s.agent.membershipId);
  });

  it("counts the funnel and flags uncontacted leads", async () => {
    const s = await makeSchool();
    const lead = await createLead(prisma, s.agent, { firstName: "I", source: "INSTAGRAM" });
    await prisma.lead.update({ where: { id: lead.id }, data: { createdAt: new Date(Date.now() - 30 * 3_600_000) } });
    await createLead(prisma, s.agent, { firstName: "J", source: "WEBSITE" });
    const d = await getDashboard(prisma, s.manager);
    expect(d.openLeads).toBe(2);
    expect(d.uncontacted.map((u) => u.firstName)).toEqual(["I"]);
    expect(d.bySource).toHaveLength(2);
  });
});

describe("pipeline settings", () => {
  it("lets owners edit stages but keeps a won and lost stage and protects stages with leads", async () => {
    const s = await makeSchool();
    await expect(addStage(prisma, s.manager, { name: "X", kind: "OPEN", color: "sky" })).rejects.toThrow();
    const extra = await addStage(prisma, s.owner, { name: "Checkride prep", kind: "OPEN", color: "teal" });
    await moveStage(prisma, s.owner, extra.id, -1);
    const stages = await listStages(prisma, s.owner);
    expect(stages.at(-2)?.id).toBe(extra.id);
    await deleteStage(prisma, s.owner, extra.id);

    const won = stages.find((x) => x.kind === "WON")!;
    await expect(deleteStage(prisma, s.owner, won.id)).rejects.toThrow();
    await createLead(prisma, s.owner, { firstName: "K" });
    await expect(deleteStage(prisma, s.owner, stages[0].id)).rejects.toThrow();
  });

  it("new members of another role cannot see what they shouldn't", async () => {
    const s = await makeSchool();
    const late = await addMember(s.org.id, "AGENT");
    expect(await listLeads(prisma, late, {})).toHaveLength(0);
  });
});
