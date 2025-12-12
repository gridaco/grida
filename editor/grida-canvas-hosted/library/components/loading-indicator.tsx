"use client";

import React from "react";
import { Progress } from "@/components/ui-editor/progress";
import { cn } from "@/components/lib/utils";

export type LoadingIndicatorProps = {
  loading?: boolean;
  className?: string;
};

export function LoadingIndicator({
  loading = true,
  className,
}: LoadingIndicatorProps) {
  return (
    <div
      className="w-full overflow-visible"
      style={{ height: 0, opacity: loading ? 1 : 0 }}
    >
      <Progress className={cn("rounded-none h-0.5", className)} indeterminate />
    </div>
  );
}
