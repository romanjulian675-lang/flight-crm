/**
 * Product mark: a climbing flight path over a runway line, drawn in the brand navy.
 * From first inquiry to wheels-up: the pipeline as a departure.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden className="shrink-0">
      <rect width="28" height="28" rx="7" fill="#0b2545" />
      <path d="M6 20.5h16" stroke="#7fa6d6" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2.4 2.4" />
      <path d="M6.5 17.5c4.5 0 8.5-2.2 11.5-7.2" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <path d="m15.4 9.6 3.3-.4.5 3.3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ name, tagline }: { name: string; tagline?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="min-w-0">
        <span className="block text-[15px] leading-tight font-semibold tracking-tight text-ink">{name}</span>
        {tagline && <span className="block text-xs text-slate-500">{tagline}</span>}
      </span>
    </span>
  );
}
