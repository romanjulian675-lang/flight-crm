import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/session";
import { AuthShell } from "@/components/auth-shell";
import { getI18n } from "@/lib/i18n";
import { getAccessContext, getSession } from "@/lib/session";
import { CreateSchoolForm } from "./create-school-form";

/** Signed in, but not a member of any school. */
export default async function WelcomePage() {
  const { t, locale } = await getI18n();
  if (!(await getSession())) redirect("/login");
  if (await getAccessContext()) redirect("/");
  return (
    <AuthShell t={t} locale={locale} title={t.auth.signUpTitle} subtitle={t.auth.noMembership} footer={<SignOutLink label={t.nav.signOut} />}>
      <CreateSchoolForm />
    </AuthShell>
  );
}

function SignOutLink({ label }: { label: string }) {
  return (
    <form action={signOut}>
      <button className="font-medium text-brand-500 hover:underline">{label}</button>
    </form>
  );
}
