import { Skeleton } from "@/components/ui/skeleton";

export function NumberSkeleton() {
  return (
    <div>
      <Skeleton className="h-8 w-32 rounded-xl" />
    </div>
  );
}

export function GraphSkeleton() {
  return (
    <div className="w-full h-full">
      <Skeleton className="h-full w-full rounded-xl" />
    </div>
  );
}
