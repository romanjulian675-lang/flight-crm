import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getI18n } from "@/lib/i18n";
import { getSession } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { t, locale } = await getI18n();
  if (await getSession()) redirect("/");
  const next = (await searchParams).next;
  return (
    <AuthShell
      t={t}
      locale={locale}
      title={t.auth.signInTitle}
      footer={
        <>
          {t.auth.noAccount}{" "}
          <Link href="/signup" className="font-medium text-brand-500 hover:underline">
            {t.auth.createSchool}
          </Link>
        </>
      }
    >
      <LoginForm next={typeof next === "string" ? next : ""} />
    </AuthShell>
  );
}
