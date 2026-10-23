import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function buttonClass(variant: Variant = "secondary", size: "sm" | "md" = "md") {
  const base =
    "pressable inline-flex items-center justify-center gap-1.5 rounded-md font-medium disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap";
  const sizes = { sm: "h-7 px-2.5 text-xs", md: "h-8 px-3 text-sm" };
  const variants: Record<Variant, string> = {
    primary: "bg-brand text-white hover:bg-brand-600",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50",
    ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    danger: "border border-red-200 bg-white text-red-700 hover:border-red-300 hover:bg-red-50",
  };
  return `${base} ${sizes[size]} ${variants[variant]}`;
}

export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-line bg-white ${className}`}>
      {(title || action) && (
        <header className="flex min-h-11 items-center justify-between gap-3 px-4 pt-3">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
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
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${stageStyle(color).chip}`}>
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

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-slate-500">
      <p className="max-w-sm text-pretty">{children}</p>
      {action}
    </div>
  );
}

/**
 * Headline figures as type, not tiles: one container split by hairlines. Colour only when a figure
 * needs action (tone), zeros stay grey so they read as zeros.
 */
export function StatStrip({ items }: { items: { label: ReactNode; value: number; href: string; tone?: "bad" | "warn" }[] }) {
  const toneClass = { bad: "text-red-600", warn: "text-amber-700" };
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 xl:grid-cols-6" style={{ gap: 1 }}>
      {items.map(({ label, value, href, tone }, i) => (
        <Link
          key={i}
          href={href}
          className="group flex flex-col justify-between gap-2 bg-white px-4 py-3.5 transition-colors hover:bg-slate-50"
        >
          <span className="text-[13px] leading-snug font-medium text-slate-500 group-hover:text-ink">{label}</span>
          <span className={`text-[28px] leading-none font-normal tracking-tight tabular-nums ${value === 0 ? "text-slate-400" : tone && value > 0 ? toneClass[tone] : "text-slate-900"}`}>{value}</span>
        </Link>
      ))}
    </div>
  );
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Each person keeps a stable pale tint of their own hue, so teammates are recognisable at a glance. */
const PERSON_TINTS = [
  "bg-sky-100 text-sky-900",
  "bg-amber-100 text-amber-900",
  "bg-emerald-100 text-emerald-900",
  "bg-rose-100 text-rose-900",
  "bg-indigo-100 text-indigo-900",
  "bg-lime-100 text-lime-900",
  "bg-fuchsia-100 text-fuchsia-900",
  "bg-teal-100 text-teal-900",
];
const tintFor = (name: string) => PERSON_TINTS[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % PERSON_TINTS.length];

export function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const s = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  return (
    <span title={name} className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${tintFor(name)} ${s}`}>
      {initials(name)}
    </span>
  );
}
