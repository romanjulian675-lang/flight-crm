import { describe, expect, it, vi } from "vitest";
import { commentContent, contentInput, createContent, listContent, reviewContent, updateContent } from "@/modules/content";
import type { AccessContext } from "@/modules/access";

const ctx = { orgId: "school-a", membershipId: "member-a", name: "Julian", role: "OWNER", timeZone: "America/New_York" } as AccessContext;
const input = { title: "Reel 39", caption: "Lost procedures", videoUrl: "https://example.com/39.mp4", coverUrl: "", date: "2026-11-27", time: "16:00" };
const post = { ...input, id: "post-a", orgId: "school-a", coverUrl: null, plannedAt: new Date("2026-11-27T21:00:00Z"), status: "IN_REVIEW", version: 2 };
function database(found: object | null = post, count = 1) {
  const db = {
    contentPost: { findFirst: vi.fn().mockResolvedValue(found), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count }) },
    contentComment: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((fn) => fn(db));
  return db;
}

describe("content review rules", () => {
  it("only allows HTTPS media URLs without credentials", () => {
    for (const url of ["javascript:alert(1)", "file:///tmp/39.mp4", "http://example.com/39.mp4", "https://user:secret@example.com/39.mp4"]) expect(contentInput.safeParse({ ...input, videoUrl: url }).success).toBe(false);
    expect(contentInput.safeParse(input).success).toBe(true);
    expect(contentInput.safeParse({ ...input, caption: "x".repeat(2201) }).success).toBe(false);
  });
  it("converts 4pm Eastern across winter and summer and rejects impossible dates", async () => {
    const db = database();
    await createContent(db as never, ctx, input);
    expect(db.contentPost.create.mock.calls[0][0].data.plannedAt.toISOString()).toBe("2026-11-27T21:00:00.000Z");
    await createContent(db as never, ctx, { ...input, date: "2027-07-01" });
    expect(db.contentPost.create.mock.calls[1][0].data.plannedAt.toISOString()).toBe("2027-07-01T20:00:00.000Z");
    await expect(createContent(db as never, ctx, { ...input, date: "2026-02-30" })).rejects.toThrow("dateInvalid");
    await expect(createContent(db as never, ctx, { ...input, date: "2027-03-14", time: "02:30" })).rejects.toThrow("dateInvalid");
  });
  it("never mutates missing/foreign posts and scopes the board to its school", async () => {
    const db = database(null);
    await listContent(db as never, ctx);
    expect(db.contentPost.findMany.mock.calls[0][0].where).toEqual({ orgId: ctx.orgId });
    await expect(updateContent(db as never, ctx, "foreign", 2, input)).rejects.toThrow();
    await expect(reviewContent(db as never, ctx, "foreign", 2, "APPROVED")).rejects.toThrow();
    await expect(commentContent(db as never, ctx, "foreign", "Hello")).rejects.toThrow();
    expect(db.contentPost.findFirst).toHaveBeenCalledWith({ where: { id: "foreign", orgId: ctx.orgId } });
    expect(db.contentPost.updateMany).not.toHaveBeenCalled();
    expect(db.contentComment.create).not.toHaveBeenCalled();
  });
  it("blocks agents from approval and requires a submitted, complete version", async () => {
    const db = database();
    await expect(reviewContent(db as never, { ...ctx, role: "AGENT" }, post.id, 2, "APPROVED")).rejects.toThrow();
    await expect(reviewContent(database({ ...post, status: "DRAFT" }) as never, ctx, post.id, 2, "APPROVED")).rejects.toThrow("contentTransitionInvalid");
    await expect(reviewContent(database({ ...post, videoUrl: null }) as never, ctx, post.id, 2, "APPROVED")).rejects.toThrow("contentNotReady");
    expect(db.contentPost.updateMany).not.toHaveBeenCalled();
  });
  it("rejects stale approvals including concurrent edits after the initial read", async () => {
    const db = database();
    await expect(reviewContent(db as never, ctx, post.id, 1, "APPROVED")).rejects.toThrow("contentStale");
    const raced = database(post, 0);
    await expect(reviewContent(raced as never, ctx, post.id, 2, "NEEDS_CHANGES", "Fix cover")).rejects.toThrow("contentStale");
    expect(raced.contentComment.create).not.toHaveBeenCalled();
  });
  it("requires actionable feedback when requesting changes and saves it with the decision", async () => {
    const db = database();
    await expect(reviewContent(db as never, ctx, post.id, 2, "NEEDS_CHANGES", " ")).rejects.toThrow("contentFeedbackRequired");
    await reviewContent(db as never, ctx, post.id, 2, "NEEDS_CHANGES", "  Fix the cover  ");
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(db.contentComment.create).toHaveBeenCalledWith({ data: { postId: post.id, orgId: ctx.orgId, author: ctx.name, body: "Fix the cover" } });
  });
  it("clears approval after editing but preserves approval for a no-op save", async () => {
    const db = database({ ...post, status: "APPROVED" });
    await updateContent(db as never, ctx, post.id, 2, input);
    expect(db.contentPost.updateMany).not.toHaveBeenCalled();
    await updateContent(db as never, ctx, post.id, 2, { ...input, caption: "New wording" });
    expect(db.contentPost.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: post.id, orgId: ctx.orgId, version: 2 }, data: expect.objectContaining({ status: "DRAFT", approvedBy: null, approvedAt: null, version: { increment: 1 } }) }));
  });
});
