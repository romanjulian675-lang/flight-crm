import { z } from "zod";
import type { Db } from "@/lib/db";
import { conflict, invalid, notFound } from "@/lib/errors";
import { zonedDateString, zonedTimeString, zonedToUtc } from "@/lib/dates";
import { ensure, isManager, type AccessContext } from "@/modules/access";

export const contentStatuses = ["DRAFT", "IN_REVIEW", "NEEDS_CHANGES", "APPROVED"] as const;
export type ReviewStatus = typeof contentStatuses[number];

// Media is rendered by the browser, never fetched by the server. Disallow executable URLs.
const mediaUrl = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}, "contentMediaInvalid");
export const contentInput = z.object({
  title: z.string().trim().min(1, "contentTitleRequired").max(160, "contentTitleRequired"),
  caption: z.string().trim().max(2200, "contentCaptionLong"),
  videoUrl: mediaUrl,
  coverUrl: mediaUrl,
  date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "dateInvalid"),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "dateInvalid").default("16:00"),
});

function plannedDate(data: z.infer<typeof contentInput>, ctx: AccessContext) {
  if (!data.date) return null;
  const at = zonedToUtc(data.date, data.time, ctx.timeZone);
  if (zonedDateString(at, ctx.timeZone) !== data.date || zonedTimeString(at, ctx.timeZone) !== data.time) throw invalid("dateInvalid");
  return at;
}

export async function listContent(db: Db, ctx: AccessContext) {
  return db.contentPost.findMany({ where: { orgId: ctx.orgId }, orderBy: [{ plannedAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], include: { comments: { orderBy: { createdAt: "asc" } } } });
}

export async function createContent(db: Db, ctx: AccessContext, input: z.input<typeof contentInput>) {
  const data = contentInput.parse(input);
  return db.contentPost.create({ data: { orgId: ctx.orgId, title: data.title, caption: data.caption, videoUrl: data.videoUrl || null, coverUrl: data.coverUrl || null, plannedAt: plannedDate(data, ctx) } });
}

async function scopedPost(db: Db, ctx: AccessContext, id: string, version: number) {
  const post = await db.contentPost.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!post) throw notFound();
  if (post.version !== version) throw conflict("contentStale");
  return post;
}

export async function updateContent(db: Db, ctx: AccessContext, id: string, version: number, input: z.input<typeof contentInput>) {
  const data = contentInput.parse(input);
  const post = await scopedPost(db, ctx, id, version);
  const plannedAt = plannedDate(data, ctx);
  const changed = data.title !== post.title || data.caption !== post.caption || (data.videoUrl || null) !== post.videoUrl || (data.coverUrl || null) !== post.coverUrl || plannedAt?.getTime() !== post.plannedAt?.getTime();
  if (!changed) return;
  // Approval belongs to the exact version reviewed, including its planned date.
  const result = await db.contentPost.updateMany({ where: { id, orgId: ctx.orgId, version }, data: {
    title: data.title, caption: data.caption, videoUrl: data.videoUrl || null, coverUrl: data.coverUrl || null, plannedAt,
    status: "DRAFT", approvedBy: null, approvedAt: null, version: { increment: 1 },
  } });
  if (!result.count) throw conflict("contentStale");
}

export async function reviewContent(db: Db, ctx: AccessContext, id: string, version: number, status: ReviewStatus, feedback = "") {
  if (!contentStatuses.includes(status)) throw invalid("contentStatusInvalid");
  if (status === "APPROVED" || status === "NEEDS_CHANGES") ensure(isManager(ctx));
  const post = await scopedPost(db, ctx, id, version);
  const allowed = status === "DRAFT" || (status === "IN_REVIEW" && ["DRAFT", "NEEDS_CHANGES"].includes(post.status)) || (["APPROVED", "NEEDS_CHANGES"].includes(status) && post.status === "IN_REVIEW");
  if (!allowed) throw invalid("contentTransitionInvalid");
  if ((status === "IN_REVIEW" || status === "APPROVED") && (!post.videoUrl || !post.caption)) throw invalid("contentNotReady");
  if (status === "NEEDS_CHANGES" && !feedback.trim()) throw invalid("contentFeedbackRequired");
  if (feedback.length > 2000) throw invalid("contentFeedbackLong");
  await db.$transaction(async (tx) => {
    const result = await tx.contentPost.updateMany({ where: { id, orgId: ctx.orgId, version }, data: {
      status, approvedBy: status === "APPROVED" ? ctx.name : null, approvedAt: status === "APPROVED" ? new Date() : null, version: { increment: 1 },
    } });
    if (!result.count) throw conflict("contentStale");
    if (feedback.trim()) await tx.contentComment.create({ data: { postId: id, orgId: ctx.orgId, author: ctx.name, body: feedback.trim() } });
  });
}

export async function commentContent(db: Db, ctx: AccessContext, id: string, body: string) {
  const post = await db.contentPost.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!post) throw notFound();
  const text = z.string().trim().min(1, "contentFeedbackRequired").max(2000, "contentFeedbackLong").parse(body);
  return db.contentComment.create({ data: { postId: id, orgId: ctx.orgId, author: ctx.name, body: text } });
}
