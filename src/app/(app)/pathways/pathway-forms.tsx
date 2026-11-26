"use client";

import { useActionState } from "react";
import { createPathwayPartnerAction, createPathwayReferralAction, savePathwayProfileAction, updatePathwayReferralAction } from "@/app/actions/pathways";
import { PendingButton, ActionMessage } from "@/components/forms";
import { useI18n } from "@/components/i18n-provider";

const statuses = ["DRAFT", "CONSENT_PENDING", "SENT", "ACCEPTED", "DECLINED", "CONVERTED"] as const;
type Partner = { id: string; name: string; country: string; type: string; verified: boolean };

export function PartnerForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(createPathwayPartnerAction, null);
  return <form action={action} className="grid gap-2 rounded-lg border border-dashed border-line bg-slate-50 p-3 sm:grid-cols-2">
    <input name="name" placeholder={t.pathways.exchange.partnerName} required />
    <input name="country" placeholder={t.pathways.exchange.country} required />
    <select name="type" defaultValue="UNIVERSITY"><option value="UNIVERSITY">{t.pathways.exchange.types.UNIVERSITY}</option><option value="FLIGHT_SCHOOL">{t.pathways.exchange.types.FLIGHT_SCHOOL}</option><option value="LICENSING_AUTHORITY">{t.pathways.exchange.types.LICENSING_AUTHORITY}</option><option value="LANGUAGE_SCHOOL">{t.pathways.exchange.types.LANGUAGE_SCHOOL}</option><option value="OTHER">{t.pathways.exchange.types.OTHER}</option></select>
    <input name="contactEmail" type="email" placeholder={t.pathways.exchange.email} />
    <input name="website" placeholder="https://..." />
    <input name="notes" placeholder={t.pathways.exchange.notes} />
    <div className="flex items-center gap-2 sm:col-span-2"><PendingButton pending={pending} size="sm">{t.pathways.exchange.addPartner}</PendingButton>{state && !state.ok && <ActionMessage state={state} />}</div>
  </form>;
}

export function ProfileForm({ leadId, profile }: { leadId: string; profile?: { targetCountry: string | null; targetProgram: string | null; currentHours: number | null; currentLicense: string | null; englishLevel: string | null } }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(savePathwayProfileAction.bind(null, leadId), null);
  return <form action={action} className="grid gap-2 sm:grid-cols-2">
    <input name="targetCountry" defaultValue={profile?.targetCountry ?? ""} placeholder={t.pathways.exchange.targetCountry} />
    <input name="targetProgram" defaultValue={profile?.targetProgram ?? ""} placeholder={t.pathways.exchange.targetProgram} />
    <input name="currentHours" type="number" min="0" defaultValue={profile?.currentHours ?? ""} placeholder={t.pathways.exchange.hours} />
    <input name="currentLicense" defaultValue={profile?.currentLicense ?? ""} placeholder={t.pathways.exchange.license} />
    <input name="englishLevel" defaultValue={profile?.englishLevel ?? ""} placeholder={t.pathways.exchange.english} />
    <div className="flex items-center gap-2"><PendingButton pending={pending} size="sm">{t.common.save}</PendingButton>{state && !state.ok && <ActionMessage state={state} />}</div>
  </form>;
}

export function ReferralForm({ leadId, partners }: { leadId: string; partners: Partner[] }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(createPathwayReferralAction, null);
  return <form action={action} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
    <input type="hidden" name="leadId" value={leadId} />
    <select name="partnerId" required defaultValue=""><option value="" disabled>{t.pathways.exchange.choosePartner}</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.country}{p.verified ? " ✓" : ""}</option>)}</select>
    <select name="status" defaultValue="CONSENT_PENDING"><option value="DRAFT">{t.pathways.exchange.status.DRAFT}</option><option value="CONSENT_PENDING">{t.pathways.exchange.status.CONSENT_PENDING}</option><option value="SENT">{t.pathways.exchange.status.SENT}</option></select>
    <PendingButton pending={pending} size="sm">{t.pathways.exchange.createReferral}</PendingButton>
    <input name="note" placeholder={t.pathways.exchange.referralNote} className="sm:col-span-3" />
    {state && !state.ok && <ActionMessage state={state} />}
  </form>;
}

export function ReferralStatusForm({ id, status, outcome }: { id: string; status: string; outcome: string | null }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(updatePathwayReferralAction.bind(null, id), null);
  return <form action={action} className="flex flex-wrap items-center gap-2"><select name="status" defaultValue={status}>{statuses.map((s) => <option key={s} value={s}>{t.pathways.exchange.status[s]}</option>)}</select><input name="outcome" defaultValue={outcome ?? ""} placeholder={t.pathways.exchange.outcome} /><PendingButton pending={pending} size="sm">{t.common.save}</PendingButton>{state && !state.ok && <ActionMessage state={state} />}</form>;
}
