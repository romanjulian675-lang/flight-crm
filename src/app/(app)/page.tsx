import { AutoRefresh } from "@/components/auto-refresh";
import Link from "next/link";
import { Phone } from "lucide-react";
import { Avatar, Card, Empty, PageHeader, StatStrip, buttonClass, stageStyle } from "@/components/ui";
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

  // Ordered by what needs action first; colour only on figures that ask for it.
  const stats = [
    { label: t.dashboard.myOverdue, value: d.overdue, href: "/tasks", tone: "bad" as const },
    { label: t.dashboard.myToday, value: d.dueToday, href: "/tasks" },
    { label: t.dashboard.noNextStep, value: d.noNextStep, href: "/pipeline?noNext=1", tone: "warn" as const },
    { label: t.dashboard.openLeads, value: d.openLeads, href: "/pipeline" },
    { label: t.dashboard.newThisWeek, value: d.newThisWeek, href: "/leads" },
    { label: t.dashboard.wonThisMonth, value: d.wonThisMonth, href: "/pipeline" },
  ];
  const waitingCount = d.uncontacted.length >= 10 ? "10+" : String(d.uncontacted.length);
  const finding = d.uncontacted.length ? fmt(t.dashboard.finding, { n: waitingCount, h: UNCONTACTED_HOURS }) : total ? t.dashboard.uncontactedEmpty : ctx.orgName;

  return (
    <>
      <AutoRefresh />
      <PageHeader
        title={t.dashboard.title}
        subtitle={<span className={d.uncontacted.length ? "font-medium text-red-700" : undefined}>{finding}</span>}
        actions={
          <Link href="/reports" className={buttonClass("secondary")}>
            {t.reports.open}
          </Link>
        }
      />

      <StatStrip items={stats} />

      {total === 0 ? (
        <div className="mt-4">
          <Empty>{t.dashboard.noData}</Empty>
        </div>
      ) : (
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
          <Card title={fmt(t.dashboard.uncontacted, { h: UNCONTACTED_HOURS })} className="lg:col-span-2">
            {d.uncontacted.length === 0 ? (
              <p className="text-sm text-emerald-700">{t.dashboard.uncontactedEmpty}</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.uncontacted.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <Link href={`/leads/${l.id}`} className="font-medium text-ink hover:text-accent hover:underline">
                      {fullName(l)}
                    </Link>
                    <span className="font-mono text-[13px] text-slate-500">{formatPhone(l.phone)}</span>
                    <span className="text-muted">{t.source[l.source]}</span>
                    <span className="ml-auto flex items-center gap-2">
                      {l.owner && <Avatar name={l.owner.user.name} />}
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">{fmt(t.dashboard.waiting, { t: shortAge(l.createdAt) })}</span>
                      {/* The job this list exists for, one click away. */}
                      {l.phone && (
                        <a href={`tel:+${l.phone}`} className={buttonClass("secondary", "sm")}>
                          <Phone size={13} /> {t.lead.call}
                        </a>
                      )}
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
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${stageStyle(s.color).dot}`} />
                      {s.name}
                    </span>
                    <span className="font-medium tabular-nums">{s.count}</span>
                  </div>
                  <div className="h-1.5 rounded-sm bg-slate-100">
                    <div className="h-1.5 rounded-sm bg-accent" style={{ width: `${(s.count / maxFunnel) * 100}%` }} />
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
                    <div className="h-1.5 rounded-sm bg-slate-100">
                      <div className="h-1.5 rounded-sm bg-slate-400" style={{ width: `${(s.count / maxSource) * 100}%` }} />
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
