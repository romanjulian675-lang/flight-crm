"use client";

import { useState } from "react";
import { createTaskAction } from "@/app/actions/tasks";
import { ActionMessage, PendingButton, useActionForm } from "@/components/forms";
import { useI18n } from "@/components/i18n-provider";
import { TaskToggle } from "@/components/task-row";
import { Card } from "@/components/ui";
import { zonedDateString } from "@/lib/dates";
import { formatDate } from "@/lib/format";

type Task = { id: string; title: string; dueAt: string; completedAt: string | null; assignee: string | null };

export function TaskPanel({ leadId, tasks, myId, canAssign, members }: { leadId: string; tasks: Task[]; myId: string; canAssign: boolean; members: { id: string; name: string }[] }) {
  const { t, locale, timeZone } = useI18n();
  const { state, pending, formRef, onSubmit } = useActionForm(createTaskAction.bind(null, leadId), { resetOnSuccess: true });
  // Quick-pick dates are fixed when the panel mounts (in the school's time zone).
  const [{ now, quick }] = useState(() => {
    const at = Date.now();
    const day = (n: number) => zonedDateString(new Date(at + n * 86_400_000), timeZone);
    return { now: at, quick: { 1: day(1), 3: day(3), 7: day(7) } as Record<number, string> };
  });
  const [date, setDate] = useState(quick[1]);
  const open = tasks.filter((x) => !x.completedAt);
  const done = tasks.filter((x) => x.completedAt).slice(0, 5);

  return (
    <Card title={t.lead.tasks_title}>
      {open.length === 0 ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t.lead.noTasks}</p>
      ) : (
        <ul className="mb-3 space-y-2">
          {open.map((x) => {
            const overdue = new Date(x.dueAt).getTime() < now;
            return (
              <li key={x.id} className="flex items-start gap-2.5 text-sm">
                <TaskToggle taskId={x.id} done={false} />
                <div className="min-w-0">
                  <div className="font-medium">{x.title}</div>
                  <div className={`text-xs ${overdue ? "font-medium text-red-600" : "text-muted"}`}>
                    {formatDate(x.dueAt, locale, timeZone, true)}
                    {x.assignee && <> · {x.assignee}</>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form ref={formRef} onSubmit={onSubmit} onReset={() => setDate(quick[1])} className="space-y-2 border-t border-slate-100 pt-3">
        <label className="flex flex-col gap-1">
          <span>{t.task.title}</span>
          <input name="title" required placeholder={t.task.titlePlaceholder} />
        </label>
        <div className="flex flex-wrap gap-1">
          {[
            [1, t.task.quick.tomorrow],
            [3, t.task.quick.in3],
            [7, t.task.quick.nextWeek],
          ].map(([n, label]) => (
            <button key={label} type="button" onClick={() => setDate(quick[n as number])} className={`rounded-full border px-2.5 py-0.5 text-xs ${date === quick[n as number] ? "border-brand-500 bg-brand-500/10 text-brand-500" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span>{t.task.date}</span>
            <input name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            <span>{t.task.time}</span>
            <input name="time" type="time" defaultValue="09:00" />
          </label>
        </div>
        {canAssign && (
          <label className="flex flex-col gap-1">
            <span>{t.task.assignee}</span>
            <select name="assigneeId" defaultValue={myId}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex items-center justify-end gap-3">
          <ActionMessage state={state} />
          <PendingButton pending={pending} size="sm" pendingText={t.common.working}>
            {t.task.add}
          </PendingButton>
        </div>
      </form>

      {done.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
          {done.map((x) => (
            <li key={x.id} className="flex items-center gap-2.5 text-sm text-muted">
              <TaskToggle taskId={x.id} done />
              <span className="line-through">{x.title}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
