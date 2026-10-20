"use client";

import { useState } from "react";
import { Calendar, Mail, MessageSquare, Phone, StickyNote } from "lucide-react";
import { logActivityAction } from "@/app/actions/leads";
import { ActionMessage, PendingButton, useActionForm } from "@/components/forms";
import { useI18n } from "@/components/i18n-provider";
import { CALL_OUTCOME_VALUES } from "@/lib/enums";

const TYPES = [
  { type: "CALL", icon: Phone },
  { type: "NOTE", icon: StickyNote },
  { type: "SMS", icon: MessageSquare },
  { type: "EMAIL", icon: Mail },
  { type: "MEETING", icon: Calendar },
] as const;

export function ActivityComposer({ leadId }: { leadId: string }) {
  const { t } = useI18n();
  const [type, setType] = useState<(typeof TYPES)[number]["type"]>("CALL");
  const { state, pending, formRef, onSubmit } = useActionForm(logActivityAction.bind(null, leadId), { resetOnSuccess: true });

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div role="tablist" aria-label={t.log.title} className="flex gap-1 overflow-x-auto border-b border-slate-100 px-2 pt-2">
        {TYPES.map(({ type: ty, icon: Icon }) => (
          <button
            key={ty}
            role="tab"
            type="button"
            aria-selected={type === ty}
            onClick={() => setType(ty)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${type === ty ? "border-brand-500 text-brand-500" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            <Icon size={15} /> {t.log[ty]}
          </button>
        ))}
      </div>
      <form ref={formRef} onSubmit={onSubmit} className="space-y-3 p-4">
        <input type="hidden" name="type" value={type} />
        {type !== "NOTE" && (
          <div className="flex flex-wrap gap-4">
            {type === "CALL" && (
              <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <legend className="sr-only">{t.log.outcome}</legend>
                {CALL_OUTCOME_VALUES.map((o) => (
                  <label key={o} className="flex items-center gap-1.5 text-sm">
                    <input type="radio" name="outcome" value={o} defaultChecked={o === "CONNECTED"} />
                    {t.outcome[o]}
                  </label>
                ))}
              </fieldset>
            )}
            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only">{t.log.direction}</span>
              <select name="direction" defaultValue="OUT" className="w-auto py-1">
                <option value="OUT">{t.activity.out}</option>
                <option value="IN">{t.activity.in}</option>
              </select>
            </label>
          </div>
        )}
        <label className="block">
          <span className="sr-only">{t.log.body}</span>
          <textarea name="body" rows={3} placeholder={t.log.bodyPlaceholder} required={type === "NOTE"} />
        </label>
        <div className="flex items-center justify-end gap-3">
          <ActionMessage state={state} />
          <PendingButton pending={pending} pendingText={t.common.working}>
            {t.log.submit}
          </PendingButton>
        </div>
      </form>
    </section>
  );
}
