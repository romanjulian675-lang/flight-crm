"use client";

import { useRouter } from "next/navigation";

/** Which stage counts as the key milestone (e.g. "Discovery flight booked"). */
export function MilestonePicker({ stages, value, days, label }: { stages: { id: string; name: string }[]; value: string; days: number; label: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <select value={value} onChange={(e) => router.replace(`/team?days=${days}&milestone=${e.target.value}`)} className="w-auto py-1.5">
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
