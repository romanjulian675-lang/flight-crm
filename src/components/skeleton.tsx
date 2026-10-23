/**
 * Loading placeholders shaped like the content they stand in for. The block appears after a short
 * delay so fast navigations never flash a skeleton.
 */
export function Bone({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded-md bg-slate-200/70 ${className}`} />;
}

export function SkeletonPage({ children, label = "Loading" }: { children: React.ReactNode; label?: string }) {
  return (
    <div role="status" aria-label={label} aria-busy className="animate-[fade-in_200ms_ease-out_150ms_both]">
      {children}
    </div>
  );
}

export function SkeletonHeader({ actions = false }: { actions?: boolean }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-3">
      <div className="space-y-2">
        <Bone className="h-6 w-40" />
        <Bone className="h-4 w-64" />
      </div>
      {actions && <Bone className="h-8 w-28" />}
    </div>
  );
}

export function SkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 py-3.5">
          <Bone className="h-4 w-36" />
          <Bone className="h-4 w-28" />
          <Bone className="h-5 w-20 rounded-full" />
          <Bone className="ml-auto h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
