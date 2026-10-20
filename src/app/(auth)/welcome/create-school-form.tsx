"use client";

import { useActionState } from "react";
import { createSchool } from "@/app/actions/session";
import { FormError, SubmitButton, TimeZoneSelect } from "@/components/forms";
import { useI18n } from "@/components/i18n-provider";

export function CreateSchoolForm() {
  const { t } = useI18n();
  const [state, action] = useActionState(createSchool, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span>{t.auth.schoolName}</span>
        <input name="schoolName" required minLength={2} />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.auth.timeZone}</span>
        <TimeZoneSelect />
      </label>
      <FormError message={state?.error} />
      <SubmitButton pendingText={t.common.working}>{t.auth.signUp}</SubmitButton>
    </form>
  );
}
