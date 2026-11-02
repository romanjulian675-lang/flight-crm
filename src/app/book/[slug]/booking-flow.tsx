"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarCheck, CheckCircle2, Loader2, Video } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { BOOK_EXPERIENCE, BOOK_PAYMENT, BOOK_PROGRAMS, BOOK_SCHEDULE, BOOK_START, BOOK_VISA, type BookProgram } from "@/lib/booking-options";
import type { Dict } from "@/lib/i18n/en";
import { fmt } from "@/lib/i18n/format";
import { formatCallTime } from "@/modules/booking-slots";

type Props = {
  slug: string;
  t: Dict["book"];
  school: string;
  locale: "en" | "es";
  timeZone: string;
  initialProgram: BookProgram | null;
  utm: Record<string, string>;
};

type Day = { date: string; label: string; abbr: string; slots: { start: string; label: string }[] };
type Confirmation = { startAt: string; hostFirstName: string; meetLink: string | null; cancelUrl: string; email: string };

/** Larger text on phones so iOS doesn't zoom into fields. */
const field = "text-base sm:text-sm py-2.5 aria-[invalid=true]:border-red-500";
const question = "text-sm font-medium text-ink";

/** Three steps: questions → day and time → confirmation. Step 1 stays mounted so answers survive going back. */
export function BookingFlow({ slug, t, school, locale, timeZone, initialProgram, utm }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [answers, setAnswers] = useState<Record<string, unknown> | null>(null);
  const [bad, setBad] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<Day[] | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<Confirmation | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  // Move focus to the new step's heading so screen readers announce it (not on first load).
  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
    moved.current = true;
  }, [step]);

  const loadSlots = async (keepDay: string | null = null) => {
    setDays(null);
    setSlot(null);
    try {
      const res = await fetch(`/api/book/${slug}/slots?lang=${locale}`, { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; days?: Day[] };
      const list = json.days ?? [];
      setDays(list);
      setDay(list.find((d) => d.date === keepDay)?.date ?? list[0]?.date ?? null);
    } catch {
      setDays([]);
      setError(t.error);
    }
  };

  const isBad = (name: string) => (bad.includes(name) ? true : undefined);

  const onAnswers = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => String(fd.get(k) ?? "").trim();
    setAnswers({
      program: get("program"),
      experience: get("experience"),
      hours: get("hours") === "" ? null : Number(get("hours")),
      start: get("start"),
      schedule: get("schedule"),
      payment: get("payment"),
      location: get("location"),
      visa: get("visa"),
      firstName: get("firstName"),
      lastName: get("lastName"),
      email: get("email"),
      phone: get("phone"),
      _hp: get("_hp"),
    });
    setBad([]);
    setError(null);
    setStep(2);
    void loadSlots(day);
  };

  const book = async () => {
    if (!answers || !slot) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/book/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...answers, ...Object.fromEntries(Object.entries(utm).filter(([, v]) => v)), startAt: slot, language: locale }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; fields?: string[]; booking?: Omit<Confirmation, "email"> | null };
      if (res.ok && json.ok) {
        const b = json.booking;
        setDone(b ? { ...b, email: String(answers.email) } : { startAt: slot, hostFirstName: "", meetLink: null, cancelUrl: "", email: String(answers.email) });
        setStep(3);
        return;
      }
      const fields = (json.fields ?? []).filter((f) => f !== "startAt");
      if (json.error === "invalid" && fields.length) {
        setBad(fields);
        setError(t.invalid);
        setStep(1);
      } else if (json.error === "slot_taken" || json.error === "invalid") {
        setError(t.taken);
        await loadSlots(day);
      } else if (json.error === "booking_failed") {
        setError(t.failed);
        await loadSlots(day);
      } else {
        setError(json.error === "rate_limited" ? t.rateLimited : json.error === "unavailable" ? t.unavailable : t.error);
      }
    } catch {
      setError(t.error);
    } finally {
      setSending(false);
    }
  };

  const current = days?.find((d) => d.date === day) ?? null;
  const chosen = current?.slots.find((s) => s.start === slot) ?? null;
  const o = t.options;

  return (
    <div>
      <ol className="mb-5 grid grid-cols-3 gap-2 text-xs" aria-label={fmt(t.stepOf, { n: step })}>
        {([1, 2, 3] as const).map((n) => (
          <li key={n} aria-current={n === step ? "step" : undefined} className="flex flex-col gap-1.5">
            <span className={`h-1 rounded-full ${n <= step ? "bg-brand-500" : "bg-slate-200"}`} />
            <span className={n === step ? "font-semibold text-ink" : "text-slate-500"}>{t.steps[n === 1 ? "about" : n === 2 ? "time" : "done"]}</span>
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <form onSubmit={onAnswers} hidden={step !== 1} className="space-y-5">
        <h2 ref={step === 1 ? headingRef : undefined} tabIndex={-1} className="sr-only">
          {t.steps.about}
        </h2>
        {/* Honeypot: hidden from people, filled by bots. */}
        <input type="text" name="_hp" tabIndex={-1} autoComplete="off" aria-hidden="true" className="!hidden" />

        <Choice legend={t.program} name="program" options={BOOK_PROGRAMS.map((v) => [v, o.program[v]])} defaultValue={initialProgram} invalid={isBad("program")} cols="grid-cols-2" />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={question}>{t.experience}</span>
            <Select name="experience" options={BOOK_EXPERIENCE.map((v) => [v, o.experience[v]])} invalid={isBad("experience")} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={question}>
              {t.hours} <span className="font-normal text-slate-500">({t.optional})</span>
            </span>
            <input name="hours" type="number" inputMode="numeric" min={0} max={30000} step={1} className={field} aria-invalid={isBad("hours")} />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className={question}>{t.start}</span>
          <Select name="start" options={BOOK_START.map((v) => [v, o.start[v]])} invalid={isBad("start")} />
        </label>

        <Choice legend={t.schedule} name="schedule" options={BOOK_SCHEDULE.map((v) => [v, o.schedule[v]])} invalid={isBad("schedule")} cols="grid-cols-2" />

        <label className="flex flex-col gap-1">
          <span className={question}>{t.payment}</span>
          <Select name="payment" options={BOOK_PAYMENT.map((v) => [v, o.payment[v]])} invalid={isBad("payment")} />
        </label>

        <label className="flex flex-col gap-1">
          <span className={question}>{t.location}</span>
          <input name="location" required minLength={2} maxLength={120} placeholder={t.locationPlaceholder} autoComplete="address-level2" className={field} aria-invalid={isBad("location")} />
        </label>

        <Choice legend={t.visa} name="visa" options={BOOK_VISA.map((v) => [v, o.visa[v]])} invalid={isBad("visa")} cols="grid-cols-3" />

        <fieldset className="space-y-3">
          <legend className={`${question} mb-2`}>{t.contact}</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span>{t.firstName}</span>
              <input name="firstName" required maxLength={80} autoComplete="given-name" className={field} aria-invalid={isBad("firstName")} />
            </label>
            <label className="flex flex-col gap-1">
              <span>{t.lastName}</span>
              <input name="lastName" required maxLength={80} autoComplete="family-name" className={field} aria-invalid={isBad("lastName")} />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span>{t.email}</span>
            <input name="email" type="email" required maxLength={200} autoComplete="email" className={field} aria-invalid={isBad("email")} />
          </label>
          <label className="flex flex-col gap-1">
            <span>{t.phone}</span>
            <input name="phone" type="tel" required maxLength={40} autoComplete="tel" inputMode="tel" className={field} aria-invalid={isBad("phone")} />
          </label>
        </fieldset>

        <p className="text-xs text-slate-600">{fmt(t.consent, { school })}</p>
        <button type="submit" className={`${buttonClass("primary")} h-11 w-full text-base`}>
          {t.next}
        </button>
      </form>

      {step === 2 && (
        <section aria-labelledby="pick-time" className="space-y-5">
          <div>
            <h2 id="pick-time" ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-ink outline-none">
              {t.steps.time}
            </h2>
            <p className="text-sm text-slate-600">{fmt(t.timesIn, { zone: timeZone.replace(/_/g, " "), abbr: current?.abbr ?? days?.[0]?.abbr ?? "" })}</p>
          </div>

          {days === null ? (
            <p className="flex items-center gap-2 py-6 text-sm text-slate-600" role="status">
              <Loader2 size={16} className="animate-spin" aria-hidden /> {t.loading}
            </p>
          ) : days.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-600">{t.noTimes}</p>
          ) : (
            <>
              <div role="group" aria-label={t.pickDay}>
                <h3 className="mb-2 text-sm font-medium text-ink">{t.pickDay}</h3>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {days.map((d) => (
                    <button
                      key={d.date}
                      type="button"
                      aria-pressed={d.date === day}
                      onClick={() => {
                        setDay(d.date);
                        setSlot(null);
                      }}
                      className={`pressable rounded-lg border px-2 py-2.5 text-sm font-medium ${d.date === day ? "border-brand-500 bg-brand-500 text-white" : "border-slate-300 bg-white text-ink hover:border-slate-400"}`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div role="group" aria-label={t.pickTime}>
                <h3 className="mb-2 text-sm font-medium text-ink">
                  {t.pickTime} {current && <span className="font-normal text-slate-500">· {current.label}</span>}
                </h3>
                {current?.slots.length ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {current.slots.map((s) => (
                      <button
                        key={s.start}
                        type="button"
                        aria-pressed={s.start === slot}
                        onClick={() => setSlot(s.start)}
                        className={`pressable rounded-lg border px-2 py-2.5 text-sm font-medium tabular-nums ${s.start === slot ? "border-brand-500 bg-brand-500 text-white" : "border-slate-300 bg-white text-ink hover:border-slate-400"}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">{t.noTimesDay}</p>
                )}
              </div>
            </>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <button type="button" onClick={() => setStep(1)} className={`${buttonClass("secondary")} h-11`}>
              <ArrowLeft size={16} aria-hidden /> {t.back}
            </button>
            <button type="button" disabled={!chosen || sending} aria-busy={sending} onClick={book} className={`${buttonClass("primary")} h-11 text-base sm:min-w-48`}>
              {sending ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden /> {t.booking}
                </>
              ) : (
                <>
                  <CalendarCheck size={16} aria-hidden /> {chosen && current ? fmt(t.confirm, { time: `${current.label}, ${chosen.label}` }) : t.next}
                </>
              )}
            </button>
          </div>
        </section>
      )}

      {step === 3 && done && (
        <section aria-labelledby="booked" className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle2 size={28} className="text-emerald-600" aria-hidden />
            <h2 id="booked" ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
              {t.doneTitle}
            </h2>
          </div>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium text-emerald-800">{t.when}</dt>
              <dd className="text-base">{formatCallTime(new Date(done.startAt), locale, timeZone)}</dd>
            </div>
            {done.hostFirstName && (
              <div>
                <dt className="font-medium text-emerald-800">{t.withLabel}</dt>
                <dd className="text-base">{fmt(t.withValue, { name: done.hostFirstName, school })}</dd>
              </div>
            )}
            <div>
              <dt className="font-medium text-emerald-800">{t.where}</dt>
              <dd>
                {done.meetLink ? (
                  <a href={done.meetLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-brand-500 underline">
                    <Video size={16} aria-hidden /> {t.meet}
                  </a>
                ) : (
                  t.meetLater
                )}
                {done.meetLink && <div className="mt-1 font-mono text-xs break-all text-emerald-900">{done.meetLink}</div>}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm">{fmt(t.emailed, { email: done.email })}</p>
          {done.cancelUrl && (
            <p className="mt-3 text-sm">
              <a href={done.cancelUrl} className="text-emerald-900 underline">
                {t.cancelLink}
              </a>
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function Select({ name, options, invalid }: { name: string; options: [string, string][]; invalid?: boolean }) {
  return (
    <select name={name} required defaultValue="" className={field} aria-invalid={invalid}>
      <option value="" disabled>
        —
      </option>
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

/** Radio buttons styled as tappable cards (native radios inside, so keyboard and screen readers just work). */
function Choice({ legend, name, options, defaultValue = null, invalid, cols }: { legend: string; name: string; options: [string, string][]; defaultValue?: string | null; invalid?: boolean; cols: string }) {
  return (
    <fieldset aria-invalid={invalid}>
      <legend className={`${question} mb-2`}>{legend}</legend>
      <div className={`grid gap-2 ${cols}`}>
        {options.map(([v, label], i) => (
          <label
            key={v}
            className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm text-ink has-checked:border-brand-500 has-checked:bg-brand-500/5 has-focus-visible:ring-2 has-focus-visible:ring-brand-500/30 ${invalid ? "border-red-500" : "border-slate-300 hover:border-slate-400"}`}
          >
            <input type="radio" name={name} value={v} required={i === 0} defaultChecked={v === defaultValue} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
