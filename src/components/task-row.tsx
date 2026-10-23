"use client";

import { useOptimistic, useTransition } from "react";
import { Check } from "lucide-react";
import { completeTaskAction, reopenTaskAction } from "@/app/actions/tasks";
import { useI18n } from "@/components/i18n-provider";

/**
 * Checkbox-style button that completes (or reopens) a task. The tick responds at once (optimistic),
 * drawing in with a short scale so the press feels heard; the server catches up behind it.
 */
export function TaskToggle({ taskId, done }: { taskId: string; done: boolean }) {
  const { t } = useI18n();
  const [, start] = useTransition();
  const [shown, setShown] = useOptimistic(done);
  return (
    <button
      type="button"
      aria-pressed={shown}
      aria-label={shown ? t.task.reopen : t.task.done}
      title={shown ? t.task.reopen : t.task.done}
      onClick={() =>
        start(async () => {
          setShown(!shown);
          await (shown ? reopenTaskAction(taskId) : completeTaskAction(taskId));
        })
      }
      className={`group pressable flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border ${
        shown ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-emerald-600 hover:border-emerald-500"
      }`}
    >
      <Check
        size={13}
        strokeWidth={3}
        className={shown ? "opacity-100" : "opacity-0 group-hover:opacity-40"}
      />
    </button>
  );
}
