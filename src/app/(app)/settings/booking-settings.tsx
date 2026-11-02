"use client";

import { useState, useTransition } from "react";
import { CalendarDays, ExternalLink } from "lucide-react";
import { createBookingPageAction, disconnectCalendarAction, updateBookingPageAction } from "@/app/actions/booking";
import { ActionMessage, PendingButton, TimeZoneSelect, useActionForm } from "@/components/forms";
import { useI18n } from "@/components/i18n-provider";
import { Badge, buttonClass } from "@/components/ui";
import { WEEKDAYS } from "@/lib/booking-options";
import { fmt } from "@/lib/i18n/format";

type Result = { ok: boolean; message: string; at: number } | null;

/** Connect / disconnect the signed-in member's own Google Calendar. */
export function CalendarConnect({ connection, configured, fake }: { connection: { email: string; status: "ACTIVE" | "BROKEN" } | null; configured: boolean; fake: boolean }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result>(null);
  const available = configured || fake;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{t.calendar.help}</p>
      {fake && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{t.calendar.fakeNote}</p>}
      {!available && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t.calendar.notConfigured}</p>}
      {connection && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <CalendarDays size={16} className="text-brand-500" aria-hidden />
          <span>{fmt(t.calendar.connected, { email: connection.email })}</span>
          {connection.status === "BROKEN" && <Badge tone="red">{t.calendar.broken}</Badge>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {available && (
          <a href="/api/integrations/google/connect" className={buttonClass(connection?.status === "ACTIVE" ? "secondary" : "primary", "sm")}>
            {connection ? t.calendar.reconnect : t.calendar.connect}
          </a>
        )}
        {connection && (
          <button
            type="button"
            disabled={pending}
            className={buttonClass("ghost", "sm")}
            onClick={() => confirm(t.calendar.disconnectConfirm) && start(async () => setResult(await disconnectCalendarAction()))}
          >
            {t.calendar.disconnect}
          </button>
        )}
        <ActionMessage state={result} />
      </div>
    </div>
  );
}

export function CreateBookingPage() {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result>(null);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{t.booking.help}</p>
      <button type="button" disabled={pending} className={buttonClass("primary", "sm")} onClick={() => start(async () => setResult(await createBookingPageAction()))}>
        {t.booking.create}
      </button>
      <ActionMessage state={result} />
    </div>
  );
}

type Page = {
  id: string;
  title: string;
  slug: string;
  durationMin: number;
  bufferMin: number;
  minNoticeMin: number;
  daysAhead: number;
  timeZone: string;
  hours: Record<string, [string, string][]>;
  hostIds: string[];
  enabled: boolean;
};

export function BookingPageForm({ page, members, appUrl }: { page: Page; members: { id: string; name: string; calendar: "ACTIVE" | "BROKEN" | null }[]; appUrl: string }) {
  const { t } = useI18n();
  const { state, pending, formRef, onSubmit } = useActionForm(updateBookingPageAction.bind(null, page.id));
  const url = `${appUrl}/book/${page.slug}`;
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={page.enabled ? "green" : "slate"}>{page.enabled ? t.booking.live : t.booking.off}</Badge>
        <span className="text-muted">{t.booking.link}:</span>
        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs break-all">{url}</code>
        <a href={`/book/${page.slug}`} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")}>
          <ExternalLink size={13} aria-hidden /> {t.booking.open}
        </a>
      </div>
      <p className="text-xs text-muted">{t.booking.linkHelp}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span>{t.booking.pageTitle}</span>
          <input name="title" defaultValue={page.title} required maxLength={120} />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t.booking.slug}</span>
          <input name="slug" defaultValue={page.slug} required pattern="[a-z0-9][a-z0-9\-]{1,58}[a-z0-9]" />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t.booking.duration}</span>
          <input name="durationMin" type="number" min={10} max={240} step={5} defaultValue={page.durationMin} required />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t.booking.buffer}</span>
          <input name="bufferMin" type="number" min={0} max={120} step={5} defaultValue={page.bufferMin} required />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t.booking.notice}</span>
          <input name="minNoticeHours" type="number" min={0} max={720} step={0.5} defaultValue={page.minNoticeMin / 60} required />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t.booking.daysAhead}</span>
          <input name="daysAhead" type="number" min={1} max={60} defaultValue={page.daysAhead} required />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span>{t.booking.timeZone}</span>
          <TimeZoneSelect defaultValue={page.timeZone} />
        </label>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t.booking.hours}</legend>
        <div className="divide-y divide-line rounded-lg border border-line">
          {WEEKDAYS.map((d) => {
            const range = page.hours[String(d)]?.[0];
            return <DayRow key={d} day={d} label={t.booking.days[String(d) as keyof typeof t.booking.days]} range={range ?? null} />;
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-semibold">{t.booking.hosts}</legend>
        <p className="mb-2 text-xs text-muted">{t.booking.hostsHelp}</p>
        <ul className="space-y-1.5">
          {members.map((m) => {
            const usable = m.calendar === "ACTIVE" || (m.calendar === "BROKEN" && page.hostIds.includes(m.id));
            return (
              <li key={m.id}>
                <label className={`flex items-center gap-2 text-sm ${usable ? "" : "text-muted"}`}>
                  <input type="checkbox" name="hostIds" value={m.id} defaultChecked={page.hostIds.includes(m.id)} disabled={!usable} />
                  {m.name}
                  {m.calendar === null && <span className="text-xs">({t.booking.needsCalendar})</span>}
                  {m.calendar === "BROKEN" && <Badge tone="red">{t.booking.calendarBroken}</Badge>}
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="enabled" defaultChecked={page.enabled} />
        {t.booking.enabled}
      </label>

      <div className="flex items-center justify-end gap-3">
        <ActionMessage state={state} />
        <PendingButton pending={pending} size="sm">
          {t.common.save}
        </PendingButton>
      </div>
    </form>
  );
}

function DayRow({ day, label, range }: { day: number; label: string; range: [string, string] | null }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(range !== null);
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2">
      <label className="flex w-32 items-center gap-2 text-sm">
        <input type="checkbox" name={`day${day}`} checked={open} onChange={(e) => setOpen(e.target.checked)} />
        {label}
      </label>
      {open ? (
        <div className="flex items-center gap-2 text-sm">
          <input type="time" name={`from${day}`} defaultValue={range?.[0] ?? "09:00"} aria-label={`${label} ${t.booking.from}`} className="w-auto py-1" required />
          <span aria-hidden>–</span>
          <input type="time" name={`to${day}`} defaultValue={range?.[1] ?? "17:00"} aria-label={`${label} ${t.booking.to}`} className="w-auto py-1" required />
        </div>
      ) : (
        <span className="text-sm text-muted">{t.booking.closed}</span>
      )}
    </div>
  );
}
