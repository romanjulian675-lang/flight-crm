import { Bone, SkeletonHeader, SkeletonPage, SkeletonRows } from "@/components/skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonHeader />
      <div className="mb-4 flex flex-wrap gap-2">
        <Bone className="h-9 w-72" />
        <Bone className="h-9 w-32" />
        <Bone className="h-9 w-32" />
        <Bone className="h-9 w-36" />
      </div>
      <SkeletonRows rows={10} />
    </SkeletonPage>
  );
}
