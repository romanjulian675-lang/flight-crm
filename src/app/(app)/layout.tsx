import { I18nProvider } from "@/components/i18n-provider";
import { AppShell } from "@/components/app-shell";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n";
import { requirePageAccess } from "@/lib/session";
import { listAssignable } from "@/modules/members";
import { permissions } from "@/modules/access";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requirePageAccess();
  const { t, locale } = await getI18n();
  const members = permissions.assignLeads(ctx) ? await listAssignable(prisma, ctx) : [];
  return (
    <I18nProvider value={{ t, locale, timeZone: ctx.timeZone }}>
      <AppShell
        me={{ name: ctx.name, email: ctx.email, role: ctx.role, membershipId: ctx.membershipId }}
        org={{ id: ctx.orgId, name: ctx.orgName }}
        orgs={ctx.orgs}
        canAssign={permissions.assignLeads(ctx)}
        canManage={permissions.manageMembers(ctx)}
        members={members.map((m) => ({ id: m.id, name: m.user.name }))}
      >
        {children}
      </AppShell>
    </I18nProvider>
  );
}
