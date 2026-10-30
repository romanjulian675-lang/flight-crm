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
import { AssignmentRules } from "./assignment-rules";
import { WhatsAppCard } from "./whatsapp-card";
import { getAccount } from "@/modules/whatsapp";
import { MetaDeliveries } from "./meta-deliveries";
import { recentMetaJobs } from "@/modules/meta-jobs";
import { listRules } from "@/modules/assignment";
import { readQuestionnaireConfig } from "@/lib/questionnaire";
import { QuestionnaireSettings } from "./questionnaire-settings";

export const metadata = { title: "Lead sources" };

export default async function IntegrationsPage({ searchParams }: PageProps<"/integrations">) {
  const ctx = await requirePageAccess();
  if (!canManageIntegrations(ctx)) redirect("/");
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const [integrations, events, members, org, rules, people, deliveries] = await Promise.all([
    listIntegrations(prisma, ctx),
    recentEvents(prisma, ctx),
    listAssignable(prisma, ctx),
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { assignMode: true } }),
    listRules(prisma, ctx),
    prisma.membership.findMany({ where: { orgId: ctx.orgId, active: true }, orderBy: { createdAt: "asc" }, select: { id: true, acceptsLeads: true, user: { select: { name: true } } } }),
    recentMetaJobs(prisma, ctx),
  ]);
  const appUrl = process.env.APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3200";
  const isLocal = /localhost|127\.0\.0\.1/.test(appUrl);
  const meta = integrations.find((i) => i.kind === "META");
  const others = integrations.filter((i) => i.kind !== "META" && i.kind !== "WHATSAPP");
  const wa = await getAccount(prisma, ctx.orgId);
  const tones = { CREATED: "green", MERGED: "blue", DUPLICATE: "slate", REJECTED: "amber", ERROR: "red" } as const;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <AutoRefresh />
      <PageHeader title={t.integrations.title} subtitle={t.integrations.subtitle} />

      {sp.meta === "ok" && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{fmt(t.integrations.meta.result, { ok: String(sp.n ?? 0) })}</p>}
      {sp.meta === "failed" && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{t.errors.metaFailed}</p>}
      {sp.meta === "not_configured" && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t.errors.metaNotConfigured}</p>}
      {isLocal && <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">{t.integrations.publicNote}</p>}

      <Card title={t.assignment.title}>
        <AssignmentRules
          rules={rules.map((r) => ({ id: r.id, name: r.name, active: r.active, language: r.language, program: r.program, source: r.source, memberIds: r.memberIds }))}
          members={people.map((p) => ({ id: p.id, name: p.user.name, acceptsLeads: p.acceptsLeads }))}
          fallback={<AssignModePicker mode={org.assignMode} />}
        />
      </Card>

      <MetaCard
        configured={metaConfig().configured}
        pages={meta?.metaPages ?? []}
        integration={meta ? { id: meta.id, name: meta.name, active: meta.active, defaultSource: meta.defaultSource, defaultProgram: meta.defaultProgram, defaultOwnerId: meta.defaultOwnerId, count: meta._count.events, lastEventAt: meta.lastEventAt?.toISOString() ?? null } : null}
        members={members.map((m) => ({ id: m.id, name: m.user.name }))}
      />

      <Card title={locale === "es" ? "Mensajes de Facebook e Instagram" : "Facebook & Instagram messages"}>
        <p className="text-sm text-muted">{locale === "es" ? "Recibe mensajes nuevos como prospectos y responde desde el CRM dentro de 24 horas. Meta debe aprobar los permisos para mensajes de clientes. No importa conversaciones antiguas." : "Receive new messages as leads and reply from the CRM within 24 hours. Meta must approve messaging permissions for customer conversations. Existing conversation history is not imported."}</p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          {metaConfig().configured && <Link className="text-blue-700 underline" href="/api/integrations/meta/connect?messages=1">{locale === "es" ? "Conectar / actualizar permisos de mensajes" : "Connect / refresh messaging permissions"}</Link>}
          <Link className="text-blue-700 underline" href="/messages">{locale === "es" ? "Abrir conversaciones" : "Open conversations"}</Link>
        </div>
        <ul className="mt-3 space-y-2 text-sm">{meta?.metaPages.map(p => <li key={p.id}>{p.pageName} · Messenger: {p.messengerEnabled ? (locale === "es" ? "Conectado" : "Connected") : (locale === "es" ? "Sin conectar" : "Not connected")} · Instagram: {p.instagramEnabled ? (locale === "es" ? "Conectado" : "Connected") : (locale === "es" ? "Sin conectar" : "Not connected")}</li>)}</ul>
      </Card>

      <WhatsAppCard
        account={
          wa
            ? {
                connected: wa.integration.active && !!wa.accessTokenEnc,
                displayPhone: wa.displayPhone,
                verifiedName: wa.verifiedName,
                phoneNumberId: wa.phoneNumberId,
                wabaId: wa.wabaId,
                webhookUrl: `${appUrl}/api/webhooks/whatsapp/${wa.integration.token}`,
                verifyToken: wa.verifyToken,
                autoReply: wa.autoReply ?? "",
                lastError: wa.lastError,
              }
            : null
        }
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

      {others.filter(i => i.kind === "WEB_FORM").map(i => <QuestionnaireSettings key={`questionnaire-${i.id}`} id={i.id} token={i.token} appUrl={appUrl} config={readQuestionnaireConfig(i.config)} />)}

      <Card title="Questionnaire booking emails">
        <p className="mb-3 text-xs text-muted">Provider acceptance is not proof of inbox delivery. Check the email provider for delivery events.</p>
        <ul className="space-y-2 text-sm">{(await prisma.prospectEmail.findMany({ where: { orgId: ctx.orgId }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, leadId: true, recipient: true, status: true, lastError: true } })).map(e => <li key={e.id}><Link className="underline" href={`/leads/${e.leadId}`}>{e.recipient}</Link> · {e.status}{e.lastError ? ` · ${e.lastError}` : ""}</li>)}</ul>
      </Card>

      <Card title={t.integrations.delivery.title}>
        <MetaDeliveries jobs={deliveries.map((job) => ({ id: job.id, status: job.status, attempts: job.attempts, lastError: job.lastError, availableLabel: formatDate(job.availableAt, locale, ctx.timeZone, true), createdLabel: formatDate(job.createdAt, locale, ctx.timeZone, true) }))} />
      </Card>

      <Card title={t.integrations.log.title}>
        {events.length === 0 ? (
          <Empty>{t.integrations.log.empty}</Empty>
        ) : (
          <ul className="divide-y divide-line">
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
