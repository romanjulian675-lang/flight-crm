"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { createRuleAction, deleteRuleAction, moveRuleAction, updateRuleAction } from "@/app/actions/integrations";
import { ActionMessage, PendingButton, useActionForm } from "@/components/forms";
import { useI18n } from "@/components/i18n-provider";
import { ProgramOptions, SourceOptions } from "@/components/lead-options";
import { buttonClass } from "@/components/ui";

type Member = { id: string; name: string; acceptsLeads: boolean };
type Rule = { id: string; name: string; active: boolean; language: string | null; program: string | null; source: string | null; memberIds: string[] };
type Result = { ok: boolean; message: string; at: number } | null;

/** Ordered "if the lead … then rotate between …" rules, plus the fallback. */
export function AssignmentRules({ rules, members, fallback }: { rules: Rule[]; members: Member[]; fallback: React.ReactNode }) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{t.assignment.help}</p>
      {rules.length === 0 && !adding && <p className="rounded-lg border border-dashed border-line px-3 py-3 text-sm text-muted">{t.assignment.empty}</p>}
      <ol className="space-y-2">
        {rules.map((r, i) => (
          <RuleRow key={JSON.stringify(r)} rule={r} members={members} first={i === 0} last={i === rules.length - 1} index={i + 1} />
        ))}
      </ol>
      {adding ? (
        <RuleForm members={members} onDone={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={buttonClass("secondary", "sm")}>
          <Plus size={13} /> {t.assignment.add}
        </button>
      )}
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
        <span className="text-sm font-medium text-slate-700">{t.assignment.fallback}:</span>
        {fallback}
      </div>
    </div>
  );
}

function RuleRow({ rule, members, first, last, index }: { rule: Rule; members: Member[]; first: boolean; last: boolean; index: number }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result>(null);
  const [editing, setEditing] = useState(false);
  const run = (fn: () => Promise<Result>) => start(async () => setResult(await fn()));
  const names = rule.memberIds.map((id) => members.find((m) => m.id === id)?.name ?? "?");
  const cond = [
    rule.language && `${t.assignment.language} ${rule.language === "es" ? t.common.spanish : t.common.english}`,
    rule.program && `${t.assignment.program} ${t.program[rule.program as keyof typeof t.program]}`,
    rule.source && `${t.assignment.source} ${t.source[rule.source as keyof typeof t.source]}`,
  ].filter(Boolean);

  if (editing) return <RuleForm rule={rule} members={members} onDone={() => setEditing(false)} />;
  return (
    <li className={`flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3 text-sm ${pending ? "opacity-60" : ""} ${rule.active ? "" : "opacity-60"}`}>
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500/10 text-xs font-semibold text-brand-500">{index}</span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{rule.name}</div>
        <div className="text-xs text-muted">
          {cond.length ? `${t.assignment.when} ${cond.join(" · ")}` : t.assignment.any} → {names.join(", ")}
        </div>
      </div>
      <button type="button" onClick={() => setEditing(true)} className={buttonClass("ghost", "sm")}>
        {t.common.edit}
      </button>
      <button type="button" aria-label={t.settings.moveLeft} disabled={first || pending} onClick={() => run(() => moveRuleAction(rule.id, -1))} className={buttonClass("ghost", "sm")}>
        <ArrowUp size={14} />
      </button>
      <button type="button" aria-label={t.settings.moveRight} disabled={last || pending} onClick={() => run(() => moveRuleAction(rule.id, 1))} className={buttonClass("ghost", "sm")}>
        <ArrowDown size={14} />
      </button>
      <button type="button" aria-label={t.common.delete} disabled={pending} onClick={() => confirm(t.common.confirmDelete) && run(() => deleteRuleAction(rule.id))} className={buttonClass("ghost", "sm")}>
        <Trash2 size={14} className="text-red-600" />
      </button>
      {result && !result.ok && <ActionMessage state={result} />}
    </li>
  );
}

function RuleForm({ rule, members, onDone }: { rule?: Rule; members: Member[]; onDone: () => void }) {
  const { t } = useI18n();
  const action = rule ? updateRuleAction.bind(null, rule.id) : createRuleAction;
  const { state, pending, formRef, onSubmit } = useActionForm(action);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-brand-500/30 bg-sky-50/40 p-3 sm:grid-cols-3">
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span>{t.assignment.name}</span>
        <input name="name" defaultValue={rule?.name} placeholder={t.assignment.namePlaceholder} required />
      </label>
      <label className="flex items-end gap-2 pb-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={rule?.active ?? true} />
        {t.assignment.active}
      </label>
      <label className="flex flex-col gap-1">
        <span>
          {t.assignment.when} {t.assignment.language}
        </span>
        <select name="language" defaultValue={rule?.language ?? ""}>
          <option value="">{t.assignment.any}</option>
          <option value="es">{t.common.spanish}</option>
          <option value="en">{t.common.english}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.assignment.program}</span>
        <select name="program" defaultValue={rule?.program ?? ""}>
          <option value="">{t.assignment.any}</option>
          <ProgramOptions />
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.assignment.source}</span>
        <select name="source" defaultValue={rule?.source ?? ""}>
          <option value="">{t.assignment.any}</option>
          <SourceOptions />
        </select>
      </label>
      <fieldset className="sm:col-span-3">
        <legend className="mb-1 text-xs font-medium text-slate-600">{t.assignment.members}</legend>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <label key={m.id} className="flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-sm">
              <input type="checkbox" name="memberIds" value={m.id} defaultChecked={rule?.memberIds.includes(m.id)} />
              {m.name}
              {!m.acceptsLeads && <span className="text-xs text-amber-700">({t.settings.paused})</span>}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center justify-end gap-2 sm:col-span-3">
        {state && !state.ok && <ActionMessage state={state} />}
        <button type="button" onClick={onDone} className={buttonClass("ghost", "sm")}>
          {t.common.cancel}
        </button>
        <PendingButton pending={pending} size="sm">
          {t.common.save}
        </PendingButton>
      </div>
    </form>
  );
}
