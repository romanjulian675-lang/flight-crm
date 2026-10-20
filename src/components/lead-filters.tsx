"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { ProgramOptions, SourceOptions } from "@/components/lead-options";

/** Search + filters kept in the URL so views are shareable and survive reloads. */
export function LeadFilters({ members, canSeeAll }: { members: { id: string; name: string }[]; canSeeAll: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    start(() => router.replace(`${pathname}?${next.toString()}`));
  };

  // Debounced search.
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const id = setTimeout(() => set("q", q.trim()), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = ["q", "owner", "source", "program"].some((k) => params.get(k));

  return (
    <div className={`mb-4 flex flex-wrap items-center gap-2 ${pending ? "opacity-70" : ""}`}>
      <label className="relative min-w-48 flex-1 sm:max-w-xs">
        <span className="sr-only">{t.common.search}</span>
        <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.pipeline.searchPlaceholder} className="pl-8" />
      </label>
      {canSeeAll && (
        <select aria-label={t.pipeline.owner} value={params.get("owner") ?? ""} onChange={(e) => set("owner", e.target.value)} className="w-auto">
          <option value="">{t.pipeline.anyOwner}</option>
          <option value="me">{t.common.me}</option>
          <option value="none">{t.common.unassigned}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      )}
      <select aria-label={t.lead.source} value={params.get("source") ?? ""} onChange={(e) => set("source", e.target.value)} className="w-auto">
        <option value="">{t.pipeline.anySource}</option>
        <SourceOptions />
      </select>
      <select aria-label={t.lead.program} value={params.get("program") ?? ""} onChange={(e) => set("program", e.target.value)} className="w-auto">
        <option value="">{t.pipeline.anyProgram}</option>
        <ProgramOptions />
      </select>
      {active && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            start(() => router.replace(pathname));
          }}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
        >
          <X size={14} /> {t.pipeline.clear}
        </button>
      )}
    </div>
  );
}
