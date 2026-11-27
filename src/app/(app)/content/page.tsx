import { zonedDateString } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n";
import { requirePageAccess } from "@/lib/session";
import { isManager } from "@/modules/access";
import { listContent } from "@/modules/content";
import { ContentBoard } from "./review-board";

export const metadata = { title: "Content review" };

export default async function ContentPage() {
  const ctx = await requirePageAccess();
  const { t, locale } = await getI18n();
  const posts = await listContent(prisma, ctx);
  return <ContentBoard posts={posts.map((p) => ({ ...p, plannedAt: p.plannedAt?.toISOString() ?? null, approvedAt: p.approvedAt?.toISOString() ?? null, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(), comments: p.comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })) }))} labels={t.content} canApprove={isManager(ctx)} timeZone={ctx.timeZone} locale={locale} today={zonedDateString(new Date(), ctx.timeZone)} />;
}
