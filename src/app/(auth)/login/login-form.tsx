"use client";

import { useActionState } from "react";
import { signIn } from "@/app/actions/session";
import { FormError, SubmitButton } from "@/components/forms";
import { useI18n } from "@/components/i18n-provider";

export function LoginForm({ next }: { next: string }) {
  const { t } = useI18n();
  const [state, action] = useActionState(signIn, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1">
        <span>{t.auth.email}</span>
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.auth.password}</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <FormError message={state?.error} />
      <SubmitButton pendingText={t.common.working}>{t.auth.signIn}</SubmitButton>
    </form>
  );
}
