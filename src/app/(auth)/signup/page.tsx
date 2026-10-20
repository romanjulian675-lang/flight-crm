import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getI18n } from "@/lib/i18n";
import { getSession } from "@/lib/session";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Create your school" };

export default async function SignupPage() {
  const { t, locale } = await getI18n();
  if (await getSession()) redirect("/");
  return (
    <AuthShell
      t={t}
      locale={locale}
      title={t.auth.signUpTitle}
      subtitle={t.auth.signUpSubtitle}
      footer={
        <>
          {t.auth.haveAccount}{" "}
          <Link href="/login" className="font-medium text-brand-500 hover:underline">
            {t.auth.signIn}
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
