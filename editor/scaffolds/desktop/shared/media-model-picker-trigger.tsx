"use client";

import type { ComponentProps } from "react";
import { SelectTrigger } from "@app/ui/components/select";
import { cn } from "@app/ui/lib/utils";

/**
 * The compact, borderless model picker used by Desktop media composers.
 */
export function MediaModelPickerTrigger({
  className,
  size = "sm",
  ...props
}: ComponentProps<typeof SelectTrigger>) {
  return (
    <SelectTrigger
      size={size}
      className={cn(
        "w-fit gap-1 border-0 bg-transparent px-2 shadow-none",
        className
      )}
      {...props}
    />
  );
}
