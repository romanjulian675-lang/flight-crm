"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { assignLeadAction, deleteLeadAction, moveLeadAction } from "@/app/actions/leads";
import { useI18n } from "@/components/i18n-provider";
import { Modal } from "@/components/modal";
import { buttonClass } from "@/components/ui";

type Props = {
  leadId: string;
  stageId: string;
  stages: { id: string; name: string; kind: "OPEN" | "WON" | "LOST" }[];
  ownerId: string | null;
  ownerName: string | null;
  members: { id: string; name: string }[];
  canAssign: boolean;
};

/** Stage and owner pickers at the top of the lead page. */
export function LeadControls({ leadId, stageId, stages, ownerId, ownerName, members, canAssign }: Props) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lostStage, setLostStage] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; message: string } | null>) =>
    start(async () => {
      const res = await fn();
      setError(res && !res.ok ? res.message : null);
    });

  const onStage = (id: string) => {
    if (stages.find((s) => s.id === id)?.kind === "LOST") return setLostStage(id);
    run(() => moveLeadAction(leadId, id, null));
  };

  return (
    <div className={`flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-3 ${pending ? "opacity-60" : ""}`}>
      <label className="flex min-w-56 flex-1 flex-col gap-1 sm:flex-none">
        <span>{t.lead.stage}</span>
        <select value={stageId} onChange={(e) => onStage(e.target.value)} disabled={pending}>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-48 flex-1 flex-col gap-1 sm:flex-none">
        <span>{t.lead.owner}</span>
        {canAssign ? (
          <select value={ownerId ?? ""} onChange={(e) => run(() => assignLeadAction(leadId, e.target.value || null))} disabled={pending}>
            <option value="">{t.common.unassigned}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        ) : (
          <input value={ownerName ?? t.common.unassigned} disabled readOnly />
        )}
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {lostStage && (
        <Modal title={t.lead.lostReason} onClose={() => setLostStage(null)}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const id = lostStage;
              setLostStage(null);
              run(() => moveLeadAction(leadId, id, null, reason));
            }}
          >
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
            <div className="flex justify-end gap-2">
              <button type="button" className={buttonClass("ghost")} onClick={() => setLostStage(null)}>
                {t.common.cancel}
              </button>
              <button className={buttonClass("primary")}>{t.common.save}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function DeleteLeadButton({ leadId }: { leadId: string }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className={`${buttonClass("danger", "sm")} w-full`}
        onClick={() => {
          if (!confirm(t.common.confirmDelete)) return;
          start(async () => {
            const res = await deleteLeadAction(leadId);
            if (res && !res.ok) setError(res.message);
          });
        }}
      >
        <Trash2 size={14} /> {t.lead.deleteLead}
      </button>
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}
