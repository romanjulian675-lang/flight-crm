import { Card, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getI18n } from "@/lib/i18n";
import { requirePageAccess } from "@/lib/session";
import { permissions } from "@/modules/access";
import { listMembers, listPendingInvites } from "@/modules/members";
import { listStages } from "@/modules/orgs";
import { InviteForm, MemberRow, OrgForm, PendingInviteRow, StageEditor } from "./settings-forms";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requirePageAccess();
  const { t, locale } = await getI18n();
  const canOrg = permissions.manageOrg(ctx);
  const canTeam = permissions.manageMembers(ctx);
  const [org, members, invites, stages] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.orgId } }),
    listMembers(prisma, ctx),
    canTeam ? listPendingInvites(prisma, ctx) : Promise.resolve([]),
    listStages(prisma, ctx),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title={t.settings.title} />

      {canOrg && (
        <Card title={t.settings.school}>
          <OrgForm org={{ name: org.name, timeZone: org.timeZone, agentsSeeAll: org.agentsSeeAll }} />
        </Card>
      )}

      <Card title={t.settings.team}>
        <p className="mb-3 text-xs text-muted">{t.settings.roleHelp}</p>
        <ul className="divide-y divide-slate-100">
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={{ id: m.id, name: m.user.name, email: m.user.email, role: m.role, active: m.active }}
              isMe={m.id === ctx.membershipId}
              canEdit={canTeam && m.id !== ctx.membershipId && (ctx.role === "OWNER" || m.role === "AGENT")}
              grantable={ctx.role === "OWNER" ? ["OWNER", "MANAGER", "AGENT"] : ["AGENT"]}
            />
          ))}
        </ul>
        {canTeam && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="mb-2 text-sm font-semibold">{t.settings.invite}</h3>
            <InviteForm roles={ctx.role === "OWNER" ? ["AGENT", "MANAGER", "OWNER"] : ["AGENT"]} />
            {invites.length > 0 && (
              <>
                <h3 className="mt-5 mb-2 text-sm font-semibold">{t.settings.pendingInvites}</h3>
                <ul className="divide-y divide-slate-100">
                  {invites.map((i) => (
                    <PendingInviteRow key={i.id} invite={{ id: i.id, email: i.email, role: i.role, expires: formatDate(i.expiresAt, locale, ctx.timeZone) }} />
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </Card>

      <Card title={t.settings.pipeline}>
        {canOrg && <p className="mb-3 text-xs text-muted">{t.settings.pipelineHelp}</p>}
        <StageEditor stages={stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, color: s.color }))} canEdit={canOrg} />
      </Card>
    </div>
  );
}
