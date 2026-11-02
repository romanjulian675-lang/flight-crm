"use client";

import { useState, useTransition } from "react";
import { Phone, Video } from "lucide-react";
import { cancelCallAction } from "@/app/actions/booking";
import { ActionMessage } from "@/components/forms";
import { useI18n } from "@/components/i18n-provider";
import { Badge, buttonClass, Card } from "@/components/ui";
import { fmt } from "@/lib/i18n/format";

type Call = { id: string; when: string; host: string; meetLink: string | null; phone: string | null; callLanguage: "en" | "es" | null; status: "CONFIRMED" | "CANCELED"; past: boolean };

/** Calls booked through the public page: time, host, Meet link, and cancel for upcoming ones. */
export function BookedCalls({ calls }: { calls: Call[] }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string; at: number } | null>(null);
  return (
    <Card title={t.calls.title}>
      <ul className="space-y-3">
        {calls.map((c) => {
          const upcoming = c.status === "CONFIRMED" && !c.past;
          return (
            <li key={c.id} className={`space-y-1 text-sm ${upcoming ? "" : "text-muted"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{c.when}</span>
                {c.status === "CANCELED" && <Badge tone="red">{t.calls.canceled}</Badge>}
                {c.status === "CONFIRMED" && c.past && <Badge>{t.calls.past}</Badge>}
              </div>
              <div>{fmt(t.calls.with, { host: c.host })}</div>
              {c.phone && (
                <div className="flex items-center gap-1.5">
                  <Phone size={13} aria-hidden /> {fmt(t.calls.phone, { phone: c.phone })}
                </div>
              )}
              {c.callLanguage && <div>{fmt(t.calls.language, { language: t.book.options.callLanguage[c.callLanguage] })}</div>}
              {upcoming && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {c.meetLink && (
                    <a href={c.meetLink} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "sm")}>
                      <Video size={13} aria-hidden /> {t.calls.meet}
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    className={buttonClass("danger", "sm")}
                    onClick={() => confirm(t.calls.cancelConfirm) && start(async () => setResult(await cancelCallAction(c.id)))}
                  >
                    {t.calls.cancel}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <ActionMessage state={result} />
    </Card>
  );
}
