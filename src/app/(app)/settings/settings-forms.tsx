"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Copy, Trash2 } from "lucide-react";
import { addStageAction, createInviteAction, deleteStageAction, moveStageAction, revokeInviteAction, updateMemberAction, updateOrgAction, updateStageAction } from "@/app/actions/settings";
import { ActionMessage, PendingButton, TimeZoneSelect, useActionForm } from "@/components/forms";
import { useI18n } from "@/components/i18n-provider";
import { Avatar, Badge, buttonClass, STAGE_STYLES, stageStyle } from "@/components/ui";
import { fmt } from "@/lib/i18n/format";
import type { Role, StageKind } from "@/generated/prisma/enums";

export function OrgForm({ org }: { org: { name: string; timeZone: string; agentsSeeAll: boolean } }) {
  const { t } = useI18n();
  const { state, pending, formRef, onSubmit } = useActionForm(updateOrgAction);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1">
        <span>{t.settings.schoolName}</span>
        <input name="name" defaultValue={org.name} required />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.settings.timeZone}</span>
        <TimeZoneSelect defaultValue={org.timeZone} />
      </label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="agentsSeeAll" defaultChecked={org.agentsSeeAll} />
        {t.settings.agentsSeeAll}
      </label>
      <div className="flex items-center justify-end gap-3 sm:col-span-2">
        <ActionMessage state={state} />
        <PendingButton pending={pending} size="sm">
          {t.common.save}
        </PendingButton>
      </div>
    </form>
  );
}

function useRun() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message: string } | null>) =>
    start(async () => {
      const res = await fn();
      setError(res && !res.ok ? res.message : null);
    });
  return { pending, error, run };
}

export function MemberRow({ member, isMe, canEdit, grantable }: { member: { id: string; name: string; email: string; role: Role; active: boolean }; isMe: boolean; canEdit: boolean; grantable: Role[] }) {
  const { t } = useI18n();
  const { pending, error, run } = useRun();
  return (
    <li className={`flex flex-wrap items-center gap-3 py-2.5 ${pending ? "opacity-60" : ""} ${member.active ? "" : "opacity-60"}`}>
      <Avatar name={member.name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">
          {member.name} {isMe && <span className="text-xs font-normal text-muted">({t.settings.you})</span>}
        </div>
        <div className="truncate text-xs text-muted">{member.email}</div>
      </div>
      {!member.active && <Badge>{t.settings.inactive}</Badge>}
      {canEdit ? (
        <>
          <select aria-label={t.settings.inviteRole} value={member.role} onChange={(e) => run(() => updateMemberAction(member.id, e.target.value as Role, member.active))} className="w-auto py-1" disabled={pending}>
            {[...new Set([member.role, ...grantable])].map((r) => (
              <option key={r} value={r}>
                {t.roles[r]}
              </option>
            ))}
          </select>
          <button type="button" className={buttonClass(member.active ? "danger" : "secondary", "sm")} disabled={pending} onClick={() => run(() => updateMemberAction(member.id, member.role, !member.active))}>
            {member.active ? t.settings.deactivate : t.settings.reactivate}
          </button>
        </>
      ) : (
        <Badge tone={member.role === "OWNER" ? "blue" : "slate"}>{t.roles[member.role]}</Badge>
      )}
      {error && <p className="w-full text-sm text-red-700">{error}</p>}
    </li>
  );
}

export function InviteForm({ roles }: { roles: Role[] }) {
  const { t } = useI18n();
  const { state, pending, formRef, onSubmit } = useActionForm(createInviteAction, { resetOnSuccess: true });
  const [copied, setCopied] = useState(false);
  const link = state?.ok ? state.data : undefined;
  return (
    <>
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-56 flex-1 flex-col gap-1">
          <span>{t.settings.inviteEmail}</span>
          <input name="email" type="email" required />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t.settings.inviteRole}</span>
          <select name="role" defaultValue="AGENT" className="w-auto">
            {roles.map((r) => (
              <option key={r} value={r}>
                {t.roles[r]}
              </option>
            ))}
          </select>
        </label>
        <PendingButton pending={pending} pendingText={t.common.working}>
          {t.settings.inviteCreate}
        </PendingButton>
      </form>
      {state && !state.ok && <ActionMessage state={state} />}
      {link && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <p className="text-emerald-900">{fmt(t.settings.inviteLink, { email: link.email })}</p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={link.link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            <button
              type="button"
              className={buttonClass("secondary", "sm")}
              onClick={async () => {
                await navigator.clipboard.writeText(link.link);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              <Copy size={13} /> {copied ? t.common.copied : t.common.copy}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function PendingInviteRow({ invite }: { invite: { id: string; email: string; role: Role; expires: string } }) {
  const { t } = useI18n();
  const { pending, error, run } = useRun();
  return (
    <li className="flex flex-wrap items-center gap-3 py-2 text-sm">
      <span className="flex-1 truncate">{invite.email}</span>
      <Badge>{t.roles[invite.role]}</Badge>
      <span className="text-xs text-muted">{fmt(t.settings.expires, { date: invite.expires })}</span>
      <button type="button" className={buttonClass("ghost", "sm")} disabled={pending} onClick={() => run(() => revokeInviteAction(invite.id))}>
        {t.settings.revoke}
      </button>
      {error && <p className="w-full text-red-700">{error}</p>}
    </li>
  );
}

type StageRow = { id: string; name: string; kind: StageKind; color: string };

export function StageEditor({ stages, canEdit }: { stages: StageRow[]; canEdit: boolean }) {
  const { t } = useI18n();
  const { state: addState, pending: adding, formRef: addRef, onSubmit: onAdd } = useActionForm(addStageAction, { resetOnSuccess: true });
  if (!canEdit) {
    return (
      <ol className="flex flex-wrap gap-2">
        {stages.map((s) => (
          <li key={s.id} className={`rounded-full px-2.5 py-1 text-xs font-medium ${stageStyle(s.color).chip}`}>
            {s.name}
          </li>
        ))}
      </ol>
    );
  }
  return (
    <>
      <ol className="space-y-2">
        {stages.map((s, i) => (
          <StageItem key={`${s.id}:${s.name}:${s.kind}:${s.color}`} stage={s} first={i === 0} last={i === stages.length - 1} />
        ))}
      </ol>
      <form ref={addRef} onSubmit={onAdd} className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
        <StageFields />
        <PendingButton pending={adding} size="sm">
          {t.settings.addStage}
        </PendingButton>
        <div className="w-full">{addState && !addState.ok && <ActionMessage state={addState} />}</div>
      </form>
    </>
  );
}

function StageFields({ stage }: { stage?: StageRow }) {
  const { t } = useI18n();
  const [color, setColor] = useState(stage?.color ?? "slate");
  return (
    <>
      <label className="flex min-w-44 flex-1 flex-col gap-1">
        <span className="sr-only">{t.settings.stageName}</span>
        <input name="name" defaultValue={stage?.name} placeholder={t.settings.stageName} required className="py-1.5" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="sr-only">{t.settings.stageKind}</span>
        <select name="kind" defaultValue={stage?.kind ?? "OPEN"} className="w-auto py-1.5">
          {(["OPEN", "WON", "LOST"] as const).map((k) => (
            <option key={k} value={k}>
              {t.stageKind[k]}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex items-center gap-1" aria-label={t.settings.stageColor}>
        <input type="hidden" name="color" value={color} />
        {Object.keys(STAGE_STYLES).map((c) => (
          <button key={c} type="button" aria-label={c} aria-pressed={color === c} onClick={() => setColor(c)} className={`h-5 w-5 rounded-full ${STAGE_STYLES[c].dot} ${color === c ? "ring-2 ring-slate-900 ring-offset-1" : ""}`} />
        ))}
      </fieldset>
    </>
  );
}

function StageItem({ stage, first, last }: { stage: StageRow; first: boolean; last: boolean }) {
  const { t } = useI18n();
  const { state: saveState, pending: saving, formRef, onSubmit } = useActionForm(updateStageAction.bind(null, stage.id));
  const { pending, error, run } = useRun();
  return (
    <li className={`rounded-lg border border-slate-200 p-2 ${pending ? "opacity-60" : ""}`}>
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
        <StageFields stage={stage} />
        <PendingButton pending={saving} size="sm" variant="secondary">
          {t.common.save}
        </PendingButton>
        <button type="button" aria-label={t.settings.moveLeft} disabled={first || pending} onClick={() => run(() => moveStageAction(stage.id, -1))} className={buttonClass("ghost", "sm")}>
          <ArrowUp size={14} />
        </button>
        <button type="button" aria-label={t.settings.moveRight} disabled={last || pending} onClick={() => run(() => moveStageAction(stage.id, 1))} className={buttonClass("ghost", "sm")}>
          <ArrowDown size={14} />
        </button>
        <button
          type="button"
          aria-label={t.common.delete}
          disabled={pending}
          onClick={() => confirm(t.common.confirmDelete) && run(() => deleteStageAction(stage.id))}
          className={buttonClass("ghost", "sm")}
        >
          <Trash2 size={14} className="text-red-600" />
        </button>
      </form>
      {(error || (saveState && !saveState.ok)) && <p className="mt-1 text-sm text-red-700">{error ?? saveState?.message}</p>}
    </li>
  );
}
