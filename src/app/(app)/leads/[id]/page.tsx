import Link from "next/link";
import { ArrowLeft, Mail, MessageCircle, MessageSquare, Phone } from "lucide-react";
import { Badge, Card, Empty, StageChip } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatDate, formatPhone, fullName } from "@/lib/format";
import { getI18n, type Dict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { requirePageAccess } from "@/lib/session";
import { permissions } from "@/modules/access";
import { getLead } from "@/modules/leads";
import { listMembers } from "@/modules/members";
import { listStages } from "@/modules/orgs";
import { ActivityComposer } from "./activity-composer";
import { DeleteLeadButton, LeadControls } from "./lead-controls";
import { LeadDetailsForm } from "./lead-details-form";
import { PlaybookCard } from "./playbook-card";
import { TaskPanel } from "./task-panel";
import { WhatsAppChat } from "./whatsapp-chat";
import { getAccount, getConversation } from "@/modules/whatsapp";

export const metadata = { title: "Lead" };

export default async function LeadPage({ params }: PageProps<"/leads/[id]">) {
  const { id } = await params;
  const ctx = await requirePageAccess();
  const { t, locale } = await getI18n();
  const [lead, stages, members, org] = await Promise.all([
    getLead(prisma, ctx, id),
    listStages(prisma, ctx),
    listMembers(prisma, ctx),
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { requireNextStep: true } }),
  ]);
  const wa = await getAccount(prisma, ctx.orgId);
  const waLive = !!wa && wa.integration.active && !!wa.accessTokenEnc && !!lead.phone;
  const chat = waLive ? await getConversation(prisma, ctx, lead.id) : null;
  const nextRequired = org.requireNextStep && lead.stage.kind === "OPEN" && !lead.tasks.some((x) => !x.completedAt);
  const checklistDone = ((lead.checklist ?? {}) as Record<string, string[]>)[lead.stageId] ?? [];
  const memberName = new Map(members.map((m) => [m.id, m.user.name]));
  const activeMembers = members.filter((m) => m.active).map((m) => ({ id: m.id, name: m.user.name }));
  const name = fullName(lead);
  const tel = lead.phone ? `+${lead.phone}` : null;

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/pipeline" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-slate-900">
        <ArrowLeft size={14} /> {t.nav.pipeline}
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
            <StageChip name={lead.stage.name} color={lead.stage.color} />
            {lead.isInternational && <Badge tone="blue">TSA / visa</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted">
            {lead.phone && <span>{formatPhone(lead.phone)}</span>}
            {lead.email && <span>{lead.email}</span>}
            <span>
              {t.program[lead.program]} · {t.source[lead.source]}
              {lead.sourceDetail && lead.sourceDetail !== t.source[lead.source] && <> ({lead.sourceDetail})</>}
            </span>
          </div>
          {lead.lostReason && (
            <p className="mt-1 text-sm text-rose-700">
              {t.lead.lostReasonLabel}: {lead.lostReason}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {tel && (
            <>
              <ContactLink href={`tel:${tel}`} icon={<Phone size={15} />} label={t.lead.call} />
              <ContactLink href={`sms:${tel}`} icon={<MessageSquare size={15} />} label={t.lead.text} />
              {waLive ? (
                <ContactLink href="#whatsapp" icon={<MessageCircle size={15} />} label={t.lead.whatsapp} />
              ) : (
                <ContactLink href={`https://wa.me/${lead.phone}`} icon={<MessageCircle size={15} />} label={t.lead.whatsapp} external />
              )}
            </>
          )}
          {lead.email && <ContactLink href={`mailto:${lead.email}`} icon={<Mail size={15} />} label={t.lead.mail} />}
        </div>
      </div>

      <LeadControls
        leadId={lead.id}
        stageId={lead.stageId}
        stages={stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind }))}
        ownerId={lead.ownerId}
        ownerName={lead.owner?.user.name ?? null}
        members={activeMembers}
        canAssign={permissions.assignLeads(ctx)}
      />

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {chat && (
            <WhatsAppChat
              leadId={lead.id}
              firstName={lead.firstName}
              myName={ctx.name}
              lastInboundAt={chat.lastInboundAt?.toISOString() ?? null}
              hasUnread={chat.messages.some((m) => m.direction === "IN" && !m.readAt)}
              messages={chat.messages.map((m) => ({
                id: m.id,
                direction: m.direction,
                body: m.body,
                type: m.type,
                templateName: m.templateName,
                status: m.status,
                error: m.error,
                sender: m.sentBy?.user.name ?? null,
                createdAt: m.createdAt.toISOString(),
              }))}
            />
          )}
          <ActivityComposer leadId={lead.id} nextRequired={nextRequired} />
          <Card title={t.lead.timeline_title}>
            {lead.activities.length === 0 ? (
              <Empty>{t.lead.noActivity}</Empty>
            ) : (
              <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                {lead.activities.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute top-1 -left-[25px] h-2.5 w-2.5 rounded-full border-2 border-white bg-slate-300 ring-1 ring-slate-200" />
                    <div className="flex flex-wrap items-center gap-x-2 text-sm">
                      <span className="font-medium">{a.actor?.user.name ?? t.activity.system}</span>
                      <span className="text-slate-600">{describe(a.type, a.meta, t, memberName)}</span>
                      <MetaBadges meta={a.meta} t={t} type={a.type} />
                      <time className="ml-auto text-xs text-muted" dateTime={a.createdAt.toISOString()}>
                        {formatDate(a.createdAt, locale, ctx.timeZone, true)}
                      </time>
                    </div>
                    {a.body && <p className="mt-1 text-sm whitespace-pre-wrap text-slate-700">{a.body}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <PlaybookCard
            leadId={lead.id}
            stage={{ id: lead.stage.id, name: lead.stage.name, playbook: lead.stage.playbook, checklist: lead.stage.checklist }}
            done={checklistDone}
          />
          <TaskPanel
            leadId={lead.id}
            myId={ctx.membershipId}
            canAssign={permissions.assignLeads(ctx)}
            members={activeMembers}
            tasks={lead.tasks.map((x) => ({
              id: x.id,
              title: x.title,
              dueAt: x.dueAt.toISOString(),
              completedAt: x.completedAt?.toISOString() ?? null,
              assignee: x.assignee?.user.name ?? null,
            }))}
          />
          <Card title={t.lead.details}>
            <LeadDetailsForm
              leadId={lead.id}
              lead={{
                firstName: lead.firstName,
                lastName: lead.lastName,
                email: lead.email ?? "",
                phone: lead.phone ? formatPhone(lead.phone) : "",
                language: lead.language,
                source: lead.source,
                sourceDetail: lead.sourceDetail ?? "",
                program: lead.program,
                medical: lead.medical,
                funding: lead.funding,
                timeline: lead.timeline ?? "",
                isInternational: lead.isInternational,
              }}
            />
            <dl className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-xs text-muted">
              <div className="flex justify-between">
                <dt>{t.lead.created}</dt>
                <dd>{formatDate(lead.createdAt, locale, ctx.timeZone, true)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>{t.lead.lastContact}</dt>
                <dd>{lead.lastContactAt ? formatDate(lead.lastContactAt, locale, ctx.timeZone, true) : t.lead.never}</dd>
              </div>
              {(lead.utmSource || lead.utmCampaign) && (
                <div className="flex justify-between">
                  <dt>{t.lead.utm}</dt>
                  <dd>{[lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(" / ")}</dd>
                </div>
              )}
            </dl>
          </Card>
          {permissions.deleteLeads(ctx) && <DeleteLeadButton leadId={lead.id} />}
        </div>
      </div>
    </div>
  );
}

function ContactLink({ href, icon, label, external = false }: { href: string; icon: React.ReactNode; label: string; external?: boolean }) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
    >
      {icon}
      {label}
    </a>
  );
}

type Meta = Record<string, unknown> | null;

function describe(type: keyof Dict["activity"], rawMeta: unknown, t: Dict, members: Map<string, string>) {
  const meta = (rawMeta ?? {}) as Record<string, unknown>;
  switch (type) {
    case "STAGE_CHANGE":
      return fmt(t.activity.STAGE_CHANGE, { from: String(meta.from ?? ""), to: String(meta.to ?? "") });
    case "ASSIGNED":
      return fmt(t.activity.ASSIGNED, { to: meta.to ? (members.get(String(meta.to)) ?? "?") : t.common.unassigned });
    case "UPDATED": {
      const labels = t.lead as Record<string, string>;
      const fields = Array.isArray(meta.fields) ? meta.fields.map((f) => labels[String(f)] ?? String(f)) : [];
      return fmt(t.activity.UPDATED, { fields: fields.join(", ").toLowerCase() });
    }
    default:
      return t.activity[type];
  }
}

function MetaBadges({ meta: raw, t, type }: { meta: unknown; t: Dict; type: string }) {
  const meta = raw as Meta;
  if (!meta || !["CALL", "EMAIL", "SMS", "MEETING"].includes(type)) return null;
  const outcome = meta.outcome as keyof Dict["outcome"] | undefined;
  return (
    <>
      {meta.direction === "IN" && <Badge>{t.activity.in}</Badge>}
      {outcome && <Badge tone={outcome === "CONNECTED" ? "green" : "amber"}>{t.outcome[outcome]}</Badge>}
    </>
  );
}
