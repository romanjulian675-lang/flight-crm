import { Bone, SkeletonHeader, SkeletonPage, SkeletonRows } from "@/components/skeleton";

/** Dashboard (and fallback for any screen without its own skeleton). */
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonHeader />
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 xl:grid-cols-6" style={{ gap: 1 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-3 bg-white px-4 py-3.5">
            <Bone className="h-3.5 w-24" />
            <Bone className="h-7 w-10" />
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-line bg-white p-4">
        <Bone className="mb-3 h-4 w-56" />
        <SkeletonRows rows={5} />
      </div>
    </SkeletonPage>
  );
}
