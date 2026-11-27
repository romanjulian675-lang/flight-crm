import { beforeEach, describe, expect, it } from "vitest";
import { makeSchool, prisma, resetDb } from "../helpers";
import { commentContent, createContent, listContent, reviewContent, updateContent } from "@/modules/content";

beforeEach(resetDb);
const draft = { title: "Reel 39 — Lost procedures", caption: "Use the 5 Cs.", videoUrl: "https://example.com/reel39.mp4", coverUrl: "", date: "2026-11-27", time: "16:00" };

describe("content review", () => {
  it("keeps content and feedback within the caller's school", async () => {
    const a = await makeSchool();
    const b = await makeSchool("Other school");
    const post = await createContent(prisma, a.agent, draft);
    expect(await listContent(prisma, b.owner)).toEqual([]);
    await expect(updateContent(prisma, b.owner, post.id, 1, draft)).rejects.toThrow();
    await expect(reviewContent(prisma, b.owner, post.id, 1, "IN_REVIEW")).rejects.toThrow();
    await expect(commentContent(prisma, b.owner, post.id, "External comment")).rejects.toThrow();
    await commentContent(prisma, a.manager, post.id, "Check the cover.");
    expect((await listContent(prisma, a.owner))[0].comments[0].body).toBe("Check the cover.");
  });

  it("requires manager review and clears approval when the reviewed version changes", async () => {
    const s = await makeSchool();
    const post = await createContent(prisma, s.agent, draft);
    await expect(reviewContent(prisma, s.owner, post.id, 1, "APPROVED")).rejects.toThrow("contentTransitionInvalid");
    await reviewContent(prisma, s.agent, post.id, 1, "IN_REVIEW");
    await expect(reviewContent(prisma, s.agent, post.id, 2, "APPROVED")).rejects.toThrow();
    await reviewContent(prisma, s.manager, post.id, 2, "APPROVED");
    const approved = (await listContent(prisma, s.owner))[0];
    expect(approved.approvedBy).toBe(s.manager.name);
    expect(approved.status).toBe("APPROVED");
    await updateContent(prisma, s.agent, post.id, 3, { ...draft, caption: "Updated caption" });
    const edited = (await listContent(prisma, s.owner))[0];
    expect(edited.status).toBe("DRAFT");
    expect(edited.approvedAt).toBeNull();
    expect(edited.approvedBy).toBeNull();
    await expect(reviewContent(prisma, s.manager, post.id, 3, "APPROVED")).rejects.toThrow("contentStale");
  });

  it("saves feedback atomically, requires reviewable media, and rejects stale edits", async () => {
    const s = await makeSchool();
    const post = await createContent(prisma, s.agent, { ...draft, videoUrl: "" });
    await expect(reviewContent(prisma, s.agent, post.id, 1, "IN_REVIEW")).rejects.toThrow("contentNotReady");
    await updateContent(prisma, s.agent, post.id, 1, draft);
    await expect(updateContent(prisma, s.agent2, post.id, 1, { ...draft, title: "Stale" })).rejects.toThrow("contentStale");
    await reviewContent(prisma, s.agent, post.id, 2, "IN_REVIEW");
    await expect(reviewContent(prisma, s.manager, post.id, 3, "NEEDS_CHANGES")).rejects.toThrow("contentFeedbackRequired");
    await reviewContent(prisma, s.manager, post.id, 3, "NEEDS_CHANGES", "Replace the cover.");
    const changed = (await listContent(prisma, s.owner))[0];
    expect(changed.status).toBe("NEEDS_CHANGES");
    expect(changed.comments[0].body).toBe("Replace the cover.");
  });

  it("plans in the school's timezone, validates dates and media, and never claims a schedule", async () => {
    const s = await makeSchool();
    const winter = await createContent(prisma, s.owner, draft);
    const summer = await createContent(prisma, s.owner, { ...draft, date: "2027-07-01" });
    expect(winter.plannedAt?.toISOString()).toBe("2026-11-27T21:00:00.000Z");
    expect(summer.plannedAt?.toISOString()).toBe("2027-07-01T20:00:00.000Z");
    expect(winter.status).toBe("DRAFT");
    await expect(createContent(prisma, s.owner, { ...draft, date: "2026-02-30" })).rejects.toThrow();
    await expect(createContent(prisma, s.owner, { ...draft, videoUrl: "javascript:alert(1)" })).rejects.toThrow();
    await expect(createContent(prisma, s.owner, { ...draft, caption: "x".repeat(2201) })).rejects.toThrow();
  });
});
