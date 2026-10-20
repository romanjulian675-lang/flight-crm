import type { ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function buttonClass(variant: Variant = "secondary", size: "sm" | "md" = "md") {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap";
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-3.5 py-2 text-sm" };
  const variants: Record<Variant, string> = {
    primary: "bg-brand-500 text-white shadow-sm hover:bg-brand-600",
    secondary: "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50",
    ghost: "text-slate-600 hover:bg-slate-100",
    danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
  };
  return `${base} ${sizes[size]} ${variants[variant]}`;
}

export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Static class strings per stage color so Tailwind can see them. */
export const STAGE_STYLES: Record<string, { dot: string; chip: string; bar: string }> = {
  slate: { dot: "bg-slate-400", chip: "bg-slate-100 text-slate-700", bar: "bg-slate-400" },
  sky: { dot: "bg-sky-500", chip: "bg-sky-100 text-sky-800", bar: "bg-sky-500" },
  indigo: { dot: "bg-indigo-500", chip: "bg-indigo-100 text-indigo-800", bar: "bg-indigo-500" },
  violet: { dot: "bg-violet-500", chip: "bg-violet-100 text-violet-800", bar: "bg-violet-500" },
  amber: { dot: "bg-amber-500", chip: "bg-amber-100 text-amber-800", bar: "bg-amber-500" },
  orange: { dot: "bg-orange-500", chip: "bg-orange-100 text-orange-800", bar: "bg-orange-500" },
  emerald: { dot: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-500" },
  rose: { dot: "bg-rose-500", chip: "bg-rose-100 text-rose-800", bar: "bg-rose-500" },
  teal: { dot: "bg-teal-500", chip: "bg-teal-100 text-teal-800", bar: "bg-teal-500" },
  pink: { dot: "bg-pink-500", chip: "bg-pink-100 text-pink-800", bar: "bg-pink-500" },
};
export const stageStyle = (color: string) => STAGE_STYLES[color] ?? STAGE_STYLES.slate;

export function StageChip({ name, color }: { name: string; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${stageStyle(color).chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${stageStyle(color).dot}`} />
      {name}
    </span>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "red" | "amber" | "green" | "blue" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-800",
    green: "bg-emerald-100 text-emerald-800",
    blue: "bg-sky-100 text-sky-800",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-muted">{children}</p>;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const s = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  return (
    <span title={name} className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand-500/10 font-semibold text-brand-500 ${s}`}>
      {initials(name)}
    </span>
  );
}
