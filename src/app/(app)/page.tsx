import { AutoRefresh } from "@/components/auto-refresh";
import Link from "next/link";
import { AlertCircle, CalendarClock, GraduationCap, Inbox, Users } from "lucide-react";
import { Avatar, Card, Empty, PageHeader, stageStyle } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatPhone, fullName, shortAge } from "@/lib/format";
import { getI18n } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { requirePageAccess } from "@/lib/session";
import { getDashboard, UNCONTACTED_HOURS } from "@/modules/dashboard";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await requirePageAccess();
  const { t } = await getI18n();
  const d = await getDashboard(prisma, ctx);
  const maxFunnel = Math.max(1, ...d.funnel.map((s) => s.count));
  const maxSource = Math.max(1, ...d.bySource.map((s) => s.count));
  const total = d.funnel.reduce((a, s) => a + s.count, 0);

  const stats = [
    { label: t.dashboard.openLeads, value: d.openLeads, icon: Users, href: "/pipeline", tone: "text-brand-500 bg-brand-500/10" },
    { label: t.dashboard.newThisWeek, value: d.newThisWeek, icon: Inbox, href: "/leads", tone: "text-sky-600 bg-sky-100" },
    { label: t.dashboard.wonThisMonth, value: d.wonThisMonth, icon: GraduationCap, href: "/pipeline", tone: "text-emerald-600 bg-emerald-100" },
    { label: t.dashboard.myToday, value: d.dueToday, icon: CalendarClock, href: "/tasks", tone: "text-violet-600 bg-violet-100" },
    { label: t.dashboard.myOverdue, value: d.overdue, icon: AlertCircle, href: "/tasks", tone: d.overdue ? "text-red-600 bg-red-100" : "text-slate-500 bg-slate-100" },
  ];

  return (
    <>
      <AutoRefresh />
      <PageHeader title={fmt(t.dashboard.hello, { name: ctx.name.split(" ")[0] })} subtitle={ctx.orgName} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stats.map(({ label, value, icon: Icon, href, tone }) => (
          <Link key={label} href={href} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow">
            <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}>
              <Icon size={16} />
            </span>
            <div className="mt-3 text-2xl font-bold tabular-nums">{value}</div>
            <div className="text-xs text-muted">{label}</div>
          </Link>
        ))}
      </div>

      {total === 0 ? (
        <div className="mt-6">
          <Empty>{t.dashboard.noData}</Empty>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card title={fmt(t.dashboard.uncontacted, { h: UNCONTACTED_HOURS })} className="lg:col-span-2">
            {d.uncontacted.length === 0 ? (
              <p className="text-sm text-emerald-700">{t.dashboard.uncontactedEmpty}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {d.uncontacted.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <Link href={`/leads/${l.id}`} className="font-medium text-slate-900 hover:text-brand-500 hover:underline">
                      {fullName(l)}
                    </Link>
                    <span className="text-muted">{formatPhone(l.phone)}</span>
                    <span className="text-muted">{t.source[l.source]}</span>
                    <span className="ml-auto flex items-center gap-2">
                      {l.owner && <Avatar name={l.owner.user.name} />}
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">{fmt(t.dashboard.waiting, { t: shortAge(l.createdAt) })}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t.dashboard.funnel}>
            <ul className="space-y-2.5">
              {d.funnel.map((s) => (
                <li key={s.id} className="text-sm">
                  <div className="mb-1 flex justify-between">
                    <span>{s.name}</span>
                    <span className="font-medium tabular-nums">{s.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className={`h-2 rounded-full ${stageStyle(s.color).bar}`} style={{ width: `${(s.count / maxFunnel) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card title={t.dashboard.bySource}>
            {d.bySource.length === 0 ? (
              <Empty>—</Empty>
            ) : (
              <ul className="space-y-2.5">
                {d.bySource.map((s) => (
                  <li key={s.source} className="text-sm">
                    <div className="mb-1 flex justify-between">
                      <span>{t.source[s.source]}</span>
                      <span className="font-medium tabular-nums">{s.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(s.count / maxSource) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
