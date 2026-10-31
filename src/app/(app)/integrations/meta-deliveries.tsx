"use client";

import { useState, useTransition } from "react";
import { retryMetaJobAction } from "@/app/actions/integrations";
import { ActionMessage } from "@/components/forms";
import { Badge, buttonClass } from "@/components/ui";
import { useI18n } from "@/components/i18n-provider";

type Delivery = { id: string; status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"; attempts: number; lastError: string | null; availableLabel: string; createdLabel: string };
const tones = { PENDING: "amber", PROCESSING: "blue", COMPLETED: "green", FAILED: "red" } as const;

export function MetaDeliveries({ jobs }: { jobs: Delivery[] }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string; at: number } | null>(null);
  return <div className="space-y-3">
    <p className="text-sm text-muted">{t.integrations.delivery.description}</p>
    {!jobs.length ? <p className="text-sm text-muted">{t.integrations.delivery.empty}</p> : <ul className="divide-y divide-line">
      {jobs.map((job) => <li key={job.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
        <Badge tone={tones[job.status]}>{t.integrations.delivery[job.status]}</Badge>
        <time>{job.createdLabel}</time>
        <span className="text-muted">{t.integrations.delivery.attempts}: {job.attempts}</span>
        {job.lastError && <span className="text-red-700">{t.integrations.delivery.failedNote}</span>}
        {job.status === "PENDING" && <span className="text-muted">{t.integrations.delivery.next}: {job.availableLabel}</span>}
        {job.status !== "COMPLETED" && <button type="button" disabled={pending} className={buttonClass("secondary", "sm")}
          onClick={() => start(async () => setResult(await retryMetaJobAction(job.id)))}>{t.integrations.delivery.retry}</button>}
      </li>)}
    </ul>}
    <ActionMessage state={result} />
  </div>;
}
