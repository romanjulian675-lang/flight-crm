"use client";

import { useState } from "react";
import { createTaskAction } from "@/app/actions/tasks";
import { ActionMessage, PendingButton, useActionForm } from "@/components/forms";
import { useI18n } from "@/components/i18n-provider";
import { TaskToggle } from "@/components/task-row";
import { Card } from "@/components/ui";
import { QuickDateFields } from "@/components/quick-date";
import { formatDate } from "@/lib/format";

type Task = { id: string; title: string; dueAt: string; completedAt: string | null; assignee: string | null };

export function TaskPanel({ leadId, tasks, myId, canAssign, members }: { leadId: string; tasks: Task[]; myId: string; canAssign: boolean; members: { id: string; name: string }[] }) {
  const { t, locale, timeZone } = useI18n();
  const { state, pending, formRef, onSubmit } = useActionForm(createTaskAction.bind(null, leadId), { resetOnSuccess: true });
  const [now] = useState(() => Date.now());
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

      <form ref={formRef} onSubmit={onSubmit} className="space-y-2 border-t border-line pt-3">
        <label className="flex flex-col gap-1">
          <span>{t.task.title}</span>
          <input name="title" required placeholder={t.task.titlePlaceholder} />
        </label>
        <QuickDateFields formKey={state?.ok ? state.at : 0} />
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
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
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
