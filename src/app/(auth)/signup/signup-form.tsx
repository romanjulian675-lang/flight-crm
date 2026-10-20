"use client";

import { useActionState } from "react";
import { signUp } from "@/app/actions/session";
import { FormError, SubmitButton, TimeZoneSelect } from "@/components/forms";
import { useI18n } from "@/components/i18n-provider";

export function SignupForm() {
  const { t } = useI18n();
  const [state, action] = useActionState(signUp, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span>{t.auth.schoolName}</span>
        <input name="schoolName" required minLength={2} placeholder="Sunrise Aviation Academy" />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.auth.timeZone}</span>
        <TimeZoneSelect />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.auth.name}</span>
        <input name="name" autoComplete="name" required />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.auth.email}</span>
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.auth.password}</span>
        <input name="password" type="password" autoComplete="new-password" minLength={10} required />
        <small className="text-xs text-muted">{t.auth.passwordHint}</small>
      </label>
      <FormError message={state?.error} />
      <SubmitButton pendingText={t.common.working}>{t.auth.signUp}</SubmitButton>
    </form>
  );
}
