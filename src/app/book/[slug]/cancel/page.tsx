import Link from "next/link";
import { prisma } from "@/lib/db";
import { dictionaries } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { bookingForVisitor, isCancelable } from "@/modules/booking";
import { formatCallTime } from "@/modules/booking-slots";
import { CancelButton } from "./cancel-button";

export const metadata = { title: "Cancel call", robots: { index: false } };

/** Visitor's cancel link from the confirmation screen (signed; no login). */
export default async function CancelCallPage({ params, searchParams }: PageProps<"/book/[slug]/cancel">) {
  const { slug } = await params;
  const sp = await searchParams;
  const id = typeof sp.b === "string" ? sp.b : "";
  const token = typeof sp.t === "string" ? sp.t : "";
  const b = id && token ? await bookingForVisitor(prisma, id, token) : null;
  const locale = b?.language === "es" ? "es" : sp.lang === "es" ? "es" : "en";
  const t = dictionaries[locale].book;
  const open = b && isCancelable(b) && b.page.slug === slug;

  return (
    <main lang={locale} className="min-h-screen bg-white px-4 py-10">
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-xl font-semibold text-ink">{t.cancelTitle}</h1>
        {open ? (
          <>
            <p className="text-sm text-slate-700">{fmt(t.cancelQuestion, { time: formatCallTime(b.startAt, locale, b.page.timeZone) })}</p>
            <CancelButton id={id} token={token} t={t} bookAgain={`/book/${slug}${locale === "es" ? "?lang=es" : ""}`} />
          </>
        ) : (
          <>
            <p className="rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-700">{b?.status === "CANCELED" ? t.canceled : t.cancelInvalid}</p>
            <Link href={`/book/${slug}${locale === "es" ? "?lang=es" : ""}`} className="text-sm text-brand-500 underline">
              {t.bookAgain}
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
