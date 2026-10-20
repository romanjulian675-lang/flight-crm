import type { ReactNode } from "react";
import { Plane } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";
import type { Dict } from "@/lib/i18n";

export function AuthShell({ t, locale, title, subtitle, children, footer }: { t: Dict; locale: "en" | "es"; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-brand via-brand-600 to-brand-500 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white">
              <Plane size={18} />
            </span>
            <div>
              <div className="text-base font-bold text-brand">{t.app.name}</div>
              <div className="text-xs text-muted">{t.app.tagline}</div>
            </div>
          </div>
          <LanguageToggle locale={locale} t={t} />
        </div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-5">{children}</div>
        {footer && <div className="mt-5 border-t border-slate-100 pt-4 text-sm text-muted">{footer}</div>}
      </div>
    </main>
  );
}
