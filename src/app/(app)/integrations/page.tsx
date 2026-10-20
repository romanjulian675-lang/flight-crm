import { AutoRefresh } from "@/components/auto-refresh";
import { redirect } from "next/navigation";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatDate, fullName } from "@/lib/format";
import { getI18n } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { requirePageAccess } from "@/lib/session";
import { canManageIntegrations, listIntegrations, recentEvents } from "@/modules/integrations";
import { listAssignable } from "@/modules/members";
import { metaConfig } from "@/modules/meta";
import Link from "next/link";
import { AddSource, AssignModePicker, IntegrationCard, MetaCard } from "./integration-cards";

export const metadata = { title: "Lead sources" };

export default async function IntegrationsPage({ searchParams }: PageProps<"/integrations">) {
  const ctx = await requirePageAccess();
  if (!canManageIntegrations(ctx)) redirect("/");
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const [integrations, events, members, org] = await Promise.all([
    listIntegrations(prisma, ctx),
    recentEvents(prisma, ctx),
    listAssignable(prisma, ctx),
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { assignMode: true } }),
  ]);
  const appUrl = process.env.APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3200";
  const isLocal = /localhost|127\.0\.0\.1/.test(appUrl);
  const meta = integrations.find((i) => i.kind === "META");
  const others = integrations.filter((i) => i.kind !== "META");
  const tones = { CREATED: "green", MERGED: "blue", DUPLICATE: "slate", REJECTED: "amber", ERROR: "red" } as const;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <AutoRefresh />
      <PageHeader title={t.integrations.title} subtitle={t.integrations.subtitle} />

      {sp.meta === "ok" && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{fmt(t.integrations.meta.result, { ok: String(sp.n ?? 0) })}</p>}
      {sp.meta === "failed" && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{t.errors.metaFailed}</p>}
      {sp.meta === "not_configured" && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t.errors.metaNotConfigured}</p>}
      {isLocal && <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">{t.integrations.publicNote}</p>}

      <Card title={t.integrations.assignTitle}>
        <AssignModePicker mode={org.assignMode} />
      </Card>

      <MetaCard
        configured={metaConfig().configured}
        pages={meta?.metaPages ?? []}
        integration={meta ? { id: meta.id, name: meta.name, active: meta.active, defaultSource: meta.defaultSource, defaultProgram: meta.defaultProgram, defaultOwnerId: meta.defaultOwnerId, count: meta._count.events, lastEventAt: meta.lastEventAt?.toISOString() ?? null } : null}
        members={members.map((m) => ({ id: m.id, name: m.user.name }))}
      />

      {others.map((i) => (
        <IntegrationCard
          key={i.id}
          appUrl={appUrl}
          members={members.map((m) => ({ id: m.id, name: m.user.name }))}
          integration={{
            id: i.id,
            kind: i.kind as "WEB_FORM" | "WEBHOOK" | "GOOGLE_ADS",
            name: i.name,
            token: i.token,
            active: i.active,
            defaultSource: i.defaultSource,
            defaultProgram: i.defaultProgram,
            defaultOwnerId: i.defaultOwnerId,
            googleKey: ((i.config ?? {}) as { googleKey?: string }).googleKey ?? null,
            count: i._count.events,
            lastEventAt: i.lastEventAt?.toISOString() ?? null,
          }}
        />
      ))}

      <AddSource />

      <Card title={t.integrations.log.title}>
        {events.length === 0 ? (
          <Empty>{t.integrations.log.empty}</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {events.map((e) => {
              const s = (e.summary ?? {}) as { name?: string; email?: string; phone?: string };
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <Badge tone={tones[e.status]}>{t.integrations.log[e.status]}</Badge>
                  {e.lead ? (
                    <Link href={`/leads/${e.lead.id}`} className="font-medium text-brand-500 hover:underline">
                      {fullName(e.lead)}
                    </Link>
                  ) : (
                    <span className="text-slate-700">{s.name || s.email || s.phone || "—"}</span>
                  )}
                  <span className="text-muted">{e.integration.name}</span>
                  {e.error && <span className="text-xs text-red-700">{e.error}</span>}
                  <time className="ml-auto text-xs text-muted">{formatDate(e.createdAt, locale, ctx.timeZone, true)}</time>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
