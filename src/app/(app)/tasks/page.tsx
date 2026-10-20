import { AutoRefresh } from "@/components/auto-refresh";
import Link from "next/link";
import { TaskToggle } from "@/components/task-row";
import { Card, Empty, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatDate, formatPhone, fullName } from "@/lib/format";
import { getI18n } from "@/lib/i18n";
import { requirePageAccess } from "@/lib/session";
import { myTasks } from "@/modules/tasks";

export const metadata = { title: "My tasks" };

export default async function TasksPage() {
  const ctx = await requirePageAccess();
  const { t, locale } = await getI18n();
  const tasks = await myTasks(prisma, ctx);
  const groups = [
    { key: "overdue", title: t.task.overdue, items: tasks.overdue, tone: "text-red-600" },
    { key: "today", title: t.task.today, items: tasks.today, tone: "text-slate-900" },
    { key: "upcoming", title: t.task.upcoming, items: tasks.upcoming, tone: "text-slate-900" },
  ];
  const total = tasks.overdue.length + tasks.today.length + tasks.upcoming.length;
  return (
    <div className="mx-auto max-w-3xl">
      <AutoRefresh />
      <PageHeader title={t.nav.tasks} />
      {total === 0 ? (
        <Empty>{t.task.empty}</Empty>
      ) : (
        <div className="space-y-4">
          {groups
            .filter((g) => g.items.length)
            .map((g) => (
              <Card key={g.key} title={<span className={g.tone}>{`${g.title} (${g.items.length})`}</span>}>
                <ul className="divide-y divide-slate-100">
                  {g.items.map((x) => (
                    <li key={x.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                      <TaskToggle taskId={x.id} done={false} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{x.title}</div>
                        <div className="text-xs text-muted">
                          <Link href={`/leads/${x.lead.id}`} className="font-medium text-brand-500 hover:underline">
                            {fullName(x.lead)}
                          </Link>
                          {x.lead.phone && <> · {formatPhone(x.lead.phone)}</>} · {x.lead.stage.name}
                        </div>
                      </div>
                      <time className={`shrink-0 text-xs ${g.key === "overdue" ? "font-medium text-red-600" : "text-muted"}`}>{formatDate(x.dueAt, locale, ctx.timeZone, true)}</time>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}
