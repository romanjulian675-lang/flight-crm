"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { checkDuplicatesAction, createLeadAction, type CreateLeadData } from "@/app/actions/leads";
import { FormError } from "@/components/forms";
import { useI18n } from "@/components/i18n-provider";
import { ProgramOptions, SourceOptions } from "@/components/lead-options";
import { Modal } from "@/components/modal";
import { buttonClass } from "@/components/ui";
import { formatPhone, fullName } from "@/lib/format";

type Dups = NonNullable<CreateLeadData["duplicates"]>;

/** Fast lead capture for calls, DMs and walk-ins: the minimum to start working the lead. */
export function QuickAddLead({ onClose, canAssign, members, myId }: { onClose: () => void; canAssign: boolean; members: { id: string; name: string }[]; myId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const forceRef = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(createLeadAction, null);
  const [liveDups, setLiveDups] = useState<Dups>([]);
  const [, startCheck] = useTransition();

  const dups = state?.ok && state.data?.duplicates?.length ? state.data.duplicates : liveDups;

  useEffect(() => {
    if (state?.ok && state.data?.leadId) {
      onClose();
      router.push(`/leads/${state.data.leadId}`);
    }
  }, [state, onClose, router]);

  const checkDups = () => {
    const fd = new FormData(formRef.current!);
    const email = String(fd.get("email") ?? "");
    const phone = String(fd.get("phone") ?? "");
    if (!email && phone.replace(/\D/g, "").length < 7) return setLiveDups([]);
    startCheck(async () => setLiveDups(await checkDuplicatesAction(email, phone)));
  };

  return (
    <Modal title={t.lead.newLeadTitle} onClose={onClose}>
      {/* Submitted manually (not via form action) so React doesn't clear the fields when we stop to show duplicates. */}
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => action(fd));
        }}
        className="grid grid-cols-2 gap-3"
      >
        <input ref={forceRef} type="hidden" name="force" defaultValue="false" />
        <label className="col-span-1 flex flex-col gap-1">
          <span>{t.lead.firstName}</span>
          <input name="firstName" required autoComplete="off" />
        </label>
        <label className="col-span-1 flex flex-col gap-1">
          <span>{t.lead.lastName}</span>
          <input name="lastName" autoComplete="off" />
        </label>
        <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <span>{t.lead.phone}</span>
          <input name="phone" type="tel" inputMode="tel" autoComplete="off" onBlur={checkDups} />
        </label>
        <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <span>{t.lead.email}</span>
          <input name="email" type="email" autoComplete="off" onBlur={checkDups} />
        </label>

        {dups.length > 0 && (
          <div className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <div className="flex items-center gap-1.5 font-medium text-amber-900">
              <AlertTriangle size={15} /> {t.lead.duplicatesTitle}
            </div>
            <ul className="mt-2 space-y-1">
              {dups.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <b>{fullName(d)}</b> · {formatPhone(d.phone) || d.email} · {d.stage.name}
                    {d.owner && <> · {d.owner.user.name}</>}
                  </span>
                  <Link href={`/leads/${d.id}`} onClick={onClose} className="font-medium text-brand-500 hover:underline">
                    {t.lead.openLead}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-amber-800">{t.lead.duplicatesHelp}</p>
          </div>
        )}

        <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <span>{t.lead.source}</span>
          <select name="source" defaultValue="PHONE">
            <SourceOptions />
          </select>
        </label>
        <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <span>{t.lead.program}</span>
          <select name="program" defaultValue="PRIVATE">
            <ProgramOptions />
          </select>
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span>
            {t.lead.sourceDetail} <span className="font-normal text-slate-400">({t.common.optional})</span>
          </span>
          <input name="sourceDetail" placeholder={t.lead.sourceDetailHint} />
        </label>
        <label className="col-span-1 flex flex-col gap-1">
          <span>{t.lead.language}</span>
          <select name="language" defaultValue={locale}>
            <option value="en">{t.common.english}</option>
            <option value="es">{t.common.spanish}</option>
          </select>
        </label>
        {canAssign && (
          <label className="col-span-1 flex flex-col gap-1">
            <span>{t.lead.owner}</span>
            <select name="ownerId" defaultValue={myId}>
              <option value="">{t.common.unassigned}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="col-span-2 flex flex-col gap-1">
          <span>
            {t.lead.note} <span className="font-normal text-slate-400">({t.common.optional})</span>
          </span>
          <textarea name="note" rows={3} placeholder={t.lead.notePlaceholder} />
        </label>

        <div className="col-span-2">
          <FormError message={state && !state.ok ? state.message : null} />
        </div>
        <div className="col-span-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonClass("ghost")}>
            {t.common.cancel}
          </button>
          {dups.length > 0 ? (
            <button
              type="button"
              disabled={pending}
              className={buttonClass("primary")}
              onClick={() => {
                forceRef.current!.value = "true";
                formRef.current!.requestSubmit();
              }}
            >
              {t.lead.createAnyway}
            </button>
          ) : (
            <button type="submit" disabled={pending} className={buttonClass("primary")}>
              {pending ? t.common.working : t.common.save}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
