import type { ReactNode } from "react";
import { LanguageToggle } from "@/components/language-toggle";
import type { Dict } from "@/lib/i18n";
import { Logo } from "@/components/logo";

export function AuthShell({ t, locale, title, subtitle, children, footer }: { t: Dict; locale: "en" | "es"; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-frame px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-6 sm:p-8">
        <div className="mb-8 flex items-center justify-between">
          <Logo name={t.app.name} tagline={t.app.tagline} />
          <LanguageToggle locale={locale} t={t} />
        </div>
        <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-5">{children}</div>
        {footer && <div className="mt-6 border-t border-line pt-4 text-sm text-slate-500">{footer}</div>}
      </div>
    </main>
  );
}
