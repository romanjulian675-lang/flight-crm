import Link from "next/link";
import { Badge, Card, Empty, PageHeader, StageChip } from "@/components/ui";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n";
import { requirePageAccess } from "@/lib/session";
import { leadScope } from "@/modules/access";
import { pathwayReadiness } from "@/modules/pathways";
import { PartnerForm, ProfileForm, ReferralForm, ReferralStatusForm } from "./pathway-forms";

export const metadata = { title: "Global pathways" };

export default async function PathwaysPage() {
  const ctx = await requirePageAccess();
  const { t } = await getI18n();
  const [leads, partners] = await Promise.all([
    prisma.lead.findMany({ where: { ...leadScope(ctx), isInternational: true }, orderBy: [{ firstContactAt: "asc" }, { createdAt: "desc" }], take: 80, select: { id: true, firstName: true, lastName: true, language: true, medical: true, funding: true, timeline: true, stage: { select: { name: true, color: true, kind: true } }, owner: { select: { user: { select: { name: true } } } }, pathwayProfile: true, pathwayReferrals: { orderBy: { createdAt: "desc" }, take: 5, include: { partner: { select: { name: true, country: true } } } } } }),
    prisma.pathwayPartner.findMany({ where: { orgId: ctx.orgId, active: true }, orderBy: [{ verified: "desc" }, { name: "asc" }], select: { id: true, name: true, country: true, type: true, verified: true } }),
  ]);
  const referralCount = leads.reduce((n, lead) => n + lead.pathwayReferrals.length, 0);
  return <div className="mx-auto max-w-7xl">
    <PageHeader title={t.pathways.title} subtitle={t.pathways.subtitle} />
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted"><Badge tone="blue">{leads.length} international leads</Badge><Badge tone="slate">{referralCount} {t.pathways.exchange.referrals.toLowerCase()}</Badge><span>{t.pathways.routeHint}</span></div>
    <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <Card title={t.pathways.exchange.partnerCatalog} action={<Badge tone="green">{partners.length}</Badge>}><div className="space-y-2">{partners.map((p) => <div key={p.id} className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2 text-sm"><span><span className="font-medium">{p.name}</span><span className="ml-2 text-xs text-muted">{p.country} · {t.pathways.exchange.types[p.type as keyof typeof t.pathways.exchange.types]}</span></span>{p.verified && <Badge tone="green">✓ {t.pathways.exchange.verified}</Badge>}</div>)}{partners.length === 0 && <Empty>{t.pathways.exchange.partnerCatalog}</Empty>}<PartnerForm /></div></Card>
      <Card title={t.pathways.exchange.title}><p className="mb-3 text-sm text-muted">{t.pathways.exchange.subtitle}</p><div className="grid gap-3 sm:grid-cols-3"><div><div className="text-2xl font-semibold">{leads.length}</div><div className="text-xs text-muted">International leads</div></div><div><div className="text-2xl font-semibold">{partners.filter((p) => p.verified).length}</div><div className="text-xs text-muted">{t.pathways.exchange.verified}</div></div><div><div className="text-2xl font-semibold">{referralCount}</div><div className="text-xs text-muted">{t.pathways.exchange.referrals}</div></div></div></Card>
    </div>
    {leads.length === 0 ? <Empty>{t.pathways.empty}</Empty> : <div className="grid gap-4 md:grid-cols-2">{leads.map((lead) => { const readiness = pathwayReadiness(lead); const name = `${lead.firstName} ${lead.lastName}`.trim(); return <Card key={lead.id} title={<div className="flex items-start justify-between gap-3"><div><Link href={`/leads/${lead.id}`} className="font-semibold text-ink hover:text-accent hover:underline">{name}</Link><p className="mt-1 text-xs text-muted">{lead.owner?.user.name ?? t.common.unassigned}</p></div><StageChip name={lead.stage.name} color={lead.stage.color} /></div>}>
      <div className="flex items-center justify-between text-xs"><span className="text-muted">{t.pathways.readiness}</span><span className="font-semibold text-amber-700">{readiness.score === 100 ? t.pathways.ready : `${readiness.score}%`}</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-400" style={{ width: `${readiness.score}%` }} /></div>
      <details className="mt-4 rounded border border-line p-3" open><summary className="cursor-pointer text-sm font-semibold">{t.pathways.exchange.profile}</summary><div className="mt-3"><ProfileForm leadId={lead.id} profile={lead.pathwayProfile ?? undefined} /></div></details>
      <div className="mt-4 rounded border border-line p-3"><div className="mb-3 text-sm font-semibold">{t.pathways.exchange.createReferral}</div>{partners.length ? <ReferralForm leadId={lead.id} partners={partners} /> : <p className="text-xs text-muted">{t.pathways.exchange.partnerCatalog}</p>}</div>
      <div className="mt-4"><div className="mb-2 text-sm font-semibold">{t.pathways.exchange.referrals}</div>{lead.pathwayReferrals.length ? <div className="space-y-2">{lead.pathwayReferrals.map((r) => <div key={r.id} className="rounded border border-line p-2"><div className="mb-2 flex justify-between gap-2 text-xs"><span className="font-medium">{r.partner.name} · {r.partner.country}</span><Badge tone={r.status === "CONVERTED" ? "green" : r.status === "DECLINED" ? "red" : "amber"}>{t.pathways.exchange.status[r.status]}</Badge></div><ReferralStatusForm id={r.id} status={r.status} outcome={r.outcome} /></div>)}</div> : <p className="text-xs text-muted">{t.pathways.exchange.noReferrals}</p>}</div>
    </Card>; })}</div>}
  </div>;
}
