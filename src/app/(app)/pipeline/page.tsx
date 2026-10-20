import { AutoRefresh } from "@/components/auto-refresh";
import { Suspense } from "react";
import { LeadFilters } from "@/components/lead-filters";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n";
import { requirePageAccess } from "@/lib/session";
import { permissions } from "@/modules/access";
import { getBoard, parseFilters } from "@/modules/leads";
import { listAssignable } from "@/modules/members";
import { Board } from "./board";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: PageProps<"/pipeline">) {
  const ctx = await requirePageAccess();
  const { t } = await getI18n();
  const filters = parseFilters(await searchParams);
  const [board, members] = await Promise.all([getBoard(prisma, ctx, filters), listAssignable(prisma, ctx)]);
  return (
    <>
      <AutoRefresh />
      <PageHeader title={t.pipeline.title} />
      <Suspense>
        <LeadFilters canSeeAll={permissions.seeAllLeads(ctx)} members={members.map((m) => ({ id: m.id, name: m.user.name }))} />
      </Suspense>
      <Board
        stages={board.map((s) => ({
          id: s.id,
          name: s.name,
          kind: s.kind,
          color: s.color,
          leads: s.leads.map((l) => ({
            id: l.id,
            name: `${l.firstName} ${l.lastName}`.trim(),
            phone: l.phone,
            program: l.program,
            source: l.source,
            owner: l.owner?.user.name ?? null,
            stageChangedAt: l.stageChangedAt.toISOString(),
            nextDue: l.tasks[0]?.dueAt.toISOString() ?? null,
          })),
        }))}
      />
    </>
  );
}
