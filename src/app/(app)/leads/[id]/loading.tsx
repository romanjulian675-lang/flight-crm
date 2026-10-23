import { Bone, SkeletonPage, SkeletonRows } from "@/components/skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <Bone className="mb-4 h-4 w-20" />
      <Bone className="h-7 w-56" />
      <Bone className="mt-2 h-4 w-80" />
      <div className="mt-4 flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Bone key={i} className="h-8 w-24" />
        ))}
      </div>
      <Bone className="mt-5 h-16 w-full" />
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Bone className="h-44 w-full" />
          <div className="rounded-lg border border-line p-4">
            <SkeletonRows rows={4} />
          </div>
        </div>
        <div className="space-y-5">
          <Bone className="h-36 w-full" />
          <Bone className="h-56 w-full" />
        </div>
      </div>
    </SkeletonPage>
  );
}
