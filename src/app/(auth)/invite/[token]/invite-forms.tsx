"use client";

import { useActionState } from "react";
import { joinSchool, signUpAndJoin } from "@/app/actions/session";
import { FormError, SubmitButton } from "@/components/forms";
import { useI18n } from "@/components/i18n-provider";
import { fmt } from "@/lib/i18n/format";

export function InviteForms({ token, email, signedInEmail }: { token: string; email: string; signedInEmail: string | null }) {
  const { t } = useI18n();
  const [joinState, join] = useActionState(joinSchool, null);
  const [signUpState, signUp] = useActionState(signUpAndJoin, null);

  if (signedInEmail) {
    return (
      <form action={join} className="flex flex-col gap-3">
        <input type="hidden" name="token" value={token} />
        <p className="text-sm text-muted">{fmt(t.auth.inviteSignedInAs, { email: signedInEmail })}</p>
        <FormError message={joinState?.error} />
        <SubmitButton pendingText={t.common.working}>{t.auth.inviteAccept}</SubmitButton>
      </form>
    );
  }
  return (
    <form action={signUp} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm font-medium">{t.auth.inviteCreate}</p>
      <label className="flex flex-col gap-1">
        <span>{t.auth.email}</span>
        <input value={email} disabled readOnly />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.auth.name}</span>
        <input name="name" autoComplete="name" required />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.auth.password}</span>
        <input name="password" type="password" autoComplete="new-password" minLength={10} required />
        <small className="text-xs text-muted">{t.auth.passwordHint}</small>
      </label>
      <FormError message={signUpState?.error} />
      <SubmitButton pendingText={t.common.working}>{t.auth.inviteAccept}</SubmitButton>
    </form>
  );
}
