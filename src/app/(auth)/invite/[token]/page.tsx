import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { getSession } from "@/lib/session";
import { findInvite } from "@/modules/members";
import { InviteForms } from "./invite-forms";

export const metadata = { title: "Invitation" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const { t, locale } = await getI18n();
  const invite = await findInvite(prisma, token);
  if (!invite) {
    return (
      <AuthShell t={t} locale={locale} title={t.auth.inviteInvalid}>
        <Link href="/login" className="text-sm font-medium text-brand-500 hover:underline">
          {t.auth.signIn}
        </Link>
      </AuthShell>
    );
  }
  const session = await getSession();
  return (
    <AuthShell
      t={t}
      locale={locale}
      title={fmt(t.auth.inviteTitle, { school: invite.org.name })}
      subtitle={fmt(t.auth.inviteSubtitle, { role: t.roles[invite.role], email: invite.email })}
      footer={
        !session && (
          <>
            {fmt(t.auth.inviteSignInFirst, { email: invite.email })}{" "}
            <Link href={`/login?next=/invite/${token}`} className="font-medium text-brand-500 hover:underline">
              {t.auth.signIn}
            </Link>
          </>
        )
      }
    >
      <InviteForms token={token} email={invite.email} signedInEmail={session?.user.email ?? null} />
    </AuthShell>
  );
}
