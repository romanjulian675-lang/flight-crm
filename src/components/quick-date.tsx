"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { zonedDateString } from "@/lib/dates";

/**
 * Date + time inputs with "Tomorrow / In 3 days / Next week" shortcuts, in the school's time zone.
 * Uncontrolled from the form's point of view: values travel as `${prefix}date` / `${prefix}time`.
 */
export function QuickDateFields({ dateName = "date", timeName = "time", formKey }: { dateName?: string; timeName?: string; formKey?: number | string }) {
  const { t, timeZone } = useI18n();
  // Quick-pick dates are fixed when the fields mount.
  const [quick] = useState(() => {
    const at = Date.now();
    const day = (n: number) => zonedDateString(new Date(at + n * 86_400_000), timeZone);
    return { 1: day(1), 3: day(3), 7: day(7) } as Record<number, string>;
  });
  const [date, setDate] = useState(quick[1]);
  // A parent form reset (after save) passes a new formKey; go back to tomorrow.
  const [lastKey, setLastKey] = useState(formKey);
  if (formKey !== lastKey) {
    setLastKey(formKey);
    setDate(quick[1]);
  }
  const picks: [number, string][] = [
    [1, t.task.quick.tomorrow],
    [3, t.task.quick.in3],
    [7, t.task.quick.nextWeek],
  ];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {picks.map(([n, label]) => (
          <button
            key={n}
            type="button"
            onClick={() => setDate(quick[n])}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${date === quick[n] ? "border-brand-500 bg-brand-500/10 text-brand-500" : "border-line text-slate-600 hover:bg-slate-50"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span>{t.task.date}</span>
          <input name={dateName} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t.task.time}</span>
          <input name={timeName} type="time" defaultValue="09:00" />
        </label>
      </div>
    </div>
  );
}
