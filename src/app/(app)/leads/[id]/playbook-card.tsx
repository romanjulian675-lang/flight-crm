"use client";

import { useOptimistic, useTransition } from "react";
import { BookOpen } from "lucide-react";
import { setChecklistItemAction } from "@/app/actions/leads";
import { useI18n } from "@/components/i18n-provider";
import { fmt } from "@/lib/i18n/format";

/** The stage's script and checklist, right where the agent is working. */
export function PlaybookCard({ leadId, stage, done }: { leadId: string; stage: { id: string; name: string; playbook: string | null; checklist: string[] }; done: string[] }) {
  const { t } = useI18n();
  const [checked, setChecked] = useOptimistic(done, (cur: string[], [item, on]: [string, boolean]) => (on ? [...cur, item] : cur.filter((x) => x !== item)));
  const [, start] = useTransition();
  const progress = stage.checklist.length ? `${stage.checklist.filter((i) => checked.includes(i)).length}/${stage.checklist.length}` : null;

  return (
    <section className="rounded-xl border border-sky-200 bg-sky-50/50">
      <header className="flex items-center gap-2 border-b border-sky-100 px-4 py-3">
        <BookOpen size={16} className="text-sky-700" />
        <h2 className="flex-1 text-sm font-semibold text-sky-950">{fmt(t.lead.playbookTitle, { stage: stage.name })}</h2>
        {progress && <span className="rounded-full bg-white px-2 text-xs font-medium text-sky-800 tabular-nums">{progress}</span>}
      </header>
      <div className="space-y-3 p-4">
        {!stage.playbook && !stage.checklist.length && <p className="text-sm text-muted">{t.lead.noPlaybook}</p>}
        {stage.checklist.length > 0 && (
          <ul className="space-y-1.5">
            {stage.checklist.map((item) => {
              const on = checked.includes(item);
              return (
                <li key={item}>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={on}
                      onChange={(e) => {
                        const next = e.target.checked;
                        start(async () => {
                          setChecked([item, next]);
                          await setChecklistItemAction(leadId, stage.id, item, next);
                        });
                      }}
                    />
                    <span className={on ? "text-slate-400 line-through" : "text-slate-800"}>{item}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {stage.playbook && (
          <details open={!stage.checklist.length} className="group">
            <summary className="cursor-pointer text-xs font-medium text-sky-800">{t.settings.editPlaybook}</summary>
            <div className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-slate-700">{stage.playbook}</div>
          </details>
        )}
      </div>
    </section>
  );
}
