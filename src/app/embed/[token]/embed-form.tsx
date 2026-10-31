"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { buttonClass } from "@/components/ui";
import type { Dict } from "@/lib/i18n/en";
import { fmt } from "@/lib/i18n/format";

const PROGRAMS = ["DISCOVERY", "PRIVATE", "INSTRUMENT", "COMMERCIAL", "CFI", "CAREER", "OTHER"] as const;

type Props = {
  token: string;
  t: Dict["embed"];
  programs: Dict["program"];
  school: string;
  locale: "en" | "es";
  sent: boolean;
  utm: Record<string, string>;
};

/**
 * Works without JavaScript (plain POST, server redirects back with ?sent=1) and, with JavaScript,
 * submits in place so the visitor never leaves the school's site.
 */
export function EmbedForm({ token, t, programs, school, locale, sent, utm }: Props) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(sent ? "done" : "idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "done") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl bg-emerald-50 px-4 py-10 text-center text-emerald-900">
        <CheckCircle2 size={36} className="text-emerald-600" />
        <p className="font-medium">{t.thanks}</p>
      </div>
    );
  }

  return (
    <form
      method="post"
      action={`/api/intake/${token}`}
      className="grid grid-cols-2 gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (!String(fd.get("email") ?? "").trim() && !String(fd.get("phone") ?? "").trim()) {
          setError(t.needContact);
          return;
        }
        setError(null);
        setState("sending");
        try {
          const res = await fetch(`/api/intake/${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(fd.entries())),
          });
          if (!res.ok) throw new Error(String(res.status));
          setState("done");
        } catch {
          setState("error");
          setError(t.error);
        }
      }}
    >
      {/* Honeypot: hidden from people, filled by bots. */}
      <input type="text" name="_hp" tabIndex={-1} autoComplete="off" aria-hidden="true" className="!hidden" />
      <input type="hidden" name="language" value={locale} />
      {Object.entries(utm).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      <label className="flex flex-col gap-1">
        <span>{t.firstName}</span>
        <input name="first_name" required autoComplete="given-name" />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.lastName}</span>
        <input name="last_name" autoComplete="family-name" />
      </label>
      <label className="col-span-2 flex flex-col gap-1">
        <span>{t.email}</span>
        <input name="email" type="email" autoComplete="email" />
      </label>
      <label className="col-span-2 flex flex-col gap-1">
        <span>{t.phone}</span>
        <input name="phone" type="tel" autoComplete="tel" inputMode="tel" />
      </label>
      <label className="col-span-2 flex flex-col gap-1">
        <span>{t.program}</span>
        <select name="program" defaultValue="other">
          {PROGRAMS.map((p) => (
            <option key={p} value={p.toLowerCase()}>
              {programs[p]}
            </option>
          ))}
        </select>
      </label>
      <label className="col-span-2 flex flex-col gap-1">
        <span>{t.message}</span>
        <textarea name="message" rows={3} />
      </label>
      {error && (
        <p role="alert" className="col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <p className="col-span-2 text-xs text-muted">{fmt(t.consent, { school })}</p>
      <button type="submit" disabled={state === "sending"} className={`${buttonClass("primary")} col-span-2 py-2.5`}>
        {state === "sending" ? t.sending : t.submit}
      </button>
    </form>
  );
}
