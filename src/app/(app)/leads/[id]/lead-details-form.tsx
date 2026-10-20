"use client";

import { updateLeadAction } from "@/app/actions/leads";
import { ActionMessage, PendingButton, useActionForm } from "@/components/forms";
import { useI18n } from "@/components/i18n-provider";
import { FundingOptions, MedicalOptions, ProgramOptions, SourceOptions } from "@/components/lead-options";

type LeadFields = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  language: string;
  source: string;
  sourceDetail: string;
  program: string;
  medical: string;
  funding: string;
  timeline: string;
  isInternational: boolean;
};

export function LeadDetailsForm({ leadId, lead }: { leadId: string; lead: LeadFields }) {
  const { t } = useI18n();
  const { state, pending, formRef, onSubmit } = useActionForm(updateLeadAction.bind(null, leadId));
  // Keyed on the saved values so the fields re-read them after a save.
  return (
    <form key={JSON.stringify(lead)} ref={formRef} onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
      <Field label={t.lead.firstName}>
        <input name="firstName" defaultValue={lead.firstName} required />
      </Field>
      <Field label={t.lead.lastName}>
        <input name="lastName" defaultValue={lead.lastName} />
      </Field>
      <Field label={t.lead.phone} wide>
        <input name="phone" type="tel" defaultValue={lead.phone} />
      </Field>
      <Field label={t.lead.email} wide>
        <input name="email" type="email" defaultValue={lead.email} />
      </Field>
      <Field label={t.lead.program}>
        <select name="program" defaultValue={lead.program}>
          <ProgramOptions />
        </select>
      </Field>
      <Field label={t.lead.language}>
        <select name="language" defaultValue={lead.language}>
          <option value="en">{t.common.english}</option>
          <option value="es">{t.common.spanish}</option>
        </select>
      </Field>
      <Field label={t.lead.medical}>
        <select name="medical" defaultValue={lead.medical}>
          <MedicalOptions />
        </select>
      </Field>
      <Field label={t.lead.funding}>
        <select name="funding" defaultValue={lead.funding}>
          <FundingOptions />
        </select>
      </Field>
      <Field label={t.lead.timeline} wide>
        <input name="timeline" defaultValue={lead.timeline} placeholder={t.lead.timelineHint} />
      </Field>
      <Field label={t.lead.source}>
        <select name="source" defaultValue={lead.source}>
          <SourceOptions />
        </select>
      </Field>
      <Field label={t.lead.sourceDetail}>
        <input name="sourceDetail" defaultValue={lead.sourceDetail} />
      </Field>
      <label className="col-span-2 flex items-center gap-2 text-sm">
        <input type="checkbox" name="isInternational" defaultChecked={lead.isInternational} />
        {t.lead.isInternational}
      </label>
      <div className="col-span-2 flex items-center justify-end gap-3">
        <ActionMessage state={state} />
        <PendingButton pending={pending} size="sm" pendingText={t.common.working}>
          {t.common.save}
        </PendingButton>
      </div>
    </form>
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? "col-span-2" : "col-span-2 sm:col-span-1 lg:col-span-2 xl:col-span-1"}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
