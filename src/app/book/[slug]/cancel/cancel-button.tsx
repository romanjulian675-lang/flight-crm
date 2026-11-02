"use client";

import { useState } from "react";
import Link from "next/link";
import { buttonClass } from "@/components/ui";
import type { Dict } from "@/lib/i18n/en";

export function CancelButton({ id, token, t, bookAgain }: { id: string; token: string; t: Dict["book"]; bookAgain: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  if (state === "done") {
    return (
      <div role="status" className="space-y-3">
        <p className="rounded-lg bg-emerald-50 px-3 py-4 text-sm text-emerald-900">{t.canceled}</p>
        <Link href={bookAgain} className="text-sm text-brand-500 underline">
          {t.bookAgain}
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {state === "error" && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {t.error}
        </p>
      )}
      <button
        type="button"
        disabled={state === "sending"}
        className={`${buttonClass("danger")} h-11 w-full text-base`}
        onClick={async () => {
          setState("sending");
          try {
            const res = await fetch("/api/book/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ b: id, t: token }) });
            setState(res.ok ? "done" : "error");
          } catch {
            setState("error");
          }
        }}
      >
        {state === "sending" ? t.canceling : t.cancelButton}
      </button>
    </div>
  );
}
