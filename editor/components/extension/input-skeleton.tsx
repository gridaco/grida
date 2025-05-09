import React from "react";
import { cn } from "@/components/lib/utils";
import { Skeleton } from "../ui/skeleton";

export function InputSkeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Skeleton
      className={cn(
        "flex h-9 w-full rounded-md border border-input",
        className
      )}
      {...props}
    />
  );
}
