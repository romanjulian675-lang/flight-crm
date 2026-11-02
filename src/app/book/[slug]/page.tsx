import { Plane } from "lucide-react";
import { prisma } from "@/lib/db";
import { programFromQuery } from "@/lib/booking-options";
import { dictionaries, getLocale, type Locale } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { findPublicPage } from "@/modules/booking";
import { BookingFlow } from "./booking-flow";

export const metadata = { title: "Book a call", robots: { index: false } };

/** The default title follows the visitor's language; a custom title is shown as written. */
const localTitle = (title: string, t: (typeof dictionaries)[Locale]) =>
  Object.values(dictionaries).some((d) => d.book.defaultTitle === title) ? t.book.defaultTitle : title;

/** Public "Book a call" page: questions → pick a time → confirmation. Linked from the school's website. */
export default async function BookPage({ params, searchParams }: PageProps<"/book/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 120) : "");
  const lang = pick("lang");
  const locale: Locale = lang === "es" || lang === "en" ? lang : await getLocale();
  const t = dictionaries[locale];
  const page = await findPublicPage(prisma, slug);

  return (
    <main lang={locale} className="min-h-screen bg-white px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-xl">
        {!page ? (
          <p className="py-10 text-center text-sm text-muted">{t.book.unavailable}</p>
        ) : (
          <>
            <header className="mb-6 flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white" aria-hidden="true">
                <Plane size={20} />
              </span>
              <div>
                <p className="text-sm font-medium text-slate-600">{page.org.name}</p>
                <h1 className="text-xl leading-tight font-semibold text-ink sm:text-2xl">{localTitle(page.title, t)}</h1>
                <p className="mt-1 text-sm text-slate-600">{fmt(t.book.subtitle, { minutes: page.durationMin, school: page.org.name })}</p>
              </div>
            </header>
            <BookingFlow
              slug={page.slug}
              t={t.book}
              school={page.org.name}
              locale={locale}
              timeZone={page.timeZone}
              initialProgram={programFromQuery(pick("program"))}
              utm={{ utmSource: pick("utm_source"), utmMedium: pick("utm_medium"), utmCampaign: pick("utm_campaign") }}
            />
          </>
        )}
      </div>
    </main>
  );
}
