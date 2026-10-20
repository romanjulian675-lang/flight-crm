"use client";

import { useTransition } from "react";
import { setLocale } from "@/app/actions/session";
import type { Dict } from "@/lib/i18n/en";

export function LanguageToggle({ locale, t, dark = false }: { locale: "en" | "es"; t: Dict; dark?: boolean }) {
  const [pending, start] = useTransition();
  const base = dark ? "text-slate-300 hover:text-white" : "text-slate-500 hover:text-slate-900";
  return (
    <div className={`flex items-center gap-1 text-xs ${pending ? "opacity-50" : ""}`} aria-label={t.common.language}>
      {(["en", "es"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => start(() => setLocale(l))}
          aria-pressed={locale === l}
          className={`rounded px-1.5 py-0.5 font-semibold uppercase ${locale === l ? (dark ? "bg-white/15 text-white" : "bg-slate-100 text-slate-900") : base}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
