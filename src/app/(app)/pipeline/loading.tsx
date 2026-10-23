import { Bone, SkeletonHeader, SkeletonPage } from "@/components/skeleton";

const CARDS = [4, 3, 2, 3, 1];

export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonHeader />
      <div className="mb-4 flex flex-wrap gap-2">
        <Bone className="h-9 w-72" />
        <Bone className="h-9 w-32" />
        <Bone className="h-9 w-32" />
      </div>
      <div className="flex gap-3 overflow-hidden">
        {CARDS.map((n, c) => (
          <div key={c} className="w-72 shrink-0 rounded-lg border border-line bg-raised p-2">
            <Bone className="mx-1 mt-1 mb-3 h-4 w-28" />
            <div className="space-y-2">
              {Array.from({ length: n }, (_, i) => (
                <div key={i} className="space-y-2.5 rounded-md border border-line bg-white p-3">
                  <Bone className="h-4 w-32" />
                  <Bone className="h-3 w-24" />
                  <div className="flex gap-1">
                    <Bone className="h-4 w-16" />
                    <Bone className="h-4 w-14" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
