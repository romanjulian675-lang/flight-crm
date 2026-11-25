import Link from "next/link";
import { Badge, Card, Empty, PageHeader, StageChip } from "@/components/ui";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { requirePageAccess } from "@/lib/session";
import { leadScope } from "@/modules/access";
import { pathwayReadiness } from "@/modules/pathways";

export const metadata = { title: "Global pathways" };

export default async function PathwaysPage() {
  const ctx = await requirePageAccess();
  const { t } = await getI18n();
  const leads = await prisma.lead.findMany({
    where: { ...leadScope(ctx), isInternational: true },
    orderBy: [{ firstContactAt: "asc" }, { createdAt: "desc" }],
    take: 80,
    select: { id: true, firstName: true, lastName: true, language: true, medical: true, funding: true, timeline: true, stage: { select: { name: true, color: true, kind: true } }, owner: { select: { user: { select: { name: true } } } } },
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t.pathways.title} subtitle={t.pathways.subtitle} />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
        <Badge tone="blue">{fmt(t.pathways.count, { n: leads.length })}</Badge>
        <span>{t.pathways.routeHint}</span>
      </div>
      {leads.length === 0 ? (
        <Empty>{t.pathways.empty}</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {leads.map((lead) => {
            const readiness = pathwayReadiness(lead);
            const name = `${lead.firstName} ${lead.lastName}`.trim();
            return (
              <Card key={lead.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/leads/${lead.id}`} className="font-semibold text-ink hover:text-accent hover:underline">{name}</Link>
                    <p className="mt-1 text-xs text-muted">{lead.owner?.user.name ?? t.common.unassigned}</p>
                  </div>
                  <StageChip name={lead.stage.name} color={lead.stage.color} />
                </div>
                <div className="mt-4 flex items-center justify-between text-xs">
                  <span className="text-muted">{t.pathways.readiness}</span>
                  <span className={`font-semibold ${readiness.score === 100 ? "text-emerald-700" : "text-amber-700"}`}>{readiness.score === 100 ? t.pathways.ready : `${readiness.score}%`}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${readiness.score === 100 ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${readiness.score}%` }} /></div>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-muted">{t.pathways.language}</dt><dd>{lead.language === "es" ? t.common.spanish : t.common.english}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted">{t.pathways.next}</dt><dd className="text-right font-medium">{t.pathways.actions[readiness.nextAction]}</dd></div>
                </dl>
                {readiness.missing.length > 0 && <p className="mt-4 text-xs text-muted">{t.pathways.missing}: {readiness.missing.map((key) => t.pathways.actions[key]).join(", ")}</p>}
                <Link href={`/leads/${lead.id}`} className="mt-4 inline-flex text-sm font-medium text-accent hover:underline">{t.pathways.openLead} →</Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
