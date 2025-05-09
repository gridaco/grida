import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/components/lib/utils";

export function NumberSkeleton() {
  return (
    <div>
      <Skeleton className="h-8 w-32 rounded-xl" />
    </div>
  );
}

export function GraphSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("w-full h-full", className)}>
      <Skeleton className="h-full w-full rounded-xl" />
    </div>
  );
}
