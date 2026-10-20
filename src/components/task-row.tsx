"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
import { completeTaskAction, reopenTaskAction } from "@/app/actions/tasks";
import { useI18n } from "@/components/i18n-provider";

/** Checkbox-style button that completes (or reopens) a task. */
export function TaskToggle({ taskId, done }: { taskId: string; done: boolean }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={done ? t.task.reopen : t.task.done}
      title={done ? t.task.reopen : t.task.done}
      onClick={() => start(async () => void (done ? await reopenTaskAction(taskId) : await completeTaskAction(taskId)))}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition ${
        done ? "border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600" : "border-slate-300 bg-white text-transparent hover:border-emerald-500 hover:text-emerald-500"
      } ${pending ? "animate-pulse" : ""}`}
    >
      <Check size={14} />
    </button>
  );
}
