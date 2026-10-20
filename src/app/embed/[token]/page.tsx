import { Plane } from "lucide-react";
import { prisma } from "@/lib/db";
import { dictionaries, getLocale, type Locale } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { findByToken } from "@/modules/integrations";
import { EmbedForm } from "./embed-form";

export const metadata = { title: "Contact", robots: { index: false } };

/** Public lead form, designed to sit in an iframe on a school's website (or be linked directly). */
export default async function EmbedPage({ params, searchParams }: PageProps<"/embed/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 120) : "");
  const lang = pick("lang");
  const locale: Locale = lang === "es" || lang === "en" ? lang : await getLocale();
  const t = dictionaries[locale];
  const integration = await findByToken(prisma, token);
  const org = integration?.kind === "WEB_FORM" && integration.active ? await prisma.organization.findUnique({ where: { id: integration.orgId }, select: { name: true } }) : null;

  return (
    <main className="min-h-screen bg-white p-4 sm:p-6">
      <div className="mx-auto max-w-md">
        {!org ? (
          <p className="py-10 text-center text-sm text-muted">{t.embed.unavailable}</p>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white">
                <Plane size={18} />
              </span>
              <div>
                <h1 className="text-lg leading-tight font-bold">{fmt(t.embed.title, { school: org.name })}</h1>
                <p className="text-sm text-muted">{t.embed.subtitle}</p>
              </div>
            </div>
            <EmbedForm
              token={token}
              t={t.embed}
              programs={t.program}
              school={org.name}
              locale={locale}
              sent={pick("sent") === "1"}
              utm={{ utm_source: pick("utm_source"), utm_medium: pick("utm_medium"), utm_campaign: pick("utm_campaign") }}
            />
          </>
        )}
      </div>
    </main>
  );
}
